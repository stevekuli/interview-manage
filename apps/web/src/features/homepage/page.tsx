import type { ReactNode } from "react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRightIcon, BriefcaseIcon, DownloadSimpleIcon, SparkleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Button } from "@reactive-resume/ui/components/button";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { SiteFooter } from "./site-footer";

type Capability = {
	icon: ReactNode;
	title: ReactNode;
	description: ReactNode;
};

const primaryButtonClass = "min-h-12 px-6 text-base";

function Header() {
	return (
		<header className="border-b">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
				<Link to="/" className="flex items-center gap-2.5" aria-label={APP_NAME}>
					<BrandIcon variant="icon" className="size-8" />
					<span className="font-semibold text-base tracking-tight">{APP_NAME}</span>
				</Link>

				<Button variant="outline" size="sm" nativeButton={false} render={<Link to="/dashboard" />}>
					<Trans>Open workspace</Trans>
					<ArrowRightIcon aria-hidden="true" />
				</Button>
			</div>
		</header>
	);
}

function Hero() {
	return (
		<section
			className="mx-auto w-full max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24 sm:pb-20"
			aria-labelledby="hero-title"
		>
			<h1 id="hero-title" className="max-w-3xl font-bold text-4xl leading-tight tracking-tight sm:text-5xl">
				<Trans>Put jobs, resumes, and application progress in one place.</Trans>
			</h1>
			<p className="mt-5 max-w-2xl text-lg text-muted-foreground leading-relaxed">
				<Trans>
					{APP_NAME} keeps your job search organized: record each position, maintain your resumes, export PDF and Word
					files, and always know where every application stands.
				</Trans>
			</p>
			<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
				<Button size="lg" className={primaryButtonClass} nativeButton={false} render={<Link to="/dashboard" />}>
					<Trans>Start managing your job search</Trans>
					<ArrowRightIcon aria-hidden="true" />
				</Button>
				<Link to="/ats-checker" className="text-primary underline-offset-4 hover:underline">
					<Trans>Check resume readability (ATS)</Trans>
				</Link>
			</div>
		</section>
	);
}

function Capabilities() {
	const capabilities: Array<Capability & { id: string }> = [
		{
			id: "applications",
			icon: <BriefcaseIcon aria-hidden="true" />,
			title: <Trans>Applications &amp; tracking</Trans>,
			description: (
				<Trans>Keep every position in one board. Move each application across stages as you hear back.</Trans>
			),
		},
		{
			id: "resume-editing",
			icon: <BrandIcon variant="icon" className="size-6" />,
			title: <Trans>Resume editing</Trans>,
			description: <Trans>Maintain multiple structured resumes, pick a template layout, and edit every section.</Trans>,
		},
		{
			id: "export",
			icon: <DownloadSimpleIcon aria-hidden="true" />,
			title: <Trans>PDF / DOCX export</Trans>,
			description: <Trans>Export a polished PDF for submission, or a Word file when you need a few more edits.</Trans>,
		},
	];

	return (
		<section className="border-y bg-muted/40" aria-labelledby="capabilities-title">
			<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
				<h2 id="capabilities-title" className="font-semibold text-2xl tracking-tight sm:text-3xl">
					<Trans>What you can do today</Trans>
				</h2>
				<ul className="mt-8 grid gap-4 sm:grid-cols-3">
					{capabilities.map((capability) => (
						<li key={capability.id} className="rounded-lg border bg-background p-5">
							<div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-5">
								{capability.icon}
							</div>
							<h3 className="mt-4 font-semibold tracking-tight">{capability.title}</h3>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">{capability.description}</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

function AiNote() {
	return (
		<section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16" aria-labelledby="ai-title">
			<div className="rounded-lg border p-6 sm:p-8">
				<h2 id="ai-title" className="flex items-center gap-2 font-semibold text-xl tracking-tight">
					<SparkleIcon aria-hidden="true" className="size-5 text-primary" />
					<Trans>Optional AI assistance</Trans>
				</h2>
				<p className="mt-3 max-w-3xl text-muted-foreground leading-relaxed">
					<Trans>
						After you configure your own model provider, AI can score how well a linked resume matches a posting,
						produce a tailored copy of that resume, and draft cover letters or follow-up messages. The tailored copy
						currently only rewrites the resume's summary — everything else stays exactly as you wrote it. Without a
						provider, these actions stay manual — every core feature works either way.
					</Trans>
				</p>
			</div>
		</section>
	);
}

function Steps() {
	const { i18n } = useLingui();
	const steps = [
		msg`Create an account and sign in.`,
		msg`Add a position you are targeting.`,
		msg`Prepare a resume and link it to the position.`,
		msg`Export, apply, and update the status until you hear back.`,
	];

	return (
		<section className="border-t bg-muted/40" aria-labelledby="steps-title">
			<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
				<h2 id="steps-title" className="font-semibold text-2xl tracking-tight sm:text-3xl">
					<Trans>How it works</Trans>
				</h2>
				<ol className="mt-8 grid gap-6 sm:grid-cols-4">
					{steps.map((step, index) => (
						<li key={index} className="flex gap-3">
							<span
								aria-hidden="true"
								className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm"
							>
								{index + 1}
							</span>
							<p className="text-sm leading-relaxed">{i18n.t(step)}</p>
						</li>
					))}
				</ol>
				<div className="mt-10">
					<Button size="lg" className={primaryButtonClass} nativeButton={false} render={<Link to="/dashboard" />}>
						<Trans>Start managing your job search</Trans>
						<ArrowRightIcon aria-hidden="true" />
					</Button>
				</div>
			</div>
		</section>
	);
}

export function Homepage() {
	return (
		<div className="flex min-h-svh flex-col">
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:fixed focus:inset-s-4 focus:top-4 focus:z-100 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
			>
				<Trans>Skip to main content</Trans>
			</a>
			<Header />
			<main id="main-content" className="flex-1">
				<Hero />
				<Capabilities />
				<AiNote />
				<Steps />
			</main>
			<SiteFooter />
		</div>
	);
}
