import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { blank, part } from "../../src/model";

test("draw a dryer duct run, see a modeled overlap, and clear it by moving the part", async ({ page }) => {
  const base = blank("Dryer routing study");
  const wall = part("Utility chase panel", "plywood", [16, 16, 0.75], [0, 12, 6], base.steps[0].id, "Utility");
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles({
    name: "dryer-route.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...base, pieces: [wall] })),
  });
  await expect(dialog).toHaveCount(0);
  const inspector = page.locator(".inspector-scroll");
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  const references = inspector.locator("summary").filter({ hasText: /^Project code references$/ });
  await references.click();
  await inspector.getByRole("checkbox", { name: "HVAC", exact: true }).check();
  await inspector.getByRole("checkbox", { name: "Review a dryer exhaust route" }).check();
  await inspector.getByRole("combobox", { name: "Dryer type" }).selectOption("ducted");
  await inspector.locator("summary").filter({ hasText: /^3D fixed duct layout$/ }).click();
  await inspector.getByRole("button", { name: "Add straight run", exact: true }).click();
  await inspector.locator("summary").filter({ hasText: /^Dryer run 1/ }).click();
  await inspector.getByRole("spinbutton", { name: "Dryer run 1 end Z", exact: true }).fill("48");
  await inspector.getByRole("button", { name: "Save code review inputs" }).click();
  const clash = inspector.getByRole("button", { name: /^Dryer duct run 1/ });
  await expect(clash).toContainText("Envelope overlap");
  await expect(clash).toContainText(wall.name);
  await inspector.getByRole("button", { name: "Show dryer duct layout in 3D" }).click();
  const mark = page.getByTestId("dryer-duct-run-marker");
  await expect(mark).toHaveAttribute("data-review", "overlap");
  await expect(mark).toHaveText("Run 1 · 4 ft · Overlap");
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await inspector.locator(`button.step-part[data-part-id="${wall.id}"]`).click();
  const x = inspector.getByRole("spinbutton", { name: "X", exact: true });
  await x.fill("24");
  await x.press("Enter");
  await expect(x).toHaveValue("24");
  await page.getByRole("button", { name: /^Checks/ }).first().click();
  await expect(clash).toHaveCount(0);
  await expect(mark).toHaveAttribute("data-review", "clear");
  const activeId = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.id as string, CURRENT_DRAFT_KEY);
  const save = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${activeId}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const api = await page.request.get(`/api/projects/${activeId}`);
  expect(api.ok()).toBe(true);
  expect((await api.json()).project.projectCode.dryerExhaust).toMatchObject({
    runLength: null,
    layout: { envelopeWidth: 4, runs: [{ start: [0, 12, 0], end: [0, 12, 48] }] },
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Dryer duct run 1.*4 ft.*No modeled envelope overlap found/);
});

test("a dated project reference surfaces a discrepancy and saves a corrected measurement", async ({
  page,
}) => {
  page.setDefaultTimeout(10_000);
  await page.goto("/");
  await page.getByRole("button", { name: /^Checks/ }).click();
  const inspector = page.locator(".inspector-scroll");
  await inspector.getByText("Project code references", { exact: true }).click();
  await inspector
    .getByRole("combobox", { name: "Build jurisdiction", exact: true })
    .selectOption("utah");
  await inspector
    .getByLabel("Project or permit date", { exact: true })
    .fill("2026-11-19");
  await inspector
    .getByLabel("Building authority", { exact: true })
    .fill("Simulated building authority");
  await inspector
    .getByLabel("Authority confirmation notes", { exact: true })
    .fill("Test only");
  await inspector
    .getByRole("combobox", { name: "Building code path", exact: true })
    .selectOption("irc");
  await inspector
    .getByRole("combobox", { name: "Work type", exact: true })
    .selectOption("existing");
  await inspector
    .getByRole("checkbox", { name: "Plumbing", exact: true })
    .check();
  await inspector
    .getByRole("combobox", {
      name: "Plumbing vent ends through a wall",
      exact: true,
    })
    .selectOption("yes");
  const distance = inspector.getByLabel("Vent distance from exterior wall", {
    exact: true,
  });
  await distance.fill("11.875");
  const elbow = inspector.getByRole("combobox", {
    name: "Termination elbow direction",
    exact: true,
  });
  await elbow.selectOption("other");
  await inspector
    .getByRole("button", { name: "Save code review inputs" })
    .click();

  await expect(
    inspector.getByText("Difference to review", { exact: true }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("link", { name: /IRC P3101\.4/ }),
  ).toBeVisible();
  await inspector
    .getByText("Edit project code inputs", { exact: true })
    .click();
  await inspector
    .getByRole("combobox", {
      name: "Vent distance from exterior wall units",
      exact: true,
    })
    .selectOption("ft");
  await distance.fill("1");
  await elbow.selectOption("down");
  await inspector
    .getByRole("button", { name: "Save code review inputs" })
    .click();
  await expect(
    inspector.getByText("Entered measurement matches this check", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    inspector.getByText("Difference to review", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const path = await (await pending).path();
  const saved = JSON.parse(await readFile(path!, "utf8"));
  expect(saved.zip).toBe("84121");
  expect(saved.projectCode.wallVent).toEqual({
    inScope: "yes",
    projection: 12,
    elbow: "down",
  });
});

test("site datums update the 3D sidewall vent review and survive a save and an editable export", async ({
  page,
}) => {
  page.setDefaultTimeout(12_000);
  await page.goto("/");
  await page.getByRole("button", { name: /^Checks/ }).click();
  const inspector = page.locator(".inspector-scroll");
  await inspector.getByText("Project code references", { exact: true }).click();
  await inspector
    .getByRole("combobox", { name: "Build jurisdiction", exact: true })
    .selectOption("utah");
  await inspector
    .getByLabel("Project or permit date", { exact: true })
    .fill("2026-11-19");
  await inspector
    .getByLabel("Building authority", { exact: true })
    .fill("Synthetic test authority");
  await inspector
    .getByLabel("Authority confirmation notes", { exact: true })
    .fill("Synthetic site coordinates for browser verification");
  await inspector
    .getByRole("combobox", { name: "Building code path", exact: true })
    .selectOption("ibc");
  await inspector
    .getByRole("combobox", { name: "Work type", exact: true })
    .selectOption("existing");
  await inspector
    .getByRole("checkbox", { name: "Plumbing", exact: true })
    .check();
  await inspector
    .getByRole("combobox", {
      name: "Plumbing vent ends through a wall",
      exact: true,
    })
    .selectOption("yes");
  await inspector
    .getByRole("combobox", { name: "Termination elbow direction", exact: true })
    .selectOption("down");
  await inspector
    .getByLabel("Vent distance from exterior wall", { exact: true })
    .fill("3");
  await inspector
    .getByRole("button", { name: "Save code review inputs", exact: true })
    .click();
  const row = (label: string) =>
    inspector.locator(".code-review-list > li").filter({
      has: page.getByText(label, { exact: true }),
    });
  await expect(row("Through-wall plumbing vent termination")).toContainText(
    "3 in is short",
  );
  const datums = inspector.locator(".vent-layout-panel");
  await datums.getByText("Set vent and site datums", { exact: true }).click();
  await datums
    .getByRole("combobox", { name: "Exterior side of wall", exact: true })
    .selectOption("+Z");
  for (const [label, value] of [
    ["Exterior wall coordinate", "0"],
    ["Terminal X", "0"],
    ["Terminal Z", "12"],
  ])
    await datums.getByLabel(label, { exact: true }).fill(value);
  await datums
    .getByRole("combobox", { name: "Terminal Y units", exact: true })
    .selectOption("ft");
  await datums.getByLabel("Terminal Y", { exact: true }).fill("9");
  await datums
    .getByText("Lot line and grade · IPC site checks", { exact: true })
    .click();
  await datums.getByLabel("Lot point A X", { exact: true }).fill("108");
  await datums
    .getByRole("button", { name: "Save vent datums", exact: true })
    .click();
  await expect(datums.getByRole("alert")).toContainText(
    "Complete all coordinates for the lot-line segment",
  );
  for (const [label, value] of [
    ["Lot point A Z", "-60"],
    ["Lot point B X", "108"],
    ["Lot point B Z", "72"],
    ["Grade point X", "0"],
    ["Grade point Y", "0"],
    ["Grade point Z", "0"],
  ])
    await datums.getByLabel(label, { exact: true }).fill(value);
  await datums
    .getByText("Opening and soffit conditions", { exact: true })
    .click();
  await datums
    .getByRole("combobox", {
      name: "Under an overhang with soffit vents",
      exact: true,
    })
    .selectOption("no");
  await datums
    .getByRole("combobox", {
      name: "Opening protected from birds and rodents",
      exact: true,
    })
    .selectOption("yes");
  await datums
    .getByRole("button", { name: "Save vent datums", exact: true })
    .click();
  await expect(datums.getByTestId("vent-projection")).toHaveText(
    "1 ft out from the exterior wall",
  );
  await expect(row("Through-wall plumbing vent termination")).toContainText(
    "Measured layout gives 1 ft",
  );
  await expect(row("Sidewall vent to measured lot line")).toContainText(
    "9 ft measured. Short of the 10 ft",
  );
  await expect(row("Sidewall vent above highest adjacent grade")).toContainText(
    "9 ft measured. Short of the 10 ft",
  );
  await expect(row("Terminal opening protection")).toContainText(
    "Recorded condition matches this check",
  );
  await datums
    .getByRole("button", { name: "Show vent datums in 3D", exact: true })
    .click();
  await expect(
    page.getByText("A space for your next idea.", { exact: true }),
  ).toBeHidden();
  await expect(page.getByTestId("plumbing-vent-terminal")).toHaveText(
    "Vent · 1 ft from wall",
  );
  await expect(page.getByTestId("plumbing-vent-grade")).toHaveText(
    "Grade rise · 9 ft",
  );
  await expect(page.getByTestId("plumbing-vent-lot")).toHaveText(
    "Lot line · 9 ft",
  );

  await datums
    .getByRole("combobox", { name: "Terminal Y units", exact: true })
    .selectOption("ft");
  await datums.getByLabel("Terminal Y", { exact: true }).fill("10");
  await datums
    .getByRole("button", { name: "Save vent datums", exact: true })
    .click();
  await expect(row("Sidewall vent above highest adjacent grade")).toContainText(
    "10 ft measured. Meets the 10 ft",
  );
  await expect(page.getByTestId("plumbing-vent-grade")).toHaveText(
    "Grade rise · 10 ft",
  );

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain(
    "Exterior wall datum · +Z at 0 in. Terminal (X, Y, Z) · 0 in, 10 ft, 1 ft",
  );
  expect(guide).toContain(
    "Sidewall vent above highest adjacent grade · Entered measurement matches this check",
  );
  await expect(page.locator(".print-guide")).toContainText(
    "Sidewall vent to measured lot line",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const result = await readFile((await (await pending).path())!);
  const saved = JSON.parse(result.toString());
  expect(saved.zip).toBe("84121");
  expect(saved.projectCode.wallVent.projection).toBe(3);
  expect(saved.projectCode.wallVent.layout.terminal).toEqual([0, 120, 12]);
  const stored = await page.request.get(`/api/projects/${saved.id}`);
  expect(stored.ok()).toBe(true);
  expect((await stored.json()).project.projectCode).toEqual(saved.projectCode);

  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "synthetic-vent-datums.yardwork.json",
    mimeType: "application/json",
    buffer: result,
  });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /^Checks/ }).click();
  if (!(await datums.isVisible()))
    await inspector
      .getByText("Project code references", { exact: true })
      .click();
  await expect(row("Sidewall vent above highest adjacent grade")).toContainText(
    "10 ft measured",
  );
});

test("Utah dryer exhaust checks count the fittings and carry corrected measurements into the guide and saved project", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Checks/ }).click();
  const inspector = page.locator(".inspector-scroll");
  await inspector.getByText("Project code references", { exact: true }).click();
  await inspector
    .getByRole("combobox", { name: "Build jurisdiction" })
    .selectOption("utah");
  await inspector
    .getByLabel("Project or permit date", { exact: true })
    .fill("2026-11-20");
  await inspector
    .getByLabel("Building authority", { exact: true })
    .fill("Synthetic authority");
  await inspector
    .getByLabel("Authority confirmation notes", { exact: true })
    .fill("Synthetic scope for dryer route browser verification");
  await inspector
    .getByRole("combobox", { name: "Building code path" })
    .selectOption("irc");
  await inspector
    .getByRole("combobox", { name: "Work type" })
    .selectOption("new");
  await inspector.getByRole("checkbox", { name: "HVAC", exact: true }).check();
  await inspector
    .getByRole("checkbox", { name: "Review a dryer exhaust route" })
    .check();
  await inspector
    .getByRole("combobox", { name: "Dryer type" })
    .selectOption("ducted");
  await inspector
    .getByRole("combobox", { name: "Dryer exhaust length method" })
    .selectOption("specified");
  await inspector
    .getByRole("spinbutton", { name: "Fixed exhaust duct run", exact: true })
    .fill("31");
  await inspector.getByText("Exhaust duct fittings", { exact: true }).click();
  const tight = inspector.getByRole("spinbutton", {
    name: "Mitered 90° · 4 in radius",
    exact: true,
  });
  await tight.fill("1");
  const confirmed = inspector.getByRole("checkbox", {
    name: "All fittings accounted for, or the run has none",
  });
  await confirmed.check();
  await inspector
    .getByRole("spinbutton", {
      name: "Separate transition connector length",
      exact: true,
    })
    .fill("108");
  const concealed = inspector.getByRole("combobox", {
    name: "Transition connector concealed in construction",
  });
  await concealed.selectOption("yes");
  const save = inspector.getByRole("button", {
    name: "Save code review inputs",
  });
  await save.click();
  const warning = inspector.getByRole("button", {
    name: /^Dryer exhaust duct length/,
  });
  await expect(warning).toContainText("Equivalent length 36 ft");
  await expect(warning).toContainText("1 ft above the reference");
  await expect(
    inspector.getByRole("button", {
      name: /^Dryer transition connector length/,
    }),
  ).toContainText("9 ft");
  await expect(
    inspector.getByRole("button", {
      name: /^Dryer transition connector location/,
    }),
  ).toContainText("inside construction");
  await expect(
    inspector.getByRole("link", { name: /2021 IRC M1502/ }),
  ).toHaveAttribute("href", /IRC2021P3/);

  const editor = inspector.getByText("Edit project code inputs", {
    exact: true,
  });
  if (!(await tight.isVisible())) await editor.click();
  await tight.fill("0");
  await inspector
    .getByRole("spinbutton", { name: "Smooth 90° · 6 in radius", exact: true })
    .fill("2");
  await expect(confirmed).not.toBeChecked();
  await confirmed.check();
  await inspector
    .getByRole("combobox", {
      name: "Separate transition connector length units",
    })
    .selectOption("ft");
  await inspector
    .getByRole("spinbutton", {
      name: "Separate transition connector length",
      exact: true,
    })
    .fill("8");
  await concealed.selectOption("no");
  await save.click();
  await expect(warning).toHaveCount(0);
  await expect(inspector.getByText(/Equivalent length 414 in/)).toContainText(
    "6 in below the reference",
  );
  await inspector
    .getByText(/Equivalent length 414 in/)
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("dryer-exhaust-review.png"),
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  const activeId = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).project.id as string,
    CURRENT_DRAFT_KEY,
  );
  const api = await page.request.get(`/api/projects/${activeId}`);
  expect(api.ok()).toBe(true);
  expect((await api.json()).project.projectCode.dryerExhaust).toMatchObject({
    runLength: 372,
    fittingCounts: { "smooth-6-90": 2 },
    transitionLength: 96,
    transitionConcealed: "no",
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("Entered fittings · 2 × Smooth 90° · 6 in radius");
  expect(guide).toContain("6 in below the reference");
  await expect(page.locator(".print-guide")).toContainText(
    "Entered separate transition connector · 8 ft",
  );
});
