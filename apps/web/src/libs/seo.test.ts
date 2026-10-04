import { describe, expect, it } from "vitest";
import { APP_NAME } from "@reactive-resume/utils/brand";
import {
	createNoindexFollowMeta,
	createRootStructuredDataScript,
	getCanonicalRootUrl,
	getRootStructuredData,
} from "./seo";

describe("getCanonicalRootUrl", () => {
	it("returns undefined when no origin is available instead of pointing at a hardcoded host", () => {
		expect(getCanonicalRootUrl()).toBeUndefined();
	});

	it("normalizes an app origin to the root URL", () => {
		expect(getCanonicalRootUrl("http://localhost:3000")).toBe("http://localhost:3000/");
		expect(getCanonicalRootUrl("https://example.com/")).toBe("https://example.com/");
	});
});

describe("createNoindexFollowMeta", () => {
	it("returns the robots noindex metadata used by private app surfaces", () => {
		expect(createNoindexFollowMeta()).toEqual({ name: "robots", content: "noindex, follow" });
	});
});

describe("createRootStructuredDataScript", () => {
	it("serializes JSON-LD using the structured data script id", () => {
		const script = createRootStructuredDataScript("https://example.com/");

		expect(script.id).toBe("root-structured-data");
		expect(script.type).toBe("application/ld+json");
		expect(JSON.parse(script.children)).toMatchObject({ "@context": "https://schema.org" });
	});

	it("escapes script-breaking sequences in JSON-LD children", () => {
		const script = createRootStructuredDataScript("https://example.com/</script><!---->\u2028\u2029");

		expect(script.children).not.toContain("</script");
		expect(script.children).not.toContain("<!--");
		expect(script.children).not.toContain("\u2028");
		expect(script.children).not.toContain("\u2029");
		expect(script.children).toContain("\\u003C/script");
		expect(script.children).toContain("\\u003C!--");
		expect(script.children).toContain("\\u2028");
		expect(script.children).toContain("\\u2029");
	});
});

describe("getRootStructuredData", () => {
	it("describes only this service without upstream repository or promo links", () => {
		const schemas = getRootStructuredData("https://example.com/");

		expect(schemas).toHaveLength(3);
		expect(schemas[0]).toMatchObject({
			"@type": "WebSite",
			name: APP_NAME,
			url: "https://example.com/",
		});
		expect(schemas[1]).toMatchObject({
			"@type": ["SoftwareApplication", "WebApplication"],
			name: APP_NAME,
			applicationCategory: "BusinessApplication",
			operatingSystem: "Web",
		});
		expect(schemas[2]).toMatchObject({
			"@type": "FAQPage",
			mainEntity: expect.arrayContaining([
				expect.objectContaining({
					name: "这个服务是做什么的？",
				}),
			]),
		});

		const serialized = JSON.stringify(schemas);
		expect(serialized).not.toMatch(/rxresu\.me|github\.com|open-source|开源/);
	});
});
