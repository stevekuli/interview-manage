import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { APP_NAME } from "@reactive-resume/utils/brand";

export function SiteFooter() {
	return (
		<footer id="footer" className="border-t">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<div className="flex items-center gap-2.5">
					<BrandIcon variant="icon" className="size-7" />
					<span className="font-semibold tracking-tight">{APP_NAME}</span>
				</div>

				<nav
					aria-label={t`Footer`}
					className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm"
				>
					<Link to="/dashboard" className="hover:text-foreground">
						<Trans>Open workspace</Trans>
					</Link>
					<Link to="/ats-checker" className="hover:text-foreground">
						<Trans>ATS Checker</Trans>
					</Link>
				</nav>

				<p className="text-muted-foreground text-xs">
					<Trans>
						Released under the{" "}
						<a
							href="https://github.com/reactive-resume/reactive-resume/blob/main/LICENSE"
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2 hover:text-foreground"
						>
							MIT License
						</a>
						. v<bdi>{__APP_VERSION__}</bdi>
					</Trans>
				</p>
			</div>
		</footer>
	);
}
