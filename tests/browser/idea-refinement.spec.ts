import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { projectSchema, type Project } from "../../src/model";
import { bounds } from "../../src/engine";
const request =
  "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back";
async function begin(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan an idea", exact: true })
    .first()
    .click();
}
async function explore(page: Page, prompt: string) {
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill(prompt);
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.locator(".idea-proposal")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore idea", exact: true }),
  ).toBeEnabled();
}
async function apply(page: Page): Promise<Project> {
  await page
    .getByRole("button", { name: "Add proposed layout", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate((draftKey) => {
        const raw = localStorage.getItem(draftKey);
        return raw ? JSON.parse(raw).project.sections.length : 0;
      }, CURRENT_DRAFT_KEY),
    )
    .toBeGreaterThan(0);
  return projectSchema.parse(
    await page.evaluate(
      (draftKey) => JSON.parse(localStorage.getItem(draftKey)!).project,
      CURRENT_DRAFT_KEY,
    ),
  );
}

test("an overall run follow-up produces the exact96-inch assembly without multiplying section widths", async ({
  page,
}) => {
  await begin(page);
  await explore(page, request);
  await expect(page.locator(".idea-proposal .planner-module")).toHaveCount(3);
  await explore(page, "Make the overall width 96 inches");
  await expect(
    page.getByRole("spinbutton", {
      name: "Overall seating run width",
      exact: true,
    }),
  ).toHaveValue("96");
  for (const i of [1, 2, 3])
    await expect(
      page.getByRole("spinbutton", {
        name: `Banquette section ${i} width`,
        exact: true,
      }),
    ).toHaveValue("32");
  const project = await apply(page),
    bs = project.pieces.map(bounds);
  expect(
    Math.max(...bs.map((b) => b.max[0])) - Math.min(...bs.map((b) => b.min[0])),
  ).toBeCloseTo(96, 3);
  expect(
    project.sections.every(
      (s) => s.recipe?.width === 32 && s.recipe.storage && s.recipe.openingLid,
    ),
  ).toBe(true);
});
test("run and named-section controls reflow widths and Add cabinet preserves the existing seats", async ({
  page,
}) => {
  await begin(page);
  await explore(page, request);
  await page
    .getByRole("spinbutton", { name: "Overall seating run width", exact: true })
    .fill("90");
  for (const i of [1, 2, 3])
    await expect(
      page.getByRole("spinbutton", {
        name: `Banquette section ${i} width`,
        exact: true,
      }),
    ).toHaveValue("30");
  await page
    .getByRole("spinbutton", { name: "Banquette section 2 width", exact: true })
    .fill("36");
  await expect(
    page.getByRole("spinbutton", {
      name: "Overall seating run width",
      exact: true,
    }),
  ).toHaveValue("96");
  await explore(
    page,
    "Add a cabinet 36 inches wide, 16 inches deep and 60 inches high next to the seats",
  );
  await expect(page.locator(".idea-proposal .planner-module")).toHaveCount(4);
  for (const [i, width] of [
    [1, "30"],
    [2, "36"],
    [3, "30"],
  ] as const)
    await expect(
      page.getByRole("spinbutton", {
        name: `Banquette section ${i} width`,
        exact: true,
      }),
    ).toHaveValue(width);
  await expect(
    page.getByRole("spinbutton", { name: "Cabinet box height", exact: true }),
  ).toHaveValue("60");
  await explore(page, "Make the depth 18");
  await expect(page.locator(".planner-questions")).toContainText(
    "inches or feet",
  );
  await expect(
    page.getByRole("spinbutton", { name: "Cabinet box depth", exact: true }),
  ).toHaveValue("16");
  await explore(page, "Make seats 20 inches deep");
  const project = await apply(page),
    seats = project.sections.filter((s) => s.recipe?.kind === "bench"),
    cabinet = project.sections.find((s) => s.recipe?.kind === "cabinet")!;
  expect(seats.map((s) => s.recipe!.width)).toEqual([30, 36, 30]);
  expect(
    seats.every(
      (s) => s.recipe?.depth === 20 && s.recipe.storage && s.recipe.openingLid,
    ),
  ).toBe(true);
  expect(cabinet.recipe?.depth).toBe(16);
  expect(cabinet.recipe?.height).toBe(60);
  expect(project.sections).toHaveLength(4);
});
test("a targeted greenhouse revision retains the added sauna instead of dropping unrelated proposal geometry", async ({
  page,
}) => {
  await begin(page);
  await explore(
    page,
    "Greenhouse 6 feet wide, 8 feet deep, 7 feet eave height and 24 inches roof rise",
  );
  await explore(page, "Add a sauna 4 feet wide, 4 feet deep and 7 feet high");
  await expect(
    page.getByRole("spinbutton", { name: "sauna clearWidth", exact: true }),
  ).toHaveValue("48");
  await explore(page, "Make greenhouse width 84 inches");
  await expect(
    page.getByRole("spinbutton", { name: "greenhouse width", exact: true }),
  ).toHaveValue("84");
  await expect(
    page.getByRole("spinbutton", { name: "sauna clearWidth", exact: true }),
  ).toHaveValue("48");
  const project = await apply(page);
  expect(project.sections.some((s) => s.name.startsWith("Greenhouse"))).toBe(
    true,
  );
  expect(project.sections.some((s) => s.name.startsWith("Sauna"))).toBe(true);
  expect(project.pieces.length).toBeGreaterThan(70);
});
