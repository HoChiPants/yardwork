import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, projectSchema } from "../../src/model";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";

test("a requested set of equal blanks stays tied to its source and exports all cuts", async ({ page }) => {
  const base = blank(`Matching setup blocks ${crypto.randomUUID().slice(0, 8)}`);
  const project = addMeasuredOffcut(base, base.steps[0].id, "stud", [32.375, 3.5, 1.5], "Shop scrap");
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "matching-blanks.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Split O001 into four equal blanks.");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  await dialog.getByRole("button", { name: "Open offcut split", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Number of equal blanks" })).toHaveValue("4");
  await dialog.getByRole("textbox", { name: "Label all blanks" }).fill("Layout block");
  const preview = dialog.getByRole("region", { name: "Split cut preview" });
  await expect(preview).toContainText("3 cuts · 0.125 in blade allowance per cut");
  const pieces = preview.getByRole("list", { name: "Pieces to keep" }).getByRole("listitem");
  await expect(pieces).toHaveCount(4);
  for (const piece of await pieces.all()) await expect(piece).toContainText("Offcut · Layout block · 8 in");
  await dialog.getByRole("button", { name: "Save split to Cut pool", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await expect(pool).toContainText("Reusable offcuts (4)");
  await expect(pool.getByText("Expected offcut")).toHaveCount(4);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.project, CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.pieces.length).toBe(4);
  const saved = projectSchema.parse(await draft());
  expect(new Set(saved.pieces.map((piece) => piece.cutStock?.id))).toEqual(new Set([project.pieces[0].cutStock?.id]));

  await page.getByRole("button", { name: "View offcut cut order", exact: true }).click();
  const operations = dialog.getByRole("list", { name: "Offcut operations", exact: true }).getByRole("listitem");
  await expect(operations).toHaveCount(3);
  await expect(operations.nth(0)).toContainText("Set aside O003 for cut 2.");
  await expect(operations.nth(1)).toContainText("Set aside O005 for cut 3.");
  await expect(operations.nth(1)).toContainText("Mark cuts complete for operation 1 first.");
  await expect(dialog.getByRole("button", { name: "Mark cuts complete", exact: true })).toHaveCount(1);
  await operations.first().getByRole("button", { name: "Mark cuts complete", exact: true }).click();
  await expect(operations.first()).toContainText("Cuts marked complete");
  await expect(operations.nth(1).getByRole("button", { name: "Mark cuts complete", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(pool.getByText("Expected offcut")).toHaveCount(3);
  await expect(pool.locator(".cut-pool-row").filter({ hasText: "O002 ·" })).toContainText(" · on hand");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.revision, CURRENT_DRAFT_KEY)
  ).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: base.name }).click();
  await expect.poll(async () => (await draft())?.history.filter(
    (entry: { offcutCut?: { completedAt?: string } }) => entry.offcutCut?.completedAt,
  ).length).toBe(1);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide.match(/Crosscut to 8 in/g)).toHaveLength(3);
  expect(guide).toMatch(/Split O001[\s\S]+Split O003[\s\S]+Split O005/);
  expect(guide).toContain("Set aside O003 for cut 2.");
  expect(guide).toContain("Cuts marked complete");
  await expect(page.locator(".print-guide")).toContainText("Set aside O005 for cut 3.");
});

test("save two loose blanks from a suggested scrap cut", async ({ page }) => {
  await page.goto("./");
  const file = await page.request.get(new URL("./examples/cut-pool/split-scrap.yardwork.json", page.url()).href);
  expect(file.ok()).toBe(true);
  const original = projectSchema.parse(await file.json());
  const name = `Split practice ${crypto.randomUUID().slice(0, 8)}`;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "split-scrap.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...original, name, schemaVersion: 159 })),
  });
  await page.getByRole("button", { name: /^Cut pool \(/ }).click();
  await page.getByRole("button", { name: "Find uses for O001", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview finish sample", exact: true }).click();
  const length = dialog.getByRole("spinbutton", { name: "Length of first piece" });
  await expect(length).toHaveValue("6");
  const save = dialog.getByRole("button", { name: "Save split to Cut pool", exact: true });
  await length.fill("42.125");
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("leaves two pieces");
  await dialog.getByRole("button", { name: "Finish sample", exact: true }).click();
  const pieces = dialog.getByRole("list", { name: "Pieces to keep" });
  await expect(pieces).toContainText("O002 · Offcut · Finish sample · 6 in");
  await expect(pieces).toContainText("O003 · Offcut · Measured 2×4 scrap · 36.125 in");
  await save.click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await expect(pool).toContainText("Reusable offcuts (2)");
  await pool.getByRole("button", { name: "Split O003", exact: true }).click();
  await expect(length).toHaveValue("18");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: name }).click();
  const reopened = projectSchema.parse((await draft()).project);
  expect(reopened.pieces).toHaveLength(2);
  expect(reopened.pieces.every(({ offcut, cutStock }) => offcut && cutStock?.id === original.pieces[0].cutStock?.id)).toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Recorded offcut cut order[\s\S]*Split O001[\s\S]*Crosscut to 6 in[\s\S]*Keep O002.+O003/);
  expect(await page.locator(".print-guide").textContent()).toContain("Split O001");
});
