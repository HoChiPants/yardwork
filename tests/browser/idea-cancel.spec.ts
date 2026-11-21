import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect, type Page } from "@playwright/test";
import { type Project } from "../../src/model";
import { localIdeaPlan } from "../../src/planning";

async function advertiseConnectedPlanner(page: Page) {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, ai: "ollama", catalog: false } }));
}

test("canceling a pending plan retains the edited proposal and ignores a late result", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await advertiseConnectedPlanner(page);
  let release = () => {};
  let held = false;
  let finishLate = () => {};
  const lateFinished = new Promise<void>((resolve) => {
    finishLate = resolve;
  });
  await page.route("**/api/planner", async (route) => {
    const request = route.request().postDataJSON() as { prompt: string };
    if (request.prompt !== "Make seats 22 inches high") {
      await route.continue();
      return;
    }
    held = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: localIdeaPlan({
            prompt: "A bench 99 inches wide, 24 inches deep, 22 inches high",
          }),
          provider: "Late test response",
          message: "This canceled response must be ignored.",
        }),
      });
    } catch {
      // Chromium can reject fulfillment once the client has aborted the intercepted request.
    } finally {
      finishLate();
    }
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Plan an idea", exact: true })
    .first()
    .click();
  const prompt = page.getByRole("textbox", {
    name: "Describe your idea",
    exact: true,
  });
  await prompt.fill(
    "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids, no back",
  );
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(page.locator(".idea-proposal .planner-module")).toHaveCount(3);
  // A manually edited proposal must also survive cancellation of its follow-up.
  await page
    .getByRole("spinbutton", { name: "Overall seating run width", exact: true })
    .fill("90");
  await prompt.fill("Make seats 22 inches high");
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await expect(
    page.getByRole("button", { name: "Cancel planning", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".idea-planner").getByRole("status")).toContainText(
    "up to three minutes",
  );
  await page
    .getByRole("button", { name: "Cancel planning", exact: true })
    .click();
  await expect(page.locator(".idea-planner").getByRole("status")).toContainText(
    "Planning canceled",
  );
  await expect(
    page.getByRole("spinbutton", {
      name: "Overall seating run width",
      exact: true,
    }),
  ).toHaveValue("90");
  await expect(
    page.getByRole("spinbutton", {
      name: "Banquette section 1 height",
      exact: true,
    }),
  ).toHaveValue("18");
  await prompt.fill("Make seats 20 inches high");
  await page.getByRole("button", { name: "Explore idea", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", {
      name: "Banquette section 1 height",
      exact: true,
    }),
  ).toHaveValue("20");
  release();
  await lateFinished;
  await expect(page.locator(".idea-proposal .planner-module")).toHaveCount(3);
  await expect(
    page.getByRole("spinbutton", {
      name: "Overall seating run width",
      exact: true,
    }),
  ).toHaveValue("90");
  await expect(
    page.getByRole("spinbutton", {
      name: "Banquette section 1 height",
      exact: true,
    }),
  ).toHaveValue("20");
  expect(
    await page.evaluate((draftKey) => {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw).project.pieces.length : 0;
    }, CURRENT_DRAFT_KEY),
  ).toBe(0);
  await expect(page.locator(".statusbar")).toContainText("0 parts");
  expect(errors).toEqual([]);
});

test("a running connected request can switch to the built-in layout without losing edits", async ({ page }) => {
  await advertiseConnectedPlanner(page);
  const calls: string[] = [];
  let release = () => {};
  let finishLate = () => {};
  const lateFinished = new Promise<void>((resolve) => { finishLate = resolve; });
  await page.route("**/api/planner", async (route) => {
    const { prompt } = route.request().postDataJSON() as { prompt: string };
    calls.push(prompt);
    if (calls.length === 1) {
      await route.fulfill({ json: { plan: localIdeaPlan({ prompt }), provider: "Ollama", message: "Connected test plan" } });
      return;
    }
    await new Promise<void>((resolve) => { release = resolve; });
    try {
      await route.fulfill({ json: {
        plan: localIdeaPlan({ prompt: "A bench 99 inches wide, 24 inches deep, 26 inches high" }),
        provider: "Late connected plan", message: "Obsolete response",
      } });
    } catch {
      // Chromium can close the intercepted request when it receives the cancellation.
    } finally {
      finishLate();
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  const options = dialog.getByRole("combobox", { name: "Planner", exact: true });
  const description = dialog.getByRole("textbox", { name: "Describe your idea", exact: true });
  const explore = dialog.getByRole("button", { name: "Explore idea", exact: true });
  const width = dialog.getByRole("spinbutton", { name: "Overall seating run width", exact: true });
  const height = dialog.getByRole("spinbutton", { name: "Banquette section 1 height", exact: true });
  await expect(options).toHaveValue("server");
  await description.fill("Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids, no back");
  await explore.click();
  await expect(dialog.locator(".planner-provider")).toContainText("Ollama");
  await width.fill("90");
  await description.fill("Make seats 22 inches high");
  await explore.click();
  await expect.poll(() => calls.length).toBe(2);
  await description.fill("Make seats 23 inches high");
  await expect(dialog.getByRole("status")).toContainText("Switching uses the idea already submitted");
  await dialog.getByRole("button", { name: "Use built-in layout", exact: true }).click();
  await expect(options).toHaveValue("built-in");
  await expect(description).toHaveValue("Make seats 23 inches high");
  await expect(height).toHaveValue("22");
  await expect(width).toHaveValue("90");
  release();
  await lateFinished;
  await expect(dialog.locator(".planner-provider")).not.toContainText("Late connected plan");
  await explore.click();
  await expect(height).toHaveValue("23");
  await expect(width).toHaveValue("90");
  expect(calls).toHaveLength(2);

  await dialog.getByRole("button", { name: "Add proposed layout", exact: true }).click();
  await expect.poll(async () => {
    const project = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)?.project as Project, CURRENT_DRAFT_KEY);
    return project.sections.map(({ recipe }) => ({
      height: recipe?.height, storage: recipe?.storage, lid: recipe?.openingLid, back: recipe?.backHeight,
    }));
  }).toEqual(Array.from({ length: 3 }, () => ({ height: 23, storage: true, lid: true, back: 0 })));
});
