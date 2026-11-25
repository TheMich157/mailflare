export type EmailBrandLink = { label: string; href: string };

/** The resolved template. Empty strings are explicit; missing database values never reach this type. */
export type EmailBrand = {
	enabled: boolean;
	logoUrl: string;
	accentColor: string;
	secondaryColor: string;
	backgroundColor: string;
	cardColor: string;
	wordmark: string;
	footerText: string;
	footerLinks: EmailBrandLink[];
	legalLine: string;
	disclosureFooter: string;
};

/** A stored row. Null means "inherit the level above" (defaults, then the domain). */
export type EmailBrandInput = {
	enabled?: boolean | null;
	logoUrl?: string | null;
	accentColor?: string | null;
	secondaryColor?: string | null;
	backgroundColor?: string | null;
	cardColor?: string | null;
	wordmark?: string | null;
	footerText?: string | null;
	footerLinks?: string | EmailBrandLink[] | null;
	legalLine?: string | null;
	disclosureFooter?: string | null;
};

export type ComposeBrandedInput = {
	html?: string | null;
	text?: string | null;
	subject?: string | null;
	brand: EmailBrand | null;
	signatureHtml?: string | null;
};

export type ComposeBrandedResult = {
	html: string | null;
	text: string | null;
	wrapped: boolean;
};
