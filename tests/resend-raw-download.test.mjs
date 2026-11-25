import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

const { app } = await loadApp("resend-raw-download", `
	export { downloadResendRaw, ResendRawError } from "./src/lib/email/resend-raw.ts";
`);

const resolveHost = async () => {};
const bytes = (body, status = 200, headers = {}) => new Response(body, { status, headers });

test("a public https URL is downloaded and a redirect to another public host is followed", async () => {
	const seen = [];
	const fetch = async (url) => {
		seen.push(String(url));
		if (String(url) === "https://inbound.resend.com/start") {
			return bytes(null, 302, { location: "https://files.resend.com/object" });
		}
		return bytes(Uint8Array.from([9, 8, 7]));
	};
	const body = await app.downloadResendRaw("https://inbound.resend.com/start", { fetch, resolveHost });
	assert.deepEqual([...new Uint8Array(body)], [9, 8, 7]);
	assert.deepEqual(seen, ["https://inbound.resend.com/start", "https://files.resend.com/object"]);
});

test("private, plaintext and redirected-to-private URLs are refused before a request body is kept", async () => {
	const seen = [];
	const fetch = async (url) => {
		seen.push(String(url));
		return bytes(null, 302, { location: "http://127.0.0.1/latest/meta-data" });
	};
	await assert.rejects(() => app.downloadResendRaw("http://inbound.resend.com/raw", { fetch, resolveHost }), app.ResendRawError);
	await assert.rejects(() => app.downloadResendRaw("https://127.0.0.1/raw", { fetch, resolveHost }), app.ResendRawError);
	await assert.rejects(() => app.downloadResendRaw("https://169.254.169.254/latest", { fetch, resolveHost }), app.ResendRawError);
	await assert.rejects(() => app.downloadResendRaw("https://inbound.resend.com/raw", { fetch, resolveHost }), app.ResendRawError);
	await assert.rejects(
		() => app.downloadResendRaw("https://evil.example/raw", { fetch, resolveHost: async () => { throw new Error("private address"); } }),
		/private address/,
	);
	assert.deepEqual(seen, ["https://inbound.resend.com/raw"]);
});
