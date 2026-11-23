import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("plans cabinet backing, saves the modeled supports and exports their cut guide on a phone", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/interior/wall-cabinet-backing.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const original = projectSchema.parse(await fixture.json());
  const name = `${original.name} · ${crypto.randomUUID().slice(0, 6)}`;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "wall-cabinet-backing.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...original, name })),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Plan cabinet backing at 54 in");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await dialog.getByRole("button", { name: "Open cabinet backing planner" }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Height above wall base", exact: true })).toHaveValue("54");
  for (const [i, offset] of [16, 24, 28, 40, 56].entries()) {
    if (i >= 2) await dialog.getByRole("button", { name: "Add mounting point" }).click();
    await dialog.getByRole("spinbutton", { name: `Mounting point ${i + 1}`, exact: true }).fill(String(offset));
  }
  await dialog.getByRole("button", { name: "Preview mounting points and cuts" }).click();
  const preview = dialog.getByRole("region", { name: "Cabinet backing preview" });
  await expect(preview).toContainText("existing stud");
  await expect(preview).toContainText("14.5 in square cut");
  await expect(preview).toContainText("Use O001");
  await expect(preview).toContainText("1 new 2 × 6 board");
  await expect(preview).toContainText("66.75 in");
  expect(await dialog.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(390);
  await preview.screenshot({ path: info.outputPath("mounting-row.png") });
  await preview.getByRole("button", { name: "Save mounting plan and add blocking" }).click();
  await page.getByRole("button", { name: "Check cabinet screw reach", exact: true }).click();
  const screwDialog = page.getByRole("dialog", { name: "Cabinet mounting row" });
  for (const [name, measurement] of [
    ["Seated screw length", "2.5"], ["Head seat to wood", "0.875"], ["Shank diameter", "0.1875"],
    ["Specified minimum depth in wood", "1.5"], ["Tip length excluded by instructions", "0.125"],
  ]) await screwDialog.getByRole("spinbutton", { name, exact: true }).fill(measurement);
  await screwDialog.getByRole("button", { name: "Compare screw reach" }).click();
  const screwDraft = screwDialog.getByRole("region", { name: "Screw reach preview" });
  await expect(screwDraft).toContainText("1.5 in counted depth in 3.5 in wood");
  await expect(screwDraft).toContainText("The tip projects 0.125 in beyond the receiving wood");
  await screwDraft.getByRole("button", { name: "Save screw check" }).click();
  await expect(screwDialog.getByRole("region", { name: "Saved screw reach check" })).toBeVisible();
  await screwDialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved = projectSchema.parse((await readDraft()).project);
  expect(saved.cabinetBacking?.[0].blocks).toHaveLength(3);
  expect(saved.cabinetBacking?.[0].receivers[1]).toBe(saved.cabinetBacking?.[0].receivers[2]);
  expect(saved.cabinetBacking?.[0].fastening?.finishAtMarks[0][0].to).toBe(0.5);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Will my cabinet screws go through the backing?");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await expect(dialog).toContainText("4 of 5 marks need a reach review");
  await dialog.getByRole("button", { name: "Open mounting row" }).click();
  await expect(screwDialog.getByRole("region", { name: "Saved screw reach check" })).toContainText("The tip projects 0.125 in");
  await screwDialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const text = await readFile((await (await download).path())!, "utf8");
  expect(text).toContain("## Wall cabinet backing");
  expect(text).toContain("square-cut to 14.5 in");
  expect(text).toContain("The tip projects 0.125 in beyond the receiving wood");
  expect(text.indexOf("Fit cabinet backing")).toBeLessThan(text.indexOf("Hang Drywall"));
});
