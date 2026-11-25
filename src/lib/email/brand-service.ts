import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domainEmailBranding, domains, mailboxEmailBranding, mailboxes, userComposePreferences } from "@/db/schema";
import { isMissingColumnError, isMissingTableError } from "@/lib/database-errors";
import { getEmailAddress } from "@/lib/email/address";
import { composeBrandedMessage, mergeEmailBrand, selectOutboundSignature } from "@/lib/email/branded-layout";
import type { EmailBrand, EmailBrandInput } from "@/lib/email/branded-layout-types";

export type OutboundBody = { html?: string; text?: string };

type BrandPatch = EmailBrandInput;

function rowToInput(row: {
	enabled: boolean | null;
	logoUrl: string | null;
	accentColor: string | null;
	secondaryColor: string | null;
	backgroundColor: string | null;
	cardColor: string | null;
	wordmark: string | null;
	footerText: string | null;
	footerLinks: string | null;
	legalLine: string | null;
	disclosureFooter: string | null;
} | undefined): EmailBrandInput | null {
	if (!row) return null;
	return row;
}

/** The template a domain (and optional mailbox) will actually send. Null when the migration is not applied yet. */
export async function readEmailBrand(env: CloudflareEnv, hostname: string, mailboxId?: string | null): Promise<EmailBrand | null> {
	const db = getDb(env);
	const [domain] = await db.select({ id: domains.id }).from(domains).where(eq(domains.hostname, hostname.toLowerCase())).limit(1);
	if (!domain) return null;
	try {
		const [domainRow] = await db.select().from(domainEmailBranding).where(eq(domainEmailBranding.domainId, domain.id)).limit(1);
		const [mailboxRow] = mailboxId
			? await db.select().from(mailboxEmailBranding).where(eq(mailboxEmailBranding.mailboxId, mailboxId)).limit(1)
			: [];
		return mergeEmailBrand(rowToInput(domainRow), rowToInput(mailboxRow));
	} catch (error) {
		if (isMissingTableError(error)) return null;
		throw error;
	}
}

async function personalSignature(env: CloudflareEnv, userId: string): Promise<string> {
	try {
		const [row] = await getDb(env)
			.select({ signature: userComposePreferences.signature })
			.from(userComposePreferences)
			.where(eq(userComposePreferences.userId, userId))
			.limit(1);
		return row?.signature ?? "";
	} catch (error) {
		if (isMissingTableError(error) || isMissingColumnError(error)) return "";
		throw error;
	}
}

async function outboundSignature(env: CloudflareEnv, mailboxId: string, userId: string): Promise<string | null> {
	const [mailbox] = await getDb(env)
		.select({ type: mailboxes.type, signature: mailboxes.signature })
		.from(mailboxes)
		.where(eq(mailboxes.id, mailboxId))
		.limit(1);
	if (!mailbox) return null;
	return selectOutboundSignature({
		mailboxType: mailbox.type,
		mailboxSignature: mailbox.signature,
		personalSignature: await personalSignature(env, userId),
	});
}

/**
 * Apply the shared branded layout at delivery. A database that has not been
 * migrated yet sends the body unchanged, so mail keeps flowing during an upgrade.
 */
export async function brandOutboundBodies(
	env: CloudflareEnv,
	input: { from: string; mailboxId?: string | null; userId?: string | null; html?: string | null; text?: string | null; subject?: string; includeSignature?: boolean },
): Promise<OutboundBody> {
	const original: OutboundBody = { html: input.html ?? undefined, text: input.text ?? undefined };
	const hostname = getEmailAddress(input.from).split("@")[1]?.toLowerCase();
	if (!hostname) return original;
	let brand: EmailBrand | null;
	try {
		brand = await readEmailBrand(env, hostname, input.mailboxId);
	} catch (error) {
		if (isMissingTableError(error)) return original;
		throw error;
	}
	if (!brand?.enabled) return original;
	let signature: string | null = null;
	if (input.includeSignature !== false && input.mailboxId && input.userId) {
		signature = await outboundSignature(env, input.mailboxId, input.userId);
	}
	const composed = composeBrandedMessage({
		html: input.html,
		text: input.text,
		subject: input.subject,
		brand,
		signatureHtml: signature,
	});
	if (!composed.wrapped) return original;
	return { html: composed.html ?? undefined, text: composed.text ?? undefined };
}

function brandColumns(brand: EmailBrand, enabled: boolean) {
	return {
		enabled,
		logoUrl: brand.logoUrl || null,
		accentColor: brand.accentColor,
		secondaryColor: brand.secondaryColor,
		backgroundColor: brand.backgroundColor,
		cardColor: brand.cardColor,
		wordmark: brand.wordmark,
		footerText: brand.footerText,
		footerLinks: JSON.stringify(brand.footerLinks),
		legalLine: brand.legalLine,
		disclosureFooter: brand.disclosureFooter,
		updatedAt: new Date(),
	};
}

export async function saveDomainEmailBrand(env: CloudflareEnv, domainId: string, brand: EmailBrand): Promise<void> {
	const db = getDb(env);
	const values = { domainId, ...brandColumns(brand, brand.enabled), enabled: brand.enabled };
	await db.insert(domainEmailBranding).values(values).onConflictDoUpdate({
		target: domainEmailBranding.domainId,
		set: brandColumns(brand, brand.enabled),
	});
}

function kept<T>(patchValue: T | null | undefined, existing: T | null | undefined): T | null {
	if (patchValue === undefined) return existing ?? null;
	return patchValue ?? null;
}

export async function saveMailboxEmailBrand(env: CloudflareEnv, mailboxId: string, patch: BrandPatch & { clear?: boolean }): Promise<void> {
	const db = getDb(env);
	if (patch.clear) {
		await db.delete(mailboxEmailBranding).where(eq(mailboxEmailBranding.mailboxId, mailboxId));
		return;
	}
	const [existing] = await db.select().from(mailboxEmailBranding).where(eq(mailboxEmailBranding.mailboxId, mailboxId)).limit(1);
	const links = patch.footerLinks === undefined ? existing?.footerLinks ?? null : patch.footerLinks == null ? null : JSON.stringify(parseStoredLinks(patch.footerLinks));
	const values = {
		mailboxId,
		enabled: typeof patch.enabled === "boolean" ? patch.enabled : existing?.enabled ?? null,
		logoUrl: kept(patch.logoUrl, existing?.logoUrl),
		accentColor: kept(patch.accentColor, existing?.accentColor),
		secondaryColor: kept(patch.secondaryColor, existing?.secondaryColor),
		backgroundColor: kept(patch.backgroundColor, existing?.backgroundColor),
		cardColor: kept(patch.cardColor, existing?.cardColor),
		wordmark: kept(patch.wordmark, existing?.wordmark),
		footerText: kept(patch.footerText, existing?.footerText),
		footerLinks: links,
		legalLine: kept(patch.legalLine, existing?.legalLine),
		disclosureFooter: kept(patch.disclosureFooter, existing?.disclosureFooter),
		updatedAt: new Date(),
	};
	await db.insert(mailboxEmailBranding).values(values).onConflictDoUpdate({
		target: mailboxEmailBranding.mailboxId,
		set: values,
	});
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Rejects a mailbox branding patch that would put an unsafe URL or a bad color into the template. */
export function brandPatchError(input: {
	logoUrl?: string | null;
	accentColor?: string | null;
	secondaryColor?: string | null;
	backgroundColor?: string | null;
	cardColor?: string | null;
	footerLinks?: Array<{ href: string }> | null;
}): string | null {
	if (input.logoUrl && !/^https:\/\//i.test(input.logoUrl)) return "Logo URL must start with https://";
	for (const color of [input.accentColor, input.secondaryColor, input.backgroundColor, input.cardColor]) {
		if (color && !HEX.test(color)) return "Colors must be #rgb or #rrggbb";
	}
	if (input.footerLinks?.some((link) => !/^(https:\/\/|mailto:)/i.test(link.href))) return "Footer links must be https or mailto";
	return null;
}

function parseStoredLinks(value: EmailBrandInput["footerLinks"]): EmailBrand["footerLinks"] {
	return mergeEmailBrand(null, { footerLinks: value }).footerLinks;
}
