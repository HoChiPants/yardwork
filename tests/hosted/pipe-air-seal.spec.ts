import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

test("plan, preview, save and export a backed pipe seal", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/interior/pipe-air-seal.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const original = projectSchema.parse(await fixture.json());
  const name = `${original.name} · ${crypto.randomUUID().slice(0, 6)}`;
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "pipe-air-seal.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...original, name, pipeAirSeals: [] })),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How do I seal around a PVC pipe through the subfloor?");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await dialog.getByRole("button", { name: "Open pipe air seal planner" }).click();

  const inspector = page.getByRole("dialog", { name: "Inspector" });
  const panel = inspector.locator("#pipe-air-seal");
  const result = panel.getByRole("region", { name: "Pipe seal review" });
  await panel.getByRole("spinbutton", { name: "Pipe outside diameter" }).fill("2.375");
  const offset = panel.getByRole("spinbutton", { name: "Pipe center offset · local Z" });
  await offset.fill("0.4");
  await panel.getByRole("spinbutton", { name: "Available cavity depth" }).fill("0.75");
  await panel.getByRole("spinbutton", { name: "Recess to top of rod" }).fill("0.25");
  await panel.getByRole("button", { name: "Check pipe seal", exact: true }).click();
  await expect(result).toContainText("touches or crosses");
  await expect(result.getByRole("button", { name: "Save pipe seal", exact: true })).toHaveCount(0);
  await offset.fill("0.03125");
  await panel.getByRole("checkbox", { name: "Dry-fitted a snug rod all the way around" }).check();
  await panel.getByRole("button", { name: "Check pipe seal", exact: true }).click();
  await expect(result).toContainText("Gap 0.28125 in to 0.34375 in");
  await expect(result).toContainText("Frost King C21H");

  await result.getByRole("button", { name: "Show rings in 3D" }).click();
  await expect(page.getByTestId("trim-seam-marker")).toContainText("Pipe air seal");
  await expect.poll(async () => {
    const camera = await page.locator("canvas[data-workshop-camera]").first().getAttribute("data-workshop-camera");
    return JSON.parse(camera ?? "{}").settled;
  }).toBe(true);
  await page.screenshot({ path: info.outputPath("pipe-seal-rings.png") });
  await page.getByRole("button", { name: "Return to pipe seal" }).click();
  await result.getByRole("button", { name: "Save pipe seal", exact: true }).click();
  await panel.getByRole("button", { name: "Add missing sealant to List" }).click();
  await inspector.getByRole("button", { name: "Back to workspace" }).click();
  await page.locator(".build-timeline").getByRole("button", { name: "Generate build guide", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.pipeAirSeals?.[0].offset).toEqual([0.03125, 0]);
  expect(saved.supplies.some(({ productId }) => productId === "dap-08791-silicone-max")).toBe(true);
  expect(saved.steps.find(({ generated }) => generated?.kind === "pipe-air-seal")?.generated?.planId)
    .toEqual(saved.pipeAirSeals?.[0].id);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Pipe air seals");
  expect(guide).toContain("Air-seal pipe at P001");
  expect(guide.indexOf("Verify the pipe is fitted and supported")).toBeGreaterThan(guide.indexOf("Assemble Practice panel"));
  expect(guide.indexOf("Verify the pipe is fitted and supported")).toBeLessThan(guide.indexOf("Review connections and finish"));
  expect(guide).toContain("3/8 in rod remnant");
  expect(guide).toContain("Keep 8.57522 in for a future matching run");
});
