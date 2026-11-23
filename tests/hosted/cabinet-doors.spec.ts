import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { cabinetDoorStock } from "../../src/cabinetDoorsSchema";
import { libertyFlushHinge } from "../../src/cabinetDoorsReference";
import { libertyBarPull } from "../../src/cabinetPullReference";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { blank, material, part, projectSchema } from "../../src/model";
import { createSection } from "../../src/sections";

test("fit a scribed cabinet filler from scrap, compare door travel and reopen its cut guide", async ({ page }) => {
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/wood-stock/cabinet-scribe-filler.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "cabinet-scribe-filler.yardwork.json", mimeType: "application/json", buffer: await fixture.body(),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Plan a scribe filler for P001");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await dialog.getByRole("button", { name: "Open filler planner" }).click();
  await dialog.getByRole("spinbutton", { name: "Wall gap at bottom", exact: true }).fill("2");
  await dialog.getByRole("spinbutton", { name: "Wall gap halfway up", exact: true }).fill("1.75");
  await dialog.getByRole("spinbutton", { name: "Wall gap at top", exact: true }).fill("1.5");
  await dialog.getByRole("spinbutton", { name: "Gap to leave at wall", exact: true }).fill("0.125");
  const check = dialog.getByRole("button", { name: "Preview filler and travel" });
  await check.click();
  const changes = dialog.getByRole("region", { name: "Changes to saved movement" });
  await expect(changes).toContainText("Adjacent sliding door against P003 · Cabinet wall filler");
  await changes.getByRole("button", { name: "Show contact in 3D" }).first().click();
  await expect(changes.getByRole("button", { name: "Return to closed view" })).toBeVisible();
  await dialog.getByRole("spinbutton", { name: "Setback from cabinet front", exact: true }).fill("0.875");
  await check.click();
  const fit = dialog.getByRole("region", { name: "Scribe filler preview" });
  await expect(fit).toContainText("No new clearance findings in the saved movement tests.");
  await expect(fit).toContainText("Mark 1.875 in at the bottom and 1.375 in at the top");
  await expect(fit).toContainText("Use O001 · Crosscut to 30 in");
  await fit.getByRole("button", { name: "Add filler to project" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved = projectSchema.parse((await readDraft()).project);
  expect(saved.scribeFillers?.[0].input.setback).toBe(0.875);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: saved.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const text = await readFile((await (await guide).path())!, "utf8");
  expect(text).toMatch(/Crosscut to 30 in[\s\S]*Keep O002 · 5.875 in/);
  expect(text).toContain("Mark 1.875 in at the bottom and 1.375 in at the top");
});

test("fit banded cabinet doors from one scrap and check pull clearance before saving the guide", async ({ page }, info) => {
  const source = blank("Test face-frame cabinet");
  const step = source.steps[0].id;
  const stock = cabinetDoorStock[0];
  const frame = [
    part("Left face-frame stile", "hd-pine-1x4", [3.5, 30, 0.75], [-14.75, 15, 0], step, "Cabinet face frame"),
    part("Right face-frame stile", "hd-pine-1x4", [3.5, 30, 0.75], [14.75, 15, 0], step, "Cabinet face frame"),
    part("Bottom face-frame rail", "hd-pine-1x4", [26, 3.5, 0.75], [0, 1.75, 0], step, "Cabinet face frame"),
    part("Top face-frame rail", "hd-pine-1x4", [26, 3.5, 0.75], [0, 28.25, 0], step, "Cabinet face frame"),
  ];
  source.pieces.push(...frame, part("Adjacent cabinet lip", "plywood", [0.5, 2, 0.5],
    [-13.8, 7.625, 11.9], step, "Neighboring cabinet"));
  const grouped = createSection(source, frame.map(({ id }) => id), "Cabinet face frame");
  const input = addMeasuredOffcut(grouped.project, step, stock, [48, 15, Math.min(...material(stock).size)], "Birch remnant");
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "face-frame.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...input, schemaVersion: 146 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Fit two cabinet doors to this face frame with matching pulls.");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open cabinet door fitting" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Add vertical cabinet pulls" })).toBeChecked();
  const leftField = await dialog.getByRole("combobox", { name: "Left stile", exact: true }).boundingBox();
  const bottomField = await dialog.getByRole("combobox", { name: "Bottom rail", exact: true }).boundingBox();
  expect(leftField!.width).toBeGreaterThan(100);
  expect(bottomField!.y).toBeGreaterThan(leftField!.y);
  await dialog.screenshot({ path: info.outputPath("cabinet-door-measurements.png") });
  for (const [i, name] of ["Left stile", "Right stile", "Bottom rail", "Top rail"].entries())
    await dialog.getByRole("combobox", { name, exact: true }).selectOption(frame[i].id);
  await dialog.getByRole("combobox", { name: "Hinge for shopping list", exact: true }).selectOption(libertyFlushHinge.id);
  await dialog.getByRole("spinbutton", { name: "Pin offset toward stile from door edge" }).fill("0.0625");
  await dialog.getByRole("spinbutton", { name: "Pin center ahead of closed front" }).fill("0.125");
  await dialog.getByRole("button", { name: "Preview cabinet doors", exact: true }).click();
  const dimensions = dialog.getByRole("list", { name: "Cabinet door panel sizes" });
  await expect(dimensions.getByRole("listitem")).toHaveCount(2);
  await expect(dimensions).toContainText("12.8125 in wide × 22.75 in high");
  await expect(dialog.getByRole("status")).toContainText("possible contact at Adjacent cabinet lip");
  await dialog.getByRole("button", { name: "Show opening limit", exact: true }).click();
  await expect(dialog.getByRole("slider", { name: "Inspect cabinet door travel" })).not.toHaveValue("90");
  await dialog.getByRole("spinbutton", { name: "Pull center from free edge", exact: true }).fill("4");
  await dialog.getByRole("spinbutton", { name: "Gap between doors", exact: true }).fill("0.0625");
  await dialog.getByRole("checkbox", { name: "Allow for edge banding on all four edges" }).check();
  await dialog.getByRole("spinbutton", { name: "Installed banding thickness", exact: true }).fill("0.046875");
  await dialog.getByRole("button", { name: "Preview cabinet doors", exact: true }).click();
  await expect(dimensions).toContainText("12.75 in wide × 22.65625 in high");
  await expect(dimensions).toContainText("Finished 12.84375 in × 22.75 in");
  await expect(dialog.getByRole("combobox", { name: "Swing test" }).locator("option:checked")).toHaveText("Both cabinet doors together");
  await expect(dialog.getByRole("status")).toContainText("The modeled opening and closing paths clear.");
  await dialog.getByRole("button", { name: "Show open doors" }).click();
  await expect(dialog.getByRole("slider", { name: "Inspect cabinet door travel" })).toHaveValue("90");
  await dialog.getByRole("combobox", { name: "Swing test" }).selectOption({ label: "Right cabinet door first" });
  await expect(dialog.getByRole("status")).toContainText("The modeled opening and closing paths clear.");
  await dialog.getByRole("button", { name: "Show open doors" }).click();
  await dialog.getByText("Cuts and stock", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Use matching scraps for the new parts" }).check();
  await expect(dialog.getByText(/Birch remnant/).first()).toBeVisible();
  await dialog.screenshot({ path: info.outputPath("cabinet-doors-and-cuts.png") });
  await dialog.getByRole("button", { name: "Add fitted cabinet doors" }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Test face-frame cabinet" }).first().click();
  const saved = projectSchema.parse((await draft()).project);
  const doors = saved.sections.find(({ cabinetDoors }) => cabinetDoors)!;
  const leaves = saved.pieces.filter(({ id, designRole }) => doors.pieceIds.includes(id) && designRole?.startsWith("cabinet-inset-door-"));
  expect(leaves).toHaveLength(2);
  expect(doors.cabinetDoors?.pull?.inset).toBe(4);
  const pulls = saved.pieces.filter(({ id, material }) => doors.pieceIds.includes(id) && material === libertyBarPull.id);
  expect(pulls).toHaveLength(2);
  expect(saved.motionPlans?.every(({ memberIds }) => pulls.some(({ id }) => memberIds.includes(id)))).toBe(true);
  expect(leaves.every(({ cutStock }) => cutStock?.id)).toBe(true);
  expect(saved.edgeBanding).toHaveLength(8);
  expect(saved.edgeBanding?.every(({ installedThickness }) => installedThickness === 0.046875)).toBe(true);
  expect(new Set(leaves.map(({ cutStock }) => cutStock?.id)).size).toBe(1);
  expect(saved.motionPlans?.[0].testScenarios?.map(({ name }) => name)).toEqual([
    "Both cabinet doors together", "Left cabinet door first", "Right cabinet door first",
  ]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Right cabinet door first");
  expect(guide).toContain("2 in, 20.75 in down from the finished top");
  expect(guide).toContain("Recorded offcut cut order");
  expect(guide).toContain("Finish at 12.84375 in wide × 22.75 in high");
  expect(guide).toContain("0.09375 in to cover the banded ends");
  expect(guide).toContain("96 mm Liberty pull on each door · mark the midpoint 4 in from the finished free edge");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list" }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true }))
    .toHaveValue(/2 each.*Liberty Solid Bar cabinet pull.*Internet #204331182/);
  await dialog.getByRole("button", { name: /Add 2 hinge packs? of Liberty Hammercraft/i }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#100192240");
  await dialog.getByRole("button", { name: /Add 1 roll of EDGEMATE/i }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#314095455");
});

test("revise saved cabinet pulls without rebuilding the doors", async ({ page }) => {
  await page.goto("./");
  const response = await page.request.get(new URL("./examples/interior/cabinet-doors-with-pulls.yardwork.json", page.url()).href);
  expect(response.ok()).toBe(true);
  const original = projectSchema.parse(await response.json());
  const section = original.sections.find(({ cabinetDoors }) => cabinetDoors)!;
  const name = `Test cabinet pull revision ${crypto.randomUUID().slice(0, 8)}`;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "cabinet-doors-with-pulls.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...original, name })),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Move the cabinet pulls to 1.5 in from the free edge.");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await dialog.getByRole("button", { name: "Open cabinet pulls" }).click();
  const inset = dialog.getByRole("spinbutton", { name: "Pull center from free edge" });
  const preview = dialog.getByRole("button", { name: "Preview pull placement" });
  await expect(inset).toHaveValue("1.5");
  await preview.click();
  await expect(dialog.getByRole("status")).toContainText("possible contact at Existing adjacent cabinet lip");
  await dialog.getByText(/New findings in saved movement/).click();
  await dialog.getByRole("button", { name: "Show contact in 3D" }).first().click();
  await expect(dialog.getByRole("button", { name: "Return to selected swing" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Sections", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Current section", exact: true }).selectOption(section.id);
  await page.getByRole("button", { name: "Edit cabinet pulls", exact: true }).click();
  await expect(inset).toHaveValue("4");
  await inset.fill("3.5");
  await preview.click();
  await expect(dialog.getByRole("status")).toContainText("The modeled opening and closing paths clear.");
  await dialog.getByRole("button", { name: "Apply pull placement" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: name }).click();
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.sections.find(({ id }) => id === section.id)?.cabinetDoors?.pull?.inset).toBe(3.5);
  expect(saved.motionPlans).toEqual(original.motionPlans);
  expect(saved.edgeBanding).toEqual(original.edgeBanding);
  expect(saved.pieces.map(({ id, cutStock }) => [id, cutStock])).toEqual(original.pieces.map(({ id, cutStock }) => [id, cutStock]));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("mark the midpoint 3.5 in from the finished free edge");
  expect(guide).toContain("Recorded offcut cut order");
  expect(guide).toContain("Both cabinet doors together");
});
