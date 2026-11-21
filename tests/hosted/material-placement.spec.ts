import { expect, test } from "@playwright/test";
import { confirmMaterialPlacement } from "../helpers/materialPlacement";

const group = "2 × 4 framing lumber";

test("one material tile supports drop, length choice and a separate selected-part toolbar", async ({ page }, info) => {
  await page.goto("./");
  const add = page.getByRole("button", { name: `Add ${group}`, exact: true });
  const tile = page.locator(".material-card").filter({ has: add });
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveText(group);
  await expect(tile.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Home Depot sourcing", { exact: true })).toHaveCount(0);
  const canvas = page.locator("canvas").first();
  const view = await canvas.boundingBox();
  expect(view).not.toBeNull();
  await tile.dragTo(canvas, { targetPosition: { x: view!.width * 0.68, y: view!.height * 0.66 } });
  const placement = page.getByRole("dialog");
  await expect(placement.getByRole("radio")).toHaveCount(3);
  await expect(placement.getByRole("radio", { name: "8 ft" })).toBeChecked();
  await placement.getByRole("radio", { name: "12 ft" }).check();
  await placement.getByText("Compare a finished length", { exact: true }).click();
  await placement.getByRole("spinbutton", { name: "Needed finished length", exact: true }).fill("48");
  await expect(placement).toContainText("8 ft stock fits this cut with 4 ft less length to buy.");
  await placement.getByRole("button", { name: "Use 8 ft" }).click();
  await confirmMaterialPlacement(page);
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("96");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("48");
  const workspaceTools = page.getByRole("toolbar", { name: "Model tools", exact: true });
  const partTools = page.getByRole("toolbar", { name: "Selected part tools", exact: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const general = (await workspaceTools.boundingBox())!;
    const part = (await partTools.boundingBox())!;
    const ground = (await page.locator(".canvas-wrap").boundingBox())!;
    expect(part.y).toBeGreaterThanOrEqual(ground.y + ground.height - 1);
    expect(part.y).toBeGreaterThan(general.y + general.height);
    const viewTools = (await page.locator(".view-tools").boundingBox())!;
    expect(general.x + general.width).toBeLessThanOrEqual(viewTools.x + 1);
  }
  await page.screenshot({ path: info.outputPath("material-placement-phone.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await add.click();
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("120");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row").first()).not.toContainText(/Unpriced|\$/);
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toHaveCount(0);
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toBeVisible();
});
