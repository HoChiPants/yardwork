import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { blank, part } from "../../src/model";

test("find a door opening from an idea, then save and export the verified drawer sequence", async ({ page }) => {
  const project = blank("Find a working drawer opening");
  const step = project.steps[0].id;
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [6, 10, 0], step, "Cabinet");
  const drawer = part("Pull-out drawer", "plywood", [1, 2, 1], [5, 10, -8], step, "Cabinet");
  const wall = part("Wall return", "plywood", [0.6, 5, 0.6], [0, 10, 11.5], step, "Room");
  const swing = saveMotionPlan({ ...project, pieces: [door, drawer, wall] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const slide = saveMotionPlan(swing.project, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "drawer-opening.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(slide.project)),
  });
  const motion = () => page.getByRole("button", { name: "Test movement", exact: true });
  // Ask with the inspector already mounted and the saved door currently selected.
  await motion().click();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How far should I open the door before pulling out the drawer?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Find a door opening", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await expect(panel.getByRole("combobox", { name: "Saved motion", exact: true })).toHaveValue(slide.plan.id);
  await expect(panel.getByRole("combobox", { name: "Second motion", exact: true })).toHaveValue(swing.plan.id);
  await panel.getByRole("combobox", { name: "Drawer extension to check units", exact: true }).selectOption("in");
  await panel.getByRole("spinbutton", { name: "Drawer extension to check", exact: true }).fill("12.5");
  await panel.getByRole("button", { name: "Find an opening", exact: true }).click();
  const result = panel.getByText(/^Open Cabinet door to \d+°, then extend Pull-out drawer to 12\.5 in\.$/);
  await expect(result).toBeVisible();
  const angle = (await result.textContent())?.match(/(\d+)°/)?.[1];
  expect(Number(angle)).toBeGreaterThan(25);
  expect(Number(angle)).toBeLessThan(75);
  await panel.getByRole("button", { name: "Use this opening sequence", exact: true }).click();
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "Inspect after Cabinet door opens", exact: true }).click();
  await expect(pose).toContainText(`Cabinet door · ${angle}°`);
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Pull-out drawer · 12.5 in");
  await expect(pose).toHaveAttribute("data-pose", "100");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByRole("textbox", { name: "Clearance test name", exact: true }).fill("Verified pull-out route");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await motion().click();
  await panel.getByRole("combobox", { name: "Saved motion", exact: true }).selectOption(slide.plan.id);
  await panel.getByRole("combobox", { name: "Clearance test", exact: true }).selectOption({ label: "Verified pull-out route" });
  await panel.getByRole("button", { name: "Inspect test endpoint", exact: true }).click();
  await expect(pose).toContainText("Pull-out drawer · 12.5 in");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Named clearance test · Verified pull-out route");
  expect(guide).toContain(`Cabinet door ${angle}°, Pull-out drawer 12.5 in`);
});
