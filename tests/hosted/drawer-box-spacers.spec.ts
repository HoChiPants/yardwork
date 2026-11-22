import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { pureBondCasework } from "../../src/homeDepotCaseworkReference";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { blank, part } from "../../src/model";

test("a drawer draft clears its door after adding fixed spacers and exports the checked route and scrap cuts", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const cabinet = blank("Drawer side spacer practice");
  const step = cabinet.steps[0].id;
  const left = part("Left cabinet wall", "plywood", [0.75, 30, 24], [-8.375, 15, 0], step, "Cabinet");
  const right = part("Right cabinet wall", "plywood", [0.75, 30, 24], [8.375, 15, 0], step, "Cabinet");
  const door = part("Cabinet door", "plywood", [16.25, 28, 0.75], [0, 15, 12.5], step, "Cabinet");
  cabinet.pieces.push(left, right, door);
  const { project } = saveMotionPlan(cabinet, {
    label: door.name,
    memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [-8.125, 15, 12.5], travel: 90 },
  });
  const withScrap = addMeasuredOffcut(project, step, pureBondCasework.materialId, [22, 3, 0.703], "On-hand spacer strip");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "drawer-side-spacer.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(withScrap)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Plan a drawer between P001 and P002 with two left spacer layers");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open drawer setup", exact: true }).click();

  const editor = page.getByRole("region", { name: "Fit a drawer box", exact: true });
  await editor.getByText("Front and fit clearances", { exact: true }).click();
  await editor.getByRole("spinbutton", { name: "Closed front inset", exact: true }).fill("4");
  await editor.getByRole("combobox", { name: "Slide pair", exact: true }).selectOption("accuride-t46322g18");
  await editor.getByText("Drawer slide spacers", { exact: true }).click();
  const leftLayers = editor.getByRole("spinbutton", { name: "Left spacer layers", exact: true });
  await expect(leftLayers).toHaveValue("2");
  await leftLayers.fill("0");
  const preview = editor.getByRole("region", { name: "Drawer box preview", exact: true });
  const previewButton = editor.getByRole("button", { name: "Preview drawer", exact: true });
  const testResult = preview.getByRole("region", { name: "Draft door and drawer result", exact: true });
  async function checkDoor() {
    await preview.getByText("Check this drawer with a cabinet door", { exact: true }).click();
    await preview.getByRole("spinbutton", { name: "Draft door stop (degrees)", exact: true }).fill("35");
    await preview.getByRole("spinbutton", { name: "Draft drawer travel", exact: true }).fill("5");
    await preview.getByRole("button", { name: "Check door and drawer draft", exact: true }).click();
  }
  await previewButton.click();
  await checkDoor();
  await expect(testResult).toContainText("Review the draft at 35° and 5 in");
  await expect(testResult).toContainText("Cabinet door");

  await leftLayers.fill("2");
  await previewButton.click();
  await expect(preview).toContainText("13.56275 in wide");
  await expect(preview).toContainText("14.594 in between the fixed mounting faces");
  await expect(preview.getByText(/left spacer 1 · 0.703 in × 2 in × 18 in/)).toBeVisible();
  await checkDoor();
  await expect(testResult).toContainText("The draft clears 5 in at 35°, including closing.");
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toContainText("Cabinet drawer · 5 in");
  await pose.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("drawer-clearing-with-spacers.png") });
  await preview.getByRole("checkbox", { name: "Use matching scraps for drawer panels and spacers", exact: true }).check();
  await expect(preview.getByRole("list", { name: "Proposed cuts in order" })).toContainText("On-hand spacer strip");
  await preview.getByRole("button", { name: "Add drawer and test movement", exact: true }).click();
  const motion = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await motion.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "100");
  await motion.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await motion.getByText("Check a minimum gap", { exact: true }).click();
  const moving = motion.getByRole("combobox", { name: "Moving part for gap", exact: true });
  const leftSide = moving.getByRole("option", { name: /left side$/ });
  await moving.selectOption((await leftSide.getAttribute("value"))!);
  await motion.getByRole("combobox", { name: "Part to clear", exact: true }).selectOption(door.id);
  await motion.getByRole("spinbutton", { name: "Required minimum gap", exact: true }).fill("0.0625");
  await motion.getByRole("button", { name: "Check gap through travel", exact: true }).click();
  const gap = motion.getByRole("region", { name: "Minimum gap result", exact: true });
  await expect(gap).toContainText("Met throughout the modeled travel.");
  await gap.getByRole("button", { name: "Find closest gap", exact: true }).click();
  await expect(gap).toContainText("Closest checked gap 0.38932 in at Cabinet drawer · 5 in.");
  await gap.getByRole("button", { name: "Inspect closest pose", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "100");
  await expect(pose).toContainText("Cabinet drawer · 5 in");
  await expect(pose).toContainText("Focused on");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await downloaded).path())!, "utf8");
  expect(guide).toMatch(/Recorded offcut cut order[\s\S]*left spacer/);
  expect(guide).toContain("Test targets · Cabinet door 35°, Cabinet drawer 5 in");
});
