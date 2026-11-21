import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreWorkshopArchive } from "../../server/workshopArchive";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { drawerSlideReference } from "../../src/drawerSlideReference";
import { applyCommand, blank, part } from "../../src/model";
import { saveFastenerPlan, suggestCenteredFastener } from "../../src/fastenings";
import { saveWoodJointDecision } from "../../src/woodJointDecisions";
import { bounds, cutPiece } from "../../src/engine";
import { editRoundOpening } from "../../src/throughOpeningCuts";
import { homeDepotShoppingList } from "../../src/handoff";
import { homeDepotFraming } from "../../src/homeDepotFramingReference";
import { pureBondCasework } from "../../src/homeDepotCaseworkReference";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { saveMotionPlan, saveMotionTestScenario } from "../../src/mechanismMotion";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { partLabel } from "../../src/partLabels";
import { addSupply } from "../../src/supplies";

test("the hosted workshop plans locally, saves revisions and exports a restorable archive", async ({ page }) => {
  const backendRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) backendRequests.push(request.url());
  });
  await page.goto("./");
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Describe your idea", exact: true }).fill(
    "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back",
  );
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.locator(".idea-proposal .planner-module")).toHaveCount(3);
  await page.getByRole("button", { name: "Add proposed layout", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("42 parts");
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  const save = page.getByRole("button", { name: "Save project", exact: true });
  await save.click();
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const id = (await readDraft()).project.id;
  await page.getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true }).click();
  await save.click();
  await expect.poll(async () => (await readDraft()).revision).toBe(2);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your workshop.", exact: true });
  await expect(dialog).toContainText("Projects and drafts are saved in this browser");
  await expect(dialog.locator(".project-list")).toContainText("43 parts");
  const waiting = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download workshop backup" }).click();
  const file = (await (await waiting).path())!;
  const temporary = await mkdtemp(join(tmpdir(), "yardwork-browser-archive-"));
  try {
    const destination = join(temporary, "restored");
    await restoreWorkshopArchive(file, destination);
    const saved = JSON.parse(await readFile(join(destination, `${id}.json`), "utf8"));
    const earlier = JSON.parse(await readFile(join(destination, ".revisions", id, "1.json"), "utf8"));
    expect(saved.revision).toBe(2);
    expect(saved.project.pieces).toHaveLength(43);
    expect(earlier.project.pieces).toHaveLength(42);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  await dialog.getByText("Earlier saves · 1", { exact: true }).click();
  await dialog.getByRole("button", { name: /Open revision 1 of .* as a copy/ }).click();
  await expect(page.locator(".statusbar")).toContainText("42 parts");
  await expect.poll(async () => (await readDraft()).project.id).not.toBe(id);
  expect(backendRequests).toEqual([]);
});

test("saved studies open under the hosted base path", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: "Explore whole builds", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Saved example and downloads", { exact: true }).click();
  const editable = dialog.getByRole("link", { name: "Editable project", exact: true });
  await expect(editable).toHaveAttribute("href", /\/yardwork\/examples\/builds\/storage-banquette\.yardwork\.json$/);
  await dialog.getByRole("button", { name: "Open saved example", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Three-section storage banquette · example copy", exact: true })).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("42 parts");
});

test("a joint question finds actual parts, previews a direction and reopens its saved plan", async ({ page }) => {
  const project = blank("Named casework joints");
  const step = project.steps[0].id;
  const front = part("Front panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const rail = part("Front rail", "stud", [1.5, 4, 2], [0.5, 4, -1.3515], step, "Casework");
  project.pieces.push(front, rail);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "casework-joints.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const ask = async (request: string) => {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Describe your idea" }).fill(request);
    await page.getByRole("button", { name: "Explore idea", exact: true }).click();
    return page.getByRole("region", { name: "Workspace joint review" });
  };
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  const result = await ask("How can I attach the Front panel to the Front rail?");
  await expect(result).toContainText("P001 · Front panel → P002 · Front rail");
  await expect(result).toContainText("Wood faces meet · 0 in gap.");
  expect((await draft()).project.fastenerPlans).toEqual([]);
  await result.getByRole("button", { name: "Compare screw entry sides", exact: true }).click();
  const editor = page.getByRole("region", { name: "Wood fastener plans" });
  const comparison = editor.getByRole("region", { name: "Screw entry comparison" });
  await expect(comparison).toBeVisible();
  await comparison.getByRole("button", { name: "Preview from P001", exact: true }).click();
  await expect(page.getByTestId("fastener-centered-entry-marker")).toHaveCount(1);
  await editor.getByRole("button", { name: "Use centered entry", exact: true }).click();
  await expect.poll(async () => (await draft()).project.fastenerPlans.length).toBe(1);
  const plan = (await draft()).project.fastenerPlans[0];
  expect(plan.head.pieceId).toBe(front.id);
  expect(plan.receiver.pieceId).toBe(rail.id);
  expect(plan.measurements.surfaceToTipDepth).toBeNull();
  expect((await draft()).project.supplies).toEqual([]);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").locator(".project-list > button").filter({ hasText: "Named casework joints" }).click();
  const neighbors = await ask("What can I screw P002 to?");
  await expect(neighbors).toContainText("P002 · Front rail → P001 · Front panel");
  await neighbors.getByRole("button", { name: `Open screw plan ${plan.label}`, exact: true }).click();
  await expect(editor.locator(`[data-fastener-plan-id="${plan.id}"]`)).toBeVisible();
  expect((await draft()).project.fastenerPlans).toEqual([plan]);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Centered entry chosen after comparing both sides");
});

test("questions about a build open its support check, saved motion and measured scrap cuts", async ({ page }) => {
  const start = blank("Questions for the current build");
  const step = start.steps[0].id;
  const seat = { ...part("Seat lid", "plytanium-703", [24, 0.703, 12], [0, 4.3515, 0], step, "Seat"), designRole: "seat-lid" };
  const rail = part("Unsupported seat rail", "stud", [3, 2, 8], [6, 3, 0], step, "Seat");
  const drawer = part("Pull-out drawer", "plywood", [1, 2, 1], [41, 10, -8], step, "Cabinet");
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [42, 10, 0], step, "Cabinet");
  const filler = part("Filler blank", "stud", [3.5, 1.5, 12], [48, 0.75, 18], step, "Cabinet");
  const stock = addMeasuredOffcut({ ...start, pieces: [seat, rail, drawer, door, filler] }, step, "stud", [20, 3.5, 1.5], "Bench scrap");
  const slide = saveMotionPlan(stock, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const swing = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [36, 10, 0], travel: 90 },
  });
  const { project } = saveMotionTestScenario(swing.project, slide.plan.id, "Limited opening", {
    linkedId: swing.plan.id, held: [], openingOrder: "companion-first",
    sequenceTargets: { selected: { kind: "slide", travel: 12.5 }, companion: { kind: "hinge", travel: 75 } },
  });
  const plannerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/planner") plannerRequests.push(request.url());
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "build-questions.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.project.name).toBe(`${start.name} · imported`);
  const before = (await draft()).project;
  const beginQuestion = () => page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const ask = async (prompt: string) => {
    await beginQuestion();
    await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill(prompt);
    await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  };
  await beginQuestion();
  await dialog.getByText("Questions about this build", { exact: true }).click();
  await dialog.getByRole("button", { name: "Review weak spots", exact: true }).click();
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const support = dialog.getByRole("region", { name: "Support and connection review", exact: true });
  const firstConcern = support.getByRole("article").first();
  await expect(firstConcern).toContainText("Seat support to floor");
  await expect(firstConcern).toContainText("Unsupported seat rail");
  await firstConcern.getByRole("button", { name: "Inspect this check", exact: true }).click();
  await expect(page.getByTestId("panel-floor-bearing-marker")).toContainText("Contacts to review");
  await page.getByRole("button", { name: "Hide highlighted area", exact: true }).click();

  await ask("Can the drawer open?");
  const motion = dialog.getByRole("region", { name: "Modeled motion review", exact: true });
  await expect(motion.getByRole("article", { name: "Motion alone", exact: true })).toContainText("Obstruction · Cabinet door");
  const limited = motion.getByRole("article", { name: "Limited opening", exact: true });
  await expect(limited).toContainText("No modeled clearance findings");
  await expect(limited).toContainText("Cabinet door at 75°, then Pull-out drawer at 12.5 in");
  await limited.getByRole("button", { name: "Inspect this motion", exact: true }).click();
  const movement = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await movement.getByRole("button", { name: "Inspect test endpoint", exact: true }).click();
  await expect(page.getByTestId("motion-preview-label")).toContainText("Pull-out drawer · 12.5 in");

  await ask("What can I use O001 for?");
  const scrap = dialog.getByRole("region", { name: "Offcut matches", exact: true });
  await expect(scrap).toContainText("Filler blank");
  await expect(scrap).toContainText("O001 · Offcut · Bench scrap");
  expect((await draft()).project).toEqual(before);
  expect(plannerRequests).toEqual([]);
  await scrap.getByRole("button", { name: "Review cuts and stock to buy", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Proposed cuts in order", exact: true })).toContainText("Filler blank");
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await expect.poll(async () => (await draft()).project.pieces.find((piece: { id: string }) => piece.id === filler.id)?.cutStock).toBeTruthy();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await download).path())!, "utf8");
  expect(markdown).toMatch(/Recorded offcut cut order[\s\S]*Filler blank/);
});

test("build preparation opens the other touching pair when the first screw path is reviewed", async ({ page }) => {
  const project = blank("Casework contact review");
  const step = project.steps[0].id;
  const panel = part("Face panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const left = part("Left rail", "stud", [1.5, 4, 2], [-3, 4, -1.3515], step, "Casework");
  const right = part("Right rail", "stud", [1.5, 4, 2], [3, 4, -1.3515], step, "Casework");
  project.pieces.push(panel, left, right);
  const { plan } = suggestCenteredFastener(project, panel.id, left.id);
  const fixture = saveFastenerPlan(project, {
    ...plan,
    measurements: {
      ...plan.measurements,
      surfaceToTipDepth: 1.25,
      measuredAt: "2026-01-01T00:00:00.000Z",
      basis: "Synthetic browser fixture",
    },
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "casework-contact-review.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const contacts = page.getByRole("region", { name: "Build preparation" })
    .locator("details.preparation-group").filter({ hasText: "Modeled wood contacts" });
  await contacts.locator(":scope > summary").click();
  await expect(contacts).toContainText("Right rail");
  await expect(contacts).not.toContainText("Left rail");
  await contacts.getByRole("button", { name: /Face panel.*Right rail/ }).click();
  const selected = page.getByRole("region", { name: "Selected wood contact" });
  await expect(selected).toContainText("Retained faces meet · 0 in gap.");
  await expect(selected.getByRole("button", { name: "Inspect P003", exact: true })).toBeVisible();
  await selected.getByRole("button", { name: "Compare screw entry sides", exact: true }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  await expect(fasteners.getByRole("combobox", { name: "Fastener receiving member" })).toHaveValue(right.id);
  await expect(fasteners.getByRole("region", { name: "Screw entry comparison" })).toBeVisible();
  await fasteners.getByRole("button", { name: "Back to connections", exact: true }).click();
  await page.getByRole("button", { name: "Back to build preparation", exact: true }).click();
  await expect(contacts).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  const section = guide.split("### Modeled wood contacts")[1].split("### Shopping and availability")[0];
  expect(section).toContain("P001 · Face panel ↔ P003 · Right rail");
  expect(section).not.toContain("Left rail");
});

test("glue and measured trim seams follow actual parts into the saved project, cartridge order and both guides", async ({ page }) => {
  const project = blank("Casework joint details");
  const step = project.steps[0].id;
  const panel = part("Front panel", "plytanium-703", [14, 10, 0.703], [2, 6, 0], step, "Casework");
  const rail = part("Glue rail", "stud", [1.5, 4, 2], [-3, 4, -1.3515], step, "Casework");
  const trim = part("Seam rail", "stud", [1.5, 4, 2], [3, 4, -1.414], step, "Casework");
  project.pieces.push(panel, rail, trim);
  const cut = cutPiece(project, panel.id, 10, 0);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "older-casework.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...cut, schemaVersion: 81 })),
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  async function openPair(label: string, kind = "screw joint") {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Describe your idea" }).fill(`Review ${kind} between P001 and ${label}`);
    await page.getByRole("button", { name: "Explore idea", exact: true }).click();
    await page.getByRole("region", { name: "Workspace joint review" }).getByRole("button", { name: "Inspect joint", exact: true }).click();
    return page.getByRole("region", { name: "Selected wood contact" });
  }

  const glue = await openPair("P002");
  await glue.getByText("Record joint detail", { exact: true }).click();
  await glue.getByLabel("Joint method").selectOption("glue");
  await glue.getByLabel("Joint detail for the guide").fill("Dry-fit with the selected clamps.");
  await glue.getByRole("button", { name: "Save joint detail", exact: true }).click();
  await expect(glue.getByRole("status")).toContainText("Glue joint · Saved");

  const seam = await openPair("P003", "trim seam");
  await expect(seam).toContainText("0.0625 in gap");
  await seam.getByText("Record joint detail", { exact: true }).click();
  await expect(seam.getByLabel("Joint method").locator("option")).toHaveText([
    "Choose a joint method", "Seal exposed seam",
  ]);
  await seam.getByLabel("Joint method").selectOption("sealant");
  await seam.getByLabel("Joint detail for the guide").fill("Seal the exposed front edge only.");
  await seam.getByRole("button", { name: "Save joint detail", exact: true }).click();
  await expect(seam.getByRole("status")).toContainText("Seal exposed seam · Saved");

  await seam.getByText("Plan trim sealant", { exact: true }).click();
  const edge = seam.getByRole("listitem").filter({ hasText: /Edge \d · 4 in/ }).first();
  await edge.getByRole("button", { name: /Show edge.*in 3D/ }).click();
  await expect(page.getByTestId("trim-seam-marker")).toContainText("4 in");
  await edge.getByRole("checkbox").check();
  await seam.getByLabel("Measured bead width (in)").fill("0.125");
  await seam.getByLabel("Measured bead depth (in)").fill("0.125");
  await seam.getByRole("button", { name: "Save measured seam" }).click();
  await expect(seam.getByText(/Trim sealant · Edge \d \(4 in\)/)).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByText("Estimate trim sealant", { exact: true }).click();
  const measured = page.getByRole("region", { name: "Measured trim seams" });
  await expect(measured).toContainText("4 in across 1 joint · 1 planned cartridge");
  await measured.getByRole("button", { name: "Add missing seam cartridge" }).click();
  await expect(measured).toContainText("1 in List");
  await expect(measured.getByRole("button", { name: "Add missing seam cartridge" })).toHaveCount(0);

  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  const saved = (await draft()).project;
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.woodJointDecisions.map(({ method }: { method: string }) => method)).toEqual(["glue", "sealant"]);
  expect(saved.fastenerPlans).toEqual([]);
  expect(saved.woodJointDecisions[1].trimSeam).toMatchObject({ gapWidth: 0.125, gapDepth: 0.125 });
  expect(saved.supplies).toMatchObject([{ productId: "dap-dynaflex-230-white-101", quantity: 1 }]);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").locator(".project-list > button").filter({ hasText: "Casework joint details" }).click();
  await expect(await openPair("P002")).toContainText("Dry-fit with the selected clamps.");
  await expect(await openPair("P003", "trim seam")).toContainText("4 in of dry interior trim seams");
  expect((await draft()).project.woodJointDecisions).toEqual(saved.woodJointDecisions);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Recorded wood joint details");
  expect(guide).toContain("Seal the exposed front edge only.");
  expect(guide).toContain("4 in of dry interior trim seams");
  expect(guide).toContain("Test the finish on offcut O001 from the same stock in Cut pool.");
  await expect(page.locator(".print-guide .wood-joint-details-print")).toContainText("Dry-fit with the selected clamps.");
  await expect(page.locator(".print-guide .wood-joint-details-print")).toContainText("4 in of dry interior trim seams");
});

test("a crosscut practice plan reuses the first scrap on two blanks", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  const example = page.getByRole("link", { name: "Download crosscut practice plan" });
  const href = await example.getAttribute("href");
  expect(href).toMatch(/\/yardwork\/examples\/cut-pool\/crosscut-practice\.yardwork\.json$/);
  const file = await page.request.get(href!);
  expect(file.ok()).toBe(true);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "crosscut-practice.yardwork.json", mimeType: "application/json", buffer: await file.body(),
  });
  await expect(dialog).toHaveCount(0);
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  if (!(await pool.isVisible())) await page.getByRole("button", { name: "Cut pool (1)", exact: true }).click();
  await pool.getByRole("button", { name: "Review offcut reuse" }).click();
  const cuts = dialog.getByRole("list", { name: "Proposed cuts in order" }).getByRole("listitem");
  await expect(cuts).toHaveCount(2);
  await expect(cuts.nth(0)).toContainText("Jig setup blank");
  await expect(cuts.nth(1)).toContainText("From an earlier cut");
  await expect(cuts.nth(1)).toContainText("Finish test blank");
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("2 → 1 board");
  await dialog.getByRole("button", { name: "Apply offcut plan" }).click();
  await expect(pool).toContainText("29.625");
});

test("trim sealant estimates save the measured takeoff and the exact Home Depot cartridge", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "List", exact: true }).click();
  const title = page.getByText("Estimate trim sealant", { exact: true });
  await title.click();
  const fields = page.locator("details").filter({ has: title });
  await fields.getByLabel("Total seam length").fill("720");
  await fields.getByLabel("Length unit").selectOption("in");
  await fields.getByLabel("Widest gap (in)").fill("0.25");
  await fields.getByLabel("Deepest gap (in)").fill("0.125");
  await fields.getByLabel("Coverage basis").selectOption("dap");
  const preview = fields.getByRole("button", { name: "Preview cartridge estimate" });
  await preview.click();
  await expect(fields.getByRole("alert")).toContainText("Use coverage from a trial");
  await fields.getByLabel("Widest gap (in)").fill("0.125");
  await preview.click();
  await fields.getByRole("button", { name: "Add 2 cartridges", exact: true }).click();
  await expect(fields.getByRole("status")).toContainText("Added 2 cartridges");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  expect((await readDraft()).project.supplies[0]).toMatchObject({
    productId: "dap-dynaflex-230-white-101", quantity: 2,
    note: expect.stringContaining("60 ft of dry interior trim seams"),
  });
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").locator(".project-list > button").filter({ hasText: "Untitled project" }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list" }).click();
  await expect(page.getByRole("dialog").getByRole("listitem").filter({ hasText: /#100035980/ }))
    .toContainText("2 cartridges");
});

test("wood glue takeoff shows modeled contact and saves a confirmed bottle estimate", async ({ page }) => {
  const project = blank("Wood glue takeoff");
  const step = project.steps[0].id;
  const panel = part("Front panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const rail = part("Glue rail", "stud", [1.5, 4, 2], [-3, 4, -1.3515], step, "Casework");
  project.pieces.push(panel, rail);
  const withJoint = saveWoodJointDecision(project, panel.id, rail.id, "glue", "Dry-fit before using glue.");

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "wood-glue.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(withJoint)),
  });
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "List", exact: true }).click();
  const title = page.getByText("Estimate wood glue", { exact: true });
  await title.click();
  const fields = page.locator("details.field-section").filter({ has: title });
  await expect(fields.getByRole("listitem").filter({ hasText: "Glue rail" })).toContainText("6 sq in");
  await fields.getByLabel("Total area to coat").fill("30");
  await fields.getByLabel("Area unit").selectOption("ft");
  await fields.getByLabel("Extra glue (%)").fill("10");
  const preview = fields.getByRole("button", { name: "Preview bottle estimate" });
  await preview.click();
  await fields.getByRole("button", { name: "Add 2 bottles", exact: true }).click();
  await expect(fields.getByRole("status")).toContainText("Saved 2 bottles");
  await fields.getByLabel("Extra glue (%)").fill("0");
  await preview.click();
  await fields.getByRole("button", { name: "Replace estimate with 1 bottle", exact: true }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  expect((await readDraft()).project.supplies).toEqual([expect.objectContaining({
    productId: "titebond-iii-1414", quantity: 1,
    note: expect.stringContaining("4,320 sq in confirmed coated area"),
  })]);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Wood glue takeoff" }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list" }).click();
  await expect(dialog.getByRole("listitem").filter({ hasText: /#100522343/ })).toContainText("1 bottle");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("4,320 sq in confirmed coated area");
  expect(guide).toContain("Dry-fit before using glue.");
});

test("relative wording revises one applied section and exports the resized build", async ({ page }) => {
  const original = applyIdeaPlan(blank("Relative revision"), localIdeaPlan({
    prompt: "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back",
  }));
  const binding = original.ideaBindings[0];
  const unrelated = part("Spare board", "one-four", [0.75, 12, 3.5], [60, 8, 0], original.steps[0].id, "Loose stock");
  original.pieces.push(unrelated);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "relative-revision.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: `Revise design ${binding.title}`, exact: true }).click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Make section 2 two inches taller");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  for (const [seat, height] of [[1, 18], [2, 20], [3, 18]]) {
    await expect(dialog.getByRole("spinbutton", {
      name: `Banquette section ${seat} height`, exact: true,
    })).toHaveValue(String(height));
  }
  await dialog.getByRole("button", { name: "Apply design changes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved: typeof original = (await readDraft()).project;
  expect(saved.ideaBindings).toHaveLength(1);
  expect(saved.ideaBindings[0].entries.map(({ id }) => id)).toEqual(binding.entries.map(({ id }) => id));
  expect(saved.pieces.find(({ id }) => id === unrelated.id)?.size).toEqual(unrelated.size);
  for (const [i, entry] of binding.entries.entries()) {
    const ids = saved.sections.find(({ id }) => id === entry.sections[0].sectionId)!.pieceIds;
    const top = Math.max(...saved.pieces.filter(({ id }) => ids.includes(id)).map((piece) => bounds(piece).max[1]));
    expect(top).toBeCloseTo(i === 1 ? 20 : 18, 4);
  }

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Seat heights: 18, 20 in/);
  expect(guide).toContain("Cut");
});

test("a drawer can pass without touching and still fail a saved minimum gap test", async ({ page }) => {
  const project = blank("Cabinet lip clearance");
  const step = project.steps[0].id;
  const drawer = part("Drawer front", "plywood", [4, 2, 2], [0, 4, 0], step, "Cabinet");
  const lip = part("Cabinet lip", "plywood", [2, 2, 1], [0, 6.0625, 6], step, "Cabinet");
  const saved = saveMotionPlan({ ...project, pieces: [drawer, lip] }, {
    label: "Drawer", memberIds: [drawer.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
  }).project;
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "cabinet-lip.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...saved, schemaVersion: 82 })),
  });
  await expect(dialog).toHaveCount(0);
  const openMotion = () => page.getByRole("button", { name: "Test movement", exact: true }).click();
  await openMotion();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  await panel.getByText("Check a minimum gap", { exact: true }).click();
  await panel.getByRole("combobox", { name: "Part to clear", exact: true }).selectOption(lip.id);
  await panel.getByRole("spinbutton", { name: "Required minimum gap", exact: true }).fill("0.125");
  await panel.getByRole("button", { name: "Check gap through travel", exact: true }).click();
  const result = panel.getByRole("region", { name: "Minimum gap result" });
  await expect(result.getByRole("status")).toContainText("Shortfall. Observed 0.0625 in near 6 in.");
  await expect(panel.getByText("No modeled interference found along this travel.")).toBeVisible();
  await result.getByRole("button", { name: "Inspect the gap", exact: true }).click();
  await expect(page.getByTestId("motion-preview-label")).toHaveAttribute("data-pose", "6");
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByLabel("Clearance test name", { exact: true }).fill("Drawer lip check");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  expect((await readDraft()).project.motionPlans[0].testScenarios[0]).toMatchObject({
    name: "Drawer lip check", setup: { clearance: { movingId: drawer.id, otherId: lip.id, minimum: 0.125 } },
  });
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Cabinet lip clearance" }).click();
  await openMotion();
  await panel.getByRole("combobox", { name: "Clearance test", exact: true }).selectOption({ label: "Drawer lip check" });
  await expect(result).toContainText("0.0625 in");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Named clearance test · Drawer lip check");
  expect(guide).toContain("Shortfall. Observed 0.0625 in near 6 in.");
});

test("a door can stop short of a wall while a drawer opens to a saved target", async ({ page }) => {
  const project = blank("Cabinet beside a wall");
  const step = project.steps[0].id;
  const drawer = part("Pull-out drawer", "plywood", [1, 2, 1], [5, 10, -8], step, "Cabinet");
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [6, 10, 0], step, "Cabinet");
  const wall = part("Wall return", "plywood", [0.6, 5, 0.6], [0, 10, 11.5], step, "Cabinet");
  const slide = saveMotionPlan({ ...project, pieces: [drawer, door, wall] }, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const swing = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "cabinet-beside-wall.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...swing.project, schemaVersion: 85 })),
  });
  await expect(dialog).toHaveCount(0);
  const openMotion = () => page.getByRole("button", { name: "Test movement", exact: true }).click();
  await openMotion();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await panel.getByRole("combobox", { name: "Second motion", exact: true }).selectOption(swing.plan.id);
  await panel.getByRole("combobox", { name: /Opening order/ }).selectOption("companion-first");
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(panel.getByRole("button", { name: /Collision near Cabinet door/ })).toBeVisible();
  await panel.getByText("Set travel targets for this test", { exact: true }).click();
  await panel.getByRole("spinbutton", { name: "Cabinet door target angle (degrees)", exact: true }).fill("75");
  await panel.getByRole("spinbutton", { name: "Pull-out drawer target extension", exact: true }).fill("12.5");
  await panel.getByRole("button", { name: "Test these travel targets", exact: true }).click();
  await expect(panel.getByText("No modeled interference found along this travel.", { exact: true })).toBeVisible();
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "Inspect after Cabinet door opens", exact: true }).click();
  await expect(pose).toContainText("Cabinet door · 75°");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Pull-out drawer · 12.5 in");
  await expect(pose).toHaveAttribute("data-pose", "100");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await panel.getByLabel("Clearance test name", { exact: true }).fill("Limited by wall");
  await panel.getByRole("button", { name: "Save named test", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved = (await readDraft()).project;
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.motionPlans[0].testScenarios[0].setup.sequenceTargets).toEqual({
    selected: { kind: "slide", travel: 12.5 }, companion: { kind: "hinge", travel: 75 },
  });
  expect(saved.motionPlans.map((motion: { mechanism: { travel: number } }) => motion.mechanism.travel)).toEqual([24, 90]);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await openMotion();
  await panel.getByRole("combobox", { name: "Clearance test", exact: true }).selectOption({ label: "Limited by wall" });
  await panel.getByRole("button", { name: "Inspect test endpoint", exact: true }).click();
  await expect(pose).toContainText("Pull-out drawer · 12.5 in");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Test targets · Cabinet door 75°, Pull-out drawer 12.5 in.");
  await expect(page.locator(".print-guide")).toContainText("Test targets · Cabinet door 75°, Pull-out drawer 12.5 in.");
});

test("rip first preserves a long scrap and applies both cuts as one saved plan", async ({ page }) => {
  const project = blank("Shelf and long filler");
  const step = project.steps[0].id;
  const material = "plytanium-703";
  const panel = part("Shelf blank", material, [40, 0.703, 80], [0, 8, 0], step, "Casework");
  const filler = part("Long filler", material, [12, 0.703, 70], [56, 8, 0], step, "Casework");
  project.pieces = [panel, filler];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "shelf-and-filler.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...project, schemaVersion: 83 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${panel.id}"]`).click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await dialog.getByText(/^Blade kerf ·/).click();
  const kerf = dialog.getByRole("spinbutton", { name: "Measured blade kerf (in)" });
  await kerf.fill("0");
  await expect(dialog.getByText("Enter a positive blade kerf in inches.")).toBeVisible();
  await kerf.fill("0.059");
  await dialog.getByRole("spinbutton", { name: "Retained length", exact: true }).fill("40");
  await dialog.getByRole("spinbutton", { name: "Retained width", exact: true }).fill("24");
  const review = dialog.getByRole("button", { name: "Find uses for these offcuts", exact: true });
  await review.click();
  await expect(dialog).toContainText("These offcuts can stay in the Cut pool for another part.");
  await dialog.getByRole("combobox", { name: /Cut order/ }).selectOption("rip-first");
  await review.click();
  await expect(dialog.getByRole("list", { name: "Proposed cuts in order" })).toContainText("Long filler");
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("2 → 1 sheet");
  await dialog.getByRole("button", { name: "Apply cuts and reuse", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  const pieces = async () => (await readDraft())?.project?.pieces as typeof project.pieces;
  await expect.poll(async () => (await pieces())?.find(({ id }) => id === filler.id)?.cutStock?.id).toBeTruthy();
  const assigned = (await pieces()).find(({ id }) => id === filler.id)!;
  expect(assigned.cutStock?.woodKerf).toBe(0.059);
  const sourcePieces = (await pieces()).filter(({ cutStock }) => cutStock?.id === assigned.cutStock?.id);
  expect(sourcePieces.every(({ cutStock }) => cutStock?.woodKerf === 0.059)).toBe(true);
  expect(sourcePieces.some(({ offcut, size }) => offcut && Math.abs(size[2] - 9.941) < 1e-6)).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await pieces())?.find(({ id }) => id === panel.id)?.size[2]).toBe(80);
  expect((await pieces()).find(({ id }) => id === filler.id)?.cutStock).toBe(null);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await pieces())?.find(({ id }) => id === filler.id)?.cutStock?.id).toBe(assigned.cutStock?.id);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Shelf and long filler" }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  const ordered = /Trim P001 · Shelf blank[\s\S]*Rip to 2 ft · Crosscut to 40 in[\s\S]*Long filler[\s\S]*remnant from cut 1/;
  expect(guide).toMatch(ordered);
  expect(guide).toMatch(/Rip to 2 ft · Crosscut to 40 in[\s\S]*Recorded blade kerf 0\.059 in per cut/);
  const printOrder = page.locator(".print-guide .offcut-cut-order-print");
  await expect(printOrder).toContainText(ordered);
  await expect(printOrder).toContainText("Recorded blade kerf 0.059 in per cut");
});

test("a measured sill gasket checks support, shows its footprint and exports exact rolls", async ({ page }) => {
  const project = applyCommand(blank("Gasket wall"), { type: "wall", width: 96, height: 72, depth: 48, spacing: 16 });
  const plate = project.pieces.find(({ name }) => name.endsWith("bottom plate"))!;
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "gasket-wall.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...project, schemaVersion: 84 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const title = page.getByText("Plan sill gaskets", { exact: true });
  await title.click();
  const fields = page.locator("details.field-section").filter({ has: title });
  await fields.getByRole("combobox", { name: "Wood sill plate", exact: true }).selectOption(plate.id);
  await fields.getByRole("spinbutton", { name: "Measured top elevation", exact: true }).fill("0");
  await fields.getByRole("spinbutton", { name: "Continuous support length under this sill", exact: true }).fill("96");
  const width = fields.getByRole("spinbutton", { name: "Measured support width", exact: true });
  await width.fill("3");
  await fields.getByRole("spinbutton", { name: "Extra length for overlaps and trimming", exact: true }).fill("2");
  const save = fields.getByRole("button", { name: "Save gasket run", exact: true });
  const buy = fields.getByRole("button", { name: "Add missing gasket rolls", exact: true });
  await save.click();
  await expect(fields.getByRole("list", { name: "Measured sill gasket runs" })).toContainText("do not cover the full plate width");
  await expect(buy).toHaveCount(0);
  await width.fill("6");
  await save.click();
  await expect(fields.getByRole("list", { name: "Measured sill gasket runs" })).toContainText("One 98 in strip");
  await fields.getByRole("button", { name: "Show gasket footprint", exact: true }).click();
  await expect(page.getByTestId("sill-gasket-marker")).toContainText("Sill gasket footprint");
  await buy.click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved = (await readDraft()).project;
  expect(saved.sillGaskets[0]).toMatchObject({ partId: plate.id, measured: { supportWidth: 6, allowance: 2 } });
  expect(saved.supplies[0]).toMatchObject({ productId: "owens-corning-comfortseal-1fs", quantity: 1 });
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Gasket wall" }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list" }).click();
  await expect(dialog.getByRole("listitem").filter({ hasText: /#202084452/ })).toContainText("1 roll");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Sill gasket cut plan");
  expect(guide).toContain("Cut 98 in including 2 in for overlaps and trimming.");
  await expect(page.locator(".print-guide .sill-gaskets-print")).toContainText("502 in remaining");
});

test("a banquette seat highlights an interrupted support and the live guide follows the repair", async ({ page }) => {
  const project = blank("Seat support study");
  const step = project.steps[0].id;
  const seat = {
    ...part("Seat lid", "plytanium-703", [24, 0.703, 12], [0, 4.3515, 0], step, "Seat"),
    designRole: "seat-lid",
  };
  const left = part("Left seat rail", "stud", [3, 2, 8], [-6, 3, 0], step, "Support");
  const right = part("Right seat rail", "stud", [3, 2, 8], [6, 3, 0], step, "Support");
  const leftBase = part("Left base", "stud", [3, 2, 8], [-6, 1, 0], step, "Support");
  const rightBase = part("Right base", "stud", [3, 2, 8], [16, 1, 0], step, "Support");
  project.pieces = [seat, left, right, leftBase, rightBase];

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "seat-support.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  const finding = page.getByRole("button", { name: new RegExp(`^Seat support to floor · ${partLabel(project, seat.id)}`) });
  await checks.click();
  await expect(finding).toHaveClass(/warning/);
  await expect(finding).toContainText("1 of 2 wood supports has an interrupted contact trace");
  await expect(finding).toContainText("Right seat rail");
  await finding.click();
  const marker = page.getByTestId("panel-floor-bearing-marker");
  await expect(marker).toHaveAttribute("data-contact-patches", "1");
  await expect(marker).toContainText("Contacts to review");
  await page.getByRole("button", { name: "Hide highlighted area", exact: true }).click();

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${rightBase.id}"]`).click();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("6");
  await x.press("Tab");
  await expect(x).toHaveValue("6");
  await checks.click();
  await expect(finding).toHaveClass(/info/);
  await expect(finding).toContainText("All wood supports have continuous contact traces to the modeled floor");
  await finding.click();
  await expect(marker).toHaveAttribute("data-contact-patches", "2");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Shelf and seat bearing");
  expect(guide).toContain("All wood supports have continuous contact traces to the modeled floor");
  await expect(page.locator(".print-guide")).toContainText("All wood supports have continuous contact traces to the modeled floor");
});

test("a seat support warning fits a scrap block and records the cut in its guide", async ({ page }) => {
  const start = blank("Bench support repair");
  const step = start.steps[0].id;
  const seat = {
    ...part("Seat lid", "plytanium-703", [24, 0.703, 12], [0, 3.8515, 0], step, "Bench"),
    designRole: "seat-lid",
  };
  const rail = part("Right rail", "stud", [3.5, 1.5, 12], [6, 2.75, 0], step, "Bench");
  const left = part("Left leg", "stud", [3.5, 1.5, 3.5], [-6, 1.75, 0], step, "Bench");
  left.rotation = [Math.PI / 2, 0, 0];
  const project = addMeasuredOffcut({ ...start, pieces: [seat, rail, left] }, step, "stud", [20, 3.5, 1.5], "Support scrap");

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "bench-support.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.project.name).toBe(`${start.name} · imported`);
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  const finding = page.getByRole("button", { name: new RegExp(`^Seat support to floor · ${partLabel(project, seat.id)}`) });
  await expect(finding).toHaveClass(/warning/);
  await finding.click();
  const options = page.getByRole("region", { name: "Fit a support block", exact: true });
  await expect(options.getByRole("combobox", { name: "Part to support", exact: true })).toHaveValue(rail.id);
  await options.getByRole("button", { name: "Preview support block", exact: true }).click();
  const preview = options.getByRole("region", { name: "Support block fit", exact: true });
  await expect(preview).toContainText("2 in support block from the modeled floor");
  await expect(preview).toContainText("Use O001 from the Cut pool. Crosscut to 2 in.");
  await expect(page.getByTestId("support-block-preview-marker")).toContainText("Support block preview");
  expect((await draft()).project.pieces.some((piece: { name: string }) => piece.name === "Support block · Right rail")).toBe(false);
  await preview.getByRole("button", { name: "Add support block", exact: true }).click();
  await expect(finding).toHaveClass(/info/);
  await expect(finding).toContainText("All wood supports have continuous contact traces to the modeled floor");
  await expect.poll(async () => (await draft()).project.history.find(
    ({ offcutCut }: { offcutCut?: { cuts: { size: number }[] } }) => offcutCut?.cuts.some(({ size }) => size === 2),
  )).toBeTruthy();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const waiting = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await waiting).path())!, "utf8");
  expect(guide).toMatch(/Recorded offcut cut order[\s\S]*Support block · Right rail/);
});

test("the store checklist sorts recorded aisles and keeps partial pickups with the selected store", async ({ page }) => {
  const initial = blank("Hardware for the bench");
  initial.pieces.push(part("Bench rail", "stud", [3.5, 1.5, 32], [0, 0.75, 0], initial.steps[0].id, "Bench"));
  const project = addSupply(addSupply(initial, "everbilt-29256-continuous-hinge", 3), "paslode-515500", 1);
  const board = homeDepotShoppingList(project).items.find(({ source }) => source.kind === "stock")!.productId;
  const hinge = "314150989";
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "hardware-bench.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...project, schemaVersion: 86 })),
  });
  await expect(dialog).toHaveCount(0);
  const openHandoff = async () => {
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  };
  await openHandoff();
  const paste = dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true });
  const before = await paste.inputValue();
  const openShop = () => dialog.getByRole("button", { name: "Shop in store", exact: true }).click();
  const record = () => dialog.getByRole("button", { name: "Record store snapshots", exact: true }).click();
  async function observe(id: string, price: string, available: string, aisle: string, bay: string) {
    await dialog.getByRole("spinbutton", { name: `Price per purchase unit for product ${id}`, exact: true }).fill(price);
    await dialog.getByRole("spinbutton", { name: `Available purchase units for product ${id}`, exact: true }).fill(available);
    await dialog.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(`#${id}$`) }) })
      .getByText("Aisle and bay · optional", { exact: true }).click();
    await dialog.getByRole("textbox", { name: `Aisle or area for product ${id}`, exact: true }).fill(aisle);
    await dialog.getByRole("textbox", { name: `Bay for product ${id}`, exact: true }).fill(bay);
  }
  const saveSnapshot = () => dialog.getByRole("button", { name: "Save store snapshots", exact: true }).click();
  await openShop();
  await expect(dialog.getByText(/choose a store in Project settings/)).toBeVisible();
  await record();
  await dialog.getByRole("textbox", { name: "Home Depot store", exact: true }).fill("4409");
  await observe(board, "4", "15", "10", "3");
  await observe(hinge, "17", "2", "2", "8");
  await saveSnapshot();
  await expect(dialog.getByRole("heading", { name: "Shop in store", exact: true })).toBeVisible();
  await expect(dialog.locator(".shop-aisle h3")).toHaveText(["Aisle 2", "Aisle 10", "Find in store"]);
  await expect(dialog.getByRole("region", { name: "Aisle 2", exact: true })).toContainText("Bay 8");

  const hingeCount = dialog.getByRole("spinbutton", { name: `Picked purchase units for product ${hinge}`, exact: true });
  await hingeCount.fill("1");
  await hingeCount.press("Tab");
  await expect(dialog.getByRole("region", { name: "Aisle 2", exact: true })).toContainText("2 remaining");
  await dialog.getByRole("button", { name: `Mark picked for product ${board}`, exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("1 of 3 product lines picked");
  await dialog.getByRole("checkbox", { name: "Show remaining only", exact: true }).check();
  await expect(dialog.getByRole("region", { name: "Aisle 10", exact: true })).toHaveCount(0);
  const file = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download store checklist", exact: true }).click();
  const checklist = await file;
  expect(checklist.suggestedFilename()).toMatch(/-home-depot-store\.txt$/);
  const text = await readFile((await checklist.path())!, "utf8");
  expect(text).toContain("1 picked · 2 remaining · Aisle 2 · Bay 8");
  expect(text).toContain(`Internet #${board}`);
  expect(text).toMatch(/\[x\] 1 board/);

  await dialog.getByRole("button", { name: "Back to purchase list", exact: true }).click();
  const lineQuantities = (value: string) => value.split("\n").map((line) => line.split(" — ")[0]);
  expect(lineQuantities(await paste.inputValue())).toEqual(lineQuantities(before));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  expect((await draft()).project.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect((await draft()).project.homeDepotPickup).toContainEqual({ store: "4409", zip: "84121", productId: hinge, picked: 1 });

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: initial.name }).click();
  await openHandoff();
  await openShop();
  await expect(hingeCount).toHaveValue("1");
  await record();
  await dialog.getByRole("textbox", { name: "Home Depot store", exact: true }).fill("4408");
  await observe(hinge, "18", "4", "7", "1");
  await saveSnapshot();
  await expect(dialog.getByRole("region", { name: "Aisle 7", exact: true })).toContainText("Bay 1");
  await expect(dialog.getByRole("region", { name: "Aisle 2", exact: true })).toHaveCount(0);
  await expect(hingeCount).toHaveValue("0");
});

test("treated wood field cuts and scraps follow the model through build questions and guide export", async ({ page }) => {
  const project = blank("Treated sill cut review");
  const step = project.steps[0].id;
  const sill = part("Treated sill", "hd-treated-2x6-8", [5.5, 1.5, 96], [0, 0.75, 0], step, "Sill");
  const full = part("Uncut stock", "treated", [5.5, 1.5, 96], [20, 0.75, 0], step, "Sill");
  project.pieces = [sill, full];
  const cut = cutPiece(project, sill.id, 60, 2);
  const fixture = editRoundOpening(cut, sill.id, null, { axis: 1, fromEdges: [12, 2.75], diameter: 0.5 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "treated-sill.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByText("Questions about this build", { exact: true }).click();
  await dialog.getByRole("button", { name: "Review treated wood cuts", exact: true }).click();
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const answer = dialog.getByRole("region", { name: "Pressure-treated wood cuts", exact: true });
  await expect(answer).toContainText("P001 · Treated sill");
  await expect(answer).toContainText("O001 · Offcut · Treated sill");
  await expect(answer).not.toContainText("Uncut stock");
  await answer.getByRole("button", { name: "Open build preparation", exact: true }).click();
  const review = page.getByRole("region", { name: "Build preparation", exact: true })
    .locator("details.preparation-group").filter({ hasText: "Pressure-treated wood cuts" });
  await review.locator(":scope > summary").click();
  await expect(review).toContainText("Recorded cut face · local +Z. 1 round opening.");
  await expect(review.getByRole("link", { name: "American Wood Council field treatment guidance" })).toHaveAttribute("href", /awc\.org/);
  await review.getByRole("button", { name: /O001.*Offcut/ }).click();
  await expect(page.locator(".part-title")).toContainText("REUSABLE OFFCUT");
  await expect(page.getByText("Recorded cut face · local −Z.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/### Pressure-treated wood cuts[\s\S]*P001 · Treated sill · Recorded cut face · local \+Z. 1 round opening\.[\s\S]*O001 · Offcut · Treated sill/);
  await expect(page.locator(".print-guide .build-preparation-print")).toContainText("1 round opening.");
});

test("measured blade width previews fewer boards and sheets and stays with recorded scraps", async ({ page }) => {
  const plan = blank("Measured wood stock workshop");
  const step = plan.steps[0].id;
  const boardStock = homeDepotFraming.stud.materialId;
  const sheetStock = pureBondCasework.materialId;
  const panels = [
    part("Tall cabinet side", sheetStock, [24, 0.703, 60], [0, 1, 0], step, "Cabinet"),
    part("Second cabinet side", sheetStock, [23.941, 0.703, 60], [32, 1, 0], step, "Cabinet"),
  ];
  plan.pieces = [
    ...panels,
    part("Long frame rail", boardStock, [3.5, 1.5, 48], [55, 1, 0], step, "Frame"),
    part("Second frame rail", boardStock, [3.5, 1.5, 47.941], [62, 1, 0], step, "Frame"),
  ];
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "measured-wood-layout.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(plan)),
  });
  await expect(dialog).toHaveCount(0);
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.project.name).toBe(`${plan.name} · imported`);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const board = page.locator(`.bom-row[data-stock-material="${boardStock}"]`);
  const sheet = page.locator(`.bom-row[data-stock-material="${sheetStock}"]`);
  for (const row of [board, sheet]) {
    const kerf = row.locator(".wood-stock-kerf");
    await kerf.locator(":scope > summary").click();
    await kerf.getByRole("spinbutton", { name: "Blade kerf (in)", exact: true }).fill("0.059");
    await kerf.getByRole("button", { name: "Preview blade kerf", exact: true }).click();
    const preview = kerf.getByRole("region", { name: "Revised stock layout", exact: true });
    await expect(preview).toContainText("Stock units to buy · 2 → 1");
    await expect(row.locator("details.stock-cut-order > summary")).toContainText("2 units");
    if (row === sheet) {
      await preview.getByText(/^Sheet 1 ·/).click();
      await expect(preview).toContainText("4 ft × 35.941 in");
      await expect.poll(async () => (await draft()).project.woodKerfs).toEqual({ [boardStock]: 0.059 });
    }
    await kerf.getByRole("button", { name: "Apply blade kerf", exact: true }).click();
    await expect(row.locator("details.stock-cut-order > summary")).toContainText("1 unit");
  }
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const handoff = dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true });
  await expect(handoff).toHaveValue(/1 board[^\n]*#312528776/);
  await expect(handoff).toHaveValue(/1 sheet[^\n]*#100077837/);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: plan.name }).click();
  await expect.poll(async () => (await draft())?.project.woodKerfs?.[sheetStock]).toBe(0.059);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const order = sheet.locator("details.stock-cut-order");
  await order.locator(":scope > summary").click();
  await order.getByText(/^Sheet 1 ·/).click();
  await expect(order).toContainText("4 ft × 35.941 in");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("0.059 in measured loss per cut");
  expect(guide).toContain("4 ft × 35.941 in");
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await order.getByRole("button", { name: "Record this stock unit", exact: true }).click();
  const woodKerfs = sheet.locator(".wood-stock-kerf");
  await woodKerfs.locator(":scope > summary").click();
  await woodKerfs.getByRole("spinbutton", { name: "Blade kerf (in)", exact: true }).fill("0.126");
  await woodKerfs.getByRole("button", { name: "Preview blade kerf", exact: true }).click();
  await woodKerfs.getByRole("button", { name: "Apply blade kerf", exact: true }).click();
  await expect.poll(async () => (await draft())?.project.woodKerfs?.[sheetStock]).toBe(0.126);
  const saved = (await draft()).project as typeof plan;
  const remnants = saved.pieces.filter(({ material, offcut }) => material === sheetStock && offcut);
  expect(remnants).toHaveLength(1);
  expect(remnants[0].size[2]).toBe(35.941);
  expect(remnants[0].cutStock?.woodKerf).toBe(0.059);
  expect(saved.pieces.filter(({ material }) => material === sheetStock).every(({ cutStock }) => cutStock?.woodKerf === 0.059)).toBe(true);
});

test("a measured hinge path stops opening and closing at trim between clear ends", async ({ page }) => {
  const project = blank("Concealed hinge clearance");
  const step = project.steps[0].id;
  const door = part("Cabinet door", "plywood", [1, 2, 1], [0, 10, 0], step, "Cabinet");
  const trim = part("Side trim", "plywood", [4, 4, 0.4], [0, 10, 3.1], step, "Cabinet");
  const setup = saveMotionPlan({ ...project, pieces: [door, trim] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: door.position, travel: 90 },
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "concealed-hinge.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...setup.project, schemaVersion: 89 })),
  });
  await expect(dialog).toHaveCount(0);
  const openMotion = () => page.getByRole("button", { name: "Test movement", exact: true }).click();
  await openMotion();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(panel.getByText("No modeled interference found along this travel.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Edit setup", exact: true }).click();
  await panel.getByText("Measured hinge path", { exact: true }).click();
  await panel.getByRole("checkbox", { name: "Use measured hinge movement", exact: true }).check();
  await panel.getByRole("button", { name: "Add angle reading", exact: true }).click();
  await expect(panel.getByRole("spinbutton", { name: "Reading 1 angle (degrees)", exact: true })).toHaveValue("45");
  await panel.getByRole("spinbutton", { name: "Reading 1 Z offset (in)", exact: true }).fill("2.5");
  const openingAngle = panel.getByRole("spinbutton", { name: "Maximum opening (degrees)", exact: true });
  await openingAngle.fill("80");
  await expect(panel.getByRole("spinbutton", { name: "Full opening angle (degrees)", exact: true })).toHaveValue("90");
  await panel.getByRole("button", { name: "Save and test motion", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Measure the hinge path at the maximum opening angle.");
  await openingAngle.fill("90");
  await panel.getByRole("button", { name: "Save and test motion", exact: true }).click();

  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Contact ahead");
  expect(Number(await pose.getAttribute("data-pose"))).toBeGreaterThan(30);
  expect(Number(await pose.getAttribute("data-pose"))).toBeLessThan(45);
  await panel.getByRole("button", { name: "Inspect fully open", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await expect(pose).not.toContainText("Interfering parts");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toContainText("Contact ahead");
  expect(Number(await pose.getAttribute("data-pose"))).toBeGreaterThan(45);
  expect(Number(await pose.getAttribute("data-pose"))).toBeLessThan(60);

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  const saved = (await draft()).project;
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.motionPlans[0].mechanism.hingePath).toEqual([
    { angle: 45, offset: [0, 0, 2.5] },
    { angle: 90, offset: [0, 0, 0] },
  ]);
  expect(saved.pieces.map(({ position }: { position: number[] }) => position)).toEqual([door.position, trim.position]);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await openMotion();
  await panel.getByRole("button", { name: "Edit setup", exact: true }).click();
  await expect(panel.getByRole("spinbutton", { name: "Reading 1 Z offset (in)", exact: true })).toHaveValue("2.5");
  await panel.getByRole("button", { name: "Cancel setup", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Cabinet door · Measured hinge path");
  expect(guide).toContain("At 45°, datum offset · X 0 in, Y 0 in, Z 2.5 in.");
  await expect(page.locator(".print-guide")).toContainText("At 45°, datum offset · X 0 in, Y 0 in, Z 2.5 in.");
});

test("compare drawer slide lengths, play the fitted travel and reopen the exact Home Depot pair", async ({ page }) => {
  const base = blank("Short drawer slide comparison");
  const cabinetLeft = part("Left cabinet side", "plywood", [0.75, 24, 18.25], [-8.385, 12, 0], base.steps[0].id, "Drawer");
  const cabinetRight = part("Right cabinet side", "plywood", [0.75, 24, 18.25], [8.385, 12, 0], base.steps[0].id, "Drawer");
  const drawerLeft = part("Left drawer side", "plywood", [0.5, 4, 18.25], [-7.25, 12, 0], base.steps[0].id, "Drawer");
  const drawerRight = part("Right drawer side", "plywood", [0.5, 4, 18.25], [7.25, 12, 0], base.steps[0].id, "Drawer");
  const { project } = saveMotionPlan(
    { ...base, pieces: [cabinetLeft, cabinetRight, drawerLeft, drawerRight] },
    { label: "Shallow drawer", memberIds: [drawerLeft.id, drawerRight.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 } },
  );
  const hardware = drawerSlideReference("accuride-t46322g18");
  const dialog = page.getByRole("dialog");
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  const openMotion = () => page.getByRole("button", { name: "Test movement", exact: true }).click();
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "short-drawer.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await openMotion();
  await panel.getByRole("button", { name: "Edit setup", exact: true }).click();
  await panel.getByRole("button", { name: "Compare slide fit", exact: true }).click();
  for (const piece of [cabinetLeft, drawerLeft, drawerRight, cabinetRight]) {
    await panel.getByRole("combobox", { name: piece.name, exact: true }).selectOption(piece.id);
  }

  const comparison = panel.getByRole("region", { name: "Drawer slide length comparison" });
  await expect(comparison.getByRole("listitem")).toHaveCount(6);
  const shortPair = comparison.getByRole("listitem").filter({ hasText: "18 in slide pair" });
  await expect(shortPair).toContainText("Fits modeled panels");
  await expect(shortPair).toContainText("17.72 in closed rail");
  const longerPair = comparison.getByRole("listitem").filter({ hasText: "20 in slide pair" });
  await expect(longerPair).toContainText("Review fit");
  await expect(longerPair).toContainText("18.25 in of common front-to-back panel span");
  await expect(longerPair.getByRole("button")).toHaveCount(0);
  await shortPair.getByRole("button", { name: "Use 18 in slide pair" }).click();
  const travel = panel.getByRole("spinbutton", { name: "Maximum extension" });
  await expect(travel).toHaveValue("18");
  await expect(travel).toHaveAttribute("max", "18");
  await panel.getByRole("button", { name: "Save and test motion", exact: true }).click();
  const fit = panel.getByRole("region", { name: "Drawer slide fit", exact: true });
  await expect(fit).toContainText("T46322G18");
  const listing = fit.getByRole("link", { name: "View 18 in slide pair at Home Depot" });
  await expect(listing).toHaveAttribute("href", hardware.homeDepot);
  await fit.getByRole("button", { name: "Add missing slide pair to list" }).click();
  await expect(fit).toContainText("1 planned pair · 1 in shopping list");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(page.getByTestId("motion-preview-label")).toHaveAttribute("data-pose", "18");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  expect((await draft()).project.motionPlans[0].mechanism).toMatchObject({
    travel: 18, drawerSlide: { productId: hardware.productId },
  });
  expect((await draft()).project.supplies).toMatchObject([{ productId: hardware.productId, quantity: 1 }]);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: project.name }).click();
  await openMotion();
  await expect(listing).toHaveAttribute("href", hardware.homeDepot);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("T46322G18");
  expect(guide).toContain("Closed rail length 17.72 in");
});
