import { env } from "@reactive-resume/env/server";
import { APP_NAME } from "@reactive-resume/utils/brand";

type StaticSeoOptions = {
	head?: boolean;
};

function appUrl() {
	return env.APP_URL.replace(/\/+$/, "");
}

function textResponse(body: string, options: StaticSeoOptions = {}) {
	return new Response(options.head ? null : body, {
		headers: { "Content-Type": "text/plain; charset=UTF-8" },
	});
}

export function handleRobots(options?: StaticSeoOptions) {
	const baseUrl = appUrl();
	const body = [
		"User-agent: *",
		"Allow: /",
		"Disallow: /api/rpc",
		"Disallow: /api/auth",
		"Disallow: /mcp",
		"Disallow: /.well-known",
		"",
		`Sitemap: ${baseUrl}/sitemap.xml`,
		"",
	].join("\n");

	return textResponse(body, options);
}

export function handleSitemap(options?: StaticSeoOptions) {
	const baseUrl = appUrl();
	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		"  <url>",
		`    <loc>${baseUrl}/</loc>`,
		"  </url>",
		"  <url>",
		`    <loc>${baseUrl}/ats-checker</loc>`,
		"  </url>",
		"</urlset>",
		"",
	].join("\n");

	return new Response(options?.head ? null : body, {
		headers: { "Content-Type": "application/xml; charset=UTF-8" },
	});
}

export function handleLlms(options?: StaticSeoOptions) {
	const baseUrl = appUrl();
	const body = [
		`# ${APP_NAME}`,
		"",
		`${APP_NAME} is a job-search workspace for tracking applications, editing resumes, and exporting them as PDF or DOCX.`,
		"",
		"## Links",
		"",
		`- Product: ${baseUrl}`,
		`- Resume schema: ${baseUrl}/schema.json`,
		`- OpenAPI specification: ${baseUrl}/api/openapi/spec.json`,
		"",
	].join("\n");

	return textResponse(body, options);
}
