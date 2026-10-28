import type { AIProvider } from "@reactive-resume/ai/types";
import { AI_PROVIDER_DEFAULT_BASE_URLS } from "@reactive-resume/ai/types";
import { env } from "@reactive-resume/env/server";
import {
	hostnameResolvesToPrivateAddress,
	isPrivateOrLoopbackHost,
	parseUrl,
} from "@reactive-resume/utils/url-security.node";

type ResolveAiBaseUrlInput = {
	provider: AIProvider;
	baseURL?: string | null;
};

function assertSafeUrl(input: string, errorCode: string, options?: { allowUnsafe?: boolean }) {
	const parsed = parseUrl(input);
	if (!parsed) throw new Error(errorCode);
	if (parsed.username || parsed.password) throw new Error(errorCode);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(errorCode);

	if (!options?.allowUnsafe) {
		if (parsed.protocol !== "https:") throw new Error(errorCode);
		if (isPrivateOrLoopbackHost(parsed.hostname)) throw new Error(errorCode);
	}

	parsed.hash = "";
	return parsed.toString();
}

async function assertResolvedUrlIsPublic(url: string, errorCode: string, options?: { allowUnsafe?: boolean }) {
	if (options?.allowUnsafe) return;
	const parsed = parseUrl(url);
	if (!parsed) throw new Error(errorCode);
	if (await hostnameResolvesToPrivateAddress(parsed.hostname)) throw new Error(errorCode);
}

export function resolveAiBaseUrl(input: ResolveAiBaseUrlInput) {
	const baseURL = input.baseURL?.trim() || AI_PROVIDER_DEFAULT_BASE_URLS[input.provider];
	if (!baseURL) throw new Error("INVALID_AI_BASE_URL");

	return assertSafeUrl(baseURL, "INVALID_AI_BASE_URL", { allowUnsafe: env.FLAG_ALLOW_UNSAFE_AI_BASE_URL });
}

const SSRF_REDIRECT_LIMIT = 5;

/**
 * A fetch wrapper for user-configured AI endpoints. Follows redirects manually so
 * every hop (not just the configured base URL) is re-checked against the SSRF
 * policy — both the URL literal and what the hostname currently resolves to.
 *
 * Redirects are followed per fetch semantics (303 -> GET, others keep method);
 * request bodies are dropped on method changes since AI SDK requests carry
 * JSON payloads, not streams that can be replayed across hops.
 */
export function createSsrfGuardedFetch(options?: { allowUnsafe?: boolean }) {
	const allowUnsafe = options?.allowUnsafe ?? env.FLAG_ALLOW_UNSAFE_AI_BASE_URL;

	return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const initialUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		let url = assertSafeUrl(initialUrl, "INVALID_AI_BASE_URL", { allowUnsafe });
		await assertResolvedUrlIsPublic(url, "INVALID_AI_BASE_URL", { allowUnsafe });

		// Body is carried separately: spreading `init` wholesale would resurrect it on
		// method-changing redirects, where fetch() rejects a GET that still has a body.
		const { body: initBody, ...initRest } = init ?? {};
		let method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
		const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined);
		let body = initBody ?? (input instanceof Request ? input.body : undefined);

		for (let hop = 0; hop <= SSRF_REDIRECT_LIMIT; hop++) {
			const response = await globalThis.fetch(url, {
				...initRest,
				method,
				redirect: "manual",
				...(headers !== undefined ? { headers } : {}),
				...(method === "GET" || method === "HEAD" ? {} : { body: body ?? null }),
			});

			const status = response.status;
			const location = response.headers.get("location");
			if (![301, 302, 303, 307, 308].includes(status) || !location) return response;

			if (hop === SSRF_REDIRECT_LIMIT) throw new Error("TOO_MANY_AI_REDIRECTS");

			// Relative Location headers resolve against the current URL, per fetch spec.
			const nextUrl = new URL(location, url).toString();
			url = assertSafeUrl(nextUrl, "INVALID_AI_REDIRECT_URL", { allowUnsafe });
			await assertResolvedUrlIsPublic(url, "INVALID_AI_REDIRECT_URL", { allowUnsafe });

			if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
				method = "GET";
				body = undefined;
			}
		}

		throw new Error("TOO_MANY_AI_REDIRECTS");
	};
}
