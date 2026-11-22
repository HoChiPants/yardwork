import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { inspectCutStock } from "../../src/cutStock";
import { projectSchema } from "../../src/model";

test("choose a drywall length, score a panel and carry the leftover and exact sheet to the handoff", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("textbox", { name: "Find a material" }).fill("drywall");
  const add = page.getByRole("button", { name: "Add ½ in drywall", exact: true });
  await expect(page.locator(".material-card").filter({ has: add })).toHaveText("½ in drywall");
  await add.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "12 ft", exact: true }).check();
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Stock length axis", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(dialog).toContainText("score-and-snap");
  await dialog.getByRole("spinbutton", { name: "Retained length", exact: true }).fill("6");
  await dialog.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await page.getByRole("button", { name: "Cut pool (1)", exact: true }).click();
  await expect(page.getByRole("region", { name: "Cut pool", exact: true })).toContainText("6 ft");

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#202530306");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const project = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  expect(project.pieces.map(({ size }) => size)).toEqual([[48, 0.5, 72], [48, 0.5, 72]]);
  expect(inspectCutStock(project).valid.size).toBe(1);
});

test("a measured drywall offcut can cover a panel from the Cut pool", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("textbox", { name: "Find a material" }).fill("drywall");
  await page.getByRole("button", { name: "Add ½ in drywall", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
  const width = page.getByRole("spinbutton", { name: "Width X", exact: true });
  await width.fill("24");
  await width.press("Enter");

  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  await page.getByRole("button", { name: "Add measured offcut", exact: true }).click();
  await dialog.getByRole("combobox", { name: /^Matching stock/ }).selectOption("hd-usg-drywall-half-8");
  await dialog.getByRole("spinbutton", { name: "Length", exact: true }).fill("96");
  await dialog.getByRole("spinbutton", { name: "Width", exact: true }).fill("24");
  await expect(dialog.getByRole("spinbutton", { name: "Thickness", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add to Cut pool", exact: true }).click();
  await page.getByRole("button", { name: "Review offcut reuse", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("1 → 0 sheets");
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
});
