import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";

const field = (sheet: Locator, label: string) =>
	sheet
		.locator("label")
		.filter({ hasText: label })
		.locator("xpath=following-sibling::input | following-sibling::textarea")
		.first();

const openAddSheet = async (page: Page) => {
	await page.goto("/dashboard/applications");
	await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
	await page.getByRole("button", { name: "Add application" }).click();
	return page.getByRole("dialog", { name: "Add application" });
};

// The create toast overlays the sheet footer for a few seconds and intercepts real clicks on
// "Done"; wait for it to clear before pressing the button.
const clickDone = async (page: Page, dialog: Locator) => {
	// Close any toast first: it (and its exit animation) intercepts clicks over the sheet
	// footer, and its hover-pausable timer makes waiting unreliable.
	const closeButtons = page.locator('button[data-slot="toast-close"]');
	for (let i = 0; i < 5 && (await closeButtons.count()) > 0; i += 1) {
		await closeButtons
			.first()
			.click({ force: true })
			.catch(() => {});
	}
	await dialog.getByRole("button", { name: "Done" }).click();
};

const openJobDescription = async (sheet: Locator) => {
	await sheet.getByRole("button", { name: "Job description" }).click();
	return sheet.getByRole("textbox", { name: "Job description text" });
};

// R1: without any AI provider, the job description stays fully editable and savable, and no
// model call is even offered.
test("saves the job description by hand when no AI provider is configured", async ({ authPage: page }) => {
	const company = `E2E NoKey ${Date.now().toString(36)}`;
	const role = "Manual Pipeline Engineer";
	const jobDescription =
		"About the role. We are looking for an engineer to own our internal tooling. ".repeat(6) +
		"Responsibilities: ship reliable features, review code, and keep the pipeline green.";

	const sheet = await openAddSheet(page);
	const textarea = await openJobDescription(sheet);

	await expect(sheet.getByText("No AI model configured — fields stay fully editable by hand.")).toBeVisible();
	const fillButton = sheet.getByRole("button", { name: "Fill fields with AI" });
	await expect(fillButton).toBeDisabled();

	await textarea.fill(jobDescription);
	await field(sheet, "Company").fill(company);
	await field(sheet, "Role / title").fill(role);
	await sheet.getByRole("button", { name: "Add to pipeline" }).click();

	const addedDialog = page.getByRole("dialog", { name: "Application added" });
	await expect(addedDialog).toBeVisible();
	await clickDone(page, addedDialog);

	// Reopen through the detail sheet: the saved description must come back verbatim.
	await page
		.getByRole("button", { name: new RegExp(`${role}`) })
		.first()
		.click();
	const detail = page.getByRole("dialog", { name: role });
	await detail.getByRole("button", { name: "Edit" }).click();

	const editSheet = page.getByRole("dialog", { name: "Edit application" });
	const reopened = await openJobDescription(editSheet);
	await expect(reopened).toHaveValue(jobDescription);
});

// R6: incomplete submits surface field-level errors and focus the first invalid input, and the
// whole flow is completable with the keyboard alone.
test("shows field errors, focuses the first invalid field, and submits with Enter", async ({ authPage: page }) => {
	const company = `E2E Keyboard ${Date.now().toString(36)}`;

	const sheet = await openAddSheet(page);
	const companyField = field(sheet, "Company");
	await companyField.click();
	await page.keyboard.press("Enter");

	const companyError = sheet.getByText("Enter the company name.");
	await expect(companyError).toBeVisible();
	await expect(companyField).toBeFocused();

	await page.keyboard.type(company);
	await page.keyboard.press("Enter");

	await expect(sheet.getByText("Enter the role or job title.")).toBeVisible();
	await page.keyboard.type("Keyboard Flow Engineer");
	await page.keyboard.press("Enter");

	await expect(page.getByRole("dialog", { name: "Application added" })).toBeVisible();
});

// R2: a failed first load shows a retryable error instead of the first-use empty state, and a
// retry recovers the list. The oRPC client batches queries into POST /api/rpc/<first-path>/__batch__
// requests whose streaming body can't be inspected, so the outage is simulated by dropping every
// batch until the error state shows, then restoring the network for the retry.
test("offers a retry when the applications list fails to load", async ({ authPage: page }) => {
	// Seed one application first so a recovered retry shows the list, not the (valid) empty state.
	const company = `E2E Retry ${Date.now().toString(36)}`;
	const sheet = await openAddSheet(page);
	await field(sheet, "Company").fill(company);
	await field(sheet, "Role / title").fill("Recovery Engineer");
	await sheet.getByRole("button", { name: "Add to pipeline" }).click();
	const addedDialog = page.getByRole("dialog", { name: "Application added" });
	await expect(addedDialog).toBeVisible();
	await clickDone(page, addedDialog);

	await page.route("**/api/rpc/**__batch__", (route) => route.abort());
	await page.goto("/dashboard/applications");
	await expect(page.getByText("Couldn't load your applications right now.")).toBeVisible();
	await expect(page.getByText("Track your first application")).not.toBeVisible();

	await page.unrouteAll({ behavior: "ignoreErrors" });
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.getByPlaceholder("Search applications…")).toBeVisible();
	await expect(page.getByRole("button", { name: new RegExp(company) }).first()).toBeVisible();
});

// U3: on a phone the list is the default view, and stage changes work through buttons.
test("defaults to the list on mobile and moves stage without dragging", async ({ authPage: page }) => {
	const company = `E2E Mobile ${Date.now().toString(36)}`;
	const role = "Mobile Flow Engineer";

	await page.setViewportSize({ width: 390, height: 844 });

	const sheet = await openAddSheet(page);
	await field(sheet, "Company").fill(company);
	await field(sheet, "Role / title").fill(role);
	await sheet.getByRole("button", { name: "Add to pipeline" }).click();
	const addedDialog = page.getByRole("dialog", { name: "Application added" });
	await expect(addedDialog).toBeVisible();
	await clickDone(page, addedDialog);

	await page.goto("/dashboard/applications");
	await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();

	// The single-column list card is rendered; the kanban board is not.
	const card = page.getByRole("button", { name: new RegExp(`${role}`) }).first();
	await expect(card).toBeVisible();
	await expect(page.locator("header", { hasText: "Saved" }).locator("visible=true")).toHaveCount(0);

	await card.click();
	const detail = page.getByRole("dialog", { name: role });
	await detail.getByRole("button", { name: "Move to Applied" }).click();
	await expect(detail.getByRole("button", { name: "Move to Screening" })).toBeVisible();
});
