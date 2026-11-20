import { expect, test, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  blank,
  part,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { ensurePartLabels } from "../../src/partLabels";
import { generateBuildGuide } from "../../src/guide";
import {
  addHingeLocation,
  allocateHingeStock,
  lidHingeReviews,
  makeLidHingePlan,
  saveHingeStockSource,
  saveLidHingePlan,
} from "../../src/hinges";
import {
  makeHingeStockCut,
  makeHingeStockSource,
  reviewHingeStock,
} from "../../src/hingeStock";
import { addSupply } from "../../src/supplies";
import { inverseRotation, rotate } from "../../src/spatial";

const basis =
  "SYNTHETIC software test datums, not manufacturer geometry or measurements of purchased hardware.";
const at = "2026-11-16T18:00:00.000Z";
function baseFixture() {
  const idea = localIdeaPlan({
    prompt:
      "One-section storage banquette 24 inches wide,24 inches deep,18 inches seat height,opening lid and no back",
  });
  idea.modules[0].panelMaterial = "plytanium-703";
  let project = applyIdeaPlan(
    blank(`SYNTHETIC hinge UI ${uid().slice(0, 8)}`),
    idea,
  );
  project.notes =
    "SYNTHETIC hinge editor acceptance. Preserve actual .703-in panels, cuts, manual purchases and this custom note.";
  project = ensurePartLabels(generateBuildGuide(project));
  const section = project.sections[0],
    moving = project.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
    )!,
    fixed = project.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) &&
        piece.designRole === "storage-rear",
    )!;
  const toLocal = (world: V3, piece: typeof moving) =>
    rotate(
      world.map((n, i) => n - piece.position[i]) as V3,
      inverseRotation(piece.rotation),
    );
  const a: V3 = [moving.position[0] - 11.375, moving.position[1] - 0.2, -12.1],
    b: V3 = [moving.position[0] + 11.375, moving.position[1] - 0.2, -12.1];
  const axis = {
    movingA: toLocal(a, moving),
    movingB: toLocal(b, moving),
    fixedA: toLocal(a, fixed),
    fixedB: toLocal(b, fixed),
    basis,
    measuredAt: at,
  };
  return { project, section, moving, fixed, axis };
}
function measuredFixture() {
  const fixture = baseFixture();
  let { project } = fixture;
  const source = makeHingeStockSource(),
    cut = makeHingeStockCut();
  Object.assign(cut, { position: 22.75, kerf: 0.0625, basis, measuredAt: at });
  Object.assign(source, {
    usableLength: 48,
    basis,
    measuredAt: at,
    cuts: [cut],
  });
  project = saveHingeStockSource(project, source);
  let plan = makeLidHingePlan(
    project,
    fixture.section.id,
    fixture.moving.id,
    fixture.fixed.id,
  );
  plan = allocateHingeStock(
    project,
    plan,
    source.id,
    reviewHingeStock(source).segments[0].id,
  );
  plan.axis = fixture.axis;
  plan = addHingeLocation(plan, "moving");
  plan = addHingeLocation(plan, "fixed");
  plan.locations[0].entranceLocal = [-8, 0, -12];
  plan.locations[0].driveLocal = [0, 0, 1];
  plan.locations[1].entranceLocal = [-8, 0, -fixture.fixed.size[2] / 2];
  plan.locations[1].driveLocal = [0, 0, 1];
  for (const location of plan.locations)
    location.measurements = {
      surfaceToTipDepth: 0.4973,
      pilotDiameter: 0.0619,
      pilotDepth: 0.3571,
      basis,
      measuredAt: at,
    };
  plan.hardware = {
    description: "SYNTHETIC observed supplied screw",
    drive: "SYNTHETIC cross drive",
    suppliedCount: 4,
    included: true,
    leafThickness: null,
    basis,
    measuredAt: at,
  };
  project = saveLidHingePlan(project, plan);
  project = addSupply(
    project,
    "everbilt-29256-continuous-hinge",
    1,
    "SYNTHETIC planned hinge source",
  );
  const replacement = part(
    fixture.fixed.name,
    fixture.fixed.material,
    [...fixture.fixed.size],
    [60, fixture.fixed.position[1], fixture.fixed.position[2]],
    project.steps[0].id,
    "SYNTHETIC loose replacement",
  );
  project = ensurePartLabels({
    ...project,
    pieces: [...project.pieces, replacement],
  });
  // Genuine legacy unknown, not a reconstructed baseline.
  project.lidHingePlans[0].fixed.baseline = null;
  return {
    ...fixture,
    project,
    source,
    plan: project.lidHingePlans[0],
    replacement,
  };
}
async function draft(page: Page, matches: (project: Project) => boolean) {
  let last: Project | null = null;
  try {
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(
            (key) => localStorage.getItem(key),
            CURRENT_DRAFT_KEY,
          );
          last = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
          return !!last && matches(last);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-hinge-project", {
      body: Buffer.from(JSON.stringify(last, null, 2)),
      contentType: "application/json",
    });
    throw error;
  }
  return last!;
}
async function load(page: Page, project: Project) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "synthetic-hinge.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openPanel(page: Page, sectionId: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(sectionId);
  await page
    .getByRole("button", { name: "Measured hinges", exact: true })
    .click();
  return page.getByRole("region", { name: "Measured lid hinges", exact: true });
}
async function openDetails(parent: Locator, name: string) {
  const summary = parent.locator("summary").filter({ hasText: name }).first();
  const details = summary.locator("..");
  const isOpen = await details.evaluate(
    (element) => (element as HTMLDetailsElement).open,
  );
  if (!isOpen) await summary.click();
  return details;
}
async function vector(parent: Locator, label: string, value: V3) {
  for (const [index, axis] of ["X", "Y", "Z"].entries())
    await parent
      .getByRole("spinbutton", { name: `${label} ${axis}`, exact: true })
      .fill(String(value[index]));
}
async function datum(parent: Locator, label: string) {
  await parent
    .getByRole("textbox", { name: `${label} basis`, exact: true })
    .fill(basis);
  await parent
    .getByLabel(`${label} date`, { exact: true })
    .fill("2026-11-16T10:00");
}
async function editable(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  if (!path) throw Error("No hinge editable export");
  const project = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return project;
}
async function saveReopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        return (
          response.ok() &&
          JSON.stringify((await response.json()).project.lidHingePlans) ===
            JSON.stringify(expected.lidHingePlans)
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: expected.name })
    .click();
  return draft(
    page,
    (actual) =>
      actual.id === expected.id &&
      JSON.stringify(actual.lidHingePlans) ===
        JSON.stringify(expected.lidHingePlans),
  );
}

test("desktop records explicit stock, paired axis and transferred holes before selecting measured lid motion", async ({
  page,
}) => {
  const f = baseFixture(),
    imported = await load(page, f.project),
    panel = await openPanel(page, f.section.id);
  await expect(
    panel.getByRole("combobox", { name: "Hinge moving member", exact: true }),
  ).toHaveValue(f.moving.id);
  await expect(
    panel.getByRole("combobox", { name: "Hinge fixed member", exact: true }),
  ).toHaveValue("");
  await panel
    .getByRole("combobox", { name: "Hinge fixed member", exact: true })
    .selectOption(f.fixed.id);
  await panel
    .getByRole("button", { name: "Create hinge plan", exact: true })
    .click();
  const initial = await draft(page, (p) => p.lidHingePlans.length === 1);
  expect(initial.lidHingePlans[0].locations).toEqual([]);
  expect(initial.lidHingePlans[0].axis.movingA).toBeNull();
  expect(initial.supplies).toEqual(imported.supplies);
  expect(initial.pieces).toEqual(imported.pieces);
  await expect(page.getByTestId("hinge-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("hinge-tip-marker")).toHaveCount(0);
  await openDetails(panel, "Physical hinge sources");
  await panel
    .getByRole("button", { name: "Add hinge source", exact: true })
    .click();
  await draft(page, (p) => p.hingeStockSources.length === 1);
  const sourceDetails = await openDetails(panel, "Source 1 · usable");
  await expect(
    sourceDetails.getByRole("spinbutton", {
      name: "Usable hinge length (in)",
      exact: true,
    }),
  ).toHaveValue("");
  await sourceDetails
    .getByRole("spinbutton", { name: "Usable hinge length (in)", exact: true })
    .fill("48");
  await datum(sourceDetails, "Stock measurement");
  await sourceDetails
    .getByRole("button", { name: "Add hinge cut", exact: true })
    .click();
  await expect(
    sourceDetails.getByRole("spinbutton", {
      name: "Cut 1 metal kerf (in)",
      exact: true,
    }),
  ).toHaveValue("");
  await sourceDetails
    .getByRole("spinbutton", { name: "Cut 1 kerf start (in)", exact: true })
    .fill("22.75");
  await sourceDetails
    .getByRole("spinbutton", { name: "Cut 1 metal kerf (in)", exact: true })
    .fill("0.0625");
  await datum(sourceDetails, "Cut 1 measurement");
  await sourceDetails
    .getByRole("button", { name: "Save hinge source", exact: true })
    .click();
  const withSource = await draft(
      page,
      (p) => p.hingeStockSources[0]?.cuts[0]?.kerf === 0.0625,
    ),
    source = withSource.hingeStockSources[0];
  const stockReview = reviewHingeStock(source);
  expect(stockReview.segments.map((s) => s.length)).toEqual([22.75, 25.1875]);
  await openDetails(panel, "1. Allocate measured hinge stock");
  await panel
    .getByRole("combobox", { name: "Hinge allocation source", exact: true })
    .selectOption(source.id);
  await panel
    .getByRole("combobox", { name: "Hinge allocation segment", exact: true })
    .selectOption(stockReview.segments[0].id);
  await panel
    .getByRole("button", { name: "Use retained segment in draft", exact: true })
    .click();
  await openDetails(panel, "2. Measure the closed hinge axis");
  for (const key of ["movingA", "movingB", "fixedA", "fixedB"] as const)
    await vector(panel, `Axis ${key}`, f.axis[key]);
  await datum(panel, "Axis measurement");
  await panel
    .getByRole("button", { name: "Add moving-leaf hole", exact: true })
    .click();
  const hole = panel
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "H001/L001" }) })
    .first();
  await vector(hole, "L001 entrance", [-8, 0, -12]);
  await hole
    .getByRole("button", { name: "L001 inward drive +Z", exact: true })
    .click();
  await expect(
    hole.getByRole("spinbutton", {
      name: "L001 seated wood-surface-to-tip depth (in)",
      exact: true,
    }),
  ).toHaveValue("");
  await hole
    .getByRole("spinbutton", {
      name: "L001 seated wood-surface-to-tip depth (in)",
      exact: true,
    })
    .fill("0.5");
  await hole
    .getByRole("spinbutton", { name: "L001 pilot diameter (in)", exact: true })
    .fill("0.0625");
  await hole
    .getByRole("spinbutton", {
      name: "L001 deepest pilot-drill-tip depth (in)",
      exact: true,
    })
    .fill("0.35");
  await datum(hole, "L001 measurement");
  await panel
    .getByRole("button", { name: "Save hinge plan", exact: true })
    .click();
  const measured = await draft(
    page,
    (p) => p.lidHingePlans[0]?.locations[0]?.measurements.pilotDepth === 0.35,
  );
  const reviewed = lidHingeReviews(measured)[0];
  expect(reviewed.resolvedAxis?.length).toBeCloseTo(22.75, 8);
  expect(reviewed.locations[0].state).toBe("geometry-reviewed");
  expect(reviewed.state).toBe("needs-measurements");
  await expect(page.getByTestId("hinge-axis-marker")).toHaveAttribute(
    "data-length",
    "22.75",
  );
  await expect(page.getByTestId("hinge-axis-marker")).toHaveAttribute(
    "data-pivot",
    JSON.stringify(reviewed.resolvedAxis!.pivot),
  );
  await expect(page.getByTestId("hinge-entry-marker")).toHaveAttribute(
    "data-label",
    "H001/L001",
  );
  await expect(page.getByTestId("hinge-entry-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify(reviewed.locations[0].entranceWorld),
  );
  await expect(page.getByTestId("hinge-tip-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify(reviewed.locations[0].tipWorld),
  );
  await expect(page.getByTestId("hinge-pilot-tip-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify(reviewed.locations[0].pilotTipWorld),
  );
  await panel
    .getByRole("button", {
      name: "Use measured axis for this lid",
      exact: true,
    })
    .click();
  const selected = await draft(
    page,
    (p) => p.lidHingePlans[0]?.selectedForMotion,
  );
  await openDetails(panel, "Hinge purchase comparison");
  await panel
    .getByRole("button", { name: "Add missing hinge units", exact: true })
    .click();
  const purchased = await draft(page, (p) =>
    p.supplies.some(
      (s) =>
        s.productId === "everbilt-29256-continuous-hinge" && s.quantity === 1,
    ),
  );
  expect(purchased.pieces).toEqual(imported.pieces);
  expect(purchased.lidHingePlans).toEqual(selected.lidHingePlans);
  await expect(
    panel.getByRole("button", { name: "Add missing hinge units", exact: true }),
  ).toBeDisabled();
  await expect(panel.getByText(/Reusable unallocated remnant/)).toBeVisible();
  const beforeNoop = await editable(page);
  await openDetails(panel, "Refresh or replace actual members");
  await panel
    .getByRole("button", { name: "Review same member IDs", exact: true })
    .click();
  await expect(
    panel.getByText("References are current; no measurements changed.", {
      exact: true,
    }),
  ).toBeVisible();
  const exported = await editable(page);
  expect(exported).toEqual(beforeNoop);
  expect(exported.lidHingePlans).toEqual(purchased.lidHingePlans);
  expect(exported.hingeStockSources).toEqual(purchased.hingeStockSources);
  const openCheckbox = page.getByRole("checkbox", {
    name: "Preview lid open",
    exact: true,
  });
  await openCheckbox.check();
  await draft(
    page,
    (p) =>
      !!p.sections[0].recipe?.lidOpen &&
      p.sections[0].recordedLidMotion?.planId === measured.lidHingePlans[0].id,
  );
  await expect(page.getByTestId("hinge-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("hinge-axis-marker")).toHaveCount(0);
  await expect(
    panel.getByText(
      "Close the saved lid to inspect mounting datums in 3D. Coordinates refer to the closed assembly.",
      { exact: true },
    ),
  ).toBeVisible();
  await openCheckbox.uncheck();
  const closed = await draft(
    page,
    (p) => !p.sections[0].recipe?.lidOpen && !p.sections[0].recordedLidMotion,
  );
  const returnedLid = closed.pieces.find((piece) => piece.id === f.moving.id)!;
  for (let axis = 0; axis < 3; axis++)
    expect(returnedLid.position[axis]).toBeCloseTo(f.moving.position[axis], 8);
  expect(closed.pieces.filter((piece) => piece.id !== f.moving.id)).toEqual(
    imported.pieces.filter((piece) => piece.id !== f.moving.id),
  );
  expect(closed.lidHingePlans).toEqual(purchased.lidHingePlans);
  await expect(page.getByTestId("hinge-entry-marker")).toHaveCount(1);
  const reopened = await saveReopen(page, closed);
  expect(reopened.hingeStockSources).toEqual(purchased.hingeStockSources);
  expect(reopened.supplies).toEqual(purchased.supplies);
});

test("phone explicitly maps same-name actual receiver IDs, clears current datums and preserves exact historical holes and purchases", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = measuredFixture(),
    imported = await load(page, f.project),
    panel = await openPanel(page, f.section.id);
  const mapping = await openDetails(panel, "Refresh or replace actual members");
  await mapping
    .getByRole("combobox", {
      name: "Replacement hinge moving member",
      exact: true,
    })
    .selectOption(f.moving.id);
  await mapping
    .getByRole("combobox", {
      name: "Replacement hinge fixed member",
      exact: true,
    })
    .selectOption(f.replacement.id);
  await expect(
    mapping.getByRole("combobox", {
      name: "Hinge replacement coordinate mode",
      exact: true,
    }),
  ).toHaveValue("clear");
  await mapping
    .getByRole("textbox", {
      name: "Hinge replacement review basis",
      exact: true,
    })
    .fill(
      "SYNTHETIC explicit same-name ID replacement; keep old measurements only as history.",
    );
  await mapping
    .getByRole("button", {
      name: "Preview hinge member replacement",
      exact: true,
    })
    .click();
  await expect(panel.getByTestId("hinge-remap-preview")).toContainText(
    "Historical material, dimensions and source baseline unknown",
  );
  await mapping
    .getByRole("button", { name: "Cancel hinge replacement", exact: true })
    .click();
  expect((await editable(page)).lidHingePlans).toEqual(imported.lidHingePlans);
  await mapping
    .getByRole("button", {
      name: "Preview hinge member replacement",
      exact: true,
    })
    .click();
  await mapping
    .getByRole("button", {
      name: "Apply hinge member replacement",
      exact: true,
    })
    .click();
  const changed = await draft(
      page,
      (p) => p.lidHingePlans[0]?.fixed.pieceId === f.replacement.id,
    ),
    plan = changed.lidHingePlans[0];
  expect(plan.id).toBe(f.plan.id);
  expect(plan.label).toBe("H001");
  expect(plan.locations.map((l) => l.label)).toEqual(["L001", "L002"]);
  expect(
    plan.locations.every(
      (l) =>
        l.entranceLocal === null &&
        l.driveLocal === null &&
        l.measurements.surfaceToTipDepth === null &&
        l.measurements.pilotDepth === null,
    ),
  ).toBe(true);
  expect(plan.axis.movingA).toBeNull();
  expect(plan.axis.fixedA).toBeNull();
  expect(plan.referenceHistory.at(-1)?.previous.locations).toEqual(
    f.plan.locations,
  );
  expect(plan.fixed.baseline?.size).toEqual(f.replacement.size);
  expect(changed.pieces).toEqual(imported.pieces);
  expect(changed.supplies).toEqual(imported.supplies);
  expect(changed.hingeStockSources).toEqual(imported.hingeStockSources);
  await expect(page.getByTestId("hinge-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("hinge-tip-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await draft(
    page,
    (p) => p.lidHingePlans[0]?.fixed.pieceId === f.fixed.id,
  );
  expect(undone.lidHingePlans[0].locations).toEqual(f.plan.locations);
  expect(undone.lidHingePlans[0].referenceHistory).toEqual(
    plan.referenceHistory,
  );
  // Undo clears selection; explicitly inspect the same actual section again.
  await openPanel(page, f.section.id);
  await expect(
    page.getByRole("combobox", { name: "Current section", exact: true }),
  ).toHaveValue(f.section.id);
  await expect(page.getByTestId("hinge-entry-marker")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await draft(
    page,
    (p) => p.lidHingePlans[0]?.fixed.pieceId === f.replacement.id,
  );
  // Redo also clears selection; prove missing datums in an active section.
  await openPanel(page, f.section.id);
  await expect(
    page.getByRole("combobox", { name: "Current section", exact: true }),
  ).toHaveValue(f.section.id);
  await expect(page.getByTestId("hinge-entry-marker")).toHaveCount(0);
  const exported = await editable(page);
  expect(exported.lidHingePlans).toEqual(changed.lidHingePlans);
  const reopened = await saveReopen(page, changed);
  expect(reopened.lidHingePlans).toEqual(changed.lidHingePlans);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
