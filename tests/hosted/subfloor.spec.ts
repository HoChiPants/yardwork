import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { part, projectSchema, type V3 } from "../../src/model";

const samplePath = "examples/flooring/subfloor.yardwork.json";

test("subfloor support updates after fitting a recorded blocking offcut and stays in the guide", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Check subfloor support", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const example = dialog.getByRole("link", { name: "Download the subfloor blocking study" });
  expect(await example.getAttribute("href")).toContain(samplePath);
  const response = await page.request.get((await example.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  const sample = await response.json();
  const trackedPanel = sample.subfloorChecks[0];
  const scrap = sample.pieces.find(({ name }: { name: string }) => name === "Offcut · Joist 1");
  scrap.position = [120, 0, 120];
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "subfloor.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...sample, subfloorChecks: [] })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Fit blocking under P010");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open subfloor support", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Subfloor support preview" });
  await expect(preview).toContainText("4 continuous joist lines · Widest spacing 24 in on center");
  await expect(preview).toContainText("Long side B lacks ½ in bearing along 22.5 in");
  await expect(preview).toContainText("Check matching Cut pool piece O003");
  await preview.getByRole("button", { name: "Save check to guide", exact: true }).click();
  await preview.getByRole("button", { name: "Preview blocking in 3D", exact: true }).click();
  const fitted = page.getByRole("region", { name: "Blocking preview" });
  await expect(fitted).toContainText("22.5 in fitted block");
  await expect(page.getByTestId("subfloor-block-preview-marker")).toHaveText("Blocking preview · Long side B");
  await expect(fitted).toContainText("O003 from Cut pool · on hand · Fits as-is");
  await fitted.getByRole("button", { name: "Back to support check" }).click();
  await expect(preview).toContainText("Long side B lacks ½ in bearing along 22.5 in");
  await preview.getByRole("button", { name: "Preview blocking in 3D", exact: true }).click();
  await fitted.getByRole("button", { name: "Add fitted blocking" }).click();
  await expect(page.getByTestId("subfloor-support-marker")).toContainText("48 estimated nailing locations");
  await page.getByRole("button", { name: "Check subfloor support", exact: true }).click();
  await dialog.getByText("Subfloor adhesive", { exact: true }).click();
  await expect(dialog.getByText("10 bead runs · About 21.7 linear ft")).toBeVisible();
  const saveAdhesive = dialog.getByRole("button", { name: "Save adhesive plan" });
  await expect(saveAdhesive).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "The delivered panel allows this adhesive on these framing surfaces." }).check();
  await saveAdhesive.click();
  await expect(dialog.getByText("Adhesive saved", { exact: true })).toBeVisible();
  await dialog.getByText("Subfloor fasteners", { exact: true }).click();
  const choices = dialog.getByRole("combobox", { name: "Fastener schedule" });
  await expect(choices).toHaveValue("deformed-6d");
  await expect(dialog.getByText("48 nails for this sheet")).toBeVisible();
  await dialog.getByText("Count by framing member", { exact: true }).click();
  await expect(dialog.getByText("P001 · 11 locations", { exact: true })).toBeVisible();
  await choices.selectOption("common-8d");
  const saveFastening = dialog.getByRole("button", { name: "Save fastener plan", exact: true });
  await expect(saveFastening).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /The specified 6d nails are unavailable/ }).check();
  await saveFastening.click();
  await expect(dialog.getByText("Fastener plan saved", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Show nail marks in 3D" }).click();
  await expect(page.getByTestId("subfloor-fasteners-marker")).toHaveText("Fasteners · 48 modeled paths");
  await page.getByRole("button", { name: "Check subfloor support", exact: true }).click();
  await dialog.getByRole("button", { name: "Show adhesive in 3D" }).click();
  await expect(page.getByTestId("subfloor-adhesive-marker")).toHaveText("Adhesive · 10 framing bead runs");
  await expect(page.getByTestId("subfloor-support-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: "Add 1 cartridge of Liquid Nails subfloor adhesive" }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })
    .getByRole("listitem").filter({ hasText: "#202203997" })).toContainText("1 cartridge");
  await dialog.getByRole("button", { name: /Add 1 1-lb box of Grip-Rite 8C1/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })
    .getByRole("listitem").filter({ hasText: "#202308488" })).toContainText("1 1-lb box");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await saved())?.revision).toBe(1);
  expect((await saved()).project.subfloorChecks).toEqual([trackedPanel]);
  const stored = (await saved()).project;
  expect(stored.subfloorAdhesivePlans).toEqual([{ panelId: trackedPanel, contactSignature: expect.any(String) }]);
  expect(stored.subfloorNailPlans).toEqual([{ panelId: trackedPanel, schedule: "common-8d", signature: expect.any(String) }]);
  expect(stored.pieces.some(({ id }: { id: string }) => id === scrap.id)).toBe(false);
  const installed = stored.pieces.find(({ name }: { name: string }) => name.startsWith("Subfloor blocking ·"));
  expect(installed.offcut).toBe(false);
  expect(installed.position[0]).toBeCloseTo(15.25, 5);
  expect(installed.cutStock.id).toBe(scrap.cutStock.id);
  expect(stored.history.some((entry: { offcutCut?: { inputId: string } }) => entry.offcutCut?.inputId === scrap.id)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadable = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await downloadable).path())!, "utf8");
  expect(guide).toMatch(/Subfloor support and blocking[\s\S]*48 estimated panel nailing locations/);
  expect(guide).toContain("Check 72 × 32 in OSB deck support before covering");
  expect(guide).toContain("202308488");
  expect(guide).toMatch(/Subfloor adhesive[\s\S]*1 × 28 fl oz LNP-902/);
  expect(guide).toMatch(/Subfloor fasteners[\s\S]*48 nails total · estimated 1 × 1-lb box/);
  expect(guide).toMatch(/O003[^\n]*Subfloor blocking|Subfloor blocking[^\n]*O003/);
  await expect(page.locator(".print-guide .subfloor-support-print")).toContainText("48 estimated panel nailing locations");
  await expect(page.locator(".print-guide .subfloor-adhesive-print")).toContainText("10 framing bead runs");
  await expect(page.locator(".print-guide .subfloor-fasteners-print")).toContainText("48 × Grip-Rite 8C1");
});

test("joist bearing measures a long span over actual wood seats and saves the comparison", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("./");
  const response = await page.request.get(samplePath);
  expect(response.ok()).toBe(true);
  const sample = projectSchema.parse(await response.json());
  const step = sample.steps[0].id;
  const pieces = sample.pieces.map((piece) => ({
    ...piece, position: [piece.position[0], piece.position[1] + 7.25, piece.position[2]] as V3,
    ...(piece.name.startsWith("Joist ") ? { size: [1.5, 7.25, 121] as V3, cutStock: null } : {}),
  }));
  for (const x of [-59.75, 59.75]) {
    pieces.push(part("Bearing timber", "two-eight", [1.5, 7.25, 74], [x, 3.625, 0], step, "Bearing"));
  }
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "floor-over-wood-bearing.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...sample, pieces })),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Check subfloor support", exact: true }).click();
  await dialog.getByText("Joist bearing and span", { exact: true }).click();
  await expect(dialog.getByText("Clear span 118 in.", { exact: true })).toHaveCount(4);
  await dialog.getByRole("combobox", { name: "Confirmed lumber stamp" }).selectOption("syp");
  const save = dialog.getByRole("button", { name: "Save joist check", exact: true });
  await expect(save).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "These stamps, spacing and reference loads match the floor I’m reviewing." }).check();
  await expect(dialog.getByText("Clear span 118 in · reference limit 106 in.", { exact: true })).toHaveCount(4);
  await save.click();
  await expect(dialog.getByText("Joist check saved")).toBeVisible();
  await dialog.getByRole("button", { name: "Show joist bearing in 3D" }).click();
  await expect(page.getByTestId("subfloor-joists-marker")).toHaveText("Joists · 4 to review");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)?.revision, CURRENT_DRAFT_KEY)).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadable = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await downloadable).path())!, "utf8");
  expect(guide).toMatch(/Joist bearing and span[\s\S]*Clear span 118 in · reference limit 106 in/);
  await expect(page.locator(".print-guide .subfloor-joists-print")).toContainText("exceeds the reference by 1 ft");
});

test("inspect a square-end joint and correct its modeled gap while keeping one stock sheet", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  async function openSupport() {
    await page.getByRole("button", { name: "Sections", exact: true }).click();
    await page.getByRole("button", { name: "Check subfloor support", exact: true }).click();
  }
  await openSupport();
  const practice = dialog.getByRole("link", { name: "Download the panel-spacing practice plan", exact: true });
  const response = await page.request.get((await practice.getAttribute("href"))!);
  expect(response.ok()).toBe(true);
  const sample = await response.body();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "subfloor-end-spacing.yardwork.json",
    mimeType: "application/json",
    buffer: sample,
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Review subfloor joint spacing");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  const answer = dialog.getByRole("region", { name: "Check subfloor support", exact: true });
  await answer.getByRole("button", { name: "Review this subfloor sheet", exact: true }).first().click();
  const joints = dialog.getByRole("list", { name: "Modeled subfloor joints" });
  await dialog.getByText("Subfloor panel joints", { exact: true }).click();
  await expect(joints).toContainText("0 in modeled gap along 32 in");
  await expect(joints).toContainText("retained length would be 39.875 in");
  await joints.getByRole("button", { name: "Inspect joint in 3D", exact: true }).click();
  const ruler = page.getByTestId("subfloor-joint-marker");
  await expect(ruler).toHaveText("0 in modeled gap");
  await page.getByRole("button", { name: "Edit this sheet", exact: true }).click();
  const position = page.getByRole("spinbutton", { name: "Z", exact: true });
  await expect(position).toHaveValue("20");
  await position.fill("19.875");
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await openSupport();
  await expect(dialog.getByRole("region", { name: "Subfloor support preview" })).toContainText("All four edges have modeled backing");
  await dialog.getByText("Subfloor panel joints", { exact: true }).click();
  await expect(joints).toContainText("0.125 in modeled gap along 32 in");
  await expect(joints).toContainText("Matches the ⅛ in APA installation spacing reference");
  await joints.getByRole("button", { name: "Inspect joint in 3D", exact: true }).click();
  await expect(ruler).toHaveText("0.125 in modeled gap");
  await ruler.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("subfloor-joint-spacing.png") });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator('.bom-row[data-stock-material="hd-osb-subfloor-486701"]')).toContainText("1 sheet");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await download).path())!, "utf8");
  expect(markdown).toContain("P014 far end to P015 start end · 0.125 in modeled gap along 32 in");
  expect(markdown).toContain("47.875 in × 0.703 in × 15.625 in");
});
