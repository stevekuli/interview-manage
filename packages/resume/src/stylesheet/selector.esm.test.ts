import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("semantic selector native ESM compatibility", () => {
	it("loads the selector module through Node and tsx", () => {
		const entry = new URL("./selector.ts", import.meta.url).href;
		const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));
		// On Windows `pnpm` resolves to pnpm.cmd, which Node only spawns through a shell;
		// the shell then mangles the quoted -e argument, so the script travels via stdin.
		const result = spawnSync("pnpm", ["exec", "tsx"], {
			cwd: packageRoot,
			encoding: "utf8",
			shell: process.platform === "win32",
			input: `import(${JSON.stringify(entry)})\n`,
		});

		expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
	});
});
