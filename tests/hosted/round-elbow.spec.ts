import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("fit a measured duct elbow, show its clearance and carry the exact fitting to shopping", async ({ page }, info) => {
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "round-elbow.yardwork.json", mimeType: "application/json",
    buffer: await readFile(new URL("../../public/examples/hvac/round-elbow.yardwork.json", import.meta.url)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How can I fit a 90-degree round duct elbow?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Fit round duct elbow", exact: true }).click();
  await dialog.getByRole("combobox", { name: "First pipe tip", exact: true }).selectOption({ label: "Supply through bay · end" });
  await dialog.getByRole("combobox", { name: "Second pipe tip", exact: true }).selectOption({ label: "Cross branch · start" });
  await dialog.getByRole("combobox", { name: "Elbow crimp", exact: true }).selectOption("first");
  const first = dialog.getByRole("spinbutton", { name: "First setback", exact: true });
  await first.fill("5");
  await dialog.getByRole("spinbutton", { name: "Second setback", exact: true }).fill("6");
  await dialog.getByRole("spinbutton", { name: "Elbow clearance width", exact: true }).fill("8");
  await dialog.getByRole("button", { name: "Check elbow fit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("miss the same turn by 1 in");
  await first.fill("6");
  await dialog.getByRole("button", { name: "Check elbow fit", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Elbow fit results", exact: true })).toContainText("First pipe end · plain");
  await expect(page.getByTestId("round-duct-elbow-marker")).toBeVisible();
  await page.screenshot({ path: info.outputPath("duct-elbow-fit.png") });
  await dialog.getByRole("button", { name: "Save measured elbow", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 1 elbow of Master Flow/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("1 elbow · #100062966");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Supply through bay (end) needs a plain pipe end");
  expect(guide).toContain("Cross branch (start) needs a crimped pipe end");
  expect(guide).toContain("Start crimped · finish plain. Trim the plain end and keep the factory crimp.");

  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /^Checks/ }).click();
  await page.getByRole("button", { name: "Plan round duct run", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Saved duct run", exact: true }).selectOption({ label: "Cross branch" });
  await dialog.getByRole("spinbutton", { name: "End X", exact: true }).fill("4");
  await dialog.getByRole("button", { name: "Check route and cuts", exact: true }).click();
  await dialog.getByRole("button", { name: "Save duct run and cut list", exact: true }).click();
  await expect(page.getByText("Review measured duct elbow", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).not.toContainText("#100062966");
  await expect(dialog.getByText(/Recheck elbow endpoints, mates and clearances/)).toBeVisible();
});
