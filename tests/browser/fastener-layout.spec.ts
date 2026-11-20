import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import {
  addFastenerLocation,
  changeFastenerProduct,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";
import { makeShelfPinPlan, saveShelfPinPlan } from "../../src/attachments";
import { addSupply } from "../../src/supplies";

function fixture(name: string) {
  let project = createBuildStudy(
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
  project.name = `${name} ${uid().slice(0, 8)}`;
  const entry = project.ideaBindings[0].entries[0],
    rolePart = (role: string) =>
      project.pieces.find((piece) =>
        project.sections
          .find(
            (section) =>
              section.id ===
              entry.sections.find((row) => row.role === role)!.sectionId,
          )!
          .pieceIds.includes(piece.id),
      )!,
    head = rolePart("side-right"),
    receiver = rolePart("top");
  let plan = addFastenerLocation(
    makeFastenerPlan(project, head.id, receiver.id, {
      name: "SYNTHETIC repeat-layout plan with preserved history",
    }),
  );
  plan.locations[0].entranceLocal = [
    head.size[0] / 2,
    receiver.position[1] - head.position[1],
    -6,
  ];
  plan.locations[0].driveLocal = [-1, 0, 0];
  plan.notes = "EXACT prior user plan notes stay as this prefix.";
  plan.measurements = {
    surfaceToTipDepth: 1.8731,
    pilotDiameter: 0.1037,
    pilotDepth: 1.8169,
    basis:
      "SYNTHETIC historical product measurements; never installation evidence",
    measuredAt: "2026-11-16T12:00:00.000Z",
  };
  project = saveFastenerPlan(project, plan);
  project = saveFastenerPlan(
    project,
    changeFastenerProduct(
      project,
      project.fastenerPlans[0],
      "grk-cabinet-113079",
    ),
  );
  project = saveFastenerPlan(
    project,
    changeFastenerProduct(project, project.fastenerPlans[0], "grk-r4-103101"),
  );
  plan = addFastenerLocation(project.fastenerPlans[0]);
  plan.locations[1] = {
    ...plan.locations[1],
    name: "Existing manual point retained",
    entranceLocal: [
      head.size[0] / 2,
      receiver.position[1] - head.position[1],
      -7.5,
    ],
    driveLocal: [-1, 0, 0],
  };
  project = saveFastenerPlan(project, plan);
  project = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, entry.id, {
      name: "Unrelated shelf targets stay exact",
      shelfRoles: ["shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  project = addSupply(project, "simpson-sd9112r100", 1);
  return project;
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
    await test.info().attach("last-layout-project", {
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
      name: "synthetic-layout.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openPlan(page: Page, planId: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan wood-fastener locations", exact: true })
    .click();
  const panel = page.getByRole("region", {
      name: "Wood fastener plans",
      exact: true,
    }),
    selector = panel.locator(
      `[data-fastener-plan-id='${planId}'] .attachment-plan-select`,
    );
  if ((await selector.getAttribute("aria-expanded")) !== "true")
    await selector.click();
  return panel;
}
async function exportProject(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  if (!path) throw Error("Missing editable layout export");
  const result = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return result;
}
async function setupRow(
  panel: Locator,
  count: string,
  spacing: string,
  basis: string,
) {
  await panel
    .getByRole("button", { name: "Repeat from F001", exact: true })
    .click();
  const layout = panel.locator(".fastener-layout-panel");
  await expect(layout).toHaveAttribute("open", "");
  await layout
    .getByRole("combobox", { name: "Layout face direction", exact: true })
    .selectOption("2");
  await layout
    .getByRole("spinbutton", {
      name: "Layout row count including seed",
      exact: true,
    })
    .fill(count);
  await layout
    .getByRole("spinbutton", { name: "Layout row spacing", exact: true })
    .fill(spacing);
  await layout
    .getByRole("textbox", { name: "Layout basis or note", exact: true })
    .fill(basis);
  return layout;
}
async function viewportCapture(page: Page, target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded();
  const path = test.info().outputPath(name);
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await test.info().attach(name, { path, contentType: "image/png" });
}
async function expectLayoutTools(
  page: Page,
  preview: boolean,
  quickToolsInitially: boolean,
) {
  if (preview) {
    await expect(page.locator(".scene-tools")).toBeHidden();
    await expect(page.locator(".part-quick-tools")).toBeHidden();
    await expect(page.getByTestId("layout-preview-banner")).toContainText(
      "3 new positions",
    );
    await expect(page.locator(".orbit-hint")).toContainText(
      "Drag to orbit · Scroll to zoom",
    );
  } else {
    await expect(page.locator(".scene-tools")).toBeVisible();
    if (quickToolsInitially)
      await expect(page.locator(".part-quick-tools")).toBeVisible();
    else await expect(page.locator(".part-quick-tools")).toBeHidden();
    await expect(page.getByTestId("layout-preview-banner")).toHaveCount(0);
  }
  await expect(page.locator(".view-tools")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fit project", exact: true }),
  ).toBeEnabled();
}
function expectPreserved(actual: Project, original: Project) {
  expect(actual.pieces).toEqual(original.pieces);
  expect(actual.sections).toEqual(original.sections);
  expect(actual.partLabels).toEqual(original.partLabels);
  expect(actual.supplies).toEqual(original.supplies);
  expect(actual.inventory).toEqual(original.inventory);
  expect(actual.supplyInventory).toEqual(original.supplyInventory);
  expect(actual.attachmentPlans).toEqual(original.attachmentPlans);
  expect(actual.lidHingePlans).toEqual(original.lidHingePlans);
  expect(actual.restraintPlans).toEqual(original.restraintPlans);
  expect(actual.fastenerPlans[0].referenceHistory).toEqual(
    original.fastenerPlans[0].referenceHistory,
  );
  expect(actual.fastenerPlans[0].head).toEqual(original.fastenerPlans[0].head);
  expect(actual.fastenerPlans[0].receiver).toEqual(
    original.fastenerPlans[0].receiver,
  );
  expect(actual.fastenerPlans[0].measurements).toEqual(
    original.fastenerPlans[0].measurements,
  );
  expect(
    actual.fastenerPlans[0].notes.startsWith(original.fastenerPlans[0].notes),
  ).toBe(true);
}
async function saveReopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        if (!response.ok()) return false;
        const saved = (await response.json()).project;
        return (
          JSON.stringify({ ...saved, updatedAt: expected.updatedAt }) ===
          JSON.stringify(expected)
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
      JSON.stringify(actual.fastenerPlans) ===
        JSON.stringify(expected.fastenerPlans),
  );
}

test("desktop repeats an unsaved seed only after preview and selection, keeps history and collapses appended F rows until editing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const imported = await load(
      page,
      fixture("SYNTHETIC desktop repeated screws"),
    ),
    plan = imported.fastenerPlans[0],
    panel = await openPlan(page, plan.id),
    seed = panel.locator("details[aria-label='Fastener location F001']"),
    oldManual = panel.locator("details[aria-label='Fastener location F002']");
  const quickToolsInitially = await page
    .locator(".part-quick-tools")
    .isVisible();
  await expectLayoutTools(page, false, quickToolsInitially);
  await expect(seed).toHaveAttribute("open", "");
  await expect(oldManual).not.toHaveAttribute("open", "");
  await seed
    .getByRole("spinbutton", { name: "F001 entry point Z", exact: true })
    .fill("-5.5");
  const layout = await setupRow(
    panel,
    "4",
    "4",
    "SYNTHETIC user-entered row geometry, no fastening recommendation",
  );
  await layout
    .locator("summary")
    .filter({ hasText: "Grid and face margin" })
    .click();
  await expect(
    layout.getByRole("spinbutton", {
      name: "Minimum head-face edge margin",
      exact: true,
    }),
  ).toHaveValue("");
  await layout
    .locator("summary")
    .filter({ hasText: "Grid and face margin" })
    .click();
  await layout
    .getByRole("button", { name: "Preview repeated locations", exact: true })
    .click();
  const preview = layout.getByTestId("fastener-layout-preview");
  await expectLayoutTools(page, true, quickToolsInitially);
  await expect(page.getByTestId("layout-preview-banner")).toContainText(
    "0 selected",
  );
  await page
    .getByTestId("layout-preview-banner")
    .getByRole("button", { name: "Return to layout", exact: true })
    .click();
  await expect(layout.locator("summary").first()).toBeInViewport();
  await expect(preview).toContainText(
    "1 existing + 3 new = 4 layout positions",
  );
  await expect(preview.locator("[data-layout-candidate-id]")).toHaveCount(3);
  await expect(page.getByTestId("fastener-layout-seed-marker")).toHaveCount(1);
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(3);
  await expect(page.getByTestId("fastener-layout-tip-marker")).toHaveCount(0);
  const head = imported.pieces.find((piece) => piece.id === plan.head.pieceId)!,
    seedMarker = page.getByTestId("fastener-layout-seed-marker");
  expect(JSON.parse((await seedMarker.getAttribute("data-position"))!)).toEqual(
    [
      head.position[0] + plan.locations[0].entranceLocal![0],
      head.position[1] + plan.locations[0].entranceLocal![1],
      head.position[2] - 5.5,
    ],
  );
  await expect(seedMarker).toHaveAttribute(
    "data-location-id",
    plan.locations[0].id,
  );
  expect(JSON.parse((await seedMarker.getAttribute("data-drive"))!)).toEqual([
    -1, 0, 0,
  ]);
  const markers = page.getByTestId("fastener-layout-entry-marker");
  for (const [index, z] of [-1.5, 2.5, 6.5].entries()) {
    expect(
      JSON.parse((await markers.nth(index).getAttribute("data-position"))!),
    ).toEqual([
      head.position[0] + plan.locations[0].entranceLocal![0],
      head.position[1] + plan.locations[0].entranceLocal![1],
      head.position[2] + z,
    ]);
    expect(
      JSON.parse((await markers.nth(index).getAttribute("data-drive"))!),
    ).toEqual([-1, 0, 0]);
    await expect(markers.nth(index)).toHaveAttribute("data-selected", "false");
  }
  await viewportCapture(
    page,
    preview.locator("p").first(),
    "desktop-layout-preview.png",
  );
  for (let i = 1; i <= 3; i++)
    await expect(
      preview.getByRole("checkbox", { name: `Select New ${i}`, exact: true }),
    ).not.toBeChecked();
  expect(await exportProject(page)).toEqual(imported);
  await preview
    .getByRole("button", { name: "Cancel layout preview", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-layout-seed-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(2);
  await expectLayoutTools(page, false, quickToolsInitially);
  expect(await exportProject(page)).toEqual(imported);
  await layout
    .getByRole("button", { name: "Preview repeated locations", exact: true })
    .click();
  await preview
    .getByRole("button", { name: "Select 3 geometric candidates", exact: true })
    .click();
  await preview
    .getByRole("button", { name: "Inspect New 2", exact: true })
    .click();
  await expect(
    page.locator(
      "[data-testid='fastener-layout-entry-marker'][data-selected='true']",
    ),
  ).toHaveCount(3);
  await expect(
    page.locator(
      "[data-testid='fastener-layout-entry-marker'][data-focused='true']",
    ),
  ).toHaveCount(1);
  await expectLayoutTools(page, true, quickToolsInitially);
  await expect(page.getByTestId("layout-preview-banner")).toContainText(
    "3 selected",
  );
  await viewportCapture(
    page,
    preview.locator("[data-layout-candidate-id]").nth(1),
    "desktop-layout-selected.png",
  );
  await preview
    .getByRole("button", {
      name: "Add 3 selected locations to draft",
      exact: true,
    })
    .click();
  await expect(layout).toContainText("Added 3 locations to this draft");
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-layout-seed-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(2);
  await expectLayoutTools(page, false, quickToolsInitially);
  await viewportCapture(
    page,
    layout.getByRole("status"),
    "desktop-layout-appended-draft.png",
  );
  await expect(
    panel.locator("details[aria-label^='Fastener location F']"),
  ).toHaveCount(5);
  for (const label of ["F003", "F004", "F005"])
    await expect(
      panel.locator(`details[aria-label='Fastener location ${label}']`),
    ).not.toHaveAttribute("open", "");
  expect(await exportProject(page)).toEqual(imported);
  // Transient layout validity must not become validity of the working W plan.
  await layout
    .getByRole("spinbutton", {
      name: "Layout row count including seed",
      exact: true,
    })
    .fill("0");
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const saved = await draft(
    page,
    (actual) => actual.fastenerPlans[0].locations.length === 5,
  );
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(5);
  expectPreserved(saved, imported);
  expect(saved.fastenerPlans[0].locations[0]).toEqual({
    ...plan.locations[0],
    entranceLocal: [
      plan.locations[0].entranceLocal![0],
      plan.locations[0].entranceLocal![1],
      -5.5,
    ],
  });
  expect(saved.fastenerPlans[0].locations[1]).toEqual(plan.locations[1]);
  expect(
    saved.fastenerPlans[0].locations
      .slice(2)
      .map((point) => point.entranceLocal![2]),
  ).toEqual([-1.5, 2.5, 6.5]);
  expect(saved.fastenerPlans[0].locations.map((point) => point.label)).toEqual([
    "F001",
    "F002",
    "F003",
    "F004",
    "F005",
  ]);
  expect(saved.fastenerPlans[0].nextLocationNumber).toBe(6);
  expect(fastenerReviews(saved)[0].activePointCount).toBe(5);
  const second = panel.locator("details[aria-label='Fastener location F003']");
  await expect(second).not.toHaveAttribute("open", "");
  await second.locator("summary").first().click();
  await expect(
    second.getByRole("spinbutton", { name: "F003 entry point Z", exact: true }),
  ).toHaveValue("-1.5");
  const reopened = await saveReopen(page, saved);
  expect(reopened.fastenerPlans).toEqual(saved.fastenerPlans);
  expectPreserved(reopened, imported);
  expect(errors).toEqual([]);
});

test("phone reviews a mixed repeat, invalidates it on input edits and saves only the chosen precise candidate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const imported = await load(page, fixture("SYNTHETIC phone repeated subset")),
    plan = imported.fastenerPlans[0],
    panel = await openPlan(page, plan.id),
    layout = await setupRow(
      panel,
      "4",
      "7",
      "SYNTHETIC subset chosen by user; unknown depths remain unknown",
    );
  const quickToolsInitially = await page
    .locator(".part-quick-tools")
    .isVisible();
  await layout
    .getByRole("combobox", { name: "Layout row spacing units", exact: true })
    .selectOption("ft");
  await layout
    .getByRole("spinbutton", { name: "Layout row spacing", exact: true })
    .fill("0.5833333333333334");
  await layout
    .locator("summary")
    .filter({ hasText: "Grid and face margin" })
    .click();
  await layout
    .getByRole("combobox", {
      name: "Minimum head-face edge margin units",
      exact: true,
    })
    .selectOption("ft");
  await layout
    .getByRole("spinbutton", {
      name: "Minimum head-face edge margin",
      exact: true,
    })
    .fill("0.010416666666666666");
  await layout
    .getByRole("button", { name: "Preview repeated locations", exact: true })
    .click();
  const preview = layout.getByTestId("fastener-layout-preview");
  await expectLayoutTools(page, true, quickToolsInitially);
  await expect(preview.locator("[data-layout-eligible='true']")).toHaveCount(2);
  await expect(preview.locator("[data-layout-eligible='false']")).toHaveCount(
    1,
  );
  await expect(
    preview.getByRole("checkbox", { name: "Select New 3", exact: true }),
  ).toBeDisabled();
  await viewportCapture(
    page,
    preview.locator("p").first(),
    "phone-layout-preview.png",
  );
  await viewportCapture(
    page,
    preview.getByRole("checkbox", { name: "Select New 1", exact: true }),
    "phone-layout-candidate-rows.png",
  );
  await preview
    .getByRole("checkbox", { name: "Select New 1", exact: true })
    .check();
  await layout
    .getByRole("spinbutton", { name: "Layout row spacing", exact: true })
    .fill("0.5");
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(0);
  expect(await exportProject(page)).toEqual(imported);
  await layout
    .getByRole("spinbutton", { name: "Layout row spacing", exact: true })
    .fill("0.5833333333333334");
  await layout
    .getByRole("button", { name: "Preview repeated locations", exact: true })
    .click();
  await preview
    .getByRole("checkbox", { name: "Select New 1", exact: true })
    .check();
  await preview
    .locator("summary")
    .filter({ hasText: "Software layout note for selected locations" })
    .click();
  const selectedNote = (
    await preview.getByTestId("selected-layout-note").innerText()
  ).trim();
  await preview
    .getByRole("button", { name: "Inspect New 1", exact: true })
    .click();
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(3);
  await expect(
    page.locator(
      "[data-testid='fastener-layout-entry-marker'][data-focused='true']",
    ),
  ).toHaveAttribute("data-selected", "true");
  await preview
    .getByRole("button", { name: "Inspect layout in 3D", exact: true })
    .click();
  await expect(page.locator(".canvas-wrap")).toBeInViewport({ ratio: 0.9 });
  const imagePath = test.info().outputPath("phone-layout-selected-3d.png");
  await page.screenshot({
    path: imagePath,
    fullPage: false,
    animations: "disabled",
  });
  await test.info().attach("phone-layout-selected-3d.png", {
    path: imagePath,
    contentType: "image/png",
  });
  await expect(page.getByTestId("layout-preview-banner")).toContainText(
    "1 selected",
  );
  await page
    .getByTestId("layout-preview-banner")
    .getByRole("button", { name: "Return to layout", exact: true })
    .click();
  await expect(layout.locator("summary").first()).toBeInViewport();
  await preview
    .getByRole("button", {
      name: "Add 1 selected location to draft",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-layout-seed-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(2);
  const backToWorkspace = page.getByRole("button", { name: "Back to workspace", exact: true });
  await backToWorkspace.click();
  await expectLayoutTools(page, false, quickToolsInitially);
  await page.getByRole("button", { name: /^(Expand|Return to) inspector$/ }).click();
  await viewportCapture(
    page,
    layout.getByRole("status"),
    "phone-layout-appended-draft.png",
  );
  const point = panel.locator("details[aria-label='Fastener location F003']");
  await expect(point).not.toHaveAttribute("open", "");
  await point.locator("summary").first().click();
  await point
    .getByRole("combobox", { name: "F003 entry point units", exact: true })
    .selectOption("ft");
  await point
    .getByRole("spinbutton", { name: "F003 entry point Z", exact: true })
    .fill("0.125");
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const saved = await draft(
    page,
    (actual) => actual.fastenerPlans[0].locations.length === 3,
  );
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(3);
  expectPreserved(saved, imported);
  expect(saved.fastenerPlans[0].locations.slice(0, 2)).toEqual(plan.locations);
  expect(saved.fastenerPlans[0].locations[2].entranceLocal).toEqual([
    plan.locations[0].entranceLocal![0],
    plan.locations[0].entranceLocal![1],
    1.5,
  ]);
  expect(saved.fastenerPlans[0].locations[2].driveLocal).toEqual([-1, 0, 0]);
  expect(saved.fastenerPlans[0].nextLocationNumber).toBe(6);
  expect(saved.fastenerPlans[0].notes.endsWith(selectedNote)).toBe(true);
  expect(saved.fastenerPlans[0].measurements.surfaceToTipDepth).toBeNull();
  expect(fastenerReviews(saved)[0].activePointCount).toBe(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await backToWorkspace.click();
  const reopened = await saveReopen(page, saved);
  expectPreserved(reopened, imported);
  expect(reopened.fastenerPlans).toEqual(saved.fastenerPlans);
  expect(errors).toEqual([]);
});
