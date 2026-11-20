import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { banquetteConstruction } from "../src/banquetteConstruction";
import { part, projectSchema, uid, type Project } from "../src/model";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import {
  connectorReviews,
  makeConnectorPlan,
  saveConnectorPlan,
} from "../src/connectors";
import { persistLidPose } from "../src/lidMotion";
import { transformSection } from "../src/sections";

const firstSectionId = "77e94b8b-9f52-4082-92b1-4b110f564170";
const legId = "77ca8a23-e316-4c8c-9040-0f43a1688d43";
const railId = "bfaf9102-f44e-4bcc-9e6c-e961e96e67e8";
const lidId = "b34a598e-cdbf-4f17-a3e0-818503b36264";
function fixture(): Project {
  return projectSchema.parse(
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
}
const first = (project: Project) =>
  banquetteConstruction(project).find(
    (row) => row.sectionId === firstSectionId,
  )!;
const pair = (project: Project, a: string, b: string) =>
  first(project).pairs.find(
    (row) => row.pieceIds.includes(a) && row.pieceIds.includes(b),
  )!;
function pendingFrame(project = fixture()) {
  return saveFastenerPlan(project, makeFastenerPlan(project, railId, legId));
}
function externalPath() {
  let project = fixture();
  const leg = project.pieces.find((piece) => piece.id === legId)!;
  const receiver = part(
    "SYNTHETIC explicit external receiver",
    "stud",
    [1.5, 4, 3.5],
    [leg.position[0] + 1.5, leg.position[1], leg.position[2]],
    project.steps[0].id,
    "Loose parts",
  );
  project = { ...project, pieces: [...project.pieces, receiver] };
  let plan = addFastenerLocation(
    makeFastenerPlan(project, leg.id, receiver.id),
  );
  plan.locations[0].entranceLocal = [-0.75, 0, 0];
  plan.locations[0].driveLocal = [1, 0, 0];
  plan.measurements = {
    surfaceToTipDepth: 2,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "SYNTHETIC entered centerline only",
    measuredAt: "2026-11-17T00:00:00.000Z",
  };
  project = saveFastenerPlan(project, plan);
  return { project, receiver, plan: project.fastenerPlans.at(-1)! };
}

test("actual public study has eight underside contacts and forty candidate pairs per module, not required joints", () => {
  const project = fixture(),
    before = JSON.stringify(project),
    reports = banquetteConstruction(project);
  assert.equal(reports.length, 3);
  for (const report of reports) {
    assert.equal(report.memberIds.length, 14);
    assert.equal(report.seats[0].state, "contacts-found");
    assert.equal(report.seats[0].supportIds.length, 8);
    assert.equal(report.pairs.filter((row) => row.kind === "frame").length, 12);
    assert.equal(report.pairs.filter((row) => row.kind === "shell").length, 28);
    assert.ok(report.pairs.every((row) => row.state === "no-record"));
    assert.equal(report.enumeration.complete, true);
    assert.equal(report.enumeration.possiblePairs, 91);
    assert.ok(report.pairs.slice(0, 12).every((row) => row.kind === "frame"));
  }
  assert.equal(JSON.stringify(project), before);
  assert.equal(project.fastenerPlans.length, 0);
});

test("renaming and reordering repeated roles does not alter pair identity or seat supports", () => {
  const project = fixture(),
    original = first(project);
  const changed = {
    ...project,
    pieces: [...project.pieces]
      .reverse()
      .map((piece) => ({ ...piece, name: "Same visible name" })),
    sections: project.sections.map((section) => ({
      ...section,
      pieceIds: [...section.pieceIds].reverse(),
    })),
  };
  const actual = first(changed);
  assert.deepEqual(
    actual.pairs.map((row) => row.id),
    original.pairs.map((row) => row.id),
  );
  assert.deepEqual(
    [...actual.seats[0].supportIds].sort(),
    [...original.seats[0].supportIds].sort(),
  );
});

test("current yaw preserves bearing; tilted and explicitly open actual seats are not reclosed", () => {
  let project = fixture();
  const section = project.sections.find((row) => row.id === firstSectionId)!;
  project = transformSection(project, section.id, section.origin, [0, 0.63, 0]);
  assert.equal(first(project).seats[0].supportIds.length, 8);
  project = transformSection(
    project,
    section.id,
    section.origin,
    [0.1, 0.63, 0.2],
  );
  assert.equal(first(project).seats[0].state, "not-horizontal");
  assert.equal(first(project).seats[0].supportIds.length, 0);
  project = persistLidPose(fixture(), section.id, true);
  const before = JSON.stringify(project);
  assert.equal(first(project).seats[0].state, "open");
  assert.equal(JSON.stringify(project), before);
});

test("actual downward gap, retained cut-away and overlapping rail are concrete geometry findings", () => {
  const project = fixture();
  const rail = project.pieces.find((piece) => piece.id === railId)!;
  rail.position[1] -= 0.0625;
  const gap = first(project);
  assert.ok(
    gap.findings.some(
      (row) => row.code === "seat-bearing-gap" && row.pieceIds.includes(railId),
    ),
  );
  assert.ok(!gap.seats[0].supportIds.includes(railId));
  rail.position[1] += 0.125;
  assert.equal(first(project).seats[0].state, "interference");
  const cut = fixture();
  cut.pieces.find((piece) => piece.id === lidId)!.cutPlanes = [
    { normal: [0, -1, 0], constant: 0 },
  ];
  assert.equal(first(cut).seats[0].state, "no-bearing-contact");
});

test("missing and ambiguous actual seat roles never fall back to names or generated geometry", () => {
  const project = fixture();
  project.pieces.find((piece) => piece.id === lidId)!.designRole = undefined;
  assert.equal(first(project).seats[0].state, "missing");
  project.pieces.find((piece) => piece.id === railId)!.designRole = "seat-lid";
  project.pieces.find((piece) => piece.id === legId)!.designRole = "seat-lid";
  assert.equal(first(project).seats[0].state, "ambiguous");
});

test("exact pair plan does not satisfy other contacts sharing one member; empty/blank records stay distinct", () => {
  let project = pendingFrame();
  const target = pair(project, railId, legId);
  assert.equal(target.state, "started");
  assert.ok(
    first(project)
      .pairs.filter((row) => row.id !== target.id)
      .every((row) => row.state === "no-record"),
  );
  project = saveFastenerPlan(
    project,
    addFastenerLocation(project.fastenerPlans[0]),
  );
  assert.equal(pair(project, railId, legId).state, "needs-layout");
  assert.equal(first(project).seats[0].supportIds.length, 8);
});

test("current entered external W path stays exact; move, cut, offcut, delete and same-name replacement never rebind", () => {
  const { project, receiver, plan } = externalPath(),
    before = JSON.stringify(project);
  const original = pair(project, legId, receiver.id);
  assert.equal(original.kind, "existing-only");
  assert.equal(original.state, "paths-reviewed");
  assert.deepEqual(original.externalPieceIds, [receiver.id]);
  assert.ok(original.intentIds.includes(`wood-fastener:${plan.id}`));
  assert.equal(JSON.stringify(project), before);
  for (const change of ["move", "cut", "offcut", "delete", "replace"]) {
    const changed = structuredClone(project),
      actual = changed.pieces.find((piece) => piece.id === receiver.id)!;
    if (change === "move") actual.position[0] += 1;
    if (change === "cut")
      actual.cutPlanes = [{ normal: [0, 1, 0], constant: 0 }];
    if (change === "offcut") actual.offcut = true;
    if (change === "delete" || change === "replace")
      changed.pieces = changed.pieces.filter(
        (piece) => piece.id !== receiver.id,
      );
    if (change === "replace") changed.pieces.push({ ...actual, id: uid() });
    const row = pair(changed, legId, receiver.id);
    assert.equal(row.state, "excluded", change);
    assert.deepEqual(changed.fastenerPlans[0], plan, change);
  }
});

test("current C blank entries stay layout-pending and whole C conflict excludes schedule intent", () => {
  let project = fixture();
  project = saveConnectorPlan(
    project,
    makeConnectorPlan(project, railId, legId),
  );
  assert.equal(pair(project, railId, legId).state, "needs-layout");
  project.connectorPlans[0].entries[0].entranceLocal = [100, 0, 0];
  project.connectorPlans[0].entries[0].driveLocal = [0, -1, 0];
  assert.equal(pair(project, railId, legId).state, "excluded");
});

test("moved unplanned member is an orphan, not a guessed missing rail pairing", () => {
  const project = fixture();
  project.pieces.find((piece) => piece.id === legId)!.position[0] -= 12;
  const review = first(project);
  assert.ok(
    review.findings.some(
      (row) =>
        row.code === "frame-member-no-contact" && row.pieceIds.includes(legId),
    ),
  );
  assert.ok(!review.pairs.some((row) => row.pieceIds.includes(legId)));
});

test("explicit check cap is visible and suppresses false no-contact orphan deductions", () => {
  const reports = banquetteConstruction(fixture(), { maxChecks: 1 });
  assert.equal(
    reports.reduce((sum, row) => sum + row.enumeration.checkedPairs, 0),
    1,
  );
  assert.ok(
    reports.every(
      (row) => !row.enumeration.complete && row.enumeration.omittedPairs > 0,
    ),
  );
  assert.ok(
    reports.every((row) =>
      row.findings.some((finding) => finding.code === "enumeration-incomplete"),
    ),
  );
  assert.ok(
    reports.every(
      (row) =>
        !row.findings.some(
          (finding) => finding.code === "frame-member-no-contact",
        ),
    ),
  );
  assert.ok(reports.every((row) => row.seats[0].state === "incomplete"));
  assert.ok(
    reports.every(
      (row) =>
        !row.findings.some(
          (finding) => finding.code === "seat-no-bearing-contact",
        ),
    ),
  );
});

test("mixed W points retain the usable exact path and the conflicting location without clearing the pair", () => {
  let { project, receiver, plan } = externalPath();
  plan = addFastenerLocation(plan);
  plan.locations[1].entranceLocal = [-0.75, 100, 0];
  plan.locations[1].driveLocal = [1, 0, 0];
  project = saveFastenerPlan(project, plan);
  const before = JSON.stringify(project),
    row = pair(project, legId, receiver.id);
  assert.equal(row.state, "mixed");
  assert.equal(row.intents[0].state, "mixed");
  assert.deepEqual(
    row.intents[0].locationIds,
    plan.locations.map((location) => location.id),
  );
  assert.equal(JSON.stringify(project), before);
});

test("changed source SKU or superseded captured evidence stays excluded even when the same pair still touches", () => {
  const { project, receiver } = externalPath();
  for (const variant of ["source", "evidence"]) {
    const changed = structuredClone(project);
    if (variant === "source")
      changed.pieces.find((piece) => piece.id === receiver.id)!.material =
        "lowes-syp-2x4-8";
    else
      changed.fastenerPlans[0].productEvidenceRevision =
        "SYNTHETIC superseded evidence";
    const row = pair(changed, legId, receiver.id);
    assert.equal(row.contact?.state, "face-contact");
    assert.equal(row.state, "excluded", variant);
    assert.deepEqual(row.pieceIds, [legId, receiver.id].sort());
  }
});

test("all four current C centerlines remain fit-pending facts and a single bad entry excludes the whole exact pair", () => {
  let project = fixture(),
    plan = makeConnectorPlan(project, railId, legId);
  plan.entries = plan.entries.map((entry, index) => ({
    ...entry,
    entranceLocal:
      entry.role === "base"
        ? [index ? 1 : -1, 0, 0.75]
        : [0.75, 0, index === 2 ? -0.5 : 0.5],
    driveLocal: entry.role === "base" ? [0, 0, -1] : [-1, 0, 0],
    measurements: {
      woodEntryToTipDepth: 0.5,
      pilotDiameter: null,
      pilotDepth: null,
      basis: "SYNTHETIC wood centerline fixture; metal fit unknown",
      measuredAt: "2026-11-17T00:00:00.000Z",
    },
  }));
  project = saveConnectorPlan(project, plan);
  const review = connectorReviews(project)[0];
  assert.equal(
    review.entries.filter((entry) => entry.state === "path-reviewed").length,
    4,
  );
  assert.equal(pair(project, railId, legId).state, "paths-reviewed");
  project.connectorPlans[0].entries[0].entranceLocal = [100, 0, 0.75];
  const excluded = connectorReviews(project)[0];
  assert.equal(excluded.activeConnectorCount, 0);
  assert.equal(excluded.scheduledFastenerCount, 0);
  assert.equal(pair(project, railId, legId).state, "excluded");
  assert.equal(
    excluded.entries.filter((entry) => entry.state === "path-reviewed").length,
    3,
  );
});

test("large omitted candidate spaces are counted without emitting pair rows or false orphan claims", () => {
  const project = fixture(),
    section = project.sections.find((row) => row.id === firstSectionId)!,
    leg = project.pieces.find((piece) => piece.id === legId)!;
  for (let i = 0; i < 1000; i++) {
    const added = {
      ...structuredClone(leg),
      id: uid(),
      position: [100 + i * 4, leg.position[1], leg.position[2]] as [
        number,
        number,
        number,
      ],
    };
    project.pieces.push(added);
    section.pieceIds.push(added.id);
  }
  const review = banquetteConstruction(project, { maxChecks: 0 }).find(
    (row) => row.sectionId === firstSectionId,
  )!;
  assert.ok(review.enumeration.possiblePairs > 500000);
  assert.equal(review.enumeration.checkedPairs, 0);
  assert.equal(
    review.enumeration.omittedPairs,
    review.enumeration.possiblePairs,
  );
  assert.equal(review.pairs.length, 0);
  assert.equal(review.enumeration.complete, false);
  assert.equal(review.seats[0].state, "incomplete");
  assert.ok(
    !review.findings.some((row) => row.code === "frame-member-no-contact"),
  );
});

test("schema-valid numerically unreviewable seat is unsupported instead of throwing from the report", () => {
  const project = fixture();
  project.pieces.find((piece) => piece.id === lidId)!.size[0] = 1e-12;
  assert.equal(projectSchema.safeParse(project).success, true);
  const before = JSON.stringify(project),
    review = first(project);
  assert.equal(review.seats[0].state, "unsupported");
  assert.equal(review.seats[0].supportIds.length, 0);
  assert.ok(
    review.findings.some((finding) => finding.code === "seat-unsupported"),
  );
  assert.equal(JSON.stringify(project), before);
});

test("actual horizontal current lid geometry takes precedence over an unchanged saved open flag", () => {
  const project = fixture();
  project.sections.find((row) => row.id === firstSectionId)!.recipe!.lidOpen =
    true;
  const before = JSON.stringify(project),
    review = first(project);
  assert.equal(review.seats[0].state, "contacts-found");
  assert.equal(review.seats[0].supportIds.length, 8);
  assert.ok(
    review.findings.some(
      (finding) => finding.code === "lid-pose-flag-mismatch",
    ),
  );
  assert.equal(JSON.stringify(project), before);
});

test("bounded geometry scope follows stable IDs while output retains declared module order", () => {
  const project = fixture(),
    before = banquetteConstruction(project, { maxChecks: 16 });
  const changed = {
    ...project,
    sections: [...project.sections].reverse().map((section) => ({
      ...section,
      pieceIds: [...section.pieceIds].reverse(),
    })),
    pieces: [...project.pieces].reverse(),
  };
  const after = banquetteConstruction(changed, { maxChecks: 16 });
  assert.deepEqual(
    after.map((row) => row.sectionId),
    changed.sections.map((section) => section.id),
  );
  for (const prior of before) {
    const current = after.find((row) => row.sectionId === prior.sectionId)!;
    assert.deepEqual(current.enumeration, prior.enumeration);
    assert.deepEqual(current.pairs, prior.pairs);
    assert.deepEqual(current.seats, prior.seats);
  }
});

test("a reversed horizontal panel uses its actual downward local+Y face, including retained profile material", () => {
  const project = fixture(),
    lid = project.pieces.find((piece) => piece.id === lidId)!;
  lid.rotation = [0, 0, Math.PI];
  let review = first(project).seats[0];
  assert.equal(review.state, "contacts-found");
  assert.equal(review.supportIds.length, 8);
  assert.ok(
    review.undersideNormal && Math.abs(review.undersideNormal[1] + 1) < 1e-12,
  );
  lid.cutPlanes = [{ normal: [0, -1, 0], constant: 0 }];
  review = first(project).seats[0];
  assert.equal(review.state, "contacts-found");
  assert.equal(review.supportIds.length, 8);
  lid.cutPlanes = [{ normal: [0, 1, 0], constant: 0 }];
  review = first(project).seats[0];
  assert.equal(review.state, "no-bearing-contact");
  assert.equal(review.supportIds.length, 0);
});

test("schema-valid unreviewable support remains unknown, not an absent bearing or orphaned frame member", () => {
  const project = fixture();
  project.pieces.find((piece) => piece.id === railId)!.size[0] = 1e-12;
  assert.equal(projectSchema.safeParse(project).success, true);
  const before = JSON.stringify(project),
    review = first(project);
  assert.equal(review.seats[0].state, "incomplete");
  assert.equal(review.seats[0].supportIds.length, 7);
  assert.equal(review.enumeration.complete, false);
  assert.equal(review.enumeration.checkedPairs, 91);
  assert.equal(review.enumeration.omittedPairs, 0);
  assert.ok(
    review.findings.some(
      (finding) =>
        finding.code === "unsupported-member-contact" &&
        finding.pieceIds.includes(railId),
    ),
  );
  assert.ok(
    !review.findings.some(
      (finding) =>
        finding.code === "frame-member-no-contact" &&
        finding.pieceIds.includes(railId),
    ),
  );
  assert.ok(
    !review.findings.some(
      (finding) => finding.code === "seat-no-bearing-contact",
    ),
  );
  assert.equal(JSON.stringify(project), before);
});
