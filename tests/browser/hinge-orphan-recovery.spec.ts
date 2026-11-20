import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { removeSection } from "../../src/sections";
import { hingeIntentSnapshot } from "../../src/hingeSchema";

async function fixture(removeOwners = false) {
  let project = projectSchema.parse(
    JSON.parse(
      await readFile(
        new URL(
          "../../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  project = {
    ...project,
    id: uid(),
    name: `SYNTHETIC orphan hinge recovery ${uid().slice(0, 8)}`,
  };
  if (removeOwners)
    for (const section of [...project.sections])
      project = removeSection(project, section.id);
  return project;
}
async function draft(page: Page, matches: (project: Project) => boolean) {
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
          return !!last && matches(last);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-orphan-hinge-project", {
      body: Buffer.from(JSON.stringify(last, null, 2)),
      contentType: "application/json",
    });
    throw error;
  }
  return last!;
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
      name: "synthetic-orphan-hinge.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function exportProject(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  if (!path) throw Error("Missing orphan editable export");
  const project = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return project;
}
async function saveReopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        return (
          response.ok() &&
          JSON.stringify((await response.json()).project.lidHingePlans) ===
            JSON.stringify(expected.lidHingePlans)
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
      JSON.stringify(actual.lidHingePlans) ===
        JSON.stringify(expected.lidHingePlans),
  );
}

test("a deleted owner keeps H001 reachable for explicit new-section mapping without changing other intent", async ({
  page,
}) => {
  const original = await fixture(),
    imported = await load(page, original),
    old = imported.lidHingePlans.find((plan) => plan.selectedForMotion)!;
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(old.sectionId);
  await page
    .getByRole("button", { name: "Remove section & parts", exact: true })
    .click();
  const orphan = await draft(
    page,
    (project) =>
      !project.sections.some((section) => section.id === old.sectionId),
  );
  expect(orphan.lidHingePlans).toEqual(imported.lidHingePlans);
  const target = orphan.sections.find((section) => section.recipe?.openingLid)!,
    moving = orphan.pieces.find(
      (piece) =>
        target.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
    )!,
    fixed = orphan.pieces.find(
      (piece) =>
        target.pieceIds.includes(piece.id) &&
        piece.designRole === "storage-rear",
    )!;
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(target.id);
  await page
    .getByRole("button", { name: "Measured hinges", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Measured lid hinges",
    exact: true,
  });
  await panel
    .getByRole("combobox", { name: "Saved hinge plan", exact: true })
    .selectOption(old.id);
  const summary = panel
    .locator("summary")
    .filter({ hasText: "Refresh or replace actual members" })
    .first();
  await summary.click();
  await expect(
    panel.getByRole("combobox", {
      name: "Replacement hinge section",
      exact: true,
    }),
  ).toHaveValue("");
  await panel
    .getByRole("combobox", { name: "Replacement hinge section", exact: true })
    .selectOption(target.id);
  await panel
    .getByRole("combobox", {
      name: "Replacement hinge moving member",
      exact: true,
    })
    .selectOption(moving.id);
  await panel
    .getByRole("combobox", {
      name: "Replacement hinge fixed member",
      exact: true,
    })
    .selectOption(fixed.id);
  await panel
    .getByRole("textbox", {
      name: "Hinge replacement review basis",
      exact: true,
    })
    .fill(
      "SYNTHETIC deliberate new-section mapping after owner deletion; no inferred replacement IDs.",
    );
  await panel
    .getByRole("button", {
      name: "Preview hinge member replacement",
      exact: true,
    })
    .click();
  await expect(panel.getByTestId("hinge-remap-preview")).toContainText(
    "Previous section: Missing section",
  );
  await panel
    .getByRole("button", { name: "Cancel hinge replacement", exact: true })
    .click();
  expect((await exportProject(page)).lidHingePlans).toEqual(
    orphan.lidHingePlans,
  );
  await panel
    .getByRole("button", {
      name: "Preview hinge member replacement",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", {
      name: "Apply hinge member replacement",
      exact: true,
    })
    .click();
  const mapped = await draft(
      page,
      (project) =>
        project.lidHingePlans.find((plan) => plan.id === old.id)?.sectionId ===
        target.id,
    ),
    plan = mapped.lidHingePlans.find((plan) => plan.id === old.id)!;
  expect(plan.selectedForMotion).toBe(false);
  expect(plan.axis.movingA).toBeNull();
  expect(
    plan.locations.every(
      (location) =>
        location.entranceLocal === null &&
        location.measurements.surfaceToTipDepth === null,
    ),
  ).toBe(true);
  expect(plan.referenceHistory.at(-1)!.previous).toEqual(
    hingeIntentSnapshot(old),
  );
  expect(plan.label).toBe(old.label);
  expect(mapped.lidHingePlans.filter((row) => row.id !== old.id)).toEqual(
    orphan.lidHingePlans.filter((row) => row.id !== old.id),
  );
  expect(mapped.pieces).toEqual(orphan.pieces);
  expect(mapped.hingeStockSources).toEqual(orphan.hingeStockSources);
  expect(mapped.supplies).toEqual(orphan.supplies);
  expect(mapped.notes).toBe(orphan.notes);
  expect((await exportProject(page)).lidHingePlans).toEqual(
    mapped.lidHingePlans,
  );
  const reopened = await saveReopen(page, mapped);
  expect(reopened.hingeStockSources).toEqual(mapped.hingeStockSources);
});

test("phone can intentionally remove one orphan when no opening sections remain, with Undo and exact other history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = await fixture(true),
    imported = await load(page, original);
  expect(imported.sections).toEqual([]);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const manager = page.getByRole("group", {
    name: "Hinge plans without an opening section",
    exact: true,
  });
  await manager.locator(":scope > summary").click();
  await expect(manager).toContainText("H001");
  await expect(manager).toContainText("H002");
  await expect(manager).toContainText("H003");
  await manager
    .getByRole("button", {
      name: "Remove H001 hinge plan",
      exact: true,
    })
    .click();
  const removed = await draft(
    page,
    (project) => project.lidHingePlans.length === 2,
  );
  expect(removed.lidHingePlans).toEqual(
    imported.lidHingePlans.filter((plan) => plan.label !== "H001"),
  );
  expect(removed.hingePlanLabels).toEqual(imported.hingePlanLabels);
  expect(removed.hingeStockSources).toEqual(imported.hingeStockSources);
  expect(removed.supplies).toEqual(imported.supplies);
  expect(removed.pieces).toEqual(imported.pieces);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await draft(
    page,
    (project) => project.lidHingePlans.length === 3,
  );
  expect(undone.lidHingePlans).toEqual(imported.lidHingePlans);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await draft(page, (project) => project.lidHingePlans.length === 2);
  expect((await exportProject(page)).lidHingePlans).toEqual(
    removed.lidHingePlans,
  );
  const reopened = await saveReopen(page, removed);
  expect(reopened.hingePlanLabels).toEqual(imported.hingePlanLabels);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
