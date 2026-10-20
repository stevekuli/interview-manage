// @vitest-environment happy-dom

import type { Application } from "../types";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), other: vi.fn(), useHasUsableAiProvider: vi.fn() }));
type MockEditorDialogProps = { letterId: string };
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: {
			list: { queryKey: () => ["applications"] },
			getById: { queryKey: (args: { input: { id: string } }) => ["applications", "detail", args.input.id] },
			ai: {
				matchScore: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.other }) },
				tailorResume: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.other }) },
				draftMessage: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.draft }) },
			},
		},
		coverLetters: { list: { key: () => ["cover-letters"] } },
	},
}));
vi.mock("@/features/cover-letters/editor-dialog", () => ({
	CoverLetterEditorDialog: ({ letterId }: MockEditorDialogProps) => <div role="dialog">Saved letter {letterId}</div>,
}));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: mocks.useHasUsableAiProvider,
}));
vi.mock("@tanstack/react-router", () => ({
	Link: (props: { to: string; params?: { resumeId: string }; children?: React.ReactNode }) => (
		<a href={props.params ? props.to.replace("$resumeId", props.params.resumeId) : props.to}>{props.children}</a>
	),
}));

const { ApplicationAiCopilot } = await import("./application-ai-copilot");
const application: Application = {
	id: "application",
	company: "Example",
	role: "Engineer",
	location: null,
	salary: null,
	status: "saved",
	archived: false,
	resumeId: null,
	source: null,
	sourceUrl: null,
	jobDescription: null,
	matchScore: null,
	aiMetadata: null,
	notes: null,
	resumeFileUrl: null,
	resumeFileName: null,
	coverLetterUrl: null,
	coverLetterName: null,
	followUpAt: null,
	followUpNote: null,
	tags: [],
	contacts: [],
	activity: [],
	appliedAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
};

beforeAll(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
beforeEach(() => {
	vi.resetAllMocks();
	mocks.useHasUsableAiProvider.mockReturnValue({ hasUsableProvider: true, isLoading: false, error: null });
});

function draftRequest() {
	let resolve!: (result: { text: string; coverLetterId?: string }) => void;
	const promise = new Promise<{ text: string; coverLetterId?: string }>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function renderCopilot() {
	return render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
			<I18nProvider i18n={i18n}>
				<ApplicationAiCopilot application={application} />
			</I18nProvider>
		</QueryClientProvider>,
	);
}

it.each(["cover-letter", "follow-up"] as const)(
	"blocks both draft actions while the first %s is pending",
	async (kind) => {
		const request = draftRequest();
		mocks.draft.mockReturnValue(request.promise);
		renderCopilot();
		const coverLetter = screen.getByRole("button", { name: /Draft a cover letter/ });
		const followUp = screen.getByRole("button", { name: /Draft a follow-up/ });
		await userEvent.click(kind === "cover-letter" ? coverLetter : followUp);
		await waitFor(() => expect(mocks.draft).toHaveBeenCalledTimes(1));
		expect(coverLetter).toBeDisabled();
		expect(followUp).toBeDisabled();
		await userEvent.click(coverLetter);
		await userEvent.click(followUp);
		expect(mocks.draft).toHaveBeenCalledTimes(1);
		await act(async () =>
			request.resolve(
				kind === "cover-letter" ? { text: "Letter", coverLetterId: "letter-one" } : { text: "Follow-up" },
			),
		);
		if (kind === "cover-letter") expect(await screen.findByRole("dialog")).toHaveTextContent("letter-one");
		else expect(await screen.findByText("Follow-up")).toBeVisible();
		expect(coverLetter).toBeEnabled();
		expect(followUp).toBeEnabled();
	},
);

it("prevents duplicate saved letters after an earlier follow-up completed", async () => {
	mocks.draft.mockResolvedValueOnce({ text: "Earlier follow-up" });
	const request = draftRequest();
	mocks.draft.mockReturnValueOnce(request.promise);
	renderCopilot();
	const coverLetter = screen.getByRole("button", { name: /Draft a cover letter/ });
	const followUp = screen.getByRole("button", { name: /Draft a follow-up/ });
	await userEvent.click(followUp);
	await screen.findByText("Earlier follow-up");
	await userEvent.click(coverLetter);
	await waitFor(() => expect(mocks.draft).toHaveBeenCalledTimes(2));
	expect(coverLetter).toBeDisabled();
	expect(followUp).toBeDisabled();
	await userEvent.click(coverLetter);
	expect(mocks.draft).toHaveBeenCalledTimes(2);
	await act(async () => request.resolve({ text: "Saved letter", coverLetterId: "letter-two" }));
	expect(await screen.findByRole("dialog")).toHaveTextContent("letter-two");
	expect(screen.queryByText("Earlier follow-up")).not.toBeInTheDocument();
});

it("asks for a re-score when the server marks the stored score stale", async () => {
	const staleApp = {
		...application,
		resumeId: "resume-1",
		jobDescription: "Posting",
		matchScore: 80,
		aiScore: { score: 80, gaps: ["SQL"], strengths: [], scoredAt: "2026-10-01T00:00:00Z", stale: true },
	};
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
			<I18nProvider i18n={i18n}>
				<ApplicationAiCopilot application={staleApp} />
			</I18nProvider>
		</QueryClientProvider>,
	);

	expect(screen.getByText(/the old score no longer applies/)).toBeVisible();
	expect(screen.queryByText("80")).not.toBeInTheDocument();

	mocks.other.mockResolvedValue({ score: 90, gaps: [], strengths: [] });
	await userEvent.click(screen.getByRole("button", { name: /Re-score with current content/ }));
	await waitFor(() => expect(mocks.other).toHaveBeenCalledTimes(1));
	expect((mocks.other.mock.calls[0] as unknown[])[0]).toEqual({ id: "application" });
});

it("gates every AI action behind an actionable checklist when no provider is configured", () => {
	mocks.useHasUsableAiProvider.mockReturnValue({ hasUsableProvider: false, isLoading: false, error: null });
	renderCopilot();

	expect(screen.getByText(/Before scoring your fit/)).toBeVisible();
	const configure = screen.getByRole("link", { name: "Configure AI" });
	expect(configure).toHaveAttribute("href", "/dashboard/settings/integrations");

	expect(screen.getByRole("button", { name: /Create a tailored copy/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: /Draft a cover letter/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: /Draft a follow-up/ })).toBeDisabled();
});

it("shows the tailored copy result with an explicit open-resume action", async () => {
	const readyApp = { ...application, resumeId: "resume-1", jobDescription: "Posting" };
	mocks.other.mockResolvedValue({ resumeId: "resume-tailored", name: "Tailored — Example · Engineer" });
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
			<I18nProvider i18n={i18n}>
				<ApplicationAiCopilot application={readyApp} />
			</I18nProvider>
		</QueryClientProvider>,
	);

	await userEvent.click(screen.getByRole("button", { name: /Create a tailored copy/ }));
	const link = await screen.findByRole("link", { name: /Open the tailored resume/ });
	expect(link).toHaveAttribute("href", "/builder/resume-tailored");
	expect(screen.getByText(/Only the summary was rewritten/)).toBeVisible();
});
