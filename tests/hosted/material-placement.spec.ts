import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addFramingLumber, confirmMaterialPlacement } from "../helpers/materialPlacement";
import { blank, part, projectSchema } from "../../src/model";
import { bom, bounds } from "../../src/engine";
import { planStockCutLayouts } from "../../src/recordStockCutLayout";
import { stockCutSequences } from "../../src/stockCutSequence";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { setCutSourceOnHand } from "../../src/cutStock";
import { Matrix4, Vector3 } from "three";

const group = "2 × 4 framing lumber";

test("choose connector screw sizes and exact angle supplies for a Home Depot list", async ({ page }) => {
  await page.goto("./");
  const search = page.getByRole("textbox", { name: "Find a material" });
  const add = page.getByRole("button", { name: "Add Connector screws", exact: true });
  const dialog = page.getByRole("dialog");
  await search.fill("connector screws");
  await expect(add).toHaveCount(1);
  await add.click();
  const sizes = dialog.getByRole("group", { name: "Screw size", exact: true });
  await expect(sizes.getByRole("radio", { name: "#9 × 1½ in" })).toBeChecked();
  await sizes.getByRole("radio", { name: "#10 × 1½ in" }).check();
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
  await search.fill("SD9212R100-R");
  await add.click();
  await expect(sizes.getByRole("radio", { name: "#9 × 2½ in" })).toBeChecked();
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const driveReview = page.locator("details.section-description").filter({
    hasText: "Review a ¼ in hex connector-screw driver accessory",
  });
  await driveReview.locator("summary").click();
  await expect(driveReview).toContainText("SD10112R100 specifies a ¼ in hex head");
  await expect(driveReview).toContainText("SD9212R100 specifies a ¼ in hex head");
  const nutDriver = page.getByRole("checkbox", { name: "Reviewed 49-66-4502", exact: true });
  await expect(nutDriver).not.toBeChecked();
  await nutDriver.check();
  await expect(driveReview).toContainText("documented capability supported");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pendingGuide = page.waitForEvent("download");
  await page.getByRole("button", { name: /Build guide Markdown/ }).click();
  const stream = await (await pendingGuide).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const guide = Buffer.concat(chunks).toString();
  expect(guide).toContain("SD10112R100 specifies a ¼ in hex head");
  expect(guide).toContain("Milwaukee ¼ in magnetic nut driver");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Add 49-66-4502 to shopping list", exact: true }).click();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByText(/^Hardware and supplies ·/).click();
  await page.getByRole("combobox", { name: "Choose a supply", exact: true }).selectOption("simpson-a23z");
  await page.getByRole("spinbutton", { name: "Supply purchase packs to add", exact: true }).fill("2");
  await page.getByRole("button", { name: "Add supply", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 2 purchase packs." })).toBeVisible();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const review = dialog.getByRole("list", { name: "Home Depot purchase review" });
  for (const [id, count] of [["202071154", "1 100 pack"], ["206101818", "1 100 pack"], ["100375310", "2 angles"], ["203114969", "1 nut driver"]]) {
    await expect(review.getByRole("listitem").filter({ hasText: "#" + id })).toContainText(count);
  }
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const saved = projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));
  expect(saved.pieces.map(({ material }) => material)).toEqual(["sd10112r100", "sd9212r100-r"]);
  expect(saved.supplies).toMatchObject([
    { productId: "milwaukee-49-66-4502", quantity: 1 },
    { productId: "simpson-a23z", quantity: 2 },
  ]);
  expect(saved.toolSelections).toMatchObject([{ productId: "milwaukee-49-66-4502" }]);
  expect(saved.connectorPlans).toEqual([]);
});

test("place a rail flush on a labeled wood face and save the exact position", async ({ page }) => {
  const project = blank("Face placement practice");
  const base = part("Base panel", "plywood", [12, 0.75, 8], [0, 0.375, 0], project.steps[0].id, "Bench");
  const rail = part("Short rail", "stud", [3.5, 1.5, 8], [15, 0.75, 0], project.steps[0].id, "Bench");
  project.pieces = [base, rail];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "face-placement.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Top", exact: true }).click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const camera = async () => JSON.parse(await canvas.getAttribute("data-workshop-camera") ?? "null");
  await expect.poll(async () => {
    const data = await camera();
    return !!data?.settled && Math.abs(data.matrixWorldInverse[6]) > 0.99;
  }).toBe(true);
  const model = await camera();
  const point = new Vector3(...rail.position).divideScalar(12)
    .applyMatrix4(new Matrix4().fromArray(model.matrixWorldInverse))
    .applyMatrix4(new Matrix4().fromArray(model.projectionMatrix));
  await canvas.click({ position: {
    x: (point.x + 1) * model.viewport.width / 2,
    y: (1 - point.y) * model.viewport.height / 2,
  } });
  await page.getByText("Place against another part", { exact: true }).click();
  await page.getByRole("combobox", { name: "Target part", exact: true }).selectOption(base.id);
  const preview = page.getByRole("button", { name: "Preview placement", exact: true });
  const center = page.getByRole("checkbox", { name: "Center across the face", exact: true });
  await center.uncheck();
  await preview.click();
  await expect(page.getByRole("alert")).toContainText("The faces miss each other");
  await center.check();
  await preview.click();
  const ghost = page.getByTestId("wood-face-placement-preview");
  await expect(ghost).toHaveAttribute("data-position", "[0,1.5,0]");
  const draft = async () => projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));
  expect((await draft()).pieces[1].position).toEqual(rail.position);
  await page.getByRole("button", { name: "Cancel preview", exact: true }).click();
  await expect(ghost).toHaveCount(0);
  await preview.click();
  await page.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await draft()).pieces[1].position).toEqual([0, 1.5, 0]);
  expect((await draft()).pieces[0].position).toEqual(base.position);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await expect.poll(async () => (await draft()).pieces[1].position).toEqual([0, 1.5, 0]);
});

test("show both floor-reaching and open wood support paths for the same part", async ({ page }) => {
  const project = blank("Two shelf supports");
  const stepId = project.steps[0].id;
  const shelf = part("Shelf", "plywood", [24, 0.75, 8], [0, 3.375, 0], stepId, "Bench");
  const grounded = part("Grounded block", "stud", [3.5, 3, 7], [-6, 1.5, 0], stepId, "Bench");
  const floating = part("Floating block", "stud", [3.5, 2, 7], [6, 2, 0], stepId, "Bench");
  project.pieces = [shelf, grounded, floating];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "two-supports.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Top", exact: true }).click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const camera = async () => JSON.parse(await canvas.getAttribute("data-workshop-camera") ?? "null");
  await expect.poll(async () => {
    const data = await camera();
    return !!data?.settled && Math.abs(data.matrixWorldInverse[6]) > 0.99;
  }).toBe(true);
  const model = await camera();
  const point = new Vector3(...shelf.position).divideScalar(12)
    .applyMatrix4(new Matrix4().fromArray(model.matrixWorldInverse))
    .applyMatrix4(new Matrix4().fromArray(model.projectionMatrix));
  await canvas.click({ position: {
    x: (point.x + 1) * model.viewport.width / 2,
    y: (1 - point.y) * model.viewport.height / 2,
  } });
  await page.getByText("Support to floor", { exact: true }).click();
  const details = page.locator(".wood-support");
  await expect(details.getByRole("region", { name: "Contact breaks" })).toContainText("Floating block");
  await details.getByRole("button", { name: "Show support paths in 3D", exact: true }).click();
  const trace = page.getByTestId("wood-support-trace");
  await expect(trace).toHaveAttribute("data-grounded-patches", "1");
  await expect(trace).toHaveAttribute("data-open-patches", "1");
  await expect(trace).toHaveAttribute("data-floor-patches", "1");
  await expect(page.getByTestId("wood-support-stop")).toHaveText("P003 · Check below");
  await trace.getByRole("button", { name: "Hide support paths", exact: true }).click();
  await expect(trace).toHaveCount(0);
  await expect(page.getByTestId("wood-support-stop")).toHaveCount(0);
});

test("a mixed-length plan buys shorter stock for short rails and protects recorded stock", async ({ page }) => {
  const source = "hd-spf-2x4-12";
  const initial = blank("Mixed stock for three rails");
  const rail = (name: string, length: number, x: number) =>
    part(name, source, [3.5, 1.5, length], [x, 0.75, 0], initial.steps[0].id, "Rails");
  initial.pieces = [rail("Rail with planned source", 38, -18)];
  const [sequence] = stockCutSequences(initial, bom(initial)).get(source)!;
  const recorded = planStockCutLayouts(initial, [sequence.layout]);
  const onHand = setCutSourceOnHand(recorded.project, recorded.sourceIds[0], true);
  const uncut = [rail("Long rail", 138, 0), rail("Middle rail", 110, 9), rail("Short rail", 42, 18)];
  const project = projectSchema.parse({ ...onHand, pieces: [...onHand.pieces, ...uncut] });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "mixed-stock.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  const draft = async () => projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(`.bom-row[data-stock-material="${source}"]`);
  await row.getByText("Compare stock for 3 parts", { exact: true }).click();
  await expect(row).toContainText("1 already linked to recorded stock");
  await expect(row.getByRole("combobox", { name: "Alternate stock", exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: "Compare mixed lengths", exact: true }).click();
  const preview = row.getByRole("region", { name: "Mixed stock preview", exact: true });
  await expect(preview).toContainText("36 ft → 30 ft");
  await preview.getByText("Review cuts and expected offcuts", { exact: true }).click();
  await expect(preview.getByRole("list", { name: "Mixed stock cut order" })).toContainText("Expected offcuts");
  const before = await draft();
  expect(before.pieces.filter((piece) => !piece.offcut).every(({ material }) => material === source)).toBe(true);
  await preview.getByRole("button", { name: "Apply mixed stock lengths", exact: true }).click();
  const expected = before.pieces.map((piece) => piece.id === uncut[1].id
    ? { ...piece, material: "hd-spf-2x4-10" }
    : piece.id === uncut[2].id ? { ...piece, material: "hd-kdht-2x4-8" } : piece);
  await expect.poll(async () => (await draft()).pieces).toEqual(expected);
  expect((await draft()).plannedCutSources).toEqual(before.plannedCutSources);
  expect((await draft()).onHandCutSources).toEqual(before.onHandCutSources);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await expect.poll(async () => (await draft()).pieces).toEqual(expected);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const instructions = await readFile((await (await download).path())!, "utf8");
  expect(instructions).toContain("Changed stock for Middle rail");
  expect(instructions).toContain("Changed stock for Short rail");
  expect(instructions).toContain("Expected leftovers");
});

test("one material tile supports drop, length choice and a separate selected-part toolbar", async ({ page }, info) => {
  await page.goto("./");
  const add = page.getByRole("button", { name: `Add ${group}`, exact: true });
  const tile = page.locator(".material-card").filter({ has: add });
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveText(group);
  await expect(tile.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator(".material-list")).not.toContainText(/Home Depot|Lowe’s|SPF|Plytanium|Simpson|SharkBite|Cedarbrook|\$/);
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
  const card = (await tile.boundingBox())!;
  const groundHint = (await page.getByText("Drag a material onto the grid.", { exact: true }).boundingBox())!;
  async function dragToGround(x: number, y: number) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(groundHint.x + groundHint.width / 2, groundHint.y + groundHint.height / 2, { steps: 8 });
  }
  await dragToGround(card.x + 2, card.y + 2);
  const dropHint = page.locator(".material-drag-preview.can-drop");
  await expect(dropHint).toContainText("Release to choose size");
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,96,3.5]");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).not.toHaveAttribute("data-material-drop-point");
  await expect(canvas).not.toHaveAttribute("data-material-placement-preview");
  await dragToGround(art.x + art.width / 2, art.y + art.height / 2);
  await expect(dropHint).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(dropHint).toHaveCount(0);
  await expect(canvas).not.toHaveAttribute("data-material-drop-point");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await dragToGround(art.x + art.width / 2, art.y + art.height / 2);
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
  await expect(placement).not.toContainText(/Home Depot|SPF|\$/);
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
  const projectSettings = page.getByRole("button", { name: "Rename project", exact: true });
  for (const width of [1440, 1024, 901, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const general = (await workspaceTools.boundingBox())!;
    const part = (await partTools.boundingBox())!;
    const ground = (await page.locator(".canvas-wrap").boundingBox())!;
    expect(part.y).toBeGreaterThanOrEqual(ground.y + ground.height - 1);
    expect(general.y + general.height).toBeLessThanOrEqual(ground.y);
    const settings = (await projectSettings.boundingBox())!;
    expect(settings.y + settings.height).toBeLessThanOrEqual(ground.y);
    const viewTools = (await page.locator(".view-tools").boundingBox())!;
    expect(viewTools.y + viewTools.height).toBeLessThanOrEqual(ground.y);
    expect(general.x + general.width <= viewTools.x + 1 || general.y + general.height <= viewTools.y).toBe(true);
    expect(viewTools.x + viewTools.width).toBeLessThanOrEqual(width);
    const save = (await page.getByRole("button", { name: "Save project", exact: true }).boundingBox())!;
    expect(save.x + save.width).toBeLessThanOrEqual(width);
    if (width <= 900) {
      const expand = (await page.getByRole("button", { name: "Expand inspector", exact: true }).boundingBox())!;
      expect(expand.y + expand.height).toBeLessThanOrEqual(ground.y + 1);
    }
    if (width <= 600) {
      const actions = await partTools.getByRole("button").all();
      for (const action of actions) {
        const box = (await action.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(ground.y + ground.height - 1);
      }
    }
  }
  await projectSettings.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(partTools).toBeVisible();
  await page.screenshot({ path: info.outputPath("material-placement-phone.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await add.click();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,96,3.5]");
  await page.keyboard.press("Escape");
  await expect(canvas).not.toHaveAttribute("data-material-placement-preview");
  await add.click();
  const [centerX, , centerZ] = JSON.parse((await canvas.getAttribute("data-material-drop-point"))!);
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("120");
  const placedX = Number(await page.getByRole("spinbutton", { name: "X", exact: true }).inputValue());
  const placedZ = Number(await page.getByRole("spinbutton", { name: "Z", exact: true }).inputValue());
  expect(Math.hypot(placedX - centerX, placedZ - centerZ)).toBeLessThanOrEqual(3.5);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row").getByText(`${group} · 8 ft`, { exact: true })).toBeVisible();
  await expect(page.locator(".bom-row").getByText(`${group} · 10 ft`, { exact: true })).toBeVisible();
  await expect(page.locator(".bom-row").first()).not.toContainText(/Unpriced|\$/);
  await expect(page.locator(".bom-row").filter({ hasText: /Home Depot|Store details|Availability unverified/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(page.getByRole("list", { name: "Home Depot purchase review" }).getByRole("link").first()).toHaveAttribute("href", /homedepot\.com/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const printShopping = page.locator(".print-guide .pricing-summary-print + ul");
  await expect(printShopping).toContainText(group);
  await expect(printShopping).not.toContainText(/Unpriced|\$|Internet #|stock unverified/i);
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toHaveCount(0);
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toBeVisible();
});

test("the length picker fits the inspector column and leaves the preview and project controls visible", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("./");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  const view = (await canvas.boundingBox())!;
  const target = { x: view.width - 30, y: view.height * 0.65 };
  await page.locator('[data-material-family="treated-4x4"] .material-art').dragTo(canvas, { targetPosition: target });
  const placement = page.getByRole("dialog", { name: "4 × 4 treated post" });
  await expect(placement).toBeVisible();
  const picker = (await placement.boundingBox())!;
  const inspector = (await page.locator("#workshop-inspector").boundingBox())!;
  const projectSettings = (await page.getByRole("button", { name: "Rename project" }).boundingBox())!;
  expect(picker.x).toBe(inspector.x);
  expect(picker.width).toBe(inspector.width);
  expect(picker.x).toBeGreaterThanOrEqual(view.x + view.width);
  expect(picker.x).toBeGreaterThan(projectSettings.x + projectSettings.width);
  const point = JSON.parse((await canvas.getAttribute("data-material-drop-point"))!);
  await confirmMaterialPlacement(page, "12 ft");
  await expect(page.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue(String(point[0]));
  await expect(page.getByRole("spinbutton", { name: "Z", exact: true })).toHaveValue(String(point[2]));
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("72");
  const turn = page.getByRole("button", { name: "Tip 90°", exact: true });
  const action = (await turn.boundingBox())!;
  const toolbar = (await page.getByRole("toolbar", { name: "Selected part tools" }).boundingBox())!;
  expect(action.x + action.width).toBeLessThanOrEqual(toolbar.x + toolbar.width);
});

test("dragging from a scrolled phone shelf brings the ground back into view", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  const material = page.locator('[data-material-family="framing-2x4"] .material-art');
  await material.evaluate((tile) => tile.scrollIntoView({ block: "start" }));
  const source = (await material.boundingBox())!;
  const initialScroll = await page.evaluate(() => window.scrollY);
  expect(initialScroll).toBeGreaterThan(0);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(230, 24, { steps: 7 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(initialScroll);
  await expect.poll(async () => {
    const view = (await canvas.boundingBox())!;
    return view.y + view.height;
  }).toBeGreaterThan(150);
  const view = (await canvas.boundingBox())!;
  const y = view.y + view.height - 65;
  await page.mouse.move(view.x + view.width * 0.68, y, { steps: 7 });
  await expect(page.locator(".material-drag-preview.can-drop")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: group, exact: true })).toBeVisible();
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.locator(".statusbar")).toContainText("1 part");
  await expect(canvas).not.toHaveAttribute("data-material-drop-point");
});

test("a sized fitting search still leaves one tile and the chosen size keeps its exact purchase match", async ({ page }) => {
  await page.goto("./");
  const search = page.getByRole("textbox", { name: "Find a material" });
  await search.fill("PEX elbow");
  const tile = page.locator(".material-card");
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveText("90° push-to-connect elbow");
  await search.fill("¾ in elbow");
  await expect(tile).toHaveCount(1);
  await tile.getByRole("button", { name: "Add 90° push-to-connect elbow", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "90° push-to-connect elbow" });
  await expect(dialog.getByRole("radio", { name: "¾ in", exact: true })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "½ in", exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/SharkBite|Home Depot|\$/);
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Selected part tools" })).toContainText("90° push-to-connect elbow · ¾ in");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row")).toContainText("90° push-to-connect elbow · ¾ in");
  await expect(page.locator(".bom-row")).not.toContainText(/SharkBite|Home Depot|\$/);
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const review = page.getByRole("list", { name: "Home Depot purchase review" });
  await expect(review.locator('a[href*="325997298"]')).toBeVisible();
  await expect(review.locator('a[href*="323676174"]')).toHaveCount(0);
});

test("activate a material tile by keyboard and use a measured span to choose shorter stock", async ({ page }) => {
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
  const tile = page.getByRole("button", { name: group, exact: true });
  await tile.press("Enter");
  const placement = page.getByRole("dialog", { name: group, exact: true });
  await expect(placement.getByRole("radio", { name: "8 ft", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(placement.getByRole("radio", { name: "10 ft", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(tile).toBeFocused();
  await tile.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await expect(placement.getByRole("radio", { name: "12 ft", exact: true })).toBeChecked();
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

test("lay a board flat and use the available zone width to choose shorter stock", async ({ page }) => {
  await page.goto("./");
  await page.locator(".project-heading").getByRole("button", { name: "Set work zone", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Width units", exact: true }).selectOption("ft");
  await dialog.getByRole("spinbutton", { name: "Zone width", exact: true }).fill("4");
  await dialog.getByRole("button", { name: "Apply work zone", exact: true }).click();
  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Lay flat", exact: true }).click();
  await dialog.getByRole("radio", { name: "12 ft", exact: true }).check();
  await expect(dialog).toContainText("12 ft is longer than the available space. A cut from 8 ft stock can fit.");
  await dialog.getByRole("button", { name: "Use work zone clearance (4 ft)", exact: true }).click();
  await dialog.getByRole("button", { name: "Use 8 ft", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  const board = saved.pieces.find(({ offcut }) => !offcut)!;
  expect(board.material).toBe("stud");
  expect(bounds(board).min[0]).toBeCloseTo(-24);
  expect(bounds(board).max[0]).toBeCloseTo(24);
  expect(bounds(board).min[1]).toBeCloseTo(0);
  expect(saved.pieces.some(({ offcut }) => offcut)).toBe(true);
});

test("lay two boards front to back and cut them from one stock length", async ({ page }) => {
  await page.goto("./");
  await page.locator(".project-heading").getByRole("button", { name: "Set work zone", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Width units", exact: true }).selectOption("in");
  await dialog.getByRole("spinbutton", { name: "Zone width", exact: true }).fill("36");
  await dialog.getByRole("spinbutton", { name: "Zone depth", exact: true }).fill("54");
  await dialog.getByRole("button", { name: "Apply work zone", exact: true }).click();
  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Lay flat", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use work zone clearance (3 ft)", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Lay front to back", exact: true }).click();
  await dialog.getByRole("button", { name: "Use work zone clearance (54 in)", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Pieces at this length", exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Use 10 ft", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan and place 2 pieces", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  const parts = saved.pieces.filter(({ offcut }) => !offcut);
  expect(parts).toHaveLength(2);
  for (const piece of parts) {
    expect(piece.material).toBe("stud-10");
    expect(piece.stockLengthAxis).toBe(1);
    expect(bounds(piece).min[1]).toBeCloseTo(0);
    expect(bounds(piece).max[1]).toBeCloseTo(1.5);
    expect(bounds(piece).min[2]).toBeCloseTo(-27);
    expect(bounds(piece).max[2]).toBeCloseTo(27);
  }
  expect(bounds(parts[1]).min[0]).toBeGreaterThanOrEqual(bounds(parts[0]).max[0]);
  expect(saved.plannedCutSources).toHaveLength(1);
  expect(saved.pieces.filter(({ offcut }) => offcut)).toHaveLength(1);
});

test("place a rotated board on a surface and set its exact bottom elevation", async ({ page }) => {
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
  const button = (await add.boundingBox())!;
  const view = (await canvas.boundingBox())!;
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
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
  await dialog.getByRole("button", { name: "Lay front to back", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Lay front to back", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toHaveValue("24");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("12.75");
  const movement = page.getByRole("region", { name: "Move and copy objects" });
  const bottom = movement.getByRole("spinbutton", { name: "Bottom above floor", exact: true });
  await expect(bottom).toHaveValue("12.375");
  await expect(movement).toContainText("Top above floor · 13.125 in");
  await movement.getByRole("combobox", { name: "Bottom above floor units" }).selectOption("ft");
  await bottom.fill("2");
  await bottom.press("Enter");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("24.375");
  await expect(movement).toContainText("Top above floor · 24.75 in");
  await bottom.fill("0");
  await movement.getByRole("button", { name: "Set height", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stopped at Work surface" })).toBeVisible();
  await expect(bottom).toHaveValue("1.03125");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("12.75");
  const center = page.getByRole("spinbutton", { name: "Y", exact: true });
  const openHeight = async (prompt: string) => {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await dialog.getByRole("textbox", { name: "Describe your idea" }).fill(prompt);
    await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
    const answer = dialog.getByRole("region", { name: "Set the bottom height of P002", exact: true });
    await expect(answer).toBeVisible();
    await answer.getByRole("button", { name: "Review height in 3D", exact: true }).click();
  };
  await openHeight("Set the bottom of P002 to 2 feet above the floor");
  const preview = page.getByRole("region", { name: "Part height preview" });
  const marker = page.getByTestId("part-elevation-preview");
  await expect(preview).toContainText("Bottom 12.375 in → 2 ft");
  await expect(marker).toBeVisible();
  await expect(center).toHaveValue("12.75");
  await preview.getByRole("button", { name: "Apply height", exact: true }).click();
  await expect(center).toHaveValue("24.375");
  await openHeight("Move P002 so its bottom is 0 inches above the floor");
  await expect(preview).toContainText("Stopped at Work surface");
  await expect(center).toHaveValue("24.375");
  await preview.getByRole("button", { name: "Cancel preview", exact: true }).click();
  await expect(marker).toHaveCount(0);
  await expect(center).toHaveValue("24.375");
  await openHeight("Set P002's underside to 0 in");
  await preview.getByRole("button", { name: "Move to stop", exact: true }).click();
  await expect(center).toHaveValue("12.75");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  const board = saved.pieces.find((piece) => !piece.offcut && piece.name === "1 × 2 board")!;
  const installed = bounds(board);
  expect(installed.max[2] - installed.min[2]).toBeCloseTo(24);
  expect(installed.min[1]).toBeCloseTo(surface);
  expect(saved.pieces.filter((piece) => !piece.offcut)).toHaveLength(2);
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
  await page.getByRole("button", { name: "Connect with screws", exact: true }).click();
  await image.dragTo(page.getByText("Choose the first part to connect", { exact: true }));
  await expect(page.getByRole("dialog", { name: group, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  const view = (await canvas.boundingBox())!;
  await image.dragTo(canvas, { targetPosition: { x: view.width * 0.72, y: view.height * 0.51 } });
  await confirmMaterialPlacement(page, "10 ft");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("60");
  await expect(page.getByRole("spinbutton", { name: "Z", exact: true })).toHaveValue("120");
  await page.getByRole("textbox", { name: "Find a material" }).fill("wood screws");
  await page.getByRole("button", { name: "Add Wood screws", exact: true }).click();
  await confirmMaterialPlacement(page, "3 in");
  await expect(page.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("1.5");
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

test("a question about one board previews a scrap with exactly one blade width left before placing it", async ({ page }) => {
  const base = blank("Ask about a remnant");
  const project = addMeasuredOffcut(base, base.steps[0].id, "stud-10", [48.125, 3.5, 1.5]);
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
  await expect(result).toContainText("Blade uses the remaining 0.125 in");
  await result.getByRole("button", { name: "Review board placement", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true })).toHaveValue("4");
  await expect(dialog.getByRole("combobox", { name: "Finished length (optional) units", exact: true })).toHaveValue("ft");
  const useScrap = dialog.getByRole("button", { name: "Place from O001", exact: true });
  await expect(useScrap).toBeVisible();
  await useScrap.click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
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

  test("browse by swipe, drag a treated post diagonally and edit it in the docked inspector", async ({ page, context }) => {
    await page.goto("./");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
    const materialRail = page.locator(".material-list");
    const firstTitle = (await materialRail.locator(".material-grip strong").first().boundingBox())!;
    const touch = await context.newCDPSession(page);
    async function swipe(start: { x: number; y: number }, end: { x: number; y: number }) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      for (let i = 1; i <= 8; i++) {
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
          x: start.x + (end.x - start.x) * i / 8,
          y: start.y + (end.y - start.y) * i / 8,
        }] });
      }
    }
    const swipeStart = { x: firstTitle.x + firstTitle.width / 2, y: firstTitle.y + firstTitle.height / 2 };
    await swipe(swipeStart, { x: swipeStart.x - 72, y: swipeStart.y });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => materialRail.evaluate((rail) => rail.scrollLeft)).toBeGreaterThan(50);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Find a material" }).fill("ground-contact");
    const add = page.getByRole("button", { name: "Add 4 × 4 treated post", exact: true });
    const tile = page.locator(".material-card").filter({ has: add });
    await expect(tile).toHaveText("4 × 4 treated post");
    await tile.scrollIntoViewIfNeeded();
    expect(await materialRail.evaluate((rail) => rail.scrollWidth)).toBeGreaterThan(390);
    const source = (await tile.getByText("4 × 4 treated post", { exact: true }).boundingBox())!;
    const view = (await canvas.boundingBox())!;
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: view.x + view.width * 0.67, y: view.y + view.height * 0.7 };
    expect(start.y).toBeLessThan(page.viewportSize()!.height);
    expect(end.y).toBeGreaterThan(0);
    // Starting with a thumb swipe in the rail should still allow a pull into the grid.
    const railScroll = await materialRail.evaluate((rail) => rail.scrollLeft);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    const turn = { x: start.x - 24, y: start.y };
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [turn] });
    for (let step = 1; step <= 8; step++) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
        x: turn.x + (end.x - turn.x) * step / 8,
        y: turn.y + (end.y - turn.y) * step / 8,
      }] });
    }
    await expect(page.locator(".material-drag-preview.can-drop")).toBeVisible();
    expect(await materialRail.evaluate((rail) => rail.scrollLeft)).toBe(railScroll);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const dialog = page.getByRole("dialog", { name: "4 × 4 treated post" });
    await expect(dialog).toBeVisible();
    const picker = (await dialog.boundingBox())!;
    expect(end.y < picker.y || end.y > picker.y + picker.height).toBe(true);
    await confirmMaterialPlacement(page, "8 ft");
    await expect(page.getByRole("status").filter({ hasText: "4 × 4 treated post added." })).toHaveCSS("pointer-events", "none");
    await page.getByRole("button", { name: "Part details" }).click();
    const details = page.locator("#workshop-inspector");
    await expect(details).toHaveAttribute("data-inspector-focused", "false");
    await expect(details).toBeInViewport();
    await expect(details.getByRole("spinbutton", { name: "Y", exact: true })).toHaveValue("48");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Model tools" })).toBeVisible();
  });
});

test("compare repeated cuts from a question, reuse the tail and export the shared stock order", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Questions about this build", { exact: true }).click();
  await dialog.getByRole("button", { name: "Compare board lengths", exact: true }).click();
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const answer = dialog.getByRole("region", { name: "Stock lengths for your cuts", exact: true });
  await expect(answer).toContainText("1 × 10 ft makes 2 pieces at 4 ft");
  await expect(answer).toContainText("2 × 8 ft");
  await answer.getByRole("button", { name: "Preview 8 ft stock", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "8 ft", exact: true })).toBeChecked();
  const quantity = dialog.getByRole("spinbutton", { name: "Pieces at this length", exact: true });
  await expect(quantity).toHaveValue("2");
  await quantity.fill("25");
  await expect(dialog).toContainText("Choose 1 to 24 whole pieces.");
  await expect(dialog.getByRole("button", { name: "Place material", exact: true })).toBeDisabled();
  await quantity.fill("2");
  await dialog.getByRole("button", { name: "Use 10 ft", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "10 ft", exact: true })).toBeChecked();
  await expect(dialog).toContainText("Expected offcuts · 23.75 in.");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-material-placement-count", "2");
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[1.5,48,3.5]");
  await page.screenshot({ path: info.outputPath("repeat-cut-phone.png") });
  await dialog.getByRole("button", { name: "Plan and place 2 pieces", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-material-placement-count");
  await expect(page.getByRole("button", { name: "Cut pool (1)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (1)", exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true }).fill("18");
  await dialog.getByRole("button", { name: "Place from O001", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".inspector-scroll .bom-row")).toContainText("1 board");
  await expect(page.locator(".inspector-scroll .bom-row")).toContainText("3 parts · 1 offcut");
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" }).getByRole("link").first())
    .toHaveAttribute("href", /homedepot\.com\/.*100077951/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  let downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const model = projectSchema.parse(JSON.parse(await readFile((await (await downloaded).path())!, "utf8")));
  const kept = model.pieces.filter(({ offcut }) => !offcut);
  expect(kept.map(({ size }) => size[1])).toEqual([48, 48, 18]);
  expect(new Set(kept.map(({ cutStock }) => cutStock?.id)).size).toBe(1);
  expect(kept[0].position[0]).toBeLessThan(kept[1].position[0]);
  expect(model.plannedCutSources).toHaveLength(1);
  const source = model.plannedCutSources![0].sourceId;
  expect(model.pieces.filter(({ offcut }) => offcut).map(({ cutStock, size }) => [cutStock?.id, size[1]])).toEqual([[source, 5.625]]);

  if (!await dialog.isVisible()) await page.getByRole("button", { name: "Export", exact: true }).click();
  downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/## Planned stock cuts[\s\S]+1\. Crosscut 4 ft from the current end for P001[\s\S]+2\. Crosscut 4 ft from the current end for P002/);
  expect(guide.indexOf("## Planned stock cuts")).toBeLessThan(guide.indexOf("## Recorded offcut cut order"));
  expect(guide).toContain("Crosscut to 18 in");
});

test("a mixed cut list previews, cancels and places both stock sizes before reusing the longer offcut", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  const canvas = page.locator("canvas").first();
  async function previewCuts() {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await dialog.getByText("Questions about this build", { exact: true }).click();
    await dialog.getByRole("button", { name: "Plan a cut list", exact: true }).click();
    await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
    const answer = dialog.getByRole("region", { name: "Lumber cut list", exact: true });
    await expect(answer).toContainText("4 pieces from 2 boards · 18 ft");
    await answer.getByRole("button", { name: "Preview cut list in 3D", exact: true }).click();
    await expect(dialog).toHaveAccessibleName("Review lumber cut list");
    const order = dialog.getByRole("list", { name: "Stock cut order", exact: true });
    await expect(order.getByRole("listitem")).toHaveCount(2);
    await expect(order).toContainText("19.75 in offcut");
    await expect(order).toContainText("1.75 in offcut");
    await expect(canvas).toHaveAttribute("data-material-placement-count", "4");
  }
  await previewCuts();
  await page.screenshot({ path: info.outputPath("mixed-cut-list-preview.png") });
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-material-placement-count");
  await expect(page.locator(".statusbar")).toContainText("0 parts");

  await previewCuts();
  await dialog.getByRole("button", { name: "Plan and place 4 pieces", exact: true }).click();
  await expect(canvas).not.toHaveAttribute("data-material-placement-count");
  await expect(page.locator(".statusbar")).toContainText("4 parts");
  await expect(page.getByRole("button", { name: "Cut pool (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (2)", exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Add ${group}`, exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Needed finished length", exact: true }).fill("16");
  await dialog.getByRole("button", { name: "Place from O001", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  const rows = page.locator(".inspector-scroll .bom-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "1 board" })).toHaveCount(2);
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const purchases = dialog.getByRole("list", { name: "Home Depot purchase review" });
  await expect(purchases.locator('a[href*="312528776"]')).toBeVisible();
  await expect(purchases.locator('a[href*="100077951"]')).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  let downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const exported = projectSchema.parse(JSON.parse(await readFile((await (await downloaded).path())!, "utf8")));
  const [long, short, mid, brace, spacer] = exported.pieces.filter(({ offcut }) => !offcut);
  expect([long, short, mid, brace, spacer].map(({ size }) => size[1])).toEqual([60, 40, 48, 46, 16]);
  expect(long.cutStock?.id).toBe(short.cutStock?.id);
  expect(mid.cutStock?.id).toBe(brace.cutStock?.id);
  expect(spacer.cutStock?.id).toBe(long.cutStock?.id);
  expect(long.cutStock?.id).not.toBe(mid.cutStock?.id);
  expect(exported.plannedCutSources).toHaveLength(2);
  expect(exported.pieces.filter(({ offcut }) => offcut).map(({ size }) => size[1]).sort()).toEqual([1.75, 3.625]);

  if (!await dialog.isVisible()) await page.getByRole("button", { name: "Export", exact: true }).click();
  downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/1\. Crosscut 5 ft from the current end for P001[\s\S]+2\. Crosscut 40 in from the current end for P002/);
  expect(guide).toMatch(/1\. Crosscut 4 ft from the current end for P003[\s\S]+2\. Crosscut 46 in from the current end for P004/);
  expect(guide.indexOf("## Planned stock cuts")).toBeLessThan(guide.indexOf("## Recorded offcut cut order"));
  expect(guide).toContain("Crosscut to 16 in");
});

test("a mixed cut list uses a named offcut twice and keeps only the additional board in shopping", async ({ page }) => {
  const base = blank("Stored rail blank");
  const existing = addMeasuredOffcut(base, base.steps[0].id, "hd-kdht-2x4-8", [80, 3.5, 1.5], "Stored 2 × 4");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "existing-offcut.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(existing)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" })
    .fill("Plan 2x4 cuts of 48 in, 30 in, 44 in and 42 in using O001");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const answer = dialog.getByRole("region", { name: "Lumber cut list", exact: true });
  await expect(answer).toContainText("4 pieces using O001 · 1 board to buy");
  await answer.getByRole("button", { name: "Preview cut list in 3D", exact: true }).click();
  await expect(dialog).toContainText("O001 · 80 in from Cut pool");
  await expect(dialog).toContainText("1.75 in offcut");
  await dialog.getByRole("button", { name: "Plan and place 4 pieces", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".inspector-scroll .bom-row")).toContainText("1 board to buy · 4 parts · 2 offcuts");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  let downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const model = projectSchema.parse(JSON.parse(await readFile((await (await downloaded).path())!, "utf8")));
  const [oldSource] = existing.onHandCutSources!;
  const kept = model.pieces.filter(({ offcut }) => !offcut);
  expect(kept.filter(({ cutStock }) => cutStock?.id === oldSource).map(({ size }) => size[1])).toEqual([48, 30]);
  expect(model.plannedCutSources).toHaveLength(1);
  expect(model.plannedCutSources![0].sourceId).not.toBe(oldSource);
  const offcutHistory = model.history.filter(({ offcutCut }) => !!offcutCut);
  expect(offcutHistory[1].offcutCut?.inputId).toBe(offcutHistory[0].offcutCut?.remnants[0]?.id);
  if (!await dialog.isVisible()) await page.getByRole("button", { name: "Export", exact: true }).click();
  downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toContain("O001 → P001");
  expect(guide).toContain("O002 → P002");
  expect(guide).toContain("Crosscut 44 in from the current end for P003");
});
