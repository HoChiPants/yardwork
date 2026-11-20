import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProjectStore } from "../server/storage";
import { bearingConnections } from "../src/bearingConnections";
import {
  clearBearingDecision,
  saveBearingDecision,
} from "../src/bearingDecisions";
import { connectionCoverage } from "../src/connectionCoverage";
import { connect, guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import {
  blank,
  part,
  projectSchema,
  type Project,
  type V3,
} from "../src/model";
import { composeRotation, rotate } from "../src/spatial";
import { reviewWoodSupport } from "../src/woodSupport";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";

function scenario() {
  const project = blank("Removable shelf");
  const step = project.steps[0].id;
  const shelf = part(
    "Shelf",
    "plywood",
    [18, 0.75, 12],
    [0, 1.875, 0],
    step,
    "Casework",
  );
  const cleat = part(
    "Cleat",
    "stud",
    [1.5, 1.5, 10],
    [0, 0.75, 0],
    step,
    "Casework",
  );
  project.pieces = [shelf, cleat];
  return { project, shelf, cleat };
}

const inspect = (project: Project) =>
  bearingConnections(
    project,
    reviewWoodSupport(project),
    connectionCoverage(project),
  );

test("a removable contact invalidates the guide, survives a shared rigid move, and flags actual fit changes", () => {
  const { project, shelf, cleat } = scenario();
  const guided = generateBuildGuide(project);
  const saved = saveBearingDecision(
    guided,
    shelf.id,
    cleat.id,
    "Lift the shelf off the cleat for service.",
  );
  assert.equal(guideIsCurrent(guided), true);
  assert.equal(guideIsCurrent(saved), false);
  assert.deepEqual(saved.pieces, guided.pieces);
  assert.deepEqual(saved.joints, guided.joints);
  assert.deepEqual(saved.supplies, guided.supplies);
  assert.equal(inspect(saved).pairs[0].decision!.state, "current");
  assert.match(
    guideMarkdown(saved),
    /P001 on P002 · Removable contact · Lift the shelf off the cleat for service\./,
  );

  const yaw: V3 = [0, Math.PI / 3, 0];
  const right = structuredClone(saved);
  for (const piece of right.pieces) {
    piece.position = rotate(piece.position, yaw).map(
      (n, i) => n + [3, 0, 2][i],
    ) as V3;
    piece.rotation = composeRotation(yaw, piece.rotation);
  }
  assert.equal(inspect(right).pairs[0].decision!.state, "current");

  right.pieces[0].position[0] += 0.25;
  assert.equal(inspect(right).pairs[0].decision!.state, "changed");
  assert.match(
    guideMarkdown(right),
    /Parts or placement changed · Lift the shelf/,
  );
  const reconfirmed = saveBearingDecision(
    right,
    shelf.id,
    cleat.id,
    "Rechecked for lift-off clearance.",
  );
  assert.equal(inspect(reconfirmed).pairs[0].decision!.state, "current");
  assert.equal(reconfirmed.bearingDecisions?.length, 1);

  reconfirmed.pieces[0].position[1] += 1;
  const moved = inspect(reconfirmed);
  assert.equal(moved.pairs.length, 0);
  assert.deepEqual(moved.withoutContact, reconfirmed.bearingDecisions);
  assert.match(
    guideMarkdown(reconfirmed),
    /The saved parts no longer bear on each other · Rechecked/,
  );
  assert.throws(
    () => saveBearingDecision(reconfirmed, shelf.id, cleat.id, "Unverified"),
    /no longer share/,
  );
  assert.equal(
    clearBearingDecision(reconfirmed, shelf.id, cleat.id).bearingDecisions,
    undefined,
  );
});

test("fastening records remain visible when the same two parts have an intended removable contact", () => {
  const { project, shelf, cleat } = scenario();
  const saved = saveBearingDecision(
    project,
    shelf.id,
    cleat.id,
    "Check access before lifting.",
  );
  const joined = connect(
    saved,
    shelf.id,
    cleat.id,
    project.steps[0].id,
    1,
    1.5,
  );
  const [pair] = inspect(joined).pairs;
  assert.equal(pair.records[0].state, "legacy-record");
  assert.equal(pair.decision?.state, "hardware");
  assert.match(
    guideMarkdown(joined),
    /Saved fastening or hinge details also use these parts · Check access/,
  );
  assert.equal(
    joined.bearingDecisions?.[0].note,
    "Check access before lifting.",
  );
  assert.equal(
    projectSchema.safeParse({
      ...joined,
      bearingDecisions: [
        ...joined.bearingDecisions!,
        ...joined.bearingDecisions!,
      ],
    }).success,
    false,
  );
  assert.throws(() => saveBearingDecision(project, shelf.id, cleat.id, "   "));
});

test("format 28 opens in memory and the current format saves the decision without altering geometry", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "yardwork-bearing-decisions-"),
  );
  try {
    const { project, shelf, cleat } = scenario();
    const file = join(directory, `${project.id}.json`);
    const before = JSON.stringify({
      project: { ...project, schemaVersion: 28 },
      revision: 3,
    });
    await writeFile(file, before);
    const store = new ProjectStore(directory);
    const loaded = (await store.get(project.id))!;
    assert.equal(loaded.project.bearingDecisions, undefined);
    assert.equal(await readFile(file, "utf8"), before);
    const draft = saveBearingDecision(
      loaded.project,
      shelf.id,
      cleat.id,
      "Lift vertically for access.",
    );
    const committed = await store.save(draft, loaded.revision);
    assert.equal(committed.revision, 4);
    const reopened = (await store.get(project.id))!;
    assert.equal(reopened.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.equal(inspect(reopened.project).pairs[0].decision?.state, "current");
    assert.deepEqual(reopened.project.pieces, project.pieces);
    assert.deepEqual(reopened.project.bearingDecisions, draft.bearingDecisions);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
