import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_MCP_SERVER_NAME, APP_NAME, APP_NAME_EN } from "@reactive-resume/utils/brand";
import { MCP_TOOL_NAME } from "./mcp-tool-names";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const INTEGRATIONS_DIR = path.join(REPO_ROOT, "tooling/integrations");

function readIntegrationText(relativePath: string): string {
	return readFileSync(path.join(INTEGRATIONS_DIR, relativePath), "utf8");
}

function readIntegrationJson<T>(relativePath: string): T {
	return JSON.parse(readIntegrationText(relativePath)) as T;
}

describe("external platform integration manifests and skills", () => {
	const publishedTools = new Set<string>(Object.values(MCP_TOOL_NAME));

	it("keeps WorkBuddy connector-meta.json synced with brand and MCP server identity", () => {
		const meta = readIntegrationJson<{
			id: string;
			name: string;
			name_en: string;
			description: string;
			mcp: { transport: string; url: string; server_card_url: string };
			authentication: { required: boolean; schemes: string[] };
			skills: string[];
		}>("workbuddy/connector-meta.json");

		expect(meta.id).toBe(APP_MCP_SERVER_NAME);
		expect(meta.name).toBe(APP_NAME);
		expect(meta.name_en).toBe(APP_NAME_EN);
		expect(meta.description).toBe(APP_DESCRIPTION);
		expect(meta.mcp.transport).toBe("streamable-http");
		expect(meta.mcp.url).toBe("https://interview.unlimit.ltd/mcp");
		expect(meta.mcp.server_card_url).toBe("https://interview.unlimit.ltd/.well-known/mcp/server-card.json");
		expect(meta.authentication.required).toBe(true);
		expect(meta.skills).toEqual(["./skills/career-assistant/SKILL.md"]);
	});

	it("keeps OpenAI / Codex plugin.json synced with brand and MCP server endpoints", () => {
		const plugin = readIntegrationJson<{
			name_for_human: string;
			name_for_model: string;
			description_for_human: string;
			api: { type: string; url: string };
			mcp: { transport: string; url: string; server_card_url: string };
		}>("openai-plugin/plugin.json");

		expect(plugin.name_for_human).toBe(APP_NAME);
		expect(plugin.name_for_model).toBe("interview_manage");
		expect(plugin.description_for_human).toBe(APP_DESCRIPTION);
		expect(plugin.api).toEqual({
			type: "openapi",
			url: "https://interview.unlimit.ltd/api/openapi/spec.json",
		});
		expect(plugin.mcp).toEqual({
			transport: "streamable-http",
			url: "https://interview.unlimit.ltd/mcp",
			server_card_url: "https://interview.unlimit.ltd/.well-known/mcp/server-card.json",
		});
	});

	it.each(["workbuddy/mcp.json", "openai-plugin/mcp.json"])(
		"uses environment variable placeholders rather than plaintext keys in %s",
		(relPath) => {
			const mcpConfig = readIntegrationJson<{
				mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }>;
			}>(relPath);
			const serverEntry = mcpConfig.mcpServers[APP_MCP_SERVER_NAME];

			expect(serverEntry).toBeDefined();
			expect(serverEntry?.type).toBe("streamable-http");
			expect(serverEntry?.url).toBe("https://interview.unlimit.ltd/mcp");
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal MCP client env placeholder
			expect(serverEntry?.headers["x-api-key"]).toBe("${INTERVIEW_MANAGE_API_KEY}");
		},
	);

	it("keeps WorkBuddy and OpenAI SKILL.md synchronized and only references real MCP tools", () => {
		const workbuddySkill = readIntegrationText("workbuddy/skills/career-assistant/SKILL.md");
		const openaiSkill = readIntegrationText("openai-plugin/skills/career-assistant/SKILL.md");

		expect(workbuddySkill).toBe(openaiSkill);
		expect(workbuddySkill).toContain(`display_name: ${APP_NAME}`);
		expect(workbuddySkill).toContain(`display_name_en: ${APP_NAME_EN}`);

		// Extract all backticked snake_case identifiers that look like tool names
		const nonToolSnakeCaseIdentifiers = new Set([
			"display_name",
			"display_name_en",
			"description_zh",
			"description_en",
		]);
		const referencedCandidates = [...workbuddySkill.matchAll(/`([a-z]+_[a-z0-9_]+)`/g)]
			.map((match) => match[1] as string)
			.filter((name) => !nonToolSnakeCaseIdentifiers.has(name));

		expect(referencedCandidates.length).toBeGreaterThanOrEqual(15);
		for (const toolName of referencedCandidates) {
			expect(publishedTools, `SKILL.md references unpublished MCP tool: ${toolName}`).toContain(toolName);
		}
	});

	it("contains no upstream brand remnants in any integration file", () => {
		const files = [
			"README.md",
			"workbuddy/connector-meta.json",
			"workbuddy/mcp.json",
			"workbuddy/icon.svg",
			"workbuddy/skills/career-assistant/SKILL.md",
			"openai-plugin/plugin.json",
			"openai-plugin/mcp.json",
			"openai-plugin/skills/career-assistant/SKILL.md",
		];

		for (const file of files) {
			const text = readIntegrationText(file);
			expect(text, file).not.toMatch(/reactive[- ]resume|rxresu\.me|amruthpillai/i);
		}
	});
});
