import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	readResumeOriginalFile: vi.fn(),
	verifyResumePdfDownloadToken: vi.fn(),
}));

vi.mock("@reactive-resume/api/features/resume/original-file", () => ({
	readResumeOriginalFile: mocks.readResumeOriginalFile,
}));

vi.mock("@reactive-resume/api/features/resume/export", () => ({
	verifyResumePdfDownloadToken: mocks.verifyResumePdfDownloadToken,
}));

const { handleResumeOriginalDownload } = await import("./resume-original");

const originalToken = {
	ok: true,
	resumeId: "resume-1",
	userId: "user-1",
	kind: "original",
	expiresAt: "2026-06-01T10:10:00.000Z",
} as const;

describe("handleResumeOriginalDownload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.readResumeOriginalFile.mockResolvedValue({
			filename: "原始简历.pdf",
			mediaType: "application/pdf",
			size: 4,
			data: new Uint8Array([37, 80, 68, 70]),
		});
	});

	it("serves the original file as an attachment when the token is a valid original token", async () => {
		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce(originalToken);

		const response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=signed"),
			"resume-1",
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/pdf");
		expect(response.headers.get("Content-Disposition")).toContain("attachment");
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(await response.text()).toBe("%PDF");
		expect(mocks.readResumeOriginalFile).toHaveBeenCalledWith({ resumeId: "resume-1", userId: "user-1" });
	});

	it("encodes non-ASCII filenames with an RFC 5987 filename* and an ASCII fallback", async () => {
		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce(originalToken);

		const response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=signed"),
			"resume-1",
		);

		const disposition = response.headers.get("Content-Disposition") ?? "";
		expect(disposition).toContain("filename*=UTF-8''%E5%8E%9F%E5%A7%8B%E7%AE%80%E5%8E%86.pdf");
		expect(disposition).not.toContain("原始简历");
	});

	it("serves inline when requested for a PDF", async () => {
		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce(originalToken);

		const response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=signed&inline=1"),
			"resume-1",
		);

		expect(response.headers.get("Content-Disposition")).toContain("inline");
	});

	it("keeps non-PDF originals as forced downloads even when inline is requested", async () => {
		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce(originalToken);
		mocks.readResumeOriginalFile.mockResolvedValueOnce({
			filename: "resume.docx",
			mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			size: 4,
			data: new Uint8Array([1, 2, 3, 4]),
		});

		const response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=signed&inline=1"),
			"resume-1",
		);

		expect(response.headers.get("Content-Type")).toBe(
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		);
		expect(response.headers.get("Content-Disposition")).toContain("attachment");
	});

	it("rejects missing, invalid, expired, and wrong-kind tokens before reading the file", async () => {
		let response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original"),
			"resume-1",
		);
		expect(response.status).toBe(401);
		expect(mocks.readResumeOriginalFile).not.toHaveBeenCalled();

		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce({ ok: false, reason: "invalid_signature" });
		response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=bad"),
			"resume-1",
		);
		expect(response.status).toBe(401);

		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce({ ok: false, reason: "expired" });
		response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=expired"),
			"resume-1",
		);
		expect(response.status).toBe(410);

		// A rendered-PDF token must not unlock the preserved original.
		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce({
			ok: true,
			resumeId: "resume-1",
			userId: "user-1",
			kind: "rendered",
			target: "resume",
			expiresAt: "2026-06-01T10:10:00.000Z",
		});
		response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=rendered"),
			"resume-1",
		);
		expect(response.status).toBe(401);
		expect(mocks.readResumeOriginalFile).not.toHaveBeenCalled();
	});

	it("maps a missing artifact or storage blob to 404", async () => {
		mocks.verifyResumePdfDownloadToken.mockReturnValueOnce(originalToken);
		mocks.readResumeOriginalFile.mockRejectedValueOnce({ code: "NOT_FOUND" });

		const response = await handleResumeOriginalDownload(
			new Request("https://example.com/api/resumes/resume-1/original?token=signed"),
			"resume-1",
		);

		expect(response.status).toBe(404);
	});
});
