import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { getEnv } from "@/lib/cloudflare";
import { getDb } from "@/db";
import { mailboxEmailBranding, mailboxes, users } from "@/db/schema";
import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { updateMailboxSchema } from "@/lib/validators";
import { getMailboxUpdateValues } from "@/app/api/mailboxes/[id]/utils";
import { brandPatchError, saveMailboxEmailBrand } from "@/lib/email/brand-service";
import { isMissingTableError } from "@/lib/database-errors";
import { ensureMailboxDomainRouting, removeMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";
import type { AdminMailboxRouteParams } from "./types";

async function managedMailbox(request: Request, id: string) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "mailboxes");
	if (!auth) return { env, mailbox: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
	const [mailbox] = await getDb(env).select({
		id: mailboxes.id, userId: mailboxes.userId, domainId: mailboxes.domainId,
		localPart: mailboxes.localPart, displayName: mailboxes.displayName,
		type: mailboxes.type, disabled: mailboxes.disabled, signature: mailboxes.signature,
		useAllDomains: mailboxes.useAllDomains, createdAt: mailboxes.createdAt,
	}).from(mailboxes).innerJoin(users, eq(mailboxes.userId, users.id))
		.where(and(eq(mailboxes.id, id), or(eq(users.id, auth.userId), eq(users.createdByUserId, auth.userId)))).limit(1);
	if (!mailbox) return { env, mailbox: null, error: NextResponse.json({ error: "Mailbox not found" }, { status: 404 }) };
	return { env, mailbox, error: null };
}

export async function GET(request: Request, { params }: AdminMailboxRouteParams) {
	const access = await managedMailbox(request, (await params).id);
	if (access.error) return access.error;
	let branding: Record<string, unknown> | null = null;
	try {
		const [row] = await getDb(access.env).select().from(mailboxEmailBranding).where(eq(mailboxEmailBranding.mailboxId, access.mailbox!.id)).limit(1);
		if (row) {
			branding = {
				brandingEnabled: row.enabled,
				logoUrl: row.logoUrl,
				accentColor: row.accentColor,
				secondaryColor: row.secondaryColor,
				backgroundColor: row.backgroundColor,
				cardColor: row.cardColor,
				wordmark: row.wordmark,
				footerText: row.footerText,
				footerLinks: parseFooterLinks(row.footerLinks),
				legalLine: row.legalLine,
				disclosureFooter: row.disclosureFooter,
			};
		}
	} catch (error) {
		if (!isMissingTableError(error)) throw error;
	}
	return NextResponse.json({ mailbox: { ...access.mailbox, branding } });
}

export async function PATCH(request: Request, { params }: AdminMailboxRouteParams) {
	const access = await managedMailbox(request, (await params).id);
	if (access.error) return access.error;
	const parsed = updateMailboxSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	const brandingError = brandPatchError(parsed.data);
	if (brandingError) return NextResponse.json({ error: brandingError }, { status: 400 });
	const db = getDb(access.env);
	if (parsed.data.useAllDomains === true) {
		try {
			await ensureMailboxDomainRouting(access.env, db, { id: access.mailbox!.id, domainId: access.mailbox!.domainId, localPart: access.mailbox!.localPart, useAllDomains: true });
		} catch (error) {
			return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to configure inbound routing" }, { status: 502 });
		}
	}
	const values = getMailboxUpdateValues(parsed.data);
	if (Object.keys(values).length) await db.update(mailboxes).set(values).where(eq(mailboxes.id, access.mailbox!.id));
	if (hasBrandPatch(parsed.data)) {
		try {
			await saveMailboxEmailBrand(access.env, access.mailbox!.id, {
				clear: parsed.data.clearBranding,
				enabled: parsed.data.brandingEnabled,
				logoUrl: parsed.data.logoUrl,
				accentColor: parsed.data.accentColor,
				secondaryColor: parsed.data.secondaryColor,
				backgroundColor: parsed.data.backgroundColor,
				cardColor: parsed.data.cardColor,
				wordmark: parsed.data.wordmark,
				footerText: parsed.data.footerText,
				footerLinks: parsed.data.footerLinks,
				legalLine: parsed.data.legalLine,
				disclosureFooter: parsed.data.disclosureFooter,
			});
		} catch (error) {
			if (isMissingTableError(error)) return NextResponse.json({ error: "Apply pending database migrations first" }, { status: 409 });
			throw error;
		}
	}
	return NextResponse.json({ ok: true });
}

function parseFooterLinks(value: string | null): unknown {
	if (!value) return null;
	try { return JSON.parse(value); } catch { return null; }
}

function hasBrandPatch(data: { clearBranding?: boolean; brandingEnabled?: boolean | null; logoUrl?: string | null; accentColor?: string | null; secondaryColor?: string | null; backgroundColor?: string | null; cardColor?: string | null; wordmark?: string | null; footerText?: string | null; footerLinks?: unknown; legalLine?: string | null; disclosureFooter?: string | null }): boolean {
	return Boolean(data.clearBranding) || ["brandingEnabled", "logoUrl", "accentColor", "secondaryColor", "backgroundColor", "cardColor", "wordmark", "footerText", "footerLinks", "legalLine", "disclosureFooter"].some((key) => key in data);
}

export async function DELETE(request: Request, { params }: AdminMailboxRouteParams) {
	const access = await managedMailbox(request, (await params).id);
	if (access.error) return access.error;
	const db = getDb(access.env);
	try {
		await removeMailboxDomainRouting(access.env, db, access.mailbox!);
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove Cloudflare routing rule" }, { status: 502 });
	}
	await db.delete(mailboxes).where(eq(mailboxes.id, access.mailbox!.id));
	return NextResponse.json({ ok: true });
}
