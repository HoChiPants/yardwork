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
  await expect.poll(async () => (await readDraft()).revision).toBe(1);
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
