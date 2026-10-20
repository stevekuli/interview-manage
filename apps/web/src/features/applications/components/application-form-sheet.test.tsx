// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
	Link: (props: { to: string; children?: React.ReactNode; className?: string }) => (
		<a href={props.to} className={props.className}>
			{props.children}
		</a>
	),
}));

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	update: vi.fn(),
	autofill: vi.fn(),
	openDialog: vi.fn(),
	useHasUsableAiProvider: vi.fn(),
}));

vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: {
			create: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.create }) },
			update: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.update }) },
			tags: { queryOptions: () => ({ queryKey: ["tags"], queryFn: async () => [] }) },
			ai: { autofill: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.autofill }) } },
		},
		resume: { list: { queryOptions: () => ({ queryKey: ["resumes"], queryFn: async () => [] }) } },
		storage: {
			uploadFile: { mutationOptions: (options: object) => ({ ...options, mutationFn: vi.fn() }) },
			deleteFile: { mutationOptions: (options: object) => ({ ...options, mutationFn: vi.fn() }) },
		},
	},
}));
vi.mock("@/libs/auth/client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "user-1" } } }) },
}));
vi.mock("@/dialogs/store", () => ({
	useDialogStore: (selector: (state: { openDialog: (type: string, data?: unknown) => void }) => unknown) =>
		selector({ openDialog: mocks.openDialog }),
}));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: mocks.useHasUsableAiProvider,
}));

import { useApplicationSessionStore } from "../session-draft";

const { ApplicationFormSheet } = await import("./application-form-sheet");

beforeAll(() => i18n.loadAndActivate({ locale: "en", messages: {} }));

beforeEach(() => {
	vi.clearAllMocks();
	vi.resetAllMocks();
	useApplicationSessionStore.setState({ drafts: {}, resumeReturn: null, focusResumeFor: null });
	mocks.useHasUsableAiProvider.mockReturnValue({ hasUsableProvider: false, isLoading: false, error: null });
	mocks.create.mockResolvedValue("new-id");
	mocks.update.mockResolvedValue({});
});

const renderSheet = (props: Partial<Parameters<typeof ApplicationFormSheet>[0]> = {}) => {
	const merged = { open: true, onOpenChange: vi.fn(), application: null, ...props };
	return render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<I18nProvider i18n={i18n}>
				<ApplicationFormSheet {...merged} />
			</I18nProvider>
		</QueryClientProvider>,
	);
};

const openJobDescription = async () => {
	const existing = screen.queryByRole("textbox", { name: /Job description text/ });
	if (!existing) await userEvent.click(screen.getByRole("button", { name: /Job description/ }));
	const textarea = await screen.findByRole("textbox", { name: /Job description text/ });
	return textarea;
};

const fillRequired = async () => {
	await userEvent.type(screen.getByLabelText(/Company/), "Acme");
	await userEvent.type(screen.getByLabelText(/Role \/ title/), "Engineer");
};

it("saves and reopens the job description with no AI provider configured, never calling the model", async () => {
	renderSheet();
	const textarea = await openJobDescription();
	await userEvent.type(textarea, "Long job description text used for the manual pipeline.");
	await fillRequired();

	const fillButton = screen.getByRole("button", { name: /Fill fields with AI/ });
	expect(fillButton).toBeDisabled();
	expect(screen.getByText(/No AI model configured/)).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "Add to pipeline" }));

	await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
	expect(mocks.autofill).not.toHaveBeenCalled();
	const payload = mocks.create.mock.calls[0][0] as { jobDescription: string };
	expect(payload.jobDescription).toContain("Long job description text");

	cleanup();
	const application = {
		id: "app-1",
		company: "Acme",
		role: "Engineer",
		status: "saved",
		archived: false,
		resumeId: null,
		jobDescription: payload.jobDescription,
		tags: [],
		activity: [],
		contacts: [],
		appliedAt: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		matchScore: null,
		aiMetadata: null,
		source: null,
		sourceUrl: null,
		location: null,
		salary: null,
		notes: null,
		resumeFileUrl: null,
		resumeFileName: null,
		coverLetterUrl: null,
		coverLetterName: null,
		followUpAt: null,
		followUpNote: null,
	} as never;
	renderSheet({ application });
	const reopened = await openJobDescription();
	expect(reopened).toHaveValue(payload.jobDescription);
});

it("treats a provider load failure as unknown state, keeps manual entry, and links to AI settings", async () => {
	mocks.useHasUsableAiProvider.mockReturnValue({
		hasUsableProvider: false,
		isLoading: false,
		error: new Error("network down"),
	});
	renderSheet();
	await openJobDescription();
	await fillRequired();

	expect(screen.getByText(/Couldn't check your AI setup/)).toBeVisible();
	expect(screen.getByRole("link", { name: /Review AI settings/ })).toHaveAttribute(
		"href",
		"/dashboard/settings/integrations",
	);
	expect(screen.getByRole("button", { name: /Fill fields with AI/ })).toBeDisabled();

	await userEvent.click(screen.getByRole("button", { name: "Add to pipeline" }));
	await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
	expect(mocks.autofill).not.toHaveBeenCalled();
});

it("keeps user-edited fields and offers the AI value as an accepted-by-click suggestion", async () => {
	mocks.useHasUsableAiProvider.mockReturnValue({ hasUsableProvider: true, isLoading: false, error: null });
	renderSheet();
	let resolveAutofill!: (value: { company: string; role: string; location: string; salary: string }) => void;
	mocks.autofill.mockReturnValue(
		new Promise((resolve) => {
			resolveAutofill = resolve;
		}),
	);

	const textarea = await openJobDescription();
	await userEvent.type(textarea, "A".repeat(240));
	await fillRequired();

	await userEvent.click(screen.getByRole("button", { name: /Fill fields with AI/ }));
	await waitFor(() => expect(mocks.autofill).toHaveBeenCalledTimes(1));

	// The user fixes the company while the request is in flight.
	const company = screen.getByLabelText(/Company/);
	await userEvent.clear(company);
	await userEvent.type(company, "Corrected Corp");

	await actResolve(() => resolveAutofill({ company: "AI Corp", role: "AI Role", location: "Remote", salary: "" }));

	// Untouched field (role) is filled; the edited company is kept.
	await waitFor(() => expect(screen.getByLabelText(/Role \/ title/)).toHaveValue("AI Role"));
	await userEvent.click(screen.getByRole("button", { name: /Additional details/ }));
	expect(await screen.findByLabelText(/Location/)).toHaveValue("Remote");
	expect(company).toHaveValue("Corrected Corp");

	// The AI's company is offered as a suggestion, applied only on click.
	expect(screen.getByText(/Company: AI Corp/)).toBeVisible();
	await userEvent.click(screen.getByRole("button", { name: "Use" }));
	expect(company).toHaveValue("AI Corp");
	expect(screen.queryByText(/Company: AI Corp/)).not.toBeInTheDocument();
});

it("ignores a stale auto-fill response after the job description changed", async () => {
	mocks.useHasUsableAiProvider.mockReturnValue({ hasUsableProvider: true, isLoading: false, error: null });
	renderSheet();
	let resolveAutofill!: (value: { company: string; role: string; location: string; salary: string }) => void;
	mocks.autofill.mockReturnValue(
		new Promise((resolve) => {
			resolveAutofill = resolve;
		}),
	);

	const textarea = await openJobDescription();
	await userEvent.type(textarea, "B".repeat(240));
	await fillRequired();
	await userEvent.click(screen.getByRole("button", { name: /Fill fields with AI/ }));
	await waitFor(() => expect(mocks.autofill).toHaveBeenCalledTimes(1));

	// Editing the JD invalidates the in-flight request.
	await userEvent.type(textarea, " more");

	await actResolve(() => resolveAutofill({ company: "Late Corp", role: "Late Role", location: "", salary: "" }));

	await waitFor(() => expect(screen.getByLabelText(/Company/)).toHaveValue("Acme"));
	expect(screen.getByLabelText(/Role \/ title/)).toHaveValue("Engineer");
	expect(screen.queryByText(/Late Corp/)).not.toBeInTheDocument();
});

it("shows field errors and focuses the first invalid field when submitting incomplete data", async () => {
	renderSheet();
	await userEvent.click(screen.getByRole("button", { name: "Add to pipeline" }));

	expect(await screen.findByText("Enter the company name.")).toBeVisible();
	expect(screen.getByLabelText(/Company/)).toHaveAttribute("aria-invalid", "true");
	expect(document.activeElement).toBe(screen.getByLabelText(/Company/));
	expect(mocks.create).not.toHaveBeenCalled();

	// Fixing the first error and resubmitting surfaces the next one, then a valid submit passes.
	await userEvent.type(screen.getByLabelText(/Company/), "Acme");
	await userEvent.click(screen.getByRole("button", { name: "Add to pipeline" }));
	expect(await screen.findByText("Enter the role or job title.")).toBeVisible();
	expect(document.activeElement).toBe(screen.getByLabelText(/Role \/ title/));

	await userEvent.type(screen.getByLabelText(/Role \/ title/), "Engineer");
	await userEvent.click(screen.getByRole("button", { name: "Add to pipeline" }));
	await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
});

it("pressing Enter inside a text field submits the form", async () => {
	renderSheet();
	await userEvent.type(screen.getByLabelText(/Company/), "Acme{Enter}");
	await waitFor(() => expect(mocks.create).not.toHaveBeenCalled()); // role still missing → error path
	expect(screen.getByText("Enter the role or job title.")).toBeVisible();

	await userEvent.type(screen.getByLabelText(/Role \/ title/), "Engineer{Enter}");
	await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
});

it("keeps the form draft across close/reopen within the session and discards it on request", async () => {
	const onOpenChange = vi.fn();
	const view = renderSheet({ onOpenChange });

	const textarea = await openJobDescription();
	await userEvent.type(textarea, "Draft job description that must survive a close.");
	await fillRequired();

	// Close (cancel keeps the draft), then reopen as a fresh create.
	await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(onOpenChange).toHaveBeenCalledWith(false);
	const rerenderWith = (open: boolean) =>
		view.rerender(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<I18nProvider i18n={i18n}>
					<ApplicationFormSheet open={open} onOpenChange={onOpenChange} application={null} />
				</I18nProvider>
			</QueryClientProvider>,
		);
	rerenderWith(false);
	rerenderWith(true);

	expect(await screen.findByText(/Restored your unsaved changes/)).toBeVisible();
	expect(await openJobDescription()).toHaveValue("Draft job description that must survive a close.");

	// Discard returns the sheet to its pristine state.
	await userEvent.click(screen.getByRole("button", { name: "Discard" }));
	expect(await openJobDescription()).toHaveValue("");
	expect(screen.getByLabelText(/Company/)).toHaveValue("");
	expect(true).toBe(true);
});

async function actResolve(resolve: () => void) {
	const { act } = await import("@testing-library/react");
	await act(() => {
		resolve();
	});
}
