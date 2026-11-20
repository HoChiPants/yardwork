import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBuildStudy } from "../src/buildFixtures";
import { projectSchema, type Project, type V3 } from "../src/model";
import {
  makeHingeStockSource,
  makeHingeStockCut,
  reviewHingeStock,
  updateHingeStockSource,
} from "../src/hingeStock";
import {
  makeLidHingePlan,
  saveLidHingePlan,
  addHingeLocation,
  allocateHingeStock,
  saveHingeStockSource,
  lidHingeReviews,
} from "../src/hinges";
import {
  hingeGuideMarkdown,
  hingeGuideText,
  hingePreparationNotes,
} from "../src/hingeGuide";
import { hingeScheduleCsv } from "../src/hingeCsv";
import {
  generateBuildGuide,
  guideIsCurrent,
  designFingerprint,
} from "../src/guide";
import { toolChecklist } from "../src/tools";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";

const date = "2026-11-16T18:00:00Z",
  basis = "SYNTHETIC test measurements, not manufacturer dimensions";
function fixture() {
  // Isolate one explicitly populated plan from the study's three pending starters.
  let p: Project = {
    ...createBuildStudy("storage-banquette").project,
    lidHingePlans: [],
    hingeStockSources: [],
    hingePlanLabels: [],
  };
  const section = p.sections[0],
    moving = p.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
    )!,
    fixed = p.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) &&
        piece.designRole === "storage-rear",
    )!;
  const cut = {
      ...makeHingeStockCut(),
      position: 22.75,
      kerf: 0.0625,
      basis,
      measuredAt: date,
    },
    source = {
      ...makeHingeStockSource(),
      usableLength: 48,
      basis,
      measuredAt: date,
      cuts: [cut],
    };
  p = saveHingeStockSource(p, source);
  let plan = allocateHingeStock(
    p,
    makeLidHingePlan(p, section.id, moving.id, fixed.id),
    source.id,
    reviewHingeStock(source).segments[0].id,
  );
  const ma: V3 = [-11.375, 0, -12],
    mb: V3 = [11.375, 0, -12],
    fixedPoint = (point: V3) =>
      point.map((v, i) => v + moving.position[i] - fixed.position[i]) as V3;
  plan.axis = {
    movingA: ma,
    movingB: mb,
    fixedA: fixedPoint(ma),
    fixedB: fixedPoint(mb),
    basis,
    measuredAt: date,
  };
  plan.hardware = {
    description: "Synthetic observed supplied hinge screws",
    drive: "Synthetic screwdriver fit",
    suppliedCount: 4,
    included: true,
    leafThickness: 0.04,
    basis,
    measuredAt: date,
  };
  for (const leaf of ["moving", "moving", "fixed", "fixed"] as const)
    plan = addHingeLocation(plan, leaf);
  plan.locations = plan.locations.map((location, index) => ({
    ...location,
    entranceLocal: [
      index % 2 ? 8 : -8,
      location.leaf === "moving" ? 0 : 7.8,
      location.leaf === "moving" ? -12 : -fixed.size[2] / 2,
    ],
    driveLocal: [0, 0, 1],
    measurements: {
      surfaceToTipDepth: 0.432123,
      pilotDiameter: 0.0625,
      pilotDepth: 0.321987,
      basis,
      measuredAt: date,
    },
  }));
  p = saveLidHingePlan(p, plan);
  assert.equal(
    lidHingeReviews(p)[0].state,
    "geometry-reviewed",
    JSON.stringify(lidHingeReviews(p)[0].issues),
  );
  return {
    p,
    planId: plan.id,
    fixedId: fixed.id,
    movingId: moving.id,
    sectionId: section.id,
    sourceId: source.id,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quote = !quote;
    } else if (!quote && c === ",") {
      row.push(value);
      value = "";
    } else if (!quote && (c === "\r" || c === "\n")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  return rows;
}

test("actual archived format6 with empty hinge feature keeps its exact design-v3 guide hash", () => {
  const file = new URL(
      "./fixtures/format6-remapped-storage.yardwork.json",
      import.meta.url,
    ),
    raw = readFileSync(file),
    old = JSON.parse(raw.toString());
  const p = projectSchema.parse(old.project ?? old);
  assert.equal(p.lidHingePlans.length, 0);
  assert.equal(p.hingeStockSources.length, 0);
  assert.equal(designFingerprint(p), p.guideFingerprint);
  assert.equal(guideIsCurrent(p), true);
  assert.equal(hingeGuideMarkdown(p), "");
  assert.equal(hingeGuideText(p), "");
  assert.deepEqual(readFileSync(file), raw);
});

test("stable hinge prep follows carcass shell and precedes its actual lid; custom note/check/history survive regeneration", () => {
  const { p, planId, movingId, fixedId } = fixture();
  let guide = generateBuildGuide(p),
    phase = guide.steps.find(
      (step) => step.generated?.kind === "lid-hinge-preparation",
    )!;
  const prepIndex = guide.steps.indexOf(phase),
    movingIndex = guide.steps.findIndex(
      (step) =>
        step.id === guide.pieces.find((piece) => piece.id === movingId)!.stepId,
    ),
    fixedIndex = guide.steps.findIndex(
      (step) =>
        step.id === guide.pieces.find((piece) => piece.id === fixedId)!.stepId,
    );
  assert.ok(fixedIndex < prepIndex && prepIndex < movingIndex);
  assert.equal(phase.generated?.planId, planId);
  assert.match(phase.notes, /H001/);
  assert.ok(phase.notes.length <= 4500);
  phase.notes += "\nKeep the upholstery clearance.";
  phase.complete = true;
  guide.history.push({
    id: crypto.randomUUID(),
    at: date,
    stepId: phase.id,
    message: "Synthetic actual datum check",
  });
  const before = JSON.stringify(guide),
    again = generateBuildGuide(guide),
    retained = again.steps.find((step) => step.id === phase.id)!;
  assert.equal(JSON.stringify(guide), before);
  assert.equal(retained.complete, true);
  assert.equal(again.history.at(-1)!.stepId, phase.id);
  assert.equal(
    again.steps.filter(
      (step) => step.generated?.kind === "lid-hinge-preparation",
    ).length,
    1,
  );
  assert.equal(
    retained.notes.match(/Keep the upholstery clearance/g)?.length,
    1,
  );
  assert.equal(guideIsCurrent(again), true);
});

test("active datums reset only affected assembly checks; notes/times/history do not enter the physical fingerprint", () => {
  const { p, fixedId } = fixture();
  const guide = generateBuildGuide(p);
  guide.steps.forEach((step) => {
    step.complete = true;
  });
  const same = structuredClone(guide),
    fp = designFingerprint(same);
  same.lidHingePlans[0].updatedAt = date;
  same.lidHingePlans[0].nextLocationNumber++;
  same.lidHingePlans[0].notes = "Metadata only";
  same.hingeStockSources[0] = updateHingeStockSource(
    same.hingeStockSources[0],
    { notes: "Source-note history only" },
    "Synthetic metadata update",
    date,
  );
  assert.equal(designFingerprint(same), fp);
  assert.equal(guideIsCurrent(same), true);
  const changed = structuredClone(guide);
  changed.pieces.find((piece) => piece.id === fixedId)!.size[0] -= 0.125;
  assert.equal(guideIsCurrent(changed), false);
  const next = generateBuildGuide(changed),
    owner = guide.steps.find(
      (step) =>
        step.generated?.kind === "assembly-stage" &&
        step.generated.memberIds.includes(fixedId),
    )!.generated!.planId;
  for (const step of next.steps.filter(
    (step) => step.generated?.kind === "assembly-stage",
  ))
    assert.equal(step.complete, step.generated!.planId !== owner);
  assert.equal(
    next.steps.find((step) => step.generated?.kind === "lid-hinge-preparation")!
      .complete,
    false,
  );
});

test("guide and CSV trace actual H/L holes, paired axes, user provenance, cut kerf and remnant without extra purchases", () => {
  const { p } = fixture(),
    before = JSON.stringify(p),
    text = hingeGuideText(p),
    csv = hingeScheduleCsv(p),
    rows = parseCsv(csv),
    headers = rows[0];
  assert.match(text, /H001\/L001/);
  assert.match(text, /0\.43212/);
  assert.match(text, /SYNTHETIC test measurements/);
  assert.match(text, /unallocated remnant/);
  assert.match(text, /0\.0625/);
  assert.match(
    text,
    /1 provisional physical sources; 0 manual hinge units selected/,
  );
  assert.ok(rows.every((row) => row.length === headers.length));
  const type = headers.indexOf("Record type"),
    label = headers.indexOf("Location label");
  assert.equal(rows.filter((row) => row[type] === "hole").length, 4);
  assert.equal(rows.find((row) => row[type] === "hole")![label], "H001/L001");
  assert.equal(rows.filter((row) => row[type] === "hinge-segment").length, 2);
  assert.equal(rows.filter((row) => row[type] === "hinge-cut").length, 1);
  assert.equal(JSON.stringify(p), before);
});

test("stale and globally conflicting plans withhold every active drilling and axis numeric column", () => {
  for (const kind of ["stale", "conflict"] as const) {
    const { p, fixedId } = fixture();
    if (kind === "stale")
      p.pieces.find((piece) => piece.id === fixedId)!.size[0] -= 0.125;
    else p.lidHingePlans[0].locations[0].entranceLocal = [100, 0, -12];
    assert.equal(lidHingeReviews(p)[0].state, kind);
    const text = hingeGuideText(p),
      rows = parseCsv(hingeScheduleCsv(p)),
      headers = rows[0],
      type = headers.indexOf("Record type");
    assert.ok(!text.includes("0.43212"));
    assert.ok(!text.includes("0.32199"));
    assert.match(text, /withheld/);
    for (const row of rows.filter((row) => row[type] === "hole"))
      headers.forEach((header, index) => {
        if (
          /^(Entrance |Drive |Seated tip |Pilot tip |Moving axis |Fixed axis |Entered |Deepest pilot|Available retained)/.test(
            header,
          )
        )
          assert.equal(row[index], "", header);
      });
    assert.ok(
      hingePreparationNotes(p, p.lidHingePlans[0].id).includes(
        "0 candidate transferred holes",
      ),
    );
  }
});

test("CSV escapes notes/formulas and Markdown user text cannot create headings or links", () => {
  const { p } = fixture();
  p.lidHingePlans[0].name = "=SUM(1,2)";
  p.lidHingePlans[0].notes =
    'quote " and comma,\n# heading [click](https://unsafe.invalid)';
  const rows = parseCsv(hingeScheduleCsv(p)),
    headers = rows[0],
    hole = rows[1];
  assert.equal(hole[headers.indexOf("Plan name")], "'=SUM(1,2)");
  assert.equal(hole[headers.indexOf("Notes")], p.lidHingePlans[0].notes);
  const md = hingeGuideMarkdown(p);
  assert.ok(md.includes("\\# heading \\[click\\]"));
  assert.ok(!md.includes("\n# heading"));
});

test("CSV retains the exact finite precision of entered coordinates", () => {
  const { p } = fixture();
  p.lidHingePlans[0].locations[0].entranceLocal![0] = -8.123456789;
  const activeRows = parseCsv(hingeScheduleCsv(p));
  assert.equal(
    activeRows[1][activeRows[0].indexOf("Entrance local X (in)")],
    "-8.123456789",
  );
  assert.equal(
    activeRows[1][activeRows[0].indexOf("Entered surface-to-tip depth (in)")],
    "0.432123",
  );
  p.hingeStockSources[0].cuts[0].position = 20.123456789;
  // The plan is now stale, but the separate current cut record must preserve its entered precision.
  const rows = parseCsv(hingeScheduleCsv(p)),
    headers = rows[0],
    cut = rows.find((row) => row[0] === "hinge-cut")!;
  assert.equal(cut[headers.indexOf("Kerf start (in)")], "20.123456789");
  assert.equal(
    Number(cut[headers.indexOf("Kerf start (in)")]),
    p.hingeStockSources[0].cuts[0].position,
  );
});

test("hinge metal cuts/deburring remain unknown with wood-only saw and jig evidence; drilling traces chosen H/L intent", () => {
  const { p } = fixture();
  p.toolSelections = ["dewalt-dwe575sb", "dewalt-dcd771c2"].map(
    (productId) => ({ productId, checkedAt: new Date().toISOString() }),
  );
  const selected = selectedToolsForProject(p),
    checklist = toolChecklist(p, selected.tools),
    metal = checklist.requirements.find(
      (row) => row.capability === "metal-cut",
    )!,
    deburr = checklist.requirements.find(
      (row) => row.capability === "metal-deburr",
    )!;
  assert.equal(metal.status, "unknown");
  assert.equal(deburr.status, "unknown");
  assert.ok(metal.sources.some((source) => source.kind === "hinge-stock"));
  assert.ok(
    checklist.requirements
      .find((row) => row.capability === "drill-pilot")!
      .sources.some((source) => source.kind === "hinge-plan"),
  );
  assert.match(toolGuideMarkdown(p), /H001/);
  assert.equal(p.supplies.length, 0);
});
