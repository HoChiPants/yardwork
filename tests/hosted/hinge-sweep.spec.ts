import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { part, projectSchema } from "../../src/model";

test("a brief trim obstruction stops hinge playback from both clear endpoints", async ({ page }) => {
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "door-trim-swing.yardwork.json", mimeType: "application/json",
    buffer: await readFile(new URL("../../public/examples/motion/door-trim-swing.yardwork.json", import.meta.url)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(panel.getByRole("button", { name: /Collision near 32\.76°/ })).toBeVisible();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText(/Contact ahead.*Fixed trim/);
  expect(Number(await pose.getAttribute("data-pose"))).toBeCloseTo(32.76, 2);

  await panel.getByRole("button", { name: "Inspect fully open", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await expect(pose).not.toContainText(/Contact ahead|Interfering parts/);
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toContainText(/Contact ahead.*Fixed trim/);
  expect(Number(await pose.getAttribute("data-pose"))).toBeCloseTo(34.56, 2);
  await panel.getByRole("button", { name: "Inspect fully closed", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await panel.getByRole("button", { name: "Try shorter travel", exact: true }).click();
  await expect(panel.getByText("Cabinet door 32° cleared the modeled opening and closing paths.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Inspect test endpoint", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "32");

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("How far can I open the cabinet door before it hits?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const motion = dialog.getByRole("region", { name: "Modeled motion review", exact: true });
  await expect(motion).toContainText("Cabinet door 32° cleared the modeled opening and closing paths.");
  await motion.getByRole("button", { name: "Try this travel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "32");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByLabel("Clearance test name", { exact: true }).fill("Shorter cabinet opening");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Cabinet door and close trim" }).click();
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  await panel.getByRole("combobox", { name: "Clearance test", exact: true }).selectOption({ label: "Shorter cabinet opening" });
  await panel.getByRole("button", { name: "Inspect test endpoint", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "32");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Shorter cabinet opening · Test targets · Cabinet door 32°.");
  expect(guide).toContain("Modeled interference · P001 against P002 near 32.76°.");
});

test("an offset clears the door swing without blocking a nearby tray", async ({ page }) => {
  const source = projectSchema.parse(JSON.parse(await readFile(
    new URL("../../public/examples/motion/door-trim-swing.yardwork.json", import.meta.url), "utf8",
  )));
  const tray = part("Pull-out tray", "plywood", [0.125, 0.75, 0.3], [20.94, 18, 16], source.steps[0].id, "Tray");
  const { project } = saveMotionPlan({ ...source, name: "Door and tray with offset trim", pieces: [...source.pieces, tray] }, {
    label: tray.name, memberIds: [tray.id], mechanism: { kind: "slide", axis: [0, 0, -1], travel: 4 },
  });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "door-trim-swing.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  const before = (await draft()).project;
  const start = () => panel.getByRole("button", { name: "Try moving obstruction", exact: true }).click();
  await start();
  const offset = panel.getByRole("region", { name: "Try an obstruction offset", exact: true });
  const pose = page.getByTestId("motion-preview-label");
  const direction = offset.getByRole("combobox", { name: "Offset direction" });
  const distance = offset.getByRole("spinbutton", { name: "Offset distance or search limit", exact: true });
  const find = offset.getByRole("button", { name: "Find a clear offset", exact: true });
  const apply = offset.getByRole("button", { name: "Apply offset", exact: true });
  await direction.selectOption({ label: "+X · Right" });
  await distance.fill("0.125");
  await offset.getByRole("button", { name: "Check this offset", exact: true }).click();
  await expect(offset.getByRole("list", { name: "Affected movement tests" })).toContainText("Pull-out tray");
  await expect(apply).toHaveCount(0);
  await offset.getByRole("button", { name: "Inspect interference", exact: true }).click();
  await expect(pose).toContainText("Pull-out tray");

  await direction.selectOption("horizontal");
  await find.click();
  await expect(offset.getByRole("status")).toContainText("0.125 in +Z · Front clears the modeled opening and closing paths.");
  await offset.getByRole("button", { name: "Play trial opening", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await offset.getByRole("button", { name: "Play trial closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  expect((await draft()).project).toEqual(before);

  await offset.getByRole("button", { name: "Back to original test", exact: true }).click();
  await expect(panel.getByRole("button", { name: /Collision near 32\.76°/ })).toBeVisible();
  await start();
  await find.click();
  await apply.click();
  await expect(panel.getByText("No modeled interference found along this travel.", { exact: true })).toBeVisible();
  const expected = [...before.pieces[1].position];
  expected[2] += 0.125;
  await expect.poll(async () => (await draft()).project.pieces[1].position).toEqual(expected);
  const updated = (await draft()).project;
  expect(updated.pieces[0]).toEqual(before.pieces[0]);
  expect(updated.pieces[2]).toEqual(before.pieces[2]);
  expect(updated.motionPlans).toEqual(before.motionPlans);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft()).project.pieces[1].position).toEqual(before.pieces[1].position);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await draft()).project.pieces[1].position).toEqual(expected);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await expect.poll(async () => (await draft()).project.pieces[1].position).toEqual(expected);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Positioned Fixed trim at 20.28 in");
  expect(guide.match(/No modeled part interference found along the travel\./g)?.length).toBe(2);
});
