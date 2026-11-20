import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { connectionCoverage } from "../src/connectionCoverage";
import { previewEaveBlock } from "../src/eaveStockFit";
import { connect, guideMarkdown, validate } from "../src/engine";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { reviewGreenhouseRafterBearing } from "../src/greenhouseRafterBearing";
import {
  greenhouseRoofAttachments,
  roofAttachmentSummary,
} from "../src/greenhouseRoofAttachments";
import type { Project } from "../src/model";

function fit() {
  const initial = createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    undefined,
    {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    },
  ).project;
  const target = reviewGreenhouseRafterBearing(initial)[0].rows[0].id;
  return previewEaveBlock(initial, target, "stud", true);
}
const joints = (p: Project) =>
  greenhouseRoofAttachments(p, connectionCoverage(p).intents)[0].joints;

test("eave attachment status is scoped to each actual pair and survives a guide export", () => {
  const { project, rafterId, plateId, block } = fit();
  const [upper, lower] = joints(project).filter(
    ({ kind }) => kind !== "rafter-ridge",
  );
  assert.deepEqual(upper.pieceIds, [rafterId, block.id]);
  assert.deepEqual(lower.pieceIds, [block.id, plateId]);
  assert.equal(upper.contact && lower.contact, true);
  assert.equal(
    roofAttachmentSummary([upper, lower]).line,
    "2 joints · 2 without a plan · 0 with fit or plan details to review.",
  );

  const withUpper = saveFastenerPlan(
    project,
    makeFastenerPlan(project, block.id, rafterId),
  );
  const other = project.pieces.find(
    ({ id, designRole }) =>
      id !== rafterId && designRole === "greenhouse-rafter",
  )!;
  const unrelated = saveFastenerPlan(
    withUpper,
    makeFastenerPlan(withUpper, rafterId, other.id),
  );
  const [reviewedUpper, unplannedLower] = joints(unrelated).filter(
    ({ kind }) => kind !== "rafter-ridge",
  );
  assert.equal(reviewedUpper.intents.length, 1);
  assert.equal(reviewedUpper.intents[0].state, "started");
  assert.equal(unplannedLower.intents.length, 0);
  const before = JSON.stringify(unrelated);
  const guide = guideMarkdown(unrelated);
  assert.match(
    guide,
    /## Greenhouse roof attachments[\s\S]+Rafter to eave block[^\n]+plan started/,
  );
  assert.match(guide, /Eave block to wall plate[^\n]+Attachment plan needed/);
  assert.equal(JSON.stringify(unrelated), before);
  assert.equal(
    validate(unrelated).find(
      ({ title }) => title === "Review greenhouse roof attachments",
    )?.severity,
    "warning",
  );
});

test("a legacy screw quantity still leaves the exact pair needing a plan", () => {
  const { project, plateId, block } = fit();
  const withQuantity = connect(project, block.id, plateId, block.stepId);
  const lower = joints(withQuantity).find(
    ({ kind }) => kind === "block-plate",
  )!;
  assert.equal(lower.intents[0].state, "legacy-record");
  assert.match(roofAttachmentSummary([lower]).line, /1 without a plan/);
  assert.match(
    guideMarkdown(withQuantity),
    /Eave block to wall plate[^\n]+Attachment plan needed[^\n]+quantity only/,
  );
});

test("the exact saved intents remain visible after an eave block moves", () => {
  const { project, rafterId, plateId, block } = fit();
  const one = saveFastenerPlan(
    project,
    makeFastenerPlan(project, rafterId, block.id),
  );
  const two = saveFastenerPlan(one, makeFastenerPlan(one, block.id, plateId));
  two.pieces.find(({ id }) => id === block.id)!.position[0] += 24;
  const eaves = joints(two).filter(({ kind }) => kind !== "rafter-ridge");
  assert.equal(eaves.length, 2);
  assert.ok(
    eaves.every(
      ({ contact, intents }) => !contact && intents[0].state === "stale",
    ),
  );
  assert.match(
    guideMarkdown(two),
    /Eave block to wall plate[^\n]+Check fit[^\n]+references changed/,
  );
});
