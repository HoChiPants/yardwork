import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part, projectSchema, uid } from "../../src/model";
import { reviewPanelBearing } from "../../src/panelBearing";
import { partLabel } from "../../src/partLabels";
import { formatStockLength } from "../../src/measurement";
import { makeShelfPinPlan, saveShelfPinPlan } from "../../src/attachments";
import { everbiltShelfPin } from "../../src/shelfPinReference";

test("raising a cleat updates the actual shelf bearing in 3D and in the build guide", async ({
  page,
}, info) => {
  const project = createBuildStudy("shelves").project;
  project.name = `Shelf bearing study ${uid().slice(0, 8)}`;
  const [{ piece: shelf }] = reviewPanelBearing(project);
  const [x, y, z] = shelf.position;
  const fullHeight = y - shelf.size[1] / 2 - 0.75;
  const cleat = (side: number, gap: number) =>
    part(
      side < 0 ? "Left cleat" : "Right cleat",
      "stud",
      [1.5, 1.5, 10],
      [x + side * (shelf.size[0] / 2 - 0.75), fullHeight - gap, z],
      project.steps[0].id,
      "Cleats",
    );
  const left = cleat(-1, 0);
  const right = cleat(1, 1.5);
  project.pieces.push(left, right);
  const label = partLabel(project, shelf.id);

  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const open = page.getByRole("dialog");
  await open
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await open
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "shelf-bearing.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(open).toHaveCount(0);
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  await checks.click();
  const bearing = page.getByRole("button", {
    name: new RegExp(`^Shelf bearing · ${label}`),
  });
  await expect(bearing).toContainText("1 wood contact underneath");
  await expect(bearing).toContainText(
    "outside the area between the wood contacts",
  );
  await expect(bearing).toHaveClass(/warning/);
  await bearing.click();
  const marker = page.getByTestId("panel-bearing-marker");
  await expect(marker).toHaveAttribute("data-contact-patches", "1");
  await expect(page.getByRole("toolbar", { name: "Model tools" })).toBeHidden();
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${right.id}"]`).click();
  const height = page.getByRole("spinbutton", { name: "Y", exact: true });
  await height.fill(String(fullHeight));
  await height.press("Tab");
  await expect
    .poll(async () => {
      const saved = await page.evaluate(
        (key) => localStorage.getItem(key),
        CURRENT_DRAFT_KEY,
      );
      const piece =
        saved &&
        projectSchema
          .parse(JSON.parse(saved).project)
          .pieces.find(({ id }) => id === right.id);
      return piece ? piece.position[1] : -1;
    })
    .toBeCloseTo(fullHeight, 7);

  await checks.click();
  await expect(bearing).toContainText("2 wood contacts underneath");
  await expect(bearing).toHaveClass(/info/);
  await bearing.click();
  await expect(marker).toHaveAttribute("data-contact-patches", "2");
  await page.screenshot({
    path: info.outputPath("shelf-wood-bearing.png"),
    animations: "disabled",
  });
  const shelfSpans = page.getByRole("button", {
    name: new RegExp(`^Shelf spans · ${label}`),
  });
  await expect(shelfSpans).toContainText(
    `${formatStockLength(shelf.size[0] - 3)} between contacts`,
  );
  await shelfSpans.click();
  await expect(page.getByTestId("shelf-span-marker")).toHaveAttribute(
    "data-contact-patches",
    "2",
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Shelf and seat bearing");
  expect(guide).toContain(
    `${label} · ${shelf.name} · 2 wood contacts underneath`,
  );
  expect(guide).toContain(
    `Across the shelf, ${formatStockLength(shelf.size[0] - 3)} between contacts`,
  );
  await expect(page.locator(".print-guide")).toContainText(
    `${label} · ${shelf.name} · 2 wood contacts underneath`,
  );
});

test("measured closet pin spans appear in 3D and the guide and expire when the shelf moves", async ({
  page,
}, info) => {
  const project = createBuildStudy("closet-insert").project;
  project.name = `Closet pin span study ${uid().slice(0, 8)}`;
  const shelf = project.pieces.find(
    ({ designRole }) => designRole === "tower-shelf-1",
  )!;
  const pinned = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, project.ideaBindings[0].entries[0].id, {
      productId: everbiltShelfPin.productId,
      shelfRoles: ["tower-shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
      measurements: {
        pinInsertionDepth: 0.2,
        bearingReach: 0.25,
        bearingOffset: 0.05,
        fullDiameterBoreDepth: 0.25,
        deepestDrillTipDepth: 0.3,
        basis: "Synthetic measured pins for testing",
        measuredAt: new Date(Date.now() - 60_000).toISOString(),
      },
    }),
  );
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
      name: "closet-pin-span.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(pinned)),
    });
  await expect(dialog).toHaveCount(0);
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  const label = partLabel(project, shelf.id);
  const span = page.getByRole("button", {
    name: new RegExp(`^Shelf spans · ${label}`),
  });
  const bearing = page.getByRole("button", {
    name: new RegExp(`^Shelf bearing · ${label}`),
  });
  const expected = formatStockLength(shelf.size[0] - 0.5);
  await checks.click();
  await expect(span).toContainText(
    `Front pin row, ${expected} between contacts`,
  );
  await expect(span).toContainText(
    `Rear pin row, ${expected} between contacts`,
  );
  await span.click();
  const marker = page.getByTestId("shelf-span-marker");
  await expect(marker).toHaveAttribute("data-contact-patches", "0");
  await expect(marker).toHaveAttribute("data-pin-reaches", "4");
  await expect(marker).toHaveAttribute("data-span-lines", "2");
  await page.screenshot({
    path: info.outputPath("closet-pin-spans.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain(`Front pin row, ${expected} between contacts`);
  await expect(page.locator(".print-guide")).toContainText(
    `Rear pin row, ${expected} between contacts`,
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${shelf.id}"]`).click();
  const height = page.getByRole("spinbutton", { name: "Y", exact: true });
  await height.fill(String(shelf.position[1] + 1));
  await height.press("Tab");
  await expect(height).toHaveValue(String(shelf.position[1] + 1));
  await checks.click();
  await expect(span).toHaveCount(0);
  await expect(bearing).toHaveClass(/warning/);
  await expect(bearing).toContainText(
    "0 of 4 planned shelf-pin locations passed geometry review",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(span).toContainText(
    `Front pin row, ${expected} between contacts`,
  );
});

test("a part's floor trace follows the actual support and updates when that support moves", async ({
  page,
}) => {
  const project = blank("Wood contact trace");
  const base = part(
    "Support block",
    "stud",
    [3.5, 3, 12],
    [0, 1.5, 0],
    project.steps[0].id,
    "Test",
  );
  const top = part(
    "Top board",
    "stud",
    [3.5, 1.5, 24],
    [0, 3.75, 0],
    project.steps[0].id,
    "Test",
  );
  project.pieces = [base, top];

  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const open = page.getByRole("dialog");
  await open
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await open
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "wood-support.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(open).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const pickTop = page.locator(`button.step-part[data-part-id="${top.id}"]`);
  await pickTop.click();
  const trace = page.locator(".wood-support");
  await trace.locator("summary").click();
  await expect(trace).toContainText(
    "Follow one contact path down to the floor.",
  );
  await trace.getByRole("button", { name: "P001 · Support block" }).click();
  await expect(trace).toContainText(
    "A retained face rests on the modeled floor.",
  );
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("15");
  await x.press("Tab");
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  const warning = page.getByRole("button", {
    name: /^1 part\(s\) need support review/,
  });
  await expect(warning).toContainText("Top board");
  await expect(warning).toContainText(
    "lack a retained-face contact path to the floor",
  );
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await pickTop.click();
  await trace.locator("summary").click();
  await expect(trace.getByText(/^No bearing face reaches/)).toBeVisible();
  const printed = page.locator(".wood-support-print");
  await expect(printed).toContainText("P002 · Top board");
  await expect(printed).toContainText("1 of 2 modeled wood parts");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await event).path())!, "utf8");
  expect(guide).toContain("## Wood contact to floor");
  expect(guide).toContain(
    "P002 · Top board · No bearing face reaches another wood part or the floor.",
  );
});

test("moving a banquette panel reveals a seat overhang in 3D and the exported guide", async ({
  page,
}, info) => {
  const project = createBuildStudy("storage-banquette").project;
  const [{ piece: seat }] = reviewPanelBearing(project);
  const front = project.pieces.find(
    (piece) => piece.name === "Banquette section 1 · storage front",
  )!;
  const label = partLabel(project, seat.id);
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
      name: "seat-span.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  const span = page.getByRole("button", {
    name: new RegExp(`^Seat spans · ${label}`),
  });
  await checks.click();
  await expect(span).toContainText("19.5 in between contacts");
  await span.click();
  const marker = page.getByTestId("seat-span-marker");
  await expect(marker).toHaveAttribute("data-span-lines", "2");
  await expect(marker).toHaveAttribute("data-contact-patches", "8");

  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${front.id}"]`).click();
  const z = page.getByRole("spinbutton", { name: "Z", exact: true });
  const shiftedDepth = front.position[2] + 1;
  await z.fill(String(shiftedDepth));
  await z.press("Tab");
  await expect(z).toHaveValue(String(shiftedDepth));
  await checks.click();
  await expect(span).toContainText("0.75 in edge overhang");
  await span.click();
  await expect(marker).toHaveAttribute("data-span-lines", "3");
  await expect(marker).toHaveAttribute("data-contact-patches", "7");
  await page.screenshot({
    path: info.outputPath("banquette-seat-spans.png"),
    animations: "disabled",
  });
  await expect(page.locator(".print-guide")).toContainText(
    "0.75 in edge overhang",
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await event).path())!, "utf8");
  expect(guide).toContain("## Shelf and seat bearing");
  expect(guide).toContain("0.75 in edge overhang");
  expect(guide).toContain("Seating capacity still needs review.");

  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(span).not.toContainText("edge overhang");
});
