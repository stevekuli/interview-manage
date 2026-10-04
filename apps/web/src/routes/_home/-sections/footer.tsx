import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { Copyright } from "@/components/ui/copyright";
import { EASE_OUT_STRONG } from "@/libs/motion";

export function Footer() {
	return (
		<m.footer
			id="footer"
			className="border-t p-4 pb-8 md:p-8 md:pb-12"
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.45, ease: EASE_OUT_STRONG }}
		>
			<div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
				<div className="space-y-3">
					<div className="flex items-center gap-2.5">
						<BrandIcon variant="icon" className="size-8" />
						<h2 className="font-semibold text-lg tracking-tight">{APP_NAME}</h2>
					</div>
					<p className="max-w-xs text-muted-foreground text-sm leading-relaxed">
						<Trans>Put jobs, resumes, and application progress in one place.</Trans>
					</p>
					<nav aria-label={t`Footer`} className="flex items-center gap-4 text-muted-foreground text-sm">
						<Link to="/dashboard" className="hover:text-foreground">
							<Trans>Open workspace</Trans>
						</Link>
						<Link to="/ats-checker" className="hover:text-foreground">
							<Trans>ATS Checker</Trans>
						</Link>
					</nav>
				</div>

				<Copyright />
			</div>
		</m.footer>
	);
}
