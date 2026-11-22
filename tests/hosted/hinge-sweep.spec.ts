import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("a brief trim obstruction stops hinge playback from both clear endpoints", async ({ page }) => {
  await page.goto("./");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "door-trim-swing.yardwork.json", mimeType: "application/json",
    buffer: await readFile(new URL("../../public/examples/motion/door-trim-swing.yardwork.json", import.meta.url)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(panel.getByRole("button", { name: /Collision near 32\.76°/ })).toBeVisible();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText(/Contact ahead.*Fixed trim/);
  expect(Number(await pose.getAttribute("data-pose"))).toBeCloseTo(32.76, 2);

  await panel.getByRole("button", { name: "Inspect fully open", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await expect(pose).not.toContainText(/Contact ahead|Interfering parts/);
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toContainText(/Contact ahead.*Fixed trim/);
  expect(Number(await pose.getAttribute("data-pose"))).toBeCloseTo(34.56, 2);
  await panel.getByRole("button", { name: "Inspect fully closed", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
});
