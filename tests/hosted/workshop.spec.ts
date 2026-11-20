import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreWorkshopArchive } from "../../server/workshopArchive";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

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
