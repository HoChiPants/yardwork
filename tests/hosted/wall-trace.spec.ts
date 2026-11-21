import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

async function clickFloor(canvas: Locator, world: [number, number, number]) {
  const position = await canvas.evaluate((element, point) => {
    const camera = JSON.parse((element as HTMLCanvasElement).dataset.workshopCamera!);
    const project = (matrix: number[], vector: number[]) => [0, 1, 2, 3].map((row) =>
      vector.reduce((value, n, column) => value + n * matrix[column * 4 + row], 0));
    const view = project(camera.matrixWorldInverse, [...point.map((value) => value / 12), 1]);
    const screen = project(camera.projectionMatrix, view);
    return {
      x: (screen[0] / screen[3] + 1) * element.clientWidth / 2,
      y: (1 - screen[1] / screen[3]) * element.clientHeight / 2,
    };
  }, world);
  await canvas.click({ position });
}

test("a DXF trace becomes two editable wall panels with cuts, obstruction review and a saved guide", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(12_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Import format", exact: true }).selectOption("dxf");
  await dialog.locator("input[type=file]").setInputFiles({ name: "room.dxf", mimeType: "application/dxf", buffer: Buffer.from([
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "10", "-120.25", "20", "0.5", "11", "119.75", "21", "0.5",
    "0", "LINE", "10", "0", "20", "0.5", "11", "0", "21", "72",
    "0", "ENDSEC", "0", "EOF", "",
  ].join("\n")) });
  const trace = page.getByRole("button", { name: "Trace a wall", exact: true });
  await trace.click();
  const settings = page.getByRole("region", { name: "Trace wall settings" });
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 20_000 });
  await clickFloor(canvas, [-120.25, 0, 0.5]);
  await expect(page.locator(".wall-trace-hint")).toContainText("Click point B");
  await clickFloor(canvas, [119.75, 0, 0.5]);
  await expect(settings.getByLabel("Point A X", { exact: true })).toHaveValue("-120.25");
  await expect(settings.getByLabel("Point B X", { exact: true })).toHaveValue("119.75");
  await settings.getByRole("combobox", { name: "Framing lumber", exact: true }).selectOption("hd-spf-2x4-12");
  await expect(settings.getByLabel("Wall run preview")).toContainText("20 ft · 2 panels");
  await expect(settings.getByText("Panel lengths 12 ft + 8 ft.", { exact: false })).toBeVisible();
  await settings.getByText(/new boards for this run/).click();
  await expect(settings.getByText(/Wall 1 · bottom plate 12 ft/)).toBeVisible();
  await settings.getByRole("button", { name: "Add traced wall", exact: true }).click();
  await expect(settings).toHaveCount(0);

  await trace.click();
  await settings.getByText("Exact wall coordinates", { exact: true }).click();
  for (const [field, value] of [["Point A X", "0"], ["Point A Z", "0.5"], ["Point B X", "0"], ["Point B Z", "72"]])
    await settings.getByLabel(field, { exact: true }).fill(value);
  await expect(settings.getByRole("alert")).toContainText("Wall overlaps");
  await expect(settings.getByRole("button", { name: "Add traced wall", exact: true })).toBeDisabled();
  await settings.getByText("Trim the ends for adjoining walls", { exact: true }).click();
  await settings.getByLabel("Start trim", { exact: true }).fill("1.75");
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await settings.getByRole("button", { name: "Add traced wall", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft()).revision).toBe(1);
  const saved = (await draft()).project;
  expect(saved.planLines).toHaveLength(2);
  expect(saved.sections.map((section: { generator: { width: number } }) => section.generator.width)).toEqual([144, 96, 69.75]);
  expect(saved.sections[2].rotation[1]).toBeCloseTo(-Math.PI / 2);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Dry-fit this panel against the preceding panel");
  expect(guide).toContain("Wall 3 · bottom plate");
});

test("a calibrated drawing supports a wall trace and exact mixed units on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 240;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 480, 240);
    context.fillStyle = "#333";
    context.fillRect(60, 117, 360, 6);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Import format", exact: true }).selectOption("drawing");
  await dialog.getByLabel("Drawing file", { exact: true }).setInputFiles({ name: "wall-run.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await dialog.getByRole("button", { name: "Use full drawing width", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Real distance between A and B", exact: true }).fill("96");
  await dialog.getByRole("button", { name: "Use drawing reference", exact: true }).click();
  await page.getByRole("button", { name: "Trace a wall", exact: true }).click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-drawing-reference", /"width":96,"depth":48/);
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 20_000 });
  await clickFloor(canvas, [-36, 0, 0]);
  await expect(page.locator(".wall-trace-hint")).toContainText("Click point B");
  await clickFloor(canvas, [36, 0, 0]);
  await page.getByRole("button", { name: "Wall settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Inspector" }).getByRole("region", { name: "Trace wall settings" });
  await expect(settings.getByLabel("Wall run preview")).toHaveText("6 ft · 1 panel · 8 parts");
  await settings.getByRole("spinbutton", { name: "Wall height", exact: true }).fill("7");
  await settings.getByRole("spinbutton", { name: "Base elevation", exact: true }).fill("6");
  await expect(settings.getByRole("combobox", { name: "Wall height units", exact: true })).toHaveValue("ft");
  await expect(settings.getByRole("combobox", { name: "Base elevation units", exact: true })).toHaveValue("in");
  await settings.getByRole("button", { name: "Add traced wall", exact: true }).click();
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-drawing-reference", /"width":96,"depth":48/);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const section = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.project.sections[0], CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await section())?.generator.height).toBe(84);
  expect((await section()).origin).toEqual([0, 6, 0]);
});

test("import a lightweight polyline, choose its room on the plan and save editable corner framing", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(15_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Import format", exact: true }).selectOption("dxf");
  await dialog.locator("input[type=file]").setInputFiles({ name: "two-rooms.dxf", mimeType: "application/dxf", buffer: Buffer.from([
    0, "SECTION", 2, "ENTITIES", 0, "LWPOLYLINE", 90, 4, 70, 1,
    10, -120, 20, -48, 10, 120, 20, -48, 10, 120, 20, 48, 10, -120, 20, 48,
    0, "LINE", 10, -12, 20, -48, 11, -12, 21, 48,
    0, "ENDSEC", 0, "EOF", "",
  ].join("\n")) });
  const openOutline = page.getByRole("button", { name: "Frame a DXF outline", exact: true });
  await openOutline.click();
  const settings = page.getByRole("region", { name: "Frame room settings" });
  const selected = settings.getByRole("combobox", { name: "Plan outline", exact: true });
  await expect(selected.locator("option")).toHaveCount(3);
  const add = settings.getByRole("button", { name: "Add room framing", exact: true });
  await expect(add).toBeDisabled();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-workshop-camera", /"settled":true/, { timeout: 25_000 });
  await clickFloor(canvas, [-60, 0, 0]);
  await expect(selected).toHaveValue("1");
  await settings.getByRole("combobox", { name: "Framing lumber", exact: true }).selectOption("hd-spf-2x4-10");
  await settings.getByRole("combobox", { name: "Drawing line marks", exact: true }).selectOption("outside");
  await expect(settings.getByLabel("Room framing preview")).toContainText("4 walls · 4 panels");
  await settings.getByText(/new boards for this outline/).click();
  await expect(settings.getByText(/Wall 1 · bottom plate 9 ft/)).toBeVisible();
  await add.click();
  await expect(settings).toHaveCount(0);

  await openOutline.click();
  await selected.selectOption("1");
  await expect(settings.getByRole("alert")).toContainText("Framing overlaps");
  await expect(add).toBeDisabled();
  await settings.getByRole("button", { name: "Cancel trace", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft()).revision).toBe(1);
  const saved = (await draft()).project;
  expect(saved.planLines).toHaveLength(5);
  expect(saved.sections.map((section: { generator: { width: number } }) => section.generator.width)).toEqual([108, 108, 89, 89]);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Walls 4 and 2 butt into this wall’s side faces.");
  expect(guide.indexOf("Room wall 3 of 4")).toBeLessThan(guide.indexOf("Room wall 2 of 4"));
});
