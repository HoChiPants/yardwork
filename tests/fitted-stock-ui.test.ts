import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blank, part } from "../src/model";
import { ensurePartLabels, partLabel } from "../src/partLabels";
import { guidePlacementTargets } from "../src/guidePlacement";
import {
  fittedStockFaces,
  previewFittedStock,
  type FittedStockSpec,
} from "../src/fittedStock";
import {
  FittedLengthInput,
  FittedStockPanel,
  FittedStockSummary,
  FittedStockResults,
  parseFittedNumber,
} from "../src/FittedStockPanel";

const fail = () =>
  assert.fail("Rendering cannot mutate, preview, add or navigate.");
function fixture() {
  const project = blank("SYNTHETIC fitted-stock UI"),
    stepId = project.steps[0].id;
  project.pieces = [
    part(
      "First actual upright",
      "stud",
      [1.5, 24, 3.5],
      [-15.75, 12, 0],
      stepId,
      "Actual pair",
    ),
    part(
      "Second actual upright",
      "stud",
      [1.5, 24, 3.5],
      [15.75, 12, 0],
      stepId,
      "Actual pair",
    ),
  ];
  return ensurePartLabels(project);
}
function spec(project: ReturnType<typeof fixture>): FittedStockSpec {
  const first = fittedStockFaces(project, project.pieces[0].id).find(
      (face) => face.normalLocal[0] === 1,
    )!,
    second = fittedStockFaces(project, project.pieces[1].id).find(
      (face) => face.normalLocal[0] === -1,
    )!;
  return {
    first: first.ref,
    second: second.ref,
    datumLocal: [...first.centerLocal],
    material: "stud",
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: null,
    stepId: project.steps[0].id,
    name: "SYNTHETIC fitted block",
  };
}

test("opening an actual pair does not choose its faces, datum, stock, clearances or destination and cannot preview on render", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(FittedStockPanel, {
        project,
        initialPair: {
          firstId: project.pieces[0].id,
          secondId: project.pieces[1].id,
          nonce: 1,
        },
        onBack: fail,
        onPreview: fail,
        onApply: fail,
        onFacesChange: fail,
        onDirtyChange: fail,
      }),
    );
  assert.match(html, /aria-label="Fit stock between faces"/);
  assert.match(html, /P001 · First actual upright/);
  assert.match(html, /P002 · Second actual upright/);
  for (const field of [
    "Fitted first face",
    "Fitted second face",
    "Fitted stock material",
    "Fitted destination section",
  ])
    assert.ok(html.includes(`aria-label="${field}"`));
  for (const axis of ["X", "Y", "Z"])
    assert.match(
      html,
      new RegExp(`aria-label="Fitted datum ${axis}"[^>]*value=""`),
    );
  assert.match(html, /aria-label="First end clearance"[^>]*value=""/);
  assert.match(html, /aria-label="Second end clearance"[^>]*value=""/);
  assert.match(html, /Use face center/);
  assert.match(html, /Use exact modeled span · zero end clearances/);
  assert.match(html, /disabled="">Preview fitted stock/);
  assert.match(html, /disabled="">Add fitted block/);
  assert.doesNotMatch(html, /Fitted stock preview summary|fitted-stock-ghost/);
  assert.match(
    html,
    /aria-label="Fitted stock build stage"[^>]*><option value="" selected="">Automatic<\/option>/,
  );
  assert.ok(
    html.indexOf('aria-label="Fitted stock build stage"') <
      html.indexOf("Name and initial step"),
    "Build stage is visible outside the optional details.",
  );
  assert.match(html, /aria-label="Fitted stock initial step"/);
  assert.match(html, /Initial step controls the current timeline/);
  assert.doesNotMatch(html, /Existing guide step/);
  assert.equal(JSON.stringify(project), before);
});

test("stage choices use actual task identities while Automatic remains separate from the initial timeline step", () => {
  const project = fixture(),
    targets = guidePlacementTargets(project),
    before = JSON.stringify(project);
  assert.ok(targets.length > 0);
  const html = renderToStaticMarkup(
    createElement(FittedStockPanel, {
      project,
      onBack: fail,
      onPreview: fail,
      onApply: fail,
    }),
  );
  const select = html.match(
    /<select aria-label="Fitted stock build stage"[^>]*>([\s\S]*?)<\/select>/,
  )![1];
  assert.equal((select.match(/<option/g) ?? []).length, targets.length + 1);
  for (const target of targets) {
    const encoded = JSON.stringify([
      target.ownerId,
      target.stageKey,
    ]).replaceAll('"', "&quot;");
    assert.ok(select.includes(`value="${encoded}"`));
    assert.ok(select.includes(target.title));
  }
  assert.match(select, /value="" selected="">Automatic/);
  assert.equal(JSON.stringify(project), before);
});

test("face-pick wording makes the first clicked datum explicit and keeps second-face selection separate", () => {
  const project = fixture(),
    html = renderToStaticMarkup(
      createElement(FittedStockPanel, {
        project,
        initialPair: {
          firstId: project.pieces[0].id,
          secondId: project.pieces[1].id,
          nonce: 1,
        },
        onBack: fail,
        onPreview: fail,
        onApply: fail,
        onRequestFacePick: fail,
      }),
    );
  assert.match(html, /Pick first face and datum in 3D/);
  assert.match(html, /Pick second face in 3D/);
  assert.match(html, /not a fastening hole/);
});

test("clearance inputs display the full entered precision and unknown remains blank with independent unit controls", () => {
  const known = renderToStaticMarkup(
      createElement(FittedLengthInput, {
        label: "First end clearance",
        value: 0.123456789,
        onChange: fail,
        onEdit: fail,
        onPending: fail,
      }),
    ),
    unknown = renderToStaticMarkup(
      createElement(FittedLengthInput, {
        label: "Second end clearance",
        value: null,
        onChange: fail,
        onEdit: fail,
        onPending: fail,
      }),
    );
  assert.match(known, /value="0\.123456789"/);
  assert.match(known, /aria-label="First end clearance units"/);
  assert.match(unknown, /aria-label="Second end clearance"[^>]*value=""/);
  assert.doesNotMatch(unknown, /value="0"/);
});

test("incomplete numeric text stays pending instead of becoming zero or a rounded value", () => {
  for (const value of ["-", "+", ".", "1e", "1e-", "12px", "1e999"])
    assert.deepEqual(
      parseFittedNumber(value),
      { value: null, pending: true },
      value,
    );
  assert.deepEqual(parseFittedNumber(""), { value: null, pending: false });
  assert.deepEqual(parseFittedNumber("0"), { value: 0, pending: false });
  assert.deepEqual(parseFittedNumber("0.0625", 12), {
    value: 0.75,
    pending: false,
  });
  assert.deepEqual(parseFittedNumber("0.123456789"), {
    value: 0.123456789,
    pending: false,
  });
  assert.deepEqual(parseFittedNumber("-0.1"), { value: -0.1, pending: false });
});

test("a real source-backed preview summary keeps exact P/O identities, actual cut and remnant without changing the original project", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    preview = previewFittedStock(project, spec(project)),
    captured = JSON.stringify(preview),
    html = renderToStaticMarkup(createElement(FittedStockSummary, { preview })),
    block = preview.project.pieces.find(
      (piece) => piece.id === preview.blockId,
    )!,
    spare = preview.project.pieces.find(
      (piece) => piece.id === preview.offcutIds[0],
    )!;
  assert.equal(preview.span, 30);
  assert.equal(preview.cutLength, 30);
  assert.equal(preview.sourceLength, 96);
  assert.equal(preview.kerfLoss, 0.125);
  assert.ok(html.includes(partLabel(preview.project, block.id)));
  assert.ok(html.includes(partLabel(preview.project, spare.id)));
  assert.match(html, /30 in/);
  assert.match(html, /0\.125 in/);
  assert.match(html, /65\.875 in/);
  assert.match(
    html,
    /One physical source · no automatic fastener plans or purchase selections/,
  );
  assert.equal(block.cutStock?.id, spare.cutStock?.id);
  assert.equal(JSON.stringify(project), before);
  assert.equal(JSON.stringify(preview), captured);
});

test("successful results group exact candidate summary with Inspect, Add and Cancel without mutating or committing on render", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    preview = previewFittedStock(project, spec(project)),
    captured = JSON.stringify(preview);
  const html = renderToStaticMarkup(
    createElement(FittedStockResults, {
      preview,
      onInspect: fail,
      onAdd: fail,
      onCancel: fail,
    }),
  );
  assert.match(
    html,
    /^<section class="fitted-stock-results" aria-label="Fitted stock result" tabindex="-1">/,
  );
  assert.match(html, /Add fitted block/);
  assert.match(html, /Cancel/);
  assert.match(html, /Inspect fitted stock in 3D/);
  assert.ok(
    html.indexOf("Add fitted block") <
      html.indexOf('aria-label="Fitted stock preview summary"'),
    "Completion actions remain at the start of the results region.",
  );
  assert.ok(html.includes(`data-block-id="${preview.blockId}"`));
  assert.ok(html.includes(partLabel(preview.project, preview.offcutIds[0])));
  assert.match(html, /<dt>Build stage<\/dt><dd>Automatic<\/dd>/);
  assert.equal(JSON.stringify(project), before);
  assert.equal(JSON.stringify(preview), captured);
});

test("an explicit captured build-stage choice is shown beside the exact candidate while its remnant has no assignment", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    target = guidePlacementTargets(project)[0],
    choice = { ownerId: target.ownerId, stageKey: target.stageKey },
    preview = previewFittedStock(project, {
      ...spec(project),
      guidePlacement: choice,
    });
  const html = renderToStaticMarkup(
    createElement(FittedStockResults, {
      preview,
      onAdd: fail,
      onCancel: fail,
    }),
  );
  assert.ok(html.includes(`<dt>Build stage</dt><dd>${target.title}</dd>`));
  assert.deepEqual(preview.spec.guidePlacement, choice);
  assert.deepEqual(
    preview.project.pieces.find((piece) => piece.id === preview.blockId)
      ?.guidePlacement,
    choice,
  );
  for (const id of preview.offcutIds)
    assert.equal(
      preview.project.pieces.find((piece) => piece.id === id)?.guidePlacement,
      undefined,
    );
  assert.equal(JSON.stringify(project), before);
});
