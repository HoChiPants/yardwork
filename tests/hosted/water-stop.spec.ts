import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { part, projectSchema } from "../../src/model";
import { removeWaterStop } from "../../src/waterStops";

test("check and trim an island shutoff, reopen its purchase and compare its pressure boundary", async ({ page }) => {
  test.setTimeout(150_000);
  const example = projectSchema.parse(JSON.parse(await readFile(new URL(
    "../../public/examples/plumbing/kitchen-shutoff.yardwork.json", import.meta.url,
  ), "utf8")));
  const old = example.waterStops![0];
  const draft = removeWaterStop(example, old);
  const shelf = part("Island upper shelf", "hd-purebond-birch-703", [16, 0.703, 12], [0, 31, 61],
    draft.steps[0].id, "Island cabinet");
  draft.pieces.push(shelf);
  const branch = draft.waterRuns!.find(({ id }) => id === old.port.runId)!;
  const stock = draft.pieces.find(({ id }) => id === branch.pipeId)!.cutStock!.id;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchen-shutoff-test.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(draft)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Add a shutoff under the sink");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open fixture shutoffs", exact: true }).click();
  const fixture = dialog.getByRole("textbox", { name: "Fixture name", exact: true });
  const firstField = await fixture.boundingBox();
  const projection = await dialog.getByRole("spinbutton", { name: "Exposed pipe before trimming", exact: true }).boundingBox();
  expect(firstField!.width).toBeGreaterThan(120);
  expect(projection!.width).toBeGreaterThan(60);
  expect(projection!.y).toBeGreaterThan(firstField!.y);
  await fixture.fill("Island sink cold");
  await dialog.getByRole("combobox", { name: "Pipe end", exact: true }).selectOption({ label: "Island feed · end" });
  const setLength = async (name: string, value: string) =>
    dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  await setLength("Exposed pipe before trimming", "3");
  await setLength("Trim from pipe end", "0.25");
  await setLength("Clear space in front of handle", "2");
  await setLength("Clear space beyond outlet", "8");
  await dialog.getByRole("button", { name: "Preview shutoff fit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Outlet clearance hits Island upper shelf");
  await setLength("Clear space beyond outlet", "3");
  await dialog.getByRole("button", { name: "Preview shutoff fit", exact: true }).click();
  const proposal = dialog.getByRole("region", { name: "Fixture shutoff proposal", exact: true });
  await expect(proposal).toContainText("2.75 in exposed · 1 in insertion mark");
  await expect(proposal.getByRole("list", { name: "Movement review" })).toContainText("Possible contact with the valve");
  await expect(proposal).toContainText("Cut pool remnant · 0.25 in");
  await proposal.getByRole("button", { name: "Add shutoff", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  const project = projectSchema.parse((await saved()).project);
  const stop = project.waterStops![0];
  await expect(page.locator("canvas").first()).toHaveAttribute("data-rendered-part-ids", new RegExp(stop.pieceId));
  expect(project.pieces.find(({ id }) => id === branch.pipeId)?.cutStock?.id).toBe(stock);
  expect(project.pieces.some(({ offcut, cutStock, size }) => offcut && cutStock?.id === stock && size[1] === 0.25)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const item = dialog.getByRole("list", { name: "Home Depot purchase review" }).getByRole("listitem")
    .filter({ hasText: "325997124" });
  await expect(item).toContainText("1 valve · #325997124");
  await expect(item).toContainText("No recent store snapshot");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Water pressure test", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Fixture shutoffs during test", exact: true }).selectOption("included");
  await dialog.getByRole("spinbutton", { name: "Highest observed pressure (psi)", exact: true }).fill("150");
  await dialog.getByRole("button", { name: "Review observations", exact: true }).click();
  await expect(dialog.getByText(/Observed 150 psi exceeds modeled fixture shutoff \(125 psi\)/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const exported = await readFile((await (await download).path())!, "utf8");
  expect(exported).toMatch(/Fixture shutoffs[\s\S]+2\.75 in exposed at the end and mark 1 in/);
  expect(exported).toMatch(/325997124/);
  await expect(page.locator(".print-guide .water-stop-print")).toContainText("125 psi valve rating");
});
