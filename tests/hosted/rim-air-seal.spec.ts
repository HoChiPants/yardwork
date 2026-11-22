import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { applyCommand, blank } from "../../src/model";

test("measure floor rim bays, reuse foam and prepare an exact sheet and sealant can", async ({ page }) => {
  const project = applyCommand(blank("Rim air seal study"), {
    type: "foundation",
    width: 48,
    depth: 48,
    height: 12,
    spacing: 16,
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "rim-study.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How much sealant for my rim joists?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open rim air seal planner", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Floor base", exact: true })).toHaveValue(project.sections[0].id);
  await dialog.getByRole("spinbutton", { name: "Opening top below rim top", exact: true }).fill("0.25");
  await dialog.getByRole("spinbutton", { name: "Clearance per edge", exact: true }).fill("0.125");
  await dialog.getByRole("spinbutton", { name: "Measured cutting loss", exact: true }).fill("0.125");
  await dialog.getByRole("checkbox", { name: "Include Bay 1", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Bay 1 measured width", exact: true }).fill("13.75");
  await dialog.getByRole("spinbutton", { name: "Bay 1 measured height", exact: true }).fill("5");
  await dialog.getByRole("checkbox", { name: "Include Bay 2", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Bay 2 measured width", exact: true }).fill("14.5");
  await dialog.getByRole("spinbutton", { name: "Bay 2 measured height", exact: true }).fill("5");
  await dialog.getByRole("checkbox", { name: "Try a measured 2 in foam offcut first", exact: true }).check();
  await dialog.getByRole("textbox", { name: "Offcut label", exact: true }).fill("Foam sample");
  await dialog.getByRole("spinbutton", { name: "Offcut width", exact: true }).fill("14.25");
  await dialog.getByRole("spinbutton", { name: "Offcut length", exact: true }).fill("4.75");
  await dialog.getByRole("checkbox", { name: "Estimate edge sealant", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Seal fill depth", exact: true }).fill("0.5");
  await dialog.getByRole("spinbutton", { name: "Usable trial length per can", exact: true }).fill("10");
  await dialog.getByRole("textbox", { name: "Sealant work session", exact: true }).fill("Bench trial");
  const check = dialog.getByRole("button", { name: "Check fit and plan cuts", exact: true });
  await expect(check).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /I checked this air barrier boundary/ }).check();
  await check.click();
  const preview = dialog.getByRole("region", { name: "Rim seal cut preview", exact: true });
  await expect(preview).toContainText("1 new sheet for the reviewed plans · 1 measured offcut used");
  await expect(preview).toContainText("13.5 in × 4.75 in");
  await expect(preview).toContainText("14.25 in × 4.75 in");
  await expect(preview).toContainText("75.5 in along all four edges");
  await expect(preview).toContainText("1 can estimated · Bench trial");
  await preview.locator("summary").filter({ hasText: /^New sheet 1 ·/ }).click();
  await expect(preview.getByRole("img", { name: "New sheet 1 cut map", exact: true })).toBeVisible();
  await expect(preview.getByText(/^Keep reusable foam/).first()).toBeVisible();
  await preview.getByRole("button", { name: "Save rim seal plan", exact: true }).click();
  await dialog.getByRole("button", { name: "Show saved foam cuts in 3D", exact: true }).click();
  await expect(page.getByTestId("rim-seal-marker")).toHaveText("Rim foam cuts and edge seals");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Plan rim air sealing", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Show saved foam cuts in 3D", exact: true })).toBeVisible();
  await expect(dialog.getByRole("spinbutton", { name: "Usable trial length per can", exact: true })).toHaveValue("10");
  await expect(dialog).toContainText("1 can estimated · Bench trial");

  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/## Floor rim foam and air seals[\s\S]*Offcut Foam sample[\s\S]*Keep reusable foam/);
  expect(guide).toContain("75.5 in at 0.5 in fill depth");
  expect(guide).toContain("1 can of Great Stuff Gaps & Cracks");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const paste = dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true });
  await expect(paste).toHaveCount(0);
  await dialog.getByRole("button", { name: /Add 1 sheet of FOAMULAR NGX F-250/ }).click();
  await expect(paste).toHaveValue(/1 sheet.*Internet #345181221/);
  await dialog.getByRole("button", { name: /Add 1 can of Great Stuff Gaps & Cracks/ }).click();
  await expect(paste).toHaveValue(/1 sheet.*345181221[\s\S]*1 can.*312450325/);
});
