import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { applyCommand, blank, part, projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { bom, guideMarkdown } from "../../src/engine";
import { partLabel } from "../../src/partLabels";
import { SAVED_PROJECT_NOTES_CONTEXT } from "../../src/projectNotes";
import { inspectCutStock } from "../../src/cutStock";
import { createBuildFixture } from "../../src/buildFixtures";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { planOffcutReuse } from "../../src/offcutReusePlan";
import { planDedicatedBoardCuts, recordStockCutLayout } from "../../src/recordStockCutLayout";
import { stockCutSequences } from "../../src/stockCutSequence";
import { addSupply } from "../../src/supplies";

async function draft(page: Page, expected: (project: Project) => boolean) {
  let observed: Project | null = null;
  try {
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(
            (key) => localStorage.getItem(key),
            CURRENT_DRAFT_KEY,
          );
          observed = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
          return !!observed && expected(observed);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test
      .info()
      .attach("last-labeled-cut-project", {
        body: Buffer.from(JSON.stringify(observed, null, 2)),
        contentType: "application/json",
      });
    throw error;
  }
  return observed!;
}
async function importProject(page: Page, project: Project) {
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
      name: "labeled-stock.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}

test("record floor-base joist boards together, undo once, and keep the offcuts and purchase credit", async ({ page }) => {
  const base = applyCommand(blank("Batch floor base"), {
    type: "foundation", width: 108, depth: 48, height: 48, spacing: 16,
    baseStock: { rim: "hd-treated-2x6-10", joist: "hd-treated-2x6-8" },
  });
  const before = await importProject(page, base);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator('.bom-row[data-stock-material="hd-treated-2x6-8"]');
  const order = row.locator(".stock-cut-order");
  const stockSummary = order.locator(":scope > summary");
  const batch = order.locator(".stock-cut-batch");
  const record = batch.getByRole("button", { name: "Record 4 stock units", exact: true });
  async function recordJoists() {
    if ((await order.getAttribute("open")) === null) await stockSummary.click();
    await batch.locator(":scope > summary").click();
    await expect(batch).toContainText("4 expected offcuts");
    await batch.getByRole("checkbox", { name: "I already have all these stock units" }).check();
    await record.click();
  }
  await recordJoists();
  await expect(row).toContainText("0 boards to buy");
  await expect(page.getByRole("button", { name: "Cut pool (4)", exact: true })).toBeVisible();
  const first = await draft(page, (project) => project.onHandCutSources?.length === 4);
  expect(inspectCutStock(first).valid.size).toBe(4);
  expect(first.pieces.filter(({ offcut }) => offcut).map(({ size }) => size[2])).toEqual([5.75, 5.75, 5.75, 5.75]);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toContainText("4 boards · 8 parts");
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
  await draft(page, (project) => !project.onHandCutSources?.length && project.pieces.every(({ cutStock }) => !cutStock));
  await recordJoists();
  const initialSources = new Set(first.onHandCutSources);
  const current = await draft(page, (project) =>
    project.onHandCutSources?.length === 4 &&
    project.onHandCutSources.every((id) => !initialSources.has(id)));
  const active = current.pieces.filter(({ offcut }) => !offcut).map((piece) => ({ ...piece, cutStock: null }));
  expect(active).toEqual(before.pieces);
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const shopping = dialog.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(shopping).toHaveValue(/2 boards[^\n]*#206967800/);
  await expect(shopping).not.toHaveValue(/206952301/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Stock on hand");
  expect(guide).toMatch(/## Recorded stock cuts[\s\S]+Crosscut 45 in/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const save = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${current.id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${current.id}`);
  expect(reply.ok()).toBe(true);
  const reopened = projectSchema.parse((await reply.json()).project);
  expect(reopened.pieces).toEqual(current.pieces);
  expect(reopened.onHandCutSources).toEqual(current.onHandCutSources);
});

test("greenhouse framing cuts can use an existing board to clear a narrow edge trim", async ({ page }) => {
  const { project } = createBuildFixture("greenhouse");
  project.name = `Greenhouse board cut ${uid().slice(0, 8)}`;
  const before = await importProject(page, project);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(".bom-row").filter({ has: page.getByText("2 × 4 framing lumber", { exact: true }) }).first();
  await expect(row).toContainText("47 boards");
  const order = row.locator(".stock-cut-order");
  await order.locator(":scope > summary").click();
  await expect(order).not.toContainText("Review needed");
  const board = order.locator("details").filter({ has: page.getByText(/^Board 13 ·/) });
  await board.locator(":scope > summary").click();
  expect(await board.locator("li").allTextContents()).toEqual([
    expect.stringMatching(/Crosscut 73.29352 in from the current end/),
    expect.stringMatching(/Crosscut 11.16667 in from the current end/),
  ]);
  await expect(board).toContainText("Expected leftovers · 11.28981 in");
  await board.getByRole("button", { name: "Record this stock unit" }).click();
  const after = await draft(page, (actual) => actual.pieces.filter((piece) => piece.cutStock?.sourceAxes).length === 3);
  const recorded = after.pieces.filter((piece) => piece.cutStock?.sourceAxes);
  const sourceId = recorded[0].cutStock!.id;
  expect(inspectCutStock(after).valid.has(sourceId)).toBe(true);
  expect(recorded.filter((piece) => !piece.offcut)).toHaveLength(2);
  expect(recorded.filter((piece) => piece.offcut)).toHaveLength(1);
  expect(after.pieces.slice(0, before.pieces.length).map(({ position, size }) => ({ position, size }))).toEqual(
    before.pieces.map(({ position, size }) => ({ position, size })),
  );
  await expect(row).toContainText("47 boards");
});

test("record a planned sheet, reuse a remnant and reopen the shared source and cut order", async ({ page }) => {
  const initial = blank(`Recorded plywood layout ${uid().slice(0, 8)}`);
  const step = initial.steps[0].id;
  initial.pieces = [
    part("Seat panel", "plytanium-703", [19, 0.703, 28], [0, 4, 0], step, "Seat"),
    part("Seat panel", "plytanium-703", [0.703, 20, 25], [30, 10, 0], step, "Seat"),
  ];
  const before = await importProject(page, initial);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator('.bom-row[data-stock-material="plytanium-703"]');
  await expect(row).toContainText("1 sheet");
  const order = row.locator(".stock-cut-order");
  await order.locator(":scope > summary").click();
  await order.locator("details > summary").click();
  await expect(order).toContainText("Expected leftovers");
  await order.getByRole("button", { name: "Record this stock unit" }).click();
  const recorded = await draft(page, (actual) =>
    actual.pieces.every((piece) => !!piece.cutStock) && actual.pieces.some((piece) => piece.offcut),
  );
  const sourceId = recorded.pieces[0].cutStock!.id;
  expect(inspectCutStock(recorded).valid.has(sourceId)).toBe(true);
  expect(recorded.pieces.slice(0, 2).map((piece) => ({ ...piece, cutStock: null }))).toEqual(before.pieces);
  expect(recorded.pieces.slice(0, 2).map(({ id }) => partLabel(recorded, id))).toEqual(
    before.pieces.map(({ id }) => partLabel(before, id)),
  );
  await expect(row).toContainText("1 sheet");
  await expect(order).toHaveCount(0);
  await row.getByText(/Recorded cut source 1/).click();
  await expect(row.locator(".cut-stock-layout")).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await draft(page, (actual) => actual.pieces.length === 2 && actual.pieces.every(({ cutStock }) => !cutStock));
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const restored = await draft(page, (actual) => actual.pieces[0].cutStock?.id === sourceId);
  expect(restored.pieces).toEqual(recorded.pieces);
  const remnants = restored.pieces.filter(({ offcut }) => offcut);
  const reused = remnants[0];
  const label = partLabel(restored, reused.id);
  await page.getByRole("button", { name: `Cut pool (${remnants.length})`, exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await pool.getByRole("button", { name: `Reuse ${label}`, exact: true }).click();
  const final = await draft(page, (actual) => actual.pieces.find(({ id }) => id === reused.id)?.offcut === false);
  expect(final.pieces.find(({ id }) => id === reused.id)?.cutStock?.id).toBe(sourceId);
  expect(bom(final).find(({ id }) => id === "plytanium-703")?.physicalStockUnits).toBe(1);
  expect(inspectCutStock(final).valid.has(sourceId)).toBe(true);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const response = await page.request.get(`/api/projects/${final.id}`);
  expect(response.ok()).toBe(true);
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.pieces).toEqual(final.pieces);
  expect(reopened.history.some(({ message }) => /Stock cut order .*Crosscut Strip 1/.test(message))).toBe(true);
});

test("sheet SVG and human export share persistent labels and exact inch dimensions", async ({
  page,
}) => {
  const initial = blank("Persistent sheet placement labels");
  initial.notes =
    "Original assumption: no sheet layout yet.\n\nKeep my pencil notes verbatim.";
  initial.pieces = [
    part(
      "Panel",
      "plytanium-703",
      [18, 0.703, 30.25],
      [0, 0, 0],
      initial.steps[0].id,
      "Panels",
    ),
    part(
      "Panel",
      "plytanium-703",
      [20.125, 0.703, 30.125],
      [40, 0, 0],
      initial.steps[0].id,
      "Panels",
    ),
    part(
      "Skinny strip",
      "plytanium-703",
      [0.75, 0.703, 60],
      [75, 0, 0],
      initial.steps[0].id,
      "Panels",
    ),
  ];
  initial.partLabels = initial.pieces.map((piece, index) => ({
    partId: piece.id,
    label: `P0${index + 1}0`,
  }));
  const project = await importProject(page, initial);
  expect(project.notes).toBe(initial.notes);
  const savedNotes = page.locator(".print-guide .saved-project-notes");
  await expect(savedNotes.locator("h2")).toHaveText("Saved project notes");
  await expect(savedNotes.locator(".saved-notes-context")).toHaveText(
    SAVED_PROJECT_NOTES_CONTEXT,
  );
  expect(await savedNotes.locator(".saved-notes-text").textContent()).toBe(
    initial.notes,
  );
  await page.getByRole("button", { name: "List", exact: true }).click();
  const layout = page.locator("details.sheet-layout");
  await layout.locator("summary").click();
  await expect(layout).toContainText("47.938 in × 95.938 in");
  const placements = bom(project)[0].sheets.flatMap(
    (sheet) => sheet.placements,
  );
  for (const cut of placements) {
    const label = partLabel(project, cut.id),
      shape = layout.locator(`svg g[data-placement-id='${cut.id}']`),
      legend = layout.locator(
        `.sheet-legend li[data-placement-id='${cut.id}']`,
      );
    await expect(shape).toHaveAttribute("data-part-label", label);
    await expect(shape).toHaveAttribute(
      "aria-label",
      new RegExp(`^${label} ·`),
    );
    await expect(shape.locator("title")).toContainText(label);
    await expect(legend).toContainText(label);
  }
  const strip = initial.pieces[2];
  await expect(
    layout.locator(`svg g[data-placement-id='${strip.id}'] text`),
  ).toHaveCount(0);
  await expect(
    layout.locator(`.sheet-legend li[data-placement-id='${strip.id}']`),
  ).toContainText("P030 · Skinny strip");
  const labelTexts = await layout.locator("svg text").allTextContents();
  expect(labelTexts).not.toContain("1");
  expect(labelTexts).not.toContain("2");
  const order = page.locator(".stock-cut-order");
  await order.locator(":scope > summary").click();
  await order.locator("details > summary").click();
  await expect(order.locator("li").first()).toHaveText(
    "Crosscut Strip 1 at 5 ft from the current end of the sheet.",
  );
  await expect(order).toContainText("Rip 0.75 in from the current edge of Strip 1 for P030 · Skinny strip.");
  await expect(order).toContainText("Expected leftovers");
  const printedOrder = page.locator(".stock-cut-order-print");
  await expect(printedOrder.locator("li").first()).toHaveText(await order.locator("li").first().textContent() ?? "");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const downloaded = await pending,
    path = await downloaded.path();
  expect(path).toBeTruthy();
  const markdown = await readFile(path!, "utf8");
  expect(markdown).toContain(
    `## Saved project notes\n\n${SAVED_PROJECT_NOTES_CONTEXT}\n\n${initial.notes}\n\n---`,
  );
  for (const cut of placements)
    expect(markdown).toContain(`${partLabel(project, cut.id)} · ${cut.name}:`);
  expect(markdown).toContain("Stock 47.938 in × 95.938 in");
  expect(markdown).toContain("20.125 in × 30.125 in");
  expect(markdown).toContain("## Stock cut order");
  expect(markdown).toContain("1. Crosscut Strip 1 at 5 ft from the current end of the sheet.");
});

test("stock on hand reduces the Home Depot handoff and stays linked to the saved source", async ({ page }) => {
  const initial = blank(`Stock on hand ${uid().slice(0, 8)}`);
  initial.pieces = ["First side", "Second side"].map((name, index) =>
    part(name, "plytanium-703", [30, 0.703, 60], [index * 40, 10, 0], initial.steps[0].id, "Shelves"),
  );
  const before = await importProject(page, initial);
  const list = page.getByRole("button", { name: "List", exact: true });
  await list.click();
  const row = page.locator(".bom-row[data-stock-material='plytanium-703']");
  await expect(row).toContainText("2 sheets");
  const order = row.locator(".stock-cut-order");
  await order.locator(":scope > summary").click();
  const sheet = order.locator(":scope > details").first();
  await sheet.locator(":scope > summary").click();
  await sheet.getByRole("checkbox", { name: "I already have this stock" }).check();
  await sheet.getByRole("button", { name: "Record this stock unit", exact: true }).click();
  const recorded = await draft(page, (project) => project.onHandCutSources?.length === 1);
  const sourceId = recorded.onHandCutSources![0];
  expect(inspectCutStock(recorded).valid.has(sourceId)).toBe(true);
  expect(bom(recorded)[0].physicalStockUnits).toBe(2);
  await expect(row).toContainText("1 sheet to buy");
  await expect(row).toContainText("1 stock source on hand");
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Stock on hand", { exact: true }).click();
  await expect(dialog.getByText(/1 source ·/)).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/^1 sheet .*Internet #/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".print-guide")).toContainText("1 source on hand");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toHaveClass(/\bsaved\b/);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: before.name }).click();
  await list.click();
  await expect(row).toContainText("1 sheet to buy");
  await row.getByText(/^Recorded cut source 1/).click();
  const source = row.locator(`.cut-stock-layout[data-source-id="${sourceId}"]`);
  const owned = source.getByRole("checkbox", { name: "I already have this stock" });
  await expect(owned).toBeChecked();
  await owned.uncheck();
  await expect(row).toContainText("2 sheets");
  await expect(row).not.toContainText("stock source on hand");
});

test("measure a shop offcut, trim and reuse it, then reopen its on-hand source", async ({ page }) => {
  const initial = await importProject(page, blank(`Shop offcut ${uid().slice(0, 8)}`));
  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await pool.getByRole("button", { name: "Add measured offcut", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Matching stock" }).selectOption("plytanium-703");
  await dialog.getByRole("combobox", { name: "Length units", exact: true }).selectOption("ft");
  await dialog.getByRole("spinbutton", { name: "Length", exact: true }).fill("2");
  await dialog.getByRole("spinbutton", { name: "Width", exact: true }).fill("16");
  await dialog.getByRole("textbox", { name: "Name (optional)", exact: true }).fill("Leftover cabinet panel");
  await dialog.getByRole("button", { name: "Add to Cut pool", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const stocked = await draft(page, (project) => project.pieces.length === 1 && project.pieces[0].offcut);
  const [scrap] = stocked.pieces;
  const sourceId = scrap.cutStock!.id;
  const label = partLabel(stocked, scrap.id);
  expect(scrap.size).toEqual([16, 0.703, 24]);
  await expect(pool).toContainText("Leftover cabinet panel");
  await expect(pool).toContainText("2 ft × 16 in × 0.703 in");
  await pool.getByRole("button", { name: `Inspect ${label}`, exact: true }).click();
  await page.getByRole("button", { name: "Cut / resize stock", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Retained length units", exact: true }).selectOption("in");
  await dialog.getByRole("spinbutton", { name: "Retained length", exact: true }).fill("14");
  await dialog.getByRole("button", { name: "Apply cuts", exact: true }).click();
  const cut = await draft(page, (project) => project.pieces.length === 2);
  expect(cut.pieces.every((piece) => piece.offcut && piece.cutStock?.id === sourceId)).toBe(true);
  await pool.getByRole("button", { name: `Reuse ${label}`, exact: true }).click();
  const placed = await draft(page, (project) => project.pieces.some(({ id, offcut }) => id === scrap.id && !offcut));
  expect(placed.pieces.find(({ id }) => id === scrap.id)?.size).toEqual([16, 0.703, 14]);
  expect(placed.onHandCutSources).toEqual([sourceId]);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(".bom-row[data-stock-material='plytanium-703']");
  await expect(row).toContainText("0 sheets to buy");
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByText("The current list has no products to copy.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toHaveClass(/\bsaved\b/);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: initial.name }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(row).toContainText("0 sheets to buy");
  await row.getByText(/^Recorded cut source 1/).click();
  await expect(row.locator(`.cut-stock-layout[data-source-id="${sourceId}"]`)).toContainText("24 in long");
});

test("replace an oversized wood blank with exact longer stock while keeping the part", async ({ page }) => {
  const initial = blank(`Replacement stock ${uid().slice(0, 8)}`);
  const rail = part("Nine-foot rail", "stud", [108, 3.5, 1.5], [12, 24, -6], initial.steps[0].id, "Framing", [0.2, 0.1, 0.3]);
  rail.stockLengthAxis = 0;
  initial.pieces = [rail];
  const before = await importProject(page, initial);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${rail.id}"]`).click();
  await page.getByRole("button", { name: "View stock cut plan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const replacement = dialog.getByText("Change stock for this part", { exact: true });
  const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
  await expect(dialog).toContainText("oversized for its selected stock");
  await replacement.click();
  await dialog.getByRole("combobox", { name: "Replacement stock", exact: true }).selectOption("hd-spf-2x4-12");
  await expect(dialog.getByRole("link", { name: "Product #312528815" })).toHaveAttribute("href", /homedepot\.com\/p\/.*312528815/);
  await expect(dialog.getByRole("list", { name: "Project purchase changes" })).toContainText("0 → 1 board to buy");
  await dialog.getByRole("button", { name: "Apply replacement stock", exact: true }).click();
  const replaced = await draft(page, (project) => project.pieces[0].material === "hd-spf-2x4-12");
  expect(replaced.pieces[0]).toEqual({ ...before.pieces[0], material: "hd-spf-2x4-12" });
  await expect(dialog).toContainText("Crosscut 9 ft");
  await expect(dialog).toContainText("35.875 in");
  await close.click();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await draft(page, (project) => project.pieces[0].material === "stud");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await draft(page, (project) => project.pieces[0].material === "hd-spf-2x4-12");

  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator('.bom-row[data-stock-material="hd-spf-2x4-12"]');
  await expect(row).toContainText("1 board");
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/1 board[^\n]*#312528815/);
  await close.click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Changed stock for Nine-foot rail");
  expect(guide).toContain("312528815");
  await close.click();
  const save = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${replaced.id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${replaced.id}`);
  expect(reply.ok()).toBe(true);
  expect(projectSchema.parse((await reply.json()).project).pieces).toEqual(replaced.pieces);
});

test("compare Home Depot stock as a batch and preserve a recorded source through undo and save", async ({ page }) => {
  const initial = blank(`Batch stock comparison ${uid().slice(0, 8)}`);
  const source = "hd-spf-2x4-10", alternate = "hd-spf-2x4-12";
  const rail = (name: string, length: number, x: number, stock: typeof source | typeof alternate = source) =>
    part(name, stock, [3.5, 1.5, length], [x, 10, 0], initial.steps[0].id, "Framing");
  initial.pieces = [rail("Already cut", 38, 0)];
  const [sequence] = stockCutSequences(initial, bom(initial)).get(source)!;
  const { project, sourceId } = recordStockCutLayout(initial, sequence.layout, true);
  const uncut = Array.from({ length: 6 }, (_, index) => rail(`Rail ${index + 1}`, 47, (index + 1) * 6));
  const ids = new Set(uncut.map(({ id }) => id));
  project.pieces = [...project.pieces, ...uncut, rail("Existing twelve-foot stock part", 94, 66, alternate)];
  project.store = "4409";
  project.inventory = [{
    retailer: "home-depot", material: alternate, name: "Historic test listing for 12 ft stock",
    internetNumber: "999999999", price: 80, available: 55, zip: project.zip,
    store: project.store, checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/999999999",
  }];
  const before = await importProject(page, project);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(`.bom-row[data-stock-material="${source}"]`);
  await row.getByText("Compare stock for 6 parts", { exact: true }).click();
  await expect(row).toContainText("1 already linked to recorded stock");
  const choice = row.getByRole("combobox", { name: "Alternate stock", exact: true });
  await choice.selectOption("hd-kdht-2x4-8");
  await expect(row).toContainText("Affected lines · 3 → 3 boards to buy");
  await expect(row).toContainText("Current store availability unverified");
  await choice.selectOption(alternate);
  await expect(row).toContainText("Affected lines · 4 → 3 boards to buy");
  await expect(row).toContainText("Total board length to buy · 42 ft → 36 ft");
  await expect(row).toContainText("Current store availability unverified");
  await expect(row.getByRole("link", { name: "Product #312528815" })).toHaveAttribute("href", /homedepot\.com\/p\/.*312528815/);
  await row.getByRole("button", { name: "Record snapshot for alternate", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Modeled material")).toHaveValue(alternate);
  await expect(dialog.getByLabel("Internet number")).toHaveValue("312528815");
  await expect(dialog.getByLabel("Internet number")).not.toBeEditable();
  await expect(dialog.getByLabel("Exact store number", { exact: true })).toHaveValue("4409");
  await dialog.getByLabel("Unit price (USD)", { exact: true }).fill("12");
  await dialog.getByLabel("Available stock units", { exact: true }).fill("2");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save snapshot", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(choice).toHaveValue(alternate);
  await expect(row).toContainText("Store 4409, ZIP 84121 snapshot · 2 available · 3 needed");
  const observed = await draft(page, (p) => p.inventory.some(({ internetNumber }) => internetNumber === "312528815"));
  expect(observed.pieces).toEqual(before.pieces);
  expect(observed.inventory[0]).toEqual(before.inventory[0]);
  await row.getByRole("button", { name: "Change stock for 6 parts", exact: true }).click();
  const after = await draft(page, (p) => p.pieces.filter(({ material }) => material === alternate).length === 7);
  expect(after.pieces).toEqual(before.pieces.map((p) => ids.has(p.id) ? { ...p, material: alternate } : p));
  expect(after.onHandCutSources).toEqual([sourceId]);
  await expect(row).toContainText("0 boards to buy");
  await expect(row.getByText("Compare stock for 6 parts", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await draft(page, (p) => p.pieces.filter(({ material }) => material === alternate).length === 1);
  expect(undone.pieces).toEqual(before.pieces);
  expect(undone.inventory).toEqual(observed.inventory);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await draft(page, (p) => p.pieces.filter(({ material }) => material === alternate).length === 7);
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/3 boards[^\n]*#312528815/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const save = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${after.id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${after.id}`);
  expect(reply.ok()).toBe(true);
  const reopened = projectSchema.parse((await reply.json()).project);
  expect(reopened.pieces).toEqual(after.pieces);
  expect(reopened.onHandCutSources).toEqual([sourceId]);
  expect(reopened.inventory).toEqual(observed.inventory);
});

test("open comparisons and purchase handoffs expire snapshots without exposing line prices or editing the project", async ({ page }) => {
  const start = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const stockExpires = start + 95000, hardwareExpires = start + 116000;
  const stockChecked = new Date(stockExpires - day).toISOString();
  const source = "hd-spf-2x4-10", alternate = "hd-spf-2x4-12";
  const project = addSupply(blank(`Snapshot expiry ${uid().slice(0, 8)}`), "everbilt-29256-continuous-hinge", 1);
  project.store = "4409";
  const observation = {
    retailer: "home-depot" as const, name: "Synthetic store check", store: project.store,
    zip: project.zip, checkedAt: stockChecked, available: 4,
  };
  project.inventory = [
    { ...observation, material: source, internetNumber: "100077951", url: "https://www.homedepot.com/p/100077951", price: 8 },
    { ...observation, material: alternate, internetNumber: "312528815", url: "https://www.homedepot.com/p/312528815", price: 14 },
  ];
  project.supplyInventory = [{
    productId: "everbilt-29256-continuous-hinge", retailer: "home-depot", retailerProductId: "314150989",
    store: project.store, zip: project.zip, checkedAt: new Date(hardwareExpires - day).toISOString(),
    url: "https://www.homedepot.com/p/314150989", price: 19, available: 3,
  }];
  const rail = (name: string, length: number, x: number, stock: typeof source | typeof alternate) =>
    part(name, stock, [3.5, 1.5, length], [x, 10, 0], project.steps[0].id, "Framing");
  project.pieces = Array.from({ length: 6 }, (_, index) => rail(`Rail ${index + 1}`, 47, (index + 1) * 6, source));
  project.pieces.push(rail("Existing longer-stock rail", 94, 66, alternate));
  await page.clock.install({ time: start });
  const before = await importProject(page, project);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(`.bom-row[data-stock-material="${source}"]`);
  await row.getByText("Compare stock for 6 parts", { exact: true }).click();
  const comparison = row.locator(".stock-group-comparison");
  const choice = comparison.getByRole("combobox", { name: "Alternate stock", exact: true });
  await choice.selectOption(alternate);
  await expect(comparison).toContainText("Affected lines · 4 → 3 boards to buy");
  await expect(comparison).toContainText("4 available · 3 needed");
  await expect(comparison).not.toContainText(/\$|per board/);

  async function advanceTo(time: number) {
    const current = await page.evaluate(() => Date.now());
    expect(time).toBeGreaterThan(current);
    await page.clock.fastForward(time - current);
  }
  await advanceTo(start + 65000);
  await expect(comparison).toContainText("4 available · 3 needed");
  await advanceTo(stockExpires + 250);
  await expect(comparison).toContainText("Current store availability unverified");
  await expect(choice).toHaveValue(alternate);
  await expect(comparison).toContainText("Affected lines · 4 → 3 boards to buy");

  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("listitem").filter({ hasText: "#312528815" })).toContainText("No recent store snapshot");
  const hinge = dialog.getByRole("listitem").filter({ hasText: "#314150989" });
  await expect(hinge).toContainText("3 available in snapshot");
  await expect(hinge).not.toContainText(/\$|per purchase unit/);
  await advanceTo(hardwareExpires + 250);
  await expect(hinge).toContainText("No recent store snapshot");
  const after = await draft(page, (p) => p.id === before.id);
  expect(after).toEqual(before);
});

test("assign a shop offcut to a planned shelf part without replacing its design", async ({ page }) => {
  const initial = blank(`Assign shelf stock ${uid().slice(0, 8)}`);
  const stepId = initial.steps[0].id;
  const shelf = part("Planned shelf", "plytanium-703", [0.703, 32, 15], [0, 20, 0], stepId, "Cabinet");
  initial.pieces = [shelf];
  const stocked = addMeasuredOffcut(initial, stepId, shelf.material, [40, 23, 0.703], "Cabinet remnant");
  const before = await importProject(page, stocked);
  const scrap = before.pieces.find(({ offcut }) => offcut)!;
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${shelf.id}"]`).click();
  await page.getByRole("button", { name: "View stock cut plan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Use an offcut from the Cut pool (1)", { exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Matching offcut" })).toHaveValue(scrap.id);
  await expect(dialog).toContainText("Crosscut to 32 in · Rip to 15 in");
  await dialog.getByRole("button", { name: "Use offcut for this part", exact: true }).click();
  const sourceId = scrap.cutStock!.id;
  const used = await draft(page, (project) => project.pieces[0].cutStock?.id === sourceId);
  expect({ ...used.pieces[0], cutStock: null }).toEqual(before.pieces[0]);
  expect(used.pieces.filter(({ offcut }) => offcut)).toHaveLength(2);
  await expect(dialog.locator(".cut-stock-layout")).toHaveAttribute("data-source-id", sourceId);
  await expect(dialog).toContainText("40 in long");
  await dialog.getByRole("button", { name: "Review offcut assignment", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("Review offcut assignment");
  await expect(dialog).toContainText("O001 · Offcut · Cabinet remnant");
  await expect(dialog.getByRole("button", { name: "Return uncut offcut", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(".bom-row[data-stock-material='plytanium-703']");
  await expect(row).toContainText("0 sheets to buy");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toContainText("1 sheet to buy");
  await draft(page, (project) => project.pieces.some(({ id, offcut }) => id === scrap.id && offcut));
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(row).toContainText("0 sheets to buy");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toHaveClass(/\bsaved\b/);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: before.name }).click();
  const reopened = await draft(page, (project) => project.pieces.some(({ id }) => id === shelf.id) && project.pieces[0].cutStock?.id === sourceId);
  expect(reopened.pieces).toEqual(used.pieces);
});

test("find a planned remnant for a part and return it to its original stock selection", async ({ page }) => {
  const project = blank(`Different stock lengths ${uid().slice(0, 8)}`);
  const step = project.steps[0].id;
  const main = part("Long rail", "hd-syp-2x8-10", [1.5, 60, 7.25], [-12, 30, 0], step, "Rails");
  const target = part("Short rail", "two-eight", [1.5, 42, 7.25], [12, 21, 0], step, "Rails");
  project.pieces = [main, target];
  const planned = planDedicatedBoardCuts(project, [main.id]);
  const stocked = addMeasuredOffcut(planned, step, "hd-treated-2x8-10", [58, 7.25, 1.5], "Treated leftover");
  const before = await importProject(page, stocked);
  const remnant = before.pieces.find(({ offcut, material }) => offcut && material === main.material)!;
  const label = partLabel(before, target.id);
  const remnantLabel = partLabel(before, remnant.id);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill(`Which offcuts fit ${label}?`);
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  const answer = dialog.getByRole("region", { name: `Offcuts for ${label}` });
  await expect(answer).toContainText(`${remnantLabel}`);
  await expect(answer).not.toContainText("Treated leftover");
  await answer.getByRole("button", { name: "Review this offcut", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Matching offcut" })).toHaveValue(remnant.id);
  await expect(dialog).toContainText("Crosscut to 42 in");
  await dialog.getByText(/Source cuts to do first/).click();
  await expect(dialog.getByRole("list", { name: "Source cuts to do first" })).toContainText("5 ft");
  await dialog.getByRole("button", { name: "Use offcut for this part", exact: true }).click();
  const used = await draft(page, (p) => p.pieces.find(({ id }) => id === target.id)?.cutStock?.id === remnant.cutStock?.id);
  const finished = used.pieces.find(({ id }) => id === target.id)!;
  expect(finished.material).toBe(main.material);
  expect(finished.position).toEqual(target.position);
  expect(finished.size).toEqual(target.size);
  expect(bom(used).find(({ id }) => id === target.material)?.quantity ?? 0).toBe(0);
  expect(bom(used).find(({ id }) => id === main.material)?.quantity).toBe(1);
  expect(guideMarkdown(used)).toMatch(/Complete the source stock cut order before using this blank.*under Planned stock cuts/);
  await dialog.getByRole("button", { name: "Review offcut assignment", exact: true }).click();
  await expect(dialog).toContainText(/Stock to buy.*2 × 8 framing lumber.*0 → 1 board/);
  await dialog.getByRole("button", { name: "Return uncut offcut", exact: true }).click();
  const returned = await draft(page, (p) => p.pieces.some(({ id, offcut }) => id === remnant.id && offcut));
  expect(returned.pieces.find(({ id }) => id === target.id)).toMatchObject({
    material: target.material, position: target.position, size: target.size, cutStock: null,
  });
  expect(inspectCutStock(returned).valid.has(remnant.cutStock!.id)).toBe(true);
});

test("review several parts against one measured offcut and apply them together", async ({ page }) => {
  const initial = blank(`Batch reuse ${uid().slice(0, 8)}`);
  const step = initial.steps[0].id;
  initial.pieces = [22, 36].map((length, index) =>
    part(index ? "Long shelf" : "Short shelf", "plytanium-703", [15, 0.703, length], [index * 25, 10, 0], step, "Cabinet"),
  );
  const stocked = addMeasuredOffcut(initial, step, "plytanium-703", [65, 16, 0.703], "Cabinet remnant");
  const before = await importProject(page, stocked);
  const scrap = before.pieces.find(({ offcut }) => offcut)!;
  await page.getByRole("button", { name: "Cut pool (1)", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  const preview = pool.getByRole("button", { name: "Review offcut reuse", exact: true });
  const dialog = page.getByRole("dialog", { name: "Review offcut reuse", exact: true });
  await preview.click();
  const cuts = dialog.getByRole("list", { name: "Proposed cuts in order", exact: true }).getByRole("listitem");
  await expect(cuts).toHaveCount(2);
  await expect(cuts.nth(0)).toContainText("Long shelf");
  await expect(cuts.nth(0)).toContainText("O001");
  await expect(cuts.nth(1)).toContainText("Short shelf");
  await expect(cuts.nth(1)).toContainText("From an earlier cut · O002");
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("1 → 0 sheets");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(pool.getByRole("button", { name: "Reusable offcuts (1)", exact: true })).toBeVisible();

  await preview.click();
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const sourceId = scrap.cutStock!.id;
  const assigned = await draft(page, (project) => project.pieces.filter(({ offcut }) => !offcut).every(({ cutStock }) => cutStock?.id === sourceId));
  expect(assigned.pieces.filter(({ offcut }) => !offcut).map((piece) => ({ ...piece, cutStock: null }))).toEqual(before.pieces.filter(({ offcut }) => !offcut));
  await page.getByRole("button", { name: "List", exact: true }).click();
  const row = page.locator(".bom-row[data-stock-material='plytanium-703']");
  await expect(row).toContainText("0 sheets to buy");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toContainText("1 sheet to buy");
  const undone = await draft(page, (project) => project.pieces.some(({ id }) => id === scrap.id));
  expect(undone.pieces).toEqual(before.pieces);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(row).toContainText("0 sheets to buy");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toHaveClass(/\bsaved\b/);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: before.name }).click();
  await draft(page, (project) => project.history.filter(({ offcutCut }) => !!offcutCut).length === 2);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportedFile = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: /^Build guide/ }).click();
  const exportedGuide = await readFile((await (await exportedFile).path())!, "utf8");
  expect(exportedGuide).toMatch(/## Recorded offcut cut order[\s\S]*1\. O001 → P002 · Long shelf[\s\S]*2\. O002 → P001 · Short shelf[\s\S]*remnant from cut 1/);
  await page.getByRole("dialog").getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  const cutOrder = page.locator(".print-guide .offcut-cut-order-print");
  await expect(cutOrder).toBeVisible();
  await expect(cutOrder.getByRole("listitem").first()).toContainText("Long shelf");
  await expect(cutOrder.getByRole("listitem").nth(1)).toContainText("remnant from cut 1");
  const pdf = await page.pdf({ format: "Letter" });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
});

test("repair stale offcut assignments from build preparation and keep the edited part", async ({ page }) => {
  const initial = blank(`Release offcut ${uid().slice(0, 8)}`);
  const stepId = initial.steps[0].id;
  const short = part("Short shelf", "plytanium-703", [15, 0.703, 22], [0, 10, 0], stepId, "Cabinet");
  const long = part("Long shelf", "plytanium-703", [15, 0.703, 36], [25, 10, 0], stepId, "Cabinet");
  initial.pieces = [short, long];
  const stocked = addMeasuredOffcut(initial, stepId, long.material, [65, 16, 0.703], "Cabinet remnant");
  const original = stocked.pieces.find(({ offcut }) => offcut)!;
  const stale = planOffcutReuse(stocked).project;
  stale.pieces.find(({ id }) => id === long.id)!.size[2] = 35;
  const before = await importProject(page, stale);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const cuts = page.getByRole("region", { name: "Build preparation", exact: true })
    .locator("details.preparation-group")
    .filter({ has: page.locator("summary").filter({ hasText: "Stock and cuts" }) });
  const summary = cuts.locator(":scope > summary");
  await expect(summary).toContainText("2 to review");
  await summary.click();
  const review = cuts.getByRole("button", { name: /O001 → P002.*Long shelf/ });
  await review.click();
  const confirmation = page.getByRole("dialog", { name: "Review offcut assignment", exact: true });
  await expect(confirmation).toContainText("starting offcut is still uncut");
  await expect(confirmation).toContainText("O001 · Offcut · Cabinet remnant");
  await expect(confirmation).toContainText("65 in × 16 in × 0.703 in");
  await expect(confirmation.getByRole("listitem")).toHaveText(["P002 · Long shelf", "P001 · Short shelf"]);
  await expect(confirmation).toContainText("0 → 1 sheet");
  await confirmation.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(summary).toContainText("2 to review");
  await review.click();
  await confirmation.getByRole("button", { name: "Return uncut offcut", exact: true }).click();
  await expect(summary).toContainText("0 to review");
  const wasReleased = (project: Project) => project.history.filter(({ offcutCut }) => offcutCut?.releasedAt).length === 2;
  const after = await draft(page, wasReleased);
  expect(after.pieces.filter(({ offcut }) => offcut).map(({ id }) => id)).toEqual([original.id]);
  expect(after.pieces.filter(({ offcut }) => !offcut)).toEqual(
    before.pieces.filter(({ offcut }) => !offcut).map((piece) => ({ ...piece, cutStock: null })),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(summary).toContainText("2 to review");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(summary).toContainText("0 to review");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toHaveClass(/\bsaved\b/);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: before.name }).click();
  const reopened = await draft(page, wasReleased);
  expect(reopened.pieces).toEqual(after.pieces);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).not.toContain("## Recorded offcut cut order");
  expect(guide).toContain("Released plan: Assigned O001");
});

test("phone cut preview labels stay private when canceled and applied offcuts keep the preview identities", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = blank("Private labeled cut preview"),
    source = part(
      "Exact sheet",
      "plytanium-703",
      [47.938, 0.703, 95.938],
      [0, 0, 0],
      initial.steps[0].id,
      "Stock",
    );
  initial.pieces = [source];
  initial.partLabels = [
    { partId: source.id, label: "P042" },
    { partId: uid(), label: "O001" },
  ];
  const before = await importProject(page, initial);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${source.id}"]`).click();
  const cutButton = page.getByRole("button", { name: "Cut part", exact: true });
  const openCut = async () => {
    await cutButton.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: "Cut P042 · Exact sheet",
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog).toContainText("47.938 in stock width");
    await expect(dialog).toContainText("Thickness stays 0.703 in");
    await dialog
      .getByRole("spinbutton", { name: "Retained length", exact: true })
      .fill("60.125");
    await dialog
      .getByRole("spinbutton", { name: "Retained width", exact: true })
      .fill("20.125");
    await expect(dialog.locator(".cut-label-legend li")).toHaveCount(2);
    return dialog;
  };
  let dialog = await openCut();
  await expect(dialog.locator(".cut-label-legend")).toContainText("P042");
  await expect(dialog.locator(".cut-label-legend")).toContainText("O002");
  await expect(dialog.locator(".cut-label-legend")).toContainText("O003");
  await expect(dialog.locator(".cut-label-legend")).toContainText("0.703 in");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const unchanged = await draft(page, (actual) => actual.pieces.length === 1);
  expect(unchanged.partLabels).toEqual(before.partLabels);
  expect(unchanged.pieces).toEqual(before.pieces);
  dialog = await openCut();
  const candidate = await dialog
    .locator("svg g[data-preview-part-id]")
    .evaluateAll((groups) =>
      groups.map((group) => ({
        id: group.getAttribute("data-preview-part-id")!,
        label: group.getAttribute("data-part-label")!,
      })),
    );
  expect(candidate.map((item) => item.label).sort()).toEqual([
    "O002",
    "O003",
    "P042",
  ]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Apply cuts", exact: true }).click();
  const applied = await draft(
    page,
    (actual) =>
      candidate.every((item) =>
        actual.pieces.some((piece) => piece.id === item.id),
      ) && actual.pieces.filter((piece) => piece.offcut).length === 2,
  );
  for (const item of candidate)
    expect(partLabel(applied, item.id)).toBe(item.label);
  expect(applied.pieces.find((piece) => piece.id === source.id)!.size).toEqual([
    20.125, 0.703, 60.125,
  ]);
  expect(applied.partLabels.filter((row) => row.label === "O001")).toEqual(
    before.partLabels.filter((row) => row.label === "O001"),
  );
  expect(bom(applied)[0].quantity).toBe(1);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const downloaded = await pending,
    path = await downloaded.path();
  expect(path).toBeTruthy();
  const reopened = projectSchema.parse(
    JSON.parse(await readFile(path!, "utf8")),
  );
  expect(reopened.partLabels).toEqual(applied.partLabels);
  expect(reopened.pieces).toEqual(applied.pieces);
});
