import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { PROJECT_FORMAT_VERSION } from "../../src/projectVersion";
import { test, expect } from "@playwright/test";
import path from "node:path";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { blank, part } from "../../src/model";
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Untitled project", exact: true }),
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
test("generates a guide at the end and explicitly reopens a saved project", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Assemblies", exact: true }).click();
  await page.getByRole("button", { name: /Framed wall Width/ }).click();
  await page
    .getByRole("textbox", { name: "Describe your build" })
    .fill("wall 8 ft wide, 6 ft tall");
  await page
    .getByRole("button", { name: "Preview proposal", exact: true })
    .click();
  await expect(page.locator(".proposal")).toContainText("Framed wall assembly");
  await page
    .getByRole("button", { name: "Add to workspace", exact: true })
    .click();
  await expect(page.locator(".step-track")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate build guide", exact: true })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText("Assemble Wall 1");
  await page.getByRole("button", { name: "Mark step complete" }).click();
  await expect(
    page.getByRole("button", { name: "Completed · mark unfinished" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved to library", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".statusbar")).toContainText("0 parts");
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list>button")
    .filter({ hasText: "Untitled project" })
    .first()
    .click();
  await expect(page.locator(".step-track")).toContainText("Assemble Wall 1");
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
  await page.getByRole("button", { name: "Cut part", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Retained length", exact: true })
    .fill("48");
  await page.getByRole("button", { name: "Apply cuts", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("0 offcuts");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("1 offcuts");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Editable project/ }).click();
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
      name: "Untitled project · imported",
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
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .locator(`button.step-part[data-part-id="${p.pieces[0].id}"]`)
    .click();
  await page.getByText("Connect parts", { exact: true }).click();
  await page
    .getByLabel("Connect to part")
    .selectOption({ label: "Top plate · touching" });
  await page.getByRole("button", { name: "Add connection" }).click();
  await expect(page.locator(".statusbar")).toContainText("1 quantity record");
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
    data: {
      project: { ...p, schemaVersion: PROJECT_FORMAT_VERSION + 1 },
      baseRevision: 1,
    },
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
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
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
    .filter({
      has: page.getByRole("button", {
        name: "Add 2 × 4 framing lumber",
        exact: true,
      }),
    })
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
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await page
    .locator(`button.step-part[data-part-id="${p.pieces[0].id}"]`)
    .click();
  await page.getByRole("button", { name: "Move (M)", exact: true }).click();
  await page.waitForTimeout(1800);
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("Canvas not visible");
  // This fixture fits at radius 6 ft, centered on the board's world center.
  // Project the actual three-stdlib TransformControls Y-arrow head, rather than
  // guessing a percentage of a canvas whose height changes with guide layout.
  const camera = new PerspectiveCamera(38, box.width / box.height, 0.05, 500);
  camera.position.set(7.2, 8.1, 8.1);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  const distance = camera.position.distanceTo(new Vector3(0, 3, 0));
  const gizmoScale =
    (distance * (1.9 * Math.tan((19 * Math.PI) / 180)) * 0.8) / 7;
  const head = new Vector3(0, 3 + gizmoScale, 0).project(camera);
  const x = box.x + ((head.x + 1) * box.width) / 2;
  const y = box.y + ((1 - head.y) * box.height) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 15 });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "Y", exact: true }),
  ).not.toHaveValue("36");
  const movedY = Number(
    await page.getByRole("spinbutton", { name: "Y", exact: true }).inputValue(),
  );
  expect(movedY).toBeGreaterThan(36);
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("spinbutton", { name: "Z", exact: true }),
  ).toHaveValue("0");
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Y", exact: true }),
  ).not.toHaveValue("36");
});

for (const tool of ["Lift", "Move handle"] as const) {
  test(`${tool} shows the blocking part and commits exact wood contact`, async ({
    page,
  }) => {
    const project = blank("Flush stack");
    const base = part(
      "Base board",
      "stud",
      [18, 4, 18],
      [0, 2, 0],
      project.steps[0].id,
      "Test",
    );
    const upper = part(
      "Upper board",
      "stud",
      [8, 4, 8],
      [0, 18, 0],
      project.steps[0].id,
      "Test",
    );
    const upright = part(
      "Side upright",
      "stud",
      [2, 48, 4],
      [24, 24, 0],
      project.steps[0].id,
      "Test",
    );
    project.pieces = [base, upper, upright];
    await page
      .getByRole("button", { name: "Import a plan", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "stack.yardwork.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.getByRole("button", { name: "Front", exact: true }).click();
    await page
      .getByRole("button", { name: "Toggle snapping", exact: true })
      .click();
    if (tool === "Lift") await page.keyboard.press("l");
    else {
      await page.getByRole("button", { name: "Guide", exact: true }).click();
      await page
        .locator(`button.step-part[data-part-id="${upper.id}"]`)
        .click();
      const moveTool = page.getByRole("button", {
        name: "Move (M)",
        exact: true,
      });
      await moveTool.click();
      await expect(moveTool).toHaveClass(/active/);
    }
    const canvas = page.locator("canvas");
    const readCamera = async () =>
      JSON.parse((await canvas.getAttribute("data-workshop-camera"))!);
    await expect
      .poll(async () => {
        const camera = await readCamera();
        return camera.settled && Math.abs(camera.position[0] - 2 / 3) < 0.01;
      })
      .toBe(true);
    const telemetry = await readCamera();
    const box = (await canvas.boundingBox())!;
    const grip = new Vector3(0, 18 / 12, tool === "Lift" ? 4 / 12 : 0);
    if (tool === "Move handle") {
      const cameraDistance = grip.distanceTo(
        new Vector3().fromArray(telemetry.position),
      );
      grip.y +=
        (cameraDistance * 1.9 * Math.tan((19 * Math.PI) / 180) * 0.8) / 7;
    }
    const projected = grip
      .applyMatrix4(new Matrix4().fromArray(telemetry.matrixWorldInverse))
      .applyMatrix4(new Matrix4().fromArray(telemetry.projectionMatrix));
    const x = box.x + ((projected.x + 1) * box.width) / 2;
    const y = box.y + ((1 - projected.y) * box.height) / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(
      x,
      Math.min(y + box.height * 0.72, box.y + box.height - 24),
      { steps: 9 },
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Stopped at Base board" }),
    ).toBeVisible();
    await page.mouse.up();
    await expect(
      page.getByRole("spinbutton", { name: "Y", exact: true }),
    ).toHaveValue("6");
    await expect(
      page.getByRole("spinbutton", { name: "X", exact: true }),
    ).toHaveValue("0");
    await expect(
      page.getByRole("spinbutton", { name: "Z", exact: true }),
    ).toHaveValue("0");
    await expect(
      page.getByRole("status").filter({ hasText: "Stopped at Base board" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          ({ key, id }) => {
            const draft = JSON.parse(localStorage.getItem(key)!);
            return draft.project.pieces.find(
              (piece: { id: string }) => piece.id === id,
            )?.position;
          },
          { key: CURRENT_DRAFT_KEY, id: upper.id },
        ),
      )
      .toEqual([0, 18, 0]);
  });
}

test("undo preserves printed part-label reservations before another board is added", async ({
  page,
}) => {
  const draft = () =>
    page.evaluate((draftKey) => {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw).project : null;
    }, CURRENT_DRAFT_KEY);
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await expect.poll(async () => (await draft())?.pieces.length).toBe(1);
  const first = await draft(),
    a = first.pieces[0].id;
  expect(
    first.partLabels.find((row: { partId: string }) => row.partId === a).label,
  ).toBe("P001");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await draft())?.pieces.length).toBe(0);
  await page
    .getByRole("button", { name: "Add 2 × 4 framing lumber", exact: true })
    .click();
  await expect
    .poll(async () => {
      const p = await draft();
      return p?.pieces.length === 1 && p.pieces[0].id !== a;
    })
    .toBe(true);
  const changed = await draft(),
    b = changed.pieces[0].id;
  expect(
    changed.partLabels.find((row: { partId: string }) => row.partId === b)
      .label,
  ).toBe("P002");
  expect(
    changed.partLabels.find((row: { partId: string }) => row.partId === a)
      .label,
  ).toBe("P001");
});
