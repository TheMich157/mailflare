import { SOURCE_CODE_URL } from "@/lib/source-code";
import type { ComposeBrandedInput, ComposeBrandedResult, EmailBrand, EmailBrandInput, EmailBrandLink } from "./branded-layout-types";

export { SOURCE_CODE_URL };

/**
 * The quote wrapper the composer writes. Send-time branding splits on this exact
 * string, so a reply's new text is wrapped and the history stays below it.
 */
export const QUOTE_ATTRIBUTE = "data-mailflare-quote";
export const QUOTE_OPEN = `<div class="mailflare-quote" ${QUOTE_ATTRIBUTE}="1">`;

const BRAND_MARKER = 'data-mailflare-brand="1"';
const BRAND_MAIN_START = "<!--mailflare-brand-main-->";
const BRAND_MAIN_END = "<!--/mailflare-brand-main-->";
const BRAND_QUOTE_START = "<!--mailflare-brand-quote-->";
const BRAND_QUOTE_END = "<!--/mailflare-brand-quote-->";

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** ClipSync defaults. An admin save replaces them; nothing else in the send path hardcodes the brand. */
export const DEFAULT_EMAIL_BRAND: EmailBrand = {
	enabled: true,
	logoUrl: "https://clipsyncloud.com/assets/icon.png",
	accentColor: "#0084FF",
	secondaryColor: "#00E5FF",
	backgroundColor: "#060911",
	cardColor: "#101826",
	wordmark: "ClipSync",
	footerText: "support@clipsyncloud.com · licensing@clipsyncloud.com · clipsyncloud.com",
	footerLinks: [
		{ label: "support@clipsyncloud.com", href: "mailto:support@clipsyncloud.com" },
		{ label: "licensing@clipsyncloud.com", href: "mailto:licensing@clipsyncloud.com" },
		{ label: "clipsyncloud.com", href: "https://clipsyncloud.com" },
	],
	legalLine: "",
	disclosureFooter: "",
};

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function decodeEntities(value: string): string {
	return value
		.replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);?/g, (_, num: string) => safeCodePoint(Number(num)))
		.replace(/&nbsp;/gi, " ")
		.replace(/&quot;/gi, '"')
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&amp;/gi, "&");
}

function safeCodePoint(code: number): string {
	if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
	return String.fromCodePoint(code);
}

function normalizeColor(value: string | null | undefined, fallback: string): string {
	if (value == null) return fallback;
	const trimmed = value.trim();
	if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) return `#${trimmed.slice(1).split("").map((char) => char + char).join("")}`;
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
	return fallback;
}

function cleanLogo(value: string | null | undefined): string | undefined {
	if (value == null) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return "";
	return /^https:\/\//i.test(trimmed) ? trimmed : undefined;
}

function parseLinks(value: EmailBrandInput["footerLinks"]): EmailBrandLink[] {
	let source: unknown = value;
	if (typeof value === "string") {
		try { source = JSON.parse(value); } catch { return []; }
	}
	if (!Array.isArray(source)) return [];
	const links: EmailBrandLink[] = [];
	for (const item of source) {
		if (!item || typeof item !== "object") continue;
		const label = String((item as { label?: unknown }).label ?? "").trim().slice(0, 80);
		const href = String((item as { href?: unknown }).href ?? "").trim();
		if (!label || !/^(https:\/\/|mailto:)/i.test(href)) continue;
		links.push({ label, href });
		if (links.length === 8) break;
	}
	return links;
}

function applyBrandInput(brand: EmailBrand, row: EmailBrandInput | null | undefined): EmailBrand {
	if (!row) return brand;
	const next: EmailBrand = { ...brand, footerLinks: [...brand.footerLinks] };
	if (typeof row.enabled === "boolean") next.enabled = row.enabled;
	const logo = cleanLogo(row.logoUrl);
	if (logo !== undefined) next.logoUrl = logo;
	if (row.accentColor != null) next.accentColor = normalizeColor(row.accentColor, brand.accentColor);
	if (row.secondaryColor != null) next.secondaryColor = normalizeColor(row.secondaryColor, brand.secondaryColor);
	if (row.backgroundColor != null) next.backgroundColor = normalizeColor(row.backgroundColor, brand.backgroundColor);
	if (row.cardColor != null) next.cardColor = normalizeColor(row.cardColor, brand.cardColor);
	if (row.wordmark != null) next.wordmark = row.wordmark.slice(0, 80);
	if (row.footerText != null) next.footerText = row.footerText;
	if (row.footerLinks != null) next.footerLinks = parseLinks(row.footerLinks);
	if (row.legalLine != null) next.legalLine = row.legalLine;
	if (row.disclosureFooter != null) next.disclosureFooter = row.disclosureFooter;
	return next;
}

/** Domain values replace defaults; a mailbox value replaces the domain only when it is set. */
export function mergeEmailBrand(domain?: EmailBrandInput | null, mailbox?: EmailBrandInput | null): EmailBrand {
	return applyBrandInput(applyBrandInput({ ...DEFAULT_EMAIL_BRAND, footerLinks: DEFAULT_EMAIL_BRAND.footerLinks.map((link) => ({ ...link })) }, domain), mailbox);
}

/**
 * Shared inboxes (support@, licensing@) send the mailbox signature.
 * Personal inboxes send the user's signature, falling back to a mailbox signature that was saved before personal signatures existed.
 */
export function selectOutboundSignature(input: {
	mailboxType?: string | null;
	mailboxSignature?: string | null;
	personalSignature?: string | null;
}): string | null {
	const mailbox = input.mailboxSignature?.trim() ?? "";
	const personal = input.personalSignature?.trim() ?? "";
	if (input.mailboxType === "shared") return mailbox || null;
	return personal || mailbox || null;
}

const ALLOWED_TAGS = new Set(["a", "b", "strong", "i", "em", "u", "s", "br", "p", "div", "span", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "img", "table", "thead", "tbody", "tr", "td", "th", "hr", "pre", "code"]);

function parseAttrs(raw: string): Array<[string, string]> {
	const attrs: Array<[string, string]> = [];
	const re = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(raw))) attrs.push([match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ""]);
	return attrs;
}

function safeLink(value: string): string | null {
	const decoded = decodeEntities(value).replace(/[\u0000-\u001f\s]+/g, "");
	if (!/^(https?:|mailto:|tel:)/i.test(decoded)) return null;
	if (/^(mailto:|tel:)/i.test(decoded)) return decoded;
	try {
		const url = new URL(decoded);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return url.href;
	} catch {
		return null;
	}
}

function safeImage(value: string): string | null {
	const decoded = decodeEntities(value).replace(/[\u0000-\u001f\s]+/g, "");
	if (/^cid:/i.test(decoded) && /^cid:[A-Za-z0-9._%+-]+$/.test(decoded)) return decoded;
	try {
		const url = new URL(decoded);
		return url.protocol === "https:" ? url.href : null;
	} catch {
		return null;
	}
}

/** Drops scripts, event handlers, and any image that is not https (or a cid: attachment). */
export function sanitizeEmailFragment(html: string): string {
	let source = html.replace(/<!--[\s\S]*?-->/g, "");
	for (let pass = 0; pass < 4; pass += 1) {
		const next = source.replace(/<(script|style|iframe|object|embed|noscript|form|svg|math|textarea|select|button|link|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
		source = next === source ? source : next;
		if (next === source) break;
	}
	source = source.replace(/<\/?(script|style|iframe|object|embed|noscript|form|svg|math|textarea|select|button|link|meta|base)\b[^>]*>/gi, "");
	return source.replace(/<\/?([a-zA-Z0-9]+)(\s[^<>]*)?>/g, (full, rawName: string, rawAttrs: string | undefined) => {
		const name = rawName.toLowerCase();
		if (!ALLOWED_TAGS.has(name)) return "";
		if (full.startsWith("</")) return name === "br" || name === "hr" ? "" : `</${name}>`;
		if (name === "br" || name === "hr") return `<${name}>`;
		const parts: string[] = [];
		for (const [key, value] of parseAttrs(rawAttrs ?? "")) {
			if (key.startsWith("on") || key === "style" || key === "srcset" || key === "class" || key === "id" || key.startsWith("data-")) continue;
			if (name === "a" && key === "href") {
				const href = safeLink(value);
				if (href) parts.push(`href="${escapeHtml(href)}"`);
			} else if (name === "img" && key === "src") {
				const src = safeImage(value);
				if (src) parts.push(`src="${escapeHtml(src)}"`);
			} else if (name === "img" && key === "alt") {
				parts.push(`alt="${escapeHtml(decodeEntities(value).slice(0, 200))}"`);
			} else if ((key === "width" || key === "height") && /^\d{1,4}$/.test(value)) {
				parts.push(`${key}="${value}"`);
			}
		}
		if (name === "a" && parts.some((part) => part.startsWith("href="))) parts.push('target="_blank"', 'rel="noopener noreferrer"');
		return `<${name}${parts.length ? ` ${parts.join(" ")}` : ""}>`;
	});
}

function linkifyEscaped(escaped: string): string {
	return escaped.replace(/https:\/\/[^\s<>"']+/g, (raw) => {
		const url = raw.replace(/[.,;:!?)]+$/g, "");
		return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${raw.slice(url.length)}`;
	});
}

export function plainTextToHtml(text: string): string {
	const normalized = text.replace(/\r\n?/g, "\n").trim();
	if (!normalized) return "";
	return normalized.split(/\n{2,}/).map((paragraph) => `<p>${linkifyEscaped(escapeHtml(paragraph)).replace(/\n/g, "<br>")}</p>`).join("");
}

function htmlToText(html: string): string {
	const stripped = html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)>/gi, "\n")
		.replace(/<[^>]+>/g, "");
	return decodeEntities(stripped).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitQuoted(html: string): { body: string; quoted: string | null } {
	const index = html.indexOf(QUOTE_OPEN);
	if (index < 0) return { body: html, quoted: null };
	const inner = html.slice(index + QUOTE_OPEN.length).replace(/<\/div>\s*$/, "");
	return { body: html.slice(0, index), quoted: inner };
}

function between(html: string, start: string, end: string): string | null {
	const from = html.indexOf(start);
	if (from < 0) return null;
	const to = html.indexOf(end, from + start.length);
	if (to < 0) return null;
	return html.slice(from + start.length, to);
}

/** Pull the previous message out of a branded shell so a reply does not nest a second template. */
function unwrapBranded(html: string): string {
	if (!html.includes(BRAND_MARKER)) return html;
	const main = between(html, BRAND_MAIN_START, BRAND_MAIN_END);
	if (main == null) return html;
	const quoted = between(html, BRAND_QUOTE_START, BRAND_QUOTE_END);
	return `${main}${quoted ?? ""}`;
}

function isOurBrandedDocument(html: string): boolean {
	const { body } = splitQuoted(html);
	return body.includes(BRAND_MARKER) && body.includes(BRAND_MAIN_START);
}

function splitPlainQuote(text: string): { body: string; quoted: string | null } {
	const normalized = text.replace(/\r\n?/g, "\n");
	const wrote = normalized.search(/\nOn .+ wrote:\n/);
	if (wrote >= 0) return { body: normalized.slice(0, wrote).trim(), quoted: normalized.slice(wrote).trim() };
	const lines = normalized.split("\n");
	const index = lines.findIndex((line, lineIndex) => lineIndex > 0 && line.startsWith(">"));
	if (index > 0 && lines.slice(index).every((line) => line.startsWith(">") || line.trim() === "")) {
		return { body: lines.slice(0, index).join("\n").trim(), quoted: lines.slice(index).join("\n").trim() };
	}
	return { body: normalized.trim(), quoted: null };
}

function quoteText(value: string): string {
	return value.split("\n").map((line) => `> ${line.replace(/^>\s?/, "")}`).join("\n");
}

function signatureBlock(signature: string): string {
	const value = signature.trim();
	if (!value) return "";
	const html = /<\/?[a-z]/i.test(value) ? sanitizeEmailFragment(value) : plainTextToHtml(value);
	if (!html.trim()) return "";
	return `<div data-mailflare-signature="1"><br><br>${html}</div>`;
}

function adminHtml(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (/<\/?[a-z]/i.test(trimmed)) return sanitizeEmailFragment(trimmed);
	return linkifyEscaped(escapeHtml(trimmed)).replace(/\n/g, "<br>");
}

function textColors(background: string): { text: string; muted: string } {
	const hex = background.replace("#", "");
	if (!/^[0-9a-fA-F]{6}$/.test(hex)) return { text: "#F4F7FB", muted: "#9AA8BD" };
	const lum = (0.2126 * parseInt(hex.slice(0, 2), 16) + 0.7152 * parseInt(hex.slice(2, 4), 16) + 0.0722 * parseInt(hex.slice(4, 6), 16)) / 255;
	return lum > 0.62 ? { text: "#121826", muted: "#526074" } : { text: "#F4F7FB", muted: "#9AA8BD" };
}

function renderHtml(input: { body: string; quoted: string | null; brand: EmailBrand; preheader: string; subject: string }): string {
	const { brand } = input;
	const card = textColors(brand.cardColor);
	const page = textColors(brand.backgroundColor);
	const logo = /^https:\/\//i.test(brand.logoUrl)
		? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.wordmark || "Logo")}" width="36" height="36" style="display:block;border:0;border-radius:8px;outline:none;text-decoration:none;">`
		: "";
	const links = brand.footerLinks.map((link) => `<a href="${escapeHtml(link.href)}" style="color:${page.muted};text-decoration:underline;">${escapeHtml(link.label)}</a>`).join(" &nbsp;·&nbsp; ");
	const footerBits = [links || adminHtml(brand.footerText), adminHtml(brand.legalLine), adminHtml(brand.disclosureFooter), `<a href="${escapeHtml(SOURCE_CODE_URL)}" style="color:${page.muted};">Source code</a>`].filter(Boolean);
	const quote = input.quoted
		? `${BRAND_QUOTE_START}<div class="mailflare-quote" ${QUOTE_ATTRIBUTE}="1" style="margin-top:16px;border-left:3px solid ${brand.accentColor};padding:4px 0 4px 12px;color:${page.muted};font-size:13px;line-height:1.5;">${sanitizeEmailFragment(unwrapBranded(input.quoted))}</div>${BRAND_QUOTE_END}`
		: "";
	const preheader = `${escapeHtml(input.preheader)}${"&nbsp;&zwnj;".repeat(8)}`;
	return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${escapeHtml(input.subject)}</title><!--[if mso]><style>table,td{font-family:Inter,'Segoe UI',Arial,sans-serif;}</style><![endif]--><style>
:root{color-scheme:dark light;}
body{margin:0;padding:0;background:${brand.backgroundColor};}
a{color:${brand.accentColor};}
@media (prefers-color-scheme: dark){
.mf-bg{background:${brand.backgroundColor} !important;}
.mf-card{background:${brand.cardColor} !important;}
.mf-text,.mf-text p,.mf-text div,.mf-text li{color:${card.text} !important;}
.mf-muted{color:${page.muted} !important;}
}
@media only screen and (max-width:620px){
.mf-shell{width:100% !important;}
.mf-px{padding-left:16px !important;padding-right:16px !important;}
}
</style></head><body class="mf-bg" style="margin:0;padding:0;background:${brand.backgroundColor};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" ${BRAND_MARKER} class="mf-bg" bgcolor="${brand.backgroundColor}" cellpadding="0" cellspacing="0" border="0" style="background:${brand.backgroundColor};width:100%;"><tr><td align="center">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="mf-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${FONT};">
<tr><td class="mf-px" style="padding:28px 24px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${logo ? `<td style="padding-right:12px;vertical-align:middle;">${logo}</td>` : ""}
<td style="vertical-align:middle;"><div style="font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${page.text};">${escapeHtml(brand.wordmark)}</div>
<div style="height:3px;width:56px;margin-top:8px;background-color:${brand.accentColor};background-image:linear-gradient(90deg,${brand.accentColor},${brand.secondaryColor});border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td>
</tr></table>
</td></tr>
<tr><td class="mf-px" style="padding:8px 24px 0;">
<table role="presentation" class="mf-card" width="100%" bgcolor="${brand.cardColor}" cellpadding="0" cellspacing="0" border="0" style="background:${brand.cardColor};border-radius:16px;"><tr>
<td class="mf-text" data-mailflare-brand-body="1" style="padding:24px;color:${card.text};font-family:${FONT};font-size:15px;line-height:1.6;">
${BRAND_MAIN_START}${input.body}${BRAND_MAIN_END}
</td></tr></table>
</td></tr>
${quote ? `<tr><td class="mf-px mf-muted" style="padding:8px 24px 0;font-family:${FONT};">${quote}</td></tr>` : ""}
<tr><td class="mf-px mf-muted" style="padding:20px 24px 32px;font-family:${FONT};font-size:12px;line-height:1.6;color:${page.muted};">${footerBits.join("<br>")}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

function renderPlain(body: string, quoted: string | null, brand: EmailBrand): string {
	const footer = [brand.wordmark, brand.footerText, brand.legalLine, brand.disclosureFooter, `Source: ${SOURCE_CODE_URL}`].map((line) => line.trim()).filter(Boolean);
	const parts = [body.trim()];
	if (footer.length) parts.push("", "--", footer.join("\n"));
	if (quoted?.trim()) parts.push("", quoteText(quoted));
	return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Wrap one outbound body in the shared branded layout. Already-branded mail
 * (a scheduled retry, or a reply whose new text is empty of chrome) is returned unchanged.
 */
export function composeBrandedMessage(input: ComposeBrandedInput): ComposeBrandedResult {
	const html = input.html ?? null;
	const text = input.text ?? null;
	if (!input.brand?.enabled) return { html, text, wrapped: false };
	if (html && isOurBrandedDocument(html)) return { html, text, wrapped: false };

	let bodyHtml = "";
	let bodyText = "";
	let quotedHtml: string | null = null;
	let quotedText: string | null = null;
	if (html?.trim()) {
		const split = splitQuoted(html);
		bodyHtml = sanitizeEmailFragment(split.body);
		bodyText = htmlToText(bodyHtml);
		quotedHtml = split.quoted;
		quotedText = split.quoted ? htmlToText(unwrapBranded(split.quoted)) : null;
	} else if (text?.trim()) {
		const split = splitPlainQuote(text);
		bodyText = split.body;
		bodyHtml = plainTextToHtml(split.body);
		quotedText = split.quoted ? split.quoted.replace(/^>\s?/gm, "") : null;
		quotedHtml = split.quoted ? plainTextToHtml(quotedText ?? "") : null;
	}
	if (!bodyHtml.trim() && !quotedHtml) return { html, text, wrapped: false };

	const signature = input.signatureHtml?.trim() ?? "";
	if (signature && !bodyHtml.includes('data-mailflare-signature="1"')) {
		const block = signatureBlock(signature);
		if (block) {
			bodyHtml += block;
			const signatureText = htmlToText(block);
			if (signatureText) bodyText = `${bodyText}\n\n${signatureText}`.trim();
		}
	}
	const subject = input.subject?.trim() || bodyText.split("\n")[0]?.slice(0, 80) || input.brand.wordmark;
	const preheader = (bodyText.split("\n").find((line) => line.trim()) ?? subject).slice(0, 140);
	return {
		html: renderHtml({ body: bodyHtml, quoted: quotedHtml, brand: input.brand, preheader, subject }),
		text: renderPlain(bodyText, quotedText, input.brand),
		wrapped: true,
	};
}
