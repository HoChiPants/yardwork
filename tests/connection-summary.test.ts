import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { blank, part, projectSchema } from "../src/model";
import { connectionCoverage } from "../src/connectionCoverage";
import { ConnectionSummary } from "../src/ConnectionSummary";
import { connect } from "../src/engine";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";

const render = (coverage: ReturnType<typeof connectionCoverage>) =>
  renderToStaticMarkup(
    createElement(ConnectionSummary, {
      coverage,
      onReview: () =>
        assert.fail("Rendering cannot change or navigate a project"),
    }),
  );

test("the real measured example counts its four source plans, including pending hinges, instead of location rows or legacy joints", () => {
  const p = projectSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ),
    before = JSON.stringify(p),
    html = render(connectionCoverage(p));
  assert.match(html, />4 connection plans</);
  assert.match(html, /Review 4 connection plans and 0 quantity records/);
  assert.doesNotMatch(html, /disabled=""|>0 connections|>5 connection plans/);
  assert.equal(JSON.stringify(p), before);
});

test("one legacy quantity record stays one record regardless of screw quantity and stays separate from a modern plan", () => {
  let p = blank();
  p.pieces = [
    part("A", "stud", [1.5, 12, 3.5], [0, 6, 0], p.steps[0].id, "Manual"),
    part("B", "stud", [1.5, 12, 3.5], [1.5, 6, 0], p.steps[0].id, "Manual"),
  ];
  p = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 8, 3);
  p = saveFastenerPlan(p, makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id));
  const html = render(connectionCoverage(p));
  assert.match(html, /Review 1 connection plan and 1 quantity record/);
  assert.match(html, /1 quantity record/);
  assert.doesNotMatch(html, /8 quantity|8 connection/);
});

test("blank summary is disabled but retained orphan plans remain reviewable without an active member", () => {
  const p = blank();
  assert.match(render(connectionCoverage(p)), /disabled=""/);
  p.pieces = [
    part("A", "stud", [1.5, 12, 3.5], [0, 6, 0], p.steps[0].id, "Manual"),
    part("B", "stud", [1.5, 12, 3.5], [1.5, 6, 0], p.steps[0].id, "Manual"),
  ];
  const planned = saveFastenerPlan(
    p,
    makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id),
  );
  planned.pieces = [];
  const html = render(connectionCoverage(planned));
  assert.match(html, />1 connection plan</);
  assert.doesNotMatch(html, /disabled=""/);
});
