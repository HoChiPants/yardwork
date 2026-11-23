import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("fits a brace from a named question and reopens its cut order and two fastening entry points", async ({ page }) => {
  await page.goto("./");
  const fixture = await page.request.get(new URL("./examples/wood-stock/workbench-diagonal-brace.yardwork.json", page.url()).href);
  expect(fixture.ok()).toBe(true);
  const bytes = await fixture.body();
  const original = projectSchema.parse(JSON.parse(bytes.toString("utf8")));
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "workbench-diagonal-brace.yardwork.json", mimeType: "application/json", buffer: bytes,
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Plan a diagonal brace between P001 and P002");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await dialog.getByRole("button", { name: "Open diagonal brace planner" }).click();
  await expect(dialog.getByRole("combobox", { name: "First post", exact: true })).toHaveValue(original.pieces[0].id);
  await expect(dialog.getByRole("combobox", { name: "Second post", exact: true })).toHaveValue(original.pieces[1].id);
  await dialog.getByRole("combobox", { name: "First post mounting face", exact: true }).selectOption("-Z");
  await dialog.getByRole("spinbutton", { name: "First mark above post bottom" }).fill("3.5");
  await dialog.getByRole("spinbutton", { name: "Second mark above post bottom" }).fill("30.5");
  await dialog.getByRole("button", { name: "Preview brace and cuts" }).click();
  const draft = dialog.getByRole("region", { name: "Diagonal brace preview" });
  await expect(draft).toContainText("Square-cut the brace to 48 in");
  const ends = draft.getByRole("list", { name: "Modeled end contact" }).getByRole("listitem");
  await expect(ends).toHaveCount(2);
  await expect(ends.first()).toContainText("12.65 sq in face contact");
  await expect(draft).toContainText("Use O001 · Crosscut to 4 ft");
  await draft.getByRole("button", { name: "Add brace to project" }).click();
  const connections = page.getByRole("region", { name: "Brace connections" });
  await expect(connections.getByRole("button", { name: "Plan fasteners at P002", exact: true })).toBeVisible();
  await connections.getByRole("button", { name: "Plan fasteners at P001", exact: true }).click();
  const plan = page.getByRole("region", { name: "Wood fastener plans" });
  await expect(plan.getByRole("combobox", { name: "Fastener receiving member" })).toHaveValue(original.pieces[0].id);

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const readDraft = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CURRENT_DRAFT_KEY);
  await expect.poll(async () => (await readDraft())?.revision).toBe(1);
  const saved = projectSchema.parse((await readDraft()).project);
  expect(saved.furnitureBraces?.[0].input.secondId).toBe(original.pieces[1].id);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: saved.name }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guide = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const text = await readFile((await (await guide).path())!, "utf8");
  expect(text).toContain("Square-cut the board to 48 in");
  expect(text).toContain("Keep O002 · 13.875 in");
});
