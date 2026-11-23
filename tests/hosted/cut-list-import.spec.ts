import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import { parseCutListCsv } from "../../src/cutListCsv";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { projectSchema } from "../../src/model";

test("import, group, move, ungroup and export editable blanks", async ({ page }) => {
  const csv = [
    "name,stock,quantity,length,width,thickness,unit",
    '"Side rail, first ""pair""","2x4",2,42,,,in',
    '"Upper shelf",plywood,1,1016,457.2,19.05,mm',
  ].join("\r\n");
  const dialog = page.getByRole("dialog");
  const startImport = async () => {
    await page.getByRole("button", { name: "Open project", exact: true }).click();
    await dialog.getByRole("button", { name: "Import a plan", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Import format" }).selectOption("cut-list");
  };
  const upload = async (contents: string | Buffer) =>
    dialog.getByLabel("Cut list CSV file", { exact: true }).setInputFiles({
      name: "Kitchenette blanks.csv", mimeType: "text/csv", buffer: Buffer.from(contents),
    });
  const accept = dialog.getByRole("button", { name: "Open cut list as new project", exact: true });
  const draft = async () => {
    const saved = await page.evaluate((key) =>
      JSON.parse(localStorage.getItem(key) ?? "null")?.project, CURRENT_DRAFT_KEY);
    return saved ? projectSchema.parse(saved) : undefined;
  };
  await page.goto("./");
  await startImport();
  await upload(csv.replace("1016", "99999"));
  await expect(dialog.getByRole("alert")).toContainText("Line 3");
  await expect(accept).toHaveCount(0);
  await upload(csv);
  await expect(dialog.getByRole("table", { name: "Finished parts from the cut list" })).toContainText('Side rail, first "pair"');
  await expect(accept).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Stock for “2x4”", exact: true }).selectOption("stud");
  await expect(dialog.getByRole("row", { name: /Side rail, first/ })).toContainText("42 in × 3.5 in × 1.5 in");
  await expect(dialog.getByRole("row", { name: /Upper shelf/ })).toContainText("40 in × 18 in × 0.75 in");
  await accept.click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await draft())?.pieces.length).toBe(3);
  const first = (await draft())!;
  expect(first.pieces.map(({ size, stockLengthAxis, cutStock }) => ({ size: size.map((value) => +value.toFixed(6)), stockLengthAxis, cutStock })))
    .toEqual([
      { size: [3.5, 1.5, 42], stockLengthAxis: 2, cutStock: null },
      { size: [3.5, 1.5, 42], stockLengthAxis: 2, cutStock: null },
      { size: [18, 0.75, 40], stockLengthAxis: 2, cutStock: null },
    ]);

  await page.getByRole("button", { name: "Select whole sections", exact: true }).click();
  const startGrouping = page.getByRole("button", { name: "Pick parts to group" });
  const picker = page.getByRole("region", { name: "Group loose parts" });
  const rails = picker.getByRole("checkbox", { name: /Side rail/ });
  const createSection = picker.getByRole("button", { name: "Create section" });
  await startGrouping.click();
  await rails.first().check();
  await expect(createSection).toBeDisabled();
  await picker.getByRole("button", { name: "Cancel grouping" }).click();
  await expect(picker).toHaveCount(0);
  expect(await draft()).toEqual(first);

  await page.getByRole("button", { name: "Top", exact: true }).click();
  await startGrouping.click();
  const canvas = page.locator(".canvas-wrap canvas").first();
  const readCamera = async () => JSON.parse(await canvas.getAttribute("data-workshop-camera") ?? "null");
  await expect.poll(async () => {
    const camera = await readCamera();
    return !!camera?.settled && Math.abs(camera.matrixWorldInverse[6]) > 0.99;
  }).toBe(true);
  const camera = await readCamera();
  const firstRail = new Vector3(...first.pieces[0].position).divideScalar(12)
    .applyMatrix4(new Matrix4().fromArray(camera.matrixWorldInverse))
    .applyMatrix4(new Matrix4().fromArray(camera.projectionMatrix));
  const position = {
    x: (firstRail.x + 1) * camera.viewport.width / 2,
    y: (1 - firstRail.y) * camera.viewport.height / 2,
  };
  await canvas.click({ position });
  await expect(rails.first()).toBeChecked();
  await canvas.click({ position });
  await expect(rails.first()).not.toBeChecked();
  await canvas.click({ position });
  await expect(rails.first()).toBeChecked();
  await rails.last().check();
  await expect(picker.getByRole("checkbox", { name: /Upper shelf/ })).not.toBeChecked();
  expect(await draft()).toEqual(first);
  await picker.getByRole("textbox", { name: "Section name" }).fill("Kitchenette rails");
  await createSection.click();
  await expect.poll(async () => (await draft())?.sections[0]?.name).toBe("Kitchenette rails");
  const grouped = (await draft())!;
  expect(grouped.pieces).toEqual(first.pieces);
  expect(grouped.sections[0].pieceIds).toEqual(first.pieces.slice(0, 2).map(({ id }) => id));
  const newY = grouped.sections[0].origin[1] + 12;
  const sectionY = page.getByRole("spinbutton", { name: "Section Y", exact: true });
  await sectionY.fill(String(newY));
  await sectionY.press("Enter");
  await expect.poll(async () => (await draft())?.sections[0]?.origin[1]).toBe(newY);
  const moved = (await draft())!;
  expect(moved.pieces.slice(0, 2).map(({ position }) => position))
    .toEqual(first.pieces.slice(0, 2).map(({ position: [x, y, z] }) => [x, y + 12, z]));
  expect(moved.pieces[2]).toEqual(first.pieces[2]);

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: first.name }).click();
  await expect.poll(async () => (await draft())?.sections).toEqual(moved.sections);

  await page.getByRole("button", { name: "Select whole sections", exact: true }).click();
  await page.getByRole("combobox", { name: "Current section" }).selectOption(moved.sections[0].id);
  await page.getByRole("button", { name: "Ungroup parts", exact: true }).click();
  await expect.poll(async () => (await draft())?.sections.length).toBe(0);
  expect((await draft())!.pieces).toEqual(moved.pieces);
  expect((await draft())!.partLabels).toEqual(moved.partLabels);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft())?.sections).toEqual(moved.sections);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await draft())?.sections.length).toBe(0);
  await startGrouping.click();
  await expect(rails.first()).not.toBeChecked();
  await expect(rails).toHaveCount(2);
  await picker.getByRole("button", { name: "Cancel grouping" }).click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await dialog.locator(".project-list > button").filter({ hasText: first.name }).click();
  await expect.poll(async () => (await draft())?.sections.length).toBe(0);
  expect((await draft())!.pieces).toEqual(moved.pieces);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const cuts = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Rectangular cut list/ }).click();
  const exported = await readFile((await (await cuts).path())!);
  expect(parseCutListCsv(exported.toString("utf8")).map(({ stock, quantity }) => [stock, quantity]))
    .toEqual([["stud", 2], ["plywood", 1]]);
  const guide = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide Markdown/ }).click();
  const instructions = await readFile((await (await guide).path())!, "utf8");
  expect(instructions).toContain("## Stock cut order");
  expect(instructions).toContain("Upper shelf");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await startImport();
  await upload(exported);
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect.poll(async () => {
    const imported = await draft();
    return !!imported && imported.id !== first.id;
  }).toBe(true);
  expect((await draft())!.pieces.map(({ name, size }) => ({ name, size })))
    .toEqual(first.pieces.map(({ name, size }) => ({ name, size })));
});
