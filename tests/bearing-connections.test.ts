import assert from "node:assert/strict";
import test from "node:test";
import {
  bearingConnectionGuideLines,
  bearingConnections,
  summarizeBearingConnections,
} from "../src/bearingConnections";
import { buildFixtureIds, createBuildStudy } from "../src/buildFixtures";
import { connectionCoverage } from "../src/connectionCoverage";
import { connect, guideMarkdown } from "../src/engine";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { blank, part } from "../src/model";
import { reviewPanelBearing } from "../src/panelBearing";
import { reviewWoodSupport } from "../src/woodSupport";

test("a bearing record is scoped to the exact pair and tracks live contact after editing", () => {
  let project = blank("Bearing connections");
  const step = project.steps[0].id;
  const board = part(
    "Top board",
    "stud",
    [12, 1.5, 3.5],
    [0, 4.25, 0],
    step,
    "Framing",
  );
  const left = part(
    "Left block",
    "stud",
    [1.5, 3.5, 3.5],
    [-3, 1.75, 0],
    step,
    "Framing",
  );
  const right = part(
    "Right block",
    "stud",
    [1.5, 3.5, 3.5],
    [3, 1.75, 0],
    step,
    "Framing",
  );
  project.pieces = [board, left, right];
  project = connect(project, left.id, board.id, step, 4, 3);
  const derive = () =>
    bearingConnections(
      project,
      reviewWoodSupport(project),
      connectionCoverage(project),
    ).pairs;
  const before = structuredClone(project);

  const [first, second] = derive();
  assert.deepEqual(
    [first.top.id, first.base.id, first.area],
    [board.id, left.id, 5.25],
  );
  assert.equal(first.records[0].state, "legacy-record");
  assert.equal(second.base.id, right.id);
  assert.deepEqual(second.records, []);
  assert.doesNotMatch(
    summarizeBearingConnections([first, second]),
    /[1-9] with geometry-reviewed/,
  );
  assert.deepEqual(project, before);

  project = saveFastenerPlan(
    project,
    makeFastenerPlan(project, board.id, right.id),
  );
  const updated = derive();
  assert.equal(updated[1].records[0].state, "started");
  assert.match(
    guideMarkdown(project),
    /## Bearing joints[\s\S]+2 touching wood pairs · 0 without pair records · 2 with detail to review · 0 with geometry-reviewed locations/,
  );
  project.pieces[2].position[0] = 15;
  assert.equal(derive().length, 1);
  assert.equal(project.fastenerPlans.length, 1);
});

for (const id of buildFixtureIds) {
  test(`${id} bearing guide accounts for each contact once across its stages`, () => {
    const { project } = createBuildStudy(id);
    if (id === "shelves") {
      assert.equal(
        bearingConnections(
          project,
          reviewWoodSupport(project),
          connectionCoverage(project),
        ).pairs.length,
        0,
      );
      const [{ piece: shelf }] = reviewPanelBearing(project);
      const [x, y, z] = shelf.position;
      const cleat = part(
        "Shelf cleat",
        "stud",
        [1.5, 1.5, 10],
        [x, y - shelf.size[1] / 2 - 0.75, z],
        shelf.stepId,
        shelf.assembly,
      );
      project.pieces.push(cleat);
    }
    const coverage = connectionCoverage(project);
    const review = bearingConnections(
      project,
      reviewWoodSupport(project),
      coverage,
    );
    const contacts = review.pairs;
    const lines = bearingConnectionGuideLines(project, review, coverage);
    assert.ok(contacts.length > 0);
    assert.equal(
      lines.reduce(
        (total, line) =>
          total + Number(line.match(/ · (\d+) touching wood/)![1]),
        0,
      ),
      contacts.length,
    );
    assert.ok(
      contacts.every(
        (joint) => joint.top.id !== joint.base.id && joint.area > 0,
      ),
    );
  });
}
