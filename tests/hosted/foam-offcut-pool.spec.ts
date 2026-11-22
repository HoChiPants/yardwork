import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { applyCommand, blank } from "../../src/model";

test("two measured Cut pool foam offcuts cover a rim without buying a new sheet", async ({ page }) => {
  const project = applyCommand(blank(`Foam pool practice ${crypto.randomUUID().slice(0, 8)}`), {
    type: "foundation", width: 48, depth: 48, height: 12, spacing: 16,
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "foam-pool-practice.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await pool.getByText("Foam board offcuts (0)", { exact: true }).click();
  for (const [name, width, length] of [["Foam A", "13.5", "4.75"], ["Foam B", "14.25", "6"]]) {
    await pool.getByRole("button", { name: "Add foam offcut", exact: true }).click();
    await pool.getByRole("textbox", { name: "Foam offcut label", exact: true }).fill(name);
    await pool.getByRole("spinbutton", { name: "Foam offcut width", exact: true }).fill(width);
    await pool.getByRole("spinbutton", { name: "Foam offcut length", exact: true }).fill(length);
    await pool.getByRole("button", { name: "Save foam offcut", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Cut pool (2)", exact: true })).toBeVisible();
  await pool.getByRole("button", { name: "Plan rim cuts", exact: true }).click();

  await dialog.getByRole("spinbutton", { name: "Opening top below rim top", exact: true }).fill("0.25");
  await dialog.getByRole("spinbutton", { name: "Clearance per edge", exact: true }).fill("0.125");
  await dialog.getByRole("spinbutton", { name: "Measured cutting loss", exact: true }).fill("0.125");
  for (const [bay, width] of [["Bay 1", "13.75"], ["Bay 2", "14.5"]]) {
    await dialog.getByRole("checkbox", { name: `Include ${bay}`, exact: true }).check();
    await dialog.getByRole("spinbutton", { name: `${bay} measured width`, exact: true }).fill(width);
    await dialog.getByRole("spinbutton", { name: `${bay} measured height`, exact: true }).fill("5");
  }
  await dialog.getByRole("checkbox", { name: "Include foam offcut Foam A", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Include foam offcut Foam B", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Estimate edge sealant", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Seal fill depth", exact: true }).fill("0.5");
  await dialog.getByRole("spinbutton", { name: "Usable trial length per can", exact: true }).fill("10");
  await dialog.getByRole("checkbox", { name: /I checked this air barrier boundary/ }).check();
  await dialog.getByRole("button", { name: "Check fit and plan cuts", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Rim seal cut preview", exact: true });
  await expect(preview).toContainText("0 new sheets for the reviewed plans · 2 measured offcuts used");
  await expect(preview).toContainText("1 can estimated");
  await preview.locator("summary").filter({ hasText: /^Offcut Foam B ·/ }).click();
  const map = preview.getByRole("img", { name: "Offcut Foam B cut map", exact: true });
  await expect(map).toBeVisible();
  await expect(map.locator('[data-foam-region="B1"] rect')).toHaveAttribute("width", "14.25");
  await expect(map.locator('[data-foam-region="R1"] rect')).toHaveAttribute("y", "4.875");
  await expect(map.locator('[data-foam-region="R1"] rect')).toHaveAttribute("height", "1.125");
  await expect(preview.getByRole("list", { name: "Offcut Foam B blanks and remnants", exact: true }))
    .toContainText("R1 · Expected remnant · 14.25 in × 1.125 in · 0 in right, 4.875 in down");
  await expect(preview.getByText(/^Keep reusable foam/).first()).toBeVisible();
  await preview.getByRole("button", { name: "Save rim seal plan", exact: true }).click();

  const side = dialog.getByRole("combobox", { name: "Rim side", exact: true });
  await side.selectOption("front");
  await expect(dialog.getByRole("checkbox", { name: "Include foam offcut Foam A", exact: true })).toBeDisabled();
  await side.selectOption("back");
  await expect(dialog.getByRole("checkbox", { name: "Include foam offcut Foam A", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(pool.locator("article").filter({ hasText: "Foam B" })).toContainText("1 planned cut");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await page.getByRole("button", { name: "Cut pool (2)", exact: true }).click();
  await pool.getByText("Foam board offcuts (2)", { exact: true }).click();
  await expect(pool.locator("article").filter({ hasText: "Foam A" })).toContainText("1 planned cut");
  await pool.getByRole("button", { name: "Plan rim cuts", exact: true }).click();
  await dialog.getByText("Saved foam cut maps", { exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Offcut Foam B cut map", exact: true })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Offcut Foam B cut order", exact: true })).toContainText(/B1 · .*Bay 2/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".rim-air-seal-print").getByRole("img", { name: "Offcut Foam A cut map" })).toBeVisible();
  await expect(page.locator(".rim-air-seal-print").getByRole("img", { name: "Offcut Foam B cut map" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can I reuse my foam offcuts for the rim?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(dialog).toContainText("2 Cut pool offcuts and 0 new foam sheets.");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/Offcut Foam A[\s\S]*Offcut Foam B[\s\S]*Keep reusable foam/);
  expect(guide).toMatch(/B1 · .*Bay 2[\s\S]*Keep reusable foam 14\.25 in × 1\.125 in · R1/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /Add .*sheet of FOAMULAR/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Add 1 can of Great Stuff Gaps & Cracks/ }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true })).toHaveValue(/1 can.*312450325/);
});
