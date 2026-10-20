import type { Application } from "../types";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, BellIcon, CalendarDotsIcon } from "@phosphor-icons/react";
import { dayKey, formatDuration } from "../interviews";
import { stageLabel } from "../labels";

type Props = {
	applications: Application[];
	onOpen: (application: Application) => void;
};

// Mobile "what needs me today" strip: interviews scheduled for today (viewer's timezone) and
// follow-ups that have come due. Deliberately excludes archived applications and terminal
// stages from follow-up nudges, and invents no deadlines that aren't already in the data.
export function TodayActions({ applications, onOpen }: Props) {
	const { i18n } = useLingui();
	const today = dayKey(new Date());

	const interviews = applications
		.flatMap((application) =>
			application.activity.filter((entry) => entry.type === "interview").map((entry) => ({ application, entry })),
		)
		.filter(({ entry }) => dayKey(new Date(entry.at)) === today)
		.sort((a, b) => new Date(a.entry.at).getTime() - new Date(b.entry.at).getTime());

	const followUps = applications
		.filter((app) => !app.archived && app.status !== "rejected" && app.followUpAt)
		.filter((app) => dayKey(new Date(app.followUpAt as Date)) <= today)
		.sort((a, b) => new Date(a.followUpAt as Date).getTime() - new Date(b.followUpAt as Date).getTime());

	if (interviews.length === 0 && followUps.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
			{interviews.length > 0 && (
				<section className="flex flex-col gap-1.5">
					<h2 className="flex items-center gap-1.5 font-semibold text-xs">
						<CalendarDotsIcon className="text-primary" />
						<Trans>Interviews today</Trans> ({interviews.length})
					</h2>
					{interviews.map(({ application, entry }) => (
						<button
							key={entry.id}
							type="button"
							className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-left text-sm hover:bg-muted/50"
							onClick={() => onOpen(application)}
						>
							<span className="min-w-0 flex-1 truncate font-medium">
								{application.company} — {application.role}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{new Date(entry.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ·{" "}
								{formatDuration(entry.durationMinutes, i18n.locale)}
							</span>
							<ArrowRightIcon className="shrink-0 text-muted-foreground" />
						</button>
					))}
				</section>
			)}

			{followUps.length > 0 && (
				<section className="flex flex-col gap-1.5">
					<h2 className="flex items-center gap-1.5 font-semibold text-xs">
						<BellIcon className="text-amber-600" />
						<Trans>Follow-ups due</Trans> ({followUps.length})
					</h2>
					{followUps.map((application) => (
						<button
							key={application.id}
							type="button"
							className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-left text-sm hover:bg-muted/50"
							onClick={() => onOpen(application)}
						>
							<span className="min-w-0 flex-1 truncate font-medium">
								{application.company} — {application.role}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs">{stageLabel(application.status)}</span>
							<ArrowRightIcon className="shrink-0 text-muted-foreground" />
						</button>
					))}
				</section>
			)}
		</div>
	);
}
