import { SourceCodeLink } from "@/components/source-code-link";

export default function LicensesPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl md:text-3xl font-medium text-neutral-900">Features</h1>
				<p className="mt-2 text-sm text-neutral-500">
					This installation includes every feature. Account seats are unlimited and no license key is required.
				</p>
			</div>
			<p className="text-sm text-neutral-600">
				<SourceCodeLink className="font-medium text-blue-700 hover:underline" />
			</p>
		</div>
	);
}
