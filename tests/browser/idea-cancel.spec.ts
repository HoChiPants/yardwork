import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { test, expect } from "@playwright/test";
import { localIdeaPlan } from "../../src/planning";

test("canceling a pending plan retains the edited proposal and ignores a late result", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
