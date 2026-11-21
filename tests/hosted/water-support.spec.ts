import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";
import { previewWaterRun } from "../../src/wallWaterApply";
import { waterRunDraft } from "../../src/wallWaterSchema";

test("add through-stud isolators to a saved main, inspect tee spans and reopen the exact hardware plan", async ({ page }) => {
  test.setTimeout(120_000);
  const sample = projectSchema.parse(JSON.parse(await readFile(new URL(
    "../../public/examples/plumbing/kitchen-tee.yardwork.json", import.meta.url,
  ), "utf8")));
  const main = sample.waterRuns!.find(({ name }) => name === "Kitchen main")!;
  const { isolator: _omit, ...plain } = waterRunDraft(main);
  const before = previewWaterRun(sample, plain, main.id).project;

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchen-tee.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(before)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Review PEX support spacing");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open PEX support spacing", exact: true }).click();
  await expect(dialog.getByText("Above the 32 in reference.").first()).toBeVisible();
  await dialog.getByText("Set up isolators on a line", { exact: true }).click();
  await dialog.getByRole("button", { name: "Kitchen main", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Add a HoldRite isolator at each crossed stud", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Measured flange thickness", exact: true }).fill("0.0625");
  await dialog.getByRole("checkbox", { name: /interior nonbearing wall/ }).check();
  await dialog.getByRole("button", { name: "Preview water line", exact: true }).click();
  const proposal = dialog.getByRole("region", { name: "Water-line proposal", exact: true });
  await expect(proposal).toContainText("3 HoldRite 162J15 isolators · 6 flange nails specified · Longest support span 16 in");
  await proposal.getByText("Bore marks and face protection", { exact: true }).click();
  await expect(proposal.getByText(/Ø 1\.375 in/)).toHaveCount(3);
  await proposal.getByRole("button", { name: "Update water line", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const browserDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await browserDraft())?.revision, { timeout: 20_000 }).toBe(1);
  const saved = (await browserDraft()).project;
  const updated = saved.waterRuns.find(({ id }: { id: string }) => id === main.id);
  expect(updated.pipeId).toBe(main.pipeId);
  expect(updated.isolators).toHaveLength(3);
  const supportId = updated.isolators[0].id;
  expect(saved.pieces.find(({ id }: { id: string }) => id === supportId).material).toBe("hd-holdrite-162j15");
  await expect(page.locator("canvas").first()).toHaveAttribute("data-rendered-part-ids", new RegExp(supportId));

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Review PEX support spacing", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Modeled pipe spans" })
    .getByText(/16 in · Kitchen main.*Kitchen main.*Between isolators/).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Inspect Kitchen main at/ }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/HoldRite.*308675098/);
  expect(guide).toMatch(/PEX support spacing[\s\S]+Between isolators/);
  await expect(page.locator(".print-guide .water-support-print")).toContainText("32 in horizontal spacing");
});
