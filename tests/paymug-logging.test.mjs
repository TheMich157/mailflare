import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

const { app, newDatabase } = await loadApp("open-entitlements", `
	export { getLicenseEntitlements, getLicenseStatus, activateLicense, validateLicense, deactivateLicense } from "./src/lib/licenses/service.ts";
	export { getAccountSeatError } from "./src/lib/licenses/seats.ts";
	export { isTeamMailboxSharingEnabled } from "./src/lib/mailboxes/access-utils.ts";
`);

const fullEntitlements = {
	plan: "team",
	canCustomizeBranding: true,
	canManageAccounts: true,
	canShareMailboxes: true,
	accountSeatLimit: null,
	canForwardEmail: true,
};

test("a community license with a seat cap does not limit features or contact a license server", async (t) => {
	const { env, db } = await newDatabase(t, `
		INSERT INTO license_settings (id, instance_id, plan, state, seat_limit, features, updated_at)
		VALUES ('default', 'inst', 'community', 'inactive', 1, '[]', 1);
	`);
	const calls = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (...args) => {
		calls.push(String(args[0]));
		return realFetch(...args);
	};
	t.after(() => { globalThis.fetch = realFetch; });

	assert.deepEqual(await app.getLicenseEntitlements(env), fullEntitlements);
	const status = await app.getLicenseStatus(env);
	assert.equal(status.active, true);
	assert.equal(status.plan, "team");
	assert.equal(status.seatLimit, null);
	assert.equal(await app.getAccountSeatError(env), null);
	assert.equal(await app.isTeamMailboxSharingEnabled(db), true);
	assert.equal((await app.activateLicense(env, "LICENSE-SECRET-KEY-123", "https://mail.example.com", "pro")).active, true);
	assert.equal((await app.validateLicense(env, "LICENSE-SECRET-KEY-123", "https://mail.example.com")).active, true);
	assert.equal((await app.deactivateLicense(env)).active, true);
	assert.deepEqual(calls, []);
});

test("missing license settings still entitle every feature", async (t) => {
	const { env, db } = await newDatabase(t);
	assert.deepEqual(await app.getLicenseEntitlements(env), fullEntitlements);
	assert.equal(await app.getAccountSeatError(env), null);
	assert.equal(await app.isTeamMailboxSharingEnabled(db), true);
});
