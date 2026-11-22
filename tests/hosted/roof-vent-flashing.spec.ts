import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { Matrix4, Vector3 } from "three";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";
import { reviewRoofVentFlashing } from "../../src/roofVentFlashing";

test("review a vertical vent through modeled roof decking and retain the flashing in the guide", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  const sample = new URL("../../public/examples/roofing/closed-valley.yardwork.json", import.meta.url);
  const model = projectSchema.parse(JSON.parse(await readFile(sample, "utf8")));
  const panelId = model.pieces[3].id;
  const target = reviewRoofVentFlashing(model, {
    panelId, across: 3, downhill: 4, outsideDiameter: 2.375, radialClearance: 0.125, flangeLeft: 9, flangeUphill: 9,
  }).geometry!.center;
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "roof-deck.yardwork.json", mimeType: "application/json", buffer: await readFile(sample),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  const canvas = page.locator("canvas").first();
  const readCamera = async () => JSON.parse(await canvas.getAttribute("data-workshop-camera") ?? "null");
  await expect.poll(async () => {
    const camera = await readCamera();
    return !!camera?.settled && Math.abs(camera.matrixWorldInverse[6]) > 0.99;
  }, { timeout: 30_000 }).toBe(true);
  const camera = await readCamera();
  const projected = new Vector3(...target).divideScalar(12)
    .applyMatrix4(new Matrix4().fromArray(camera.matrixWorldInverse))
    .applyMatrix4(new Matrix4().fromArray(camera.projectionMatrix));
  await canvas.click({ position: {
    x: (projected.x + 1) * camera.viewport.width / 2,
    y: (1 - projected.y) * camera.viewport.height / 2,
  } });
  await expect(page.getByText("Point A · exact coordinates", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done measuring", exact: true }).click();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("How do I flash a vent pipe through the roof?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open roof vent flashing planner", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Roof deck panel", exact: true }).selectOption(panelId);
  await dialog.getByRole("button", { name: "Use measured point on this panel", exact: true }).click();
  await expect.poll(async () => Number(await dialog.getByRole("spinbutton", { name: "Across from deck center", exact: true }).inputValue())).toBeCloseTo(3, 0);
  await expect.poll(async () => Number(await dialog.getByRole("spinbutton", { name: "Downhill from deck center", exact: true }).inputValue())).toBeCloseTo(4, 0);
  const measure = [
    ["Measured pipe outside diameter", "2.375"], ["Clearance around the pipe", "0.125"],
    ["From pipe to left flange edge", "9"], ["From pipe to uphill flange edge", "9"],
  ];
  for (const [name, value] of measure)
    await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  const check = dialog.getByRole("button", { name: "Check the opening and flashing", exact: true });
  await expect(check).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /^I measured a vertical pipe/ }).check();
  await dialog.getByRole("spinbutton", { name: "Clearance around the pipe", exact: true }).fill("0.25");
  await expect(check).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "Clearance around the pipe", exact: true }).fill("0.125");
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
