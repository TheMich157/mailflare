/**
 * The hop a reverse proxy appended to a forwarded header.
 * Everything before it was supplied by the client and must not be trusted.
 */
export function forwardedHop(value: string | string[] | null | undefined): string | undefined {
	const raw = Array.isArray(value) ? value.at(-1) : value;
	return raw?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
}
