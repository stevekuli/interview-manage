// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

vi.stubGlobal("__APP_VERSION__", "9.9.9");

type LinkProps = React.PropsWithChildren<{
	to: string;
}>;

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, ...rest }: LinkProps) => (
		<a href={typeof to === "string" ? to : "#"} {...rest}>
			{children}
		</a>
	),
}));

i18n.loadAndActivate({ locale: "en", messages: {} });

const { Footer } = await import("./footer");

const renderFooter = () =>
	render(
		<I18nProvider i18n={i18n}>
			<Footer />
		</I18nProvider>,
	);

describe("Footer", () => {
	it("renders the workspace and ATS checker links", () => {
		const { container } = renderFooter();
		const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).map((a) => a.getAttribute("href"));
		expect(hrefs).toContain("/dashboard");
		expect(hrefs).toContain("/ats-checker");
	});

	it("keeps upstream promotion, donations, and socials out of the footer", () => {
		const { container } = renderFooter();
		const html = container.innerHTML;
		expect(html).not.toMatch(/rxresu\.me|opencollective|crowdin|discord|reddit|amruthpillai|linkedin|x\.com/i);
		expect(screen.queryByText("Sponsorships")).not.toBeInTheDocument();
	});

	it("includes the app version copy via Copyright", () => {
		renderFooter();
		// The version is wrapped in <bdi> for RTL isolation, so it is its own text node.
		expect(screen.getByText("9.9.9")).toBeInTheDocument();
	});
});
