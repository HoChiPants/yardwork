import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { applyCommand, blank, parsePrompt, part, projectSchema } from "../../src/model";
import { emptyWallTrace, reviewWallTrace } from "../../src/wallTrace";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { casingSwing, doorCasingGuide, previewDoorCasing } from "../../src/doorCasing";
import { flatCasing } from "../../src/doorCasingReference";
import { transformSection } from "../../src/sections";
import { previewWallDrywall } from "../../src/wallDrywall";
import { doorAndWindowExample } from "../../src/wallOpenings";
import { previewTopPlateSeal } from "../../src/topPlateSeal";
import { previewDoorHardware } from "../../src/doorHardware";
import type { DoorUnit } from "../../src/doorWall";
import { everbiltFloorStop } from "../../src/doorFloorStopReference";
import { georgianPassage } from "../../src/doorHardwareReference";
import { bounds } from "../../src/engine";
import { createSectionWoodSlide } from "../../src/sectionTranslation";

const measuredDoor: DoorUnit = {
  frameWidth: 31.5, frameHeight: 81.5, jambDepth: 4.375, sideJamb: 0.625,
  headJamb: 0.625, leafWidth: 30, leafHeight: 80, leafThickness: 1.375, floorGap: 0.5,
  frameOffset: 0, leafOffset: 0, leafDepthOffset: 1.4375, hingeSide: "left", swingFace: "front",
  pinSideOffset: 0.0625, pinFaceOffset: 0.125, travel: 90, purchase: "measured",
};

test("a checked wall move stops when fitted casing reaches a nearby cleat", async ({ page }) => {
  const framed = applyCommand(blank("Cased wall movement"), { ...parsePrompt(doorAndWindowExample), doorUnit: measuredDoor });
  const wallId = framed.sections[0].id;
  const lined = previewWallDrywall(framed, { wallId, stockId: "hd-usg-drywall-half-12", side: "front", floorGap: 0.5 });
  const cased = previewDoorCasing(lined.project, { wallId, side: "front", reveal: 0.125, bottomGap: 0 });
  const head = cased.parts.find(({ designRole }) => designRole === "casing-head")!;
  const cleat = part("Nearby shelf cleat", "stud", [4, 0.75, 2],
    [head.position[0], head.position[1], bounds(head).max[2] + 6], framed.steps[0].id, "Nearby shelf");
  const source = { ...cased.project, pieces: [...cased.project.pieces, cleat] };
  const drag = createSectionWoodSlide(source, framed.sections[0]);
  expect(drag?.([0, 0, 16]).stop).toEqual({ kind: "wood", pieceId: cleat.id });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "move-cased-wall.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("combobox", { name: "Current section", exact: true }).selectOption(wallId);
  await page.getByText("Check a section move", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Z offset", exact: true }).fill("16");
  const preview = page.getByRole("button", { name: "Preview section move", exact: true });
  const draft = async () => projectSchema.parse(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project, CURRENT_DRAFT_KEY));
  const start = await draft();
  await preview.click();
  const result = page.getByRole("region", { name: "Section move preview" });
  await expect(result).toContainText("Stopped at Nearby shelf cleat");
  const marker = page.getByTestId("section-translation-preview");
  await expect(marker).toBeVisible();
  expect(JSON.parse((await marker.getAttribute("data-position"))!)[2]).toBeCloseTo(5);
  expect(await draft()).toEqual(start);
  await result.getByRole("button", { name: "Cancel preview", exact: true }).click();
  await expect(marker).toHaveCount(0);
  expect(await draft()).toEqual(start);

  await preview.click();
  await result.getByRole("button", { name: "Move to stop", exact: true }).click();
  await expect.poll(async () => Math.round((await draft()).sections.find(({ id }) => id === wallId)!.origin[2])).toBe(5);
  const moved = await draft();
  expect(moved.pieces.find(({ id }) => id === head.id)!.position[2]).toBeCloseTo(head.position[2] + 5);
  expect(moved.pieces.find(({ id }) => id === cleat.id)).toEqual(start.pieces.find(({ id }) => id === cleat.id));
  expect(moved.motionPlans).toEqual(start.motionPlans);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft()).pieces).toEqual(start.pieces);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: start.name }).click();
  await expect.poll(async () => (await draft()).pieces).toEqual(moved.pieces);
});

test("fit a measured doorway, preview its obstruction, reopen its saved swing and export the guide", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
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
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toHaveAttribute("data-pose", "0");
  await motion.getByRole("button", { name: "Play opening", exact: true }).click();
  await page.clock.fastForward(1500);
  await expect(pose).toContainText("Hall obstruction", { timeout: 15_000 });
  const stoppedAngle = Number(await pose.getAttribute("data-pose"));
  expect(stoppedAngle).toBeGreaterThan(30);
  expect(stoppedAngle).toBeLessThan(90);
  await motion.getByRole("button", { name: "Play closing", exact: true }).click();
  await page.clock.fastForward(1500);
  await expect(pose).toHaveAttribute("data-pose", "0", { timeout: 15_000 });
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

test("fit mitered casing, recover door travel with a wider reveal, and save its stock cuts", async ({ page }) => {
  const framed = applyCommand(blank("Cased hallway door"), {
    ...parsePrompt(doorAndWindowExample),
    doorUnit: { ...measuredDoor, travel: 125 },
  });
  const wall = framed.sections[0];
  const drywall = { wallId: wall.id, stockId: "hd-usg-drywall-half-12" as const, floorGap: 0.5 };
  const lined = previewWallDrywall(framed, { ...drywall, side: "front" }).project;
  const top = lined.pieces.find(({ designRole }) => designRole === "wall-top-plate")!;
  const sealed = previewTopPlateSeal(lined, { plateId: top.id, side: "b", gap: 0.125, depth: 0.125,
    bead: "1/4", session: "Hall wall", dryInteriorBeforeDrywall: true });
  const source = addMeasuredOffcut(sealed.project, framed.steps[0].id, flatCasing.id, [38, 2.5, 0.75], "38 in pine scrap");
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "hall-casing.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Plan door casing", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Jamb reveal" })).toHaveValue("0.125");
  await dialog.getByRole("button", { name: "Preview casing and swing", exact: true }).click();
  await expect(dialog.getByText(/Before casing, the door cleared 125°.*114\.1°.*Casing left leg/)).toBeVisible();
  await dialog.getByRole("button", { name: "Show swing limit", exact: true }).click();
  await expect(dialog.getByRole("slider", { name: /Door swing · 114.1°/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Try 0.3125 in reveal", exact: true }).click();
  await expect(dialog.getByText("The modeled door clears its 125° swing with casing installed.")).toBeVisible();
  await dialog.getByText("Cuts and stock", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Use matching scraps for the new parts" }).check();
  await dialog.getByRole("combobox", { name: "Wood cut orders to save" }).selectOption("proposal");
  await expect(dialog.getByText(/Save 2 stock units with this design/)).toBeVisible();
  await dialog.getByRole("button", { name: "Add door casing", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Cased hallway door" }).first().click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const project = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  const casing = project.sections.find(({ doorCasing }) => doorCasing?.wallId === wall.id)!;
  const trim = project.pieces.filter(({ id }) => casing.pieceIds.includes(id));
  expect(casing.doorCasing?.reveal).toBe(0.3125);
  expect(trim.map(({ cutPlanes }) => cutPlanes.length)).toEqual([1, 1, 2]);
  expect(trim[2].cutStock?.id).toBe(source.pieces.at(-1)!.cutStock?.id);
  expect(project.plannedCutSources).toHaveLength(2);
  expect(casingSwing(project, wall.id)?.limit?.travel).toBe(125);
  const moved = transformSection(project, wall.id, [3, 0, 20], [0, Math.PI / 2, 0]);
  const movedCasing = moved.sections.find(({ id }) => id === casing.id)!;
  expect(movedCasing.origin).toEqual([3, 0, 20]);
  expect(doorCasingGuide(moved, movedCasing, moved.pieces.filter(({ id }) => casing.pieceIds.includes(id))))
    .not.toContain("trim geometry changed");

  const guideDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain("Fit Casing · front");
  const stepTitles = [...guide.matchAll(/^## \d+\. (.+)$/gm)].map(([, title]) => title);
  const sealStep = stepTitles.findIndex((title) => title.startsWith("Air-seal Wall 1 · top plate"));
  const drywallStep = stepTitles.findIndex((title) => title.startsWith("Hang Drywall · front"));
  const casingStep = stepTitles.findIndex((title) => title.startsWith("Fit Casing · front"));
  expect(sealStep).toBeGreaterThan(-1);
  expect(sealStep).toBeLessThan(drywallStep);
  expect(drywallStep).toBeLessThan(casingStep);
  expect(guide).toContain("Casing head · long point 35.875 in, short point 30.875 in");
  expect(guide).toContain("202535803");
});

test("seal fitted casing with keep-open spans and carry the measured bead to the guide and handoff", async ({ page }) => {
  const framed = applyCommand(blank("Painted casing seams"), {
    ...parsePrompt(doorAndWindowExample),
    doorUnit: measuredDoor,
  });
  const wallId = framed.sections[0].id;
  const lined = previewWallDrywall(framed, { wallId, floorGap: 0.5, stockId: "hd-usg-drywall-half-12", side: "front" }).project;
  const cased = previewDoorCasing(lined, { wallId, side: "front", reveal: 0.125, bottomGap: 0 });
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "finish-seams.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...cased.project, schemaVersion: 143 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How much sealant do I need around this casing?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open casing seal", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Fitted casing", exact: true })).toHaveValue(cased.section.id);
  await dialog.getByRole("spinbutton", { name: "Measured gap width", exact: true }).fill("0.125");
  await dialog.getByRole("spinbutton", { name: "Measured bead depth", exact: true }).fill("0.125");
  await dialog.getByRole("textbox", { name: "Trim work session" }).fill("Hall finish");
  await dialog.getByRole("button", { name: "Preview finish seal", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Left leg · Drywall coverage ends here");
  for (const [title, end] of [["Left", "2"], ["Right", "1"]]) {
    const leg = dialog.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: new RegExp(`^${title} leg`) }) });
    await leg.getByText(`Keep part of ${title.toLowerCase()} leg open`, { exact: true }).click();
    await leg.getByRole("button", { name: "Add keep-open range", exact: true }).click();
    await leg.getByRole("spinbutton", { name: "Keep open start", exact: true }).fill("0");
    await leg.getByRole("spinbutton", { name: "Keep open end", exact: true }).fill(end);
  }
  await dialog.getByRole("button", { name: "Show left leg on diagram", exact: true }).click();
  const seamPreview = dialog.getByRole("region", { name: "Finish seam diagram", exact: true });
  await expect(seamPreview).toContainText("Left leg");
  await expect(seamPreview.getByRole("img", { name: /Left leg.*bead and keep-open spans/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Preview finish seal", exact: true }).click();
  await expect(dialog.getByText(/199.5 in of seam · 1 cartridge/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save casing seal", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Painted casing seams" }).first().click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Door casing finish seams");
  expect(guide).toContain("Leave open 0 in to 2 in.");
  expect(guide).toContain("Hall finish · 199.5 in of seam · 1 cartridge");
  const stepTitles = [...guide.matchAll(/^## \d+\. (.+)$/gm)].map(([, title]) => title);
  expect(stepTitles.findIndex((title) => title.startsWith("Seal and finish Casing · front")))
    .toBeGreaterThan(stepTitles.findIndex((title) => title.startsWith("Fit Casing · front")));
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /Add 1 cartridge of DAP Dynaflex 230/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#100035980");
});

test("detect knob contact that the bare door clears and reopen the fitted hardware swing", async ({ page }) => {
  const source = applyCommand(blank("Hardware swing in hallway"), {
    ...parsePrompt(doorAndWindowExample), doorUnit: measuredDoor,
  });
  const wall = source.sections[0];
  const face = { width: 2.75, height: 2.75, projection: 2.5, towardHinge: 0 };
  const preset = previewDoorHardware(source, wall.id, { grip: "knob", purchase: georgianPassage.id,
    backset: 2.375, centerHeight: 36, front: face, back: face });
  const atOpen = preset.swing.review!.preview(90).pieces.find(({ designRole }) => designRole === "door-hardware-front")!;
  source.pieces.push(part("Hall return wall", "plywood", [0.5, 48, 26], atOpen.position, source.steps[0].id, "Hall"));

  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "door-hardware-legacy.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...source, schemaVersion: 144 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Will the door knob hit the wall?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open the door hardware check", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Fitted doorway", exact: true })).toHaveValue(wall.id);
  await dialog.getByRole("combobox", { name: "Hardware reference", exact: true }).selectOption(georgianPassage.id);
  for (const [name, value] of Object.entries({
    "Backset from latch edge": "2.375", "Bore center above bottom of door": "36",
    "Hardware width": "2.75", "Hardware height": "2.75", "Projection from door face": "2.5",
  })) await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Preview hardware and swing", exact: true }).click();
  await expect(dialog.getByText(/The bare leaf cleared 90°.*86\.8° at the front knob with Hall return wall/)).toBeVisible();
  await dialog.getByRole("button", { name: "Show hardware swing limit", exact: true }).click();
  await expect(dialog.getByRole("slider", { name: /Door swing · 86.8°/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Save door hardware", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Hardware swing in hallway" }).first().click();

  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const motion = page.getByRole("region", { name: "Motion and clearance" });
  await motion.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(motion.getByRole("button", { name: /Focus these parts for .*Hall return wall/ })).toBeVisible();
  const project = projectSchema.parse((await draft()).project);
  expect(project.motionPlans?.[0].memberIds).toHaveLength(3);
  expect(project.sections[0].generator?.doorUnit?.hardware?.purchase).toBe(georgianPassage.id);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Fit hardware and check door travel");
  expect(guide).toContain("2.375 in backset from the latch edge");
  expect(guide).toContain("Schlage Georgian satin nickel passage knob set");

  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /Add 1 passage set of Schlage Georgian/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#100062093");
});

test("preview first contact, save and revise a fixed floor stop, and export the floor marks", async ({ page }) => {
  const source = applyCommand(blank("Hall floor stop example"), {
    ...parsePrompt(doorAndWindowExample), doorUnit: measuredDoor,
  });
  const wall = source.sections[0];
  const face = { width: 2.75, height: 2.75, projection: 2.5, towardHinge: 0 };
  const fitted = previewDoorHardware(source, wall.id, { grip: "knob", purchase: "measured",
    backset: 2.375, centerHeight: 36, front: face, back: face });
  const atOpen = fitted.swing.review!.preview(90).pieces.find(({ designRole }) => designRole === "door-hardware-front")!;
  fitted.project.pieces.push(part("Hall return wall", "plywood", [0.5, 48, 26],
    atOpen.position, source.steps[0].id, "Hall"));
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "hall-before-floor-stop.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...fitted.project, schemaVersion: 145 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Where should I put a door stop?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open the floor stop planner" }).click();
  await expect(dialog.getByRole("combobox", { name: "Fitted doorway", exact: true })).toHaveValue(wall.id);
  await expect(dialog.getByText("The current swing reaches 86.8° without a stop.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Stop for shopping list" }).selectOption(everbiltFloorStop.id);
  for (const [name, value] of Object.entries({
    "Target opening angle (degrees)": "82", "Overall width along the open leaf": "1.75",
    "Overall depth across the open leaf": "1.75", "Bumper height above the finished floor": "0.5",
  })) await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Preview floor stop and swing" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/project above the bottom/);
  await dialog.getByRole("spinbutton", { name: "Bumper height above the finished floor" }).fill("1.25");
  await dialog.getByRole("button", { name: "Preview floor stop and swing" }).click();
  await expect(dialog.getByText(/Without the stop.*86.8°.*front door knob.*Hall return wall/)).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText("The door leaf meets the floor stop first near 81.9°.");
  await expect(dialog.getByRole("slider", { name: "Door swing · 81.9°" })).toBeVisible();
  await dialog.getByRole("slider").press("Home");
  await expect(dialog.getByRole("slider", { name: "Door swing · 0°" })).toBeVisible();
  await dialog.getByRole("button", { name: "Show first contact" }).click();
  await expect(dialog.getByRole("slider", { name: "Door swing · 81.9°" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save floor stop" }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Hall floor stop example" }).first().click();

  const reopened = projectSchema.parse((await draft()).project);
  const section = reopened.sections.find(({ doorFloorStop }) => doorFloorStop)!;
  expect(section.doorFloorStop?.target).toBe(82);
  expect(reopened.motionPlans?.[0].memberIds).not.toContain(section.pieceIds[0]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("The door leaf meets the floor stop first near 81.9°.");
  expect(guide).toContain("mark the stop footprint center");
  expect(guide.indexOf("Fit hardware and check door travel")).toBeLessThan(guide.indexOf("door leaf meets the floor stop"));
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list" }).click();
  await dialog.getByRole("button", { name: /Add 1 floor stop of Everbilt satin chrome/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#314151894");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Plan a floor door stop" }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Target opening angle (degrees)" })).toHaveValue("82");
  await dialog.getByRole("spinbutton", { name: "Target opening angle (degrees)" }).fill("80");
  await dialog.getByRole("button", { name: "Preview floor stop and swing" }).click();
  await expect(dialog.getByRole("status")).toContainText("79.9°");
  await dialog.getByRole("button", { name: "Save floor stop" }).click();
  await expect.poll(async () => (await draft())?.project?.sections?.find((row: typeof section) => row.id === section.id)?.doorFloorStop?.target).toBe(80);
  expect((await draft()).project.sections.filter((row: typeof section) => row.doorFloorStop)).toHaveLength(1);
});
