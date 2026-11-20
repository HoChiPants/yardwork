import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";
import { greenhouseScrewRepeatFixture } from "../fixtures/greenhouse-screw-repeat";

test("repeat a greenhouse screw layout into selected roof joints and retain the buying list", async ({
  page,
}, info) => {
  const fixture = greenhouseScrewRepeatFixture();
  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const library = page.getByRole("dialog");
  await library
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await library
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "roof-repeat.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture.project)),
    });
  await expect(library).toHaveCount(0);
  const rawDraft = () =>
    page.evaluate((key) => {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved).project : null;
    }, CURRENT_DRAFT_KEY);
  await expect
    .poll(async () => (await rawDraft())?.fastenerPlans?.length)
    .toBe(1);
  const original = projectSchema.parse(await rawDraft());
  await page
    .getByRole("button", { name: /^Checks/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Review greenhouse roof attachments/ })
    .click();
  const roof = page.locator(".greenhouse-connections");
  await expect(
    roof.locator('[data-roof-joint="rafter-block"][data-have-plan="true"]'),
  ).toHaveCount(1);
  await roof.getByRole("button", { name: "Review W001", exact: true }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  const repeat = fasteners.getByText("Repeat on this roof", { exact: true });
  await repeat.click();
  const panel = repeat.locator("..");
  await panel
    .getByRole("button", { name: "Find matching joints", exact: true })
    .click();
  const choices = panel.getByRole("checkbox");
  await expect(choices).toHaveCount(4);
  await expect(
    panel.getByText("4 matching joints.", { exact: false }),
  ).toBeVisible();
  await panel.getByText("5 joints to review", { exact: true }).click();
  await expect(
    panel.getByText(/cut shapes, or joint position differ/),
  ).toHaveCount(5);
  await panel.getByText("5 joints to review", { exact: true }).click();
  expect((await rawDraft()).fastenerPlans).toEqual(original.fastenerPlans);
  await choices.last().uncheck();
  const copy = panel.getByRole("button", {
    name: "Copy screw marks",
    exact: true,
  });
  await copy.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("repeat-roof-screw-layout.png"),
  });
  await copy.click();
  await expect(panel.getByRole("status")).toContainText(
    "Copied 3 screw marks across 3 joints",
  );
  await expect
    .poll(async () => (await rawDraft())?.fastenerPlans?.length)
    .toBe(4);
  const after = projectSchema.parse(await rawDraft());
  expect(after.pieces).toEqual(original.pieces);
  expect(after.supplies).toEqual(original.supplies);
  await fasteners
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  await expect(
    roof.locator('[data-roof-joint="rafter-block"][data-have-plan="true"]'),
  ).toHaveCount(4);
  await expect(
    roof.locator('[data-roof-joint="block-plate"][data-have-plan="false"]'),
  ).toHaveCount(10);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/Rafter to eave block[^\n]+W004/);
  expect(guide).toContain("4 provisional screws");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  const save = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${after.id}` &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const saved = await page.request.get(`/api/projects/${after.id}`);
  expect(saved.ok()).toBe(true);
  expect(
    projectSchema.parse((await saved.json()).project).fastenerPlans,
  ).toEqual(after.fastenerPlans);
});
