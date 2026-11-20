import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { reviewMotion, saveMotionPlan } from "../../src/mechanismMotion";
import { blank, part, projectSchema, uid } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";

test("edit a drawer obstruction and retest with the same unsaved motion setup", async ({ page }) => {
  const base = blank("Retest drawer clearance");
  const step = base.steps[0].id;
  const drawer = part("Drawer box", "plywood", [4, 4, 4], [0, 10, -8], step, "Cabinet");
  const obstacle = part("Loose divider", "plywood", [4, 6, 2], [0, 10, 0], step, "Cabinet");
  const neighbor = part("Neighbor door", "plywood", [12, 12, 0.75], [30, 12, 0], step, "Cabinet");
  const shutter = part("Linked shutter", "plywood", [10, 8, 0.75], [50, 12, 0], step, "Cabinet");
  const primary = saveMotionPlan({ ...base, pieces: [drawer, obstacle, neighbor, shutter] }, {
    label: drawer.name,
    memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 16 },
  });
  const companion = saveMotionPlan(primary.project, {
    label: neighbor.name,
    memberIds: [neighbor.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [24, 12, 0], travel: 90 },
  });
  const sequence = saveMotionPlan(companion.project, {
    label: shutter.name,
    memberIds: [shutter.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [45, 12, 0], travel: 60 },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles({
    name: "retest-drawer.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(sequence.project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await panel.getByText("Hold other parts open", { exact: true }).click();
  await panel.getByLabel("Add a motion to hold").selectOption(companion.plan.id);
  await panel.getByRole("slider", { name: "Neighbor door held position" }).fill("40");
  await panel.getByRole("combobox", { name: "Second motion", exact: true }).selectOption(sequence.plan.id);
  const order = panel.getByRole("combobox", { name: /Opening order/ });
  await order.selectOption("companion-first");
  await panel.getByRole("button", { name: /Focus these parts.*Loose divider/ }).click();
  await page.getByRole("button", { name: "Edit obstruction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Loose divider" })).toBeVisible();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await expect(x).toHaveValue("0");
  await x.fill("12");
  await x.press("Enter");
  await expect(x).toHaveValue("12");
  await page.getByRole("button", { name: "Retest clearance", exact: true }).click();
  const preview = page.getByTestId("motion-preview-label");
  await expect(preview).toHaveAttribute("data-pose", "0");
  await expect(panel.getByText("No modeled interference found along this travel.")).toBeVisible();
  await expect(order).toHaveValue("companion-first");
  const held = panel.getByRole("slider", { name: "Neighbor door held position" });
  if (!(await held.isVisible())) await panel.getByText("Hold other parts open (1)", { exact: true }).click();
  await expect(held).toHaveAttribute("aria-valuetext", "36°");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(preview).toHaveAttribute("data-pose", "100");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  expect(saved.motionPlans).toEqual(sequence.project.motionPlans);
  expect(saved.pieces.map(({ id, position }) => [id, position])).toEqual([
    [drawer.id, drawer.position],
    [obstacle.id, [12, 10, 0]],
    [neighbor.id, neighbor.position],
    [shutter.id, shutter.position],
  ]);
});

test("playback passes a fitting insert through a modeled opening and catches an oversized one", async ({
  page,
}) => {
  page.setDefaultTimeout(14000);
  const base = blank("Round opening fit");
  const step = base.steps[0].id;
  const panelAt = (name: string, x: number) => ({
    ...part(name, "plywood", [16, 16, 0.75], [x, 10, 0], step, "Fit"),
    roundOpenings: [
      { axis: 2 as const, center: [0, 0] as [number, number], diameter: 4 },
    ],
  });
  const fitting = part(
    "Fitting insert",
    "plywood",
    [2, 2, 2],
    [-11, 10, -6],
    step,
    "Fit",
  );
  const oversized = part(
    "Oversized insert",
    "plywood",
    [3, 3, 2],
    [11, 10, -6],
    step,
    "Fit",
  );
  const first = saveMotionPlan(
    {
      ...base,
      pieces: [
        panelAt("Clear panel", -11),
        panelAt("Tight panel", 11),
        fitting,
        oversized,
      ],
    },
    {
      label: fitting.name,
      memberIds: [fitting.id],
      mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
    },
  );
  const second = saveMotionPlan(first.project, {
    label: oversized.name,
    memberIds: [oversized.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
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
      name: "round-opening-fit.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(second.project)),
    });
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const motion = page.getByRole("region", {
    name: "Motion and clearance",
    exact: true,
  });
  await motion
    .getByRole("button", { name: "Test motion", exact: true })
    .click();
  const banner = page.getByTestId("motion-preview-label");
  await motion
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(banner).toHaveAttribute("data-pose", "12");
  await expect(
    motion.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  await motion.getByLabel("Saved motion").selectOption(second.plan.id);
  await motion
    .getByRole("button", { name: "Test motion", exact: true })
    .click();
  const stop = reviewMotion(second.project, second.plan).playbackLimit(0, 12);
  await motion
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(banner).toHaveAttribute("data-pose", String(stop.travel));
  await expect(banner).toContainText(
    "Contact ahead · Parts in red · Tight panel",
  );
  await motion
    .getByRole("button", { name: "Inspect fully open", exact: true })
    .click();
  await expect(banner).toHaveAttribute("data-pose", "12");
  await motion
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(banner).toHaveAttribute(
    "data-pose",
    String(
      reviewMotion(second.project, second.plan).playbackLimit(12, 0).travel,
    ),
  );
  await expect(banner).toContainText("Contact ahead · Parts in red");
});

test("a blank project can save a site face before adding stock and testing movement", async ({
  page,
}) => {
  page.setDefaultTimeout(12000);
  const name = `Hand-built clearance ${uid().slice(0, 8)}`;
  await page.goto("/");
  await expect(page.locator(".statusbar")).toContainText("0 parts");
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page
    .getByRole("button", { name: "Measured site clearances", exact: true })
    .click();
  const settings = page.getByRole("region", {
    name: "Measured site clearances",
    exact: true,
  });
  await settings
    .getByRole("button", { name: "Add measured face", exact: true })
    .click();
  await expect(settings.getByLabel("Apply clearance to")).toHaveValue("");
  await settings
    .getByLabel("Face name", { exact: true })
    .fill("Front alcove wall");
  await settings
    .getByRole("combobox", { name: "Face is on the", exact: true })
    .selectOption("+Z");
  await settings
    .getByLabel("Face coordinate from grid origin units", { exact: true })
    .selectOption("ft");
  await settings
    .getByRole("spinbutton", {
      name: "Face coordinate from grid origin",
      exact: true,
    })
    .fill("0.5");
  await settings
    .getByRole("spinbutton", { name: "Minimum gap", exact: true })
    .fill("1");
  await settings
    .getByRole("button", { name: "Save clearance", exact: true })
    .click();
  await expect(settings).toContainText("Add parts to check this face");
  await settings
    .getByRole("button", { name: "Show face", exact: true })
    .click();
  await expect(page.getByTestId("site-clearance-marker")).toHaveText(
    "Front alcove wall",
  );
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Motion and clearance",
    exact: true,
  });
  await panel.getByRole("button", { name: "New motion", exact: true }).click();
  await panel
    .getByLabel("Motion name", { exact: true })
    .fill("Hand-built slide");
  await panel
    .getByRole("combobox", { name: "Movement", exact: true })
    .selectOption("slide");
  await panel
    .getByRole("button", { name: "Save and test motion", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  const status = page.getByTestId("motion-preview-label");
  await expect(status).toContainText("3.25 in");
  await expect(status).toContainText(
    "Reached measured clearance limit · Front alcove wall",
  );
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: name })
    .click();
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(
    panel.getByRole("button", {
      name: "Inspect measured clearance · Front alcove wall",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(
    JSON.parse(await readFile((await (await file).path())!, "utf8")),
  );
  expect(saved.ideaBindings).toEqual([]);
  expect(saved.siteClearances).toEqual([
    expect.objectContaining({ bindingId: null, coordinate: 6, minimum: 1 }),
  ]);
});

test("drawer playback stops before a measured site face and includes it in the build guide", async ({
  page,
}) => {
  const base = applyIdeaPlan(
    blank("Cabinet site clearance"),
    localIdeaPlan({
      prompt: "Storage shelves 36 inches wide",
    }),
  );
  const drawer = part(
    "Drawer",
    "plywood",
    [8, 2, 4],
    [0, 10, 50],
    base.steps[0].id,
    "Cabinet",
  );
  const plane = {
    id: uid(),
    bindingId: base.ideaBindings[0].id,
    label: "Measured island face",
    side: "+Z" as const,
    coordinate: 57,
    top: 36,
    minimum: 1,
  };
  const { project, plan } = saveMotionPlan(
    {
      ...base,
      pieces: [...base.pieces, drawer],
      sections: base.sections.map((section, i) =>
        i === 0
          ? { ...section, pieceIds: [...section.pieceIds, drawer.id] }
          : section,
      ),
      siteClearances: [plane],
    },
    {
      label: drawer.name,
      memberIds: [drawer.id],
      mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
    },
  );
  const stop = reviewMotion(project, plan).playbackLimit(0, 12);
  expect(stop.travel).toBeCloseTo(4, 3);
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
      name: "cabinet-site-clearance.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  const finding = panel.getByRole("button", {
    name: "Inspect measured clearance · Measured island face",
    exact: true,
  });
  await expect(finding).toBeVisible();
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  const status = page.getByTestId("motion-preview-label");
  await expect(status).toHaveAttribute("data-pose", String(stop.travel));
  await expect(status).toContainText(
    "Reached measured clearance limit · Measured island face",
  );
  await expect(page.getByTestId("site-clearance-marker")).toHaveText(
    plane.label,
  );
  await finding.click();
  await expect(status).toContainText(
    "Measured clearance shortfall · Measured island face",
  );
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator(".print-guide")).toContainText(
    /Measured island face .*clearance shortfall near/,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  expect(await readFile((await (await download).path())!, "utf8")).toMatch(
    /Measured island face .*clearance shortfall near/,
  );
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const prep = page.getByRole("region", { name: "Build preparation", exact: true });
  const motion = prep.locator(".preparation-group").filter({ hasText: "Motion and clearance" });
  await motion.locator("summary").first().click();
  await motion.getByRole("button", { name: /Measured island face.*clearance shortfall/ }).click();
  await expect(page.getByTestId("site-clearance-marker")).toHaveText(plane.label);
  await expect(status).toContainText("Measured clearance shortfall · Measured island face");
});

test("two linked motions stop in both directions at a collision between clear endpoints", async ({
  page,
}) => {
  const base = blank("Crossing cabinet drawers");
  const step = base.steps[0].id;
  const drawer = part(
    "Drawer",
    "plywood",
    [2, 2, 2],
    [-6, 10, 0],
    step,
    "Cabinet",
  );
  const tray = part(
    "Tray",
    "plywood",
    [2, 2, 2],
    [0, 10, -10],
    step,
    "Cabinet",
  );
  const first = saveMotionPlan(
    { ...base, pieces: [drawer, tray] },
    {
      label: drawer.name,
      memberIds: [drawer.id],
      mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
    },
  );
  const { project, plan } = saveMotionPlan(first.project, {
    label: tray.name,
    memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const linked = reviewMotion(project, first.plan, [], plan);
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
      name: "cabinet-drawers.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(
    panel.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  const companion = panel.getByRole("combobox", { name: "Second motion", exact: true });
  await companion.selectOption(plan.id);
  await expect(pose).toContainText("Drawer + Tray");
  await expect(
    panel.getByRole("button", { name: /^Collision near/ }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(pose).toHaveAttribute(
    "data-pose",
    String(linked.playbackLimit(0, 12).travel),
  );
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await expect(pose).toContainText("Tray");
  await panel.getByRole("slider", { name: "Extension" }).fill("6");
  await expect(pose).toContainText("Interfering parts in red");
  await expect(panel.getByText("Tray · 10 in", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "Inspect fully open", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "12");
  await expect(pose).not.toContainText("Interfering parts in red");
  await panel
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(pose).toHaveAttribute(
    "data-pose",
    String(linked.playbackLimit(12, 0).travel),
  );
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await companion.selectOption("");
  await expect(
    panel.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  await companion.selectOption(plan.id);
  await panel.getByRole("button", { name: "Save test setup", exact: true }).click();
  await expect(panel.getByText("Saved test setup", { exact: true })).toBeVisible();
  await expect(page.locator(".print-guide")).toContainText("Saved clearance test · Drawer · moves with Tray");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  const saved = projectSchema.parse(JSON.parse(await readFile(path!, "utf8")));
  expect(saved.pieces).toEqual(project.pieces);
  expect(saved.motionPlans).toEqual([
    { ...first.plan, testSetup: { linkedId: plan.id, held: [] } },
    plan,
  ]);
});

test("save a door-first drawer sequence and inspect the collision when the order is reversed", async ({ page }) => {
  const initial = blank(`Door before drawer ${uid().slice(0, 8)}`);
  const stepId = initial.steps[0].id;
  const drawer = part("Pull-out drawer", "plywood", [1, 2, 1], [5, 10, -8], stepId, "Cabinet");
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [6, 10, 0], stepId, "Cabinet");
  initial.pieces = [drawer, door];
  const slide = saveMotionPlan(initial, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const swing = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "staged-drawer.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(swing.project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("combobox", { name: "Second motion", exact: true }).selectOption(swing.plan.id);
  const order = panel.getByRole("combobox", { name: /Opening order/ });
  await order.selectOption("companion-first");
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  const progress = panel.getByRole("slider", { name: "Sequence progress", exact: true });
  await expect(progress).toHaveAttribute("aria-valuetext", "Cabinet door · 0°");
  await expect(panel.getByText("No modeled interference found along this travel.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Inspect after Cabinet door opens", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "50");
  await expect(pose).toContainText("Cabinet door · 90°");
  await progress.fill("75");
  await expect(pose).toContainText("Pull-out drawer · 12 in");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "100");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByRole("button", { name: "Save test setup", exact: true }).click();
  await expect(panel.getByText("Saved test setup", { exact: true })).toBeVisible();

  await order.selectOption("selected-first");
  const collision = panel.getByRole("button", { name: /Collision near Pull-out drawer/ });
  await collision.click();
  await expect(pose).toContainText("Interfering parts in red");
  await panel.getByRole("button", { name: "Inspect fully closed", exact: true }).click();
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await panel.getByRole("button", { name: "Save test setup", exact: true }).click();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const preparation = page.getByRole("region", { name: "Build preparation", exact: true });
  const group = preparation.locator("details.preparation-group").filter({ hasText: "Motion and clearance" });
  await group.locator("summary").click();
  await group.getByRole("button", { name: /Pull-out drawer · Saved test.*Modeled interference/ }).click();
  await expect(pose).toContainText("Pull-out drawer");
  await expect(pose).toContainText("Interfering parts in red");
  await panel.getByRole("combobox", { name: /Opening order/ }).selectOption("companion-first");
  await panel.getByRole("button", { name: "Save test setup", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: initial.name }).click();
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  await expect(order).toHaveValue("companion-first");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guideDownload).path())!, "utf8");
  expect(markdown).toContain("opens in order: Cabinet door → Pull-out drawer. Closing reverses the order.");
  const projectDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await projectDownload).path())!, "utf8")));
  expect(saved.pieces).toEqual(swing.project.pieces);
  expect(saved.motionPlans?.[0].testSetup).toEqual({ linkedId: swing.plan.id, openingOrder: "companion-first", held: [] });
});

test("named clearance tests save both door and drawer orders and reopen from build preparation", async ({ page }) => {
  const initial = blank(`Named clearance tests ${uid().slice(0, 8)}`);
  const stepId = initial.steps[0].id;
  const drawer = part("Pull-out drawer", "plywood", [1, 2, 1], [5, 10, -8], stepId, "Cabinet");
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [6, 10, 0], stepId, "Cabinet");
  initial.pieces = [drawer, door];
  const slide = saveMotionPlan(initial, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const swing = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "door-and-drawer.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(swing.project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  const pose = page.getByTestId("motion-preview-label");
  const picker = panel.getByRole("combobox", { name: "Clearance test", exact: true });
  const name = panel.getByRole("textbox", { name: "Clearance test name", exact: true });
  const order = panel.getByRole("combobox", { name: /Opening order/ });
  const namedSave = panel.getByRole("button", { name: "Save named test", exact: true });
  await panel.getByRole("combobox", { name: "Second motion", exact: true }).selectOption(swing.plan.id);
  await order.selectOption("companion-first");
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await panel.getByText("Keep this test under a name", { exact: true }).click();
  await name.fill("Door first");
  await namedSave.click();
  await expect(picker.locator("option:checked")).toHaveText("Door first");

  await order.selectOption("selected-first");
  await name.fill("Drawer first");
  await namedSave.click();
  await expect(picker.locator("option:checked")).toHaveText("Drawer first");
  await expect(picker.locator("option")).toHaveText(["Working test setup", "Door first", "Drawer first"]);
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Contact ahead · Parts in red");

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: initial.name }).click();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const prep = page.getByRole("region", { name: "Build preparation", exact: true });
  const group = prep.locator("details.preparation-group").filter({ hasText: "Motion and clearance" });
  await group.locator("summary").click();
  await expect(group.getByRole("button", { name: /Door first.*No modeled clearance findings/ })).toBeVisible();
  await group.getByRole("button", { name: /Drawer first.*Modeled interference/ }).click();
  await expect(picker.locator("option:checked")).toHaveText("Drawer first");
  await expect(pose).toContainText("Interfering parts in red");
  await picker.selectOption({ label: "Door first" });
  await expect(order).toHaveValue("companion-first");
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "100");
  await panel.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator(".print-guide")).toContainText("Named clearance test · Door first");
  await expect(page.locator(".print-guide")).toContainText("Named clearance test · Drawer first");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guideDownload).path())!, "utf8");
  expect(markdown).toContain("Named clearance test · Door first · opens in order: Cabinet door → Pull-out drawer");
  expect(markdown).toContain("Named clearance test · Drawer first · opens in order: Pull-out drawer → Cabinet door");
  const projectDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await projectDownload).path())!, "utf8")));
  expect(saved.pieces).toEqual(swing.project.pieces);
  expect(saved.motionPlans?.[0].testScenarios?.map(({ name, setup }) => [name, setup.openingOrder])).toEqual([
    ["Door first", "companion-first"], ["Drawer first", "selected-first"],
  ]);
});

test("a rotated cabinet uses moving-part axes for a drawer and the reference leaf for a hinge", async ({ page }) => {
  page.setDefaultTimeout(15000);
  const base = blank(`Angled cabinet ${uid().slice(0, 8)}`);
  const step = base.steps[0].id;
  const yaw = Math.PI / 6;
  const drawer = part(
    "Angled drawer", "plywood", [1, 1, 1], [0, 12, 0], step, "Cabinet", [0, yaw, 0],
  );
  const drawerStop = part(
    "Drawer obstruction", "plywood", [1, 1, 1], [4, 12, 4 * Math.sqrt(3)], step, "Cabinet",
  );
  const door = part(
    "Angled door", "plywood", [24, 36, 0.75], [48, 20, 12], step, "Cabinet", [0, yaw, 0],
  );
  const handle = part("Door handle", "plywood", [1, 1, 2], [53, 20, 9], step, "Cabinet");
  const hingeX = 48 - 6 * Math.sqrt(3);
  const strikeYaw = yaw - (40 * Math.PI) / 180;
  const doorStop = part(
    "Door obstruction", "plywood", [1, 2, 1],
    [hingeX + 12 * Math.cos(strikeYaw), 20, 18 - 12 * Math.sin(strikeYaw)],
    step, "Cabinet",
  );
  base.pieces = [drawer, drawerStop, door, handle, doorStop];

  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "angled-cabinet.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(base)),
  });
  await expect(dialog).toHaveCount(0);

  const motionButton = page.getByRole("button", { name: "Test movement", exact: true });
  await motionButton.click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  const pose = page.getByTestId("motion-preview-label");
  const start = panel.getByRole("button", { name: "New motion", exact: true });
  const saveMotion = panel.getByRole("button", { name: "Save and test motion", exact: true });
  const playOpening = panel.getByRole("button", { name: "Play opening", exact: true });
  const referenceFrame = panel.getByRole("combobox", { name: "Reference frame", exact: true });
  const movingPart = panel.getByRole("combobox", { name: "Add moving part", exact: true });
  await start.click();
  await panel.getByLabel("Motion name", { exact: true }).fill(drawer.name);
  await panel.getByRole("combobox", { name: "Movement", exact: true }).selectOption("slide");
  await movingPart.selectOption(drawer.id);
  await expect(referenceFrame).toHaveValue("moving-part");
  await referenceFrame.selectOption("workspace");
  await saveMotion.click();
  await expect(panel.getByText("No modeled interference found along this travel.")).toBeVisible();
  await panel.getByRole("button", { name: "Edit setup", exact: true }).click();
  await expect(referenceFrame).toHaveValue("workspace");
  await referenceFrame.selectOption("moving-part");
  await saveMotion.click();
  await playOpening.click();
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await expect(pose).toContainText(drawerStop.name);
  await expect.poll(async () => Number(await pose.getAttribute("data-pose"))).toBeCloseTo(6.827, 3);

  await start.click();
  await panel.getByLabel("Motion name", { exact: true }).fill(door.name);
  await movingPart.selectOption(handle.id);
  await movingPart.selectOption(door.id);
  await panel.getByRole("button", { name: /Use .* Angled door as motion reference/ }).click();
  await expect(panel.getByText(/Uses the axes of .*Angled door/)).toBeVisible();
  const edge = panel.getByRole("combobox", { name: "Hinge position", exact: true });
  await edge.selectOption("exact");
  const pivotZ = panel.getByLabel("Pivot Z (in)", { exact: true });
  await expect.poll(async () => Number(await pivotZ.inputValue())).toBeCloseTo(18, 6);
  await edge.selectOption("left");
  await saveMotion.click();
  await playOpening.click();
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await expect(pose).toContainText(doorStop.name);
  await expect.poll(async () => Number(await pose.getAttribute("data-pose"))).toBeCloseTo(35.64, 1);

  const saveResponse = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().includes("/api/projects/"),
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const record = await saveResponse;
  expect(record.ok()).toBe(true);
  const saved = projectSchema.parse((await record.json()).project);
  expect(saved.pieces).toEqual(base.pieces);
  const [savedDrawer, savedDoor] = saved.motionPlans!;
  expect(savedDrawer.mechanism.axis).toEqual([0, 0, 1]);
  expect(savedDoor.memberIds).toEqual([door.id, handle.id]);
  expect(savedDoor.mechanism).toMatchObject({ kind: "hinge", axis: [0, 1, 0] });
  expect(savedDoor.mechanism.kind === "hinge" && savedDoor.mechanism.pivot[0]).toBeCloseTo(-12, 6);

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: base.name }).click();
  await motionButton.click();
  await panel.getByRole("combobox", { name: "Saved motion", exact: true }).selectOption(savedDrawer.id);
  await panel.getByRole("button", { name: "Edit setup", exact: true }).click();
  await expect(referenceFrame).toHaveValue("moving-part");
  await expect(panel.getByRole("combobox", { name: "Slide direction", exact: true })).toHaveValue("4");
  await saveMotion.click();
  await playOpening.click();
  await expect(pose).toContainText(drawerStop.name);
});

test("a custom door and drawer reveal different obstructions during opening and closing", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const base = blank(`Cabinet motion review ${uid().slice(0, 8)}`);
  const step = base.steps[0].id;
  const door = part(
    "Neighbor door",
    "plywood",
    [12, 12, 0.75],
    [6, 12, 0],
    step,
    "Cabinet",
  );
  const drawer = part(
    "Drawer",
    "plywood",
    [4, 4, 4],
    [-2.1, 12, -7],
    step,
    "Cabinet",
  );
  const tray = part(
    "Pull-out tray",
    "plywood",
    [2, 4, 2],
    [5, 12, 17],
    step,
    "Cabinet",
  );
  const slide = saveMotionPlan(
    { ...base, pieces: [door, drawer, tray] },
    {
      label: drawer.name,
      memberIds: [drawer.id],
      mechanism: { kind: "slide", axis: [0, 0, 1], travel: 30 },
    },
  );
  const { project, plan: trayPlan } = saveMotionPlan(slide.project, {
    label: tray.name,
    memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [-1, 0, 0], travel: 8 },
  });
  const swing = saveMotionPlan(project, {
    label: door.name,
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      axis: [0, 1, 0],
      pivot: [0, 12, 0],
      travel: 90,
    },
  });
  const held = reviewMotion(swing.project, slide.plan, [
    { plan: swing.plan, travel: 90 },
    { plan: trayPlan, travel: 8 },
  ]);

  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "synthetic-cabinet.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Motion and clearance" });
  const pose = page.getByTestId("motion-preview-label");
  await panel.getByRole("button", { name: "New motion" }).click();
  await panel.getByLabel("Motion name").fill(door.name);
  await panel.getByLabel("Add moving part").selectOption(door.id);
  const edge = panel.getByLabel("Hinge position");
  const direction = panel.getByLabel("Hinge axis and swing direction");
  await edge.selectOption("back");
  const movement = panel.getByRole("combobox", {
    name: "Movement",
    exact: true,
  });
  await movement.selectOption("slide");
  await movement.selectOption("hinge");
  await expect(direction).toHaveValue("0");
  await edge.selectOption("left");
  await panel.getByRole("button", { name: "Save and test motion" }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel.getByRole("button", { name: "Play opening" }).click();
  await expect(pose).toHaveAttribute("data-pose", "90");
  await panel.getByRole("button", { name: "Play closing" }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");

  const savedMotion = panel.getByLabel("Saved motion");
  const doorPlanId = await savedMotion.inputValue();
  await savedMotion.selectOption(slide.plan.id);
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await expect(
    panel.getByText("No modeled interference found along this travel."),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  await panel.getByText("Hold other parts open", { exact: true }).click();
  await panel.getByLabel("Add a motion to hold").selectOption(doorPlanId);
  await panel.getByLabel("Add a motion to hold").selectOption(trayPlan.id);
  await expect(
    panel.getByRole("button", { name: /^Collision near/ }),
  ).toHaveCount(2);
  await expect(
    panel.getByRole("slider", { name: "Neighbor door held position" }),
  ).toHaveAttribute("aria-valuetext", "90°");
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(pose).toHaveAttribute(
    "data-pose",
    String(held.playbackLimit(0, 30).travel),
  );
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await expect(pose).toContainText(door.name);
  await panel
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await panel
    .getByRole("button", { name: "Inspect fully open", exact: true })
    .click();
  await expect(pose).toHaveAttribute("data-pose", "30");
  await panel
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(pose).toHaveAttribute(
    "data-pose",
    String(held.playbackLimit(30, 0).travel),
  );
  await expect(pose).toContainText("Contact ahead · Parts in red");
  await expect(pose).toContainText(tray.name);
  await page.screenshot({
    path: test.info().outputPath("drawer-stops-at-held-tray.png"),
  });
  await panel
    .getByRole("listitem")
    .filter({ hasText: "Pull-out tray" })
    .getByRole("button", { name: /^Inspect closing near/ })
    .click();
  await expect(pose).toHaveAttribute(
    "data-pose",
    String(held.hits[1].closingAt),
  );
  await expect(pose).toContainText("Interfering parts in red");
  const canvas = page.locator(".canvas-wrap canvas");
  const viewDepth = async () => {
    const frame = JSON.parse(await canvas.getAttribute("data-motion-camera") ?? "{}").framingBounds;
    return frame ? frame.max[2] - frame.min[2] : Infinity;
  };
  await expect(canvas).toHaveAttribute("data-motion-camera", /framingBounds/);
  const fullDepth = await viewDepth();
  await panel.getByRole("button", { name: /Focus these parts.*Drawer against .*Pull-out tray/ }).click();
  await expect(pose).toContainText("Focused on");
  await expect(pose).toHaveAttribute("data-pose", String(held.hits[1].closingAt));
  const visibleIds = async () => (JSON.parse(await canvas.getAttribute("data-rendered-part-ids") ?? "[]") as string[]).sort();
  await expect.poll(visibleIds).toEqual([drawer.id, tray.id].sort());
  await expect.poll(viewDepth).toBeLessThan(fullDepth / 2);
  await page.getByRole("button", { name: "Show full project", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", String(held.hits[1].closingAt));
  await expect.poll(visibleIds).toEqual([door.id, drawer.id, tray.id].sort());
  await page.getByRole("button", { name: "Return to motion controls", exact: true }).click();
  await panel.getByRole("button", { name: "Save test setup", exact: true }).click();
  await expect(panel.getByText("Saved test setup", { exact: true })).toBeVisible();
  await panel
    .getByRole("slider", { name: "Pull-out tray held position" })
    .fill("50");
  await expect(
    panel.getByRole("button", { name: /^Collision near/ }),
  ).toHaveCount(1);
  await panel.getByRole("button", { name: "Release Neighbor door" }).click();
  await expect(
    panel.getByText("No modeled interference found along this travel."),
  ).toBeVisible();

  const back = page.getByRole("button", { name: "Back to workspace", exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  const saved = projectSchema.parse(JSON.parse(await readFile(path!, "utf8")));
  expect(
    saved.pieces.map(({ id, position, rotation }) => ({
      id,
      position,
      rotation,
    })),
  ).toEqual(
    project.pieces.map(({ id, position, rotation }) => ({
      id,
      position,
      rotation,
    })),
  );
  expect(saved.motionPlans).toEqual([
    { ...slide.plan, testSetup: { held: [
      { motionId: doorPlanId, percent: 100 },
      { motionId: trayPlan.id, percent: 100 },
    ] } },
    trayPlan,
    { ...swing.plan, id: doorPlanId },
  ]);

  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await panel.getByRole("button", { name: "Restore saved setup", exact: true }).click();
  await expect(panel.getByRole("button", { name: /^Collision near/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: base.name }).click();
  await page.getByRole("button", { name: "Test movement", exact: true }).click();
  await expect(panel.getByText("Saved test setup", { exact: true })).toBeVisible();
  await expect(panel.getByRole("slider", { name: "Neighbor door held position" })).toHaveAttribute("aria-valuetext", "90°");
  await panel.getByRole("button", { name: "Test motion", exact: true }).click();
  await expect(panel.getByRole("button", { name: /^Collision near/ })).toHaveCount(2);
  await expect(page.locator(".print-guide")).toContainText(
    "Saved clearance test · Drawer · Neighbor door held at 90° · Pull-out tray held at 8 in",
  );
  await panel.getByRole("button", { name: "Test motion alone", exact: true }).click();
  await expect(panel.getByText("No modeled interference found along this travel.")).toBeVisible();
  await panel.getByRole("button", { name: "Remove saved test setup", exact: true }).click();
  await expect(panel.locator(".motion-test-setup")).toHaveCount(0);
});
