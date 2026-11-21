import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("measure a kitchenette sink drain on a phone and keep the cut, interference and kit after reopening", async ({ page }) => {
  test.setTimeout(150_000);
  const example = await readFile(new URL(
    "../../public/examples/plumbing/kitchen-shutoff.yardwork.json", import.meta.url,
  ), "utf8");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchen-shutoff.yardwork.json", mimeType: "application/json", buffer: Buffer.from(example),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Fit a sink drain");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open sink drains", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Fit a sink drain", exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeInViewport();
  const field = (name: string) => dialog.getByRole("spinbutton", { name, exact: true });
  const positions = await Promise.all(["X", "Y", "Z"].map((axis) => field(`Tailpiece end ${axis}`).boundingBox()));
  expect(positions.every((box) => box && box.width >= 68 && box.x + box.width < 390)).toBe(true);
  await dialog.getByRole("textbox", { name: "Drain name", exact: true }).fill("Island sink drain");
  for (const [name, value] of Object.entries({
    "Tailpiece end X": "4", "Tailpiece end Y": "22", "Tailpiece end Z": "55",
    "Wall socket mouth X": "4", "Wall socket mouth Y": "22.25", "Wall socket mouth Z": "64",
    "Tailpiece engagement": "1", "Wall socket engagement": "1.25", "Horizontal reach to straight tube": "4.5",
    "Outlet center below inlet rim": "0.75", "Bottom below inlet rim": "4.95", "Widest collar or bend width": "2.25",
    "Full straight length from bend": "7.25", "Cut loss": "0.125", "Clearance below for trap removal": "3",
  })) await field(name).fill(value);
  await dialog.getByText("Measured path to vent", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Include field measurements from the trap weir to the vent" }).check();
  await field("Developed length to vent").fill("24");
  await field("Total fall to vent location").fill("0.5");
  await field("Vent takeoff above weir").fill("0.25");
  await dialog.getByRole("checkbox", { name: "Uniform fall confirmed on the full route" }).check();
  const preview = dialog.getByRole("button", { name: "Preview sink drain", exact: true });
  await preview.click();
  const proposal = dialog.getByRole("region", { name: "Sink drain proposal" });
  await expect(proposal).toContainText("0.09375 in more fall");
  await field("Wall socket mouth Y").fill("22.15625");
  await expect(proposal).toHaveCount(0);
  await preview.click();
  await expect(proposal).toContainText("5.75098 in straight tube cut");
  await expect(proposal).toContainText("Cut pool remnant · 1.37402 in");
  await expect(proposal).toContainText("Island pullout · Possible contact with the sink drain near 9.91 in.");
  await expect(proposal).toContainText("The field measurements match the distance, fall and takeoff references.");
  await proposal.getByRole("button", { name: "Add sink drain", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  const project = projectSchema.parse((await saved()).project);
  const drain = project.sinkDrains![0];
  const canvas = page.locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-rendered-part-ids", new RegExp(drain.bodyId));
  await expect(canvas).toHaveAttribute("data-rendered-part-ids", new RegExp(drain.tubeId));
  const tube = project.pieces.find(({ id }) => id === drain.tubeId)!;
  expect(project.pieces.some(({ offcut, cutStock, size }) =>
    offcut && cutStock?.id === tube.cutStock!.id && Math.abs(size[1] - 1.3740235) < 0.00001)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const item = dialog.getByRole("list", { name: "Home Depot purchase review" }).getByRole("listitem")
    .filter({ hasText: "316622155" });
  await expect(item).toContainText("1 kit · #316622155");
  await expect(item).toContainText("No recent store snapshot");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const exported = await readFile((await (await download).path())!, "utf8");
  expect(exported).toMatch(/Sink drains and wall-tube cuts[\s\S]+5\.75098 in[\s\S]+1\.25 in/);
  expect(exported).toMatch(/Island pullout[\s\S]*9\.91 in/);
  expect(exported).toMatch(/316622155/);
  await expect(page.locator(".print-guide .sink-drain-print")).toContainText("Trap-to-vent", { ignoreCase: true });
});
