import type { ApplicationDetail } from "../types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	ArrowsClockwiseIcon,
	CaretRightIcon,
	CheckCircleIcon,
	CopyIcon,
	EnvelopeSimpleIcon,
	MagicWandIcon,
	PaperPlaneTiltIcon,
	SparkleIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { CoverLetterEditorDialog } from "@/features/cover-letters/editor-dialog";
import { useHasUsableAiProvider } from "@/features/settings/integrations/hooks/use-has-usable-ai-provider";
import { orpc } from "@/libs/orpc/client";
import { applicationsListQueryKey } from "../queries";

const AI_SETTINGS_HREF = "/dashboard/settings/integrations" as const;

// Score bands drive the ring color and the label — a job-fit gauge, not a generic percentage.
function band(score: number) {
	if (score >= 75) return { color: "#10b981", label: t`Strong fit` };
	if (score >= 50) return { color: "#f59e0b", label: t`Worth a shot` };
	return { color: "#f43f5e", label: t`A stretch` };
}

// The signature element: a circular resume-fit gauge that animates to the score.
function FitRing({ score }: { score: number }) {
	const size = 60;
	const stroke = 5;
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const { color } = band(score);
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth={stroke}
				className="text-muted"
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke={color}
				strokeWidth={stroke}
				strokeLinecap="round"
				strokeDasharray={c}
				strokeDashoffset={c - (Math.max(0, Math.min(100, score)) / 100) * c}
				className="transition-[stroke-dashoffset] duration-300 ease-out-strong motion-reduce:transition-none"
			/>
		</svg>
	);
}

type ActionRowProps = {
	icon: React.ReactNode;
	title: React.ReactNode;
	description: React.ReactNode;
	disabled?: boolean;
	disabledReason?: string;
	pending?: boolean;
	onClick: () => void;
};

function ActionRow({ icon, title, description, disabled, disabledReason, pending, onClick }: ActionRowProps) {
	return (
		<button
			type="button"
			disabled={disabled || pending}
			title={disabled ? disabledReason : undefined}
			aria-disabled={disabled || pending ? "true" : undefined}
			onClick={onClick}
			className={cn(
				"group/row flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
				"hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-45",
			)}
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				{pending ? <SpinnerGapIcon className="animate-spin" /> : icon}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-medium text-sm">{title}</span>
				<span className="block truncate text-muted-foreground text-xs">{description}</span>
			</span>
			<CaretRightIcon className="shrink-0 text-muted-foreground/50 transition-transform group-hover/row:translate-x-0.5" />
		</button>
	);
}

// One AI prerequisite with a direct action for whatever is missing — the point is that the
// user never has to click a failing AI button to discover why it fails.
function Prerequisite({
	done,
	pending,
	label,
	action,
}: {
	done: boolean;
	pending?: boolean;
	label: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<li className="flex items-center gap-2 py-1 text-xs">
			{done ? (
				<CheckCircleIcon weight="fill" className="shrink-0 text-emerald-600" />
			) : pending ? (
				<SpinnerGapIcon className="shrink-0 animate-spin text-muted-foreground" />
			) : (
				<WarningCircleIcon className="shrink-0 text-amber-600" />
			)}
			<span className={cn("min-w-0 flex-1", done ? "text-muted-foreground" : "font-medium")}>{label}</span>
			{!done && action}
		</li>
	);
}

type Props = { application: ApplicationDetail; onEdit?: (application: ApplicationDetail) => void };

export function ApplicationAiCopilot({ application, onEdit }: Props) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<{ kind: string; text: string } | null>(null);
	const [coverLetterId, setCoverLetterId] = useState<string | null>(null);
	// The tailored-copy result stays visible until the sheet closes — the toast alone left users
	// guessing where the copy went (T10/U4).
	const [tailored, setTailored] = useState<{ resumeId: string; name: string } | null>(null);

	const { hasUsableProvider, isLoading: providerLoading, error: providerError } = useHasUsableAiProvider();

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: applicationsListQueryKey() });
		void queryClient.invalidateQueries({
			queryKey: orpc.applications.getById.queryKey({ input: { id: application.id } }),
		});
	};

	const matchScore = useMutation(
		orpc.applications.ai.matchScore.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.add({ type: "error", description: error.message || t`Match scoring failed.` }),
		}),
	);
	const tailorResume = useMutation(
		orpc.applications.ai.tailorResume.mutationOptions({
			onSuccess: (result) => {
				invalidate();
				setTailored({ resumeId: result.resumeId, name: result.name });
			},
			onError: (error) => toast.add({ type: "error", description: error.message || t`Tailoring failed.` }),
		}),
	);
	const draftMessage = useMutation(
		orpc.applications.ai.draftMessage.mutationOptions({
			onSuccess: (result, variables) => {
				if (result.coverLetterId) {
					setDraft(null);
					setCoverLetterId(result.coverLetterId);
					void queryClient.invalidateQueries({ queryKey: orpc.coverLetters.list.key() });
				} else {
					setDraft({ kind: variables.kind, text: result.text });
				}
			},
			onError: (error) => toast.add({ type: "error", description: error.message || t`Drafting failed.` }),
		}),
	);
	const pending = matchScore.isPending || tailorResume.isPending || draftMessage.isPending;

	// Per-operation prerequisites. Scoring and tailoring need a linked resume plus the posting
	// text; drafting works from whatever context exists. Everything needs a tested provider.
	const providerReady = hasUsableProvider && !providerLoading && !providerError;
	const providerCheckFailed = !hasUsableProvider && !!providerError;
	const canScore = !!application.resumeId && !!application.jobDescription && providerReady;
	const score = application.aiScore ?? null;
	const scoreStale = score?.stale ?? false;
	const gaps = score?.gaps ?? [];

	const editForMissingInput = () => {
		if (onEdit) onEdit(application);
		else toast.add({ type: "info", description: t`Open this application's edit form to add the missing details.` });
	};

	const copyDraft = useCallback(async () => {
		try {
			if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
			await navigator.clipboard.writeText(draft?.text ?? "");
			toast.add({ type: "success", description: t`Copied to clipboard.` });
		} catch {
			toast.add({
				type: "error",
				description: t`Could not copy to clipboard. Please copy the text manually.`,
			});
		}
	}, [draft?.text]);

	const showPrerequisites =
		!score || scoreStale ? !(!!application.resumeId && !!application.jobDescription && providerReady) : false;

	return (
		<section className="overflow-hidden rounded-xl border border-primary/15 bg-primary/[0.04]">
			<header className="flex items-center gap-2 px-3.5 pt-3">
				<span className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<SparkleIcon weight="fill" className="size-3" />
				</span>
				<span className="font-medium text-sm">
					<Trans>Application Copilot</Trans>
				</span>
			</header>

			{/* Fit gauge — adapts to prerequisites, staleness, and whether a score exists. */}
			<div className="px-3.5 py-3">
				{score && scoreStale ? (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
						<p className="flex items-center gap-2 font-medium text-xs">
							<WarningCircleIcon className="shrink-0 text-amber-600" />
							<Trans>Content updated — the old score no longer applies.</Trans>
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="mt-2"
							disabled={pending || !providerReady}
							onClick={() => matchScore.mutate({ id: application.id })}
						>
							{matchScore.isPending ? <SpinnerGapIcon className="animate-spin" /> : <ArrowsClockwiseIcon />}
							<Trans>Re-score with current content</Trans>
						</Button>
					</div>
				) : score ? (
					<div className="flex items-center gap-3.5">
						<div className="relative flex items-center justify-center">
							<FitRing score={score.score} />
							<span className="absolute font-semibold text-base tabular-nums">{score.score}</span>
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm" style={{ color: band(score.score).color }}>
									{band(score.score).label}
								</span>
								<button
									type="button"
									disabled={pending || !providerReady}
									onClick={() => matchScore.mutate({ id: application.id })}
									className="text-muted-foreground text-xs hover:text-foreground disabled:opacity-50"
									title={t`Re-score`}
								>
									<ArrowsClockwiseIcon className={cn("size-3.5", matchScore.isPending && "animate-spin")} />
								</button>
							</div>
							{gaps.length > 0 && (
								<p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
									<Trans>Gaps:</Trans> {gaps.slice(0, 3).join(" · ")}
								</p>
							)}
						</div>
					</div>
				) : showPrerequisites ? (
					<div className="rounded-lg bg-muted/50 p-2.5">
						<p className="mb-1 font-medium text-xs">
							<Trans>Before scoring your fit:</Trans>
						</p>
						<ul>
							<Prerequisite
								done={!!application.resumeId}
								label={<Trans>A resume is linked to this application</Trans>}
								action={
									onEdit && (
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="h-6 px-2 text-[11px]"
											onClick={editForMissingInput}
										>
											<Trans>Choose resume</Trans>
										</Button>
									)
								}
							/>
							<Prerequisite
								done={!!application.jobDescription}
								label={<Trans>The job description has been pasted in</Trans>}
								action={
									onEdit && (
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="h-6 px-2 text-[11px]"
											onClick={editForMissingInput}
										>
											<Trans>Add it</Trans>
										</Button>
									)
								}
							/>
							<Prerequisite
								done={hasUsableProvider}
								pending={providerLoading}
								label={
									providerCheckFailed ? (
										<Trans>AI setup could not be checked</Trans>
									) : (
										<Trans>An AI model is configured and tested</Trans>
									)
								}
								action={
									providerLoading ? undefined : (
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="h-6 px-2 text-[11px]"
											render={<Link to={AI_SETTINGS_HREF} />}
										>
											{providerCheckFailed ? <Trans>Review AI settings</Trans> : <Trans>Configure AI</Trans>}
										</Button>
									)
								}
							/>
						</ul>
					</div>
				) : (
					<button
						type="button"
						disabled={pending}
						onClick={() => matchScore.mutate({ id: application.id })}
						className="flex w-full items-center gap-3 rounded-lg border border-primary/20 border-dashed p-2.5 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
					>
						<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							{matchScore.isPending ? (
								<SpinnerGapIcon className="size-5 animate-spin" />
							) : (
								<SparkleIcon className="size-5" />
							)}
						</span>
						<span>
							<span className="block font-medium text-sm">
								{matchScore.isPending ? <Trans>Scoring your fit…</Trans> : <Trans>Score my fit</Trans>}
							</span>
							<span className="block text-muted-foreground text-xs">
								<Trans>See how this resume matches the posting</Trans>
							</span>
						</span>
					</button>
				)}
			</div>

			<div className="border-primary/10 border-t px-2 py-2">
				<ActionRow
					icon={<MagicWandIcon />}
					title={<Trans>Create a tailored copy</Trans>}
					description={t`Copies the resume and rewrites its summary for this job`}
					disabled={!canScore}
					disabledReason={t`Needs a linked resume, the job description, and a working AI model.`}
					pending={tailorResume.isPending}
					onClick={() => tailorResume.mutate({ id: application.id })}
				/>
				<ActionRow
					icon={<EnvelopeSimpleIcon />}
					title={<Trans>Draft a cover letter</Trans>}
					description={t`From your resume and the posting`}
					disabled={!providerReady || draftMessage.isPending}
					disabledReason={t`Needs a configured, tested AI model.`}
					pending={draftMessage.isPending && draftMessage.variables?.kind === "cover-letter"}
					onClick={() => draftMessage.mutate({ id: application.id, kind: "cover-letter" })}
				/>
				<ActionRow
					icon={<PaperPlaneTiltIcon />}
					title={<Trans>Draft a follow-up</Trans>}
					description={t`A friendly nudge for the recruiter`}
					disabled={!providerReady || draftMessage.isPending}
					disabledReason={t`Needs a configured, tested AI model.`}
					pending={draftMessage.isPending && draftMessage.variables?.kind === "follow-up"}
					onClick={() => draftMessage.mutate({ id: application.id, kind: "follow-up" })}
				/>
			</div>

			{tailored && (
				<div className="border-primary/10 border-t bg-card/60 p-3">
					<p className="font-medium text-xs">
						<Trans>
							Created “{tailored.name}” and linked it to this application. Only the summary was rewritten — the original
							resume is untouched.
						</Trans>
					</p>
					<Button
						type="button"
						size="sm"
						className="mt-2"
						render={<Link to="/builder/$resumeId" params={{ resumeId: tailored.resumeId }} />}
					>
						<Trans>Open the tailored resume</Trans>
					</Button>
				</div>
			)}

			{draft && (
				<div className="border-primary/10 border-t bg-card/60 p-3">
					<div className="mb-1.5 flex items-center justify-between">
						<span className="font-medium text-xs">
							{draft.kind === "cover-letter" ? <Trans>Cover letter draft</Trans> : <Trans>Follow-up draft</Trans>}
						</span>
						<div className="flex gap-1">
							<button
								type="button"
								className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
								onClick={() => void copyDraft()}
							>
								<CopyIcon className="size-3.5" /> <Trans>Copy</Trans>
							</button>
							<button
								type="button"
								className="text-muted-foreground text-xs hover:text-foreground"
								onClick={() => setDraft(null)}
							>
								<Trans>Dismiss</Trans>
							</button>
						</div>
					</div>
					<p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
						{draft.text}
					</p>
				</div>
			)}
			{coverLetterId && <CoverLetterEditorDialog letterId={coverLetterId} onClose={() => setCoverLetterId(null)} />}
		</section>
	);
}
