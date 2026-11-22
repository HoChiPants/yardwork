import { addFramingLumber } from "../helpers/materialPlacement";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, projectSchema, type Project } from "../../src/model";
import { findRetailerProduct } from "../../src/retailerCatalog";
import { createBuildStudy } from "../../src/buildFixtures";
import { addSupply } from "../../src/supplies";
const hingeId = "everbilt-29256-continuous-hinge";
const tapeId = "sunlite-92763";
const supportId = "national-n208-637-lid-support";
const name = (id: string) => findRetailerProduct(id)!.name;
async function draft(page: Page): Promise<Project> {
  let latest: string | null = null;
  let changedAt = Date.now();
  // App writes on a 350 ms debounce. Wait for a non-null value unchanged for
  // more than 400 ms, observing serially so an older stored draft cannot win.
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate(
          (draftKey) => localStorage.getItem(draftKey),
          CURRENT_DRAFT_KEY,
        );
        const now = Date.now();
        if (raw === null || raw !== latest) {
          latest = raw;
          changedAt = now;
          return false;
        }
        return now - changedAt > 400;
      },
      { timeout: 10000, intervals: [50, 100, 100, 150, 150] },
    )
    .toBe(true);
  if (latest === null) throw Error("No stable browser draft was saved.");
  return projectSchema.parse(JSON.parse(latest).project);
}
async function openSupplies(page: Page) {
  await page.getByRole("button", { name: "List", exact: true }).click();
  const panel = page.locator(".supplies-panel");
  if (!(await panel.evaluate((element: HTMLDetailsElement) => element.open)))
    await panel.locator(":scope > summary").click();
  return panel;
}
async function openCostEstimate(page: Page) {
  const summary = page.getByText("Project cost estimate", { exact: true });
  const estimate = summary.locator("..");
  if ((await estimate.getAttribute("open")) === null) await summary.click();
  return estimate;
}
async function add(page: Page, productId: string, packs: number) {
  const panel = await openSupplies(page);
  await panel
    .getByRole("combobox", { name: "Choose a supply", exact: true })
    .selectOption(productId);
  await panel
    .getByRole("spinbutton", {
      name: "Supply purchase packs to add",
      exact: true,
    })
    .fill(String(packs));
  await panel.getByRole("button", { name: "Add supply", exact: true }).click();
  return panel.locator(".supply-row").filter({ hasText: name(productId) });
}
async function downloadText(page: Page, button: RegExp) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button }).click();
  const path = await (await pending).path();
  if (!path) throw Error("Expected an exported file.");
  const text = await readFile(path, "utf8");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return text;
}

test("record a mixed Home Depot store check from the purchase handoff", async ({ page }) => {
  await page.goto("/");
  await addFramingLumber(page);
  await add(page, hingeId, 2);
  const before = await draft(page);
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const row = dialog.getByRole("listitem").filter({ hasText: /#314150989/ });
  await expect(row).toContainText("No recent store snapshot");
  await dialog.getByRole("button", { name: "Record store snapshots", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Store ZIP code", exact: true })).toHaveValue("84121");
  await dialog.getByRole("textbox", { name: "Home Depot store", exact: true }).fill("4409");
  await dialog.getByRole("spinbutton", { name: "Price per purchase unit for product 338861827", exact: true }).fill("4.25");
  await dialog.getByRole("spinbutton", { name: "Available purchase units for product 338861827", exact: true }).fill("12");
  await dialog.getByRole("spinbutton", { name: "Price per purchase unit for product 314150989", exact: true }).fill("0");
  await dialog.getByRole("button", { name: "Save store snapshots", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter both price and available units for product 314150989");
  expect((await draft(page)).inventory).toEqual(before.inventory);
  await dialog.getByRole("spinbutton", { name: "Available purchase units for product 314150989", exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Save store snapshots", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("2 store snapshots recorded.");
  await expect(row).toContainText("Short by 1 in snapshot");
  await expect(row).toContainText("$0.00 per purchase unit");
  await expect(dialog.getByRole("listitem").filter({ hasText: /#338861827/ })).toContainText("12 available in snapshot");
  await expect(dialog.getByRole("link", { name: /Home Depot’s project instructions/ })).toHaveAttribute("href", "https://www.homedepot.com/c/create-a-project");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  const result = await page.request.get(`/api/projects/${before.id}`);
  expect(result.ok()).toBeTruthy();
  const saved = projectSchema.parse((await result.json()).project);
  expect(saved.store).toBe("4409");
  expect(saved.inventory).toMatchObject([{ internetNumber: "338861827", price: 4.25, available: 12 }]);
  expect(saved.supplyInventory).toMatchObject([{ retailerProductId: "314150989", price: 0, available: 1 }]);
  expect(saved.pieces).toEqual(before.pieces);
  const csv = await downloadText(page, /^Shopping list CSV/);
  expect(csv).toContain('"338861827","1","board","4.25","4.25"');
  expect(csv).toContain('"314150989","2","hinge","0.00","0.00"');

  const transfer = await downloadText(page, /^Store snapshots JSON/);
  const snapshot = JSON.parse(transfer);
  expect(snapshot.kind).toBe("yardwork-store-snapshots");
  expect(snapshot.materials).toEqual(saved.inventory);
  expect(snapshot.supplies).toEqual(saved.supplyInventory);

  const fixture = createBuildStudy("storage-banquette").project;
  const oldHinge = {
    ...saved.supplyInventory[0], checkedAt: new Date(Date.parse(saved.supplyInventory[0].checkedAt) + 1000).toISOString(),
    retailerProductId: "999999990", url: "https://www.homedepot.com/p/999999990", price: 500,
  };
  const target = addSupply({
    ...fixture,
    store: "4409",
    inventory: [{ ...saved.inventory[0], store: "4408", price: 8 }],
    supplyInventory: [oldHinge],
  }, hingeId, 1);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.getByLabel("Import format").selectOption("project");
  await dialog.locator("input[type=file]").setInputFiles({
    name: "separate-build.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(target)),
  });
  await expect(dialog).toHaveCount(0);
  const separate = await draft(page);
  expect(separate.id).not.toBe(saved.id);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.getByLabel("Import format").selectOption("inventory");
  await dialog.locator("input[type=file]").setInputFiles({
    name: "store-snapshots.json",
    mimeType: "application/json",
    buffer: Buffer.from(transfer),
  });
  await expect(page.getByRole("status").filter({ hasText: "2 store snapshots imported" })).toBeVisible();
  const received = await draft(page);
  expect(received.store).toBe("4409");
  expect(received.inventory.map(({ store, price }) => [store, price])).toEqual([
    ["4408", 8],
    ["4409", 4.25],
  ]);
  expect(received.supplyInventory).toEqual([oldHinge, ...saved.supplyInventory]);
  expect(received.pieces).toEqual(separate.pieces);
  expect(received.supplies).toEqual(separate.supplies);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("listitem").filter({ hasText: /#338861827/ })).toContainText("$4.25 per purchase unit");
  await expect(dialog.getByRole("listitem").filter({ hasText: /#314150989/ })).toContainText("$0.00 per purchase unit");
});

test("edit an exact Home Depot tool snapshot without losing its precise check time or prior listing", async ({ page }) => {
  const drill = "dewalt-dcd771c2";
  const checkedAt = new Date(Math.floor(Date.now() / 60000) * 60000 - 52431).toISOString();
  const current = {
    productId: drill, retailer: "home-depot" as const, retailerProductId: "204279858",
    price: 123.45, available: 0, store: "4409", zip: "84121", checkedAt,
    url: "https://www.homedepot.com/p/204279858",
  };
  const old = {
    ...current, retailerProductId: "999999992", price: 500,
    checkedAt: new Date(Date.parse(checkedAt) + 500).toISOString(),
    url: "https://www.homedepot.com/p/999999992",
  };
  const project = addSupply({ ...blank("Check exact drill kit"), store: current.store, supplyInventory: [old, current] }, drill, 1);
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles({
    name: "tool-observations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  const before = await draft(page);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const tools = page.locator('.supplies-panel[data-purchase-kind="tools"]');
  await tools.locator(":scope > summary").click();
  const row = tools.locator(".supply-row");
  const edit = row.getByRole("button", { name: `Record supply snapshot for ${name(drill)}`, exact: true });
  await expect(row).not.toContainText("$123.45");
  const estimate = await openCostEstimate(page);
  await expect(estimate).toContainText("$123.45 estimated for tools");
  await edit.click();
  const form = tools.locator(".supply-snapshot");
  await expect(form.getByRole("spinbutton", { name: "Supply snapshot price per pack", exact: true })).toHaveValue("123.45");
  await form.getByRole("spinbutton", { name: "Supply snapshot price per pack", exact: true }).fill("119");
  await form.getByRole("spinbutton", { name: "Supply snapshot available packs", exact: true }).fill("1");
  await form.getByRole("button", { name: "Record tool snapshot", exact: true }).click();
  await expect(estimate).toContainText("$119.00 estimated for tools");
  await expect(form).toHaveCount(0);
  const updated = await draft(page);
  const expected = { ...current, price: 119, available: 1 };
  expect(updated.supplyInventory).toEqual([old, expected]);
  expect(updated.pieces).toEqual(before.pieces);
  expect(updated.supplies).toEqual(before.supplies);
  const transfer = JSON.parse(await downloadText(page, /^Store snapshots JSON/));
  expect(transfer.supplies).toEqual([expected]);
  const csv = await downloadText(page, /^Shopping list CSV/);
  expect(csv).toContain('"204279858","1","drill kit","119.00","119.00"');
  const saved = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${updated.id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${updated.id}`);
  expect(reply.ok()).toBe(true);
  expect(projectSchema.parse((await reply.json()).project).supplyInventory).toEqual([old, expected]);
});

test("hinge purchases edit, snapshot, save/reopen and export without becoming geometry", async ({
  page,
}) => {
  await page.goto("/");
  const projectName = `Supply acceptance ${Date.now()}`;
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await addFramingLumber(page);
  const before = await draft(page),
    row = await add(page, hingeId, 2);
  await row.getByText(/Edit purchase quantities and usage/).click();
  await row
    .getByRole("spinbutton", {
      name: `Purchase packs for ${name(hingeId)}`,
      exact: true,
    })
    .fill("3");
  await row
    .getByRole("textbox", {
      name: `Supply purpose for ${name(hingeId)}`,
      exact: true,
    })
    .fill("Banquette seat lid");
  await row
    .getByRole("textbox", {
      name: `Supply note for ${name(hingeId)}`,
      exact: true,
    })
    .fill("Review hinge holes, screws and the separate lid support.");
  await row
    .getByRole("button", {
      name: `Record supply snapshot for ${name(hingeId)}`,
      exact: true,
    })
    .click();
  const form = page.locator(".supply-snapshot");
  await expect(
    form.getByRole("textbox", { name: "Supply snapshot URL", exact: true }),
  ).toHaveValue(/314150989/);
  await form
    .getByRole("spinbutton", {
      name: "Supply snapshot price per pack",
      exact: true,
    })
    .fill("12.50");
  await form
    .getByRole("spinbutton", {
      name: "Supply snapshot available packs",
      exact: true,
    })
    .fill("8");
  await form
    .getByRole("textbox", { name: "Supply snapshot store", exact: true })
    .fill("101");
  await form
    .getByRole("textbox", { name: "Supply snapshot ZIP", exact: true })
    .fill("84121");
  await form
    .getByRole("button", { name: "Record supply snapshot", exact: true })
    .click();
  await expect(row).not.toContainText("$37.50");
  await expect(await openCostEstimate(page)).toContainText("$41.75 estimate for materials and supplies");
  const updated = await draft(page);
  expect(updated.store).toBe("101");
  expect(updated.zip).toBe("84121");
  expect(updated.supplies[0].quantity).toBe(3);
  expect(updated.pieces).toEqual(before.pieces);
  expect(updated.joints).toEqual(before.joints);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: projectName })
    .click();
  await openSupplies(page);
  await expect(await openCostEstimate(page)).toContainText("$41.75 estimate for materials and supplies");
  const csv = await downloadText(page, /^Shopping list CSV/);
  expect(csv).toContain(name(hingeId));
  expect(csv).toContain("Banquette seat lid");
  const guide = await downloadText(page, /^Build guide Markdown/);
  expect(guide).toContain(name(hingeId));
  expect(guide).toContain("Review hinge holes");
  const json = JSON.parse(await downloadText(page, /^Editable project/));
  expect(json.supplies[0].quantity).toBe(3);
  expect(json.supplyInventory[0].retailerProductId).toBe("314150989");
  const reopenedRow = page
    .locator(".supply-row")
    .filter({ hasText: name(hingeId) });
  await reopenedRow.getByText(/Edit purchase quantities and usage/).click();
  await reopenedRow
    .getByRole("button", {
      name: `Remove supply purchase ${name(hingeId)}`,
      exact: true,
    })
    .click();
  expect((await draft(page)).supplies).toHaveLength(0);
  expect((await draft(page)).pieces).toEqual(before.pieces);
});

test("heterogeneous kits count purchase packs directly and marketplace items cannot claim store stock", async ({
  page,
}) => {
  await page.goto("/");
  await add(page, tapeId, 2);
  const tape = await add(page, tapeId, 1);
  await expect(tape).toContainText("3 × top/bottom tape kit");
  await expect(tape).toContainText("1 × 32 ft nonvented top tape roll");
  await expect(tape).toContainText("1 × 32 ft vented bottom tape roll");
  expect(
    (await draft(page)).supplies.map((selection) => selection.quantity),
  ).toEqual([2, 1]);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Project retailer", exact: true })
    .selectOption("lowes");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await openSupplies(page);
  await expect(tape).toContainText(/No current reviewed Lowe's offer/);
  const estimate = await openCostEstimate(page);
  await expect(estimate.getByRole("region", { name: "Pricing coverage" })).toHaveAttribute("data-pricing-status", "partial");
  const support = await add(page, supportId, 1);
  await expect(support).toContainText("Max Warehouse");
  await expect(
    support.getByRole("button", { name: /Record supply snapshot/ }),
  ).toHaveCount(0);
  expect((await draft(page)).pieces).toHaveLength(0);
  expect((await draft(page)).joints).toHaveLength(0);
});

test("unknown saved supplies stay visible and invalid snapshot imports are atomic", async ({
  page,
}) => {
  await page.goto("/");
  const imported = blank("Unresolved supply import");
  imported.supplies = [
    {
      id: crypto.randomUUID(),
      productId: "missing-supply",
      quantity: 2,
      purpose: "Imported purchase",
      note: "Check the original source.",
    },
  ];
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  const importDialog = page.getByRole("dialog");
  await expect(importDialog).toContainText("Bring a plan along.");
  await importDialog.locator("input[type=file]").setInputFiles({
    name: "unknown-supply.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  const panel = await openSupplies(page),
    row = panel.locator(".supply-row");
  await expect(row).toContainText("Unknown supply: missing-supply");
  await expect(row).toContainText("Unresolved saved selection");
  await panel.getByText("Import supply snapshot JSON", { exact: true }).click();
  await panel
    .getByRole("textbox", { name: "Supply snapshot JSON", exact: true })
    .fill(
      JSON.stringify([
        {
          productId: "missing-supply",
          retailer: "home-depot",
          retailerProductId: "123456789",
          price: 4,
          available: 5,
          store: "101",
          zip: "84121",
          checkedAt: new Date().toISOString(),
          url: "https://www.homedepot.com/p/123456789",
        },
      ]),
    );
  const before = await draft(page);
  await panel
    .getByRole("button", { name: "Import supply snapshots", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "No current reviewed offer",
  );
  const after = await draft(page);
  expect(after.supplyInventory).toEqual(before.supplyInventory);
  expect(after.supplies).toEqual(before.supplies);
  expect(after.pieces).toEqual(before.pieces);
});

test.describe("phone supply workflow", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("snapshots and JSON imports keep purchase units and project targeting explicit", async ({
    page,
  }) => {
    await page.goto("/");
    const row = await add(page, tapeId, 1);
    await row
      .getByRole("button", {
        name: `Record supply snapshot for ${name(tapeId)}`,
        exact: true,
      })
      .click();
    const form = page.locator(".supply-snapshot");
    for (const [label, value] of [
      ["Supply snapshot price per pack", "8.5"],
      ["Supply snapshot available packs", "5"],
    ])
      await form
        .getByRole("spinbutton", { name: label, exact: true })
        .fill(value);
    await form
      .getByRole("textbox", { name: "Supply snapshot store", exact: true })
      .fill("101");
    await form
      .getByRole("button", { name: "Record supply snapshot", exact: true })
      .click();
    await expect(row).not.toContainText("$8.50");
    await expect(await openCostEstimate(page)).toContainText("$8.50 estimate for materials and supplies");
    const panel = page.locator(".supplies-panel");
    await panel
      .getByText("Import supply snapshot JSON", { exact: true })
      .click();
    await panel
      .getByRole("textbox", { name: "Supply snapshot JSON", exact: true })
      .fill(
        JSON.stringify([
          {
            productId: tapeId,
            retailer: "home-depot",
            retailerProductId: "205713443",
            price: 9,
            available: 4,
            store: "202",
            zip: "84121",
            checkedAt: new Date().toISOString(),
            url: "https://www.homedepot.com/p/205713443",
          },
        ]),
      );
    await panel
      .getByRole("button", { name: "Import supply snapshots", exact: true })
      .click();
    await expect(panel.getByRole("status").last()).toContainText(
      "1 supply snapshot recorded",
    );
    const project = await draft(page);
    expect(project.store).toBe("101");
    expect(project.supplyInventory).toHaveLength(2);
    expect(project.pieces).toHaveLength(0);
    expect(project.joints).toHaveLength(0);
    const box = await panel
      .getByRole("combobox", { name: "Choose a supply", exact: true })
      .boundingBox();
    expect(box!.width).toBeGreaterThan(150);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await panel.screenshot({
      path: "test-results/supplies/phone-supplies.png",
    });
  });
});
