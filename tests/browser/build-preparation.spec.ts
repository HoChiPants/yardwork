import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part, projectSchema, uid } from "../../src/model";
import { reviewMotion, saveMotionPlan, saveMotionTestSetup } from "../../src/mechanismMotion";
import { saveSunliteMount } from "../../src/sunliteMounts";
import { saveSunliteTemperatures } from "../../src/sunliteThermal";
import { sunliteFastener } from "../../src/sunliteFastenerReference";

test("assembly order flags shelves ahead of the carcass and follows a correction in the guide", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles("public/examples/builds/shelves.yardwork.json");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const track = page.locator(".step-track");
  const shelves = track.getByRole("button", { name: /Set up supports and place shelves/ });
  await shelves.click();
  const inspector = page.locator(".inspector-scroll");
  const earlier = inspector.getByRole("button", { name: "Earlier", exact: true });
  const warning = inspector.getByRole("status").filter({ hasText: "Review moving this step" });
  await expect(warning).toHaveCount(0);
  await earlier.click();
  await expect(warning).toContainText("Review moving this step after step 3 (Bookcase: Dry-fit the bookcase carcass).");
  await inspector.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const prep = inspector.getByRole("region", { name: "Build preparation", exact: true });
  await prep.locator("summary").filter({ hasText: "Assembly order" }).click();
  const row = prep.getByRole("button", { name: /Step 2.*Set up supports and place shelves.*after step 3/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(warning).toBeVisible();

  const exportedOrder = page.locator(".print-guide .build-preparation-print > div").filter({
    has: page.getByRole("heading", { name: "Assembly order", exact: true, includeHidden: true }),
  });
  await expect(exportedOrder).toContainText("Review moving this step after step 3");
  async function exportGuide() {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /^Build guide/ }).click();
    const guide = await readFile((await (await download).path())!, "utf8");
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
    return guide;
  }
  const before = await exportGuide();
  expect(before).toMatch(/### Assembly order[\s\S]*Step 2.*Set up supports and place shelves.*after step 3/);
  await inspector.getByRole("button", { name: "Later", exact: true }).click();
  await expect(warning).toHaveCount(0);
  await expect(exportedOrder).toHaveCount(0);
  const after = await exportGuide();
  expect(after).not.toContain("### Assembly order");
  expect(after).toMatch(/## 2\. Bookcase: Dry-fit the bookcase carcass[\s\S]*## 3\. Bookcase: Set up supports and place shelves/);
});

test("the banquette guide keeps each hinge review between its shell and lid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles("public/examples/builds/storage-banquette.yardwork.json");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  const track = page.locator(".step-track");
  const hinge = track.getByRole("button", { name: /Review lid hinge H001/ });
  const inspector = page.locator(".inspector-scroll");
  const earlier = inspector.getByRole("button", { name: "Earlier", exact: true });
  const later = inspector.getByRole("button", { name: "Later", exact: true });
  const warning = inspector.getByRole("status").filter({ hasText: "Review moving this step" });
  await hinge.click();
  await expect(warning).toHaveCount(0);
  await earlier.click();
  await expect(warning).toContainText("after step 4 (Banquette section 1: Fit the storage shell)");
  await later.click();
  await expect(warning).toHaveCount(0);
  await later.click();

  await inspector.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const prep = inspector.getByRole("region", { name: "Build preparation", exact: true });
  await prep.locator("summary").filter({ hasText: "Assembly order" }).click();
  await prep.getByRole("button", { name: /Step 4.*section 1.*seat lid.*after step 5.*H001/ }).click();
  await expect(warning).toContainText("after step 5 (Review lid hinge H001");
  await expect(warning).not.toContainText(/H002|H003/);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(guide).toMatch(/### Assembly order[\s\S]*Step 4.*section 1.*seat lid.*after step 5.*H001/);

  await hinge.click();
  await earlier.click();
  await inspector.getByRole("button", { name: "Review build preparation", exact: true }).click();
  await expect(prep.locator("summary").filter({ hasText: "Assembly order" })).toHaveCount(0);
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.id as string, CURRENT_DRAFT_KEY);
  const save = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  const saved = projectSchema.parse((await response.json()).project);
  expect(saved.steps.slice(2, 5).map(({ title }) => title)).toEqual([
    "Banquette section 1: Fit the storage shell",
    "Review lid hinge H001: Banquette section 1 pending hinge",
    "Banquette section 1: Dry-fit the seat lid",
  ]);
  expect(saved.lidHingePlans).toHaveLength(3);
});

test("build preparation opens the exact part and assembly and carries reviewed hardware into Home Depot", async ({
  page,
}, info) => {
  const initial = blank(`Build preparation ${uid().slice(0, 8)}`);
  const step = initial.steps[0].id;
  const rail = part(
    "Long shelf rail",
    "stud",
    [1.5, 3.5, 101],
    [-30, 2, 0],
    step,
    "Shelves",
  );
  const glazing = part(
    "Glazed panel",
    "sunlite-8mm",
    [24, 48, 8 / 25.4],
    [0, 24, 0],
    step,
    "Glazing",
  );
  glazing.stockLengthAxis = 1;
  const backing = part(
    "Receiving stud",
    "stud",
    [1.5, 48, 3.5],
    [6, 24, -(8 / 25.4 + 3.5) / 2],
    step,
    "Glazing",
  );
  initial.pieces = [rail, glazing, backing];
  const project = saveSunliteMount(
    saveSunliteTemperatures(initial, { cold: 32, installation: 68, hot: 120 }),
    glazing.id,
    {
      detail: {
        face: 1,
        neutral: [0, 0],
        shank: 0.24,
        washer: 0.65,
        minimumCoverage: 0.06,
        basis: "Test detail A1",
      },
      holes: [
        { id: uid(), center: [6, 10], diameter: 0.3125, backingId: backing.id },
      ],
    },
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
      name: "build-preparation.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);

  const draft = async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      CURRENT_DRAFT_KEY,
    );
    return raw ? projectSchema.parse(JSON.parse(raw).project) : null;
  };
  await expect.poll(async () => (await draft())?.pieces.length).toBe(3);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .getByRole("button", { name: "Review build preparation", exact: true })
    .click();
  const prep = page.getByRole("region", {
    name: "Build preparation",
    exact: true,
  });
  const group = (title: string) =>
    prep
      .locator("details.preparation-group")
      .filter({ has: page.locator("summary").filter({ hasText: title }) });
  const cuts = group("Stock and cuts");
  await expect(cuts.locator(":scope > summary")).toContainText("1 to review");
  await cuts.locator(":scope > summary").click();
  await cuts.getByRole("button", { name: /Long shelf rail.*Exceeds/ }).click();
  const depth = page.getByRole("spinbutton", { name: "Depth Z", exact: true });
  await expect(depth).toHaveValue("101");
  await depth.fill("92");
  await depth.press("Tab");
  await expect
    .poll(
      async () =>
        (await draft())?.pieces.find(({ id }) => id === rail.id)?.size[2],
    )
    .toBe(92);
  await page
    .getByRole("button", { name: "← Back to build preparation", exact: true })
    .click();
  await expect(cuts.locator(":scope > summary")).toContainText("0 to review");

  const assembly = group("Assembly connections");
  await assembly.locator(":scope > summary").click();
  await assembly
    .getByRole("button", { name: /Shelves.*part without a connection plan/ })
    .click();
  const scoped = page.getByRole("region", { name: "Connection review" });
  await expect(scoped).toContainText("Long shelf rail");
  await scoped
    .getByRole("button", { name: "Back to build preparation", exact: true })
    .click();
  await expect(prep).toBeVisible();

  const tools = group("Tools and accessories");
  await tools.locator(":scope > summary").click();
  const moreTools = tools.getByText(/^Show \d+ more$/);
  if (await moreTools.count()) await moreTools.click();

  await tools
    .getByRole("button", { name: /Review the polycarbonate drill/ })
    .click();
  await expect(
    page
      .getByText("Review the polycarbonate drill and bit sizes", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "← Back to build preparation", exact: true })
    .click();

  const shopping = group("Shopping and availability");
  await shopping.locator(":scope > summary").click();
  await shopping
    .getByRole("button", {
      name: /Palram ProTite.*Reviewed SUNLITE drill marks.*to select/,
    })
    .click();
  const needs = dialog.getByRole("list", {
    name: "Planned purchases to review",
  });
  await needs.getByRole("button", { name: /Add .*Palram ProTite/ }).click();
  await expect(
    needs.getByRole("button", { name: /Add .*Palram ProTite/ }),
  ).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await draft())?.supplies.find(
          ({ productId }) => productId === sunliteFastener.productId,
        )?.quantity,
    )
    .toBe(1);
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(
    shopping.getByRole("button", { name: /Palram ProTite.*to select/ }),
  ).toHaveCount(0);
  await expect(
    shopping.getByRole("button", {
      name: /Palram ProTite.*record a current snapshot/i,
    }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("build-preparation.png") });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guideFile).path())!, "utf8");
  expect(markdown).toContain("## Build preparation");
  expect(markdown).toMatch(
    /### Shopping and availability[\s\S]*Palram ProTite/,
  );
  expect(markdown).not.toContain("Exceeds the modeled 2 × 4");
});

test("build preparation opens a saved mid-travel strike in 3D and preserves the project", async ({ page }) => {
  const initial = blank(`Motion preparation ${uid().slice(0, 8)}`);
  const step = initial.steps[0].id;
  const drawer = part("Drawer", "plywood", [2, 2, 2], [-6, 10, 0], step, "Cabinet");
  const tray = part("Tray", "plywood", [2, 2, 2], [0, 10, -10], step, "Cabinet");
  initial.pieces = [drawer, tray];
  const first = saveMotionPlan(initial, {
    label: tray.name, memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const second = saveMotionPlan(first.project, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const project = saveMotionTestSetup(second.project, second.plan.id, { linkedId: first.plan.id, held: [] });
  const [hit] = reviewMotion(project, second.plan, [], first.plan).hits;
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "motion-preparation.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const prep = page.getByRole("region", { name: "Build preparation", exact: true });
  const group = prep.locator("details.preparation-group").filter({ hasText: "Motion and clearance" });
  await expect(group.locator("summary")).toContainText("1 to review");
  await group.locator("summary").click();
  await group.getByRole("button", { name: /Drawer · Saved test.*Modeled interference/ }).click();
  const panel = page.getByRole("region", { name: "Motion and clearance", exact: true });
  await expect(panel.getByLabel("Saved motion")).toHaveValue(second.plan.id);
  await expect(panel.getByRole("combobox", { name: "Second motion", exact: true })).toHaveValue(first.plan.id);
  const preview = page.getByTestId("motion-preview-label");
  await expect(preview).toHaveAttribute("data-pose", String(hit.inspectAt));
  await expect(preview).toContainText("Drawer + Tray");
  await expect(preview).toContainText("Interfering parts in red");
  await page.getByRole("button", { name: "← Back to build preparation", exact: true }).click();
  await expect(prep).toBeVisible();
  await expect(preview).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideFile = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const markdown = await readFile((await (await guideFile).path())!, "utf8");
  expect(markdown).toMatch(/### Motion and clearance\n\n- Drawer · Saved test · Modeled interference/);
  await expect(page.locator(".build-preparation-print")).toContainText("Drawer · Saved test");
  const editableFile = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await editableFile).path())!, "utf8")));
  expect(saved.pieces).toEqual(project.pieces);
  expect(saved.motionPlans).toEqual(project.motionPlans);
});
