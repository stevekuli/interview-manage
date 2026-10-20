import type { Application } from "@/features/applications/types";
import { msg, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import {
	ArchiveIcon,
	ArrowsClockwiseIcon,
	BriefcaseIcon,
	CalendarDotsIcon,
	ChartBarIcon,
	DownloadSimpleIcon,
	FunnelIcon,
	KanbanIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	RowsIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import z from "zod";
import { Button } from "@reactive-resume/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@reactive-resume/ui/components/input-group";
import { Label } from "@reactive-resume/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { Separator } from "@reactive-resume/ui/components/separator";
import { Tabs, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { Combobox } from "@/components/ui/combobox";
import { ApplicationDetailSheet } from "@/features/applications/components/application-detail-sheet";
import { ApplicationFormSheet } from "@/features/applications/components/application-form-sheet";
import { ApplicationBoard } from "@/features/applications/components/board";
import { ApplicationCalendar } from "@/features/applications/components/calendar-view";
import { ExportApplicationsSheet } from "@/features/applications/components/export-applications-sheet";
import { ImportApplicationsSheet } from "@/features/applications/components/import-applications-sheet";
import { ApplicationInsights } from "@/features/applications/components/insights-view";
import { ApplicationTable } from "@/features/applications/components/table-view";
import { TodayActions } from "@/features/applications/components/today-actions";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { useApplicationSessionStore } from "@/features/applications/session-draft";
import { authClient } from "@/libs/auth/client";
import { orpc } from "@/libs/orpc/client";
import { DashboardHeader } from "../-components/header";

const SORT_OPTIONS = [
	{ value: "updated", label: msg`Last updated` },
	{ value: "applied", label: msg`Date applied` },
	{ value: "company", label: msg`Company A–Z` },
	{ value: "role", label: msg`Role A–Z` },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

const searchSchema = z.object({
	search: z.string().default(""),
	// Optional on purpose: absent means "no explicit choice", which lets small screens fall
	// back to the list while desktops fall back to the board. A value in the URL always wins.
	view: z.enum(["board", "table", "calendar", "insights"]).optional(),
	tags: z.array(z.string()).default([]),
	sort: z.enum(["updated", "applied", "company", "role"]).default("updated"),
	archived: z.boolean().default(false),
	create: z.boolean().default(false),
	applicationId: z.string().optional(),
});
type Search = z.output<typeof searchSchema>;
const defaultSearch: Partial<Search> = { search: "", tags: [], sort: "updated", archived: false, create: false };

export const Route = createFileRoute("/dashboard/applications/")({
	component: RouteComponent,
	validateSearch: searchSchema,
	search: { middlewares: [stripSearchParams(defaultSearch)] },
});

function RouteComponent() {
	const { i18n } = useLingui();
	const { search, view, tags, sort, archived, create, applicationId } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const [textSearch, setTextSearch] = useState(search);
	const [addOpen, setAddOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [editing, setEditing] = useState<Application | null>(null);
	const [selected, setSelected] = useState<Application | null>(null);

	// Editing from the detail panel: close the panel, open the edit form on the same application.
	const startEdit = (application: Application) => {
		setSelected(null);
		setEditing(application);
	};

	useEffect(() => {
		if (!create) return;

		setAddOpen(true);
		void navigate({ replace: true, search: (prev: Search) => ({ ...prev, create: false }) });
	}, [create, navigate]);

	const { data: session } = authClient.useSession();
	const userId = session?.user.id;
	const consumeResumeReturn = useApplicationSessionStore((state) => state.consumeResumeReturn);
	const { data: applications, isPending, error, refetch, isFetching } = useQuery(applicationsListQueryOptions());
	const { data: allTags } = useQuery(orpc.applications.tags.queryOptions());

	// Coming back from creating/importing a resume: reopen the sheet the user left, with the
	// session draft restored by the form itself. `null` means the (unsaved) new-application sheet.
	useEffect(() => {
		if (!userId || !applications) return;
		const targetId = consumeResumeReturn(userId);
		if (targetId === undefined) return;
		if (targetId === null) {
			setAddOpen(true);
			return;
		}
		const app = applications.find((application) => application.id === targetId);
		if (app) setEditing(app);
	}, [userId, applications, consumeResumeReturn]);

	// Mobile defaults to the single-column list; the board stays the desktop default. An
	// explicit view=… in the URL always wins, so a user's choice never flip-flops on resize.
	const isSmallScreen = useMediaQuery("(max-width: 639px)", { initializeWithValue: false });
	const effectiveView = view ?? (isSmallScreen ? "table" : "board");

	useEffect(() => {
		if (!applicationId || !applications) return;

		setSelected(applications.find((application) => application.id === applicationId) ?? null);
		void navigate({ replace: true, search: (prev: Search) => ({ ...prev, applicationId: undefined }) });
	}, [applicationId, applications, navigate]);

	// Board & table hide archived; tag/search filters + sort are applied client-side.
	const filtered = useMemo(() => {
		const query = textSearch.trim().toLowerCase();
		const rows = (applications ?? [])
			.filter((app) => archived || !app.archived)
			.filter((app) => tags.length === 0 || tags.every((tag: string) => app.tags.includes(tag)))
			.filter((app) => !query || app.company.toLowerCase().includes(query) || app.role.toLowerCase().includes(query));

		const compare: Record<SortKey, (a: Application, b: Application) => number> = {
			updated: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			applied: (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
			company: (a, b) => a.company.localeCompare(b.company),
			role: (a, b) => a.role.localeCompare(b.role),
		};
		return rows.sort(compare[sort as SortKey]);
	}, [applications, textSearch, tags, sort, archived]);

	const archivedCount = (applications ?? []).filter((app) => app.archived).length;

	// While loading render neither the empty state nor the board; a failed load falls back to the empty state.
	const isEmpty = !applications?.length;

	const setUrlSearch = (patch: Partial<Search>) => void navigate({ search: (prev: Search) => ({ ...prev, ...patch }) });

	return (
		<div className="flex h-[calc(100dvh-2rem)] flex-col gap-4">
			<DashboardHeader
				className="max-sm:flex-col max-sm:gap-y-3"
				icon={BriefcaseIcon}
				title={t`Applications`}
				actions={
					!isEmpty ? (
						<>
							<Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
								<DownloadSimpleIcon />
								<Trans>Export CSV</Trans>
							</Button>
							<Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
								<DownloadSimpleIcon />
								<Trans>Import CSV</Trans>
							</Button>
							<Button size="sm" onClick={() => setAddOpen(true)}>
								<PlusIcon />
								<Trans>Add application</Trans>
							</Button>
						</>
					) : undefined
				}
			/>

			<Separator />

			{isPending ? (
				<ListLoadingPlaceholder />
			) : error && !applications ? (
				<LoadErrorState onRetry={() => void refetch()} isRetrying={isFetching} />
			) : isEmpty ? (
				<EmptyState onAdd={() => setAddOpen(true)} onImport={() => setImportOpen(true)} />
			) : (
				<>
					{/* A background refresh failed: keep the loaded data visible and say so. */}
					{error && applications && (
						<div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
							<p className="flex items-center gap-2 text-muted-foreground">
								<WarningCircleIcon className="shrink-0 text-amber-600" />
								<Trans>Couldn't refresh — showing your saved data.</Trans>
							</p>
							<Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
								<ArrowsClockwiseIcon />
								<Trans>Retry</Trans>
							</Button>
						</div>
					)}

					{isSmallScreen && applications && (
						<TodayActions applications={applications.filter((app) => archived || !app.archived)} onOpen={setSelected} />
					)}

					{/* One row: search grows, filters stay fixed, icon-only view switcher on the right. */}
					<div className="flex items-center gap-2">
						<InputGroup className="min-w-24 max-w-72 flex-1">
							<InputGroupAddon align="inline-start">
								<MagnifyingGlassIcon />
							</InputGroupAddon>
							<InputGroupInput
								value={textSearch}
								placeholder={t`Search applications…`}
								onChange={(event) => setTextSearch(event.target.value)}
							/>
						</InputGroup>

						{/* Desktop: filters inline. Mobile: collapsed into the Filters popover below. */}
						{(allTags?.length ?? 0) > 0 && (
							<Combobox
								multiple
								className="w-40 min-w-0 shrink max-sm:hidden"
								value={tags}
								placeholder={t`Filter by tags`}
								options={(allTags ?? []).map((tag) => ({ value: tag, label: tag }))}
								onValueChange={(value) => setUrlSearch({ tags: value ?? [] })}
							/>
						)}

						{effectiveView !== "insights" && effectiveView !== "calendar" && (
							<Combobox
								className="w-40 min-w-0 shrink max-sm:hidden"
								value={sort}
								placeholder={t`Sort by…`}
								options={SORT_OPTIONS.map((option) => ({ value: option.value, label: i18n.t(option.label) }))}
								onValueChange={(value) => value && setUrlSearch({ sort: value as SortKey })}
							/>
						)}

						{archivedCount > 0 && effectiveView !== "insights" && (
							<Button
								size="sm"
								variant={archived ? "secondary" : "outline"}
								className="shrink-0 max-sm:hidden"
								onClick={() => setUrlSearch({ archived: !archived })}
							>
								<ArchiveIcon />
								<Trans>Archived</Trans> ({archivedCount})
							</Button>
						)}

						{/* Mobile-only: one button holds every filter so the row never overflows on a phone. */}
						{effectiveView !== "insights" && (
							<Popover>
								<PopoverTrigger
									render={
										<Button size="icon-sm" variant="outline" className="relative shrink-0 sm:hidden">
											<FunnelIcon />
											{(tags.length > 0 || archived) && (
												<span className="absolute end-1 top-1 size-1.5 rounded-full bg-primary" />
											)}
										</Button>
									}
								/>
								<PopoverContent align="end" className="w-64 p-3">
									{(allTags?.length ?? 0) > 0 && (
										<div className="space-y-1.5">
											<Label className="text-muted-foreground text-xs">
												<Trans>Filter by tags</Trans>
											</Label>
											<Combobox
												multiple
												className="w-full"
												value={tags}
												placeholder={t`Any tag`}
												options={(allTags ?? []).map((tag) => ({ value: tag, label: tag }))}
												onValueChange={(value) => setUrlSearch({ tags: value ?? [] })}
											/>
										</div>
									)}
									<div className="space-y-1.5">
										<Label className="text-muted-foreground text-xs">
											<Trans>Sort by</Trans>
										</Label>
										<Combobox
											className="w-full"
											value={sort}
											options={SORT_OPTIONS.map((option) => ({ value: option.value, label: i18n.t(option.label) }))}
											onValueChange={(value) => value && setUrlSearch({ sort: value as SortKey })}
										/>
									</div>
									{archivedCount > 0 && (
										<Button
											size="sm"
											variant={archived ? "secondary" : "outline"}
											className="w-full"
											onClick={() => setUrlSearch({ archived: !archived })}
										>
											<ArchiveIcon />
											<Trans>Archived</Trans> ({archivedCount})
										</Button>
									)}
								</PopoverContent>
							</Popover>
						)}

						<Tabs className="ms-auto shrink-0" value={effectiveView}>
							<TabsList>
								<TabsTrigger
									value="board"
									title={i18n.t(msg`Board`)}
									nativeButton={false}
									render={<Link to="." search={(p: Search) => ({ ...p, view: "board" })} />}
								>
									<KanbanIcon />
									<span className="sr-only">{i18n.t(msg`Board`)}</span>
								</TabsTrigger>
								<TabsTrigger
									value="table"
									title={i18n.t(msg`Table`)}
									nativeButton={false}
									render={<Link to="." search={(p: Search) => ({ ...p, view: "table" })} />}
								>
									<RowsIcon />
									<span className="sr-only">{i18n.t(msg`Table`)}</span>
								</TabsTrigger>
								<TabsTrigger
									value="calendar"
									title={i18n.t(msg`Calendar`)}
									nativeButton={false}
									render={<Link to="." search={(p: Search) => ({ ...p, view: "calendar" })} />}
								>
									<CalendarDotsIcon />
									<span className="sr-only">{i18n.t(msg`Calendar`)}</span>
								</TabsTrigger>
								<TabsTrigger
									value="insights"
									title={i18n.t(msg`Insights`)}
									nativeButton={false}
									render={<Link to="." search={(p: Search) => ({ ...p, view: "insights" })} />}
								>
									<ChartBarIcon />
									<span className="sr-only">{i18n.t(msg`Insights`)}</span>
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>

					<div className="flex min-h-0 flex-1 flex-col">
						{effectiveView !== "insights" && filtered.length === 0 ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
								<p className="font-medium text-sm">
									<Trans>No applications match your filters.</Trans>
								</p>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setTextSearch("");
										setUrlSearch({ search: "", tags: [], archived: false });
									}}
								>
									<Trans>Clear filters</Trans>
								</Button>
							</div>
						) : (
							<>
								{effectiveView === "board" && (
									<ApplicationBoard applications={filtered} onOpen={setSelected} onEdit={setEditing} />
								)}
								{effectiveView === "table" && (
									<ApplicationTable applications={filtered} onOpen={setSelected} onEdit={setEditing} />
								)}
								{effectiveView === "calendar" && (
									<ApplicationCalendar
										applications={filtered}
										allApplications={applications ?? []}
										onOpen={setSelected}
									/>
								)}
								{effectiveView === "insights" && <ApplicationInsights applications={applications ?? []} />}
							</>
						)}
					</div>
				</>
			)}

			<ApplicationFormSheet open={addOpen} onOpenChange={setAddOpen} />
			<ApplicationFormSheet open={!!editing} application={editing} onOpenChange={(open) => !open && setEditing(null)} />
			<ImportApplicationsSheet open={importOpen} onOpenChange={setImportOpen} />
			<ExportApplicationsSheet
				open={exportOpen}
				onOpenChange={setExportOpen}
				applications={applications ?? []}
				filtered={filtered}
			/>
			<ApplicationDetailSheet
				application={selected}
				onOpenChange={(open) => !open && setSelected(null)}
				onEdit={startEdit}
			/>
		</div>
	);
}

function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
				<BriefcaseIcon className="size-7 text-muted-foreground" />
			</div>
			<div className="max-w-md space-y-1.5">
				<h2 className="font-semibold text-lg">
					<Trans>Track your first application</Trans>
				</h2>
				<p className="text-muted-foreground text-sm">
					<Trans>
						Add a job you're applying to and link the resume you sent. Move it across the board as you hear back.
					</Trans>
				</p>
			</div>
			<div className="flex gap-2">
				<Button onClick={onAdd}>
					<PlusIcon />
					<Trans>Add application</Trans>
				</Button>
				<Button variant="outline" onClick={onImport}>
					<DownloadSimpleIcon />
					<Trans>Import from CSV</Trans>
				</Button>
			</div>
		</div>
	);
}

// Distinct loading, first-load-failure, and stale-data states, so a failed request never
// masquerades as "no applications yet".
function ListLoadingPlaceholder() {
	return (
		<div className="flex flex-1 flex-col gap-3" aria-busy="true" aria-live="polite">
			<span className="sr-only">
				<Trans>Loading your applications…</Trans>
			</span>
			{[0, 1, 2].map((row) => (
				<div key={row} className="h-16 animate-pulse rounded-xl bg-muted/60" />
			))}
		</div>
	);
}

function LoadErrorState({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
			<div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
				<WarningCircleIcon className="size-7 text-amber-600" />
			</div>
			<div className="max-w-md space-y-1.5">
				<h2 className="font-semibold text-lg">
					<Trans>Couldn't load your applications right now.</Trans>
				</h2>
				<p className="text-muted-foreground text-sm">
					<Trans>Check your connection and try again — nothing has been lost.</Trans>
				</p>
			</div>
			<Button onClick={onRetry} disabled={isRetrying}>
				<ArrowsClockwiseIcon />
				<Trans>Retry</Trans>
			</Button>
		</div>
	);
}
