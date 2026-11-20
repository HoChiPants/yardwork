import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { caseworkTipUpChoices } from "../../src/caseworkTipUp";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema, type Project } from "../../src/model";

test("casework tip-up stops at the ceiling and replays a clear lift and slide", async ({
  page,
}, info) => {
  const { project } = createBuildStudy("closet-insert");
  const entryId = caseworkTipUpChoices(project)[0].entry.id;
  const poses = (value: Project) =>
    value.pieces.map(({ id, position, rotation }) => ({
      id,
      position,
      rotation,
    }));

  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "closet-tip-up.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const heading = page.getByText("Test casework tip-up", { exact: true });
  const section = heading.locator("..");
  await heading.click();
  const ceiling = section.getByRole("spinbutton", {
    name: "Lowest ceiling height above floor",
    exact: true,
  });
  const save = section.getByRole("button", {
    name: "Save and check tip-up",
    exact: true,
  });
  await ceiling.fill("85");
  await save.click();
  await expect(section.getByRole("status")).toContainText("Tip-up blocked");
  await expect(section.getByRole("status")).toContainText("Measured ceiling");
  await expect(section.getByText(/Peak during turn 87\.36 in/)).toBeVisible();
  await expect(section.getByText(/Ceiling short by 2\.36 in/)).toBeVisible();
  const tip = section.getByRole("button", { name: /^Play tip-up/ });
  await tip.click();
  const preview = page.getByTestId("motion-preview-label");
  const plane = page.getByTestId("casework-measured-ceiling");
  await expect(preview).toContainText("Measured ceiling");
  await expect(preview).toContainText(/Possible contact|Contact ahead/);
  const stoppedAt = Number(await preview.getAttribute("data-pose"));
  expect(stoppedAt).toBeGreaterThan(60);
  expect(stoppedAt).toBeLessThan(62);
  await expect(plane).toBeVisible();
  await page.screenshot({
    path: info.outputPath("closet-ceiling-contact.png"),
  });
  await page.getByRole("button", { name: "Return to casework tip-up" }).click();
  await page.getByRole("button", { name: "Exit preview" }).click();
  await expect(plane).toHaveCount(0);

  await section.getByText("Edit tip-up measurements", { exact: true }).click();
  await section
    .getByRole("combobox", { name: "Lowest ceiling height above floor units" })
    .selectOption("ft");
  await ceiling.fill("8");
  await section
    .getByRole("spinbutton", {
      name: "Tip-up location in front of final position",
    })
    .fill("24");
  await save.click();
  await expect(section.getByRole("status")).toContainText("Tip-up clears");
  await tip.click();
  await expect(preview).toHaveAttribute("data-pose", "90");
  await section.getByRole("button", { name: /^Play placement slide/ }).click();
  await expect(preview).toHaveAttribute("data-pose", "24");
  await page.getByRole("button", { name: "Exit preview" }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain("Casework tip-up and placement");
  expect(guide).toMatch(/87\.36132 in/);
  expect(guide).toContain(
    "Check the saved tip-up and placement route before lifting the carcass.",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const importedId = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key)!).project.id;
  }, CURRENT_DRAFT_KEY);
  const response = await page.request.get(`/api/projects/${importedId}`);
  expect(response.ok()).toBe(true);
  const saved = projectSchema.parse((await response.json()).project);
  expect(saved.caseworkTipUpPlans).toEqual([
    { entryId, ceilingHeight: 96, restingFace: "front", stagingOffset: 24 },
  ]);
  expect(poses(saved)).toEqual(poses(project));
});
