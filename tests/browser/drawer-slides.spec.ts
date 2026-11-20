import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { accuride3732 } from "../../src/drawerSlideReference";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { blank, part, projectSchema, uid, type V3 } from "../../src/model";

test("bind and test the exact drawer slide in the workshop, then export a single pair", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const base = blank(`Cabinet slide review ${uid().slice(0, 8)}`);
  const panel = (name: string, size: V3, position: V3) =>
    part(name, "plywood", size, position, base.steps[0].id, "Drawer");
  const cabinetLeft = panel("Cabinet left", [0.75, 24, 23], [-8.385, 12, 0]);
  const drawerLeft = panel("Drawer left", [0.5, 4, 22], [-7.25, 12, 0]);
  const drawerRight = panel("Drawer right", [0.5, 4, 22], [7.25, 12, 0]);
  const cabinetRight = panel("Cabinet right", [0.75, 24, 23], [8.385, 12, 0]);
  const front = panel("Drawer front", [15, 4, 0.75], [0, 12, 11.375]);
  const original = {
    ...base,
    pieces: [cabinetLeft, drawerLeft, drawerRight, cabinetRight, front],
  };

  await page.goto("/");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "cabinet-slide-fit.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...original, schemaVersion: 19 })),
    });
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Test movement", exact: true })
    .click();
  const motion = page.getByRole("region", { name: "Motion and clearance" });
  const option = (name: string) =>
    motion.getByRole("combobox", { name, exact: true });
  await motion.getByRole("button", { name: "New motion" }).click();
  await motion.getByRole("textbox", { name: "Motion name" }).fill("Top drawer");
  await option("Movement").selectOption("slide");
  await option("Slide hardware").selectOption(accuride3732.productId);
  for (const piece of [drawerLeft, drawerRight, front])
    await option("Add moving part").selectOption(piece.id);
  await option("Left cabinet side").selectOption(cabinetLeft.id);
  await option("Left drawer side").selectOption(drawerLeft.id);
  await option("Right drawer side").selectOption(drawerRight.id);
  await option("Right cabinet side").selectOption(cabinetRight.id);
  await expect(
    motion.getByRole("spinbutton", { name: "Maximum extension" }),
  ).toHaveValue("22");
  await motion.getByRole("button", { name: "Save and test motion" }).click();

  const fit = page.getByRole("region", {
    name: "Drawer slide fit",
    exact: true,
  });
  await expect(
    fit.getByText("Modeled dimensions match", { exact: false }),
  ).toBeVisible();
  await expect(fit.getByText("0.51 in", { exact: false })).toHaveCount(2);
  await fit
    .getByRole("button", { name: "Add missing slide pair to list" })
    .click();
  await expect(
    fit.getByText("1 planned pair · 1 in shopping list"),
  ).toBeVisible();
  await expect(
    fit.getByRole("button", { name: /Add missing slide/ }),
  ).toHaveCount(0);
  await motion.getByRole("button", { name: "Play opening" }).click();
  await expect(page.getByTestId("motion-preview-label")).toHaveAttribute(
    "data-pose",
    "22",
  );
  await expect(page.locator("canvas")).toBeVisible();
  await fit.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("drawer-slide-fit.png"),
  });

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const file = await pending;
  await file.saveAs(test.info().outputPath("drawer-slide-fit.yardwork.json"));
  const saved = projectSchema.parse(
    JSON.parse(await readFile((await file.path())!, "utf8")),
  );
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.pieces.map((piece) => piece.position)).toEqual(
    original.pieces.map((piece) => piece.position),
  );
  expect(saved.motionPlans![0].mechanism).toMatchObject({
    kind: "slide",
    travel: 22,
    drawerSlide: {
      productId: accuride3732.productId,
      cabinetLeft: cabinetLeft.id,
      drawerLeft: drawerLeft.id,
      drawerRight: drawerRight.id,
      cabinetRight: cabinetRight.id,
    },
  });
  expect(saved.supplies).toMatchObject([
    { productId: accuride3732.productId, quantity: 1 },
  ]);
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByText(/^Hardware and supplies · 1 selected/).click();
  await expect(
    page
      .getByRole("link", { name: /Home Depot/ })
      .filter({ hasText: /product/i }),
  ).toHaveAttribute("href", accuride3732.homeDepot);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your self-hosted project library" }),
  ).toBeVisible();
  const response = await page.request.get(`/api/projects/${saved.id}`);
  expect(response.ok()).toBe(true);
  const reopened = projectSchema.parse((await response.json()).project);
  expect(reopened.motionPlans).toEqual(saved.motionPlans);
  expect(reopened.supplies).toEqual(saved.supplies);
});
