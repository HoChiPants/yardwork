import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Matrix4, Vector3 } from "three";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type Project,
} from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { bom, cutPiece } from "../../src/engine";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";

test.setTimeout(120000);
type Camera = {
  position: number[];
  target: number[];
  projectionMatrix: number[];
  matrixWorldInverse: number[];
  viewport: { width: number; height: number };
  settled: boolean;
};
function guard(page: Page) {
  const errors: string[] = [],
    native: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /\/api\/(planner|assistant|chat|generate|pull)(?:[/?]|$)/.test(
        request.url(),
      )
    )
      native.push(request.url());
  });
  return () => {
    expect(errors).toEqual([]);
    expect(native).toEqual([]);
  };
}
async function draft(
  page: Page,
  predicate: (p: Project) => boolean = () => true,
) {
  let project: Project | null = null;
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        CURRENT_DRAFT_KEY,
      );
      project = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
      return !!project && predicate(project);
    })
    .toBe(true);
  return project!;
}
async function importProject(page: Page, project: Project) {
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
      name: "synthetic-focused-inspector.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function snapshot(page: Page) {
  const project = await draft(page);
  return {
    raw: await page.evaluate(
      (key) => localStorage.getItem(key),
      CURRENT_DRAFT_KEY,
    ),
    project,
    bom: bom(project),
  };
}
async function unchanged(
  page: Page,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(await snapshot(page)).toEqual(before);
}
async function camera(page: Page) {
  let actual: Camera | null = null,
    previous = "",
    stable = 0;
  await expect
    .poll(
      async () => {
        const raw = await page
          .locator("canvas")
          .getAttribute("data-workshop-camera");
        actual = raw ? (JSON.parse(raw) as Camera) : null;
        if (!actual?.settled) {
          stable = 0;
          return false;
        }
        const key = JSON.stringify([
          actual.position,
          actual.matrixWorldInverse,
          actual.viewport,
        ]);
        stable = key === previous ? stable + 1 : 0;
        previous = key;
        return stable >= 2;
      },
      { timeout: 15000, intervals: [100, 100, 150] },
    )
    .toBe(true);
  const { position, target, projectionMatrix, matrixWorldInverse, viewport } =
    actual!;
  const size = await page.locator("canvas").evaluate((node) => ({
    width: node.clientWidth,
    height: node.clientHeight,
    drawingWidth: (node as HTMLCanvasElement).width,
    drawingHeight: (node as HTMLCanvasElement).height,
  }));
  return {
    position,
    target,
    projectionMatrix,
    matrixWorldInverse,
    viewport,
    size,
  };
}
/** Observe actual Scene telemetry writes, rather than reading an idle demand-loop value repeatedly. */
async function duringRenderedFrame<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<T> {
  const witness = await page.locator("canvas").evaluateHandle((node) => {
    const state = { frames: 0, observer: null as MutationObserver | null };
    state.observer = new MutationObserver((records) => {
      state.frames += records.filter(
        (record) => record.attributeName === "data-workshop-camera",
      ).length;
    });
    state.observer.observe(node, {
      attributes: true,
      attributeFilter: ["data-workshop-camera"],
    });
    return state;
  });
  try {
    const value = await action();
    await expect
      .poll(() => witness.evaluate((state) => state.frames), { timeout: 15000 })
      .toBeGreaterThan(0);
    return value;
  } finally {
    await witness.evaluate((state) => state.observer?.disconnect());
    await witness.dispose();
  }
}
async function orbit(page: Page) {
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const before = await camera(page);
  const hit = await canvas.evaluate((node) => {
    const rect = node.getBoundingClientRect(),
      left = Math.max(0, rect.left),
      right = Math.min(innerWidth, rect.right),
      top = Math.max(0, rect.top),
      bottom = Math.min(innerHeight, rect.bottom);
    const width = right - left,
      height = bottom - top;
    for (const fx of [0.35, 0.5, 0.65])
      for (const fy of [0.35, 0.5, 0.65]) {
        const start = { x: left + width * fx, y: top + height * fy },
          end = {
            x: left + width * fx + Math.min(80, width * 0.15),
            y: top + height * fy - Math.min(30, height * 0.08),
          };
        if (
          document.elementFromPoint(start.x, start.y) === node &&
          document.elementFromPoint(end.x, end.y) === node
        )
          return {
            start,
            end,
            canvas: rect.toJSON(),
            viewport: { width: innerWidth, height: innerHeight },
            bothEndpointsHitActualCanvas: true,
          };
      }
    return null;
  });
  expect(hit).not.toBeNull();
  await test.info().attach("visible-actual-canvas-orbit-hit", {
    body: Buffer.from(JSON.stringify(hit, null, 2)),
    contentType: "application/json",
  });
  await page.mouse.move(hit!.start.x, hit!.start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(hit!.end.x, hit!.end.y, { steps: 14 });
  await page.mouse.up({ button: "right" });
  // WORK-only installed-control precondition: demand invalidation stops at EPS=1e-6
  // while native damping still has a residual. Zero wheel deltas call its existing
  // update handler without dolly, preset, camera or control-property assignment.
  await duringRenderedFrame(page, () =>
    canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      for (let index = 0; index < 1024; index++)
        node.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: 0,
            deltaY: 0,
            deltaZ: 0,
            clientX: rect.x + rect.width / 2,
            clientY: rect.y + rect.height / 2,
          }),
        );
    }),
  );
  const after = await camera(page);
  expect(after.matrixWorldInverse).not.toEqual(before.matrixWorldInverse);
  expect(after.projectionMatrix).toEqual(before.projectionMatrix);
  expect(after.viewport).toEqual(before.viewport);
  expect(after.size).toEqual(before.size);
  await test.info().attach("artificial-native-inertia-settle", {
    body: Buffer.from(
      JSON.stringify(
        {
          zeroDeltaWheelUpdates: 1024,
          actualTelemetryFrameObserved: true,
          directCameraOrControlPropertyWrites: 0,
          before,
          after,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  return after;
}
async function capture(page: Page, name: string, target?: Locator) {
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath(name),
    fullPage: false,
    animations: "disabled",
  });
}
const inspector = (page: Page) => page.locator("#workshop-inspector");
async function expand(page: Page) {
  const aside = inspector(page);
  await page
    .getByRole("button", { name: "Expand inspector", exact: true })
    .click();
  await expect(aside).toHaveAttribute("data-inspector-focused", "true");
  await expect(aside).toHaveAttribute("role", "dialog");
  await expect(aside).toHaveAttribute("aria-modal", "true");
  await expect(
    aside.getByRole("button", { name: "Back to workspace", exact: true }),
  ).toBeVisible();
  return aside;
}
async function collapse(page: Page) {
  await inspector(page)
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute(
    "data-inspector-focused",
    "false",
  );
}
async function openPlan(page: Page, planId: string) {
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page
    .getByRole("button", { name: "Plan wood-fastener locations", exact: true })
    .click();
  const saved = page.locator(`[data-fastener-plan-id='${planId}']`);
  const selector = saved.locator(".attachment-plan-select");
  if ((await selector.getAttribute("aria-expanded")) !== "true")
    await selector.click();
  return saved;
}
async function userMeasurements(saved: Locator) {
  const details = saved
    .locator("details")
    .filter({ hasText: /^User measurements · unknown values stay blank/ });
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
  return details;
}
function makeWoodFixture(count = 1, withExistingContext = false) {
  const make = async () => {
    const project = withExistingContext
      ? projectSchema.parse(
          JSON.parse(
            await readFile(
              "tests/fixtures/format9-guide-placement.wrapper.json",
              "utf8",
            ),
          ).project,
        )
      : blank();
    project.name = `SYNTHETIC focused inspector ${uid().slice(0, 8)}`;
    project.notes +=
      "\nSYNTHETIC browser geometry and user datums only; not installed construction or hardware approval.";
    const y = count > 1 ? 45 : 6,
      height = count > 1 ? 90 : 12,
      origin = withExistingContext ? 160 : 0;
    const head = part(
      "SYNTHETIC actual entry panel",
      "plytanium-703",
      [0.703, height, 8],
      [origin + 0.3515, y, 0],
      project.steps[0].id,
      "SYNTHETIC trial",
    );
    const receiver = part(
      "SYNTHETIC actual receiving board",
      "stud",
      [3.5, height, 1.5],
      [origin + 2.453, y, 0],
      project.steps[0].id,
      "SYNTHETIC trial",
    );
    project.pieces.push(head, receiver);
    let plan = makeFastenerPlan(project, head.id, receiver.id, {
      productId: "simpson-dsvt3r70",
    });
    plan.name = "SYNTHETIC explicit saved locations";
    for (let index = 0; index < count; index++) {
      plan = addFastenerLocation(plan);
      plan.locations[index].entranceLocal = [
        -0.3515,
        count > 1 ? -40 + index * 0.8 : 0,
        0,
      ];
      plan.locations[index].driveLocal = [1, 0, 0];
    }
    plan.measurements = {
      surfaceToTipDepth: 1.375,
      pilotDiameter: 0.0625,
      pilotDepth: 1.5,
      basis:
        "SYNTHETIC software-only explicit datum, not real measured hardware or installation instructions",
      measuredAt: "2026-11-17T15:00:00.000Z",
    };
    const result = saveFastenerPlan(project, plan),
      review = fastenerReviews(result).find(
        (item) => item.plan.id === plan.id,
      )!;
    expect(review.activePointCount).toBe(count);
    expect(review.state).toBe("path-reviewed");
    return { project: result, plan, head, receiver };
  };
  return make();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
]) {
  test(`${viewport.width}px focused source inspector fits the actual sheet diagram and restores scroll, focus, camera and project`, async ({
    page,
  }) => {
    const verifyGuard = guard(page);
    await page.setViewportSize(viewport);
    let project = blank(`SYNTHETIC focused sheet ${uid().slice(0, 8)}`);
    const sheet = part(
      "SYNTHETIC exact source panel",
      "plytanium-703",
      [...material("plytanium-703").size],
      [0, 0, 0],
      project.steps[0].id,
      "SYNTHETIC source",
    );
    project.pieces = [sheet];
    project = cutPiece(project, sheet.id, 60, 2);
    project = cutPiece(project, sheet.id, 20, 0);
    const imported = await importProject(page, project),
      actual = imported.pieces.find((item) => item.id === sheet.id)!;
    const orbitedBeforeOrdinaryUiFrame = await orbit(page),
      before = await snapshot(page);
    await duringRenderedFrame(page, () =>
      page.getByRole("button", { name: "List", exact: true }).click(),
    );
    const orbited = await camera(page);
    expect(orbited).toEqual(orbitedBeforeOrdinaryUiFrame);
    const source = page.locator(
        `.inspector-scroll .cut-stock-layout[data-source-id='${actual.cutStock!.id}']`,
      ),
      details = source.locator("..");
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
    const toggle = page.getByRole("button", {
      name: "Expand inspector",
      exact: true,
    });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.focus();
    const scroll = await page.evaluate(() => ({
      windowY: scrollY,
      inspector: document.querySelector(".inspector-scroll")!.scrollTop,
    }));
    await expand(page);
    if (viewport.width === 390) {
      const aside = inspector(page),
        back = aside.getByRole("button", {
          name: "Back to workspace",
          exact: true,
        });
      expect(
        await aside.evaluate((node) =>
          [...node.parentElement!.children]
            .filter((item) => item !== node && item instanceof HTMLElement)
            .every((item) => (item as HTMLElement).inert),
        ),
      ).toBe(true);
      await back.focus();
      await page.keyboard.press("Shift+Tab");
      expect(
        await aside.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
      await expect(back).not.toBeFocused();
      await page.keyboard.press("Tab");
      await expect(back).toBeFocused();
    }
    const diagram = source.locator("svg");
    await diagram.scrollIntoViewIfNeeded();
    const bounds = await source.evaluate((node) => {
      const region = node.closest(".inspector-scroll")!,
        svg = node.querySelector("svg")!;
      return {
        region: region.getBoundingClientRect().toJSON(),
        svg: svg.getBoundingClientRect().toJSON(),
        regionClientHeight: region.clientHeight,
        windowWidth: innerWidth,
        windowHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        regionWidth: region.clientWidth,
        regionScrollWidth: region.scrollWidth,
      };
    });
    expect(bounds.regionClientHeight).toBeGreaterThan(viewport.height * 0.65);
    expect(bounds.svg.height).toBeGreaterThanOrEqual(250);
    expect(bounds.svg.top).toBeGreaterThanOrEqual(bounds.region.top);
    expect(bounds.svg.bottom).toBeLessThanOrEqual(bounds.region.bottom + 1);
    expect(bounds.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(bounds.regionScrollWidth).toBeLessThanOrEqual(bounds.regionWidth);
    await expect(diagram.locator("g[data-part-id]")).toHaveCount(3);
    await expect(
      inspector(page).getByRole("button", {
        name: "Back to workspace",
        exact: true,
      }),
    ).toBeInViewport();
    expect(await camera(page)).toEqual(orbited);
    await unchanged(page, before);
    await capture(page, `${viewport.width}-focused-source-readable.png`);
    await collapse(page);
    expect(await camera(page)).toEqual(orbited);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          windowY: scrollY,
          inspector: document.querySelector(".inspector-scroll")!.scrollTop,
        })),
      )
      .toEqual(scroll);
    await expect(toggle).toBeFocused();
    await unchanged(page, before);
    verifyGuard();
  });
}

test("display-only focus preserves the same incomplete numeric editor, units, basis and actual orbited camera", async ({
  page,
}) => {
  const verifyGuard = guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await makeWoodFixture(1, true);
  await importProject(page, fixture.project);
  const orbitedBeforeOrdinaryUiFrame = await orbit(page),
    saved = await duringRenderedFrame(page, () =>
      openPlan(page, fixture.plan.id),
    ),
    measurements = await userMeasurements(saved);
  const orbited = await camera(page);
  expect(orbited).toEqual(orbitedBeforeOrdinaryUiFrame);
  await measurements
    .getByRole("combobox", {
      name: "Surface-to-tip depth after seating units",
      exact: true,
    })
    .selectOption("ft");
  await saved
    .getByRole("textbox", { name: "Fastener measurement basis", exact: true })
    .fill("SYNTHETIC unsaved basis must survive display focus");
  await saved
    .getByLabel("Fastener measurement date", { exact: true })
    .fill("2026-11-17T10:01");
  const field = measurements.getByRole("spinbutton", {
    name: "Surface-to-tip depth after seating",
    exact: true,
  });
  await field.fill("");
  await field.pressSequentially("1e");
  const originalNode = await field.elementHandle();
  const raw = await field.evaluate((node) => ({
    value: (node as HTMLInputElement).value,
    badInput: (node as HTMLInputElement).validity.badInput,
    type: (node as HTMLInputElement).type,
  }));
  expect(raw).toEqual({ value: "", badInput: true, type: "number" });
  const before = await snapshot(page);
  await expand(page);
  expect(
    await field.evaluate((node, original) => node === original, originalNode),
  ).toBe(true);
  expect(
    await field.evaluate((node) => ({
      value: (node as HTMLInputElement).value,
      badInput: (node as HTMLInputElement).validity.badInput,
      type: (node as HTMLInputElement).type,
    })),
  ).toEqual(raw);
  await capture(page, "phone-raw-incomplete-number-focused.png", field);
  await collapse(page);
  await expand(page);
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveAttribute(
    "data-inspector-focused",
    "false",
  );
  expect(
    await field.evaluate((node, original) => node === original, originalNode),
  ).toBe(true);
  expect(
    await field.evaluate((node) => ({
      value: (node as HTMLInputElement).value,
      badInput: (node as HTMLInputElement).validity.badInput,
      type: (node as HTMLInputElement).type,
    })),
  ).toEqual(raw);
  await expect(
    measurements.getByRole("combobox", {
      name: "Surface-to-tip depth after seating units",
      exact: true,
    }),
  ).toHaveValue("ft");
  await expect(
    saved.getByRole("textbox", {
      name: "Fastener measurement basis",
      exact: true,
    }),
  ).toHaveValue("SYNTHETIC unsaved basis must survive display focus");
  await expect(
    saved.getByLabel("Fastener measurement date", { exact: true }),
  ).toHaveValue("2026-11-17T10:01");
  expect(await camera(page)).toEqual(orbited);
  await unchanged(page, before);
  verifyGuard();
});

test("a focused actual W entrance pick exposes Canvas and Return keeps the same unsaved fields without replaying its nonce", async ({
  page,
}) => {
  const verifyGuard = guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await makeWoodFixture();
  await importProject(page, fixture.project);
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await camera(page);
  const saved = await openPlan(page, fixture.plan.id),
    location = saved.locator("details[aria-label='Fastener location F001']");
  await location
    .getByRole("textbox", { name: "F001 name", exact: true })
    .fill("SYNTHETIC unsaved picked entrance");
  const before = await snapshot(page);
  await expand(page);
  await location
    .getByRole("button", { name: "Pick entrance in 3D", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute(
    "data-inspector-focused",
    "false",
  );
  await expect(inspector(page)).toHaveAttribute(
    "data-inspector-returnable",
    "true",
  );
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const telemetry = await camera(page),
    rect = (await canvas.boundingBox())!;
  // Front retained Z face of the actual .703-in-thick panel; this is an interior surface point, not a manufactured hole.
  const target = new Vector3(0.3515 / 12, 7 / 12, 4 / 12)
    .applyMatrix4(new Matrix4().fromArray(telemetry.matrixWorldInverse))
    .applyMatrix4(new Matrix4().fromArray(telemetry.projectionMatrix));
  expect(Math.abs(target.x)).toBeLessThan(1);
  expect(Math.abs(target.y)).toBeLessThan(1);
  await page.mouse.click(
    rect.x + ((target.x + 1) * rect.width) / 2,
    rect.y + ((1 - target.y) * rect.height) / 2,
  );
  await page
    .getByRole("button", { name: "Return to inspector", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute(
    "data-inspector-focused",
    "true",
  );
  const axes = ["X", "Y", "Z"].map((axis) =>
    location.getByRole("spinbutton", {
      name: `F001 entry point ${axis}`,
      exact: true,
    }),
  );
  const picked = await Promise.all(axes.map((field) => field.inputValue()));
  expect(picked.map(Number).every(Number.isFinite)).toBe(true);
  expect(picked.map(Number)).not.toEqual(
    fixture.plan.locations[0].entranceLocal,
  );
  await expect(
    location.getByRole("textbox", { name: "F001 name", exact: true }),
  ).toHaveValue("SYNTHETIC unsaved picked entrance");
  await axes[1].fill("0.125");
  await collapse(page);
  await expand(page);
  await expect(axes[1]).toHaveValue("0.125");
  await expect(
    location.getByRole("textbox", { name: "F001 name", exact: true }),
  ).toHaveValue("SYNTHETIC unsaved picked entrance");
  await unchanged(page, before);
  await capture(page, "phone-return-to-picked-unsaved-W-editor.png", location);
  verifyGuard();
});

test("71 saved W entries retain durable markers while one active caption follows selection and Repeat keeps precedence", async ({
  page,
}) => {
  const verifyGuard = guard(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  const fixture = await makeWoodFixture(71, true);
  await importProject(page, fixture.project);
  const saved = await openPlan(page, fixture.plan.id),
    before = await snapshot(page);
  const entries = page.locator(
      `[data-testid='fastener-entry-marker'][data-plan-id='${fixture.plan.id}']`,
    ),
    tips = page.locator(
      `[data-testid='fastener-tip-marker'][data-plan-id='${fixture.plan.id}']`,
    ),
    caption = page.getByTestId("fastener-location-caption");
  await expect(entries).toHaveCount(71);
  await expect(tips).toHaveCount(71);
  expect(
    (
      await entries.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-location-id")),
      )
    ).sort(),
  ).toEqual(fixture.plan.locations.map((location) => location.id).sort());
  await expect(caption).toHaveCount(1);
  await expect(caption).toHaveAttribute(
    "data-location-id",
    fixture.plan.locations[0].id,
  );
  const selector = saved.getByRole("combobox", {
    name: "Active screw location",
    exact: true,
  });
  await selector.selectOption(fixture.plan.locations[70].id);
  await expect(caption).toHaveCount(1);
  await expect(caption).toHaveAttribute(
    "data-location-id",
    fixture.plan.locations[70].id,
  );
  await expect(caption).toContainText(`${fixture.plan.label}/F071`);
  await expect(entries).toHaveCount(71);
  await expect(tips).toHaveCount(71);
  await unchanged(page, before);
  await caption.scrollIntoViewIfNeeded();
  await expect(caption).toBeInViewport();
  await capture(page, "tablet-71-markers-one-F071-caption.png", caption);
  await selector.selectOption(fixture.plan.locations[0].id);
  await expand(page);
  await saved
    .locator("details[aria-label='Fastener location F001']")
    .getByRole("button", { name: "Repeat from F001", exact: true })
    .click();
  const layout = saved
    .locator("details")
    .filter({ has: page.getByText("Repeat screw locations", { exact: true }) });
  await layout
    .getByRole("combobox", { name: "Layout face direction", exact: true })
    .selectOption("1");
  await layout
    .getByRole("spinbutton", {
      name: "Layout row count including seed",
      exact: true,
    })
    .fill("3");
  await layout
    .getByRole("spinbutton", { name: "Layout row spacing", exact: true })
    .fill("0.4");
  await layout
    .getByRole("textbox", { name: "Layout basis or note", exact: true })
    .fill(
      "SYNTHETIC software-only repeat of the entered face datum; spacing is a test input, not an installation or capacity rule.",
    );
  await layout
    .getByRole("button", { name: "Preview repeated locations", exact: true })
    .click();
  await expect(page.getByTestId("fastener-layout-entry-marker")).toHaveCount(2);
  await expect(caption).toHaveCount(0);
  const candidateIds = await page
    .getByTestId("fastener-layout-entry-marker")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-location-id")),
    );
  await layout
    .getByRole("checkbox", { name: "Select New 1", exact: true })
    .check();
  await layout
    .getByRole("button", { name: "Inspect New 2", exact: true })
    .click();
  await expect(page.getByTestId("fastener-layout-caption")).toHaveCount(1);
  await expect(page.getByTestId("fastener-layout-caption")).toContainText(
    "New 2",
  );
  await layout
    .getByRole("button", { name: "Inspect layout in 3D", exact: true })
    .click();
  await expect(inspector(page)).toHaveAttribute(
    "data-inspector-focused",
    "false",
  );
  await expect(
    page
      .getByTestId("fastener-layout-entry-marker")
      .filter({ hasText: "New 2" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Return to inspector", exact: true })
    .click();
  expect(
    await page
      .getByTestId("fastener-layout-entry-marker")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-location-id")),
      ),
  ).toEqual(candidateIds);
  await expect(caption).toHaveCount(0);
  await expect(
    layout.getByRole("checkbox", { name: "Select New 1", exact: true }),
  ).toBeChecked();
  await unchanged(page, before);
  await capture(
    page,
    "tablet-repeat-preview-focus-has-caption-precedence.png",
    layout.getByTestId("fastener-layout-preview"),
  );
  verifyGuard();
});

for (const viewport of [
  { width: 761, height: 893 },
  { width: 820, height: 1180 },
]) {
  test(`${viewport.width}px full catalog and long connection editors keep a bounded model workspace`, async ({
    page,
  }) => {
    const verifyGuard = guard(page);
    await page.setViewportSize(viewport);
    const captured = JSON.parse(
      await readFile(
        new URL(
          "../fixtures/format10-catalog-cuts.wrapper.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const source = projectSchema.parse(captured.project);
    source.name = `SYNTHETIC bounded workspace ${uid().slice(0, 8)}`;
    await importProject(page, source);
    const before = await snapshot(page);
    const allocation = async () =>
      page.evaluate(() => {
        const canvas = document.querySelector("canvas")!,
          inspector = document.querySelector(".inspector")!,
          library = document.querySelector(".material-list");
        const c = canvas.getBoundingClientRect(),
          i = inspector.getBoundingClientRect();
        return {
          pageHeight: document.documentElement.scrollHeight,
          pageWidth: document.documentElement.scrollWidth,
          canvas: { width: c.width, height: c.height },
          inspector: { height: i.height },
          catalog: library
            ? {
                height: library.clientHeight,
                content: library.scrollHeight,
              }
            : null,
        };
      });
    const loaded = await allocation();
    expect(loaded.pageHeight).toBeLessThanOrEqual(
      Math.max(viewport.height, 950) + 1,
    );
    expect(loaded.pageWidth).toBeLessThanOrEqual(viewport.width);
    expect(loaded.canvas.height).toBeGreaterThanOrEqual(178);
    expect(loaded.canvas.height).toBeLessThan(viewport.height);
    expect(loaded.catalog!.content).toBeGreaterThan(loaded.catalog!.height);
    const beforeCamera = await camera(page);
    await page
      .getByRole("button", { name: "Review connection decisions", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review W001", exact: true })
      .click();
    const edited = await allocation();
    expect(edited).toEqual(loaded);
    expect(
      await page
        .locator(".inspector-scroll")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    expect(await camera(page)).toEqual(beforeCamera);
    await page
      .getByRole("button", { name: "Cut pool (1)", exact: true })
      .click();
    const pool = await allocation();
    expect(pool.canvas).toEqual(loaded.canvas);
    expect(pool.pageHeight).toBe(loaded.pageHeight);
    await unchanged(page, before);
    verifyGuard();
  });
}
