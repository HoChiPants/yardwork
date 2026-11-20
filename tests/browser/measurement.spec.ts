import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { blank, part, type Project, type V3 } from "../../src/model";
import { bounds } from "../../src/engine";
import { fitPerspectiveBounds } from "../../src/cameraFit";

async function load(page: Page, project: Project) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "measure.json",
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
async function screen(page: Page, project: Project, point: V3) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("No canvas");
  let min: number[] = [-36, 0, -24],
    max: number[] = [36, 84, 24];
  if (project.pieces.length) {
    const boxes = project.pieces.map(bounds);
    min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i])));
    max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i])));
  }
  const camera = new PerspectiveCamera(38, box.width / box.height, 0.05, 500);
  const fitted = fitPerspectiveBounds(
    {
      min: min.map((v) => v / 12) as V3,
      max: max.map((v) => v / 12) as V3,
    },
    {
      verticalFovDegrees: 38,
      aspect: box.width / box.height,
      direction: [1.2, 0.85, 1.35],
      padding: 1.1,
      minDistance: 2,
      nearClip: 0.05,
    },
  );
  camera.position.set(...fitted.position);
  camera.lookAt(...fitted.target);
  camera.updateMatrixWorld();
  const projected = new Vector3(...(point.map((v) => v / 12) as V3)).project(
    camera,
  );
  return {
    x: box.x + ((projected.x + 1) * box.width) / 2,
    y: box.y + ((1 - projected.y) * box.height) / 2,
  };
}
function inches(text: string) {
  const feet = Number(text.match(/(\d+(?:\.\d+)?)′/)?.[1] ?? 0);
  const rest = Number(text.match(/(\d+(?:\.\d+)?)″/)?.[1] ?? 0);
  return feet * 12 + rest;
}
async function exported(page: Page): Promise<Project> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const stream = await (await pending).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return JSON.parse(Buffer.concat(chunks).toString());
}
test("measurement picks two distinct points on one part without editing it", async ({
  page,
}) => {
  const project = blank("Measure a board");
  project.pieces = [
    part(
      "Measurement board",
      "stud",
      [48, 3.5, 24],
      [0, 1.75, 0],
      project.steps[0].id,
      "Board",
    ),
  ];
  await load(page, project);
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  const a = await screen(page, project, [-18, 3.5, 0]);
  const b = await screen(page, project, [18, 3.5, 0]);
  await page.mouse.click(a.x, a.y);
  await expect(page.getByTestId("measurement-label")).toContainText(
    "choose end point",
  );
  await page.mouse.click(b.x, b.y);
  const measured = inches(
    await page.getByTestId("measurement-label").innerText(),
  );
  // Fit animation stops within .03 scene feet; projected pick tolerance is .25 inches.
  expect(Math.abs(measured - 36)).toBeLessThan(0.25);
  const result = await exported(page);
  expect(result.pieces).toEqual(project.pieces);
  expect(result.joints).toEqual([]);
  expect(result.history).toEqual([]);
});
test("measurement works on the floor of an empty project", async ({ page }) => {
  const project = blank("Measure empty space");
  await load(page, project);
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  const a = await screen(page, project, [0, 0, 0]);
  const b = await screen(page, project, [24, 0, 0]);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  const measured = inches(
    await page.getByTestId("measurement-label").innerText(),
  );
  expect(Math.abs(measured - 24)).toBeLessThan(0.25);
  const result = await exported(page);
  expect(result.pieces).toEqual([]);
  expect(result.history).toEqual([]);
});
