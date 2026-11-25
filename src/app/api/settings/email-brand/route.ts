import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, mailboxes } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { DEFAULT_EMAIL_BRAND } from "@/lib/email/branded-layout";
import { readEmailBrand } from "@/lib/email/brand-service";
import { getMailboxSettingsAccess } from "@/lib/mailboxes/settings-access";

/** Resolved template for a mailbox the caller can configure, used by the signature preview. */
export async function GET(request: Request) {
	const env = getEnv();
	let user;
	try {
		user = await requireUser(env, request);
	} catch {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const mailboxId = new URL(request.url).searchParams.get("mailboxId");
	if (!mailboxId) return NextResponse.json({ brand: DEFAULT_EMAIL_BRAND });
	const access = await getMailboxSettingsAccess(env, user, mailboxId);
	if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const [mailbox] = await getDb(env)
		.select({ hostname: domains.hostname, type: mailboxes.type })
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(eq(mailboxes.id, mailboxId))
		.limit(1);
	const brand = mailbox ? await readEmailBrand(env, mailbox.hostname, mailboxId) : null;
	return NextResponse.json({ brand: brand ?? DEFAULT_EMAIL_BRAND, mailboxType: mailbox?.type ?? null });
}
