import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { previewFastenerContactRow } from "../../src/fastenerContactRow";
import { fastenerReviews, saveFastenerPlan } from "../../src/fastenings";
import { generateBuildGuide } from "../../src/guide";
import { part, projectSchema, type V3 } from "../../src/model";

test("banquette driver clearance shows the blocking panel and saves the assembly window", async ({
  page,
}, info) => {
  const base = createBuildStudy("storage-banquette").project;
  const members = base.pieces.filter(({ id }) =>
    base.sections[0].pieceIds.includes(id),
  );
  const head = members.find(({ designRole }) => designRole === "storage-rear")!;
  const receiver = members.find(({ designRole }) => designRole === "leg")!;
  const seed = previewFastenerContactRow(
    base,
    head.id,
    receiver.id,
    {
      count: 2,
      endInset: 2,
      beforeFloorPlacement: false,
    },
    { productId: "grk-cabinet-114069" },
  ).plan;
  const withScrews = saveFastenerPlan(base, {
    ...seed,
    name: "Rear shell to leg",
    measurements: {
      surfaceToTipDepth: 1.125,
      pilotDiameter: 0.0625,
      pilotDepth: 1,
      basis: "Software test measurements",
      measuredAt: new Date().toISOString(),
    },
  });
  const { entranceWorld, driveWorld } =
    fastenerReviews(withScrews)[0].locations[0];
  const cover = part(
    "Rear access cover",
    "plywood",
    [3, 3, 0.75],
    entranceWorld!.map((value, axis) => value - driveWorld![axis] * 4) as V3,
    base.steps[0].id,
    "Access cover",
  );
  const project = generateBuildGuide({
    ...withScrews,
    pieces: [...withScrews.pieces, cover],
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "banquette-driver-access.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan wood-fastener locations", exact: true })
    .click();
  await page.getByRole("button", { name: /W001 · Rear shell to leg/ }).click();
  const summary = page.getByText("Check driver clearance", { exact: true });
  await summary.click();
  const panel = summary.locator("..");
  await panel
    .getByRole("combobox", {
      name: "Tool body length along bit units",
      exact: true,
    })
    .selectOption("ft");
  for (const [name, value] of [
    ["Exposed bit reach", "2"],
    ["Bit or holder width", "0.25"],
    ["Tool body length along bit", "0.333333333333"],
    ["Widest part of tool body", "2"],
  ]) {
    await panel.getByRole("spinbutton", { name, exact: true }).fill(value);
  }
  await panel
    .getByRole("button", { name: "Check tool approach", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    "Using saved guide order.",
  );
  await expect(
    panel.getByText("W001/F001 · Fasten before adding a later part", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByText(/Dry-fit both screw members.*before.*Rear access cover/),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Show approach for W001/F001", exact: true })
    .click();
  await expect(page.getByTestId("driver-approach-marker")).toHaveAttribute(
    "data-state",
    "before-stage",
  );
  await page.screenshot({
    path: info.outputPath("banquette-driver-window.png"),
  });
  await page.getByRole("button", { name: "Hide driver approach" }).click();
  await expect(page.getByTestId("driver-approach-marker")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await file).path())!, "utf8");
  expect(guide).toContain("Driver clearance and assembly order");
  expect(guide).toMatch(/W001\/F001.*before.*Rear access cover/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
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
  const persisted = projectSchema.parse((await response.json()).project);
  expect(persisted.fastenerPlans[0].driverAccess).toMatchObject({
    bitReach: 2,
    bodyWidth: 2,
    shaftWidth: 0.25,
    approachTravel: 0,
  });
  expect(persisted.fastenerPlans[0].driverAccess?.bodyLength).toBeCloseTo(4, 8);
  expect(persisted.pieces.find(({ id }) => id === cover.id)?.position).toEqual(
    cover.position,
  );
});
