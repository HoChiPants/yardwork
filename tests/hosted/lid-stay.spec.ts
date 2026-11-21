import { expect, test } from "@playwright/test";
import { saveLidStayFit } from "../../src/lidStayFit";
import { blank, part } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { partLabel } from "../../src/partLabels";

test("an approximate obstruction pauses a folding stay and remains distinct from a confirmed hit", async ({ page }) => {
  const project = applyIdeaPlan(blank("Folding stay clearance"), localIdeaPlan({
    prompt: "One-section storage banquette 24 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back",
  }));
  project.workZone = null;
  const section = project.sections[0];
  const side = project.pieces.find(({ designRole }) => designRole === "storage-left")!;
  const obstacle = part("Approximate slender catch", "roof", [0.05, 0.006, 0.006],
    [0, 13.2525906, -1.6010801], project.steps[0].id, "Test");
  project.pieces.push(obstacle);
  const fitted = saveLidStayFit(project, section.id, {
    fixedPieceId: side.id,
    productId: null,
    fixedPin: [-side.position[0], 11 - side.position[1], -7],
    lidPin: [0, -1.5, -5],
    fixedArm: 9,
    lidArm: 9,
    foldSign: 1,
    testAngle: 90,
    armEnvelopes: [{ width: 0.004, thickness: 0.125 }, { width: 0.004, thickness: 0.125 }],
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "folding-stay-clearance.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fitted)),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("combobox", { name: "Current section", exact: true }).selectOption(section.id);
  const panel = page.getByRole("region", { name: "Lid travel review", exact: true });
  await panel.getByRole("button", { name: "Review lid travel", exact: true }).click();
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  const scene = page.getByTestId("lid-preview-label");
  await expect(scene).toContainText("Stay arm clearance needs review · Parts in amber");
  const stopped = Number(await scene.getAttribute("data-angle"));
  expect(stopped).toBeGreaterThan(34);
  expect(stopped).toBeLessThan(34.25);

  await panel.getByRole("button", { name: "Inspect arm clearance", exact: true }).click();
  await expect(scene).toContainText("Parts in amber");
  await expect(scene).not.toContainText("Stay arm overlap in red");
  await expect(panel.getByText(new RegExp(`Stay arm clearance needs review.*${partLabel(fitted, obstacle.id)}`))).toBeVisible();
  await panel.getByRole("button", { name: "Inspect open (90°)", exact: true }).click();
  await expect(scene).toHaveAttribute("data-angle", "90");
  await expect(scene).not.toContainText("Parts in amber");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(scene).toContainText("Parts in amber");
  expect(Number(await scene.getAttribute("data-angle"))).toBeGreaterThan(34.25);
  expect(Number(await scene.getAttribute("data-angle"))).toBeLessThan(34.5);
});
