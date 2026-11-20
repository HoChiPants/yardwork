import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema, uid, type Project } from "../../src/model";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import {
  attachmentReviews,
  makeShelfPinPlan,
  saveShelfPinPlan,
} from "../../src/attachments";
import { attachmentScheduleCsv } from "../../src/attachmentCsv";
import { everbiltShelfPin } from "../../src/shelfPinReference";

function fixture(
  name = "Support planning",
  retailer: Project["retailer"] = "home-depot",
) {
  const project = createBuildStudy(
    "shelves",
    {
      ...defaultBuildStudyParameters("shelves"),
      width: 36,
      depth: 18,
      height: 72,
    },
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  ).project;
  return { ...project, name, retailer };
}
function seeded(
  name: string,
  roles = ["shelf-1"],
  retailer: Project["retailer"] = "home-depot",
) {
  const project = fixture(name, retailer),
    entry = project.ideaBindings[0].entries[0];
  return saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, entry.id, {
      name: "Selected shelf supports",
      shelfRoles: roles,
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
}
async function draft(
  page: Page,
  expected?: (project: Project) => boolean,
): Promise<Project> {
  let previous: string | null = null,
    changed = Date.now();
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate(
          (draftKey) => localStorage.getItem(draftKey),
          CURRENT_DRAFT_KEY,
        );
        if (raw !== previous) {
          previous = raw;
          changed = Date.now();
        }
        return (
          !!raw &&
          Date.now() - changed > 400 &&
          (!expected || expected(projectSchema.parse(JSON.parse(raw).project)))
        );
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBe(true);
  return projectSchema.parse(JSON.parse(previous!).project);
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
      name: "support-plan.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openSupports(page: Page) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan shelf supports", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Shelf support plans",
    exact: true,
  });
  await expect(panel).toBeVisible();
  return panel;
}
async function selectPlan(page: Page, name = "Selected shelf supports") {
  const panel = await openSupports(page);
  await panel.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  return panel;
}
async function saveReopen(page: Page, name: string) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: name })
    .click();
  return draft(page);
}
async function reviewDemandFromList(page: Page, copy: string) {
  await page.getByRole("button", { name: "List", exact: true }).click();
  const notice = page.locator(".attachment-purchase-notice");
  await expect(
    notice.getByText("Planned shelf-pin purchases", { exact: true }),
  ).toBeVisible();
  await expect(notice).toContainText(copy);
  await notice
    .getByRole("button", {
      name: "Review shelf support purchases",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "Shelf support plans",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const plan = panel.locator(".attachment-plan-select").first();
  if ((await plan.getAttribute("aria-expanded")) === "false")
    await plan.click();
  return panel;
}

test("explicit shelf targets keep unknown measurements blank and preserve partial user evidence after saving", async ({
  page,
}) => {
  const initial = fixture(`Measured supports ${Date.now()}`),
    before = await importProject(page, initial),
    panel = await openSupports(page);
  await panel
    .getByRole("button", { name: "Create a shelf support plan", exact: true })
    .click();
  const form = panel.getByTestId("attachment-create");
  await expect(form.getByRole("combobox", { name: "Shelf pin product" })).toHaveValue(
    everbiltShelfPin.productId,
  );
  await expect(
    form.getByRole("button", { name: "Create 0 support targets", exact: true }),
  ).toBeDisabled();
  await form
    .getByRole("checkbox", { name: "Plan supports for Shelf 1", exact: true })
    .check();
  await form
    .getByRole("textbox", { name: "New support plan name", exact: true })
    .fill("Measured shelf targets");
  await form
    .getByRole("combobox", { name: "Front inset units", exact: true })
    .selectOption("ft");
  await form
    .getByRole("spinbutton", { name: "Front inset", exact: true })
    .fill("0.25");
  await expect(
    form.getByRole("combobox", { name: "Rear inset units", exact: true }),
  ).toHaveValue("in");
  await form
    .getByRole("button", { name: "Create 4 support targets", exact: true })
    .click();
  let current = await draft(page);
  expect(current.attachmentPlans).toHaveLength(1);
  expect(current.attachmentPlans[0].productId).toBe(everbiltShelfPin.productId);
  expect(current.attachmentPlans[0].points).toHaveLength(4);
  expect(current.attachmentPlans[0].layout.frontInset).toBe(3);
  expect(current.attachmentPlans[0].layout.rearInset).toBe(2);
  expect(current.pieces).toEqual(before.pieces);
  expect(current.joints).toEqual(before.joints);
  await expect(page.getByTestId("attachment-target-marker")).toHaveCount(4);
  await expect(page.getByTestId("attachment-hole-marker")).toHaveCount(0);
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  for (const label of [
    "Pin insertion into side panel",
    "Pin bearing reach",
    "Shelf underside above pin axis",
    "Bore depth at full diameter",
    "Deepest drill-tip depth",
  ])
    await expect(
      panel.getByRole("spinbutton", { name: label, exact: true }),
    ).toHaveValue("");
  const unknown = structuredClone(current.attachmentPlans);
  await panel
    .getByRole("spinbutton", {
      name: "Pin insertion into side panel",
      exact: true,
    })
    .fill("0.25");
  await panel
    .getByRole("button", { name: "Save measurements and name", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "measurement basis and date",
  );
  expect((await draft(page)).attachmentPlans).toEqual(unknown);
  await panel
    .getByRole("textbox", { name: "Support measurement basis", exact: true })
    .fill("Measured actual pin with calipers; drilling setup still unknown");
  await panel
    .getByLabel("Support measurement date", { exact: true })
    .fill("2026-11-16T09:30");
  await panel
    .getByRole("button", { name: "Save measurements and name", exact: true })
    .click();
  current = await draft(page);
  const measurement = current.attachmentPlans[0].measurements;
  expect(measurement.pinInsertionDepth).toBe(0.25);
  expect(measurement.bearingReach).toBeNull();
  expect(measurement.bearingOffset).toBeNull();
  expect(measurement.fullDiameterBoreDepth).toBeNull();
  expect(measurement.deepestDrillTipDepth).toBeNull();
  expect(measurement.measuredAt).toBeTruthy();
  expect(attachmentReviews(current)[0].state).toBe("needs-measurements");
  await reviewDemandFromList(
    page,
    "4 planned pins · Required packs: 1 · Selected packs: 0 · Missing packs: 1.",
  );
  await panel.getByText("Pin purchase plan · 4 planned pins", { exact: true }).click();
  await expect(panel).toContainText("Each pack contains 48 pins.");
  await expect(panel.getByRole("link", { name: "Home Depot reference 204273819" })).toHaveAttribute(
    "href",
    everbiltShelfPin.url,
  );
  await panel.getByRole("button", { name: "Add 1 missing pin pack", exact: true }).click();
  current = await draft(page, ({ supplies }) =>
    supplies.some(({ productId, quantity }) => productId === everbiltShelfPin.productId && quantity === 1),
  );
  expect(current.supplies).toHaveLength(1);
  expect(current.pieces).toEqual(before.pieces);
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await panel
    .getByRole("spinbutton", {
      name: "Pin insertion into side panel",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(850); // Let the interactive camera framing finish before visual QA.
  await page.screenshot({
    path: test.info().outputPath("attachment-support-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /^Shelf support schedule CSV/ })
    .click();
  const download = await pendingDownload,
    path = await download.path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, "utf8");
  expect(csv).toBe(attachmentScheduleCsv(current));
  expect(csv).toContain("Bearing target mount-local X (in)");
  expect(csv).toContain(current.attachmentPlans[0].points[0].mount.pieceId);
  expect(csv).toContain('"needs-measurements"');
  expect(csv).toContain(`"${everbiltShelfPin.productId}"`);
  expect(csv).toContain('"PENDING"');
  await page.keyboard.press("Escape");
  const reopened = await saveReopen(page, initial.name);
  expect(reopened.attachmentPlans).toEqual(current.attachmentPlans);
  expect(reopened.supplies).toEqual(current.supplies);
  expect(reopened.pieces).toEqual(before.pieces);
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.getByTestId("attachment-target-marker")).toHaveCount(0);
});

test("an angled shelf support keeps drill marks pending until its test bore is recorded", async ({ page }) => {
  const original = fixture(`Angled pin test bore ${uid().slice(0, 8)}`);
  const plan = makeShelfPinPlan(original, original.ideaBindings[0].entries[0].id, {
    name: "Angled support layout",
    productId: "everbilt-802064",
    shelfRoles: ["shelf-1"],
    layout: { system: "custom", frontInset: 2, rearInset: 2, datumHeight: null },
  });
  const initial = saveShelfPinPlan(original, plan);
  const before = await importProject(page, initial);
  const panel = await selectPlan(page, plan.name);
  await panel.getByText("User measurements · unknown values stay blank", { exact: true }).click();
  await expect(panel).toContainText("linked instructions specify 3/16 in");
  const testBore = panel.getByRole("checkbox", { name: "Confirmed the delivered pin fits a 5 mm test bore in matching stock" });
  await expect(testBore).not.toBeChecked();
  await panel.getByRole("spinbutton", { name: "Shelf underside above pin axis", exact: true }).fill("0.05");
  await panel.getByRole("textbox", { name: "Support measurement basis" }).fill("Sample only: offset measured with calipers on the delivered 802064 pin");
  await panel.getByLabel("Support measurement date").fill("2026-11-19T09:30");
  const save = panel.getByRole("button", { name: "Save measurements and name", exact: true });
  await save.click();
  await draft(page, (project) => project.attachmentPlans[0].measurements.bearingOffset === 0.05);
  await expect(page.getByTestId("attachment-target-marker")).toHaveCount(4);
  await expect(page.getByTestId("attachment-hole-marker")).toHaveCount(0);
  await panel.getByText("User measurements · unknown values stay blank", { exact: true }).click();
  await testBore.check();
  await panel.getByRole("textbox", { name: "Support measurement basis" }).fill("Sample only: measured offset and checked fit in a 5 mm bore in a panel offcut");
  await save.click();
  const saved = await draft(page, (project) => project.attachmentPlans[0].measurements.fitTestConfirmed === true);
  await expect(page.getByTestId("attachment-hole-marker")).toHaveCount(4);
  const reopened = await saveReopen(page, initial.name);
  expect(reopened.attachmentPlans).toEqual(saved.attachmentPlans);
  expect(reopened.pieces).toEqual(before.pieces);
  expect(reopened.supplies).toEqual([]);
});

test("Kreg row datum and partial bearing offset stay planned and never create installed geometry", async ({
  page,
}) => {
  const initial = seeded("Kreg datum targets"),
    before = await importProject(page, initial),
    panel = await selectPlan(page);
  await panel.getByText("Layout and shelf selection", { exact: true }).click();
  await panel
    .getByRole("combobox", { name: "Support row layout", exact: true })
    .selectOption("kreg-32mm");
  await expect(
    panel.getByRole("spinbutton", {
      name: "First hole-center datum from side bottom",
      exact: true,
    }),
  ).toHaveValue("");
  await panel
    .getByRole("combobox", {
      name: "First hole-center datum from side bottom units",
      exact: true,
    })
    .selectOption("ft");
  await panel
    .getByRole("spinbutton", {
      name: "First hole-center datum from side bottom",
      exact: true,
    })
    .fill("0.5");
  await panel
    .getByRole("button", { name: "Review layout changes", exact: true })
    .click();
  await expect(
    panel.getByRole("region", { name: "Support refresh preview", exact: true }),
  ).toBeVisible();
  expect((await draft(page)).attachmentPlans).toEqual(before.attachmentPlans);
  await panel
    .getByRole("button", { name: "Confirm support refresh", exact: true })
    .click();
  let current = await draft(page);
  expect(current.attachmentPlans[0].layout.system).toBe("kreg-32mm");
  expect(current.attachmentPlans[0].layout.datumHeight).toBe(6);
  expect(current.attachmentPlans[0].measurements.bearingOffset).toBeNull();
  await expect(page.getByTestId("attachment-hole-marker")).toHaveCount(0);
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await panel
    .getByRole("spinbutton", {
      name: "Shelf underside above pin axis",
      exact: true,
    })
    .fill("0.1");
  await panel
    .getByRole("textbox", { name: "Support measurement basis", exact: true })
    .fill("User measured bearing offset on the selected pin");
  await panel
    .getByLabel("Support measurement date", { exact: true })
    .fill("2026-11-16T10:00");
  await panel
    .getByRole("button", { name: "Save measurements and name", exact: true })
    .click();
  current = await draft(page);
  expect(current.attachmentPlans[0].measurements.bearingOffset).toBe(0.1);
  expect(
    current.attachmentPlans[0].measurements.fullDiameterBoreDepth,
  ).toBeNull();
  expect(current.pieces).toEqual(before.pieces);
  expect(current.joints).toEqual(before.joints);
  await expect(page.getByTestId("attachment-hole-marker")).toHaveCount(4);
  expect(attachmentReviews(current)[0].state).not.toBe("geometry-checked");
});

test("regenerated bookcase members leave saved targets stale until a reviewed refresh and support undo", async ({
  page,
}) => {
  const initial = seeded("Refresh support references"),
    before = await importProject(page, initial),
    oldPlan = structuredClone(before.attachmentPlans[0]);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Revise design ${before.ideaBindings[0].title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("spinbutton", { name: "casework-shelves width", exact: true })
    .fill("42");
  await page
    .getByRole("button", { name: "Apply design changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resized = await draft(page, (p) => {
    const spec = p.ideaBindings[0]?.entries[0]?.spec;
    return (
      spec?.type === "structure" &&
      spec.structure.kind === "casework-shelves" &&
      spec.structure.parameters.width === 42
    );
  });
  expect(resized.attachmentPlans[0]).toEqual(oldPlan);
  expect(attachmentReviews(resized)[0].state).toBe("stale");
  const panel = await selectPlan(page);
  await expect(page.getByTestId("attachment-target-marker")).toHaveCount(4);
  await expect(
    page.getByTestId("attachment-target-marker").first(),
  ).toHaveAttribute("data-state", "stale");
  await panel
    .getByRole("button", { name: "Refresh from current geometry", exact: true })
    .click();
  const preview = panel.getByRole("region", {
    name: "Support refresh preview",
    exact: true,
  });
  await expect(preview).toContainText("4 targets change");
  await expect(preview).toContainText("part reference changes");
  expect((await draft(page)).attachmentPlans[0]).toEqual(oldPlan);
  await panel
    .getByRole("button", { name: "Keep saved targets", exact: true })
    .click();
  expect((await draft(page)).attachmentPlans[0]).toEqual(oldPlan);
  await panel
    .getByRole("button", { name: "Refresh from current geometry", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Confirm support refresh", exact: true })
    .click();
  const refreshed = await draft(
    page,
    (p) =>
      p.attachmentPlans[0]?.points[0]?.mount.pieceId !==
      oldPlan.points[0].mount.pieceId,
  );
  expect(refreshed.attachmentPlans[0].id).toBe(oldPlan.id);
  expect(refreshed.attachmentPlans[0].points.map((p) => p.id)).toEqual(
    oldPlan.points.map((p) => p.id),
  );
  expect(attachmentReviews(refreshed)[0].stale).toBe(false);
  expect(refreshed.pieces).toEqual(resized.pieces);
  await page.keyboard.press("Meta+z");
  const undone = await draft(
    page,
    (p) =>
      p.attachmentPlans[0]?.points[0]?.mount.pieceId ===
      oldPlan.points[0].mount.pieceId,
  );
  expect(undone.attachmentPlans[0]).toEqual(oldPlan);
  expect(attachmentReviews(undone)[0].stale).toBe(true);
  expect(undone.pieces).toEqual(resized.pieces);
});

test.describe("phone support purchases", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("planned demand adds only explicit missing purchase packs and keeps the retailer gate", async ({
    page,
  }) => {
    const initial = seeded(
        "Phone support purchase",
        ["shelf-1", "shelf-2"],
        "lowes",
      ),
      before = await importProject(page, initial),
      panel = await selectPlan(page);
    await panel
      .getByText("Pin purchase plan · 8 planned pins", { exact: true })
      .click();
    await expect(panel).toContainText(
      "8 planned pins · 1 packs required · 0 packs selected",
    );
    await panel
      .getByRole("button", { name: "Add 1 missing pin pack", exact: true })
      .click();
    const purchased = await draft(page, (project) =>
      project.supplies.some(
        (selection) =>
          selection.productId === "kreg-kma-5mpin" && selection.quantity === 1,
      ),
    );
    expect(purchased.supplies).toHaveLength(1);
    expect(purchased.supplies[0].productId).toBe("kreg-kma-5mpin");
    expect(purchased.supplies[0].quantity).toBe(1);
    expect(purchased.pieces).toEqual(before.pieces);
    expect(purchased.joints).toEqual(before.joints);
    expect(purchased.toolSelections).toEqual(before.toolSelections);
    await reviewDemandFromList(
      page,
      "8 planned pins · Required packs: 1 · Selected packs: 1 · Missing packs: 0.",
    );
    const purchaseDetails = panel.locator(".attachment-purchases");
    if ((await purchaseDetails.getAttribute("open")) === null)
      await purchaseDetails.locator("summary").first().click();
    await expect(
      panel.getByRole("button", {
        name: "Add 0 missing pin packs",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(panel).toContainText("12 pins remain unallocated");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await panel
      .getByRole("button", { name: "Add 0 missing pin packs", exact: true })
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(850);
    await page.screenshot({
      path: "test-results/attachments-phone-purchase.png",
      fullPage: true,
    });
    const hd = seeded("Retailer-gated support purchase");
    await importProject(page, hd);
    const blocked = await selectPlan(page);
    await blocked
      .getByText("Pin purchase plan · 4 planned pins", { exact: true })
      .click();
    await expect(
      blocked.getByRole("button", {
        name: "Add 1 missing pin pack",
        exact: true,
      }),
    ).toBeDisabled();
    expect((await draft(page)).supplies).toHaveLength(0);
  });
});
