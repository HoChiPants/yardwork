import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import {
  blank,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { generateBuildGuide } from "../../src/guide";
import { bounds } from "../../src/engine";
import { lidPreview, reviewLidTravel } from "../../src/lidMotion";
import { boundsCorners } from "../../src/cameraFit";
import { clipBox } from "../../src/cutProfiles";
import { rotate } from "../../src/spatial";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

type CameraTelemetry = {
  position: number[];
  quaternion: number[];
  target: number[];
  projectionMatrix: number[];
  matrixWorldInverse: number[];
  settled: boolean;
  framingBounds: { min: V3; max: V3 };
  safeRect: { left: number; top: number; right: number; bottom: number };
  viewport: { width: number; height: number };
  units: "feet";
};
function fixture() {
  let project = applyIdeaPlan(
    blank(`SYNTHETIC full lid framing ${uid().slice(0, 8)}`),
    localIdeaPlan({
      prompt:
        "One-section storage banquette 24 inches wide,24 inches deep,18 inches seat height,opening lid and no back",
    }),
  );
  project.notes =
    "SYNTHETIC camera-only acceptance. Camera/temporary angle changes must not enter any saved project or guide.";
  project.workZone = { width: 48, depth: 24, height: 24 };
  return generateBuildGuide(project);
}
async function load(page: Page, project: Project) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "synthetic-lid-framing.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate(
          (key) => localStorage.getItem(key),
          CURRENT_DRAFT_KEY,
        );
        return raw && JSON.parse(raw).project.name.startsWith(project.name);
      },
      { timeout: 15000 },
    )
    .toBeTruthy();
}
async function editable(page: Page): Promise<Project> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await download).path();
  if (!path) throw Error("No editable camera-fixture export");
  const project = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return project;
}
async function camera(page: Page): Promise<CameraTelemetry | null> {
  const raw = await page.locator("canvas").getAttribute("data-motion-camera");
  return raw ? JSON.parse(raw) : null;
}
async function settledCamera(page: Page) {
  let last: CameraTelemetry | null = null,
    stable = 0,
    previous = "";
  await expect
    .poll(
      async () => {
        last = await camera(page);
        if (!last?.settled) {
          stable = 0;
          return false;
        }
        const key = JSON.stringify([
          last.position,
          last.quaternion,
          last.target,
        ]);
        stable = key === previous ? stable + 1 : 0;
        previous = key;
        return stable >= 2;
      },
      { timeout: 15000, intervals: [100, 100, 150] },
    )
    .toBe(true);
  return last!;
}
function expectedBounds(project: Project, sectionId: string) {
  const boxes = [
    ...project.pieces.filter((piece) => !piece.offcut).map(bounds),
    reviewLidTravel(project, sectionId).bounds,
  ];
  return {
    min: [0, 1, 2].map(
      (axis) => Math.min(...boxes.map((box) => box.min[axis])) / 12,
    ) as V3,
    max: [0, 1, 2].map(
      (axis) => Math.max(...boxes.map((box) => box.max[axis])) / 12,
    ) as V3,
  };
}
function projected(pointFeet: V3, telemetry: CameraTelemetry) {
  const point = new Vector3(...pointFeet)
    .applyMatrix4(new Matrix4().fromArray(telemetry.matrixWorldInverse))
    .applyMatrix4(new Matrix4().fromArray(telemetry.projectionMatrix));
  return {
    x: ((point.x + 1) * telemetry.viewport.width) / 2,
    y: ((1 - point.y) * telemetry.viewport.height) / 2,
    z: point.z,
  };
}
async function assertFramed(
  page: Page,
  project: Project,
  sectionId: string,
  angle: number,
) {
  const telemetry = await settledCamera(page),
    expected = expectedBounds(project, sectionId),
    canvas = await page.locator("canvas").boundingBox();
  expect(telemetry.units).toBe("feet");
  expect(telemetry.projectionMatrix).toHaveLength(16);
  expect(telemetry.matrixWorldInverse).toHaveLength(16);
  expect(canvas).not.toBeNull();
  for (let axis = 0; axis < 3; axis++) {
    expect(telemetry.framingBounds.min[axis]).toBeCloseTo(
      expected.min[axis],
      8,
    );
    expect(telemetry.framingBounds.max[axis]).toBeCloseTo(
      expected.max[axis],
      8,
    );
  }
  expect(telemetry.viewport.width).toBeCloseTo(canvas!.width, 0);
  expect(telemetry.viewport.height).toBeCloseTo(canvas!.height, 0);
  expect(telemetry.safeRect.left).toBeGreaterThanOrEqual(16);
  expect(telemetry.safeRect.top).toBeGreaterThanOrEqual(54);
  expect(telemetry.safeRect.right).toBeLessThanOrEqual(
    telemetry.viewport.width - 60 + 1,
  );
  expect(telemetry.safeRect.bottom).toBeLessThanOrEqual(
    telemetry.viewport.height - 58 + 1,
  );
  const lid = lidPreview(project, sectionId, angle).piece,
    vertices = clipBox(lid.size, lid.cutPlanes).vertices.map(
      (point) =>
        rotate(point, lid.rotation).map(
          (value, axis) => (value + lid.position[axis]) / 12,
        ) as V3,
    );
  const points = [...boundsCorners(expected), ...vertices];
  for (const point of points) {
    const pixel = projected(point, telemetry);
    expect(pixel.x).toBeGreaterThanOrEqual(telemetry.safeRect.left - 1);
    expect(pixel.x).toBeLessThanOrEqual(telemetry.safeRect.right + 1);
    expect(pixel.y).toBeGreaterThanOrEqual(telemetry.safeRect.top - 1);
    expect(pixel.y).toBeLessThanOrEqual(telemetry.safeRect.bottom + 1);
    expect(pixel.z).toBeGreaterThan(-1);
    expect(pixel.z).toBeLessThan(1);
  }
  await expect(
    page.getByRole("toolbar", { name: "Model tools", exact: true }),
  ).toBeHidden();
  const banner = await page.locator(".lid-preview-banner").boundingBox();
  expect(banner).not.toBeNull();
  expect(
    banner!.y >= canvas!.y + canvas!.height - 1 ||
      banner!.y + banner!.height <= canvas!.y + 1,
  ).toBe(true);
  return telemetry;
}
async function start(page: Page, sectionId: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(sectionId);
  const panel = page.getByRole("region", {
    name: "Lid travel review",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  await expect(page.getByTestId("lid-preview-label")).toHaveAttribute(
    "data-angle",
    "0",
  );
  return panel;
}
async function angle(page: Page, degrees: number) {
  const slider = page.getByRole("slider", {
    name: "Lid preview angle",
    exact: true,
  });
  if (degrees === 75)
    await page
      .getByRole("button", { name: "Inspect open (75°)", exact: true })
      .click();
  else {
    await slider.focus();
    await slider.press("Home");
    for (let i = 0; i < degrees; i++) await slider.press("ArrowRight");
  }
  await expect(page.getByTestId("lid-preview-label")).toHaveAttribute(
    "data-angle",
    String(degrees),
  );
}
function sameCamera(actual: CameraTelemetry, expected: CameraTelemetry) {
  for (const key of [
    "position",
    "quaternion",
    "target",
    "projectionMatrix",
    "matrixWorldInverse",
  ] as const)
    for (let i = 0; i < actual[key].length; i++)
      expect(actual[key][i]).toBeCloseTo(expected[key][i], 6);
}

test("desktop natural entry frames full travel, manual orbit survives scrubbing, and Fit uses that full envelope", async ({
  page,
}) => {
  const project = fixture();
  await load(page, project);
  const before = await editable(page),
    printBefore = await page.locator(".print-guide").textContent(),
    sectionId = project.sections[0].id;
  await start(page, sectionId);
  const entered = await assertFramed(page, before, sectionId, 0);
  for (const degrees of [37, 75]) {
    await angle(page, degrees);
    const framed = await assertFramed(page, before, sectionId, degrees);
    sameCamera(framed, entered);
  }
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw Error("No motion canvas");
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    canvas.x + canvas.width / 2 + 25,
    canvas.y + canvas.height / 2 - 8,
    { steps: 12 },
  );
  await page.mouse.up({ button: "right" });
  const orbited = await settledCamera(page);
  expect(orbited.matrixWorldInverse).not.toEqual(entered.matrixWorldInverse);
  for (const degrees of [0, 37, 75]) {
    await angle(page, degrees);
    sameCamera(await settledCamera(page), orbited);
  }
  await page.getByRole("button", { name: "Fit project", exact: true }).click();
  await assertFramed(page, before, sectionId, 75);
  expect(await page.locator(".print-guide").textContent()).toBe(printBefore);
  expect(await editable(page)).toEqual(before);
  const exit = page.getByRole("button", {
    name: "Exit lid preview",
    exact: true,
  });
  if (await exit.count()) await exit.click();
  await expect(page.getByTestId("lid-preview-label")).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "Model tools", exact: true }),
  ).toBeVisible();
});

test("phone entry and resize frame all sampled travel away from tools and banner without manual Fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = fixture();
  await load(page, project);
  const before = await editable(page),
    printBefore = await page.locator(".print-guide").textContent(),
    sectionId = project.sections[0].id;
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  const initialCanvas = await page.locator("canvas").boundingBox();
  if (!initialCanvas) throw Error("No measurement canvas before lid preview");
  // Real floor picks in the left gutter avoid the measurement HUD itself.
  await page.mouse.click(
    initialCanvas.x + 5,
    initialCanvas.y + initialCanvas.height * 0.6,
  );
  await page.mouse.click(
    initialCanvas.x + 10,
    initialCanvas.y + initialCanvas.height * 0.3,
  );
  const measurementPanel = page.locator(".measurement-panel"),
    distance = measurementPanel.locator(
      'output[aria-label="Measured distance"]',
    );
  await expect(distance).toBeVisible();
  const retainedDistance = await distance.textContent(),
    retainedMarker = await page.getByTestId("measurement-label").textContent();
  const retainedPoints = await measurementPanel
    .locator('input[aria-label^="Point "]')
    .evaluateAll((inputs) =>
      inputs.map((input) => ({
        label: input.getAttribute("aria-label"),
        value: (input as HTMLInputElement).value,
      })),
    );
  expect(retainedPoints).toHaveLength(6);
  expect(
    Number(retainedDistance?.match(/\(([\d.]+) in\)/)?.[1]),
  ).toBeGreaterThan(0);
  await start(page, sectionId);
  await expect(measurementPanel).toHaveCount(0);
  await expect(page.getByTestId("measurement-label")).toHaveCount(0);
  const entered = await assertFramed(page, before, sectionId, 0);
  for (const degrees of [37, 75]) {
    await angle(page, degrees);
    sameCamera(await assertFramed(page, before, sectionId, degrees), entered);
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await assertFramed(page, before, sectionId, 75);
  await angle(page, 0);
  await assertFramed(page, before, sectionId, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await angle(page, 75);
  await assertFramed(page, before, sectionId, 75);
  await expect(measurementPanel).toHaveCount(0);
  await page
    .getByRole("button", { name: "Exit lid preview", exact: true })
    .click();
  await expect(page.getByTestId("lid-preview-label")).toHaveCount(0);
  await expect(distance).toHaveText(retainedDistance!);
  await expect(page.getByTestId("measurement-label")).toHaveText(
    retainedMarker!,
  );
  expect(
    await measurementPanel
      .locator('input[aria-label^="Point "]')
      .evaluateAll((inputs) =>
        inputs.map((input) => ({
          label: input.getAttribute("aria-label"),
          value: (input as HTMLInputElement).value,
        })),
      ),
  ).toEqual(retainedPoints);
  expect(await page.locator(".print-guide").textContent()).toBe(printBefore);
  const after = await editable(page);
  expect(after).toEqual(before);
  expect(after.history).toEqual(before.history);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
