import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { blank, part, projectSchema, type Project } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import { cutPiece } from "../../src/engine";
import { generateBuildGuide } from "../../src/guide";
import { addSupply } from "../../src/supplies";
import { readFile } from "node:fs/promises";

const storagePrompt =
  "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back";
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
function seats(name: string) {
  let p = applyIdeaPlan(blank(name), localIdeaPlan({ prompt: storagePrompt }));
  p.pieces.push(
    part(
      "Spare shelf board",
      "one-four",
      [0.75, 36, 3.5],
      [90, 18, 0],
      p.steps[0].id,
      "Loose stock",
    ),
  );
  p = addSupply(
    p,
    "everbilt-29256-continuous-hinge",
    3,
    "Seat lids",
    "Keep the hinge review with the design.",
  );
  return p;
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
      name: "saved-design.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page);
}
async function revise(page: Page, title: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: `Revise design ${title}`, exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Revise your saved design.", exact: true }),
  ).toBeVisible();
}
async function applyRevision(page: Page) {
  await page
    .getByRole("button", { name: "Apply design changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page);
}

test("an applied three-seat design reopens and revises without duplicated assemblies or lost supplies", async ({
  page,
}) => {
  const initial = generateBuildGuide(seats(`Reopen design ${Date.now()}`));
  initial.steps[0].notes += "\nCheck the uneven wall before fastening.";
  initial.ideaBindings[0].assumptions.push(
    "Confirm the hinge manufacturer's mounting dimensions before drilling.",
  );
  const before = await importProject(page, initial);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: initial.name })
    .click();
  await revise(page, before.ideaBindings[0].title);
  await expect(page.locator(".planner-module")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Apply design changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill(
      "Keep the three storage sections and increase only the seat height to 20 inches",
    );
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explore idea", exact: true }),
  ).toBeEnabled();
  for (const i of [1, 2, 3])
    await expect(
      page.getByRole("spinbutton", {
        name: `Banquette section ${i} height`,
        exact: true,
      }),
    ).toHaveValue("20");
  const after = await applyRevision(page);
  expect(after.ideaBindings).toHaveLength(1);
  expect(after.ideaBindings[0].id).toBe(before.ideaBindings[0].id);
  expect(after.ideaBindings[0].entries.map((e) => e.id)).toEqual(
    before.ideaBindings[0].entries.map((e) => e.id),
  );
  expect(after.sections.map((s) => s.id)).toEqual(
    before.sections.map((s) => s.id),
  );
  expect(after.pieces.filter((p) => !p.offcut)).toHaveLength(43);
  expect(after.sections.every((s) => s.recipe?.height === 20)).toBe(true);
  expect(after.supplies).toEqual(before.supplies);
  const extra = before.pieces.find((p) => p.name === "Spare shelf board")!;
  expect(after.pieces.find((p) => p.id === extra.id)).toEqual(extra);
  expect(after.steps.some((s) => s.notes.includes("uneven wall"))).toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const path = await (await pending).path();
  expect(path).toBeTruthy();
  const guide = await readFile(path!, "utf8");
  expect(guide).toContain("Saved design reviews");
  expect(guide).toContain("manufacturer's mounting dimensions");
  expect(guide).toContain("uneven wall");
});

test("editing one saved seat preserves a neighboring custom cut and offcut byte for byte", async ({
  page,
}) => {
  let initial = seats("Scoped seat revision");
  const first = initial.sections[0],
    lid = initial.pieces.find(
      (p) => first.pieceIds.includes(p.id) && p.name.endsWith("seat lid"),
    )!;
  initial = cutPiece(initial, lid.id, lid.size[0] - 2, 0);
  const before = await importProject(page, initial),
    binding = before.ideaBindings[0],
    entry = binding.entries[1];
  await revise(page, binding.title);
  await page
    .getByRole("combobox", { name: "Design to edit", exact: true })
    .selectOption(`${binding.id}/${entry.id}`);
  await expect(page.locator(".planner-module")).toHaveCount(1);
  await page
    .getByRole("spinbutton", {
      name: "Banquette section 2 height",
      exact: true,
    })
    .fill("20");
  await expect(
    page.getByRole("checkbox", {
      name: "Replace reviewed manual edits",
      exact: true,
    }),
  ).toHaveCount(0);
  const after = await applyRevision(page);
  for (const piece of before.pieces.filter(
    (p) => first.pieceIds.includes(p.id) || p.offcut,
  ))
    expect(after.pieces.find((p) => p.id === piece.id)).toEqual(piece);
  expect(after.sections).toHaveLength(3);
  expect(
    after.sections.find((s) => s.id === before.sections[1].id)?.recipe?.height,
  ).toBe(20);
  expect(after.supplies).toEqual(before.supplies);
});

test("a destructive seat rebuild shows its real impact and retains recorded cut stock after acknowledgement", async ({
  page,
}) => {
  let initial = seats("Reviewed custom rebuild");
  const section = initial.sections[1],
    lid = initial.pieces.find(
      (p) => section.pieceIds.includes(p.id) && p.name.endsWith("seat lid"),
    )!;
  initial = cutPiece(initial, lid.id, lid.size[0] - 2, 0);
  const before = await importProject(page, initial),
    binding = before.ideaBindings[0];
  await revise(page, binding.title);
  await page
    .getByRole("combobox", { name: "Design to edit", exact: true })
    .selectOption(`${binding.id}/${binding.entries[1].id}`);
  await page
    .getByRole("spinbutton", {
      name: "Banquette section 2 height",
      exact: true,
    })
    .fill("20");
  await expect(
    page.getByRole("button", { name: "Apply design changes", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".proposal-impact")).toContainText(
    "Replace 14 parts",
  );
  await page
    .getByRole("checkbox", {
      name: "Replace reviewed manual edits",
      exact: true,
    })
    .check();
  const after = await applyRevision(page);
  expect(after.pieces.find((p) => p.id === lid.id)?.offcut).toBe(true);
  expect(after.pieces.find((p) => p.id === lid.id)?.cutStock).toEqual(
    before.pieces.find((p) => p.id === lid.id)?.cutStock,
  );
  for (const offcut of before.pieces.filter((p) => p.offcut))
    expect(after.pieces.find((p) => p.id === offcut.id)).toEqual(offcut);
  expect(after.pieces.filter((p) => !p.offcut)).toHaveLength(43);
});

test("whole greenhouse dimensions reopen with stable role sections and source-qualified glazing", async ({
  page,
}) => {
  const initial = createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    undefined,
    {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    },
  ).project;
  initial.workZone = { width: 144, depth: 144, height: 144 };
  const before = await importProject(page, initial),
    binding = before.ideaBindings[0];
  await revise(page, binding.title);
  await expect(
    page.getByRole("spinbutton", {
      name: "greenhouse eaveHeight",
      exact: true,
    }),
  ).toHaveValue("84");
  await page
    .getByRole("spinbutton", { name: "greenhouse eaveHeight", exact: true })
    .fill("90");
  const after = await applyRevision(page);
  expect(after.ideaBindings).toHaveLength(1);
  expect(after.ideaBindings[0].entries[0].id).toBe(binding.entries[0].id);
  expect(after.sections.map((s) => s.id).sort()).toEqual(
    before.sections.map((s) => s.id).sort(),
  );
  expect(after.pieces.some((p) => p.material === "sunlite-8mm")).toBe(true);
  expect(after.pieces.some((p) => p.cutPlanes.length === 2)).toBe(true);
  expect(after.ideaBindings[0].entries[0].spec.type).toBe("structure");
  await revise(page, after.ideaBindings[0].title);
  await page.getByText("Position and rotation", { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "greenhouse position X", exact: true })
    .fill("12");
  await page
    .getByRole("spinbutton", { name: "greenhouse position Z", exact: true })
    .fill("24");
  await page
    .getByRole("spinbutton", {
      name: "greenhouse rotation degrees",
      exact: true,
    })
    .fill("90");
  await expect(page.locator(".proposal-impact")).toContainText(
    "Replace 0 parts",
  );
  const moved = await applyRevision(page);
  expect(moved.ideaBindings[0].entries[0].pose.origin).toEqual([12, 0, 24]);
  expect(moved.ideaBindings[0].entries[0].pose.rotation[1]).toBeCloseTo(
    Math.PI / 2,
    6,
  );
  expect(moved.pieces.map((p) => p.id)).toEqual(after.pieces.map((p) => p.id));
  expect(
    moved.pieces.some(
      (p) =>
        JSON.stringify(p.position) !==
        JSON.stringify(after.pieces.find((old) => old.id === p.id)!.position),
    ),
  ).toBe(true);
  for (const piece of moved.pieces) {
    const old = after.pieces.find((p) => p.id === piece.id)!;
    expect(piece.size).toEqual(old.size);
    expect(piece.cutPlanes).toEqual(old.cutPlanes);
    expect(piece.stockLengthAxis).toBe(old.stockLengthAxis);
  }
});

test.describe("phone saved designs", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("older furniture enables revisions and can detach with undo without replacing parts", async ({
    page,
  }) => {
    let initial = seats("Older furniture");
    const source = initial.pieces.find(
      (p) =>
        initial.sections[0].pieceIds.includes(p.id) &&
        p.name.endsWith("seat lid"),
    )!;
    initial = cutPiece(initial, source.id, source.size[0] - 2, 0);
    initial.ideaBindings = [];
    const before = await importProject(page, initial);
    await page.getByRole("button", { name: "Sections", exact: true }).click();
    await page
      .getByText("Enable revisions for older furniture sections", {
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Enable revisions for Banquette section 1",
        exact: true,
      })
      .click();
    const adopted = await draft(page);
    expect(adopted.ideaBindings).toHaveLength(1);
    expect(adopted.pieces).toEqual(before.pieces);
    const rows = page.locator(".applied-design-row");
    await rows
      .getByText("Individual assemblies and actions", { exact: true })
      .click();
    await rows
      .getByRole("button", { name: "Make independent parts", exact: true })
      .click();
    const detached = await draft(page);
    expect(detached.ideaBindings).toHaveLength(0);
    expect(detached.pieces).toEqual(before.pieces);
    expect(detached.supplies).toEqual(before.supplies);
    await page.keyboard.press("Meta+z");
    const restored = await draft(page);
    expect(restored.ideaBindings[0].id).toBe(adopted.ideaBindings[0].id);
    expect(restored.pieces).toEqual(before.pieces);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
});
