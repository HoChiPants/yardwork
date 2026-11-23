import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { readFile } from "node:fs/promises";
import { blank, part, type Project, type V3 } from "../../src/model";
import { bounds } from "../../src/engine";
import { fitPerspectiveBounds } from "../../src/cameraFit";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";

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
  const visibleParts = project.pieces.filter(({ offcut }) => !offcut);
  if (visibleParts.length) {
    const boxes = visibleParts.map(bounds);
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
test("measurement can follow a picked wood surface while the other point stays fixed", async ({
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

  await page.getByText("Point B · exact coordinates", { exact: true }).click();
  for (const [axis, value] of [["X", "19"], ["Y", "3.5"], ["Z", "0"]]) {
    const field = page.getByRole("spinbutton", { name: "Point B " + axis });
    await field.fill(value);
    await field.press("Tab");
  }
  await page.getByLabel("Follow picked wood parts").check();
  await page.getByRole("textbox", { name: "Dimension name" }).fill("Opening offset");
  await page.getByRole("button", { name: "Save dimension", exact: true }).click();
  const linked = (await exported(page)).workspaceDimensions?.[0];
  expect(linked?.anchors?.a?.pieceId).toBe(project.pieces[0].id);
  expect(linked?.anchors?.b).toBeUndefined();
  expect(linked?.b).toEqual([19, 3.5, 0]);
  await page.getByRole("button", { name: "Done measuring", exact: true }).click();
  await page.mouse.click(a.x, a.y);
  const moveX = page.getByRole("spinbutton", { name: "X", exact: true });
  await moveX.fill("12");
  await moveX.press("Tab");
  await expect.poll(async () => Math.abs(inches(await page.getByTestId("measurement-label").innerText()) - 25)).toBeLessThan(0.25);
  await expect(page.locator(".print-guide")).toContainText("B (19, 3.5, 0) · A follows P001");
});
test("save a floor dimension and use its length to plan a lumber cut", async ({ page }) => {
  const blankProject = blank("Measure empty space");
  const project = addMeasuredOffcut(blankProject, blankProject.steps[0].id, "stud", [32, 3.5, 1.5], "Framing scrap");
  project.name += ` ${project.id.slice(0, 8)}`;
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
  for (const end of ["A", "B"]) {
    await page.getByText("Point " + end + " · exact coordinates", { exact: true }).click();
    for (const axis of ["X", "Y", "Z"]) {
      const input = page.getByRole("spinbutton", { name: "Point " + end + " " + axis });
      await input.fill(end === "B" && axis === "X" ? "24" : "0");
      await input.press("Tab");
    }
  }
  await page.getByRole("textbox", { name: "Dimension name" }).fill("Cabinet opening");
  await page.getByRole("button", { name: "Save dimension", exact: true }).click();
  await expect(page.getByTestId("measurement-label")).toHaveText("Cabinet opening · 2′");
  const result = await exported(page);
  expect(result.pieces).toEqual(project.pieces);
  expect(result.history).toEqual([]);
  expect(result.workspaceDimensions).toEqual([{ id: expect.any(String), name: "Cabinet opening", a: [0, 0, 0], b: [24, 0, 0] }]);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: project.name }).click();
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  await page.getByText("Saved dimensions (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Cabinet opening · 2 ft", exact: true }).click();
  await expect(page.getByTestId("measurement-label")).toHaveText("Cabinet opening · 2′");
  await page.getByRole("button", { name: "Done measuring", exact: true }).click();
  await expect(page.getByTestId("measurement-label")).toHaveText("Cabinet opening · 2′");
  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();

  await page.getByRole("textbox", { name: "Dimension name" }).fill("Face-frame opening");
  await page.getByRole("button", { name: "Update dimension", exact: true }).click();
  const guideRow = "Face-frame opening · 2 ft · A (0, 0, 0) · B (24, 0, 0)";
  await expect(page.locator(".print-guide")).toContainText(guideRow);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  expect(await readFile((await (await download).path())!, "utf8")).toContain(guideRow);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Plan cut from saved mark", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Saved dimension · Face-frame opening · 2 ft");
  await expect(dialog.getByRole("button", { name: "Place from O001", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Plan cut from new stock", exact: true })).toBeVisible();
  const finishedLength = dialog.getByRole("spinbutton", { name: "Needed finished length" });
  await finishedLength.fill("1.875");
  await dialog.getByLabel("Lumber for saved dimension").selectOption("framing-2x6");
  await expect(dialog.getByRole("heading", { name: "2 × 6 framing lumber", exact: true })).toBeVisible();
  await expect(dialog).toContainText("Saved dimension · Face-frame opening · 2 ft");
  await expect(finishedLength).toHaveValue("1.875");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const prompt = dialog.getByRole("textbox", { name: "Describe your idea" });
  await prompt.fill("Cut a 2x4 to saved dimension “Face-frame opening”.");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  const answer = dialog.getByRole("region", { name: "Lumber cut from a saved dimension" });
  await expect(answer).toContainText("Face-frame opening · 2 ft finished length");
  await answer.getByRole("button", { name: "Compare lumber and scraps", exact: true }).click();
  await dialog.getByRole("button", { name: "Along saved mark", exact: true }).click();
  await expect(dialog).toContainText("The board lies flat along the floor mark.");
  await expect(page.locator("canvas")).toHaveAttribute("data-material-drop-point", "[12,0.75,0]");
  await finishedLength.fill("2.25");
  await expect(dialog).toContainText("The finished length extends beyond the saved marks.");
  await expect(dialog.getByRole("button", { name: "Place from O001", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Use saved dimension (2 ft)", exact: true }).click();
  await dialog.getByRole("button", { name: "Place from O001", exact: true }).click();
  const cutGuide = page.locator(".print-guide");
  await expect(cutGuide).toContainText("2 × 4 framing lumber · Face-frame opening");
  await expect(cutGuide).toContainText("Crosscut to 2 ft");
  await expect(cutGuide).toContainText("7.875 in");
  const aligned = (await exported(page)).pieces.find(({ offcut }) => !offcut);
  expect(aligned?.position).toEqual([12, 0.75, 0]);

  await page.getByRole("button", { name: "Measure (D)", exact: true }).click();
  await page.getByText("Saved dimensions (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Remove Face-frame opening", exact: true }).click();
  await expect(page.getByTestId("measurement-label")).toHaveCount(0);
  await expect(page.locator(".print-guide")).not.toContainText(guideRow);
});
