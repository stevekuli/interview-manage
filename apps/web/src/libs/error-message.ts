import { t } from "@lingui/core/macro";
import { ORPCError } from "@orpc/client";

export function getReadableErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof ORPCError && error.code === "BAD_REQUEST") {
		const data: unknown = error.data;
		if (typeof data === "object" && data !== null && "issues" in data && Array.isArray(data.issues)) {
			const messages = new Set<string>();
			for (const issue of data.issues) {
				if (typeof issue !== "object" || issue === null || typeof issue.message !== "string") continue;
				const message = issue.message.trim();
				if (message) messages.add(message);
				if (messages.size === 3) break;
			}
			if (messages.size > 0) return [...messages].join(" ");
		}
	}

	if (typeof error === "string" && error) return error;
	if (error instanceof Error && error.message) return error.message;
	// Better Auth client errors are plain objects ({ code, message, status }), not Error instances.
	if (typeof error === "object" && error !== null && "message" in error) {
		const { message } = error as { message?: unknown };
		if (typeof message === "string" && message) return message;
	}
	return fallback;
}

type ErrorMessageByCode = Record<string, string>;

export function getOrpcErrorMessage(
	error: unknown,
	options: {
		fallback: string;
		byCode?: ErrorMessageByCode;
		allowServerMessage?: boolean;
	},
): string {
	if (!(error instanceof ORPCError)) return getReadableErrorMessage(error, options.fallback);

	const mappedMessage = options.byCode?.[error.code];
	if (mappedMessage) return mappedMessage;

	if (options.allowServerMessage && error.message) return error.message;
	return options.fallback;
}

export function getResumeErrorMessage(error: unknown): string {
	return getOrpcErrorMessage(error, {
		byCode: {
			RESUME_SLUG_ALREADY_EXISTS: "A resume with this slug already exists.",
			RESUME_LOCKED: "This resume is locked. Unlock it first to make changes.",
		},
		fallback: "Something went wrong. Please try again.",
	});
}

type AuthClientError = {
	code?: string | null;
	message?: string | null;
	status?: number | null;
};

/**
 * Maps Better Auth client errors from the sign-in/sign-up forms to a human-readable,
 * localized reason. Unmapped errors fall back to the raw server message so unfamiliar
 * failures still surface why they happened.
 */
export function getAuthErrorMessage(error: unknown, fallback: string): string {
	if (typeof error !== "object" || error === null) return fallback;
	const { code, message, status } = error as AuthClientError;

	// Better Auth's rate-limit response carries only a message (no code), keyed off HTTP 429.
	if (status === 429) {
		return t`Too many attempts. Please wait about a minute and try again.`;
	}

	switch (code) {
		case "INVALID_EMAIL_OR_PASSWORD":
		case "INVALID_PASSWORD":
			return t`Incorrect email or password. Please try again.`;
		case "USER_NOT_FOUND":
			return t`No account matches this email or username, or the password is incorrect.`;
		case "USER_ALREADY_EXISTS":
		case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
			return t`An account with this email already exists. Sign in instead or use another email.`;
		case "USERNAME_IS_ALREADY_TAKEN":
			return t`This username is already taken. Please choose another one.`;
		case "INVALID_USERNAME":
			return t`Usernames can only contain lowercase letters, numbers, dots, hyphens and underscores.`;
		case "USERNAME_TOO_SHORT":
		case "USERNAME_TOO_LONG":
			return t`Username must be between 3 and 64 characters.`;
		case "PASSWORD_TOO_SHORT":
			return t`Password is too short. Use at least 8 characters.`;
		case "PASSWORD_TOO_LONG":
			return t`Password is too long. Use at most 64 characters.`;
		case "INVALID_EMAIL":
			return t`Please enter a valid email address.`;
		case "EMAIL_NOT_VERIFIED":
			return t`This email address has not been verified yet. Check your inbox for a verification link.`;
		case "INVALID_ORIGIN":
		case "MISSING_OR_NULL_ORIGIN":
		case "INVALID_CALLBACK_URL":
		case "INVALID_REDIRECT_URL":
			return t`This site address is not trusted by the server yet. The administrator must add it to the server configuration before signing in can work.`;
		case "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED":
			return t`The sign-in request was blocked as a security precaution. Reload the page and try again.`;
		case "VALIDATION_ERROR":
			return t`Some entries are invalid. Please review the form and try again.`;
	}

	if (typeof message === "string" && message.trim()) return message;
	return fallback;
}
