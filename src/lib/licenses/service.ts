import type { LicenseEntitlements, LicensePlan, LicenseStatus } from "./types";

/**
 * This fork treats every installation as fully entitled.
 * Seats are unlimited and every Pro, Team and other paid-tier feature is on.
 * Nothing here reads `license_settings` or contacts a license server.
 */
export const OPEN_ENTITLEMENTS: LicenseEntitlements = {
	plan: "team",
	canCustomizeBranding: true,
	canManageAccounts: true,
	canShareMailboxes: true,
	accountSeatLimit: null,
	canForwardEmail: true,
};

function openLicenseStatus(): LicenseStatus {
	return {
		plan: "team",
		state: "active",
		features: ["branding", "accounts", "sharing", "forwarding"],
		seatLimit: null,
		instanceId: "open",
		instanceUrl: null,
		active: true,
		activatedAt: null,
		validatedAt: null,
	};
}

export async function getLicenseStatus(env: CloudflareEnv): Promise<LicenseStatus> {
	void env;
	return openLicenseStatus();
}

export async function getLicenseEntitlements(env: CloudflareEnv): Promise<LicenseEntitlements> {
	void env;
	return OPEN_ENTITLEMENTS;
}

export async function activateLicense(
	env: CloudflareEnv,
	licenseKey: string,
	instanceUrl: string,
	plan: Exclude<LicensePlan, "community">,
): Promise<LicenseStatus> {
	void env;
	void licenseKey;
	void instanceUrl;
	void plan;
	return openLicenseStatus();
}

export async function validateLicense(env: CloudflareEnv, licenseKey: string, instanceUrl: string): Promise<LicenseStatus> {
	void env;
	void licenseKey;
	void instanceUrl;
	return openLicenseStatus();
}

export async function deactivateLicense(env: CloudflareEnv): Promise<LicenseStatus> {
	void env;
	return openLicenseStatus();
}
