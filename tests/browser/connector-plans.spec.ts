import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { blank, part, projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { ensurePartLabels } from "../../src/partLabels";
import {
  connectorReviews,
  makeConnectorPlan,
  saveConnectorPlan,
} from "../../src/connectors";
import { connectorPurchaseSummary } from "../../src/connectorPurchases";
import { findRetailerProduct } from "../../src/retailerCatalog";
import {
  addFastenerLocation,
  changeFastenerProduct,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";

async function draft(
  page: Page,
  expected: (project: Project) => boolean,
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
          return !!last && expected(last);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-connector-project", {
      body: Buffer.from(JSON.stringify(last, null, 2)),
      contentType: "application/json",
    });
    throw error;
  }
  return last!;
}
function fixture(withHistory = false) {
  let project = blank(
    `SYNTHETIC ${withHistory ? "desktop" : "phone"} A21Z ${uid().slice(0, 8)}`,
  );
  const step = project.steps[0].id,
    base = part(
      "Actual base board",
      "stud",
      [24, 1.5, 3.5],
      [0, 0.75, 0],
      step,
      "Actual pair",
    ),
    post = part(
      "Actual post board",
      "stud",
      [1.5, 18, 3.5],
      [8, 10.5, 0],
      step,
      "Actual pair",
    );
  project = ensurePartLabels({ ...project, pieces: [base, post] });
  project.notes =
    "SYNTHETIC connector fixture. All entry, purchase and date evidence is illustrative; no delivered fit, stock, installation or capacity claim.";
  if (withHistory) {
    let old = addFastenerLocation(
      makeFastenerPlan(project, base.id, post.id, {
        name: "Existing W history must survive C planning",
      }),
    );
    old.measurements = {
      surfaceToTipDepth: 1.8731,
      pilotDiameter: 0.1037,
      pilotDepth: 1.8169,
      basis: "SYNTHETIC earlier W user evidence",
      measuredAt: "2026-11-16T12:00:00.000Z",
    };
    project = saveFastenerPlan(project, old);
    old = changeFastenerProduct(
      project,
      project.fastenerPlans[0],
      "grk-cabinet-113079",
    );
    project = saveFastenerPlan(project, old);
  }
  return { project, base, post };
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
      name: "synthetic-connector.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openPanel(page: Page, planId?: string) {
  await page.getByRole("button", { name: /^Checks(?:\s+\d+)?$/ }).click();
  await page
    .getByRole("button", { name: "Plan A21Z connector", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "A21Z connector plans",
    exact: true,
  });
  await expect(panel).toBeVisible();
  if (planId) {
    const button = panel.locator(`button[data-plan-id='${planId}']`);
    if ((await button.getAttribute("aria-expanded")) !== "true")
      await button.click();
  }
  return panel;
}
async function point(entry: Locator, label: string, values: number[]) {
  for (const [i, axis] of ["X", "Y", "Z"].entries())
    await entry
      .getByRole("spinbutton", { name: `${label} ${axis}`, exact: true })
      .fill(String(values[i]));
}
async function openEntry(panel: Locator, label: string) {
  const entry = panel.locator(`details[aria-label='Connector entry ${label}']`);
  if ((await entry.getAttribute("open")) === null)
    await entry.locator(":scope > summary").click();
  return entry;
}
async function openMeasurements(entry: Locator) {
  const details = entry.locator(":scope > details");
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
}
async function measured(
  entry: Locator,
  label: string,
  depth: string,
  pilot = "0.1037",
) {
  await openMeasurements(entry);
  await entry
    .getByRole("spinbutton", {
      name: `${label} wood-entry-to-tip depth`,
      exact: true,
    })
    .fill(depth);
  await entry
    .getByRole("spinbutton", { name: `${label} pilot diameter`, exact: true })
    .fill(pilot);
  await entry
    .getByRole("spinbutton", {
      name: `${label} deepest pilot-drill-tip depth`,
      exact: true,
    })
    .fill("0.5");
  await entry
    .getByRole("textbox", { name: `${label} measurement basis`, exact: true })
    .fill("SYNTHETIC user wood-entry measurement, not manufacturer geometry");
  await entry
    .getByLabel(`${label} measurement date`, { exact: true })
    .fill("2026-11-16T10:00");
}
async function editableExport(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await download).path();
  if (!path) throw Error("Missing editable connector export");
  const exported = projectSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return exported;
}
async function saveReopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        if (!response.ok()) return false;
        const actual = (await response.json()).project;
        return (
          JSON.stringify(actual.connectorPlans) ===
            JSON.stringify(expected.connectorPlans) &&
          JSON.stringify(actual.pieces) === JSON.stringify(expected.pieces) &&
          JSON.stringify(actual.fastenerPlans) ===
            JSON.stringify(expected.fastenerPlans)
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
      JSON.stringify(actual.connectorPlans) ===
        JSON.stringify(expected.connectorPlans),
  );
}

test("an explicit A21Z draft previews one member's entered wood path, saves and exports exact C/E identity, then retains history through a physical cut and refresh", async ({
  page,
}) => {
  const setup = fixture(true),
    before = await load(page, setup.project),
    panel = await openPanel(page);
  await panel
    .getByRole("combobox", { name: "Connector base member", exact: true })
    .selectOption(setup.base.id);
  await panel
    .getByRole("combobox", { name: "Connector post member", exact: true })
    .selectOption(setup.post.id);
  await panel
    .getByRole("button", { name: "Create connector draft", exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "Connector plan name", exact: true })
    .fill("SYNTHETIC measured SD9112 connector");
  await expect(panel.locator("details.connector-entry")).toHaveCount(4);
  await page.screenshot({
    path: test.info().outputPath("desktop-four-blank-entry-slots.png"),
    fullPage: false,
    animations: "disabled",
  });
  let entry = await openEntry(panel, "E001");
  await openMeasurements(entry);
  await expect(
    entry.getByRole("spinbutton", {
      name: "E001 wood-entry-to-tip depth",
      exact: true,
    }),
  ).toHaveValue("");
  await point(entry, "E001 wood entry", [0, 0.75, 0]);
  await entry
    .getByRole("button", {
      name: "E001 inward direction local Y negative",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("connector-entry-marker")).toHaveCount(1);
  await expect(page.getByTestId("connector-entry-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify([0, 1.5, 0]),
  );
  await expect(page.getByTestId("connector-entry-marker")).toHaveAttribute(
    "data-drive",
    JSON.stringify([0, -1, 0]),
  );
  await expect(page.getByTestId("connector-tip-marker")).toHaveCount(0);
  await expect(page.getByTestId("connector-entry-caption")).toContainText(
    "direction only",
  );
  expect((await editableExport(page)).connectorPlans).toEqual([]);
  const unchangedDraft = await draft(page, (actual) => actual.id === before.id);
  expect(unchangedDraft.pieces).toEqual(before.pieces);
  expect(unchangedDraft.fastenerPlans).toEqual(before.fastenerPlans);
  expect(unchangedDraft.supplies).toEqual([]);
  await measured(entry, "E001", "1.125");
  await expect(page.getByTestId("connector-tip-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify([0, 0.375, 0]),
  );
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(
    entry.getByRole("spinbutton", {
      name: "E001 wood-entry-to-tip depth",
      exact: true,
    }),
  ).toHaveValue("1.125");
  await expect(page.locator(".toast")).toContainText(
    /Save or discard the connector draft/,
  );
  // A valid existing basis/date must never make a later invalid number into a reviewed ray.
  for (const [field, restored] of [
    ["wood-entry-to-tip depth", "1.125"],
    ["pilot diameter", "0.1037"],
    ["deepest pilot-drill-tip depth", "0.5"],
  ]) {
    const input = entry.getByRole("spinbutton", {
      name: `E001 ${field}`,
      exact: true,
    });
    for (const invalid of ["-0.25", "0", "13"]) {
      await input.fill(invalid);
      await expect(input).toHaveValue(invalid);
      await expect(
        panel.getByTestId("connector-draft-validation"),
      ).toContainText(`E001 ${field}`);
      await expect(
        panel.getByRole("button", { name: "Save connector plan", exact: true }),
      ).toBeDisabled();
      await expect(page.getByTestId("connector-tip-marker")).toHaveCount(0);
    }
    await input.fill(restored);
    await expect(panel.getByTestId("connector-draft-validation")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("connector-tip-marker")).toHaveAttribute(
      "data-position",
      JSON.stringify([0, 0.375, 0]),
    );
  }
  // Inspect is a highlight action, preserving the unsaved current form.
  await panel
    .getByRole("button", { name: "Inspect P002", exact: true })
    .click();
  await expect(panel).toBeVisible();
  await expect(
    entry.getByRole("spinbutton", {
      name: "E001 wood-entry-to-tip depth",
      exact: true,
    }),
  ).toHaveValue("1.125");
  await panel
    .getByRole("button", { name: "Review connector purchases", exact: true })
    .isDisabled()
    .then((value) => expect(value).toBe(true));
  await panel
    .getByRole("button", { name: "Save connector plan", exact: true })
    .click();
  const saved = await draft(
      page,
      (actual) =>
        actual.connectorPlans[0]?.entries[0].measurements
          .woodEntryToTipDepth === 1.125,
    ),
    plan = saved.connectorPlans[0],
    reviewed = connectorReviews(saved)[0];
  expect(plan.label).toBe("C001");
  expect(plan.entries.map((e) => [e.label, e.role])).toEqual([
    ["E001", "base"],
    ["E002", "base"],
    ["E003", "post"],
    ["E004", "post"],
  ]);
  expect(reviewed.entries[0].state).toBe("path-reviewed");
  expect(reviewed.state).toBe("needs-measurements");
  expect(reviewed.activeConnectorCount).toBe(1);
  expect(reviewed.scheduledFastenerCount).toBe(4);
  expect(saved.pieces).toEqual(before.pieces);
  expect(saved.fastenerPlans).toEqual(before.fastenerPlans);
  expect(saved.joints).toEqual(before.joints);
  expect(saved.supplies).toEqual([]);
  // Partial coordinates are still user work even when the canonical point remains null.
  const partialEntry = await openEntry(panel, "E002");
  await partialEntry
    .getByRole("spinbutton", { name: "E002 wood entry X", exact: true })
    .fill("0.2");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(
    partialEntry.getByRole("spinbutton", {
      name: "E002 wood entry X",
      exact: true,
    }),
  ).toHaveValue("0.2");
  await expect(page.locator(".toast")).toContainText(
    "Save or discard the connector draft",
  );
  expect((await editableExport(page)).connectorPlans).toEqual(
    saved.connectorPlans,
  );
  await partialEntry
    .getByRole("button", { name: "Clear e002 wood entry", exact: true })
    .click();
  // With saved C data and no pending text, global navigation works again.
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plan the tools.", exact: true }),
  ).toBeVisible();
  await openPanel(page, plan.id);
  await panel.locator(".connector-purchases > summary").click();
  await expect(
    panel.locator("[data-product-id='simpson-sd9112r100']"),
  ).toContainText("4 reference units · 100 per purchase pack");
  await expect(panel).toContainText("Mounting fit remains pending");
  await page.screenshot({
    path: test.info().outputPath("desktop-connector-path.png"),
    fullPage: false,
    animations: "disabled",
  });

  // Purchases are explicit and use the exact SD100 purchase unit; they add no geometry.
  await panel
    .getByRole("button", { name: "Review connector purchases", exact: true })
    .click();
  const supplies = page.locator(".supplies-panel");
  if ((await supplies.getAttribute("open")) === null)
    await supplies.locator(":scope > summary").click();
  await supplies
    .getByRole("combobox", { name: "Choose a supply", exact: true })
    .selectOption("simpson-sd9112r100");
  await supplies
    .getByRole("button", { name: "Add supply", exact: true })
    .click();
  const product = findRetailerProduct("simpson-sd9112r100")!,
    row = supplies.locator(".supply-row").filter({ hasText: product.name });
  await row
    .getByRole("button", {
      name: `Record supply snapshot for ${product.name}`,
      exact: true,
    })
    .click();
  const snapshot = page.locator(".supply-snapshot");
  await snapshot
    .getByRole("spinbutton", {
      name: "Supply snapshot price per pack",
      exact: true,
    })
    .fill("12.34");
  await snapshot
    .getByRole("spinbutton", {
      name: "Supply snapshot available packs",
      exact: true,
    })
    .fill("2");
  await snapshot
    .getByRole("textbox", { name: "Supply snapshot store", exact: true })
    .fill("SYNTHETIC-101");
  await snapshot
    .getByRole("textbox", { name: "Supply snapshot ZIP", exact: true })
    .fill("84121");
  await snapshot
    .getByRole("button", { name: "Record supply snapshot", exact: true })
    .click();
  const purchased = await draft(
    page,
    (actual) =>
      actual.supplies.some(
        (s) => s.productId === product.id && s.quantity === 1,
      ) &&
      actual.supplyInventory.some(
        (i) => i.productId === product.id && i.price === 12.34,
      ),
  );
  expect(purchased.pieces).toEqual(before.pieces);
  expect(purchased.connectorPlans).toEqual(saved.connectorPlans);
  expect(
    connectorPurchaseSummary(purchased).products.find(
      (p) => p.productId === product.id,
    )?.selectedUnits,
  ).toBe(100);
  const reopened = await saveReopen(page, purchased);
  expect(reopened.connectorPlanLabels).toEqual(purchased.connectorPlanLabels);
  expect((await editableExport(page)).connectorPlans).toEqual(
    purchased.connectorPlans,
  );
  // Existing saved markers must also disappear while the active editor has invalid values.
  const existingPanel = await openPanel(page, plan.id);
  entry = await openEntry(existingPanel, "E001");
  await openMeasurements(entry);
  const existingDepth = entry.getByRole("spinbutton", {
    name: "E001 wood-entry-to-tip depth",
    exact: true,
  });
  await expect(page.getByTestId("connector-tip-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify([0, 0.375, 0]),
  );
  const savedJsonBeforeInvalidEdit = await editableExport(page);
  await existingDepth.fill("-0.25");
  await expect(
    existingPanel.getByTestId("connector-draft-validation"),
  ).toContainText("E001 wood-entry-to-tip depth");
  await expect(existingDepth).toHaveValue("-0.25");
  await expect(page.getByTestId("connector-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("connector-tip-marker")).toHaveCount(0);
  expect(await editableExport(page)).toEqual(savedJsonBeforeInvalidEdit);
  await existingDepth.fill("1.125");
  await expect(
    existingPanel.getByTestId("connector-draft-validation"),
  ).toHaveCount(0);
  await expect(page.getByTestId("connector-tip-marker")).toHaveAttribute(
    "data-position",
    JSON.stringify([0, 0.375, 0]),
  );
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`.step-part[data-part-id='${setup.base.id}']`).click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page.getByRole("combobox", { name: "Retained length units", exact: true }).selectOption("in");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("22");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  const cut = await draft(
    page,
    (actual) =>
      actual.pieces.find((p) => p.id === setup.base.id)?.size[0] === 22 &&
      connectorReviews(actual)[0].state === "stale",
  );
  expect(cut.connectorPlans).toEqual(reopened.connectorPlans);
  expect(connectorReviews(cut)[0].scheduledFastenerCount).toBe(0);
  const refreshedPanel = await openPanel(page, plan.id);
  await expect(page.getByTestId("connector-tip-marker")).toHaveCount(0);
  await refreshedPanel
    .getByText("Refresh or remove this plan", { exact: true })
    .click();
  await refreshedPanel
    .getByRole("button", { name: "Refresh connector references", exact: true })
    .click();
  entry = await openEntry(refreshedPanel, "E001");
  await expect(
    entry.getByRole("spinbutton", { name: "E001 wood entry Y", exact: true }),
  ).toHaveValue("");
  // Refresh remains an unsaved review until ordinary Save.
  expect((await editableExport(page)).connectorPlans).toEqual(
    cut.connectorPlans,
  );
  await refreshedPanel
    .getByRole("button", { name: "Save connector plan", exact: true })
    .click();
  const refreshed = await draft(
      page,
      (actual) =>
        actual.connectorPlans[0]?.referenceHistory.length === 1 &&
        actual.connectorPlans[0].entries[0].measurements.woodEntryToTipDepth ===
          null,
    ),
    current = refreshed.connectorPlans[0];
  expect(current.id).toBe(plan.id);
  expect(current.entries.map((e) => [e.id, e.label])).toEqual(
    plan.entries.map((e) => [e.id, e.label]),
  );
  expect(
    current.entries.every(
      (e) =>
        !e.entranceLocal &&
        !e.driveLocal &&
        e.measurements.woodEntryToTipDepth === null,
    ),
  ).toBe(true);
  expect(current.referenceHistory[0].previous.entries).toEqual(plan.entries);
  expect(refreshed.fastenerPlans).toEqual(before.fastenerPlans);
  expect(refreshed.pieces).toEqual(cut.pieces);
  expect(refreshed.supplies).toEqual(purchased.supplies);
  expect((await editableExport(page)).connectorPlans).toEqual(
    refreshed.connectorPlans,
  );
});

test("phone connector entries keep independent precise units, distinguish nail and screw reference packs, and leave mounting geometry unknown", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const setup = fixture(),
    before = await load(page, setup.project),
    panel = await openPanel(page);
  await panel
    .getByRole("combobox", { name: "Connector base member", exact: true })
    .selectOption(setup.base.id);
  await panel
    .getByRole("combobox", { name: "Connector post member", exact: true })
    .selectOption(setup.post.id);
  await panel
    .getByRole("combobox", { name: "New connector schedule", exact: true })
    .selectOption("n10dhdg");
  await panel
    .getByRole("button", { name: "Create connector draft", exact: true })
    .click();
  let entry = await openEntry(panel, "E001");
  await point(entry, "E001 wood entry", [0.123456789, 0.75, 0]);
  await entry
    .getByRole("combobox", { name: "E001 wood entry units", exact: true })
    .selectOption("ft");
  await entry
    .getByRole("spinbutton", { name: "E001 wood entry Z", exact: true })
    .fill("0");
  await entry
    .getByRole("combobox", { name: "E001 wood entry units", exact: true })
    .selectOption("in");
  await expect(
    entry.getByRole("spinbutton", { name: "E001 wood entry X", exact: true }),
  ).toHaveValue("0.123456789");
  await entry
    .getByRole("button", {
      name: "E001 inward direction local Y negative",
      exact: true,
    })
    .click();
  await measured(entry, "E001", "0.75");
  await entry
    .getByRole("combobox", {
      name: "E001 wood-entry-to-tip depth units",
      exact: true,
    })
    .selectOption("ft");
  await expect(
    entry.getByRole("spinbutton", {
      name: "E001 wood-entry-to-tip depth",
      exact: true,
    }),
  ).toHaveValue("0.0625");
  entry = await openEntry(panel, "E003");
  await entry
    .getByRole("combobox", { name: "E003 wood entry units", exact: true })
    .selectOption("ft");
  await point(entry, "E003 wood entry", [-0.0625, 0, 0]);
  await entry
    .getByRole("button", {
      name: "E003 inward direction local X positive",
      exact: true,
    })
    .click();
  await measured(entry, "E003", "0.123456789");
  await panel
    .getByRole("button", { name: "Save connector plan", exact: true })
    .click();
  const nail = await draft(
      page,
      (actual) =>
        actual.connectorPlans[0]?.entries[2].measurements
          .woodEntryToTipDepth === 0.123456789,
    ),
    plan = nail.connectorPlans[0];
  expect(plan.entries[0].entranceLocal).toEqual([0.123456789, 0.75, 0]);
  expect(plan.entries[0].measurements.woodEntryToTipDepth).toBe(0.75);
  expect(plan.entries[2].entranceLocal).toEqual([-0.75, 0, 0]);
  expect(plan.entries[1].entranceLocal).toBeNull();
  expect(plan.entries[3].measurements.measuredAt).toBeNull();
  expect(nail.pieces).toEqual(before.pieces);
  expect(nail.supplies).toEqual([]);
  await panel.locator(".connector-purchases > summary").click();
  await expect(
    panel.locator("[data-product-id='simpson-n10dhdg-r']"),
  ).toContainText("4 reference units · 120 per purchase pack");
  await expect(panel).toContainText("Mounting fit remains pending");
  await panel
    .locator("[data-product-id='simpson-n10dhdg-r']")
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("phone-connector-purchase-reference.png"),
    fullPage: false,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await panel.getByText("Change reference schedule", { exact: true }).click();
  await panel
    .getByRole("combobox", { name: "Connector schedule", exact: true })
    .selectOption("sd9112");
  await panel
    .getByRole("button", {
      name: "Use selected connector schedule",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", { name: "Save connector plan", exact: true })
    .click();
  const screw = await draft(
    page,
    (actual) =>
      actual.connectorPlans[0]?.scheduleId === "sd9112" &&
      actual.connectorPlans[0].referenceHistory.length === 1,
  );
  expect(screw.connectorPlans[0].referenceHistory[0].previous.entries).toEqual(
    plan.entries,
  );
  expect(
    screw.connectorPlans[0].entries.every(
      (e) =>
        e.entranceLocal === null &&
        e.driveLocal === null &&
        e.measurements.woodEntryToTipDepth === null,
    ),
  ).toBe(true);
  expect(screw.pieces).toEqual(before.pieces);
  expect(screw.supplies).toEqual([]);
  await expect(page.getByTestId("connector-entry-marker")).toHaveCount(0);
  await expect(
    panel.locator("[data-product-id='simpson-sd9112r100']"),
  ).toContainText("4 reference units · 100 per purchase pack");
  const reopened = await saveReopen(page, screw);
  expect(reopened.connectorPlans).toEqual(screw.connectorPlans);
  expect((await editableExport(page)).connectorPlans).toEqual(
    screw.connectorPlans,
  );
});

test("a saved complete connector opens directly from connection review with its current preview across navigation and reopen", async ({
  page,
}) => {
  const setup = fixture(),
    initial = setup.project;
  initial.name = `SYNTHETIC saved complete connector ${uid().slice(0, 8)}`;
  const plan = makeConnectorPlan(initial, setup.base.id, setup.post.id, {
    name: "SYNTHETIC four entered wood paths",
  });
  for (const [index, entry] of plan.entries.entries()) {
    entry.entranceLocal =
      index < 2
        ? [index === 0 ? -4 : 4, 0.75, 0]
        : [-0.75, index === 2 ? -3 : 3, 0];
    entry.driveLocal = index < 2 ? [0, -1, 0] : [1, 0, 0];
    entry.measurements = {
      woodEntryToTipDepth: 1.125,
      pilotDiameter: 0.1,
      pilotDepth: 0.5,
      basis:
        "SYNTHETIC explicit user wood-entry evidence, not manufactured connector fit",
      measuredAt: "2026-11-16T10:00:00.000Z",
    };
  }
  const project = saveConnectorPlan(initial, plan),
    expected = connectorReviews(project)[0];
  expect(expected.state).toBe("paths-reviewed");
  expect(expected.entries.every((entry) => entry.tipWorld !== null)).toBe(true);
  let loaded = await load(page, project);
  const openFromReview = async () => {
    await page.getByRole("button", { name: /^Checks(?:\s+\d+)?$/ }).click();
    await page
      .getByRole("button", { name: "Review connection decisions", exact: true })
      .click();
    const review = page.getByRole("region", {
      name: "Connection review",
      exact: true,
    });
    await review
      .locator(`tr[data-plan-id='${plan.id}']`)
      .getByRole("button", { name: "Review C001", exact: true })
      .click();
    return page.getByRole("region", {
      name: "A21Z connector plans",
      exact: true,
    });
  };
  const expectCurrentPreview = async () => {
    await expect(page.getByTestId("connector-entry-marker")).toHaveCount(4);
    await expect(page.getByTestId("connector-tip-marker")).toHaveCount(4);
    await expect(page.getByTestId("connector-preview-banner")).toContainText(
      "C001",
    );
    for (const point of expected.entries) {
      await expect(
        page.locator(
          `[data-testid='connector-entry-marker'][data-entry-id='${point.entry.id}']`,
        ),
      ).toHaveAttribute("data-position", JSON.stringify(point.entranceWorld));
      await expect(
        page.locator(
          `[data-testid='connector-tip-marker'][data-entry-id='${point.entry.id}']`,
        ),
      ).toHaveAttribute("data-position", JSON.stringify(point.tipWorld));
    }
  };
  let panel = await openFromReview();
  await expect(panel.locator("details.connector-entry")).toHaveCount(4);
  await expectCurrentPreview();
  const exportedBefore = await editableExport(page);
  await panel
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Connection review", exact: true })
    .locator(`tr[data-plan-id='${plan.id}']`)
    .getByRole("button", { name: "Review C001", exact: true })
    .click();
  await expectCurrentPreview();
  expect(await editableExport(page)).toEqual(exportedBefore);
  loaded = await saveReopen(page, loaded);
  panel = await openFromReview();
  await expectCurrentPreview();
  const beforeInvalid = await editableExport(page),
    entry = await openEntry(panel, "E001");
  await openMeasurements(entry);
  const depth = entry.getByRole("spinbutton", {
    name: "E001 wood-entry-to-tip depth",
    exact: true,
  });
  await depth.fill("-0.25");
  await expect(panel.getByTestId("connector-draft-validation")).toContainText(
    "E001 wood-entry-to-tip depth",
  );
  await expect(page.getByTestId("connector-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("connector-tip-marker")).toHaveCount(0);
  expect(await editableExport(page)).toEqual(beforeInvalid);
  await depth.fill("1.125");
  await expectCurrentPreview();
  const unchanged = await draft(page, (actual) => actual.id === loaded.id);
  expect(unchanged.connectorPlans).toEqual(loaded.connectorPlans);
  expect(unchanged.pieces).toEqual(loaded.pieces);
});
