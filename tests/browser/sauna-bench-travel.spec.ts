import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../../src/buildFixtures";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, projectSchema } from "../../src/model";
import { cedarbrookBenches } from "../../src/saunaBenchReference";
import { saunaBenchTravelRooms } from "../../src/saunaBenchTravel";
import { harviaKit } from "../../src/saunaHeaterReference";
import { saveSaunaHeater } from "../../src/saunaHeaters";

test("sauna bench carry-in plays a clear route and stops before heater contact", async ({
  page,
}, info) => {
  const bench = cedarbrookBenches[1];
  const { project: source } = createBuildStudy(
    "sauna",
    defaultBuildStudyParameters("sauna"),
    blank(),
    {
      saunaBench: {
        materialId: bench.materialId,
        productRegistryRef: bench.productId,
      },
    },
  );
  const roomId = saunaBenchTravelRooms(source)[0].entry.id;
  const project = saveSaunaHeater(source, roomId, {
    productId: harviaKit.productId,
    wall: "right",
    offset: 0,
    bottom: 10,
    supply: "240",
    uninsulatedWallArea: 0,
    notes: "",
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "sauna-carry-in.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const heading = page.getByText("Test sauna bench carry-in", { exact: true });
  const section = heading.locator("..");
  await heading.click();
  await section
    .getByRole("combobox", { name: "Finished opening width units" })
    .selectOption("ft");
  for (const [label, value] of [
    ["Finished opening width", "2"],
    ["Finished opening height", "69"],
    ["Sill above the sauna floor", "1"],
    ["Doorway passage depth", "5"],
    ["Carry height above the floor", "2"],
  ]) {
    await section
      .getByRole("spinbutton", { name: label, exact: true })
      .fill(value);
  }
  const save = section.getByRole("button", {
    name: "Save and check carry-in",
    exact: true,
  });
  await save.click();
  await expect(section.getByRole("status")).toContainText("Carry-in clears");
  await expect(
    section.getByText(/Lower onto the finished floor/),
  ).toBeVisible();
  const turn = section.getByRole("button", {
    name: "Play: Turn the bench inside",
  });
  await turn.click();
  const label = page.getByTestId("motion-preview-label");
  await expect(label).toHaveAttribute("data-pose", "90");
  await page.getByRole("button", { name: "Return to bench carry-in" }).click();
  await page.getByRole("button", { name: "Exit preview" }).click();
  await expect(label).toHaveCount(0);

  await section
    .getByText("Edit carry-in measurements", { exact: true })
    .click();
  await section
    .getByRole("checkbox", { name: "Heater body is already in place" })
    .check();
  await save.click();
  await expect(section.getByRole("status")).toContainText("Carry-in blocked");
  await expect(section.getByRole("status")).toContainText(
    "Modeled heater body",
  );
  await expect(section.getByText(/Lower onto the finished floor/)).toHaveCount(
    0,
  );
  await turn.click();
  await expect(label).toContainText("Possible contact");
  const travel = Number(await label.getAttribute("data-pose"));
  expect(travel).toBeGreaterThan(50);
  expect(travel).toBeLessThan(55);
  await expect(page.getByTestId("motion-obstacle")).toHaveAttribute(
    "data-contact",
    "ahead",
  );
  await page.screenshot({
    path: info.outputPath("bench-carry-heater-contact.png"),
  });
  await page.getByRole("button", { name: "Exit preview" }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain("Sauna bench carry-in");
  expect(guide).toContain("Turn the bench inside · Modeled heater body");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const importedId = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key)!).project.id;
  }, CURRENT_DRAFT_KEY);
  const saved = await page.request.get(`/api/projects/${importedId}`);
  expect(saved.ok()).toBe(true);
  const reopened = projectSchema.parse((await saved.json()).project);
  expect(reopened.saunaBenchTravelPlans?.[0]).toMatchObject({
    roomId,
    openingWidth: 24,
    openingHeight: 69,
    passageDepth: 5,
    heaterPlaced: true,
  });
  expect(
    reopened.pieces.find(
      (piece) => piece.id === reopened.saunaBenchTravelPlans![0].benchId,
    ),
  ).toMatchObject({ position: [0, 9, -27], rotation: [0, 0, 0] });
});
