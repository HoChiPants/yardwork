import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema } from "../../src/model";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";

test("create a glazed roof vent, preview the sash, and reopen the unchanged closed assembly", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("greenhouse");
  await dialog.getByRole("checkbox", { name: "Add a roof vent" }).check();
  await dialog.locator(".study-material-selection summary").click();
  await dialog
    .getByRole("combobox", { name: "Study greenhouse glazing", exact: true })
    .selectOption("sunlite-8mm");
  await expect(dialog).toContainText("111 actual editable parts");
  await expect(dialog).toContainText("roof vent opening width");
  await dialog.getByText(/^Cut list · \d+ cuttable parts$/).click();
  await expect(
    dialog.getByText("Angled/profile cuts", { exact: false }).first(),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);

  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  await panel
    .getByRole("button", { name: "Set up greenhouse roof vent" })
    .click();
  const editor = page.getByRole("form", { name: "Greenhouse roof vent setup" });
  await editor
    .getByRole("button", { name: "Save and test vent swing" })
    .click();
  await panel.getByRole("button", { name: "Play opening" }).click();
  const pose = page.getByTestId("motion-preview-label");
  await expect(pose).toHaveAttribute("data-pose", "45");
  await expect(
    panel.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  const review = page.getByRole("region", {
    name: "Greenhouse roof vent review",
  });
  await expect(
    review.getByText(/22\.25 in across the bay × 23\.75 in down the roof/),
  ).toBeVisible();
  await expect(
    review.getByText(/SUNLITE vent panel moves with the wood sash/),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await review.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("greenhouse-roof-vent-open.png"),
  });

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const download = await file;
  await download.saveAs(
    test.info().outputPath("greenhouse-roof-vent.yardwork.json"),
  );
  const saved = projectSchema.parse(
    JSON.parse(await readFile((await download.path())!, "utf8")),
  );
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.motionPlans?.[0].memberIds).toHaveLength(5);
  const response = await page.request.get(`/api/projects/${saved.id}`);
  expect(response.ok()).toBe(true);
  const reopened = (await response.json()).project;
  expect(reopened.pieces).toEqual(saved.pieces);
  expect(reopened.motionPlans).toEqual(saved.motionPlans);

  const guideEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await guideEvent;
  const guideText = await readFile((await guide.path())!, "utf8");
  expect(guideText).toContain("Dry-fit the roof vent opening and sash");
  expect(guideText).toContain("Top-hinged roof vent sash");
  expect(guideText).toContain("roof panel above vent");
  await guide.saveAs(test.info().outputPath("greenhouse-roof-vent-guide.md"));

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: saved.name })
    .first()
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
});

test("editing the actual hinge rail updates the sash backing overlay and guide", async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  await page.goto("/");
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore whole builds", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Choose a build study", exact: true })
    .selectOption("greenhouse");
  await dialog.getByRole("checkbox", { name: "Add a roof vent" }).check();
  await dialog.locator(".study-material-selection summary").click();
  await dialog
    .getByRole("combobox", { name: "Study greenhouse glazing", exact: true })
    .selectOption("sunlite-8mm");
  await expect(
    dialog.getByText(/Modeled backing reaches all 4 checked sash edges/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Open as new project", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);

  const readDraft = async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      CURRENT_DRAFT_KEY,
    );
    return raw ? projectSchema.parse(JSON.parse(raw).project) : null;
  };
  await expect
    .poll(
      async () =>
        !!(await readDraft())?.pieces.find(({ name }) =>
          name.includes("hinge rail"),
        ),
    )
    .toBe(true);
  const project = (await readDraft())!;
  const rail = project.pieces.find(({ name }) => name.includes("hinge rail"))!;
  const checks = page.getByRole("button", { name: /^Checks/ }).first();
  await checks.click();
  const roof = page.getByRole("button", {
    name: /^Roof glazing seams need backing review/,
  });
  await expect(roof).toContainText("Includes 4 partial edge overlaps");
  const sash = page.getByRole("button", { name: /^Roof vent sash backing/ });
  await expect(sash).toHaveClass(/info/);

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.locator(`button.step-part[data-part-id="${rail.id}"]`).click();
  const y = page.getByRole("spinbutton", { name: "Y", exact: true });
  const dropped = rail.position[1] - 0.75;
  await y.fill(String(dropped));
  await y.press("Tab");
  await expect
    .poll(
      async () =>
        (await readDraft())?.pieces.find(({ id }) => id === rail.id)
          ?.position[1] ?? 0,
    )
    .toBeCloseTo(dropped, 7);
  await checks.click();
  await expect(sash).toHaveClass(/warning/);
  await expect(sash).toContainText("Longest gap 15.25 in");
  await sash.click();
  const marker = page.getByTestId("vent-sash-gap-marker");
  await expect(marker).toHaveText("Sash backing gap · 15.25 in");
  await page.screenshot({
    path: info.outputPath("greenhouse-sash-backing.png"),
  });
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const motion = page.getByRole("region", { name: "Motion and clearance" });
  await motion
    .getByRole("button", { name: "Set up greenhouse roof vent" })
    .click();
  await page
    .getByRole("form", { name: "Greenhouse roof vent setup" })
    .getByRole("button", { name: "Save and test vent swing" })
    .click();
  const review = page.getByRole("region", {
    name: "Greenhouse roof vent review",
  });
  await expect(review).toContainText(
    "1 of 4 checked sash edges have backing gaps",
  );
  await review
    .getByRole("button", { name: "Show sash backing gaps in 3D" })
    .click();
  await expect(marker).toHaveText("Sash backing gap · 15.25 in");

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guideEvent).path())!, "utf8");
  expect(markdown).toMatch(/Shared edge checked: 7\.89501 in.*Gaps along seam/);
  expect(markdown).toMatch(
    /Roof vent sash backing[\s\S]*Ridge-side edge.*Gaps 15\.25 in/,
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hide highlighted area", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await checks.click();
  await expect(sash).toHaveClass(/info/);
  await expect(sash).toContainText(
    "Modeled backing reaches all 4 checked sash edges",
  );
});
