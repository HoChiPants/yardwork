import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

function twoSheetDrawing() {
  const streams = [
    "0 0 0 RG 3 w 25 25 250 300 re S",
    "0 0 0 RG 3 w 40 40 320 120 re S 40 100 m 360 100 l S",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 5 0 R /Resources << >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 6 0 R /Resources << >> >>",
    ...streams.map((body) => `<< /Length ${body.length} >>\nstream\n${body}\nendstream`),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

test("a local PDF sheet frames the model at the measured scale and survives save and re-import", async ({ page }) => {
  test.setTimeout(90_000);
  const outsideRequests: string[] = [];
  const documentWrites: string[] = [];
  await page.goto("./");
  const appOrigin = new URL(page.url()).origin;
  page.on("request", (request) => {
    const address = new URL(request.url());
    const fontStyle = address.hostname === "fonts.googleapis.com" && request.resourceType() === "stylesheet";
    const appFont = address.hostname === "fonts.gstatic.com" && request.resourceType() === "font";
    if (address.protocol.startsWith("http") && address.origin !== appOrigin && !fontStyle && !appFont)
      outsideRequests.push(request.url());
    if (address.protocol.startsWith("http") && request.method() !== "GET")
      documentWrites.push(request.url());
  });
  const openImport = async (kind: string) => {
    await page.getByRole("button", { name: "Open project", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Import format", exact: true }).selectOption(kind);
    return dialog;
  };
  const dialog = await openImport("drawing");
  await dialog.getByLabel("Drawing file", { exact: true }).setInputFiles({
    name: "two-sheet-test.pdf", mimeType: "application/pdf", buffer: twoSheetDrawing(),
  });
  const sheet = dialog.getByRole("button", { name: "Mark a scale point on the drawing", exact: true });
  // The first sheet may need to start a cold worker and decode graphics on the CI runner.
  await expect(dialog).toContainText("two-sheet-test.pdf · Page 1", { timeout: 25_000 });
  await dialog.getByRole("spinbutton", { name: "PDF page (1–2)", exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Load page", exact: true }).click();
  await expect(dialog).toContainText("two-sheet-test.pdf · Page 2", { timeout: 15_000 });
  expect(await sheet.locator("img").evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const raster = document.createElement("canvas");
    raster.width = img.naturalWidth;
    raster.height = img.naturalHeight;
    const ctx = raster.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(Math.floor(raster.width / 2), Math.floor(raster.height / 2), 1, 1).data[0];
  })).toBeLessThan(80);
  await sheet.scrollIntoViewIfNeeded();
  const preview = (await sheet.boundingBox())!;
  await sheet.click({ position: { x: preview.width * 0.1, y: preview.height * 0.5 } });
  await sheet.click({ position: { x: preview.width * 0.9, y: preview.height * 0.5 } });
  await expect(sheet.locator(".drawing-sheet-point")).toHaveCount(2);
  await dialog.getByText("Enter point coordinates", { exact: true }).click();
  for (const [name, value] of [
    ["Point A across (%)", "10"], ["Point A down (%)", "50"], ["Point B across (%)", "90"], ["Point B down (%)", "50"],
  ]) await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  await dialog.getByRole("combobox", { name: "Real distance between A and B units", exact: true }).selectOption("ft");
  await dialog.getByRole("spinbutton", { name: "Real distance between A and B", exact: true }).fill("20");
  await expect(dialog.getByRole("status")).toContainText("Drawing footprint 25 ft × 150 in");
  await dialog.getByRole("button", { name: "Use drawing reference", exact: true }).click();
  const workspace = page.locator("canvas").first();
  await expect(workspace).toHaveAttribute("data-drawing-reference", /"width":300,"depth":150/);
  await expect(page.locator(".empty-workspace")).toHaveCount(0);
  await page.getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 part");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft()).revision).toBe(1);
  const original = (await draft()).project.drawingReference;
  expect(original.page).toBe(2);
  expect(original.calibration.distance).toBe(240);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await expect(workspace).toHaveAttribute("data-drawing-reference", /"width":300,"depth":150/);
  await page.getByRole("button", { name: "Edit drawing reference", exact: true }).click();
  await dialog.getByText("Placement and display", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Show drawing in workspace", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Save drawing reference", exact: true }).click();
  await expect(workspace).not.toHaveAttribute("data-drawing-reference", /./);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const downloaded = (await (await download).path())!;
  const exported = JSON.parse(await readFile(downloaded, "utf8"));
  expect(exported.drawingReference).toEqual({ ...original, calibration: { ...original.calibration, visible: false } });
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openImport("project");
  await dialog.locator("input[type=file]").setInputFiles(downloaded);
  await page.getByRole("button", { name: "Edit drawing reference", exact: true }).click();
  await dialog.getByText("Placement and display", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Show drawing in workspace", exact: true }).check();
  await dialog.getByRole("button", { name: "Save drawing reference", exact: true }).click();
  await expect(workspace).toHaveAttribute("data-drawing-reference", /"width":300,"depth":150/);
  await expect(page.locator(".print-guide .drawing-reference-print")).toContainText("A–B 20 ft");
  expect(outsideRequests).toEqual([]);
  expect(documentWrites).toEqual([]);
});

test("an image reference can be placed precisely, hidden or removed without changing the build", async ({ page }) => {
  await page.goto("./");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 320;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 640, 320);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 600, 280);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Import format", exact: true }).selectOption("drawing");
  const file = dialog.getByLabel("Drawing file", { exact: true });
  await file.setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("<svg/>") });
  await expect(dialog.getByRole("alert")).toContainText("Choose a PDF, PNG, JPEG or WebP drawing.");
  await file.setInputFiles({ name: "small-room.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await dialog.getByRole("button", { name: "Use full drawing width", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Real distance between A and B", exact: true }).fill("120");
  await dialog.getByText("Placement and display", { exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Drawing center X", exact: true }).fill("24");
  await dialog.getByRole("spinbutton", { name: "Rotation in degrees", exact: true }).fill("90");
  await expect(dialog.getByRole("status")).toContainText("10 ft × 5 ft");
  await dialog.getByRole("button", { name: "Use drawing reference", exact: true }).click();
  const workspace = page.locator("canvas").first();
  await expect(workspace).toHaveAttribute("data-drawing-reference", /"angle":90,"center":\[24,0\]/);
  await page.getByRole("button", { name: "Edit drawing reference", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove drawing reference", exact: true }).click();
  await expect(workspace).not.toHaveAttribute("data-drawing-reference", /./);
  await expect(page.locator(".statusbar")).toContainText("1 part");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(workspace).toHaveAttribute("data-drawing-reference", /"angle":90,"center":\[24,0\]/);
});
