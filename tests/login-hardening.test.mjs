import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

const { app } = await loadApp("login-hardening", `
	export { hashPassword, verifyPassword, PASSWORDLESS_PASSWORD_HASH } from "./src/lib/auth/password.ts";
	export { allowAccountLoginAttempt } from "./src/lib/auth/rate-limit.ts";
`);

function limiter(max) {
	const counts = new Map();
	return {
		async limit({ key }) {
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return { success: next <= max };
		},
	};
}

test("a missing or passkey-only password hash still pays for a bcrypt compare", () => {
	const hash = app.hashPassword("correct horse battery");
	verifyWarmup(hash);
	const real = elapsed(() => app.verifyPassword("wrong", hash));
	const missing = elapsed(() => app.verifyPassword("wrong", null));
	const passkey = elapsed(() => app.verifyPassword("wrong", app.PASSWORDLESS_PASSWORD_HASH));
	assert.equal(app.verifyPassword("wrong", null), false);
	assert.equal(app.verifyPassword("wrong", app.PASSWORDLESS_PASSWORD_HASH), false);
	assert.equal(app.verifyPassword("correct horse battery", hash), true);
	assert.ok(missing > real * 0.4, `missing-user compare took ${missing}ms, a real hash took ${real}ms`);
	assert.ok(passkey > real * 0.4, `passkey-only compare took ${passkey}ms, a real hash took ${real}ms`);
});

test("login guesses against one account share a budget across addresses", async () => {
	const env = { LOGIN_RATE_LIMIT: limiter(2) };
	assert.equal(await app.allowAccountLoginAttempt(env, "Ada@One.test"), true);
	assert.equal(await app.allowAccountLoginAttempt(env, "ada@one.test"), true);
	assert.equal(await app.allowAccountLoginAttempt(env, "ada@one.test"), false);
	assert.equal(await app.allowAccountLoginAttempt(env, "bea@one.test"), true);
	assert.equal(await app.allowAccountLoginAttempt({}, "ada@one.test"), true);
});

function verifyWarmup(hash) {
	app.verifyPassword("warmup", hash);
}

function elapsed(run) {
	const start = process.hrtime.bigint();
	run();
	return Number(process.hrtime.bigint() - start) / 1e6;
}
