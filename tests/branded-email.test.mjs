import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-branded-email-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

await build({
	entryPoints: {
		layout: join(root, "src/lib/email/branded-layout.ts"),
		send: join(root, "src/lib/email/send.ts"),
		autoReply: join(root, "src/lib/email/auto-reply.ts"),
		system: join(root, "src/lib/email/system-mail.ts"),
		database: join(root, "server/runtime/sqlite-database.ts"),
		migrate: join(root, "server/runtime/migrate.ts"),
	},
	outdir: outDir,
	outExtension: { ".js": ".mjs" },
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	tsconfig: join(root, "tsconfig.json"),
	external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/*"],
	logLevel: "silent",
});

const load = (name) => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
const layout = await load("layout");
const send = await load("send");
const { sendMailboxAutoReply } = await load("autoReply");
const system = await load("system");
const { SqliteDatabase } = await load("database");
const { applyMigrations } = await load("migrate");

const { composeBrandedMessage, selectOutboundSignature, DEFAULT_EMAIL_BRAND, mergeEmailBrand, SOURCE_CODE_URL } = layout;

const quote = (inner) => `<div class="mailflare-quote" data-mailflare-quote="1">${inner}</div>`;

test("plain text becomes a branded HTML message and a matching text alternative", () => {
	const result = composeBrandedMessage({
		text: "Hello from support.\n\nThe license is ready: https://clipsyncloud.com/pricing",
		subject: "Your license",
		brand: DEFAULT_EMAIL_BRAND,
	});
	assert.equal(result.wrapped, true);
	assert.match(result.html, /data-mailflare-brand="1"/);
	assert.match(result.html, /max-width:\s*600px/);
	assert.match(result.html, /<!--\[if mso\]>/);
	assert.match(result.html, /prefers-color-scheme:\s*dark/);
	assert.match(result.html, /#060911/i);
	assert.match(result.html, /#0084FF/i);
	assert.match(result.html, /#00E5FF/i);
	assert.match(result.html, /fonts?|Inter/);
	assert.match(result.html, /https:\/\/clipsyncloud.com\/assets\/icon\.png/);
	assert.match(result.html, /alt="ClipSync"/);
	assert.match(result.html, /Hello from support\./);
	assert.match(result.html, /href="https:\/\/clipsyncloud\.com\/pricing"/);
	assert.match(result.html, /support@clipsyncloud\.com/);
	assert.match(result.html, /licensing@clipsyncloud\.com/);
	assert.match(result.html, new RegExp(SOURCE_CODE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(result.html, /Your license|Hello from support/);
	assert.match(result.text, /Hello from support\./);
	assert.match(result.text, /https:\/\/clipsyncloud\.com\/pricing/);
	assert.match(result.text, /support@clipsyncloud\.com/);
	assert.doesNotMatch(result.text, /<p|<table|data-mailflare/);
});

test("plain text escapes HTML and drops unsafe markup from an HTML body", () => {
	const escaped = composeBrandedMessage({
		text: `Hello <script>alert(1)</script> & "quotes"`,
		brand: DEFAULT_EMAIL_BRAND,
	});
	assert.doesNotMatch(escaped.html, /<script/i);
	assert.match(escaped.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.match(escaped.html, /&amp;/);
	assert.match(escaped.text, /<script>alert\(1\)<\/script>/);

	const dirty = composeBrandedMessage({
		html: `<p onclick="alert(1)">Hi</p><a href="javascript:alert(1)">bad</a><a href="https://clipsyncloud.com/ok">ok</a><img src="http://evil.test/a.png" onerror="alert(1)"><img src="https://clipsyncloud.com/assets/icon.png" alt="mark"><img src="javascript:alert(1)">`,
		brand: DEFAULT_EMAIL_BRAND,
	});
	assert.doesNotMatch(dirty.html, /javascript:|onerror|onclick|http:\/\/evil/i);
	assert.match(dirty.html, /href="https:\/\/clipsyncloud\.com\/ok"/);
	assert.match(dirty.html, /src="https:\/\/clipsyncloud\.com\/assets\/icon\.png"/);
	assert.match(dirty.html, />Hi</);
});

test("a reply keeps quoted history below the card and does not wrap a branded message twice", () => {
	const original = composeBrandedMessage({ text: "The original note.", brand: DEFAULT_EMAIL_BRAND });
	assert.equal((original.html.match(/data-mailflare-brand="1"/g) ?? []).length, 1);
	const again = composeBrandedMessage({ html: original.html, text: original.text, brand: DEFAULT_EMAIL_BRAND });
	assert.equal(again.wrapped, false);
	assert.equal(again.html, original.html);

	const reply = composeBrandedMessage({
		html: `<p>Thanks, that works.</p>${quote(original.html)}`,
		brand: DEFAULT_EMAIL_BRAND,
	});
	assert.equal(reply.wrapped, true);
	assert.equal((reply.html.match(/data-mailflare-brand="1"/g) ?? []).length, 1);
	assert.equal((reply.html.match(/clipsyncloud\.com\/assets\/icon\.png/g) ?? []).length, 1);
	assert.match(reply.html, /Thanks, that works\./);
	assert.match(reply.html, /data-mailflare-quote="1"/);
	assert.match(reply.html, /The original note\./);
	assert.match(reply.text, /Thanks, that works\./);
	assert.match(reply.text, /^> /m);
	assert.match(reply.text, /The original note\./);
});

test("a forward of an already branded message is quoted, not wrapped again inside the card", () => {
	const original = composeBrandedMessage({ text: "Please see the attached license.", brand: DEFAULT_EMAIL_BRAND });
	const forwarded = composeBrandedMessage({
		html: `<p>Forwarding this along.</p>${quote(original.html)}`,
		brand: DEFAULT_EMAIL_BRAND,
	});
	assert.equal((forwarded.html.match(/data-mailflare-brand="1"/g) ?? []).length, 1);
	assert.match(forwarded.html, /Forwarding this along\./);
	assert.match(forwarded.html, /Please see the attached license\./);
});

test("the signature follows the From mailbox: shared inboxes use the mailbox signature, personal inboxes the user's", () => {
	assert.equal(selectOutboundSignature({
		mailboxType: "shared",
		mailboxSignature: "<p>ClipSync Support</p>",
		personalSignature: "<p>Michael</p>",
	}), "<p>ClipSync Support</p>");
	assert.equal(selectOutboundSignature({
		mailboxType: "personal",
		mailboxSignature: "<p>Mailbox default</p>",
		personalSignature: "<p>Michael Adeyemi</p>",
	}), "<p>Michael Adeyemi</p>");
	assert.equal(selectOutboundSignature({
		mailboxType: "personal",
		mailboxSignature: "<p>Mailbox default</p>",
		personalSignature: "  ",
	}), "<p>Mailbox default</p>");

	const support = composeBrandedMessage({
		text: "We can help with that.",
		brand: DEFAULT_EMAIL_BRAND,
		signatureHtml: selectOutboundSignature({
			mailboxType: "shared",
			mailboxSignature: `<p>ClipSync Support<br><a href="https://clipsyncloud.com">clipsyncloud.com</a></p>`,
			personalSignature: "<p>Michael</p>",
		}),
	});
	assert.match(support.html, /data-mailflare-signature="1"/);
	assert.match(support.html, /ClipSync Support/);
	assert.doesNotMatch(support.html, /Michael/);
	const second = composeBrandedMessage({ html: support.html, brand: DEFAULT_EMAIL_BRAND, signatureHtml: "<p>ClipSync Support</p>" });
	assert.equal((second.html.match(/data-mailflare-signature="1"/g) ?? []).length, 1);
});

test("domain values override the defaults and a mailbox override wins per field", () => {
	const domain = mergeEmailBrand({
		enabled: true,
		logoUrl: "https://clipsyncloud.com/assets/other.png",
		accentColor: "#112233",
		secondaryColor: null,
		backgroundColor: null,
		cardColor: null,
		wordmark: "ClipSync Cloud",
		footerText: null,
		footerLinks: null,
		legalLine: "Licensed to you.",
		disclosureFooter: null,
	}, null);
	assert.equal(domain.accentColor, "#112233");
	assert.equal(domain.secondaryColor, DEFAULT_EMAIL_BRAND.secondaryColor);
	assert.equal(domain.wordmark, "ClipSync Cloud");
	assert.equal(domain.logoUrl, "https://clipsyncloud.com/assets/other.png");
	const mailbox = mergeEmailBrand(domain, {
		enabled: false,
		accentColor: "#abcdef",
		wordmark: null,
		logoUrl: "javascript:alert(1)",
	});
	assert.equal(mailbox.enabled, false);
	assert.equal(mailbox.accentColor, "#abcdef");
	assert.equal(mailbox.wordmark, "ClipSync Cloud");
	assert.equal(mailbox.logoUrl, "https://clipsyncloud.com/assets/other.png");
	assert.equal(composeBrandedMessage({ text: "Hi", brand: mailbox }).wrapped, false);
});

const seconds = (date) => Math.floor(date.getTime() / 1000);

async function createFixture(t) {
	const database = new SqliteDatabase(join(outDir, `${crypto.randomUUID()}.sqlite`));
	t.after(() => database.db.close());
	await applyMigrations(database, join(root, "drizzle/migrations"));
	const now = seconds(new Date());
	const db = database.db;
	db.prepare("INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ('u1', 'michael@clipsyncloud.com', 'Michael', 'x', 'admin', ?)").run(now);
	db.prepare("INSERT INTO domains (id, user_id, hostname, zone_id, sending_provider, sending_enabled, created_at) VALUES ('d1', 'u1', 'clipsyncloud.com', 'zone', 'cloudflare', 1, ?)").run(now);
	db.prepare("INSERT INTO mailboxes (id, user_id, domain_id, local_part, type, display_name, signature, created_at) VALUES ('mb-support', 'u1', 'd1', 'support', 'shared', 'ClipSync Support', '<p>Support desk</p>', ?)").run(now);
	db.prepare("INSERT INTO mailboxes (id, user_id, domain_id, local_part, type, display_name, signature, created_at) VALUES ('mb-michael', 'u1', 'd1', 'michael', 'personal', 'Michael', '<p>Mailbox sig</p>', ?)").run(now);
	db.prepare("INSERT INTO user_compose_preferences (user_id, track_opens_default, undo_send_seconds, signature, updated_at) VALUES ('u1', 0, 15, '<p>Michael Adeyemi</p>', ?)").run(now);
	const sent = [];
	const env = {
		DB: database,
		BUCKET: { put: async () => undefined, get: async () => null, delete: async () => undefined, head: async () => null },
		EMAIL: { send: async (message) => { sent.push(message); return { messageId: `<out-${sent.length}@clipsyncloud.com>` }; } },
		OUTBOUND_QUEUE: { send: async () => undefined },
	};
	return { env, sent, db };
}

test("compose, scheduled send, auto-reply and system mail all leave through the branded layout", async (t) => {
	const { env, sent, db } = await createFixture(t);
	await send.sendEmail(env, {
		userId: "u1", mailboxId: "mb-support", from: "ClipSync Support <support@clipsyncloud.com>",
		to: "ada@example.com", subject: "Re: license", text: "We can help with that.",
	});
	assert.match(sent[0].html, /data-mailflare-brand="1"/);
	assert.match(sent[0].html, /Support desk/);
	assert.doesNotMatch(sent[0].html, /Michael Adeyemi/);
	assert.match(sent[0].text, /We can help with that\./);

	const future = new Date(Date.now() + 60_000);
	const scheduled = await send.sendEmail(env, {
		userId: "u1", mailboxId: "mb-michael", from: "michael@clipsyncloud.com",
		to: "ada@example.com", subject: "Personal", text: "Talk tomorrow.", scheduledAt: future,
	});
	assert.equal(sent.length, 1);
	const [job] = db.prepare("SELECT id, payload FROM outbound_jobs WHERE message_id = ?").all(scheduled.messageId);
	db.prepare("UPDATE outbound_jobs SET scheduled_at = ? WHERE id = ?").run(seconds(new Date(Date.now() - 1000)), job.id);
	await send.processOutboundQueue(env, { kind: "email.scheduled", jobId: job.id, messageId: scheduled.messageId, scheduledAt: new Date(Date.now() - 1000).toISOString() });
	assert.match(sent[1].html, /data-mailflare-brand="1"/);
	assert.match(sent[1].html, /Michael Adeyemi/);
	assert.doesNotMatch(sent[1].html, /Support desk/);
	assert.match(sent[1].html, /Talk tomorrow\./);

	db.prepare("UPDATE mailboxes SET auto_reply_enabled = 1, auto_reply_subject = 'Away', auto_reply_body = 'I am away from the desk.' WHERE id = 'mb-support'").run();
	await sendMailboxAutoReply(env, {
		mailboxId: "mb-support", userId: "u1", fromAddress: "ada@example.com", deliveredAddress: "support@clipsyncloud.com",
		headers: {}, incomingMessageId: "<in@example.com>",
	});
	assert.match(sent.at(-1).html, /data-mailflare-brand="1"/);
	assert.match(sent.at(-1).html, /I am away from the desk/);
	assert.match(sent.at(-1).text, /I am away from the desk/);

	const systemSent = sent.length;
	await system.sendSystemEmail(env, { to: "ada@example.com", subject: "Reset", text: "Reset your password.", html: "<p>Reset your password.</p>" });
	assert.equal(sent.length, systemSent + 1);
	assert.match(sent.at(-1).html, /data-mailflare-brand="1"/);
	assert.match(sent.at(-1).html, /Reset your password\./);
});

test("a message that is already branded is delivered once, and a disabled domain is left alone", async (t) => {
	const { env, sent, db } = await createFixture(t);
	const branded = composeBrandedMessage({ text: "Already dressed.", brand: DEFAULT_EMAIL_BRAND });
	await send.sendEmail(env, {
		userId: "u1", mailboxId: "mb-support", from: "support@clipsyncloud.com",
		to: "ada@example.com", subject: "Hi", html: branded.html, text: branded.text,
	});
	assert.equal((sent[0].html.match(/data-mailflare-brand="1"/g) ?? []).length, 1);

	const now = seconds(new Date());
	db.prepare("INSERT INTO domain_email_branding (domain_id, enabled, updated_at) VALUES ('d1', 0, ?)").run(now);
	await send.sendEmail(env, {
		userId: "u1", mailboxId: "mb-michael", from: "michael@clipsyncloud.com",
		to: "ada@example.com", subject: "Plain", text: "No chrome.",
	});
	assert.equal(sent[1].html, undefined);
	assert.equal(sent[1].text, "No chrome.");
});
