import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { projectSchema, type Project } from "../../src/model";
import { bounds, cutPiece } from "../../src/engine";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import { findRetailerProduct } from "../../src/retailerCatalog";

async function draft(page: Page): Promise<Project> {
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
        return !!raw && Date.now() - changed > 400;
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBe(true);
  return projectSchema.parse(JSON.parse(previous!).project);
}
function fixture(name = "Casework workshop") {
  const p = createBuildStudy(
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
  return { ...p, name };
}
function role(p: Project, name: string) {
  const sectionId = p.ideaBindings[0].entries[0].sections.find(
    (s) => s.role === name,
  )!.sectionId;
  const section = p.sections.find((s) => s.id === sectionId)!;
  return p.pieces.find((p) => section.pieceIds.includes(p.id))!;
}
function parameters(p: Project) {
  const spec = p.ideaBindings[0].entries[0].spec;
  if (spec.type !== "structure" || spec.structure.kind !== "casework-shelves")
    throw Error("Missing whole casework family");
  return spec.structure.parameters;
}
async function importProject(page: Page, p: Project) {
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
      name: "casework.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page);
}
async function revise(page: Page, p: Project) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Revise design ${p.ideaBindings[0].title}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Panel bookcase", exact: true }),
  ).toBeVisible();
}
async function apply(page: Page) {
  await page
    .getByRole("button", { name: "Apply design changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page);
}
async function saveAndReopen(page: Page, name: string) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: name })
    .click();
  return draft(page);
}

test("source-selected study saves and resizes as one coherent bookcase with equal clear openings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("shelves");
  await page
    .getByRole("combobox", { name: "Outside width units", exact: true })
    .selectOption("in");
  await page
    .getByRole("spinbutton", { name: "Study outside width", exact: true })
    .fill("47.5");
  await page.getByText("Source-matched stock options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Study panel stock", exact: true })
    .selectOption("plytanium-703");
  await page
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  const name = `Whole bookcase ${Date.now()}`;
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const before = await saveAndReopen(page, name);
  expect(before.ideaBindings).toHaveLength(1);
  expect(before.ideaBindings[0].entries).toHaveLength(1);
  expect(before.pieces).toHaveLength(8);
  await revise(page, before);
  for (const [field, value] of Object.entries({
    width: 40,
    depth: 20,
    height: 78,
    shelfCount: 4,
    shelfClearance: 0.5,
  }))
    await page
      .getByRole("spinbutton", {
        name: `casework-shelves ${field}`,
        exact: true,
      })
      .fill(String(value));
  const after = await apply(page);
  expect(after.pieces.filter((p) => !p.offcut)).toHaveLength(9);
  expect(after.ideaBindings[0].id).toBe(before.ideaBindings[0].id);
  expect(after.ideaBindings[0].entries[0].id).toBe(
    before.ideaBindings[0].entries[0].id,
  );
  expect(after.pieces.every((p) => p.material === "plytanium-703")).toBe(true);
  expect(role(after, "back").size).toEqual([40, 78, 0.703]);
  expect(role(after, "side-left").size).toEqual([0.703, 78, 19.297]);
  expect(role(after, "shelf-1").size[0]).toBeCloseTo(38.594, 6);
  expect(role(after, "shelf-1").size[1]).toBe(0.703);
  expect(role(after, "shelf-1").size[2]).toBeCloseTo(18.797, 6);
  const rows = [
    "bottom",
    "shelf-1",
    "shelf-2",
    "shelf-3",
    "shelf-4",
    "top",
  ].map((r) => bounds(role(after, r)));
  const clear = (78 - 6 * 0.703) / 5;
  for (let i = 1; i < rows.length; i++)
    expect(rows[i].min[1] - rows[i - 1].max[1]).toBeCloseTo(clear, 6);
  for (const r of before.ideaBindings[0].entries[0].sections)
    expect(
      after.ideaBindings[0].entries[0].sections.find((s) => s.role === r.role)
        ?.sectionId,
    ).toBe(r.sectionId);
  const reopened = await saveAndReopen(page, name);
  expect(reopened.ideaBindings).toEqual(after.ideaBindings);
  expect(reopened.pieces).toEqual(after.pieces);
  expect(errors).toEqual([]);
});

test("natural followups add and remove shelves inside the existing plywood bookcase", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan an idea", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill(
      "Plywood bookcase 36 inches wide, 16 inches deep and 72 inches high, with three adjustable shelves",
    );
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", {
      name: "casework-shelves shelfCount",
      exact: true,
    }),
  ).toHaveValue("3");
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill("Add a shelf inside this bookcase");
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", {
      name: "casework-shelves shelfCount",
      exact: true,
    }),
  ).toHaveValue("4");
  await page
    .getByRole("button", { name: "Add proposed layout", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await draft(page);
  expect(before.pieces).toHaveLength(9);
  expect(before.ideaBindings[0].entries).toHaveLength(1);
  await revise(page, before);
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill("Remove one shelf and make this bookcase 84 inches tall");
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", {
      name: "casework-shelves shelfCount",
      exact: true,
    }),
  ).toHaveValue("3");
  const after = await apply(page);
  expect(after.pieces.filter((p) => !p.offcut)).toHaveLength(8);
  expect(parameters(after)).toEqual({
    ...parameters(before),
    shelfCount: 3,
    height: 84,
  });
  expect(after.ideaBindings[0].entries[0].id).toBe(
    before.ideaBindings[0].entries[0].id,
  );
});

test("whole-casework pose preserves a custom cut and resizing requires reviewed replacement", async ({
  page,
}) => {
  let initial = fixture("Cut casework review");
  const side = role(initial, "side-left");
  initial = cutPiece(initial, side.id, 70, 1);
  const before = await importProject(page, initial);
  await revise(page, before);
  await page.getByText("Position and rotation", { exact: true }).click();
  await page
    .getByRole("spinbutton", {
      name: "casework-shelves position X",
      exact: true,
    })
    .fill("6");
  await page
    .getByRole("spinbutton", {
      name: "casework-shelves rotation degrees",
      exact: true,
    })
    .fill("15");
  await expect(page.locator(".proposal-impact")).toContainText(
    "Replace 0 parts",
  );
  const moved = await apply(page);
  expect(moved.pieces.map((p) => p.id)).toEqual(before.pieces.map((p) => p.id));
  for (const p of before.pieces) {
    const actual = moved.pieces.find((q) => q.id === p.id)!;
    expect(actual.size).toEqual(p.size);
    expect(actual.cutStock).toEqual(p.cutStock);
    if (p.offcut) expect(actual).toEqual(p);
  }
  expect(moved.ideaBindings[0].entries[0].pose.origin[0]).toBe(6);
  await revise(page, moved);
  await page
    .getByRole("spinbutton", { name: "casework-shelves width", exact: true })
    .fill("32");
  await expect(
    page.getByRole("button", { name: "Apply design changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Replace reviewed manual edits",
      exact: true,
    })
    .check();
  const rebuilt = await apply(page);
  expect(rebuilt.pieces.find((p) => p.id === side.id)?.offcut).toBe(true);
  expect(rebuilt.pieces.find((p) => p.id === side.id)?.cutStock).toEqual(
    before.pieces.find((p) => p.id === side.id)?.cutStock,
  );
  for (const p of before.pieces.filter((p) => p.offcut))
    expect(rebuilt.pieces.find((q) => q.id === p.id)).toEqual(p);
  expect(parameters(rebuilt).width).toBe(32);
  expect(role(rebuilt, "side-left").size[0]).toBe(0.703);
});

test("shelf-pin purchasing and jig review stay separate from installed supports", async ({
  page,
}) => {
  const initial = {
    ...fixture("Shelf-pin purchasing"),
    retailer: "lowes" as const,
  };
  const before = await importProject(page, initial);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Reviewed KMA3232", exact: true })
    .check();
  await page.getByRole("button", { name: "List", exact: true }).click();
  const panel = page.locator(".supplies-panel");
  await panel.locator(":scope > summary").click();
  await panel
    .getByRole("combobox", { name: "Choose a supply", exact: true })
    .selectOption("kreg-kma-5mpin");
  await panel.getByRole("button", { name: "Add supply", exact: true }).click();
  const row = panel
    .locator(".supply-row")
    .filter({ hasText: findRetailerProduct("kreg-kma-5mpin")!.name });
  await expect(row).toContainText("20");
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Pricing coverage", exact: true })
    .getByTestId("pricing-unpriced")).toBeVisible();
  const after = await draft(page);
  expect(after.pieces).toEqual(before.pieces);
  expect(after.joints).toEqual(before.joints);
  expect(after.supplies).toHaveLength(1);
  expect(after.supplies[0]).toMatchObject({
    productId: "kreg-kma-5mpin",
    quantity: 1,
  });
  expect(after.toolSelections.some((t) => t.productId === "kreg-kma3232")).toBe(
    true,
  );
});

test.describe("phone whole-casework controls", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("each dimension has its own units and shelf count remains an integer", async ({
    page,
  }) => {
    const before = await importProject(page, fixture("Phone mixed units"));
    await revise(page, before);
    await page
      .getByRole("combobox", { name: "width units", exact: true })
      .selectOption("ft");
    await page
      .getByRole("spinbutton", { name: "casework-shelves width", exact: true })
      .fill("3.5");
    await page
      .getByRole("spinbutton", {
        name: "casework-shelves shelfCount",
        exact: true,
      })
      .fill("4");
    await page
      .getByRole("spinbutton", {
        name: "casework-shelves shelfClearance",
        exact: true,
      })
      .fill("0.5");
    await expect(
      page.getByRole("combobox", { name: "depth units", exact: true }),
    ).toHaveValue("in");
    await expect(
      page.getByRole("spinbutton", {
        name: "casework-shelves depth",
        exact: true,
      }),
    ).toHaveValue("18");
    await expect(
      page.getByRole("spinbutton", {
        name: "casework-shelves height",
        exact: true,
      }),
    ).toHaveValue("72");
    await expect(
      page.getByRole("combobox", { name: /shelf count units/i }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const after = await apply(page);
    expect(parameters(after)).toMatchObject({
      width: 42,
      depth: 18,
      height: 72,
      shelfCount: 4,
      shelfClearance: 0.5,
    });
    expect(after.pieces).toHaveLength(9);
    expect(role(after, "side-left").size[0]).toBe(0.703);
  });
});
