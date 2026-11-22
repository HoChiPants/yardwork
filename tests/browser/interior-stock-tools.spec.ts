import { confirmMaterialPlacement } from "../helpers/materialPlacement";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type Project,
} from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { bom, inspectCutStock } from "../../src/engine";
import { findRetailerProduct } from "../../src/retailerCatalog";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";

const sheets = [
  {
    id: "hd-purebond-birch-188",
    thickness: 0.188,
    product: "hd-purebond-birch-188-165891",
    offer: "100092485",
    model: "165891",
  },
  {
    id: "hd-purebond-birch-453",
    thickness: 0.453,
    product: "hd-purebond-birch-453-833185",
    offer: "100020218",
    model: "833185",
  },
] as const;
const driveBits = [
  {
    id: "grk-187443-t25-bits",
    mpn: "187443",
    drive: "T25",
    offer: "202349118",
    lowes: "50303273",
    product: "grk-r4-103101",
  },
  {
    id: "grk-187427-t15-bits",
    mpn: "187427",
    drive: "T15",
    offer: "202349116",
    lowes: "50303267",
    product: "grk-cabinet-113079",
  },
] as const;
async function draft(
  page: Page,
  expected: (p: Project) => boolean,
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
    await test.info().attach("last-interior-stock-tools-project", {
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
      name: "synthetic-interior-stock-tools.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (p) => p.name.startsWith(project.name));
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
          JSON.stringify(saved.pieces) === JSON.stringify(expected.pieces) &&
          JSON.stringify(saved.inventory) ===
            JSON.stringify(expected.inventory) &&
          JSON.stringify(saved.fastenerPlans) ===
            JSON.stringify(expected.fastenerPlans) &&
          JSON.stringify(saved.toolSelections) ===
            JSON.stringify(expected.toolSelections)
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const item = page
    .locator(".project-list > button")
    .filter({ has: page.getByText(expected.name, { exact: true }) });
  await expect(item).toHaveCount(1);
  await item.click();
  return draft(
    page,
    (p) =>
      p.id === expected.id &&
      JSON.stringify(p.pieces) === JSON.stringify(expected.pieces) &&
      JSON.stringify(p.toolSelections) ===
        JSON.stringify(expected.toolSelections),
  );
}
function installRequestGuard(page: Page) {
  const errors: string[] = [],
    plannerRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/\/api\/(planner|assistant|chat|generate)(\/|\?|$)/.test(r.url()))
      plannerRequests.push(r.url());
  });
  return { errors, plannerRequests };
}
function operation(page: Page, name: string): Locator {
  return page
    .locator("details.section-description")
    .filter({ has: page.getByText(name, { exact: true }) });
}
function woodFixture() {
  let p = blank(`SYNTHETIC exact drive tips ${uid().slice(0, 8)}`);
  p.notes =
    "SYNTHETIC UI fixture: two explicit actual wood pairs, one user-authored point per pair; no spacing/load recommendation, installation measurement or tool ownership claim.";
  for (const [index, row] of driveBits.entries()) {
    const head = part(
        `SYNTHETIC ${row.drive} head`,
        "plytanium-703",
        [10, 10, 0.703],
        [index * 30, 20, 0],
        p.steps[0].id,
        "Manual",
      ),
      receiver = part(
        `SYNTHETIC ${row.drive} receiver`,
        "plytanium-703",
        [10, 10, 0.703],
        [index * 30, 20, -0.953],
        p.steps[0].id,
        "Manual",
      );
    p.pieces.push(head, receiver);
    const plan = addFastenerLocation(
      makeFastenerPlan(p, head.id, receiver.id, {
        productId: row.product,
        name: `SYNTHETIC ${row.drive} user point`,
      }),
    );
    plan.locations[0].entranceLocal = [0, 0, 0.3515];
    plan.locations[0].driveLocal = [0, 0, -1];
    p = saveFastenerPlan(p, plan);
  }
  expect(fastenerReviews(p).map((r) => r.activePointCount)).toEqual([1, 1]);
  expect(
    p.fastenerPlans.every(
      (p) =>
        p.measurements.surfaceToTipDepth === null &&
        p.measurements.pilotDiameter === null,
    ),
  ).toBe(true);
  return projectSchema.parse(JSON.parse(JSON.stringify(p)));
}

test("manual .188/.453 sheets keep exact dimensions, cut remnants and one-sheet sources through a synthetic exact snapshot and library reopen", async ({
  page,
}, testInfo) => {
  const { errors, plannerRequests } = installRequestGuard(page);
  await importProject(
    page,
    blank(`SYNTHETIC manual interior sheets ${uid().slice(0, 8)}`),
  );
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  for (const row of sheets) {
    const add = page.getByRole("button", { name: "Add Birch plywood", exact: true });
    const card = page.locator(".material-card").filter({ has: add });
    await expect(card).toHaveText("Birch plywood");
    await expect(card.getByRole("combobox")).toHaveCount(0);
    await add.click();
    await confirmMaterialPlacement(page, `${row.thickness} in`);
    await expect(
      page.getByRole("spinbutton", { name: "Width X", exact: true }),
    ).toHaveValue("48");
    await expect(
      page.getByRole("spinbutton", { name: "Height Y", exact: true }),
    ).toHaveValue(String(row.thickness));
    await expect(
      page.getByRole("spinbutton", { name: "Depth Z", exact: true }),
    ).toHaveValue("96");
    await page
      .getByRole("combobox", { name: "Stock length axis", exact: true })
      .selectOption("2");
    const before = await draft(page, (p) =>
        p.pieces.some((x) => x.material === row.id && x.stockLengthAxis === 2),
      ),
      kept = before.pieces.find((x) => x.material === row.id)!;
    await page.getByRole("button", { name: "Cut part", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Retained length units", { exact: true }).selectOption("in");
    await dialog.getByLabel("Retained width units", { exact: true }).selectOption("in");
    await dialog
      .getByRole("spinbutton", { name: "Retained length", exact: true })
      .fill("60");
    await dialog
      .getByRole("spinbutton", { name: "Retained width", exact: true })
      .fill("20");
    await expect(dialog.getByTestId("offcut-footprint")).toHaveCount(2);
    expect((await draft(page, (p) => p.id === before.id)).pieces).toEqual(
      before.pieces,
    );
    if (row.id === sheets[0].id)
      await page.screenshot({
        path: testInfo.outputPath("interior-188-cut-preview-desktop.png"),
        fullPage: false,
        animations: "disabled",
      });
    await dialog
      .getByRole("button", { name: "Apply cuts", exact: true })
      .click();
    const cut = await draft(
        page,
        (p) => p.pieces.filter((x) => x.material === row.id).length === 3,
      ),
      pieces = cut.pieces.filter((x) => x.material === row.id);
    expect(cut.pieces.find((x) => x.id === kept.id)!.size).toEqual([
      20,
      row.thickness,
      60,
    ]);
    expect(pieces.filter((x) => x.offcut)).toHaveLength(2);
    expect(new Set(pieces.map((x) => x.cutStock!.id)).size).toBe(1);
    expect(pieces.every((x) => x.stockLengthAxis === 2)).toBe(true);
    const purchase = bom(cut).find((x) => x.id === row.id)!;
    expect(purchase.physicalStockUnits).toBe(1);
    expect(purchase.quantity).toBe(1);
    expect(purchase.unpriced).toBe(true);
    expect(inspectCutStock(cut).invalid).toEqual([]);
  }
  await page.getByRole("button", { name: "List", exact: true }).click();
  for (const row of sheets) {
    const purchase = page
      .locator(".bom-row")
      .filter({ has: page.getByText(material(row.id).name, { exact: true }) });
    await expect(purchase).toContainText("1 sheet");
    await expect(purchase).not.toContainText(/Unpriced|\$/);
    await expect(purchase).toContainText("Availability unverified");
    await purchase.getByText("Store details", { exact: true }).click();
    await expect(
      purchase.getByRole("link", { name: "Find at Home Depot", exact: true }),
    ).toHaveAttribute("href", new RegExp(`/${row.offer}$`));
  }
  await page
    .getByRole("button", { name: "Review product references", exact: true })
    .click();
  const references = page.getByRole("dialog");
  await references
    .getByLabel("Compare modeled material", { exact: true })
    .selectOption(sheets[0].id);
  const productCard = references.locator(".reference-card").filter({
    has: page.getByRole("heading", {
      name: findRetailerProduct(sheets[0].product)!.name,
      exact: true,
    }),
  });
  await expect(productCard).toContainText("1 per purchase unit");
  await expect(productCard).toContainText("Dimensions/pack compatible");
  await expect(
    productCard.getByRole("link", {
      name: `Home Depot · ${sheets[0].offer}`,
      exact: true,
    }),
  ).toHaveAttribute("href", new RegExp(`/${sheets[0].offer}$`));
  await references
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record store snapshot", exact: true })
    .click();
  const snapshot = page.getByRole("dialog");
  await snapshot
    .getByRole("combobox", { name: "Modeled material", exact: true })
    .selectOption(sheets[0].id);
  await expect(snapshot).toContainText(
    `Exact product reference · ${sheets[0].offer}`,
  );
  await expect(snapshot).toContainText("one sheet purchase unit");
  await snapshot
    .getByRole("button", {
      name: "Use reviewed product reference",
      exact: true,
    })
    .click();
  await expect(
    snapshot.getByLabel("Internet number", { exact: true }),
  ).toHaveValue(sheets[0].offer);
  await snapshot
    .getByLabel("Product name", { exact: true })
    .fill("SYNTHETIC exact per-sheet observation; no live retailer check");
  await snapshot.getByLabel("Unit price (USD)", { exact: true }).fill("17");
  await snapshot.getByLabel("Available stock units", { exact: true }).fill("2");
  await snapshot
    .getByLabel("Exact store number", { exact: true })
    .fill("SYNTHETIC-PANEL-QA");
  await snapshot.getByRole("checkbox").check();
  await snapshot
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  const observed = await draft(page, (p) =>
    p.inventory.some((i) => i.material === sheets[0].id && i.price === 17),
  );
  expect(bom(observed).find((r) => r.id === sheets[0].id)!.quantity).toBe(1);
  expect(bom(observed).find((r) => r.id === sheets[0].id)!.total).toBe(17);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.locator(".bom-row").filter({
      has: page.getByText(material(sheets[0].id).name, { exact: true }),
    }),
  ).not.toContainText("$17.00");
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toContainText("$17.00");
  await expect(
    page.locator(".bom-row").filter({
      has: page.getByText(material(sheets[1].id).name, { exact: true }),
    }),
  ).not.toContainText(/Unpriced|\$/);
  await page.screenshot({
    path: testInfo.outputPath("interior-sheets-source-once-desktop.png"),
    fullPage: false,
    animations: "disabled",
  });
  const reopened = await saveReopen(page, observed);
  expect(reopened.pieces).toEqual(observed.pieces);
  expect(reopened.inventory).toEqual(observed.inventory);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Project retailer", exact: true })
    .selectOption("lowes");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  for (const row of sheets)
    await expect(
      page.locator(".bom-row").filter({
        has: page.getByText(material(row.id).name, { exact: true }),
      }),
    ).not.toContainText(/Unpriced|\$/);
  await page
    .getByRole("button", { name: "Record store snapshot", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Modeled material", exact: true })
    .selectOption(sheets[0].id);
  await expect(page.getByRole("dialog")).toContainText(
    "No current reviewed offer for this exact modeled product at Lowe's",
  );
  await expect(
    page.getByRole("button", {
      name: "Use reviewed product reference",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect((await draft(page, (p) => p.retailer === "lowes")).inventory).toEqual(
    observed.inventory,
  );
  expect(errors).toEqual([]);
  expect(plannerRequests).toEqual([]);
});

test("phone current W plans review matching T25/T15 accessory cards separately from unknown driver function and preserve exact selections on reopen", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors, plannerRequests } = installRequestGuard(page);
  const loaded = await importProject(page, woodFixture()),
    initialPieces = structuredClone(loaded.pieces),
    initialPlans = structuredClone(loaded.fastenerPlans),
    initialBom = bom(loaded);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const t25 = operation(page, "Review a T25 screw-driving bit"),
    t15 = operation(page, "Review a T15 screw-driving bit"),
    driver = operation(page, "Drive the specified screws"),
    drill = operation(page, "Drill specified pilot or clearance holes");
  for (const requirement of [t25, t15, driver, drill])
    await expect(requirement.locator("summary")).toContainText("unknown");
  for (const row of driveBits) {
    const checkbox = page.getByRole("checkbox", {
        name: `Reviewed ${row.mpn}`,
        exact: true,
      }),
      card = page.locator("div.section-description").filter({ has: checkbox });
    await expect(card).toContainText("two-bit card");
    await expect(card).toContainText(
      "This is drive-tip evidence only, separate from the powered/manual driver function and actual installation setup.",
    );
    await expect(
      card.getByRole("link", { name: "Home Depot", exact: true }),
    ).toHaveAttribute("href", new RegExp(`/${row.offer}$`));
    await expect(
      card.getByRole("link", { name: "Lowe's", exact: true }),
    ).toHaveAttribute("href", new RegExp(`/${row.lowes}$`));
    await card.locator("summary").click();
    await expect(card).toContainText("Full body/working-reach envelope is unknown");
    await expect(
      card.getByRole("link", {
        name: "Manufacturer product specification 1",
        exact: true,
      }),
    ).toHaveAttribute(
      "href",
      "https://www.grkfasteners.com/grk-products/specialty-fasteners-and-accessories/star-drive-bits",
    );
  }
  await page
    .getByRole("checkbox", { name: "Reviewed 187443", exact: true })
    .check();
  await expect(t25.locator("summary")).toContainText(
    "documented capability supported",
  );
  await expect(t15.locator("summary")).toContainText("unknown");
  await expect(driver.locator("summary")).toContainText("unknown");
  await expect(drill.locator("summary")).toContainText("unknown");
  await t25.locator("summary").click();
  await expect(t25).toContainText("not a powered or manual driver function");
  await t25.locator("summary").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("t25-accessory-with-driver-unknown-phone.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page
    .getByRole("checkbox", { name: "Reviewed 187427", exact: true })
    .check();
  await expect(t25.locator("summary")).toContainText(
    "documented capability supported",
  );
  await expect(t15.locator("summary")).toContainText(
    "documented capability supported",
  );
  await expect(driver.locator("summary")).toContainText("unknown");
  await expect(drill.locator("summary")).toContainText("unknown");
  const selected = await draft(page, (p) => p.toolSelections.length === 2);
  expect(selected.toolSelections.map((s) => s.productId).sort()).toEqual(
    driveBits.map((b) => b.id).sort(),
  );
  expect(selected.pieces).toEqual(initialPieces);
  expect(selected.fastenerPlans).toEqual(initialPlans);
  expect(bom(selected)).toEqual(initialBom);
  expect(selected.supplies).toEqual([]);
  await t15.locator("summary").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("both-drive-accessories-phone.png"),
    fullPage: false,
    animations: "disabled",
  });
  const reopened = await saveReopen(page, selected);
  expect(reopened.fastenerPlans).toEqual(initialPlans);
  expect(reopened.toolSelections).toEqual(selected.toolSelections);
  expect(bom(reopened)).toEqual(initialBom);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed 187443", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Reviewed 187427", exact: true }),
  ).toBeChecked();
  await expect(operation(page, "Review a T25 screw-driving bit")).toContainText(
    "documented capability supported",
  );
  await expect(operation(page, "Review a T15 screw-driving bit")).toContainText(
    "documented capability supported",
  );
  await expect(operation(page, "Drive the specified screws")).toContainText(
    "unknown",
  );
  expect(errors).toEqual([]);
  expect(plannerRequests).toEqual([]);
});
