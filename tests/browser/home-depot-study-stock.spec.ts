import { confirmMaterialPlacement } from "../helpers/materialPlacement";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

test("ground-contact stock keeps its exact Home Depot listing through a cut, store snapshot and save", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Ground-contact 2 × 6", exact: true }).click();
  const size = page.getByRole("dialog");
  await expect(size.getByRole("radio")).toHaveCount(3);
  await confirmMaterialPlacement(page, "12 ft");
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page.getByLabel("Retained length units", { exact: true }).selectOption("ft");
  await page.getByRole("spinbutton", { name: "Retained length", exact: true }).fill("9");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row")).toContainText("1 board");
  const prepare = page.getByRole("button", { name: "Prepare Home Depot list", exact: true });
  await prepare.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/1 board.*#206949899/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Record store snapshot", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Modeled material", exact: true }).selectOption("hd-treated-2x6-12");
  await dialog.getByRole("button", { name: "Use reviewed product reference", exact: true }).click();
  await expect(dialog.getByLabel("Internet number", { exact: true })).toHaveValue("206949899");
  await dialog.getByLabel("Unit price (USD)", { exact: true }).fill("19");
  await dialog.getByLabel("Available stock units", { exact: true }).fill("2");
  await dialog.getByLabel("Exact store number", { exact: true }).fill("4409");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save snapshot", exact: true }).click();
  await prepare.click();
  await expect(dialog.getByRole("listitem").filter({ hasText: "206949899" })).toContainText("2 available in snapshot");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Internet #206949899");
  expect(guide).toContain("17464-12");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.id as string, CURRENT_DRAFT_KEY);
  const saving = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await saving).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${id}`);
  expect(reply.ok()).toBe(true);
  const saved = projectSchema.parse((await reply.json()).project);
  expect(saved.pieces.map(({ material, size }) => [material, size])).toEqual([
    ["hd-treated-2x6-12", [1.5, 5.5, 108]],
    ["hd-treated-2x6-12", [1.5, 5.5, 35.875]],
  ]);
  expect(saved.inventory).toMatchObject([{ material: "hd-treated-2x6-12", internetNumber: "206949899", zip: "84121", store: "4409" }]);
});

async function studies(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  return page.getByRole("dialog");
}

test("the five studies preview exact Home Depot stock and quantities", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await studies(page);
  const picker = dialog.getByRole("combobox", {
    name: "Choose a build study",
    exact: true,
  });
  for (const [id, offers] of [
    ["storage-banquette", ["100061386", "312528776"]],
    ["shelves", ["100061386"]],
    ["closet-insert", ["100061386"]],
    ["sauna", ["312528776"]],
    ["greenhouse", ["312528776", "334216730", "205220341"]],
  ] as const) {
    await picker.selectOption(id);
    const choices = dialog.getByText("Source-matched stock options", {
      exact: true,
    });
    if ((await choices.locator("..").getAttribute("open")) === null)
      await choices.click();
    await dialog
      .getByRole("button", { name: "Use Home Depot stock", exact: true })
      .click();
    const stock = dialog.getByText("Stock quantities", { exact: true });
    if ((await stock.locator("..").getAttribute("open")) === null)
      await stock.click();
    const table = dialog.getByRole("table", {
      name: "Whole stock for this study",
    });
    await expect(table.getByRole("link")).toHaveCount(offers.length);
    for (const offer of offers)
      await expect(
        table.getByRole("link", { name: `Product #${offer}`, exact: true }),
      ).toHaveAttribute("href", new RegExp(offer));
    await expect(table).not.toContainText("larger stock");
    expect(
      await dialog.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await dialog
    .getByRole("table", { name: "Whole stock for this study" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("home-depot-stock-phone.png"),
  });
});

test("a sourced greenhouse exports exact stock and carries a matching store snapshot", async ({
  page,
}) => {
  const dialog = await studies(page);
  await dialog
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("greenhouse");
  await dialog
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Use Home Depot stock", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const prepare = page.getByRole("button", {
    name: "Prepare Home Depot list",
    exact: true,
  });
  await prepare.click();
  const paste = page.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(paste).toHaveValue(/43 boards.*#312528776/);
  await expect(paste).toHaveValue(/1 board.*#334216730/);
  await expect(paste).toHaveValue(/4 timbers.*#205220341/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page
    .getByRole("button", { name: "Record store snapshot", exact: true })
    .click();
  const snapshot = page.getByRole("dialog");
  await snapshot
    .getByRole("combobox", { name: "Modeled material", exact: true })
    .selectOption("hd-spf-2x6-8");
  await snapshot
    .getByRole("button", {
      name: "Use reviewed product reference",
      exact: true,
    })
    .click();
  await expect(
    snapshot.getByLabel("Internet number", { exact: true }),
  ).toHaveValue("334216730");
  await snapshot.getByLabel("Unit price (USD)", { exact: true }).fill("7");
  await snapshot.getByLabel("Available stock units", { exact: true }).fill("2");
  await snapshot.getByLabel("Exact store number", { exact: true }).fill("4409");
  await snapshot.getByRole("checkbox").check();
  await snapshot
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await prepare.click();
  const ridge = page
    .getByRole("listitem")
    .filter({ hasText: /2 × 6.*334216730/ });
  await expect(ridge).toContainText("2 available in snapshot");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideFile).path())!, "utf8");
  expect(guide).toContain("Home Depot stock references");
  expect(guide).toContain("Internet #334216730");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id,
    CURRENT_DRAFT_KEY,
  );
  const reply = await page.request.get(`/api/projects/${id}`);
  expect(reply.ok()).toBe(true);
  const stored = projectSchema.parse((await reply.json()).project);
  expect(stored.inventory).toMatchObject([
    {
      material: "hd-spf-2x6-8",
      internetNumber: "334216730",
      zip: "84121",
      store: "4409",
    },
  ]);
  expect(
    stored.pieces.find((part) => part.designRole === "greenhouse-ridge")
      ?.material,
  ).toBe("hd-spf-2x6-8");
});

test("a deeper greenhouse selects a 10 ft ridge and saves the exact perimeter cuts", async ({
  page,
}, info) => {
  const dialog = await studies(page);
  await dialog
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("greenhouse");
  await dialog
    .getByRole("combobox", { name: "Outside depth units" })
    .selectOption("ft");
  await dialog
    .getByRole("spinbutton", { name: "Study outside depth", exact: true })
    .fill("9");
  await dialog
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Use Home Depot stock", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Study framing stock" }),
  ).toHaveValue("hd-spf-2x4-10");
  await expect(
    dialog.getByRole("combobox", { name: "Study base stock" }),
  ).toHaveValue("hd-treated-4x4-12");
  await expect(
    dialog.getByRole("combobox", { name: "Study ridge stock" }),
  ).toHaveValue("hd-spf-2x6-10");
  await dialog.getByText("Stock quantities", { exact: true }).click();
  const table = dialog.getByRole("table", {
    name: "Whole stock for this study",
  });
  for (const id of ["100077951", "203982343", "312528837"])
    await expect(
      table.getByRole("link", { name: `Product #${id}` }),
    ).toBeVisible();
  await expect(table).not.toContainText("larger stock");
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("greenhouse-nine-foot-stock.png"),
  });
  await dialog
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project,
    CURRENT_DRAFT_KEY,
  );
  const response = await page.request.get(`/api/projects/${stored.id}`);
  expect(response.ok()).toBe(true);
  const project = projectSchema.parse((await response.json()).project);
  expect(project.pieces.find(({ designRole }) => designRole === "greenhouse-ridge")?.material).toBe("hd-spf-2x6-10");
  const base = project.pieces.filter(
    ({ material }) => material === "hd-treated-4x4-12",
  );
  expect(base).toHaveLength(4);
  expect(
    base.map(({ size }) => Math.max(...size)).sort((a, b) => a - b),
  ).toEqual([72, 72, 101, 101]);
});

test("a 48-inch bookcase previews birch for the actual back and exports the product reference", async ({
  page,
}) => {
  const dialog = await studies(page);
  await dialog
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("shelves");
  await dialog
    .getByRole("combobox", { name: "Outside width units" })
    .selectOption("ft");
  await dialog
    .getByRole("spinbutton", { name: "Study outside width", exact: true })
    .fill("4");
  await dialog
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Use Home Depot stock", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Study panel stock" }),
  ).toHaveValue("hd-purebond-birch-703");
  await dialog.getByText("Stock quantities", { exact: true }).click();
  const table = dialog.getByRole("table", {
    name: "Whole stock for this study",
  });
  await expect(
    table.getByRole("link", { name: "Product #100077837" }),
  ).toBeVisible();
  await expect(table).toContainText("3 sheets");
  await expect(table).not.toContainText("larger stock");
  await dialog
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("PureBond birch plywood");
  expect(guide).toContain("Internet #100077837");
});
