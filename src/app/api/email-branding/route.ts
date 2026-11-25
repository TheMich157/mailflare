import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { domains, mailboxEmailBranding, mailboxes } from "@/db/schema";
import { assertPrimaryAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { isMissingTableError } from "@/lib/database-errors";
import { brandPatchError, readEmailBrand, saveDomainEmailBrand, saveMailboxEmailBrand } from "@/lib/email/brand-service";
import { mergeEmailBrand } from "@/lib/email/branded-layout";

const linkSchema = z.object({
	label: z.string().trim().min(1).max(80),
	href: z.string().trim().max(500),
});

const brandSchema = z.object({
	enabled: z.boolean(),
	logoUrl: z.string().max(2000),
	accentColor: z.string().max(7),
	secondaryColor: z.string().max(7),
	backgroundColor: z.string().max(7),
	cardColor: z.string().max(7),
	wordmark: z.string().max(80),
	footerText: z.string().max(500),
	footerLinks: z.array(linkSchema).max(8),
	legalLine: z.string().max(500),
	disclosureFooter: z.string().max(1000),
});

const putSchema = z.object({
	scope: z.enum(["domain", "mailbox"]),
	id: z.string().min(1),
	clear: z.boolean().optional(),
	brand: brandSchema.optional(),
});

async function primaryAdmin(request: Request) {
	const env = getEnv();
	try {
		assertPrimaryAdmin(await requireUser(env, request));
	} catch {
		return { env, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
	}
	return { env, error: null };
}

export async function GET(request: Request) {
	const access = await primaryAdmin(request);
	if (access.error) return access.error;
	const db = getDb(access.env);
	const domainRows = await db.select({ id: domains.id, hostname: domains.hostname }).from(domains);
	const mailboxRows = await db
		.select({ id: mailboxes.id, domainId: mailboxes.domainId, localPart: mailboxes.localPart, type: mailboxes.type, hostname: domains.hostname })
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id));
	const branded: Array<{ id: string; hostname: string; brand: Awaited<ReturnType<typeof readEmailBrand>> }> = [];
	for (const domain of domainRows) {
		branded.push({ ...domain, brand: await readEmailBrand(access.env, domain.hostname) });
	}
	let overrides: Record<string, unknown> = {};
	try {
		const rows = await db.select().from(mailboxEmailBranding);
		overrides = Object.fromEntries(rows.map((row) => [row.mailboxId, row]));
	} catch (error) {
		if (!isMissingTableError(error)) throw error;
	}
	return NextResponse.json({
		domains: branded,
		mailboxes: mailboxRows.map((row) => ({ ...row, address: `${row.localPart}@${row.hostname}` })),
		overrides,
	});
}

export async function PUT(request: Request) {
	const access = await primaryAdmin(request);
	if (access.error) return access.error;
	const parsed = putSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	const { scope, id, clear, brand } = parsed.data;
	if (!clear && !brand) return NextResponse.json({ error: "A brand is required" }, { status: 400 });
	if (brand) {
		const error = brandPatchError(brand);
		if (error) return NextResponse.json({ error }, { status: 400 });
	}
	try {
		if (scope === "domain") {
			await saveDomainEmailBrand(access.env, id, mergeEmailBrand(brand));
		} else if (clear) {
			await saveMailboxEmailBrand(access.env, id, { clear: true });
		} else if (brand) {
			await saveMailboxEmailBrand(access.env, id, brand);
		}
	} catch (error) {
		if (isMissingTableError(error)) return NextResponse.json({ error: "Apply pending database migrations first" }, { status: 409 });
		throw error;
	}
	return NextResponse.json({ ok: true });
}
