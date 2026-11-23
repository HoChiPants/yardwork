import { addFramingLumber } from "../helpers/materialPlacement";
import { CURRENT_DRAFT_KEY, PREVIOUS_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, part, projectSchema, uid, type Project } from "../../src/model";
import { guideIsCurrent } from "../../src/guide";
import { bounds } from "../../src/engine";
import { cedarbrookLining as cedar } from "../../src/saunaLiningReference";
import { cedarbrookDoor } from "../../src/saunaDoorReference";
import { cedarbrookBenches } from "../../src/saunaBenchReference";
import { cedarbrookFoil } from "../../src/saunaFoilReference";
import {
  saunaCeilingBatt as batt,
  saunaCeilingJoists,
} from "../../src/saunaCeilingReference";
import { owensCorningWallBatt as wallBatt } from "../../src/saunaWallReference";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { greenhouseBaseTimber as timber } from "../../src/greenhouseBaseReference";
import { everbiltAngleShelfPins, everbiltShelfPin } from "../../src/shelfPinReference";
import { harviaKit } from "../../src/saunaHeaterReference";
import { reviewSunliteTape } from "../../src/sunliteTapePlan";
import { sunliteTapeProductId } from "../../src/sunliteTapeSchema";
import { edgeBandingEdges } from "../../src/edgeBanding";
import { saveMotionPlan } from "../../src/mechanismMotion";

test("the Home Depot sauna package checks body placement and exports the correct package with review notes", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles("public/examples/builds/sauna.yardwork.json");
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const heading = page.getByText("Plan sauna heater clearance", { exact: true });
  const heater = heading.locator("..");
  await heading.click();
  await expect(heater.getByRole("combobox", { name: "Heater package", exact: true })).toHaveValue(harviaKit.productId);
  await heater.getByRole("combobox", { name: "Mounting wall", exact: true }).selectOption("front");
  await heater.getByRole("combobox", { name: "Heater bottom above floor units", exact: true }).selectOption("ft");
  await heater.getByRole("spinbutton", { name: "Heater bottom above floor", exact: true }).fill("1");
  await heater.getByRole("combobox", { name: "Supply voltage for sizing", exact: true }).selectOption("240");
  await heater.getByRole("spinbutton", { name: "Uninsulated brick, tile and glass wall area (sq ft)", exact: true }).fill("0");
  const save = heater.getByRole("button", { name: "Save and check heater layout", exact: true });
  await save.click();
  await expect(heater.getByText("Doorway approach · Review", { exact: true })).toBeVisible();
  await heater.getByText("Edit heater location and room inputs", { exact: true }).click();
  await heater.getByRole("combobox", { name: "Mounting wall", exact: true }).selectOption("right");
  await save.click();
  await expect(heater.getByText("Doorway approach · Review", { exact: true })).toHaveCount(0);
  await expect(heater.getByText(/252 ft³ finished room/)).toBeVisible();
  await heater.getByRole("button", { name: "Show listed heater body in 3D", exact: true }).click();
  await expect(page.getByTestId("sauna-heater-marker")).toHaveText("Harvia listed body");
  await page.screenshot({ path: info.outputPath("harvia-package-placement.png") });

  await page.getByRole("button", { name: "List", exact: true }).click();
  const sourcing = page.getByText("Sauna heater sourcing", { exact: true });
  await sourcing.click();
  const sourcingPanel = sourcing.locator("..");
  await expect(sourcingPanel.getByRole("link", { name: "Home Depot · KITJH60-HD", exact: true })).toHaveAttribute("href", harviaKit.listing);
  await sourcingPanel.getByRole("button", { name: "Add sauna heater package reference", exact: true }).click();
  await expect(sourcingPanel.getByText("Package candidates 1 · Selected 1.", { exact: true })).toBeVisible();
  const shopping = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shopping list", exact: true }).click();
  expect(await readFile((await (await shopping).path())!, "utf8")).toContain(harviaKit.retailerProductId);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideFile).path())!, "utf8");
  expect(guide).toContain("Confirm the delivered heater and Xenio nameplates");
  expect(guide).toContain(harviaKit.listing);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const current = (await draft(page))!;
  const response = await page.request.get(`/api/projects/${current.id}`);
  expect(response.ok()).toBe(true);
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.saunaHeaterPlans?.[0]).toMatchObject({ productId: harviaKit.productId, wall: "right", bottom: 12 });
  expect(reopened.supplies.filter((row) => row.productId === harviaKit.productId)).toHaveLength(1);
});

type StudyCase = { id: string; title: string; parts: number; profile: boolean };
const studies: StudyCase[] = [
  {
    id: "storage-banquette",
    title: "Three-section storage banquette",
    parts: 42,
    profile: false,
  },
  {
    id: "shelves",
    title: "Freestanding adjustable shelf carcass",
    parts: 8,
    profile: false,
  },
  {
    id: "closet-insert",
    title: "Built-in closet bay study",
    parts: 10,
    profile: false,
  },
  {
    id: "greenhouse",
    title: "Gabled greenhouse framing study",
    parts: 70,
    profile: true,
  },
  {
    id: "sauna",
    title: "Sauna interior envelope study",
    parts: 48,
    profile: false,
  },
];

test("the glazed greenhouse compares measured panel travel and includes it in the guides", async ({ page }) => {
  const saved = JSON.parse(await readFile("public/examples/builds/greenhouse.yardwork.json", "utf8"));
  await page.goto("/");
  await page.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "greenhouse-thermal.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  const title = page.locator("summary").filter({ hasText: /^SUNLITE temperature movement$/ });
  await title.click();
  const panel = page.locator("details.field-section").filter({ has: title });
  await panel.getByRole("spinbutton", { name: "Lowest sheet temperature (°F)" }).fill("0");
  await panel.getByRole("spinbutton", { name: "Installation sheet temperature (°F)" }).fill("70");
  await panel.getByRole("spinbutton", { name: "Highest sheet temperature (°F)" }).fill("150");
  await panel.getByRole("button", { name: "Save temperature range" }).click();
  await panel.getByRole("spinbutton", { name: "Available growth along flutes (in)" }).fill("0.01");
  await panel.getByRole("spinbutton", { name: "Available growth across flutes (in)" }).fill("0.01");
  await panel.getByText("Cold-weather edge overlap", { exact: true }).click();
  const least = panel.getByRole("spinbutton", { name: "Least overlap along flutes (in)" });
  const required = panel.getByRole("spinbutton", { name: "Required overlap along flutes (in)" });
  await least.fill("0.01");
  await panel.getByRole("button", { name: "Save panel travel" }).click();
  await expect(panel.getByRole("alert")).toContainText("Enter both measured and required overlap along flutes");
  await required.fill("0.125");
  await panel.getByRole("button", { name: "Save panel travel" }).click();
  await expect(panel.getByText(/0\.01 in measured travel · short/).first()).toBeVisible();
  await expect(panel.getByText(/projected to lose capture/).first()).toBeVisible();
  await expect.poll(async () => (await draft(page))?.sunliteThermal?.panels.length).toBe(1);
  expect((await draft(page))?.pieces).toEqual(saved.pieces);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await download).path())!, "utf8");
  expect(markdown).toContain("SUNLITE temperature movement");
  expect(markdown).toContain("0.01 in measured travel · short");
  expect(markdown).toContain("Cold retention along flutes");
  expect(markdown).toContain("projected to lose capture");
  await expect(page.locator(".sunlite-thermal-print")).toContainText("0.01 in measured travel · short");
  await expect(page.locator(".sunlite-thermal-print")).toContainText("projected to lose capture");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  await expect(page.getByText("SUNLITE panel may lose required overlap in the cold", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const current = projectSchema.parse(await draft(page));
  const response = await page.request.get(`/api/projects/${current.id}`);
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).project.sunliteThermal).toEqual(current.sunliteThermal);
  expect(current.sunliteThermal?.panels[0].travel.retention?.along).toEqual({ overlap: 0.01, minimum: 0.125 });
});
async function draft(page: Page): Promise<Project | null> {
  return page.evaluate((draftKey) => {
    const raw = localStorage.getItem(draftKey);
    return raw ? JSON.parse(raw).project : null;
  }, CURRENT_DRAFT_KEY);
}
async function openStudies(page: Page) {
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Explore whole builds.");
}
async function exportProject(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const download = await event,
    path = await download.path();
  if (!path) throw Error("Project JSON download was unavailable.");
  const text = await readFile(path, "utf8");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return { text, project: projectSchema.parse(JSON.parse(text)) };
}

test("complete a greenhouse tape cut plan and carry paired kits through the Home Depot list", async ({ page }) => {
  const sample = projectSchema.parse(JSON.parse(await readFile("public/examples/builds/greenhouse.yardwork.json", "utf8")));
  const name = `Greenhouse tape ${uid().slice(0, 8)}`;
  const first = reviewSunliteTape(sample)!.rows[0].run;
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "greenhouse-tape.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...sample, name })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const plan = page.locator("#sunlite-tape-plan");
  const summary = plan.locator(":scope > summary");
  await summary.click();
  await plan.getByRole("combobox", { name: "Tape edge", exact: true }).selectOption(first.id);
  await plan.getByRole("spinbutton", { name: "Tape strip cut length", exact: true }).fill(String(first.length + 0.5));
  await plan.getByRole("textbox", { name: "Edge measurement notes" }).fill("Test fixture: first edge checked at the bench");
  await plan.getByRole("button", { name: "Save tape length", exact: true }).click();
  await expect(summary).toContainText("1 of 64 edges ready");
  await plan.getByRole("button", { name: "Show tape edge in 3D" }).click();
  await expect(page.getByTestId("sunlite-profile-marker")).toHaveText(first.label);

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const prep = page.getByRole("region", { name: "Build preparation", exact: true });
  const shopping = prep.locator("details.preparation-group").filter({ has: page.locator("summary").filter({ hasText: "Shopping and availability" }) });
  await shopping.locator(":scope > summary").click();
  await shopping.getByRole("button", { name: /92763.*Glazing tape cut plan|Anti.Dust Tape.*Glazing tape cut plan/i }).click();
  await expect(plan).toHaveJSProperty("open", true);
  await expect(plan.getByRole("button", { name: /^Add .* missing tape/ })).toHaveCount(0);
  const handoff = page.getByRole("button", { name: "Prepare Home Depot list", exact: true });
  await handoff.click();
  await expect(dialog).toContainText("Resolve the unmeasured or changed edges");
  await expect(dialog.getByRole("button", { name: /add.*anti.dust tape/i })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await plan.getByText("Use the layout with a trim allowance", { exact: true }).click();
  await plan.getByRole("spinbutton", { name: "Extra per upper strip", exact: true }).fill("0.75");
  await plan.getByRole("spinbutton", { name: "Extra per lower strip", exact: true }).fill("0.25");
  await plan.getByRole("textbox", { name: "Layout and trim notes", exact: true }).fill("Test fixture: model checked against dry-fit edge lengths");
  await plan.getByRole("button", { name: "Fill unmeasured edges", exact: true }).click();
  await expect(summary).toContainText("64 of 64 edges ready");
  await expect.poll(async () => (await draft(page))?.sunliteTapeCuts?.length).toBe(64);
  const cutProject = projectSchema.parse(await draft(page));
  const review = reviewSunliteTape(cutProject)!;
  const packs = review.required!;
  expect(packs).toBeGreaterThan(0);
  expect(cutProject.sunliteTapeCuts?.find(({ runId }) => runId === first.id)?.length).toBe(first.length + 0.5);
  expect(cutProject.pieces).toEqual(sample.pieces);
  await plan.getByText("Roll cut order and edge review", { exact: true }).click();
  await expect(plan.getByRole("heading", { name: "Upper nonvented tape", exact: true })).toBeVisible();
  await expect(plan.getByRole("heading", { name: "Lower vented tape", exact: true })).toBeVisible();

  await handoff.click();
  await dialog.getByRole("button", { name: /add.*anti.dust tape/i }).click();
  const tapeItem = dialog.getByRole("list", { name: "Home Depot purchase review", exact: true })
    .getByRole("listitem").filter({ hasText: "#205713443" });
  await expect(tapeItem.getByRole("link")).toHaveAttribute("href", "https://www.homedepot.com/p/205713443");
  await expect(tapeItem).toContainText(`${packs} top/bottom tape kit`);
  await expect(dialog.getByRole("button", { name: /add.*anti.dust tape/i })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await file).path())!, "utf8");
  expect(guide).toMatch(/## Glazing tape cut plan[\s\S]*### Upper nonvented tape[\s\S]*### Lower vented tape/);
  expect(guide).toContain("layout plus trim");
  await expect(page.locator(".sunlite-tape-print")).toContainText("64 of 64 edges ready");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: name }).click();
  await expect.poll(async () => (await draft(page))?.sunliteTapeCuts?.length).toBe(64);
  const reopened = projectSchema.parse(await draft(page));
  expect(reopened.sunliteTapeCuts).toEqual(cutProject.sunliteTapeCuts);
  expect(reopened.supplies.filter(({ productId }) => productId === sunliteTapeProductId).map(({ quantity }) => quantity)).toEqual([packs]);
  expect(reopened.pieces).toEqual(sample.pieces);
});

for (const [family, edges, rolls] of [
  ["storage-banquette", 6, 1],
  ["shelves", 7, 2],
  ["closet-insert", 10, 3],
] as const) {
  test(`${family} plans plywood edge banding and exports the exact rolls`, async ({ page }) => {
    const sample = projectSchema.parse(JSON.parse(await readFile(`public/examples/builds/${family}.yardwork.json`, "utf8")));
    const name = `Finish ${family} ${uid().slice(0, 8)}`;
    const front = edgeBandingEdges(sample).find((edge) => !edge.coveredBy && edge.normal[2] > 0.9999 && edge.face === "+Z")!;
    await page.goto("/");
    await page.getByRole("button", { name: "Open project", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
    await dialog.locator("input[type=file]").first().setInputFiles({
      name: "casework-edge-banding.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...sample, name })),
    });
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "List", exact: true }).click();
    const plan = page.locator("#edge-banding-plan");
    const summary = plan.locator(":scope > summary");
    await summary.click();
    await plan.getByRole("combobox", { name: "Panel to edge", exact: true }).selectOption(front.pieceId);
    await plan.getByRole("button", { name: "Show +Z edge in 3D", exact: true }).click();
    await expect(page.getByTestId("edge-banding-marker")).toHaveText(front.label);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await plan.getByRole("spinbutton", { name: "Total strip trim", exact: true }).fill("0.5");
    await plan.getByRole("button", { name: "Select available front edges (+Z)", exact: true }).click();
    await expect(plan.getByText(`${edges} edges selected`, { exact: true })).toBeVisible();
    await plan.getByRole("button", { name: `Save ${edges} edges`, exact: true }).click();
    await expect(summary).toContainText(`${edges} saved edges`);
    await plan.locator("summary").filter({ hasText: /EDGEMATE.*25 ft/ }).click();
    await expect(plan).toContainText(`${rolls} ${rolls === 1 ? "roll" : "rolls"} needed`);
    await expect(plan).toContainText("0.5 in trim");
    await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
    await dialog.getByRole("button", { name: new RegExp(`^Add ${rolls} rolls? of EDGEMATE white birch`) }).click();
    const row = dialog.getByRole("list", { name: "Home Depot purchase review", exact: true }).getByRole("listitem")
      .filter({ hasText: "#314095455" });
    await expect(row.getByRole("link")).toHaveAttribute("href", "https://www.homedepot.com/p/314095455");
    await expect(row).toContainText(`${rolls} roll`);
    await expect(dialog.getByRole("button", { name: /add.*edgemate white birch/i })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const file = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /^Build guide/ }).click();
    const guide = await readFile((await (await file).path())!, "utf8");
    expect(guide).toMatch(/## Panel edge banding[\s\S]*314095455[\s\S]*0\.5 in trim/);
    expect(guide).toContain("Review a flush trimmer for cooled veneer");
    await expect(page.locator(".edge-banding-print")).toContainText("0.5 in trim");
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Open project", exact: true }).click();
    await page.locator(".project-list > button").filter({ hasText: name }).click();
    await expect.poll(async () => (await draft(page))?.edgeBanding?.length).toBe(edges);
    const saved = projectSchema.parse(await draft(page));
    expect(saved.edgeBanding?.every(({ trim, productId }) => trim === 0.5 && productId === "edgemate-5032270")).toBe(true);
    expect(saved.supplies.find(({ productId }) => productId === "edgemate-5032270")?.quantity).toBe(rolls);
    expect(saved.pieces).toEqual(sample.pieces);
  });
}

test("measured veneer previews finish movement before the edge is saved", async ({ page }) => {
  const seed = blank("Finished drawer clearance");
  const step = seed.steps[0].id;
  const shelf = { ...part("Fixed shelf", "plywood", [18, 0.75, 10], [0, 10, 0], step, "Cabinet"), stockLengthAxis: 0 as const };
  const lip = part("Passing tray lip", "plywood", [12, 0.75, 0.75], [-20, 10, 5.39], step, "Tray");
  const { project } = saveMotionPlan({ ...seed, pieces: [shelf, lip] }, {
    label: "Passing tray", memberIds: [lip.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 18 },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "finished-drawer-clearance.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  const panel = page.locator("#edge-banding-plan");
  const summary = panel.locator(":scope > summary");
  await summary.click();
  await panel.getByRole("combobox", { name: "Panel to edge", exact: true }).selectOption(shelf.id);
  await panel.getByRole("checkbox", { name: /Local \+Z ·/ }).check();
  await panel.getByRole("spinbutton", { name: "Total strip trim", exact: true }).fill("0.5");
  await panel.getByRole("checkbox", { name: "Include measured thickness in fit and movement", exact: true }).check();
  const thickness = panel.getByRole("spinbutton", { name: "Installed veneer thickness", exact: true });
  const check = panel.getByRole("button", { name: "Check finished movement", exact: true });
  const outcome = panel.getByRole("region", { name: "Finished movement", exact: true });
  await thickness.fill("0.046875");
  await check.click();
  await expect(outcome).toContainText(/Modeled interference.*Passing tray lip.*Fixed shelf/);
  expect((await draft(page))!.edgeBanding ?? []).toHaveLength(0);
  await outcome.getByRole("button", { name: "Show in 3D", exact: true }).click();
  await expect(page.getByTestId("motion-preview-label")).toContainText(/Passing tray.*Fixed shelf/);
  await page.getByRole("button", { name: "Return to edge banding", exact: true }).click();
  await thickness.fill("0.005");
  await expect(outcome).toHaveCount(0);
  await expect(page.getByTestId("motion-preview-label")).toHaveCount(0);
  await check.click();
  await expect(outcome).toContainText("No new or worse findings in the saved motion tests.");
  await panel.getByRole("button", { name: "Save 1 edge", exact: true }).click();
  await expect(summary).toContainText("1 saved edge");
  await expect.poll(async () => (await draft(page))?.edgeBanding?.[0].installedThickness).toBe(0.005);
  const finished = (await draft(page))!;
  expect(finished.pieces.map(({ size }) => size)).toEqual(project.pieces.map(({ size }) => size));
});

test("a reviewed greenhouse base carries its exact timber cuts and a matching store snapshot to the Home Depot list", async ({ page }) => {
  await page.goto("/");
  await openStudies(page);
  const study = page.getByRole("dialog");
  await study.getByRole("combobox", { name: "Choose a build study" }).selectOption("greenhouse");
  await study.getByText("Source-matched stock options", { exact: true }).click();
  await study.getByRole("combobox", { name: "Study base stock" }).selectOption(timber.materialId);
  await expect(study).toContainText("Actual stock dimensions for exterior greenhouse perimeter rails");
  await study.getByRole("button", { name: "Open as new project", exact: true }).click();
  await expect.poll(async () => (await draft(page))?.pieces.filter(({ material }) => material === timber.materialId).length).toBe(4);
  const cutSizes = (await draft(page))!.pieces.filter(({ material }) => material === timber.materialId).map(({ size }) => size);
  expect(cutSizes).toEqual([[72, 3.5, 3.5], [72, 3.5, 3.5], [3.5, 3.5, 89], [3.5, 3.5, 89]]);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const prepare = page.getByRole("button", { name: "Prepare Home Depot list", exact: true });
  await prepare.click();
  const dialog = page.getByRole("dialog");
  const pasteList = dialog.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(pasteList).toHaveValue(/4 timbers .*#205220341/);
  await expect(dialog).toContainText("No recent store snapshot");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Record store snapshot", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Modeled material", exact: true }).selectOption(timber.materialId);
  await dialog.getByRole("button", { name: "Use reviewed product reference", exact: true }).click();
  await expect(dialog.getByLabel("Internet number", { exact: true })).toHaveValue(timber.internetNumber);
  await expect(dialog.getByLabel("Store ZIP code", { exact: true })).toHaveValue("84121");
  await dialog.getByLabel("Unit price (USD)", { exact: true }).fill("10.99");
  await dialog.getByLabel("Available stock units", { exact: true }).fill("3");
  await dialog.getByLabel("Exact store number", { exact: true }).fill("4409");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save snapshot", exact: true }).click();
  await prepare.click();
  await expect(pasteList).toHaveValue(/4 timbers .*#205220341/);
  await expect(dialog).toContainText("Short by 1 in snapshot");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const { project } = await exportProject(page);
  expect(project.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(project.ideaBindings[0].entries[0].spec).toMatchObject({
    structure: { selections: { greenhouseBase: { materialId: timber.materialId, productRegistryRef: timber.productId } } },
  });
  expect(project.inventory.find(({ material }) => material === timber.materialId)).toMatchObject({
    internetNumber: timber.internetNumber, store: "4409", zip: "84121", available: 3,
  });
});
test("SUNLITE greenhouse marks missing roof seam backing and keeps the review in the guide", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await openStudies(page);
  const study = page.getByRole("dialog");
  await study
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("greenhouse");
  await study
    .getByRole("spinbutton", { name: "Study rafter spacing" })
    .fill("16");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await study
    .getByRole("combobox", { name: "Study greenhouse glazing" })
    .selectOption("sunlite-8mm");
  await expect(
    study.getByText(/6 of 6 checked roof seams have gaps in modeled backing/),
  ).toBeVisible();
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await draft(page))?.pieces.some(
        ({ material }) => material === "sunlite-8mm",
      ),
    )
    .toBe(true);
  const initial = projectSchema.parse(await draft(page));

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByText(/^SUNLITE panel accessory estimate ·/).click();
  await expect(
    page.getByText(
      /6 of 6 checked roof seams have gaps in modeled backing. See Checks/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: /Roof glazing seams need backing review.*Show gap in 3D/,
    })
    .click();
  await expect(page.getByTestId("roof-seam-gap-marker")).toHaveText(
    "Roof seam gap · 43.26662 in",
  );
  await expect(page.getByRole("toolbar", { name: "Model tools" })).toBeHidden();
  await page.screenshot({
    path: info.outputPath("sunlite-roof-seam-gaps.png"),
  });
  await page.getByRole("button", { name: "Hide highlighted area" }).click();
  await expect(page.getByTestId("roof-seam-gap-marker")).toHaveCount(0);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guide).path())!, "utf8");
  expect(markdown).toContain("## SUNLITE roof seam backing");
  expect(markdown).toContain("Gaps along seam 43.26662 in");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const exported = await exportProject(page);
  expect(exported.project.pieces).toEqual(initial.pieces);
  expect(exported.project.supplies).toEqual(initial.supplies);
});
test("greenhouse rafter joints show eave gaps and respond when the actual ridge moves", async ({ page }, info) => {
  await page.goto("/");
  await openStudies(page);
  const study = page.getByRole("dialog");
  await study.getByRole("combobox", { name: "Choose a build study" }).selectOption("greenhouse");
  await study.getByText("Source-matched stock options", { exact: true }).click();
  await study.getByRole("combobox", { name: "Study greenhouse glazing" }).selectOption("sunlite-8mm");
  await expect(study.getByText(/0 of 10 eave ends show wood face contact/)).toBeVisible();
  await expect(study.getByText(/Smallest gap 0.21 in/)).toBeVisible();
  await study.getByRole("button", { name: "Open as new project", exact: true }).click();
  await expect.poll(async () => Boolean((await draft(page))?.pieces.find(({ designRole }) => designRole === "greenhouse-ridge"))).toBe(true);
  const opening = projectSchema.parse(await draft(page));
  const ridge = opening.pieces.find(({ designRole }) => designRole === "greenhouse-ridge")!;
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  await checks.click();
  const eaveFinding = page.getByRole("button", { name: /^Greenhouse rafters · Eave bearing/ });
  const ridgeFinding = page.getByRole("button", { name: /^Greenhouse rafters · Ridge fit/ });
  await expect(eaveFinding).toContainText("Smallest gap 0.21 in");
  await expect(eaveFinding).toHaveClass(/warning/);
  await expect(ridgeFinding).toContainText("10 of 10 ridge ends show wood face contact");
  await ridgeFinding.click();
  await expect(page.getByTestId("rafter-ridge-marker")).toHaveAttribute("data-contact-patches", "10");
  await page.getByRole("button", { name: "Hide highlighted area", exact: true }).click();
  await eaveFinding.click();
  await expect(page.getByTestId("rafter-eave-marker")).toHaveText("Eave bearing · 0 of 10 face contacts");
  await expect(page.getByRole("toolbar", { name: "Model tools" })).toBeHidden();
  await page.screenshot({ path: info.outputPath("eave-bearing-preview.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Hide highlighted area", exact: true }).click();

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${ridge.id}"]`).click();
  const y = page.getByRole("spinbutton", { name: "Y", exact: true });
  const raised = ridge.position[1] + 12;
  await y.fill(String(raised));
  await y.press("Tab");
  await expect.poll(async () => (await draft(page))?.pieces.find(({ id }) => id === ridge.id)?.position[1] ?? 0).toBeCloseTo(raised, 7);
  await checks.click();
  await expect(ridgeFinding).toHaveClass(/warning/);
  await expect(ridgeFinding).toContainText("0 of 10 ridge ends show wood face contact");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  expect(await readFile((await (await guide).path())!, "utf8")).toMatch(/Greenhouse rafter joints[\s\S]+Eave 0\.21 in gap · Ridge review the retained joint/);
  await expect(page.locator(".print-guide")).toContainText("Greenhouse rafter joints");
});

for (const scenario of [
  {
    build: "greenhouse",
    stock: "sunlite-8mm",
    select: "Study greenhouse glazing",
    name: "SUNLITE 8 mm twinwall panel",
    purchase: "21 panels",
    instruction: "across the flutes",
  },
  {
    build: "sauna",
    stock: wallBatt.materialId,
    select: "Study wall cavity insulation",
    name: "Owens Corning ME22 R-15 unfaced wall batt",
    purchase: "3 bags",
    instruction: "Knife-cut",
  },
]) {
  test(`${scenario.build} records nonwood stock cuts and keeps purchasing and offcuts in sync`, async ({ page }) => {
    await page.goto("/");
    await openStudies(page);
    const study = page.getByRole("dialog");
    await study.getByRole("combobox", { name: "Choose a build study" }).selectOption(scenario.build);
    await study.getByText("Source-matched stock options", { exact: true }).click();
    await study.getByRole("combobox", { name: scenario.select, exact: true }).selectOption(scenario.stock);
    await study.getByRole("button", { name: "Open as new project", exact: true }).click();
    await page.getByRole("button", { name: "List", exact: true }).click();
    const row = page.locator(`.bom-row[data-stock-material="${scenario.stock}"]`);
    await expect(row).toContainText(scenario.purchase);
    const order = row.locator("details.stock-cut-order");
    await order.locator(":scope > summary").click();
    const firstUnit = order.locator(":scope > details").first();
    await firstUnit.locator("summary").click();
    await expect(firstUnit).toContainText(scenario.instruction);
    await expect(firstUnit).toContainText("Expected leftovers");
    await firstUnit.getByRole("button", { name: "Record this stock unit" }).click();
    await expect(row.getByText(/^Recorded cut source 1/)).toBeVisible();
    await expect(row).toContainText(scenario.purchase);
    await expect.poll(async () => (await draft(page))?.pieces.some(
      (piece) => piece.offcut && piece.material === scenario.stock,
    )).toBe(true);
    const savedDraft = projectSchema.parse(await draft(page));
    const scraps = savedDraft.pieces.filter((piece) => piece.offcut && piece.material === scenario.stock);
    for (const scrap of scraps) {
      expect(scrap.cutStock?.sourceAxes?.[2]).toBe(scrap.stockLengthAxis);
      expect(savedDraft.pieces.some((piece) => !piece.offcut && piece.cutStock?.id === scrap.cutStock?.id)).toBe(true);
    }
    await page.getByRole("button", { name: `Cut pool (${scraps.length})`, exact: true }).click();
    await expect(page.getByRole("region", { name: "Cut pool" }).getByText(scenario.name, { exact: true })).toHaveCount(scraps.length);
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
    const read = await page.request.get(`/api/projects/${savedDraft.id}`);
    expect(read.ok()).toBe(true);
    const saved = projectSchema.parse((await read.json()).project);
    expect(saved.pieces.filter((piece) => piece.offcut)).toEqual(scraps);
  });
}

test("sauna wall insulation shops the exact bag and checks live coverage after edits", async ({ page }) => {
  await page.goto("/");
  await openStudies(page);
  const study = page.getByRole("dialog");
  await study.getByRole("combobox", { name: "Choose a build study" }).selectOption("sauna");
  await study.getByText("Source-matched stock options", { exact: true }).click();
  const insulation = study.getByRole("combobox", { name: "Study wall cavity insulation" });
  await insulation.selectOption("jm-u1330-batt");
  await expect(study.getByText("Wall insulation · 23 fitted pieces · 18 full batts · 2 bags.")).toBeVisible();
  await insulation.selectOption(wallBatt.materialId);
  await expect(study.getByText("Wall insulation · 23 fitted pieces · 18 full batts · 3 bags.")).toBeVisible();
  await study.getByRole("button", { name: "Show wall insulation" }).click();
  await expect(study.locator(".build-study-preview canvas")).toBeVisible();
  await expect(study.getByRole("button", { name: "Show full room" })).toBeVisible();
  await study.getByRole("button", { name: "Open as new project", exact: true }).click();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(`a[href="${wallBatt.listing}"]`).first()).toBeVisible();
  const shopping = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shopping list" }).click();
  expect(await readFile((await (await shopping).path())!, "utf8")).toContain(
    `"${wallBatt.homeDepotId}","3","bag"`,
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideFile).path())!, "utf8");
  expect(guide).toContain("Measure and fit the wall batts");
  expect(guide).toContain("Owens Corning ME22 R-15 unfaced wall batt");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  const draftProject = projectSchema.parse(await draft(page));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const read = await page.request.get(`/api/projects/${draftProject.id}`);
  expect(read.ok()).toBe(true);
  const saved = projectSchema.parse((await read.json()).project);
  const batts = saved.pieces.filter(({ material }) => material === wallBatt.materialId);
  expect(batts).toHaveLength(23);
  expect(batts.every(({ size }) => size[2] === 3.5)).toBe(true);
  expect(saved.ideaBindings[0].entries[0].spec).toMatchObject({
    structure: { selections: { saunaInsulation: {
      materialId: wallBatt.materialId,
      productRegistryRef: wallBatt.productId,
    } } },
  });
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Generate build guide", exact: true }).first().click();
  await page.locator(".step-track").getByRole("button", { name: /Measure and fit the wall batts/ }).click();
  await page.locator(`button.step-part[data-part-id="${batts[0].id}"]`).click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Retained width", exact: true }).fill("6");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  const warning = page.getByRole("button", { name: /Sauna wall insulation gap · Rear wall.*Show gap in 3D/ });
  await warning.click();
  await expect(page.getByTestId("wall-batt-gap-marker")).toHaveText("Rear wall · 4.44 sq ft uncovered");
  await page.getByRole("button", { name: "Hide highlighted area" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const editedGuide = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const coverage = "Rear wall has 4.44 sq ft without full-depth batt coverage";
  expect(await readFile((await (await editedGuide).path())!, "utf8")).toContain(coverage);
  await expect(page.locator(".print-guide")).toContainText(coverage);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Cut pool (1)", exact: true }).click();
  await page.getByRole("region", { name: "Cut pool" }).getByRole("button", { name: /^Reuse / }).click();
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  await expect(page.getByRole("button", { name: /Sauna wall insulation gap/ })).toHaveCount(0);
});

test("sauna ceiling fits full-thickness batts only with sufficient depth and saves their cut and bag takeoff", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await openStudies(page);
  const study = page.getByRole("dialog");
  await study
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("sauna");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  const [joist] = saunaCeilingJoists;
  await study
    .getByRole("combobox", { name: "Study ceiling cavity insulation" })
    .selectOption(batt.materialId);
  await expect(
    study.getByText(/9.5 in batt exceeds the 3.5 in modeled ceiling cavity/),
  ).toBeVisible();
  await expect(
    study.getByRole("button", { name: "Show ceiling insulation" }),
  ).toHaveCount(0);
  await study
    .getByRole("combobox", { name: "Study ceiling joist stock" })
    .selectOption(joist.materialId);
  await expect(
    study.getByText(/batt exceeds the .* modeled ceiling cavity/),
  ).toHaveCount(0);
  await expect(
    study.getByText(
      "Ceiling insulation · 10 fitted pieces · 10 full batts · 1 bag.",
    ),
  ).toBeVisible();
  await study.getByRole("button", { name: "Show ceiling insulation" }).click();
  const preview = study.locator(".build-study-preview");
  await expect(preview.locator("canvas")).toBeVisible();
  await preview.screenshot({
    path: info.outputPath("sauna-ceiling-insulation.png"),
  });
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await draft(page))?.pieces.filter(
          ({ material }) => material === batt.materialId,
        ).length,
    )
    .toBe(10);
  const initial = projectSchema.parse(await draft(page));
  const first = initial.pieces.find(
    (piece) => piece.material === batt.materialId,
  )!;
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page
      .locator(`a[href="https://www.homedepot.com/p/${batt.homeDepotId}"]`)
      .first(),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shopping list" }).click();
  expect(await readFile((await (await pending).path())!, "utf8")).toContain(
    `"${batt.homeDepotId}","1","bag"`,
  );
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Measure and fit the ceiling batts",
  );
  await page
    .locator(".step-track")
    .getByRole("button", { name: /Measure and fit the ceiling batts/ })
    .click();
  await page.locator(`button.step-part[data-part-id="${first.id}"]`).click();
  await expect(
    page.getByRole("spinbutton", { name: "Depth Z", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Retained width", exact: true })
    .fill("6");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await draft(page))?.pieces.find(({ id }) => id === first.id)?.size,
    )
    .toEqual([6, 48, batt.thickness]);
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: /Sauna ceiling insulation gap.*Show gap in 3D/,
    })
    .click();
  await expect(page.getByTestId("ceiling-gap-marker")).toHaveText(
    "Uncovered ceiling · 2.58 sq ft",
  );
  await expect(page.getByRole("toolbar", { name: "Model tools" })).toBeHidden();
  await page.screenshot({ path: info.outputPath("sauna-ceiling-gap.png") });
  await page.getByRole("button", { name: "Hide highlighted area" }).click();
  await expect(page.getByTestId("ceiling-gap-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  expect(await readFile((await (await guideFile).path())!, "utf8")).toContain(
    "2.58 sq ft lacks full-depth batt coverage",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const { project: saved } = await exportProject(page);
  const kept = saved.pieces.find(({ id }) => id === first.id)!;
  const offcut = saved.pieces.find(
    (piece) => piece.offcut && piece.cutStock?.id === kept.cutStock?.id,
  )!;
  expect(offcut.size).toEqual([first.size[0] - 6, 48, batt.thickness]);
  expect(saved.ideaBindings[0].entries[0].spec).toMatchObject({
    structure: {
      selections: {
        saunaCeilingInsulation: {
          materialId: batt.materialId,
          productRegistryRef: batt.productId,
        },
        saunaCeilingJoists: {
          materialId: joist.materialId,
          productRegistryRef: joist.productId,
        },
      },
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const reopened = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${saved.id}` &&
      response.ok(),
  );
  await page
    .locator(".project-list > button")
    .filter({ hasText: saved.name })
    .first()
    .click();
  expect(
    projectSchema.parse((await (await reopened).json()).project).pieces,
  ).toEqual(saved.pieces);
});
test("sauna foil keeps fold allowances in the roll quote, guide and saved plan", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await openStudies(page);
  await page
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("sauna");
  const study = page.getByRole("dialog");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await study
    .getByRole("combobox", { name: "Study sauna door", exact: true })
    .selectOption(cedarbrookDoor.materialId);
  await study
    .getByRole("combobox", { name: "Study wall and ceiling foil", exact: true })
    .selectOption(cedarbrookFoil.materialId);
  await expect(study).toContainText(
    "63 linear ft at 54 in wide · 13 cuts including folds",
  );
  await expect(
    study.getByRole("button", { name: "Show full room", exact: true }),
  ).toBeVisible();
  const preview = study.locator(".build-study-preview");
  await expect(preview.locator("canvas")).toBeVisible();
  await preview.screenshot({ path: info.outputPath("sauna-foil-layer.png") });
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await draft(page))?.pieces.filter(
          (p) => p.material === cedarbrookFoil.materialId,
        ).length,
    )
    .toBe(13);
  const opened = projectSchema.parse(await draft(page));
  const ceiling = opened.pieces.find(
    (p) => p.name === "Sauna ceiling foil · ceiling strip 1",
  )!;

  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByText("63 linear ft · 13 parts", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "View at Cedarbrook" })
      .and(page.locator(`[href="${cedarbrookFoil.url}"]`)),
  ).toBeVisible();
  await page.getByText("Foil roll cut layout", { exact: true }).click();
  await expect(
    page.getByText(/ceiling strip 1 · 54 in × 81 in · Folds X start 3 in/),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export shopping list", exact: true })
    .click();
  const csv = await pending;
  expect(await readFile((await csv.path())!, "utf8")).toContain(
    "Request 63 linear ft at 54 in wide",
  );

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${ceiling.id}"]`).click();
  await expect(
    page.getByRole("spinbutton", { name: "Depth Z", exact: true }),
  ).toBeDisabled();
  const fold = page.getByRole("spinbutton", {
    name: "Fold at X start",
    exact: true,
  });
  await expect(fold).toHaveValue("3");
  await fold.fill("4");
  await fold.press("Tab");
  await expect(
    page.getByText("Flat cut blank · 82 in × 54 in", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  await expect(
    page.getByText("Review edited sauna foil coverage", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  const steps = page.locator(".step-track");
  await expect(steps).toContainText("Cut and fit the ceiling foil");
  await expect(steps).toContainText("Fit the wall foil and check its laps");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const legacySafe = await exportProject(page);
  expect(
    legacySafe.project.pieces.find((p) => p.id === ceiling.id)?.foilReturns
      ?.xStart,
  ).toBe(4);
  expect(legacySafe.project.ideaBindings[0].entries[0].spec).toMatchObject({
    structure: {
      selections: {
        saunaVaporBarrier: {
          materialId: cedarbrookFoil.materialId,
          productRegistryRef: cedarbrookFoil.productId,
        },
      },
    },
  });
  expect(guideIsCurrent(legacySafe.project)).toBe(true);
});
test("a sourced sauna bench updates heater and doorway clearance as it moves", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  const [short, long] = cedarbrookBenches;
  await page.goto("/");
  await openStudies(page);
  await page
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("sauna");
  const study = page.getByRole("dialog");
  await study
    .getByRole("combobox", { name: "Clear inside height units", exact: true })
    .selectOption("in");
  await study
    .getByRole("spinbutton", { name: "Study clear inside height", exact: true })
    .fill("88");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  const benchOption = study.getByRole("combobox", {
    name: "Study freestanding sauna bench",
    exact: true,
  });
  await benchOption.selectOption(short.materialId);
  await expect(study).toContainText("bench length: 4 ft");
  await benchOption.selectOption(long.materialId);
  await expect(study).toContainText("bench length: 5 ft");
  const gap = study.getByRole("spinbutton", {
    name: "Study bench gap from rear wall",
    exact: true,
  });
  await gap.fill("45");
  await expect(study).toContainText("The bench overlaps the doorway approach");
  await gap.fill("0");
  await expect(
    study.getByText(/The bench overlaps the doorway approach/),
  ).toHaveCount(0);
  await expect(
    study.getByRole("button", { name: "Show full room", exact: true }),
  ).toBeVisible();
  const preview = study.locator(".build-study-preview");
  await expect(preview.locator("canvas")).toBeVisible();
  await preview.screenshot({
    path: info.outputPath("sauna-seating-layout.png"),
  });
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await draft(page))?.pieces.some((p) => p.material === long.materialId),
    )
    .toBe(true);
  const initial = projectSchema.parse(await draft(page));
  const bench = initial.pieces.find((p) => p.material === long.materialId)!;
  expect(bench.position).toEqual([0, 9, -27]);

  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "View at Cedarbrook", exact: true }),
  ).toHaveAttribute("href", long.url);
  await expect(page.getByText("1 kit · 1 part", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const heaterTitle = page.getByText("Plan sauna heater clearance", {
    exact: true,
  });
  const heaterPanel = heaterTitle.locator("..");
  await heaterTitle.click();
  await heaterPanel.getByRole("combobox", { name: "Heater package", exact: true }).selectOption("huum-steel60stuwg");
  await page
    .getByRole("spinbutton", {
      name: "Heater center left to right",
      exact: true,
    })
    .fill("0");
  await page
    .getByRole("spinbutton", {
      name: "Heater center back to front",
      exact: true,
    })
    .fill("-6.5");
  await page
    .getByRole("combobox", { name: "Supply voltage for sizing", exact: true })
    .selectOption("240");
  await page
    .getByRole("spinbutton", {
      name: "Uninsulated brick, tile and glass wall area (sq ft)",
      exact: true,
    })
    .fill("6");
  await page
    .getByRole("button", { name: "Save and check heater layout", exact: true })
    .click();
  await expect(
    page.getByText("Modeled dimensions within the reference ranges", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${bench.id}"]`).click();
  await expect(
    page.getByRole("spinbutton", { name: "Width X", exact: true }),
  ).toBeDisabled();
  const benchZ = page.getByRole("spinbutton", { name: "Z", exact: true });
  await benchZ.fill("-17");
  await benchZ.press("Tab");
  await expect
    .poll(
      async () =>
        (await draft(page))?.pieces.find((p) => p.id === bench.id)?.position[2],
    )
    .toBe(-17);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await heaterTitle.click();
  await expect(
    heaterPanel.getByText(
      /The modeled review envelope overlaps.*Sauna pedestal bench/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show heater clearance in 3D", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("sauna-bench-heater-review.png"),
  });

  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Assemble and place the cedar pedestal bench",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const output = await exportProject(page);
  expect(
    output.project.pieces.find((p) => p.id === bench.id)?.position,
  ).toEqual([0, 9, -17]);
  expect(output.project.saunaHeaterPlans?.[0]).toMatchObject({ x: 0, z: -6.5 });
  expect(output.project.ideaBindings[0].entries[0].spec).toMatchObject({
    structure: {
      selections: {
        saunaBench: {
          materialId: long.materialId,
          productRegistryRef: long.productId,
        },
      },
    },
  });
});
test("the sourced sauna door opens outward, stops at a hall cabinet, and retains its closed export", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await openStudies(page);
  await page
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("sauna");
  const study = page.getByRole("dialog");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await study
    .getByRole("combobox", { name: "Study sauna door", exact: true })
    .selectOption(cedarbrookDoor.materialId);
  await expect(
    study.getByRole("spinbutton", {
      name: "Study door opening width",
      exact: true,
    }),
  ).toHaveValue("24");
  await expect(
    study.getByRole("spinbutton", {
      name: "Study door opening height",
      exact: true,
    }),
  ).toHaveValue("76");
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await draft(page))?.pieces.filter(
          (p) => p.material === cedarbrookDoor.materialId,
        ).length,
    )
    .toBe(1);
  const original = projectSchema.parse(await draft(page));
  const closed = original.pieces.find(
    (p) => p.material === cedarbrookDoor.materialId,
  )!;
  expect(closed.size).toEqual([22, 74.5, 2.625]);

  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "View at Cedarbrook", exact: true }),
  ).toHaveAttribute("href", cedarbrookDoor.url);
  await expect(page.getByText("1 kit · 1 part", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const motion = page.getByRole("region", { name: "Motion and clearance" });
  await motion
    .getByRole("button", { name: "Set up sauna door", exact: true })
    .click();
  const setup = page.getByRole("form", { name: "Sauna door setup" });
  await setup
    .getByRole("combobox", { name: "Hinge side from outside", exact: true })
    .selectOption("right");
  await setup
    .getByRole("spinbutton", {
      name: "Measured finished wall depth (optional)",
      exact: true,
    })
    .fill("4.6875");
  await setup.getByRole("button", { name: "Save and test sauna door" }).click();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toHaveAttribute("data-pose", "0");
  await expect(
    motion.getByRole("region", { name: "Sauna door review" }),
  ).toContainText("Request a 4.75 in jamb width");
  await motion
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await page.screenshot({ path: info.outputPath("sauna-door-outward.png") });
  const openExport = await exportProject(page);
  expect(
    openExport.project.pieces.find((p) => p.id === closed.id),
  ).toMatchObject({ position: closed.position, rotation: closed.rotation });
  const plan = openExport.project.motionPlans![0];
  expect(plan.mechanism).toMatchObject({
    kind: "hinge",
    saunaDoor: { side: "right", finishedWallDepth: 4.6875 },
  });

  const reach = 16 / Math.sqrt(2);
  const cabinet = part(
    "Hall cabinet",
    "plywood",
    [0.75, 18, 0.75],
    [11 - reach, 38, 41 + reach],
    original.steps[0].id,
    "Hall",
  );
  const blocked = {
    ...openExport.project,
    pieces: [...openExport.project.pieces, cabinet],
  };
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const open = page.getByRole("dialog");
  await open
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await open
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "sauna-door-hall-clearance.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(blocked)),
    });
  await expect(open).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  await motion
    .getByRole("button", { name: "Test motion", exact: true })
    .click();
  await expect(
    motion.getByRole("button", { name: /Possible collision · part envelope/ }),
  ).toBeVisible();
  await motion
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(pose).toContainText("Possible contact");
  await expect(pose).toContainText("Hall cabinet");
  expect(Number(await pose.getAttribute("data-pose"))).toBeGreaterThan(40);
  expect(Number(await pose.getAttribute("data-pose"))).toBeLessThan(50);
  await page.screenshot({
    path: info.outputPath("sauna-door-hall-collision.png"),
  });
  await motion
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await motion.getByRole("button", { name: /Focus these parts.*Hall cabinet/ }).click();
  await expect(pose).toContainText("Focused on");
  const canvas = page.locator(".canvas-wrap canvas");
  await expect.poll(async () =>
    (JSON.parse(await canvas.getAttribute("data-rendered-part-ids") ?? "[]") as string[]).sort()
  ).toEqual([closed.id, cabinet.id].sort());
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Fit and test the prehung sauna door",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const saved = projectSchema.parse(await draft(page));
  const response = await page.request.get(`/api/projects/${saved.id}`);
  expect(response.ok()).toBeTruthy();
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.motionPlans).toEqual([plan]);
  expect(reopened.pieces.find((p) => p.id === closed.id)?.position).toEqual(
    closed.position,
  );
});
test("the lined sauna retains editable courses, quote-only bundle sourcing and its guide", async ({
  page,
}, info) => {
  await page.goto("/");
  await openStudies(page);
  await page
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("sauna");
  const study = page.getByRole("dialog");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await study
    .getByRole("combobox", { name: "Study wall and ceiling lining" })
    .selectOption(cedar.materialId);
  await expect(study).toContainText("208 actual editable parts");
  await expect(study).toContainText("remaining interior layer");
  await expect(study.locator(".build-study-preview canvas")).toBeVisible();
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect.poll(async () => (await draft(page))?.pieces.length).toBe(208);
  const original = projectSchema.parse(await draft(page));
  const wallCourse = original.pieces.find((piece) =>
    piece.name.endsWith("front left course 1"),
  )!;
  expect(wallCourse.size).toEqual([22, 3, 0.6875]);
  const members = original.pieces.filter(
    (piece) => piece.material === cedar.materialId,
  );
  expect(members).toHaveLength(160);

  await page.getByRole("button", { name: /^Checks/ }).first().click();
  const summary = page.getByRole("complementary", { name: "Inspector" })
    .locator("summary").filter({ hasText: /^Sauna lining backing$/ });
  const backing = summary.locator("..");
  await summary.click();
  await expect(backing).toContainText("closest gap 0.8125 in");
  await expect(backing.getByRole("link", { name: /Paslode 650282/ })).toHaveAttribute("href", /100122414$/);
  await expect(backing.getByRole("link", { name: /Paslode 515500/ })).toHaveAttribute("href", /303137850$/);
  await page.getByRole("button", { name: /^Review sauna lining backing · Walls/ }).click();
  await expect(page.locator(".part-title h2")).toContainText("rear course 1");

  await page.getByRole("button", { name: "List", exact: true }).click();
  const supplierLink = page.getByRole("link", {
    name: "View at Cedarbrook",
    exact: true,
  });
  await expect(supplierLink).toHaveAttribute("href", cedar.url);
  await expect(
    page.getByText("22 bundles · 160 parts", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".bom-row").filter({ has: supplierLink }))
    .toContainText("Confirm availability with supplier");
  await supplierLink.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("sauna-lining-bundles.png") });

  const purchase = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: /^Sauna lining nails and nailer$/ }),
  });
  await purchase.locator(":scope > summary").click();
  const addBoxes = purchase.getByRole("button", { name: "Add missing nail boxes" });
  await expect(addBoxes).toBeDisabled();
  await purchase.getByRole("spinbutton", { name: "Finish nails needed from new boxes" }).fill("2001");
  await expect(purchase.getByRole("status")).toHaveText("2 boxes needed · 0 on shopping list.");
  await addBoxes.click();
  await expect(purchase.getByRole("status")).toHaveText("2 boxes needed · 2 on shopping list.");
  await expect(addBoxes).toBeDisabled();
  await purchase.getByRole("button", { name: "Add finish nailer to list" }).click();
  await expect(purchase.getByText("Finish nailer on shopping list.")).toBeVisible();

  const nailRow = page.locator(".supply-row").filter({ hasText: /product 100122414/ });
  const supplyPanel = nailRow.locator("xpath=ancestor::details[contains(@class, 'supplies-panel')]");
  if (!(await supplyPanel.evaluate((element: HTMLDetailsElement) => element.open)))
    await supplyPanel.locator(":scope > summary").click();
  await nailRow.getByRole("button", { name: /^Record supply snapshot for Paslode/ }).click();
  const snapshot = page.locator(".supply-snapshot");
  await expect(snapshot.getByLabel("Supply snapshot ZIP")).toHaveValue("84121");
  await snapshot.getByLabel("Supply snapshot price per pack").fill("24.00");
  await snapshot.getByLabel("Supply snapshot available packs").fill("1");
  await snapshot.getByLabel("Supply snapshot store").fill("4409");
  await snapshot.getByRole("button", { name: "Record supply snapshot", exact: true }).click();
  const shoppingFile = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export shopping list", exact: true }).click();
  const shopping = await readFile((await (await shoppingFile).path())!, "utf8");
  expect(shopping).toContain('"100122414","2","2,000-nail box","24.00","48.00"');
  expect(shopping).toContain('"303137850","1","nailer","UNPRICED"');

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .locator(`button.step-part[data-part-id="${wallCourse.id}"]`)
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Retained length", exact: true }),
  ).toHaveValue("22");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("20");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(
    "Dry-fit the cedar lining courses",
  );
  await page.locator(".step-track").getByRole("button", { name: /Dry-fit the cedar lining courses/ }).click();
  await summary.click();
  await expect(backing.getByRole("link", { name: "Cedarbrook finish nail guidance" })).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideFile).path())!, "utf8");
  expect(guide).toContain("## Sauna lining backing");
  expect(guide).toContain("Paslode 650282 galvanized finish nails at Home Depot");
  expect(guide).toContain("User-entered requirement for new boxes: 2001 nails.");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const exported = await exportProject(page);
  expect(exported.project.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(
    exported.project.pieces.find((piece) => piece.id === wallCourse.id)?.size,
  ).toEqual([20, 3, 0.6875]);
  const entry = exported.project.ideaBindings[0].entries[0];
  expect(entry.spec).toMatchObject({
    type: "structure",
    structure: {
      selections: {
        saunaInterior: {
          materialId: cedar.materialId,
          productRegistryRef: cedar.productId,
        },
      },
    },
  });
  expect(
    exported.project.pieces.filter(
      (piece) => piece.offcut && piece.material === cedar.materialId,
    ),
  ).toHaveLength(1);
  const saved = await page.request.get(`/api/projects/${exported.project.id}`);
  expect(saved.ok()).toBeTruthy();
  const reopened = projectSchema.parse((await saved.json()).project);
  expect(reopened.pieces).toEqual(exported.project.pieces);
  expect(reopened.supplies.map(({ productId, quantity }) => ({ productId, quantity }))).toEqual([
    { productId: "paslode-650282", quantity: 2 },
    { productId: "paslode-515500", quantity: 1 },
  ]);
  expect(reopened.supplyInventory).toMatchObject([{ retailerProductId: "100122414", zip: "84121", price: 24, available: 1 }]);
  expect(guideIsCurrent(reopened)).toBeTruthy();
});
for (const study of studies)
  test(`${study.id} opens real editable geometry, supports move/cut, and preserves generated guides through save/import`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator(".statusbar")).toContainText("0 parts");
    await openStudies(page);
    await page
      .getByRole("combobox", { name: "Choose a build study", exact: true })
      .selectOption(study.id);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Design review required");
    await expect(dialog).toContainText(`${study.parts} actual editable parts`);
    await expect(dialog.locator(".build-study-preview canvas")).toBeVisible();
    if (study.id === "greenhouse")
      await expect(dialog).toContainText("wall plate height");
    if (study.id === "sauna")
      await expect(dialog).toContainText(/No heater, guard, sensor/);
    await dialog.locator(".build-study-preview").screenshot({
      path: `test-results/build-studies/${study.id}-preview.png`,
    });
    await page
      .getByRole("button", { name: "Open as new project", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: study.title, exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await draft(page))?.pieces.length)
      .toBe(study.parts);
    const original = projectSchema.parse(await draft(page));
    if (study.id === "sauna")
      expect(
        original.pieces.some((p) => /heater|wiring|sauna lining/i.test(p.name)),
      ).toBe(false);
    if (study.id === "greenhouse")
      expect(
        original.pieces.filter((p) => p.cutPlanes.length > 0).length,
      ).toBeGreaterThan(5);
    await page.getByRole("button", { name: "Guide", exact: true }).click();
    const part = study.profile
      ? original.pieces.find(
          (piece) => piece.name === "Greenhouse roof · plumb-cut rafter",
        )
      : original.pieces[0];
    expect(part).toBeDefined();
    await page.locator(`button.step-part[data-part-id="${part!.id}"]`).click();
    const x = page.getByRole("spinbutton", { name: "X", exact: true });
    // Place past the right edge of the entire assembly so the exact-position
    // test remains valid when neighboring wood blocks moves within the model.
    const assemblyRight = Math.max(
      ...original.pieces.map((piece) => bounds(piece).max[0]),
    );
    const leftFromCenter = part!.position[0] - bounds(part!).min[0];
    const destination = Math.ceil(assemblyRight + leftFromCenter + 2);
    await x.fill(String(destination));
    await x.press("Tab");
    await expect(x).toHaveValue(String(destination));
    await expect
      .poll(
        async () =>
          (await draft(page))?.pieces.find((piece) => piece.id === part!.id)
            ?.position[0],
      )
      .toBe(destination);
    await page.getByRole("button", { name: "Cut part", exact: true }).click();
    const length = page.getByRole("spinbutton", {
        name: "Retained length",
        exact: true,
      }),
      beforeLength = Number(await length.inputValue());
    await length.fill(String(Number((beforeLength / 2).toFixed(3))));
    await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
    await expect(page.locator(".statusbar")).toContainText("1 offcuts");
    await page
      .getByRole("button", { name: "Generate build guide", exact: true })
      .first()
      .click();
    await expect(page.locator(".step-track")).toContainText(
      "Prepare the space",
    );
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Saved to library", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const p = await draft(page);
        return p ? guideIsCurrent(projectSchema.parse(p)) : false;
      })
      .toBe(true);
    const saved = projectSchema.parse(await draft(page));
    const response = await page.request.get(`/api/projects/${saved.id}`);
    expect(response.ok()).toBe(true);
    const record = await response.json();
    expect(record.project.pieces).toEqual(saved.pieces);
    expect(record.project.sections).toEqual(saved.sections);
    expect(guideIsCurrent(projectSchema.parse(record.project))).toBe(true);
    const output = await exportProject(page);
    expect(output.project.pieces.filter((p) => p.offcut).length).toBe(1);
    expect(guideIsCurrent(output.project)).toBe(true);
    if (study.profile)
      expect(output.project.pieces.some((p) => p.cutPlanes.length > 0)).toBe(
        true,
      );
    await page
      .getByRole("button", { name: "Import a plan", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: `${study.id}-edited.json`,
      mimeType: "application/json",
      buffer: Buffer.from(output.text),
    });
    await expect(
      page.getByRole("heading", {
        name: `${study.title} · imported`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".step-track")).toContainText(
      "Prepare the space",
    );
    await expect
      .poll(async () => (await draft(page))?.name)
      .toBe(`${study.title} · imported`);
    const imported = projectSchema.parse(await draft(page));
    expect(imported.id).not.toBe(saved.id);
    expect(imported.pieces).toEqual(output.project.pieces);
    expect(imported.sections).toEqual(output.project.sections);
    expect(imported.steps).toEqual(output.project.steps);
    expect(guideIsCurrent(imported)).toBe(true);
    expect(errors).toEqual([]);
  });

test("saved examples open as editable copies with current guides and downloadable files", async ({
  page,
}) => {
  await page.goto("/");
  await addFramingLumber(page);
  await expect.poll(async () => (await draft(page))?.pieces.length).toBe(1);

  for (const study of studies) {
    const previous = projectSchema.parse(await draft(page));
    await openStudies(page);
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Choose a build study" })
      .selectOption(study.id);
    await dialog
      .getByText("Saved example and downloads", { exact: true })
      .click();
    const files = [
      ["Editable project", ".yardwork.json"],
      ["Build guide", ".md"],
      ["Stock CSV", ".csv"],
      ["Shopping checklist", "-shopping.txt"],
    ];
    const [editable] = await Promise.all(
      files.map(async ([label, suffix]) => {
        const url = `/examples/builds/${study.id}${suffix}`;
        await expect(
          dialog.getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("href", url);
        const response = await page.request.get(url);
        expect(response.ok()).toBeTruthy();
        expect((await response.body()).length).toBeGreaterThan(0);
        return response;
      }),
    );
    const saved = projectSchema.parse(await editable.json());
    const open = dialog.getByRole("button", {
      name: "Open saved example",
      exact: true,
    });
    await expect(open).toBeDisabled();
    await dialog
      .getByRole("checkbox", {
        name: "Replace current workspace with this study",
      })
      .check();
    await open.click();
    const name = `${saved.name} · example copy`;
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect.poll(async () => (await draft(page))?.name).toBe(name);
    const copy = projectSchema.parse(await draft(page));
    expect(copy.id).not.toBe(saved.id);
    expect(copy.pieces).toEqual(saved.pieces);
    expect(copy.supplies).toEqual(saved.supplies);
    expect(guideIsCurrent(copy)).toBe(true);
    const previousId = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw && JSON.parse(raw).project.id;
    }, PREVIOUS_DRAFT_KEY);
    expect(previousId).toBe(previous.id);
  }
});

test("whole-build replacement is acknowledged and the unsaved project remains recoverable", async ({
  page,
}) => {
  await page.goto("/");
  await addFramingLumber(page);
  await expect.poll(async () => (await draft(page))?.pieces.length).toBe(1);
  const original = projectSchema.parse(await draft(page));
  await openStudies(page);
  const open = page.getByRole("button", {
    name: "Open as new project",
    exact: true,
  });
  await expect(open).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Replace current workspace with this study",
      exact: true,
    })
    .check();
  await expect(open).toBeEnabled();
  await open.click();
  await expect(page.locator(".statusbar")).toContainText("42 parts");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("button", { name: /Open earlier browser draft/ })
    .click();
  await expect(page.locator(".statusbar")).toContainText("1 parts");
  await expect.poll(async () => (await draft(page))?.id).toBe(original.id);
  expect((await draft(page))?.pieces).toEqual(original.pieces);
});

test("study units are independent and impossible greenhouse openings remain a review error", async ({
  page,
}) => {
  await page.goto("/");
  await openStudies(page);
  await page
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("greenhouse");
  await page
    .getByRole("combobox", { name: "Outside width units", exact: true })
    .selectOption("in");
  await page
    .getByRole("spinbutton", { name: "Study outside width", exact: true })
    .fill("84");
  await expect(
    page.getByRole("combobox", { name: "Outside depth units", exact: true }),
  ).toHaveValue("ft");
  await expect(
    page.getByRole("spinbutton", { name: "Study outside depth", exact: true }),
  ).toHaveValue("8");
  await page
    .getByRole("spinbutton", { name: "Study outside eave height", exact: true })
    .fill("5");
  await expect(page.getByRole("alert")).toContainText(/door does not fit/);
  await expect(
    page.getByRole("button", { name: "Open as new project", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("0 parts");
});

for (const [family, plannedSupports, productId, packs, spare] of [
  ["shelves", 12, "everbilt-802064", 2, 4],
  ["closet-insert", 16, "everbilt-802424", 1, 8],
] as const) {
  test(`${family} carries its chosen angled shelf support packs from study to Home Depot handoff`, async ({ page }) => {
    const source = everbiltAngleShelfPins[productId];
    await page.goto("/");
    await openStudies(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Choose a build study" }).selectOption(family);
    const setup = dialog.getByRole("checkbox", { name: "Plan supports for all adjustable shelves" });
    await expect(setup).not.toBeChecked();
    await setup.check();
    const status = dialog.getByRole("status").filter({ hasText: "planned supports" });
    await expect(status).toContainText(`${plannedSupports} planned supports · 1 pack`);
    await expect(status.getByRole("link", { name: /Everbilt 802404/ })).toHaveAttribute(
      "href",
      everbiltShelfPin.url,
    );
    const variant = dialog.getByRole("combobox", { name: "Shelf support pack", exact: true });
    await variant.selectOption(productId);
    const model = productId.slice("everbilt-".length);
    await expect(status).toContainText(`${plannedSupports} planned supports · ${packs} ${packs === 1 ? "pack" : "packs"}`);
    await expect(status).toContainText(`${spare} spare`);
    await expect(status.getByRole("link", { name: new RegExp(model) })).toHaveAttribute("href", source.url);
    const rear = dialog.getByRole("spinbutton", { name: "Rear support inset" });
    const open = dialog.getByRole("button", { name: "Open as new project" });
    await rear.fill("30");
    await expect(dialog.getByRole("alert")).toContainText("Adjust the support layout");
    await expect(open).toBeDisabled();
    await rear.fill("2.5");
    await expect(status).toContainText(`${plannedSupports} planned supports`);
    await expect(open).toBeEnabled();
    await open.click();
    await expect.poll(async () => (await draft(page))?.attachmentPlans[0]?.points.length).toBe(plannedSupports);
    const project = projectSchema.parse(await draft(page));
    expect(project.attachmentPlans[0].productId).toBe(productId);
    expect(project.attachmentPlans[0].layout.rearInset).toBe(2.5);
    expect(project.attachmentPlans[0].measurements.bearingOffset).toBeNull();
    expect(project.supplies).toHaveLength(0);
    expect(guideIsCurrent(project)).toBe(true);
    await expect(page.locator(".step-track")).toContainText("Prepare the space");
    const exported = await exportProject(page);
    expect(exported.project.attachmentPlans).toEqual(project.attachmentPlans);
    expect(guideIsCurrent(exported.project)).toBe(true);

    await page.getByRole("button", { name: "List", exact: true }).click();
    const handoff = page.getByRole("button", { name: "Prepare Home Depot list", exact: true });
    await handoff.click();
    await dialog.getByRole("button", { name: new RegExp(`^Add ${packs} .* of Everbilt ${model}`) }).click();
    const purchases = dialog.getByRole("list", { name: "Home Depot purchase review", exact: true });
    const row = purchases.getByRole("listitem").filter({ hasText: model });
    await expect(row.getByRole("link")).toHaveAttribute("href", source.url);
    await expect(row).toContainText(`#${source.internetNumber}`);
    await expect(row).toContainText("No recent store snapshot");
    await expect(dialog.getByRole("button", { name: new RegExp(`^Add .* of Everbilt ${model}`) })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

    const supplyPanel = page.locator(".supplies-panel");
    if (!(await supplyPanel.evaluate((element: HTMLDetailsElement) => element.open)))
      await supplyPanel.locator(":scope > summary").click();
    const supplyRow = supplyPanel.locator(".supply-row").filter({ hasText: model });
    await supplyRow.getByRole("button", { name: new RegExp(`^Record supply snapshot for Everbilt ${model}`) }).click();
    const snapshot = page.locator(".supply-snapshot");
    await expect(snapshot.getByRole("textbox", { name: "Supply snapshot URL" })).toHaveValue(source.url);
    await expect(snapshot.getByRole("textbox", { name: "Supply snapshot ZIP" })).toHaveValue("84121");
    await snapshot.getByRole("spinbutton", { name: "Supply snapshot price per pack" }).fill("4.25");
    await snapshot.getByRole("spinbutton", { name: "Supply snapshot available packs" }).fill(String(packs - 1));
    await snapshot.getByRole("textbox", { name: "Supply snapshot store" }).fill("4409");
    await snapshot.getByRole("button", { name: "Record supply snapshot", exact: true }).click();
    await handoff.click();
    await expect(row).toContainText("Short by 1 in snapshot");
    await expect(dialog.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(new RegExp(`#${source.internetNumber}`));
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    const bought = (await exportProject(page)).project;
    expect(bought.supplies.map(({ productId, quantity }) => ({ productId, quantity }))).toEqual([{ productId, quantity: packs }]);
    expect(bought.supplyInventory[0].retailerProductId).toBe(source.internetNumber);
    expect(bought.pieces).toEqual(project.pieces);
  });
}

test("shelf study previews a stock-safe width and opens with the resulting back cut", async ({
  page,
}) => {
  await page.goto("/");
  await openStudies(page);
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Choose a build study" })
    .selectOption("shelves");
  await dialog.locator(".study-material-selection summary").click();
  await dialog
    .getByRole("combobox", { name: "Study panel stock" })
    .selectOption("plytanium-703");
  await dialog
    .getByRole("combobox", { name: "Outside width units" })
    .selectOption("in");
  const width = dialog.getByRole("spinbutton", { name: "Study outside width" });
  await width.fill("48");
  await expect(
    dialog.getByText(/4 ft back panel exceeds the 47\.938 in sheet width/),
  ).toBeVisible();
  await width.fill("47.875");
  const trim = dialog.getByText(
    /47\.875 in back panel leaves less than the 0\.125 in saw kerf/,
  );
  await expect(trim).toBeVisible();
  await dialog
    .getByRole("button", { name: "Set outside width to 47.75 in" })
    .click();
  await expect(width).toHaveValue("47.75");
  await expect(trim).toHaveCount(0);
  await dialog.getByRole("button", { name: "Open as new project" }).click();
  await expect
    .poll(async () =>
      (await draft(page))?.pieces.find((piece) => piece.name === "Back · panel")?.size,
    )
    .toEqual([47.75, 72, 0.703]);
});

test("source-matched study choices preview actual glazing and rods and generate exact casework thickness", async ({
  page,
}) => {
  await page.goto("/");
  await openStudies(page);
  const dialog = page.getByRole("dialog"),
    chooser = page.getByRole("combobox", {
      name: "Choose a build study",
      exact: true,
    });
  await chooser.selectOption("shelves");
  await dialog.locator(".study-material-selection summary").click();
  await page
    .getByRole("combobox", { name: "Study panel stock", exact: true })
    .selectOption("plytanium-703");
  await expect(dialog).toContainText(".703-inch actual design thickness");
  await expect(dialog).toContainText("8 actual editable parts");
  await chooser.selectOption("greenhouse");
  await page
    .getByRole("combobox", { name: "Study greenhouse glazing", exact: true })
    .selectOption("sunlite-8mm");
  await expect(dialog).toContainText("101 actual editable parts");
  await expect(dialog).toContainText("no system allowance deductions");
  await expect(dialog.locator(".build-study-preview canvas")).toBeVisible();
  await dialog.locator(".build-study-preview").screenshot({
    path: "test-results/build-studies/source-sunlite-preview.png",
  });
  await chooser.selectOption("closet-insert");
  await page
    .getByRole("combobox", { name: "Study panel stock", exact: true })
    .selectOption("plytanium-703");
  await page
    .getByRole("combobox", { name: "Study closet hanging rods", exact: true })
    .selectOption("closet-rod-72");
  await expect(dialog).toContainText("12 actual editable parts");
  await expect(dialog).toContainText("Socket engagement/end deductions");
  await expect(dialog).toContainText("Design review required");
  await page
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect.poll(async () => (await draft(page))?.pieces.length).toBe(12);
  const output = await exportProject(page),
    rods = output.project.pieces.filter((p) => p.material === "closet-rod-72"),
    panels = output.project.pieces.filter(
      (p) => p.material === "plytanium-703",
    );
  expect(rods).toHaveLength(2);
  expect(panels).toHaveLength(10);
  expect(rods.every((p) => p.size[0] === 1.3125 && p.size[2] === 1.3125)).toBe(
    true,
  );
  expect(panels.every((p) => Math.min(...p.size) === 0.703)).toBe(true);
  expect(output.project.notes).toContain("Socket engagement");
  expect(output.project.notes).toContain("32 inches");
});
