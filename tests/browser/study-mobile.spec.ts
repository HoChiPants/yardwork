import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { projectSchema } from "../../src/model";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function openStudies(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Explore whole builds.");
}
async function expectWithinPhone(element: Locator) {
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390.5);
  expect(box!.width).toBeGreaterThan(30);
  expect(box!.height).toBeGreaterThanOrEqual(24);
}
async function expectNoModalOverflow(page: Page) {
  const dimensions = await page
    .getByRole("dialog")
    .evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  const documentDimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(documentDimensions.scroll).toBeLessThanOrEqual(
    documentDimensions.client + 1,
  );
}

test("phone gallery has usable independent units, source selectors, preview and Open action without horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openStudies(page);
  const dialog = page.getByRole("dialog"),
    choose = page.getByRole("combobox", {
      name: "Choose a build study",
      exact: true,
    });
  await expectWithinPhone(choose);
  await choose.selectOption("greenhouse");
  const width = page.getByRole("spinbutton", {
      name: "Study outside width",
      exact: true,
    }),
    depth = page.getByRole("spinbutton", {
      name: "Study outside depth",
      exact: true,
    });
  await expectWithinPhone(width);
  await expectWithinPhone(depth);
  await page
    .getByRole("combobox", { name: "Outside width units", exact: true })
    .selectOption("in");
  await width.fill("84");
  await expect(width).toHaveValue("84");
  await expect(depth).toHaveValue("8");
  await expect(
    page.getByRole("combobox", { name: "Outside depth units", exact: true }),
  ).toHaveValue("ft");
  await dialog.locator(".study-material-selection summary").click();
  const glazing = page.getByRole("combobox", {
    name: "Study greenhouse glazing",
    exact: true,
  });
  await expectWithinPhone(glazing);
  await glazing.selectOption("sunlite-8mm");
  await expect(dialog).toContainText("no system allowance deductions");
  const preview = dialog.locator(".build-study-preview");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator("canvas")).toBeVisible();
  const previewBox = await preview.boundingBox();
  expect(previewBox!.width).toBeGreaterThan(200);
  expect(previewBox!.height).toBeGreaterThan(240);
  await preview.screenshot({
    path: "test-results/build-studies/mobile-sunlite-preview.png",
  });
  await expectNoModalOverflow(page);
  const open = page.getByRole("button", {
    name: "Open as new project",
    exact: true,
  });
  await expectWithinPhone(open);
  await expect(open).toBeEnabled();
  await open.click();
  await expect(
    page.getByRole("heading", {
      name: "Gabled greenhouse framing study",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate((draftKey) => {
          const raw = localStorage.getItem(draftKey);
          return raw
            ? JSON.parse(raw).project.pieces.some(
                (p: { material: string }) => p.material === "sunlite-8mm",
              )
            : false;
        }, CURRENT_DRAFT_KEY),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("phone study selection and expanded cut list remain within the modal and preserve exact rod/panel choices", async ({
  page,
}) => {
  await openStudies(page);
  const dialog = page.getByRole("dialog"),
    choose = page.getByRole("combobox", {
      name: "Choose a build study",
      exact: true,
    });
  for (const [id, parts] of [
    ["storage-banquette", 42],
    ["shelves", 8],
    ["closet-insert", 10],
    ["greenhouse", 68],
    ["sauna", 46],
  ] as const) {
    await choose.selectOption(id);
    await expect(dialog).toContainText(`${parts} actual editable parts`);
    await expectNoModalOverflow(page);
  }
  await choose.selectOption("closet-insert");
  await dialog.locator(".study-material-selection summary").click();
  await page
    .getByRole("combobox", { name: "Study panel stock", exact: true })
    .selectOption("plytanium-703");
  const rod = page.getByRole("combobox", {
    name: "Study closet hanging rods",
    exact: true,
  });
  await expectWithinPhone(rod);
  await rod.selectOption("closet-rod-72");
  await expect(dialog).toContainText("12 actual editable parts");
  await dialog.locator(".study-cut-list summary").click();
  await expect(dialog.locator(".study-cut-list table")).toBeVisible();
  await expectNoModalOverflow(page);
  const close = page.getByRole("button", { name: "Close dialog", exact: true });
  await expectWithinPhone(close);
  await dialog.screenshot({
    path: "test-results/build-studies/mobile-gallery.png",
  });
  const open = page.getByRole("button", {
    name: "Open as new project",
    exact: true,
  });
  await expectWithinPhone(open);
  await open.click();
  await expect
    .poll(
      async () =>
        await page.evaluate((draftKey) => {
          const raw = localStorage.getItem(draftKey);
          return raw ? JSON.parse(raw).project.pieces.length : 0;
        }, CURRENT_DRAFT_KEY),
    )
    .toBe(12);
  const output = projectSchema.parse(
    await page.evaluate(
      (draftKey) => JSON.parse(localStorage.getItem(draftKey)!).project,
      CURRENT_DRAFT_KEY,
    ),
  );
  expect(
    output.pieces.filter((p) => p.material === "closet-rod-72"),
  ).toHaveLength(2);
  expect(
    output.pieces.filter((p) => p.material === "plytanium-703"),
  ).toHaveLength(10);
});
