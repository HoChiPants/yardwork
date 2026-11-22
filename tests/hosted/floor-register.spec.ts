import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, part, projectSchema } from "../../src/model";
import { rectangularOpeningMarks } from "../../src/throughOpeningCuts";

test("preview a register conflict and save the clear opening and seal plan on a phone", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const project = blank("Floor register between joists");
  const step = project.steps[0].id;
  project.pieces = [
    part("Subfloor", "hd-osb-subfloor-486701", [48, 0.703, 32], [0, 12, 0], step, "Floor"),
    part("Center joist", "hd-spf-2x6-8", [48, 5.5, 1.5], [0, 8.8985, 0], step, "Floor"),
  ];
  await page.goto("./");
  let dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "subfloor-and-joist.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("How should I seal a floor register?");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan floor register", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("Plan floor register");

  for (const [name, value] of [
    ["From low X edge", "10"], ["From low Z edge", "14"], ["Opening along X", "10.25"],
    ["Opening along Z", "4.25"], ["Throat along X", "10"], ["Throat along Z", "4"],
    ["Body along X", "15"], ["Body along Z", "6"], ["Body depth below sheet", "9"],
    ["Body center offset along X", "2"],
  ]) await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Check opening and fit", exact: true }).click();
  const preview = dialog.getByRole("region", { name: "Floor register fit preview" });
  await expect(preview.getByRole("alert")).toContainText("crosses a modeled part");
  await expect(preview).toContainText("Center joist");
  await expect(page.getByTestId("floor-register-marker")).toHaveText("Review register fit");

  await dialog.getByRole("button", { name: "Edit floor register measurements", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "From low Z edge", exact: true }).fill("21");
  await dialog.getByRole("button", { name: "Check opening and fit", exact: true }).click();
  await expect(preview).toContainText("28.5 in modeled seal path");
  await expect(preview).toContainText("0.125 in along X and 0.125 in along Z");
  await expect(page.getByTestId("floor-register-marker")).toHaveText("Floor register opening");
  const save = dialog.getByRole("button", { name: "Save opening and seal plan", exact: true });
  await expect(save).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /I measured the delivered throat/ }).check();
  await page.screenshot({ path: info.outputPath("floor-register-preview-phone.png") });
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("floor-register-marker")).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  dialog = page.getByRole("dialog");
  let download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  const [plan] = saved.floorRegisterPlans!;
  const panel = saved.pieces.find(({ id }) => id === plan.input.panelId)!;
  const [opening] = panel.rectangularOpenings!;
  expect(opening.source?.floorRegisterId).toBe(plan.id);
  expect(rectangularOpeningMarks(panel, opening)).toEqual({ axis: 1, spans: [4.25, 10.25], fromEdges: [21, 10] });

  if (!await dialog.isVisible()) await page.getByRole("button", { name: "Export", exact: true }).click();
  download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Floor register cutting and sealing");
  expect(guide).toContain("28.5 in modeled perimeter");
  expect(guide).toContain("https://www.homedepot.com/p/100197347");
  expect(page.locator(".print-guide")).toContainText("28.5 in modeled perimeter");
});
