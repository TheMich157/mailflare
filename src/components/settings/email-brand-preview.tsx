"use client";

import { composeBrandedMessage } from "@/lib/email/branded-layout";
import type { EmailBrand } from "@/lib/email/branded-layout-types";

/** Renders the same HTML a send would produce, inside a script-less frame. */
export function EmailBrandPreview({ brand, signature, sample }: { brand: EmailBrand; signature?: string; sample: string }) {
	const html = composeBrandedMessage({
		brand,
		subject: "Re: Your ClipSync license",
		text: sample,
		signatureHtml: signature,
	}).html ?? "";
	return (
		<iframe
			title="Email preview"
			sandbox=""
			srcDoc={html}
			className="h-[560px] w-full rounded-xl border border-neutral-200 bg-white"
		/>
	);
}
