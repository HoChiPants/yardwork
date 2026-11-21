import { confirmMaterialPlacement } from "../helpers/materialPlacement";
import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { blank, part, type Project, type V3 } from "../../src/model";
import { bounds } from "../../src/engine";

async function importProject(page: Page, project: Project) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "gesture-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.getByRole("heading", {
      name: `${project.name} · imported`,
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForTimeout(2000);
}
async function exportProject(page: Page): Promise<Project> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return JSON.parse(Buffer.concat(chunks).toString());
}
function fixture() {
  const project = blank("Direct manipulation study");
  project.pieces = [
    part(
      "Gesture board",
      "stud",
      [48, 3.5, 12],
      [0, 1.75, 0],
      project.steps[0].id,
      "Test",
    ),
  ];
  return project;
}
async function screenPoint(page: Page, project: Project, point: V3) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("Canvas missing");
  const boxes = project.pieces.map(bounds);
  const min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i])));
  const center = min.map((v, i) => (v + max[i]) / 24) as V3;
  const radius = Math.max(6, ...max.map((v, i) => (v - min[i]) / 12));
  // Reproduce the scene's explicit fit camera, then project an actual world point.
  const camera = new PerspectiveCamera(38, box.width / box.height, 0.05, 500);
  camera.position.set(
    center[0] + radius * 1.2,
    center[1] + radius * 0.85,
    center[2] + radius * 1.35,
  );
  camera.lookAt(...center);
  camera.updateMatrixWorld();
  const projected = new Vector3(...(point.map((v) => v / 12) as V3)).project(
    camera,
  );
  return {
    x: box.x + ((projected.x + 1) * box.width) / 2,
    y: box.y + ((1 - projected.y) * box.height) / 2,
  };
}
async function boardCenter(page: Page) {
  return screenPoint(page, fixture(), [0, 1.75, 0]);
}

test("dragging the board itself moves it horizontally and commits once", async ({
  page,
}) => {
  const project = fixture();
  await importProject(page, project);
  const { x, y } = await boardCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.getByRole("textbox", { name: "Part name", exact: true }),
  ).toHaveValue("Gesture board");
  const moved = await exportProject(page);
  expect(moved.pieces[0].position).not.toEqual(project.pieces[0].position);
  expect(moved.pieces[0].position[1]).toBe(project.pieces[0].position[1]);
  expect(moved.pieces[0].rotation).toEqual([0, 0, 0]);
  expect(moved.history).toHaveLength(1);
});
test("Shift-drag rotates the board with 15 degree snapping", async ({
  page,
}) => {
  const project = fixture();
  await importProject(page, project);
  const { x, y } = await boardCenter(page);
  await page.keyboard.down("Shift");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const rotated = await exportProject(page);
  const degrees = (rotated.pieces[0].rotation[1] * 180) / Math.PI;
  expect(Math.abs(degrees)).toBeGreaterThan(1);
  expect(degrees / 15).toBeCloseTo(Math.round(degrees / 15), 5);
  expect(rotated.pieces[0].position).toEqual(project.pieces[0].position);
  expect(rotated.history).toHaveLength(1);
});
test("Escape cancels a preview gesture without recording a transform", async ({
  page,
}) => {
  const project = fixture();
  await importProject(page, project);
  const { x, y } = await boardCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 20, { steps: 12 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const restored = await exportProject(page);
  expect(restored.pieces).toEqual(project.pieces);
  expect(restored.history).toHaveLength(0);
});
test("right drag orbits the view without editing the board", async ({
  page,
}) => {
  const project = fixture();
  await importProject(page, project);
  const { x, y } = await boardCenter(page);
  const before = await page.locator("canvas").screenshot();
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 120, y - 35, { steps: 12 });
  await page.mouse.up({ button: "right" });
  const after = await page.locator("canvas").screenshot();
  expect(after.equals(before)).toBe(false);
  const unchanged = await exportProject(page);
  expect(unchanged.pieces).toEqual(project.pieces);
  expect(unchanged.history).toHaveLength(0);
});
test("a blank project can show the saved work-zone dimensions", async ({
  page,
}) => {
  const project = blank("Confined room");
  project.workZone = { width: 96, depth: 72, height: 84 };
  await importProject(page, project);
  await expect(page.locator(".design-actions .zone-button")).toBeVisible();
  const restored = await exportProject(page);
  expect(restored.workZone).toEqual(project.workZone);
  expect(restored.pieces).toHaveLength(0);
});

test("a board dragged over a base rests on its top surface", async ({
  page,
}) => {
  const project = blank("Stack boards");
  const base = part(
    "Base",
    "stud",
    [48, 12, 36],
    [0, 6, 0],
    project.steps[0].id,
    "Base",
  );
  const board = part(
    "Stacking board",
    "stud",
    [36, 3.5, 8],
    [-60, 1.75, 0],
    project.steps[0].id,
    "Loose",
  );
  project.pieces = [base, board];
  await importProject(page, project);
  const start = await screenPoint(page, project, board.position);
  const end = await screenPoint(page, project, [0, 15.5, 0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.up();
  const result = await exportProject(page);
  const placed = result.pieces.find((p) => p.id === board.id)!;
  expect(placed.position[1]).toBeCloseTo(13.75, 5);
  expect(bounds(placed).min[1]).toBeCloseTo(bounds(base).max[1], 5);
  expect(result.pieces.find((p) => p.id === base.id)).toEqual(base);
  expect(result.history).toHaveLength(1);
});

test("a catalog drop onto a base uses the top surface instead of the floor", async ({
  page,
}) => {
  const project = blank("Catalog stacking");
  project.pieces = [
    part("Base", "stud", [48, 12, 36], [0, 6, 0], project.steps[0].id, "Base"),
  ];
  await importProject(page, project);
  const point = await screenPoint(page, project, [0, 12, 0]);
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("Canvas missing");
  await page
    .locator(".material-card")
    .first()
    .dragTo(page.locator("canvas"), {
      targetPosition: { x: point.x - box.x, y: point.y - box.y },
    });
  await confirmMaterialPlacement(page);
  await expect(
    page.getByRole("spinbutton", { name: "Y", exact: true }),
  ).toHaveValue("60");
  const result = await exportProject(page);
  expect(bounds(result.pieces.at(-1)!).min[1]).toBeCloseTo(12, 4);
});
