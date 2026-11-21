import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part } from "../../src/model";
import { emptyWallTrace, reviewWallTrace } from "../../src/wallTrace";

test("fit a measured doorway, preview its obstruction, reopen its saved swing and export the guide", async ({ page }) => {
  const initial = blank("Doorway and hall");
  const source = reviewWallTrace(initial, { ...emptyWallTrace(), a: [-48, 0], b: [48, 0] }).candidate;
  source.pieces.push(part("Hall obstruction", "plywood", [6, 60, 2], [4, 35, 20], initial.steps[0].id, "Hall"));
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "hall.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Plan an interior doorway", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Fit a measured door and test its swing" }).check();
  await dialog.getByRole("combobox", { name: "Door kit", exact: true }).selectOption("hd-masonite-75777");
  for (const [name, value] of Object.entries({
    "Finished floor rise above wall base": "0.375",
    "Finished wall thickness": "4.5",
    "Outside frame width": "31.5",
    "Outside frame height": "81.5",
    "Installed jamb depth": "4.375",
    "Side jamb thickness": "0.625",
    "Head jamb thickness": "0.625",
    "Door leaf width": "30",
    "Door leaf height": "80",
    "Door leaf thickness": "1.375",
    "Gap below closed leaf": "0.5",
    "Pin offset beyond hinge edge": "0.0625",
    "Pin offset beyond swing face": "0.125",
  })) await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  await dialog.getByText("Adjust closed door placement", { exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Leaf depth offset from wall center", exact: true }).fill("1.4375");
  await dialog.getByRole("button", { name: "Preview doorway", exact: true }).click();
  await expect(dialog.getByLabel("Door swing result")).toContainText(/stops near.+Hall obstruction/);
  await dialog.getByText(/boards ·/).click();
  await expect(dialog.getByLabel("Doorway proposal")).toContainText("flat door head 35 in");
  await dialog.getByRole("button", { name: "Apply doorway", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const motion = page.getByRole("region", { name: "Motion and clearance" });
  await motion.getByRole("button", { name: "Play opening", exact: true }).click();
  const angle = motion.getByRole("slider", { name: "Opening angle" });
  await expect.poll(async () => Number(await angle.inputValue())).toBeGreaterThan(30);
  expect(Number(await angle.inputValue())).toBeLessThan(90);
  await motion.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(angle).toHaveValue("0");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision, { timeout: 15_000 }).toBe(1);
  const saved = (await draft()).project;
  expect(saved.motionPlans[0].mechanism.doorway.sectionId).toBe(source.sections[0].id);
  expect(saved.sections[0].generator.doorUnit.purchase).toBe("hd-masonite-75777");

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  await motion.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(motion.getByRole("button", { name: /Focus these parts for .*Hall obstruction/ })).toBeVisible();
  await motion.getByRole("button", { name: "Edit setup", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Outside frame width", exact: true })).toHaveValue("31.5");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Fit and swing-test the door in Wall 1");
  expect(guide).toContain("Wall 1 · flat door head");
  expect(guide).toContain("Masonite 75777");
});
