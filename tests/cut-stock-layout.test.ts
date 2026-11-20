import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  blank,
  part,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../src/model";
import { bom, cutPiece, inspectCutStock } from "../src/engine";
import { resizeByCuts } from "../src/cutPlan";
import { endCutPlane } from "../src/cutProfiles";
import { ensurePartLabels } from "../src/partLabels";
import { cutStockLayout, cutStockLayoutMarkdown } from "../src/cutStockLayout";
import { CutStockLayout } from "../src/CutStockLayoutView";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const sourceId = "42f8a8d6-db4e-4a2b-a4cc-280839ec8c00";
const fail = () =>
  assert.fail("Rendering a recorded layout must not select or mutate a part.");

/** Exact saved P043/O001 source facts from the qualified fitted blocking fixture. */
function pinnedSource(): Project {
  const project = blank("SYNTHETIC recorded 96-inch fitted source");
  const kept = part(
    "SYNTHETIC front-leg fitted blocking",
    "hd-pine-1x4",
    [0.75, 19.593999999999998, 3.5],
    [-24, 7.250000000000001, 9.547],
    project.steps[0].id,
    "Banquette section 1",
    [-Math.PI / 2, 0, -Math.PI / 2],
  );
  kept.id = "b2a4b3d4-1e64-4fba-bb90-16ffcc561a99";
  kept.stockLengthAxis = 1;
  kept.cutStock = { id: sourceId, size: [0.75, 96, 3.5], offset: [0, 0, 0] };
  const offcut = part(
    "Offcut · SYNTHETIC front-leg fitted blocking",
    "hd-pine-1x4",
    [0.75, 76.281, 3.5],
    [24.0625, 7.250000000000001, 9.547],
    project.steps[0].id,
    "Banquette section 1",
    [-Math.PI / 2, 0, -Math.PI / 2],
  );
  offcut.id = "b4a151fe-aeee-4082-9eab-532197716717";
  offcut.offcut = true;
  offcut.stockLengthAxis = 1;
  offcut.cutStock = {
    id: sourceId,
    size: [0.75, 96, 3.5],
    offset: [0, 19.718999999999998, 0],
  };
  project.pieces = [kept, offcut];
  project.partLabels = [
    { partId: kept.id, label: "P043" },
    { partId: offcut.id, label: "O001" },
  ];
  return projectSchema.parse(project);
}

function originalSheet(size: V3 = [48, 0.75, 96]) {
  const project = blank("SYNTHETIC source-local sheet");
  const sheet = part(
    "Actual sheet",
    "plywood",
    size,
    [100, 30, -80],
    project.steps[0].id,
    "Panels",
    [0.2, 0.7, 0.3],
  );
  project.pieces = [sheet];
  return { project, sheet };
}

test("the actual P043/O001 record shows 19.594 kept, a .125 unretained band and 76.281 offcut on one 96-inch source", () => {
  const project = pinnedSource(),
    before = JSON.stringify(project),
    beforeBom = bom(project),
    inspection = inspectCutStock(project);
  const layout = cutStockLayout(project, sourceId, inspection);
  assert.equal(layout.state, "planar");
  assert.deepEqual(layout.sourceSize, [0.75, 96, 3.5]);
  assert.deepEqual(layout.axes, { length: 1, width: 2, thickness: 0 });
  assert.equal(layout.width, 3.5);
  assert.equal(layout.length, 96);
  assert.equal(layout.thickness, 0.75);
  assert.deepEqual(
    layout.regions.map((region) => [region.label, region.offcut]),
    [
      ["P043", false],
      ["O001", true],
    ],
  );
  near(layout.regions[0].length, 19.594);
  near(layout.regions[1].y, 19.719);
  near(layout.regions[1].length, 76.281);
  near(layout.regions[1].y + layout.regions[1].length, 96);
  assert.equal(layout.gapsComplete, true);
  assert.equal(layout.gaps.length, 1);
  near(layout.gaps[0].x, 0);
  near(layout.gaps[0].y, 19.594);
  near(layout.gaps[0].width, 3.5);
  near(layout.gaps[0].length, 0.125);
  assert.equal(beforeBom.find((row) => row.id === "hd-pine-1x4")!.quantity, 1);
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(bom(project), beforeBom);
});

test("multiple physical length cuts preserve every actual blank and two separate unretained intervals", () => {
  const project = blank(),
    board = part(
      "SYNTHETIC 96-inch board",
      "stud",
      [1.5, 96, 3.5],
      [0, 48, 0],
      project.steps[0].id,
      "Frame",
    );
  project.pieces = [board];
  const once = cutPiece(project, board.id, 60, 1),
    twice = cutPiece(once, board.id, 24, 1),
    before = JSON.stringify(twice);
  const layout = cutStockLayout(twice, twice.pieces[0].cutStock!.id);
  assert.equal(layout.state, "planar");
  assert.equal(layout.regions.length, 3);
  assert.equal(layout.gaps.length, 2);
  assert.deepEqual(
    layout.regions.map((r) => r.y),
    [0, 24.125, 60.125],
  );
  assert.deepEqual(
    layout.gaps.map((r) => [r.y, r.length]),
    [
      [24, 0.125],
      [60, 0.125],
    ],
  );
  assert.equal(bom(twice).find((row) => row.id === "stud")!.quantity, 1);
  assert.equal(JSON.stringify(twice), before);
});

test("two-axis plywood cuts show saved source positions and a complete non-overlapping blank complement", () => {
  const { project, sheet } = originalSheet(),
    cut = resizeByCuts(project, sheet.id, 60, 24);
  const layout = cutStockLayout(cut, cut.pieces[0].cutStock!.id),
    area = (r: { width: number; length: number }) => r.width * r.length;
  assert.equal(layout.state, "planar");
  assert.deepEqual(layout.axes, { length: 2, width: 0, thickness: 1 });
  assert.equal(layout.regions.length, 3);
  assert.equal(layout.regions.filter((r) => r.offcut).length, 2);
  near(
    layout.regions.reduce((sum, r) => sum + area(r), 0) +
      layout.gaps.reduce((sum, r) => sum + area(r), 0),
    48 * 96,
  );
  near(
    layout.gaps.reduce((sum, r) => sum + area(r), 0),
    0.125 * (48 + 60),
  );
  for (const gap of layout.gaps) {
    assert.ok(
      gap.x >= 0 &&
        gap.y >= 0 &&
        gap.x + gap.width <= 48 &&
        gap.y + gap.length <= 96,
    );
    for (const region of layout.regions)
      assert.ok(
        gap.x + gap.width <= region.x ||
          region.x + region.width <= gap.x ||
          gap.y + gap.length <= region.y ||
          region.y + region.length <= gap.y,
      );
  }
  assert.equal(bom(cut).find((row) => row.id === "plywood")!.quantity, 1);
});

test("arbitrary current assembly poses never move source-local reservations", () => {
  const project = pinnedSource(),
    before = cutStockLayout(project, sourceId),
    moved = structuredClone(project);
  moved.pieces.forEach((piece, i) => {
    piece.position = [i * 43 + 50, -12, 83];
    piece.rotation = [0.19 + i, 0.47, 0.83 - i];
  });
  assert.deepEqual(cutStockLayout(moved, sourceId), before);
});

test("explicit original stock direction is retained even when source width is longer than source length", () => {
  const { project, sheet } = originalSheet([30, 0.75, 48]);
  sheet.stockLengthAxis = 0;
  const cut = cutPiece(project, sheet.id, 10, 0),
    layout = cutStockLayout(cut, cut.pieces[0].cutStock!.id);
  assert.equal(layout.state, "planar");
  assert.deepEqual(layout.axes, { length: 0, width: 2, thickness: 1 });
  assert.equal(layout.length, 30);
  assert.equal(layout.width, 48);
  near(layout.gaps[0].y, 10);
  near(layout.gaps[0].length, 0.125);
});

test("profiled retained geometry stays an identified blank reservation and does not become a fabricated gap", () => {
  const project = pinnedSource();
  project.pieces[0].cutPlanes = [
    endCutPlane(project.pieces[0].size, 1, true, 30, 2),
  ];
  const layout = cutStockLayout(project, sourceId),
    html = renderToStaticMarkup(
      createElement(CutStockLayout, { project, sourceId, onSelectPart: fail }),
    );
  assert.equal(layout.state, "planar");
  assert.equal(layout.regions[0].hasProfile, true);
  assert.equal(layout.gaps.length, 1);
  near(layout.gaps[0].length, 0.125);
  assert.match(
    html,
    /Profiled retained shape · rectangular blank reservation shown/,
  );
  assert.match(html, /Inspect P043 and cut profile/);
  assert.match(
    cutStockLayoutMarkdown(project, sourceId),
    /Removed profile corners are not added to unretained regions/,
  );
});

test("through-thickness regions require a layer review instead of a false flattened overlap or gap total", () => {
  const { project, sheet } = originalSheet(),
    cut = cutPiece(project, sheet.id, 0.25, 1),
    before = JSON.stringify(cut);
  const layout = cutStockLayout(cut, cut.pieces[0].cutStock!.id),
    html = renderToStaticMarkup(
      createElement(CutStockLayout, {
        project: cut,
        sourceId: layout.sourceId,
      }),
    );
  assert.ok(inspectCutStock(cut).valid.has(layout.sourceId));
  assert.equal(layout.state, "layer-review");
  assert.equal(layout.regions.length, 2);
  assert.deepEqual(layout.gaps, []);
  assert.equal(layout.gapsComplete, false);
  assert.deepEqual(
    layout.regions.map((r) => r.offset[1]),
    [0, 0.375],
  );
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /Source-local XYZ start/);
  assert.match(html, /single flattened layout would hide layers/);
  assert.doesNotMatch(
    cutStockLayoutMarkdown(cut, layout.sourceId),
    /Modeled gaps \/ unretained stock:/,
  );
  assert.equal(JSON.stringify(cut), before);
});

for (const [name, change, message] of [
  [
    "overlapping",
    (p: Project) => {
      p.pieces[1].cutStock!.offset[1] = 10;
    },
    /overlapping regions/,
  ],
  [
    "out of bounds",
    (p: Project) => {
      p.pieces[1].cutStock!.offset[1] = 30;
    },
    /beyond its original/,
  ],
  [
    "mixed material",
    (p: Project) => {
      p.pieces[1].material = "stud";
    },
    /different materials/,
  ],
  [
    "inconsistent source size",
    (p: Project) => {
      p.pieces[1].cutStock!.size[1] = 95;
    },
    /original stock dimensions/,
  ],
  [
    "insufficient saved allowance",
    (p: Project) => {
      p.pieces[1].cutStock!.offset[1] = p.pieces[0].size[1] + 0.0625;
    },
    /modeled.*saw kerf/,
  ],
] as const)
  test(`${name} sources withhold a trusted diagram and derived gaps`, () => {
    const project = pinnedSource();
    change(project);
    const before = JSON.stringify(project),
      layout = cutStockLayout(project, sourceId);
    assert.equal(layout.state, "invalid");
    assert.deepEqual(layout.regions, []);
    assert.deepEqual(layout.gaps, []);
    assert.equal(layout.sourceSize, null);
    assert.match(layout.issues.join(" "), message);
    const html = renderToStaticMarkup(
      createElement(CutStockLayout, { project, sourceId, onSelectPart: fail }),
    );
    assert.doesNotMatch(html, /<svg/);
    assert.match(html, /layout unavailable/);
    assert.match(
      cutStockLayoutMarkdown(project, sourceId),
      /Source layout unavailable/,
    );
    assert.equal(JSON.stringify(project), before);
  });

test("missing sources remain distinct from invalid sources", () => {
  const layout = cutStockLayout(pinnedSource(), uid());
  assert.equal(layout.state, "missing");
  assert.deepEqual(layout.regions, []);
  assert.deepEqual(layout.gaps, []);
});

test("a matching immutable inspection cache is reusable and another project's stale cache cannot bless invalid regions", () => {
  const project = pinnedSource(),
    inspection = inspectCutStock(project),
    layout = cutStockLayout(project, sourceId);
  assert.deepEqual(cutStockLayout(project, sourceId, inspection), layout);
  const changed = structuredClone(project);
  changed.pieces[1].cutStock!.offset[1] = 10;
  assert.equal(cutStockLayout(changed, sourceId, inspection).state, "invalid");
  layout.regions[0].offset[0] = 100;
  layout.regions[0].size[0] = 100;
  layout.sourceSize![0] = 100;
  assert.equal(project.pieces[0].cutStock!.offset[0], 0);
  assert.equal(project.pieces[0].size[0], 0.75);
  assert.equal(project.pieces[0].cutStock!.size[0], 0.75);
});

test("large sources fall back to actual coordinate rows before constructing an excessive diagram grid", () => {
  const { project } = originalSheet(),
    id = uid();
  project.pieces = Array.from({ length: 65 }, (_, i) => {
    const piece = part(
      `SYNTHETIC small blank ${i}`,
      "plywood",
      [0.125, 0.75, 0.125],
      [i, 0, 0],
      project.steps[0].id,
      "Many actual regions",
    );
    piece.stockLengthAxis = 2;
    piece.cutStock = {
      id,
      size: [48, 0.75, 96],
      offset: [i * 0.5, 0, i * 0.5],
    };
    return piece;
  });
  assert.ok(inspectCutStock(project).valid.has(id));
  const layout = cutStockLayout(project, id),
    html = renderToStaticMarkup(
      createElement(CutStockLayout, { project, sourceId: id }),
    );
  assert.equal(layout.state, "table-review");
  assert.equal(layout.regions.length, 65);
  assert.equal(layout.gapsComplete, false);
  assert.deepEqual(layout.gaps, []);
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /bounded diagram detail/);
  assert.match(html, /SYNTHETIC small blank 64/);
});

test("screen and printable views preserve exact labels/coordinates and printing never exposes part-selection buttons", () => {
  const project = pinnedSource(),
    before = JSON.stringify(project),
    inspection = inspectCutStock(project);
  const html = renderToStaticMarkup(
    createElement(CutStockLayout, {
      project,
      sourceId,
      inspection,
      onSelectPart: fail,
    }),
  );
  assert.match(html, /Recorded source blank layout · P043, O001/);
  assert.match(html, /data-part-label="P043"/);
  assert.match(html, /data-part-label="O001"/);
  assert.match(html, /19\.594 in/);
  assert.match(html, /19\.719 in/);
  assert.match(html, /76\.281 in/);
  assert.match(html, /0\.125 in/);
  assert.match(html, /Source-local length: Y · width: Z · thickness: X/);
  assert.match(html, /Inspect P043/);
  assert.match(html, /Inspect O001/);
  assert.match(
    html,
    /<title>Modeled gap \/ unretained stock · width 3\.5 in × length 0\.125 in; across-width start 0 in, along-length start 19\.594 in<\/title>/,
  );
  assert.match(
    html,
    /does not prove a saw kerf, cut order or manufacturing allowance/,
  );
  const printed = renderToStaticMarkup(
    createElement(CutStockLayout, {
      project,
      sourceId,
      printable: true,
      inspection,
      onSelectPart: fail,
    }),
  );
  assert.doesNotMatch(printed, /<button/);
  assert.match(printed, /P043/);
  assert.match(printed, /O001/);
  assert.match(printed, /19\.719 in/);
  assert.equal(JSON.stringify(project), before);
});

test("Markdown is a labeled source-coordinate record, escapes table names, and never invents cut chronology or product quantities", () => {
  const project = pinnedSource();
  project.pieces[0].name = "SYNTHETIC A | B\n<source>";
  const before = JSON.stringify(project),
    text = cutStockLayoutMarkdown(project, sourceId, inspectCutStock(project));
  assert.match(text, /P043 \| Kept part/);
  assert.match(text, /O001 \| Recorded offcut/);
  assert.match(text, /19\.594 in/);
  assert.match(text, /19\.719 in/);
  assert.match(text, /76\.281 in/);
  assert.match(text, /0\.125 in/);
  assert.ok(text.includes("SYNTHETIC A \\| B &lt;source&gt;"));
  assert.doesNotMatch(text, new RegExp(sourceId));
  assert.doesNotMatch(text, /Cut 1|Cut 2|minimum.waste|new purchase/);
  assert.equal(JSON.stringify(project), before);
  assert.equal(ensurePartLabels(project), project);
});
