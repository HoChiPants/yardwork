import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import {
  cedarDoorStop,
  greenhouseDoorKits,
  isGreenhouseDoorStop,
} from "../../src/greenhouseDoorReference";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";

test("fit cedar door stops, play both ways, and export the Home Depot cuts and purchase", async ({
  page,
}, info) => {
  const base = createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseGlazing: {
      materialId: "sunlite-8mm",
      productRegistryRef: "sunlite-132506",
    },
  }).project;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "fitted-door-stops.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(base)),
  });
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const motions = page.getByRole("region", { name: "Motion and clearance" });
  await motions.getByRole("button", { name: "Set up greenhouse door" }).click();
  await page
    .getByRole("form", { name: "Greenhouse door setup" })
    .getByRole("button", { name: "Save and test door swing" })
    .click();
  const details = page.getByRole("region", {
    name: "Greenhouse door and hardware",
  });
  const title = details.getByText("Fit door stops", { exact: true });
  await title.click();
  const stops = title.locator("..");
  await stops
    .getByRole("spinbutton", { name: "Gap behind closed leaf", exact: true })
    .fill("0.125");
  await stops
    .getByRole("spinbutton", {
      name: "Jamb stop clearance above sill",
      exact: true,
    })
    .fill("0.25");
  await stops
    .getByRole("button", { name: "Preview stop cuts", exact: true })
    .click();
  await expect(
    stops.getByText(/Head stop · 30 in long · 0\.875 in narrowest backing/),
  ).toBeVisible();
  await expect(stops.getByText(/Left jamb stop · 67 in long/)).toBeVisible();
  await stops
    .getByRole("button", { name: "Add fitted door stops", exact: true })
    .click();
  await expect(
    stops.getByText(/Head stop · P.*30 in long.*0\.125 in modeled gap/),
  ).toBeVisible();
  await expect(
    stops.getByRole("link", { name: "Cedar 1 × 2 at Home Depot" }),
  ).toHaveAttribute("href", cedarDoorStop.listing);
  const pose = page.getByTestId("motion-preview-label");
  await motions
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await expect(
    motions.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  await stops.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("greenhouse-fitted-door-stops.png"),
  });
  await motions
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id,
    CURRENT_DRAFT_KEY,
  );
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  const saved = projectSchema.parse((await response.json()).project);
  expect(
    saved.pieces.filter((piece) => isGreenhouseDoorStop(piece.designRole)),
  ).toHaveLength(3);
  expect(saved.motionPlans?.[0].memberIds).toHaveLength(6);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Fitted greenhouse door stops");
  expect(guide).toContain("Narrowest backing 0.875 in");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/3 boards .*#206460933/);
});

test("review and save the glazed greenhouse door using the actual leaf and exact hardware kit", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const base = createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseGlazing: {
      materialId: "sunlite-8mm",
      productRegistryRef: "sunlite-132506",
    },
  }).project;
  const kitId = "national-n109-025-gate-kit";
  const kit = greenhouseDoorKits[kitId];
  const original = { ...base, retailer: kit.retailer, schemaVersion: 20 };
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
      name: "glazed-greenhouse-review.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(original)),
    });
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const motions = page.getByRole("region", { name: "Motion and clearance" });
  await motions.getByRole("button", { name: "Set up greenhouse door" }).click();
  const setup = page.getByRole("form", { name: "Greenhouse door setup" });
  await setup
    .getByRole("combobox", { name: "Hinge side from outside" })
    .selectOption("right");
  await setup
    .getByRole("combobox", { name: "Door hardware reference" })
    .selectOption(kitId);
  await setup.getByRole("button", { name: "Save and test door swing" }).click();

  const details = page.getByRole("region", {
    name: "Greenhouse door and hardware",
  });
  await expect(
    details.getByText(/Right outward swing.*2 moving glazing panels/),
  ).toBeVisible();
  await expect(
    details.getByText(/Left 0\.125 in · Right 0\.125 in/),
  ).toBeVisible();
  await expect(
    details.getByRole("link", { name: "Product at Lowe's" }),
  ).toHaveAttribute("href", kit.listing);
  await details
    .getByRole("button", { name: "Add missing door hardware to list" })
    .click();
  await expect(
    details.getByText("1 planned kit · 1 in shopping list"),
  ).toBeVisible();
  await motions.getByRole("button", { name: "Play opening" }).click();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toHaveAttribute("data-pose", "90");
  await expect(
    motions.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await details.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("greenhouse-door-open.png"),
  });
  await motions.getByRole("button", { name: "Play closing" }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const download = await pending;
  await download.saveAs(
    test.info().outputPath("greenhouse-door.yardwork.json"),
  );
  const saved = projectSchema.parse(
    JSON.parse(await readFile((await download.path())!, "utf8")),
  );
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(
    saved.pieces.map((piece) => [piece.id, piece.position, piece.rotation]),
  ).toEqual(
    original.pieces.map((piece) => [piece.id, piece.position, piece.rotation]),
  );
  expect(saved.motionPlans).toHaveLength(1);
  expect(saved.motionPlans?.[0].memberIds).toHaveLength(6);
  expect(saved.supplies).toMatchObject([{ productId: kitId, quantity: 1 }]);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const response = await page.request.get(`/api/projects/${saved.id}`);
  expect(response.ok()).toBe(true);
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.motionPlans).toEqual(saved.motionPlans);
  expect(reopened.supplies).toEqual(saved.supplies);
});
