"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { RichTextEditor } from "@/components/compose/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/auth/client";
import { DEFAULT_EMAIL_BRAND } from "@/lib/email/branded-layout";
import type { EmailBrand } from "@/lib/email/branded-layout-types";
import { EmailBrandPreview } from "./email-brand-preview";
import { updateMailboxSignature } from "./utils";

export function MailboxSignatureForm() {
	const { t } = useLanguage();
	const { selectedMailbox, setSelectedMailbox, isLoading } = useSelectedMailbox();
	const [signature, setSignature] = useState(selectedMailbox?.signature ?? "");
	const [savedSignature, setSavedSignature] = useState(selectedMailbox?.signature ?? "");
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [brand, setBrand] = useState<EmailBrand>(DEFAULT_EMAIL_BRAND);
	const [syncedMailbox, setSyncedMailbox] = useState({ id: selectedMailbox?.id, signature: selectedMailbox?.signature });

	if (syncedMailbox.id !== selectedMailbox?.id || syncedMailbox.signature !== selectedMailbox?.signature) {
		const nextSignature = selectedMailbox?.signature ?? "";
		setSyncedMailbox({ id: selectedMailbox?.id, signature: selectedMailbox?.signature });
		setSignature(nextSignature);
		setSavedSignature(nextSignature);
		setStatus(null);
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox) return;
		setSaving(true);
		setStatus(null);
		try {
			const saved = await updateMailboxSignature(selectedMailbox.id, signature);
			setSignature(saved);
			setSavedSignature(saved);
			setSelectedMailbox({ ...selectedMailbox, signature: saved });
			setStatus(t("common.saved"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : t("settings.signature.failed"));
		} finally {
			setSaving(false);
		}
	}

	useEffect(() => {
		if (!selectedMailbox) return;
		let active = true;
		authFetch(`/api/settings/email-brand?mailboxId=${encodeURIComponent(selectedMailbox.id)}`)
			.then((response) => response.json() as Promise<{ brand?: EmailBrand }>)
			.then((data) => { if (active && data.brand) setBrand(data.brand); })
			.catch(() => undefined);
		return () => { active = false; };
	}, [selectedMailbox]);

	if (isLoading) return <p className="text-sm text-neutral-500">{t("settings.signature.loadingInbox")}</p>;
	if (!selectedMailbox) return <p className="text-sm text-neutral-500">{t("settings.signature.selectInbox")}</p>;

	const address = `${selectedMailbox.localPart}@${selectedMailbox.hostname}`;
	const canManage = selectedMailbox.permission === "full_access";

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="mailboxSignature">{t("settings.signature.for", { address })}</Label>
				<RichTextEditor
					id="mailboxSignature"
					value={signature}
					onChange={setSignature}
					placeholder={t("settings.signature.placeholder")}
					disabled={!canManage || saving}
				/>
				<p className="text-xs leading-5 text-neutral-500">
					{selectedMailbox.type === "shared" ? t("settings.signature.sharedHint") : t("settings.signature.hint")}
				</p>
			</div>
			<div className="space-y-2">
				<p className="text-xs font-medium text-neutral-500">{t("settings.signature.preview")}</p>
				<EmailBrandPreview brand={brand} signature={signature} sample={t("settings.signature.sample")} />
			</div>
			<div className="flex items-center gap-3">
				<Button type="submit" disabled={!canManage || saving || signature.trim() === savedSignature}>
					{saving ? t("common.saving") : t("settings.signature.save")}
				</Button>
				{!canManage && <p className="text-sm text-neutral-500">{t("settings.signature.needFullAccess")}</p>}
				{status && <p role="status" className="text-sm text-neutral-500">{status}</p>}
			</div>
		</form>
	);
}
