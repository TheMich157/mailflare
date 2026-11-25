import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/** Enabled accounts occupy a seat; the primary admin is one of them. */
export async function countUsedAccountSeats(env: CloudflareEnv): Promise<number> {
	const [row] = await getDb(env).select({ total: count() }).from(users).where(eq(users.disabled, false));
	return row?.total ?? 0;
}

/** This fork has no seat cap, whatever `license_settings.seat_limit` says. */
export async function getAccountSeatError(env: CloudflareEnv): Promise<string | null> {
	void env;
	return null;
}
