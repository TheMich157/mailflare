"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { EmailBrandPreview } from "@/components/settings/email-brand-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { authFetch } from "@/lib/auth/client";
import { DEFAULT_EMAIL_BRAND, mergeEmailBrand } from "@/lib/email/branded-layout";
import type { EmailBrand, EmailBrandInput, EmailBrandLink } from "@/lib/email/branded-layout-types";

type DomainRow = { id: string; hostname: string; brand: EmailBrand | null };
type MailboxRow = { id: string; domainId: string; address: string; type: string };

const EMPTY: EmailBrand = { ...DEFAULT_EMAIL_BRAND, footerLinks: DEFAULT_EMAIL_BRAND.footerLinks.map((link) => ({ ...link })) };

export function EmailBrandSettings() {
	const { t } = useLanguage();
	const [domains, setDomains] = useState<DomainRow[]>([]);
	const [mailboxes, setMailboxes] = useState<MailboxRow[]>([]);
	const [overrides, setOverrides] = useState<Record<string, EmailBrandInput>>({});
	const [domainId, setDomainId] = useState("");
	const [mailboxId, setMailboxId] = useState("");
	const [brand, setBrand] = useState<EmailBrand>(EMPTY);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let active = true;
		authFetch("/api/email-branding")
			.then((response) => response.json() as Promise<{ domains?: DomainRow[]; mailboxes?: MailboxRow[]; overrides?: Record<string, EmailBrandInput> }>)
			.then((data) => {
				if (!active) return;
				const nextDomains = (data.domains ?? []) as DomainRow[];
				setDomains(nextDomains);
				setMailboxes((data.mailboxes ?? []) as MailboxRow[]);
				setOverrides((data.overrides ?? {}) as Record<string, EmailBrandInput>);
				const first = nextDomains[0];
				if (first) {
					setDomainId(first.id);
					setBrand(first.brand ?? EMPTY);
				}
			})
			.catch(() => {
				if (active) setStatus(t("branding.email.loadFailed"));
			});
		return () => { active = false; };
	}, [t]);

	const domain = domains.find((item) => item.id === domainId);
	const domainMailboxes = mailboxes.filter((item) => item.domainId === domainId);

	function selectDomain(id: string) {
		setDomainId(id);
		setMailboxId("");
		setBrand(domains.find((item) => item.id === id)?.brand ?? EMPTY);
		setStatus(null);
	}

	function selectMailbox(id: string) {
		setMailboxId(id);
		setStatus(null);
		const base = domain?.brand ?? EMPTY;
		setBrand(id ? mergeEmailBrand(base, overrides[id] ?? null) : base);
	}

	function update<K extends keyof EmailBrand>(key: K, value: EmailBrand[K]) {
		setBrand((current) => ({ ...current, [key]: value }));
	}

	function updateLink(index: number, patch: Partial<EmailBrandLink>) {
		setBrand((current) => ({
			...current,
			footerLinks: current.footerLinks.map((link, item) => item === index ? { ...link, ...patch } : link),
		}));
	}

	async function save(event: React.FormEvent) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		try {
			const payload = { ...brand, footerLinks: brand.footerLinks.filter((link) => link.label.trim() && link.href.trim()) };
			const response = await authFetch("/api/email-branding", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ scope: mailboxId ? "mailbox" : "domain", id: mailboxId || domainId, brand: payload }),
			});
			const data = await response.json().catch(() => ({})) as { error?: unknown };
			if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : t("branding.email.saveFailed"));
			if (mailboxId) setOverrides((current) => ({ ...current, [mailboxId]: payload }));
			else setDomains((current) => current.map((item) => item.id === domainId ? { ...item, brand: payload } : item));
			setBrand(payload);
			setStatus(t("common.saved"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : t("branding.email.saveFailed"));
		} finally {
			setSaving(false);
		}
	}

	async function clearOverride() {
		if (!mailboxId) return;
		setSaving(true);
		setStatus(null);
		try {
			const response = await authFetch("/api/email-branding", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ scope: "mailbox", id: mailboxId, clear: true }),
			});
			if (!response.ok) throw new Error(t("branding.email.saveFailed"));
			setOverrides((current) => {
				const next = { ...current };
				delete next[mailboxId];
				return next;
			});
			setBrand(domain?.brand ?? EMPTY);
			setStatus(t("branding.email.cleared"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : t("branding.email.saveFailed"));
		} finally {
			setSaving(false);
		}
	}

	if (!domains.length) return <p className="text-sm text-neutral-500">{t("branding.email.noDomains")}</p>;

	return (
		<form onSubmit={save} className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="brandDomain">{t("branding.email.domain")}</Label>
					<select id="brandDomain" className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm" value={domainId} onChange={(event) => selectDomain(event.target.value)}>
						{domains.map((item) => <option key={item.id} value={item.id}>{item.hostname}</option>)}
					</select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="brandMailbox">{t("branding.email.mailbox")}</Label>
					<select id="brandMailbox" className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm" value={mailboxId} onChange={(event) => selectMailbox(event.target.value)}>
						<option value="">{t("branding.email.domainDefault")}</option>
						{domainMailboxes.map((item) => <option key={item.id} value={item.id}>{item.address}</option>)}
					</select>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="text-sm font-medium text-neutral-900">{t("branding.email.enabled")}</p>
					<p className="text-xs text-neutral-500">{t("branding.email.enabledHint")}</p>
				</div>
				<Switch checked={brand.enabled} onCheckedChange={(checked) => update("enabled", checked)} />
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label={t("branding.email.wordmark")} value={brand.wordmark} onChange={(value) => update("wordmark", value)} />
				<Field label={t("branding.email.logo")} value={brand.logoUrl} onChange={(value) => update("logoUrl", value)} />
				<ColorField label={t("branding.email.accent")} value={brand.accentColor} onChange={(value) => update("accentColor", value)} />
				<ColorField label={t("branding.email.secondary")} value={brand.secondaryColor} onChange={(value) => update("secondaryColor", value)} />
				<ColorField label={t("branding.email.background")} value={brand.backgroundColor} onChange={(value) => update("backgroundColor", value)} />
				<ColorField label={t("branding.email.card")} value={brand.cardColor} onChange={(value) => update("cardColor", value)} />
			</div>
			<div className="space-y-2">
				<Label>{t("branding.email.footer")}</Label>
				<Textarea value={brand.footerText} rows={2} onChange={(event) => update("footerText", event.target.value)} />
			</div>
			<div className="space-y-2">
				<Label>{t("branding.email.links")}</Label>
				{brand.footerLinks.map((link, index) => (
					<div key={index} className="grid gap-2 sm:grid-cols-2">
						<Input value={link.label} aria-label={t("branding.email.linkLabel")} onChange={(event) => updateLink(index, { label: event.target.value })} />
						<Input value={link.href} aria-label={t("branding.email.linkHref")} onChange={(event) => updateLink(index, { href: event.target.value })} />
					</div>
				))}
				<div className="flex gap-2">
					<Button type="button" variant="outline" onClick={() => update("footerLinks", [...brand.footerLinks, { label: "", href: "https://" }].slice(0, 8))}>{t("branding.email.addLink")}</Button>
					{brand.footerLinks.length > 0 && <Button type="button" variant="outline" onClick={() => update("footerLinks", brand.footerLinks.slice(0, -1))}>{t("branding.email.removeLink")}</Button>}
				</div>
			</div>
			<div className="space-y-2">
				<Label>{t("branding.email.legal")}</Label>
				<Textarea value={brand.legalLine} rows={2} onChange={(event) => update("legalLine", event.target.value)} />
			</div>
			<div className="space-y-2">
				<Label>{t("branding.email.disclosure")}</Label>
				<Textarea value={brand.disclosureFooter} rows={2} onChange={(event) => update("disclosureFooter", event.target.value)} />
			</div>
			<EmailBrandPreview brand={brand} sample={t("branding.email.sample")} />
			<div className="flex flex-wrap items-center gap-3">
				<Button type="submit" disabled={saving || !domainId}>{saving ? t("common.saving") : mailboxId ? t("branding.email.saveMailbox") : t("branding.email.saveDomain")}</Button>
				{mailboxId && <Button type="button" variant="outline" disabled={saving} onClick={clearOverride}>{t("branding.email.clearMailbox")}</Button>}
				{status && <p role="status" className="text-sm text-neutral-600">{status}</p>}
			</div>
		</form>
	);
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Input value={value} onChange={(event) => onChange(event.target.value)} />
		</div>
	);
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	const picker = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<div className="flex gap-2">
				<Input type="color" aria-label={label} value={picker} className="h-10 w-14 p-1" onChange={(event) => onChange(event.target.value)} />
				<Input value={value} onChange={(event) => onChange(event.target.value)} />
			</div>
		</div>
	);
}
