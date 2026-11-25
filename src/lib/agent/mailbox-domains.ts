import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { domains } from "@/db/schema";

/**
 * Hostnames that belong to the mailbox owner. Automatic replies treat mail from
 * these domains as our own. Other accounts on the same installation are not included.
 */
export async function mailboxOwnerHostnames(db: AppDatabase, ownerUserId: string): Promise<string[]> {
	const rows = await db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.userId, ownerUserId));
	return rows.map((row) => row.hostname);
}
