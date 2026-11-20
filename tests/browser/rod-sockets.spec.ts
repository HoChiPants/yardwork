import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import { everbiltClosetRod, everbiltRodBracket } from "../../src/closetRodReference";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { part, projectSchema, type V3 } from "../../src/model";
import { partLabel } from "../../src/partLabels";
import { closetRods, rodBay, saveRodFit } from "../../src/rodFits";
import { socketFaceAxes } from "../../src/rodMountGeometry";

test("the closet center bracket checks transferred holes in wood and carries the exact bracket into the guide and list", async ({ page }, info) => {
  const project = createBuildStudy("closet-insert", undefined, undefined, {
    closetRod: { materialId: everbiltClosetRod.materialId, productRegistryRef: everbiltClosetRod.productId },
  }).project;
  const rod = closetRods(project)[0];
  const bay = rodBay(project, rod.id);
  const station = bay.start.t + bay.span / 2;
  const [x, y, z] = bay.axis.toArray().map((value, i) => rod.position[i] + value * station);
  const backing = part("Measured bracket backing", "stud", [3.5, 10, 1.5], [x, y - 2, z - 11.75] as V3, project.steps[0].id, "Wall");
  const fixture = saveRodFit({ ...project, pieces: [...project.pieces, backing] }, rod.id, {
    measuredSpan: bay.span, startSetback: 0.25, endSetback: 0.125, clearance: 0.125,
    closedEnd: "start", basis: "Synthetic field data for the browser", measuredAt: "2026-11-19T08:00:00.000Z",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "closet-center-bracket.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByText("Fit closet rods · 2", { exact: true }).click();
  await page.getByRole("combobox", { name: "Closet rod", exact: true }).selectOption(rod.id);
  await page.getByRole("button", { name: "Update rod to measured fit", exact: true }).click();
  await page.getByText("Intermediate rod supports · 0", { exact: true }).click();
  await page.getByRole("button", { name: "Add support position", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Support distance from start face", exact: true }).fill(String(bay.span / 2));
  await page.getByRole("textbox", { name: "Backing notes", exact: true }).fill("Transferred on the synthetic wood backing.");
  await page.getByRole("combobox", { name: "Bracket model", exact: true }).selectOption(everbiltRodBracket.model);
  await page.getByRole("spinbutton", { name: "Wall to rod center", exact: true }).fill("11");
  await page.getByRole("spinbutton", { name: "Delivered bracket reach", exact: true }).fill("11");
  await page.getByRole("button", { name: "Save support position", exact: true }).click();
  const heading = page.getByText("Transfer center bracket holes", { exact: true });
  await heading.click();
  const mount = heading.locator("..");
  await mount.getByRole("combobox", { name: "Bracket backing", exact: true }).selectOption(backing.id);
  for (const [label, value] of [
    ["Backplate width (in)", "1.25"],
    ["Backplate height (in)", "5"],
    ["Plate center above rod (in)", "-2"],
    ["Pilot diameter (in)", "0.125"],
    ["Pilot tip depth past wood face (in)", "1.6"],
    ["Screw outer diameter (in)", "0.2"],
    ["Seated screw depth past wood face (in)", "1"],
    ["Hole 1 offset along rod (in)", "0"],
    ["Hole 1 offset up (in)", "-1"],
  ]) await mount.getByRole("spinbutton", { name: label, exact: true }).fill(value);
  await mount.getByRole("button", { name: "Add bracket hole", exact: true }).click();
  await mount.getByRole("spinbutton", { name: "Hole 2 offset along rod (in)", exact: true }).fill("0");
  await mount.getByRole("spinbutton", { name: "Hole 2 offset up (in)", exact: true }).fill("1");
  await mount.getByRole("textbox", { name: "Bracket measurement notes", exact: true }).fill("Synthetic transferred plate and pilot measurements");
  const save = mount.getByRole("button", { name: "Save bracket mounting marks", exact: true });
  await save.click();
  await expect(mount.getByTestId("rod-bracket-mount-status")).toHaveAttribute("data-state", "conflict");
  await expect(mount.getByText(/Hole 1 · Pilot envelope reaches or passes/)).toBeVisible();
  await mount.getByRole("spinbutton", { name: "Pilot tip depth past wood face (in)", exact: true }).fill("1");
  await save.click();
  await expect(mount.getByTestId("rod-bracket-mount-status")).toHaveAttribute("data-state", "checked");
  await page.getByRole("button", { name: "Show support positions in 3D", exact: true }).click();
  await expect(page.getByTestId("rod-support-marker")).toContainText("2 bracket holes");
  await mount.getByTestId("rod-bracket-mount-status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("rod-center-bracket-holes.png") });

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByText("Everbilt 14317 closet rod brackets", { exact: true }).click();
  await page.getByRole("button", { name: "Add missing Everbilt rod brackets", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/1 intermediate bracket .*#206086899/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.id, CURRENT_DRAFT_KEY);
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  const parsed = projectSchema.parse((await response.json()).project);
  expect(parsed.rodFitPlans?.[0].intermediateSupports?.[0].mounting).toMatchObject({ pieceId: backing.id, pilotDepth: 1 });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  expect(await readFile((await (await pending).path())!, "utf8")).toContain("Bracket hole 2 · local X/Y/Z from backing blank center · 0 in, 1 in, 0.75 in");
});

test("a measured 311V backplate and transferred holes show and clear conflicts on the actual closet panel", async ({
  page,
}, info) => {
  const project = createBuildStudy(
    "closet-insert",
    defaultBuildStudyParameters("closet-insert"),
    undefined,
    {
      closetRod: {
        materialId: everbiltClosetRod.materialId,
        productRegistryRef: everbiltClosetRod.productId,
      },
    },
  ).project;
  const rod = closetRods(project)[0];
  const bay = rodBay(project, rod.id);
  const frame = socketFaceAxes(bay.start.normalLocal)!;
  const [u, v] = frame.across;
  const cut = projectSchema.parse({
    ...project,
    name: "Synthetic Everbilt socket envelope",
    pieces: project.pieces.map((piece) =>
      piece.id === bay.start.pieceId
        ? {
            ...piece,
            roundOpenings: [
              {
                axis: frame.axis,
                center: [
                  bay.start.pointLocal[u] + 1.1,
                  bay.start.pointLocal[v] + 0.1,
                ],
                diameter: 0.4,
              },
            ],
          }
        : piece,
    ),
  });
  const fixture = saveRodFit(cut, rod.id, {
    measuredSpan: bay.span,
    startSetback: 0.25,
    endSetback: 0.125,
    clearance: 0.125,
    closedEnd: "start",
    basis: "Synthetic opening measurement at the selected rod height.",
    measuredAt: "2026-11-19T08:00:00.000Z",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "synthetic-socket.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByText("Fit closet rods · 2", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Closet rod", exact: true })
    .selectOption(rod.id);
  await page.getByText("End socket backplates", { exact: true }).click();
  await page
    .getByText(`Start socket · ${partLabel(fixture, bay.start.pieceId)}`, {
      exact: true,
    })
    .click();
  const axes = ["X", "Y", "Z"];
  for (const [direction, text] of [
    [`−${axes[u]}`, "0.7"],
    [`+${axes[u]}`, "1.3"],
    [`−${axes[v]}`, "0.7"],
    [`+${axes[v]}`, "0.7"],
  ])
    await page
      .getByLabel(`Start reach ${direction}`, { exact: true })
      .fill(text);
  await page
    .getByLabel("Start backplate measurement notes", { exact: true })
    .fill("Synthetic backplate measurements");
  const save = page.getByRole("button", {
    name: "Save start backplate",
    exact: true,
  });
  await save.click();
  const review = page.getByTestId("rod-socket-review-start");
  await expect(review).toContainText(
    "The backplate envelope crosses a through-cut",
  );
  await page
    .getByRole("button", { name: "Show socket mounts in 3D", exact: true })
    .click();
  const marker = page.getByTestId("rod-socket-marker-start");
  await expect(marker).toHaveAttribute("data-state", "conflict");
  await expect(marker).toContainText("check backing");
  await page.getByLabel(`Start reach +${axes[u]}`, { exact: true }).fill("0.7");
  await save.click();
  await expect(review).toContainText("fits on retained panel material");
  await expect(marker).toHaveAttribute("data-state", "backed");

  await page.getByText("Start socket mounting holes", { exact: true }).click();
  for (const [index, offsetU] of [
    [1, "-0.6"],
    [2, "0.6"],
  ] as const) {
    if (index === 2)
      await page
        .getByRole("button", { name: "Add start hole", exact: true })
        .click();
    await page
      .getByRole("spinbutton", {
        name: `Start hole ${index} offset ${axes[u]}`,
        exact: true,
      })
      .fill(offsetU);
    await page
      .getByRole("spinbutton", {
        name: `Start hole ${index} offset ${axes[v]}`,
        exact: true,
      })
      .fill("0.55");
  }
  for (const [field, value] of [
    ["Pilot diameter (in)", "0.125"],
    ["Deepest pilot tip past wood face (in)", "0.8"],
    ["Screw outer diameter (in)", "0.18"],
    ["Seated screw tip past wood face (in)", "0.5"],
  ])
    await page
      .getByRole("spinbutton", { name: field, exact: true })
      .fill(value);
  await page
    .getByRole("textbox", { name: "Start hole measurement notes", exact: true })
    .fill("Synthetic transferred hole pattern and depth measurements.");
  const saveHoles = page.getByRole("button", {
    name: "Save start mounting holes",
    exact: true,
  });
  await saveHoles.click();
  const holes = page.getByTestId("rod-socket-holes-start");
  await expect(holes).toHaveAttribute("data-state", "conflict");
  await expect(marker).toHaveAttribute("data-hole-state", "conflict");
  await expect(marker).toHaveAttribute("data-hole-count", "2");
  await expect(
    page
      .getByRole("complementary", { name: "Inspector" })
      .getByText(/Hole 1 · Pilot envelope reaches or passes the back/),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", {
      name: "Deepest pilot tip past wood face (in)",
      exact: true,
    })
    .fill("0.3");
  await saveHoles.click();
  await expect(holes).toContainText(
    "2 mounting paths fit in the modeled panel",
  );
  await expect(marker).toHaveAttribute("data-hole-state", "checked");
  await page.screenshot({
    path: info.outputPath("closet-socket-mounting-holes.png"),
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const handbook = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await handbook).path())!, "utf8");
  expect(guide).toContain("Start socket backplate");
  expect(guide).toContain("Synthetic backplate measurements");
  expect(guide).toContain("Hole 1 · local X/Y/Z from the panel blank center");
  expect(guide).toContain(
    "Synthetic transferred hole pattern and depth measurements.",
  );
  await expect(page.locator(".print-guide")).toContainText(
    "Start socket backplate",
  );
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const file = await readFile((await (await pending).path())!);
  const saved = projectSchema.parse(JSON.parse(file.toString()));
  expect(saved.rodFitPlans?.[0].socketPlates?.start).toMatchObject({
    socket: "closed",
    extents: [0.7, 0.7, 0.7, 0.7],
    face: { pieceId: bay.start.pieceId },
    holeLayout: {
      centers: [
        [-0.6, 0.55],
        [0.6, 0.55],
      ],
      pilotDepth: 0.3,
      screwDepth: 0.5,
    },
  });
  const actual = await page.request.get(`/api/projects/${saved.id}`);
  expect(actual.ok()).toBe(true);
  expect((await actual.json()).project.rodFitPlans).toEqual(saved.rodFitPlans);

  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "socket-envelope.yardwork.json",
    mimeType: "application/json",
    buffer: file,
  });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByText("Fit closet rods · 2", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Closet rod", exact: true })
    .selectOption(rod.id);
  await page.getByText("End socket backplates", { exact: true }).click();
  await page
    .getByText(`Start socket · ${partLabel(fixture, bay.start.pieceId)}`, {
      exact: true,
    })
    .click();
  await expect(review).toContainText("fits on retained panel material");
  await expect(holes).toHaveAttribute("data-state", "checked");
});
