import { DEFAULT_AUTO_SEND_FOOTER } from "./auto-send-utils";

const DEFAULT_ACCENT = "#1f4e79";
const URL_PATTERN = /\bhttps?:\/\/[^\s<>\]]+/gi;

export type AutoReplyQuote = {
	from: string;
	sentAt?: string | Date | null;
	text: string;
};

export type AutoReplyBrand = {
	signature?: string | null;
	logoUrl?: string | null;
	accentColor?: string | null;
	footer?: string | null;
};

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function cleanText(value: string): string {
	return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n");
}

/** A #rgb or #rrggbb color, or the default navy. Anything else cannot reach the style attribute. */
export function normalizeAccentColor(value: string | null | undefined): string {
	const raw = (value ?? "").trim();
	const short = /^#([0-9a-fA-F]{3})$/.exec(raw);
	if (short) {
		const [r, g, b] = short[1];
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_ACCENT;
}

/** An https logo address, or null. http, data and credential URLs are dropped. */
export function normalizeLogoUrl(value: string | null | undefined): string | null {
	const raw = (value ?? "").trim();
	if (!raw || raw.length > 500) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:" || url.username || url.password) return null;
		return url.toString();
	} catch {
		return null;
	}
}

function normalizedUrl(value: string): string {
	return value.replace(/[),.;:]+$/g, "").replace(/\/+$/, "").toLowerCase();
}

function quoteWhen(value: string | Date | null | undefined): string {
	if (!value) return "an earlier date";
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? "an earlier date" : date.toUTCString();
}

/** The disclosure line is rendered in its own slot, not inside the answer. */
export function splitDisclosureFooter(reply: string, footer?: string | null): { answer: string; footer: string } {
	const line = (footer ?? "").trim() || DEFAULT_AUTO_SEND_FOOTER;
	const marker = `\n\n-- \n${line}`;
	const text = reply.trim();
	if (text.endsWith(marker)) return { answer: text.slice(0, -marker.length).trim(), footer: line };
	return { answer: text, footer: line };
}

/**
 * Turns the answer into HTML. Links are anchors only when the knowledge text already contains them.
 * Any other URL is left as text with a broken scheme so a mail client does not make it clickable.
 */
function answerToHtml(answer: string, allowedText: string, accent: string): string {
	const allowed = new Set((allowedText.match(URL_PATTERN) ?? []).map(normalizedUrl));
	let html = "";
	let last = 0;
	for (const match of answer.matchAll(URL_PATTERN)) {
		const index = match.index ?? 0;
		html += escapeHtml(answer.slice(last, index));
		const bare = match[0].replace(/[),.;:]+$/g, "");
		const trailing = match[0].slice(bare.length);
		if (allowed.has(normalizedUrl(bare))) {
			const href = escapeHtml(bare);
			html += `<a href="${href}" style="color:${accent};text-decoration:underline;">${href}</a>`;
		} else {
			html += escapeHtml(bare.replace(/^https?:/i, (scheme) => `${scheme.slice(0, -1)}[:]`));
		}
		html += escapeHtml(trailing);
		last = index + match[0].length;
	}
	html += escapeHtml(answer.slice(last));
	return html.replace(/\n/g, "<br>");
}

function quoteLines(text: string): string {
	const body = cleanText(text).trim().slice(0, 4_000);
	if (!body) return "";
	return body.split("\n").map((line) => `> ${line}`).join("\n");
}

/**
 * A table-based message with inline CSS, a plain-text alternative, and the original mail quoted
 * underneath. Brand fields come from the mailbox, never from the model.
 */
export function renderAutoReplyEmail(input: {
	answer: string;
	allowedText?: string;
	brand?: AutoReplyBrand;
	quote?: AutoReplyQuote | null;
}): { text: string; html: string } {
	const accent = normalizeAccentColor(input.brand?.accentColor);
	const logo = normalizeLogoUrl(input.brand?.logoUrl);
	const signature = cleanText(input.brand?.signature ?? "").trim().slice(0, 120);
	const footer = cleanText(input.brand?.footer ?? "").trim().slice(0, 500) || DEFAULT_AUTO_SEND_FOOTER;
	const answer = cleanText(input.answer).trim().slice(0, 8_000);
	const quoted = quoteLines(input.quote?.text ?? "");
	const from = cleanText(input.quote?.from ?? "").trim().slice(0, 300);
	const when = input.quote ? quoteWhen(input.quote.sentAt) : "";

	const textParts = [answer];
	if (signature) textParts.push(signature);
	textParts.push(footer);
	let text = textParts.filter(Boolean).join("\n\n");
	if (quoted && from) text += `\n\nOn ${when}, ${from} wrote:\n${quoted}`;

	const header = logo
		? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(signature || "Logo")}" width="160" style="display:block;border:0;outline:none;text-decoration:none;max-width:160px;height:auto;">`
		: signature
			? `<p style="margin:0;font-size:20px;line-height:28px;font-weight:700;color:${accent};">${escapeHtml(signature)}</p>`
			: "";
	const signatureRow = signature
		? `<p style="margin:24px 0 0;font-size:15px;line-height:22px;font-weight:700;color:#1c2834;" class="mf-text">${escapeHtml(signature)}</p>`
		: "";
	const quoteRow = quoted && from
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;"><tr><td class="mf-quote" style="border-left:3px solid #d5dde6;padding:0 0 0 14px;font-size:13px;line-height:20px;color:#5c6b7a;">On ${escapeHtml(when)}, ${escapeHtml(from)} wrote:<br>${escapeHtml(quoted).replace(/\n/g, "<br>")}</td></tr></table>`
		: "";
	const preheader = escapeHtml(answer.replace(/\s+/g, " ").slice(0, 140));

	const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
:root { color-scheme: light dark; }
@media only screen and (max-width: 620px) {
  .mf-card { width: 100% !important; }
}
@media (prefers-color-scheme: dark) {
  .mf-bg { background: #0f1419 !important; }
  .mf-card { background: #1a212b !important; }
  .mf-text { color: #e7edf4 !important; }
  .mf-muted { color: #a7b3c2 !important; }
  .mf-quote { color: #c5ced8 !important; border-color: #3a4654 !important; }
}
</style>
</head>
<body class="mf-bg" style="margin:0;padding:0;background-color:#eef2f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="mf-bg" bgcolor="#eef2f6" style="background-color:#eef2f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="mf-card" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;">
<tr><td bgcolor="${accent}" style="background-color:${accent};height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 32px;">
${header ? `<div style="margin:0 0 20px;">${header}</div>` : ""}
<div class="mf-text" style="font-size:16px;line-height:26px;color:#1c2834;">${answerToHtml(answer, input.allowedText ?? "", accent)}</div>
${signatureRow}
<p class="mf-muted" style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e4eaf0;font-size:12px;line-height:18px;color:#6b7785;">${escapeHtml(footer)}</p>
${quoteRow}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
	return { text, html };
}
