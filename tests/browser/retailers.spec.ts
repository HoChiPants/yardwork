import { test, expect } from "@playwright/test";
test("records a Lowe's snapshot and keeps purchase links and handoff in the selected retailer", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Record store snapshot", exact: true })
    .click();
  await page
    .getByLabel("Snapshot retailer", { exact: true })
    .selectOption("lowes");
  await page
    .getByLabel("Lowe's product URL", { exact: true })
    .fill("https://www.lowes.com/pd/test/1114951");
  await expect(
    page.getByLabel("Retailer product number", { exact: true }),
  ).toHaveValue("1114951");
  await page.getByLabel("Unit price (USD)", { exact: true }).fill("4.75");
  await page.getByLabel("Available stock units", { exact: true }).fill("16");
  await page.getByLabel("Exact store number", { exact: true }).fill("101");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await expect(page.locator(".store-card")).toContainText("Lowe's sourcing");
  await expect(page.locator(".bom-row")).toContainText(
    "Snapshot · 16 available",
  );
  await expect(
    page.getByRole("link", { name: /Find at Lowe's/ }),
  ).toHaveAttribute("href", "https://www.lowes.com/pd/test/1114951");
  await page
    .getByRole("button", { name: "Prepare Lowe's list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Native Lowe's list import and account synchronization have not been verified",
  );
  await expect(
    page.getByRole("textbox", { name: "Lowe's material list", exact: true }),
  ).toContainText("Retailer: Lowe's");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page
    .getByLabel("Project retailer", { exact: true })
    .selectOption("home-depot");
  await expect(
    page.getByLabel("Exact store number", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".bom-row")).toContainText(
    "Availability unverified",
  );
});
