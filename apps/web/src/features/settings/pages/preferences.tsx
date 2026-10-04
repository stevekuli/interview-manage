import { Trans } from "@lingui/react/macro";
import { Label } from "@reactive-resume/ui/components/label";
import { LocaleCombobox } from "@/features/locale/combobox";
import { ThemeCombobox } from "@/features/theme/combobox";

export function PreferencesSettingsPage() {
	return (
		<div className="grid max-w-xl gap-6">
			<div className="grid gap-1.5">
				<Label className="mb-0.5">
					<Trans>Theme</Trans>
				</Label>
				<ThemeCombobox />
			</div>

			<div className="grid gap-1.5">
				<Label className="mb-0.5">
					<Trans>Language</Trans>
				</Label>
				<LocaleCombobox />
				<p className="text-muted-foreground text-xs">
					<Trans>Missing or imperfect translations? The interface falls back to English for untranslated text.</Trans>
				</p>
			</div>
		</div>
	);
}
