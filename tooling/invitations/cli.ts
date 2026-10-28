// Admin CLI for the invite-only beta: mint, list and revoke one-time sign-up
// invitation codes. Run from the repo root with the server env loaded, e.g.
//
//   pnpm --filter @reactive-resume/tooling invitations -- generate --note "发给张三" --days 14
//   pnpm --filter @reactive-resume/tooling invitations -- list --all
//   pnpm --filter @reactive-resume/tooling invitations -- revoke --code AB2C-XK4M
//
// Codes are consumed at email sign-up by packages/auth (FLAG_INVITATION_ONLY).
import process from "node:process";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { generateInvitationCode } from "@reactive-resume/auth/invitations";
import { invitation } from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";

type Args = Record<string, string | boolean | undefined>;

function parseArgs(argv: string[]): { command: string; args: Args } {
	const [command, ...rest] = argv;
	const args: Args = {};
	for (let i = 0; i < rest.length; i++) {
		const token = rest[i];
		if (token?.startsWith("--")) {
			const value = rest[i + 1];
			if (value && !value.startsWith("--")) {
				args[token.slice(2)] = value;
				i++;
			} else {
				args[token.slice(2)] = true;
			}
		}
	}
	return { command: command ?? "", args };
}

function usage(): never {
	console.log(`Usage:
  generate [--note <text>] [--days <n>] [--count <n>]   Mint invitation codes (defaults: 30 days, 1 code)
  list [--all]                                         List codes (default: unused & unexpired only)
  revoke --code <XXXX-XXXX>                            Revoke a code`);
	process.exit(1);
}

async function main() {
	const { command, args } = parseArgs(process.argv.slice(2));
	if (!command) usage();

	const pool = new Pool({ connectionString: env.DATABASE_URL });
	const db = drizzle({ client: pool });

	try {
		if (command === "generate") {
			const days = Number(args.days ?? 30);
			const count = Math.min(Number(args.count ?? 1), 100);
			if (!Number.isFinite(days) || days <= 0) usage();
			const expiresAt = new Date(Date.now() + days * 86_400_000);
			const rows = Array.from({ length: count }, () => ({
				code: generateInvitationCode(),
				note: typeof args.note === "string" && args.note ? args.note : null,
				createdBy: "cli",
				expiresAt,
			}));
			const inserted = await db.insert(invitation).values(rows).returning({
				code: invitation.code,
				expiresAt: invitation.expiresAt,
			});
			for (const row of inserted) {
				console.log(`${row.code}  (expires ${row.expiresAt.toISOString().slice(0, 10)})`);
			}
			console.log(`Generated ${inserted.length} invitation code(s).`);
			return;
		}

		if (command === "list") {
			const showAll = args.all === true;
			const rows = await db.select().from(invitation).orderBy(desc(invitation.createdAt)).limit(200);
			const now = Date.now();
			const visible = showAll
				? rows
				: rows.filter((row) => !row.usedAt && !row.revokedAt && row.expiresAt.getTime() > now);
			if (visible.length === 0) {
				console.log(showAll ? "No invitations yet." : "No available invitations.");
				return;
			}
			console.log("CODE        STATUS    EXPIRES      USED BY                 NOTE");
			for (const row of visible) {
				const status = row.revokedAt
					? "revoked"
					: row.usedAt
						? "used"
						: row.expiresAt.getTime() <= now
							? "expired"
							: "unused";
				console.log(
					`${row.code.padEnd(11)} ${status.padEnd(9)} ${row.expiresAt.toISOString().slice(0, 10).padEnd(12)} ${(row.usedBy ?? "-").padEnd(23)} ${row.note ?? ""}`,
				);
			}
			return;
		}

		if (command === "revoke") {
			const code = typeof args.code === "string" ? args.code.trim().toUpperCase() : "";
			if (!code) usage();
			const rows = await db
				.update(invitation)
				.set({ revokedAt: new Date() })
				.where(eq(invitation.code, code))
				.returning({ code: invitation.code });
			if (rows.length === 0) {
				console.error(`No invitation found for code ${code}.`);
				process.exitCode = 1;
				return;
			}
			console.log(`Revoked ${code}.`);
			return;
		}

		usage();
	} finally {
		await pool.end();
	}
}

await main();
