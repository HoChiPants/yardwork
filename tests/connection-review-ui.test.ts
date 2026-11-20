import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blank, part } from "../src/model";
import { connect } from "../src/engine";
import { connectionCoverage } from "../src/connectionCoverage";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import {
  ConnectionIntentSchedule,
  GuideConnectionSchedule,
} from "../src/GuideConnections";
import { ConnectionReviewPanel } from "../src/ConnectionReviewPanel";
import { measuredHingeFixture } from "./fixtures/measuredHinge";
import { ensurePartLabels, partLabel } from "../src/partLabels";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { generateBuildGuide } from "../src/guide";
import { makeShelfPinPlan, saveShelfPinPlan } from "../src/attachments";

function pair() {
  const project = blank("SYNTHETIC connection UI"),
    stepId = project.steps[0].id;
  project.pieces = [
    part(
      "Shared display name",
      "plywood",
      [8, 8, 0.75],
      [0, 4, 0.375],
      stepId,
      "Manual assembly",
    ),
    part(
      "Shared display name",
      "stud",
      [3.5, 8, 1.5],
      [0, 4, -0.75],
      stepId,
      "Manual assembly",
    ),
  ];
  return project;
}

test("print schedule keeps legacy quantities, started plans and pending locations separate without navigation controls", () => {
  let project = pair();
  const [a, b] = project.pieces;
  project = connect(project, a.id, b.id, project.steps[0].id, 4, 3);
  project = saveFastenerPlan(project, makeFastenerPlan(project, a.id, b.id));
  project = saveFastenerPlan(
    project,
    addFastenerLocation(makeFastenerPlan(project, a.id, b.id)),
  );
  const before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(GuideConnectionSchedule, {
        project,
        stepId: project.steps[0].id,
        printable: true,
        onInspectPiece: () => assert.fail("Print cannot inspect"),
        onReviewIntent: () => assert.fail("Print cannot navigate"),
        onOpenConnections: () => assert.fail("Print cannot navigate"),
      }),
    );
  assert.match(html, /W001/);
  assert.match(html, /W002/);
  assert.match(html, /P001.*P002/);
  assert.match(html, /4 ×/);
  assert.match(html, /Quantity record only/);
  assert.match(html, /Started · setup incomplete/);
  assert.match(html, /0 explicit locations/);
  assert.match(html, /Details pending/);
  assert.match(html, /1 explicit location/);
  assert.doesNotMatch(
    html,
    /<button|Review W001|No connection, support or restraint intent/,
  );
  assert.equal(JSON.stringify(project), before);
});

test("starting an empty plan leaves both actual task members without current intent in the review UI", () => {
  let project = pair();
  project = saveFastenerPlan(
    project,
    makeFastenerPlan(project, project.pieces[0].id, project.pieces[1].id),
  );
  const before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(ConnectionReviewPanel, {
        project,
        bearingReview: { pairs: [], withoutContact: [] },
        woodJointDetails: [],
        onSaveWoodJointDetail: () => assert.fail("Rendering must not save a joint detail"),
        onClearWoodJointDetail: () => assert.fail("Rendering must not clear a joint detail"),
        onSaveBearingDecision: () => assert.fail("Rendering must not save a decision"),
        onClearBearingDecision: () => assert.fail("Rendering must not clear a decision"),
        onTestRemoval: () => assert.fail("Rendering must not start motion"),
        scope: {
          memberIds: project.pieces.map((piece) => piece.id),
          title: "Actual pair",
        },
        onBack: () => {},
        onInspectPiece: () => {},
        onPlanPair: () => assert.fail("Rendering must not start a plan"),
        onReviewIntent: () => {},
      }),
    );
  assert.match(html, /2 actual members · 2 without current task/);
  assert.match(html, /2 have<!-- --> started plans|2 have started plans/);
  assert.equal((html.match(/data-coverage-state="started"/g) ?? []).length, 2);
  assert.match(html, /modeled gap 0 in/);
  assert.match(html, /No hole location|hole location/);
  assert.equal(JSON.stringify(project), before);
});

test("located hinge evidence appears as one H plan with actual moving and fixed P members instead of an empty legacy schedule", () => {
  const project = measuredHingeFixture(),
    coverage = connectionCoverage(project),
    before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(ConnectionIntentSchedule, {
        project,
        intents: coverage.intents,
        printable: true,
      }),
    );
  assert.equal(
    (html.match(/data-connection-kind="lid-hinge"/g) ?? []).length,
    1,
  );
  assert.match(html, /H001/);
  assert.match(html, /Geometry reviewed/);
  assert.match(html, /2 explicit locations/);
  assert.match(html, /P\d{3} ↔ P\d{3}/);
  assert.doesNotMatch(html, /No fastening schedule|<button/);
  assert.equal(JSON.stringify(project), before);
});

test("the explicit global review and unassigned-intent gap keep an all-missing W plan reachable without inventing members", () => {
  let project = ensurePartLabels(pair());
  project = saveFastenerPlan(
    project,
    makeFastenerPlan(project, project.pieces[0].id, project.pieces[1].id),
  );
  project = { ...project, pieces: [] };
  const before = JSON.stringify(project);
  for (const stageKey of ["all-connections", "unassigned-intents"]) {
    const html = renderToStaticMarkup(
      createElement(ConnectionReviewPanel, {
        project,
        bearingReview: { pairs: [], withoutContact: [] },
        woodJointDetails: [],
        onSaveWoodJointDetail: () => assert.fail("Rendering must not save a joint detail"),
        onClearWoodJointDetail: () => assert.fail("Rendering must not clear a joint detail"),
        onSaveBearingDecision: () => assert.fail("Rendering must not save a decision"),
        onClearBearingDecision: () => assert.fail("Rendering must not clear a decision"),
        onTestRemoval: () => assert.fail("Rendering must not start motion"),
        scope: {
          ownerId: project.id,
          stageKey,
          memberIds: [],
          title: "Retained connection intent",
        },
        onBack: () => {},
        onInspectPiece: () => assert.fail("No current part to inspect"),
        onPlanPair: () => assert.fail("No current part to join"),
        onReviewIntent: () => {},
      }),
    );
    assert.match(html, /Review W001/);
    assert.match(html, /P001 \(missing\) ↔ P002 \(missing\)/);
    assert.match(html, /References changed/);
    assert.doesNotMatch(html, /The original stage changed/);
    assert.equal((html.match(/data-review-part-id=/g) ?? []).length, 0);
  }
  assert.equal(JSON.stringify(project), before);
});

test("one advisory module step aggregates its frame, shell and lid rather than dropping the last five members and H intent", () => {
  const project = createBuildStudy(
      "storage-banquette",
      defaultBuildStudyParameters("storage-banquette"),
    ).project,
    coverage = connectionCoverage(project),
    stepId = coverage.stages.find((row) => row.key === "bottom-frame")!.stepId!,
    matching = coverage.stages.filter((row) => row.stepId === stepId),
    moving = matching.find((row) => row.key === "seat-lid-back")!,
    hinge = project.lidHingePlans.find((plan) =>
      moving.memberIds.includes(plan.moving.pieceId),
    )!;
  assert.equal(matching.length, 3);
  assert.equal(matching.flatMap((row) => row.memberIds).length, 14);
  const before = JSON.stringify(project),
    html = renderToStaticMarkup(
      createElement(GuideConnectionSchedule, {
        project,
        stepId,
        printable: true,
      }),
    );
  assert.match(html, /14 parts have no current attachment/);
  assert.match(html, new RegExp(hinge.label));
  assert.equal(JSON.stringify(project), before);
});

test("generated owner and stage metadata stays authoritative over a shared advisory step ID", () => {
  const project = generateBuildGuide(
      createBuildStudy(
        "storage-banquette",
        defaultBuildStudyParameters("storage-banquette"),
      ).project,
    ),
    coverage = connectionCoverage(project),
    target = coverage.stages.find((row) => row.key === "seat-lid-back")!,
    frame = coverage.stages.find(
      (row) => row.ownerId === target.ownerId && row.key === "bottom-frame",
    )!;
  frame.stepId = target.stepId;
  const html = renderToStaticMarkup(
    createElement(GuideConnectionSchedule, {
      project,
      stepId: target.stepId!,
      printable: true,
      coverage,
    }),
  );
  assert.match(html, /1 parts have no current attachment/);
  assert.doesNotMatch(
    html,
    /9 parts have no current attachment|10 parts have no current attachment/,
  );
});

test("hinge and shelf-support task labels identify their actual context members without presenting them as body joinery", () => {
  const hingeProject = measuredHingeFixture(),
    hinge = hingeProject.lidHingePlans[0],
    hingeHtml = renderToStaticMarkup(
      createElement(ConnectionIntentSchedule, {
        project: hingeProject,
        intents: connectionCoverage(hingeProject).intents,
        printable: true,
      }),
    );
  assert.match(hingeHtml, /data-connection-purpose="lid-mounting"/);
  assert.ok(
    hingeHtml.includes(
      `Lid task: ${partLabel(hingeProject, hinge.moving.pieceId)}; fixed-member context: ${partLabel(hingeProject, hinge.fixed.pieceId)}.`,
    ),
  );

  let shelfProject = createBuildStudy(
    "shelves",
    defaultBuildStudyParameters("shelves"),
  ).project;
  const entry = shelfProject.ideaBindings[0].entries[0],
    actualRoleId = (role: string) =>
      shelfProject.sections.find(
        (section) =>
          section.id ===
          entry.sections.find((row) => row.role === role)!.sectionId,
      )!.pieceIds[0];
  shelfProject = saveShelfPinPlan(
    shelfProject,
    makeShelfPinPlan(shelfProject, entry.id, {
      shelfRoles: ["shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  const before = JSON.stringify(shelfProject),
    shelfHtml = renderToStaticMarkup(
      createElement(ConnectionIntentSchedule, {
        project: shelfProject,
        intents: connectionCoverage(shelfProject).intents,
        printable: true,
      }),
    );
  assert.match(shelfHtml, /data-connection-purpose="shelf-support"/);
  assert.ok(
    shelfHtml.includes(
      `Shelf support task: ${partLabel(shelfProject, actualRoleId("shelf-1"))}; side-mount context: ${partLabel(shelfProject, actualRoleId("side-left"))}, ${partLabel(shelfProject, actualRoleId("side-right"))}.`,
    ),
  );
  assert.equal(JSON.stringify(shelfProject), before);
});
