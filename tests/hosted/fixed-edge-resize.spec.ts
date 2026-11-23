import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { bounds } from "../../src/engine";
import { inspectCutStock, setCutSourceOnHand } from "../../src/cutStock";
import { blank, part, projectSchema, type Project } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { previewProposalStock } from "../../src/proposalStock";
import { planStockCutLayouts } from "../../src/recordStockCutLayout";

test("straighten a saved corner bench without refitting its stock, or preview removing the return", async ({ page }) => {
  const base = blank(`Corner banquette ${crypto.randomUUID().slice(0, 6)}`);
  const plan = localIdeaPlan({ prompt: "An L-shaped storage banquette, 7 feet along the back, 5 feet overall return, 24 inches deep, 18 inches finished seat height, opening lids and no back." });
  const design = applyIdeaPlan(base, plan);
  const parts = new Set(design.sections[1].pieceIds);
  const stock = previewProposalStock(base, design, null).recordable.find(({ layout }) =>
    layout.kind === "board" && layout.kept.some(({ id }) => parts.has(id)));
  expect(stock).toBeDefined();
  const recorded = planStockCutLayouts(design, [stock!.layout]);
  const [sourceId] = recorded.sourceIds;
  const original = setCutSourceOnHand(recorded.project, sourceId, true);
  const binding = original.ideaBindings[0];
  const draft = async () => projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));

  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "corner-banquette.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: original.name }).click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const revise = page.getByRole("button", { name: `Revise design ${binding.title}`, exact: true });
  await revise.click();
  const idea = dialog.getByRole("textbox", { name: "Describe your idea" });
  const explore = dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ });
  await idea.fill("Remove the return.");
  await explore.click();
  await expect(dialog.getByText("Remove 1 assembly from this design.", { exact: true })).toBeVisible();
  expect((await draft()).sections).toEqual(original.sections);

  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await revise.click();
  await idea.fill("Make it a straight banquette.");
  await explore.click();
  await expect(dialog.getByText("Aligned Banquette return with the left end of the main run.").first()).toBeVisible();
  await expect(dialog.getByRole("spinbutton", { name: "Overall seating run width", exact: true })).toHaveValue("120");
  await dialog.getByRole("button", { name: "Apply design changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections[1].recipe?.yaw).toBe(0);
  const straight = await draft();
  expect(straight.sections[0]).toEqual(original.sections[0]);
  expect(straight.sections[1].pieceIds).toEqual(original.sections[1].pieceIds);
  expect(straight.sections[1].origin).toEqual([-60, 0, -18]);
  expect(straight.plannedCutSources).toEqual(original.plannedCutSources);
  expect(straight.onHandCutSources).toEqual([sourceId]);
  expect(inspectCutStock(straight).valid.has(sourceId)).toBe(true);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("120 × 24 in");
  expect(guide).toContain("Banquette return");
  expect(guide).toContain("Planned stock cuts");
});

test("revise the dimensions and lid of a reopened banquette and export the guide", async ({ page }) => {
  const base = blank(`Fitted banquette ${crypto.randomUUID().slice(0, 6)}`);
  const spare = part("Loose shelf board", "one-four", [36, 0.75, 3.5], [100, 0.375, 0], base.steps[0].id, "Loose stock");
  base.pieces.push(spare);
  const original = applyIdeaPlan(base, localIdeaPlan({
    prompt: "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height with opening lids and no back",
  }));
  const draft = async () => projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));

  await page.goto("./");
  const dialog = page.getByRole("dialog");
  const explore = dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ });
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "fitted-banquette.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(original)),
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: original.name }).click();

  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: `Revise design ${original.ideaBindings[0].title}`, exact: true }).click();
  const input = dialog.getByRole("spinbutton", { name: "Overall seating run width", exact: true });
  await dialog.getByRole("combobox", { name: "Keep in place" }).selectOption("right");
  await input.fill("96");
  await expect(dialog.getByText("Resized the selected furniture and held its local right edge in place.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Make the banquette two inches deeper and keep the back edge against the wall.");
  await explore.click();
  await expect(input).toHaveValue("96");
  await expect(dialog.getByRole("spinbutton", { name: "Banquette section 2 depth" })).toHaveValue("26");
  await dialog.getByRole("button", { name: "Apply design changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections[1].recipe?.depth).toBe(26);

  const extents = (project: Project) => {
    const members = new Set(project.sections.flatMap(({ pieceIds }) => pieceIds));
    const boxes = project.pieces.filter(({ id }) => members.has(id)).map(bounds);
    return { left: Math.min(...boxes.map(({ min }) => min[0])),
      right: Math.max(...boxes.map(({ max }) => max[0])), back: Math.min(...boxes.map(({ min }) => min[2])) };
  };
  const next = await draft();
  const before = extents(original), after = extents(next);
  expect(after.right).toBeCloseTo(before.right, 8);
  expect(after.left).toBeCloseTo(before.left - 24, 8);
  expect(after.back).toBeCloseTo(before.back, 8);
  expect(next.sections.map(({ id }) => id)).toEqual(original.sections.map(({ id }) => id));
  expect(next.pieces.find(({ id }) => id === spare.id)).toEqual(spare);

  await page.getByRole("button", { name: `Revise design ${original.ideaBindings[0].title}`, exact: true }).click();
  const idea = dialog.getByRole("textbox", { name: "Describe your idea" });
  await idea.fill("Make the banquette two inches taller and remove the lid.");
  await explore.click();
  await expect(dialog.getByText(/Which seat should change/)).toBeVisible();
  for (const number of [1, 2, 3]) {
    await expect(dialog.getByRole("spinbutton", { name: `Banquette section ${number} height` })).toHaveValue("18");
  }
  await idea.fill("Make section 2 two inches taller and remove the lid.");
  await explore.click();
  await expect(dialog.getByText("Updated the requested seat features and dimensions together.")).toBeVisible();
  expect((await draft()).sections).toEqual(next.sections);
  await dialog.getByRole("button", { name: "Apply design changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections[1].recipe?.height).toBe(20);
  const updated = await draft();
  expect(updated.sections[0]).toEqual(next.sections[0]);
  expect(updated.sections[2]).toEqual(next.sections[2]);
  expect(updated.sections[1].recipe).toMatchObject({
    height: 20, depth: 26, storage: true, openingLid: false, lidOpen: false,
  });
  expect(updated.pieces.find(({ id }) => id === spare.id)).toEqual(spare);

  await page.getByRole("button", { name: `Revise design ${original.ideaBindings[0].title}`, exact: true }).click();
  await idea.fill("Open the right seat lid.");
  await explore.click();
  await expect(dialog.getByText("Updated the preview position of the requested lids.")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Preview lid open", exact: true }).nth(1)).toBeChecked();
  expect((await draft()).sections).toEqual(updated.sections);
  await dialog.getByRole("button", { name: "Apply design changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections[2].recipe?.lidOpen).toBe(true);
  const opened = await draft();
  expect(opened.sections.slice(0, 2)).toEqual(updated.sections.slice(0, 2));
  expect(opened.sections[2].pieceIds).toEqual(updated.sections[2].pieceIds);
  expect(opened.pieces.filter((piece, i) => JSON.stringify(piece) !== JSON.stringify(updated.pieces[i])))
    .toEqual([expect.objectContaining({ name: "Banquette section 3 · seat lid" })]);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Stock cut order");
  expect(guide).toContain("Banquette section 2 · storage front: 18.5 in × 32 in");
  expect(guide).toContain("Banquette section 2 · seat: 26 in × 32 in");
  expect(guide).not.toContain("Banquette section 2 · seat lid:");
  expect(guide).toContain("Banquette section 3 · seat lid:");
});

test("replan an uncut plywood sheet shared by two seats after revising one", async ({ page }) => {
  const empty = blank("Shared stock banquette");
  const design = applyIdeaPlan(empty, localIdeaPlan({
    prompt: "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height with opening lids and no back",
  }));
  const middle = new Set(design.sections[1].pieceIds);
  const shared = previewProposalStock(empty, design, null).recordable.find(({ layout }) =>
    layout.kind === "sheet" && layout.kept.some(({ id }) => middle.has(id)) &&
    layout.kept.some(({ id }) => !middle.has(id)));
  expect(shared).toBeDefined();
  const planned = planStockCutLayouts(design, [shared!.layout]);
  const [sourceId] = planned.sourceIds;
  const original = setCutSourceOnHand(planned.project, sourceId, true);
  const untouched = original.pieces.filter(({ id, cutStock, offcut }) =>
    !middle.has(id) && cutStock?.id === sourceId && !offcut);
  const draft = async () => projectSchema.parse(await page.evaluate((key) =>
    JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));

  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "shared-stock-banquette.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(original)),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Revise design " + original.ideaBindings[0].title, exact: true }).click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Make section 2 two inches taller and remove its lid.");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();

  await expect(dialog.getByText(/Return 1 uncut stock unit to planning/)).toBeVisible();
  await expect(dialog.getByText(new RegExp("includes " + untouched.length + " other parts"))).toBeVisible();
  await dialog.getByText("Cuts and stock", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Use matching scraps for the revised cuts" }).check();
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("3 → 2 sheets");
  await dialog.getByRole("button", { name: "Apply design changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections[1].recipe?.height).toBe(20);
  const updated = await draft();
  expect(updated.plannedCutSources).toBeUndefined();
  expect(updated.sections[1].recipe).toMatchObject({ height: 20, storage: true, openingLid: false });
  const group = inspectCutStock(updated);
  expect(group.valid.has(sourceId)).toBe(true);
  expect(updated.onHandCutSources).toContain(sourceId);
  expect(untouched.some(({ id }) => group.groups.get(sourceId)?.some((piece) => piece.id === id))).toBe(true);
  for (const { cutStock: _cut, ...old } of untouched) {
    const saved = updated.pieces.find(({ id }) => id === old.id);
    expect(saved).toMatchObject(old);
  }
  expect(updated.pieces.some(({ id }) => middle.has(id))).toBe(false);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Released uncut stock plan");
  expect(guide).toContain("## Recorded offcut cut order");
  expect(guide).not.toContain("## Planned stock cuts");
});
