import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blank, part } from "../src/model";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { connectionCoverage } from "../src/connectionCoverage";
import { ConnectionIntentSchedule } from "../src/GuideConnections";
import { FastenerLayoutPanel, LayoutDiagram } from "../src/FastenerLayoutPanel";
import { FastenersPanel } from "../src/FastenersPanel";
import {
  fastenerLayoutDirection,
  fastenerLayoutFace,
  previewFastenerLayout,
} from "../src/fastenerLayout";

function fixture() {
  let project = blank("SYNTHETIC layout UI"),
    stepId = project.steps[0].id;
  project.pieces = [
    part(
      "Actual head panel",
      "plywood",
      [12, 12, 0.75],
      [0, 6, 0.375],
      stepId,
      "Actual pair",
    ),
    part(
      "Actual receiver",
      "stud",
      [3.5, 12, 1.5],
      [0, 6, -0.75],
      stepId,
      "Actual pair",
    ),
  ];
  const plan = addFastenerLocation(
    makeFastenerPlan(project, project.pieces[0].id, project.pieces[1].id, {
      name: "Distinctive full plan name retained exactly",
    }),
  );
  plan.locations[0].entranceLocal = [0, 0, 0.375];
  plan.locations[0].driveLocal = [0, 0, -1];
  project = saveFastenerPlan(project, plan);
  return { project, plan: project.fastenerPlans[0] };
}

test("explicit repeat controls keep count, spacing, basis and optional margin blank and do not generate on render", () => {
  const { project, plan } = fixture(),
    before = JSON.stringify({ project, plan }),
    html = renderToStaticMarkup(
      createElement(FastenerLayoutPanel, {
        project,
        draft: plan,
        request: { seedId: plan.locations[0].id, nonce: 1 },
        onChange: () => assert.fail("Rendering cannot append locations"),
        onPreview: () =>
          assert.fail("Rendering cannot request a scene preview"),
      }),
    );
  for (const label of [
    "Layout row count including seed",
    "Layout row spacing",
    "Minimum head-face edge margin",
  ])
    assert.match(html, new RegExp(`aria-label="${label}"[^>]*value=""`));
  assert.match(html, /aria-label="Layout basis or note"[^>]*><\/textarea>/);
  assert.match(html, /including F001/);
  assert.match(html, /Project local X onto this face/);
  assert.match(html, /Project local Z onto this face · perpendicular/);
  assert.doesNotMatch(
    html,
    /data-testid="fastener-layout-preview"|data-layout-candidate-id/,
  );
  assert.equal(JSON.stringify({ project, plan }), before);
});

test("schedule keeps full names in accessible disclosure on screen and prints the full name directly", () => {
  const { project, plan } = fixture(),
    before = JSON.stringify(project),
    intents = connectionCoverage(project).intents,
    screen = renderToStaticMarkup(
      createElement(ConnectionIntentSchedule, { project, intents }),
    ),
    print = renderToStaticMarkup(
      createElement(ConnectionIntentSchedule, {
        project,
        intents,
        printable: true,
      }),
    );
  assert.ok(screen.includes(`aria-label="W001 full name: ${plan.name}"`));
  assert.ok(screen.includes(`<p>${plan.name}</p></details>`));
  assert.match(
    screen,
    /<strong>W001<\/strong><small>Wood-screw plan<\/small><details class="connection-record-name">/,
  );
  assert.ok(
    !screen.replace(/<details\b[\s\S]*?<\/details>/g, "").includes(plan.name),
  );
  assert.ok(print.includes(plan.name));
  assert.doesNotMatch(print, /connection-record-name/);
  assert.equal(JSON.stringify(project), before);
});

test("a saved multi-location plan initially expands its first location and keeps later exact F identities in collapsed rows", () => {
  const seeded = fixture(),
    project = saveFastenerPlan(
      seeded.project,
      addFastenerLocation(seeded.plan),
    ),
    before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(FastenersPanel, {
        project,
        selectedPlanId: seeded.plan.id,
        onChange: () => assert.fail("Rendering cannot save"),
        onBack: () => {},
      }),
    ),
    first = html.match(
      /<details\b[^>]*aria-label="Fastener location F001"[^>]*>/,
    )?.[0],
    second = html.match(
      /<details\b[^>]*aria-label="Fastener location F002"[^>]*>/,
    )?.[0];
  assert.ok(first && /\bopen=""/.test(first));
  assert.ok(second && !/\bopen=/.test(second));
  assert.match(html, /W001\/F002/);
  assert.equal(JSON.stringify(project), before);
});

test("the retained-face diagram shows one caption and keeps a focused far-end label inside its right edge without changing dots", () => {
  const { project, plan } = fixture(),
    face = fastenerLayoutFace(project, plan, plan.locations[0].id),
    preview = previewFastenerLayout(project, plan, {
      seedLocationId: plan.locations[0].id,
      uLocal: fastenerLayoutDirection(face, 0),
      countU: 3,
      spacingU: 10,
      countV: 1,
      spacingV: null,
      basis: "SYNTHETIC far-end diagram; deliberately excluded points",
    }),
    before = JSON.stringify(preview),
    seed = renderToStaticMarkup(
      createElement(LayoutDiagram, {
        preview,
        selected: [],
        focusedId: null,
        onFocus: () => {},
      }),
    ),
    focused = renderToStaticMarkup(
      createElement(LayoutDiagram, {
        preview,
        selected: [],
        focusedId: preview.candidates[1].id,
        onFocus: () => {},
      }),
    );
  assert.match(seed, />F001<\/text>/);
  assert.doesNotMatch(focused, />F001<\/text>/);
  assert.match(focused, /text-anchor="end"[^>]*>New 2<\/text>/);
  assert.equal((seed.match(/<circle\b/g) ?? []).length, 3);
  assert.equal((focused.match(/<circle\b/g) ?? []).length, 3);
  assert.equal(JSON.stringify(preview), before);
});
