import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouterClient } from "@orpc/server";

const dbMock = vi.hoisted(() => ({
	select: vi.fn(),
	insert: vi.fn(),
}));
const storageMock = vi.hoisted(() => ({
	write: vi.fn(),
	read: vi.fn(),
	delete: vi.fn(),
}));
const getByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@reactive-resume/db/client", () => ({ db: dbMock }));
vi.mock("@reactive-resume/env/server", () => ({
	env: {
		APP_URL: "https://example.com/app/",
		AUTH_SECRET: "test-secret",
	},
}));
vi.mock("../storage/service", () => ({ getStorageService: () => storageMock }));
vi.mock("./service", () => ({ resumeService: { getById: getByIdMock } }));
vi.mock("../../context", async () => {
	const { os } = await vi.importActual<typeof import("@orpc/server")>("@orpc/server");
	return {
		protectedProcedure: os.$context<{
			locale: "en-US";
			reqHeaders: Headers;
			user: { id: string };
		}>(),
	};
});

const {
	buildOriginalFileStorageKey,
	copyResumeOriginalFile,
	hashResumeData,
	originalFileRouter,
	readResumeOriginalFile,
	saveResumeOriginalFile,
} = await import("./original-file");

const PDF_BASE64 = Buffer.from("original pdf bytes").toString("base64");
const RESUME_DATA = { basics: { name: "Reviewer" }, sections: {} };

/** Points the next db.select().from().where() chain at `rows`. */
function selectReturning(rows: unknown[]) {
	const where = vi.fn().mockResolvedValue(rows);
	const from = vi.fn().mockReturnValue({ where });
	dbMock.select.mockReturnValue({ from });
	return { from, where };
}

describe("hashResumeData", () => {
	it("is stable across calls and differs for different content", () => {
		expect(hashResumeData(RESUME_DATA)).toBe(hashResumeData(RESUME_DATA));
		expect(hashResumeData(RESUME_DATA)).not.toBe(hashResumeData({ ...RESUME_DATA, summary: "hello" }));
	});
});

describe("saveResumeOriginalFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getByIdMock.mockResolvedValue({ id: "resume-1", data: RESUME_DATA });
		storageMock.write.mockResolvedValue(undefined);
		storageMock.delete.mockResolvedValue(true);
		dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
	});

	it("rejects unsupported media types, empty payloads, and oversized files", async () => {
		await expect(
			saveResumeOriginalFile({
				userId: "user-1",
				resumeId: "resume-1",
				filename: "a.txt",
				mediaType: "text/plain",
				dataBase64: PDF_BASE64,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		await expect(
			saveResumeOriginalFile({
				userId: "user-1",
				resumeId: "resume-1",
				filename: "a.pdf",
				mediaType: "application/pdf",
				dataBase64: "",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		const oversized = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
		await expect(
			saveResumeOriginalFile({
				userId: "user-1",
				resumeId: "resume-1",
				filename: "a.pdf",
				mediaType: "application/pdf",
				dataBase64: oversized,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("writes the bytes under the private originals key and stores the hash from the database row", async () => {
		const values = vi.fn().mockResolvedValue(undefined);
		dbMock.insert.mockReturnValue({ values });

		await saveResumeOriginalFile({
			userId: "user-1",
			resumeId: "resume-1",
			filename: "原始简历.pdf",
			mediaType: "application/pdf",
			dataBase64: PDF_BASE64,
		});

		expect(getByIdMock).toHaveBeenCalledWith({ id: "resume-1", userId: "user-1" });
		expect(storageMock.write).toHaveBeenCalledWith({
			key: "uploads/user-1/originals/resume-1",
			data: expect.any(Uint8Array),
			contentType: "application/pdf",
		});
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "uploads/user-1/originals/resume-1",
				filename: "原始简历.pdf",
				size: Buffer.from("original pdf bytes").byteLength,
				dataHash: hashResumeData(RESUME_DATA),
			}),
		);
	});

	it("rolls the stored blob back when the metadata insert fails", async () => {
		dbMock.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("db down")) });

		await expect(
			saveResumeOriginalFile({
				userId: "user-1",
				resumeId: "resume-1",
				filename: "a.pdf",
				mediaType: "application/pdf",
				dataBase64: PDF_BASE64,
			}),
		).rejects.toThrow("db down");

		expect(storageMock.delete).toHaveBeenCalledWith("uploads/user-1/originals/resume-1");
	});
});

describe("copyResumeOriginalFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storageMock.write.mockResolvedValue(undefined);
		storageMock.read.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), size: 3 });
		dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
	});

	it("does nothing when the source resume has no preserved original", async () => {
		selectReturning([]);

		await copyResumeOriginalFile({ userId: "user-1", sourceResumeId: "resume-1", targetResumeId: "resume-2" });

		expect(storageMock.write).not.toHaveBeenCalled();
		expect(dbMock.insert).not.toHaveBeenCalled();
	});

	it("copies the bytes to the duplicate's key and hashes the duplicate's own data", async () => {
		selectReturning([
			{
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "uploads/user-1/originals/resume-1",
				filename: "a.pdf",
				mediaType: "application/pdf",
				size: 3,
				dataHash: "hash-1",
				createdAt: new Date(0),
			},
		]);
		getByIdMock.mockResolvedValue({ id: "resume-2", data: RESUME_DATA });
		const values = vi.fn().mockResolvedValue(undefined);
		dbMock.insert.mockReturnValue({ values });

		await copyResumeOriginalFile({ userId: "user-1", sourceResumeId: "resume-1", targetResumeId: "resume-2" });

		expect(storageMock.write).toHaveBeenCalledWith({
			key: "uploads/user-1/originals/resume-2",
			data: expect.any(Uint8Array),
			contentType: "application/pdf",
		});
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				resumeId: "resume-2",
				filename: "a.pdf",
				dataHash: hashResumeData(RESUME_DATA),
			}),
		);
	});
});

describe("readResumeOriginalFile", () => {
	it("throws NOT_FOUND when no artifact row exists", async () => {
		selectReturning([]);

		await expect(readResumeOriginalFile({ userId: "user-1", resumeId: "resume-1" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("returns the stored bytes with metadata", async () => {
		selectReturning([
			{
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "uploads/user-1/originals/resume-1",
				filename: "a.pdf",
				mediaType: "application/pdf",
				size: 3,
				dataHash: "hash-1",
				createdAt: new Date(0),
			},
		]);
		storageMock.read.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), size: 3 });

		const file = await readResumeOriginalFile({ userId: "user-1", resumeId: "resume-1" });

		expect(storageMock.read).toHaveBeenCalledWith("uploads/user-1/originals/resume-1");
		expect(file).toMatchObject({ filename: "a.pdf", mediaType: "application/pdf", size: 3 });
	});

	it("throws NOT_FOUND when the storage blob is gone", async () => {
		selectReturning([
			{
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "uploads/user-1/originals/resume-1",
				filename: "a.pdf",
				mediaType: "application/pdf",
				size: 3,
				dataHash: "hash-1",
				createdAt: new Date(0),
			},
		]);
		storageMock.read.mockResolvedValue(null);

		await expect(readResumeOriginalFile({ userId: "user-1", resumeId: "resume-1" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("originalFileRouter", () => {
	const client = createRouterClient(originalFileRouter, {
		context: { locale: "en-US", reqHeaders: new Headers(), user: { id: "user-1" } } as never,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		getByIdMock.mockResolvedValue({ id: "resume-1", data: RESUME_DATA });
	});

	it("returns null original info when none is preserved", async () => {
		selectReturning([]);

		await expect(client.get({ id: "resume-1" })).resolves.toBeNull();
	});

	it("reports whether the resume data still matches the import-time hash", async () => {
		selectReturning([
			{
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "k",
				filename: "a.pdf",
				mediaType: "application/pdf",
				size: 3,
				dataHash: hashResumeData(RESUME_DATA),
				createdAt: new Date(0),
			},
		]);

		await expect(client.get({ id: "resume-1" })).resolves.toMatchObject({ unchanged: true, filename: "a.pdf" });

		selectReturning([
			{
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "k",
				filename: "a.pdf",
				mediaType: "application/pdf",
				size: 3,
				dataHash: "stale-hash",
				createdAt: new Date(0),
			},
		]);

		await expect(client.get({ id: "resume-1" })).resolves.toMatchObject({ unchanged: false });
	});

	it("refuses to mint a download URL when no original exists", async () => {
		selectReturning([]);

		const error = await client.getDownloadUrl({ id: "resume-1" }).catch((caught: unknown) => caught);
		expect(error).toMatchObject({ code: "NOT_FOUND" });
	});

	it("mints a signed URL scoped to the original kind", async () => {
		selectReturning([
			{
				resumeId: "resume-1",
				userId: "user-1",
				storageKey: "k",
				filename: "a.pdf",
				mediaType: "application/pdf",
				size: 3,
				dataHash: "hash-1",
				createdAt: new Date(0),
			},
		]);

		const { url } = await client.getDownloadUrl({ id: "resume-1" });
		const parsed = new URL(url);
		const token = parsed.searchParams.get("token");

		expect(parsed.pathname).toBe("/api/resumes/resume-1/original");
		if (!token) throw new Error("Expected signed URL token");

		const { verifyResumePdfDownloadToken } = await import("./pdf-download-url");
		expect(verifyResumePdfDownloadToken({ resumeId: "resume-1", token })).toMatchObject({
			ok: true,
			userId: "user-1",
			kind: "original",
		});
	});
});

describe("buildOriginalFileStorageKey", () => {
	it("keys files under the blocked originals prefix", () => {
		expect(buildOriginalFileStorageKey("user-1", "resume-1")).toBe("uploads/user-1/originals/resume-1");
	});
});
