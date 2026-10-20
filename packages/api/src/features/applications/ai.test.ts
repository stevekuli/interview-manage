import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORPCError } from "@orpc/client";
import { APICallError, generateText, LoadAPIKeyError, RetryError } from "ai";
import { z } from "zod";

const protectedProcedureMock = vi.hoisted(() => {
	// Handlers are recorded by route path (not by mock.calls, which the suites clear) so the
	// matchScore handler can be invoked directly in the binding tests below.
	const handlersByPath: Record<string, unknown> = {};
	let lastRoutePath: string | undefined;
	const chain = {
		route: vi.fn((config: { path: string }) => {
			lastRoutePath = config.path;
			return chain;
		}),
		input: vi.fn(() => chain),
		use: vi.fn(() => chain),
		output: vi.fn(() => chain),
		errors: vi.fn(() => chain),
		handler: vi.fn((handler: unknown) => {
			if (lastRoutePath) handlersByPath[lastRoutePath] = handler;
			return chain;
		}),
	};
	return Object.assign(chain, { handlersByPath });
});

const getModelMock = vi.hoisted(() => vi.fn());
const getDefaultRunnableMock = vi.hoisted(() => vi.fn());
const resumeGetByIdMock = vi.hoisted(() => vi.fn());
const resumeCreateMock = vi.hoisted(() => vi.fn());
const applicationServiceMocks = vi.hoisted(() => ({
	getById: vi.fn(),
	setAiResult: vi.fn(),
	update: vi.fn(),
	addNote: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => ({
	...(await importOriginal<typeof import("ai")>()),
	generateText: vi.fn(),
}));
vi.mock("../../context", () => ({ protectedProcedure: protectedProcedureMock }));
vi.mock("../../middleware/rate-limit", () => ({ aiRequestRateLimit: vi.fn() }));
vi.mock("../ai/service", () => ({ getModel: getModelMock }));
vi.mock("../ai-providers/service", () => ({ aiProvidersService: { getDefaultRunnable: getDefaultRunnableMock } }));
vi.mock("../resume/service", () => ({ resumeService: { getById: resumeGetByIdMock, create: resumeCreateMock } }));
vi.mock("../cover-letters/service", () => ({ coverLetterService: { create: vi.fn() } }));
vi.mock("./service", () => ({
	applicationService: applicationServiceMocks,
	sha256Hex: (value: string) => `hash-${value}`,
}));

const { autofillInputSchema, generateJson, generatePlainText, scoreApplicationMatch } = await import("./ai");

describe("autofillInputSchema", () => {
	it("rejects oversized pasted job descriptions", () => {
		expect(() => autofillInputSchema.parse({ jobDescription: "x".repeat(20_001) })).toThrow();
	});

	it("rejects blank pasted job descriptions", () => {
		expect(() => autofillInputSchema.parse({ jobDescription: "   " })).toThrow();
		expect(() => autofillInputSchema.parse({})).toThrow();
	});

	it("accepts a pasted posting", () => {
		expect(autofillInputSchema.parse({ jobDescription: "  Senior Engineer at Acme  " }).jobDescription).toBe(
			"Senior Engineer at Acme",
		);
	});
});

describe("copilot provider-failure translation", () => {
	const schema = z.object({ summary: z.string() });

	beforeEach(() => {
		vi.mocked(generateText).mockReset();
	});

	it("translates APICallError provider failures to BAD_GATEWAY in generatePlainText", async () => {
		vi.mocked(generateText).mockRejectedValue(
			new APICallError({
				message: "Provider returned 401",
				url: "https://api.openai.com/v1/chat/completions",
				requestBodyValues: undefined,
				statusCode: 401,
			}),
		);

		await expect(generatePlainText({} as never, "prompt")).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});

	it("translates APICallError provider failures to BAD_GATEWAY in generateJson", async () => {
		vi.mocked(generateText).mockRejectedValue(
			new APICallError({
				message: "Model not found",
				url: "https://api.openai.com/v1/chat/completions",
				requestBodyValues: undefined,
				statusCode: 404,
			}),
		);

		await expect(generateJson({} as never, { prompt: "prompt" }, schema)).rejects.toMatchObject({
			code: "BAD_GATEWAY",
		});
	});

	it("translates RetryError with maxRetriesExceeded to BAD_GATEWAY", async () => {
		const providerError = new APICallError({
			message: "Provider returned 500",
			url: "https://api.openai.com/v1/chat/completions",
			requestBodyValues: undefined,
			statusCode: 500,
		});
		vi.mocked(generateText).mockRejectedValue(
			new RetryError({
				message: "Failed to generate text after 3 attempts",
				reason: "maxRetriesExceeded",
				errors: [providerError],
			}),
		);

		await expect(generatePlainText({} as never, "prompt")).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});

	it("preserves the provider error as the BAD_GATEWAY cause", async () => {
		const providerError = new APICallError({
			message: "quota exceeded",
			url: "https://api.openai.com/v1/chat/completions",
			requestBodyValues: undefined,
			statusCode: 429,
		});
		vi.mocked(generateText).mockRejectedValue(providerError);

		const error: { code?: string; cause?: unknown } = await generatePlainText({} as never, "prompt").catch(
			(thrown) => thrown,
		);
		expect(error.code).toBe("BAD_GATEWAY");
		expect(error.cause).toBe(providerError);
	});

	it("rethrows non-provider SDK errors unchanged", async () => {
		const credentialError = new LoadAPIKeyError({ message: "The OPENAI_API_KEY is not set" });
		vi.mocked(generateText).mockRejectedValue(credentialError);

		await expect(generatePlainText({} as never, "prompt")).rejects.toBe(credentialError);
		await expect(generateJson({} as never, { prompt: "prompt" }, schema)).rejects.toBe(credentialError);
	});

	it("rethrows non-AI errors unchanged", async () => {
		const unrelated = new Error("network dropped mid-call");
		vi.mocked(generateText).mockRejectedValue(unrelated);

		await expect(generatePlainText({} as never, "prompt")).rejects.toBe(unrelated);
		await expect(generateJson({} as never, { prompt: "prompt" }, schema)).rejects.toBe(unrelated);
	});

	it("still returns parsed JSON on success", async () => {
		vi.mocked(generateText).mockResolvedValue({ text: '```json\n{"summary":"<p>Hi</p>"}\n```' } as never);

		await expect(generateJson({} as never, { prompt: "prompt" }, schema)).resolves.toEqual({ summary: "<p>Hi</p>" });
	});
});

describe("matchScore handler input binding", () => {
	const applicationService = applicationServiceMocks;

	beforeEach(() => {
		vi.mocked(generateText).mockReset();
		applicationService.getById.mockReset();
		applicationService.setAiResult.mockReset();
		getDefaultRunnableMock.mockResolvedValue({ provider: "openai", model: "gpt", apiKey: "key" } as never);
		getModelMock.mockResolvedValue({} as never);
		applicationService.getById.mockResolvedValue({
			id: "app-1",
			jobDescription: "Current posting",
			resumeId: "resume-1",
		} as never);
		resumeGetByIdMock.mockResolvedValue({
			id: "resume-1",
			updatedAt: new Date("2026-10-01T00:00:00.000Z"),
			data: { basics: { name: "Tester" } },
		} as never);
		vi.mocked(generateText).mockResolvedValue({ text: '{"score":82,"gaps":[],"strengths":[]}' } as never);
	});

	it("binds the write-back to the exact inputs used for scoring", async () => {
		await scoreApplicationMatch({ userId: "user-1", id: "app-1" });

		expect(applicationService.setAiResult).toHaveBeenCalledTimes(1);
		const call = applicationService.setAiResult.mock.calls[0]?.[0];
		expect(call).toMatchObject({
			id: "app-1",
			userId: "user-1",
			matchScore: 82,
			expect: {
				jobDescription: "Current posting",
				resumeId: "resume-1",
				resumeUpdatedAt: new Date("2026-10-01T00:00:00.000Z"),
			},
		});
		const input = (call.aiMetadata as { matchScoreInput: Record<string, unknown> }).matchScoreInput;
		expect(input.resumeId).toBe("resume-1");
		expect(typeof input.jobDescriptionHash).toBe("string");
		expect(typeof input.resumeHash).toBe("string");
		expect(typeof input.scoredAt).toBe("string");
	});

	it("surfaces the CONFLICT when the inputs changed during scoring", async () => {
		applicationService.setAiResult.mockRejectedValue(
			new ORPCError("CONFLICT", { message: "The application changed while the match score was being computed." }),
		);

		await expect(scoreApplicationMatch({ userId: "user-1", id: "app-1" })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("refuses to score without a linked resume or a pasted posting", async () => {
		applicationService.getById.mockResolvedValue({ id: "app-1", jobDescription: null, resumeId: null } as never);

		await expect(scoreApplicationMatch({ userId: "user-1", id: "app-1" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(applicationService.setAiResult).not.toHaveBeenCalled();
	});
});
