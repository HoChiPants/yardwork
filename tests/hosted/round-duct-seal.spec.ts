import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("plan a duct sealant estimate and carry trial coverage and mesh needs into shopping and the guide", async ({ page }) => {
  await page.setViewportSize({width:390,height:900});
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "round-duct-sealing.yardwork.json", mimeType: "application/json",
    buffer: await readFile(new URL("../../public/examples/hvac/round-duct-sealing.yardwork.json", import.meta.url)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How much mastic do I need for my round ducts?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan duct sealing", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Average joint circumference", exact: true }).fill("18.85");
  await dialog.getByRole("spinbutton", { name: "Additional fitting seam length", exact: true }).fill("36");
  await dialog.getByRole("spinbutton", { name: "Seams needing mesh", exact: true }).fill("12");
  await dialog.getByRole("spinbutton", { name: "Usable coverage per tube", exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Check sealant estimate", exact: true }).click();
  const estimate = dialog.getByRole("region", { name: "Round duct sealing estimate", exact: true });
  await expect(estimate).toContainText("4 round joints");
  await expect(estimate).toContainText("2 tubes for 191.4 in");
  await expect(estimate).toContainText("Plan mesh on 1 ft");
  await dialog.getByRole("button", { name: "Save duct sealing plan", exact: true }).click();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 2 tubes of Master Flow/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("2 tubes · #100396972");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("At 10 ft per tube, allow 2 × WBA10.5");
  expect(guide).toContain("12 in of compatible mesh");
});
