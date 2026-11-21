import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, part, projectSchema, uid, type Project } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import { generateBuildGuide } from "../../src/guide";
import { lidPreview, reviewLidTravel } from "../../src/lidMotion";
import { reviewLidStayFit, saveLidStayFit } from "../../src/lidStayFit";
import { lidSiteAngle } from "../../src/lidSiteClearance";
import { prepareCollisionSolid, solidOverlap } from "../../src/solidCollision";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { partLabel } from "../../src/partLabels";
import { bom } from "../../src/engine";

async function draft(
  page: Page,
  expected: (project: Project) => boolean,
): Promise<Project> {
  let observed: Project | null = null;
  try {
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(
            (key) => localStorage.getItem(key),
            CURRENT_DRAFT_KEY,
          );
          observed = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
          return !!observed && expected(observed);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    await test.info().attach("last-lid-motion-project", {
      body: Buffer.from(JSON.stringify(observed, null, 2)),
      contentType: "application/json",
    });
    throw error;
  }
  return observed!;
}
function fixture(count: 1 | 2) {
  let project = applyIdeaPlan(
    blank(`SYNTHETIC lid motion ${uid().slice(0, 8)}`),
    localIdeaPlan({
      prompt: `${count === 1 ? "One" : "Two"}-section storage banquette ${count * 24} inches wide, 24 inches deep, 18 inches seat height, opening lids and no back`,
    }),
  );
  if (project.sections.length !== count)
    throw Error(
      "Synthetic fixture did not create the requested independent modules.",
    );
  project.notes =
    "SYNTHETIC digital motion study. Preserve this note, current geometry, cuts, source identities, guide and history during temporary previews.";
  const section = project.sections[0],
    lid = project.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
    )!;
  lid.name = "SYNTHETIC renamed hatch";
  if (count === 2) {
    const mid = lidPreview(project, section.id, 37);
    const obstacle = part(
      "SYNTHETIC obstacle intersecting only intermediate travel",
      "stud",
      [1.5, 1.5, 1.5],
      [...mid.piece.position],
      project.steps[0].id,
      "Loose obstruction",
    );
    project = { ...project, pieces: [...project.pieces, obstacle] };
  } else project.workZone = { width: 48, depth: 24, height: 24 };
  return generateBuildGuide(project);
}
async function load(page: Page, project: Project) {
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
      name: "synthetic-lid-motion.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function openLidPanel(page: Page, sectionId: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(sectionId);
  return page.getByRole("region", { name: "Lid travel review", exact: true });
}
async function editable(page: Page): Promise<Project> {
  const back = page.getByRole("button", { name: "Back to workspace", exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  if (!path) throw Error("No editable motion project download");
  const result = projectSchema.parse(JSON.parse(await readFile(path, "utf8")));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return result;
}
async function openClearanceChecklist(page: Page) {
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page.getByRole("button", { name: "Review build preparation", exact: true }).click();
  const checklist = page.getByRole("region", { name: "Build preparation", exact: true });
  const group = checklist.locator(".preparation-group").filter({ hasText: "Motion and clearance" });
  await group.locator(":scope > summary").click();
  return group;
}
async function renderedPose(
  page: Page,
  expected: ReturnType<typeof lidPreview>,
) {
  const label = page.getByTestId("lid-preview-label");
  await expect(label).toHaveAttribute("data-angle", String(expected.angle));
  await expect(label).toHaveAttribute("data-lid-id", expected.piece.id);
  const position = JSON.parse((await label.getAttribute("data-position"))!),
    rotation = JSON.parse((await label.getAttribute("data-rotation"))!);
  for (let axis = 0; axis < 3; axis++) {
    expect(position[axis]).toBeCloseTo(expected.piece.position[axis], 8);
    expect(rotation[axis]).toBeCloseTo(expected.piece.rotation[axis], 8);
  }
}
async function reopen(page: Page, expected: Project) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/projects/${expected.id}`);
        return (
          response.ok() &&
          (await response.json()).project.sections.find(
            (section: Project["sections"][number]) =>
              section.id === expected.sections[0].id,
          )?.recipe?.lidOpen === true
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ hasText: expected.name })
    .click();
  return draft(
    page,
    (actual) =>
      actual.id === expected.id && actual.sections[0].recipe?.lidOpen === true,
  );
}

test("lid weight follows the preview angle and persists in the build guide", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const project = await load(page, fixture(1));
  const panel = await openLidPanel(page, project.sections[0].id);
  const measurements = panel.locator("details").filter({
    has: page.getByText("Lid weight and gravity torque", { exact: true }),
  });
  await measurements.locator(":scope > summary").click();
  await panel
    .getByRole("spinbutton", { name: "Lid weight (lb)", exact: true })
    .fill("12");
  await panel
    .getByRole("button", { name: "Save lid measurements", exact: true })
    .click();
  const saved = await draft(
    page,
    (actual) => actual.lidWeightPlans?.[0]?.weightLb === 12,
  );
  await expect(measurements).toContainText("144 lb-in closing at 0°");
  const stays = measurements
    .locator("details")
    .filter({ hasText: "Compare lid stays" });
  await stays.locator("summary").click();
  await expect(stays).toContainText(
    "Side mount 17.6–21 N·m · Below published range",
  );
  await expect(stays).toContainText(
    "Back mount 15–16.5 N·m · Within published range",
  );
  await expect(
    stays.getByText("Torque range needs supplier confirmation.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    stays.getByRole("link", { name: "Home Depot listing", exact: true }),
  ).toHaveAttribute("href", "https://www.homedepot.com/p/314151479");
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Inspect open (75°)", exact: true })
    .click();
  await expect(panel.getByLabel("Current lid preview angle")).toHaveText("75°");
  await expect(panel.getByLabel("Gravity torque at preview angle")).toHaveText(
    /\d+(\.\d+)? lb-in closing/,
  );
  await panel
    .getByRole("button", { name: "Exit lid preview", exact: true })
    .click();
  const file = await editable(page);
  expect(file.lidWeightPlans).toEqual(saved.lidWeightPlans);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator(".print-guide")).toContainText(
    "closed 144 lb-in closing",
  );
  await expect(page.locator(".print-guide")).toContainText(
    "Back mount 15–16.5 N·m · Within published range",
  );
  const guideFile = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideFile).path())!, "utf8");
  expect(guide).toMatch(
    /Lid weight and gravity torque[\s\S]*closed 144 lb-in closing/,
  );
  expect(guide).toMatch(
    /Lid stay torque comparison[\s\S]*Back mount 15–16.5 N·m · Within published range/,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const response = await page.request.get(`/api/projects/${saved.id}`);
  expect(response.ok()).toBe(true);
  expect(
    projectSchema.parse((await response.json()).project).lidWeightPlans,
  ).toEqual(saved.lidWeightPlans);
});

test("temporary lid review catches a midpoint-only obstruction and scrubbing preserves complete saved JSON", async ({
  page,
}) => {
  const project = fixture(2),
    section = project.sections[0],
    obstacle = project.pieces.find(
      (piece) => piece.assembly === "Loose obstruction",
    )!,
    review = reviewLidTravel(project, section.id),
    hit = review.collisions.find(
      (collision) => collision.pieceId === obstacle.id,
    )!;
  expect(hit).toBeTruthy();
  expect(hit.firstAngle).toBeGreaterThan(0);
  expect(hit.firstAngle).toBeLessThan(75);
  for (const angle of [0, 75])
    expect(
      solidOverlap(
        prepareCollisionSolid(lidPreview(project, section.id, angle).piece)!,
        prepareCollisionSolid(obstacle)!,
      ),
    ).toBe(false);
  const loaded = await load(page, project),
    before = await editable(page);
  expect(before).toEqual(loaded);
  let plannerRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/planner") plannerRequests++;
  });
  const panel = await openLidPanel(page, section.id);
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  const scene = page.getByTestId("lid-preview-label");
  await expect(scene).toHaveAttribute("data-lid-id", review.lidId);
  await expect(scene).toHaveAttribute("data-angle", "0");
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  const opening = review.playbackLimit(0, 75);
  await expect(scene).toHaveAttribute("data-angle", String(opening.travel));
  await expect(scene).toContainText("Contact ahead · Parts in red");
  await panel
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-angle", "0");
  await panel
    .getByRole("button", { name: "Inspect open (75°)", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  const closing = review.playbackLimit(75, 0);
  await expect(scene).toHaveAttribute("data-angle", String(closing.travel));
  await expect(scene).toContainText("Contact ahead · Parts in red");
  await renderedPose(page, review.preview(closing.travel, closing.inspectAt));
  await page.screenshot({
    path: test.info().outputPath("lid-stops-on-closing.png"),
  });
  const finding = panel.locator(`[data-lid-obstruction-id='${obstacle.id}']`);
  await expect(finding).toContainText(partLabel(project, obstacle.id));
  await finding
    .getByRole("button", {
      name: `Inspect ${partLabel(project, obstacle.id)} at ${lidSiteAngle(hit.inspectAngle)}`,
      exact: true,
    })
    .click();
  await expect(scene).toHaveAttribute("data-angle", String(hit.inspectAngle));
  await renderedPose(page, lidPreview(before, section.id, hit.inspectAngle));
  await expect(scene).toContainText("overlapping part(s) in red");
  await finding.getByRole("button", { name: /^Focus these parts/ }).click();
  await expect(scene).toContainText("Focused on");
  await expect(scene).toHaveAttribute("data-angle", String(hit.inspectAngle));
  const canvas = page.locator(".canvas-wrap canvas");
  const visibleIds = async () => (JSON.parse(await canvas.getAttribute("data-rendered-part-ids") ?? "[]") as string[]).sort();
  await expect.poll(visibleIds).toEqual([review.lidId, obstacle.id].sort());
  await page.getByRole("button", { name: "Show full project", exact: true }).click();
  await expect(scene).toHaveAttribute("data-angle", String(hit.inspectAngle));
  await expect.poll(visibleIds).toEqual(before.pieces.filter((piece) => !piece.offcut).map(({ id }) => id).sort());
  await page.getByRole("button", { name: "Return to lid controls", exact: true }).click();
  const slider = panel.getByRole("slider", {
    name: "Lid preview angle",
    exact: true,
  });
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 30; i++) await slider.press("ArrowRight");
  await expect(scene).toHaveAttribute("data-angle", "30");
  await renderedPose(page, lidPreview(before, section.id, 30));
  await panel
    .getByRole("button", { name: "Inspect open (75°)", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-angle", "75");
  await renderedPose(page, lidPreview(before, section.id, 75));
  expect(await editable(page)).toEqual(before);
  if (
    await panel
      .getByRole("button", { name: "Exit lid preview", exact: true })
      .count()
  )
    await panel
      .getByRole("button", { name: "Exit lid preview", exact: true })
      .click();
  await expect(scene).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(project.sections[1].id);
  await expect(scene).toHaveCount(0);
  const secondPanel = page.getByRole("region", {
    name: "Lid travel review",
    exact: true,
  });
  await secondPanel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  await page.getByRole("button", { name: "Part", exact: true }).click();
  await expect(scene).toHaveCount(0);
  expect(await editable(page)).toEqual(before);
  expect(plannerRequests).toBe(0);

  const firstLid = await openLidPanel(page, section.id);
  await firstLid.getByRole("button", { name: "Review lid travel", exact: true }).click();
  await firstLid.locator(`[data-lid-obstruction-id='${obstacle.id}']`)
    .getByRole("button", { name: /^Focus these parts/ }).click();
  await page.getByRole("button", { name: "Edit obstruction", exact: true }).click();
  await expect(page.getByRole("heading", { name: obstacle.name, exact: true })).toBeVisible();
  const x = page.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("120");
  await x.press("Enter");
  await page.getByRole("button", { name: "Retest clearance", exact: true }).click();
  await expect(scene).toHaveAttribute("data-angle", "0");
  await expect(page.locator(`[data-lid-obstruction-id='${obstacle.id}']`)).toHaveCount(0);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  const updated = await editable(page);
  expect(updated.pieces.filter(({ id }) => id !== obstacle.id)).toEqual(before.pieces.filter(({ id }) => id !== obstacle.id));
  expect(updated.pieces.find(({ id }) => id === obstacle.id)?.position[0]).toBe(120);
});

test("phone work-zone review stays transient while the existing explicit open pose saves and reopens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = fixture(1),
    section = project.sections[0],
    travel = reviewLidTravel(project, section.id);
  expect(travel.outsideZone).not.toBeNull();
  const limit = travel.playbackLimit(0, 75);
  expect(limit.travel).toBeGreaterThan(0);
  await load(page, project);
  const before = await editable(page),
    panel = await openLidPanel(page, section.id);
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  const finding = panel.getByTestId("lid-work-zone-finding");
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  const scene = page.getByTestId("lid-preview-label");
  await expect(scene).toHaveAttribute("data-angle", String(limit.travel));
  await expect(scene).toContainText("work-zone limit");
  await expect(finding).toContainText(travel.outsideZone!.faces[0]);
  await finding
    .getByRole("button", { name: "Inspect work-zone limit", exact: true })
    .click();
  await expect(page.getByTestId("lid-preview-label")).toHaveAttribute(
    "data-angle",
    String(travel.outsideZone!.inspectAngle),
  );
  await renderedPose(
    page,
    lidPreview(before, section.id, travel.outsideZone!.inspectAngle),
  );
  await expect(page.getByTestId("lid-preview-label")).toContainText(
    `outside ${travel.preview(travel.outsideZone!.inspectAngle).outsideZoneFaces!.join(", ")}`,
  );
  await panel
    .getByRole("button", { name: "Inspect closed (0°)", exact: true })
    .click();
  await expect(page.getByTestId("lid-preview-label")).toHaveAttribute(
    "data-angle",
    "0",
  );
  expect(await editable(page)).toEqual(before);
  if (
    await panel
      .getByRole("button", { name: "Exit lid preview", exact: true })
      .count()
  )
    await panel
      .getByRole("button", { name: "Exit lid preview", exact: true })
      .click();
  await expect(page.getByTestId("lid-preview-label")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Preview lid open", exact: true })
    .check();
  const opened = await draft(
      page,
      (actual) => actual.sections[0].recipe?.lidOpen === true,
    ),
    expectedPose = lidPreview(before, section.id, 75).piece,
    actualLid = opened.pieces.find((piece) => piece.id === travel.lidId)!;
  expect(actualLid.size).toEqual(expectedPose.size);
  expect(actualLid.cutPlanes).toEqual(expectedPose.cutPlanes);
  expect(actualLid.cutStock).toEqual(expectedPose.cutStock);
  for (let i = 0; i < 3; i++)
    expect(actualLid.position[i]).toBeCloseTo(expectedPose.position[i], 8);
  const saved = await reopen(page, opened);
  expect(saved.pieces).toEqual(opened.pieces);
  expect(saved.sections).toEqual(opened.sections);
  expect(saved.history).toEqual(opened.history);
  expect(bom(saved).map((row) => [row.id, row.quantity])).toEqual(
    bom(before).map((row) => [row.id, row.quantity]),
  );
  await openLidPanel(page, section.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("preparation opens the affected banquette lid at the intermediate collision", async ({ page }) => {
  const before = await load(page, fixture(2));
  const [section] = before.sections;
  const obstacle = before.pieces.find(({ assembly }) => assembly === "Loose obstruction")!;
  const review = reviewLidTravel(before, section.id);
  const hit = review.collisions.find(({ pieceId }) => pieceId === obstacle.id)!;
  const group = await openClearanceChecklist(page);
  await group.getByRole("button", { name: /Lid interference.*SYNTHETIC obstacle intersecting only intermediate travel/ }).click();
  await expect(page.getByRole("heading", { name: section.name, exact: true })).toBeVisible();
  const scene = page.getByTestId("lid-preview-label");
  await renderedPose(page, review.preview(hit.inspectAngle));
  await expect(scene).toContainText("overlapping part(s) in red");
  const panel = page.getByRole("region", { name: "Lid travel review", exact: true });
  await panel.getByRole("button", { name: "Inspect closed (0°)", exact: true }).click();
  await expect(scene).toHaveAttribute("data-angle", "0");
  await page.getByRole("button", { name: "← Back to build preparation", exact: true }).click();
  await expect(scene).toHaveCount(0);
  await expect(page.locator(".build-preparation-print")).toContainText("Lid interference");
  expect(await editable(page)).toEqual(before);
  await page.getByRole("button", { name: "Part", exact: true }).click();
  await expect(page.locator(".build-preparation-print")).not.toContainText("Lid interference");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator(".build-preparation-print")).toContainText("Lid interference");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".build-preparation-print")).not.toContainText("Lid interference");
});

test("folding stay reach stops lid playback, exports the measured fit and adds the exact handed SKU distinctly", async ({
  page,
}) => {
  const study = { ...fixture(1), workZone: null };
  const project = await load(page, study);
  const section = project.sections[0];
  const fixed = project.pieces.find(
    (piece) => piece.designRole === "storage-left",
  )!;
  const panel = await openLidPanel(page, section.id);
  const editor = panel.locator("details").filter({
    has: page.getByText("Fit a folding lid stay", { exact: true }),
  });
  await editor.locator(":scope > summary").click();
  await editor
    .getByRole("combobox", { name: "Stationary mounting member" })
    .selectOption(fixed.id);
  await editor
    .getByRole("combobox", { name: "Folding stay reference" })
    .selectOption("everbilt-19834-lid-stay");
  for (const [label, datum] of [
    ["Cabinet pin local X", 0.5],
    ["Cabinet pin local Y", 4],
    ["Cabinet pin local Z", -6],
    ["Lid pin local X", -11.125],
    ["Lid pin local Y", -0.375],
    ["Lid pin local Z", -5],
    ["Cabinet arm (in)", 4],
    ["Lid arm (in)", 4],
  ] as const)
    await editor
      .getByRole("spinbutton", { name: label, exact: true })
      .fill(String(datum));
  await editor
    .getByRole("button", { name: "Save folding stay", exact: true })
    .click();
  const saved = await draft(page, (actual) => actual.lidStayFits?.length === 1);
  const fitted = panel.locator("details").filter({
    has: page.getByText(/^Fit a folding lid stay · 1 saved$/),
  });
  await expect(fitted.getByTestId("lid-stay-fit-result")).toContainText(
    "Measured reach stops travel near",
  );
  await expect(
    fitted.getByRole("link", { name: "Home Depot reference" }),
  ).toHaveAttribute("href", "https://www.homedepot.com/p/204485795");
  expect(saved.supplies.length).toBe(0);
  await fitted
    .getByRole("button", { name: "Add 19834 to shopping list", exact: true })
    .click();
  await expect(fitted).toContainText("1 planned · 1 on shopping list");
  await expect(
    fitted.getByRole("button", {
      name: "Add 19834 to shopping list",
      exact: true,
    }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  await expect(panel.getByTestId("lid-stay-live")).toHaveAttribute(
    "data-state",
    "reachable",
  );
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(
    panel.getByText(
      "Playback stopped at a folding stay’s measured reach limit.",
      { exact: true },
    ),
  ).toBeVisible();
  const angle = Number(
    await page.getByTestId("lid-preview-label").getAttribute("data-angle"),
  );
  expect(angle).toBeGreaterThan(10);
  expect(angle).toBeLessThan(75);
  await panel
    .getByRole("button", { name: "Inspect open (90°)", exact: true })
    .click();
  await expect(panel.getByTestId("lid-stay-live")).toHaveAttribute(
    "data-state",
    "too-far",
  );
  await renderedPose(page, reviewLidTravel(saved, section.id, 90).preview(90));
  await panel
    .getByRole("button", { name: "Exit lid preview", exact: true })
    .click();

  const before = await editable(page);
  expect(before.lidStayFits).toEqual(saved.lidStayFits);
  expect(before.pieces).toEqual(saved.pieces);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const read = await page.request.get(`/api/projects/${before.id}`);
  expect(read.ok()).toBe(true);
  expect((await read.json()).project.lidStayFits).toEqual(saved.lidStayFits);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await pending).path())!, "utf8");
  expect(guide).toMatch(/Folding lid stay fit[\s\S]*Everbilt 19834 left-hand/);
  expect(guide).toContain("Measured reach stops travel near");
  await expect(page.locator(".print-guide")).toContainText(
    "Folding lid stay fit",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveValue(/1 lid stay .*#204485795/);

  const reopened = await load(page, before);
  expect(reopened.lidStayFits).toEqual(saved.lidStayFits);
});

test("measured stay arms stop lid playback in both directions and survive export", async ({
  page,
}, info) => {
  const study = { ...fixture(1), workZone: null };
  const section = study.sections[0];
  const fixed = study.pieces.find(
    (piece) => piece.designRole === "storage-left",
  )!;
  const obstacle = part(
    "SYNTHETIC stay arm obstacle",
    "stud",
    [0.05, 0.006, 0.006],
    [0, 13.2525906, -1.6010801],
    study.steps[0].id,
    "Test",
  );
  study.pieces.push(obstacle);
  const initial = saveLidStayFit(study, section.id, {
    fixedPieceId: fixed.id,
    productId: null,
    fixedPin: [-fixed.position[0], 11 - fixed.position[1], -7],
    lidPin: [0, -1.5, -5],
    fixedArm: 9,
    lidArm: 9,
    foldSign: 1,
    testAngle: 90,
  });
  await load(page, initial);
  const panel = await openLidPanel(page, section.id);
  await panel
    .getByText("Fit a folding lid stay · 1 saved", { exact: true })
    .click();
  await panel
    .getByRole("combobox", { name: "Folding stay plan" })
    .selectOption(initial.lidStayFits![0].id);
  await panel
    .getByText("Arm dimensions for collision preview", { exact: true })
    .click();
  const save = panel.getByRole("button", {
    name: "Save folding stay",
    exact: true,
  });
  await panel
    .getByRole("spinbutton", { name: "Cabinet arm width (in)", exact: true })
    .fill("0.004");
  await save.click();
  await expect(panel.getByRole("alert")).toContainText(
    "Enter the width and thickness of both arms",
  );
  for (const [label, value] of [
    ["Cabinet arm thickness", "0.125"],
    ["Lid arm width", "0.004"],
    ["Lid arm thickness", "0.125"],
  ]) {
    await panel
      .getByRole("spinbutton", { name: `${label} (in)`, exact: true })
      .fill(value);
  }
  await save.click();
  const saved = await draft(
    page,
    (project) => !!project.lidStayFits?.[0]?.armEnvelopes,
  );
  const label = partLabel(saved, obstacle.id);
  await expect(panel.getByTestId("lid-stay-fit-result")).toContainText(
    `Modeled stay arm hits ${label}`,
  );
  const motion = reviewLidStayFit(saved, saved.lidStayFits![0]);
  if (motion.state !== "current") throw Error(motion.reason);
  expect(motion.playbackLimit(0, 90)!.travel).toBeGreaterThan(34);
  expect(motion.playbackLimit(90, 0)!.travel).toBeLessThan(34.5);
  await panel
    .getByRole("button", { name: "Review lid travel", exact: true })
    .click();
  const scene = page.getByTestId("lid-preview-label");
  await expect(scene).toHaveAttribute("data-stay-arms", "2");
  await panel
    .getByRole("button", { name: "Play opening", exact: true })
    .click();
  await expect(scene).toHaveAttribute(
    "data-angle",
    String(motion.playbackLimit(0, 90)!.travel),
  );
  await expect(scene).toContainText("Stay arm contact ahead");
  await panel
    .getByRole("button", { name: "Inspect arm contact", exact: true })
    .click();
  await expect(panel.getByTestId("lid-stay-live")).toContainText(
    `Arm overlap with ${label}`,
  );
  await expect(scene).toContainText("Stay arm overlap in red");
  await expect(panel.getByTestId("lid-travel-results")).toContainText("Lid panel clears the modeled parts");
  await page.screenshot({
    path: info.outputPath("folding-stay-arm-contact.png"),
    animations: "disabled",
  });

  await panel
    .getByRole("button", { name: "Inspect open (90°)", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Play closing", exact: true })
    .click();
  await expect(scene).toHaveAttribute(
    "data-angle",
    String(motion.playbackLimit(90, 0)!.travel),
  );
  await expect(
    panel.getByRole("button", { name: "Inspect arm contact", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Exit lid preview", exact: true })
    .click();
  const exported = await editable(page);
  expect(exported.pieces).toEqual(saved.pieces);
  expect(exported.lidStayFits).toEqual(saved.lidStayFits);
  await expect(page.locator(".print-guide")).toContainText(
    `Modeled stay arm hits ${label}`,
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await pending).path())!, "utf8");
  expect(guide).toContain(`Modeled stay arm hits ${label}`);
  expect(guide).toContain("Cabinet arm 0.004 in wide × 0.125 in thick");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const checklist = await openClearanceChecklist(page);
  await checklist.getByRole("button", { name: /Lid travel.*Modeled stay arm hits/ }).click();
  const hit = motion.playbackLimit(0, 90)!;
  await expect(scene).toHaveAttribute("data-angle", String(hit.inspectAt));
  await expect(scene).toContainText("Stay arm overlap in red");
  const reopened = await load(page, exported);
  expect(reopened.lidStayFits).toEqual(saved.lidStayFits);
});
