import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part } from "../../src/model";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { stackedCabinetDoors } from "../helpers/stackedCabinetDoors";

test("a named drawer or door request opens the requested motion at its directional stop", async ({ page }) => {
  const project = blank("Door and drawer movement");
  const step = project.steps[0].id;
  const drawer = part("Side drawer", "plywood", [2, 2, 2], [-6, 10, 0], step, "Cabinet");
  const obstruction = part("Cabinet stop block", "plywood", [2, 2, 2], [0, 10, 0], step, "Cabinet");
  const door = part("Cabinet door", "plywood", [2, 10, 0.75], [36, 10, 0], step, "Cabinet");
  project.pieces.push(drawer, obstruction, door);
  const slide = saveMotionPlan(project, {
    label: drawer.name, memberIds: [drawer.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const saved = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id], mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [35, 10, 0], travel: 90 },
  }).project;
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "directional-movement.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(dialog).toHaveCount(0);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.project, CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.name).toBe(`${saved.name} · imported`);
  const before = await draft();
  const pose = page.getByTestId("motion-preview-label");
  async function inspect(prompt: string, result: RegExp, button: string) {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await dialog.getByRole("textbox", { name: "Describe your idea" }).fill(prompt);
    await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
    await expect(dialog.getByRole("region", { name: "Modeled motion review" })).toContainText(result);
    await dialog.getByRole("button", { name: button, exact: true }).click();
    await expect(pose).toBeVisible();
  }
  await inspect("Open the drawer.", /Opening pauses.*Cabinet stop block/, "Inspect opening stop");
  await expect(pose).toContainText("Side drawer");
  await expect(pose).toContainText("Contact ahead");
  const opening = Number(await pose.getAttribute("data-pose"));
  expect(opening).toBeGreaterThan(0);
  expect(opening).toBeLessThan(6);
  await inspect("Close the drawer.", /Closing pauses.*Cabinet stop block/, "Inspect closing stop");
  const closing = Number(await pose.getAttribute("data-pose"));
  expect(closing).toBeGreaterThan(6);
  expect(closing).toBeLessThan(12);
  await inspect('Open "Cabinet door".', /Modeled path clears to 90°/, "Preview open");
  await expect(pose).toContainText("Cabinet door · 90°");
  await inspect("Close the cabinet door.", /Modeled path clears to 0°/, "Preview closed");
  await expect(pose).toContainText("Cabinet door · 0°");
  expect(await draft()).toEqual(before);
});

test("scan a project for mid-path collisions and keep a finding in the build guide", async ({ page }, info) => {
  const base = blank("Cabinet motion scan");
  const step = base.steps[0].id;
  const side = part("Side drawer", "plywood", [2, 2, 2], [-6, 10, 0], step, "Cabinet");
  const front = part("Front tray", "plywood", [2, 2, 2], [0, 10, -10], step, "Cabinet");
  const distant = part("Distant door", "plywood", [2, 10, 0.75], [130, 10, 0], step, "Remote cabinet");
  const a = saveMotionPlan({ ...base, pieces: [side, front, distant] }, {
    label: side.name, memberIds: [side.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const b = saveMotionPlan(a.project, {
    label: front.name, memberIds: [front.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const { project } = saveMotionPlan(b.project, {
    label: distant.name, memberIds: [distant.id], mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [129, 10, 0], travel: 90 },
  });

  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "motion-scan.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Which doors or drawers collide?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open motion scan", exact: true }).click();

  const panel = page.getByRole("region", { name: "Motion and clearance" });
  await panel.getByRole("button", { name: "Scan motion pairs", exact: true }).click();
  const results = panel.getByRole("region", { name: "Motion scan results" });
  await expect(results).toContainText("1 pair checked · 2 with separate sweeps");
  await expect(results).toContainText("Side drawer first · Clear");
  await expect(results).toContainText("Front tray first · Clear");
  await expect(results).toContainText("Move together · Review");
  await results.screenshot({ path: info.outputPath("motion-scan-results.png") });
  await results.getByRole("button", { name: "Inspect Side drawer + Front tray · Move together", exact: true }).click();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toContainText(/parts in red/i);
  const stops = panel.getByRole("list", { name: "Travel stops", exact: true });
  await expect(stops).toContainText("Opening pauses near 4.81 in for contact between P001 · Side drawer and P002 · Front tray.");
  await expect(stops).toContainText("Closing pauses near 7.19 in for contact between P001 · Side drawer and P002 · Front tray.");
  await stops.getByRole("button", { name: "Inspect closing stop", exact: true }).click();
  await expect(pose).toContainText("7.19 in · Contact ahead · Parts in red");
  await expect(pose).toContainText("Focused on P001 and P002");
  await page.getByRole("button", { name: "Return to motion controls", exact: true }).click();
  await stops.getByRole("button", { name: "Inspect opening stop", exact: true }).click();
  await expect(pose).toContainText("4.81 in · Contact ahead · Parts in red");
  await page.getByRole("button", { name: "Return to motion controls", exact: true }).click();
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Clearance test name" })).toHaveValue("Move together · Side drawer + Front tray");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await expect(panel.getByText("Named test setup saved", { exact: true })).toBeVisible();
  await expect(results).toHaveCount(0);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Named clearance test · Move together");
  expect(guide).toContain("Modeled interference");
  expect(guide).toContain("Opening pauses near 4.81 in for contact between P001 and P002.");
  expect(guide).toContain("Closing pauses near 7.19 in for contact between P001 and P002.");
});

test("ask about partly open drawers and inspect and save the reported collision", async ({ page }) => {
  const base = blank("Unsynchronized pull-outs");
  const step = base.steps[0].id;
  const side = part("Side drawer", "plywood", [2, 2, 2], [-6, 10, 0], step, "Cabinet");
  const front = part("Front tray", "plywood", [2, 2, 2], [0, 10, -19], step, "Cabinet");
  const a = saveMotionPlan({ ...base, pieces: [side, front] }, {
    label: side.name, memberIds: [side.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const { project } = saveMotionPlan(a.project, {
    label: front.name, memberIds: [front.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "different-openings.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Could my side drawer hit the front tray if one is only partly open?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Contact at different openings" });
  await expect(review).toContainText("Side drawer at 6 in and Front tray at 18 in");
  await expect(review).toContainText("Modeled paths that clear");
  for (const label of ["Side drawer first", "Front tray first", "Move together"])
    await expect(review).toContainText(label);
  await review.getByRole("button", { name: "Inspect contact", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toContainText("6 in");
  await expect(pose).toContainText("Interfering parts in red");
  await expect(pose).toContainText("Focused on P001 and P002");
  await page.getByRole("button", { name: "Return to motion controls", exact: true }).click();
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Clearance test name" })).toHaveValue("Different openings · Side drawer + Front tray");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await expect(panel.getByText("Named test setup saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Different openings · Side drawer + Front tray");
  expect(guide).toContain("Front tray held at 18 in");
  expect(guide).toContain("Modeled interference");
});

test("inspect a gap between two hinged doors and keep the required clearance in the guide", async ({ page }) => {
  const { project } = stackedCabinetDoors();
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "stacked-doors.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill(
    'Check a 1/8 in gap between "Lower door" and "Upper door" at different openings.',
  );
  await dialog.getByRole("button", { name: /^Explore idea$|^Explore with built-in layout$/ }).click();
  const result = dialog.getByRole("region", { name: "Minimum gap at different openings" });
  await expect(result).toContainText("Modeled gap 0.0625 in, below the required 0.125 in");
  await expect(result).toContainText("Lower door at 45° and Upper door at 45°");
  await result.getByRole("button", { name: "Inspect gap", exact: true }).click();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toContainText("Modeled gap 0.0625 in");
  await expect(pose).toContainText("Focused on P001 and P002");
  await expect(page.getByTestId("motion-gap-label")).toContainText("0.0625 in");
  await page.getByRole("button", { name: "Return to motion controls", exact: true }).click();

  const panel = page.getByRole("region", { name: "Motion and clearance" });
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await expect(panel.getByText("Named test setup saved", { exact: true })).toBeVisible();
  const scan = panel.locator("#motion-interaction-audit");
  await scan.getByText("Scan interacting motions", { exact: true }).click();
  await scan.getByRole("spinbutton", { name: "Minimum gap between moving groups (optional)" }).fill("0.125");
  await scan.getByRole("button", { name: "Scan motion pairs", exact: true }).click();
  await expect(scan.getByRole("region", { name: "Motion scan results" })).toContainText("0.125 in gap at different openings · Gap too small");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Gap at different openings · Lower door + Upper door");
  expect(guide).toContain("Upper door held at 45°");
  expect(guide).toMatch(/0\.0625 in[\s\S]*0\.125 in|0\.125 in[\s\S]*0\.0625 in/);
});
