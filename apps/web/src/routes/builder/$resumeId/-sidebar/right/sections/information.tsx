import { Trans } from "@lingui/react/macro";
import { SectionBase } from "../shared/section-base";

export function InformationSectionBuilder() {
	return (
		<SectionBase type="information" className="space-y-4">
			<div className="space-y-2 rounded-md border bg-primary/5 p-5">
				<h4 className="font-medium tracking-tight">
					<Trans>Editing tips</Trans>
				</h4>

				<div className="space-y-2 text-muted-foreground text-xs leading-normal">
					<Trans>
						<p>Switch between resume sections in the left sidebar; manage template, layout, and styles here.</p>
						<p>When you are done, use Download at the top to export a PDF or a Word (DOCX) file.</p>
					</Trans>
				</div>
			</div>
		</SectionBase>
	);
}
