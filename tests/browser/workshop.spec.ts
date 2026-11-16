import { test, expect } from "@playwright/test";
import path from "node:path";
import { blank, part } from "../../src/model";
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The backyard coop", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});
test("workshop renders a real model, has no overflow, and supports view tools", async ({
  page,
}) => {
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/workshop.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Toggle X-ray" }).click();
  await page.getByRole("button", { name: "Explode assembly" }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.getByRole("button", { name: "Fit project", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Toggle snapping" }),
  ).toHaveClass(/active/);
});
test("generates editable wall parts, adds manual steps, saves and restores", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Build with a prompt" }).click();
  await page
    .getByRole("textbox", { name: "Describe your build" })
    .fill("wall 8 ft wide, 6 ft tall");
  await page.getByRole("button", { name: "Preview proposal" }).click();
  await expect(page.locator(".proposal")).toContainText("Framed wall assembly");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await expect(page.locator(".statusbar")).toContainText("parts");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Step title", exact: true })
    .fill("Install the nesting boxes");
  await page
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Measure twice and check the door clearance.");
  await page.getByRole("button", { name: "Add build step" }).click();
  await expect(page.locator(".step-track")).toContainText(
    "Install the nesting boxes",
  );
  await page.getByRole("button", { name: "Mark step complete" }).click();
  await expect(
    page.getByRole("button", { name: "Completed · mark unfinished" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "My workshop", exact: true }).click();
  await expect(page.locator(".project-list")).toContainText(
    "The backyard coop",
  );
  await page.locator(".project-list>button").first().click();
  await expect(page.locator(".step-track")).toContainText(
    "Install the nesting boxes",
  );
});
test("adds and cuts lumber, retains offcuts, supports undo, and exports round-trip JSON", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Part name", exact: true }),
  ).toHaveValue("2 × 4 framing lumber");
  await page
    .getByRole("spinbutton", { name: "Cut length", exact: true })
    .fill("48");
  await page
    .getByRole("spinbutton", { name: "Cut length", exact: true })
    .press("Tab");
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("0 offcuts");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Editable project JSON", exact: false })
    .click();
  const output = await download;
  expect(output.suggestedFilename()).toMatch(/\.json$/);
  await output.saveAs("test-results/round-trip.json");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("test-results/round-trip.json"));
  await expect(
    page.getByRole("heading", {
      name: "The backyard coop · imported",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
});
test("imports DXF at scale and rejects malformed projects", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.getByLabel("Import format").selectOption("dxf");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("public/examples/base-plan.dxf"));
  await expect(page.getByRole("status")).toContainText(
    "4 DXF reference lines imported",
  );
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.getByLabel("Import format").selectOption("project");
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("status")).toHaveClass(/error/);
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("records touching-part connections and flags invalid movement", async ({
  page,
}) => {
  const p = blank("Connection test");
  p.pieces = [
    part(
      "Vertical stud",
      "stud",
      [1.5, 72, 3.5],
      [0, 36, 0],
      p.steps[0].id,
      "Wall",
    ),
    part(
      "Top plate",
      "stud",
      [48, 1.5, 3.5],
      [0, 72.75, 0],
      p.steps[0].id,
      "Wall",
    ),
  ];
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "connection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await page
    .getByRole("button", { name: "Vertical stud", exact: true })
    .click();
  await page
    .getByLabel("Connect to part")
    .selectOption({ label: "Top plate · touching" });
  await page.getByRole("button", { name: "Add screw connection" }).click();
  await expect(page.locator(".statusbar")).toContainText("1 connections");
  await page.getByRole("spinbutton", { name: "X", exact: true }).fill("100");
  await page.getByRole("spinbutton", { name: "X", exact: true }).press("Tab");
  await page.getByRole("button", { name: "Checks", exact: false }).click();
  await expect(page.locator(".findings")).toContainText(
    "A connection no longer touches both parts",
  );
});
test("server prevents cross-origin writes, invalid plans, and revision overwrites", async ({
  request,
}) => {
  const p = blank("API persistence test");
  const created = await request.put(`/api/projects/${p.id}`, {
    data: { project: p, baseRevision: 0 },
  });
  expect(created.status()).toBe(200);
  expect((await created.json()).revision).toBe(1);
  const conflict = await request.put(`/api/projects/${p.id}`, {
    data: { project: p, baseRevision: 0 },
  });
  expect(conflict.status()).toBe(409);
  const foreign = await request.put(`/api/projects/${p.id}`, {
    data: { project: p, baseRevision: 1 },
    headers: { origin: "https://example.com" },
  });
  expect(foreign.status()).toBe(403);
  const invalid = await request.put(`/api/projects/${p.id}`, {
    data: { project: { ...p, schemaVersion: 3 }, baseRevision: 1 },
  });
  expect(invalid.status()).toBe(400);
  expect((await request.get(`/api/projects/${p.id}`)).status()).toBe(200);
});
test("mobile interface fits without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("records a matched inventory snapshot and makes ZIP settings editable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Record store snapshot" }).click();
  await page
    .getByLabel("Home Depot product URL")
    .fill("https://www.homedepot.com/p/test/123456789");
  await expect(page.getByLabel("Internet number")).toHaveValue("123456789");
  await page.getByLabel("Unit price (USD)", { exact: true }).fill("5.25");
  await page.getByLabel("Available stock units").fill("100");
  await page.getByLabel("Exact store number", { exact: true }).fill("4409");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  await expect(page.locator(".bom-row").first()).toContainText(
    "Snapshot · 100 available",
  );
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Store ZIP", exact: true })
    .fill("84101");
  await page
    .getByRole("textbox", { name: "Store ZIP", exact: true })
    .press("Tab");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".bom-row").first()).toContainText(
    "Availability unverified",
  );
  await expect(page.locator(".store-card")).toContainText("84101");
});
test("dragging a catalog card places a new part in the scene", async ({
  page,
}) => {
  const count = await page.locator(".statusbar").innerText();
  await page
    .locator(".material-card")
    .first()
    .dragTo(page.locator("canvas"), { targetPosition: { x: 200, y: 320 } });
  await expect(
    page.getByRole("textbox", { name: "Part name", exact: true }),
  ).toHaveValue("2 × 4 framing lumber");
  expect(await page.locator(".statusbar").innerText()).not.toBe(count);
  await expect(
    page.getByRole("spinbutton", { name: "Height Y", exact: true }),
  ).toHaveValue("96");
});
test("the move gizmo commits the dragged object transform", async ({
  page,
}) => {
  const p = blank("Move test");
  p.pieces = [
    part(
      "Move board",
      "stud",
      [1.5, 72, 3.5],
      [0, 36, 0],
      p.steps[0].id,
      "Test",
    ),
  ];
  await page
    .getByRole("button", { name: "Import a plan", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "move.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await page.getByRole("button", { name: "Move board", exact: true }).click();
  await page.getByRole("button", { name: "Move (M)", exact: true }).click();
  await page.waitForTimeout(1800);
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("Canvas not visible");
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y - box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(x, y - 100, { steps: 15 });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "Y", exact: true }),
  ).not.toHaveValue("36");
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Y", exact: true }),
  ).not.toHaveValue("36");
});
