import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { formatStockLength } from "../../src/measurement";
import { part } from "../../src/model";
import { reviewPanelBearing } from "../../src/panelBearing";
import { partLabel } from "../../src/partLabels";

test("the saved sag check follows a new center bearing and survives reload and guide export", async ({
  page,
}, info) => {
  const project = createBuildStudy("shelves").project;
  project.name = "Synthetic supported shelving study";
  const [{ piece: shelf }] = reviewPanelBearing(project);
  const [width, thickness, depth] = shelf.size;
  const [x, y, z] = shelf.position;
  const supportedHeight = y - thickness / 2 - 0.75;
  const rail = (name: string, delta: number, gap: number) =>
    part(
      name,
      "stud",
      [1.5, 1.5, depth],
      [x + delta, supportedHeight - gap, z],
      shelf.stepId,
      "Shelf supports",
    );
  const center = rail("Center rail", 0, 0.5);
  project.pieces.push(
    rail("Left rail", -(width / 2 - 0.75), 0),
    rail("Right rail", width / 2 - 0.75, 0),
    center,
  );
  const label = partLabel(project, shelf.id);
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "supported-shelving.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  const guide = page.getByRole("button", { name: "Guide", exact: true });
  await guide.click();
  await page.locator(`button.step-part[data-part-id="${shelf.id}"]`).click();
  const pane = page
    .locator(".connection-settings")
    .filter({ has: page.getByText("Shelf sag estimate", { exact: true }) });
  await pane.getByText("Shelf sag estimate", { exact: true }).click();
  await pane
    .getByRole("spinbutton", {
      name: "Evenly spread weight including shelf (lb)",
      exact: true,
    })
    .fill("120");
  await pane
    .getByRole("spinbutton", {
      name: "Panel stiffness EI (lbf·in² per ft)",
      exact: true,
    })
    .fill("200000");
  await pane
    .getByRole("textbox", { name: "Stiffness reference", exact: true })
    .fill("Synthetic panel EI for browser testing");
  await pane
    .getByRole("spinbutton", { name: "Maximum sag target", exact: true })
    .fill("0.125");
  await pane
    .getByRole("button", { name: "Save and compare sag", exact: true })
    .click();
  await expect(pane.getByRole("status")).toContainText(
    "Exceeds the 0.125 in target",
  );
  await expect(pane.getByRole("status")).toContainText(
    "Splitting the longest bay in half",
  );
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  await checks.click();
  const finding = page.getByRole("button", {
    name: new RegExp(`^Shelf sag estimate · ${label}`),
  });
  await expect(finding).toContainText(
    `${formatStockLength(width - 1.5)} longest support span`,
  );
  await expect(finding).toHaveClass(/warning/);
  await finding.click();
  const marker = page.getByTestId("shelf-span-marker");
  await expect(marker).toHaveAttribute("data-span-lines", "1");
  await expect(marker).toHaveAttribute("data-contact-patches", "2");
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();

  await guide.click();
  await page.locator(`button.step-part[data-part-id="${center.id}"]`).click();
  const height = page.getByRole("spinbutton", { name: "Y", exact: true });
  await height.fill(String(supportedHeight));
  await height.press("Tab");
  await checks.click();
  await expect(finding).toContainText(
    `${formatStockLength((width - 1.5) / 2)} longest support span`,
  );
  await expect(finding).toContainText("Within the 0.125 in target");
  await expect(finding).toHaveClass(/info/);
  await finding.click();
  await expect(marker).toHaveAttribute("data-contact-patches", "3");
  await page.screenshot({
    path: info.outputPath("supported-shelf.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog
    .locator(".project-list > button")
    .filter({ hasText: project.name })
    .click();
  await expect(dialog).toHaveCount(0);
  await checks.click();
  await expect(finding).toContainText("Within the 0.125 in target");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const markdown = await readFile((await (await download).path())!, "utf8");
  expect(markdown).toContain("## Shelf sag estimates");
  expect(markdown).toContain("Synthetic panel EI for browser testing");
  expect(markdown).toContain("Within the 0.125 in target");
  await expect(page.locator(".print-guide")).toContainText(
    "Synthetic panel EI for browser testing",
  );
});
