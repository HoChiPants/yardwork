import { expect, test, type Locator, type Page } from "@playwright/test";
import { blank, part, projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";
import { fastenerPurchaseSummary } from "../../src/fastenerPurchases";
import { findRetailerProduct } from "../../src/retailerCatalog";

const productId = "grk-r4-103101";
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
    await test.info().attach("last-fastener-project", {
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
      name: "synthetic-fastener-plan.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openPanel(page: Page, planName?: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan wood-fastener locations", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Wood fastener plans",
    exact: true,
  });
  await expect(panel).toBeVisible();
  if (planName) {
    const button = panel
      .locator(".attachment-plan-select")
      .filter({ hasText: planName });
    if ((await button.getAttribute("aria-expanded")) !== "true")
      await button.click();
  }
  return panel;
}
async function coordinates(location: Locator, label: string, values: number[]) {
  for (const [index, axis] of ["X", "Y", "Z"].entries())
    await location
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
        const saved = await response.json();
        return (
          JSON.stringify(saved.project.fastenerPlans) ===
            JSON.stringify(expected.fastenerPlans) &&
          JSON.stringify(saved.project.supplyInventory) ===
            JSON.stringify(expected.supplyInventory)
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

test("explicit screw locations review actual boards, purchase one hundred-pack, and retain stale references until refreshed after a cut", async ({
  page,
}) => {
  const project = blank(`SYNTHETIC fastener workflow ${uid().slice(0, 8)}`),
    stepId = project.steps[0].id,
    head = part(
      "Head-side plywood panel",
      "plywood",
      [12, 12, 0.75],
      [0, 6, 0.375],
      stepId,
      "Manual joint",
    ),
    receiver = part(
      "Receiving board",
      "stud",
      [1.5, 12, 3.5],
      [0, 6, -1.75],
      stepId,
      "Manual joint",
    );
  project.notes =
    "SYNTHETIC UI fixture. Every dimension, purchase observation and user measurement is illustrative; no physical, inventory or capacity claim.";
  project.pieces = [head, receiver];
  const before = await importProject(page, project),
    panel = await openPanel(page),
    planName = "SYNTHETIC board screw locations";
  await panel
    .getByRole("combobox", { name: "Fastener head-side member", exact: true })
    .selectOption(head.id);
  await panel
    .getByRole("combobox", { name: "Fastener receiving member", exact: true })
    .selectOption(receiver.id);
  await panel
    .getByRole("textbox", { name: "New fastener plan name", exact: true })
    .fill(planName);
  await panel
    .getByRole("button", { name: "Create fastener plan", exact: true })
    .click();
  const empty = await draft(
    page,
    (actual) => actual.fastenerPlans.length === 1,
  );
  expect(empty.fastenerPlans[0].locations).toEqual([]);
  expect(empty.fastenerPlans[0].measurements).toEqual({
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Add screw location", exact: true })
    .click();
  let location = panel.locator("details[aria-label='Fastener location F001']");
  for (const axis of ["X", "Y", "Z"]) {
    await expect(
      location.getByRole("spinbutton", {
        name: `F001 entry point ${axis}`,
        exact: true,
      }),
    ).toHaveValue("");
    await expect(
      location.getByRole("spinbutton", {
        name: `F001 drive direction ${axis}`,
        exact: true,
      }),
    ).toHaveValue("");
  }
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  await draft(
    page,
    (actual) =>
      actual.fastenerPlans[0].locations.length === 1 &&
      actual.fastenerPlans[0].locations[0].entranceLocal === null,
  );
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(0);
  location = panel.locator("details[aria-label='Fastener location F001']");
  await location
    .getByRole("spinbutton", { name: "F001 entry point X", exact: true })
    .fill("0.123456789");
  await location
    .getByRole("spinbutton", { name: "F001 drive direction Z", exact: true })
    .fill("-2");
  await expect(
    panel.getByRole("button", { name: "Save fastener plan", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await location
    .getByRole("button", { name: "Pick entrance in 3D", exact: true })
    .click();
  await expect(
    location.getByRole("button", {
      name: "Picking entrance in 3D…",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(
    location.getByRole("button", { name: "Pick entrance in 3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 entry point Y",
      exact: true,
    }),
  ).toHaveValue("");
  await location
    .getByRole("button", { name: "Pick entrance in 3D", exact: true })
    .click();
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw Error("The fastener entrance picker has no canvas.");
  await page.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 entry point Z",
      exact: true,
    }),
  ).not.toHaveValue("");
  const pickedLocal = await Promise.all(
    ["X", "Y", "Z"].map(async (axis) =>
      Number(
        await location
          .getByRole("spinbutton", {
            name: `F001 entry point ${axis}`,
            exact: true,
          })
          .inputValue(),
      ),
    ),
  );
  const pickedDrive = await Promise.all(
    ["X", "Y", "Z"].map(async (axis) =>
      Number(
        await location
          .getByRole("spinbutton", {
            name: `F001 drive direction ${axis}`,
            exact: true,
          })
          .inputValue(),
      ),
    ),
  );
  expect(pickedLocal.every(Number.isFinite)).toBe(true);
  expect(Math.abs(pickedLocal[0])).toBeLessThan(6);
  expect(Math.abs(pickedLocal[1])).toBeLessThan(6);
  expect(pickedLocal[2]).toBe(0.375);
  expect(pickedDrive).toEqual([0, 0, -1]);
  expect(Math.hypot(...pickedDrive)).toBe(1);
  await expect(
    panel.getByRole("button", { name: "Save fastener plan", exact: true }),
  ).toBeEnabled();
  // Picking changes the editor draft; scene markers still represent the saved plan.
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const picked = await draft(
    page,
    (actual) => actual.fastenerPlans[0].locations[0].entranceLocal !== null,
  );
  expect(picked.fastenerPlans[0].locations[0].entranceLocal).toEqual(
    pickedLocal,
  );
  expect(picked.fastenerPlans[0].locations[0].driveLocal).toEqual(pickedDrive);
  expect(picked.pieces).toEqual(before.pieces);
  expect(picked.joints).toEqual([]);
  expect(picked.fastenerPlans[0].label).toMatch(/^W\d{3,}$/);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveAttribute(
    "data-label",
    `${picked.fastenerPlans[0].label}/F001`,
  );
  // A second picked face must replace an intervening manual draft edit.
  location = panel.locator("details[aria-label='Fastener location F001']");
  await location
    .getByRole("spinbutton", { name: "F001 entry point X", exact: true })
    .fill("4.75");
  await location
    .getByRole("button", { name: "Pick entrance in 3D", exact: true })
    .click();
  const secondCanvas = await page.locator("canvas").boundingBox();
  if (!secondCanvas) throw Error("The second entrance pick has no canvas.");
  await page.mouse.click(
    secondCanvas.x + secondCanvas.width * 0.53,
    secondCanvas.y + secondCanvas.height / 2,
  );
  await expect(
    location.getByRole("spinbutton", {
      name: "F001 entry point X",
      exact: true,
    }),
  ).not.toHaveValue("4.75");
  const secondLocal = await Promise.all(
    ["X", "Y", "Z"].map(async (axis) =>
      Number(
        await location
          .getByRole("spinbutton", {
            name: `F001 entry point ${axis}`,
            exact: true,
          })
          .inputValue(),
      ),
    ),
  );
  expect(secondLocal.every(Number.isFinite)).toBe(true);
  expect(Math.abs(secondLocal[0])).toBeLessThan(6);
  expect(Math.abs(secondLocal[1])).toBeLessThan(6);
  expect(secondLocal[2]).toBe(0.375);
  expect(secondLocal).not.toEqual(pickedLocal);
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const pickedAgain = await draft(
    page,
    (actual) =>
      JSON.stringify(actual.fastenerPlans[0].locations[0].entranceLocal) ===
      JSON.stringify(secondLocal),
  );
  expect(pickedAgain.fastenerPlans[0].locations[0].driveLocal).toEqual([
    0, 0, -1,
  ]);
  // A subsequent numerical edit remains authoritative after consuming the pick nonce.
  location = panel.locator("details[aria-label='Fastener location F001']");
  await coordinates(location, "F001 entry point", [0.125, 0, 0.375]);
  await location
    .getByRole("button", { name: "Drive along local Z negative", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const undimensioned = await draft(
    page,
    (actual) =>
      actual.fastenerPlans[0].locations[0].driveLocal?.[2] === -1 &&
      actual.fastenerPlans[0].locations[0].entranceLocal?.[0] === 0.125,
  );
  expect(fastenerReviews(undimensioned)[0].locations[0].tipWorld).toBeNull();
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(1);
  await expect(page.getByTestId("fastener-orientation-label")).toContainText(
    "Direction only · tip unknown",
  );
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(0);
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await panel
    .getByRole("spinbutton", {
      name: "Surface-to-tip depth after seating",
      exact: true,
    })
    .fill("2.5");
  await expect(
    panel.getByRole("spinbutton", { name: "User pilot diameter", exact: true }),
  ).toHaveValue("");
  await expect(
    panel.getByRole("spinbutton", {
      name: "Deepest pilot drill-tip depth",
      exact: true,
    }),
  ).toHaveValue("");
  await panel
    .getByRole("textbox", { name: "Fastener measurement basis", exact: true })
    .fill(
      "SYNTHETIC proposed surface-to-tip measurement after seating; not manufacturer geometry or capacity review",
    );
  await panel
    .getByLabel("Fastener measurement date", { exact: true })
    .fill("2026-11-15T09:30");
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const measured = await draft(
      page,
      (actual) =>
        actual.fastenerPlans[0].measurements.surfaceToTipDepth === 2.5,
    ),
    review = fastenerReviews(measured)[0],
    path = review.locations[0];
  expect(review.state).toBe("path-reviewed");
  expect(review.activePointCount).toBe(1);
  expect(path.headExitDepth).toBe(0.75);
  expect(path.receiverEnterDepth).toBe(0.75);
  expect(path.receiverExitDepth).toBe(4.25);
  expect(path.gap).toBe(0);
  expect(path.penetration).toBe(1.75);
  expect(path.availableReceiverDepth).toBe(3.5);
  expect(path.tipWorld).toEqual([0.125, 6, -1.75]);
  expect(review.issues.some((issue) => issue.code === "source-conflict")).toBe(
    true,
  );
  expect(review.issues.some((issue) => issue.code === "pilot-pending")).toBe(
    true,
  );
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(1);
  await expect(panel).toContainText("source conflicts remain unresolved");
  const purchase = panel.locator(`[data-fastener-product-id='${productId}']`);
  await purchase
    .getByRole("button", { name: /^Add missing packs for/ })
    .click();
  const purchased = await draft(page, (actual) =>
    actual.supplies.some(
      (supply) => supply.productId === productId && supply.quantity === 1,
    ),
  );
  expect(purchased.pieces).toEqual(before.pieces);
  expect(purchased.joints).toEqual([]);
  await expect(
    purchase.getByRole("button", { name: /^Add missing packs for/ }),
  ).toBeDisabled();
  expect(
    fastenerPurchaseSummary(purchased).products.find(
      (row) => row.productId === productId,
    )!.selectedScrews,
  ).toBe(100);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const supplies = page.locator(".supplies-panel");
  if ((await supplies.getAttribute("open")) === null)
    await supplies.locator(":scope > summary").click();
  const row = supplies
    .locator(".supply-row")
    .filter({ hasText: findRetailerProduct(productId)!.name });
  await row
    .getByRole("button", {
      name: `Record supply snapshot for ${findRetailerProduct(productId)!.name}`,
      exact: true,
    })
    .click();
  const snapshot = page.locator(".supply-snapshot");
  await expect(
    snapshot.getByRole("textbox", { name: "Supply snapshot URL", exact: true }),
  ).toHaveValue(/203525228/);
  await snapshot
    .getByRole("spinbutton", {
      name: "Supply snapshot price per pack",
      exact: true,
    })
    .fill("23.99");
  await snapshot
    .getByRole("spinbutton", {
      name: "Supply snapshot available packs",
      exact: true,
    })
    .fill("4");
  await snapshot
    .getByRole("textbox", { name: "Supply snapshot store", exact: true })
    .fill("101");
  await snapshot
    .getByRole("textbox", { name: "Supply snapshot ZIP", exact: true })
    .fill("84121");
  await snapshot
    .getByRole("button", { name: "Record supply snapshot", exact: true })
    .click();
  const observed = await draft(page, (actual) =>
    actual.supplyInventory.some(
      (entry) =>
        entry.productId === productId &&
        entry.price === 23.99 &&
        entry.available === 4,
    ),
  );
  expect(
    observed.supplyInventory.find((entry) => entry.productId === productId)
      ?.retailerProductId,
  ).toBe("203525228");
  const reopened = await saveReopen(page, observed);
  expect(reopened.fastenerPlans).toEqual(observed.fastenerPlans);
  expect(reopened.pieces).toEqual(before.pieces);
  expect(reopened.supplyInventory).toEqual(observed.supplyInventory);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`.step-part[data-part-id='${receiver.id}']`).click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page.getByRole("combobox", { name: "Retained length units", exact: true }).selectOption("in");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("10");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  const cut = await draft(
    page,
    (actual) =>
      actual.pieces.find((piece) => piece.id === receiver.id)?.size[1] === 10 &&
      fastenerReviews(actual)[0].state === "stale",
  );
  expect(cut.fastenerPlans).toEqual(reopened.fastenerPlans);
  expect(fastenerReviews(cut)[0].activePointCount).toBe(0);
  expect(fastenerReviews(cut)[0].locations[0].tipWorld).toBeNull();
  const refreshedPanel = await openPanel(page, planName);
  await refreshedPanel
    .getByText("Review current part references", { exact: true })
    .click();
  await refreshedPanel
    .getByRole("button", { name: "Preview reference refresh", exact: true })
    .click();
  await expect(
    refreshedPanel.locator("[aria-label='Fastener reference refresh preview']"),
  ).toContainText("Measurements pending");
  await expect(
    refreshedPanel.locator("[aria-label='Fastener reference refresh preview']"),
  ).toContainText("current seating and pilot measurements reset to unknown");
  await refreshedPanel
    .getByRole("button", { name: "Apply reference refresh", exact: true })
    .click();
  const refreshed = await draft(
    page,
    (actual) =>
      fastenerReviews(actual)[0].state === "needs-measurements" &&
      actual.fastenerPlans[0].receiver.geometryFingerprint !==
        cut.fastenerPlans[0].receiver.geometryFingerprint,
  );
  expect(refreshed.fastenerPlans[0].locations).toEqual(
    cut.fastenerPlans[0].locations,
  );
  expect(refreshed.fastenerPlans[0].measurements).toEqual({
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  const archivedRefresh = refreshed.fastenerPlans[0].referenceHistory.at(-1)!;
  expect(archivedRefresh.kind).toBe("refresh");
  expect(archivedRefresh.previous.measurements).toEqual(
    cut.fastenerPlans[0].measurements,
  );
  expect(archivedRefresh.previous.locations).toEqual(
    cut.fastenerPlans[0].locations,
  );
  expect(fastenerReviews(refreshed)[0].locations[0].tipWorld).toBeNull();
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-orientation-label")).toContainText(
    "Direction only · tip unknown",
  );
  expect(refreshed.pieces).toEqual(cut.pieces);
  expect(refreshed.supplies).toEqual(observed.supplies);
  expect(refreshed.supplyInventory).toEqual(observed.supplyInventory);
  expect(refreshed.joints).toEqual([]);
  expect((await saveReopen(page, refreshed)).fastenerPlans).toEqual(
    refreshed.fastenerPlans,
  );
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  const guided = await draft(page, (actual) =>
    actual.steps.some(
      (step) => step.generated?.kind === "wood-fastener-preparation",
    ),
  );
  const prep = guided.steps.find(
    (step) => step.generated?.kind === "wood-fastener-preparation",
  )!;
  await page
    .locator(".step-track button")
    .filter({ hasText: prep.title })
    .click();
  await page
    .getByRole("button", { name: "Edit wood-fastener locations", exact: true })
    .click();
  await expect(
    page.locator("[aria-label='Wood fastener plans']"),
  ).toBeVisible();
});

test("phone entry and depth units preserve exact values, custom drive needs normalization, and deleted location labels are not reused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = blank(`SYNTHETIC precise fasteners ${uid().slice(0, 8)}`),
    stepId = project.steps[0].id;
  project.pieces = [
    part(
      "Head panel",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 5, 0.3515],
      stepId,
      "Manual panels",
    ),
    part(
      "Receiving panel",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 5, -0.6015],
      stepId,
      "Manual panels",
    ),
  ];
  let plan = addFastenerLocation(
    makeFastenerPlan(project, project.pieces[0].id, project.pieces[1].id, {
      name: "SYNTHETIC precise screw path",
    }),
  );
  plan.locations[0].entranceLocal = [0.123456789, 0.234567891, 0.3515];
  plan.locations[0].driveLocal = [0, 0, -1];
  plan.measurements.surfaceToTipDepth = 1.234567891;
  plan.measurements.basis =
    "SYNTHETIC high-precision input from the entry surface";
  plan.measurements.measuredAt = "2026-11-15T09:30:00.000Z";
  const seeded = saveFastenerPlan(project, plan);
  await importProject(page, seeded);
  const panel = await openPanel(page, plan.name),
    location = panel.locator("details[aria-label='Fastener location F001']");
  await location
    .getByRole("combobox", { name: "F001 entry point units", exact: true })
    .selectOption("ft");
  await location
    .getByRole("spinbutton", { name: "F001 entry point Y", exact: true })
    .fill("0.05");
  await location
    .getByRole("spinbutton", { name: "F001 drive direction Z", exact: true })
    .fill("-2");
  await expect(
    panel.getByRole("button", { name: "Save fastener plan", exact: true }),
  ).toBeDisabled();
  await location
    .getByRole("button", { name: "Normalize this direction", exact: true })
    .click();
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  await panel
    .getByRole("combobox", {
      name: "Surface-to-tip depth after seating units",
      exact: true,
    })
    .selectOption("ft");
  await panel
    .getByRole("combobox", {
      name: "Surface-to-tip depth after seating units",
      exact: true,
    })
    .selectOption("in");
  await expect(
    panel.getByRole("spinbutton", {
      name: "Surface-to-tip depth after seating",
      exact: true,
    }),
  ).toHaveValue("1.234567891");
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const precise = await draft(
    page,
    (actual) =>
      actual.fastenerPlans[0].locations[0].entranceLocal?.[1] === 0.05 * 12,
  );
  expect(precise.fastenerPlans[0].locations[0].entranceLocal).toEqual([
    0.123456789,
    0.05 * 12,
    0.3515,
  ]);
  expect(precise.fastenerPlans[0].locations[0].driveLocal).toEqual([0, 0, -1]);
  expect(precise.fastenerPlans[0].measurements.surfaceToTipDepth).toBe(
    1.234567891,
  );
  expect(fastenerReviews(precise)[0].state).toBe("path-reviewed");
  await panel.getByRole("button", { name: "Remove F001", exact: true }).click();
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  await draft(page, (actual) => actual.fastenerPlans[0].locations.length === 0);
  await panel
    .getByRole("button", { name: "Add screw location", exact: true })
    .click();
  const newLocation = panel.locator(
    "details[aria-label='Fastener location F002']",
  );
  await expect(newLocation).toBeVisible();
  for (const axis of ["X", "Y", "Z"])
    await expect(
      newLocation.getByRole("spinbutton", {
        name: `F002 entry point ${axis}`,
        exact: true,
      }),
    ).toHaveValue("");
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const pending = await draft(
    page,
    (actual) => actual.fastenerPlans[0].locations[0]?.label === "F002",
  );
  expect(pending.fastenerPlans[0].nextLocationNumber).toBe(3);
  await expect(page.getByTestId("fastener-entry-marker")).toHaveCount(0);
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(0);
  await panel
    .getByRole("combobox", { name: "Recorded screw product", exact: true })
    .selectOption("grk-cabinet-113079");
  await expect(
    panel.getByRole("button", { name: "Save fastener plan", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Use selected screw product", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const changedProduct = await draft(
    page,
    (actual) => actual.fastenerPlans[0].productId === "grk-cabinet-113079",
  );
  expect(changedProduct.fastenerPlans[0].measurements).toEqual({
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  expect(changedProduct.fastenerPlans[0].locations[0].label).toBe("F002");
  const productReview =
    changedProduct.fastenerPlans[0].referenceHistory.at(-1)!;
  expect(productReview.kind).toBe("refresh");
  expect(productReview.previous.productId).toBe(
    pending.fastenerPlans[0].productId,
  );
  expect(productReview.previous.measurements).toEqual(
    pending.fastenerPlans[0].measurements,
  );
  expect(productReview.previous.locations).toEqual(
    pending.fastenerPlans[0].locations,
  );
  expect(productReview.next.productId).toBe("grk-cabinet-113079");
  expect(changedProduct.pieces).toEqual(seeded.pieces);
  expect(changedProduct.supplies).toEqual([]);
  expect(changedProduct.joints).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
