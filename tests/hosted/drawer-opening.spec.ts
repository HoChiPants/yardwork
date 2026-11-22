import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { blank, part, projectSchema, type Project } from "../../src/model";
import { findDrawerOpening } from "../../src/drawerOpening";

function cabinet(name: string) {
  const project = blank(name);
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
  return { project: slide.project, drawer: slide.plan, door: swing.plan };
}

async function importCabinet(page: Page, project: Project) {
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "drawer-opening.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  return dialog;
}

test("find a door opening from an idea, then save and export the verified drawer sequence", async ({ page }) => {
  const { project, door, drawer } = cabinet("Find a working drawer opening");
  const dialog = await importCabinet(page, project);
  const motion = () => page.getByRole("button", { name: "Test movement", exact: true });
  // Ask with the inspector already mounted and the saved door currently selected.
  await motion().click();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How far should I open the door before pulling out the drawer?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Find a door opening", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await expect(panel.getByRole("combobox", { name: "Saved motion", exact: true })).toHaveValue(drawer.id);
  await expect(panel.getByRole("combobox", { name: "Second motion", exact: true })).toHaveValue(door.id);
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
  await panel.getByRole("combobox", { name: "Saved motion", exact: true }).selectOption(drawer.id);
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

test("check a fixed door stop from an idea, then save and export a clear fractional angle", async ({ page }) => {
  const { project, door, drawer } = cabinet("Check the installed door stop");
  const opening = await findDrawerOpening(project, drawer, door, 12.5, { held: [] });
  const clearAngle = opening.angle + 0.25;
  const dialog = await importCabinet(page, project);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Will a 90 degree door stop let my drawer open 12.5 inches?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Check the door stop", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  const angle = panel.getByRole("spinbutton", { name: "Door stop angle (degrees)", exact: true });
  await expect(angle).toHaveValue("90");
  await expect(panel.getByRole("spinbutton", { name: "Drawer extension to check", exact: true })).toHaveValue("12.5");
  const check = panel.getByRole("button", { name: "Check door stop", exact: true });
  const result = panel.getByRole("region", { name: "Door stop check", exact: true });
  await check.click();
  await expect(result.getByRole("status")).toContainText("Review the 90° stop");
  await expect(result).toContainText("Wall return");
  await expect(result.getByRole("button", { name: "Find shorter drawer travel", exact: true })).toHaveCount(0);
  await angle.fill(String(clearAngle));
  await check.click();
  await expect(result.getByRole("status")).toContainText(`The ${clearAngle}° stop clears 12.5 in`);
  await result.getByRole("button", { name: "Use this stop sequence", exact: true }).click();
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "Inspect after Cabinet door opens", exact: true }).click();
  await expect(pose).toContainText(`Cabinet door · ${clearAngle}°`);
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "100");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByRole("textbox", { name: "Clearance test name", exact: true }).fill("Fixed door stop");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Named clearance test · Fixed door stop");
  expect(guide).toContain(`Cabinet door ${clearAngle}°, Pull-out drawer 12.5 in`);
});

test("find a shorter extension with the door held at its fixed stop", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const example = new URL("../../public/examples/hinges/fixed-stop-drawer.yardwork.json", import.meta.url);
  const project = projectSchema.parse(JSON.parse(await readFile(example, "utf8")));
  const dialog = await importCabinet(page, project);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Can my drawer extend 1 ft 0.5 in with the door at 35°?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Check the door stop", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await expect(panel.getByRole("spinbutton", { name: "Drawer extension to check", exact: true })).toHaveValue("12.5");
  await panel.getByRole("button", { name: "Check door stop", exact: true }).click();
  const result = panel.getByRole("region", { name: "Door stop check", exact: true });
  await result.getByRole("button", { name: "Find shorter drawer travel", exact: true }).click();
  await expect(result).toContainText("The model verified 5.375 in of drawer travel at this stop, including closing.");
  await result.getByRole("button", { name: "Use shorter sequence", exact: true }).click();
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Pull-out drawer · 5.375 in");
  await expect(pose).toHaveAttribute("data-pose", "100");
  await pose.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("fixed-stop-cabinet-open.png") });
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByRole("textbox", { name: "Clearance test name", exact: true }).fill("Reduced drawer travel");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Named clearance test · Reduced drawer travel");
  expect(guide).toContain("Cabinet door 35°, Pull-out drawer 5.375 in");
  expect(guide).toContain("Measured aisle edge");
  expect(guide).toContain("Crosscut to 18 in · Rip to 2 in.");
});
