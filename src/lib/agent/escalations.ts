import { and, eq, gt, inArray, notExists } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { agentAutoSends, agentEscalations, messages } from "@/db/schema";
import { isMissingTableError, isUniqueConstraintError } from "@/lib/database-errors";
import { selectInBatches } from "@/lib/db-params";
import { newId } from "@/lib/ids";
import { getDb } from "@/db";
import { createAuditLog } from "@/lib/mailboxes/audit";

export type EscalationRow = { mailboxId: string | null; threadId: string | null; id: string };

export function escalationKey(row: EscalationRow): string {
	return `${row.mailboxId}:${row.threadId ?? row.id}`;
}

/**
 * A later outbound message a person actually sent closes the flag.
 * An automatic reply is recorded on `agent_auto_sends` and does not.
 */
function escalationStillOpen(db: AppDatabase) {
	return notExists(
		db.select({ id: messages.id }).from(messages).where(and(
			eq(messages.mailboxId, agentEscalations.mailboxId),
			eq(messages.threadId, agentEscalations.threadId),
			eq(messages.direction, "outbound"),
			eq(messages.status, "sent"),
			gt(messages.createdAt, agentEscalations.createdAt),
			notExists(db.select({ id: agentAutoSends.id }).from(agentAutoSends).where(eq(agentAutoSends.sentMessageId, messages.id))),
		)),
	);
}

/** Thread keys (`mailboxId:threadId`) that a person still needs to answer. Missing table means none. */
export async function escalatedThreadKeys(db: AppDatabase, rows: EscalationRow[]): Promise<Set<string>> {
	const keys = [...new Set(rows.map((row) => row.threadId || row.id).filter((key): key is string => !!key))];
	const mailboxIds = [...new Set(rows.map((row) => row.mailboxId).filter((id): id is string => !!id))];
	if (!keys.length || !mailboxIds.length) return new Set();
	try {
		const found = await selectInBatches(keys, (batch) => db
			.select({ mailboxId: agentEscalations.mailboxId, threadId: agentEscalations.threadId })
			.from(agentEscalations)
			.where(and(
				inArray(agentEscalations.mailboxId, mailboxIds),
				inArray(agentEscalations.threadId, batch),
				escalationStillOpen(db),
			)));
		return new Set(found.map((row) => `${row.mailboxId}:${row.threadId}`));
	} catch (error) {
		if (isMissingTableError(error)) return new Set();
		throw error;
	}
}

export async function messageNeedsHuman(db: AppDatabase, mailboxId: string | null, threadId: string | null, messageId: string): Promise<boolean> {
	if (!mailboxId) return false;
	const keys = [...new Set([threadId, messageId].filter((id): id is string => !!id))];
	if (!keys.length) return false;
	try {
		const [row] = await db
			.select({ id: agentEscalations.id })
			.from(agentEscalations)
			.where(and(
				eq(agentEscalations.mailboxId, mailboxId),
				inArray(agentEscalations.threadId, keys),
				escalationStillOpen(db),
			))
			.limit(1);
		return !!row;
	} catch (error) {
		if (isMissingTableError(error)) return false;
		throw error;
	}
}

/** Records one escalation per inbound message and an audit row. A repeat is a no-op. */
export async function recordEscalation(env: CloudflareEnv, input: { mailboxId: string; threadId: string; messageId: string; reason: string; actorUserId: string | null; sender: string }): Promise<void> {
	const db = getDb(env);
	try {
		await db.insert(agentEscalations).values({
			id: newId("aesc"),
			mailboxId: input.mailboxId,
			threadId: input.threadId,
			messageId: input.messageId,
			reason: input.reason.slice(0, 200),
			createdAt: new Date(),
		});
	} catch (error) {
		if (isUniqueConstraintError(error) || isMissingTableError(error)) return;
		throw error;
	}
	try {
		await createAuditLog(env, {
			actorUserId: input.actorUserId,
			mailboxId: input.mailboxId,
			messageId: input.messageId,
			action: "agent.escalate",
			metadata: { reason: input.reason, threadId: input.threadId, sender: input.sender },
		});
	} catch (error) {
		console.error("Could not record escalation audit", error);
	}
}
