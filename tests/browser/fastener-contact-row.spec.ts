import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { part } from "../../src/model";
import { reviewPanelBearing } from "../../src/panelBearing";
import { previewShelfDivider } from "../../src/shelfDivider";
import { saveShelfSagPlan, shelfSagGeometry } from "../../src/shelfSag";

test("fitted divider joints place screw rows, catch receiver pilot breakout and export the assembly sequence", async ({
  page,
}, info) => {
  const project = createBuildStudy("shelves").project;
  project.name = "Synthetic divider screw rows";
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
  const row = reviewPanelBearing(project).find(
    ({ piece }) => piece.id === shelf.id,
  )!;
  const planned = saveShelfSagPlan(project, shelf.id, {
    ...shelfSagGeometry(row)!.identity,
    weight: 120,
    stiffness: 200000,
    target: 0.125,
    basis: "Synthetic browser QA sheet reference",
  });
  const fit = previewShelfDivider(planned, shelf.id, "plytanium-703", false);
  const { divider, baseId } = fit;
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
      name: "divider-row.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fit.project)),
    });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${divider.id}"]`).click();
  const support = page.locator(".wood-support");
  await support.locator("summary").click();
  await support
    .getByRole("button", { name: "Review bearing joints", exact: true })
    .click();
  const upper = page.locator(`[data-bearing-pair="${shelf.id}/${divider.id}"]`);
  await upper.getByRole("button", { name: /^Plan wood screws/ }).click();
  const panel = page.getByRole("region", {
    name: "Wood fastener plans",
    exact: true,
  });
  const selectProduct = () =>
    panel
      .getByRole("combobox", { name: "New screw product", exact: true })
      .selectOption("grk-cabinet-114069");
  const openRow = async () => {
    await panel
      .getByText("Lay out a row along the joint", { exact: true })
      .click();
    await panel
      .getByRole("spinbutton", { name: "Number of row marks", exact: true })
      .fill("3");
    await panel
      .getByRole("spinbutton", {
        name: "Inset from each contact end",
        exact: true,
      })
      .fill("2");
  };
  const preview = panel.getByRole("button", {
    name: "Preview screw row",
    exact: true,
  });
  const use = panel.getByRole("button", { name: "Use screw row", exact: true });
  await selectProduct();
  await openRow();
  await preview.click();
  const markers = page.getByTestId("fastener-contact-row-marker");
  await expect(markers).toHaveCount(3);
  await expect(
    panel.getByRole("region", { name: "Screw row preview", exact: true }),
  ).toContainText("5.5 in on center");
  await page.screenshot({
    path: info.outputPath("divider-contact-row.png"),
    animations: "disabled",
  });
  await use.click();
  await expect(markers).toHaveCount(0);
  const purchase = panel.locator(
    '[data-fastener-product-id="grk-cabinet-114069"]',
  );
  await expect(purchase).toContainText("3 included screw locations");
  const editor = panel.locator(".fastener-plan-editor");
  const measurements = editor.getByText(
    "User measurements · unknown values stay blank",
    { exact: true },
  );
  await measurements.click();
  const dimension = (name: string) =>
    editor.getByRole("spinbutton", { name, exact: true });
  await dimension("Surface-to-tip depth after seating").fill("1.25");
  await dimension("Deepest pilot drill-tip depth").fill("1");
  await dimension("User pilot diameter").fill("0.75");
  await editor
    .getByRole("textbox", { name: "Fastener measurement basis", exact: true })
    .fill("Synthetic browser QA measurement");
  await editor
    .getByLabel("Fastener measurement date", { exact: true })
    .fill("2026-11-19T10:00");
  const save = editor.getByRole("button", {
    name: "Save fastener plan",
    exact: true,
  });
  await save.click();
  const upperPlan = panel.locator("[data-fastener-plan-id]").first();
  await expect(upperPlan).toContainText(
    "The entered pilot envelope reaches a retained edge",
  );
  await expect(purchase).toContainText("3 locations excluded");
  if (
    !(await measurements.evaluate(
      (node) => (node.parentElement as HTMLDetailsElement).open,
    ))
  )
    await measurements.click();
  await dimension("User pilot diameter").fill("0.125");
  await save.click();
  await expect(purchase).toContainText("3 included screw locations");
  await expect(purchase).toContainText("0 locations excluded");

  await panel
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  const lower = page.locator(`[data-bearing-pair="${divider.id}/${baseId}"]`);
  await lower.getByRole("button", { name: /^Plan wood screws/ }).click();
  await panel
    .getByRole("button", { name: "Swap entry and receiver", exact: true })
    .click();
  await selectProduct();
  await openRow();
  await preview.click();
  await expect(panel.getByRole("alert")).toContainText(
    "The modeled floor blocks access",
  );
  await expect(markers).toHaveCount(0);
  await panel
    .getByRole("combobox", { name: "Entry access", exact: true })
    .selectOption("before");
  await preview.click();
  await expect(markers).toHaveCount(3);
  await use.click();
  await expect(purchase).toContainText("6 included screw locations");
  await purchase.getByRole("button", { name: /^Add missing packs/ }).click();
  await expect(purchase).toContainText("Selected boxes: 1");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id as string,
    CURRENT_DRAFT_KEY,
  );
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  const { project: saved } = await response.json();
  expect(
    saved.fastenerPlans.map(
      ({ locations }: { locations: unknown[] }) => locations.length,
    ),
  ).toEqual([3, 3]);
  expect(saved.fastenerPlans[0].measurements.pilotDiameter).toBe(0.125);
  expect(saved.fastenerPlans[1].notes).toContain("Floor-side access");
  expect(saved.supplies).toHaveLength(1);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Contact row mark 3");
  expect(guide).toContain(
    "Plan these entries before setting the assembly down",
  );
  expect(guide).toContain("6 provisional screws; 100/pack");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/1 .*#203556408/);
});
