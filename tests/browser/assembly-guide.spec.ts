import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type Project,
  type Step,
} from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import { generateBuildGuide, guideIsCurrent } from "../../src/guide";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { bom } from "../../src/engine";
import { cuttingAxes } from "../../src/cutPlan";
import { partLabel } from "../../src/partLabels";
import { assemblyPartLabels } from "../../src/assemblyPartLabels";
import { stockCutSequences } from "../../src/stockCutSequence";

async function draft(
  page: Page,
  expected: (project: Project) => boolean,
): Promise<Project> {
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
    await test.info().attach("last-observed-assembly-guide-project", {
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
      name: "assembly-stages.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
function stages(project: Project) {
  return project.steps.filter(
    (step) => step.generated?.kind === "assembly-stage",
  );
}
function stage(project: Project, key: string, ownerId?: string): Step {
  const result = stages(project).find(
    (step) =>
      step.generated?.kind === "assembly-stage" &&
      step.generated.stageKey === key &&
      (!ownerId || step.generated.planId === ownerId),
  );
  if (!result) throw Error(`Missing ${key} assembly stage`);
  return result;
}
async function generate(page: Page, expectedStageTitle: string) {
  await page
    .getByRole("button", { name: /^(Generate build guide|Regenerate guide)$/ })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(expectedStageTitle, {
    timeout: 15000,
  });
  return draft(
    page,
    (actual) =>
      guideIsCurrent(actual) &&
      stages(actual).some((step) => step.title === expectedStageTitle),
  );
}
async function chooseStage(page: Page, title: string) {
  await page
    .locator(".step-track")
    .getByRole("button")
    .filter({ hasText: title })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Step title", exact: true }),
  ).toHaveValue(title);
}
async function exportProject(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const downloaded = await pending,
    path = await downloaded.path();
  expect(path).toBeTruthy();
  const exported = projectSchema.parse(
    JSON.parse(await readFile(path!, "utf8")),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return exported;
}

for (const study of ["storage-banquette", "shelves", "closet-insert"] as const) {
  test(`a ${study} guide part opens its shared sheet and records matching offcuts`, async ({ page }) => {
    if (study === "closet-insert") await page.setViewportSize({ width: 390, height: 844 });
    const project = generateBuildGuide(createBuildStudy(study).project);
    project.name = `Part stock for ${study} ${uid().slice(0, 8)}`;
    const initial = await importProject(page, project);
    const materialRows = bom(initial);
    const sheets = [...stockCutSequences(initial, materialRows).values()].flat();
    const sheet = sheets.find(({ review, layout }) =>
      !review && layout.kind === "sheet" && layout.kept.length > 1 && layout.leftovers.length > 0);
    expect(sheet).toBeDefined();
    const targetId = sheet!.layout.kept.at(-1)!.id;
    const label = partLabel(initial, targetId);
    const labels = sheet!.layout.kept.map(({ id }) => partLabel(initial, id));
    const openFromGuide = async () => {
      await page.getByRole("button", { name: "Guide", exact: true }).click();
      const finder = page.locator(".guide-part-labels");
      const searchbox = finder.getByRole("searchbox");
      if (!(await searchbox.isVisible())) await finder.locator("summary").click();
      await searchbox.fill(label);
      await searchbox.press("Enter");
      const view = page.getByRole("region", { name: "Guide part view", exact: true });
      await expect(view).toContainText(label);
      await view.getByRole("button", { name: "View stock cut plan", exact: true }).click();
      return page.getByRole("dialog", { name: `Stock for ${label}` });
    };
    const dialog = await openFromGuide();
    await expect(dialog).toBeVisible();
    const sheetSummary = dialog.locator("summary").filter({ hasText: `${sheet!.title} ·` });
    await expect(sheetSummary).toBeVisible();
    await expect(sheetSummary.locator("..").locator("ol li")).toHaveText(sheet!.steps);
    for (const otherLabel of labels) await expect(dialog).toContainText(otherLabel);
    await expect(dialog).toContainText("Expected leftovers");

    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    await expect(page.getByTestId("guide-part-marker")).toHaveAttribute("data-piece-id", targetId);
    await page.getByRole("region", { name: "Guide part view", exact: true })
      .getByRole("button", { name: "View stock cut plan", exact: true }).click();
    await dialog.getByRole("button", { name: "Record this stock unit", exact: true }).click();
    const recorded = await draft(page, (actual) => !!actual.pieces.find(({ id }) => id === targetId)?.cutStock);
    const sourceId = recorded.pieces.find(({ id }) => id === targetId)!.cutStock!.id;
    const savedPieces = recorded.pieces.filter(({ cutStock }) => cutStock?.id === sourceId);
    expect(savedPieces.filter(({ offcut }) => offcut)).toHaveLength(sheet!.layout.leftovers.length);
    expect(savedPieces.filter(({ offcut }) => !offcut).map(({ id }) => id).sort()).toEqual(
      sheet!.layout.kept.map(({ id }) => id).sort(),
    );
    expect(recorded.pieces.filter(({ offcut }) => !offcut).map(({ id, position, size }) => ({ id, position, size }))).toEqual(
      initial.pieces.filter(({ offcut }) => !offcut).map(({ id, position, size }) => ({ id, position, size })),
    );
    const layout = dialog.getByRole("region", { name: "Recorded cut source" });
    await expect(layout).toHaveAttribute("data-source-id", sourceId);
    await expect(layout.locator("li[data-stock-focus]")).toContainText(label);
    await expect(layout.locator("li[data-stock-focus]")).toHaveAttribute("data-source-part-id", targetId);
    await expect(layout.locator("svg [data-stock-focus]")).toHaveAttribute("data-part-label", label);

    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    await generate(page, initial.steps.find(({ generated }) => generated?.kind === "assembly-stage")!.title);
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Saved to library", { exact: true })).toHaveClass(/\bsaved\b/);
    await page.reload();
    await page.getByRole("button", { name: "Open project", exact: true }).click();
    await page.locator(".project-list > button").filter({ hasText: initial.name }).click();
    const reopened = await openFromGuide();
    await expect(reopened.getByRole("region", { name: "Recorded cut source" })).toHaveAttribute("data-source-id", sourceId);
  });
}

test("the part inspector opens a stock plan that needs review without offering to record it", async ({ page }) => {
  const project = blank(`Tight cut ${uid().slice(0, 8)}`);
  const board = part("Tight trim", "stud", [1.5, 95.96, 3.5], [0, 0, 0], project.steps[0].id, "Framing");
  project.pieces = [board];
  const initial = await importProject(page, project);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`.step-part[data-part-id="${board.id}"]`).click();
  await page.getByRole("button", { name: "View stock cut plan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Stock for ${partLabel(initial, board.id)}` });
  await expect(dialog).toContainText("0.04 in to the edge with a 0.125 in kerf");
  await expect(dialog.getByRole("button", { name: "Record this stock unit", exact: true })).toHaveCount(0);
});

test("a printed greenhouse part label finds its exact 3D part and stage", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => document.documentElement.setAttribute("data-print-invoked", "true");
  });
  const project = generateBuildGuide(createBuildStudy("greenhouse").project);
  project.name = `Labeled greenhouse ${uid().slice(0, 8)}`;
  const initial = await importProject(page, project);
  const rows = assemblyPartLabels(initial);
  const target = rows.find((row) => row.profile && rows.some((other) =>
    other.name === row.name && other.pieceId !== row.pieceId))!;
  expect(target).toBeDefined();
  const stageRows = rows.filter(({ stepId }) => stepId === target.stepId);
  expect(stageRows.length).toBeLessThan(rows.length);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const panel = page.locator(".guide-part-labels");
  await panel.getByText("Find or print part labels", { exact: true }).click();
  const query = panel.getByRole("searchbox", { name: "Find by part label or name" });
  await query.fill("P9999");
  await expect(panel.getByRole("status")).toHaveText("No matching part.");
  await query.fill(target.label.toLowerCase());
  await expect(panel.getByRole("button", { name: /^Locate/ })).toHaveCount(1);
  await query.press("Enter");
  await expect(page.locator(".step-track .step-chip.active")).toContainText(target.step.title);
  const marker = page.getByTestId("guide-part-marker");
  await expect(marker).toHaveAttribute("data-piece-id", target.pieceId);
  await expect(marker).toHaveText(target.label);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered-part-ids", JSON.stringify([target.pieceId]));
  await page.getByRole("button", { name: "Show step context" }).click();
  const allowedSteps = new Set(initial.steps.slice(0, target.step.number).map(({ id }) => id));
  const contextualIds = initial.pieces.filter((p) => !p.offcut && allowedSteps.has(p.stepId)).map(({ id }) => id);
  await expect(canvas).toHaveAttribute("data-rendered-part-ids", JSON.stringify(contextualIds));
  await expect(marker).toBeVisible();
  await page.getByRole("button", { name: "Exit part view" }).click();
  await expect(marker).toHaveCount(0);

  await panel.getByRole("button", { name: "Print this step’s labels" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "true");
  await page.emulateMedia({ media: "print" });
  const print = page.getByRole("article", { name: "Printable assembly part labels" });
  await expect(print).toBeVisible();
  await expect(page.locator(".print-guide")).toBeHidden();
  expect(await print.locator("[data-part-label]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-part-label")))).toEqual(stageRows.map(({ label }) => label));
  await expect(print.locator(`[data-part-label="${target.label}"]`)).toContainText(target.dimensions);
  await expect(print.locator(`[data-part-label="${target.label}"]`)).toContainText("Profile cuts · see guide");
  const printed = await page.pdf({ path: test.info().outputPath("greenhouse-step-tags.pdf"), format: "Letter" });
  expect(printed.subarray(0, 4).toString()).toBe("%PDF");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
  await expect(page.locator(".print-guide")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".print-guide")).toBeHidden();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Print part labels/ }).click();
  await page.emulateMedia({ media: "print" });
  await expect(print.locator("[data-part-label]")).toHaveCount(rows.length);
  await page.pdf({ path: test.info().outputPath("greenhouse-all-tags.pdf"), format: "Letter" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  expect(await exportProject(page)).toEqual(initial);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Expand inspector", exact: true }).click();
  const inspector = page.getByRole("dialog", { name: "Inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: `Locate ${target.label} · ${target.name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Return to inspector", exact: true })).toBeVisible();
  const mobileView = page.getByRole("region", { name: "Guide part view" });
  await expect(mobileView).toBeVisible();
  await expect(canvas).toHaveAttribute("data-rendered-part-ids", JSON.stringify([target.pieceId]));
  await mobileView.getByRole("button", { name: "Exit part view" }).click();
  await expect(mobileView).toHaveCount(0);
});

test("exact bookcase assembly stages retain reviewed custom instructions and reset changed geometry through saved JSON round trips", async ({
  page,
}) => {
  const initial = createBuildStudy(
    "shelves",
    {
      ...defaultBuildStudyParameters("shelves"),
      width: 36,
      depth: 18,
      height: 72,
      shelfCount: 3,
    },
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  ).project;
  initial.name = `SYNTHETIC reviewed bookcase stages ${uid().slice(0, 8)}`;
  const side = initial.pieces.find((piece) => piece.assembly === "Left side")!;
  const history = {
    id: uid(),
    at: "2026-11-15T09:30:00.000Z",
    stepId: side.stepId,
    message: "SYNTHETIC checked the actual carcass reference edge",
  };
  initial.history.push(history);
  await importProject(page, initial);
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Dry-fit the bookcase carcass",
    { timeout: 15000 },
  );
  let generated = await draft(
    page,
    (actual) => guideIsCurrent(actual) && actual.steps.length === 4,
  );
  const carcass = stage(generated, "carcass"),
    shelves = stage(generated, "shelves"),
    baselineStageIds = generated.steps.map((step) => step.id);
  expect(generated.steps.map((step) => step.generated?.kind)).toEqual([
    "project-preparation",
    "assembly-stage",
    "assembly-stage",
    "project-finish",
  ]);
  expect(
    carcass.generated?.kind === "assembly-stage" &&
      carcass.generated.memberIds.length,
  ).toBe(5);
  expect(
    shelves.generated?.kind === "assembly-stage" &&
      shelves.generated.memberIds.length,
  ).toBe(3);
  expect(
    generated.pieces.every((piece) => Math.min(...piece.size) === 0.703),
  ).toBe(true);
  expect(generated.history.find((item) => item.id === history.id)?.stepId).toBe(
    carcass.id,
  );
  await chooseStage(page, carcass.title);
  const customTitle = "SYNTHETIC measured carcass sequence",
    before = "SYNTHETIC check the outlet before the baseline.",
    after = "SYNTHETIC retain the measured wall clearance.";
  await page
    .getByRole("textbox", { name: "Step title", exact: true })
    .fill(customTitle);
  await page
    .getByRole("textbox", { name: "Build instructions", exact: true })
    .fill(`${before}\n${carcass.generated!.notes}\n${after}`);
  await page
    .getByRole("button", { name: "Mark step complete", exact: true })
    .click();
  await draft(page, (actual) =>
    actual.steps.some(
      (step) =>
        step.id === carcass.id &&
        step.complete &&
        step.title === customTitle &&
        step.notes.includes(before) &&
        step.notes.includes(after),
    ),
  );
  generated = await generate(page, customTitle);
  const reviewed = generated.steps.find((step) => step.id === carcass.id)!;
  expect(reviewed.complete).toBe(true);
  expect(reviewed.title).toBe(customTitle);
  expect(reviewed.notes.split(before)).toHaveLength(2);
  expect(reviewed.notes.split(after)).toHaveLength(2);
  expect(generated.steps.map((step) => step.id)).toEqual(baselineStageIds);
  const stageIds = generated.steps.map((step) => step.id);
  await chooseStage(page, customTitle);
  await page.locator(`button.step-part[data-part-id="${side.id}"]`).click();
  // Move the left panel away from the carcass so collision separation permits the edit.
  const newX =
    generated.pieces.find((piece) => piece.id === side.id)!.position[0] - 0.25;
  await page
    .getByRole("spinbutton", { name: "X", exact: true })
    .fill(String(newX));
  await page.getByRole("spinbutton", { name: "X", exact: true }).press("Tab");
  const changed = await draft(
    page,
    (actual) =>
      actual.pieces.find((piece) => piece.id === side.id)?.position[0] ===
        newX && !guideIsCurrent(actual),
  );
  await expect(page.locator(".build-timeline")).toContainText(
    "Your layout changed",
  );
  const regenerated = await generate(page, customTitle);
  expect(regenerated.steps.map((step) => step.id)).toEqual(stageIds);
  const reset = regenerated.steps.find((step) => step.id === carcass.id)!;
  expect(reset.complete).toBe(false);
  expect(reset.title).toBe(customTitle);
  expect(reset.notes.split(before)).toHaveLength(2);
  expect(reset.notes.split(after)).toHaveLength(2);
  expect(regenerated.history.find((item) => item.id === history.id)).toEqual({
    ...history,
    stepId: carcass.id,
  });
  for (const item of changed.history)
    expect(regenerated.history).toContainEqual(item);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: regenerated.name })
    .click();
  const reopened = await draft(
    page,
    (actual) => actual.id === regenerated.id && guideIsCurrent(actual),
  );
  expect(reopened.steps).toEqual(regenerated.steps);
  expect(reopened.partLabels).toEqual(regenerated.partLabels);
  expect(reopened.history).toEqual(regenerated.history);
  const exported = await exportProject(page);
  const imported = await importProject(page, exported);
  expect(imported.steps).toEqual(reopened.steps);
  expect(imported.history).toEqual(reopened.history);
  expect(imported.partLabels).toEqual(reopened.partLabels);
  expect(guideIsCurrent(imported)).toBe(true);
});

test("three storage modules keep nine semantic stages and one active ownership after a physical cut", async ({
  page,
}) => {
  let initial = blank("SYNTHETIC three storage assembly guides");
  initial = applyIdeaPlan(
    initial,
    localIdeaPlan({
      prompt:
        "A kitchenette banquette with three sections, closed storage below and opening seat lids, no back since the wall is the back",
    }),
  );
  initial.name = "SYNTHETIC three storage assembly guides";
  expect(
    initial.ideaBindings.flatMap((binding) => binding.entries),
  ).toHaveLength(3);
  await importProject(page, initial);
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Dry-fit the storage bottom and frame",
    { timeout: 15000 },
  );
  const original = await draft(
      page,
      (actual) => guideIsCurrent(actual) && stages(actual).length === 9,
    ),
    owner = original.ideaBindings[0].entries[0].id;
  for (const entry of original.ideaBindings.flatMap(
    (binding) => binding.entries,
  ))
    expect(
      stages(original)
        .filter((step) => step.generated?.planId === entry.id)
        .map(
          (step) =>
            step.generated?.kind === "assembly-stage" &&
            step.generated.stageKey,
        ),
    ).toEqual(["bottom-frame", "shell", "seat-lid-back"]);
  const shell = stage(original, "shell", owner),
    note = "SYNTHETIC keep the service access panel reachable.";
  await chooseStage(page, shell.title);
  await page
    .getByRole("textbox", { name: "Build instructions", exact: true })
    .fill(`${shell.generated!.notes}\n${note}`);
  const frame = stage(original, "bottom-frame", owner),
    frameIds =
      frame.generated?.kind === "assembly-stage"
        ? frame.generated.memberIds
        : [];
  const board = original.pieces.find(
    (piece) =>
      frameIds.includes(piece.id) &&
      material(piece.material).stockKind === "linear",
  )!;
  await chooseStage(page, frame.title);
  await page.locator(`button.step-part[data-part-id="${board.id}"]`).click();
  const lengthAxis = cuttingAxes(board)[0],
    target = board.size[lengthAxis] - 1.25;
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill(String(target));
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  const cut = await draft(
    page,
    (actual) =>
      actual.pieces.find((piece) => piece.id === board.id)?.size[lengthAxis] ===
        target && actual.pieces.filter((piece) => piece.offcut).length === 1,
  );
  const regenerated = await generate(page, frame.title),
    memberIds = stages(regenerated).flatMap((step) =>
      step.generated?.kind === "assembly-stage" ? step.generated.memberIds : [],
    ),
    activeIds = regenerated.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => piece.id);
  expect(stages(regenerated)).toHaveLength(9);
  expect(regenerated.steps).toHaveLength(11);
  expect([...memberIds].sort()).toEqual([...activeIds].sort());
  expect(new Set(memberIds).size).toBe(memberIds.length);
  expect(
    regenerated.pieces
      .filter((piece) => piece.offcut)
      .every((piece) => !memberIds.includes(piece.id)),
  ).toBe(true);
  expect(stage(regenerated, "shell", owner).notes.split(note)).toHaveLength(2);
  for (const piece of original.pieces)
    expect(partLabel(regenerated, piece.id)).toBe(
      partLabel(original, piece.id),
    );
  for (const item of cut.history)
    expect(regenerated.history).toContainEqual(item);
  expect(
    regenerated.pieces.find((piece) => piece.id === board.id)?.cutStock,
  ).toEqual(cut.pieces.find((piece) => piece.id === board.id)?.cutStock);
  expect(regenerated.pieces.filter((piece) => piece.offcut)).toEqual(
    cut.pieces.filter((piece) => piece.offcut),
  );
  const again = await generate(page, frame.title);
  expect(again.steps.map((step) => step.id)).toEqual(
    regenerated.steps.map((step) => step.id),
  );
  expect(again.steps).toHaveLength(11);
  expect(stage(again, "shell", owner).notes.split(note)).toHaveLength(2);
});

test("phone cuts imported exact 1x6 and 2x6 boards with matching one-board store snapshots", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const definitions = [
    {
      id: "lowes-whitewood-1x6",
      productId: "1001067086",
      lengthFeet: "3.5",
      inches: 42,
    },
    {
      id: "lowes-syp-2x6",
      productId: "1000028789",
      lengthFeet: "4.125",
      inches: 49.5,
    },
  ] as const;
  for (const definition of definitions) {
    const stock = material(definition.id);
    const project = blank(`Exact board ${uid().slice(0, 8)}`);
    const source = part(
      stock.name, stock.id, [...stock.size], [0, stock.size[1] / 2, 0], project.steps[0].id, "Loose parts",
    );
    project.pieces = [source];
    const placed = await importProject(page, project);
    expect(placed.pieces[0].size).toEqual(stock.size);
    expect(stock.placementOnly).toBe(true);
    await page.getByRole("button", { name: "Guide", exact: true }).click();
    await page.getByRole("button", { name: `${partLabel(placed, source.id)} · ${source.name}`, exact: true }).click();
    await page.getByRole("button", { name: "Cut part", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Retained length units", exact: true })
      .selectOption("ft");
    await page
      .getByRole("spinbutton", { name: "Retained length", exact: true })
      .fill(definition.lengthFeet);
    await expect(
      page.getByRole("spinbutton", { name: "Retained width", exact: true }),
    ).toHaveValue("5.5");
    await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
    const cut = await draft(
      page,
      (actual) =>
        actual.pieces.find((piece) => piece.id === source.id)?.size[1] ===
        definition.inches,
    );
    const physical = cut.pieces.filter(
      (piece) => piece.material === definition.id,
    );
    expect(physical).toHaveLength(2);
    expect(physical[0].cutStock?.id).toBe(physical[1].cutStock?.id);
    expect(physical[0].cutStock?.size).toEqual(stock.size);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page
      .getByRole("button", { name: "Record store snapshot", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Snapshot retailer", exact: true })
      .selectOption("lowes");
    await dialog
      .getByRole("combobox", { name: "Modeled material", exact: true })
      .selectOption(definition.id);
    await dialog
      .getByRole("button", {
        name: "Use reviewed product reference",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByLabel("Retailer product number", { exact: true }),
    ).toHaveValue(definition.productId);
    await dialog
      .getByLabel("Product name", { exact: true })
      .fill(`SYNTHETIC QA ${stock.name}`);
    await dialog.getByLabel("Unit price (USD)", { exact: true }).fill("11.25");
    await dialog.getByLabel("Available stock units", { exact: true }).fill("7");
    await dialog.getByLabel("Exact store number", { exact: true }).fill("1841");
    await dialog.getByLabel("Store ZIP code", { exact: true }).fill("84121");
    await dialog
      .getByRole("checkbox", { name: /I matched the product to/ })
      .check();
    await dialog
      .getByRole("button", { name: "Save snapshot", exact: true })
      .click();
    const recorded = await draft(page, (actual) =>
      actual.inventory.some(
        (entry) =>
          entry.material === definition.id &&
          entry.internetNumber === definition.productId,
      ),
    );
    const row = bom(recorded).find((row) => row.id === definition.id)!;
    expect(row.quantity).toBe(1);
    expect(row.packCount).toBe(1);
    expect(row.physicalStockUnits).toBe(1);
    expect(row.verified).toBe(true);
    expect(row.inventory?.internetNumber).toBe(definition.productId);
    expect(row.inventory?.retailer).toBe("lowes");
    await expect(
      page.locator(`.bom-row[data-stock-material="${definition.id}"]`),
    ).toContainText("1 board");
    expect(recorded.ideaBindings).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
