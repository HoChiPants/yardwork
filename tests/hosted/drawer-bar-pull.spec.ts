import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { libertyBarPull } from "../../src/cabinetPullReference";
import { blank, part, projectSchema } from "../../src/model";

test("check how a fitted pull changes drawer travel and keep it in the saved shop list", async ({ page }) => {
  const cabinet = blank(`Cabinet pull clearance practice ${crypto.randomUUID().slice(0, 8)}`);
  const step = cabinet.steps[0].id;
  cabinet.pieces.push(
    part("Left cabinet wall", "plywood", [0.75, 10, 18.25], [-8.375, 5, 0], step, "Cabinet"),
    part("Right cabinet wall", "plywood", [0.75, 10, 18.25], [8.375, 5, 0], step, "Cabinet"),
    part("Opposing cabinet face", "plywood", [20, 8, 0.75], [0, 4, 15.875], step, "Opposing cabinet"),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await dialog.locator("input[type=file]").first().setInputFiles({
    name: "cabinet-pull-practice.yardwork.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(cabinet)),
  });
  await page.getByRole("button", { name: "Plan an idea", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "Describe your idea" }).fill("Plan a drawer between P001 and P002 with a cabinet pull");
  await dialog.getByRole("button", { name: "Explore idea", exact: true }).click();
  await dialog.getByRole("button", { name: "Open drawer setup", exact: true }).click();

  const editor = page.getByRole("region", { name: "Fit a drawer box", exact: true });
  const pull = editor.getByRole("checkbox", { name: "Add a centered cabinet pull", exact: true });
  await expect(pull).toBeChecked();
  const preview = editor.getByRole("region", { name: "Drawer box preview", exact: true });
  const limit = preview.getByText(/^The opening check reaches/);
  const previewButton = editor.getByRole("button", { name: "Preview drawer", exact: true });
  await previewButton.click();
  await expect(preview).toContainText("1.3 in projection included");
  const withPull = Number((await limit.innerText()).match(/after ([\d.]+) in/)?.[1]);
  await pull.uncheck();
  await previewButton.click();
  const withoutPull = Number((await limit.innerText()).match(/after ([\d.]+) in/)?.[1]);
  expect(withoutPull - withPull).toBeCloseTo(1.3, 2);

  await pull.check();
  await previewButton.click();
  await preview.getByRole("button", { name: "Show opening limit", exact: true }).click();
  await expect(page.getByTestId("motion-preview-label")).toContainText("Cabinet drawer");
  await preview.getByRole("button", { name: "Add drawer and test movement", exact: true }).click();
  const motion = page.getByRole("region", { name: "Motion and clearance", exact: true });
  const pose = page.getByTestId("motion-preview-label");
  await motion.getByRole("button", { name: "Play opening", exact: true }).click();
  await expect(pose).toContainText("Possible contact");
  await expect(pose).toContainText("Opposing cabinet face");
  await expect.poll(async () => Math.abs(Number(await pose.getAttribute("data-pose")) - withPull)).toBeLessThan(0.002);
  await motion.getByRole("button", { name: "Play closing", exact: true }).click();
  await expect(pose).toHaveAttribute("data-pose", "0");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: cabinet.name }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const editable = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Editable project/ }).click();
  const saved = projectSchema.parse(JSON.parse(await readFile((await (await editable).path())!, "utf8")));
  const placed = saved.pieces.find(({ material }) => material === libertyBarPull.id);
  expect(placed?.size).toEqual(libertyBarPull.size);
  expect(saved.motionPlans?.[0].memberIds).toContain(placed?.id);
  const guide = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  expect(await readFile((await (await guide).path())!, "utf8")).toContain("96 mm Liberty bar pull");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list", exact: true }))
    .toHaveValue(/1 each.*Liberty Solid Bar cabinet pull.*Internet #204331182/);
});
