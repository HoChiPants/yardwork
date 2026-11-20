import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import {
  part,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { bom } from "../../src/engine";
import { clipBox } from "../../src/cutProfiles";
import { rotate } from "../../src/spatial";
import { ensurePartLabels, partLabel } from "../../src/partLabels";
import {
  commitFittedStock,
  fittedStockFaces,
  previewFittedStock,
} from "../../src/fittedStock";
import { generateBuildGuide, guideIsCurrent } from "../../src/guide";
import {
  guidePlacementIssues,
  guidePlacementTargets,
} from "../../src/guidePlacement";

async function draft(
  page: Page,
  predicate: (project: Project) => boolean,
): Promise<Project> {
  let current: Project | null = null;
  try {
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(
            (key) => localStorage.getItem(key),
            CURRENT_DRAFT_KEY,
          );
          current = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
          return !!current && predicate(current);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test
      .info()
      .attach("last-construction-project", {
        body: Buffer.from(JSON.stringify(current, null, 2)),
        contentType: "application/json",
      });
    throw error;
  }
  return current!;
}

async function importProject(page: Page, project: Project) {
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
      name: "synthetic-construction-flow.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(
    page,
    (actual) =>
      actual.id !== project.id &&
      actual.name.startsWith(project.name) &&
      actual.pieces.length === project.pieces.length &&
      project.pieces.every((piece) =>
        actual.pieces.some((p) => p.id === piece.id),
      ),
  );
}

async function exportProject(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const project = projectSchema.parse(
    JSON.parse(await readFile(path!, "utf8")),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return project;
}

async function saveAndReopen(page: Page, expected: Project) {
  const saving = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith(`/api/projects/${expected.id}`),
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const response = await saving;
  expect(response.status()).toBe(200);
  const saved = projectSchema.parse((await response.json()).project);
  expect({ ...saved, updatedAt: expected.updatedAt }).toEqual(expected);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: saved.name })
    .click();
  const reopened = await draft(
    page,
    (actual) =>
      actual.id === saved.id &&
      JSON.stringify(actual.pieces) === JSON.stringify(saved.pieces),
  );
  expect(reopened).toEqual(saved);
  return reopened;
}

async function banquette() {
  const project = projectSchema.parse(
    JSON.parse(
      await readFile(
        "public/examples/builds/storage-banquette.yardwork.json",
        "utf8",
      ),
    ),
  );
  project.name = `SYNTHETIC construction flow ${uid().slice(0, 8)}`;
  const section = project.sections.find((s) => s.recipe?.storage)!;
  const legs = project.pieces.filter(
    (piece) =>
      section.pieceIds.includes(piece.id) && piece.designRole === "leg",
  );
  const front = Math.max(...legs.map((piece) => piece.position[2]));
  const pair = legs
    .filter((piece) => Math.abs(piece.position[2] - front) < 1e-8)
    .sort((a, b) => a.position[0] - b.position[0]);
  const first = pair[0],
    second = pair[1];
  const firstFace = fittedStockFaces(project, first.id).find(
    (face) => face.normalLocal[0] === 1,
  )!;
  const secondFace = fittedStockFaces(project, second.id).find(
    (face) => face.normalLocal[0] === -1,
  )!;
  return {
    project,
    sectionId: section.id,
    first,
    second,
    firstFace,
    secondFace,
  };
}

async function fittedFixture() {
  const setup = await banquette(),
    target = guidePlacementTargets(setup.project).find(
      (row) => row.stageKey === "bottom-frame",
    )!;
  const preview = previewFittedStock(setup.project, {
    first: setup.firstFace.ref,
    second: setup.secondFace.ref,
    datumLocal: [
      setup.firstFace.centerLocal[0],
      0,
      setup.firstFace.centerLocal[2],
    ],
    material: "hd-pine-1x4",
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: setup.sectionId,
    stepId: setup.first.stepId,
    name: "SYNTHETIC fitted blocking",
    guidePlacement: { ownerId: target.ownerId, stageKey: target.stageKey },
  });
  return {
    project: generateBuildGuide(
      commitFittedStock(setup.project, preview.spec, preview),
    ),
    blockId: preview.blockId,
    offcutId: preview.offcutIds[0],
  };
}

function assemblyStep(project: Project, ownerId: string, key: string) {
  const step = project.steps.find(
    (s) =>
      s.generated?.kind === "assembly-stage" &&
      s.generated.planId === ownerId &&
      s.generated.stageKey === key,
  );
  if (!step) throw Error(`Missing actual ${key} stage for ${ownerId}`);
  return step;
}
async function openStep(page: Page, title: string) {
  await page
    .locator(".step-track")
    .getByRole("button")
    .filter({ hasText: title })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Step title", exact: true }),
  ).toHaveValue(title);
}
async function inspectFromGuide(page: Page, project: Project, pieceId: string) {
  const piece = project.pieces.find((p) => p.id === pieceId)!;
  await openStep(page, project.steps.find((s) => s.id === piece.stepId)!.title);
  await page.locator(`button.step-part[data-part-id="${pieceId}"]`).click();
  await expect(
    page.getByRole("textbox", { name: "Part name", exact: true }),
  ).toHaveValue(piece.name);
}
async function regenerate(page: Page) {
  await page
    .getByRole("button", {
      name: /^(?:Generate build guide|Regenerate guide)$/,
    })
    .click();
  return draft(page, guideIsCurrent);
}

type WorkshopCamera = {
  position: V3;
  projectionMatrix: number[];
  matrixWorldInverse: number[];
  viewport: { width: number; height: number };
  settled: boolean;
  units: "feet";
};
async function assertShownAndFramed(
  page: Page,
  project: Project,
  expected: Piece[],
) {
  const canvas = page.locator("canvas");
  let diagnostic: unknown;
  try {
    await expect
      .poll(
        async () => {
          const [idsRaw, cameraRaw] = await Promise.all([
            canvas.getAttribute("data-rendered-part-ids"),
            canvas.getAttribute("data-workshop-camera"),
          ]);
          if (!idsRaw || !cameraRaw) return false;
          const ids = JSON.parse(idsRaw) as string[],
            camera = JSON.parse(cameraRaw) as WorkshopCamera;
          const expectedIds = expected.map((piece) => piece.id).sort();
          if (
            JSON.stringify([...ids].sort()) !== JSON.stringify(expectedIds) ||
            !camera.settled
          )
            return false;
          const projection = new Matrix4().fromArray(camera.projectionMatrix),
            inverse = new Matrix4().fromArray(camera.matrixWorldInverse);
          const vertices = expected.flatMap((piece) =>
            clipBox(piece.size, piece.cutPlanes).vertices.map((local) => {
              const turned = rotate(local, piece.rotation);
              return new Vector3(
                ...(turned.map(
                  (value, axis) => (value + piece.position[axis]) / 12,
                ) as V3),
              )
                .applyMatrix4(inverse)
                .applyMatrix4(projection);
            }),
          );
          const extents = {
            min: ["x", "y", "z"].map((axis) =>
              Math.min(...vertices.map((v) => v[axis as "x" | "y" | "z"])),
            ),
            max: ["x", "y", "z"].map((axis) =>
              Math.max(...vertices.map((v) => v[axis as "x" | "y" | "z"])),
            ),
          };
          diagnostic = { projectId: project.id, ids, camera, extents };
          return (
            camera.units === "feet" &&
            camera.viewport.width > 0 &&
            camera.viewport.height > 0 &&
            vertices.every(
              (v) =>
                Math.abs(v.x) <= 0.99 &&
                Math.abs(v.y) <= 0.99 &&
                v.z > -1 &&
                v.z < 1,
            )
          );
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test
      .info()
      .attach("actual-stock-camera-and-projected-bounds", {
        body: Buffer.from(JSON.stringify(diagnostic, null, 2)),
        contentType: "application/json",
      });
    throw error;
  }
}

async function openFit(page: Page) {
  await page.getByRole("button", { name: /^Checks(?:\s+\d+)?$/ }).click();
  await page
    .getByRole("button", { name: "Fit stock between faces", exact: true })
    .click();
  return page.getByRole("region", {
    name: "Fit stock between faces",
    exact: true,
  });
}
async function configureFit(
  panel: Locator,
  setup: Awaited<ReturnType<typeof banquette>>,
) {
  for (const [which, piece, face] of [
    ["first", setup.first, setup.firstFace],
    ["second", setup.second, setup.secondFace],
  ] as const) {
    await panel
      .getByRole("combobox", { name: `Fitted ${which} member`, exact: true })
      .selectOption(piece.id);
    await panel
      .getByRole("combobox", { name: `Fitted ${which} face`, exact: true })
      .selectOption({ label: face.label });
  }
  await panel
    .getByRole("button", { name: "Use face center", exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "Fitted datum Y", exact: true })
    .fill("0");
  await panel
    .getByRole("combobox", { name: "Fitted stock material", exact: true })
    .selectOption("hd-pine-1x4");
  await panel
    .getByRole("button", {
      name: "Use exact modeled span · zero end clearances",
      exact: true,
    })
    .click();
  await panel
    .getByRole("combobox", { name: "Fitted destination section", exact: true })
    .selectOption(setup.sectionId);
}
async function expectResultsInView(page: Page) {
  const results = page.getByRole("region", {
    name: "Fitted stock result",
    exact: true,
  });
  await expect(results).toBeFocused();
  for (const name of [
    "Add fitted block",
    "Cancel",
    "Inspect fitted stock in 3D",
  ]) {
    const button = results.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toBeInViewport();
  }
  return results;
}

test("assembly hides real banquette remnants, deliberately reveals them from the guide, and fits actual stock without editing any project facts", async ({
  page,
}) => {
  const setup = await fittedFixture(),
    before = await importProject(page, setup.project),
    originalBom = bom(before);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/projects(?:\/|$)/.test(request.url()) &&
      ["PUT", "POST", "DELETE"].includes(request.method())
    )
      writes.push(`${request.method()} ${request.url()}`);
  });
  const active = before.pieces.filter((piece) => !piece.offcut),
    offcut = before.pieces.find((piece) => piece.id === setup.offcutId)!;
  expect(offcut.offcut).toBe(true);
  expect(
    before.pieces.find((piece) => piece.id === setup.blockId)!.cutStock?.id,
  ).toBe(offcut.cutStock?.id);
  await expect(page.getByTestId("offcut-view-status")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show offcut stock", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await assertShownAndFramed(page, before, active);
  await page
    .getByRole("button", { name: "Show offcut stock", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hide offcut stock", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("offcut-view-status")).toContainText(
    "offcut stock records visible",
  );
  await assertShownAndFramed(page, before, before.pieces);
  await page.screenshot({
    path: test.info().outputPath("desktop-deliberate-offcut-stock.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Back to assembly", exact: true })
    .click();
  await assertShownAndFramed(page, before, active);
  await inspectFromGuide(page, before, setup.offcutId);
  await expect(page.getByTestId("offcut-view-status")).toContainText(
    `Inspecting ${partLabel(before, setup.offcutId)}`,
  );
  await assertShownAndFramed(page, before, [...active, offcut]);
  await page
    .getByRole("button", { name: "Back to assembly", exact: true })
    .click();
  await expect(page.getByTestId("offcut-view-status")).toHaveCount(0);
  await assertShownAndFramed(page, before, active);
  const after = await exportProject(page);
  expect(after).toEqual(before);
  expect(bom(after)).toEqual(originalBom);
  expect(await draft(page, (actual) => actual.id === before.id)).toEqual(
    before,
  );
  expect(writes).toEqual([]);
});

test("fitted results focus completion controls on desktop and phone, retain exact previews through Inspect, and add only an explicit durable build-stage choice", async ({
  page,
}) => {
  const setup = await banquette(),
    before = await importProject(page, setup.project),
    panel = await openFit(page);
  await configureFit(panel, setup);
  const target = guidePlacementTargets(before).find(
      (row) => row.stageKey === "bottom-frame",
    )!,
    choice = { ownerId: target.ownerId, stageKey: target.stageKey };
  const picker = panel.getByRole("combobox", {
    name: "Fitted stock build stage",
    exact: true,
  });
  await expect(picker).toHaveValue("");
  await picker.selectOption(JSON.stringify([target.ownerId, target.stageKey]));
  await panel
    .getByRole("button", { name: "Preview fitted stock", exact: true })
    .click();
  let results = await expectResultsInView(page);
  const firstId = await results
    .locator(".fitted-stock-summary")
    .getAttribute("data-block-id");
  await expect(results).toContainText(target.title);
  await page.screenshot({
    path: test.info().outputPath("desktop-fitted-result-completion.png"),
    fullPage: false,
    animations: "disabled",
  });
  await results
    .getByRole("button", { name: "Inspect fitted stock in 3D", exact: true })
    .click();
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveAttribute(
    "data-piece-id",
    firstId!,
  );
  await expect(
    page.getByRole("button", { name: "Return to fitted stock", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Return to fitted stock", exact: true })
    .click();
  await expect(
    results.getByRole("button", { name: "Add fitted block", exact: true }),
  ).toBeInViewport();
  expect(await exportProject(page)).toEqual(before);
  const clearance = panel.getByRole("textbox", {
    name: "First end clearance",
    exact: true,
  });
  await clearance.fill("1e-");
  await expect(clearance).toHaveValue("1e-");
  await expect(
    page.getByRole("region", { name: "Fitted stock result", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Add fitted block", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(clearance).toHaveValue("1e-");
  await clearance.fill("0");
  await panel
    .getByRole("button", { name: "Preview fitted stock", exact: true })
    .click();
  results = await expectResultsInView(page);
  const blockId = (await results
    .locator(".fitted-stock-summary")
    .getAttribute("data-block-id"))!;
  await page.screenshot({
    path: test.info().outputPath("phone-fitted-result-completion.png"),
    fullPage: false,
    animations: "disabled",
  });
  await results
    .getByRole("button", { name: "Inspect fitted stock in 3D", exact: true })
    .click();
  await expect(page.getByTestId("fitted-stock-ghost")).toHaveAttribute(
    "data-piece-id",
    blockId,
  );
  await page
    .getByRole("button", { name: "Return to fitted stock", exact: true })
    .click();
  await expect(
    results.getByRole("button", { name: "Add fitted block", exact: true }),
  ).toBeInViewport();
  await results
    .getByRole("button", { name: "Add fitted block", exact: true })
    .click();
  const added = await draft(page, (actual) =>
    actual.pieces.some((piece) => piece.id === blockId),
  );
  const block = added.pieces.find((piece) => piece.id === blockId)!;
  expect(block.guidePlacement).toEqual(choice);
  expect(block.cutStock).toBeTruthy();
  const remnants = added.pieces.filter(
    (piece) => piece.offcut && piece.cutStock?.id === block.cutStock!.id,
  );
  expect(remnants).toHaveLength(1);
  expect(remnants[0].guidePlacement).toBeUndefined();
  expect(
    added.pieces.filter((piece) =>
      before.pieces.some((old) => old.id === piece.id),
    ),
  ).toEqual(before.pieces);
  const guided = await regenerate(page),
    assigned = assemblyStep(guided, choice.ownerId, choice.stageKey);
  expect(
    assigned.generated?.kind === "assembly-stage" &&
      assigned.generated.memberIds,
  ).toContain(blockId);
  expect(guided.pieces.find((piece) => piece.id === blockId)!.stepId).toBe(
    assigned.id,
  );
  expect(
    guided.sections.find((section) => section.id === setup.sectionId)!.pieceIds,
  ).toContain(blockId);
  const reopened = await saveAndReopen(page, guided),
    exported = await exportProject(page),
    imported = await importProject(page, exported);
  expect(exported).toEqual(reopened);
  expect(imported.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(imported.pieces).toEqual(exported.pieces);
  expect(guidePlacementIssues(imported)).toEqual([]);
  expect(
    imported.pieces.find((piece) => piece.id === blockId)!.guidePlacement,
  ).toEqual(choice);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("Part build-stage choices and actual Earlier/Later order survive regeneration and reopening while unavailable targets stay explicit", async ({
  page,
}) => {
  const setup = await fittedFixture();
  let initial = setup.project;
  const group = "SYNTHETIC custom assembly task",
    rootMember = part(
      "SYNTHETIC loose task member",
      "stud",
      [1.5, 8, 3.5],
      [180, 4, 0],
      initial.steps[0].id,
      group,
    );
  const unavailable = part(
    "SYNTHETIC same-key unavailable target",
    "stud",
    [1.5, 8, 3.5],
    [190, 4, 0],
    initial.steps[0].id,
    group,
  );
  const missing = { ownerId: uid(), stageKey: "bottom-frame" };
  unavailable.guidePlacement = missing;
  initial = generateBuildGuide(
    ensurePartLabels({
      ...initial,
      pieces: [...initial.pieces, rootMember, unavailable],
    }),
  );
  const before = await importProject(page, initial),
    originalBlock = before.pieces.find((piece) => piece.id === setup.blockId)!;
  await inspectFromGuide(page, before, setup.blockId);
  const editor = page.getByRole("region", {
      name: "Part build stage",
      exact: true,
    }),
    label = partLabel(before, setup.blockId);
  const target = guidePlacementTargets(before).find(
    (row) => row.ownerId === before.id && row.stageKey === `assembly:${group}`,
  )!;
  await editor
    .getByRole("combobox", { name: `Build stage for ${label}`, exact: true })
    .selectOption(JSON.stringify([target.ownerId, target.stageKey]));
  const changed = await draft(
    page,
    (actual) =>
      actual.pieces.find((piece) => piece.id === setup.blockId)?.guidePlacement
        ?.ownerId === before.id && !guideIsCurrent(actual),
  );
  expect({
    ...changed.pieces.find((piece) => piece.id === setup.blockId)!,
    guidePlacement: originalBlock.guidePlacement,
  }).toEqual(originalBlock);
  await editor
    .getByRole("button", { name: "Update build guide", exact: true })
    .click();
  const guided = await draft(page, guideIsCurrent),
    destination = assemblyStep(guided, before.id, target.stageKey);
  expect(
    destination.generated?.kind === "assembly-stage" &&
      destination.generated.memberIds,
  ).toContain(setup.blockId);
  await inspectFromGuide(page, guided, setup.blockId);
  await page
    .getByRole("button", { name: "Open selected build stage", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Step title", exact: true }),
  ).toHaveValue(destination.title);
  const note = "SYNTHETIC retain clamp access for the custom block.",
    customTitle = "SYNTHETIC chosen custom assembly sequence";
  await page
    .getByRole("textbox", { name: "Step title", exact: true })
    .fill(customTitle);
  await page
    .getByRole("textbox", { name: "Build instructions", exact: true })
    .fill(`${destination.notes}\n${note}`);
  await page
    .getByRole("button", { name: "Mark step complete", exact: true })
    .click();
  await page.getByRole("button", { name: "Earlier", exact: true }).click();
  const earlier = await draft(
    page,
    (actual) =>
      actual.steps.findIndex((step) => step.id === destination.id) ===
        guided.steps.findIndex((step) => step.id === destination.id) - 1 &&
      actual.steps.find((step) => step.id === destination.id)?.complete ===
        true,
  );
  let regenerated = await regenerate(page);
  expect(regenerated.steps.map((step) => step.id)).toEqual(
    earlier.steps.map((step) => step.id),
  );
  await openStep(page, customTitle);
  await page.getByRole("button", { name: "Later", exact: true }).click();
  const later = await draft(
    page,
    (actual) =>
      actual.steps.findIndex((step) => step.id === destination.id) ===
      earlier.steps.findIndex((step) => step.id === destination.id) + 1,
  );
  regenerated = await regenerate(page);
  expect(regenerated.steps.map((step) => step.id)).toEqual(
    later.steps.map((step) => step.id),
  );
  const retained = regenerated.steps.find(
    (step) => step.id === destination.id,
  )!;
  expect(retained.complete).toBe(true);
  expect(retained.title).toBe(customTitle);
  expect(retained.notes.split(note)).toHaveLength(2);
  expect(
    regenerated.pieces.find((piece) => piece.id === setup.blockId)!.cutStock,
  ).toEqual(originalBlock.cutStock);
  expect(
    regenerated.pieces.find((piece) => piece.id === setup.offcutId),
  ).toEqual(before.pieces.find((piece) => piece.id === setup.offcutId));
  for (const key of [
    "sections",
    "joints",
    "fastenerPlans",
    "connectorPlans",
    "lidHingePlans",
    "hingeStockSources",
    "attachmentPlans",
    "restraintPlans",
    "supplies",
    "inventory",
    "supplyInventory",
    "toolSelections",
  ] as const)
    expect(regenerated[key]).toEqual(before[key]);
  const physical = ({
    stepId: _stepId,
    guidePlacement: _placement,
    ...piece
  }: Piece) => piece;
  expect(regenerated.pieces.map(physical)).toEqual(before.pieces.map(physical));
  const unresolved = regenerated.steps.find(
    (step) =>
      step.generated?.kind === "assembly-stage" &&
      step.generated.stageKey === "review-unresolved-guide-placement",
  )!;
  expect(
    unresolved.generated?.kind === "assembly-stage" &&
      unresolved.generated.memberIds,
  ).toContain(unavailable.id);
  expect(
    guidePlacementIssues(regenerated).map((issue) => issue.pieceId),
  ).toEqual([unavailable.id]);
  await inspectFromGuide(page, regenerated, unavailable.id);
  const unknownEditor = page.getByRole("region", {
    name: "Part build stage",
    exact: true,
  });
  await expect(unknownEditor.getByRole("combobox")).toHaveValue("unavailable");
  await expect(unknownEditor.getByRole("status")).toContainText(
    `${partLabel(regenerated, unavailable.id)}: its explicitly selected guide stage is unavailable`,
  );
  await page.screenshot({
    path: test.info().outputPath("desktop-unavailable-guide-placement.png"),
    fullPage: false,
    animations: "disabled",
  });
  const reopened = await saveAndReopen(page, regenerated);
  expect(reopened.steps).toEqual(regenerated.steps);
  expect(
    reopened.pieces.find((piece) => piece.id === unavailable.id)!
      .guidePlacement,
  ).toEqual(missing);
  const exported = await exportProject(page),
    imported = await importProject(page, exported);
  expect(imported.id).not.toBe(exported.id);
  expect(
    imported.pieces.find((piece) => piece.id === setup.blockId)!.guidePlacement,
  ).toEqual({ ownerId: imported.id, stageKey: target.stageKey });
  expect(
    imported.pieces.find((piece) => piece.id === unavailable.id)!
      .guidePlacement,
  ).toEqual(missing);
  expect(guidePlacementIssues(imported).map((issue) => issue.pieceId)).toEqual([
    unavailable.id,
  ]);
  expect(
    imported.pieces.map((piece) => ({ ...piece, guidePlacement: undefined })),
  ).toEqual(
    exported.pieces.map((piece) => ({ ...piece, guidePlacement: undefined })),
  );
  expect(imported.steps).toEqual(exported.steps);
});
