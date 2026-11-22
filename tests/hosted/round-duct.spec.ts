import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, part } from "../../src/model";

test("route straight round duct under a joist and take its exact pipe cuts to shopping and the guide", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const project = blank("Supply branch practice");
  project.pieces = [part("Crossing joist", "hd-spf-2x6-8", [1.5, 5.5, 48], [0, 18, 0], project.steps[0].id, "Floor")];
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "supply-branch.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How can I plan a straight round duct run?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan round duct run", exact: true }).click();
  for (const [label, value] of Object.entries({
    "Start X": "-36", "Start Y": "18", "Start Z": "8", "End X": "44", "End Y": "18", "End Z": "8",
    "Clearance envelope width": "8", "Start collar engagement": "2", "End collar engagement": "2",
    "Overlap between pipes": "1", "Cutting loss per trimmed pipe": "0.125",
  })) await dialog.getByRole("spinbutton", { name: label, exact: true }).fill(value);
  const check = dialog.getByRole("button", { name: "Check route and cuts", exact: true });
  await check.click();
  await expect(dialog.getByRole("alert")).toContainText("Crossing joist");
  await expect(page.getByTestId("round-duct-marker")).toHaveText("Review duct clearance");
  await expect(dialog.getByRole("button", { name: "Save duct run and cut list", exact: true })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Edit duct measurements", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Start Y", exact: true }).fill("4");
  await dialog.getByRole("spinbutton", { name: "End Y", exact: true }).fill("4");
  await check.click();
  const preview = dialog.getByRole("region", { name: "Duct route and cuts" });
  await expect(preview).toContainText("80 in between collar tips");
  await expect(preview).toContainText("2 × CP6X60 · 3 joints to seal");
  await expect(preview).toContainText("Cut to 25 in. Estimated tail 34.875 in");
  await page.screenshot({ path: info.outputPath("round-duct-preview-phone.png") });
  await dialog.getByRole("button", { name: "Save duct run and cut list", exact: true }).click();
  await expect(page.getByTestId("round-duct-marker")).toHaveText("6 in round duct");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await dialog.getByRole("button", { name: /^Add 2 pipes of Master Flow 6 in/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#100125106");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Round duct cutting and sealing");
  expect(guide).toContain("Pipe 2 · Cut to 25 in. Estimated tail 34.875 in");
  await expect(page.locator(".print-guide")).toContainText("Seal 3 round joints");
});
