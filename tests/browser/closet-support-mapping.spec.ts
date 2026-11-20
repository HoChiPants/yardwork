import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { expect, test, type Page } from "@playwright/test";
import { projectSchema, type Project } from "../../src/model";
import { createBuildStudy } from "../../src/buildFixtures";
import { closetSupportRoleOptions } from "../../src/attachments";
import { cutPiece } from "../../src/engine";
import { reconcileSections } from "../../src/sections";

function fixture(name: string, cut = false) {
  let project = createBuildStudy("closet-insert", undefined, undefined, {
    caseworkPanels: {
      materialId: "plytanium-703",
      productRegistryRef: "plytanium-bc-201428",
    },
  }).project;
  const editedShelf = project.pieces.find(
    (piece) => piece.designRole === "tower-shelf-1",
  )!;
  if (cut)
    project = reconcileSections(cutPiece(project, editedShelf.id, 20, 0));
  project = projectSchema.parse({
    ...project,
    name,
    pieces: project.pieces.map((piece, index) => {
      const { designRole: _role, ...rest } = piece;
      return { ...rest, name: `User panel ${project.pieces.length - index}` };
    }),
  });
  return { project, editedShelfId: editedShelf.id };
}
const physical = (project: Project) =>
  project.pieces.map((piece) => {
    const { designRole: _role, ...rest } = piece;
    return rest;
  });
async function currentDraft(page: Page): Promise<Project | null> {
  const raw = await page.evaluate(
    (draftKey) => localStorage.getItem(draftKey),
    CURRENT_DRAFT_KEY,
  );
  return raw ? projectSchema.parse(JSON.parse(raw).project) : null;
}
async function waitDraft(
  page: Page,
  predicate: (project: Project) => boolean,
): Promise<Project> {
  await expect
    .poll(async () => {
      const project = await currentDraft(page);
      return !!project && predicate(project);
    })
    .toBe(true);
  return (await currentDraft(page))!;
}
async function importAndMap(page: Page, project: Project) {
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
      name: "legacy-closet.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const baseline = await waitDraft(page, (actual) =>
    actual.name.startsWith(project.name),
  );
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan shelf supports", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create a shelf support plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Map closet support roles", exact: true })
    .click();
  const mapping = page.getByRole("region", {
    name: "Closet support role mapping",
    exact: true,
  });
  await expect(mapping).toBeVisible();
  return { mapping, baseline };
}

test("legacy closet suggestions need confirmation and duplicate panel selections cannot be saved", async ({
  page,
}) => {
  const { project } = fixture("Legacy closet explicit mapping");
  const { mapping, baseline } = await importAndMap(page, project);
  const entryId = baseline.ideaBindings[0].entries[0].id;
  const options = closetSupportRoleOptions(baseline, entryId);
  const confirm = mapping.getByRole("button", {
    name: "Confirm closet support roles",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  for (const option of options)
    await expect(
      mapping.getByRole("combobox", { name: `Panel for ${option.label}` }),
    ).toHaveValue("");
  expect((await currentDraft(page))!.pieces.every((p) => !p.designRole)).toBe(
    true,
  );
  await mapping
    .getByRole("button", { name: "Use all suggested panels", exact: true })
    .click();
  await expect(confirm).toBeEnabled();
  expect((await currentDraft(page))!.pieces.every((p) => !p.designRole)).toBe(
    true,
  );
  const left = options.find((option) => option.role === "tower-left")!,
    right = options.find((option) => option.role === "tower-right")!;
  await mapping
    .getByRole("combobox", { name: `Panel for ${left.label}` })
    .selectOption(right.suggestedPieceId!);
  await expect(confirm).toBeDisabled();
  await expect(
    mapping.getByText(/This panel is selected for more than one role/),
  ).toHaveCount(2);
  await mapping
    .getByRole("button", { name: "Cancel role mapping", exact: true })
    .click();
  expect((await currentDraft(page))!.pieces.every((p) => !p.designRole)).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Map closet support roles", exact: true })
    .click();
  await expect(confirm).toBeDisabled();
  await mapping
    .getByRole("button", { name: "Use all suggested panels", exact: true })
    .click();
  await confirm.click();
  const mapped = await waitDraft(
    page,
    (actual) => actual.pieces.filter((piece) => piece.designRole).length === 6,
  );
  expect(physical(mapped)).toEqual(physical(baseline));
  expect(mapped.sections).toEqual(baseline.sections);
  expect(mapped.attachmentPlans).toEqual([]);
  for (const option of options)
    expect(
      mapped.pieces.find((piece) => piece.id === option.suggestedPieceId)
        ?.designRole,
    ).toBe(option.role);
  const panel = page.getByRole("region", {
    name: "Shelf support plans",
    exact: true,
  });
  await panel
    .getByRole("checkbox", {
      name: "Plan supports for Tower shelf 1",
      exact: true,
    })
    .check();
  await panel
    .getByRole("button", { name: "Create 4 support targets", exact: true })
    .click();
  const planned = await waitDraft(
    page,
    (actual) => actual.attachmentPlans.length === 1,
  );
  expect(planned.attachmentPlans[0].shelfRoles).toEqual(["tower-shelf-1"]);
  expect(planned.attachmentPlans[0].points).toHaveLength(4);
  expect(physical(planned)).toEqual(physical(baseline));
});

test("phone mapping requires a manual choice for a cut shelf and preserves its cut source and offcut", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { project, editedShelfId } = fixture(
    "Edited closet manual mapping",
    true,
  );
  const { mapping, baseline } = await importAndMap(page, project);
  const options = closetSupportRoleOptions(
      baseline,
      baseline.ideaBindings[0].entries[0].id,
    ),
    editedRole = options.find((option) => option.role === "tower-shelf-1")!;
  expect(editedRole.suggestedPieceId).toBeNull();
  const select = mapping.getByRole("combobox", {
    name: `Panel for ${editedRole.label}`,
  });
  const values = await select
    .locator("option")
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLOptionElement).value),
    );
  for (const offcut of baseline.pieces.filter((piece) => piece.offcut))
    expect(values).not.toContain(offcut.id);
  await mapping
    .getByRole("button", { name: "Use all suggested panels", exact: true })
    .click();
  const confirm = mapping.getByRole("button", {
    name: "Confirm closet support roles",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await select.selectOption(editedShelfId);
  await expect(confirm).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await confirm.click();
  const mapped = await waitDraft(
    page,
    (actual) =>
      actual.pieces.find((piece) => piece.id === editedShelfId)?.designRole ===
      "tower-shelf-1",
  );
  expect(physical(mapped)).toEqual(physical(baseline));
  expect(
    mapped.pieces.find((piece) => piece.id === editedShelfId)?.cutStock,
  ).toEqual(
    baseline.pieces.find((piece) => piece.id === editedShelfId)?.cutStock,
  );
  expect(mapped.pieces.filter((piece) => piece.offcut)).toEqual(
    baseline.pieces.filter((piece) => piece.offcut),
  );
  expect(mapped.joints).toEqual(baseline.joints);
});
