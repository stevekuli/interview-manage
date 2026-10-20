import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, TranslateIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Button } from "@reactive-resume/ui/components/button";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { LocaleCombobox } from "@/features/locale/combobox";
import { ThemeToggleButton } from "@/features/theme/toggle-button";

export function Header() {
	const [hidden, setHidden] = useState(false);
	const { scrollY } = useScroll();

	useMotionValueEvent(scrollY, "change", (current) => {
		setHidden(current > 32 && current > (scrollY.getPrevious() ?? 0));
	});

	return (
		<header
			data-hidden={hidden}
			className="fade-in animation-duration-300 fixed inset-x-0 top-0 z-50 animate-in border-transparent border-b bg-background/80 backdrop-blur-lg ease-out-strong [transition:translate_250ms_var(--ease-out-strong)] data-[hidden=true]:-translate-y-full"
		>
			<nav aria-label={t`Main navigation`} className="container mx-auto flex items-center gap-x-4 p-3 lg:px-12">
				{/* Same brand + labeled workspace entry as the homepage, so navigating between the
				    two public pages never re-identifies the site from an icon alone. */}
				<Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80" aria-label={APP_NAME}>
					<BrandIcon variant="icon" className="size-8" />
					<span className="font-semibold text-base tracking-tight">{APP_NAME}</span>
				</Link>

				<div className="ml-auto flex items-center gap-x-2">
					<LocaleCombobox
						render={
							<Button size="icon" variant="ghost" aria-label={t`Change language`}>
								<TranslateIcon />
							</Button>
						}
					/>

					<ThemeToggleButton />

					<Button variant="outline" size="sm" nativeButton={false} render={<Link to="/dashboard" />}>
						<Trans>Open workspace</Trans>
						<ArrowRightIcon aria-hidden="true" />
					</Button>
				</div>
			</nav>
		</header>
	);
}
