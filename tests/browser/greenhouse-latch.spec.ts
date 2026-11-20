import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBuildStudy } from "../../src/buildFixtures";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import {
  greenhouseDoorChoices,
  greenhouseDoorMotionInput,
} from "../../src/greenhouseDoors";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { projectSchema } from "../../src/model";

test("greenhouse latch checks and saves real mounting marks for the Home Depot kit", async ({
  page,
}, info) => {
  const base = createBuildStudy("greenhouse").project;
  const entryId = greenhouseDoorChoices(base)[0].entry.id;
  const { project, plan } = saveMotionPlan(
    base,
    greenhouseDoorMotionInput(
      base,
      {
        entryId,
        side: "left",
        outset: 0,
        sideOffset: 0,
        kitId: "everbilt-24417-gate-kit",
      },
      90,
    ),
  );

  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "greenhouse-latch.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const title = page.getByText("Fit Everbilt latch and keeper", {
    exact: true,
  });
  await title.click();
  const panel = title.locator("..");
  await panel
    .getByRole("spinbutton", {
      name: "Jamb latch center above door bottom",
      exact: true,
    })
    .fill("40");
  await panel
    .getByRole("spinbutton", {
      name: "Alignment tolerance per axis",
      exact: true,
    })
    .fill("0.05");
  await panel
    .getByRole("spinbutton", {
      name: "Keeper center height offset from latch",
      exact: true,
    })
    .fill("-0.125");
  for (const name of ["Jamb latch", "Door keeper"]) {
    for (const [label, value] of [
      ["plate center in from meeting edge", "0.75"],
      ["plate width", "1.25"],
      ["plate height", "3"],
      ["clear space needed in front of plate", "1"],
      ["engagement point toward meeting edge", "0.8125"],
      [
        "engagement point above plate center",
        name === "Door keeper" ? "0.125" : "0",
      ],
      ["engagement point out from wood face", "0.5"],
      ["pilot tip depth into wood", "1"],
      ["seated screw diameter", "0.25"],
      ["seated screw tip depth into wood", "1.25"],
    ]) {
      await panel
        .getByRole("spinbutton", { name: `${name} ${label}`, exact: true })
        .fill(value);
    }
    await panel
      .getByRole("textbox", { name: `${name} hole centers (in)`, exact: true })
      .fill("0, -0.75\n0, 0.75");
  }
  const save = panel.getByRole("button", {
    name: "Save and check latch fit",
    exact: true,
  });
  await save.click();
  await expect(
    panel.getByText(
      "The closed latch alignment and mounting marks fit the model.",
      { exact: true },
    ),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Show latch marks in 3D", exact: true })
    .click();
  const jamb = page.getByTestId("greenhouse-latch-latch");
  const keeper = page.getByTestId("greenhouse-latch-keeper");
  await expect(jamb).toHaveAttribute("data-state", "checked");
  await expect(keeper).toContainText("Door keeper · 2 marks");
  await page.screenshot({
    path: info.outputPath("greenhouse-latch-mounting.png"),
  });

  await panel.getByText("Edit latch measurements", { exact: true }).click();
  const depth = panel.getByRole("spinbutton", {
    name: "Door keeper seated screw tip depth into wood",
    exact: true,
  });
  await depth.fill("2");
  await save.click();
  await expect(
    panel.getByText(/Hole 1.*screw envelope.*passes the back/i),
  ).toBeVisible();
  await expect(keeper).toHaveAttribute("data-state", "conflict");
  const exportButton = page.getByRole("button", {
    name: "Export",
    exact: true,
  });
  await exportButton.click();
  const conflictDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const conflict = await readFile(
    (await (await conflictDownload).path())!,
    "utf8",
  );
  expect(conflict).toContain("Greenhouse door latch layout");
  expect(conflict).not.toMatch(/Door keeper.*hole 1/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await depth.fill("1.25");
  await save.click();
  await expect(keeper).toHaveAttribute("data-state", "checked");
  await exportButton.click();
  const checkedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const checked = await readFile(
    (await (await checkedDownload).path())!,
    "utf8",
  );
  expect(checked).toMatch(/Door keeper.*hole 2/);
  expect(checked).toContain("Everbilt 24417 installation instructions");
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
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.greenhouseLatchPlans?.[0]).toMatchObject({
    motionId: plan.id,
    side: "right",
    keeperHeightOffset: -0.125,
    keeper: { screwDepth: 1.25 },
  });
  expect(reopened.pieces).toEqual(project.pieces);
});
