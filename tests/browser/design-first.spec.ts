import { groupedMaterials } from "../../src/materialGroups";
import { addFramingLumber } from "../helpers/materialPlacement";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect } from "@playwright/test";
import { blank, part } from "../../src/model";
test("starts empty, preserves the old draft explicitly, and offers no coop template", async ({
  page,
}) => {
  const old = blank("Previous unsaved work");
  old.pieces = [
    part(
      "Old board",
      "stud",
      [1.5, 48, 3.5],
      [0, 24, 0],
      old.steps[0].id,
      "Frame",
    ),
  ];
  await page.addInitScript(
    ({ project, key }) =>
      localStorage.setItem(key, JSON.stringify({ project, revision: 0 })),
    { project: old, key: CURRENT_DRAFT_KEY },
  );
  await page.goto("/");
  await expect(page.locator(".statusbar")).toContainText("0 parts");
  await expect(
    page.getByRole("heading", { name: "Untitled project", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (draftKey) => JSON.parse(localStorage.getItem(draftKey)!).project.name,
      CURRENT_DRAFT_KEY,
    ),
  ).toBe(old.name);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("button", { name: /Resume previous browser draft/ })
    .click();
  await expect(page.locator(".statusbar")).toContainText("1 parts");
  await expect(
    page.getByRole("heading", { name: old.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page
    .getByRole("button", { name: "Start a new project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText(/coop/i);
  await page.getByRole("button", { name: /A blank canvas/ }).click();
  await expect(page.locator(".statusbar")).toContainText("0 parts");
});
test("work zone, stock sizes, quick turns and local-axis cuts round trip through export", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set work zone", exact: true })
    .first()
    .click();
  await page.getByLabel("Width units").selectOption("ft");
  await page.getByLabel("Depth units").selectOption("ft");
  await page.getByLabel("Height units").selectOption("ft");
  for (const [axis, value] of [
    ["width", "8"],
    ["depth", "4"],
    ["height", "8"],
  ])
    await page.getByLabel(`Zone ${axis}`, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Apply work zone", exact: true })
    .click();
  await expect(page.locator(".zone-button")).toContainText(
    "8′ W × 4′ D × 8′ H",
  );
  await addFramingLumber(page);
  await page.getByRole("button", { name: "Tip 90°", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Roll", exact: true }),
  ).toHaveValue("90");
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page.getByLabel("Retained length units", { exact: true }).selectOption("in");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("36");
  await expect(page.locator(".cut-preview")).toContainText("offcut");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("100");
  await page.getByRole("spinbutton", { name: "X", exact: true }).press("Tab");
  await page.getByRole("button", { name: "Checks", exact: false }).click();
  await expect(page.locator(".findings")).toContainText(/work zone/i);
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText("Prepare the space");
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.locator(".material-card")).toHaveCount(groupedMaterials().length);
  await addFramingLumber(page, "10 ft");
  await expect(
    page.getByRole("spinbutton", { name: "Height Y", exact: true }),
  ).toHaveValue("120");
  await expect(page.locator(".step-track")).toHaveCount(0);
  await expect(page.locator(".build-timeline").getByRole("button", { name: "Generate build guide", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Brackets", exact: true }).click();
  await expect(page.locator(".material-card")).toHaveCount(1);
});
test("banquette idea previews editable parts, offers suggestions and generates a guide without manual steps", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan an idea", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill(
      "Kitchenette banquette seating 6 ft wide, 2 ft deep and 18 inches seat height",
    );
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    /Local planning presets/,
  );
  await expect(page.getByRole("dialog")).toContainText(/assumptions/i);
  await expect(page.getByRole("dialog")).not.toContainText(/Try a wall/i);
  await page
    .getByRole("button", { name: "Add proposed layout", exact: true })
    .click();
  await expect(page.locator(".statusbar")).not.toContainText("0 parts");
  await expect(page.locator(".step-track")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText(/banquette|bench/i);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".step-track")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("unsupported ideas ask questions and leave the blank design intact", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan an idea", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill("Dig a pool and install its plumbing");
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Let's clarify");
  await expect(
    page.getByRole("button", { name: "Add proposed layout", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("0 parts");
});

test("connection controls record nails and brackets as distinct purchase materials", async ({
  page,
}) => {
  const p = blank("Hardware choices");
  p.pieces = [
    part("Leg", "stud", [1.5, 36, 3.5], [0, 18, 0], p.steps[0].id, "Frame"),
    part("Rail", "stud", [48, 1.5, 3.5], [0, 36.75, 0], p.steps[0].id, "Frame"),
  ];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "hardware.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .locator(`button.step-part[data-part-id="${p.pieces[0].id}"]`)
    .click();
  await page.getByText("Connect parts", { exact: true }).click();
  await page.getByLabel("Connect to part").selectOption(p.pieces[1].id);
  await page.getByLabel("Connection hardware").selectOption("nail");
  await page
    .getByRole("spinbutton", { name: "Hardware count", exact: true })
    .fill("3");
  await page
    .getByRole("spinbutton", { name: "Hardware count", exact: true })
    .press("Tab");
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await expect(page.locator(".joint-row")).toContainText("3 × nail");
  await page.getByLabel("Connection hardware").selectOption("bracket");
  await page
    .getByRole("spinbutton", { name: "Hardware count", exact: true })
    .fill("2");
  await page
    .getByRole("spinbutton", { name: "Hardware count", exact: true })
    .press("Tab");
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("2 quantity records");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.locator(".bom-row").filter({ hasText: "3 in framing nails" }),
  ).toContainText("1 100 pack");
  await expect(
    page.locator(".bom-row").filter({ hasText: "Angle bracket" }),
  ).toContainText("2 each");
});

test("saving an untouched blank archives the previous unsaved draft before overwriting local storage", async ({
  page,
}) => {
  const old = blank("Unsaved old design");
  old.pieces = [
    part(
      "Keep this board",
      "stud",
      [1.5, 24, 3.5],
      [0, 12, 0],
      old.steps[0].id,
      "Frame",
    ),
  ];
  await page.goto("/");
  await page.evaluate(
    ({ project, key }) =>
      localStorage.setItem(key, JSON.stringify({ project, revision: 0 })),
    { project: old, key: CURRENT_DRAFT_KEY },
  );
  await page.reload();
  await expect(page.locator(".statusbar")).toContainText("0 parts");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("button", { name: /Open earlier browser draft/ })
    .click();
  await expect(
    page.getByRole("heading", { name: old.name, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("1 parts");
});

test("a delayed save cannot assign another project's revision to a new blank", async ({
  page,
}) => {
  const a = blank("Delayed save A");
  a.pieces = [
    part("A board", "stud", [1.5, 24, 3.5], [0, 12, 0], a.steps[0].id, "Frame"),
  ];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "save-a.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(a)),
  });
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: { project: { id: string }; baseRevision: number }[] = [];
  await page.route("**/api/projects/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const data = route.request().postDataJSON();
    const index = writes.length;
    writes.push(data);
    if (index === 0) await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: data.project,
        revision: index === 0 ? 7 : 1,
      }),
    });
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("button", { name: /A blank canvas/ }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Save project", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].project.id).not.toBe(writes[0].project.id);
  expect(writes[1].baseRevision).toBe(0);
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
});

test("an oversized legacy guide reports its limit without losing the project or silently exporting a replacement", async ({
  page,
}) => {
  const p = blank("Large legacy instructions");
  const first = p.steps[0];
  p.steps = Array.from({ length: 500 }, (_, i) => ({
    ...first,
    id: crypto.randomUUID(),
    title: `Existing instruction ${i}`,
    notes: `Keep the original instruction ${i}.`,
  }));
  p.pieces = [
    part(
      "Keep board",
      "stud",
      [1.5, 24, 3.5],
      [0, 12, 0],
      p.steps[0].id,
      "Frame",
    ),
  ];
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "large-guide.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator(".statusbar")).toContainText("1 parts");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("exceeds 500 phases");
  await expect(
    page.getByRole("button", { name: /Build guide Markdown/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^Editable project/ }),
  ).toBeEnabled();
});
