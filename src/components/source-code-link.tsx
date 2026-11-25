import { SOURCE_CODE_URL } from "@/lib/source-code";

/** Visible offer of the corresponding source, for people using the network service. */
export function SourceCodeLink({ className = "hover:underline" }: { className?: string }) {
	return (
		<a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer" className={className}>
			Source code
		</a>
	);
}
