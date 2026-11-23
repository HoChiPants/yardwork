import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema } from "../../src/model";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";

test("a measured cabinet opening cutout can be reused and keeps its origin in the build guide", async ({ page }) => {
  await page.goto("/");
  const fixture = await page.request.get("/examples/cut-pool/cabinet-access-cutout.yardwork.json");
  expect(fixture.ok()).toBe(true);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles({
    name: "cabinet-access-cutout.yardwork.json", mimeType: "application/json", buffer: await fixture.body(),
  });
  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  const pool = page.getByRole("region", { name: "Cut pool", exact: true });
  await pool.getByRole("button", { name: "Used pieces (1)", exact: true }).click();
  await pool.getByRole("button", { name: "Inspect P001", exact: true }).click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await dialog.getByRole("button", { name: "Rectangular cut", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Rectangular cut", exact: true }).selectOption("0");
  await dialog.getByText("Record recovered cutout", { exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Usable length along grain" }).fill("12.5");
  await dialog.getByRole("spinbutton", { name: "Usable width across grain" }).fill("10.5");
  await dialog.getByRole("button", { name: "Add cutout to Cut pool", exact: true }).click();
  await expect(pool).toContainText("O002 · Reusable offcut");
  await expect(pool).toContainText("Rectangular cutout from P001");
  await expect(pool).toContainText("12.5 in × 10.5 in × 0.75 in");
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("What can I use O002 for?");
  await dialog.getByRole("button", { name: "Explore idea" }).click();
  await expect(dialog).toContainText("Mounting-hole test blank");
  await dialog.getByRole("button", { name: "Review cuts and stock to buy" }).click();
  await expect(dialog.getByRole("list", { name: "Purchase changes" })).toContainText("1 → 0 sheets");
  await dialog.getByRole("button", { name: "Apply offcut plan" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: "Cabinet access cutout reuse" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/O002 → P002 · Mounting-hole test blank[\s\S]*Complete the opening and confirm the measured cutout/);
  expect(guide).toContain("Recovered opening cutouts");
  expect(await page.locator(".print-guide").textContent()).toContain("Recovered opening cutouts");
});

test("a notch can be placed, reviewed, exported and reopened from the cut editor", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add ¾ in exterior plywood", exact: true })
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Rectangular cut", exact: true })
    .click();
  const preview = dialog.getByRole("img", {
    name: "Rectangular cut preview through local Y",
  });
  await expect(preview.getByText("−Z", { exact: true })).toBeVisible();
  const startZ = dialog.getByRole("spinbutton", {
    name: "Start from −Z edge",
    exact: true,
  });
  await startZ.fill("-20");
  await expect(dialog.getByRole("alert")).toContainText(
    "misses the retained blank",
  );
  await expect(
    dialog.getByRole("button", { name: "Apply rectangular cut" }),
  ).toBeDisabled();
  await startZ.fill("-2");
  await dialog
    .getByRole("spinbutton", { name: "Start from −X edge", exact: true })
    .fill("10");
  await dialog
    .getByRole("spinbutton", { name: "Cut size along Z", exact: true })
    .fill("8");
  await dialog
    .getByRole("spinbutton", { name: "Cut size along X", exact: true })
    .fill("5");
  await expect(preview.locator("[data-preview-rectangle]")).toHaveAttribute(
    "width",
    "8",
  );
  await dialog.getByRole("button", { name: "Apply rectangular cut" }).click();
  await expect(
    page.getByText("Rectangular cut updated.", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  const cutPool = page.getByRole("region", { name: "Cut pool" });
  await cutPool
    .getByRole("button", { name: "Used pieces (1)", exact: true })
    .click();
  await expect(cutPool).toContainText("Through-cuts recorded");

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Inspector" })
      .getByText("Plan the rectangular through-cut", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const guideDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const guide = await readFile((await (await guideDownload).path())!, "utf8");
  expect(guide).toContain(
    "Rectangular edge notch · through local Y · 0 in to 6 in from local −Z edge, 10 in to 15 in from local −X edge",
  );
  expect(guide).toContain("Plan the rectangular through-cut");
  expect(await page.locator(".print-guide").textContent()).toContain(
    "Rectangular edge notch",
  );

  const json = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const file = await readFile((await (await json).path())!);
  const saved = projectSchema.parse(JSON.parse(file.toString()));
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.pieces).toHaveLength(1);
  expect(saved.pieces[0].rectangularOpenings).toEqual([
    { axis: 1, center: [-46, -11.5], spans: [8, 5] },
  ]);
  const stored = await page.request.get(`/api/projects/${saved.id}`);
  expect(stored.ok()).toBe(true);
  expect((await stored.json()).project.pieces[0].rectangularOpenings).toEqual(
    saved.pieces[0].rectangularOpenings,
  );

  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "notched-panel.yardwork.json",
    mimeType: "application/json",
    buffer: file,
  });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Cut pool (0)", exact: true }).click();
  await cutPool
    .getByRole("button", { name: "Used pieces (1)", exact: true })
    .click();
  await cutPool
    .getByRole("button", { name: "Inspect P001", exact: true })
    .click();
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Rectangular cut", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Rectangular cut", exact: true })
    .selectOption("0");
  await expect(startZ).toHaveValue("-2");
  await dialog
    .getByRole("button", { name: "Preview removal", exact: true })
    .click();
  await expect(preview.locator("[data-preview-rectangle]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(cutPool).toContainText("Through-cuts recorded");
});
