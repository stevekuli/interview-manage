import type { MessageDescriptor } from "@lingui/core";
import type { ApplicationStatus, InterviewKind } from "@reactive-resume/schema/applications/data";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { INTERVIEW_KINDS, STAGES } from "@reactive-resume/schema/applications/data";

// Display labels for application stages and interview kinds. Storage values (the schema enums)
// never change here — this file only maps an enum value to a Lingui message so every surface
// (board, filters, forms, timeline, stats) shows the same translated label and falls back to the
// raw value for unknown data written by newer/older versions.
const STAGE_MESSAGES: Record<ApplicationStatus, MessageDescriptor> = {
	saved: msg`Saved`,
	applied: msg`Applied`,
	screening: msg`Screening`,
	interview: msg`Interview`,
	offer: msg`Offer`,
	rejected: msg`Rejected`,
};

const INTERVIEW_KIND_MESSAGES: Record<InterviewKind, MessageDescriptor> = {
	screening: msg`Screening call`,
	technical: msg`Technical interview`,
	behavioral: msg`Behavioral interview`,
	onsite: msg`Onsite interview`,
	other: msg`Other interview`,
};

const fallbackMessage = (value: string): MessageDescriptor => ({
	id: value,
	comment: "Fallback for an unknown enum value",
	message: value,
});

export const stageMessage = (status: string): MessageDescriptor =>
	STAGE_MESSAGES[status as ApplicationStatus] ?? fallbackMessage(status);

export const interviewKindMessage = (kind: string): MessageDescriptor =>
	INTERVIEW_KIND_MESSAGES[kind as InterviewKind] ?? fallbackMessage(kind);

// Convenience for non-component callers and compact call sites. Components that already hold
// `i18n` from `useLingui()` can keep using `i18n.t(stageMessage(...))` — both read the same
// activated catalogs.
export const stageLabel = (status: string) => i18n.t(stageMessage(status));

export const interviewKindLabel = (kind: string) => i18n.t(interviewKindMessage(kind));

// Stage/kind metadata (value + color) with the label already translated for the active locale.
export type StageMeta = { value: ApplicationStatus; color: string; label: string };
export type InterviewKindMeta = { value: InterviewKind; color: string; label: string };

export const localizedStages = (): StageMeta[] =>
	STAGES.map((stage) => ({ value: stage.value, color: stage.color, label: stageLabel(stage.value) }));

export const localizedInterviewKinds = (): InterviewKindMeta[] =>
	INTERVIEW_KINDS.map((kind) => ({
		value: kind.value,
		color: kind.color,
		label: interviewKindLabel(kind.value),
	}));

export const stageMetaOf = (status: string): StageMeta | undefined =>
	localizedStages().find((stage) => stage.value === status);

export const interviewKindMetaOf = (kind: string): InterviewKindMeta | undefined =>
	localizedInterviewKinds().find((item) => item.value === kind);
