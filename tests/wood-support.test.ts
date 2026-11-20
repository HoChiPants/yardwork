import assert from "node:assert/strict";
import test from "node:test";
import { buildFixtureIds, createBuildStudy } from "../src/buildFixtures";
import { bounds, guideMarkdown, validate } from "../src/engine";
import { blank, part, type V3 } from "../src/model";
import { reviewWoodSupport, woodSupportPath } from "../src/woodSupport";

function fixture() {
  const project = blank("Wood bearing trace");
  const wood = (name: string, size: V3, position: V3) =>
    part(name, "stud", size, position, project.steps[0].id, "Bearing");
  return { project, wood };
}

test("wood path follows actual contacts and stops at a raised base, even when the stack still touches", () => {
  const { project, wood } = fixture();
  const base = wood("Base", [8, 2, 8], [0, 1, 0]);
  const spacer = wood("Spacer", [3, 2, 3], [0, 3, 0]);
  const top = wood("Top", [10, 1, 8], [0, 4.5, 0]);
  project.pieces = [top, spacer, base];
  const before = structuredClone(project);
  let trace = reviewWoodSupport(project);
  assert.deepEqual(
    woodSupportPath(trace, top.id).map((part) => part.id),
    [spacer.id, base.id],
  );
  assert.equal(trace.get(base.id)!.onFloor, true);
  assert.equal(
    validate(project).find((finding) => finding.id === "floating"),
    undefined,
  );
  assert.deepEqual(project, before);

  for (const part of project.pieces) part.position[1] += 0.125;
  trace = reviewWoodSupport(project);
  assert.deepEqual(trace.get(top.id)!.supports, [
    { pieceId: spacer.id, area: 9 },
  ]);
  assert.deepEqual(woodSupportPath(trace, top.id), []);
  const finding = validate(project).find(
    (finding) => finding.id === "floating",
  )!;
  assert.deepEqual(finding.connectionScope?.memberIds, [
    top.id,
    spacer.id,
    base.id,
  ]);
  assert.match(
    guideMarkdown(project),
    /Wood contact to floor[\s\S]+0 of 3 modeled wood parts[\s\S]+P001 · Top · Touches P002 below/,
  );
});

test("sloped patches can carry a contact path while the discarded corner and floor edge cannot", () => {
  const { project, wood } = fixture();
  const diag = Math.SQRT1_2;
  const base = wood("Sloped base", [8, 8, 4], [0, 4, 0]);
  base.cutPlanes = [{ normal: [diag, diag, 0], constant: 0 }];
  const phantom = wood("Over removed corner", [1, 2, 3], [3.25, 9, 0]);
  const wedge = wood("Seated wedge", [4, 6, 3], [0, 5, 0]);
  wedge.cutPlanes = [{ normal: [-diag, -diag, 0], constant: diag }];
  const tipped = wood("Floor edge only", [2, 2, 3], [20, 0, 0]);
  tipped.rotation[2] = Math.PI / 4;
  tipped.position[1] = -bounds(tipped).min[1];
  project.pieces = [base, phantom, wedge, tipped];
  assert.ok(Math.abs(bounds(phantom).min[1] - bounds(base).max[1]) < 1e-7);
  const trace = reviewWoodSupport(project);
  assert.equal(trace.get(base.id)!.onFloor, true);
  assert.deepEqual(
    woodSupportPath(trace, wedge.id).map((part) => part.id),
    [base.id],
  );
  assert.deepEqual(trace.get(phantom.id)!.supports, []);
  assert.equal(trace.get(tipped.id)!.onFloor, false);
});

for (const id of buildFixtureIds) {
  test(`${id} reports reachable floor contacts from the actual default framing`, () => {
    const { project, structure } = createBuildStudy(id);
    const trace = reviewWoodSupport(project);
    assert.ok(trace.size > 0);
    assert.match(guideMarkdown(project), /## Wood contact to floor/);
    if (id === "greenhouse" || id === "sauna") {
      const framing = new Set(structure!.geometryRoles["door-opening-framing"]);
      const header = project.pieces.find(
        (part) => framing.has(part.id) && part.name.endsWith(" · door header"),
      )!;
      const jacks = project.pieces.filter(
        (part) =>
          framing.has(part.id) &&
          part.name.endsWith(" · jack stud under header"),
      );
      assert.equal(jacks.length, 2);
      assert.deepEqual(
        trace.get(header.id)!.supports.map(({ pieceId }) => pieceId),
        jacks.map((part) => part.id),
      );
      assert.ok(
        jacks.every((jack) =>
          woodSupportPath(trace, jack.id)[0].name.endsWith(
            " · bottom plate beside opening",
          ),
        ),
      );
      assert.ok(
        [...trace.values()]
          .filter(({ piece }) => framing.has(piece.id))
          .every((row) => row.next || row.onFloor),
      );
      const [left, right] = jacks.map(bounds);
      assert.equal(right.min[0] - left.max[0], id === "greenhouse" ? 30 : 28);
    }
  });
}
