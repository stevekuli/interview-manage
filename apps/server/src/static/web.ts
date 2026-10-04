import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "@reactive-resume/env/server";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@reactive-resume/utils/brand";

function resolveWebDistPath() {
	const candidates = [
		// Source layout: apps/server/src/static/web.ts -> apps/web/dist
		fileURLToPath(new URL("../../../web/dist", import.meta.url)),
		// Bundled layout: apps/server/dist/index.mjs -> apps/web/dist
		fileURLToPath(new URL("../../web/dist", import.meta.url)),
	];
	const [fallback] = candidates;
	if (!fallback) throw new Error("Could not resolve web dist path");

	return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

const staticRoot = resolveWebDistPath();
const indexHtmlPath = `${staticRoot}/index.html`;
const noindexShellPrefixes = ["/auth", "/dashboard", "/builder", "/agent", "/templates"];
/**
 * Marketing pages the SPA owns that search engines should index.
 *
 * Without an entry here the fallback below returns 404 for the path in production — the dev Vite
 * server serves the shell for anything, so this failure only ever shows up once deployed.
 */
const indexableAppPaths = new Set(["/ats-checker"]);
const reservedPublicResumeSegments = new Set([
	"api",
	"mcp",
	".well-known",
	"uploads",
	"auth",
	"dashboard",
	"builder",
	"agent",
	"templates",
	"ats-checker",
]);

function isAssetPath(pathname: string): boolean {
	return pathname.split("/").pop()?.includes(".") ?? false;
}

function getPathSegments(pathname: string) {
	return pathname.split("/").filter(Boolean);
}

function isNoindexShellPath(pathname: string): boolean {
	return noindexShellPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicResumePath(pathname: string): boolean {
	const segments = getPathSegments(pathname);
	const [firstSegment] = segments;

	return segments.length === 2 && firstSegment !== undefined && !reservedPublicResumeSegments.has(firstSegment);
}

const BASE_SECURITY_HEADERS = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Content-Security-Policy-Report-Only":
		"default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

const ROOT_TITLE = `${APP_NAME} — ${APP_TAGLINE}`;
// Keep under ~120 characters so Google's mobile SERP snippet is not truncated at 3 lines.
const ROOT_DESCRIPTION = APP_DESCRIPTION;
const ROOT_FAQ_ITEMS = [
	{
		question: "这个服务是做什么的？",
		answer: "把求职岗位、简历和投递进度放在一起管理：录入岗位、编辑简历、导出 PDF 和 Word，并跟踪每次投递的状态。",
	},
	{
		question: "AI 功能如何处理我的数据？",
		answer:
			"AI 辅助仅在你配置了自己的模型服务后可用。使用时，相关简历与岗位文本会发送给你所配置的模型服务商；未配置时所有功能都可以手动完成。",
	},
	{
		question: "我的简历和投递记录存在哪里？",
		answer: "存储在本服务的数据库中。你可以在应用内随时删除某份简历、某条投递记录，或在账户设置中删除整个账户。",
	},
	{
		question: "可以导出简历吗？",
		answer: "可以。编辑器支持将简历导出为 PDF 和 Word（DOCX）文件。",
	},
] as const;

function createRootSeoMarkup(canonicalUrl: string) {
	const origin = new URL(canonicalUrl).origin;
	const imageUrl = `${origin}/opengraph/banner.jpg`;
	const structuredData = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				name: APP_NAME,
				url: canonicalUrl,
			},
			{
				"@type": ["SoftwareApplication", "WebApplication"],
				name: APP_NAME,
				url: canonicalUrl,
				description: ROOT_DESCRIPTION,
				applicationCategory: "BusinessApplication",
				operatingSystem: "Web",
				isAccessibleForFree: true,
			},
			{
				"@type": "FAQPage",
				mainEntity: ROOT_FAQ_ITEMS.map((item) => ({
					"@type": "Question",
					name: item.question,
					acceptedAnswer: {
						"@type": "Answer",
						text: item.answer,
					},
				})),
			},
		],
	};

	return `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="website">
		<meta property="og:site_name" content="${APP_NAME}">
		<meta property="og:title" content="${ROOT_TITLE}">
		<meta property="og:description" content="${ROOT_DESCRIPTION}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${ROOT_TITLE}">
		<meta name="twitter:description" content="${ROOT_DESCRIPTION}">
		<meta name="twitter:image" content="${imageUrl}">
		<script id="root-structured-data" type="application/ld+json">${JSON.stringify(structuredData)}</script>
	`;
}

const ATS_CHECKER_TITLE = `ATS Checker - ${APP_NAME}`;
// Keep under ~120 characters so Google's mobile SERP snippet is not truncated at 3 lines.
const ATS_CHECKER_DESCRIPTION =
	"Check whether software can read your resume PDF. Runs entirely in your browser, so your file is never uploaded.";

function createAtsCheckerSeoMarkup(origin: string) {
	const canonicalUrl = `${origin}/ats-checker`;
	const imageUrl = `${origin}/opengraph/ats-checker.png`;
	const structuredData = {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: "ATS Checker",
		url: canonicalUrl,
		description: ATS_CHECKER_DESCRIPTION,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		isAccessibleForFree: true,
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		isPartOf: { "@type": "WebSite", name: APP_NAME, url: `${origin}/` },
	};

	return `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="website">
		<meta property="og:site_name" content="${APP_NAME}">
		<meta property="og:title" content="${ATS_CHECKER_TITLE}">
		<meta property="og:description" content="${ATS_CHECKER_DESCRIPTION}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${ATS_CHECKER_TITLE}">
		<meta name="twitter:description" content="${ATS_CHECKER_DESCRIPTION}">
		<meta name="twitter:image" content="${imageUrl}">
		<script id="ats-checker-structured-data" type="application/ld+json">${JSON.stringify(structuredData)}</script>
	`;
}

// Resume names, headlines, and summaries are user-authored, so they must never reach the served
// HTML unescaped.
const escapeAttribute = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

async function createPublicResumeSeoMarkup(pathname: string, origin: string) {
	const [username, slug] = getPathSegments(pathname);
	if (!username || !slug) return null;

	// A card render must never take down the page: any lookup failure falls back to the plain shell.
	const meta = await import("@reactive-resume/api/features/resume/social-meta")
		.then((module) => module.getPublicResumeSocialMeta({ username, slug }))
		.catch(() => null);
	if (!meta) return null;

	const canonicalUrl = `${origin}/${username}/${slug}`;
	const imageUrl = `${origin}/opengraph/banner.jpg`;
	const pageTitle = escapeAttribute(`${meta.name} - ${APP_NAME}`);
	const title = escapeAttribute(meta.title);
	const description = escapeAttribute(meta.description);

	return {
		pageTitle,
		description,
		markup: `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="profile">
		<meta property="og:site_name" content="${APP_NAME}">
		<meta property="og:title" content="${title}">
		<meta property="og:description" content="${description}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${title}">
		<meta name="twitter:description" content="${description}">
		<meta name="twitter:image" content="${imageUrl}">
	`,
	};
}

export const serveWebDistStatic = serveStatic({
	root: staticRoot,
});

function getFallbackResponseHeaders(pathname: string) {
	if (pathname === "/" && env.ROOT_RESUME_ID?.trim()) {
		return {
			"Content-Type": "text/html; charset=UTF-8",
			"X-Robots-Tag": "noindex, follow",
			"Cache-Control": "private, no-store",
			...BASE_SECURITY_HEADERS,
		};
	}
	if (pathname === "/" || indexableAppPaths.has(pathname)) {
		return { "Content-Type": "text/html; charset=UTF-8", ...BASE_SECURITY_HEADERS };
	}
	if (isNoindexShellPath(pathname) || isPublicResumePath(pathname)) {
		return {
			"Content-Type": "text/html; charset=UTF-8",
			"X-Robots-Tag": "noindex, follow",
			...BASE_SECURITY_HEADERS,
		};
	}

	return null;
}

function notFoundResponse(options: { head?: boolean; noindex?: boolean } = {}) {
	const headers = new Headers({ "Content-Type": "text/plain; charset=UTF-8" });
	if (options.noindex) headers.set("X-Robots-Tag", "noindex, nofollow");

	return new Response(options.head ? null : "Not Found", {
		status: 404,
		headers,
	});
}

// ponytail: GET and HEAD share the same routing logic; method determines body presence
export async function handleWebApp(request: Request) {
	const isHead = request.method === "HEAD";
	const pathname = new URL(request.url).pathname;

	if (!isNoindexShellPath(pathname) && isAssetPath(pathname)) {
		return new Response(isHead ? null : "Not Found", { status: 404 });
	}

	const headers = getFallbackResponseHeaders(pathname);
	if (!headers) return notFoundResponse({ head: isHead, noindex: true });

	if (isHead) return new Response(null, { status: 200, headers });

	const html = await fs.readFile(indexHtmlPath, "utf-8");
	const canonicalUrl = new URL("/", env.APP_URL).toString();

	if (pathname === "/" && env.ROOT_RESUME_ID?.trim()) {
		// Root configuration never discloses a target in the HTML shell. The public API
		// gates data and browser metadata; shell requests must not count extra views.
		const shell = html
			.replace(/<title>[^<]*<\/title>/, `<title>${APP_NAME}</title>`)
			.replace(/<meta\s+name="description"[^>]*>/, '<meta name="description" content="">');
		const markup = `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" data-root-resume-shell><meta name="robots" content="noindex, follow" data-root-resume-shell>`;
		return new Response(shell.replace("</head>", `${markup}</head>`), { headers });
	}

	if (pathname === "/") {
		return new Response(html.replace("</head>", `${createRootSeoMarkup(canonicalUrl)}</head>`), { headers });
	}

	if (pathname === "/ats-checker") {
		const origin = new URL(env.APP_URL).origin;
		const withTitle = html
			.replace(/<title>[^<]*<\/title>/, `<title>${ATS_CHECKER_TITLE}</title>`)
			.replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${ATS_CHECKER_DESCRIPTION}">`);

		return new Response(withTitle.replace("</head>", `${createAtsCheckerSeoMarkup(origin)}</head>`), { headers });
	}

	if (isPublicResumePath(pathname)) {
		const resumeSeo = await createPublicResumeSeoMarkup(pathname, new URL(env.APP_URL).origin);
		if (resumeSeo) {
			// The shell's generic title/description are replaced so shares and previews show the resume,
			// not the marketing copy baked into index.html.
			const withTitle = html
				.replace(/<title>[^<]*<\/title>/, `<title>${resumeSeo.pageTitle}</title>`)
				.replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${resumeSeo.description}">`);

			return new Response(withTitle.replace("</head>", `${resumeSeo.markup}</head>`), { headers });
		}
	}

	return new Response(html, { headers });
}
