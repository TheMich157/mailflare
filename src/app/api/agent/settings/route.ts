import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { agentJobs, mailboxAgentSettings, users } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getMailboxAccessLevel, listMailboxSenders } from "@/lib/mailboxes/access";
import { getAgentProviderPublicConfig } from "@/lib/agent/provider";
import { loadMailboxAgentSettings } from "@/lib/agent/auto-send";
import { isMissingColumnError, isMissingTableError } from "@/lib/database-errors";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";

const schema = z.object({
	mailboxId: z.string().min(1),
	enabled: z.boolean(),
	modelId: z.string().max(200).nullable().optional(),
	autoDraftEnabled: z.boolean(),
	autoSendEnabled: z.boolean(),
	reviewerUserId: z.string().nullable().optional(),
	instructions: z.string().max(4_000),
	knowledge: z.string().max(20_000),
	autoSendFooter: z.string().max(500),
	autoSendSignature: z.string().max(120),
	autoSendLogoUrl: z.string().max(500),
	autoSendAccent: z.string().max(7),
	dailyLimit: z.number().int().min(1).max(100),
});

const emptyAutoSend = { autoSendEnabled: false, knowledge: "", autoSendFooter: "", autoSendSignature: "", autoSendLogoUrl: "", autoSendAccent: "" };

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
	const mailboxId = new URL(request.url).searchParams.get("mailboxId");
	if (!mailboxId) return Response.json({ error: "Mailbox required" }, { status: 400 });
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (!access?.canRead) return Response.json({ error: "Mailbox not found" }, { status: 404 });
	const settings = await loadMailboxAgentSettings(env, mailboxId);
	const reviewers: { id: string; name: string; email: string }[] = [];
	if (access.canManage) {
		reviewers.push(...(await listMailboxSenders(db, access.mailbox)));
	}
	const agentProvider = await getAgentProviderPublicConfig(env);
	const provider = agentProvider.configured ? { kind: agentProvider.provider === "cloudflare" ? "Cloudflare Workers AI" : agentProvider.preset === "custom" ? "OpenAI-compatible API" : agentProvider.preset, model: agentProvider.model } : null;
	const modelId = settings?.modelId && agentProvider.models.includes(settings.modelId) ? settings.modelId : agentProvider.models[0] ?? null;
	return Response.json({ settings: settings ? { ...settings, enabled: true, modelId } : { mailboxId, enabled: true, modelId, autoDraftEnabled: false, reviewerUserId: access.mailbox.userId, instructions: "", dailyLimit: 25, ...emptyAutoSend }, models: agentProvider.models, canManage: access.canManage, canConfigureProvider: isPrimaryAdmin(user), providerConfigured: agentProvider.configured, provider, autoReplyEnabled: access.mailbox.autoReplyEnabled, reviewers });
}

export async function PUT(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
	if (!hasValidSessionMutationOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, parsed.data.mailboxId);
	if (!access?.canManage) return Response.json({ error: "Mailbox not found or permission denied" }, { status: 403 });
	const reviewerId = parsed.data.reviewerUserId || access.mailbox.userId;
	const [reviewer] = await db.select().from(users).where(eq(users.id, reviewerId)).limit(1);
	if (!reviewer || reviewer.disabled || !(await getMailboxAccessLevel(db, reviewer, parsed.data.mailboxId))?.canSendOnBehalf) return Response.json({ error: "Reviewer needs mailbox send permission" }, { status: 400 });
	if ((parsed.data.autoDraftEnabled || parsed.data.autoSendEnabled) && access.mailbox.autoReplyEnabled) return Response.json({ error: "Disable the out-of-office auto-reply before enabling AI drafts or automatic replies" }, { status: 400 });
	if (parsed.data.autoSendEnabled && !parsed.data.knowledge.trim()) return Response.json({ error: "Add knowledge text before enabling automatic replies" }, { status: 400 });
	const agentProvider = await getAgentProviderPublicConfig(env);
	if (parsed.data.modelId && !agentProvider.models.includes(parsed.data.modelId)) return Response.json({ error: "Choose a configured model" }, { status: 400 });
	const modelId = parsed.data.modelId || agentProvider.models[0] || null;
	const saved = { enabled: true, modelId, autoDraftEnabled: parsed.data.autoDraftEnabled, autoSendEnabled: parsed.data.autoSendEnabled, reviewerUserId: reviewerId, instructions: parsed.data.instructions, knowledge: parsed.data.knowledge, autoSendFooter: parsed.data.autoSendFooter, autoSendSignature: parsed.data.autoSendSignature, autoSendLogoUrl: parsed.data.autoSendLogoUrl, autoSendAccent: parsed.data.autoSendAccent, dailyLimit: parsed.data.dailyLimit, updatedAt: new Date() };
	try {
		await db.insert(mailboxAgentSettings).values({ ...parsed.data, enabled: true, modelId, reviewerUserId: reviewerId }).onConflictDoUpdate({ target: mailboxAgentSettings.mailboxId, set: saved });
	} catch (error) {
		if (isMissingColumnError(error) || isMissingTableError(error)) return Response.json({ error: "Apply the pending database migration before enabling automatic replies" }, { status: 400 });
		throw error;
	}
	if (!parsed.data.autoDraftEnabled && !parsed.data.autoSendEnabled) await db.update(agentJobs).set({ status: "skipped", reason: "Automatic replies disabled" }).where(and(eq(agentJobs.mailboxId, parsed.data.mailboxId), eq(agentJobs.status, "pending")));
	return Response.json({ ok: true });
}
