import { randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import { invitation } from "@reactive-resume/db/schema";

// Unambiguous alphabet: no 0/O/1/I/L so codes survive being read out loud or
// retyped from a chat message.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITATION_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function generateInvitationCode(): string {
	const bytes = randomBytes(8);
	const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
	return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export type ConsumeInvitationResult = { ok: true; invitationId: string } | { ok: false; reason: "missing" | "invalid" };

/**
 * Atomically marks an invitation code as used. The single UPDATE ... WHERE
 * unused/unexpired/unrevoked makes concurrent sign-ups with the same code race-
 * free: only one caller gets a row back.
 */
export async function consumeInvitationCode(code: string): Promise<ConsumeInvitationResult> {
	const normalized = code.trim().toUpperCase();
	if (!INVITATION_CODE_PATTERN.test(normalized)) return { ok: false, reason: "invalid" };

	const rows = await db
		.update(invitation)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(invitation.code, normalized),
				isNull(invitation.usedAt),
				isNull(invitation.revokedAt),
				gt(invitation.expiresAt, new Date()),
			),
		)
		.returning({ id: invitation.id });

	return rows.length > 0 && rows[0] ? { ok: true, invitationId: rows[0].id } : { ok: false, reason: "invalid" };
}

/** Returns a consumed invitation so a failed sign-up does not burn the code. */
export async function releaseInvitation(invitationId: string): Promise<void> {
	await db.update(invitation).set({ usedAt: null }).where(eq(invitation.id, invitationId));
}

/** Same as {@link releaseInvitation} but addressed by code (used by the sign-up failure path). */
export async function releaseInvitationByCode(code: string): Promise<void> {
	const normalized = code.trim().toUpperCase();
	if (!INVITATION_CODE_PATTERN.test(normalized)) return;
	await db
		.update(invitation)
		.set({ usedAt: null, usedBy: null })
		.where(and(eq(invitation.code, normalized), isNotNull(invitation.usedAt)));
}

/** Stamps who redeemed a code once the sign-up actually succeeded. */
export async function markInvitationUsedBy(code: string, usedBy: string): Promise<void> {
	const normalized = code.trim().toUpperCase();
	if (!INVITATION_CODE_PATTERN.test(normalized)) return;
	await db.update(invitation).set({ usedBy }).where(eq(invitation.code, normalized));
}
