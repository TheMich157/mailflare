import bcrypt from "bcryptjs";

/**
 * Accounts that sign in only with passkeys still need a non-null column value:
 * SQLite cannot drop `NOT NULL` without rebuilding a heavily referenced table.
 * The sentinel can never be produced by hashPassword and every verification
 * path rejects it, so it behaves like a missing password.
 */
export const PASSWORDLESS_PASSWORD_HASH = "!passkey-only";

export function hashPassword(password: string): string {
	return bcrypt.hashSync(password, 12);
}

export function hasPasswordHash(hash: string | null | undefined): hash is string {
	return !!hash && hash !== PASSWORDLESS_PASSWORD_HASH && hash.startsWith("$2");
}

/**
 * Cost-12 hash compared when the account has no usable password. A missing
 * account and a passkey-only account would otherwise return before bcrypt and
 * tell a caller, by timing, which addresses exist.
 */
const DUMMY_PASSWORD_HASH = "$2b$12$w6AdFcKgNcekSa8t5LEv6OX9OzIAMmED0mGFg8XCKAFVXdzf3Yqe.";

export function verifyPassword(password: string, hash: string | null | undefined): boolean {
	const usable = hasPasswordHash(hash);
	const matches = bcrypt.compareSync(password, usable ? hash : DUMMY_PASSWORD_HASH);
	return usable && matches;
}
