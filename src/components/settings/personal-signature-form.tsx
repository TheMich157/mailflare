"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { RichTextEditor } from "@/components/compose/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/auth/client";
import { DEFAULT_EMAIL_BRAND } from "@/lib/email/branded-layout";
import type { EmailBrand } from "@/lib/email/branded-layout-types";
import { EmailBrandPreview } from "./email-brand-preview";

export function PersonalSignatureForm() {
	const { t } = useLanguage();
	const [signature, setSignature] = useState("");
	const [saved, setSaved] = useState("");
	const [brand, setBrand] = useState<EmailBrand>(DEFAULT_EMAIL_BRAND);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let active = true;
		authFetch("/api/settings/compose")
			.then((response) => response.json() as Promise<{ signature?: unknown }>)
			.then((data) => {
				if (!active) return;
				const next = typeof data.signature === "string" ? data.signature : "";
				setSignature(next);
				setSaved(next);
			})
			.catch(() => undefined);
		authFetch("/api/settings/email-brand")
			.then((response) => response.json() as Promise<{ brand?: EmailBrand }>)
			.then((data) => { if (active && data.brand) setBrand(data.brand); })
			.catch(() => undefined);
		return () => { active = false; };
	}, []);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		try {
			const response = await authFetch("/api/settings/compose", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ signature }),
			});
			const data = await response.json().catch(() => ({})) as { error?: unknown; signature?: unknown };
			if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : t("settings.signature.failed"));
			const next = typeof data.signature === "string" ? data.signature : signature;
			setSignature(next);
			setSaved(next);
			setStatus(t("common.saved"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : t("settings.signature.failed"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="personalSignature">{t("settings.signature.personalFor")}</Label>
				<RichTextEditor id="personalSignature" value={signature} onChange={setSignature} placeholder={t("settings.signature.placeholder")} disabled={saving} />
				<p className="text-xs leading-5 text-neutral-500">{t("settings.signature.personalHint")}</p>
			</div>
			<div className="space-y-2">
				<p className="text-xs font-medium text-neutral-500">{t("settings.signature.preview")}</p>
				<EmailBrandPreview brand={brand} signature={signature} sample={t("settings.signature.sample")} />
			</div>
			<div className="flex items-center gap-3">
				<Button type="submit" disabled={saving || signature === saved}>{saving ? t("common.saving") : t("settings.signature.save")}</Button>
				{status && <p role="status" className="text-sm text-neutral-500">{status}</p>}
			</div>
		</form>
	);
}
