import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type Project,
} from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectPricingCoverage } from "../../src/engine";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";
import {
  applyFastenerRemap,
  previewFastenerRemap,
} from "../../src/fastenerRemapping";
import { ensurePartLabels } from "../../src/partLabels";
import { findRetailerProduct } from "../../src/retailerCatalog";

const sd = "simpson-sd9112r100",
  nails = "grip-rite-16c5";
const name = (id: string) => findRetailerProduct(id)!.name;
async function draft(
  page: Page,
  expected: (project: Project) => boolean,
): Promise<Project> {
  let observed: Project | null = null;
  try {
    await expect
      .poll(
        async () => {
          const text = await page.evaluate(
            (key) => localStorage.getItem(key),
            CURRENT_DRAFT_KEY,
          );
          observed = text
            ? projectSchema.parse(JSON.parse(text).project)
            : null;
          return !!observed && expected(observed);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-pricing-project", {
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "synthetic-pricing-packs.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function supplies(page: Page) {
  await page.getByRole("button", { name: "List", exact: true }).click();
  const panel = page.locator(".supplies-panel");
  if ((await panel.getAttribute("open")) === null)
    await panel.locator(":scope > summary").click();
  return panel;
}
async function add(page: Page, id: string, quantity: number) {
  const panel = await supplies(page);
  await panel
    .getByRole("combobox", { name: "Choose a supply", exact: true })
    .selectOption(id);
  await panel
    .getByRole("spinbutton", {
      name: "Supply purchase packs to add",
      exact: true,
    })
    .fill(String(quantity));
  await panel.getByRole("button", { name: "Add supply", exact: true }).click();
  await draft(page, (actual) =>
    actual.supplies.some(
      (selection) =>
        selection.productId === id && selection.quantity === quantity,
    ),
  );
  return panel.locator(`[data-supply-product-id='${id}']`);
}
async function snapshot(
  page: Page,
  id: string,
  price: number,
  retailerProductId: string,
) {
  const row = page.locator(`[data-supply-product-id='${id}']`);
  await row
    .getByRole("button", {
      name: `Record supply snapshot for ${name(id)}`,
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
    .fill(String(price));
  await form
    .getByRole("spinbutton", {
      name: "Supply snapshot available packs",
      exact: true,
    })
    .fill("8");
  await form
    .getByRole("textbox", { name: "Supply snapshot store", exact: true })
    .fill("SYNTHETIC PRICING");
  await form
    .getByRole("textbox", { name: "Supply snapshot ZIP", exact: true })
    .fill("84121");
  await form
    .getByRole("button", { name: "Record supply snapshot", exact: true })
    .click();
  return draft(page, (actual) =>
    actual.supplyInventory.some(
      (entry) =>
        entry.productId === id &&
        entry.price === price &&
        entry.retailerProductId === retailerProductId,
    ),
  );
}
async function download(page: Page, label: RegExp) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label }).click();
  const path = await (await pending).path();
  if (!path) throw Error("Missing pricing export");
  const text = await readFile(path, "utf8");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return text;
}
async function reopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        if (!response.ok()) return false;
        const saved = (await response.json()).project;
        return (
          JSON.stringify(saved.supplies) ===
            JSON.stringify(expected.supplies) &&
          JSON.stringify(saved.supplyInventory) ===
            JSON.stringify(expected.supplyInventory) &&
          JSON.stringify(saved.fastenerPlans) ===
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
      JSON.stringify(actual.supplies) === JSON.stringify(expected.supplies),
  );
}
function mixedFixture() {
  let project = blank(`SYNTHETIC mixed pricing ${uid().slice(0, 8)}`);
  project.store = "SYNTHETIC PRICING";
  project.notes =
    "SYNTHETIC observations and prices only; no real stock, complete quote or installation claim.";
  const step = project.steps[0].id,
    sheet = material("plytanium-703");
  const panels = Array.from({ length: 4 }, (_, i) =>
    part(
      `Full exact sheet ${i + 1}`,
      sheet.id,
      [...(sheet.stockSize ?? sheet.size)],
      [i * 60, 1, 0],
      step,
      "Manual panels",
    ),
  );
  const boards = [0, 1, 2].map((i) =>
    part(
      `History board ${i + 1}`,
      "stud",
      [1.5, 3.5, 12],
      [i * 24, 10, 120],
      step,
      "Manual wood members",
    ),
  );
  project = ensurePartLabels({ ...project, pieces: [...panels, ...boards] });
  const plan = addFastenerLocation(
    makeFastenerPlan(project, boards[0].id, boards[1].id, {
      name: "SYNTHETIC W/F history preserved by pricing",
    }),
  );
  project = saveFastenerPlan(project, plan);
  const choice = {
      headPieceId: boards[0].id,
      receiverPieceId: boards[2].id,
      locationMode: "clear" as const,
      basis:
        "SYNTHETIC explicit member history retained while only purchase prices change.",
    },
    preview = previewFastenerRemap(project, plan.id, choice);
  project = applyFastenerRemap(project, plan.id, choice, preview.token);
  return project;
}

test("partial pricing distinguishes four unpriced sheets, examples, exact counted boxes and advertised mass without changing W/F history", async ({
  page,
}) => {
  const before = await load(page, mixedFixture());
  const mass = await add(page, nails, 2),
    counted = await add(page, sd, 1);
  await expect(mass).toContainText("2 × 5-lb box");
  await expect(mass).toContainText("5 lb advertised");
  await expect(mass.getByTestId("mass-purchase-contents")).toContainText(
    "10 lb advertised",
  );
  await expect(mass).toContainText("exact piece count unknown");
  await expect(counted).toContainText("100 ×");
  await expect(counted.getByTestId("counted-purchase-contents")).toContainText(
    "100 counted items",
  );
  await snapshot(page, sd, 0, "202071152");
  const observed = await snapshot(page, nails, 15, "202308546"),
    coverage = projectPricingCoverage(observed);
  expect(coverage.observedSubtotal).toBe(30);
  expect(coverage.exampleSubtotal).toBeGreaterThan(0);
  expect(coverage.materials.unpricedLineCount).toBe(1);
  expect(coverage.materials.unpricedPurchaseUnitQuantity).toBe(4);
  await page.getByText("Project cost estimate", { exact: true }).click();
  const summary = page.locator(".pricing-summary:visible").first();
  await expect(summary).toHaveAttribute("data-pricing-status", "partial");
  await expect(summary.locator(":scope > details")).toHaveJSProperty(
    "open",
    false,
  );
  await expect(
    page.locator(".print-guide .pricing-summary-print > details"),
  ).toHaveJSProperty("open", true);
  await expect(summary).toHaveAttribute(
    "data-priced-subtotal",
    String(coverage.pricedSubtotal),
  );
  await expect(summary.getByTestId("pricing-unpriced")).toContainText(
    "1 line · 4 sheets",
  );
  await expect(summary).toContainText("$30.00 from 2 observed lines");
  await expect(summary).toContainText("example line");
  await expect(summary).toContainText("not a complete-project quote");
  await expect(counted).toContainText("$0.00 observed subtotal");
  await expect(page.getByTestId("supply-pricing-coverage")).toContainText(
    "$30.00 observed supply subtotal",
  );
  expect(observed.pieces).toEqual(before.pieces);
  expect(observed.fastenerPlans).toEqual(before.fastenerPlans);
  expect(observed.fastenerPlanLabels).toEqual(before.fastenerPlanLabels);
  const csv = await download(page, /^Shopping list CSV/),
    markdown = await download(page, /^Build guide Markdown/),
    json = JSON.parse(await download(page, /^Editable project/));
  expect(csv).toContain("5 lb advertised");
  expect(csv).toContain("exact piece count unknown");
  expect(markdown).toContain("priced subtotal");
  expect(markdown).toContain("1 unpriced line");
  expect(markdown).toContain("4 × sheet");
  expect(markdown).not.toContain("Shopping list estimate");
  expect(json.supplies).toEqual(observed.supplies);
  expect(json.fastenerPlans).toEqual(before.fastenerPlans);
  const reopened = await reopen(page, observed);
  expect(reopened.fastenerPlans).toEqual(before.fastenerPlans);
  expect(reopened.supplyInventory).toEqual(observed.supplyInventory);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Project retailer", exact: true })
    .selectOption("lowes");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await supplies(page);
  const switched = await draft(page, (actual) => actual.retailer === "lowes"),
    keptMass = page.locator(`[data-supply-product-id='${nails}']`);
  await expect(keptMass).toContainText("No current reviewed Lowe's offer");
  await expect(keptMass).toContainText("Unpriced");
  await expect(
    keptMass.getByRole("button", { name: /Record supply snapshot/ }),
  ).toHaveCount(0);
  expect(switched.supplies).toEqual(observed.supplies);
  expect(switched.supplyInventory).toEqual(observed.supplyInventory);
  expect(switched.fastenerPlans).toEqual(before.fastenerPlans);
  expect(projectPricingCoverage(switched).observedSubtotal).toBe(0);
  expect(
    await page
      .locator(`[data-supply-product-id='${sd}']`)
      .getByRole("link", { name: /Lowe's product/ })
      .getAttribute("href"),
  ).toMatch(/3242494$/);
});

test("phone all-unpriced purchase stays unknown until a genuine zero per-box snapshot is recorded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = blank(`SYNTHETIC zero pricing ${uid().slice(0, 8)}`);
  project.store = "SYNTHETIC PRICING";
  await load(page, project);
  await add(page, sd, 1);
  const unpriced = await draft(page, (actual) => actual.supplies.length === 1);
  expect(projectPricingCoverage(unpriced).pricedSubtotal).toBeNull();
  await expect(page.getByTestId("supply-pricing-coverage")).toHaveAttribute(
    "data-observed-supply-subtotal",
    "unknown",
  );
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.locator(".pricing-summary:visible").first()).toContainText(
    "No priced subtotal",
  );
  const zero = await snapshot(page, sd, 0, "202071152");
  expect(projectPricingCoverage(zero).pricedSubtotal).toBe(0);
  expect(projectPricingCoverage(zero).observedLineCount).toBe(1);
  expect(projectPricingCoverage(zero).unpricedLineCount).toBe(0);
  await expect(page.getByTestId("supply-pricing-coverage")).toHaveAttribute(
    "data-observed-supply-subtotal",
    "0",
  );
  await expect(page.getByTestId("supply-pricing-coverage")).toContainText(
    "$0.00 observed supply subtotal",
  );
  const summary = page.locator(".pricing-summary:visible").first();
  await expect(summary).toHaveAttribute("data-pricing-status", "observed");
  await expect(summary).toContainText("$0.00 priced subtotal");
  await expect(summary).toContainText("1 observed line");
  await expect(summary).toContainText("not a complete-project quote");
  expect(zero.pieces).toEqual([]);
  expect(zero.joints).toEqual([]);
  expect((await reopen(page, zero)).supplyInventory).toEqual(
    zero.supplyInventory,
  );
  await supplies(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
