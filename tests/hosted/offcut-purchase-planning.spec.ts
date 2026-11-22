import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("a practice offcut supplies two shorter parts and saves a new board on the shopping list", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(15_000);
  await page.goto("./");
  await page.getByRole("button", { name: /^Cut pool \(0\)$/ }).click();
  const sample = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download board-saving practice plan", exact: true }).click();
  const bytes = await readFile((await (await sample).path())!);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "save-a-board.yardwork.json", mimeType: "application/json", buffer: bytes,
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Can I buy fewer boards using my scraps?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Review cuts and stock to buy", exact: true }).click();
  const cuts = dialog.getByRole("list", { name: "Proposed cuts in order" }).getByRole("listitem");
  await expect(cuts).toHaveCount(2);
  await expect(cuts.nth(0)).toContainText("P001 · Practice rail 1");
  await expect(cuts.nth(1)).toContainText("P004 · Practice rail 4");
  await expect(cuts.nth(1)).toContainText("From an earlier cut");
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("4 → 3 boards");
  await expect(dialog.getByRole("list", { name: "Scraps to keep after these cuts" })).toContainText("12.75 in");
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".inspector-scroll .bom-row")).toContainText("3 boards");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const text = await readFile((await (await guide).path())!, "utf8");
  expect(text).toMatch(/O001 → P001[\s\S]*O002 → P004[\s\S]*12\.75 in/);
});
