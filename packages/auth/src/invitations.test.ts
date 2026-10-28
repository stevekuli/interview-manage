import { describe, expect, it } from "vitest";
import { generateInvitationCode, INVITATION_CODE_PATTERN } from "./invitations";

describe("invitation codes", () => {
	it("generates codes in the XXXX-XXXX shape from the unambiguous alphabet", () => {
		for (let i = 0; i < 50; i++) {
			const code = generateInvitationCode();
			expect(code).toMatch(INVITATION_CODE_PATTERN);
			// No confusable characters (0/O/1/I/L) survive the alphabet restriction.
			expect(code).not.toMatch(/[01ILO]/);
		}
	});

	it("generates unique codes across a realistic batch", () => {
		const codes = new Set(Array.from({ length: 200 }, () => generateInvitationCode()));
		expect(codes.size).toBe(200);
	});

	it("rejects malformed codes in the pattern before any database round-trip", () => {
		for (const bad of ["", "abcd", "abcd-efghi", "ABCD EFGH", "ab1d-efgh", "ABC1-EFG0", "ABC-D EFG", "abcd-efg"]) {
			expect(INVITATION_CODE_PATTERN.test(bad.trim().toUpperCase())).toBe(false);
		}
	});
});
