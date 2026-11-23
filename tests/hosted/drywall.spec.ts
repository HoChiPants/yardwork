import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { inspectCutStock } from "../../src/cutStock";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { addMeasuredOffcut } from "../../src/measuredOffcuts";
import { applyCommand, blank, parsePrompt, projectSchema } from "../../src/model";
import { transformSection } from "../../src/sections";
import { doorAndWindowExample } from "../../src/wallOpenings";
import { drywallGuideNotes } from "../../src/wallDrywall";
import { reviewWallDrywallJoints } from "../../src/wallDrywallJoints";
import { drywallScrewReviews } from "../../src/wallDrywallScrews";

test("choose a drywall length, score a panel and carry the leftover and exact sheet to the handoff", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("textbox", { name: "Find a material" }).fill("drywall");
  const add = page.getByRole("button", { name: "Add ½ in drywall", exact: true });
  await expect(page.locator(".material-card").filter({ has: add })).toHaveText("½ in drywall");
  await add.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "12 ft", exact: true }).check();
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Height Y", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Stock length axis", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(dialog).toContainText("score-and-snap");
  await dialog.getByRole("spinbutton", { name: "Retained length", exact: true }).fill("6");
  await dialog.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await page.getByRole("button", { name: "Cut pool (1)", exact: true }).click();
  await expect(page.getByRole("region", { name: "Cut pool", exact: true })).toContainText("6 ft");

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#202530306");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const project = projectSchema.parse(JSON.parse(await readFile((await (await download).path())!, "utf8")));
  expect(project.pieces.map(({ size }) => size)).toEqual([[48, 0.5, 72], [48, 0.5, 72]]);
  expect(inspectCutStock(project).valid.size).toBe(1);
});

test("a measured drywall offcut can cover a panel from the Cut pool", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("textbox", { name: "Find a material" }).fill("drywall");
  await page.getByRole("button", { name: "Add ½ in drywall", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Place material", exact: true }).click();
  const width = page.getByRole("spinbutton", { name: "Width X", exact: true });
  await width.fill("24");
  await width.press("Enter");

  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  await page.getByRole("button", { name: "Add measured offcut", exact: true }).click();
  await dialog.getByRole("combobox", { name: /^Matching stock/ }).selectOption("hd-usg-drywall-half-8");
  await dialog.getByRole("spinbutton", { name: "Length", exact: true }).fill("96");
  await dialog.getByRole("spinbutton", { name: "Width", exact: true }).fill("24");
  await expect(dialog.getByRole("spinbutton", { name: "Thickness", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add to Cut pool", exact: true }).click();
  await page.getByRole("button", { name: "Review offcut reuse", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("1 → 0 sheets");
  await dialog.getByRole("button", { name: "Apply offcut plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
});

test("line a door and window wall, reuse a scrap, and reopen its cuts and guide", async ({ page }) => {
  const framed = applyCommand(blank("Drywall cuts around two openings"), parsePrompt(doorAndWindowExample));
  const wall = framed.sections[0];
  const initial = addMeasuredOffcut(framed, framed.steps[0].id, "hd-usg-drywall-half-12", [20, 48, 0.5], "Sample gypsum scrap");
  const scrap = initial.pieces.at(-1)!;
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "framed-wall.yardwork.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...initial, schemaVersion: 141 })),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Plan wall drywall", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Sheet size" })).toHaveValue("hd-usg-drywall-half-12");
  await dialog.getByRole("button", { name: "Preview drywall layout", exact: true }).click();
  await expect(dialog.getByText("3 fitted panels on the front face.")).toBeVisible();
  await dialog.getByText(/^Screws and backing/).click();
  await expect(dialog.getByText(/Review missing edge backing or wide framing gaps/)).toBeVisible();
  await dialog.getByRole("button", { name: "Try adding backing above the window" }).click();
  await expect(dialog.getByText("This layout adds 2 short backing studs to the existing window framing.")).toBeVisible();
  const schedule = dialog.getByText(/^Screws and backing/);
  if (await schedule.evaluate((summary) => !summary.parentElement!.hasAttribute("open"))) await schedule.click();
  await expect(dialog.getByText("130 planned screws on this face.", { exact: false })).toBeVisible();
  await dialog.getByText(/^Drywall row 1 panel 1 · \d+ marks$/).click();
  await expect(dialog.getByRole("img", { name: "Drywall row 1 panel 1 screw marks and cutouts" })).toBeVisible();
  await dialog.getByText("Opening cut marks", { exact: true }).click();
  await expect(dialog.getByText("Drywall row 1 panel 1 has a", { exact: false })).toHaveCount(2);
  await dialog.getByText("Joint tape · 52 in", { exact: true }).click();
  await expect(dialog.getByRole("img", { name: "front drywall joint and opening map" })).toBeVisible();
  await expect(dialog.getByText(/Horizontal at 47\.5 in above bottom/)).toHaveCount(3);
  await dialog.getByText("Cuts and stock", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Use matching scraps for the new parts" }).check();
  await dialog.getByRole("combobox", { name: "Cut orders to save" }).selectOption("proposal");
  await expect(dialog.getByText(/Save 2 stock units with this design/)).toBeVisible();
  await dialog.getByRole("button", { name: "Add drywall to wall", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await draft())?.revision).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Drywall cuts around two openings" }).first().click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const projectDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const project = projectSchema.parse(JSON.parse(await readFile((await (await projectDownload).path())!, "utf8")));
  const lining = project.sections.find(({ wallDrywall }) => wallDrywall?.wallId === wall.id)!;
  const panels = project.pieces.filter(({ id }) => lining.pieceIds.includes(id));
  expect(lining.wallDrywall?.side).toBe("front");
  expect(project.sections.find(({ id }) => id === wall.id)?.generator?.windowOpening?.upperBacking).toBe(true);
  expect(drywallScrewReviews(project)[0]).toMatchObject({ total: 130, blocked: 0, problem: undefined });
  expect(panels.map(({ rectangularOpenings }) => rectangularOpenings?.length ?? 0)).toEqual([2, 0, 1]);
  expect(panels[1].cutStock?.id).toBe(scrap.cutStock?.id);
  expect(project.plannedCutSources).toHaveLength(2);
  expect(inspectCutStock(project).valid.size).toBe(3);
  const moved = transformSection(project, wall.id, [12, 0, 18], [0, Math.PI / 2, 0]);
  const movedLining = moved.sections.find(({ id }) => id === lining.id)!;
  expect(movedLining.origin).toEqual([12, 0, 18]);
  const movedPanels = moved.pieces.filter(({ id }) => lining.pieceIds.includes(id));
  expect(drywallGuideNotes(moved, movedLining, movedPanels)).not.toContain("The source wall or fitted sheets changed");
  expect(reviewWallDrywallJoints(moved, movedLining).joints).toEqual(reviewWallDrywallJoints(project, lining).joints);

  const guideDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain("Hang Drywall · front");
  expect(guide).toContain("Drywall row 1 panel 1 has a 32 in wide");
  expect(guide).toContain("Drywall row 1 panel 1 has a 36 in wide");
  expect(guide).toContain("Drywall screws and backing");
  expect(guide).toContain("130 screws total · estimated 1 × 1-lb box");
  expect(guide).toContain("## Drywall joint tape");
  expect(guide).toContain("52 in of flat joints");
  expect(guide).toContain("250 ft roll 1 · 2948 in left after net cuts");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill(
    "How much drywall joint tape do I need for this wall?",
  );
  await dialog.getByRole("button", { name: /^(Explore idea|Explore with built-in layout)$/ }).click();
  await expect(dialog.getByText(/Front face · 52 in of net flat joints/)).toBeVisible();
  await dialog.getByRole("button", { name: "Review drywall joint tape", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "front drywall joint and opening map" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const purchase = dialog.getByRole("list", { name: "Planned purchases to review" }).getByRole("listitem")
    .filter({ hasText: "coarse-thread drywall screws" });
  await expect(purchase).toContainText("130 planned drywall screws");
  await purchase.getByRole("button", { name: /Add 1 1-lb box/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#100152392");
  const tape = dialog.getByRole("list", { name: "Planned purchases to review" }).getByRole("listitem")
    .filter({ hasText: "250 ft paper joint tape" });
  await expect(tape).toContainText("52 in of flat drywall joints");
  await tape.getByRole("button", { name: /Add 1 roll/ }).click();
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("#100321613");
});

test("ask for both drywall faces, reuse a scrap, and review the saved screw schedule", async ({ page }) => {
  const hall = applyCommand(blank("Two framed walls"), parsePrompt(doorAndWindowExample));
  const first = { ...hall, sections: hall.sections.map((wall) => ({ ...wall, name: "Hall wall" })) };
  const walls = applyCommand(first, parsePrompt("Build a wall 8 ft wide and 8 ft tall"), undefined,
    { origin: [0, 0, 60], rotation: [0, 0, 0], stepNotes: "" });
  const input = addMeasuredOffcut(walls, walls.steps[0].id, "hd-usg-drywall-half-12", [20, 48, 0.5], "Gypsum scrap");
  const plannerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/planner") plannerRequests.push(request.url());
  });
  const dialog = page.getByRole("dialog");
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "framed-walls.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input)),
  });
  await expect(dialog).toHaveCount(0);
  const ask = async (prompt: string) => {
    await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
    await dialog.getByRole("textbox", { name: "Describe your idea", exact: true }).fill(prompt);
    await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  };
  await ask("Plan drywall on both faces of the window wall");
  const layout = dialog.getByRole("region", { name: "Drywall layout", exact: true });
  await expect(layout.getByRole("article", { name: "Hall wall" })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await ask('Hang drywall on both sides of "Hall wall" using twelve-foot sheets with a quarter-inch bottom gap and reuse scraps. Add backing above the window.');
  await expect(layout.getByRole("article")).toHaveCount(1);
  await layout.getByRole("button", { name: "Preview drywall on Hall wall", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Framed wall" })).toHaveValue(hall.sections[0].id);
  await expect(dialog.getByRole("combobox", { name: "Wall face" })).toHaveValue("both");
  await expect(dialog.getByRole("combobox", { name: "Sheet size" })).toHaveValue("hd-usg-drywall-half-12");
  await expect(dialog.getByRole("spinbutton", { name: "Gap above wall base" })).toHaveValue("0.25");
  await expect(dialog.getByText("6 fitted panels on both faces.")).toBeVisible();
  await expect(dialog.getByText("This layout adds 2 short backing studs to the existing window framing.")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Use matching scraps for the new parts" })).toBeChecked();
  const draft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)?.project, CURRENT_DRAFT_KEY);
  expect((await draft()).sections).toHaveLength(2);
  await dialog.getByRole("button", { name: "Add drywall to wall", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections.length).toBe(4);
  const updated = projectSchema.parse(await draft());
  const linings = updated.sections.filter(({ wallDrywall }) => wallDrywall);
  expect(linings.map((section) => [section.wallDrywall!.wallId, section.wallDrywall!.side, section.pieceIds.length]))
    .toEqual([[hall.sections[0].id, "front", 3], [hall.sections[0].id, "back", 3]]);
  expect(updated.pieces.some((piece) => !piece.offcut && piece.cutStock?.id === input.pieces.at(-1)?.cutStock?.id)).toBe(true);

  await ask('How many drywall screws do I need for both faces of "Hall wall"?');
  const schedule = dialog.getByRole("region", { name: "Drywall screws and backing", exact: true });
  await expect(schedule).toContainText("260 planned screws across the selected faces. Estimate 2 × 1-lb boxes.");
  await expect(schedule).toContainText("Front face · 130 planned screws");
  await expect(schedule).toContainText("Back face · 130 planned screws");
  await schedule.getByRole("button", { name: "Review screw locations", exact: true }).click();
  await expect(dialog.getByText("Screws and backing · front face · 130 marks", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Screws and backing · back face · 130 marks", { exact: true })).toBeVisible();
  expect(plannerRequests).toEqual([]);
});
