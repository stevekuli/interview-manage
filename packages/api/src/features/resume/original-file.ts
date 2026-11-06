import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { protectedProcedure } from "../../context";
import { ORIGINAL_FILE_MEDIA_TYPES } from "../../dto/resume";
import { pdfExportRateLimit } from "../../middleware/rate-limit";
import { getStorageService } from "../storage/service";
import { createResumeOriginalFileDownloadUrl } from "./pdf-download-url";
import { resumeService } from "./service";

type OriginalFileMediaType = (typeof ORIGINAL_FILE_MEDIA_TYPES)[number];

// Same ceiling as storage.uploadFile and application document attachments.
export const MAX_ORIGINAL_FILE_BYTES = 10 * 1024 * 1024;

// The bytes live under a prefix the public /api/uploads handler rejects (isPrivateUploadPath in
// apps/server), so originals are only reachable through the signed download route.
export function buildOriginalFileStorageKey(userId: string, resumeId: string): string {
	return `uploads/${userId}/originals/${resumeId}`;
}

/**
 * sha256 over the JSON serialization of resume.data as read back from Postgres. Both sides of the
 * "unchanged since import" comparison hash the jsonb-normalized value this way, so key ordering is
 * decided by Postgres rather than by whichever client produced the object.
 */
export function hashResumeData(data: unknown): string {
	return createHash("sha256").update(JSON.stringify(data), "utf8").digest("hex");
}

type SaveResumeOriginalFileInput = {
	userId: string;
	resumeId: string;
	filename: string;
	mediaType: string;
	dataBase64: string;
};

export async function saveResumeOriginalFile(input: SaveResumeOriginalFileInput): Promise<void> {
	if (!ORIGINAL_FILE_MEDIA_TYPES.includes(input.mediaType as OriginalFileMediaType)) {
		throw new ORPCError("BAD_REQUEST", { message: "Unsupported original file type." });
	}

	const bytes = Buffer.from(input.dataBase64, "base64");
	if (bytes.byteLength === 0) throw new ORPCError("BAD_REQUEST", { message: "Original file is empty." });
	if (bytes.byteLength > MAX_ORIGINAL_FILE_BYTES) {
		throw new ORPCError("BAD_REQUEST", { message: "Original file is larger than 10MB." });
	}

	// Also asserts the resume belongs to the caller. The baseline hash must come from the database
	// (jsonb-normalized) so a later comparison against the live row is deterministic regardless of
	// the client's key ordering.
	const resume = await resumeService.getById({ id: input.resumeId, userId: input.userId });
	const storageKey = buildOriginalFileStorageKey(input.userId, input.resumeId);
	const storageService = getStorageService();

	await storageService.write({
		key: storageKey,
		data: new Uint8Array(bytes),
		contentType: input.mediaType,
	});

	try {
		await db.insert(schema.resumeOriginalFile).values({
			resumeId: input.resumeId,
			userId: input.userId,
			storageKey,
			filename: input.filename,
			mediaType: input.mediaType,
			size: bytes.byteLength,
			dataHash: hashResumeData(resume.data),
		});
	} catch (error) {
		// Don't leave an orphaned blob behind when the metadata row failed.
		await storageService.delete(storageKey).catch(() => undefined);
		throw error;
	}
}

export async function copyResumeOriginalFile(input: {
	userId: string;
	sourceResumeId: string;
	targetResumeId: string;
}): Promise<void> {
	const [artifact] = await db
		.select()
		.from(schema.resumeOriginalFile)
		.where(
			and(
				eq(schema.resumeOriginalFile.resumeId, input.sourceResumeId),
				eq(schema.resumeOriginalFile.userId, input.userId),
			),
		);

	if (!artifact) return;

	const source = await getStorageService().read(artifact.storageKey);
	// A dangling metadata row (storage already gone) just means the duplicate gets no original.
	if (!source) return;

	// Hash the duplicate's own stored data so its "unchanged" badge stands on its own.
	const duplicate = await resumeService.getById({ id: input.targetResumeId, userId: input.userId });
	const storageKey = buildOriginalFileStorageKey(input.userId, input.targetResumeId);
	const storageService = getStorageService();

	await storageService.write({ key: storageKey, data: source.data, contentType: artifact.mediaType });

	try {
		await db.insert(schema.resumeOriginalFile).values({
			resumeId: input.targetResumeId,
			userId: input.userId,
			storageKey,
			filename: artifact.filename,
			mediaType: artifact.mediaType,
			size: artifact.size,
			dataHash: hashResumeData(duplicate.data),
		});
	} catch (error) {
		await storageService.delete(storageKey).catch(() => undefined);
		throw error;
	}
}

export async function readResumeOriginalFile(input: { userId: string; resumeId: string }) {
	const [artifact] = await db
		.select()
		.from(schema.resumeOriginalFile)
		.where(
			and(eq(schema.resumeOriginalFile.resumeId, input.resumeId), eq(schema.resumeOriginalFile.userId, input.userId)),
		);

	if (!artifact) throw new ORPCError("NOT_FOUND");

	const stored = await getStorageService().read(artifact.storageKey);
	if (!stored) throw new ORPCError("NOT_FOUND");

	return {
		filename: artifact.filename,
		mediaType: artifact.mediaType,
		size: artifact.size,
		data: stored.data,
	};
}

async function getOwnedArtifact(userId: string, resumeId: string) {
	// resumeService.getById asserts ownership and returns the live row needed for the data hash.
	const resume = await resumeService.getById({ id: resumeId, userId });

	const [artifact] = await db
		.select()
		.from(schema.resumeOriginalFile)
		.where(eq(schema.resumeOriginalFile.resumeId, resume.id));

	return { artifact: artifact ?? null, resume };
}

const originalFileOutputSchema = z.object({
	filename: z.string(),
	mediaType: z.string(),
	size: z.number().int(),
	createdAt: z.date(),
	unchanged: z.boolean(),
});

export const originalFileRouter = {
	/**
	 * Metadata for the resume's preserved original file, or null when the resume was imported without
	 * one (JSON/LinkedIn sources, oversized uploads, or a failed save). `unchanged` reports whether
	 * the resume data still matches what was parsed at import time.
	 */
	get: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes/{id}/original-file",
			tags: ["Resumes"],
			operationId: "getResumeOriginalFile",
			summary: "Get resume original file info",
			description:
				"Returns metadata about the original uploaded file preserved for this resume, or null if there is none. `unchanged` is true while the resume data matches the state captured at import. Requires authentication.",
			successDescription: "The original file metadata, or null when no original is preserved.",
		})
		.input(z.object({ id: z.string() }))
		.output(originalFileOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			const { artifact, resume } = await getOwnedArtifact(context.user.id, input.id);
			if (!artifact) return null;

			return {
				filename: artifact.filename,
				mediaType: artifact.mediaType,
				size: artifact.size,
				createdAt: artifact.createdAt,
				unchanged: artifact.dataHash === hashResumeData(resume.data),
			};
		}),

	/**
	 * Mints a short-lived signed URL for downloading the original file. The bytes themselves are
	 * served by GET /api/resumes/{id}/original, which authenticates through this token instead of a
	 * session (mirroring the rendered-PDF download route).
	 */
	getDownloadUrl: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes/{id}/original-file/download-url",
			tags: ["Resumes"],
			operationId: "getResumeOriginalFileDownloadUrl",
			summary: "Get a signed download URL for the resume original file",
			description:
				"Returns a short-lived signed URL for downloading the original uploaded file of this resume. Requires an original to exist. Requires authentication.",
			successDescription: "The signed URL and its expiry.",
		})
		.input(z.object({ id: z.string() }))
		.output(z.object({ url: z.string(), expiresAt: z.string() }))
		.use(pdfExportRateLimit)
		.handler(async ({ context, input }) => {
			const { artifact } = await getOwnedArtifact(context.user.id, input.id);
			if (!artifact) throw new ORPCError("NOT_FOUND", { message: "No original file preserved for this resume" });

			return createResumeOriginalFileDownloadUrl({ resumeId: input.id, userId: context.user.id });
		}),
};
