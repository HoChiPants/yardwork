import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { inspectCutStock, setCutSourceOnHand } from "../../src/cutStock";
import { blank, part, projectSchema } from "../../src/model";
import { partLabel } from "../../src/partLabels";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { previewProposalStock } from "../../src/proposalStock";
import { planStockCutLayouts } from "../../src/recordStockCutLayout";
import { planOffcutReuse } from "../../src/offcutReusePlan";

test("a missing reserved offcut stays out of the Cut pool after saving replacement stock needs", async ({ page }) => {
  const base = blank("Missing scrap for bench cleats");
  const step = base.steps[0].id;
  base.pieces = [
    part("Long cleat", "stud", [3.5, 1.5, 24], [0, 0.75, 0], step, "Bench"),
    part("Short cleat", "stud", [3.5, 1.5, 20], [8, 0.75, 0], step, "Bench"),
  ];
  const assigned = planOffcutReuse(addMeasuredOffcut(base, step, "stud", [44.25, 3.5, 1.5], "Cleat scrap")).project;
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "missing-cleat-scrap.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(assigned)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Cut pool \(0\)$/ }).click();
  await page.getByRole("button", { name: "View offcut cut order", exact: true }).click();
  const row = dialog.getByRole("listitem").filter({ hasText: "Long cleat" });
  await row.getByRole("button", { name: "Review starting offcut", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Starting offcut", exact: true }).selectOption("unavailable");
  await expect(dialog.getByRole("list", { name: "Parts that will need stock" }).getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByText(/Stock to buy.+0 → 1 board/)).toBeVisible();
  await dialog.getByRole("button", { name: "Mark unavailable and replan", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Cut pool \(0\)$/ })).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft()).revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: base.name }).click();
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.pieces.map(({ size, cutStock }) => ({ size, cutStock }))).toEqual(base.pieces.map(({ size }) => ({ size, cutStock: null })));
  expect(saved.history.filter(({ offcutCut }) => offcutCut?.inputUnavailable)).toHaveLength(1);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Unavailable offcuts[\s\S]*O001 · Offcut · Cleat scrap/);
});

test("reuse only available scraps while keeping expected offcuts visible in the full cut plan", async ({ page }) => {
  const project = blank("Scraps in the shop and on the plan");
  const step = project.steps[0].id;
  project.pieces = [part("Reserved frame rail", "stud", [3.5, 1.5, 40], [0, 0.75, 0], step, "Frame")];
  const stock = previewProposalStock(blank(), project, null);
  const planned = planStockCutLayouts(stock.project, stock.recordable.map(({ layout }) => layout));
  const owned = setCutSourceOnHand(planned.project, planned.sourceIds[0], true);
  const imported = addMeasuredOffcut(owned, step, "stud", [20, 3.5, 1.5], "Shop scrap");
  imported.pieces.push(
    part("Short blocking", "stud", [3.5, 1.5, 14], [6, 0.75, 0], step, "Frame"),
    part("Long shelf cleat", "stud", [3.5, 1.5, 40], [12, 0.75, 0], step, "Frame"),
  );

  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "available-offcuts.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole("button", { name: /^Cut pool \(2\)$/ }).click();
  await expect(page.getByRole("region", { name: "Cut pool", exact: true })).toContainText("source stock on hand");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("What can I make from scraps I already have?");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  await expect(dialog.getByRole("region", { name: "Offcut matches", exact: true })).toContainText("1 planned part fits on-hand offcuts");
  await dialog.getByRole("button", { name: "Review cuts and stock to buy", exact: true }).click();
  const onHand = dialog.getByRole("checkbox", { name: "Use only on-hand offcuts", exact: true });
  const cuts = dialog.getByRole("list", { name: "Proposed cuts in order", exact: true });
  await expect(onHand).toBeChecked();
  await expect(cuts.getByRole("listitem")).toHaveCount(1);
  await expect(cuts).toContainText("Short blocking");
  await expect(cuts).toContainText("Shop scrap");
  await onHand.uncheck();
  await expect(cuts.getByRole("listitem")).toHaveCount(2);
  const cleat = cuts.getByRole("listitem").filter({ hasText: "Long shelf cleat" });
  await expect(cleat).toContainText("Expected after source cuts");
  await onHand.check();
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();

  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.project, CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.pieces.find(({ name }: { name: string }) => name === "Short blocking")?.cutStock?.id).toBeTruthy();
  const next = projectSchema.parse(await draft());
  expect(next.pieces.find(({ name }) => name === "Long shelf cleat")).toMatchObject({ cutStock: null });
  expect(next.plannedCutSources).toHaveLength(1);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/## Planned stock cuts[\s\S]+Reserved frame rail/);
  expect(guide).toMatch(/## Recorded offcut cut order[\s\S]+Short blocking/);
});

test("replace a saved uncut board with on-hand offcuts and carry the new cuts into the guide", async ({ page }) => {
  const project = blank("Replace the planned board");
  const step = project.steps[0].id;
  project.pieces = [30, 24].map((length, index) =>
    part(`Bench rail ${index + 1}`, "stud", [3.5, 1.5, length], [index * 6, 0.75, 0], step, "Bench"));
  const stock = previewProposalStock(blank(), project, null);
  const planned = planStockCutLayouts(stock.project, stock.recordable.map(({ layout }) => layout));
  const imported = addMeasuredOffcut(planned.project, step, "stud", [60, 3.5, 1.5], "Shelf offcut");
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "replace-planned-board.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  const board = page.locator('.bom-row[data-stock-material="stud"]');
  const open = () => board.getByText(/Recorded cut source \d+ · cuts planned/).click();
  await open();
  const source = board.getByRole("region", { name: "Recorded cut source", exact: true });
  const check = source.getByRole("button", { name: "Check on-hand offcuts" });
  const review = source.getByRole("region", { name: "Review replacement with offcuts" });
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  const original = (await readDraft()).project;

  await check.click();
  await expect(review.getByRole("list", { name: "Purchase changes" })).toContainText("1 → 0 boards");
  const cuts = review.getByRole("list", { name: "Proposed cuts in order" }).getByRole("listitem");
  await expect(cuts).toHaveCount(2);
  await expect(cuts.nth(0)).toContainText("Crosscut to 30 in");
  await expect(cuts.nth(1)).toContainText("From an earlier cut");
  await review.getByRole("button", { name: "Cancel replacement", exact: true }).click();
  expect((await readDraft()).project).toEqual(original);

  await check.click();
  await review.getByRole("button", { name: "Use these offcuts", exact: true }).click();
  await expect(board).toContainText("0 boards");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await readDraft()).project.plannedCutSources).toEqual(original.plannedCutSources);
  await open();
  await check.click();
  await review.getByRole("button", { name: "Use these offcuts", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await readDraft()).revision).toBe(1);
  const saved = projectSchema.parse((await readDraft()).project);
  expect(saved.plannedCutSources).toBeUndefined();
  expect(inspectCutStock(saved).invalid).toEqual([]);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: saved.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await pending).path())!, "utf8");
  expect(guide).not.toContain("## Planned stock cuts");
  expect(guide).toMatch(/## Recorded offcut cut order[\s\S]+Bench rail 1[\s\S]+Bench rail 2[\s\S]+remnant from cut 1/);
});

test("plywood offcut review finds a full-length strip and removes a sheet from the purchase plan", async ({ page }) => {
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/cut-pool/cabinet-fascia-strip.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "cabinet-fascia-strip.yardwork.json", mimeType: "application/json", buffer: await fixture.body(),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can I buy fewer sheets using my scraps?");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await expect(dialog).toContainText("Ripping first keeps longer strips");
  await dialog.getByRole("button", { name: "Review cuts and stock to buy" }).click();
  const proposed = dialog.getByRole("list", { name: "Proposed cuts in order" }).getByRole("listitem");
  await expect(proposed).toHaveCount(2);
  await expect(proposed.nth(0)).toContainText("Rip to 1 ft · Crosscut to 14 in");
  await expect(proposed.nth(1)).toContainText("From an earlier cut · O002");
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("1 → 0 sheets");
  await expect(dialog.getByRole("list", { name: "Scraps to keep after these cuts" })).toContainText("22 in × 0.75 in × 0.703 in");
  await dialog.getByRole("button", { name: "Apply offcut plan" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved = projectSchema.parse((await readDraft()).project);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: saved.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Rip to 1 ft · Crosscut to 14 in[\s\S]*Starting size 22 in × 7.875 in × 0.703 in · remnant from cut 1/);
});

test("one chosen offcut supplies two shorter parts and saves a new board on the shopping list", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(15_000);
  await page.goto("./");
  await page.getByRole("button", { name: /^Cut pool \(0\)$/ }).click();
  const sample = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download board-saving practice plan", exact: true }).click();
  const bytes = await readFile((await (await sample).path())!);
  const original = projectSchema.parse(JSON.parse(bytes.toString("utf8")));
  const [chosenOffcut] = original.pieces.filter(({ offcut }) => offcut);
  const project = addMeasuredOffcut(original, original.steps[0].id, "stud", [72, 3.5, 1.5], "Second board");
  const extraOffcut = project.pieces.at(-1)!;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "save-a-board.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  const materials = page.locator(".inspector-scroll .bom-row");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(materials).toContainText("4 boards");
  await page.getByRole("button", { name: "Cut pool (2)", exact: true }).click();
  const reviewChosen = () => page.getByRole("button", { name: "Find uses for O001", exact: true }).click();
  await reviewChosen();
  await expect(dialog.getByRole("heading", { name: "Plan cuts from O001" })).toBeVisible();
  const cuts = dialog.getByRole("list", { name: "Proposed cuts in order" }).getByRole("listitem");
  const useFor = dialog.getByRole("combobox", { name: "Use offcut for" });
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  const start = projectSchema.parse((await saved()).project);
  await expect(useFor.getByRole("option", { name: /Practice rail 7/ })).toHaveCount(0);
  await useFor.selectOption({ label: "P003 · Practice rail 3" });
  await expect(cuts).toHaveCount(1);
  await expect(cuts.first()).toContainText("P003 · Practice rail 3");
  await expect(cuts.first()).toContainText("O001");
  expect(projectSchema.parse((await saved()).project)).toEqual(start);
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await expect.poll(async () => projectSchema.parse((await saved()).project).history.flatMap(({ offcutCut }) =>
    offcutCut ? [offcutCut.targetId] : [])).toEqual([original.pieces[2].id]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(materials).toContainText("4 boards");
  await reviewChosen();
  await expect(cuts).toHaveCount(2);
  await expect(cuts.nth(0)).toContainText("P001 · Practice rail 1");
  await expect(cuts.nth(1)).toContainText("P004 · Practice rail 4");
  await expect(cuts.nth(1)).toContainText("From an earlier cut");
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("4 → 3 boards");
  await expect(dialog.getByRole("list", { name: "Scraps to keep after these cuts" })).toContainText("12.75 in");
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(materials).toContainText("3 boards");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(materials).toContainText("4 boards");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(materials).toContainText("3 boards");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  const snapshot = projectSchema.parse((await saved()).project);
  const allocation = snapshot.history.flatMap(({ offcutCut }) => offcutCut ? [offcutCut] : []);
  expect(allocation).toHaveLength(2);
  expect(allocation[0].inputId).toBe(chosenOffcut.id);
  expect(allocation[1].inputId).toBe(allocation[0].remnants[0].id);
  expect(snapshot.pieces.find(({ id }) => id === extraOffcut.id)).toEqual(start.pieces.find(({ id }) => id === extraOffcut.id));
  expect(inspectCutStock(snapshot).valid.has(allocation[0].sourceId)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: snapshot.name }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(materials).toContainText("3 boards");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const text = await readFile((await (await guide).path())!, "utf8");
  expect(text).toContain("O001 → P001");
  expect(text).toContain(`${partLabel(snapshot, allocation[1].inputId)} → P004`);
  expect(text).toContain("12.75 in");
});

test("one cut list uses two sources, carries the earlier cut into the guide, and buys no additional boards", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/cut-pool/two-scrap-rails.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const bytes = await fixture.body();
  const initial = projectSchema.parse(JSON.parse(bytes.toString("utf8")));
  const [planned] = initial.plannedCutSources!;
  const [measured] = initial.onHandCutSources!;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "two-scrap-rails.yardwork.json", mimeType: "application/json", buffer: bytes,
  });
  await expect(page.getByRole("button", { name: "Cut pool (2)", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByText("Questions about this build", { exact: true }).click();
  await dialog.getByRole("button", { name: "Plan a cut list", exact: true }).click();
  const prompt = dialog.getByRole("textbox", { name: "Describe your idea" });
  await expect(prompt).toHaveValue(/using my Cut pool/);
  await prompt.fill("Plan 2x4 cuts of 26 in, 24 in and 38.25 in using my Cut pool");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const answer = dialog.getByRole("region", { name: "Lumber cut list", exact: true });
  await expect(answer).toContainText("3 pieces using O001, O002 · 0 boards to buy");
  await answer.getByRole("button", { name: "Preview cut list in 3D", exact: true }).click();
  const order = dialog.getByRole("list", { name: "Stock cut order" });
  const stock = order.getByRole("listitem");
  await expect(stock).toHaveCount(2);
  await expect(stock.nth(0)).toContainText("O001 · 50.25 in from Cut pool");
  await expect(stock.nth(0)).toContainText("26 in + 2 ft");
  await expect(stock.nth(1)).toContainText("O002 · 38.375 in from Cut pool");
  await expect(stock.nth(1)).toContainText("Complete the source stock cut order first.");
  await expect(dialog).toContainText("No additional boards for these cuts");
  await expect(page.locator("canvas").first()).toHaveAttribute("data-material-placement-count", "3");
  await expect(page.locator(".statusbar")).toContainText("1 part");
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("two-scraps-preview.png") });
  await dialog.getByRole("button", { name: "Plan and place 3 pieces", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('.bom-row[data-stock-material="stud"]')).toContainText("1 board");
  await expect(page.locator('.bom-row[data-stock-material="stud-10"]')).toContainText("0 boards to buy");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft()).revision).toBe(1);
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.plannedCutSources).toEqual([planned]);
  expect(saved.pieces.map(({ cutStock }) => cutStock?.id)).toEqual([planned.sourceId, measured, measured, planned.sourceId]);
  const allocations = saved.history.flatMap(({ offcutCut }) => offcutCut ? [offcutCut] : []);
  expect(allocations.map(({ sourceId }) => sourceId)).toEqual([measured, measured, planned.sourceId]);
  expect(allocations[1].inputId).toBe(allocations[0].remnants[0].id);
  expect(allocations.slice(1).every(({ remnants }) => !remnants.length)).toBe(true);
  expect(inspectCutStock(saved).invalid).toHaveLength(0);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: saved.name }).click();
  await expect.poll(async () => (await draft()).project.plannedCutSources).toEqual([planned]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exported = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guideFile = await exported;
  await guideFile.saveAs(info.outputPath("two-scrap-rails-guide.md"));
  const guide = await readFile((await guideFile.path())!, "utf8");
  expect(guide).toMatch(/## Planned stock cuts[\s\S]+Crosscut 57\.5 in[\s\S]+## Recorded offcut cut order/);
  expect(guide).toContain("Offcut cuts are recorded for this stock.");
  expect(guide).toContain("O001 → P002");
  expect(guide).toContain("O003 → P003");
  expect(guide).toMatch(/O002 → P004[\s\S]+Find P001 under Planned stock cuts[\s\S]+Crosscut to 38\.25 in · Blade uses the remaining 0\.125 in/);

  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  const board = page.locator('.bom-row[data-stock-material="stud"]');
  await board.getByText(/Recorded cut source \d+ · cuts planned/).click();
  const source = board.getByRole("region", { name: "Recorded cut source", exact: true });
  await source.getByLabel("I already have this stock", { exact: true }).check();
  const reviewButton = source.getByRole("button", { name: "Release uncut stock plan", exact: true });
  await reviewButton.click();
  const release = source.getByRole("region", { name: "Review uncut stock release", exact: true });
  await expect(release).toContainText("1 planned offcut assignment will be released.");
  await expect(release.getByRole("list", { name: "Parts that will need stock" })).toContainText("P004");
  await expect(release).toContainText("8 ft × 3.5 in × 1.5 in");
  await page.screenshot({ path: info.outputPath("uncut-stock-release.png") });
  await release.getByRole("button", { name: "Cancel release", exact: true }).click();
  await expect.poll(async () => (await draft()).project.plannedCutSources).toEqual([planned]);
  await reviewButton.click();
  await release.getByRole("button", { name: "Apply release", exact: true }).click();
  await expect.poll(async () => (await draft()).project.plannedCutSources ?? []).toEqual([]);
  const returned = projectSchema.parse((await draft()).project);
  expect(returned.pieces.filter(({ cutStock }) => cutStock?.id === planned.sourceId)).toMatchObject([
    { offcut: true, size: [3.5, 1.5, 96] },
  ]);
  expect(returned.pieces.filter(({ cutStock }) => cutStock?.id === measured)).toEqual(saved.pieces.filter(({ cutStock }) => cutStock?.id === measured));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft()).project.plannedCutSources).toEqual([planned]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await draft()).project.plannedCutSources ?? []).toEqual([]);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft()).revision).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: saved.name }).click();
  await expect.poll(async () => (await draft()).project.pieces.filter(
    ({ cutStock }: { cutStock?: { id: string } }) => cutStock?.id === planned.sourceId,
  )).toMatchObject([{ offcut: true, size: [3.5, 1.5, 96] }]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const updated = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const revisedGuide = await readFile((await (await updated).path())!, "utf8");
  expect(revisedGuide).not.toMatch(/## Planned stock cuts|O002 → P004/);
  expect(revisedGuide).toContain("O003 → P003");
});

test("preview and place a fresh plywood panel from a named scrap", async ({ page }, info) => {
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/motion/cabinet-two-gaps.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const bytes = await fixture.body();
  const initial = projectSchema.parse(JSON.parse(bytes.toString("utf8")));
  const source = initial.pieces.find((piece) => partLabel(initial, piece.id) === "O005")!;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "cabinet-panel-scrap.yardwork.json", mimeType: "application/json", buffer: bytes,
  });
  const pool = (n: number) => page.getByRole("button", { name: `Cut pool (${n})`, exact: true });
  await pool(6).click();
  await page.getByRole("button", { name: "Cut panel from O005", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Place panel from O005", exact: true })).toBeDisabled();
  await dialog.getByRole("spinbutton", { name: "Finished width", exact: true }).fill("15.8");
  await dialog.getByRole("spinbutton", { name: "Finished length along grain", exact: true }).fill("16");
  await expect(dialog.getByRole("status")).toContainText("does not fit");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(pool(6)).toBeVisible();

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Can I cut a 12 by 16 in plywood panel from O005?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const answer = dialog.getByRole("region", { name: "Panel from an offcut", exact: true });
  await expect(answer).toContainText("16 in along grain");
  await answer.getByRole("button", { name: "Review panel cuts", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Panel cut preview", exact: true });
  await expect(preview).toContainText("Complete the planned source cuts first to free O005.");
  await expect(preview).toContainText("Crosscut to 16 in");
  await expect(preview).toContainText("Rip to 1 ft");
  await expect(preview.getByRole("list", { name: "Offcuts to keep" }).getByRole("listitem")).toHaveCount(2);
  await dialog.getByRole("combobox", { name: "Cut order", exact: true }).selectOption("rip-first", { timeout: 5000 });
  await expect(preview.locator("ol > li").first()).toHaveText("Rip to 1 ft");
  await expect(preview.getByRole("list", { name: "Offcuts to keep" })).toContainText("3.75 in wide · 18 in along grain");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-material-placement-preview", "[12,16,0.75]");
  const titleRight = await dialog.getByRole("heading", { name: "Cut a panel from O005" }).evaluate((heading) => {
    const text = document.createRange();
    text.selectNodeContents(heading);
    return text.getBoundingClientRect().right;
  });
  expect(titleRight).toBeLessThan((await dialog.getByRole("button", { name: "Close dialog" }).boundingBox())!.x);
  await dialog.getByRole("textbox", { name: "Part name (optional)", exact: true }).fill("Drawer divider");
  await page.screenshot({ path: info.outputPath("plywood-offcut-preview.png") });
  await dialog.getByRole("button", { name: "Place panel from O005", exact: true }).click();
  await expect(pool(7)).toBeVisible();
  await expect(canvas).not.toHaveAttribute("data-material-placement-preview");
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft()).project.pieces.some(({ name }: { name: string }) => name === "Drawer divider")).toBe(true);
  const current = projectSchema.parse((await readDraft()).project);
  const divider = current.pieces.find(({ name }) => name === "Drawer divider")!;
  const cut = current.history.find(({ offcutCut }) => offcutCut?.targetId === divider.id)?.offcutCut;
  expect(cut?.inputId).toBe(source.id);
  expect(cut?.cuts.map(({ kind }) => kind)).toEqual(["rip", "crosscut"]);
  expect(current.plannedCutSources).toEqual(initial.plannedCutSources);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('.bom-row[data-stock-material="plywood"]')).toContainText("1 sheet");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exported = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await exported).path())!, "utf8");
  expect(guide).toMatch(/## Planned stock cuts[\s\S]*## Recorded offcut cut order[\s\S]*O005 → P006 · Drawer divider/);
});
