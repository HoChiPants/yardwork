import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { cutPiece } from "../../src/engine";
import { material, part } from "../../src/model";
import { reviewPanelBearing } from "../../src/panelBearing";
import { saveShelfSagPlan, shelfSagGeometry } from "../../src/shelfSag";

test("a shelf warning previews and adds a fitted divider from an existing sheet source", async ({
  page,
}, info) => {
  const project = createBuildStudy("shelves").project;
  project.name = "Synthetic shelf divider study";
  const [{ piece: shelf }] = reviewPanelBearing(project);
  const [width, thickness, depth] = shelf.size;
  for (const direction of [-1, 1])
    project.pieces.push(
      part(
        "Shelf side cleat",
        "stud",
        [1.5, 1.5, depth],
        [
          shelf.position[0] + direction * (width / 2 - 0.75),
          shelf.position[1] - thickness / 2 - 0.75,
          shelf.position[2],
        ],
        shelf.stepId,
        shelf.assembly,
      ),
    );
  const stock = material("plytanium-703");
  const retained = part(
    "Prior sheet cut",
    stock.id,
    [...stock.size],
    [46, stock.size[1] / 2, (stock.size[2] - 60) / 2],
    shelf.stepId,
    "Cut pool fixture",
  );
  retained.stockLengthAxis = 2;
  project.pieces.push(retained);
  const prepared = cutPiece(project, retained.id, 60, 2);
  const reusable = prepared.pieces.find(({ offcut }) => offcut)!;
  const row = reviewPanelBearing(prepared).find(
    ({ piece }) => piece.id === shelf.id,
  )!;
  const planned = saveShelfSagPlan(prepared, shelf.id, {
    ...shelfSagGeometry(row)!.identity,
    weight: 120,
    stiffness: 200000,
    target: 0.125,
    basis: "Synthetic browser QA sheet reference",
  });

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
      name: "shelf-divider.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(planned)),
    });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${shelf.id}"]`).click();
  const pane = page
    .locator(".connection-settings")
    .filter({ has: page.getByText("Shelf sag estimate", { exact: true }) });
  await pane.getByText("Shelf sag estimate", { exact: true }).click();
  await expect(pane.getByRole("status")).toContainText(
    "Exceeds the 0.125 in target",
  );
  await pane.getByText("Try a center divider", { exact: true }).click();
  await pane
    .getByRole("combobox", { name: "Divider sheet stock", exact: true })
    .selectOption(stock.id);
  await pane
    .getByRole("button", { name: "Preview center divider", exact: true })
    .click();
  const marker = page.getByTestId("shelf-divider-preview-marker");
  await expect(marker).toBeVisible();
  const summary = page.getByLabel("Center divider fit");
  await expect(summary).toContainText(
    "17.0625 in tall · 15 in deep · 0.703 in thick",
  );
  await expect(summary).toContainText("from the cut pool");
  await expect(summary).toContainText("Longest span 33 in → 16.5 in");
  await expect(page.locator(".statusbar")).toContainText("11 parts");
  await page.screenshot({
    path: info.outputPath("center-divider-preview.png"),
    animations: "disabled",
  });
  await summary
    .getByRole("button", { name: "Add center divider", exact: true })
    .click();
  await expect(marker).toHaveCount(0);
  await expect(pane.getByRole("status")).toContainText(
    "Within the 0.125 in target",
  );
  await expect(page.locator(".statusbar")).toContainText("12 parts");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  const finding = page.getByRole("button", { name: /^Shelf sag estimate ·/ });
  await expect(finding).toContainText("Exceeds the 0.125 in target");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(finding).toContainText("Within the 0.125 in target");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id as string,
    CURRENT_DRAFT_KEY,
  );
  const saved = await page.request.get(`/api/projects/${id}`);
  expect(saved.ok()).toBe(true);
  const result = (await saved.json()).project;
  const divider = result.pieces.find(
    ({ id }: { id: string }) => id === reusable.id,
  );
  expect(divider).toMatchObject({
    material: stock.id,
    offcut: false,
    cutStock: { id: reusable.cutStock!.id },
  });
  expect(
    result.pieces.filter(
      (piece: typeof reusable) =>
        piece.offcut && piece.cutStock?.id === reusable.cutStock!.id,
    ),
  ).toHaveLength(2);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog
    .locator(".project-list > button")
    .filter({ hasText: project.name })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await exportEvent).path())!, "utf8");
  expect(guide).toContain("Shelf divider · Adjustable shelf 1");
  expect(guide).toContain("Within the 0.125 in target");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/1 sheet.*#100061386/);
});
