import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("record a finished duct tail and reverse it to supply a second run", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "duct-offcut-reuse.yardwork.json", mimeType: "application/json",
    buffer: await readFile(new URL("../../public/examples/hvac/duct-offcut-reuse.yardwork.json", import.meta.url)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How can I reuse round duct offcuts?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open Cut pool", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await pool.getByText("Round duct offcuts (0)", { exact: true }).click();
  await pool.getByRole("button", { name: "Add measured duct offcut", exact: true }).click();
  const source = pool.getByRole("combobox", { name: "Duct offcut source", exact: true });
  await source.selectOption({ label: "Cut complete · Straight supply branch · Pipe 2 tail · estimated 34.875 in" });
  await pool.getByRole("textbox", { name: "Duct offcut label", exact: true }).fill("Branch tail");
  await pool.getByRole("spinbutton", { name: "Usable duct offcut length", exact: true }).fill("34.75");
  await pool.getByRole("combobox", { name: "Offcut first end", exact: true }).selectOption("crimped");
  await pool.getByRole("combobox", { name: "Offcut second end", exact: true }).selectOption("plain");
  await pool.getByRole("button", { name: "Save duct offcut", exact: true }).click();
  const tail = pool.getByRole("article", { name: "Branch tail", exact: true });
  await expect(tail).toContainText("Recovered from Straight supply branch · Pipe 2");
  await tail.getByRole("button", { name: "Match to a duct cut", exact: true }).click();
  await tail.getByRole("combobox", { name: "Receiving duct cut", exact: true }).selectOption({ label: "Utility branch · Pipe 1 · 26 in" });
  await tail.getByRole("combobox", { name: "Required form at start", exact: true }).selectOption("crimped");
  await tail.getByRole("combobox", { name: "Required form at finish", exact: true }).selectOption("crimped");
  const reserve = tail.getByRole("button", { name: "Reserve duct offcut", exact: true });
  await expect(reserve).toBeDisabled();
  await tail.getByRole("combobox", { name: "Required form at start", exact: true }).selectOption("plain");
  await expect(tail).toContainText("Reverse the recorded ends. Trim at the start");
  await page.screenshot({ path: info.outputPath("duct-offcut-match-phone.png") });
  await reserve.click();
  await expect(tail).toContainText("Reserved for Utility branch · Pipe 1");

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 1 pipe of Master Flow 6 in/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("1 pipe · #100125106");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Pipe 2 · Already cut to 25 in");
  expect(guide).toContain("Use measured offcut Branch tail at 26 in. Reverse its recorded ends");
});
