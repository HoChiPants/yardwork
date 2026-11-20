import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectSchema } from "../src/model";
import { bom, guideMarkdown } from "../src/engine";
import {
  BanquetteConstructionReview,
  BanquetteConstructionAppendix,
} from "../src/BanquetteConstructionReview";
import { banquetteConstruction } from "../src/banquetteConstruction";
import { banquetteConstructionMarkdown } from "../src/banquetteConstructionGuide";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { persistLidPose } from "../src/lidMotion";

const fixture = () =>
  projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/builds/storage-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
const fail = () =>
  assert.fail("Pure review rendering must not mutate or navigate");

test("construction UI exposes actual frame pairs without auto-creating plans or changing source/BOM/guide history", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    purchasing = bom(project),
    reports = banquetteConstruction(project);
  const html = renderToStaticMarkup(
    createElement(BanquetteConstructionReview, {
      project,
      memberIds: project.pieces.map((piece) => piece.id),
      onInspectPiece: fail,
      onPlanPair: fail,
      onPlanConnectorPair: fail,
      focusedEntryId: reports[2].entryId,
    }),
  );
  assert.match(
    html,
    new RegExp(`data-banquette-entry-id="${reports[2].entryId}"`),
  );
  assert.match(html, /8 actual members meet the current underside/);
  assert.match(html, /12 frame or saved pairs/);
  assert.match(html, /Other shell contact pairs \(28\)/);
  for (const pair of reports[2].pairs
    .filter((pair) => pair.kind === "frame")
    .slice(0, 6)) {
    assert.ok(html.includes(`data-pair-a-id="${pair.pieceIds[0]}"`));
    assert.ok(html.includes(`data-pair-b-id="${pair.pieceIds[1]}"`));
  }
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(bom(project), purchasing);
});

test("Markdown and print appendix retain exact pair states while neighboring pairs stay unplanned", () => {
  let project = fixture();
  const pair = banquetteConstruction(project)[0].pairs.find(
    (pair) => pair.kind === "frame",
  )!;
  project = saveFastenerPlan(
    project,
    addFastenerLocation(makeFastenerPlan(project, ...pair.pieceIds)),
  );
  const before = JSON.stringify(project),
    md = guideMarkdown(project),
    appendix = renderToStaticMarkup(
      createElement(BanquetteConstructionAppendix, { project }),
    );
  assert.match(md, /## Banquette construction review/);
  assert.match(md, /W001: needs-layout/);
  assert.match(md, /no-record/);
  assert.match(appendix, /Entrance and direction needed/);
  assert.match(appendix, /No plan for this pair/);
  assert.match(appendix, /Closed-seat contacts found/);
  assert.equal(JSON.stringify(project), before);
});

test("open actual lid is reported as unreviewed closed support, rather than a fabricated zero-contact closed pose", () => {
  const base = fixture(),
    project = persistLidPose(base, base.sections[0].id, true),
    first = banquetteConstruction(project)[0];
  const md = banquetteConstructionMarkdown(project, [first]);
  assert.match(md, /: open/);
  assert.match(md, /Closed-seat contacts are not established/);
  assert.doesNotMatch(md, /Current underside contacts: none found/);
  const html = renderToStaticMarkup(
    createElement(BanquetteConstructionReview, {
      project,
      memberIds: first.memberIds,
      onInspectPiece: fail,
      onPlanPair: fail,
    }),
  );
  assert.match(html, /Seat is currently open/);
  assert.doesNotMatch(html, /0 actual members meet/);
});

test("review only uses its actual scoped module and escapes user titles in exported Markdown", () => {
  const project = fixture(),
    report = banquetteConstruction(project)[1];
  project.sections.find((section) => section.id === report.sectionId)!.name =
    "Custom | <script>\nheading";
  const html = renderToStaticMarkup(
    createElement(BanquetteConstructionReview, {
      project,
      memberIds: report.memberIds,
      onInspectPiece: fail,
      onPlanPair: fail,
    }),
  );
  assert.ok(html.includes(`data-banquette-entry-id="${report.entryId}"`));
  assert.match(html, /Custom \| &lt;script&gt;/);
  const md = banquetteConstructionMarkdown(project);
  assert.ok(md.includes("Custom \\| \\<script\\> heading"));
});
