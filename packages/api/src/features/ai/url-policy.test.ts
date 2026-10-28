import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
	FLAG_ALLOW_UNSAFE_AI_BASE_URL: false,
}));

vi.mock("@reactive-resume/env/server", () => ({ env: envMock }));

// DNS stays hermetic in unit tests: only the literal hostnames below "resolve" to a
// private address; everything else is treated as public without touching the network.
vi.mock("@reactive-resume/utils/url-security.node", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@reactive-resume/utils/url-security.node")>();
	return {
		...actual,
		hostnameResolvesToPrivateAddress: async (hostname: string) => hostname === "rebinds-private.example",
	};
});

const { createSsrfGuardedFetch, resolveAiBaseUrl } = await import("./url-policy");

function jsonResponse(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), { status, headers });
}

describe("AI provider base URL policy", () => {
	it("allows public HTTPS provider URLs", () => {
		envMock.FLAG_ALLOW_UNSAFE_AI_BASE_URL = false;

		expect(resolveAiBaseUrl({ provider: "openai", baseURL: "https://api.openai.com/v1" })).toBe(
			"https://api.openai.com/v1",
		);
	});

	it("blocks private and non-HTTPS provider URLs by default", () => {
		envMock.FLAG_ALLOW_UNSAFE_AI_BASE_URL = false;

		expect(() => resolveAiBaseUrl({ provider: "openai-compatible", baseURL: "https://localhost:11434/v1" })).toThrow(
			"INVALID_AI_BASE_URL",
		);
		expect(() => resolveAiBaseUrl({ provider: "openai-compatible", baseURL: "http://example.com/v1" })).toThrow(
			"INVALID_AI_BASE_URL",
		);
	});

	it("allows private and non-HTTPS provider URLs when explicitly enabled", () => {
		envMock.FLAG_ALLOW_UNSAFE_AI_BASE_URL = true;

		expect(resolveAiBaseUrl({ provider: "openai-compatible", baseURL: "http://localhost:11434/v1" })).toBe(
			"http://localhost:11434/v1",
		);
		expect(resolveAiBaseUrl({ provider: "openai-compatible", baseURL: "https://10.0.0.5/v1" })).toBe(
			"https://10.0.0.5/v1",
		);
	});

	it("rejects non-HTTP schemes even when unsafe provider URLs are enabled", () => {
		envMock.FLAG_ALLOW_UNSAFE_AI_BASE_URL = true;

		expect(() => resolveAiBaseUrl({ provider: "openai-compatible", baseURL: "file:///etc/passwd" })).toThrow(
			"INVALID_AI_BASE_URL",
		);
		expect(() => resolveAiBaseUrl({ provider: "openai-compatible", baseURL: "ftp://example.com/v1" })).toThrow(
			"INVALID_AI_BASE_URL",
		);
	});
});

describe("SSRF-guarded fetch", () => {
	it("passes non-redirecting requests through unchanged", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: false });
		const response = await guarded("https://api.example.com/v1/chat", { method: "POST", body: "{}" });

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
			"https://api.example.com/v1/chat",
			expect.objectContaining({ method: "POST", redirect: "manual" }),
		);
		vi.unstubAllGlobals();
	});

	it("follows safe redirects (including relative locations) and re-checks each hop", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 302, { location: "/v2/chat" }))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: false });
		const response = await guarded("https://api.example.com/v1/chat", { method: "POST", body: "{}" });

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://api.example.com/v2/chat",
			expect.objectContaining({ redirect: "manual" }),
		);
		vi.unstubAllGlobals();
	});

	it("blocks redirects to loopback and private addresses", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 302, { location: "https://127.0.0.1/admin" }))
			.mockResolvedValueOnce(jsonResponse({}, 302, { location: "https://192.168.1.10/metadata" }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: false });

		await expect(guarded("https://api.example.com/v1/chat")).rejects.toThrow("INVALID_AI_REDIRECT_URL");
		await expect(guarded("https://api.example.com/v1/chat")).rejects.toThrow("INVALID_AI_REDIRECT_URL");
		vi.unstubAllGlobals();
	});

	it("blocks hostnames whose DNS records resolve to a private address", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 302, { location: "https://rebinds-private.example/" }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: false });

		await expect(guarded("https://api.example.com/v1/chat")).rejects.toThrow("INVALID_AI_REDIRECT_URL");
		vi.unstubAllGlobals();
	});

	it("drops the request body when a redirect switches the method to GET", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 303, { location: "/v2/chat" }))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: false });
		await guarded("https://api.example.com/v1/chat", { method: "POST", body: '{"q":1}' });

		const secondCall = fetchMock.mock.calls[1]?.[1] as RequestInit;
		expect(secondCall.method).toBe("GET");
		expect(secondCall.body).toBeUndefined();
		vi.unstubAllGlobals();
	});

	it("gives up after too many redirects", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({}, 302, { location: "/loop" }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: false });

		await expect(guarded("https://api.example.com/v1/chat")).rejects.toThrow("TOO_MANY_AI_REDIRECTS");
		vi.unstubAllGlobals();
	});

	it("allows private redirects when unsafe mode is explicitly enabled", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({}, 302, { location: "http://127.0.0.1:11434/v1" }))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);

		const guarded = createSsrfGuardedFetch({ allowUnsafe: true });
		const response = await guarded("http://internal.example/v1/chat", { method: "POST", body: "{}" });

		expect(response.status).toBe(200);
		vi.unstubAllGlobals();
	});
});
