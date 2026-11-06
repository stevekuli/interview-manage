import type { ResumeExportTarget } from "@reactive-resume/resume/export-sections";
import type { ReactElement, ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	CircleNotchIcon,
	DownloadSimpleIcon,
	EnvelopeSimpleIcon,
	EyeIcon,
	FileDocIcon,
	FileJsIcon,
	FilePdfIcon,
	FileTextIcon,
	MarkdownLogoIcon,
	SealCheckIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@reactive-resume/ui/components/dialog";
import { Switch } from "@reactive-resume/ui/components/switch";
import { Tabs, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { toast } from "@reactive-resume/ui/components/toast";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { cn } from "@reactive-resume/utils/style";
import { useResumeExport } from "./use-resume-export";
import { fetchResumeOriginalFileUrl, useResumeOriginalFile } from "./use-resume-original";

type DownloadableResume = Parameters<typeof useResumeExport>[0];

type ResumeDownloadDialogProps = {
	resume: DownloadableResume;
	trigger: (disabled: boolean) => ReactElement;
};

type FormatRowProps = {
	action: ReactElement;
	description: ReactNode;
	disabled?: boolean;
	icon: ReactElement;
	title: ReactNode;
};

function FormatRow({ action, description, disabled, icon, title }: FormatRowProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-background p-3 transition-opacity",
				disabled && "opacity-45",
			)}
		>
			<div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
				{icon}
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<h3 className="font-medium text-sm">{title}</h3>
				<p className="text-muted-foreground text-xs leading-normal">{description}</p>
			</div>
			{action}
		</div>
	);
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeDownloadDialog({ resume, trigger }: ResumeDownloadDialogProps) {
	const [open, setOpen] = useState(false);
	const [scope, setScope] = useState<ResumeExportTarget>("resume");
	const [includeCoverLetterHeader, setIncludeCoverLetterHeader] = useState(false);
	const includeHeaderSwitchId = useId();
	const { hasCoverLetter, isExporting, onDownloadDOCX, onDownloadJSON, onDownloadMarkdown, onDownloadPDF } =
		useResumeExport(resume);
	const disabled = !resume || isExporting;
	const originalFile = useResumeOriginalFile(resume?.id ?? "", open);

	const onDownloadOriginal = async () => {
		if (!resume?.id) return;
		setOpen(false);

		const url = await fetchResumeOriginalFileUrl(resume.id);
		if (!url) {
			toast.add({ type: "error", title: null, description: t`Could not load the original file. Please try again.` });
			return;
		}

		const response = await fetch(url);
		if (!response.ok) {
			toast.add({ type: "error", title: null, description: t`Could not load the original file. Please try again.` });
			return;
		}

		downloadWithAnchor(await response.blob(), originalFile.data?.filename ?? "original-file");
	};

	const onViewOriginal = async () => {
		if (!resume?.id) return;

		const url = await fetchResumeOriginalFileUrl(resume.id);
		if (!url) {
			toast.add({ type: "error", title: null, description: t`Could not load the original file. Please try again.` });
			return;
		}

		window.open(`${url}&inline=1`, "_blank", "noopener");
	};

	// Cover letter can't be the active scope when the resume has none (also guards a stale toggle).
	const activeScope: ResumeExportTarget = scope === "cover-letter" && !hasCoverLetter ? "resume" : scope;
	const jsonDisabled = activeScope === "cover-letter";

	const run = (action: () => void | Promise<void>) => {
		setOpen(false);
		void action();
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger(disabled)} />
			<DialogContent className="gap-5 sm:max-w-lg">
				<DialogHeader className="pe-8">
					<DialogTitle>
						<Trans>Download</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Pick a format for your resume or cover letter.</Trans>
					</DialogDescription>
				</DialogHeader>

				<Tabs value={activeScope} onValueChange={(value) => setScope(value as ResumeExportTarget)}>
					<TabsList className="h-11! w-full">
						<TabsTrigger value="resume">
							<FileTextIcon />
							<Trans>Resume</Trans>
						</TabsTrigger>
						<TabsTrigger value="cover-letter" disabled={!hasCoverLetter}>
							<EnvelopeSimpleIcon />
							<Trans>Cover letter</Trans>
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{activeScope === "cover-letter" && (
					<label
						htmlFor={includeHeaderSwitchId}
						className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3"
					>
						<Switch
							id={includeHeaderSwitchId}
							checked={includeCoverLetterHeader}
							onCheckedChange={setIncludeCoverLetterHeader}
						/>

						<span className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="font-medium text-sm">
								<Trans>Include resume header</Trans>
							</span>
							<span className="text-muted-foreground text-xs leading-normal">
								<Trans>Show the same first-page header on the cover letter.</Trans>
							</span>
						</span>
					</label>
				)}

				<div className="grid gap-2">
					{originalFile.data && (
						<FormatRow
							icon={
								originalFile.data.mediaType === "application/pdf" ? (
									<FilePdfIcon className="size-5" />
								) : (
									<FileDocIcon className="size-5" />
								)
							}
							title={originalFile.data.filename}
							description={
								<span className="flex flex-wrap items-center gap-2">
									<span>{formatFileSize(originalFile.data.size)}</span>
									{originalFile.data.unchanged ? (
										<Badge className="gap-1" variant="outline">
											<SealCheckIcon weight="fill" className="text-emerald-600" />
											<Trans>Matches current content</Trans>
										</Badge>
									) : (
										<Badge className="gap-1" variant="outline">
											<WarningCircleIcon weight="fill" className="text-amber-600" />
											<Trans>Content changed since import</Trans>
										</Badge>
									)}
								</span>
							}
							action={
								<div className="flex shrink-0 gap-2">
									{originalFile.data.mediaType === "application/pdf" && (
										<Button
											size="sm"
											variant="outline"
											aria-label="View original file"
											onClick={() => void onViewOriginal()}
										>
											<EyeIcon />
											<Trans>View</Trans>
										</Button>
									)}
									<Button size="sm" aria-label="Download original file" onClick={() => void onDownloadOriginal()}>
										<DownloadSimpleIcon />
										<Trans>Download</Trans>
									</Button>
								</div>
							}
						/>
					)}

					<FormatRow
						icon={
							isExporting ? <CircleNotchIcon className="size-5 animate-spin" /> : <FilePdfIcon className="size-5" />
						}
						title="PDF"
						description={<Trans>Best for applications, sharing, and printing.</Trans>}
						action={
							<Button
								size="sm"
								aria-label="Download PDF"
								disabled={isExporting}
								onClick={() => run(() => onDownloadPDF(activeScope, { includeCoverLetterHeader }))}
							>
								<DownloadSimpleIcon />
								<Trans>Download</Trans>
							</Button>
						}
					/>

					<FormatRow
						icon={<FileDocIcon className="size-5" />}
						title="DOCX"
						description={<Trans>Editable in Word, Google Docs, and Pages.</Trans>}
						action={
							<Button
								size="sm"
								variant="outline"
								aria-label="Download DOCX"
								disabled={isExporting}
								onClick={() => run(() => onDownloadDOCX(activeScope))}
							>
								<DownloadSimpleIcon />
								<Trans>Download</Trans>
							</Button>
						}
					/>

					<FormatRow
						icon={<MarkdownLogoIcon className="size-5" />}
						title="Markdown"
						description={<Trans>Plain text, for AI tools and quick edits.</Trans>}
						action={
							<Button
								size="sm"
								variant="outline"
								aria-label="Download Markdown"
								disabled={isExporting}
								onClick={() => run(() => onDownloadMarkdown(activeScope))}
							>
								<DownloadSimpleIcon />
								<Trans>Download</Trans>
							</Button>
						}
					/>

					<FormatRow
						disabled={jsonDisabled}
						icon={<FileJsIcon className="size-5" />}
						title="JSON"
						description={<Trans>Full resume data for backup or import.</Trans>}
						action={
							<Button
								size="sm"
								variant="outline"
								aria-label="Download JSON"
								disabled={jsonDisabled}
								onClick={() => run(onDownloadJSON)}
							>
								<DownloadSimpleIcon />
								<Trans>Download</Trans>
							</Button>
						}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
