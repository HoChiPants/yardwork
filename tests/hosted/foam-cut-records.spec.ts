import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema } from "../../src/model";

test("record a measured foam remnant, reopen its lineage and use it on another rim", async ({ page }) => {
  const project = projectSchema.parse(JSON.parse(await readFile("public/examples/air-sealing/rim-cut-pool.yardwork.json", "utf8")));
  project.name = "Rim cut record practice";
  project.rimFoamOffcuts!.find(({ label }) => label === "Foam B")!.length = 10;
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "rim-cut-records.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  async function openPool() {
    await page.getByRole("button", { name: "Cut pool (2)", exact: true }).click();
    await pool.getByText("Foam board offcuts (2)", { exact: true }).click();
  }
  await openPool();
  await pool.getByRole("button", { name: "Plan rim cuts", exact: true }).click();
  await dialog.getByText("Saved foam cut maps", { exact: true }).click();
  await dialog.getByRole("button", { name: "Record cuts for Offcut Foam B", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Keep remnant R1", exact: true }).check();
  await dialog.getByRole("textbox", { name: "R1 physical label", exact: true }).fill("B-R1");
  await dialog.getByRole("spinbutton", { name: "R1 measured width", exact: true }).fill("14.25");
  await dialog.getByRole("spinbutton", { name: "R1 measured length", exact: true }).fill("5.25");
  const saveCut = dialog.getByRole("button", { name: "Save cut record", exact: true });
  await expect(saveCut).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /I made and checked these cuts/ }).check();
  await saveCut.click();
  await expect(dialog.getByRole("alert")).toContainText("R1 exceeds its rectangle");
  await dialog.getByRole("spinbutton", { name: "R1 measured length", exact: true }).fill("5");
  await saveCut.click();
  await expect(dialog.getByRole("img", { name: "Cut Foam B cut map", exact: true })).toBeVisible();
  await expect(dialog).toContainText("R1 · B-R1 measured at 14.25 in × 5 in");
  await expect(dialog.getByRole("button", { name: "Record cuts for Offcut Foam B", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(pool.locator("article").filter({ hasText: "B-R1" }).filter({ hasText: "Cut from Foam B" })).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await openPool();
  await pool.getByText("Recorded foam cuts (1)", { exact: true }).click();
  await expect(pool.locator("article").filter({ hasText: "1 blank cut" })).toContainText("Foam B");

  await pool.getByRole("button", { name: "Plan rim cuts", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Rim side", exact: true }).selectOption("front");
  await expect(dialog.getByRole("checkbox", { name: "Include foam offcut Foam B", exact: true })).toHaveCount(0);
  await dialog.getByRole("spinbutton", { name: "Opening top below rim top", exact: true }).fill("0.25");
  await dialog.getByRole("spinbutton", { name: "Clearance per edge", exact: true }).fill("0.125");
  await dialog.getByRole("spinbutton", { name: "Measured cutting loss", exact: true }).fill("0.125");
  await dialog.getByRole("checkbox", { name: "Include Bay 2", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Bay 2 measured width", exact: true }).fill("14.5");
  await dialog.getByRole("spinbutton", { name: "Bay 2 measured height", exact: true }).fill("5");
  await dialog.getByRole("checkbox", { name: "Include foam offcut B-R1", exact: true }).check();
  await dialog.getByRole("checkbox", { name: /I checked this air barrier boundary/ }).check();
  await dialog.getByRole("button", { name: "Check fit and plan cuts", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Rim seal cut preview", exact: true });
  await expect(preview).toContainText("0 new sheets for the reviewed plans");
  await expect(preview.locator("summary").filter({ hasText: /^Offcut B-R1 ·/ })).toBeVisible();
  await preview.getByRole("button", { name: "Save rim seal plan", exact: true }).click();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can I reuse my foam offcuts for the rim?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(dialog).toContainText("The cut records cover 1 blank.");
  await expect(dialog).toContainText("2 Cut pool offcuts and 0 new foam sheets.");
});
