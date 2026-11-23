import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { generateBuildGuide } from "../../src/guide";
import { windowSealOrderStudy } from "../helpers/windowSealOrderStudy";

test("move a fitted window covering after the interior seal and export the corrected guide", async ({ page }) => {
  const model = windowSealOrderStudy();
  const guide = generateBuildGuide(model.project);
  const seal = guide.steps.find(({ generated }) => generated?.kind === "window-interior-air-seal")!;
  const coverId = guide.pieces.find(({ id }) => id === model.target.id)!.stepId;
  const cover = guide.steps.find(({ id }) => id === coverId)!;
  const project = {
    ...guide,
    steps: guide.steps.filter(({ id }) => id !== coverId).flatMap((step) => step.id === seal.id ? [cover, seal] : [step]),
  };
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "window-seal-order.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("When should I seal the window?");
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  const answer = dialog.getByRole("region", { name: "Window flashing and air-seal order", exact: true });
  await expect(answer).toContainText("is ahead of the window air-seal step");
  await answer.getByRole("button", { name: "Open step scheduled too early", exact: true }).click();
  await expect(page.getByRole("heading", { name: cover.title, exact: true })).toBeVisible();
  const warning = page.getByRole("status").filter({ hasText: "Review moving this step after" });
  await expect(warning).toContainText(seal.title);

  await page.getByRole("button", { name: "Later", exact: true }).click();
  await expect(warning).toHaveCount(0);
  await page.locator(".step-track").getByRole("button", { name: new RegExp(seal.title) }).click();
  await expect(page.getByRole("button", { name: "Open window flashing measurements", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Build instructions" })).toHaveValue(/Keep access at the marked perimeter/);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.id as string, CURRENT_DRAFT_KEY);
  const saved = await page.request.get(`/api/projects/${id}`);
  expect(saved.ok()).toBe(true);
  const savedSteps = (await saved.json()).project.steps.map((step: { id: string }) => step.id);
  expect(savedSteps.indexOf(seal.id)).toBeLessThan(savedSteps.indexOf(coverId));

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const downloaded = await readFile((await (await download).path())!, "utf8");
  expect(downloaded).toMatch(/## \d+\. Flash window sill[\s\S]*## \d+\. Set and flash window[\s\S]*## \d+\. Air-seal window perimeter[\s\S]*## \d+\. Hang Drywall · back/i);
  expect(downloaded).toContain("Cut 4 ft from 9 in FlexWrap");
  expect(downloaded).toContain("Keep 71 ft for matching cuts.");
  expect(downloaded).not.toContain("Review moving this step after");
});
