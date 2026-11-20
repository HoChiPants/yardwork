import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile as readDownload } from "node:fs/promises";
import {
  blank,
  part,
  projectSchema,
  uid,
  type Piece,
  type Project,
} from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";
import { makeConnectorPlan, saveConnectorPlan } from "../../src/connectors";
import { fastenerPurchaseSummary } from "../../src/fastenerPurchases";
import { findRetailerProduct } from "../../src/retailerCatalog";
import { bom, guideMarkdown, shoppingCsv } from "../../src/engine";
import { guideIsCurrent } from "../../src/guide";
import { fastenerScheduleCsv } from "../../src/fastenerCsv";
import { supplyRows } from "../../src/supplies";
import { toolChecklist } from "../../src/tools";

test.setTimeout(120000);
const csvId = "simpson-csvz3r70",
  dsvId = "simpson-dsvt3r70";
const physical = ({ stepId: _step, ...piece }: Piece) => piece;
function installGuard(page: Page) {
  const errors: string[] = [],
    plannerRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /\/api\/(planner|assistant|chat|generate)(?:[/?]|$)/.test(request.url())
    )
      plannerRequests.push(request.url());
  });
  return { errors, plannerRequests };
}
async function draft(
  page: Page,
  matches: (project: Project) => boolean,
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
          return !!observed && matches(observed);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-simpson-project", {
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
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "synthetic-simpson-70.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openPanel(page: Page, planId?: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan wood-fastener locations", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Wood fastener plans",
    exact: true,
  });
  await expect(panel).toBeVisible();
  if (planId) {
    const selector = panel.locator(
      `[data-fastener-plan-id='${planId}'] .attachment-plan-select`,
    );
    if ((await selector.getAttribute("aria-expanded")) !== "true")
      await selector.click();
  }
  return panel;
}
async function coordinates(location: Locator, label: string, values: number[]) {
  for (const [index, axis] of ["X", "Y", "Z"].entries())
    await location
      .getByRole("spinbutton", { name: `${label} ${axis}`, exact: true })
      .fill(String(values[index]));
}
async function capture(page: Page, target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded();
  const path = test.info().outputPath(name);
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await test.info().attach(name, { path, contentType: "image/png" });
}
async function generate(page: Page) {
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .locator(".build-timeline")
    .getByRole("button", { name: /^(Generate build guide|Regenerate guide)$/ })
    .click();
  return draft(page, guideIsCurrent);
}
async function exportText(page: Page, title: string) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(`^${title}\\b`) })
    .click();
  const download = await pending,
    path = await download.path();
  if (!path) throw Error(`No ${title} download was produced`);
  const text = await readDownload(path, "utf8");
  await test.info().attach(download.suggestedFilename(), {
    body: Buffer.from(text),
    contentType:
      title === "Editable project"
        ? "application/json"
        : title.includes("CSV") || title === "Shopping list"
          ? "text/csv"
          : "text/markdown",
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return text;
}
async function saveReopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        if (!response.ok()) return false;
        const record = await response.json();
        return (
          JSON.stringify(record.project.fastenerPlans) ===
            JSON.stringify(expected.fastenerPlans) &&
          JSON.stringify(record.project.supplies) ===
            JSON.stringify(expected.supplies) &&
          JSON.stringify(record.project.steps) ===
            JSON.stringify(expected.steps)
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
async function openSupplies(page: Page, id: string) {
  await page.getByRole("button", { name: "List", exact: true }).click();
  const panel = page.locator(".supplies-panel");
  if ((await panel.getAttribute("open")) === null)
    await panel.locator(":scope > summary").click();
  const row = panel.locator(`[data-supply-product-id='${id}']`);
  await expect(row).toHaveCount(1);
  return row;
}
async function snapshot(
  page: Page,
  row: Locator,
  id: string,
  price: string,
  packs: string,
  retailerProductId: string,
) {
  await row
    .getByRole("button", {
      name: `Record supply snapshot for ${findRetailerProduct(id)!.name}`,
      exact: true,
    })
    .click();
  const form = page.locator(".supply-snapshot");
  await expect(
    form.getByRole("textbox", { name: "Supply snapshot URL", exact: true }),
  ).toHaveValue(new RegExp(`/${retailerProductId}$`));
  await form
    .getByRole("spinbutton", {
      name: "Supply snapshot price per pack",
      exact: true,
    })
    .fill(price);
  await form
    .getByRole("spinbutton", {
      name: "Supply snapshot available packs",
      exact: true,
    })
    .fill(packs);
  await form
    .getByRole("textbox", { name: "Supply snapshot store", exact: true })
    .fill("SYNTHETIC-UT");
  await form
    .getByRole("textbox", { name: "Supply snapshot ZIP", exact: true })
    .fill("84121");
  await form
    .getByRole("button", { name: "Record supply snapshot", exact: true })
    .click();
  return draft(page, (actual) =>
    actual.supplyInventory.some(
      (observation) =>
        observation.productId === id &&
        observation.price === Number(price) &&
        observation.available === Number(packs),
    ),
  );
}
function parsedCsv(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) =>
      [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) =>
        match[1].replaceAll('""', '"'),
      ),
    );
}
function assertShoppingLine(
  text: string,
  productId: string,
  boxes: number,
  price: string,
  total: string,
) {
  const rows = parsedCsv(text).filter((row) => row[1] === productId);
  expect(rows).toHaveLength(1);
  expect(rows[0][2]).toBe(String(boxes));
  expect(rows[0][3]).toBe("70-screw box");
  expect(rows[0][4]).toBe(price);
  expect(rows[0][5]).toBe(total);
  expect(rows[0][16]).toContain("70 × Simpson");
}
function dsvFixture() {
  let p = projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  p.name = `SYNTHETIC DSV71 purchase workflow ${uid().slice(0, 8)}`;
  p.retailer = "lowes";
  p.store = "SYNTHETIC-UT";
  p.notes =
    "SYNTHETIC software fixture only: explicit numerical wood paths are not measured hardware, real exposure, pilot instructions, stock observations or installation/capacity approval.";
  const legs = p.pieces.filter((piece) => piece.designRole === "leg");
  p = saveConnectorPlan(p, makeConnectorPlan(p, legs[0].id, legs[1].id));
  const step = p.steps[0].id,
    head = part(
      "SYNTHETIC .703-in entry strip",
      "plytanium-703",
      [0.703, 90, 8],
      [160.3515, 45, 0],
      step,
      "SYNTHETIC numerical joint",
    ),
    receiver = part(
      "SYNTHETIC wood receiver",
      "stud",
      [3.5, 90, 1.5],
      [162.453, 45, 0],
      step,
      "SYNTHETIC numerical joint",
    );
  p = { ...p, pieces: [...p.pieces, head, receiver] };
  let plan = makeFastenerPlan(p, head.id, receiver.id, {
    productId: dsvId,
    name: "SYNTHETIC71 explicitly entered DSV paths",
  });
  for (let i = 0; i < 71; i++) {
    plan = addFastenerLocation(plan);
    plan.locations[i].entranceLocal = [-0.3515, -40 + i * 0.8, 0];
    plan.locations[i].driveLocal = [1, 0, 0];
  }
  plan.measurements = {
    surfaceToTipDepth: 1.375,
    pilotDiameter: 0.0625,
    pilotDepth: 1.5,
    basis:
      "SYNTHETIC entered surface-to-tip and deepest pilot-tip data for software qualification; not delivered screw geometry or installation guidance",
    measuredAt: "2026-11-17T15:00:00.000Z",
  };
  p = saveFastenerPlan(p, plan);
  const review = fastenerReviews(p).find(
    (review) => review.plan.id === plan.id,
  )!;
  expect(review.activePointCount).toBe(71);
  expect(review.state).toBe("path-reviewed");
  expect(p.toolSelections).toEqual([]);
  return { project: p, planId: plan.id };
}

test("CSV three-inch choice starts empty and unknown, then saves one explicit pending location and one exact70-pack without duplicate purchase rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { errors, plannerRequests } = installGuard(page),
    p = blank(`SYNTHETIC CSV70 workflow ${uid().slice(0, 8)}`),
    step = p.steps[0].id;
  p.store = "SYNTHETIC-UT";
  p.notes =
    "SYNTHETIC software measurements and purchase snapshots only; no delivered screw, store stock, exposure or installed joint claim.";
  const head = part(
      "SYNTHETIC .703 entry panel",
      "plytanium-703",
      [12, 12, 0.703],
      [0, 6, 0.3515],
      step,
      "SYNTHETIC joint",
    ),
    receiver = part(
      "SYNTHETIC receiving wood",
      "stud",
      [1.5, 12, 3.5],
      [0, 6, -1.75],
      step,
      "SYNTHETIC joint",
    );
  p.pieces = [head, receiver];
  const before = await importProject(page, p),
    panel = await openPanel(page);
  await panel
    .getByRole("combobox", { name: "Fastener head-side member", exact: true })
    .selectOption(head.id);
  await panel
    .getByRole("combobox", { name: "Fastener receiving member", exact: true })
    .selectOption(receiver.id);
  await expect(
    panel.getByRole("combobox", { name: "New screw product", exact: true }),
  ).toHaveValue("grk-r4-103101");
  await panel
    .getByRole("combobox", { name: "New screw product", exact: true })
    .selectOption(csvId);
  await panel
    .getByRole("textbox", { name: "New fastener plan name", exact: true })
    .fill("SYNTHETIC pending CSV entrance");
  await panel
    .getByRole("button", { name: "Create fastener plan", exact: true })
    .click();
  const empty = await draft(
    page,
    (actual) => actual.fastenerPlans.length === 1,
  );
  expect(empty.fastenerPlans[0].productId).toBe(csvId);
  expect(empty.fastenerPlans[0].locations).toEqual([]);
  expect(empty.fastenerPlans[0].measurements).toEqual({
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  await panel
    .getByText("User measurements · unknown values stay blank", { exact: true })
    .click();
  for (const name of [
    "Surface-to-tip depth after seating",
    "User pilot diameter",
    "Deepest pilot drill-tip depth",
  ])
    await expect(
      panel.getByRole("spinbutton", { name, exact: true }),
    ).toHaveValue("");
  await expect(
    panel.getByRole("textbox", {
      name: "Fastener measurement basis",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    panel.getByLabel("Fastener measurement date", { exact: true }),
  ).toHaveValue("");
  await panel
    .getByRole("button", { name: "Add screw location", exact: true })
    .click();
  const point = panel.locator("details[aria-label='Fastener location F001']");
  await coordinates(point, "F001 entry point", [0.123456789, 0, 0.3515]);
  await point
    .getByRole("button", { name: "Drive along local Z negative", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const pending = await draft(
    page,
    (actual) =>
      actual.fastenerPlans[0].locations.length === 1 &&
      actual.fastenerPlans[0].locations[0].driveLocal?.[2] === -1,
  );
  expect(pending.fastenerPlans[0].measurements).toEqual(
    empty.fastenerPlans[0].measurements,
  );
  expect(fastenerReviews(pending)[0].activePointCount).toBe(1);
  expect(fastenerReviews(pending)[0].locations[0].tipWorld).toBeNull();
  await expect(page.getByTestId("fastener-tip-marker")).toHaveCount(0);
  const purchase = panel.locator(`[data-fastener-product-id='${csvId}']`);
  await expect(purchase).toContainText("Each box has 70 screws");
  await expect(
    purchase.getByRole("link", {
      name: "Home Depot reference 321563361",
      exact: true,
    }),
  ).toHaveAttribute("href", /\/321563361$/);
  await expect(
    purchase.getByRole("link", {
      name: "Lowe's reference 1002623380",
      exact: true,
    }),
  ).toHaveAttribute("href", /\/1002623380$/);
  await purchase
    .getByRole("button", { name: /^Add missing packs for/ })
    .click();
  const selected = await draft(page, (actual) =>
    actual.supplies.some(
      (supply) => supply.productId === csvId && supply.quantity === 1,
    ),
  );
  expect(selected.pieces).toEqual(before.pieces);
  expect(selected.joints).toEqual(before.joints);
  expect(selected.toolSelections).toEqual([]);
  await expect(
    purchase.getByRole("button", { name: /^Add missing packs for/ }),
  ).toBeDisabled();
  await capture(page, purchase, "csv70-desktop-pending-purchase.png");
  const supplyRow = await openSupplies(page, csvId);
  await expect(supplyRow).toContainText(
    "Selected packs contain 70 counted items",
  );
  const observed = await snapshot(
    page,
    supplyRow,
    csvId,
    "7.25",
    "1",
    "321563361",
  );
  expect(
    supplyRows(observed).filter((row) => row.productId === csvId),
  ).toHaveLength(1);
  expect(
    supplyRows(observed).find((row) => row.productId === csvId)!.total,
  ).toBe(7.25);
  const generated = await generate(page),
    editable = projectSchema.parse(
      JSON.parse(await exportText(page, "Editable project")),
    ),
    shopping = await exportText(page, "Shopping list"),
    csv = await exportText(page, "Wood-fastener schedule CSV"),
    md = await exportText(page, "Build guide");
  expect(editable).toEqual(generated);
  expect(editable.fastenerPlans[0].locations[0].entranceLocal).toEqual([
    0.123456789, 0, 0.3515,
  ]);
  expect(shopping).toBe(shoppingCsv(generated));
  assertShoppingLine(shopping, "321563361", 1, "7.25", "7.25");
  expect(csv).toBe(fastenerScheduleCsv(generated));
  expect(csv).toContain(",0.123457,0,0.3515,0,0,-1,");
  expect(md.startsWith(guideMarkdown(generated))).toBe(true);
  expect(md).toContain("70/pack");
  const reopened = await saveReopen(page, generated);
  expect(reopened.fastenerPlans).toEqual(generated.fastenerPlans);
  expect(reopened.supplyInventory).toEqual(observed.supplyInventory);
  expect(reopened.pieces.map(physical)).toEqual(before.pieces.map(physical));
  expect(reopened.toolSelections).toEqual([]);
  expect(reopened.fastenerPlans[0].measurements.surfaceToTipDepth).toBeNull();
  expect(reopened.fastenerPlans[0].measurements.pilotDiameter).toBeNull();
  expect(errors).toEqual([]);
  expect(plannerRequests).toEqual([]);
});

test("phone DSV71 explicit paths purchase two70-count boxes once and retain physical W/H/C data without inferred included-bit or driver ownership", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors, plannerRequests } = installGuard(page),
    fixture = dsvFixture(),
    before = await importProject(page, fixture.project),
    panel = await openPanel(page, fixture.planId);
  const oldPlans = structuredClone(
      before.fastenerPlans.filter((plan) => plan.id !== fixture.planId),
    ),
    oldBom = bom(before),
    purchase = panel.locator(`[data-fastener-product-id='${dsvId}']`);
  await expect(purchase).toContainText("71 included screw locations");
  await expect(purchase).toContainText("Required boxes: 2");
  await expect(
    purchase.getByRole("link", {
      name: "Home Depot reference 321563400",
      exact: true,
    }),
  ).toHaveAttribute("href", /\/321563400$/);
  await expect(
    purchase.getByRole("link", {
      name: "Lowe's reference 1002623434",
      exact: true,
    }),
  ).toHaveAttribute("href", /\/1002623434$/);
  await purchase
    .getByRole("button", { name: /^Add missing packs for/ })
    .click();
  const selected = await draft(page, (actual) =>
    actual.supplies.some(
      (supply) => supply.productId === dsvId && supply.quantity === 2,
    ),
  );
  const demand = fastenerPurchaseSummary(selected).products.find(
    (row) => row.productId === dsvId,
  )!;
  expect(demand.plannedScrews).toBe(71);
  expect(demand.packCount).toBe(70);
  expect(demand.requiredPacks).toBe(2);
  expect(demand.selectedScrews).toBe(140);
  expect(demand.spareScrews).toBe(69);
  expect(demand.shortfallPacks).toBe(0);
  expect(
    selected.supplies.filter((supply) => supply.productId === dsvId),
  ).toHaveLength(1);
  await expect(
    purchase.getByRole("button", { name: /^Add missing packs for/ }),
  ).toBeDisabled();
  await capture(page, purchase, "dsv70-phone-two-boxes.png");
  const row = await openSupplies(page, dsvId);
  await expect(row).toContainText("2 × 70-screw box");
  await expect(row).toContainText("Selected packs contain 140 counted items");
  await expect(
    row.getByRole("link", { name: /product 1002623434/ }),
  ).toHaveAttribute("href", /\/1002623434$/);
  const observed = await snapshot(page, row, dsvId, "11.50", "2", "1002623434");
  expect(
    supplyRows(observed).find((row) => row.productId === dsvId)!.total,
  ).toBe(23);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed 187443", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed DCD771C2", exact: true }),
  ).not.toBeChecked();
  for (const name of [
    "Review a T25 screw-driving bit",
    "Drive the specified screws",
  ]) {
    const operation = page
      .locator("details.section-description")
      .filter({ has: page.locator("summary").filter({ hasText: name }) });
    await expect(operation.locator("summary")).toContainText("unknown");
  }
  const tools = toolChecklist(observed);
  expect(
    tools.requirements.find((row) => row.capability === "drive-t25")!.status,
  ).toBe("unknown");
  expect(
    tools.requirements.find((row) => row.capability === "drive-screw")!.status,
  ).toBe("unknown");
  const generated = await generate(page),
    shopping = await exportText(page, "Shopping list"),
    editable = projectSchema.parse(
      JSON.parse(await exportText(page, "Editable project")),
    ),
    schedule = await exportText(page, "Wood-fastener schedule CSV"),
    md = await exportText(page, "Build guide");
  assertShoppingLine(shopping, "1002623434", 2, "11.50", "23.00");
  expect(shopping).toBe(shoppingCsv(generated));
  expect(editable).toEqual(generated);
  expect(schedule).toBe(fastenerScheduleCsv(generated));
  expect(md.startsWith(guideMarkdown(generated))).toBe(true);
  expect(md).toContain("70/pack");
  expect(md).toContain("required packs 2");
  expect(generated.pieces.map(physical)).toEqual(before.pieces.map(physical));
  expect(generated.lidHingePlans).toEqual(before.lidHingePlans);
  expect(generated.hingeStockSources).toEqual(before.hingeStockSources);
  expect(generated.connectorPlans).toEqual(before.connectorPlans);
  expect(
    generated.fastenerPlans.filter((plan) => plan.id !== fixture.planId),
  ).toEqual(oldPlans);
  expect(
    generated.fastenerPlans.find((plan) => plan.id === fixture.planId),
  ).toEqual(before.fastenerPlans.find((plan) => plan.id === fixture.planId));
  expect(bom(generated)).toEqual(oldBom);
  expect(generated.toolSelections).toEqual([]);
  const reopened = await saveReopen(page, generated);
  expect(reopened.fastenerPlans).toEqual(generated.fastenerPlans);
  expect(reopened.lidHingePlans).toEqual(before.lidHingePlans);
  expect(reopened.connectorPlans).toEqual(before.connectorPlans);
  expect(reopened.hingeStockSources).toEqual(before.hingeStockSources);
  expect(reopened.toolSelections).toEqual([]);
  const saved = await openSupplies(page, dsvId);
  await capture(page, saved, "dsv70-phone-reopened-exact-supply.png");
  expect(errors).toEqual([]);
  expect(plannerRequests).toEqual([]);
});

test("SDWS framing uses the exact 150-screw pack through geometry, snapshot, guide and saved project", async ({
  page,
}) => {
  const p = blank(`Synthetic SDWS framing ${uid().slice(0, 8)}`);
  p.store = "SYNTHETIC-UT";
  const step = p.steps[0].id;
  const entry = part(
    "Entry member",
    "stud",
    [1.5, 30, 3.5],
    [0, 15, 0],
    step,
    "Framing review",
  );
  const receiving = part(
    "Receiving member",
    "stud",
    [1.5, 30, 3.5],
    [1.5, 15, 0],
    step,
    "Framing review",
  );
  p.pieces = [entry, receiving];
  const before = await importProject(page, p);
  const fasteners = await openPanel(page);
  const newProduct = fasteners.getByRole("combobox", {
    name: "New screw product",
  });
  const productId = "simpson-sdws16300qr150";
  await expect(
    newProduct.locator('option[value="simpson-sdws16212qr50"]'),
  ).toContainText("50-screw box");
  await newProduct.selectOption(productId);
  await fasteners
    .getByRole("combobox", { name: "Fastener head-side member", exact: true })
    .selectOption(entry.id);
  await fasteners
    .getByRole("combobox", { name: "Fastener receiving member", exact: true })
    .selectOption(receiving.id);
  await fasteners
    .getByRole("button", { name: "Preview centered entry", exact: true })
    .click();
  await expect(
    fasteners.getByRole("region", { name: "Centered entry preview" }),
  ).toBeVisible();
  await fasteners
    .getByRole("button", { name: "Use centered entry", exact: true })
    .click();
  const planned = await draft(
    page,
    (actual) => actual.fastenerPlans[0]?.productId === productId,
  );
  expect(fastenerReviews(planned)[0].locations[0].tipWorld).toBeNull();
  expect(planned.fastenerPlans[0].measurements.surfaceToTipDepth).toBeNull();
  expect(planned.pieces).toEqual(before.pieces);

  const buy = fasteners.locator(`[data-fastener-product-id="${productId}"]`);
  await expect(buy).toContainText("Each box has 150 screws");
  await buy.getByRole("button", { name: /^Add missing packs for/ }).click();
  const selected = await draft(page, (actual) =>
    actual.supplies.some(
      ({ productId: id, quantity }) => id === productId && quantity === 1,
    ),
  );
  expect(selected.pieces).toEqual(before.pieces);
  const supply = await openSupplies(page, productId);
  await expect(supply).toContainText(
    "Selected packs contain 150 counted items",
  );
  await capture(page, supply, "sdws-exact-framing-pack.png");
  const observed = await snapshot(
    page,
    supply,
    productId,
    "28.50",
    "2",
    "321563399",
  );
  expect(
    supplyRows(observed).find(({ productId: id }) => id === productId)?.total,
  ).toBe(28.5);

  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/1 .*#321563399/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const guide = await exportText(page, "Build guide");
  expect(guide).toContain("1 provisional screws; 150/pack");
  expect(guide).toContain("IAPMO UES ER-192");
  const reopened = await saveReopen(page, observed);
  expect(reopened.fastenerPlans).toEqual(observed.fastenerPlans);
  expect(reopened.supplyInventory).toEqual(observed.supplyInventory);
});
