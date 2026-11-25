import type { AppDatabase } from "@/db";

/** Shared mailboxes are always available. The stored license plan is ignored. */
export async function isTeamMailboxSharingEnabled(db: AppDatabase): Promise<boolean> {
	void db;
	return true;
}
