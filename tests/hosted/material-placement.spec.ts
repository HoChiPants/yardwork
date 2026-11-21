import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addFramingLumber, confirmMaterialPlacement } from "../helpers/materialPlacement";
import { blank, part, projectSchema } from "../../src/model";
import { bom } from "../../src/engine";
import { planStockCutLayouts } from "../../src/recordStockCutLayout";
import { stockCutSequences } from "../../src/stockCutSequence";

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

test("place a finished board from a different stock length in the Cut pool", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  await addFramingLumber(page, "12 ft");
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Retained length", exact: true }).fill("6");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (1)", exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  const finished = dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true });
  await finished.fill("71.8");
  await expect(dialog.getByRole("button", { name: /Place from/ })).toHaveCount(0);
  await finished.fill("48");
  await expect(dialog).toContainText("Crosscut to 4 ft");
  await dialog.getByRole("button", { name: "Place from O001", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await page.getByRole("button", { name: "List", exact: true }).click();
  const materials = page.locator(".inspector-scroll .bom-row");
  await expect(materials).toHaveCount(1);
  await expect(materials.first()).toContainText("1 board");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const exported = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  const pieces = exported.pieces.filter(({ offcut }) => !offcut);
  expect(pieces.map(({ material, size }) => [material, size[1]])).toEqual([["stud-12", 72], ["stud-12", 48]]);
  expect(new Set(exported.pieces.map(({ cutStock }) => cutStock?.id)).size).toBe(1);
  expect(exported.pieces.find(({ offcut }) => offcut)?.size[1]).toBeCloseTo(23.75);
  expect(exported.history.find(({ offcutCut }) => offcutCut?.targetId === pieces[1].id)?.offcutCut?.cuts)
    .toEqual([{ kind: "crosscut", size: 48 }]);
  const guideDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain("Recorded offcut cut order");
  expect(guide).toContain("Crosscut to 4 ft");
  expect(guide).toContain("23.75 in");

  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "reused-board.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(materials).toHaveCount(1);
  await expect(materials.first()).toContainText("1 board");
  await materials.locator(".recorded-source-layout > summary").click();
  await expect(materials.getByRole("button", { name: "Inspect P001", exact: true })).toBeVisible();
  await expect(materials.getByRole("button", { name: "Inspect P002", exact: true })).toBeVisible();
  await expect(materials.getByRole("button", { name: "Inspect O002", exact: true })).toBeVisible();
});

test("a scheduled offcut warns about the prerequisite and adds it to the build guide", async ({ page }) => {
  const project = blank("Offcut from a scheduled board");
  project.pieces = [part("Initial rail", "stud", [1.5, 36, 3.5], [0, 18, 0], project.steps[0].id, "Bench")];
  const [sequence] = stockCutSequences(project, bom(project)).get("stud")!;
  const planned = planStockCutLayouts(project, [sequence.layout]).project;
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "pending-board.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(planned)),
  });
  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true }).fill("48");
  await expect(dialog).toContainText("Expected offcut");
  await expect(dialog).toContainText("Complete the source stock cut order first.");
  await dialog.getByRole("button", { name: /^Place from O/ }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toContain("Complete the source stock cut order before using this blank.");
  expect(guide).toContain("Crosscut to 4 ft");
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
