import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";
import { weatherWatch } from "../../src/roofValleyReference";
import type { RoofValleyInput } from "../../src/roofValleySchema";

test("plan a modeled roof valley, apply offcut credit and reopen the measured cut plan", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("How do I line a roof valley?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open roof valley planner", exact: true }).click();
  const sampleDownload = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download the roof valley study", exact: true }).click();
  const sample = await readFile((await (await sampleDownload).path())!);
  const roof = projectSchema.parse(JSON.parse(sample.toString("utf8")));
  expect(roof.pieces).toHaveLength(8);
  const input: RoofValleyInput = {
    panels: roof.pieces.map(({ id }) => id).sort(),
    label: "Kitchen addition valley", length: 312, peakExtra: 18, lap: 6, fieldConfirmed: true,
    offcut: { label: "Leftover A", width: weatherWatch.width, length: 144 },
  };
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "roof-valley.yardwork.json", mimeType: "application/json", buffer: sample,
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Checks(?: \d+)?$/ }).click();
  await page.getByRole("button", { name: "Plan roof valley lining", exact: true }).click();
  await expect(dialog).toContainText("26 ft modeled downhill run");
  await dialog.getByRole("textbox", { name: "Valley name", exact: true }).fill(input.label);
  await dialog.getByRole("spinbutton", { name: "Measured valley length", exact: true }).fill("26");
  await dialog.getByRole("spinbutton", { name: "Extension past valley peak", exact: true }).fill("18");
  await dialog.getByRole("checkbox", { name: /^Try a clean 36 in WeatherWatch offcut/ }).check();
  await dialog.getByRole("textbox", { name: "Offcut label", exact: true }).fill(input.offcut!.label);
  await dialog.getByRole("spinbutton", { name: "Measured offcut length", exact: true }).fill("144");
  const previewButton = dialog.getByRole("button", { name: "Check valley and plan cuts", exact: true });
  await expect(previewButton).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /^I measured this closed shingle valley/ }).check();
  await previewButton.click();
  const preview = dialog.getByRole("region", { name: "Valley lining cut preview" });
  await expect(preview).toContainText("Cut 12 ft at full width");
  await expect(preview).toContainText("Cut 16 ft at full width");
  await expect(preview).toContainText("138 in from the eave");
  await expect(preview).toContainText("1 new roll for the reviewed valleys");
  await expect(preview).toContainText("34 ft reusable length left");
  await preview.getByRole("button", { name: "Save valley lining plan", exact: true }).click();
  await expect(dialog).toContainText("Valley lining plan saved.");
  await dialog.getByRole("button", { name: "Show valley centerline in 3D", exact: true }).click();
  await expect(page.getByTestId("roof-valley-marker")).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const purchases = dialog.getByRole("list", { name: "Home Depot purchase review" });
  const roll = purchases.getByRole("listitem").filter({ hasText: "#100083257" });
  await expect(roll).toHaveCount(0);
  await dialog.getByRole("button", { name: /^Add 1 roll of GAF WeatherWatch/ }).click();
  await expect(roll).toContainText("1 roll");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  expect(projectSchema.parse((await saved()).project).roofValleys?.[0].input).toEqual(input);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: roof.name }).click();
  await page.getByRole("button", { name: /^Checks(?: \d+)?$/ }).click();
  await page.getByRole("button", { name: "Plan roof valley lining", exact: true }).click();
  await expect(dialog).toContainText("Valley lining plan saved.");
  await expect(dialog.getByRole("spinbutton", { name: "Measured valley length", exact: true })).toHaveValue("26");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".print-guide .roof-valley-print")).toContainText("strip 2 · cut 16 ft");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/## Roof valley membrane cuts[\s\S]*strip 2 · cut 16 ft, start 138 in/);
  expect(guide).toContain("Offcut Leftover A");
});
