import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { bom, guideMarkdown } from "../src/engine";
import { previewEaveBlock, previewEaveRoof } from "../src/eaveStockFit";
import { homeDepotFraming } from "../src/homeDepotFramingReference";
import { greenhouseRoofAttachments } from "../src/greenhouseRoofAttachments";
import { inspectCutStock } from "../src/cutStock";
import { reviewGreenhouseRafterBearing } from "../src/greenhouseRafterBearing";
import { part, projectSchema, type Project, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";

const source = () =>
  createBuildStudy(
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
const stock = (p: Project) =>
  bom(p).find(({ id }) => id === "stud")!.physicalStockUnits;
const review = (p: Project) => reviewGreenhouseRafterBearing(p)[0].rows;

test("two eave blocks fit on the actual retained faces and reuse one physical board", () => {
  const p = source(),
    before = JSON.stringify(p);
  const [first, second] = review(p);
  const a = previewEaveBlock(p, first.id, "stud", true);
  assert.equal(JSON.stringify(p), before);
  assert.equal(a.block.cutPlanes.length, 1);
  assert.ok(a.heights[1] > a.heights[0] && a.heights[0] > 0);
  assert.equal(a.reusedId, null);
  assert.ok(a.remnantLength > 90);
  const b = previewEaveBlock(a.project, second.id, "stud", true);
  assert.ok(b.reusedId);
  assert.equal(a.block.cutStock!.id, b.block.cutStock!.id);
  assert.equal(stock(b.project), stock(p) + 1);
  assert.deepEqual(inspectCutStock(b.project).invalid, []);
  assert.equal(b.project.pieces.filter(({ offcut }) => offcut).length, 1);
  const result = review(b.project);
  assert.equal(result.filter(({ eave }) => eave.state === "contact").length, 2);
  assert.ok(result.every(({ ridge }) => ridge.state === "contact"));
  const roof = b.project.sections.find(({ pieceIds }) =>
    pieceIds.includes(first.id),
  );
  assert.ok(
    roof?.pieceIds.includes(a.block.id) && roof.pieceIds.includes(b.block.id),
  );
  assert.match(guideMarkdown(b.project), /Side profile face/);
  assert.match(
    guideMarkdown(b.project),
    /2 of 10 eave ends show wood face contact/,
  );
  assert.equal(b.project.supplies.length, p.supplies.length);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(b.project))).pieces,
    b.project.pieces,
  );
  assert.throws(
    () => previewEaveBlock(b.project, first.id, "stud", true),
    /gap or edge contact/,
  );
  const remaining = previewEaveRoof(b.project, review(p)[2].id, "stud", true);
  assert.equal(remaining.fits.length, 8);
  assert.equal(remaining.freshBoards, 0);
  assert.equal(stock(remaining.project), stock(p) + 1);
  assert.ok(
    remaining.fits.every(
      ({ block }) => block.cutStock?.id === a.block.cutStock?.id,
    ),
  );
});

test("a rotated greenhouse uses its own plate and rafter coordinates", () => {
  const p = source();
  const rotation: V3 = [0.06, 0.72, 0.13],
    origin: V3 = [70, 16, -42];
  p.pieces = p.pieces.map((piece) => ({
    ...piece,
    rotation: composeRotation(rotation, piece.rotation),
    position: rotate(piece.position, rotation).map(
      (n, axis) => n + origin[axis],
    ) as V3,
  }));
  p.ideaBindings[0].entries[0].pose = { rotation, origin };
  const target = review(p)[5].id;
  const result = previewEaveBlock(p, target, "stud", false);
  assert.equal(
    review(result.project).find(({ id }) => id === target)?.eave.state,
    "contact",
  );
});

test("solid obstructions and the measured work zone block a preview", () => {
  const p = source();
  const rafterId = review(p)[4].id;
  const candidate = previewEaveBlock(p, rafterId, "stud", true);
  const plate = p.pieces.find(({ id }) => id === candidate.plateId)!;
  const rafter = p.pieces.find(({ id }) => id === rafterId)!;
  const position: V3 = [
    plate.position[0],
    plate.position[1] + plate.size[1] / 2 + 0.1,
    rafter.position[2],
  ];
  const obstacle = part(
    "Obstructing plate",
    "stud",
    [4, 0.1, 4],
    position,
    rafter.stepId,
    "Extras",
  );
  p.pieces.push(obstacle);
  assert.throws(() => previewEaveBlock(p, rafterId, "stud", true), /obstruct/);
  p.pieces.pop();
  p.workZone = { width: 20, height: 20, depth: 20 };
  assert.throws(() => previewEaveBlock(p, rafterId, "stud", true), /work zone/);
});

test("one roof preview fits all ten joints on one exact board and exports the cuts and attachment pairs", () => {
  const timber = homeDepotFraming.stud;
  const p = createBuildStudy("greenhouse", undefined, undefined, {
    frameLumber: {
      materialId: timber.materialId,
      productRegistryRef: timber.registryId,
    },
  }).project;
  const before = JSON.stringify(p);
  const roof = review(p);
  const fit = previewEaveRoof(p, roof[0].id, timber.materialId, true);
  assert.equal(JSON.stringify(p), before);
  assert.equal(fit.fits.length, 10);
  assert.deepEqual(fit.skipped, []);
  assert.equal(fit.freshBoards, 1);
  const ids = new Set(fit.fits.map(({ block }) => block.cutStock?.id));
  assert.equal(ids.size, 1);
  const sourceId = [...ids][0];
  assert.ok(sourceId);
  assert.equal(
    fit.project.pieces.filter(
      ({ offcut, cutStock }) => offcut && cutStock?.id === sourceId,
    ).length,
    1,
  );
  assert.deepEqual(inspectCutStock(fit.project).invalid, []);
  const counts = (project: Project) =>
    bom(project).find(({ id }) => id === timber.materialId)!.quantity;
  assert.equal(counts(fit.project), counts(p) + 1);
  assert.ok(
    review(fit.project).every(
      ({ eave, ridge }) =>
        eave.state === "contact" && ridge.state === "contact",
    ),
  );
  const attachments = greenhouseRoofAttachments(fit.project, [])[0].joints;
  assert.equal(
    attachments.filter(({ kind }) => kind === "rafter-block").length,
    10,
  );
  assert.equal(
    attachments.filter(({ kind }) => kind === "block-plate").length,
    10,
  );
  const guide = guideMarkdown(fit.project);
  assert.match(guide, /10 of 10 eave ends show wood face contact/);
  assert.match(guide, /Side profile face/);
  assert.match(guide, /Rafter to eave block/);
  assert.match(guide, /Eave block to wall plate/);
  assert.ok(guide.includes(timber.listing));
  assert.equal(fit.project.fastenerPlans.length, p.fastenerPlans.length);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(fit.project))).pieces,
    fit.project.pieces,
  );
});

test("a whole-roof preview keeps an obstructed joint and the offcuts from earlier accepted fits separate", () => {
  const p = source();
  const { id: target, eave: originalJoint } = review(p)[4];
  const candidate = previewEaveBlock(p, target, "stud", true);
  const plate = p.pieces.find(({ id }) => id === candidate.plateId)!;
  const rafter = p.pieces.find(({ id }) => id === target)!;
  const obstacle = part(
    "Blocking existing equipment",
    "stud",
    [4, 0.1, 4],
    [
      plate.position[0],
      plate.position[1] + plate.size[1] / 2 + 0.1,
      rafter.position[2],
    ],
    rafter.stepId,
    "Existing",
  );
  p.pieces.push(obstacle);
  const first = previewEaveRoof(p, target, "stud", true);
  assert.equal(first.fits.length, 9);
  assert.equal(first.skipped.length, 1);
  assert.equal(first.skipped[0].rafterId, target);
  assert.match(first.skipped[0].reason, /obstruct/);
  assert.equal(first.freshBoards, 1);
  assert.deepEqual(inspectCutStock(first.project).invalid, []);
  assert.equal(
    review(first.project).find(({ id }) => id === target)?.eave.state,
    originalJoint.state,
  );
  assert.equal(
    review(p).filter(({ eave }) => eave.state === "contact").length,
    0,
  );
  const second = previewEaveRoof(first.project, target, "stud", true);
  assert.equal(second.project, first.project);
  assert.equal(second.fits.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.deepEqual(second.outlines, []);
});
