import { expect, test, type Page } from "@playwright/test";
import { blank, part, projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";
import { ensurePartLabels, partLabel } from "../../src/partLabels";
import { addSupply } from "../../src/supplies";

async function draft(
  page: Page,
  matches: (project: Project) => boolean,
): Promise<Project> {
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
    await test
      .info()
      .attach("last-remapping-project", {
        body: Buffer.from(JSON.stringify(last, null, 2)),
        contentType: "application/json",
      });
    throw error;
  }
  return last!;
}
function fixture(legacy = false) {
  let project = blank(
    `SYNTHETIC ${legacy ? "legacy phone" : "desktop"} remapping ${uid().slice(0, 8)}`,
  );
  const step = project.steps[0].id,
    oldHead = part(
      "Same-name head panel",
      "plywood",
      [12, 12, 0.75],
      [0, 6, 0.375],
      step,
      "Saved actual pair",
    ),
    oldReceiver = part(
      "Same-name receiver",
      "stud",
      [1.5, 12, 3.5],
      [0, 6, -1.75],
      step,
      "Saved actual pair",
    );
  project = ensurePartLabels({ ...project, pieces: [oldHead, oldReceiver] });
  let plan = addFastenerLocation(
    makeFastenerPlan(project, oldHead.id, oldReceiver.id, {
      name: "SYNTHETIC retained W/F identity",
    }),
  );
  plan.locations[0].entranceLocal = [0.123456789, 0.234567891, 0.375];
  plan.locations[0].driveLocal = [0, 0, -1];
  plan.measurements = {
    surfaceToTipDepth: 2.5,
    pilotDiameter: 0.1,
    pilotDepth: 2.2,
    basis: "SYNTHETIC former measurements; obsolete after member replacement",
    measuredAt: "2026-11-15T16:30:00.000Z",
  };
  plan.notes = "SYNTHETIC custom plan note must survive replacement.";
  project = saveFastenerPlan(project, plan);
  plan = project.fastenerPlans[0];
  if (legacy) {
    plan.head.baseline = null;
    plan.receiver.baseline = null;
  }
  const thickness = legacy ? 0.75 : 0.703,
    stock = legacy ? "plywood" : "plytanium-703";
  const head = part(
      oldHead.name,
      stock,
      [12, 12, thickness],
      [0, 6, thickness / 2],
      step,
      "Replacement actual pair",
    ),
    receiver = part(
      oldReceiver.name,
      "stud",
      [1.5, 12, 3.5],
      [0, 6, -1.75],
      step,
      "Replacement actual pair",
    );
  const decoyHead = part(
      oldHead.name,
      stock,
      [12, 12, thickness],
      [0, 6, -12],
      step,
      "Different same-name parts",
    ),
    decoyReceiver = part(
      oldReceiver.name,
      "stud",
      [1.5, 12, 3.5],
      [0, 6, -15.75],
      step,
      "Different same-name parts",
    );
  project = ensurePartLabels({
    ...project,
    pieces: [head, receiver, decoyHead, decoyReceiver],
    fastenerPlans: [plan],
  });
  project = addSupply(
    project,
    "grk-r4-103101",
    1,
    "SYNTHETIC manual purchase",
    "One exact 100-screw box; no installed geometry or real stock claim.",
  );
  project.notes =
    "SYNTHETIC replacement fixture. Original actual members were removed; same-name candidates must be explicitly chosen by P label and ID.";
  return {
    project: projectSchema.parse(project),
    head,
    receiver,
    oldHead,
    oldReceiver,
    plan,
    thickness,
  };
}
async function load(page: Page, project: Project) {
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
      name: "synthetic-member-replacement.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(
    page,
    (actual) =>
      actual.name.startsWith(project.name) && actual.fastenerPlans.length === 1,
  );
}
async function openPanel(page: Page) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan wood-fastener locations", exact: true })
    .click();
  const panel = page.getByRole("region", {
      name: "Wood fastener plans",
      exact: true,
    }),
    select = panel.locator(".attachment-plan-select").first();
  if ((await select.getAttribute("aria-expanded")) !== "true")
    await select.click();
  return panel;
}
async function reopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const result = await page.request.get(`/api/projects/${expected.id}`);
        if (!result.ok()) return false;
        const saved = (await result.json()).project;
        return (
          JSON.stringify(saved.fastenerPlans) ===
            JSON.stringify(expected.fastenerPlans) &&
          JSON.stringify(saved.supplies) === JSON.stringify(expected.supplies)
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

test("saved plan replacement is explicit by actual IDs, previews without mutation, archives measurements and supports undo plus a fresh face pick", async ({
  page,
}) => {
  const setup = fixture(),
    before = await load(page, setup.project);
  let plannerRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/planner") plannerRequests++;
  });
  expect(fastenerReviews(before)[0].state).toBe("stale");
  await page.getByRole("button", { name: "Front", exact: true }).click();
  const panel = await openPanel(page);
  await panel
    .getByRole("textbox", { name: "Fastener plan name", exact: true })
    .fill("Unsaved draft must be discarded");
  let mapping = panel.getByTestId("fastener-remapping");
  await mapping.locator(":scope > summary").click();
  await expect(
    mapping.getByText(
      "Save or discard the unsaved fastener edits before replacing members.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    mapping.getByRole("combobox", {
      name: "Replacement head-side member",
      exact: true,
    }),
  ).toBeDisabled();
  await panel
    .getByRole("button", {
      name: "Discard unsaved fastener edits",
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("textbox", { name: "Fastener plan name", exact: true }),
  ).toHaveValue(setup.plan.name);
  mapping = panel.getByTestId("fastener-remapping");
  await mapping.locator(":scope > summary").click();
  const headSelect = mapping.getByRole("combobox", {
      name: "Replacement head-side member",
      exact: true,
    }),
    receiverSelect = mapping.getByRole("combobox", {
      name: "Replacement receiving member",
      exact: true,
    });
  await expect(headSelect).toHaveValue("");
  await expect(receiverSelect).toHaveValue("");
  await expect(
    headSelect.locator("option").filter({ hasText: setup.head.name }),
  ).toHaveCount(2);
  await expect(
    mapping.getByRole("radio", {
      name: "Clear current location coordinates",
      exact: true,
    }),
  ).toBeChecked();
  await headSelect.selectOption(setup.head.id);
  await receiverSelect.selectOption(setup.receiver.id);
  await expect(
    mapping.getByTestId("fastener-selected-member").first(),
  ).toContainText(partLabel(before, setup.head.id));
  await expect(
    mapping.getByRole("button", {
      name: "Preview member replacement",
      exact: true,
    }),
  ).toBeDisabled();
  await mapping
    .getByRole("textbox", { name: "Replacement review basis", exact: true })
    .fill(
      "SYNTHETIC selected the current P-labeled .703 head and actual receiving board after rebuild; local datum needs re-entry.",
    );
  await mapping
    .getByRole("button", { name: "Preview member replacement", exact: true })
    .click();
  let preview = mapping.getByRole("region", {
    name: "Member replacement preview",
    exact: true,
  });
  await expect(preview).toContainText("0.75 in");
  await expect(preview).toContainText("0.703 in");
  await expect(preview).toContainText(
    "Current seating and pilot measurements reset to unknown",
  );
  await preview
    .getByRole("button", { name: "Cancel replacement preview", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  expect(
    (
      await draft(
        page,
        (actual) => actual.fastenerPlans[0].head.pieceId === setup.oldHead.id,
      )
    ).fastenerPlans,
  ).toEqual(before.fastenerPlans);
  await mapping
    .getByRole("button", { name: "Preview member replacement", exact: true })
    .click();
  preview = mapping.getByRole("region", {
    name: "Member replacement preview",
    exact: true,
  });
  await preview
    .getByRole("button", { name: "Apply member replacement", exact: true })
    .click();
  const mapped = await draft(
      page,
      (actual) =>
        actual.fastenerPlans[0].head.pieceId === setup.head.id &&
        actual.fastenerPlans[0].referenceHistory.length === 1,
    ),
    plan = mapped.fastenerPlans[0];
  expect(plan.id).toBe(setup.plan.id);
  expect(plan.label).toBe(setup.plan.label);
  expect(plan.receiver.pieceId).toBe(setup.receiver.id);
  expect(plan.locations[0].id).toBe(setup.plan.locations[0].id);
  expect(plan.locations[0].label).toBe("F001");
  expect(plan.locations[0].entranceLocal).toBeNull();
  expect(plan.locations[0].driveLocal).toBeNull();
  expect(plan.measurements).toEqual({
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  expect(plan.referenceHistory[0].previous.head).toEqual(
    before.fastenerPlans[0].head,
  );
  expect(plan.referenceHistory[0].previous.receiver).toEqual(
    before.fastenerPlans[0].receiver,
  );
  expect(plan.referenceHistory[0].previous.measurements).toEqual(
    setup.plan.measurements,
  );
  expect(plan.referenceHistory[0].previous.locations).toEqual(
    setup.plan.locations,
  );
  expect(mapped.pieces).toEqual(before.pieces);
  expect(mapped.supplies).toEqual(before.supplies);
  expect(mapped.joints).toEqual(before.joints);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await draft(
    page,
    (actual) => actual.fastenerPlans[0].head.pieceId === setup.oldHead.id,
  );
  expect(undone.fastenerPlans[0].measurements).toEqual(setup.plan.measurements);
  expect(undone.fastenerPlans[0].referenceHistory).toEqual(
    plan.referenceHistory,
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await draft(
    page,
    (actual) => actual.fastenerPlans[0].head.pieceId === setup.head.id,
  );
  const location = panel.locator(
    "details[aria-label='Fastener location F001']",
  );
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 entry point Z",
      exact: true,
    }),
  ).toHaveValue("");
  await location
    .getByRole("button", { name: "Pick entrance in 3D", exact: true })
    .click();
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw Error("No replacement-pick canvas");
  await page.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 entry point Z",
      exact: true,
    }),
  ).toHaveValue(String(setup.thickness / 2));
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 drive direction Z",
      exact: true,
    }),
  ).toHaveValue("-1");
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const picked = await draft(
    page,
    (actual) =>
      actual.fastenerPlans[0].locations[0].entranceLocal?.[2] ===
      setup.thickness / 2,
  );
  expect(picked.fastenerPlans[0].measurements.surfaceToTipDepth).toBeNull();
  expect(picked.fastenerPlans[0].referenceHistory).toEqual(
    plan.referenceHistory,
  );
  const reopened = await reopen(page, picked);
  expect(reopened.fastenerPlans).toEqual(picked.fastenerPlans);
  expect(reopened.supplies).toEqual(before.supplies);
  expect(plannerRequests).toBe(0);
});

test("phone legacy mapping explicitly retains exact local values while old dimensions and measured depths remain historical", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const setup = fixture(true),
    before = await load(page, setup.project),
    panel = await openPanel(page),
    mapping = panel.getByTestId("fastener-remapping");
  await mapping.locator(":scope > summary").click();
  await expect(mapping.getByTestId("fastener-legacy-baseline")).toHaveCount(2);
  await mapping
    .getByRole("combobox", {
      name: "Replacement head-side member",
      exact: true,
    })
    .selectOption(setup.head.id);
  await mapping
    .getByRole("combobox", {
      name: "Replacement receiving member",
      exact: true,
    })
    .selectOption(setup.receiver.id);
  await mapping
    .getByRole("radio", {
      name: "Retain local location coordinates without scaling",
      exact: true,
    })
    .check();
  await mapping
    .getByRole("textbox", { name: "Replacement review basis", exact: true })
    .fill(
      "SYNTHETIC explicit review of unchanged local datum; retain exact coordinates, remeasure delivered-screw depths.",
    );
  await mapping
    .getByRole("button", { name: "Preview member replacement", exact: true })
    .click();
  const preview = mapping.getByRole("region", {
    name: "Member replacement preview",
    exact: true,
  });
  await expect(preview).toContainText("Legacy baseline unknown");
  await expect(preview).toContainText(
    "0 location coordinates cleared · 1 retained without scaling",
  );
  await preview
    .getByRole("button", { name: "Apply member replacement", exact: true })
    .click();
  const mapped = await draft(
      page,
      (actual) => actual.fastenerPlans[0].head.pieceId === setup.head.id,
    ),
    plan = mapped.fastenerPlans[0];
  expect(plan.locations).toEqual(before.fastenerPlans[0].locations);
  expect(plan.measurements.surfaceToTipDepth).toBeNull();
  expect(plan.measurements.pilotDepth).toBeNull();
  expect(plan.measurements.pilotDiameter).toBeNull();
  expect(plan.referenceHistory[0].previous.head.baseline).toBeNull();
  expect(plan.referenceHistory[0].previous.receiver.baseline).toBeNull();
  expect(plan.referenceHistory[0].previous.measurements).toEqual(
    setup.plan.measurements,
  );
  expect(plan.head.baseline?.size).toEqual(setup.head.size);
  expect(plan.locations[0].entranceLocal?.[0]).toBe(0.123456789);
  expect(plan.notes).toBe(setup.plan.notes);
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await expect(
    panel.getByRole("spinbutton", {
      name: "Surface-to-tip depth after seating",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(0);
  const history = panel.getByTestId("fastener-reference-history");
  await history.locator(":scope > summary").click();
  await history.locator("details.attachment-plan > summary").first().click();
  await expect(history).toContainText("obsolete");
  await expect(history).toContainText("SYNTHETIC former measurements");
  expect(await history.textContent()).not.toMatch(
    /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i,
  );
  expect(mapped.pieces).toEqual(before.pieces);
  expect(mapped.supplies).toEqual(before.supplies);
  expect((await reopen(page, mapped)).fastenerPlans).toEqual(
    mapped.fastenerPlans,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
