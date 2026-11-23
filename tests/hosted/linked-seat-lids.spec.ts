import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, projectSchema } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { setSectionLidOpen } from "../../src/sections";

test("open the paired seat lid planner from a question, then save and reopen the test", async ({ page }) => {
  const original = applyIdeaPlan(blank("Kitchenette seat lid pair"), localIdeaPlan({
    prompt: "A storage banquette 6 feet wide, 24 inches deep, 18 inches seat height, three sections with opening lids and no back",
  }));
  const [first, second] = original.sections;
  const input = setSectionLidOpen(original, first.id, true);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchenette-seat-lids.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...input, schemaVersion: 147 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can I open both lids together?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Set up paired lid test" }).click();

  const motion = page.getByRole("region", { name: "Motion and clearance" });
  await expect(motion.getByRole("combobox", { name: "Seat lid", exact: true })).toHaveValue(first.id);
  await expect(motion.getByRole("combobox", { name: "Also test with", exact: true })).toHaveValue(second.id);
  await motion.getByRole("button", { name: "Save paired lid test" }).click();
  const named = motion.getByRole("combobox", { name: "Clearance test", exact: true });
  await expect(named.locator("option:checked")).toHaveText("Both lids · Banquette section 2");
  await expect(motion.getByRole("slider", { name: "Opening angle", exact: true })).toHaveValue("0");
  await motion.getByRole("slider", { name: "Opening angle", exact: true }).press("End");
  await expect(motion.getByRole("slider", { name: "Opening angle", exact: true })).toHaveValue("75");
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Kitchenette seat lid pair" }).first().click();
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.sections[0].recipe?.lidOpen).toBe(true);
  expect(saved.motionPlans).toHaveLength(2);
  expect(saved.motionPlans![0].testScenarios![0].setup.linkedId).toEqual(saved.motionPlans![1].id);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  await motion.getByRole("combobox", { name: "Clearance test" }).selectOption({ label: "Both lids · Banquette section 2" });
  await expect(motion.getByRole("slider", { name: "Opening angle", exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Named clearance test · Both lids · Banquette section 2");
  expect(guide).toContain("provisional rear pivot");
});
