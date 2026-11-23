import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import {
  applyCommand,
  blank,
  part,
  projectSchema,
  type Command,
  type Project,
} from "../../src/model";
import { connect } from "../../src/engine";
import type { V3 } from "../../src/model";
import { transformSection } from "../../src/sections";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
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
  await page.getByRole("button", { name: /^Editable project/ }).click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}
async function sectionLiftHandle(page: Page, origin: V3, front = false) {
  const canvas = page.locator("canvas");
  const readCamera = async () =>
    JSON.parse((await canvas.getAttribute("data-workshop-camera")) ?? "{}");
  await expect
    .poll(async () => {
      const camera = await readCamera();
      return camera.settled && (!front || Math.abs(camera.position[0]) < 0.01);
    })
    .toBe(true);
  const camera = await readCamera();
  const box = (await canvas.boundingBox())!;
  const center = new Vector3(...origin).divideScalar(12);
  const distance = center.distanceTo(new Vector3().fromArray(camera.position));
  const handleSize =
    (distance * 1.9 * Math.tan((19 * Math.PI) / 180) * 0.8) / 7;
  const inverse = new Matrix4().fromArray(camera.matrixWorldInverse);
  const projection = new Matrix4().fromArray(camera.projectionMatrix);
  const at = (delta: number) => {
    const point = center
      .clone()
      .add(new Vector3(0, handleSize + delta / 12, 0))
      .applyMatrix4(inverse)
      .applyMatrix4(projection);
    return {
      x: box.x + ((point.x + 1) * box.width) / 2,
      y: Math.min(
        box.y + box.height - 22,
        box.y + ((1 - point.y) * box.height) / 2,
      ),
    };
  };
  return at;
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});
test("configure a floor base with separate Home Depot rim and joist lengths", async ({ page }) => {
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: /Floor & foundation/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Configure a floor base" })).toBeVisible();
  const width = dialog.getByRole("spinbutton", { name: "Base width", exact: true });
  const depth = dialog.getByRole("spinbutton", { name: "Base depth", exact: true });
  const rim = dialog.getByRole("combobox", { name: "Rim board stock", exact: true });
  const joist = dialog.getByRole("combobox", { name: "Joist stock", exact: true });
  await expect(width).toHaveValue("6");
  await expect(rim).toHaveValue("hd-treated-2x6-8");
  await dialog.getByLabel("Base depth units", { exact: true }).selectOption("in");
  await expect(depth).toHaveValue("48");
  await width.fill("9");
  const add = dialog.getByRole("button", { name: "Add to workspace" });
  await expect(add).toBeDisabled();
  await expect(dialog.getByRole("alert")).toHaveText(/rim needs 9/);
  await dialog.getByRole("button", { name: "Use shortest Home Depot boards that fit" }).click();
  await expect(rim).toHaveValue("hd-treated-2x6-10");
  await expect(joist).toHaveValue("hd-treated-2x6-8");
  const stockEstimate = dialog.getByRole("list", { name: "Floor base stock estimate" });
  await expect(stockEstimate.getByRole("listitem").filter({ hasText: "206967800" })).toContainText("2 boards");
  await expect(stockEstimate.getByRole("listitem").filter({ hasText: "206952301" })).toContainText("4 boards");
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await add.click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Revise this section", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Revise floor base" })).toBeVisible();
  await expect(rim).toHaveValue("hd-treated-2x6-10");
  await expect(joist).toHaveValue("hd-treated-2x6-8");
  await dialog.getByLabel("Base depth units", { exact: true }).selectOption("in");
  await depth.fill("60");
  await expect(stockEstimate.getByRole("listitem").filter({ hasText: "206952301" })).toContainText("8 boards");
  const details = dialog.locator(".floor-stock-comparison");
  const compare = details.locator("summary");
  await expect(compare).toContainText("24 ft less stock");
  await compare.click();
  const least = details.getByRole("listitem").filter({ hasText: "Least lumber" });
  await expect(least).toContainText("6 boards · 60 ft of stock · 46.75 in total in remnants");
  await least.getByRole("button", { name: "Use least lumber" }).click();
  await expect(joist).toHaveValue("hd-treated-2x6-10");
  await expect(least).toContainText("Selected");
  await expect(stockEstimate.getByRole("listitem")).toHaveCount(1);
  await expect(stockEstimate).toContainText("6 boards");
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "Replace selected section" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const shopping = dialog.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(shopping).toHaveValue(/6 boards[^\n]*#206967800/);
  await expect(shopping).not.toHaveValue(/206952301/);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/6 × board[^\n]*Internet #206967800/);
  expect(guide).not.toContain("Internet #206952301");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const id = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).project.id as string, CURRENT_DRAFT_KEY);
  const saving = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await saving).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${id}`);
  expect(reply.ok()).toBe(true);
  const saved = projectSchema.parse((await reply.json()).project);
  expect(saved.sections[0].generator).toMatchObject({
    type: "foundation",
    width: 108,
    depth: 60,
    baseStock: { rim: "hd-treated-2x6-10", joist: "hd-treated-2x6-10" },
  });
  expect(saved.pieces.every(({ material }) => material === "hd-treated-2x6-10")).toBe(true);
  expect(saved.pieces.filter(({ name }) => name.endsWith(" · joist")).map(({ size }) => size[2])).toEqual(Array(8).fill(57));
});

test("build a matching-depth 2 × 8 floor base and carry its cuts and exact stock through save", async ({ page }) => {
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: /Floor & foundation/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Base width", exact: true }).fill("9");
  await dialog.getByRole("spinbutton", { name: "Base depth", exact: true }).fill("5");
  const framing = dialog.getByRole("combobox", { name: "Framing size", exact: true });
  const rim = dialog.getByRole("combobox", { name: "Rim board stock", exact: true });
  const joist = dialog.getByRole("combobox", { name: "Joist stock", exact: true });
  await framing.selectOption("7.5");
  await expect(rim).toHaveValue("hd-treated-2x8-10");
  await expect(joist).toHaveValue("hd-treated-2x8-8");
  const estimate = dialog.getByRole("list", { name: "Floor base stock estimate" });
  await expect(estimate.getByRole("listitem").filter({ hasText: "206937440" })).toContainText("2 boards");
  await expect(estimate.getByRole("listitem").filter({ hasText: "206937455" })).toContainText("8 boards");
  await dialog.locator(".floor-stock-comparison > summary").click();
  await dialog.getByRole("button", { name: "Use least lumber", exact: true }).click();
  await expect(joist).toHaveValue("hd-treated-2x8-10");
  await expect(estimate).toContainText("6 boards");
  await dialog.getByRole("button", { name: "Add to workspace" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Revise this section", exact: true }).click();
  await expect(framing).toHaveValue("7.5");
  await expect(rim).toHaveValue("hd-treated-2x8-10");
  await expect(joist).toHaveValue("hd-treated-2x8-10");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const project = await exportProject(page);
  expect(project.pieces).toHaveLength(10);
  expect(project.pieces.every(({ size, material }) => size[1] === 7.5 && material === "hd-treated-2x8-10")).toBe(true);
  expect(project.pieces.filter(({ name }) => name.endsWith(" · joist")).map(({ size }) => size[2])).toEqual(Array(8).fill(57));
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/6 boards[^\n]*#206937440/);
  await dialog.getByRole("button", { name: "Record store snapshots", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Home Depot store", exact: true }).fill("4409");
  await dialog.getByRole("spinbutton", { name: "Price per purchase unit for product 206937440" }).fill("15");
  await dialog.getByRole("spinbutton", { name: "Available purchase units for product 206937440" }).fill("5");
  await dialog.getByRole("button", { name: "Save store snapshots", exact: true }).click();
  await expect(dialog.getByRole("listitem").filter({ hasText: "#206937440" })).toContainText("Short by 1 in snapshot");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toMatch(/6 × board[^\n]*Internet #206937440/);
  expect(guide).toContain("Crosscut 57 in");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const saving = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${project.id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await saving).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${project.id}`);
  expect(reply.ok()).toBe(true);
  const saved = projectSchema.parse((await reply.json()).project);
  expect(saved.schemaVersion).toBe(PROJECT_FORMAT_VERSION);
  expect(saved.sections).toEqual(project.sections);
  expect(saved.pieces).toEqual(project.pieces);
  expect(saved.inventory).toMatchObject([{ material: "hd-treated-2x8-10", internetNumber: "206937440", available: 5 }]);
});

test("review floor-base joist ends, catch a cut gap and save the intact end's screw plan", async ({ page }) => {
  const p = applyCommand(blank("Floor end review"), {
    type: "foundation", width: 108, height: 48, depth: 48, spacing: 16,
    baseStock: { rim: "hd-treated-2x8-10", joist: "hd-treated-2x8-8" },
  });
  const section = p.sections[0];
  const joist = p.pieces.filter(({ name }) => name.endsWith(" · joist"))[2];
  const rim = p.pieces.find(({ designRole }) => designRole === "floor-base-front-rim")!;
  joist.size[2] -= 0.5;
  joist.position[2] += 0.25;
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByRole("button", { name: "Import a plan", exact: true }).click();
  await projectDialog.locator("input[type=file]").setInputFiles({
    name: "floor-end-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(projectDialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("combobox", { name: "Current section", exact: true }).selectOption(section.id);
  await page.getByRole("button", { name: "Review floor-base joist ends", exact: true }).click();
  const review = page.locator(".floor-base-connections");
  await expect(review).toContainText("15 of 16 shown ends have full contact.");
  await expect(review).toContainText("Check connector backing at this flush rim end");
  const joint = review.locator(`[data-joist-id="${joist.id}"]`);
  await expect(joint).toContainText("0.5 in gap at the joist end");
  await expect(joint.getByRole("button", { name: "Open wood-fastener planner" })).toHaveCount(0);
  await review.getByRole("button", { name: "Front rim (8)", exact: true }).click();
  await expect(joint).toContainText("Full joist-end contact");
  await joint.getByRole("button", { name: "Open wood-fastener planner", exact: true }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans" });
  await expect(fasteners.getByRole("combobox", { name: "Fastener head-side member" })).toHaveValue(rim.id);
  await expect(fasteners.getByRole("combobox", { name: "Fastener receiving member" })).toHaveValue(joist.id);
  await fasteners.getByRole("button", { name: "Preview centered entry", exact: true }).click();
  await expect(page.getByTestId("fastener-centered-entry-marker")).toHaveAttribute("data-state", "needs-measurements");
  await fasteners.getByRole("button", { name: "Use centered entry", exact: true }).click();
  await page.getByRole("button", { name: /Back to connections/ }).click();
  await review.getByRole("button", { name: "Front rim (8)", exact: true }).click();
  await expect(joint.getByRole("button", { name: "Review W001", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to sections", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Current section", exact: true })).toHaveValue(section.id);
  const edited = await exportProject(page);
  expect(edited.fastenerPlans).toHaveLength(1);
  expect(edited.fastenerPlans[0].measurements.surfaceToTipDepth).toBeNull();
  expect(edited.pieces).toEqual(p.pieces);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Floor base joist ends");
  expect(guide).toContain("0.5 in gap at the joist end");
  expect(guide).toContain("W001/F001");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  const save = page.waitForResponse((response) =>
    response.request().method() === "PUT" && response.url().endsWith(`/api/projects/${edited.id}`));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await save).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${edited.id}`);
  expect(reply.ok()).toBe(true);
  expect(projectSchema.parse((await reply.json()).project).fastenerPlans).toEqual(edited.fastenerPlans);
});

test("plan LUS28Z hangers for measured room and add the exact Home Depot screw packs", async ({ page }) => {
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: /Floor & foundation/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Base width", exact: true }).fill("9");
  await dialog.getByRole("combobox", { name: "Framing size", exact: true }).selectOption("7.5");
  await dialog.getByRole("button", { name: "Add to workspace" }).click();
  await page.getByRole("button", { name: "Review floor-base joist ends", exact: true }).click();
  const form = page.locator(".floor-hanger-plan");
  await form.getByText("Plan face-mount hangers", { exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Joist hanger" })).toHaveValue("simpson-lus28z");
  await form.getByRole("spinbutton", { name: "Measured flange reach (in)" }).fill("1.25");
  await expect(form).toContainText("12 of 16 ends match");
  await form.getByText("Choose individual ends", { exact: true }).click();
  const flush = form.getByRole("checkbox", { name: /Measured flange reach exceeds the rim-end room/ });
  await expect(flush).toHaveCount(4);
  await expect(flush.first()).toBeDisabled();
  await form.getByRole("button", { name: "Select matching ends", exact: true }).click();
  await expect(form).toContainText("12 selected · 72 SD9112 rim screws · 48 SD9212 joist screws");
  await form.getByRole("button", { name: "Save hanger plan", exact: true }).click();
  await expect(form.locator(":scope > summary")).toContainText("12 saved");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  const needs = dialog.getByRole("list", { name: "Planned purchases to review", exact: true });
  await expect(needs.getByRole("listitem")).toHaveCount(3);
  await needs.getByRole("button", { name: /Add 12 hangers of Simpson LUS28Z/ }).click();
  await needs.getByRole("button", { name: /Add.*Simpson SD #9 × 1½ in connector screws/ }).click();
  await needs.getByRole("button", { name: /Add.*Simpson SD #9 × 2½ in connector screws/ }).click();
  const list = dialog.getByRole("textbox", { name: "Home Depot paste list" });
  await expect(list).toHaveValue(/12 hangers[^\n]*#100374921/);
  await expect(list).toHaveValue(/1 100-screw box[^\n]*#202071152/);
  await expect(list).toHaveValue(/1 100-screw box[^\n]*#206101818/);
  await dialog.getByRole("button", { name: "Record store snapshots", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Home Depot store", exact: true }).fill("4409");
  await dialog.getByRole("spinbutton", { name: "Price per purchase unit for product 100374921", exact: true }).fill("3.15");
  await dialog.getByRole("spinbutton", { name: "Available purchase units for product 100374921", exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Save store snapshots", exact: true }).click();
  await expect(dialog.getByRole("listitem").filter({ hasText: "#100374921" })).toContainText("Short by 2 in snapshot");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^Build guide/ }).click();
  const guide = await readFile((await (await download).path())!, "utf8");
  expect(guide).toContain("## Floor base hanger plan");
  expect(guide).toContain("72 SD9112 rim screws and 48 SD9212 joist screws");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const p = await exportProject(page);
  expect(p.pieces).toHaveLength(10);
  expect(p.sections[0].floorHangerPlan?.ends).toHaveLength(12);
  expect(p.fastenerPlans).toHaveLength(0);
  const saving = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/api/projects/${p.id}`));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await saving).ok()).toBe(true);
  const reply = await page.request.get(`/api/projects/${p.id}`);
  expect(reply.ok()).toBe(true);
  const saved = projectSchema.parse((await reply.json()).project);
  expect(saved.sections[0].floorHangerPlan).toEqual(p.sections[0].floorHangerPlan);
  expect(saved.supplyInventory).toMatchObject([{ retailerProductId: "100374921", available: 10 }]);
});

test("compare fewer boards against less purchased lumber for the same floor base", async ({ page }) => {
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: /Floor & foundation/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton", { name: "Base width", exact: true }).fill("2.5");
  await dialog.getByRole("spinbutton", { name: "Base depth", exact: true }).fill("8");
  const details = dialog.locator(".floor-stock-comparison");
  await details.locator("summary").click();
  const least = details.getByRole("listitem").filter({ hasText: "Least lumber" });
  const fewest = details.getByRole("listitem").filter({ hasText: "Fewest boards" });
  await expect(least).toContainText("4 boards · 32 ft of stock");
  await expect(fewest).toContainText("3 boards · 36 ft of stock");
  await fewest.getByRole("button", { name: "Use fewest boards" }).click();
  await expect(dialog.getByRole("combobox", { name: "Rim board stock" })).toHaveValue("hd-treated-2x6-12");
  await expect(dialog.getByRole("combobox", { name: "Joist stock" })).toHaveValue("hd-treated-2x6-12");
  await expect(fewest).toContainText("Selected");
  await least.getByRole("button", { name: "Use least lumber" }).click();
  await expect(least).toContainText("Selected");
  await expect(dialog.getByRole("list", { name: "Floor base stock estimate" })).toContainText("4 boards");
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
    "Stock subtotal incomplete",
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
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .getByRole("button", { name: /Resume previous browser draft/ })
    .click();
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
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page
    .getByRole("button", { name: "Move section in 3D", exact: true })
    .click();
  const handle = await sectionLiftHandle(page, s.origin, true);
  const { x, y } = handle(0);
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

test("a framed wall stops flush on an external beam and keeps all member offsets", async ({
  page,
}) => {
  let project = applyCommand(blank("Wall on a beam"), wall);
  const id = project.sections[0].id;
  project = transformSection(project, id, [0, 10, 0], [0, 0, 0]);
  const section = project.sections[0];
  const beam = part(
    "Support beam",
    "stud",
    [96, 5, 7],
    [0, 2.5, 0],
    project.steps[0].id,
    "Supports",
  );
  project.pieces.push(beam);
  await importProject(page, project);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(id);
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page
    .getByRole("button", { name: "Move section in 3D", exact: true })
    .click();
  const handle = await sectionLiftHandle(page, section.origin, true);
  const { x, y } = handle(0);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, handle(-13).y, { steps: 9 });
  const contact = page
    .getByRole("status")
    .filter({ hasText: "Stopped at Support beam" });
  await expect(contact).toBeVisible();
  await page.mouse.up();
  await expect(contact).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: "Section Y", exact: true }),
  ).toHaveValue("5");
  const actual = await exportProject(page);
  expect(actual.sections[0].origin).toEqual([0, 5, 0]);
  expect(actual.pieces.find((piece) => piece.id === beam.id)).toEqual(beam);
  for (const before of project.pieces.filter((piece) =>
    section.pieceIds.includes(piece.id),
  )) {
    const moved = actual.pieces.find((piece) => piece.id === before.id)!;
    expect(moved.position).toEqual([
      before.position[0],
      before.position[1] - 5,
      before.position[2],
    ]);
    expect(moved.rotation).toEqual(before.rotation);
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const draft = JSON.parse(localStorage.getItem(key)!);
        return draft.project.sections[0].origin;
      }, CURRENT_DRAFT_KEY),
    )
    .toEqual([0, 10, 0]);
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Current section", exact: true })
    .selectOption(id);
  await page
    .getByRole("combobox", { name: "Move increment", exact: true })
    .selectOption("12");
  await page.getByRole("button", { name: "Lower object", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Section Y", exact: true }),
  ).toHaveValue("5");
  const bottom = page.getByRole("spinbutton", { name: "Bottom above floor", exact: true });
  await expect(bottom).toHaveValue("5");
  await bottom.fill("18.375");
  await page.getByRole("button", { name: "Set height", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Section Y", exact: true })).toHaveValue("18.375");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("combobox", { name: "Current section", exact: true }).selectOption(id);
  await expect(page.getByRole("spinbutton", { name: "Section Y", exact: true })).toHaveValue("5");
});
