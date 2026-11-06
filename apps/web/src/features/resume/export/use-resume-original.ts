import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/libs/orpc/client";

/**
 * Metadata for the resume's preserved original file (PDF/DOCX kept at import time), or null when
 * there is none. `enabled` lets the download dialog defer the request until it is actually open.
 */
export function useResumeOriginalFile(resumeId: string, enabled: boolean) {
	return useQuery(orpc.resume.originalFile.get.queryOptions({ input: { id: resumeId }, enabled }));
}

/** Mints a short-lived signed URL for the original file. Returns null when none is preserved. */
export async function fetchResumeOriginalFileUrl(resumeId: string): Promise<string | null> {
	try {
		const { url } = await orpc.resume.originalFile.getDownloadUrl.call({ id: resumeId });
		return url;
	} catch {
		return null;
	}
}
