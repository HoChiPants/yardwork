import { addFramingLumber } from "../helpers/materialPlacement";
import { test, expect } from "@playwright/test";
test("records a Lowe's snapshot and keeps purchase links and handoff in the selected retailer", async ({
  page,
}) => {
  await page.goto("/");
  await addFramingLumber(page);
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
  await page
    .getByRole("button", { name: "Prepare Lowe's list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Native Lowe's list import and account synchronization have not been verified",
  );
  const checklist = page.getByRole("textbox", { name: "Lowe's material list", exact: true });
  await expect(checklist).toHaveValue(/Retailer: Lowe's/);
  await expect(checklist).toHaveValue(/https:\/\/www\.lowes\.com\/pd\/test\/1114951/);
  await expect(checklist).toHaveValue(/16 available at store 101/);
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
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(page.getByRole("list", { name: "Home Depot purchase review" })).toContainText("No recent store snapshot");
});
