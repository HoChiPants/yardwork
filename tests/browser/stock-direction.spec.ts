import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect } from "@playwright/test";
import { blank, part } from "../../src/model";
test("a short fluted panel keeps its stock axis through cuts and saved JSON", async ({
  page,
}) => {
  const p = blank("Flute direction"),
    panel = part(
      "Above-door panel",
      "sunlite-8mm",
      [24, 8, 8 / 25.4],
      [0, 24, 0],
      p.steps[0].id,
      "Glazing",
    );
  panel.stockLengthAxis = 1;
  p.pieces = [panel];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "flutes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .locator(`button.step-part[data-part-id="${p.pieces[0].id}"]`)
    .click();
  await expect(
    page.getByRole("combobox", { name: "Stock length axis", exact: true }),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Retained length", exact: true }),
  ).toHaveValue("8");
  await expect(
    page.getByRole("spinbutton", { name: "Retained width", exact: true }),
  ).toHaveValue("2");
  const widthUnits = page.getByLabel("Retained width units", { exact: true });
  await expect(widthUnits).toHaveValue("ft");
  await widthUnits.selectOption("in");
  await expect(
    page.getByRole("spinbutton", { name: "Retained width", exact: true }),
  ).toHaveValue("24");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("4");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        (draftKey) =>
          JSON.parse(localStorage.getItem(draftKey) ?? "null")?.project.pieces
            .length,
        CURRENT_DRAFT_KEY,
      ),
    )
    .toBe(2);
  const saved = await page.evaluate(
    (draftKey) => JSON.parse(localStorage.getItem(draftKey)!).project,
    CURRENT_DRAFT_KEY,
  );
  expect(
    saved.pieces.every(
      (piece: { stockLengthAxis: number }) => piece.stockLengthAxis === 1,
    ),
  ).toBeTruthy();
  expect(saved.pieces[0].size[0]).toBe(24);
  expect(saved.pieces[0].size[1]).toBe(4);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row")).toContainText("1 panel");
});
