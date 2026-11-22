import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("review a vertical vent through modeled roof decking and retain the flashing in the guide", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  const sample = new URL("../../public/examples/roofing/closed-valley.yardwork.json", import.meta.url);
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "roof-deck.yardwork.json", mimeType: "application/json", buffer: await readFile(sample),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("How do I flash a vent pipe through the roof?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open roof vent flashing planner", exact: true }).click();
  const measure = [
    ["Across from deck center", "0"], ["Downhill from deck center", "0"],
    ["Measured pipe outside diameter", "2.375"], ["Clearance around the pipe", "0.125"],
    ["From pipe to left flange edge", "9"], ["From pipe to uphill flange edge", "9"],
  ];
  for (const [name, value] of measure)
    await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  const check = dialog.getByRole("button", { name: "Check the opening and flashing", exact: true });
  await expect(check).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /^I measured a vertical pipe/ }).check();
  await check.click();
  const preview = dialog.getByRole("region", { name: "Roof vent flashing preview" });
  await expect(preview).toContainText("2.625 in across");
  await preview.getByRole("button", { name: "Save roof vent flashing plan", exact: true }).click();
  await dialog.getByRole("button", { name: "Show flashing and opening in 3D", exact: true }).click();
  await expect(page.getByTestId("roof-vent-marker")).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 1 piece of Oatey 2 in No-Calk roof flashing/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#204715523");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  const snapshot = projectSchema.parse((await saved()).project);
  expect(snapshot.roofVentFlashings?.[0].input).toMatchObject({ outsideDiameter: 2.375, radialClearance: 0.125, fieldConfirmed: true });
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: snapshot.name }).click();
  await expect(page.locator(".print-guide .roof-vent-flashing-print")).toContainText("2.625 in across");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/## Roof vent flashing[\s\S]*flange under the uphill courses/);
});
