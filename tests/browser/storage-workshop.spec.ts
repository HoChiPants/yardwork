import { test, expect, type Page } from "@playwright/test";
import { projectSchema } from "../../src/model";
const request =
  "a kitchenette banquette with three sections and an openable lid, no back since the wall will be the back with storage in the bottom so its closed off but the seats open to create a space underneath";
async function exported(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const stream = await (await event).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return projectSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}
test("work-zone fields use independent units and the finished zone leaves planning controls at the top", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set work zone", exact: true })
    .first()
    .click();
  await page.getByLabel("Width units", { exact: true }).selectOption("ft");
  await page.getByLabel("Zone width", { exact: true }).fill("7.5");
  await page.getByLabel("Zone depth", { exact: true }).fill("36");
  await page.getByLabel("Height units", { exact: true }).selectOption("ft");
  await page.getByLabel("Zone height", { exact: true }).fill("7.25");
  await page.getByLabel("Width units", { exact: true }).selectOption("in");
  await expect(page.getByLabel("Zone width", { exact: true })).toHaveValue(
    "90",
  );
  await expect(page.getByLabel("Zone depth", { exact: true })).toHaveValue(
    "36",
  );
  await expect(page.getByLabel("Zone height", { exact: true })).toHaveValue(
    "7.25",
  );
  await page
    .getByRole("button", { name: "Apply work zone", exact: true })
    .click();
  await expect(page.locator(".empty-workspace")).toHaveCount(0);
  await expect(page.locator(".design-actions .zone-button")).toContainText(
    "7′ 6″",
  );
  await expect(
    page
      .locator(".project-heading")
      .getByRole("button", { name: "Plan an idea", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Work zone · .*wide/)).toHaveCount(0);
  expect((await exported(page)).workZone).toEqual({
    width: 90,
    depth: 36,
    height: 87,
  });
});
test("the exact three-section storage request supports refinement, opening lids and stock-preserving section height edits", async ({
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
    .fill(request);
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.locator(".planner-module")).toHaveCount(3);
  await expect(page.getByLabel("Include a back").first()).not.toBeChecked();
  await expect(page.getByLabel("Closed storage below").first()).toBeChecked();
  await expect(page.getByLabel("Opening seat / lid").first()).toBeChecked();
  await page
    .getByRole("textbox", { name: "Describe your idea", exact: true })
    .fill("Make all seats 20 inches high");
  await expect(
    page.getByRole("button", { name: "Add proposed layout", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.locator(".planner-module")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Add proposed layout", exact: true })
    .click();
  const original = await exported(page);
  expect(original.sections).toHaveLength(3);
  expect(
    original.sections.every(
      (s) =>
        s.recipe?.storage &&
        s.recipe.openingLid &&
        s.recipe.backHeight === 0 &&
        s.recipe.height === 20,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(original.sections[0].id);
  await page
    .getByRole("spinbutton", { name: "Section seat height", exact: true })
    .fill("22");
  await page
    .getByRole("button", { name: "Apply dimensions", exact: true })
    .click();
  await page.getByLabel("Preview lid open", { exact: true }).check();
  const opened = await exported(page);
  expect(opened.sections[0].recipe?.height).toBe(22);
  expect(opened.sections[0].recipe?.lidOpen).toBe(true);
  expect(
    opened.sections.slice(1).every((s) => s.recipe?.height === 20),
  ).toBeTruthy();
  await page.getByLabel("Preview lid open", { exact: true }).uncheck();
  const closed = await exported(page);
  expect(closed.sections[0].recipe?.lidOpen).toBe(false);
  expect(
    closed.pieces
      .filter((p) => p.material === "plywood")
      .every((p) => Math.min(...p.size) === 0.75),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("a model timeout offers a built-in plan and keeps the requested storage modules through refinement", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/planner", async (route) => {
    attempts++;
    await route.fulfill({
      status: 504,
      json: { error: "The local model reached the planning deadline." },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const prompt = page.getByRole("textbox", { name: "Describe your idea", exact: true });
  const explore = page.getByRole("button", { name: "Explore idea", exact: true });
  const fallback = page.getByRole("button", { name: "Use built-in layout", exact: true });
  await prompt.fill(request);
  await explore.click();
  await expect(page.getByRole("alert")).toContainText("The local model reached the planning deadline.");
  await fallback.click();
  await expect(page.locator(".planner-provider")).toContainText("Local planning presets");
  await expect(page.locator(".planner-module")).toHaveCount(3);
  expect(attempts).toBe(1);

  await prompt.fill("Make all seats 20 inches high");
  await explore.click();
  await expect(fallback).toBeVisible();
  await fallback.click();
  await expect(page.locator(".planner-module")).toHaveCount(3);
  await page.getByRole("button", { name: "Add proposed layout", exact: true }).click();
  const result = await exported(page);
  expect(result.sections).toHaveLength(3);
  for (const { recipe } of result.sections)
    expect(recipe).toMatchObject({ storage: true, openingLid: true, backHeight: 0, height: 20 });
  expect(attempts).toBe(2);
});

test("plywood can be cut to a length and width with separate offcuts and no connection workflow", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add ¾ in exterior plywood", exact: true })
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Specify a connection",
  );
  await page
    .getByLabel("Retained length units", { exact: true })
    .selectOption("ft");
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("5");
  await page.getByLabel("Retained width units", { exact: true }).selectOption("in");
  await page
    .getByRole("spinbutton", { name: "Retained width", exact: true })
    .fill("24");
  await expect(
    page.getByRole("img", { name: "Retained piece and offcut preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("2 offcuts");
  const connections = page.locator("details.connection-settings").filter({
    has: page.locator("summary").filter({ hasText: /^Connect parts$/ }),
  });
  await expect(connections).not.toHaveAttribute("open", "");
  const project = await exported(page);
  expect(project.pieces[0].size).toEqual([24, 0.75, 60]);
  expect(project.pieces.filter((p) => p.offcut)).toHaveLength(2);
  expect(project.joints).toHaveLength(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".bom-row")).toContainText("1 sheet");
});
