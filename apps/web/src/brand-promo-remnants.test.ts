import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the product display surfaces against upstream (Reactive Resume) promo
 * remnants: author links, donation/sponsorship entries, community links, and the
 * upstream brand name in user-visible source.
 *
 * Scope is deliberately the display surfaces listed in AGENTS.md 产品展示与品牌规范 —
 * this is not a repo-wide zero-match goal. Package names, import-format compat
 * labels (see the allowlist), LICENSE attribution, and git history are exempt.
 */

// Vitest runs this project with cwd = apps/web; resolve the repo root from there.
const REPO_ROOT = path.resolve(process.cwd(), "../..");

const SCAN_DIRS = [
	"apps/web/src",
	"apps/server/src/static",
	"packages/email/src",
	"packages/ui/src",
	"packages/mcp/src",
];

const ALLOWLISTED_FILES = new Set([
	// Import-format compatibility notes: the JSON formats themselves keep upstream
	// identifiers, and detection must not be renamed away.
	"apps/web/src/dialogs/resume/import.utils.ts",
]);

const PROMO_PATTERNS: Array<[RegExp, string]> = [
	[/rxresu\.me/i, "upstream site link"],
	[/amruthpillai/i, "author promotion"],
	[/opencollective\.com|github\.com\/sponsors|funding\.json/i, "donation or sponsorship entry"],
	[/crowdin\.com/i, "translation-drive link"],
	[/KingOKings|aSyA5ZSxpb|reddit\.com\/r\/reactiveresume|linkedin\.com\/in\//i, "social promotion"],
	[/Reactive Resume/, "upstream brand name"],
];

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			yield* walk(full);
			continue;
		}
		if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) yield full;
	}
}

describe("brand promo remnants in display surfaces", () => {
	it("keeps upstream promotion out of user-facing source", () => {
		const violations: string[] = [];

		for (const dir of SCAN_DIRS) {
			const absDir = path.join(REPO_ROOT, dir);
			for (const file of walk(absDir)) {
				const rel = path.relative(REPO_ROOT, file).replaceAll("\\", "/");
				if (ALLOWLISTED_FILES.has(rel)) continue;

				const content = readFileSync(file, "utf8");
				for (const [pattern, reason] of PROMO_PATTERNS) {
					if (pattern.test(content)) violations.push(`${rel}: ${reason} (${pattern.source})`);
				}
			}
		}

		expect(violations, violations.join("\n")).toEqual([]);
	});
});
