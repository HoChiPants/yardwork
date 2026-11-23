import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";
import { topPlateStudy } from "../helpers/topPlateStudy";

test("a plate bore shows the interrupted seal in the preview and holds the cartridge estimate", async ({ page }) => {
  const { project, plate } = topPlateStudy();
  plate.roundOpenings = [{ axis: 0, center: [-24, 1.15], diameter: 2 }];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "plate-bore.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(projectSchema.parse(project))),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("How do I seal the top plate to drywall?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open top plate air seal", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Long side to seal", exact: true }).selectOption("b");
  await dialog.getByRole("spinbutton", { name: "Widest measured gap", exact: true }).fill("0.125");
  await dialog.getByRole("spinbutton", { name: "Measured fill depth", exact: true }).fill("0.125");
  await dialog.getByRole("checkbox", { name: /^This is a dry, unrated interior detail/ }).check();
  await dialog.getByRole("button", { name: "Preview top plate seal", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Top plate seal preview" });
  await expect(preview).toContainText("23.2 in to 24.8 in from start · A plate cutout interrupts the bead");
  await preview.getByRole("button", { name: "Save top plate seal and show in 3D", exact: true }).click();
  await expect(page.getByTestId("top-plate-seam-start")).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByText("Review changed or interrupted seams to finish the cartridge estimate.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Add.*cartridge of OSI SC175/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("23.2 in to 24.8 in from the marked start · A plate cutout interrupts the bead");
});

test("plan a top plate seal through a build question and reopen its cut-backed guide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const sample = await page.request.get(new URL("examples/air-sealing/top-plate.yardwork.json", page.url()).href);
  expect(sample.ok()).toBe(true);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "top-plate.yardwork.json", mimeType: "application/json", buffer: await sample.body(),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("How do I seal the top plate to drywall?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open top plate air seal", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Long side to seal", exact: true }).selectOption("b");
  await dialog.getByRole("spinbutton", { name: "Widest measured gap", exact: true }).fill("0.125");
  await dialog.getByRole("spinbutton", { name: "Measured fill depth", exact: true }).fill("0.125");
  await dialog.getByRole("checkbox", { name: /^This is a dry, unrated interior detail/ }).check();
  await dialog.getByRole("button", { name: "Preview top plate seal", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Top plate seal preview" });
  await expect(preview).toContainText("8 ft clear for a bead");
  await expect(preview.getByRole("listitem")).toHaveCount(2);
  await preview.getByRole("button", { name: "Save top plate seal and show in 3D", exact: true }).click();
  await expect(page.getByTestId("top-plate-seam-start")).toHaveText("Bead start · Top plate air seal");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 1 cartridge of OSI SC175/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#202768254");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  const stored = projectSchema.parse((await saved()).project);
  expect(stored.topPlateSeals?.[0]).toMatchObject({ side: "b", gap: 0.125, dryInteriorBeforeDrywall: true });

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: stored.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Air-seal Wall top plate[\s\S]*Hang drywall at the top plates/);
  expect(guide).toMatch(/## Top plate air seals[\s\S]*4 ft of modeled bead path[\s\S]*1 cartridge of OSI SC175/);
  expect(guide).toMatch(/matching drywall scrap O001/);
});
