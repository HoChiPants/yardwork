import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blankProjectCode } from "../../src/projectCodeSchema";

test("log a kitchenette water test, separate the hold reviews and reopen historical evidence after a layout change", async ({ page }) => {
  test.setTimeout(150_000);
  const model = JSON.parse(await readFile(new URL(
    "../../public/examples/plumbing/kitchen-tee.yardwork.json", import.meta.url,
  ), "utf8"));
  model.projectCode = {
    ...blankProjectCode(), projectDate: "2026-11-21", region: "utah", codePath: "irc", work: "existing", trades: ["plumbing"],
    buildingAuthority: "Simulated authority", authorityBasis: "Synthetic residential permit scope for this test.",
  };

  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "kitchen-tee.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill("Record a water pressure test");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open water pressure tests", exact: true }).click();
  await expect(dialog.getByText("3 lines", { exact: true })).toBeVisible();
  await dialog.getByText("Modeled ends to account for (3)", { exact: true }).click();
  await expect(dialog.getByText("Island feed · end", { exact: true })).toBeVisible();
  await dialog.getByLabel("Record name", { exact: true }).fill("Kitchen test observation");
  await dialog.getByLabel("Field test date", { exact: true }).fill("2026-11-21");
  for (const [label, value] of [["Water source", "potable"], ["Field isolation verified", "yes"],
    ["Water added during final hold", "no"], ["Visible leakage", "no"]])
    await dialog.getByRole("combobox", { name: label, exact: true }).selectOption(value, { timeout: 12_000 });
  await dialog.getByLabel("Isolation and equipment notes", { exact: true }).fill("Synthetic test with three measured boundaries.");
  await dialog.getByLabel("Gauge ID or reference", { exact: true }).fill("Fixture G1");
  await dialog.getByText("Manufacturer phases", { exact: true }).click();
  for (const [label, value] of [
    ["System working pressure (psi)", "60"], ["Weakest setup rating (psi)", "160"], ["Highest water temperature (°F)", "68"],
    ["Highest observed pressure (psi)", "150"], ["Gauge scale limit (psi)", "200"], ["Gauge working limit (psi)", "200"],
    ["Gauge increment (psi)", "1"], ["Initial high hold · starting psi", "150"], ["Initial high hold · minutes", "30"],
    ["Reduced hold · starting psi", "30"], ["Reduced hold · minutes", "10"], ["Second high hold · starting psi", "150"],
    ["Second high hold · minutes", "30"], ["End of second high hold (psi)", "149"],
    ["Final start (psi)", "149"], ["Final low (psi)", "149"], ["Final end (psi)", "149"], ["Final duration (minutes)", "15"],
  ]) await dialog.getByLabel(label, { exact: true }).fill(value);

  await dialog.getByRole("button", { name: "Review observations", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Water pressure review", exact: true });
  await expect(review.getByText("2021 IRC P2503.7", { exact: true }).locator("..")).toContainText("matches this check");
  await expect(review.getByText("RWC push-to-connect sequence", { exact: true }).locator("..")).toContainText("Difference to review");
  await dialog.getByLabel("Final duration (minutes)", { exact: true }).fill("60");
  await expect(review.getByText("RWC push-to-connect sequence", { exact: true }).locator("..")).toContainText("matches this check");
  await dialog.getByRole("button", { name: "Save test record", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Test record", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const browserDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await browserDraft())?.revision, { timeout: 20_000 }).toBe(1);
  const record = (await browserDraft()).project.waterPressureTests[0];
  expect(record.scope.runs).toHaveLength(3);
  expect(record.finalHold).toEqual({ startPsi: 149, lowestPsi: 149, endPsi: 149, minutes: 60 });

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Water pressure test records[\s\S]+Kitchen test observation[\s\S]+Final hold · Start 149 psi · Low 149 psi · End 149 psi · 60 min/);
  await expect(page.locator(".print-guide .water-pressure-print")).toContainText("Recorded final hold · 60 min");
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Connect PEX runs", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Connection", exact: true }).selectOption(model.waterFittings[0].id);
  await dialog.getByRole("button", { name: "Remove fitting", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Water pressure test", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Test record", exact: true }).selectOption(record.id);
  await expect(dialog.getByText("Recorded test section", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Earlier readings", { exact: true })).toBeVisible();
  await expect(dialog.getByText("RWC push-to-connect sequence", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save test record", exact: true })).toHaveCount(0);
});
