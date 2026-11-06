import { verifyResumePdfDownloadToken } from "@reactive-resume/api/features/resume/export";
import { readResumeOriginalFile } from "@reactive-resume/api/features/resume/original-file";

function unauthorizedResponse() {
	return new Response("Unauthorized", {
		status: 401,
		headers: {
			"Cache-Control": "private, no-store",
		},
	});
}

function expiredResponse() {
	return new Response("Download link expired", {
		status: 410,
		headers: {
			"Cache-Control": "private, no-store",
		},
	});
}

function errorStatus(error: unknown) {
	const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
	return code === "NOT_FOUND" ? 404 : 500;
}

/**
 * Content-Disposition with an RFC 5987 `filename*` so non-ASCII original filenames (e.g. Chinese)
 * survive; the plain `filename` fallback is sanitized to ASCII for older clients.
 */
function buildContentDisposition(kind: "inline" | "attachment", filename: string): string {
	const fallback =
		filename
			.replace(/[^\x20-\x7E]/g, "_")
			.replace(/["\\]/g, "_")
			.trim() || "original-file";
	const encoded = encodeURIComponent(filename).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);

	return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
	return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
		? (data.buffer as ArrayBuffer)
		: (data.slice().buffer as ArrayBuffer);
}

export async function handleResumeOriginalDownload(request: Request, id: string) {
	const searchParams = new URL(request.url).searchParams;
	const token = searchParams.get("token");
	if (!token) return unauthorizedResponse();

	const verification = verifyResumePdfDownloadToken({ resumeId: id, token });
	if (!verification.ok) return verification.reason === "expired" ? expiredResponse() : unauthorizedResponse();
	// Only tokens minted for the original file unlock this route; rendered-PDF tokens are refused.
	if (verification.kind !== "original") return unauthorizedResponse();

	// Inline display is a viewer convenience for PDFs; everything else downloads untouched.
	const wantsInline = searchParams.get("inline") === "1";

	try {
		const file = await readResumeOriginalFile({ resumeId: id, userId: verification.userId });
		const inline = wantsInline && file.mediaType === "application/pdf";

		return new Response(toArrayBuffer(file.data), {
			headers: {
				"Content-Type": file.mediaType,
				"Content-Length": file.data.byteLength.toString(),
				"Content-Disposition": buildContentDisposition(inline ? "inline" : "attachment", file.filename),
				"Cache-Control": "private, no-store",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (error) {
		console.error("[Original File Download]", error);
		return new Response("Failed to read the original file", {
			status: errorStatus(error),
			headers: {
				"Cache-Control": "private, no-store",
			},
		});
	}
}
