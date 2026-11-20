import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blank, part } from "../src/model";
import { ensurePartLabels } from "../src/partLabels";
import {
  makeConnectorPlan,
  refreshConnectorPlan,
  saveConnectorPlan,
} from "../src/connectors";
import {
  ConnectorDimensionGuide,
  ConnectorLengthInput,
  ConnectorPurchaseComparison,
  ConnectorsPanel,
  parseConnectorLengthInput,
  reviewConnectorDraft,
} from "../src/ConnectorsPanel";
import { ConnectorMarkers } from "../src/ConnectorMarkers";

function fixture() {
  let project = blank("SYNTHETIC connector editor");
  const stepId = project.steps[0].id;
  project.pieces = [
    part(
      "Base board",
      "stud",
      [24, 1.5, 3.5],
      [0, 0.75, 0],
      stepId,
      "Actual joint",
    ),
    part(
      "Post board",
      "stud",
      [1.5, 18, 3.5],
      [8, 10.5, 0],
      stepId,
      "Actual joint",
    ),
    part(
      "Unrelated sheet",
      "plywood",
      [12, 12, 0.75],
      [25, 6, 0],
      stepId,
      "Other",
    ),
  ];
  project = ensurePartLabels(project);
  return project;
}
const fail = () => assert.fail("Rendering is read-only");

test("connector creation offers actual linear wood and leaves member choice explicit without adding a plan", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(ConnectorsPanel, { project, onChange: fail, onBack: fail }),
    );
  assert.match(html, /aria-label="A21Z connector plans"/);
  assert.match(html, /P001 · Base board/);
  assert.match(html, /P002 · Post board/);
  assert.doesNotMatch(html, /P003 · Unrelated sheet/);
  assert.match(html, /Choose actual wood member/);
  assert.match(html, /Create connector draft/);
  assert.doesNotMatch(
    html,
    /Connector entry E001|data-testid="connector-entry-marker"/,
  );
  assert.equal(JSON.stringify(project), before);
});

test("one selected C plan has four quantity slots with unknown coordinates, directions, depths and dates", () => {
  let project = fixture();
  const plan = makeConnectorPlan(
    project,
    project.pieces[0].id,
    project.pieces[1].id,
  );
  project = saveConnectorPlan(project, plan);
  const before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(ConnectorsPanel, {
        project,
        selectedPlanId: plan.id,
        onChange: fail,
        onBack: fail,
        onPreview: fail,
      }),
    );
  assert.equal(
    (html.match(/aria-label="Connector entry E\d{3}"/g) ?? []).length,
    4,
  );
  for (const field of [
    "E001 wood entry X",
    "E001 inward direction X",
    "E001 wood-entry-to-tip depth",
    "E001 pilot diameter",
    "E001 deepest pilot-drill-tip depth",
    "E001 measurement date",
  ])
    assert.ok(html.includes(`aria-label="${field}"`), field);
  assert.match(html, /aria-label="E001 wood-entry-to-tip depth"[^>]*value=""/);
  assert.match(html, /aria-label="E001 measurement date"[^>]*value=""/);
  assert.match(
    html,
    /Four quantity slots; no manufactured hole centers or installed holes/,
  );
  assert.match(html, /Mounting fit remains pending/);
  assert.match(html, /aria-label="Connector entry E001"[^>]*open=""/);
  assert.doesNotMatch(html, /aria-label="Connector entry E002"[^>]*open=""/);
  assert.equal(JSON.stringify(project), before);
});

test("nominal named dimensions are a sourced schematic and never an exact manufactured envelope or hole pattern", () => {
  const html = renderToStaticMarkup(createElement(ConnectorDimensionGuide));
  assert.match(html, /W1 2 inches, W2 1.5 inches, L 1.375 inches/);
  assert.match(html, /not a scale drawing or installed envelope/);
  assert.match(html, /https:\/\/www.strongtie.com\//);
  assert.doesNotMatch(html, /<circle|<polygon|<image/);
});

test("nullable measurement display preserves exact canonical precision and unknown stays blank rather than nominal length", () => {
  const measured = renderToStaticMarkup(
      createElement(ConnectorLengthInput, {
        label: "Exact user depth",
        value: 0.123456789,
        onChange: fail,
      }),
    ),
    unknown = renderToStaticMarkup(
      createElement(ConnectorLengthInput, {
        label: "Unknown user depth",
        value: null,
        onChange: fail,
      }),
    );
  assert.match(measured, /value="0.123456789"/);
  assert.match(unknown, /placeholder="Unknown" value=""/);
  assert.doesNotMatch(unknown, /value="1\.5"/);
});

test("purchase comparison budgets a complete schedule provisionally while leaving manual selections and geometry untouched", () => {
  let project = fixture();
  project = saveConnectorPlan(
    project,
    makeConnectorPlan(project, project.pieces[0].id, project.pieces[1].id, {
      scheduleId: "n10dhdg",
    }),
  );
  const before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(ConnectorPurchaseComparison, { project }),
    );
  assert.match(html, /1 reference units · 1 per purchase pack/);
  assert.match(html, /4 reference units · 120 per purchase pack/);
  assert.match(
    html,
    /Required packs: 1 · Selected packs: 0 · Missing packs: 1/,
  );
  assert.match(html, /Only your manual supply selections create purchase rows/);
  assert.equal(project.supplies.length, 0);
  assert.equal(JSON.stringify(project), before);
});

test("changed same-ID refresh renders current unknown fields and retains exact earlier user measurements in historical disclosure", () => {
  let project = fixture(),
    plan = makeConnectorPlan(
      project,
      project.pieces[0].id,
      project.pieces[1].id,
    );
  plan.entries[0].entranceLocal = [0, 0.75, 0];
  plan.entries[0].driveLocal = [0, -1, 0];
  plan.entries[0].measurements = {
    woodEntryToTipDepth: 1.123456789,
    pilotDiameter: 0.1037,
    pilotDepth: 1.0169,
    basis: "SYNTHETIC earlier user evidence",
    measuredAt: "2026-11-17T10:00:00.000Z",
  };
  project = saveConnectorPlan(project, plan);
  const changed = {
    ...project,
    pieces: project.pieces.map((piece, i) =>
      i === 0
        ? { ...piece, size: [22, 1.5, 3.5] as [number, number, number] }
        : piece,
    ),
  };
  plan = refreshConnectorPlan(changed, project.connectorPlans[0]);
  const refreshed = saveConnectorPlan(changed, plan),
    before = JSON.stringify(refreshed),
    html = renderToStaticMarkup(
      createElement(ConnectorsPanel, {
        project: refreshed,
        selectedPlanId: plan.id,
        onChange: fail,
        onBack: fail,
      }),
    );
  assert.match(html, /Earlier reference records · 1/);
  assert.match(html, /SYNTHETIC earlier user evidence/);
  assert.equal(
    plan.referenceHistory[0].previous.entries[0].measurements
      .woodEntryToTipDepth,
    1.123456789,
  );
  assert.match(html, /1\.12346 in/);
  assert.match(html, /aria-label="E001 wood-entry-to-tip depth"[^>]*value=""/);
  assert.match(html, /Historical events retained across Undo/);
  assert.equal(JSON.stringify(refreshed), before);
});

test("transient connector review rejects invalid depth and pilot values before producing a path or purchase preview and preserves the raw draft", () => {
  const project = fixture(),
    plan = makeConnectorPlan(
      project,
      project.pieces[0].id,
      project.pieces[1].id,
    );
  plan.entries[0].entranceLocal = [0, 0.75, 0];
  plan.entries[0].driveLocal = [0, -1, 0];
  plan.entries[0].measurements = {
    woodEntryToTipDepth: 1.125,
    pilotDiameter: 0.1,
    pilotDepth: 0.5,
    basis: "SYNTHETIC existing valid user basis",
    measuredAt: "2026-11-16T10:00:00.000Z",
  };
  const savedBefore = JSON.stringify(project),
    original = structuredClone(plan);
  assert.equal(
    reviewConnectorDraft(project, plan).review?.entries[0].state,
    "path-reviewed",
  );
  for (const field of [
    "woodEntryToTipDepth",
    "pilotDiameter",
    "pilotDepth",
  ] as const) {
    for (const value of [-1, 0, 12.0001, NaN, Infinity]) {
      const invalid = structuredClone(original);
      invalid.entries[0].measurements[field] = value;
      const before = structuredClone(invalid),
        result = reviewConnectorDraft(project, invalid);
      assert.equal(
        result.review,
        undefined,
        `${field}=${value} cannot produce candidate paths or reference budget`,
      );
      assert.match(result.error ?? "", /E001/);
      assert.deepEqual(
        invalid,
        before,
        "Invalid inputs stay in the unsaved draft for correction",
      );
    }
  }
  assert.equal(
    JSON.stringify(project),
    savedBefore,
    "Saved/exported data is never changed by draft validation",
  );
  assert.deepEqual(plan, original);
});

test("partial length strings stay pending, empty is unknown and positive/negative/zero input is never rounded or silently cleared", () => {
  for (const text of ["-", "+", ".", "1e", "1e-", "--1", "12px", "1e999"])
    assert.deepEqual(
      parseConnectorLengthInput(text),
      { value: null, pending: true },
      text,
    );
  assert.deepEqual(parseConnectorLengthInput(""), {
    value: null,
    pending: false,
  });
  assert.deepEqual(
    parseConnectorLengthInput("", 1, true),
    { value: null, pending: true },
    "Native number badInput does not become ordinary unknown",
  );
  assert.deepEqual(parseConnectorLengthInput("-0.25"), {
    value: -0.25,
    pending: false,
  });
  assert.deepEqual(parseConnectorLengthInput("0"), {
    value: 0,
    pending: false,
  });
  assert.deepEqual(parseConnectorLengthInput("13"), {
    value: 13,
    pending: false,
  });
  assert.deepEqual(parseConnectorLengthInput("0.0625", 12), {
    value: 0.75,
    pending: false,
  });
  assert.deepEqual(parseConnectorLengthInput("0.123456789"), {
    value: 0.123456789,
    pending: false,
  });
});

test("pending numeric or coordinate text suppresses the whole transient review until completed or explicitly cleared", () => {
  const project = fixture(),
    plan = makeConnectorPlan(
      project,
      project.pieces[0].id,
      project.pieces[1].id,
    ),
    before = JSON.stringify({ project, plan });
  for (const field of [
    "woodEntryToTipDepth",
    "pilotDiameter",
    "pilotDepth",
    "entry",
    "drive",
  ]) {
    const result = reviewConnectorDraft(project, plan, [
      `${plan.entries[0].id}/${field}`,
    ]);
    assert.equal(result.review, undefined);
    assert.match(result.error ?? "", /Finish E001 .*or clear it/);
  }
  assert.ok(reviewConnectorDraft(project, plan).review);
  assert.equal(JSON.stringify({ project, plan }), before);
});

test("an explicitly cleared editor preview never falls back to a saved valid connector tip", () => {
  let project = fixture();
  const plan = makeConnectorPlan(
    project,
    project.pieces[0].id,
    project.pieces[1].id,
  );
  plan.entries[0].entranceLocal = [0, 0.75, 0];
  plan.entries[0].driveLocal = [0, -1, 0];
  plan.entries[0].measurements = {
    woodEntryToTipDepth: 1.125,
    pilotDiameter: 0.1,
    pilotDepth: 0.5,
    basis: "SYNTHETIC valid saved user basis",
    measuredAt: "2026-11-16T10:00:00.000Z",
  };
  project = saveConnectorPlan(project, plan);
  const before = JSON.stringify(project);
  assert.deepEqual(
    reviewConnectorDraft(project, project.connectorPlans[0]).review?.entries[0]
      .tipWorld,
    [0, 0.375, 0],
  );
  const html = renderToStaticMarkup(
    createElement(ConnectorMarkers, {
      project,
      selectedPlanId: plan.id,
      review: null,
    }),
  );
  assert.equal(
    html,
    "",
    "Explicit null hides all markers instead of falling back to the saved valid tip",
  );
  assert.equal(JSON.stringify(project), before);
});
