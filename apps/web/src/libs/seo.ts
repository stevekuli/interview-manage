import { APP_DESCRIPTION, APP_NAME } from "@reactive-resume/utils/brand";

type JsonLd = Record<string, unknown>;

/**
 * Canonical root URL for the current origin. There is no hardcoded production
 * host: when no origin is available (e.g. non-browser test environments) the
 * canonical link is dropped by the callers instead of pointing at some domain.
 */
export const getCanonicalRootUrl = (origin?: string): string | undefined => {
	if (!origin) return undefined;

	const url = new URL(origin);
	url.pathname = "/";
	url.search = "";
	url.hash = "";

	return url.toString();
};

export const createNoindexFollowMeta = () => ({ name: "robots", content: "noindex, follow" });

type ResumeSocialMetaOptions = {
	canonicalUrl: string;
	title: string;
	description: string;
	imageUrl: string;
};

export const createResumeSocialMeta = ({ canonicalUrl, title, description, imageUrl }: ResumeSocialMetaOptions) => [
	{ property: "og:type", content: "profile" },
	{ property: "og:title", content: title },
	{ property: "og:description", content: description },
	{ property: "og:url", content: canonicalUrl },
	{ property: "og:image", content: imageUrl },
	// X only reads these as `name`, not `property`
	{ name: "twitter:card", content: "summary_large_image" },
	{ name: "twitter:url", content: canonicalUrl },
	{ name: "twitter:title", content: title },
	{ name: "twitter:description", content: description },
	{ name: "twitter:image", content: imageUrl },
];

const serializeJsonLdForScript = (data: JsonLd) =>
	JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) => {
		switch (character) {
			case "<":
				return "\\u003C";
			case ">":
				return "\\u003E";
			case "&":
				return "\\u0026";
			case "\u2028":
				return "\\u2028";
			case "\u2029":
				return "\\u2029";
			default:
				return character;
		}
	});

const createStructuredDataScript = (id: string, data: JsonLd) => ({
	id,
	type: "application/ld+json",
	children: serializeJsonLdForScript(data),
});

export const getRootStructuredData = (canonicalUrl: string): JsonLd[] => [
	{
		"@type": "WebSite",
		name: APP_NAME,
		url: canonicalUrl,
	},
	{
		"@type": ["SoftwareApplication", "WebApplication"],
		name: APP_NAME,
		url: canonicalUrl,
		description: APP_DESCRIPTION,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		isAccessibleForFree: true,
	},
	{
		"@type": "FAQPage",
		mainEntity: homeFaqJsonLdItems.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	},
];

export const createRootStructuredDataScript = (canonicalUrl: string) =>
	createStructuredDataScript("root-structured-data", {
		"@context": "https://schema.org",
		"@graph": getRootStructuredData(canonicalUrl),
	});

const homeFaqJsonLdItems = [
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
