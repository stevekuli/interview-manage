import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import type { Application } from "../types";
import type { FileAttachment } from "./file-attachment-field";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	ArrowCounterClockwiseIcon,
	CheckCircleIcon,
	DownloadSimpleIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	SparkleIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@reactive-resume/ui/components/accordion";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { Combobox } from "@/components/ui/combobox";
import { useDialogStore } from "@/dialogs/store";
import { useHasUsableAiProvider } from "@/features/settings/integrations/hooks/use-has-usable-ai-provider";
import { authClient } from "@/libs/auth/client";
import { orpc } from "@/libs/orpc/client";
import { localizedStages } from "../labels";
import { applicationsListQueryKey } from "../queries";
import { useApplicationSessionStore } from "../session-draft";
import { FileAttachmentField } from "./file-attachment-field";

// Preset source suggestions surfaced via a <datalist>; the field itself stays free-text.
const SOURCE_OPTIONS = ["LinkedIn", "Indeed", "Company Website", "Referral", "Recruiter", "Other"];
// Mirrors the server-side cap on `applications.ai.autofill`.
const MAX_JOB_DESCRIPTION_CHARS = 20_000;
// A paste shorter than this is a snippet, not a posting — don't burn an AI call on it.
const MIN_AUTOFILL_CHARS = 200;
const todayInputValue = () => new Date().toISOString().slice(0, 10);
const AI_SETTINGS_HREF = "/dashboard/settings/integrations" as const;

const emptyForm = () => ({
	company: "",
	role: "",
	location: "",
	salary: "",
	source: "",
	status: "saved" as ApplicationStatus,
	resumeId: "",
	tags: [] as string[],
	sourceUrl: "",
	stageEnteredAt: todayInputValue(),
	jobDescription: "",
	followUpAt: "",
	followUpNote: "",
	notes: "",
	resumeFile: null as FileAttachment | null,
	coverLetter: null as FileAttachment | null,
});

type FormState = ReturnType<typeof emptyForm>;

const toAttachment = (url: string | null, name: string | null): FileAttachment | null =>
	url ? { url, name: name ?? url } : null;

const toForm = (app: Application): FormState => ({
	company: app.company,
	role: app.role,
	location: app.location ?? "",
	salary: app.salary ?? "",
	source: app.source ?? "",
	status: app.status,
	resumeId: app.resumeId ?? "",
	tags: app.tags,
	sourceUrl: app.sourceUrl ?? "",
	stageEnteredAt: "",
	jobDescription: app.jobDescription ?? "",
	followUpAt: app.followUpAt ? new Date(app.followUpAt).toISOString().slice(0, 10) : "",
	followUpNote: app.followUpNote ?? "",
	notes: app.notes ?? "",
	resumeFile: toAttachment(app.resumeFileUrl, app.resumeFileName),
	coverLetter: toAttachment(app.coverLetterUrl, app.coverLetterName),
});

// A field the AI could fill but the user edited by hand while the request was in flight.
type Suggestion = { field: "company" | "role" | "location" | "salary"; label: string; value: string };

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// When provided, the sheet edits this application instead of creating a new one.
	application?: Application | null;
};

export function ApplicationFormSheet({ open, onOpenChange, application }: Props) {
	const queryClient = useQueryClient();
	const isEditing = !!application;
	const { data: session } = authClient.useSession();
	const userId = session?.user.id;
	const openDialog = useDialogStore((state) => state.openDialog);
	const saveDraft = useApplicationSessionStore((state) => state.saveDraft);
	const readDraft = useApplicationSessionStore((state) => state.readDraft);
	const clearDraft = useApplicationSessionStore((state) => state.clearDraft);
	const setResumeReturn = useApplicationSessionStore((state) => state.setResumeReturn);

	const [form, setForm] = useState<FormState>(() => (application ? toForm(application) : emptyForm()));
	// When set, the sheet shows the "link a resume" next-step panel instead of the form.
	const [savedAppId, setSavedAppId] = useState<string | null>(null);
	const [savedSummary, setSavedSummary] = useState<{ company: string; role: string }>({ company: "", role: "" });
	const [draftRestored, setDraftRestored] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<{ company?: string; role?: string }>({});

	// Re-sync the form when the sheet's target changes (a different app, or create ↔ edit).
	const [syncedId, setSyncedId] = useState(application?.id ?? null);
	if ((application?.id ?? null) !== syncedId) {
		setSyncedId(application?.id ?? null);
		setForm(application ? toForm(application) : emptyForm());
		setSavedAppId(null);
		setDraftRestored(false);
		setFieldErrors({});
	}

	const { data: resumes } = useQuery(orpc.resume.list.queryOptions());
	const resumeOptions = (resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }));

	const { data: allTags } = useQuery(orpc.applications.tags.queryOptions());

	// Four AI-availability states the JD section reacts to: loading, load failure, no usable
	// provider, and ready. Manual entry and saving never depend on any of these.
	const { hasUsableProvider, isLoading: providersLoading, error: providersError } = useHasUsableAiProvider();

	const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: applicationsListQueryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.applications.stats.queryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.applications.tags.queryKey() });
		if (application) {
			void queryClient.invalidateQueries({
				queryKey: orpc.applications.getById.queryKey({ input: { id: application.id } }),
			});
		}
	};

	// --- Session draft (survives navigating away, not a page refresh; cleared on sign-out) ---
	useEffect(() => {
		if (!open || !userId) return;
		const draft = readDraft(userId, application?.id ?? null);
		if (!draft) return;
		setForm((prev) => ({ ...prev, ...(draft.values as Partial<FormState>) }));
		setDraftRestored(true);
	}, [open, userId, application?.id, readDraft]);

	// Only persist once the user actually changed something, so reopening the sheet doesn't
	// resurrect an empty "restored draft" notice.
	const baselineRef = useRef<FormState>(form);
	if ((application?.id ?? null) !== syncedId) baselineRef.current = application ? toForm(application) : emptyForm();
	const isDirty = JSON.stringify(form) !== JSON.stringify(baselineRef.current);

	useEffect(() => {
		if (!open || !userId || savedAppId || !isDirty) return;
		saveDraft(userId, application?.id ?? null, form as unknown as Record<string, unknown>);
	}, [form, open, userId, savedAppId, isDirty, application?.id, saveDraft]);

	const discardDraft = () => {
		if (userId) clearDraft(userId, application?.id ?? null);
		setForm(application ? toForm(application) : emptyForm());
		baselineRef.current = application ? toForm(application) : emptyForm();
		setDraftRestored(false);
	};

	const create = useMutation(
		orpc.applications.create.mutationOptions({
			onSuccess: (id) => {
				invalidate();
				if (userId) clearDraft(userId, null);
				toast.add({ type: "success", description: t`Application added to your pipeline.` });
				// Stay open: the next step is linking the resume that was (or will be) sent.
				setSavedSummary({ company: formRef.current.company.trim(), role: formRef.current.role.trim() });
				setSavedAppId(id);
				setForm(emptyForm());
				baselineRef.current = emptyForm();
				setDraftRestored(false);
			},
			onError: () => toast.add({ type: "error", description: t`Couldn't add the application. Please try again.` }),
		}),
	);

	const update = useMutation(
		orpc.applications.update.mutationOptions({
			onSuccess: () => {
				invalidate();
				if (userId && application) clearDraft(userId, application.id);
				toast.add({ type: "success", description: t`Application updated.` });
				onOpenChange(false);
			},
			onError: () => toast.add({ type: "error", description: t`Couldn't save your changes. Please try again.` }),
		}),
	);

	// --- AI auto-fill: explicit user action, guarded against overwriting newer input ---
	// Every invalidating event (target switch, sheet (re)open, JD edit) bumps `requestSeq`; a
	// response may only land while its seq is still current, and only into fields the user has
	// not touched since the request was issued.
	const requestSeqRef = useRef(0);
	const formRef = useRef(form);
	formRef.current = form;
	const lastRequestRef = useRef<{
		seq: number;
		snapshot: Pick<FormState, "company" | "role" | "location" | "salary">;
	} | null>(null);
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

	const invalidatePending = () => {
		requestSeqRef.current += 1;
		setSuggestions([]);
	};

	// Target switches and the sheet's open cycle invalidate any in-flight extraction, and a
	// closed sheet never keeps the next-step panel around for a later reopen. The application id
	// is deliberately a trigger (not a value read inside): switching targets retires the result.
	// biome-ignore lint/correctness/useExhaustiveDependencies: application?.id is an invalidation trigger, not a value read here
	useEffect(() => {
		requestSeqRef.current += 1;
		setSuggestions([]);
		if (!open) {
			setSavedAppId(null);
			setDraftRestored(false);
			setFieldErrors({});
		}
	}, [open, application?.id]);

	const autofill = useMutation(
		orpc.applications.ai.autofill.mutationOptions({
			onSuccess: (result) => {
				const request = lastRequestRef.current;
				if (!request || requestSeqRef.current !== request.seq) return; // stale response — ignore

				const current = formRef.current;
				const picked: Partial<FormState> = {};
				const skipped: Suggestion[] = [];
				const entries = [
					{ field: "company", label: t`Company`, value: result.company },
					{ field: "role", label: t`Role / title`, value: result.role },
					{ field: "location", label: t`Location`, value: result.location },
					{ field: "salary", label: t`Salary range`, value: result.salary },
				] as const;

				for (const entry of entries) {
					if (!entry.value) continue;
					const atRequest = request.snapshot[entry.field];
					const now = current[entry.field];
					// Fill untouched fields directly; keep user-typed values and offer the AI's
					// version as a one-click suggestion instead of overwriting.
					if (now === atRequest || now.trim() === "") picked[entry.field] = entry.value;
					else if (now !== entry.value) skipped.push({ field: entry.field, label: entry.label, value: entry.value });
				}

				if (Object.keys(picked).length > 0) {
					setForm((prev) => ({ ...prev, ...picked }));
					toast.add({ type: "success", description: t`Filled in what we could from the posting.` });
				}
				setSuggestions(skipped);
			},
			onError: (error) => toast.add({ type: "error", description: error.message || t`Auto-fill failed.` }),
		}),
	);

	const runAutofill = () => {
		const posting = formRef.current.jobDescription.trim();
		if (!hasUsableProvider || posting.length < MIN_AUTOFILL_CHARS || autofill.isPending) return;
		lastRequestRef.current = {
			seq: requestSeqRef.current,
			snapshot: {
				company: formRef.current.company,
				role: formRef.current.role,
				location: formRef.current.location,
				salary: formRef.current.salary,
			},
		};
		setSuggestions([]);
		autofill.mutate({ jobDescription: posting.slice(0, MAX_JOB_DESCRIPTION_CHARS) });
	};

	const applySuggestion = (suggestion: Suggestion) => {
		set(suggestion.field, suggestion.value);
		setSuggestions((prev) => prev.filter((item) => item.field !== suggestion.field));
	};

	const pending = create.isPending || update.isPending;

	// --- Accessible form with per-field validation errors (R6) ---
	const companyFieldId = useId();
	const roleFieldId = useId();
	const jdFieldId = useId();

	const submit = () => {
		if (pending || savedAppId) return;
		const errors: typeof fieldErrors = {};
		if (!form.company.trim()) errors.company = t`Enter the company name.`;
		if (!form.role.trim()) errors.role = t`Enter the role or job title.`;
		setFieldErrors(errors);
		const firstErrorId = errors.company ? companyFieldId : errors.role ? roleFieldId : null;
		if (firstErrorId) {
			document.getElementById(firstErrorId)?.focus();
			return;
		}
		const payload = {
			company: form.company.trim(),
			role: form.role.trim(),
			status: form.status,
			location: form.location.trim() || null,
			salary: form.salary.trim() || null,
			source: form.source.trim() || null,
			resumeId: form.resumeId || null,
			tags: form.tags,
			sourceUrl: form.sourceUrl.trim() || null,
			jobDescription: form.jobDescription.trim() || null,
			notes: form.notes.trim() || null,
			followUpNote: form.followUpNote.trim() || null,
			followUpAt: form.followUpAt ? new Date(form.followUpAt) : null,
			resumeFileUrl: form.resumeFile?.url ?? null,
			resumeFileName: form.resumeFile?.name ?? null,
			coverLetterUrl: form.coverLetter?.url ?? null,
			coverLetterName: form.coverLetter?.name ?? null,
		};
		if (application) update.mutate({ id: application.id, ...payload });
		else create.mutate({ ...payload, stageEnteredAt: form.stageEnteredAt || undefined });
	};

	// Leave the applications flow to create/import a resume, protecting in-progress input.
	const leaveFlowToResume = (mode: "create" | "import") => {
		const targetId = savedAppId ?? application?.id ?? null;
		if (!savedAppId && userId && isDirty) {
			saveDraft(userId, application?.id ?? null, form as unknown as Record<string, unknown>);
		}
		if (userId) setResumeReturn({ userId, applicationId: targetId });
		openDialog(mode === "create" ? "resume.create" : "resume.import", undefined);
	};

	const stageOptions = localizedStages();

	// After a successful create, the sheet becomes the "link a resume" next step.
	if (savedAppId) {
		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-lg">
					<SheetHeader>
						<SheetTitle>
							<Trans>Application added</Trans>
						</SheetTitle>
						<SheetDescription>
							<Trans>Link the resume you sent (or plan to send) to unlock AI match scoring and tailoring.</Trans>
						</SheetDescription>
					</SheetHeader>

					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
						<p className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5 text-muted-foreground text-sm">
							<CheckCircleIcon className="shrink-0 text-emerald-600" />
							{savedSummary.company || savedSummary.role
								? `${savedSummary.company}${savedSummary.role ? ` — ${savedSummary.role}` : ""}`
								: t`Added to your pipeline.`}
						</p>

						<Field label={t`Link a resume`} htmlFor="application-next-resume">
							<div className="flex flex-col gap-2">
								<Combobox
									id="application-next-resume"
									className="w-full"
									value={form.resumeId || null}
									options={resumeOptions}
									placeholder={t`Choose an existing resume…`}
									showClear
									emptyMessage={t`No resumes yet.`}
									onValueChange={(value) => set("resumeId", value ?? "")}
								/>
								<Button
									type="button"
									disabled={!form.resumeId || pending}
									onClick={() => update.mutate({ id: savedAppId, resumeId: form.resumeId })}
								>
									{pending ? <SpinnerGapIcon className="animate-spin" /> : <CheckCircleIcon />}
									<Trans>Link resume</Trans>
								</Button>
							</div>
						</Field>

						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" size="sm" variant="outline" onClick={() => leaveFlowToResume("create")}>
								<PlusIcon />
								<Trans>Create a resume</Trans>
							</Button>
							<Button type="button" size="sm" variant="outline" onClick={() => leaveFlowToResume("import")}>
								<DownloadSimpleIcon />
								<Trans>Import a resume</Trans>
							</Button>
							<p className="w-full text-[11px] text-muted-foreground">
								<Trans>You'll come back here with your input kept. Drafts live only in this browser session.</Trans>
							</p>
						</div>
					</div>

					<SheetFooter className="flex-row justify-end gap-2">
						<Button type="button" onClick={() => onOpenChange(false)}>
							<Trans>Done</Trans>
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-lg">
				<form
					noValidate
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<SheetHeader>
						<SheetTitle>{isEditing ? <Trans>Edit application</Trans> : <Trans>Add application</Trans>}</SheetTitle>
						<SheetDescription>
							{isEditing ? (
								<Trans>Update this application's details.</Trans>
							) : (
								<Trans>Track a job you're applying to and link the resume you sent.</Trans>
							)}
						</SheetDescription>
					</SheetHeader>

					{draftRestored && (
						<div className="mx-4 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
							<p className="text-muted-foreground">
								<Trans>Restored your unsaved changes (kept for this browser session only).</Trans>
							</p>
							<Button type="button" size="sm" variant="ghost" className="h-7 shrink-0" onClick={discardDraft}>
								<ArrowCounterClockwiseIcon />
								<Trans>Discard</Trans>
							</Button>
						</div>
					)}

					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 [&>*]:shrink-0">
						{/* Pasted job description: stored with the application and used for every AI action.
						    Always editable — AI extraction is the only provider-dependent part. */}
						<Accordion className="rounded-lg border border-border border-dashed px-3">
							<AccordionItem value="job-description">
								<AccordionTrigger>
									<span className="flex items-center gap-1.5">
										<SparkleIcon className="text-primary" />
										<Trans>Job description</Trans>
									</span>
								</AccordionTrigger>
								<AccordionContent className="flex flex-col gap-2">
									<p className="text-muted-foreground text-xs">
										<Trans>
											Copy the entire job description from the posting and paste it below. It stays with this
											application for match scoring and tailoring.
										</Trans>
									</p>
									<div className="grid gap-1.5">
										<Label htmlFor={jdFieldId} className="sr-only">
											<Trans>Job description text</Trans>
										</Label>
										<Textarea
											id={jdFieldId}
											// Fixed height: the accordion panel measures its content once, so a textarea that
											// grew with the pasted text would overflow the clipped panel.
											className="field-sizing-fixed h-40"
											value={form.jobDescription}
											rows={8}
											maxLength={MAX_JOB_DESCRIPTION_CHARS}
											placeholder={t`Paste the full job description here…`}
											onChange={(event) => {
												// Editing the source text invalidates any in-flight extraction result.
												invalidatePending();
												set("jobDescription", event.target.value);
											}}
										/>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<AiAvailabilityHint
											loading={providersLoading}
											error={!!providersError}
											usable={hasUsableProvider}
											pending={autofill.isPending}
										/>
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={
												!hasUsableProvider ||
												providersLoading ||
												!!providersError ||
												form.jobDescription.trim().length < MIN_AUTOFILL_CHARS ||
												autofill.isPending
											}
											onClick={runAutofill}
										>
											{autofill.isPending ? <SpinnerGapIcon className="animate-spin" /> : <SparkleIcon />}
											<Trans>Fill fields with AI</Trans>
										</Button>
									</div>

									{suggestions.length > 0 && (
										<div className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
											<p className="font-medium">
												<Trans>Kept your edits to these fields — AI suggestions:</Trans>
											</p>
											<ul className="mt-1.5 flex flex-col gap-1.5">
												{suggestions.map((suggestion) => (
													<li key={suggestion.field} className="flex items-center justify-between gap-2">
														<span className="min-w-0 truncate text-muted-foreground">
															{suggestion.label}: {suggestion.value}
														</span>
														<span className="flex shrink-0 gap-1">
															<Button
																type="button"
																size="sm"
																variant="outline"
																className="h-6 px-2 text-[11px]"
																onClick={() => applySuggestion(suggestion)}
															>
																<Trans>Use</Trans>
															</Button>
															<Button
																type="button"
																size="sm"
																variant="ghost"
																className="h-6 px-2 text-[11px]"
																onClick={() =>
																	setSuggestions((prev) => prev.filter((item) => item.field !== suggestion.field))
																}
															>
																<XIcon />
																<span className="sr-only">
																	<Trans>Dismiss suggestion</Trans>
																</span>
															</Button>
														</span>
													</li>
												))}
											</ul>
										</div>
									)}
								</AccordionContent>
							</AccordionItem>
						</Accordion>

						<Field label={t`Company`} htmlFor={companyFieldId} required error={fieldErrors.company}>
							<Input
								id={companyFieldId}
								value={form.company}
								aria-required="true"
								aria-invalid={fieldErrors.company ? "true" : undefined}
								aria-describedby={fieldErrors.company ? `${companyFieldId}-error` : undefined}
								onChange={(event) => {
									setFieldErrors((prev) => ({ ...prev, company: undefined }));
									set("company", event.target.value);
								}}
							/>
						</Field>
						<Field label={t`Role / title`} htmlFor={roleFieldId} required error={fieldErrors.role}>
							<Input
								id={roleFieldId}
								value={form.role}
								aria-required="true"
								aria-invalid={fieldErrors.role ? "true" : undefined}
								aria-describedby={fieldErrors.role ? `${roleFieldId}-error` : undefined}
								onChange={(event) => {
									setFieldErrors((prev) => ({ ...prev, role: undefined }));
									set("role", event.target.value);
								}}
							/>
						</Field>

						{/* Secondary fields stay available but out of the way; the required fields
						    (company/role above) never live inside the collapsed section. */}
						<Accordion className="rounded-lg border border-border px-3">
							<AccordionItem value="additional-details">
								<AccordionTrigger>
									<span className="flex items-center gap-1.5">
										<MagnifyingGlassIcon className="text-muted-foreground" />
										<Trans>Additional details</Trans>
									</span>
								</AccordionTrigger>
								<AccordionContent className="flex flex-col gap-4">
									<div className="grid grid-cols-2 gap-3">
										<Field label={t`Location`} htmlFor="application-location">
											<Input
												id="application-location"
												value={form.location}
												list="application-locations"
												placeholder={t`Remote, Hybrid, a city…`}
												onChange={(event) => set("location", event.target.value)}
											/>
											<datalist id="application-locations">
												<option value="Remote" />
												<option value="Hybrid" />
												<option value="In-office" />
											</datalist>
										</Field>
										<Field label={t`Salary range`} htmlFor="application-salary">
											<Input
												id="application-salary"
												value={form.salary}
												onChange={(event) => set("salary", event.target.value)}
											/>
										</Field>
									</div>

									<div className="grid grid-cols-2 gap-3">
										<Field label={t`Source`} htmlFor="application-source">
											<Input
												id="application-source"
												value={form.source}
												list="application-sources"
												placeholder={t`LinkedIn, Referral…`}
												onChange={(event) => set("source", event.target.value)}
											/>
											<datalist id="application-sources">
												{SOURCE_OPTIONS.map((option) => (
													<option key={option} value={option} />
												))}
											</datalist>
										</Field>
										<Field label={t`Stage`}>
											<Combobox
												className="w-full"
												value={form.status}
												options={stageOptions.map((s) => ({ value: s.value, label: s.label }))}
												onValueChange={(value) => value && set("status", value)}
											/>
										</Field>
									</div>

									<Field label={t`Job posting link`} htmlFor="application-source-url">
										<Input
											id="application-source-url"
											type="url"
											value={form.sourceUrl}
											placeholder="https://…"
											onChange={(event) => set("sourceUrl", event.target.value)}
										/>
									</Field>

									{!isEditing && (
										<Field label={t`Stage date`} htmlFor="application-stage-date">
											<Input
												id="application-stage-date"
												type="date"
												value={form.stageEnteredAt}
												onChange={(event) => set("stageEnteredAt", event.target.value)}
											/>
										</Field>
									)}

									{/* Resume: link a live resume (unlocks AI) or upload the exact PDF you sent. */}
									<Field label={t`Resume`}>
										<div className="flex flex-col gap-2">
											<Combobox
												className="w-full"
												value={form.resumeId || null}
												options={resumeOptions}
												placeholder={t`Link a resume (recommended)`}
												showClear
												emptyMessage={t`No resumes yet.`}
												onValueChange={(value) => set("resumeId", value ?? "")}
											/>
											{(resumes ?? []).length === 0 && (
												<div className="flex flex-wrap gap-2">
													<Button type="button" size="sm" variant="outline" onClick={() => leaveFlowToResume("create")}>
														<PlusIcon />
														<Trans>Create a resume</Trans>
													</Button>
													<Button type="button" size="sm" variant="outline" onClick={() => leaveFlowToResume("import")}>
														<DownloadSimpleIcon />
														<Trans>Import a resume</Trans>
													</Button>
												</div>
											)}
											<FileAttachmentField
												value={form.resumeFile}
												attachLabel={t`Or upload a resume PDF`}
												onChange={(value) => set("resumeFile", value)}
											/>
											<p className="text-[11px] text-muted-foreground">
												<Trans>Link a resume to use AI match scoring and tailoring.</Trans>
											</p>
										</div>
									</Field>

									<Field label={t`Cover letter`}>
										<FileAttachmentField
											value={form.coverLetter}
											attachLabel={t`Attach a cover letter (PDF)`}
											onChange={(value) => set("coverLetter", value)}
										/>
									</Field>

									<Field label={t`Tags`}>
										<TagsField value={form.tags} suggestions={allTags ?? []} onChange={(tags) => set("tags", tags)} />
									</Field>

									<div className="grid grid-cols-2 gap-3">
										<Field label={t`Follow-up date`} htmlFor="application-follow-up-date">
											<Input
												id="application-follow-up-date"
												type="date"
												value={form.followUpAt}
												onChange={(event) => set("followUpAt", event.target.value)}
											/>
										</Field>
										<Field label={t`Follow-up note`} htmlFor="application-follow-up-note">
											<Input
												id="application-follow-up-note"
												value={form.followUpNote}
												onChange={(event) => set("followUpNote", event.target.value)}
											/>
										</Field>
									</div>

									<Field label={t`Notes`} htmlFor="application-notes">
										<Textarea
											id="application-notes"
											value={form.notes}
											rows={3}
											placeholder={t`Referred by…, things to emphasize, etc.`}
											onChange={(event) => set("notes", event.target.value)}
										/>
									</Field>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</div>

					<SheetFooter className="flex-row justify-end gap-2">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={pending}>
							{isEditing ? <Trans>Save changes</Trans> : <Trans>Add to pipeline</Trans>}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

// Provider availability hint: loading, load failure, not configured, or ready. Never blocks
// manual editing or saving — it only explains and gates the AI extraction button.
function AiAvailabilityHint({
	loading,
	error,
	usable,
	pending,
}: {
	loading: boolean;
	error: boolean;
	usable: boolean;
	pending: boolean;
}) {
	if (loading) {
		return (
			<p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<Spinner className="size-3" />
				<Trans>Checking AI setup…</Trans>
			</p>
		);
	}
	if (error) {
		return (
			<p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<WarningCircleIcon className="shrink-0 text-amber-600" />
				<span>
					<Trans>Couldn't check your AI setup.</Trans>{" "}
					<Link to={AI_SETTINGS_HREF} className="text-primary hover:underline">
						<Trans>Review AI settings</Trans>
					</Link>
				</span>
			</p>
		);
	}
	if (!usable) {
		return (
			<p className="text-[11px] text-muted-foreground">
				<Trans>No AI model configured — fields stay fully editable by hand.</Trans>{" "}
				<Button
					type="button"
					size="sm"
					variant="link"
					className="h-auto p-0 text-[11px]"
					render={<Link to={AI_SETTINGS_HREF} />}
				>
					<Trans>Configure AI</Trans>
				</Button>
			</p>
		);
	}
	return (
		<p className="text-[11px] text-muted-foreground">
			{pending ? <Trans>Reading the posting…</Trans> : <Trans>Extraction runs only when you click the button.</Trans>}
		</p>
	);
}

type FieldProps = {
	label: string;
	htmlFor?: string;
	required?: boolean;
	error?: string;
	children: React.ReactNode;
};

function Field({ label, htmlFor, required, error, children }: FieldProps) {
	// Fields whose control is not a single labelled input (attachments, tag editor, comboboxes
	// with their own id) render the label as a heading instead of a <label>.
	const labelNode = htmlFor ? (
		<Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
			{label}
			{required && (
				<span aria-hidden="true" className="text-destructive">
					{" *"}
				</span>
			)}
		</Label>
	) : (
		<span className="flex select-none items-center gap-2 font-medium text-muted-foreground text-xs leading-none">
			{label}
			{required && (
				<span aria-hidden="true" className="text-destructive">
					{" *"}
				</span>
			)}
		</span>
	);

	return (
		<div className="grid gap-1.5">
			{labelNode}
			{children}
			{error && (
				<p id={`${htmlFor}-error`} role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}

type TagsFieldProps = {
	value: string[];
	suggestions: string[];
	onChange: (tags: string[]) => void;
};

// Type-and-Enter tag input with chips + an autocomplete datalist of the user's existing tags.
// Enter is handled here so it never submits the surrounding form mid-tag.
function TagsField({ value, suggestions, onChange }: TagsFieldProps) {
	const [draft, setDraft] = useState("");

	const add = () => {
		const tag = draft.trim();
		if (!tag || value.includes(tag)) {
			setDraft("");
			return;
		}
		onChange([...value, tag]);
		setDraft("");
	};

	return (
		<div className="flex flex-col gap-2">
			<Input
				value={draft}
				list="application-tags"
				aria-label={t`Add a tag`}
				placeholder={t`Add a tag and press Enter…`}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						event.stopPropagation();
						add();
					}
				}}
				onBlur={add}
			/>
			<datalist id="application-tags">
				{suggestions.map((tag) => (
					<option key={tag} value={tag} />
				))}
			</datalist>
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{value.map((tag) => (
						<span
							key={tag}
							className={cn(
								"inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs",
							)}
						>
							{tag}
							<button
								type="button"
								title={t`Remove tag`}
								className="hover:text-destructive"
								onClick={() => onChange(value.filter((item) => item !== tag))}
							>
								<XIcon className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}
