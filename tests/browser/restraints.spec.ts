import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { part, projectSchema, type Project } from "../../src/model";
import { createBuildStudy } from "../../src/buildFixtures";
import { connect } from "../../src/engine";
import {
  addRestraintLocation,
  makeRestraintPlan,
  restraintReviews,
  saveRestraintPlan,
  selectRestraintReceiver,
} from "../../src/restraints";
import { restraintProductId } from "../../src/restraintSchema";
import { restraintScrewStudy } from "../fixtures/restraint-screw-study";

function fixture(name: string) {
  let project = createBuildStudy("shelves").project;
  const receiver = part(
    "User-designed solid-wood receiver",
    "one-four",
    [10, 3.5, 0.75],
    [0, 68, -8.375],
    project.steps[0].id,
    "Receiver under review",
  );
  project = { ...project, name, pieces: [...project.pieces, receiver] };
  const back = project.pieces.find((piece) => piece.assembly === "Back")!;
  project = connect(
    project,
    receiver.id,
    back.id,
    project.steps[0].id,
    2,
    1.25,
    "screw",
    "screw-short",
  );
  return {
    project,
    receiverId: receiver.id,
    panelId: back.id,
    jointId: project.joints.at(-1)!.id,
    entryId: project.ideaBindings[0].entries[0].id,
  };
}
async function currentDraft(page: Page): Promise<Project | null> {
  const raw = await page.evaluate(
    (draftKey) => localStorage.getItem(draftKey),
    CURRENT_DRAFT_KEY,
  );
  return raw ? projectSchema.parse(JSON.parse(raw).project) : null;
}
async function waitDraft(
  page: Page,
  predicate: (project: Project) => boolean,
  timeout = 5000,
): Promise<Project> {
  let observed: Project | null = null;
  try {
    await expect
      .poll(
        async () => {
          observed = await currentDraft(page);
          return !!observed && predicate(observed);
        },
        { timeout },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-observed-restraint-project", {
      body: Buffer.from(JSON.stringify(observed, null, 2)),
      contentType: "application/json",
    });
    throw error;
  }
  return (await currentDraft(page))!;
}
async function openPanel(page: Page) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Plan furniture anti-tip restraints",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "Furniture anti-tip plans",
    exact: true,
  });
  await expect(panel).toBeVisible();
  return panel;
}
async function importFixture(page: Page, project: Project) {
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
      name: "restraint-study.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await waitDraft(page, (actual) => actual.name.startsWith(project.name));
  return openPanel(page);
}
async function coordinates(location: Locator, label: string, point: number[]) {
  for (const [index, axis] of ["X", "Y", "Z"].entries())
    await location
      .getByRole("spinbutton", { name: `${label} ${axis}`, exact: true })
      .fill(String(point[index]));
}

test("the bookcase restraint saves its measured receiver screw, shows the link in 3D, and exports the kit list", async ({ page }, info) => {
  const { project, screw, restraint, railId } = restraintScrewStudy();
  const plan = { ...restraint, name: "Bookcase receiver review" };
  await importFixture(page, saveRestraintPlan(project, plan));
  const panel = await openPanel(page);
  const selector = panel.locator(`[data-restraint-plan-id="${plan.id}"]`);
  await selector.getByRole("button", { name: /^Bookcase receiver review/ }).click();
  await selector.getByText("Receiver material and connection evidence", { exact: true }).click();
  const choice = selector.getByRole("checkbox", { name: `Receiver screw plan ${screw.label}`, exact: true });
  await choice.check();
  await expect(selector.getByText(/1 entered screw path checked across touching members/)).toBeVisible();
  await expect(page.getByTestId("restraint-screw-link")).toHaveCount(0);
  await selector.getByRole("button", { name: "Save restraint review", exact: true }).click();
  const saved = await waitDraft(page, (value) => value.restraintPlans[0].receiverFastenerPlanIds?.includes(screw.id) ?? false);
  expect(saved.joints).toHaveLength(0);
  expect(saved.pieces.some(({ id, cutStock }) => id === railId && !!cutStock)).toBe(true);
  await expect(page.getByTestId("restraint-screw-link")).toHaveText("W001");
  await page.screenshot({ path: info.outputPath("restraint-screw-chain.png") });
  await panel.getByRole("button", { name: "Add missing restraint kits", exact: true }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const response = await page.request.get(`/api/projects/${saved.id}`);
  expect(response.ok()).toBe(true);
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.restraintPlans[0].receiverFastenerPlanIds).toEqual([screw.id]);
  expect(reopened.supplies.some(({ productId, quantity }) => productId === restraintProductId && quantity === 1)).toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await pending).path())!, "utf8");
  expect(guide).toMatch(/W001 · P\d+ ↔ P\d+ · 1 entered screw path/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/#314365593/);
});

test("anti-tip review starts empty, rejects a panel receiver, and preserves a measured review with one manual whole-kit purchase", async ({
  page,
}) => {
  const data = fixture("Explicit anti-tip workflow"),
    panel = await importFixture(page, data.project);
  await panel
    .getByRole("combobox", {
      name: "Design for new restraint review",
      exact: true,
    })
    .selectOption(data.entryId);
  await panel
    .getByRole("button", { name: "Create anti-tip review", exact: true })
    .click();
  const empty = await waitDraft(
    page,
    (project) => project.restraintPlans.length === 1,
  );
  expect(empty.restraintPlans[0].receiver).toBeNull();
  expect(empty.restraintPlans[0].locations).toEqual([]);
  expect(empty.supplies).toEqual([]);
  await expect(panel.locator(".restraint-purchases")).toContainText(
    "0 planned locations · Required kits: 0 · Selected kits: 0 · Missing kits: 0.",
  );
  await panel
    .getByRole("combobox", { name: "Furniture receiver part", exact: true })
    .selectOption(data.panelId);
  await panel
    .getByRole("button", { name: "Use selected receiver", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Add restraint location", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Save restraint review", exact: true })
    .click();
  const conflict = await waitDraft(
    page,
    (project) =>
      project.restraintPlans[0]?.receiver?.pieceId === data.panelId &&
      project.restraintPlans[0].locations.length === 1,
  );
  expect(restraintReviews(conflict)[0].state).toBe("conflict");
  expect(restraintReviews(conflict)[0].activeKitCount).toBe(0);
  await expect(
    panel
      .getByRole("alert")
      .filter({ hasText: /solid-wood furniture attachment/ }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Furniture receiver part", exact: true })
    .selectOption(data.receiverId);
  await panel
    .getByRole("button", { name: "Use selected receiver", exact: true })
    .click();
  await panel
    .getByText("Receiver material and connection evidence", { exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "Solid-wood receiver basis", exact: true })
    .fill(
      "SYNTHETIC user inspection of this actual solid-wood member; not capacity approval",
    );
  await panel
    .getByLabel("Receiver inspection date", { exact: true })
    .fill("2026-11-15T09:30");
  await panel
    .getByRole("checkbox", {
      name: `Receiver connection ${data.jointId}`,
      exact: true,
    })
    .check();
  const location = panel.locator("details[aria-label='Restraint location 1']");
  await coordinates(location, "Receiver mount point", [0, 0, -0.375]);
  await coordinates(location, "Furniture cable-eye center", [0, 0, -0.5]);
  await coordinates(
    location,
    "Wall cable-eye center · project coordinates",
    [0, 68, -12],
  );
  await location
    .getByRole("combobox", {
      name: "Wall substrate for location 1",
      exact: true,
    })
    .selectOption("wood-stud");
  await location
    .getByRole("textbox", { name: "Wall evidence for location 1", exact: true })
    .fill("SYNTHETIC actual wood-stud inspection and wall-finish record");
  await location
    .getByLabel("Wall inspection date for location 1", { exact: true })
    .fill("2026-11-15T09:31");
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  for (const [label, value] of [
    ["Cable eye-to-eye length", "2"],
    ["Deepest furniture screw-tip depth", "0.5"],
    ["Wall fastener length", "1.5"],
    ["Measured wood-stud engagement", "1"],
  ])
    await panel
      .getByRole("spinbutton", { name: label, exact: true })
      .fill(value);
  await panel
    .getByRole("textbox", { name: "Restraint measurement basis", exact: true })
    .fill("SYNTHETIC measured cable, fastener identity and reference surfaces");
  await panel
    .getByLabel("Restraint measurement date", { exact: true })
    .fill("2026-11-15T09:32");
  await panel
    .getByText("Delivered instructions and review notes", { exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "Restraint instruction basis", exact: true })
    .fill("SYNTHETIC delivered exact-kit card record");
  await panel
    .getByRole("textbox", {
      name: "Restraint instruction revision",
      exact: true,
    })
    .fill("SYNTHETIC card identifier");
  await panel
    .getByLabel("Restraint instruction review date", { exact: true })
    .fill("2026-11-15T09:33");
  await panel
    .getByRole("button", { name: "Save restraint review", exact: true })
    .click();
  const overreach = await waitDraft(
    page,
    (project) =>
      project.restraintPlans[0].measurements.cableEyeToEyeLength === 2,
  );
  expect(
    restraintReviews(overreach)[0].issues.some(
      (issue) => issue.code === "cable-overreach",
    ),
  ).toBe(true);
  expect(restraintReviews(overreach)[0].activeKitCount).toBe(0);
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await panel
    .getByRole("spinbutton", { name: "Cable eye-to-eye length", exact: true })
    .fill("5");
  await panel
    .getByRole("button", { name: "Save restraint review", exact: true })
    .click();
  const reviewed = await waitDraft(
    page,
    (project) =>
      project.restraintPlans[0].measurements.cableEyeToEyeLength === 5,
  );
  expect(restraintReviews(reviewed)[0].state).toBe("needs-review");
  expect(restraintReviews(reviewed)[0].activeKitCount).toBe(1);
  await expect(panel.locator(".restraint-purchases")).toContainText(
    "1 planned locations · Required kits: 1 · Selected kits: 0 · Missing kits: 1.",
  );
  await panel
    .getByRole("button", { name: "Add missing restraint kits", exact: true })
    .click();
  const purchased = await waitDraft(page, (project) =>
    project.supplies.some((supply) => supply.productId === restraintProductId),
  );
  expect(
    purchased.supplies
      .filter((supply) => supply.productId === restraintProductId)
      .reduce((sum, supply) => sum + supply.quantity, 0),
  ).toBe(1);
  expect(purchased.pieces).toEqual(empty.pieces);
  expect(purchased.joints).toEqual(empty.joints);
  await expect(
    panel.getByRole("button", {
      name: "Add missing restraint kits",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: /^(Generate build guide|Regenerate guide)$/ })
    .first()
    .click();
  await expect(
    page.locator(".step-track").getByRole("button", {
      name: /Review furniture restraint/,
    }),
  ).toBeVisible({ timeout: 15000 });
  const guide = await waitDraft(
    page,
    (project) =>
      project.steps.some(
        (step) => step.generated?.kind === "restraint-preparation",
      ),
    15000,
  );
  expect(
    guide.steps.some(
      (step) =>
        step.generated?.kind === "restraint-preparation" &&
        step.notes.includes(
          "Explicit locations: 1; provisional included kits: 1",
        ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pendingGuide = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const downloaded = await pendingGuide,
    path = await downloaded.path();
  expect(path).toBeTruthy();
  const markdown = await readFile(path!, "utf8");
  expect(markdown).toContain("## Furniture restraint review");
  expect(markdown).toContain(
    "SYNTHETIC measured cable, fastener identity and reference surfaces",
  );
  expect(markdown).toContain("Every plan remains under review");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: purchased.name })
    .click();
  const reopened = await waitDraft(
    page,
    (project) =>
      project.restraintPlans.length === 1 &&
      project.restraintPlans[0].measurements.cableEyeToEyeLength === 5,
  );
  expect(reopened.restraintPlans).toEqual(guide.restraintPlans);
  expect(reopened.supplies).toEqual(guide.supplies);
});

test("phone coordinate and measurement unit changes preserve precise canonical values and partial points stay unsaved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = fixture("Precise anti-tip units");
  let plan = selectRestraintReceiver(
    data.project,
    makeRestraintPlan(data.project, data.entryId),
    data.receiverId,
  );
  plan = addRestraintLocation(plan);
  plan.receiverJointIds = [data.jointId];
  plan.locations[0].receiverMountLocal = [0.123456789, 0.234567891, -0.375];
  plan.measurements.cableEyeToEyeLength = 0.123456789;
  plan.measurements.basis = "SYNTHETIC precise user length";
  plan.measurements.measuredAt = "2026-11-15T09:30:00.000Z";
  const seeded = saveRestraintPlan(data.project, plan),
    panel = await importFixture(page, seeded);
  await panel
    .getByRole("button", { name: /^Furniture anti-tip review/ })
    .click();
  const location = panel.locator("details[aria-label='Restraint location 1']");
  await location
    .getByRole("combobox", { name: "Receiver mount point units", exact: true })
    .selectOption("ft");
  await location
    .getByRole("spinbutton", { name: "Receiver mount point Y", exact: true })
    .fill("0.05");
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await panel
    .getByRole("combobox", {
      name: "Cable eye-to-eye length units",
      exact: true,
    })
    .selectOption("ft");
  await panel
    .getByRole("combobox", {
      name: "Cable eye-to-eye length units",
      exact: true,
    })
    .selectOption("in");
  await expect(
    panel.getByRole("spinbutton", {
      name: "Cable eye-to-eye length",
      exact: true,
    }),
  ).toHaveValue("0.123456789");
  await location
    .getByRole("spinbutton", {
      name: "Wall cable-eye center · project coordinates X",
      exact: true,
    })
    .fill("24");
  await expect(
    panel.getByRole("button", { name: "Save restraint review", exact: true }),
  ).toBeDisabled();
  expect(
    (await currentDraft(page))!.restraintPlans[0].locations[0].wallEyeWorld,
  ).toBeNull();
  await location
    .getByRole("combobox", {
      name: "Wall cable-eye center · project coordinates units",
      exact: true,
    })
    .selectOption("ft");
  await location
    .getByRole("spinbutton", {
      name: "Wall cable-eye center · project coordinates Y",
      exact: true,
    })
    .fill("4");
  await location
    .getByRole("spinbutton", {
      name: "Wall cable-eye center · project coordinates Z",
      exact: true,
    })
    .fill("-2");
  await expect(
    panel.getByRole("button", { name: "Save restraint review", exact: true }),
  ).toBeEnabled();
  await panel
    .getByRole("button", { name: "Save restraint review", exact: true })
    .click();
  const saved = await waitDraft(
    page,
    (project) =>
      project.restraintPlans[0].locations[0].wallEyeWorld?.[0] === 24,
  );
  expect(saved.restraintPlans[0].locations[0].receiverMountLocal).toEqual([
    0.123456789,
    0.05 * 12,
    -0.375,
  ]);
  expect(saved.restraintPlans[0].locations[0].wallEyeWorld).toEqual([
    24, 48, -24,
  ]);
  expect(saved.restraintPlans[0].measurements.cableEyeToEyeLength).toBe(
    0.123456789,
  );
  expect(
    restraintReviews(saved)[0].issues.some(
      (issue) => issue.code === "receiver-mount",
    ),
  ).toBe(false);
  expect(saved.pieces).toEqual(seeded.pieces);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
