import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { blank, projectSchema } from "../../src/model";

test("seat descriptions and positional follow-ups produce only the three requested modules", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  const planner = dialog.getByRole("combobox", { name: "Planner", exact: true });
  if (await planner.count()) await planner.selectOption("built-in");
  const idea = dialog.getByRole("textbox", { name: "Describe your idea" });
  const explore = dialog.getByRole("button", { name: "Explore idea", exact: true });
  const apply = dialog.getByRole("button", { name: "Add proposed layout", exact: true });
  await idea.fill("Build a straight 69 in storage banquette with three sections, a finished seat height of 18 in, opening lids, and no back.");
  await explore.click();
  await expect(apply).toBeEnabled();
  await idea.fill("Make the middle seat 2 inches taller and the right-hand seat 1 inch deeper.");
  await explore.click();
  await expect(dialog.getByText(/Workspace dimensions ·/)).toBeVisible();
  await apply.click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.project?.sections.length).toBe(3);
  const project = projectSchema.parse((await draft()).project);
  const layouts = project.sections.map(({ recipe }) => recipe!);
  expect(layouts.map(({ width, height, depth }) => [width, height, depth])).toEqual([[23, 18, 24], [23, 20, 24], [23, 18, 25]]);
  expect(layouts.every(({ openingLid, backHeight, storage }) => openingLid && !backHeight && storage)).toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const text = await readFile((await (await download).path())!, "utf8");
  expect(text).toContain("Banquette section 3");
  expect(text).not.toContain("Banquette section 4");
});

test("a room idea previews both items, reuses plywood and applies one editable layout", async ({ page }) => {
  const room = { ...blank("Two-piece kitchenette workshop"), workZone: { width: 126, depth: 66, height: 96 } };
  const initial = addMeasuredOffcut(room, room.steps[0].id, "plywood", [58, 13, 0.75], "Shelf panel remnant");
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchenette-workshop.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(initial)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const planner = dialog.getByRole("combobox", { name: "Planner", exact: true });
  if (await planner.count()) await planner.selectOption("built-in");
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill(
    "Build a 72 in wide, 24 in deep, 18 in tall storage banquette with three sections and lift-up lids. No back. Add a 30 in wide, 14 in deep, 66 in tall plywood bookcase with four shelves to its right, with a 3 in gap.",
  );
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Placement changes" })).toBeVisible();
  await expect(dialog.getByText("Placed Panel casework bookcase study to the right with a 3 in gap.", { exact: true }).first()).toBeVisible();
  const apply = dialog.getByRole("button", { name: "Add proposed layout", exact: true });
  await expect(apply).toBeEnabled();
  await dialog.getByText("Cuts and stock", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Use matching scraps for the new parts" }).check();
  await expect(dialog.getByText(/Shelf panel remnant/).first()).toBeVisible();
  await apply.click();
  await expect(dialog).toHaveCount(0);

  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.project?.ideaBindings?.[0]?.entries?.length).toBe(4);
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.ideaBindings[0].entries.filter(({ spec }) => spec.type === "structure")).toHaveLength(1);
  const shelves = saved.pieces.filter(({ name }) => /^Adjustable shelf/.test(name) && !name.includes("offcut"));
  expect(shelves).toHaveLength(4);
  expect(shelves.filter(({ cutStock }) => !!cutStock)).toHaveLength(2);
  expect(saved.sections.filter(({ recipe }) => recipe?.openingLid).length).toBe(3);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Recorded offcut cut order");
  expect(guide).toContain("Shelf panel remnant");
  expect(guide).toContain("Adjustable shelf");
});
