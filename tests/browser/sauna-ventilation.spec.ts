import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema } from "../../src/model";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { cedarbrookFoil } from "../../src/saunaFoilReference";
import { cedarbrookLining } from "../../src/saunaLiningReference";

test("a sauna study saves vent openings, finds a crossed stud and exports the wall marks", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  const study = page.getByRole("dialog");
  await study
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("sauna");
  await study
    .getByRole("combobox", { name: "Clear inside height units", exact: true })
    .selectOption("in");
  await study
    .getByRole("spinbutton", { name: "Study clear inside height", exact: true })
    .fill("88");
  await study
    .getByText("Source-matched stock options", { exact: true })
    .click();
  await study
    .getByRole("combobox", { name: "Study wall and ceiling lining" })
    .selectOption(cedarbrookLining.materialId);
  await study
    .getByRole("combobox", { name: "Study wall and ceiling foil" })
    .selectOption(cedarbrookFoil.materialId);
  await study
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect(study).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const heater = page.getByText("Plan sauna heater clearance", { exact: true });
  await heater.click();
  const heat = heater.locator("..");
  await heat.getByRole("combobox", { name: "Heater package", exact: true }).selectOption("huum-steel60stuwg");
  await heat
    .getByRole("spinbutton", {
      name: "Heater center left to right",
      exact: true,
    })
    .fill("26");
  await heat
    .getByRole("spinbutton", {
      name: "Heater center back to front",
      exact: true,
    })
    .fill("24");
  await heat
    .getByRole("combobox", { name: "Supply voltage for sizing", exact: true })
    .selectOption("240");
  await heat
    .getByRole("spinbutton", {
      name: "Uninsulated brick, tile and glass wall area (sq ft)",
      exact: true,
    })
    .fill("0");
  await heat
    .getByRole("button", { name: "Save and check heater layout", exact: true })
    .click();
  const title = page.getByText("Plan sauna ventilation", { exact: true });
  await title.click();
  const panel = title.locator("..");
  await panel
    .getByRole("combobox", { name: "Supply air wall", exact: true })
    .selectOption("right");
  await panel
    .getByRole("combobox", { name: "Exhaust air wall", exact: true })
    .selectOption("left");
  for (const [role, values] of [
    ["Supply air", ["16", "18", "3", "3.5", "6"]],
    ["Exhaust air", ["16", "19", "6", "6.5", "6"]],
  ] as const) {
    for (const [index, name] of [
      "center offset",
      "height above finished floor",
      "inside duct diameter",
      "rough diameter",
      "wall depth",
    ].entries()) {
      await panel
        .getByRole("spinbutton", { name: `${role} ${name}`, exact: true })
        .fill(values[index]);
    }
  }
  await panel
    .getByRole("combobox", { name: "After-use drying", exact: true })
    .selectOption("door");
  await panel
    .getByRole("button", { name: "Save and check vent layout", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    "Modeled opening checks passed.",
  );
  await panel
    .getByRole("button", { name: "Show openings in 3D", exact: true })
    .click();
  await expect(page.getByTestId("sauna-vent-marker")).toHaveText([
    "Supply air",
    "Exhaust air",
  ]);
  await panel
    .getByRole("button", { name: "Apply openings to wall parts", exact: true })
    .click();
  await expect(
    panel.getByText(/wall parts with modeled round openings/),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Edit ventilation layout", exact: true })
    .click();
  await panel
    .getByRole("spinbutton", { name: "Exhaust air center offset", exact: true })
    .fill("24");
  await panel
    .getByRole("button", { name: "Save and check vent layout", exact: true })
    .click();
  await expect(
    panel.getByText(/^Exhaust air bore envelope crosses/),
  ).toBeVisible();
  await expect(
    panel.getByText("Applied openings differ from this layout.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Update modeled openings", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator(".print-guide")).toContainText("26.4 CFM");
  const guide = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guide).path())!, "utf8");
  expect(markdown).toMatch(
    /Sauna ventilation layout[\s\S]*Exhaust air · Left wall · Z 24 in[\s\S]*Exhaust air bore envelope crosses/,
  );
  expect(markdown).toContain(
    "Round edge cut · 3.5 in diameter through local Z",
  );
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const file = await readFile((await (await json).path())!);
  const saved = projectSchema.parse(JSON.parse(file.toString()));
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.saunaVentilationPlans?.[0].exhaust.offset).toBe(24);
  expect(
    saved.pieces.find(
      (piece) =>
        piece.material === cedarbrookLining.materialId &&
        piece.roundOpenings?.length,
    ),
  ).toBeTruthy();
  expect(
    saved.pieces.find(
      (piece) =>
        piece.material === cedarbrookFoil.materialId &&
        piece.roundOpenings?.length,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "sauna-ventilation.yardwork.json",
      mimeType: "application/json",
      buffer: file,
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  if (
    !(await panel.getByText(/^Exhaust air bore envelope crosses/).isVisible())
  )
    await title.click();
  await expect(
    panel.getByText(/^Exhaust air bore envelope crosses/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /^Prepare Home Depot list/ }).click();
  const handoff = page.getByRole("dialog");
  await handoff.getByText(/items? needs? separate review/).click();
  await expect(
    handoff.getByText(/Confirm compatible ducts, grilles/),
  ).toBeVisible();
  const checklist = page.waitForEvent("download");
  await handoff
    .getByRole("button", { name: "Download full checklist", exact: true })
    .click();
  expect(await readFile((await (await checklist).path())!, "utf8")).toMatch(
    /INCOMPLETE MATERIAL LIST[\s\S]*Sauna ventilation\nConfirm compatible ducts/,
  );
});
