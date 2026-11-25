import assert from "node:assert/strict";
import test from "node:test";
import { loadApp } from "./helpers/real-db.mjs";

const { app, newDatabase } = await loadApp("agent-auto-send-state", `
	export { mailboxOwnerHostnames } from "./src/lib/agent/mailbox-domains.ts";
	export { escalatedThreadKeys, messageNeedsHuman } from "./src/lib/agent/escalations.ts";
`);

const seed = `
	INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES
		('owner', 'owner@owned.test', 'hash', 'Owner', 'admin', 1),
		('other', 'other@foreign.test', 'hash', 'Other', 'user', 1);
	INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES
		('d-a', 'owner', 'owned.test', 'z1', 'active', 1),
		('d-b', 'other', 'foreign.test', 'z2', 'active', 1);
	INSERT INTO mailboxes (id, user_id, domain_id, local_part, created_at) VALUES
		('mb', 'owner', 'd-a', 'support', 1);
	INSERT INTO messages (id, user_id, mailbox_id, direction, from_addr, to_addr, status, thread_id, created_at) VALUES
		('m-old', 'owner', 'mb', 'outbound', 'support@owned.test', 'a@customer.test', 'sent', 'thread-1', 5),
		('m1', 'owner', 'mb', 'inbound', 'a@customer.test', 'support@owned.test', 'received', 'thread-1', 10),
		('m-draft', 'owner', 'mb', 'outbound', 'support@owned.test', 'a@customer.test', 'draft', 'thread-1', 15);
	INSERT INTO agent_escalations (id, mailbox_id, thread_id, message_id, reason, created_at) VALUES
		('e1', 'mb', 'thread-1', 'm1', 'payments', 11);
`;

const thread = [{ mailboxId: "mb", threadId: "thread-1", id: "m1" }];

test("own-domain filtering stays on the mailbox owner", async (t) => {
	const { db } = await newDatabase(t, seed);
	const names = await app.mailboxOwnerHostnames(db, "owner");
	assert.deepEqual(names, ["owned.test"]);
});

test("a later human reply clears the needs-a-person flag and an automatic reply does not", async (t) => {
	const { db, sqlite } = await newDatabase(t, seed);
	assert.equal((await app.escalatedThreadKeys(db, thread)).has("mb:thread-1"), true);
	assert.equal(await app.messageNeedsHuman(db, "mb", "thread-1", "m1"), true);

	sqlite.exec(`
		INSERT INTO messages (id, user_id, mailbox_id, direction, from_addr, to_addr, status, thread_id, created_at) VALUES
			('m-auto', 'owner', 'mb', 'outbound', 'support@owned.test', 'a@customer.test', 'sent', 'thread-1', 20);
		INSERT INTO agent_auto_sends (id, mailbox_id, thread_id, message_id, sent_message_id, sender_address, created_at) VALUES
			('s1', 'mb', 'thread-1', 'm1', 'm-auto', 'a@customer.test', 20);
	`);
	assert.equal((await app.escalatedThreadKeys(db, thread)).has("mb:thread-1"), true);
	assert.equal(await app.messageNeedsHuman(db, "mb", "thread-1", "m1"), true);

	sqlite.exec(`
		INSERT INTO messages (id, user_id, mailbox_id, direction, from_addr, to_addr, status, thread_id, created_at) VALUES
			('m-human', 'owner', 'mb', 'outbound', 'support@owned.test', 'a@customer.test', 'sent', 'thread-1', 30);
	`);
	assert.equal((await app.escalatedThreadKeys(db, thread)).has("mb:thread-1"), false);
	assert.equal(await app.messageNeedsHuman(db, "mb", "thread-1", "m1"), false);

	sqlite.exec(`
		INSERT INTO messages (id, user_id, mailbox_id, direction, from_addr, to_addr, status, thread_id, created_at) VALUES
			('m2', 'owner', 'mb', 'inbound', 'a@customer.test', 'support@owned.test', 'received', 'thread-1', 40);
		INSERT INTO agent_escalations (id, mailbox_id, thread_id, message_id, reason, created_at) VALUES
			('e2', 'mb', 'thread-1', 'm2', 'payments', 41);
	`);
	assert.equal((await app.escalatedThreadKeys(db, thread)).has("mb:thread-1"), true);
	assert.equal(await app.messageNeedsHuman(db, "mb", "thread-1", "m2"), true);
});
