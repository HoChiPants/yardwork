import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { blank, part, projectSchema } from "../../src/model";

test("measure a damaged offcut, apply only a fitting reuse, and reopen its cut guide", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const base = blank(`Checked scrap ${crypto.randomUUID().slice(0, 6)}`);
  const step = base.steps[0].id;
  const project = addMeasuredOffcut(base, step, "stud", [54, 3.5, 1.5], "Split end board");
  const fitting = { ...part("Short rail", "stud", [3.5, 1.5, 36], [0, 3, 0], step, "Cabinet"), stockLengthAxis: 2 as const };
  const oversize = { ...part("Long rail", "stud", [3.5, 1.5, 46], [10, 3, 0], step, "Cabinet"), stockLengthAxis: 2 as const };
  project.pieces.push(fitting, oversize);
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "split-end-board.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Cut pool (1)", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool" });
  await pool.getByRole("button", { name: "Measure O001", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Usable length", exact: true }).fill("44");
  const fromEnd = dialog.getByRole("spinbutton", { name: "Start from original end", exact: true });
  await fromEnd.fill("11");
  await expect(dialog.getByRole("status")).toContainText("beyond the recorded offcut");
  await expect(dialog.getByRole("button", { name: "Save usable blank" })).toBeDisabled();
  await fromEnd.fill("2");
  const preview = dialog.getByRole("region", { name: "Measured blank preview" });
  await expect(preview).toContainText("O002 · 44 in");
  await expect(preview.getByRole("img", { name: "Usable rectangle inside the original offcut" })).toBeVisible();
  await preview.screenshot({ path: info.outputPath("usable-rectangle.png") });
  await dialog.getByRole("button", { name: "Save usable blank" }).click();
  await expect(pool.getByRole("button", { name: "Inspect O002", exact: true })).toBeVisible();
  await pool.getByRole("button", { name: "Review offcut reuse", exact: true }).click();
  const cuts = dialog.getByRole("list", { name: "Proposed cuts in order" });
  await expect(cuts).toContainText("Short rail");
  await expect(cuts).not.toContainText("Long rail");
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft()).revision).toBe(1);
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.pieces.find(({ id }) => id === fitting.id)?.cutStock?.id).toBe(project.pieces[0].cutStock!.id);
  expect(saved.pieces.find(({ id }) => id === oversize.id)?.cutStock).toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Measure O001");
  expect(guide).toContain("remnant from measurement 1");
  expect(guide).toContain("Crosscut to 3 ft");
});
