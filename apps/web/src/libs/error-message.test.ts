// @vitest-environment happy-dom

import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@lingui/core";
import { ORPCError } from "@orpc/client";
import {
	getAuthErrorMessage,
	getOrpcErrorMessage,
	getReadableErrorMessage,
	getResumeErrorMessage,
} from "./error-message";

beforeAll(() => {
	i18n.load("en", {});
	i18n.activate("en");
});

describe("getReadableErrorMessage", () => {
	it("shows the upload size validation message instead of the generic oRPC error", () => {
		const error = new ORPCError("BAD_REQUEST", {
			message: "Input validation failed",
			data: { issues: [{ message: "File size must be less than 10MB", path: [] }] },
		});
		expect(getReadableErrorMessage(error, "Failed to upload picture.")).toBe("File size must be less than 10MB");
	});

	it("limits validation messages, removes duplicates, and ignores malformed issues", () => {
		const error = new ORPCError("BAD_REQUEST", {
			message: "Input validation failed",
			data: {
				issues: [
					null,
					{},
					{ message: 42 },
					{ message: " " },
					...["First", "First", "Second", "Third", "Fourth"].map((message) => ({ message })),
				],
			},
		});
		expect(getReadableErrorMessage(error, "fallback")).toBe("First Second Third");
	});

	it.each([null, {}, { issues: null }, { issues: "invalid" }, { issues: [{ message: "" }] }])(
		"retains the error message for malformed validation data %j",
		(data) => {
			const error = new ORPCError("BAD_REQUEST", { message: "Input validation failed", data });
			expect(getReadableErrorMessage(error, "fallback")).toBe("Input validation failed");
		},
	);

	it("does not interpret unrelated server errors as input validation", () => {
		const error = new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Unexpected failure",
			data: { issues: [{ message: "Internal detail" }] },
		});
		expect(getReadableErrorMessage(error, "fallback")).toBe("Unexpected failure");
	});

	it("returns the string error directly", () => {
		expect(getReadableErrorMessage("explicit error", "fallback")).toBe("explicit error");
	});

	it("returns Error.message", () => {
		expect(getReadableErrorMessage(new Error("boom"), "fallback")).toBe("boom");
	});

	it("returns the message of a plain error object (Better Auth client errors)", () => {
		expect(getReadableErrorMessage({ code: "SESSION_NOT_FRESH", message: "Session is not fresh" }, "fallback")).toBe(
			"Session is not fresh",
		);
	});

	it("returns fallback for unknown shapes", () => {
		expect(getReadableErrorMessage({ random: "object" }, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage({ message: "" }, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage({ message: 42 }, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage(null, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage(undefined, "fallback")).toBe("fallback");
		expect(getReadableErrorMessage(42, "fallback")).toBe("fallback");
	});

	it("returns fallback for empty string error (falsy)", () => {
		expect(getReadableErrorMessage("", "fallback")).toBe("fallback");
	});

	it("returns fallback for Error with empty message", () => {
		expect(getReadableErrorMessage(new Error(""), "fallback")).toBe("fallback");
	});
});

describe("getOrpcErrorMessage", () => {
	it("delegates to getReadableErrorMessage for non-ORPCErrors", () => {
		expect(getOrpcErrorMessage(new Error("boom"), { fallback: "fallback" })).toBe("boom");
		expect(getOrpcErrorMessage("string error", { fallback: "fallback" })).toBe("string error");
	});

	it("uses byCode mapping when present", () => {
		const error = new ORPCError("RESUME_LOCKED");
		expect(
			getOrpcErrorMessage(error, {
				fallback: "fallback",
				byCode: { RESUME_LOCKED: "It is locked." },
			}),
		).toBe("It is locked.");
	});

	it("returns server message when allowServerMessage and message is set", () => {
		const error = new ORPCError("OTHER", { message: "Server-provided message" });
		expect(
			getOrpcErrorMessage(error, {
				fallback: "fallback",
				allowServerMessage: true,
			}),
		).toBe("Server-provided message");
	});

	it("falls back when allowServerMessage is false even if message set", () => {
		const error = new ORPCError("OTHER", { message: "Server-provided message" });
		expect(getOrpcErrorMessage(error, { fallback: "fallback" })).toBe("fallback");
	});

	it("byCode takes precedence over allowServerMessage", () => {
		const error = new ORPCError("RESUME_LOCKED", { message: "Server msg" });
		expect(
			getOrpcErrorMessage(error, {
				fallback: "fallback",
				byCode: { RESUME_LOCKED: "It is locked." },
				allowServerMessage: true,
			}),
		).toBe("It is locked.");
	});

	it("returns fallback when no mapping or server message", () => {
		const error = new ORPCError("UNKNOWN_CODE");
		expect(getOrpcErrorMessage(error, { fallback: "fallback" })).toBe("fallback");
	});
});

describe("getResumeErrorMessage", () => {
	it("returns mapped message for RESUME_SLUG_ALREADY_EXISTS", () => {
		const error = new ORPCError("RESUME_SLUG_ALREADY_EXISTS");
		expect(getResumeErrorMessage(error)).toBe("A resume with this slug already exists.");
	});

	it("returns mapped message for RESUME_LOCKED", () => {
		const error = new ORPCError("RESUME_LOCKED");
		expect(getResumeErrorMessage(error)).toBe("This resume is locked. Unlock it first to make changes.");
	});

	it("returns generic fallback for unknown codes", () => {
		const error = new ORPCError("UNKNOWN");
		expect(getResumeErrorMessage(error)).toBe("Something went wrong. Please try again.");
	});

	it("returns fallback for plain Error (delegates to getOrpcErrorMessage)", () => {
		// Plain Error gets readable message
		expect(getResumeErrorMessage(new Error("boom"))).toBe("boom");
	});

	it("returns fallback for unknown shape", () => {
		expect(getResumeErrorMessage(null)).toBe("Something went wrong. Please try again.");
	});
});

describe("getAuthErrorMessage", () => {
	it("maps rate limiting by HTTP status even without a code (Better Auth 429 body)", () => {
		expect(getAuthErrorMessage({ message: "Too many requests. Please try again later.", status: 429 }, "fb")).toBe(
			"Too many attempts. Please wait about a minute and try again.",
		);
	});

	it("maps sign-up conflicts", () => {
		expect(getAuthErrorMessage({ code: "USER_ALREADY_EXISTS", message: "User already exists." }, "fb")).toBe(
			"An account with this email already exists. Sign in instead or use another email.",
		);
		expect(getAuthErrorMessage({ code: "USERNAME_IS_ALREADY_TAKEN", message: "Username is already taken" }, "fb")).toBe(
			"This username is already taken. Please choose another one.",
		);
	});

	it("maps sign-in credential failures", () => {
		expect(getAuthErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, "fb")).toBe(
			"Incorrect email or password. Please try again.",
		);
	});

	it("maps password length rules", () => {
		expect(getAuthErrorMessage({ code: "PASSWORD_TOO_SHORT", message: "Password too short" }, "fb")).toBe(
			"Password is too short. Use at least 8 characters.",
		);
	});

	it("maps untrusted-origin rejections to an actionable server-configuration message", () => {
		expect(getAuthErrorMessage({ code: "INVALID_ORIGIN", message: "Invalid origin", status: 403 }, "fb")).toBe(
			"This site address is not trusted by the server yet. The administrator must add it to the server configuration before signing in can work.",
		);
	});

	it("surfaces the raw server message for unmapped codes so the reason is not lost", () => {
		expect(getAuthErrorMessage({ code: "SOMETHING_ELSE", message: "Explains the real cause" }, "fb")).toBe(
			"Explains the real cause",
		);
	});

	it("returns the fallback when neither code nor message helps", () => {
		expect(getAuthErrorMessage({ code: "SOMETHING_ELSE" }, "fb")).toBe("fb");
		expect(getAuthErrorMessage({ message: "   " }, "fb")).toBe("fb");
		expect(getAuthErrorMessage("not-an-object", "fb")).toBe("fb");
		expect(getAuthErrorMessage(null, "fb")).toBe("fb");
	});
});
