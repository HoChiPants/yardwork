import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { caseworkFastenerBodies, previewCaseworkFastenerRows } from "../../src/caseworkFastenerRows";
import { connectionCoverage } from "../../src/connectionCoverage";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, projectSchema } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";

test("preview and save screw rows for all remaining bookcase body joints", async ({ page }) => {
  const design = applyIdeaPlan(blank("Bookcase with planned body joints"), localIdeaPlan({
    prompt: "Build a 36 in wide, 66 in high, 14 in deep plywood bookcase with four adjustable shelves",
  }));
  const [body] = caseworkFastenerBodies(design, connectionCoverage(design).intents);
  const { project } = previewCaseworkFastenerRows(design, body, ["side-left/top"], {
    count: 2, endInset: 2, beforeFloorPlacement: false, productId: "grk-cabinet-114069",
  });
  const before = project.fastenerPlans[0];
  expect(before.label).toBe("W001");
  const draft = async () => projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "bookcase-fastener-rows.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  await page.getByRole("button", { name: "Review connection decisions", exact: true }).click();
  await page.getByText("Casework screw rows", { exact: true }).click();
  const rows = page.getByRole("region", { name: "Casework screw rows", exact: true });
  await expect(rows.getByRole("button", { name: "Review W001", exact: true })).toBeVisible();
  await expect(rows.getByRole("checkbox", { name: / into / })).toHaveCount(7);
  await rows.getByRole("combobox", { name: "Cabinet screw", exact: true }).selectOption("grk-cabinet-114069");
  await rows.getByRole("spinbutton", { name: "Inset from each contact end", exact: true }).fill("2");
  await rows.getByRole("button", { name: "Preview casework screw rows", exact: true }).click();
  await expect(rows.getByRole("status")).toContainText("7 of 7 rows ready to save");
  expect((await draft()).fastenerPlans).toEqual([before]);
  await rows.getByRole("button", { name: "Save 7 screw rows", exact: true }).click();
  await expect.poll(async () => (await draft()).fastenerPlans.length).toBe(8);

  const saved = await draft();
  expect(saved.fastenerPlans[0]).toEqual(before);
  expect(saved.fastenerPlans.map(({ label }) => label)).toEqual(
    Array.from({ length: 8 }, (_, i) => "W00" + (i + 1)),
  );
  expect(saved.fastenerPlans.every(({ locations }) => locations.length === 2)).toBe(true);
  expect(saved.fastenerPlans.every(({ measurements }) =>
    measurements.surfaceToTipDepth === null && measurements.pilotDiameter === null && measurements.pilotDepth === null)).toBe(true);
  expect(saved.supplies).toEqual(project.supplies);
  expect(saved.pieces).toEqual(project.pieces);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft()).fastenerPlans.length).toBe(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await draft()).fastenerPlans.length).toBe(8);

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("W008");
  expect(guide).toContain("Back into bottom");
  expect(guide).toContain("Entered end inset 2 in at each end");
});
