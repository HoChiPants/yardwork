import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addFramingLumber, confirmMaterialPlacement } from "../helpers/materialPlacement";
import { blank, part, projectSchema } from "../../src/model";
import { bom } from "../../src/engine";
import { planStockCutLayouts } from "../../src/recordStockCutLayout";
import { stockCutSequences } from "../../src/stockCutSequence";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";

const group = "2 × 4 framing lumber";

test("one material tile supports drop, length choice and a separate selected-part toolbar", async ({ page }, info) => {
  await page.goto("./");
  const add = page.getByRole("button", { name: `Add ${group}`, exact: true });
  const tile = page.locator(".material-card").filter({ has: add });
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveText(group);
  await expect(tile.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator(".material-list")).not.toContainText(/Home Depot|Lowe’s|SPF|\$/);
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  await expect.poll(() => canvas.evaluate((ground: HTMLCanvasElement) => {
    const sample = document.createElement("canvas");
    sample.width = 80;
    sample.height = 24;
    const context = sample.getContext("2d")!;
    context.drawImage(ground, ground.width * 0.2, ground.height * 0.65, ground.width * 0.6, ground.height * 0.2,
      0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    return new Set(pixels.filter((_, index) => index % 4 === 0)).size;
  })).toBeGreaterThan(5);
  const art = (await tile.locator(".material-art").boundingBox())!;
  const groundHint = (await page.getByText("Drag a material onto the grid.", { exact: true }).boundingBox())!;
  async function dragToGround() {
    await page.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
    await page.mouse.down();
    await page.mouse.move(groundHint.x + groundHint.width / 2, groundHint.y + groundHint.height / 2, { steps: 8 });
  }
  await dragToGround();
  await expect(page.locator(".material-drag-preview.can-drop")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,96,3.5]");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).not.toHaveAttribute("data-material-drop-point");
  await expect(canvas).not.toHaveAttribute("data-material-placement-preview");
  await dragToGround();
  await expect(page.locator(".material-drag-preview.can-drop .material-art")).toBeVisible();
  const dropPoint = (await canvas.getAttribute("data-material-drop-point"))!;
  const [x, y, z] = JSON.parse(dropPoint);
  expect(y).toBe(0);
  await page.mouse.up();
  const placement = page.getByRole("dialog");
  await expect(page.locator(".material-drag-preview")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-material-drop-point", dropPoint);
  expect((await placement.boundingBox())!.x).toBeGreaterThan(groundHint.x + groundHint.width);
  await expect(placement.getByRole("radio")).toHaveCount(3);
  await expect(placement.getByRole("radio", { name: "8 ft" })).toBeChecked();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,96,3.5]");
  await placement.getByRole("radio", { name: "12 ft" }).check();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,144,3.5]");
  await placement.getByLabel("Finished length (optional) units", { exact: true }).selectOption("ft");
  await placement.getByRole("spinbutton", { name: "Needed finished length", exact: true }).fill("4");
  await expect(placement).toContainText("8 ft stock fits this cut with 4 ft less length to buy.");
  await page.screenshot({ path: info.outputPath("stock-length-and-drop-point.png") });
  await placement.getByRole("button", { name: "Use 8 ft" }).click();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,48,3.5]");
  await placement.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-material-drop-point");
  await expect(canvas).not.toHaveAttribute("data-material-placement-preview");
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("24");
  await expect(page.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue(String(x));
  await expect(page.getByRole("spinbutton", { name: "Z", exact: true })).toHaveValue(String(z));
  const workspaceTools = page.getByRole("toolbar", { name: "Model tools", exact: true });
  const partTools = page.getByRole("toolbar", { name: "Selected part tools", exact: true });
  for (const width of [1440, 1024, 901, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const general = (await workspaceTools.boundingBox())!;
    const part = (await partTools.boundingBox())!;
    const ground = (await page.locator(".canvas-wrap").boundingBox())!;
    expect(part.y).toBeGreaterThanOrEqual(ground.y + ground.height - 1);
    expect(part.y).toBeGreaterThan(general.y + general.height);
    const viewTools = (await page.locator(".view-tools").boundingBox())!;
    expect(general.x + general.width).toBeLessThanOrEqual(viewTools.x + 1);
    expect(viewTools.x + viewTools.width).toBeLessThanOrEqual(width);
    const save = (await page.getByRole("button", { name: "Save project", exact: true }).boundingBox())!;
    expect(save.x + save.width).toBeLessThanOrEqual(width);
    if (width <= 900) {
      const expand = (await page.getByRole("button", { name: "Expand inspector", exact: true }).boundingBox())!;
      expect(expand.y + expand.height).toBeLessThanOrEqual(ground.y + 1);
    }
  }
  await page.screenshot({ path: info.outputPath("material-placement-phone.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await add.click();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,96,3.5]");
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveAttribute("data-material-placement-preview");
  await add.click();
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("120");
  await expect(page.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue("0");
  await expect(page.getByRole("spinbutton", { name: "Z", exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row").first()).not.toContainText(/Unpriced|\$/);
  const firstStock = page.locator(".bom-row").first();
  await expect(firstStock.getByRole("link", { name: "Find at Home Depot" })).toHaveCount(0);
  await firstStock.getByText("Store details", { exact: true }).click();
  await expect(firstStock.getByRole("link", { name: "Find at Home Depot" })).toBeVisible();
  const printShopping = page.locator(".print-guide .pricing-summary-print + ul");
  await expect(printShopping).toContainText(group);
  await expect(printShopping).not.toContainText(/Unpriced|\$/i);
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toHaveCount(0);
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toBeVisible();
});

test("click a material tile and use a measured span to choose shorter stock", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("./");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  const view = (await canvas.boundingBox())!;
  const measurement = page.locator(".measurement-panel");
  await canvas.click({ position: { x: view.width * 0.64, y: view.height * 0.68 } });
  await expect(measurement).toContainText("Click the second point.");
  await canvas.click({ position: { x: view.width * 0.78, y: view.height * 0.68 } });
  await expect(measurement).toContainText("Click again to start a new measurement.");
  for (const [end, x] of [["A", "0"], ["B", "48"]]) {
    await measurement.getByText(`Point ${end} · exact coordinates`, { exact: true }).click();
    for (const [axis, value] of [["X", x], ["Y", "0"], ["Z", "0"]]) {
      await measurement.getByRole("spinbutton", { name: `Point ${end} ${axis}`, exact: true }).fill(value);
    }
    await measurement.getByText(`Point ${end} · exact coordinates`, { exact: true }).click();
  }
  await measurement.getByRole("button", { name: "Done measuring", exact: true }).click();
  await page.locator('[data-material-family="framing-2x4"]').getByText(group, { exact: true }).click();
  const placement = page.getByRole("dialog", { name: group, exact: true });
  await placement.getByRole("radio", { name: "12 ft", exact: true }).check();
  const length = placement.getByRole("spinbutton", { name: "Needed finished length", exact: true });
  await expect(length).toHaveValue("");
  await placement.getByRole("button", { name: "Use measured span (4 ft)", exact: true }).click();
  await expect(length).toHaveValue("4");
  await expect(placement.getByRole("combobox", { name: "Finished length (optional) units" })).toHaveValue("ft");
  await expect(placement).toContainText("8 ft stock fits this cut with 4 ft less length to buy.");
  await placement.getByRole("button", { name: "Use 8 ft", exact: true }).click();
  await placement.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("24");
});

test("use the work zone clearance to choose and cut the shortest listed board", async ({ page }) => {
  await page.goto("./");
  await page.locator(".project-heading").getByRole("button", { name: "Set work zone", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Zone height", exact: true }).fill("48");
  await dialog.getByRole("button", { name: "Apply work zone", exact: true }).click();
  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  await dialog.getByRole("radio", { name: "12 ft", exact: true }).check();
  await expect(dialog).toContainText("12 ft is taller than the available space. A cut from 8 ft stock can fit.");
  await dialog.getByRole("button", { name: "Use work zone clearance (4 ft)", exact: true }).click();
  await expect(dialog).toContainText("8 ft stock fits this cut with 4 ft less length to buy.");
  await dialog.getByRole("button", { name: "Use 8 ft", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("24");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const exported = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  expect(exported.pieces.find(({ offcut }) => !offcut)?.material).toBe("stud");
  expect(exported.pieces.some(({ offcut }) => offcut)).toBe(true);
});

test("an existing surface receives a dropped board and single-stock boards can be cut before placement", async ({ page }) => {
  const project = blank("Landing on the work surface");
  project.pieces = [part("Work surface", "plywood", [36, 0.75, 36], [0, 12, 0], project.steps[0].id, "Bench")];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "work-surface.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Top", exact: true }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  await page.getByRole("textbox", { name: "Find a material" }).fill("1x2 board");
  const add = page.getByRole("button", { name: "Add 1 × 2 board", exact: true });
  const image = page.locator(".material-card").filter({ has: add }).locator(".material-art");
  const art = (await image.boundingBox())!;
  const view = (await canvas.boundingBox())!;
  await page.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2, { steps: 8 });
  await expect(page.locator(".material-drag-preview.can-drop")).toBeVisible();
  const [, surface] = JSON.parse((await canvas.getAttribute("data-material-drop-point"))!);
  expect(surface).toBeCloseTo(12.375);
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[0.75,96,1.5]");
  await page.mouse.up();
  await expect(dialog).toHaveAccessibleName("1 × 2 board");
  await expect(dialog).toContainText("8 ft stock");
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  const finished = dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true });
  await finished.fill("120");
  await expect(dialog.getByRole("button", { name: "Place material", exact: true })).toBeDisabled();
  await finished.fill("24");
  await dialog.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("24");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("24.375");
});

test("front-view drops stay at the framed depth and ignore controls", async ({ page }) => {
  const project = blank("Part away from the origin");
  project.pieces = [part("Work surface", "plywood", [24, 0.75, 24], [0, 12, 120], project.steps[0].id, "Bench")];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "front-placement.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Front", exact: true }).click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  const image = page.locator('[data-material-family="framing-2x4"] .material-art');
  await image.dragTo(page.getByRole("button", { name: "Fit project", exact: true }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const view = (await canvas.boundingBox())!;
  await image.dragTo(canvas, { targetPosition: { x: view.width * 0.72, y: view.height * 0.51 } });
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("60");
  await expect(page.getByRole("spinbutton", { name: "Z", exact: true })).toHaveValue("120");
});

test("placing a finished board schedules one purchase and makes its expected offcut usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const add = page.getByRole("button", { name: `Add ${group}`, exact: true });
  await add.click();
  const dialog = page.getByRole("dialog");
  const length = dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true });
  await length.fill("95.95");
  await expect(dialog.getByRole("button", { name: "Plan cut and place", exact: true })).toHaveCount(0);
  await length.fill("48");
  await expect(dialog).toContainText("Expected offcut · 47.875 in.");
  await dialog.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("24");
  await expect(page.getByRole("button", { name: "Cut pool (1)", exact: true })).toBeVisible();

  await add.click();
  await length.fill("36");
  await expect(dialog).toContainText("Complete the source stock cut order first.");
  await dialog.getByRole("button", { name: "Place from O001", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("36");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".inspector-scroll .bom-row")).toContainText("1 board");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/## Planned stock cuts[\s\S]+1\. Crosscut 4 ft from the current end/);
  expect(guide.indexOf("## Planned stock cuts")).toBeLessThan(guide.indexOf("## Recorded offcut cut order"));
  expect(guide).toContain("Find P001 under Planned stock cuts.");
  expect(guide).toContain("Keep O002 · 11.75 in × 3.5 in × 1.5 in");
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
  await page.getByRole("button", { name: "List", exact: true }).click();
  const source = page.locator(".inspector-scroll .recorded-source-layout");
  await source.locator(":scope > summary").click();
  await expect(source.getByRole("heading", { name: "Saved cutting order" })).toBeVisible();
  await expect(source).toContainText("Crosscut 3 ft from the current end");
  const print = page.locator(".print-guide");
  await expect(print.locator(".planned-stock-cut-order-print")).toContainText("Crosscut 3 ft from the current end");
  await expect(print.locator(".offcut-cut-order-print")).toContainText("Find P001 under Planned stock cuts.");
  const printOrder = await print.evaluate((element) => {
    const stock = element.querySelector(".planned-stock-cut-order-print");
    const offcuts = element.querySelector(".offcut-cut-order-print");
    return !!stock && !!offcuts && !!(stock.compareDocumentPosition(offcuts) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(printOrder).toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/## Planned stock cuts[\s\S]+1\. Crosscut 3 ft from the current end/);
  expect(guide.indexOf("## Planned stock cuts")).toBeLessThan(guide.indexOf("## Recorded offcut cut order"));
  expect(guide).toContain("Complete the source stock cut order before using this blank.");
  expect(guide).toContain("Crosscut to 4 ft");
});

test("a question about one board previews the matching scrap before placing it", async ({ page }) => {
  const base = blank("Ask about a remnant");
  const project = addMeasuredOffcut(base, base.steps[0].id, "stud-10", [65, 3.5, 1.5]);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "measured-scrap.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can I make a four-foot two by four from scrap?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const result = dialog.getByRole("region", { name: "Offcut for a finished board", exact: true });
  await expect(result).toContainText("O001 fits 4 ft of 2 × 4 framing lumber");
  await result.getByRole("button", { name: "Review board placement", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true })).toHaveValue("4");
  await expect(dialog.getByRole("combobox", { name: "Finished length (optional) units", exact: true })).toHaveValue("ft");
  const useScrap = dialog.getByRole("button", { name: "Place from O001", exact: true });
  await expect(useScrap).toBeVisible();
  await useScrap.click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".inspector-scroll .bom-row")).toContainText("0 boards");
});

test("a named scrap stays selected when comparing other compatible offcuts", async ({ page }, info) => {
  const base = blank("Pick a labeled remnant");
  const withFirst = addMeasuredOffcut(base, base.steps[0].id, "stud-10", [55, 3.5, 1.5]);
  const project = addMeasuredOffcut(withFirst, base.steps[0].id, "stud-12", [63, 3.5, 1.5]);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "choose-scrap.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can I make a four-foot two by four from O002?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const result = dialog.getByRole("region", { name: "Offcut for a finished board", exact: true });
  await expect(result).toContainText("O002 fits 4 ft of 2 × 4 framing lumber");
  await result.getByRole("button", { name: "Review board placement", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Place from O002", exact: true })).toBeVisible();
  await dialog.getByText("Compare 2 matching offcuts", { exact: true }).click();
  const named = dialog.getByRole("radio", { name: /^O002 · 63 in/ });
  await expect(named).toBeChecked();
  await dialog.screenshot({ path: info.outputPath("compare-offcuts.png") });
  await dialog.getByRole("radio", { name: /^O001 · 55 in/ }).check();
  await expect(dialog.getByRole("button", { name: "Place from O001", exact: true })).toBeVisible();
  await named.check();
  await dialog.getByRole("button", { name: "Place from O002", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("48");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/^1\. O002 → P\d+ · 2 × 4 framing lumber$/m);
  expect(guide).toContain("Crosscut to 4 ft.");
});

test.describe("phone material placement", () => {
  test.use({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });

  test("touch-drag a treated post from a short screen and edit it in the docked inspector", async ({ page, context }) => {
    await page.goto("./");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
    await page.getByRole("textbox", { name: "Find a material" }).fill("4x4 treated post");
    const add = page.getByRole("button", { name: "Add 4 × 4 treated post", exact: true });
    const tile = page.locator(".material-card").filter({ has: add });
    await expect(tile).toHaveText("4 × 4 treated post");
    const source = (await tile.getByText("4 × 4 treated post", { exact: true }).boundingBox())!;
    const view = (await canvas.boundingBox())!;
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: Math.min(start.x, view.x + view.width * 0.68), y: view.y + view.height * 0.7 };
    expect(start.y).toBeLessThan(page.viewportSize()!.height);
    expect(end.y).toBeGreaterThan(0);
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
    const details = page.locator("#workshop-inspector");
    await expect(details).toHaveAttribute("data-inspector-focused", "false");
    await expect(details).toBeInViewport();
    await expect(details.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("48");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Model tools" })).toBeVisible();
  });
});
