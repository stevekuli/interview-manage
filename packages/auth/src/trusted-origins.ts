type TrustedOriginsInput = string | string[] | undefined | null;

export function getTrustedOrigins(appUrl: string, extraOrigins?: TrustedOriginsInput): string[] {
	const normalizeOrigin = (origin: string): string => origin.replace(/\/$/, "");
	const trustedOrigins = new Set<string>(["http://localhost:3000", "http://127.0.0.1:3000"]);

	const configuredUrl = new URL(appUrl);
	trustedOrigins.add(normalizeOrigin(configuredUrl.origin));

	if (configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1") {
		const loopbackAlias = configuredUrl.hostname === "localhost" ? "127.0.0.1" : "localhost";
		configuredUrl.hostname = loopbackAlias;
		trustedOrigins.add(normalizeOrigin(configuredUrl.origin));
	}

	// Extra origins (e.g. a legacy IP entrance alongside the canonical APP_URL domain) so a
	// domain cutover does not lock returning visitors out of sign-in with INVALID_ORIGIN.
	const extras =
		typeof extraOrigins === "string" ? extraOrigins.split(",") : Array.isArray(extraOrigins) ? extraOrigins : [];
	for (const extra of extras) {
		const candidate = extra.trim();
		if (!candidate) continue;
		try {
			const url = new URL(candidate);
			if (url.protocol !== "http:" && url.protocol !== "https:") continue;
			trustedOrigins.add(normalizeOrigin(url.origin));
		} catch {
			// Ignore malformed entries instead of failing auth startup.
		}
	}

	return [...trustedOrigins];
}
