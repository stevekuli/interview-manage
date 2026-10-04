// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

type LinkProps = React.PropsWithChildren<{
	to: string;
}>;

type LocaleComboboxProps = {
	render: React.ReactElement;
};

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, ...rest }: LinkProps) => (
		<a href={typeof to === "string" ? to : "#"} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("@/features/locale/combobox", () => ({
	LocaleCombobox: ({ render: renderProp }: LocaleComboboxProps) => renderProp,
}));
vi.mock("@/features/theme/toggle-button", () => ({
	ThemeToggleButton: () => <button type="button" data-testid="theme-toggle" />,
}));

i18n.loadAndActivate({ locale: "en", messages: {} });

const { Header } = await import("./header");

const renderHeader = () =>
	render(
		<I18nProvider i18n={i18n}>
			<Header />
		</I18nProvider>,
	);

describe("Header", () => {
	it("renders a homepage link with the brand icon", () => {
		const { container } = renderHeader();
		const home = Array.from(container.querySelectorAll("a")).find((a) => a.getAttribute("href") === "/");
		expect(home).toBeDefined();
		expect(home?.getAttribute("aria-label")).toBe("Go to homepage");
	});

	it("renders a dashboard link", () => {
		const { container } = renderHeader();
		const dashboard = Array.from(container.querySelectorAll("a")).find((a) => a.getAttribute("href") === "/dashboard");
		expect(dashboard).toBeDefined();
	});

	it("keeps upstream promotion out of the navigation", () => {
		const { getByTestId, queryByTestId, container } = renderHeader();
		expect(getByTestId("theme-toggle")).toBeInTheDocument();
		expect(queryByTestId("github-stars-button")).not.toBeInTheDocument();
		expect(container.innerHTML).not.toMatch(/github\.com|rxresu\.me/i);
	});

	it("labels the navigation landmark", () => {
		const { container } = renderHeader();
		const nav = container.querySelector("nav") as HTMLElement;
		expect(nav.getAttribute("aria-label")).toBe("Main navigation");
	});
});
