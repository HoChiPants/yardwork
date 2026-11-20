import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";
import { blank, part, projectSchema, uid, type Project, type V3 } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { fittedStockFaces } from "../../src/fittedStock";
import { bounds, bom } from "../../src/engine";
import { fitPerspectiveBounds } from "../../src/cameraFit";

async function draft(page: Page, predicate: (project: Project) => boolean) {
  let current: Project | null = null;
  await expect.poll(async () => {
    const raw = await page.evaluate((key) => localStorage.getItem(key), CURRENT_DRAFT_KEY);
    current = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
    return current !== null && predicate(current);
  }, { timeout: 15000 }).toBe(true);
  return current!;
}
async function load(page: Page, project: Project) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "synthetic-fitted-stock.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name) && actual.pieces.length === project.pieces.length && project.pieces.every((piece) => actual.pieces.some((current) => current.id === piece.id)));
}
async function study(family: "storage-banquette" | "shelves") {
  const project = projectSchema.parse(JSON.parse(await readFile(`public/examples/builds/${family}.yardwork.json`, "utf8")));
  project.name = `SYNTHETIC fitted ${family} ${uid().slice(0, 8)}`;
  if (family === "storage-banquette") {
    const section = project.sections.find((section) => section.recipe?.storage)!;
    const legs = project.pieces.filter((piece) => section.pieceIds.includes(piece.id) && piece.designRole === "leg");
    const front = Math.max(...legs.map((piece) => piece.position[2]));
    const pair = legs.filter((piece) => Math.abs(piece.position[2] - front) < 1e-8).sort((a, b) => a.position[0] - b.position[0]);
    return { project, first: pair[0], second: pair[1], sectionId: section.id, y: 0 };
  }
  const entry = project.ideaBindings.flatMap((binding) => binding.entries).find((entry) => entry.spec.type === "structure")!;
  const section = (role: string) => project.sections.find((s) => s.id === entry.sections.find((s) => s.role === role)!.sectionId)!;
  const a = section("side-left"), b = section("side-right");
  const first = project.pieces.find((piece) => a.pieceIds.includes(piece.id))!, second = project.pieces.find((piece) => b.pieceIds.includes(piece.id))!;
  return { project, first, second, sectionId: a.id, y: 60 - first.position[1] };
}
async function open(page: Page) {
  await page.getByRole("button", { name: /^Checks(?:\s+\d+)?$/ }).click();
  await page.getByRole("button", { name: "Fit stock between faces", exact: true }).click();
  const panel = page.getByRole("region", { name: "Fit stock between faces", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}
async function configure(panel: Locator, setup: Awaited<ReturnType<typeof study>>) {
  for (const [which, piece, sign] of [["first", setup.first, 1], ["second", setup.second, -1]] as const) {
    await panel.getByRole("combobox", { name: `Fitted ${which} member`, exact: true }).selectOption(piece.id);
    const face = fittedStockFaces(setup.project, piece.id).find((face) => face.normalLocal[0] === sign)!;
    await panel.getByRole("combobox", { name: `Fitted ${which} face`, exact: true }).selectOption({ label: face.label });
  }
  await expect(panel.getByRole("textbox", { name: "Fitted datum X", exact: true })).toHaveValue("");
  await panel.getByRole("button", { name: "Use face center", exact: true }).click();
  await panel.getByRole("textbox", { name: "Fitted datum Y", exact: true }).fill(String(setup.y));
  await panel.getByRole("combobox", { name: "Fitted stock material", exact: true }).selectOption("hd-pine-1x4");
  await panel.getByRole("button", { name: "Use exact modeled span · zero end clearances", exact: true }).click();
  await panel.getByRole("combobox", { name: "Fitted destination section", exact: true }).selectOption(setup.sectionId);
}
async function exported(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  if (!path) throw Error("Missing project download");
  const project = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return project;
}

test("fit actual banquette blocking, cancel without changes, then add one cut source and plan its ends through Undo and save/reopen", async ({ page }) => {
  const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message));
  const setup = await study("storage-banquette"), before = await load(page, setup.project);
  let panel = await open(page);
  await configure(panel, setup);
  await panel.getByRole("button", { name: "Preview fitted stock", exact: true }).click();
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveCount(1);
  await expect(panel.locator(".fitted-stock-summary")).toContainText("19.594 in");
  expect(await exported(page)).toEqual(before);
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Add or cancel the fitted-stock draft before leaving or saving the project.", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Add or cancel the fitted-stock draft before leaving or saving the project.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveCount(0);
  expect(await exported(page)).toEqual(before);
  panel = await open(page); await configure(panel, setup);
  await panel.getByRole("button", { name: "Preview fitted stock", exact: true }).click();
  const blockId = (await panel.locator(".fitted-stock-summary").getAttribute("data-block-id"))!;
  const ghost = page.getByTestId("fitted-stock-ghost");
  expect(JSON.parse((await ghost.getAttribute("data-size"))!)[1]).toBeCloseTo(19.594, 8);
  await page.screenshot({ path: test.info().outputPath("desktop-banquette-fitted-preview.png"), fullPage: false, animations: "disabled" });
  await panel.getByRole("button", { name: "Add fitted block", exact: true }).click();
  const added = await draft(page, (actual) => actual.pieces.length === before.pieces.length + 2);
  const block = added.pieces.find((piece) => piece.id === blockId)!;
  expect(block.size[0]).toBe(0.75); expect(block.size[1]).toBeCloseTo(19.594, 8); expect(block.size[2]).toBe(3.5);
  expect(block.cutStock?.size).toEqual([0.75, 96, 3.5]);
  const remnant = added.pieces.find((piece) => piece.offcut && piece.cutStock?.id === block.cutStock?.id)!;
  expect(remnant.size[1]).toBeCloseTo(96 - 19.594 - 0.125, 8);
  expect(added.pieces.filter((piece) => before.pieces.some((old) => old.id === piece.id))).toEqual(before.pieces);
  for (const key of ["fastenerPlans", "connectorPlans", "lidHingePlans", "supplies", "inventory", "toolSelections"] as const) expect(added[key]).toEqual(before[key]);
  expect(bom(added).find((row) => row.id === "hd-pine-1x4")?.quantity).toBe((bom(before).find((row) => row.id === "hd-pine-1x4")?.quantity ?? 0) + 1);
  await expect(page.getByTestId("fitted-block-end-connections")).toContainText("Plan both ends");
  await page.getByRole("button", { name: /^Plan end 1:/ }).click();
  await expect(page.getByRole("region", { name: "Wood fastener plans", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to connections", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await draft(page, (actual) => actual.pieces.length === before.pieces.length);
  expect(undone.pieces).toEqual(before.pieces);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await draft(page, (actual) => actual.pieces.some((piece) => piece.id === blockId));
  await page.getByRole("button", { name: /^(?:Generate build guide|Regenerate guide)$/ }).click();
  const guided = await draft(page, (actual) => actual.guideFingerprint !== null && actual.pieces.some((piece) => piece.id === blockId));
  const exact = await exported(page); expect(exact).toEqual(guided);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${guided.id}`);
    return response.ok() && JSON.stringify((await response.json()).project.pieces) === JSON.stringify(guided.pieces);
  }).toBe(true);
  await page.reload(); await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: guided.name }).click();
  const reopened = await draft(page, (actual) => actual.id === guided.id && actual.pieces.some((piece) => piece.id === blockId));
  expect(reopened.pieces).toEqual(guided.pieces);
  expect(reopened.steps).toEqual(guided.steps);
});

test("phone fits between real .703 inch shelf sides with independent end units and preserves incomplete input", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const setup = await study("shelves"), before = await load(page, setup.project), panel = await open(page);
  expect(setup.first.size[0]).toBe(0.703);
  await configure(panel, setup);
  await panel.getByRole("textbox", { name: "First end clearance", exact: true }).fill("0.125");
  await panel.getByRole("combobox", { name: "Second end clearance units", exact: true }).selectOption("ft");
  await panel.getByRole("textbox", { name: "Second end clearance", exact: true }).fill(String(0.125 / 12));
  await panel.getByRole("button", { name: "Preview fitted stock", exact: true }).click();
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveCount(1);
  expect(Number(await page.getByTestId("fitted-stock-ghost").getAttribute("data-cut-length"))).toBeCloseTo(46.219, 8);
  await panel.locator(".fitted-stock-summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("phone-shelves-fit-cut-and-remnant.png"), fullPage: false, animations: "disabled" });
  const first = panel.getByRole("textbox", { name: "First end clearance", exact: true });
  await first.fill(""); await expect(first).toHaveValue("");
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Add fitted block", exact: true })).toBeDisabled();
  expect(await exported(page)).toEqual(before);
  await first.fill("0.125");
  await panel.getByRole("button", { name: "Preview fitted stock", exact: true }).click();
  await panel.getByRole("button", { name: "Add fitted block", exact: true }).click();
  const added = await draft(page, (actual) => actual.pieces.length === before.pieces.length + 2);
  expect(added.pieces.find((piece) => piece.id === setup.first.id)?.size[0]).toBe(0.703);
  expect(added.pieces.find((piece) => piece.id === setup.second.id)?.size[0]).toBe(0.703);
  expect(added.supplies).toEqual(before.supplies);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a real canvas face pick enters the first datum and does not move or duplicate either support", async ({ page }) => {
  const project = blank(`SYNTHETIC fitted canvas pick ${uid().slice(0, 8)}`);
  const first = part("Actual 4 by 4 support with retained end cut", "lowes-treated-post-4x4-8", [3.5, 96, 3.5], [-10, 48, 0], project.steps[0].id, "Supports");
  first.cutPlanes = [{ normal: [0, 1, 0], constant: 37.1 }];
  const second = part("Right actual support", "stud", [1.5, 24, 3.5], [10, 12, 0], project.steps[0].id, "Supports");
  project.pieces = [first, second];
  const before = await load(page, project), panel = await open(page);
  await panel.getByRole("combobox", { name: "Fitted first member", exact: true }).selectOption(first.id);
  await panel.getByRole("button", { name: "Pick first face and datum in 3D", exact: true }).click();
  await expect(page.getByTestId("fitted-stock-preview-banner")).toContainText("Pick first face");
  await page.locator("canvas").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.waitForTimeout(1800);
  const box = (await page.locator("canvas").boundingBox())!;
  const boxes = project.pieces.map(bounds), min = [0, 1, 2].map((axis) => Math.min(...boxes.map((b) => b.min[axis])) / 12) as V3,
    max = [0, 1, 2].map((axis) => Math.max(...boxes.map((b) => b.max[axis])) / 12) as V3;
  const camera = new PerspectiveCamera(38, box.width / box.height, 0.05, 500);
  const radius = Math.max(6, ...max.map((value, axis) => value - min[axis]));
  const fit = fitPerspectiveBounds({ min, max }, { verticalFovDegrees: 38, aspect: box.width / box.height, direction: [0, radius * 1.8, 0.01], padding: 1.1, minDistance: 2, nearClip: 0.05 });
  camera.position.set(...fit.position); camera.lookAt(...fit.target); camera.updateMatrixWorld();
  const p = new Vector3(-9.55 / 12, 85.1 / 12, 0.2 / 12).project(camera);
  await page.mouse.click(box.x + (p.x + 1) * box.width / 2, box.y + (1 - p.y) * box.height / 2);
  await expect(panel.getByRole("combobox", { name: "Fitted first face", exact: true })).not.toHaveValue("");
  await expect(panel.getByRole("combobox", { name: "Fitted first face", exact: true }).locator("option:checked")).toHaveText("Local Y+ face");
  const y = panel.getByRole("textbox", { name: "Fitted datum Y", exact: true });
  await expect.poll(async () => Number(await y.inputValue())).toBeCloseTo(37.1, 7);
  // Target well away from the face center: camera animation stops within a small
  // scene-space tolerance, while the retained plane itself is resolved exactly.
  // Preserve a noncentral clicked tangent instead of replacing it with a center.
  expect(Math.abs(Number(await panel.getByRole("textbox", { name: "Fitted datum X", exact: true }).inputValue()))).toBeGreaterThan(0.05);
  expect(await exported(page)).toEqual(before);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await exported(page)).toEqual(before);
});
