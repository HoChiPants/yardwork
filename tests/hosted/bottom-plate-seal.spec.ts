import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { removeBottomPlateSeal } from "../../src/bottomPlateSeal";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("mark a bottom plate seam on a phone, keep the breaks and shop the cut-backed plan", async ({ page }) => {
  test.setTimeout(150_000);
  const sample = projectSchema.parse(JSON.parse(await readFile(new URL(
    "../../public/examples/air-sealing/bottom-plate.yardwork.json", import.meta.url,
  ), "utf8")));
  const record = sample.bottomPlateSeals![0];
  const project = removeBottomPlateSeal(sample, record.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "bottom-plate.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Air seal the bottom plate to the subfloor");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open bottom plate air seal", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Seal a bottom plate", exact: true })).toBeInViewport();
  await dialog.getByRole("combobox", { name: "Wood bottom plate" }).selectOption(record.plateId);
  await dialog.getByRole("spinbutton", { name: "Widest measured gap", exact: true }).fill("0");
  await dialog.getByRole("spinbutton", { name: "Measured fill depth", exact: true }).fill("0.125");
  await dialog.getByRole("checkbox", { name: "This is an exposed, dry wood seam in an unrated assembly" }).check();
  await dialog.getByRole("button", { name: "Preview air seal", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Bottom plate seal preview" });
  await expect(preview).toContainText("75.875 in clear for a bead");
  await expect(preview).toContainText("43.9375 in to 44.0625 in from start · Subfloor backing or edge room is missing.");
  await expect(preview).toContainText("56 in to 68 in from start · Bead access is blocked by Access mockup block.");
  await preview.getByRole("button", { name: "Save air seal and show in 3D", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("bottom-plate-seam-start")).toContainText("Bead start");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 1 cartridge of OSI SC175/ }).click();
  const items = dialog.getByRole("list", { name: "Home Depot purchase review" });
  await expect(items.getByRole("listitem").filter({ hasText: "#202768254" })).toContainText("1 cartridge");
  await expect(items.getByRole("listitem").filter({ hasText: "#203169027" })).toContainText("1 sheet");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  const stored = projectSchema.parse((await saved()).project);
  expect(stored.bottomPlateSeals?.[0]).toMatchObject({ gap: 0, depth: 0.125, bead: "3/8", dryExposedWood: true });
  expect(stored.pieces.filter(({ offcut, material }) => offcut && material === "hd-osb-subfloor-486701")).toHaveLength(3);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Seal a bottom plate", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Bottom plate seal plan" }).selectOption(stored.bottomPlateSeals![0].id);
  await dialog.getByRole("button", { name: "Show saved seam in 3D", exact: true }).click();
  await expect(page.getByTestId("bottom-plate-seam-start")).toHaveText("Bead start · Bottom plate air seal");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadable = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await downloadable).path())!, "utf8");
  expect(guide).toMatch(/Bottom plate air seals[\s\S]*56 in to 68 in.+Access mockup block/);
  expect(guide).toMatch(/matching Cut pool pieces O\d+/);
  expect(guide).toContain("202768254");
  await expect(page.locator(".print-guide .bottom-plate-seal-print")).toContainText("1 cartridge of OSI SC175");
});
