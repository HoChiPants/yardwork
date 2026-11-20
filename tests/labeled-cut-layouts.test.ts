import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blank, part, projectSchema, uid } from "../src/model";
import { bom, cutPiece } from "../src/engine";
import { ensurePartLabels, partLabel } from "../src/partLabels";
import { SheetLayouts, sheetPlansMarkdown } from "../src/SheetLayouts";
import { CutStudio, makeLabeledCutPreview } from "../src/CutStudio";
import { fitLayoutLabel } from "../src/layoutLabels";

function proposedSheets() {
  const project = blank("Repeated panel names");
  project.partLabels = [{ partId: uid(), label: "P001" }];
  project.pieces = [
    part(
      "Panel",
      "plytanium-703",
      [18, 0.703, 30.25],
      [0, 0, 0],
      project.steps[0].id,
      "Panels",
    ),
    part(
      "Panel",
      "plytanium-703",
      [20.125, 0.703, 30.125],
      [40, 0, 0],
      project.steps[0].id,
      "Panels",
    ),
  ];
  return ensurePartLabels(project);
}

test("sheet SVG, legend and Markdown identify actual parts by durable labels with precise stock and offsets", () => {
  const project = proposedSheets(),
    before = structuredClone(project),
    row = bom(project)[0];
  assert.ok(row.sheets[0].placements.some((cut) => cut.x === 18.125));
  const markdown = sheetPlansMarkdown([row], project);
  assert.match(markdown, /Stock 47\.938 in × 95\.938 in/);
  assert.match(markdown, /P002 · Panel: 18 in × 30\.25 in/);
  assert.match(markdown, /P003 · Panel: 20\.125 in × 30\.125 in; X 18\.125 in/);
  const html = renderToStaticMarkup(
    createElement(SheetLayouts, { row, project, printable: true }),
  );
  for (const piece of project.pieces) {
    const label = partLabel(project, piece.id);
    assert.ok(
      html.includes(
        `data-placement-id="${piece.id}" data-part-label="${label}"`,
      ),
    );
    assert.ok(html.includes(`<title>${label} · Panel:`));
    assert.ok(html.includes(`<strong>${label}</strong> · Panel`));
    assert.ok(html.includes(`>${label}</text>`));
  }
  assert.doesNotMatch(html, /<text[^>]*>[12]<\/text>/);
  assert.ok(html.includes("20.125 in"));
  assert.deepEqual(project, before);
});

test("repacking, array reorder and duplicate names do not renumber the labeled parts", () => {
  const original = proposedSheets(),
    reordered = { ...original, pieces: [...original.pieces].reverse() };
  const before = sheetPlansMarkdown(bom(original), original),
    after = sheetPlansMarkdown(bom(reordered), reordered);
  for (const piece of original.pieces) {
    assert.equal(partLabel(reordered, piece.id), partLabel(original, piece.id));
    assert.ok(before.includes(`${partLabel(original, piece.id)} · Panel:`));
    assert.ok(after.includes(`${partLabel(original, piece.id)} · Panel:`));
  }
  assert.deepEqual(reordered.partLabels, original.partLabels);
});

test("skinny placements keep readable external labels and titles without forcing text outside their footprint", () => {
  let project = blank("Skinny sheet blank");
  project = ensurePartLabels({
    ...project,
    pieces: [
      part(
        "Thin strip",
        "plytanium-703",
        [0.75, 0.703, 60],
        [0, 0, 0],
        project.steps[0].id,
        "Panels",
      ),
    ],
  });
  const html = renderToStaticMarkup(
    createElement(SheetLayouts, { row: bom(project)[0], project }),
  );
  assert.doesNotMatch(html, /<text/);
  assert.match(html, /<title>P001 · Thin strip:/);
  assert.ok(
    html.split("</svg>")[1].includes("<strong>P001</strong> · Thin strip"),
  );
  assert.ok(html.includes('aria-label="Sheet 1 cutting layout · P001"'));
});

test("convex footprint fitting retains a readable text box only when its corners fit", () => {
  assert.deepEqual(
    fitLayoutLabel(
      [
        [0, 0],
        [260, 0],
        [260, 180],
        [0, 180],
      ],
      "P001",
      10,
    ),
    { x: 130, y: 90, fontSize: 10 },
  );
  assert.deepEqual(
    fitLayoutLabel(
      [
        [0, 180],
        [260, 180],
        [260, 0],
        [0, 0],
      ],
      "O002",
      10,
    ),
    { x: 130, y: 90, fontSize: 10 },
  );
  assert.equal(
    fitLayoutLabel(
      [
        [0, 0],
        [2, 0],
        [2, 180],
        [0, 180],
      ],
      "O002",
      10,
    ),
    null,
  );
  assert.equal(
    fitLayoutLabel(
      [
        [0, 0],
        [20, 0],
        [0, 20],
      ],
      "P001",
      10,
    ),
    null,
  );
  assert.equal(
    fitLayoutLabel(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      "P001",
      10,
    ),
    null,
  );
});

test("cut preview labels are private until applying and survive exact JSON round trip", () => {
  let project = blank("Labeled cut candidate");
  project.pieces = [
    part(
      "Exact sheet",
      "plytanium-703",
      [47.938, 0.703, 95.938],
      [0, 0, 0],
      project.steps[0].id,
      "Panels",
    ),
  ];
  project.partLabels = [{ partId: uid(), label: "O001" }];
  project = ensurePartLabels(project);
  const before = structuredClone(project),
    source = project.pieces[0];
  const preview = makeLabeledCutPreview(project, source.id, 60.125, 20.125);
  assert.equal(preview.changed, true);
  assert.equal(partLabel(preview.project, source.id), "P001");
  assert.deepEqual(
    preview.project.pieces.find((piece) => piece.id === source.id)!.size,
    [20.125, 0.703, 60.125],
  );
  assert.deepEqual(
    preview.project.pieces
      .filter((piece) => piece.offcut)
      .map((piece) => partLabel(preview.project, piece.id)),
    ["O002", "O003"],
  );
  assert.equal(bom(preview.project)[0].quantity, 1);
  assert.deepEqual(
    project,
    before,
    "canceling the candidate has no labels or physical cuts to roll back",
  );
  const another = makeLabeledCutPreview(project, source.id, 59.125, 20.125);
  assert.deepEqual(
    another.project.pieces
      .filter((piece) => piece.offcut)
      .map((piece) => partLabel(another.project, piece.id)),
    ["O002", "O003"],
  );
  assert.deepEqual(project, before);
  const reopened = projectSchema.parse(
    JSON.parse(JSON.stringify(preview.project)),
  );
  assert.deepEqual(reopened.partLabels, preview.project.partLabels);
  assert.deepEqual(reopened.pieces, preview.project.pieces);
  assert.deepEqual(makeLabeledCutPreview(project, source.id, 95.938, 47.938), {
    project,
    changed: false,
  });
});

test("initial CutStudio labels and dimensions are precise without treating label preparation as a physical cut", () => {
  const project = blank("Unlabeled legacy preview");
  project.pieces = [
    part(
      "Exact sheet",
      "plytanium-703",
      [47.938, 0.703, 95.938],
      [0, 0, 0],
      project.steps[0].id,
      "Panels",
    ),
  ];
  const before = structuredClone(project);
  const html = renderToStaticMarkup(
    createElement(CutStudio, {
      project,
      pieceId: project.pieces[0].id,
      onApply: () => assert.fail("render cannot apply cuts"),
      onClose: () => {},
    }),
  );
  assert.match(html, /Cut P001 · Exact sheet/);
  assert.match(html, /47\.938 in stock width/);
  assert.match(html, /Thickness stays 0\.703 in/);
  assert.match(html, /aria-label="Retained piece and offcut preview"/);
  assert.match(html, /<desc[^>]*>Retained piece P001 · no new offcuts/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>[\s\S]*?Apply cuts<\/button>/,
  );
  assert.deepEqual(project, before);
});

test("physical cut-source reservations and offcuts do not become a proposed sheet placement", () => {
  let project = blank("Separate physical stock");
  project.pieces = [
    part(
      "Physical source",
      "plytanium-703",
      [47.938, 0.703, 95.938],
      [0, 0, 0],
      project.steps[0].id,
      "Panels",
    ),
  ];
  project = cutPiece(ensurePartLabels(project), project.pieces[0].id, 30, 2);
  const newBlank = part(
    "New proposed blank",
    "plytanium-703",
    [20.125, 0.703, 30.125],
    [80, 0, 0],
    project.steps[0].id,
    "Panels",
  );
  project = ensurePartLabels({
    ...project,
    pieces: [...project.pieces, newBlank],
  });
  const row = bom(project)[0];
  assert.equal(row.quantity, 2);
  assert.deepEqual(
    row.sheets.flatMap((sheet) => sheet.placements.map((cut) => cut.id)),
    [newBlank.id],
  );
  const markdown = sheetPlansMarkdown([row], project);
  assert.ok(
    markdown.includes(
      `${partLabel(project, newBlank.id)} · New proposed blank`,
    ),
  );
  assert.doesNotMatch(markdown, /- P001 · Physical source|- O001/);
  assert.ok(
    project.pieces
      .filter((piece) => piece.offcut)
      .every((piece) => piece.cutStock !== null),
  );
});
