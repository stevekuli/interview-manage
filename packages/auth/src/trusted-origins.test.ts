import { describe, expect, it } from "vitest";
import { getTrustedOrigins } from "./trusted-origins";

describe("getTrustedOrigins", () => {
	it("trusts the localhost alias for a 127.0.0.1 app URL on the same port", () => {
		expect(getTrustedOrigins("http://127.0.0.1:3100")).toEqual(
			expect.arrayContaining(["http://127.0.0.1:3100", "http://localhost:3100"]),
		);
	});

	it("trusts the 127.0.0.1 alias for a localhost app URL on the same port", () => {
		expect(getTrustedOrigins("http://localhost:3100")).toEqual(
			expect.arrayContaining(["http://localhost:3100", "http://127.0.0.1:3100"]),
		);
	});

	it("does not add a loopback alias for non-localhost app URLs", () => {
		expect(getTrustedOrigins("https://example.com")).not.toContain("https://localhost");
	});

	it("trusts comma-separated extra origins from an env-style string", () => {
		expect(getTrustedOrigins("https://example.com", " http://8.148.199.165:3012 , https://alt.example/ ")).toEqual(
			expect.arrayContaining(["https://example.com", "http://8.148.199.165:3012", "https://alt.example"]),
		);
	});

	it("trusts extra origins passed as an array", () => {
		expect(getTrustedOrigins("https://example.com", ["http://legacy.example:3012"])).toContain(
			"http://legacy.example:3012",
		);
	});

	it("ignores malformed or non-http(s) extra origins", () => {
		const origins = getTrustedOrigins("https://example.com", "not-a-url, ftp://example.com, ,javascript:alert(1)");
		expect(origins).toEqual(
			expect.arrayContaining(["https://example.com", "http://localhost:3000", "http://127.0.0.1:3000"]),
		);
		expect(origins).toHaveLength(3);
	});
});
