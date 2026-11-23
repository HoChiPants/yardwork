import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("compare and save the combined balance of three moving cabinet drawers", async ({ page }, info) => {
  await page.goto("./");
  const response = await page.request.get(new URL("./examples/interior/drawer-balance-cabinet.yardwork.json", page.url()).href);
  expect(response.ok()).toBe(true);
  const original = projectSchema.parse(await response.json());
  const name = `Cabinet balance ${crypto.randomUUID().slice(0, 8)}`;
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "drawer-balance-cabinet.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...original, schemaVersion: 160, name, drawerBalancePlans: undefined })),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Will the cabinet tip over with all drawers open?");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await dialog.getByRole("button", { name: "Open drawer balance", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Total loaded cabinet weight (lb)" }).fill("80");
  await dialog.getByRole("spinbutton", { name: "Closed balance point behind front floor contact" }).fill("5");
  for (let row = 1; row <= 3; row++) {
    await dialog.getByRole("spinbutton", { name: `Cabinet drawer ${row} loaded weight` }).fill("18");
    await expect(dialog.getByRole("spinbutton", { name: `Cabinet drawer ${row} extension` })).toHaveValue("16");
  }
  await dialog.getByRole("button", { name: "Preview drawer balance", exact: true }).click();
  const result = dialog.getByRole("region", { name: "Drawer balance result" });
  await expect(result).toContainText("1.4 in behind the front support line");
  await expect(result).toContainText("5.8 in past the front support line");
  await result.getByRole("button", { name: "Show drawer positions in 3D" }).click();
  await expect(result.locator("canvas")).toBeVisible();
  await result.screenshot({ path: info.outputPath("drawer-balance.png") });
  const slider = result.getByRole("slider", { name: "Drawer opening progress" });
  await slider.press("Home");
  await expect(result.getByText("At this position · 5 in behind the front support line.")).toBeVisible();
  await result.getByRole("button", { name: "Save balance check" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: name }).click();
  const saved = projectSchema.parse((await draft()).project);
  expect(saved.drawerBalancePlans?.[0].input.drawers.map(({ weight }) => weight)).toEqual([18, 18, 18]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Drawer balance");
  expect(guide).toContain("At requested drawer positions · 5.8 in past the front support line.");
  expect(await page.locator(".print-guide").textContent()).toContain("At requested drawer positions · 5.8 in past the front support line.");
});
