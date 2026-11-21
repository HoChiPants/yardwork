import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreWorkshopArchive } from "../../server/workshopArchive";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { applyCommand, blank, part } from "../../src/model";
import { saveFastenerPlan, suggestCenteredFastener } from "../../src/fastenings";
import { saveWoodJointDecision } from "../../src/woodJointDecisions";
import { bounds } from "../../src/engine";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { saveMotionPlan } from "../../src/mechanismMotion";

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

test("glue and seam details follow actual parts into the saved project and both guides", async ({ page }) => {
  const project = blank("Casework joint details");
  const step = project.steps[0].id;
  const panel = part("Front panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const rail = part("Glue rail", "stud", [1.5, 4, 2], [-3, 4, -1.3515], step, "Casework");
  const trim = part("Seam rail", "stud", [1.5, 4, 2], [3, 4, -1.414], step, "Casework");
  project.pieces.push(panel, rail, trim);
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "older-casework.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...project, schemaVersion: 81 })),
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  async function openPair(label: string) {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Describe your idea" }).fill(`Review screw joint between P001 and ${label}`);
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

  const seam = await openPair("P003");
  await expect(seam).toContainText("0.0625 in gap");
  await seam.getByText("Record joint detail", { exact: true }).click();
  await expect(seam.getByLabel("Joint method").locator("option")).toHaveText([
    "Choose a joint method", "Seal exposed seam",
  ]);
  await seam.getByLabel("Joint method").selectOption("sealant");
  await seam.getByLabel("Joint detail for the guide").fill("Seal the exposed front edge only.");
  await seam.getByRole("button", { name: "Save joint detail", exact: true }).click();
  await expect(seam.getByRole("status")).toContainText("Seal exposed seam · Saved");

  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  const saved = (await draft()).project;
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.woodJointDecisions.map(({ method }: { method: string }) => method)).toEqual(["glue", "sealant"]);
  expect(saved.fastenerPlans).toEqual([]);
  expect(saved.supplies).toEqual([]);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").locator(".project-list > button").filter({ hasText: "Casework joint details" }).click();
  await expect(await openPair("P002")).toContainText("Dry-fit with the selected clamps.");
  expect((await draft()).project.woodJointDecisions).toEqual(saved.woodJointDecisions);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Recorded wood joint details");
  expect(guide).toContain("Seal the exposed front edge only.");
  await expect(page.locator(".print-guide .wood-joint-details-print")).toContainText("Dry-fit with the selected clamps.");
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
  await expect(page.locator(".print-guide .offcut-cut-order-print")).toContainText(ordered);
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
