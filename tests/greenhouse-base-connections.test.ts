import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { connectionCoverage } from "../src/connectionCoverage";
import { reviewConnectionContact } from "../src/connectionContacts";
import { guideMarkdown, validate } from "../src/engine";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import {
  greenhouseBaseConnections,
  greenhouseBaseCornerText,
  greenhouseBaseSummary,
  greenhouseCornerAligned,
  previewGreenhouseRailFit,
} from "../src/greenhouseBaseConnections";
import { greenhouseBaseTimber } from "../src/greenhouseBaseReference";
import { blank, part, projectSchema, type Project } from "../src/model";
import { transformSection } from "../src/sections";

function sample() {
  return createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseBase: {
      materialId: greenhouseBaseTimber.materialId,
      productRegistryRef: greenhouseBaseTimber.productId,
    },
  }).project;
}

const review = (p: Project) =>
  greenhouseBaseConnections(p, connectionCoverage(p).intents)[0];

test("a rail adjustment returns the exact translation without changing the project", () => {
  const project = sample();
  const base = review(project);
  const rail = project.pieces.find(({ id }) => id === base.corners[0].sideId)!;
  const position = [...rail.position];
  rail.position[0] += 1;
  rail.position[1] += 0.25;
  rail.position[2] += 0.5;
  const snapshot = structuredClone(project);
  const fit = previewGreenhouseRailFit(project, base.entryId, rail.id);
  assert.equal(fit.kind, "move");
  if (fit.kind !== "move") return;
  assert.deepEqual(fit.offset, [-1, -0.25, -0.5]);
  assert.deepEqual(fit.piece, { ...rail, position });
  assert.deepEqual(project, snapshot);
  const proposal = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === rail.id ? fit.piece : piece,
    ),
  };
  assert.ok(review(proposal).corners.every(greenhouseCornerAligned));
});

test("a rotated base proposes its adjustment in workspace coordinates", () => {
  const original = sample();
  const initial = review(original);
  const section = original.sections.find(({ pieceIds }) =>
    pieceIds.includes(initial.corners[1].sideId!),
  )!;
  const project = transformSection(
    original,
    section.id,
    [200, 0, 200],
    [0, Math.PI / 2, 0],
  );
  const rail = project.pieces.find(
    ({ id }) => id === initial.corners[1].sideId,
  )!;
  rail.position[2] += 1;
  const fit = previewGreenhouseRailFit(project, initial.entryId, rail.id);
  assert.equal(fit.kind, "move");
  if (fit.kind === "move") assert.deepEqual(fit.offset, [0, 0, -1]);
});

test("a short rail, an occupied target and a work zone limit each block automatic adjustment", () => {
  const project = sample();
  const base = review(project);
  const rail = project.pieces.find(({ id }) => id === base.corners[0].sideId)!;
  const preview = () =>
    previewGreenhouseRailFit(project, base.entryId, rail.id);
  assert.deepEqual(preview(), {
    kind: "unavailable",
    reason: "Both ends of this side rail already meet and align.",
  });
  rail.size[2] -= 1;
  assert.match(JSON.stringify(preview()), /cut length and the spacing/);
  rail.size[2] += 1;
  const obstruction = part(
    "Test obstruction",
    rail.material,
    [1, 1, 1],
    [...rail.position],
    rail.stepId,
    "",
  );
  rail.position[0] += 5;
  project.pieces.push(obstruction);
  assert.match(
    JSON.stringify(preview()),
    /occupies part of the proposed position/,
  );
  obstruction.offcut = true;
  assert.equal(preview().kind, "move");
  project.workZone = { width: 70, height: 120, depth: 120 };
  assert.match(JSON.stringify(preview()), /outside the work zone/);
});

test("each base corner measures its exact fit, and only its exact pair receives a saved plan record", () => {
  const original = sample();
  const base = review(original);
  assert.deepEqual(
    base.corners.map(({ label }) => label),
    ["Front left", "Front right", "Back left", "Back right"],
  );
  assert.ok(
    base.corners.every(
      ({ fit }) => fit?.state === "face-contact" && fit.area === 12.25,
    ),
  );
  assert.match(
    greenhouseBaseSummary(base.corners).line,
    /^4 of 4 corners meet and align/,
  );
  const first = base.corners[0];
  const project = saveFastenerPlan(
    original,
    makeFastenerPlan(original, first.endId!, first.sideId!),
  );
  assert.deepEqual(
    review(project).corners.map(({ intents }) => intents.length),
    [1, 0, 0, 0],
  );
  assert.match(
    guideMarkdown(project),
    /## Greenhouse base corners[\s\S]+Front left[\s\S]+W001 · plan started/,
  );
  assert.equal(
    validate(project).find(
      ({ id }) => id === `greenhouse-base-corners-${base.entryId}`,
    )?.severity,
    "warning",
  );
  assert.deepEqual(project.pieces, original.pieces);
});

test("a trim, inset or missing rail changes only the affected corners", () => {
  const project = sample(),
    initial = review(project);
  const leftId = initial.corners[0].sideId!;
  const left = project.pieces.find(({ id }) => id === leftId)!;
  left.size[2] -= 1;
  const shorter = review(project);
  assert.equal(shorter.corners[0].fit?.state, "near-face");
  assert.equal(shorter.corners[0].fit?.gap, 0.5);
  assert.equal(shorter.corners[1].fit?.state, "face-contact");
  assert.equal(shorter.corners[2].fit?.gap, 0.5);

  left.size[2] += 1;
  left.position[0] += 1;
  const inset = review(project);
  assert.equal(inset.corners[0].fit?.state, "face-contact");
  assert.match(
    greenhouseBaseCornerText(project, inset.corners[0]).geometry,
    /side rail is inset 1 in/,
  );
  assert.match(
    greenhouseBaseSummary(inset.corners).line,
    /^2 of 4 corners meet and align/,
  );
  left.offcut = true;
  const missing = review(project);
  assert.equal(missing.corners[0].sideId, null);
  assert.equal(missing.corners[0].fit, null);
  assert.match(
    greenhouseBaseCornerText(project, missing.corners[0]).pair,
    /left rail missing or ambiguous/,
  );
  assert.equal(missing.corners[1].fit?.state, "face-contact");
});

test("rotating a complete base preserves its local corner alignment and saved older designs still resolve", () => {
  const initial = sample(),
    original = review(initial);
  const base = initial.sections.find(({ pieceIds }) =>
    pieceIds.includes(original.corners[0].sideId!),
  )!;
  const aligned = transformSection(
    initial,
    base.id,
    [5, 0, 7],
    [0, Math.PI / 4, 0],
  );
  assert.match(
    greenhouseBaseSummary(review(aligned).corners).line,
    /^4 of 4 corners meet and align/,
  );
  assert.equal(review(aligned).corners[0].sideId, original.corners[0].sideId);
  const legacy = projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/builds/greenhouse.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  assert.match(
    greenhouseBaseSummary(review(legacy).corners).line,
    /^4 of 4 corners meet and align/,
  );
});

test("a connection on the wrong face does not pass the directed corner check", () => {
  const project = blank();
  const lower = part(
    "Lower",
    "stud",
    [1.5, 3, 3.5],
    [0, 1.5, 0],
    project.steps[0].id,
    "Base",
  );
  const upper = part(
    "Upper",
    "stud",
    [1.5, 3, 3.5],
    [0, 4.5, 0],
    project.steps[0].id,
    "Base",
  );
  assert.equal(reviewConnectionContact(lower, upper).state, "face-contact");
  assert.equal(
    reviewConnectionContact(lower, upper, 0.125, [0, 0, 1]).state,
    "no-facing-contact",
  );
});
