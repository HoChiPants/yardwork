import { addFramingLumber } from "../helpers/materialPlacement";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank, part } from "../../src/model";
import { createBuildStudy } from "../../src/buildFixtures";
import { greenhouseDoorChoices, greenhouseDoorMotionInput } from "../../src/greenhouseDoors";
import { saveMotionPlan } from "../../src/mechanismMotion";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { everbiltClosetRod, everbiltRodBracket } from "../../src/closetRodReference";

test("choose grouped framing board lengths and reopen a cut with its exact Home Depot reference", async ({ page }) => {
  const project = blank("Long framing stock check");
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "long-framing.yardwork.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)),
  });
  for (const family of ["2 × 6 framing lumber", "2 × 8 framing lumber"]) {
    await expect(page.getByRole("button", { name: `Add ${family}`, exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: `Add ${family}`, exact: true }).click();
    await expect(dialog.getByRole("radio")).toHaveCount(3);
    await expect(dialog.getByRole("radio", { name: "10 ft", exact: true })).toBeVisible();
    if (family.startsWith("2 × 6")) await page.keyboard.press("Escape");
  }
  await dialog.getByRole("radio", { name: "12 ft", exact: true }).check();
  await dialog.getByRole("spinbutton", { name: "Needed finished length" }).fill("108");
  await expect(dialog).toContainText("10 ft stock fits this cut with 2 ft less length to buy.");
  await dialog.getByRole("button", { name: "Use 10 ft", exact: true }).click();
  await dialog.getByRole("button", { name: "Plan cut and place", exact: true }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: project.name }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true })).toHaveValue(/1 board.*Internet #202085942/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("10 ft");
  expect(guide).toContain("9 ft");
  expect(guide).toContain("11.875 in");
});

async function meshStudy(
  page: Page,
  sizes: [number, number][],
  available?: number,
) {
  const p = blank("Mesh purchase study");
  p.pieces = sizes.map(([w, l], i) =>
    part(
      `Mesh ${i + 1}`,
      "mesh",
      [w, l, 0.04],
      [i * 30, l / 2, 0],
      p.steps[0].id,
      "Wire",
    ),
  );
  if (available != null) {
    p.store = "4409";
    p.inventory = [
      {
        material: "mesh",
        internetNumber: "123456789",
        name: "Matched hardware cloth",
        price: 39.9,
        available,
        store: p.store,
        zip: p.zip,
        checkedAt: new Date().toISOString(),
        url: "https://www.homedepot.com/p/example/123456789",
      },
    ];
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "mesh.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  return p;
}
test("roll quantities show feasible layouts and the Home Depot handoff copies and downloads stock units", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await meshStudy(
    page,
    [
      [13, 200],
      [13, 200],
    ],
    1,
  );
  await expect(page.locator(".bom-row")).toContainText("2 rolls · 2 parts");
  await page.getByText("Roll layout · 2 rolls", { exact: true }).click();
  await expect(
    page.getByRole("img", { name: /Roll \d cutting layout/ }),
  ).toHaveCount(2);
  await page.screenshot({
    path: "test-results/roll-layout.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  const text = await page
    .getByRole("textbox", { name: "Home Depot paste list", exact: true })
    .inputValue();
  expect(text).toBe("2 rolls — Matched hardware cloth — Internet #123456789");
  await expect(
    page.getByRole("list", { name: "Home Depot purchase review" }),
  ).toContainText("Short by 1 in snapshot");
  await page.getByRole("dialog").screenshot({
    path: "test-results/home-depot-handoff.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Copy Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "List copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full checklist", exact: true })
    .click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/-home-depot\.txt$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const checklist = Buffer.concat(chunks).toString("utf8");
  expect(checklist).toContain("- 2 rolls — ½ in hardware cloth");
  expect(checklist).toContain("User-recorded snapshot: 1 available");
  expect(checklist).toContain("PROJECT PHASES");
  expect(errors).toEqual([]);
});
test("Home Depot handoff carries open sauna systems, assembly decisions and conditional cuts", async ({ page }) => {
  const example = await page.request.get("/examples/builds/sauna.yardwork.json");
  expect(example.ok()).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "sauna-framing.yardwork.json",
    mimeType: "application/json",
    buffer: await example.body(),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Take your list to Home Depot.", exact: true });
  await expect(dialog.getByRole("list", { name: "Build systems to review" })).toContainText("heater/electrical and ventilation");
  await dialog.getByText(/assembly connection reviews$/, { exact: false }).click();
  const connections = dialog.getByRole("list", { name: "Assembly connections to review" });
  await expect(connections).toContainText("Sauna: Dry-fit the ceiling framing");
  await expect(connections).toContainText("parts without connection plans");
  await dialog.getByText(/tool capabilities to review$/, { exact: false }).click();
  await expect(dialog.getByRole("list", { name: "Tools for the chosen method" })).toContainText("Cut stock to length");
  const list = dialog.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(list).toHaveValue(/41 boards.*Internet #338861827/);
  await expect(list).not.toHaveValue(/heater|ceiling framing|Cut stock to length/);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download full checklist", exact: true }).click();
  const checklist = await readFile((await (await download).path())!, "utf8");
  expect(checklist).toMatch(/INCOMPLETE MATERIAL LIST/);
  expect(checklist).toMatch(/BUILD SYSTEMS TO REVIEW[\s\S]+heater\/electrical and ventilation/);
  expect(checklist).toMatch(/ASSEMBLY CONNECTIONS TO REVIEW[\s\S]+ceiling framing/);
  expect(checklist).toMatch(/TOOLS TO CHECK FOR THE CHOSEN METHOD[\s\S]+Cut stock to length/);
  await dialog.getByRole("button", { name: "Review assembly connections", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const prep = page.getByRole("region", { name: "Build preparation", exact: true });
  await prep.getByText("Assembly connections", { exact: true }).click();
  await expect(prep.getByRole("button", { name: /Sauna: Dry-fit the ceiling framing/ })).toBeVisible();
});

test("oversized mesh is flagged and remains excluded from quote and handoff purchase count", async ({
  page,
}) => {
  await meshStudy(page, [
    [25, 200],
    [12, 100],
  ]);
  await expect(page.locator(".bom-row")).toContainText("1 roll · 2 parts");
  await expect(page.locator(".bom-row")).toContainText(
    "1 part exceeds this stock size",
  );
  await expect(page.locator(".bom-row")).not.toContainText(/Unpriced|\$/);
  await page.getByText("Project cost estimate", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Pricing coverage" })).toContainText("$39.90");
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy Home Depot list" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Home Depot paste list" }),
  ).toHaveCount(0);
  const summary = page.getByText("2 items need separate review", { exact: true });
  await summary.click();
  const review = page.locator("details.handoff-review").filter({ has: summary });
  await expect(review).toContainText(
    "Mesh 1 · Exceeds stock dimensions",
  );
  await expect(review).toContainText(
    "Exact product match needed",
  );
});
test("blocked clipboard access provides a selected-text fallback instead of claiming a copy succeeded", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
  });
  await meshStudy(page, [[12, 100]], 3);
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Copy Home Depot list", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access was blocked",
  );
  await expect(
    page.getByRole("button", { name: "List copied", exact: true }),
  ).toHaveCount(0);
  const selection = await page
    .getByRole("textbox", { name: "Home Depot paste list", exact: true })
    .evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }));
  expect(selection).toEqual({
    start: 0,
    end: selection.length,
    length: selection.length,
  });
});
test("the export menu offers the Home Depot handoff without leaving the project", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Prepare Home Depot list Copy/paste handoff",
      exact: false,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Take your list to Home Depot.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Open Home Depot’s list instructions",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://www.homedepot.com/c/create-a-list");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("the Home Depot handoff can add the missing planned greenhouse kit once and open tool review", async ({ page }) => {
  const { project: base } = createBuildStudy("greenhouse");
  const [{ entry }] = greenhouseDoorChoices(base);
  const kit = "everbilt-24417-gate-kit";
  const { project } = saveMotionPlan(base, greenhouseDoorMotionInput(base, {
    entryId: entry.id, side: "left", outset: 0, sideOffset: 0, kitId: kit,
  }, 90));
  await page.goto("/");
  await page.getByRole("button", { name: "Import a plan", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "greenhouse-door-purchase.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const needs = dialog.getByRole("list", { name: "Planned purchases to review", exact: true });
  const add = needs.getByRole("button", { name: /^Add 1 door hardware kit of Everbilt/ });
  await expect(add).toBeVisible();
  const beforeDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download full checklist" }).click();
  const beforePath = await (await beforeDownload).path();
  expect(await readFile(beforePath!, "utf8")).toMatch(/PURCHASES STILL TO SELECT FROM THE PLAN[\s\S]+Greenhouse door hardware\. 1 door hardware kit to select/);
  const list = dialog.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(list).not.toHaveValue(/#327600104/);
  await add.click();
  await expect(add).toHaveCount(0);
  await expect(list).toHaveValue(/^1 door hardware kit .*#327600104$/m);
  await expect(dialog.getByRole("list", { name: "Home Depot purchase review" })).toContainText("No recent store snapshot");
  await dialog.getByRole("button", { name: "Review tools", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Inspector" })).toContainText("required capabilities");
});

test("a suggested Home Depot board is copyable and a matching store observation takes precedence", async ({
  page,
}) => {
  await page.goto("/");
  await addFramingLumber(page);
  await page.getByRole("button", { name: "List", exact: true }).click();
  const prepare = page.getByRole("button", {
    name: "Prepare Home Depot list",
    exact: true,
  });
  const pasteList = page.getByRole("textbox", {
    name: "Home Depot paste list",
  });
  await prepare.click();
  await expect(pasteList).toHaveValue(/1 board .*#338861827/);
  await expect(page.getByRole("dialog")).toContainText(
    "Regional listing · Confirm grade, species and treatment",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "No recent store snapshot",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Record store snapshot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use suggested listing", exact: true })
    .click();
  const url = page.getByLabel("Home Depot product URL", { exact: true });
  const number = page.getByLabel("Internet number", { exact: true });
  await expect(url).toHaveValue("https://www.homedepot.com/p/338861827");
  await expect(number).toHaveValue("338861827");
  await url.fill("https://www.homedepot.com/p/312528776");
  await expect(number).toHaveValue("312528776");
  await page.getByLabel("Unit price (USD)", { exact: true }).fill("4.99");
  await page.getByLabel("Available stock units", { exact: true }).fill("8");
  await page.getByLabel("Exact store number", { exact: true }).fill("4409");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await prepare.click();
  await expect(pasteList).toHaveValue(/1 board .*#312528776/);
  await expect(page.getByRole("dialog")).toContainText(
    "8 available in snapshot",
  );
  await expect(page.getByRole("dialog")).not.toContainText("Regional listing");
});

test("Home Depot closet plan measures, records shared rod stock and sends sockets to the handoff", async ({
  page,
}) => {
  const name = `Closet cut preparation ${Date.now()}`;
  const source = JSON.parse(
    await readFile(
      "public/examples/builds/closet-insert.yardwork.json",
      "utf8",
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "closet.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...source, name, supplies: [] })),
  });
  const rodRow = page.locator(".bom-row").filter({ hasText: "Everbilt 96 in closet rod" });
  const order = rodRow.locator(".stock-cut-order");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await order.locator(":scope > summary").click();
  await order.getByText(/^Tube 1 ·/).click();
  await expect(order).toContainText("Measure the actual opening");
  await expect(order.getByRole("button", { name: "Record this stock unit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByText("Fit closet rods · 2", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Everbilt end socket listing" }),
  ).toHaveAttribute("href", "https://www.homedepot.com/p/334188235");
  const selector = page.getByRole("combobox", { name: "Closet rod", exact: true });
  for (const index of [0, 1]) {
    await selector.selectOption({ index });
    await page.getByLabel("Measured opening", { exact: true }).fill("26.094");
    await page.getByLabel("Start flange setback", { exact: true }).fill("0.25");
    await page.getByLabel("End flange setback", { exact: true }).fill("0.125");
    await page.getByLabel("Total insertion clearance", { exact: true }).fill("0.125");
    await page.getByLabel("Measurement notes", { exact: true }).fill(
      "Simulated opening and dry-fit allowances for this test.",
    );
    await page.getByRole("button", { name: "Save rod measurements", exact: true }).click();
    await expect(page.getByText(/Measured cut length/)).toContainText("25.594 in");
    await page.getByRole("button", { name: "Update rod to measured fit", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Inspector" }).getByText(
      "The model matches this fit.",
    )).toBeVisible();
  }
  await page.getByText("Intermediate rod supports · 0", { exact: true }).click();
  await page.getByRole("button", { name: "Add support position", exact: true }).click();
  await page.getByRole("combobox", { name: "Bracket model" }).selectOption(everbiltRodBracket.model);
  await page.getByLabel("Support distance from start face", { exact: true }).fill("13");
  await page.getByLabel("Backing notes", { exact: true }).fill("Test site backing and bracket measurements.");
  await page.getByLabel("Wall to rod center", { exact: true }).fill("11");
  await page.getByLabel("Delivered bracket reach", { exact: true }).fill("11");
  await page.getByRole("button", { name: "Save support position", exact: true }).click();
  await expect(page.getByText(/Recorded reach matches within 1\/32 in · Everbilt 14317/)).toBeVisible();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByText("Everbilt 14317 closet rod brackets", { exact: true }).click();
  await page.getByRole("button", { name: "Add missing Everbilt rod brackets", exact: true }).click();
  await expect(page.getByText("Measured positions 1 · Selected 1.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add missing Everbilt rod brackets", exact: true })).toHaveCount(0);
  await order.locator(":scope > summary").click();
  await order.getByText(/^Tube 1 ·/).click();
  await expect(order.locator("ol > li")).toHaveCount(2);
  await expect(order).toContainText("Expected leftovers · 44.562 in");
  const loss = order.getByRole("spinbutton", { name: "Measured loss per cut (in)" });
  await loss.fill("95");
  await expect(order.getByRole("button", { name: "Record this stock unit" })).toHaveCount(0);
  await loss.fill("0");
  await expect(order).toContainText("Expected leftovers · 44.812 in");
  await loss.fill("0.032");
  await expect(order).toContainText("Expected leftovers · 44.748 in");
  await order.getByRole("button", { name: "Save cutting loss", exact: true }).click();
  await expect(page.getByText("Cutting loss saved for the build guide.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cut pool (0)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await downloading).path())!, "utf8");
  expect(guide).toContain("0.032 in measured loss per cut");
  expect(guide).toContain("Expected leftovers · 44.748 in");
  expect(guide).not.toContain("Recorded tube cutting loss:");
  await expect(page.locator(".stock-cut-order-print")).toContainText("0.032 in measured loss per cut");

  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.locator(".project-list > button").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await order.locator(":scope > summary").click();
  await order.getByText(/^Tube 1 ·/).click();
  await expect(loss).toHaveValue("0.032");
  await expect(order).toContainText("Expected leftovers · 44.748 in");
  await order.getByRole("button", { name: "Record this stock unit" }).click();
  await expect(order).toHaveCount(0);
  const recorded = await page.waitForFunction(({ key, material }) => {
    const project = JSON.parse(localStorage.getItem(key) ?? "null")?.project;
    const parts = project?.pieces?.filter((piece: { material: string }) => piece.material === material);
    return parts?.length === 3 ? parts : false;
  }, { key: CURRENT_DRAFT_KEY, material: everbiltClosetRod.materialId }).then((handle) => handle.jsonValue());
  expect(new Set(recorded.map((piece: { cutStock: { id: string } }) => piece.cutStock.id)).size).toBe(1);
  expect(recorded.map((piece: { cutStock: { tubeKerf: number } }) => piece.cutStock.tubeKerf)).toEqual([0.032, 0.032, 0.032]);
  expect(recorded.filter((piece: { offcut: boolean }) => piece.offcut)).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Cut pool (1)", exact: true })).toBeVisible();
  await rodRow.getByText(/^Recorded cut source 1/).click();
  await expect(rodRow).toContainText("Recorded tube cutting loss: 0.032 in per cut");
  await page
    .getByText("Everbilt rod sockets · 2 to add", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Add missing Everbilt socket pairs",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Everbilt rod sockets · 2 selected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare Home Depot list", exact: true })
    .click();
  const text = await page
    .getByRole("textbox", { name: "Home Depot paste list" })
    .inputValue();
  expect(text).toMatch(/1 rod .*#334188606/);
  expect(text).toMatch(/2 socket pairs .*#334188235/);
  expect(text).toMatch(/1 intermediate bracket .*#206086899/);
  await expect(page.getByRole("dialog")).toContainText(
    "No recent store snapshot",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const id = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id,
    CURRENT_DRAFT_KEY,
  );
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  const saved = (await response.json()).project;
  expect(saved.rodFitPlans.flatMap((plan: { intermediateSupports?: { bracketProductId?: string }[] }) =>
    plan.intermediateSupports ?? [],
  )).toMatchObject([{ bracketProductId: everbiltRodBracket.productId }]);
  expect(saved.tubeCutPlans).toBeUndefined();
  expect(saved.pieces.filter(
    (piece: { material: string }) => piece.material === everbiltClosetRod.materialId,
  )).toEqual(recorded);
});

test("the printable guide retains roll cutting coordinates and purchase quantities", async ({
  page,
}) => {
  await meshStudy(page, [
    [12, 200],
    [12, 200],
  ]);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-guide")).toBeVisible();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".roll-print-table")).toContainText("Mesh 2");
  await expect(page.locator(".roll-print-table")).toContainText("12 in");
  await expect(page.locator(".print-guide")).toContainText(
    "1 roll × ½ in hardware cloth",
  );
});
