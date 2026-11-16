import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import {
  applyCommand,
  blank,
  projectSchema,
  type Command,
  type Project,
} from "../../src/model";
import { connect } from "../../src/engine";
import { transformSection } from "../../src/sections";
const wall: Command = {
  type: "wall",
  width: 96,
  height: 72,
  depth: 48,
  spacing: 16,
};
async function importProject(
  page: Page,
  p: Project | Omit<Project, "sections">,
) {
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "section-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: `${p.name} · imported`, exact: true }),
  ).toBeVisible();
}
async function exportProject(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Editable project JSON", exact: false })
    .click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});
test("a targeted prompt preserves a rotated section pose, other assemblies, and the saved build guide", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let p = applyCommand(applyCommand(blank("Two section study"), wall), {
    ...wall,
    type: "foundation",
    width: 72,
  });
  const target = p.sections[0],
    parts = p.pieces.filter((a) => target.pieceIds.includes(a.id));
  p = connect(p, parts[0].id, parts[2].id, parts[0].stepId);
  p = transformSection(p, target.id, [20, 5, 10], [0, 0.5, 0]);
  await importProject(page, p);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(target.id);
  await page
    .getByRole("button", { name: "Revise this section", exact: true })
    .click();
  await expect(page.getByLabel("Prompt target")).toHaveValue(target.id);
  await page
    .getByRole("textbox", { name: "Describe your build" })
    .fill("make it 10 ft wide");
  await page
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await expect(page.locator(".proposal")).toContainText("10′ wide × 6′ tall");
  await expect(page.locator(".proposal-impact")).toContainText(
    "Replace 9 parts with 11 new parts",
  );
  await expect(page.locator(".proposal-impact")).toContainText(
    "Remove 1 screw connection",
  );
  await expect(page.locator(".proposal-impact")).toContainText(
    "Estimate incomplete",
  );
  await page
    .getByRole("button", { name: "Replace selected section", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Section X", exact: true }),
  ).toHaveValue("20");
  await expect(
    page.getByRole("spinbutton", { name: "Section Y", exact: true }),
  ).toHaveValue("5");
  const actual = await exportProject(page);
  const section = actual.sections.find((s) => s.id === target.id)!;
  expect(section.generator?.width).toBe(120);
  expect(section.generator?.height).toBe(72);
  expect(section.origin).toEqual([20, 5, 10]);
  expect(section.rotation).toEqual(p.sections[0].rotation);
  expect(
    actual.pieces.filter((a) => p.sections[1].pieceIds.includes(a.id)),
  ).toEqual(p.pieces.filter((a) => p.sections[1].pieceIds.includes(a.id)));
  expect(actual.joints).toHaveLength(0);
  expect(actual.steps.find((s) => s.id === parts[0].stepId)?.title).toContain(
    "10′",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(target.id);
  await expect(page.locator(".section-description")).toContainText(
    "120 × 72 in wall",
  );
  expect(errors).toEqual([]);
});
test("legacy sections can be grouped, moved and rotated as a unit, copied, and removed", async ({
  page,
}) => {
  const p = applyCommand(blank("Legacy wall"), wall);
  const { sections: _, ...legacy } = p;
  void _;
  await importProject(page, legacy);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Group Wall 1", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Section X", exact: true })
    .fill("24");
  await page
    .getByRole("spinbutton", { name: "Section X", exact: true })
    .press("Tab");
  await page
    .getByRole("spinbutton", { name: "Section yaw", exact: true })
    .fill("90");
  await page
    .getByRole("spinbutton", { name: "Section yaw", exact: true })
    .press("Tab");
  const moved = await exportProject(page);
  expect(moved.sections).toHaveLength(1);
  const s = moved.sections[0];
  expect(s.origin).toEqual([24, 36, 0]);
  for (const original of p.pieces) {
    const actual = moved.pieces.find((a) => a.id === original.id)!;
    expect(actual.position[0]).toBeCloseTo(24 + original.position[2], 6);
    expect(actual.position[1]).toBeCloseTo(original.position[1], 6);
    expect(actual.position[2]).toBeCloseTo(-original.position[0], 6);
  }
  await page
    .getByRole("button", { name: "Duplicate section", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("18 parts");
  await page
    .getByRole("button", { name: "Remove section & parts", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("9 parts");
  const restored = await exportProject(page);
  expect(restored.pieces).toEqual(moved.pieces);
  expect(restored.sections).toEqual(moved.sections);
});
test("the section gizmo commits every member transform and survives returning to individual selection", async ({
  page,
}) => {
  const p = applyCommand(blank("Move the whole wall"), wall),
    s = p.sections[0];
  await importProject(page, p);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(s.id);
  await page
    .getByRole("button", { name: "Move section in 3D", exact: true })
    .click();
  await page.waitForTimeout(1800);
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("Canvas is missing");
  const camera = new PerspectiveCamera(38, box.width / box.height, 0.05, 500);
  camera.position.set(9.6, 9.8, 10.8);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  const scale =
    (camera.position.length() * (1.9 * Math.tan((19 * Math.PI) / 180)) * 0.8) /
    7;
  const head = new Vector3(0, scale, 0).project(camera);
  const x = box.x + ((head.x + 1) * box.width) / 2,
    y = box.y + ((1 - head.y) * box.height) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 15 });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "Section Y", exact: true }),
  ).not.toHaveValue("0");
  const moved = await exportProject(page),
    section = moved.sections[0];
  expect(section.origin[1]).toBeGreaterThan(0);
  for (const original of p.pieces) {
    const actual = moved.pieces.find((a) => a.id === original.id)!;
    expect(actual.position[1] - original.position[1]).toBeCloseTo(
      section.origin[1],
      5,
    );
  }
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  const after = await exportProject(page);
  expect(after.pieces).toEqual(moved.pieces);
});
