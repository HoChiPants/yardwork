import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { bom, cutPiece } from "../../src/engine";
import { generateBuildGuide } from "../../src/guide";
import { blank, part, projectSchema, step } from "../../src/model";
import { assignOffcutToPart } from "../../src/offcutAssignment";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { previewOffcutSplit } from "../../src/offcutSplit";
import { planStockCutLayouts } from "../../src/recordStockCutLayout";
import { stockCutSequences } from "../../src/stockCutSequence";

test("show the earlier stage which leftover board supplies a later rail", async ({ page }) => {
  const project = blank("Rail scrap handoff");
  const later = step("Short rail fit", "Fit the rail.");
  project.steps.push(later);
  const long = part("Long rail", "stud", [3.5, 1.5, 96], [0, 0.75, 0], project.steps[0].id, "Long rail frame");
  const short = part("Short rail", "stud", [3.5, 1.5, 24], [12, 0.75, 0], later.id, "Short rail frame");
  project.pieces = [long, short];
  const trimmed = cutPiece(project, long.id, 54, 2);
  const scrap = trimmed.pieces.find(({ offcut }) => offcut)!;
  const assigned = assignOffcutToPart(trimmed, short.id, scrap.id);
  const shopStock = addMeasuredOffcut(assigned, project.steps[0].id, "stud", [20, 3.5, 1.5], "Unrelated shop scrap");
  const shopScrap = shopStock.pieces.at(-1)!;
  const plan = generateBuildGuide(previewOffcutSplit(shopStock, shopScrap.id, "crosscut", 6, "Trial block").next);

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "rail-scrap-handoff.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(plan)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const steps = page.locator(".step-track");
  const stock = page.locator('.inspector-scroll details[aria-label="Stock for this step"]');
  const firstStage = steps.getByRole("button", { name: /Assemble Long rail frame/ });
  const laterStage = steps.getByRole("button", { name: /Assemble Short rail frame/ });
  const firstNumber = Number(await firstStage.locator(".step-number").innerText());
  const laterNumber = Number(await laterStage.locator(".step-number").innerText());
  expect(firstNumber).toBeLessThan(laterNumber);
  const reminder = `Keep O001 (41.875 in × 3.5 in × 1.5 in) for step ${laterNumber} · P002 · Short rail.`;
  await firstStage.click();
  await stock.locator("summary").click();
  await expect(stock).toContainText(reminder);
  await laterStage.click();
  if (!(await stock.locator("summary").evaluate((summary) => summary.parentElement instanceof HTMLDetailsElement && summary.parentElement.open)))
    await stock.locator("summary").click();
  await expect(stock).toContainText(`Use P002 · first needed at step ${firstNumber} · offcut operation 1`);
  await expect(stock).not.toContainText(reminder);
  await stock.getByRole("button", { name: "Open offcut cuts for P002", exact: true }).click();
  const operations = dialog.getByRole("list", { name: "Offcut operations", exact: true }).getByRole("listitem");
  await expect(operations).toHaveCount(1);
  await expect(operations.first()).toContainText("Short rail");
  await dialog.getByRole("button", { name: "Show all offcut cuts", exact: true }).click();
  await expect(operations).toHaveCount(2);
  await expect(operations.nth(1)).toContainText("Unrelated shop scrap");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".print-guide")).toContainText(reminder);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain(reminder);
  expect(guide.indexOf(reminder)).toBeLessThan(guide.indexOf(`## ${laterNumber}. Assemble Short rail frame`));
});

test("open the shelf stage's shared sheet, mark cuts complete, and export stock before assembly", async ({ page }, info) => {
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/builds/shelves.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const original = projectSchema.parse(await fixture.json());
  const shelf = original.pieces.find(({ id }) => original.partLabels.some(({ partId, label }) => partId === id && label === "P006"))!;
  const seq = [...stockCutSequences(original, bom(original)).values()].flat().find(({ partIds }) => partIds.includes(shelf.id))!;
  const { project } = planStockCutLayouts(original, [seq.layout]);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "shelves-with-shared-cuts.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(".inspector-scroll").getByRole("button", { name: "Generate build guide", exact: true }).click();
  await page.locator(".step-track").getByRole("button", { name: /Set up supports and place shelves/ }).click();

  const inspector = page.locator(".inspector-scroll");
  const stock = inspector.locator('details[aria-label="Stock for this step"]');
  await stock.locator("summary").click();
  await expect(stock).toContainText("Planned stock cuts");
  await expect(stock).toContainText("Use P006, P007, P008 · first needed at step 2");
  await stock.screenshot({ path: info.outputPath("stage-stock.png") });
  await stock.getByRole("button", { name: "Open stock plan for P006" }).click();
  await expect(dialog.getByRole("heading", { name: "Stock for P006" })).toBeVisible();
  await dialog.getByRole("button", { name: "Mark cuts complete", exact: true }).click();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(stock).toContainText("Cuts marked complete");

  const print = page.locator(".print-guide");
  const printHeadings = await print.locator("h2").allTextContents();
  expect(printHeadings.indexOf("Stock cut order")).toBeGreaterThanOrEqual(0);
  expect(printHeadings.indexOf("Stock cut order")).toBeLessThan(printHeadings.findIndex((heading) => /^1\./.test(heading.trim())));
  const printedShelf = print.locator(":scope > section").filter({ has: page.getByRole("heading", { name: /3\. Bookcase: Set up supports and place shelves/, includeHidden: true }) });
  await expect(printedShelf).toContainText("Cuts marked complete");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide.indexOf("## Stock cut order")).toBeGreaterThanOrEqual(0);
  expect(guide.indexOf("## Stock cut order")).toBeLessThan(guide.indexOf("## 1."));
  expect(guide).toMatch(/## 3\. Bookcase: Set up supports and place shelves[\s\S]*?### Stock for this step[\s\S]*?Use P006, P007, P008/);
});
