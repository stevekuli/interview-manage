// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

type SectionBaseProps = {
	children: React.ReactNode;
};

vi.mock("../shared/section-base", () => ({
	SectionBase: ({ children }: SectionBaseProps) => <div>{children}</div>,
}));

const { InformationSectionBuilder } = await import("./information");

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

const renderInfo = () =>
	render(
		<I18nProvider i18n={i18n}>
			<InformationSectionBuilder />
		</I18nProvider>,
	);

describe("InformationSectionBuilder", () => {
	it("renders local editing tips instead of donation prompts", () => {
		renderInfo();
		expect(screen.getByText("Editing tips")).toBeInTheDocument();
		expect(screen.queryByText(/donate/i)).not.toBeInTheDocument();
	});

	it("keeps upstream promotion and external links out of the panel", () => {
		const { container } = renderInfo();
		expect(container.innerHTML).not.toMatch(/opencollective|rxresu\.me|github\.com|crowdin/i);
		expect(container.querySelector("a")).toBeNull();
	});
});
