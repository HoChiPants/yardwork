import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema, uid, type Project } from "../../src/model";
import { CURRENT_DRAFT_KEY } from "../../src/drafts";
import { bom } from "../../src/engine";
import {
  banquetteConstruction,
  type BanquetteConstructionReport,
  type BanquettePairReview,
} from "../../src/banquetteConstruction";
import { banquetteConstructionMarkdown } from "../../src/banquetteConstructionGuide";
import { partLabel } from "../../src/partLabels";
import { currentBindingFingerprint } from "../../src/ideaBindingState";

test.setTimeout(120000);
function guard(page: Page) {
  const errors: string[] = [],
    planner: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /\/api\/(planner|assistant|chat|generate|pull)(?:[/?]|$)/.test(
        request.url(),
      )
    )
      planner.push(request.url());
  });
  return () => {
    expect(errors).toEqual([]);
    expect(planner).toEqual([]);
  };
}
async function draft(
  page: Page,
  matches: (p: Project) => boolean = () => true,
) {
  let result: Project | null = null;
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate(
          (key) => localStorage.getItem(key),
          CURRENT_DRAFT_KEY,
        );
        result = raw ? projectSchema.parse(JSON.parse(raw).project) : null;
        return !!result && matches(result);
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return result!;
}
async function fixture(withGap = false) {
  const p = projectSchema.parse(
    JSON.parse(
      await readFile(
        "public/examples/builds/storage-banquette.yardwork.json",
        "utf8",
      ),
    ),
  );
  p.name = `SYNTHETIC module-three construction ${uid().slice(0, 8)}`;
  p.notes +=
    "\nSYNTHETIC browser study only. Contact observations and empty plans are not installed joinery or seating capacity.";
  const reports = banquetteConstruction(p);
  expect(reports).toHaveLength(3);
  const third = reports.find(
    (report) => report.sectionId === p.sections[2].id,
  )!;
  expect(third.seats[0].state).toBe("contacts-found");
  if (withGap) {
    const seat = p.pieces.find((piece) => piece.id === third.seats[0].pieceId)!;
    seat.position = [
      seat.position[0],
      seat.position[1] + 0.0625,
      seat.position[2],
    ];
    const changed = banquetteConstruction(p).find(
      (report) => report.entryId === third.entryId,
    )!;
    expect(changed.seats[0].state).toBe("no-bearing-contact");
    expect(
      changed.findings.some((finding) => finding.code === "seat-bearing-gap"),
    ).toBe(true);
    expect(changed.seats[0].contacts.length).toBeGreaterThan(0);
    expect(
      changed.seats[0].contacts.every((contact) => !contact.actualContact),
    ).toBe(true);
  }
  return { project: p, entryId: third.entryId };
}
async function load(page: Page, project: Project) {
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
      name: "synthetic-banquette-construction.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(dialog).toHaveCount(0);
  return draft(page, (actual) => actual.name.startsWith(project.name));
}
async function snapshot(page: Page) {
  const project = await draft(page);
  return {
    project,
    raw: await page.evaluate(
      (key) => localStorage.getItem(key),
      CURRENT_DRAFT_KEY,
    ),
    bom: bom(project),
  };
}
async function unchanged(
  page: Page,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(await snapshot(page)).toEqual(before);
}
async function globalReview(page: Page) {
  await page
    .locator(".statusbar")
    .getByRole("button", { name: /^Review \d+ connection plans/ })
    .click();
  const review = page.getByRole("region", {
    name: "Connection review",
    exact: true,
  });
  await expect(review).toBeVisible();
  return review.getByRole("region", {
    name: "Banquette construction",
    exact: true,
  });
}
async function chooseThird(review: Locator, entryId: string) {
  await review
    .getByRole("combobox", {
      name: "Banquette construction module",
      exact: true,
    })
    .selectOption(entryId);
  await expect(review).toHaveAttribute("data-banquette-entry-id", entryId);
}
const rowFor = (review: Locator, pair: BanquettePairReview) =>
  review.locator(
    `[data-pair-a-id='${pair.pieceIds[0]}'][data-pair-b-id='${pair.pieceIds[1]}']`,
  );
async function exposePair(review: Locator, pair: BanquettePairReview) {
  const row = rowFor(review, pair);
  for (
    let attempts = 0;
    (await row.count()) === 0 && attempts < 8;
    attempts++
  ) {
    const more = review.getByRole("button", {
      name: /^Show \d+ more frame pairs$/,
    });
    await expect(more).toHaveCount(1);
    await more.click();
  }
  await expect(row).toHaveCount(1);
  return row;
}
async function capture(page: Page, name: string, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath(name),
    fullPage: false,
    animations: "disabled",
  });
}
async function exportText(page: Page, title: string) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(`^${title}`) })
    .click();
  const file = await download,
    path = await file.path();
  if (!path) throw Error("Missing exported construction artifact");
  const text = await readFile(path, "utf8");
  await test.info().attach(file.suggestedFilename(), {
    body: Buffer.from(text),
    contentType:
      title === "Editable project" ? "application/json" : "text/markdown",
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  return text;
}
function chosenPairs(report: BanquetteConstructionReport) {
  const frames = report.pairs.filter(
    (pair) => pair.kind === "frame" && pair.state === "no-record",
  );
  const target = frames[0],
    neighbor = frames.find(
      (pair) =>
        pair.id !== target.id &&
        pair.pieceIds.some((id) => target.pieceIds.includes(id)),
    );
  expect(target).toBeTruthy();
  expect(neighbor).toBeTruthy();
  return { target, neighbor: neighbor! };
}

test("a saved screw row repeats across the three banquette modules and updates the guide and Home Depot list", async ({ page }) => {
  const verify = guard(page);
  const f = await fixture();
  const original = await load(page, f.project);
  const [first, second, third] = original.sections;
  const members = original.pieces.filter((piece) => first.pieceIds.includes(piece.id));
  const head = members.find((piece) => piece.designRole === "storage-rear")!;
  const receiver = members.find((piece) => piece.designRole === "leg")!;
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: "Plan wood-fastener locations", exact: true }).click();
  const fasteners = page.getByRole("region", { name: "Wood fastener plans", exact: true });
  await fasteners.getByRole("combobox", { name: "Fastener head-side member", exact: true }).selectOption(head.id);
  await fasteners.getByRole("combobox", { name: "Fastener receiving member", exact: true }).selectOption(receiver.id);
  await fasteners.getByRole("combobox", { name: "New screw product", exact: true }).selectOption("grk-cabinet-114069");
  await fasteners.getByText("Lay out a row along the joint", { exact: true }).click();
  await fasteners.getByRole("spinbutton", { name: "Number of row marks", exact: true }).fill("3");
  await fasteners.getByRole("spinbutton", { name: "Inset from each contact end", exact: true }).fill("2");
  await fasteners.getByRole("button", { name: "Preview screw row", exact: true }).click();
  await expect(page.getByTestId("fastener-contact-row-marker")).toHaveCount(3);
  await fasteners.getByRole("button", { name: "Use screw row", exact: true }).click();
  const before = await draft(page, (project) => project.fastenerPlans.length === 1);
  const plan = fasteners.locator(`[data-fastener-plan-id="${before.fastenerPlans[0].id}"]`);
  const title = plan.getByText("Repeat in matching modules", { exact: true });
  await title.click();
  const repeat = title.locator("..");
  await repeat.getByRole("button", { name: "Find matching joints" }).click();
  await expect(repeat.getByRole("checkbox", { name: /Banquette section [23]/ })).toHaveCount(2);
  await expect(repeat.getByRole("checkbox", { name: /Banquette section 2/ })).toBeChecked();
  await expect(repeat.getByRole("checkbox", { name: /Banquette section 3/ })).toBeChecked();
  expect((await draft(page)).fastenerPlans).toEqual(before.fastenerPlans);
  await capture(page, "repeated-banquette-screw-joints.png", repeat.getByRole("button", { name: "Copy screw marks" }));
  await repeat.getByRole("button", { name: "Copy screw marks" }).click();
  await expect(repeat.getByRole("status")).toContainText("Copied 6 screw marks across 2 joints");
  const applied = await draft(page, (project) => project.fastenerPlans.length === 3);
  expect(applied.fastenerPlans.map((row) => row.locations.length)).toEqual([3, 3, 3]);
  expect(second.pieceIds).toContain(applied.fastenerPlans[1].head.pieceId);
  expect(third.pieceIds).toContain(applied.fastenerPlans[2].head.pieceId);
  expect(applied.supplies).toEqual(before.supplies);
  await repeat.getByRole("button", { name: "Find matching joints" }).click();
  await expect(repeat.getByText(/This pair already has a screw plan/)).toHaveCount(2);
  const product = fasteners.locator('[data-fastener-product-id="grk-cabinet-114069"]');
  await expect(product).toContainText("9 included screw locations");
  await product.getByRole("button", { name: /Add missing packs/ }).click();

  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved to library", { exact: true })).toBeVisible();
  const response = await page.request.get(`/api/projects/${applied.id}`);
  expect(response.ok()).toBe(true);
  const saved = projectSchema.parse((await response.json()).project);
  expect(saved.fastenerPlans).toEqual(applied.fastenerPlans);
  expect(saved.supplies).toHaveLength(1);
  const guide = await exportText(page, "Build guide Markdown");
  expect(guide).toContain("Repeated layout from W001");
  expect(guide).toContain("9 provisional screws; 100/pack");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Prepare Home Depot list", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Home Depot paste list" })).toHaveValue(/1 .*#203556408/);
  verify();
});

test("module-three exact pair remains selected through an empty W plan, neighboring contacts stay unplanned, and derived guide exports survive reopening", async ({
  page,
}) => {
  const verify = guard(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(),
    imported = await load(page, f.project),
    before = await snapshot(page);
  let review = await globalReview(page);
  await chooseThird(review, f.entryId);
  const report = banquetteConstruction(imported).find(
      (item) => item.entryId === f.entryId,
    )!,
    { target, neighbor } = chosenPairs(report);
  const targetRow = await exposePair(review, target),
    neighborRow = await exposePair(review, neighbor);
  await expect(targetRow).toHaveAttribute("data-pair-state", "no-record");
  await expect(neighborRow).toHaveAttribute("data-pair-state", "no-record");
  await unchanged(page, before);
  await capture(page, "desktop-module-three-current-frame-pair.png", targetRow);
  const [a, b] = target.pieceIds,
    aLabel = partLabel(imported, a),
    bLabel = partLabel(imported, b);
  await targetRow
    .getByRole("button", {
      name: `Plan screws: ${aLabel} to ${bLabel}`,
      exact: true,
    })
    .click();
  const fasteners = page.getByRole("region", {
    name: "Wood fastener plans",
    exact: true,
  });
  await expect(
    fasteners.getByRole("combobox", {
      name: "Fastener head-side member",
      exact: true,
    }),
  ).toHaveValue(a);
  await expect(
    fasteners.getByRole("combobox", {
      name: "Fastener receiving member",
      exact: true,
    }),
  ).toHaveValue(b);
  await unchanged(page, before);
  await fasteners
    .getByRole("textbox", { name: "New fastener plan name", exact: true })
    .fill("SYNTHETIC exact third-module pair only");
  await fasteners
    .getByRole("button", { name: "Create fastener plan", exact: true })
    .click();
  const created = await draft(
      page,
      (p) => p.fastenerPlans.length === imported.fastenerPlans.length + 1,
    ),
    plan = created.fastenerPlans.find(
      (item) => !imported.fastenerPlans.some((old) => old.id === item.id),
    )!;
  expect(plan.locations).toEqual([]);
  expect(plan.measurements).toEqual({
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  expect([plan.head.pieceId, plan.receiver.pieceId]).toEqual([a, b]);
  const savedPlan = fasteners.locator(`[data-fastener-plan-id='${plan.id}']`);
  if (
    (await savedPlan
      .locator(".attachment-plan-select")
      .getAttribute("aria-expanded")) !== "true"
  )
    await savedPlan.locator(".attachment-plan-select").click();
  await savedPlan
    .getByRole("button", { name: "Save fastener plan", exact: true })
    .click();
  const authored = await draft(page, (p) =>
    p.fastenerPlans.some(
      (item) =>
        item.id === plan.id &&
        item.locations.length === 0 &&
        item.updatedAt !== plan.updatedAt,
    ),
  );
  for (const key of [
    "pieces",
    "sections",
    "joints",
    "supplies",
    "supplyInventory",
    "inventory",
    "toolSelections",
    "lidHingePlans",
    "hingeStockSources",
    "connectorPlans",
    "steps",
    "guideFingerprint",
  ] as const)
    expect(authored[key]).toEqual(imported[key]);
  expect(authored.ideaBindings.map((binding) => binding.id)).toEqual(
    imported.ideaBindings.map((binding) => binding.id),
  );
  for (const original of imported.ideaBindings) {
    const actual = authored.ideaBindings.find(
      (binding) => binding.id === original.id,
    )!;
    const ownedIds = new Set(
      original.entries.flatMap((entry) =>
        entry.sections.flatMap(
          (mapping) =>
            imported.sections.find(
              (section) => section.id === mapping.sectionId,
            )?.pieceIds ?? [],
        ),
      ),
    );
    if (target.pieceIds.some((id) => ownedIds.has(id))) {
      expect(actual.revision).toBe(original.revision + 1);
      expect(actual.currentFingerprint).not.toBe(original.currentFingerprint);
      expect(actual.currentFingerprint).toBe(
        currentBindingFingerprint(authored, actual),
      );
      expect({
        ...actual,
        revision: original.revision,
        currentFingerprint: original.currentFingerprint,
      }).toEqual(original);
    } else expect(actual).toEqual(original);
  }
  expect(bom(authored)).toEqual(before.bom);
  await fasteners
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  review = page.getByRole("region", {
    name: "Banquette construction",
    exact: true,
  });
  await expect(
    review.getByRole("combobox", {
      name: "Banquette construction module",
      exact: true,
    }),
  ).toHaveValue(f.entryId);
  await expect(await exposePair(review, target)).toHaveAttribute(
    "data-pair-state",
    "started",
  );
  await expect(await exposePair(review, neighbor)).toHaveAttribute(
    "data-pair-state",
    "no-record",
  );
  await rowFor(review, target)
    .getByRole("button", {
      name: `Review ${plan.label} for ${aLabel} to ${bLabel}`,
      exact: true,
    })
    .click();
  await expect(
    page.locator(
      `[data-fastener-plan-id='${plan.id}'] .attachment-plan-select`,
    ),
  ).toHaveAttribute("aria-expanded", "true");
  expect((await draft(page)).fastenerPlans.map((item) => item.id)).toEqual(
    authored.fastenerPlans.map((item) => item.id),
  );
  await page
    .getByRole("region", { name: "Wood fastener plans", exact: true })
    .getByRole("button", { name: "Back to connections", exact: true })
    .click();
  review = page.getByRole("region", {
    name: "Banquette construction",
    exact: true,
  });
  await expect(
    review.getByRole("combobox", {
      name: "Banquette construction module",
      exact: true,
    }),
  ).toHaveValue(f.entryId);
  const afterAuthoring = await snapshot(page);
  expect(afterAuthoring.project).toEqual(authored);
  await capture(
    page,
    "desktop-module-three-only-chosen-pair-started.png",
    rowFor(review, target),
  );
  const markdown = await exportText(page, "Build guide");
  expect(markdown).toContain(banquetteConstructionMarkdown(authored));
  expect(markdown).toContain(`${aLabel} ↔ ${bLabel}`);
  expect(markdown).toContain(`started; ${plan.label}: started`);
  const editable = projectSchema.parse(
    JSON.parse(await exportText(page, "Editable project")),
  );
  expect(editable).toEqual(authored);
  await page.emulateMedia({ media: "print" });
  const appendix = page.locator(
    ".print-guide .banquette-construction-appendix",
  );
  await expect(
    appendix.getByRole("heading", {
      name: "Banquette construction review",
      exact: true,
    }),
  ).toHaveCount(1);
  const moduleAppendix = appendix.locator(":scope > section").filter({
    has: page.getByRole("heading", { name: report.name, exact: true }),
  });
  const printPair = moduleAppendix
    .getByRole("row")
    .filter({ hasText: `${aLabel} ↔ ${bLabel}` });
  await expect(printPair).toHaveCount(1);
  await expect(printPair).toContainText("Plan started · no locations");
  await expect(
    moduleAppendix.getByRole("row").filter({
      hasText: neighbor.pieceIds
        .map((id) => partLabel(authored, id))
        .join(" ↔ "),
    }),
  ).toContainText("No plan for this pair");
  const printed = await page.pdf({
    path: test.info().outputPath("module-three-construction-guide.pdf"),
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(printed.subarray(0, 4).toString()).toBe("%PDF");
  await page.emulateMedia({ media: "screen" });
  await unchanged(page, afterAuthoring);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/projects/${authored.id}`);
      return (
        response.ok() &&
        JSON.stringify((await response.json()).project.fastenerPlans) ===
          JSON.stringify(authored.fastenerPlans)
      );
    })
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await page
    .locator(".project-list > button")
    .filter({ has: page.getByText(authored.name, { exact: true }) })
    .click();
  const reopened = await draft(page, (p) => p.id === authored.id);
  for (const key of [
    "pieces",
    "fastenerPlans",
    "supplies",
    "steps",
    "joints",
    "hingeStockSources",
    "connectorPlans",
  ] as const)
    expect(reopened[key]).toEqual(authored[key]);
  review = await globalReview(page);
  await chooseThird(review, f.entryId);
  await expect(await exposePair(review, target)).toHaveAttribute(
    "data-pair-state",
    "started",
  );
  await expect(await exposePair(review, neighbor)).toHaveAttribute(
    "data-pair-state",
    "no-record",
  );
  verify();
});

test("phone expanded module-three review exposes an actual seat gap and inspects its retained support without mutating the project", async ({
  page,
}) => {
  const verify = guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(true),
    imported = await load(page, f.project),
    before = await snapshot(page);
  let review = await globalReview(page);
  await chooseThird(review, f.entryId);
  await page
    .getByRole("button", { name: "Expand inspector", exact: true })
    .click();
  await expect(page.locator("#workshop-inspector")).toHaveAttribute(
    "data-inspector-focused",
    "true",
  );
  const report = banquetteConstruction(imported).find(
      (item) => item.entryId === f.entryId,
    )!,
    seat = report.seats[0],
    seatSummary = review.locator("[data-seat-state='no-bearing-contact']");
  await expect(seatSummary).toHaveCount(1);
  await expect(seatSummary).toContainText("No closed-seat contact found");
  await expect(review).toContainText("proximity is not bearing contact");
  await expect(review).toContainText(
    "Bearing adequacy and seating capacity remain unresolved",
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        [...document.querySelectorAll(".inspector-scroll")].every(
          (node) => node.scrollWidth <= node.clientWidth,
        ),
    ),
  ).toBe(true);
  await capture(page, "phone-expanded-module-three-seat-gap.png", seatSummary);
  const contacts = seatSummary.locator("details");
  if ((await contacts.getAttribute("open")) === null)
    await contacts.locator(":scope > summary").click();
  const support = seat.contacts[0],
    supportLabel = partLabel(imported, support.memberId),
    contactRow = contacts.locator(
      `[data-bearing-member-id='${support.memberId}']`,
    );
  await expect(contactRow).toHaveAttribute(
    "data-bearing-actual-contact",
    "false",
  );
  await expect(contactRow).toContainText("modeled gap");
  const inspect = contactRow.getByRole("button", {
    name: `Inspect support ${supportLabel}`,
    exact: true,
  });
  await expect(inspect).toBeVisible();
  await unchanged(page, before);
  await inspect.click();
  await expect(page.locator("#workshop-inspector")).toHaveAttribute(
    "data-inspector-focused",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Return to inspector", exact: true }),
  ).toBeVisible();
  const actualSupport = imported.pieces.find(
    (piece) => piece.id === support.memberId,
  )!;
  await expect(page.locator(".part-quick-tools strong")).toHaveText(
    actualSupport.name,
  );
  await page
    .getByRole("button", { name: "Return to inspector", exact: true })
    .click();
  review = page.getByRole("region", {
    name: "Banquette construction",
    exact: true,
  });
  await expect(review).toHaveAttribute("data-banquette-entry-id", f.entryId);
  await expect(
    review.locator("[data-seat-state='no-bearing-contact']"),
  ).toHaveCount(1);
  await unchanged(page, before);
  await capture(
    page,
    "phone-return-to-module-three-gap-findings.png",
    review.locator("[data-seat-state='no-bearing-contact']"),
  );
  await review.getByRole("button", { name: "Show seat spans in 3D" }).click();
  const marker = page.getByTestId("seat-span-marker");
  await expect(marker).toContainText(partLabel(imported, seat.pieceId!));
  await expect(marker).toHaveAttribute("data-contact-patches", "0");
  await expect(marker).toHaveAttribute("data-span-lines", "2");
  await unchanged(page, before);
  verify();
});
