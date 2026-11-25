import { and, eq, gte, sql } from "drizzle-orm";
import { generateText } from "ai";
import { getDb } from "@/db";
import { agentAutoSends, agentEscalations, domains, mailboxAgentSettings, mailboxes, messages } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { isMissingColumnError, isMissingTableError, isUniqueConstraintError } from "@/lib/database-errors";
import { normalizeEmailAddress } from "@/lib/email/address";
import { htmlToReadableText } from "@/lib/email/reply-content-utils";
import { sendEmail } from "@/lib/email/send";
import { readHeaderMap } from "@/lib/email/provider-trace";
import { buildReplyReferences, parseMessageIdList } from "@/lib/email/threading";
import { newId } from "@/lib/ids";
import { getMailboxDomainAddresses } from "@/lib/mailboxes/domain-addresses";
import { createAuditLog } from "@/lib/mailboxes/audit";
import { recordAiUsage } from "@/lib/ai/usage";
import { recordEscalation } from "./escalations";
import { formatAgentDraftBody } from "./draft-format";
import { getAgentModel } from "./model";
import { getReplyRecipients } from "./reply";
import { renderAutoReplyEmail, splitDisclosureFooter } from "./auto-send-layout";
import {
	AUTO_SEND_CAPS,
	classifierSystemPrompt,
	classifierUserPrompt,
	finalizeAutoReply,
	gateAutoSendCaps,
	gateInboundAutoSend,
	interpretClassifierOutput,
} from "./auto-send-utils";

type StoredSettings = typeof mailboxAgentSettings.$inferSelect;

const DISABLED_AUTO_SEND = {
	autoSendEnabled: false,
	knowledge: "",
	autoSendFooter: "",
	autoSendSignature: "",
	autoSendLogoUrl: "",
	autoSendAccent: "",
};

export type AutoSendOutcome =
	| { action: "sent"; messageId: string }
	| { action: "skip"; reason: string }
	| { action: "escalate"; reason: string };

/** Settings for one mailbox. Before the auto-send migration, automatic sending stays off. */
export async function loadMailboxAgentSettings(env: CloudflareEnv, mailboxId: string): Promise<StoredSettings | null> {
	const db = getDb(env);
	try {
		const [row] = await db.select().from(mailboxAgentSettings).where(eq(mailboxAgentSettings.mailboxId, mailboxId)).limit(1);
		return row ?? null;
	} catch (error) {
		if (!isMissingColumnError(error) && !isMissingTableError(error)) throw error;
		try {
			const [row] = await db.select({
				mailboxId: mailboxAgentSettings.mailboxId,
				enabled: mailboxAgentSettings.enabled,
				modelId: mailboxAgentSettings.modelId,
				autoDraftEnabled: mailboxAgentSettings.autoDraftEnabled,
				reviewerUserId: mailboxAgentSettings.reviewerUserId,
				instructions: mailboxAgentSettings.instructions,
				dailyLimit: mailboxAgentSettings.dailyLimit,
				updatedAt: mailboxAgentSettings.updatedAt,
			}).from(mailboxAgentSettings).where(eq(mailboxAgentSettings.mailboxId, mailboxId)).limit(1);
			return row ? { ...row, ...DISABLED_AUTO_SEND } : null;
		} catch (inner) {
			if (isMissingTableError(inner) || isMissingColumnError(inner)) return null;
			throw inner;
		}
	}
}

function countOf(value: unknown): number {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : Number.NaN;
}

function replySubject(subject: string | null): string {
	const trimmed = (subject ?? "").trim();
	if (!trimmed) return "Re:";
	return /^re\s*(\[\d+\])?\s*:/i.test(trimmed) ? trimmed.slice(0, 900) : `Re: ${trimmed}`.slice(0, 900);
}

async function readInboundHeaders(env: CloudflareEnv, rawR2Key: string | null, hasUnsubscribe: boolean): Promise<Record<string, string> | null> {
	const headers: Record<string, string> = {};
	if (hasUnsubscribe) headers["list-unsubscribe"] = "yes";
	if (!rawR2Key) return Object.keys(headers).length ? headers : null;
	const object = await env.BUCKET.get(rawR2Key);
	if (!object) return null;
	return { ...readHeaderMap(await object.arrayBuffer()), ...headers };
}

/**
 * Classifies one inbound message and, only for a basic question, sends one threaded reply.
 * Every other outcome is a skip (automated mail) or an escalation a person can see.
 * Errors fail closed and do not retry into a second send.
 */
export async function tryAutoSend(env: CloudflareEnv, input: {
	mailboxId: string;
	source: typeof messages.$inferSelect;
	settings: StoredSettings;
	reviewer: SessionUser;
}): Promise<AutoSendOutcome> {
	const { source, settings } = input;
	const mailboxId = input.mailboxId;
	const threadId = source.threadId ?? source.id;
	const sender = normalizeEmailAddress(source.fromAddr);
	const escalate = async (reason: string): Promise<AutoSendOutcome> => {
		await recordEscalation(env, { mailboxId, threadId, messageId: source.id, reason, actorUserId: input.reviewer.id, sender });
		return { action: "escalate", reason };
	};
	try {
		const db = getDb(env);
		let priorEscalation: { reason: string } | undefined;
		try {
			const [row] = await db.select({ reason: agentEscalations.reason }).from(agentEscalations)
				.where(and(eq(agentEscalations.mailboxId, mailboxId), eq(agentEscalations.messageId, source.id))).limit(1);
			priorEscalation = row;
		} catch (error) {
			if (!isMissingTableError(error)) throw error;
		}
		if (priorEscalation) return { action: "escalate", reason: priorEscalation.reason };

		const [mailbox] = await db.select({
			id: mailboxes.id,
			localPart: mailboxes.localPart,
			domainId: mailboxes.domainId,
			useAllDomains: mailboxes.useAllDomains,
		}).from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
		if (!mailbox) return escalate("no-mailbox");
		const [ownAddresses, domainRows] = await Promise.all([
			getMailboxDomainAddresses(db, mailbox),
			db.select({ hostname: domains.hostname }).from(domains),
		]);
		const headers = await readInboundHeaders(env, source.rawR2Key, source.hasUnsubscribe);
		if (!headers) return escalate("headers-unavailable");
		const body = (source.textBody || htmlToReadableText(source.htmlBody) || "").slice(0, 8_000);
		const gate = gateInboundAutoSend({
			from: source.fromAddr,
			headers,
			status: source.status,
			folderId: source.folderId,
			spamVerdict: source.spamVerdict,
			spamAnalysisError: source.spamAnalysisError,
			ownAddresses,
			ownDomains: domainRows.map((row) => row.hostname),
			subject: source.subject,
			body,
		});
		if (gate.action === "skip") return gate;
		if (gate.action === "escalate") return escalate(gate.reason);
		if (!sender) return escalate("no-sender");

		let priorSend: { messageId: string; sentMessageId: string | null } | undefined;
		try {
			const [row] = await db.select({ messageId: agentAutoSends.messageId, sentMessageId: agentAutoSends.sentMessageId }).from(agentAutoSends)
				.where(and(eq(agentAutoSends.mailboxId, mailboxId), eq(agentAutoSends.threadId, threadId))).limit(1);
			priorSend = row;
		} catch (error) {
			if (isMissingTableError(error)) return escalate("unavailable");
			throw error;
		}
		if (priorSend?.messageId === source.id && priorSend.sentMessageId) return { action: "sent", messageId: priorSend.sentMessageId };
		if (priorSend) return escalate("thread");

		const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const [usage] = await db.select({
			senderHour: sql<number>`sum(case when ${agentAutoSends.senderAddress} = ${sender} and ${agentAutoSends.createdAt} >= ${hourAgo} then 1 else 0 end)`,
			senderDay: sql<number>`sum(case when ${agentAutoSends.senderAddress} = ${sender} then 1 else 0 end)`,
			mailboxHour: sql<number>`sum(case when ${agentAutoSends.createdAt} >= ${hourAgo} then 1 else 0 end)`,
			mailboxDay: sql<number>`count(*)`,
		}).from(agentAutoSends).where(and(eq(agentAutoSends.mailboxId, mailboxId), gte(agentAutoSends.createdAt, dayAgo)));
		const caps = gateAutoSendCaps({
			threadAlreadyReplied: false,
			senderLastHour: countOf(usage?.senderHour),
			senderLastDay: countOf(usage?.senderDay),
			mailboxLastHour: countOf(usage?.mailboxHour),
			mailboxLastDay: countOf(usage?.mailboxDay),
		}, AUTO_SEND_CAPS);
		if (caps.action === "escalate") return escalate(caps.reason);
		if (!settings.knowledge.trim()) return escalate("no-knowledge");

		const selection = await getAgentModel(env, settings.modelId);
		if (!selection) return escalate("no-model");
		let generated;
		try {
			generated = await generateText({
				model: selection.model,
				system: classifierSystemPrompt(settings.knowledge, settings.instructions),
				prompt: classifierUserPrompt({ from: source.fromAddr, subject: source.subject ?? "", body }),
				maxOutputTokens: 800,
			});
		} catch (error) {
			console.error("Automatic reply model failed", error);
			return escalate("model-error");
		}
		await recordAiUsage({ env, details: selection, usage: generated.usage, source: "auto_send" });
		const verdict = interpretClassifierOutput(generated.text ?? "", `${source.subject ?? ""}\n${body}`);
		if (verdict.action !== "send") return escalate(verdict.reason);
		const finalized = finalizeAutoReply(verdict.reply, settings.knowledge, settings.autoSendFooter);
		if (finalized.action !== "send") return escalate(finalized.reason);
		const parts = splitDisclosureFooter(finalized.reply, settings.autoSendFooter);
		const formatted = formatAgentDraftBody(parts.answer);
		if (!formatted.text) return escalate("empty-reply");
		const rendered = renderAutoReplyEmail({
			answer: formatted.text,
			allowedText: settings.knowledge,
			brand: {
				signature: settings.autoSendSignature,
				logoUrl: settings.autoSendLogoUrl,
				accentColor: settings.autoSendAccent,
				footer: parts.footer,
			},
			quote: { from: source.fromAddr, sentAt: source.createdAt, text: body },
		});

		let recipients: { to: string; cc: string };
		try {
			recipients = await getReplyRecipients({ env, user: input.reviewer, mailboxId, origin: "auto" }, source, false);
		} catch (error) {
			console.error("Automatic reply has no safe recipient", error);
			return escalate("no-recipient");
		}
		const [domain] = await db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.id, mailbox.domainId)).limit(1);
		if (!domain) return escalate("no-mailbox");

		const claimId = newId("asend");
		try {
			await db.insert(agentAutoSends).values({
				id: claimId,
				mailboxId,
				threadId,
				messageId: source.id,
				senderAddress: sender,
				createdAt: new Date(),
			});
		} catch (error) {
			if (isUniqueConstraintError(error)) return escalate("thread");
			if (isMissingTableError(error)) return escalate("unavailable");
			throw error;
		}

		let sentId: string;
		try {
			const sent = await sendEmail(env, {
				userId: input.reviewer.id,
				mailboxId,
				from: `${mailbox.localPart}@${domain.hostname}`,
				to: recipients.to,
				cc: recipients.cc || undefined,
				subject: replySubject(source.subject),
				text: rendered.text,
				html: rendered.html,
				inReplyTo: source.providerMessageId,
				references: buildReplyReferences(parseMessageIdList(source.references), source.providerMessageId),
				threadId,
				undoSend: false,
				headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
			});
			sentId = sent.messageId;
		} catch (error) {
			console.error("Automatic reply send failed", error);
			await db.delete(agentAutoSends).where(eq(agentAutoSends.id, claimId)).catch((deleteError) => {
				console.error("Could not release automatic-reply claim", deleteError);
			});
			return escalate("send-failed");
		}
		await db.update(agentAutoSends).set({ sentMessageId: sentId }).where(eq(agentAutoSends.id, claimId));
		try {
			await createAuditLog(env, {
				actorUserId: input.reviewer.id,
				mailboxId,
				messageId: source.id,
				action: "agent.auto_send",
				metadata: { reason: "basic", threadId, sentMessageId: sentId, sender },
			});
		} catch (error) {
			console.error("Could not record automatic-reply audit", error);
		}
		return { action: "sent", messageId: sentId };
	} catch (error) {
		console.error("Automatic reply failed", error);
		const reason = isMissingTableError(error) || isMissingColumnError(error) ? "unavailable" : "error";
		try {
			await recordEscalation(env, { mailboxId, threadId, messageId: source.id, reason, actorUserId: input.reviewer.id, sender });
		} catch (auditError) {
			console.error("Could not record escalation", auditError);
		}
		return { action: "escalate", reason };
	}
}
