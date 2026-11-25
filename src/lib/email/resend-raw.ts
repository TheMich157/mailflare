import { assertResolvesPublic, isPublicHttpsUrl } from "@/lib/security/public-url";

/** Same ceiling the provider intake enforces, applied before the body is buffered. */
export const RESEND_RAW_MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 2;

export class ResendRawError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ResendRawError";
	}
}

type DownloadOptions = {
	fetch?: typeof fetch;
	resolveHost?: (hostname: string) => Promise<void>;
};

/**
 * Downloads the raw MIME Resend named. The URL is not part of the signed webhook
 * body, and `fetch` would follow a redirect onto a private address, so every hop
 * must be public HTTPS and is resolved before it is called.
 */
export async function downloadResendRaw(start: string, options: DownloadOptions = {}): Promise<ArrayBuffer> {
	const fetchImpl = options.fetch ?? fetch;
	const resolveHost = options.resolveHost ?? ((hostname: string) => assertResolvesPublic(hostname));
	let current = start;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		if (!isPublicHttpsUrl(current)) throw new ResendRawError("Refusing raw message URL");
		const url = new URL(current);
		await resolveHost(url.hostname);
		const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			await response.body?.cancel().catch(() => undefined);
			if (!location || hop === MAX_REDIRECTS) throw new ResendRawError("Refusing raw message redirect");
			current = new URL(location, url).href;
			continue;
		}
		if (!response.ok) throw new ResendRawError("Could not download the raw message");
		const declared = Number(response.headers.get("content-length"));
		if (Number.isFinite(declared) && declared > RESEND_RAW_MAX_BYTES) {
			await response.body?.cancel().catch(() => undefined);
			throw new ResendRawError("Raw message is too large");
		}
		const body = await response.arrayBuffer();
		if (body.byteLength > RESEND_RAW_MAX_BYTES) throw new ResendRawError("Raw message is too large");
		return body;
	}
	throw new ResendRawError("Refusing raw message redirect");
}
