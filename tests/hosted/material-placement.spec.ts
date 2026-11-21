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
  const art = (await tile.locator(".material-art").boundingBox())!;
  await page.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
  await page.mouse.down();
  await page.mouse.move(view!.x + view!.width * 0.68, view!.y + view!.height * 0.66, { steps: 8 });
  await expect(page.locator(".material-drag-preview.can-drop .material-art")).toBeVisible();
  await page.mouse.up();
  const placement = page.getByRole("dialog");
  await expect(page.locator(".material-drag-preview")).toHaveCount(0);
  await expect(placement.getByRole("radio")).toHaveCount(3);
  await expect(placement.getByRole("radio", { name: "8 ft" })).toBeChecked();
  await placement.getByRole("radio", { name: "12 ft" }).check();
  await placement.getByLabel("Finished length (optional) units", { exact: true }).selectOption("ft");
  await placement.getByRole("spinbutton", { name: "Needed finished length", exact: true }).fill("4");
  await expect(placement).toContainText("8 ft stock fits this cut with 4 ft less length to buy.");
  await placement.getByRole("button", { name: "Use 8 ft" }).click();
  await confirmMaterialPlacement(page);
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("96");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("48");
  await expect(page.getByRole("spinbutton", { name: "X", exact: true })).not.toHaveValue("0");
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

test("front-view drops stay at the workspace depth and ignore controls", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Front", exact: true }).click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/);
  const image = page.locator('[data-material-family="framing-2x4"] .material-art');
  await image.dragTo(page.getByRole("button", { name: "Fit project", exact: true }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const view = (await canvas.boundingBox())!;
  await image.dragTo(canvas, { targetPosition: { x: view.width * 0.72, y: view.height * 0.51 } });
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("60");
  await expect(page.getByRole("spinbutton", { name: "Z", exact: true })).toHaveValue("0");
});

test.describe("phone material placement", () => {
  test.use({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });

  test("touch-drag a treated post onto the workspace and open its separate details", async ({ page, context }) => {
    await page.goto("./");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/);
    const add = page.getByRole("button", { name: "Add 4 × 4 treated post", exact: true });
    const tile = page.locator(".material-card").filter({ has: add });
    await tile.scrollIntoViewIfNeeded();
    const source = (await tile.locator(".material-art").boundingBox())!;
    const view = (await canvas.boundingBox())!;
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: Math.min(start.x, view.x + view.width * 0.68), y: view.y + view.height * 0.7 };
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let i = 1; i <= 8; i++) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
        x: start.x + (end.x - start.x) * i / 8,
        y: start.y + (end.y - start.y) * i / 8,
      }] });
    }
    await expect(page.locator(".material-drag-preview.can-drop")).toBeVisible();
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByRole("dialog")).toHaveAccessibleName("4 × 4 treated post");
    await confirmMaterialPlacement(page, "8 ft");
    await page.getByRole("button", { name: "Part details" }).click();
    const details = page.getByRole("dialog", { name: "Inspector" });
    await expect(details).toBeVisible();
    await expect(details.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("48");
    await details.getByRole("button", { name: "Back to workspace" }).click();
    await expect(page.getByRole("button", { name: "Rename project", exact: true })).toBeVisible();
  });
});
