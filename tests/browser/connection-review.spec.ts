import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, part, projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import { connectionCoverage } from "../../src/connectionCoverage";
import { reviewConnectionContact } from "../../src/connectionContacts";
import { generateBuildGuide, guideIsCurrent } from "../../src/guide";
import { fastenerReviews } from "../../src/fastenings";
import { partLabel } from "../../src/partLabels";
import { cutAngledEnd } from "../../src/cutPlan";
import { saveBearingDecision } from "../../src/bearingDecisions";
import { greenhouseBaseConnections, greenhouseBaseEntries } from "../../src/greenhouseBaseConnections";
import { foundationFromBase } from "../../src/greenhouseFoundation";
import { concreteAnchor } from "../../src/concreteAnchorReference";
import { greenhouseBaseTimber as timber } from "../../src/greenhouseBaseReference";

async function draft(page: Page, matches: (project: Project) => boolean) {
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
          return !!observed && matches(observed);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-connection-review-project", {
      body: Buffer.from(JSON.stringify(observed, null, 2)),
      contentType: "application/json",
    });
    throw error;
  }
  return observed!;
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
      name: "synthetic-connection-review.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function editableExport(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await download).path();
  if (!path) throw Error("Missing editable connection-review export");
  const project = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return project;
}
async function chooseStage(page: Page, project: Project, stepId: string) {
  const index = project.steps.findIndex((step) => step.id === stepId);
  expect(index).toBeGreaterThanOrEqual(0);
  await page.locator(".step-track > button").nth(index).click();
  await expect(
    page.getByRole("textbox", { name: "Step title", exact: true }),
  ).toHaveValue(project.steps[index].title);
  const schedule = page.locator(".inspector .guide-connections");
  await schedule.locator("summary").first().click();
  return schedule;
}
async function openReview(schedule: Locator, page: Page) {
  await schedule
    .getByRole("button", {
      name: "Review connections for this stage",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "Connection review",
    exact: true,
  });
  await expect(panel).toBeVisible();
  return panel;
}
async function coordinates(panel: Locator, label: string, values: number[]) {
  for (const [index, axis] of ["X", "Y", "Z"].entries())
    await panel
      .getByRole("spinbutton", { name: `${label} ${axis}`, exact: true })
      .fill(String(values[index]));
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
          JSON.stringify(saved.fastenerPlans) ===
            JSON.stringify(expected.fastenerPlans) &&
          JSON.stringify(saved.pieces) === JSON.stringify(expected.pieces)
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

test("preview a centered screw entry on angled stock, then use and reopen it", async ({ page }, info) => {
  const p = blank(`Centered entry ${uid().slice(0, 8)}`);
  const head = part("Cut side panel", "plytanium-703", [10, 10, 0.703], [0, 5, 0], p.steps[0].id, "Casework");
  const receiver = part("Receiving panel", "plytanium-703", [3, 4, 0.703], [0.5, 4, -0.703], p.steps[0].id, "Casework");
  p.pieces = [head, receiver];
  const before = await load(page, cutAngledEnd(p, head.id, "width", [7.25, 8.75], "start"));
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  await page.getByRole("button", { name: "Review connection decisions", exact: true }).click();
  const joints = page.getByRole("region", { name: "Connection review", exact: true });
  await joints.getByRole("combobox", { name: "Connection contact focus", exact: true }).selectOption(head.id);
  await joints.locator(`[data-contact-a-id='${head.id}'][data-contact-b-id='${receiver.id}']`)
    .getByRole("button", { name: /^Plan wood screws for/ }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  const preview = fasteners.getByRole("button", { name: "Preview centered entry", exact: true });
  const marker = page.getByTestId("fastener-centered-entry-marker");
  await preview.click();
  await expect(marker).toHaveAttribute("data-state", "needs-measurements");
  const position = JSON.parse((await marker.getAttribute("data-position"))!);
  expect(position[0]).toBeCloseTo(0.5, 8);
  expect(position[1]).toBeCloseTo(4, 8);
  expect(position[2]).toBeCloseTo(0.3515, 8);
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(0);
  expect(await editableExport(page)).toEqual(before);
  await fasteners.getByRole("button", { name: "Swap entry and receiver", exact: true }).click();
  await expect(marker).toHaveCount(0);
  await fasteners.getByRole("button", { name: "Swap entry and receiver", exact: true }).click();
  await preview.click();
  await expect(marker).toBeVisible();
  const banner = page.getByTestId("layout-preview-banner");
  await expect(banner).toContainText("Centered entry preview · direction only");
  await banner.getByRole("button", { name: "Return to entry preview", exact: true }).click();
  await expect(fasteners.getByRole("region", { name: "Centered entry preview" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("centered-screw-preview.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await fasteners.getByRole("button", { name: "View entry in 3D", exact: true }).click();
  await expect(marker).toBeVisible();
  await banner.getByRole("button", { name: "Return to entry preview", exact: true }).click();
  await expect(fasteners.getByRole("button", { name: "Use centered entry", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fasteners.getByRole("button", { name: "Use centered entry", exact: true }).click();
  await expect(marker).toHaveCount(0);
  const after = await draft(page, (project) => project.fastenerPlans.length === 1);
  expect(after.pieces).toEqual(before.pieces);
  expect(after.supplies).toEqual(before.supplies);
  const plan = after.fastenerPlans[0];
  expect(plan.locations.map(({ name }) => name)).toEqual(["Centered entry"]);
  expect(plan.measurements.surfaceToTipDepth).toBeNull();
  expect(fastenerReviews(after)[0].state).toBe("needs-measurements");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  expect(await readFile((await (await download).path())!, "utf8")).toContain(
    `${plan.label}/F001 · Centered entry — needs-measurements`,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect((await saveReopen(page, after)).fastenerPlans).toEqual(after.fastenerPlans);
});

test("a real bookcase stage keeps its scope through explicit pair selection, an empty plan and a located screw review", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  initial.name = `SYNTHETIC connection stage ${uid().slice(0, 8)}`;
  await load(page, initial);
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Dry-fit the bookcase carcass",
  );
  const generated = await draft(page, guideIsCurrent),
    stage = connectionCoverage(generated).stages.find(
      (row) => row.key === "carcass",
    )!,
    entry = generated.ideaBindings[0].entries[0],
    rolePart = (role: string) => {
      const sectionId = entry.sections.find(
          (section) => section.role === role,
        )?.sectionId,
        section = generated.sections.find(
          (section) => section.id === sectionId,
        );
      expect(section?.pieceIds).toHaveLength(1);
      return generated.pieces.find(
        (piece) => piece.id === section!.pieceIds[0],
      )!;
    },
    head = rolePart("side-right"),
    receiver = rolePart("top");
  expect(stage.memberIds).toContain(head.id);
  expect(stage.memberIds).toContain(receiver.id);
  expect(reviewConnectionContact(head, receiver).state).toBe("face-contact");
  const schedule = await chooseStage(page, generated, stage.stepId!),
    panel = await openReview(schedule, page);
  await expect(panel.getByTestId("connection-review-summary")).toContainText(
    "5 actual members · 5 without current task intent",
  );
  await panel
    .getByRole("combobox", { name: "Connection contact focus", exact: true })
    .selectOption(head.id);
  const pair = panel.locator(
    `[data-contact-a-id='${head.id}'][data-contact-b-id='${receiver.id}']`,
  );
  await expect(pair).toHaveAttribute("data-contact-state", "face-contact");
  await expect(pair).toContainText("modeled gap 0 in");
  await pair
    .getByRole("button", {
      name: `Plan wood screws for ${partLabel(generated, head.id)} and ${partLabel(generated, receiver.id)}`,
      exact: true,
    })
    .click();
  const fasteners = page.getByRole("region", {
      name: "Wood fastener plans",
      exact: true,
    }),
    headInput = fasteners.getByRole("combobox", {
      name: "Fastener head-side member",
      exact: true,
    }),
    receiverInput = fasteners.getByRole("combobox", {
      name: "Fastener receiving member",
      exact: true,
    });
  await expect(headInput).toHaveValue(head.id);
  await expect(receiverInput).toHaveValue(receiver.id);
  await fasteners
    .getByRole("button", { name: "Swap entry and receiver", exact: true })
    .click();
  await expect(headInput).toHaveValue(receiver.id);
  await expect(receiverInput).toHaveValue(head.id);
  await fasteners
    .getByRole("combobox", { name: "New screw product", exact: true })
    .selectOption("grk-cabinet-113079");
  await fasteners
    .getByRole("button", { name: "Swap entry and receiver", exact: true })
    .click();
  await expect(headInput).toHaveValue(head.id);
  await fasteners
    .getByRole("combobox", { name: "New screw product", exact: true })
    .selectOption("grk-r4-103101");
  expect(await editableExport(page)).toEqual(generated);
  await fasteners
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: stage.title, exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Connection contact focus", exact: true })
    .selectOption(head.id);
  await pair.getByRole("button", { name: /^Plan wood screws for/ }).click();
  await fasteners
    .getByRole("textbox", { name: "New fastener plan name", exact: true })
    .fill("SYNTHETIC right side to top");
  await fasteners
    .getByRole("button", { name: "Create fastener plan", exact: true })
    .click();
  const started = await draft(
      page,
      (actual) => actual.fastenerPlans.length === 1,
    ),
    plan = started.fastenerPlans[0];
  expect(plan.head.pieceId).toBe(head.id);
  expect(plan.receiver.pieceId).toBe(receiver.id);
  expect(plan.locations).toEqual([]);
  expect(plan.measurements.surfaceToTipDepth).toBeNull();
  expect(started.pieces).toEqual(generated.pieces);
  expect(started.supplies).toEqual(generated.supplies);
  expect(guideIsCurrent(started)).toBe(false);
  await fasteners
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  await expect(panel.getByTestId("connection-review-summary")).toContainText(
    "5 without current task intent",
  );
  await expect(
    panel.locator(`[data-review-part-id='${head.id}']`),
  ).toHaveAttribute("data-coverage-state", "started");
  await panel
    .locator(`[data-plan-id='${plan.id}']`)
    .getByRole("button", { name: `Review ${plan.label}`, exact: true })
    .click();
  await expect(
    fasteners.locator(
      `[data-fastener-plan-id='${plan.id}'] .attachment-plan-select`,
    ),
  ).toHaveAttribute("aria-expanded", "true");
  await fasteners
    .getByRole("button", { name: "Add screw location", exact: true })
    .click();
  const location = fasteners.locator(
    "details[aria-label='Fastener location F001']",
  );
  for (const axis of ["X", "Y", "Z"])
    await expect(
      location.getByRole("spinbutton", {
        name: `F001 entry point ${axis}`,
        exact: true,
      }),
    ).toHaveValue("");
  await coordinates(location, "F001 entry point", [
    head.size[0] / 2,
    receiver.position[1] - head.position[1],
    receiver.position[2] - head.position[2],
  ]);
  await coordinates(location, "F001 drive direction", [-1, 0, 0]);
  await location
    .getByRole("button", { name: "Normalize this direction", exact: true })
    .click();
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 drive direction X",
      exact: true,
    }),
  ).toHaveValue("-1");
  const measurements = fasteners
    .locator("details")
    .filter({ hasText: "User measurements · unknown values stay blank" })
    .last();
  await measurements.locator("summary").click();
  await measurements
    .getByRole("spinbutton", {
      name: "Surface-to-tip depth after seating",
      exact: true,
    })
    .fill("2.375");
  await measurements
    .getByRole("spinbutton", { name: "User pilot diameter", exact: true })
    .fill("0.1");
  await measurements
    .getByRole("spinbutton", {
      name: "Deepest pilot drill-tip depth",
      exact: true,
    })
    .fill("2.2");
  await measurements
    .getByRole("textbox", { name: "Fastener measurement basis", exact: true })
    .fill("SYNTHETIC UI ray fixture; no product or installation approval");
  await measurements
    .getByLabel("Fastener measurement date", { exact: true })
    .fill("2026-11-16T10:30");
  await fasteners
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const located = await draft(
    page,
    (actual) =>
      actual.fastenerPlans[0]?.measurements.surfaceToTipDepth === 2.375,
  );
  expect(fastenerReviews(located)[0].state).toBe("path-reviewed");
  expect(located.pieces).toEqual(generated.pieces);
  expect(located.supplies).toEqual(generated.supplies);
  expect(located.fastenerPlans[0].locations[0].entranceLocal).not.toEqual(
    reviewConnectionContact(head, receiver).center,
  );
  await fasteners
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: stage.title, exact: true }),
  ).toBeVisible();
  await expect(panel.locator(`[data-plan-id='${plan.id}']`)).toContainText(
    "Geometry reviewed",
  );
  await expect(
    panel.locator(`[data-review-part-id='${head.id}']`),
  ).toHaveAttribute("data-coverage-state", "geometry-reviewed");
  await panel.screenshot({ path: "../../work/connection-review-desktop.png" });
  const reopened = await saveReopen(page, located);
  expect(reopened.fastenerPlans).toEqual(located.fastenerPlans);
  expect(reopened.pieces).toEqual(located.pieces);
  expect(reopened.supplies).toEqual(located.supplies);
  expect(errors).toEqual([]);
});

test("phone stage review opens the exact saved hinge intent while shell context stays unresolved and JSON stays unchanged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let initial = projectSchema.parse(
    JSON.parse(
      await readFile(
        new URL(
          "../../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  initial = generateBuildGuide({
    ...initial,
    id: uid(),
    name: `SYNTHETIC phone connection context ${uid().slice(0, 8)}`,
  });
  const imported = await load(page, initial),
    hinge = imported.lidHingePlans.find((plan) => plan.label === "H002")!,
    graph = connectionCoverage(imported),
    lid = graph.parts.find((part) => part.pieceId === hinge.moving.pieceId)!,
    fixed = graph.parts.find((part) => part.pieceId === hinge.fixed.pieceId)!,
    stage = graph.stages.find((row) => row.memberIds.includes(lid.pieceId))!;
  expect(lid.intentIds.length).toBeGreaterThan(0);
  expect(fixed.intentIds).toEqual([]);
  expect(fixed.contextIntentIds.length).toBeGreaterThan(0);
  const schedule = await chooseStage(page, imported, stage.stepId!);
  await expect(schedule).toContainText(hinge.label);
  await expect(schedule).not.toContainText(
    "No connection, support or restraint intent",
  );
  const panel = await openReview(schedule, page),
    row = panel.locator(`[data-plan-id='${hinge.id}']`);
  await expect(row).toContainText(
    `${partLabel(imported, hinge.moving.pieceId)} ↔ ${partLabel(imported, hinge.fixed.pieceId)}`,
  );
  await row
    .getByRole("button", { name: `Review ${hinge.label}`, exact: true })
    .click();
  const hinges = page.getByRole("region", {
    name: "Measured lid hinges",
    exact: true,
  });
  await expect(
    hinges.getByRole("combobox", { name: "Saved hinge plan", exact: true }),
  ).toHaveValue(hinge.id);
  await page
    .getByRole("button", { name: "← Back to connections", exact: true })
    .click();
  await expect(
    panel.getByRole("heading", { name: stage.title, exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Back to guide", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Step title", exact: true }),
  ).toHaveValue(stage.title);
  expect(await editableExport(page)).toEqual(imported);
  const shellStage = graph.stages.find((candidate) =>
    candidate.memberIds.includes(fixed.pieceId),
  )!;
  const shellSchedule = await chooseStage(page, imported, shellStage.stepId!),
    shellReview = await openReview(shellSchedule, page);
  await expect(
    shellReview.locator(`[data-review-part-id='${fixed.pieceId}']`),
  ).toHaveAttribute("data-coverage-state", "missing");
  await expect(
    shellReview.locator(`[data-plan-id='${hinge.id}']`),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shellReview.screenshot({
    path: "../../work/connection-review-phone.png",
  });
  expect(await editableExport(page)).toEqual(imported);
  expect(errors).toEqual([]);
});

test("bearing joints open a draft for the exact contact and show its saved status", async ({ page }) => {
  const project = blank(`Bearing pair ${uid().slice(0, 8)}`);
  const step = project.steps[0].id;
  const top = part("Cross board", "stud", [12, 1.5, 3.5], [0, 4.25, 0], step, "Framing");
  const base = part("Support block", "stud", [1.5, 3.5, 3.5], [0, 1.75, 0], step, "Framing");
  project.pieces = [top, base];
  const before = await load(page, project);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${top.id}"]`).click();
  const support = page.locator(".wood-support");
  await support.locator("summary").click();
  await support.getByRole("button", { name: "Review bearing joints" }).click();
  const pair = page.locator(`[data-bearing-pair="${top.id}/${base.id}"]`);
  await expect(pair).toContainText("P001 · Cross board on P002 · Support block");
  await expect(pair).toContainText("5.25 in²");
  await expect(pair).toContainText("No saved connection record for this pair.");
  await pair.getByRole("button", { name: /^Plan wood screws/ }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  await expect(fasteners.getByRole("button", { name: "Create fastener plan" })).toBeVisible();
  expect(await editableExport(page)).toEqual(before);
  await fasteners.getByRole("button", { name: "Create fastener plan" }).click();
  const after = await draft(page, (actual) => actual.fastenerPlans.length === 1);
  const [plan] = after.fastenerPlans;
  expect([plan.head.pieceId, plan.receiver.pieceId]).toEqual([top.id, base.id]);
  expect(plan.locations).toEqual([]);
  expect(after.pieces).toEqual(before.pieces);
  expect(after.supplies).toEqual(before.supplies);
  await fasteners.getByRole("button", { name: "Back to connections", exact: true }).click();
  await expect(pair).toContainText("Started · setup incomplete");
  await expect(pair.getByRole("button", { name: new RegExp(plan.label) })).toBeVisible();
  await expect(page.locator(".bearing-connections-print")).toContainText("1 touching wood pair · 0 without pair records · 1 with detail to review");
});

test("a removable shelf note reopens, appears in the guide and needs review after the geometry changes", async ({ page }) => {
  const project = blank(`Removable shelf ${uid().slice(0, 8)}`);
  const step = project.steps[0].id;
  const shelf = part("Lift-out shelf", "plywood", [18, 0.75, 12], [0, 1.875, 0], step, "Casework");
  const cleat = part("Shelf cleat", "stud", [1.5, 1.5, 10], [0, 0.75, 0], step, "Casework");
  project.pieces = [shelf, cleat];
  const original = await load(page, project);
  const pickShelf = page.locator(`button.step-part[data-part-id="${shelf.id}"]`);
  const support = page.locator(".wood-support");
  const pair = page.locator(`[data-bearing-pair="${shelf.id}/${cleat.id}"]`);
  const note = "Lift straight up for access to the compartment below.";
  const openPair = async () => {
    await page.getByRole("button", { name: "Guide", exact: true }).click();
    await pickShelf.click();
    await support.locator(":scope > summary").click();
    await support.getByRole("button", { name: "Review bearing joints" }).click();
  };
  await openPair();
  await pair.getByText("Keep removable", { exact: true }).click();
  await pair.getByRole("textbox", { name: "Removal note for P001 on P002" }).fill(note);
  await pair.getByRole("button", { name: "Save removable decision" }).click();
  await expect(pair.getByText("Removable contact", { exact: true })).toBeVisible();
  const after = await draft(page, (actual) => actual.bearingDecisions?.length === 1);
  expect(after.pieces).toEqual(original.pieces);
  expect(after.fastenerPlans).toEqual(original.fastenerPlans);
  expect(after.supplies).toEqual(original.supplies);
  expect((await editableExport(page)).bearingDecisions).toEqual(after.bearingDecisions);
  const reopened = await saveReopen(page, after);
  expect(reopened.bearingDecisions).toEqual(after.bearingDecisions);
  await expect(page.locator(".bearing-connections-print")).toContainText(note);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await pickShelf.click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("20");
  await x.press("Tab");
  await expect(page.locator(".bearing-connections-print")).toContainText("The saved parts no longer bear on each other");
  await support.locator(":scope > summary").click();
  await support.getByRole("button", { name: "Review bearing joints" }).click();
  await page.getByText("Saved decisions without contact · 1", { exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
});

test("a removable shelf can be lifted then pulled until the installed furniture blocks it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const project = blank(`Removal path ${uid().slice(0, 8)}`);
  const step = project.steps[0].id;
  const shelf = part("Lift-out shelf", "plywood", [16, 0.75, 10], [0, 1.875, 0], step, "Casework");
  const cleat = part("Shelf cleat", "stud", [1.5, 1.5, 7], [0, 0.75, 0], step, "Casework");
  const trim = part("Face trim", "stud", [8, 1.5, 2], [0, 4.25, 8], step, "Casework");
  project.pieces = [shelf, cleat, trim];
  const before = await load(page, saveBearingDecision(project, shelf.id, cleat.id, "Lift first, then pull toward you."));
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${shelf.id}"]`).click();
  const support = page.locator(".wood-support");
  await support.locator(":scope > summary").click();
  await support.getByRole("button", { name: "Review bearing joints" }).click();
  await page.locator(`[data-bearing-pair="${shelf.id}/${cleat.id}"]`).getByRole("button", { name: "Test removal clearance" }).click();
  const panel = page.getByRole("region", { name: "Removal clearance" });
  const banner = page.getByTestId("motion-preview-label");
  const testPath = panel.getByRole("button", { name: "Test path", exact: true });
  await expect(panel).toContainText("Lift first, then pull toward you.");
  await expect(testPath).toBeDisabled();
  await panel.getByRole("spinbutton", { name: "Movement 1 distance", exact: true }).fill("2");
  await testPath.click();
  await expect(panel.getByText("No modeled interference along this path.")).toBeVisible();
  await panel.getByRole("button", { name: "Add second movement" }).click();
  await panel.getByRole("spinbutton", { name: "Movement 2 distance", exact: true }).fill("18");
  await testPath.click();
  const hits = panel.getByRole("region", { name: "Movement 2 clearance findings" });
  await expect(hits.getByRole("button", { name: "Collision · P003 · Face trim" })).toBeVisible();
  await expect(panel.getByRole("region", { name: "Movement 1 clearance findings" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Play removal" }).click();
  await expect(banner).toContainText("Face trim");
  expect(Number(await banner.getAttribute("data-pose"))).toBeCloseTo(4, 1);
  await panel.getByRole("button", { name: "Play return" }).click();
  await expect(banner).toHaveAttribute("data-pose", "0");
  expect(await editableExport(page)).toEqual(before);
  await panel.getByRole("button", { name: "Save tested path" }).click();
  await expect(panel.getByText(/Modeled obstruction in the saved test/)).toBeVisible();
  const saved = await draft(page, (actual) => actual.bearingDecisions?.[0].removalPath?.outcome === "blocked");
  expect(saved.pieces).toEqual(before.pieces);
  await panel.getByRole("button", { name: "← Back to connections" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Connection review" })).toBeVisible();
  const reopened = await saveReopen(page, saved);
  expect(reopened.bearingDecisions).toEqual(saved.bearingDecisions);
  const printed = page.locator(".bearing-connections-print");
  await expect(printed).toContainText("Up 2 in, then Front 18 in · Modeled obstruction in the saved test");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${trim.id}"]`).click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("30");
  await x.press("Tab");
  await expect(printed).toContainText("Retest required for the current model");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${shelf.id}"]`).click();
  await support.locator(":scope > summary").click();
  await support.getByRole("button", { name: "Review bearing joints" }).click();
  await page.locator(`[data-bearing-pair="${shelf.id}/${cleat.id}"]`).getByRole("button", { name: "Test removal clearance" }).click();
  await expect(panel.getByRole("spinbutton", { name: "Movement 1 distance", exact: true })).toHaveValue("2");
  await expect(panel.getByRole("spinbutton", { name: "Movement 2 distance", exact: true })).toHaveValue("18");
  await testPath.click();
  await expect(panel.getByText("No modeled interference along this path.")).toBeVisible();
  await panel.getByRole("button", { name: "Save tested path" }).click();
  await expect(printed).toContainText("No modeled interference in the saved test");
});

test("the base corner checklist follows one exact screw plan and flags a shifted timber", async ({ page }) => {
  const { project } = createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseBase: { materialId: timber.materialId, productRegistryRef: timber.productId },
  });
  project.name = `Base review ${uid().slice(0, 8)}`;
  const before = await load(page, project);
  const { corners } = greenhouseBaseConnections(before, [])[0];
  const { endId, sideId } = corners[0];
  const left = before.pieces.find(({ id }) => id === sideId)!;
  const openCorners = async () => {
    await page.getByRole("button", { name: /^Checks/ }).first().click();
    await page.getByRole("button", { name: /^Review greenhouse base corners/ }).click();
  };
  await openCorners();
  const checklist = page.locator(".greenhouse-base-connections");
  const first = checklist.locator('[data-base-corner="Front left"]');
  const other = checklist.locator('[data-base-corner="Front right"]');
  await expect(checklist).toContainText("4 of 4 corners meet and align");
  await expect(first).toContainText("12.25 in²");
  await first.getByRole("button", { name: "Plan screw path" }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  await fasteners.getByRole("button", { name: "Create fastener plan", exact: true }).click();
  const after = await draft(page, (actual) => actual.fastenerPlans.length === 1);
  expect(after.fastenerPlans[0].head.pieceId).toBe(endId);
  expect(after.fastenerPlans[0].receiver.pieceId).toBe(sideId);
  expect(after.pieces).toEqual(before.pieces);
  expect(after.fastenerPlans[0].locations).toEqual([]);
  await fasteners.getByRole("button", { name: "Back to connections", exact: true }).click();
  await expect(first.getByRole("button", { name: "Review W001" })).toBeVisible();
  await expect(other).toContainText("Attachment plan needed");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${sideId}"]`).click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill(String(left.position[0] + 1));
  await x.press("Tab");
  await openCorners();
  await expect(checklist).toContainText("2 of 4 corners meet and align");
  await expect(first).toContainText("side rail is inset 1 in");
  await expect(first).toContainText("W001 · references changed");
  await expect(first).toHaveAttribute("data-fit-state", "misaligned");
  await expect(first.getByRole("button", { name: "Plan screw path" })).toHaveCount(0);
  await expect(page.locator(".greenhouse-base-print")).toContainText("side rail is inset 1 in");

  const preview = checklist.getByRole("button", { name: "Preview left rail adjustment" });
  const shifted = await draft(page, (actual) =>
    actual.pieces.find(({ id }) => id === sideId)?.position[0] === left.position[0] + 1,
  );
  await preview.click();
  await expect(checklist.getByRole("status")).toHaveText("Both left corners line up at the blue preview. Move X −1 in.");
  await expect(page.getByTestId("base-rail-preview")).toHaveCount(1);
  expect((await editableExport(page)).pieces).toEqual(shifted.pieces);
  await checklist.getByRole("button", { name: "Cancel preview" }).click();
  await expect(page.getByTestId("base-rail-preview")).toHaveCount(0);
  await expect(first).toHaveAttribute("data-fit-state", "misaligned");
  await preview.click();
  await checklist.getByRole("button", { name: "Apply left rail adjustment" }).click();
  await expect(checklist).toContainText("4 of 4 corners meet and align");
  const adjusted = await draft(page, (actual) =>
    actual.pieces.find(({ id }) => id === sideId)?.position[0] === left.position[0],
  );
  expect(adjusted.pieces).toEqual(before.pieces);
  expect(adjusted.fastenerPlans).toEqual(shifted.fastenerPlans);
  await expect(page.getByTestId("base-rail-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(checklist).toContainText("2 of 4 corners meet and align");
  await expect(preview).toBeVisible();
});

test("a greenhouse foundation keeps mixed units and tracks base rail overhang in 3D and the guide", async ({ page }) => {
  const { project } = createBuildStudy("greenhouse");
  project.name = `Foundation ${uid().slice(0, 8)}`;
  const before = await load(page, project);
  const [base] = greenhouseBaseEntries(before);
  const footprint = foundationFromBase(base)!;
  const rail = base.rails.get("left")!;
  const foundation = page.getByRole("region", { name: "Greenhouse foundation footprint", exact: true });
  const openFoundation = async () => {
    await page.getByRole("button", { name: /^Checks/ }).first().click();
    await page.getByRole("button", { name: /^Review greenhouse base corners/ }).click();
    await page.getByRole("button", { name: "Greenhouse foundation footprint", exact: true }).click();
    await expect(foundation).toBeVisible();
  };

  await openFoundation();
  await foundation.getByRole("button", { name: "Measure foundation footprint" }).click();
  await foundation.getByRole("combobox", { name: "Foundation width units" }).selectOption("ft");
  await foundation.getByRole("spinbutton", { name: "Foundation width", exact: true }).fill(String((footprint.width + 24) / 12));
  await foundation.getByRole("spinbutton", { name: "Foundation depth", exact: true }).fill(String(footprint.depth + 4.5));
  await foundation.getByRole("button", { name: "Save foundation measurements" }).click();
  await expect(foundation.getByRole("status")).toContainText("4 of 4 rails fit");
  const saved = await draft(page, (actual) => actual.greenhouseFoundations?.length === 1);
  expect(saved.greenhouseFoundations![0].width).toBeCloseTo(footprint.width + 24);
  expect(saved.greenhouseFoundations![0].depth).toBeCloseTo(footprint.depth + 4.5);
  await foundation.getByRole("button", { name: "Show foundation in 3D" }).click();
  await expect(page.getByTestId("greenhouse-foundation-marker")).toHaveText("Foundation · 4/4 rails fit");

  await page.getByRole("button", { name: "← Back to connections", exact: true }).click();
  await page.locator('[data-base-corner="Front left"]')
    .getByRole("button", { name: `Inspect ${partLabel(before, rail.id)}`, exact: true }).click();
  await page.getByRole("button", { name: "Part", exact: true }).click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill(String(rail.position[0] - 13.5));
  await x.press("Tab");

  await openFoundation();
  await expect(foundation.getByRole("status")).toContainText("3 of 4 rails fit");
  await expect(foundation).toContainText("left overhang 1.5 in");
  await expect(page.locator(".greenhouse-foundation-print")).toContainText("left overhang 1.5 in");
  const exported = await editableExport(page);
  expect(exported.greenhouseFoundations).toEqual(saved.greenhouseFoundations);
  await saveReopen(page, exported);
  await openFoundation();
  await expect(foundation).toContainText("left overhang 1.5 in");
  await foundation.getByRole("button", { name: "Remove foundation measurements" }).click();
  await expect(foundation.getByRole("button", { name: "Measure foundation footprint" })).toBeVisible();
  await draft(page, (actual) => actual.greenhouseFoundations === undefined);
});

test("greenhouse concrete anchor marks reach the tools, guide and exact Home Depot shopping list", async ({ page }) => {
  const { project } = createBuildStudy("greenhouse");
  project.name = `Anchor layout ${uid().slice(0, 8)}`;
  const [base] = greenhouseBaseEntries(project);
  const rail = base.rails.get("back")!;
  const original = foundationFromBase(base)!;
  rail.size = [rail.size[0], rail.size[2], rail.size[1]];
  rail.position[1] = original.topY + rail.size[1] / 2;
  project.greenhouseFoundations = [{ ...original, width: original.width + 12, depth: original.depth + 12 }];
  const before = await load(page, project);
  const panel = page.locator(".greenhouse-anchor-layout");
  const openAnchors = async () => {
    await page.getByRole("button", { name: /^Checks/ }).first().click();
    await page.getByRole("button", { name: /^Review greenhouse base corners/ }).click();
    await page.getByRole("button", { name: "Greenhouse foundation footprint", exact: true }).click();
    await panel.locator("summary").click();
  };

  await openAnchors();
  await panel.getByRole("button", { name: "Enter specified anchor detail" }).click();
  await panel.getByRole("textbox", { name: "Anchor detail reference" }).fill("Test drawing S1 rev B");
  for (const [name, measurement] of [
    ["Measured anchor length under head", "6"],
    ["Fixture and washer thickness above rail", "0.5"],
    ["Measured slab thickness", "7"],
    ["Specified nominal embedment", "4"],
    ["Specified minimum center-to-edge distance", "4"],
    ["Specified minimum anchor spacing", "8"],
  ]) {
    await panel.getByRole("spinbutton", { name, exact: true }).fill(measurement);
  }
  await panel.getByRole("button", { name: "Save anchor detail" }).click();
  await panel.getByRole("button", { name: "Add anchor mark" }).click();
  await panel.getByRole("combobox", { name: "Base rail", exact: true }).selectOption(rail.id);
  await panel.getByRole("spinbutton", { name: "Anchor X", exact: true }).fill(String(rail.position[0]));
  await panel.getByRole("spinbutton", { name: "Anchor Z", exact: true }).fill(String(rail.position[2]));
  await panel.getByRole("button", { name: "Save anchor mark" }).click();
  await expect(panel.locator("[data-anchor-status=fits]")).toContainText("projection 4 in");
  await page.getByRole("button", { name: "Show foundation in 3D" }).click();
  await expect(page.getByTestId("greenhouse-anchor-markers")).toHaveText("1/1 anchor marks pass layout checks");
  await panel.getByRole("button", { name: "Add 1 to Home Depot list" }).click();
  await expect(panel.getByRole("button", { name: "Add 1 to Home Depot list" })).toHaveCount(0);
  const withMark = await draft(page, (actual) => actual.supplies.some((record) => record.productId === concreteAnchor.productId));
  expect(withMark.pieces).toEqual(before.pieces);
  expect(withMark.joints).toEqual(before.joints);
  expect(withMark.supplies.find((record) => record.productId === concreteAnchor.productId)?.quantity).toBe(1);
  await expect(page.locator(".greenhouse-foundation-print")).toContainText("Concrete bore target 4.5 in");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const shoppingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Shopping list/ }).click();
  const shoppingFile = await (await shoppingDownload).path();
  expect(await readFile(shoppingFile!, "utf8")).toContain(concreteAnchor.listing);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByText("Review a ½ in carbide concrete drill setup", { exact: true }).first()).toBeVisible();
  await openAnchors();
  await panel.getByRole("button", { name: "Edit anchor 1" }).click();
  await panel.getByRole("spinbutton", { name: "Anchor Z", exact: true }).fill(String(rail.position[2] - 9));
  await panel.getByRole("button", { name: "Save anchor mark" }).click();
  await expect(panel.locator("[data-anchor-status=review]")).toContainText("drill circle crosses or misses the slab");
  await expect(page.getByTestId("greenhouse-anchor-markers")).toHaveText("0/1 anchor marks pass layout checks");
  await expect(page.locator(".greenhouse-foundation-print")).toContainText("drill circle crosses or misses the slab");
  const exported = await editableExport(page);
  const [site] = exported.greenhouseFoundations!;
  expect(site.anchors?.productId).toBe(concreteAnchor.productId);
  expect(site.anchors?.locations[0].z).toBe(rail.position[2] - 9);
  const reopened = await saveReopen(page, exported);
  expect(reopened.supplies).toEqual(exported.supplies);
  await openAnchors();
  await expect(panel.locator("[data-anchor-status=review]")).toContainText("drill circle crosses or misses the slab");
});
