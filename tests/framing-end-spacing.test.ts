import test from "node:test";
import assert from "node:assert/strict";
import { blank, type Project } from "../src/model";
import { buildSaunaCabin, buildGreenhouse } from "../src/structures";
import { prepareCollisionSolid, solidOverlap } from "../src/solidCollision";
import { bounds } from "../src/engine";

function collisions(project: Project) {
  const solids = project.pieces.map((piece) => ({
      piece,
      solid: prepareCollisionSolid(piece),
    })),
    pairs: string[] = [];
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++)
      if (
        solids[i].solid?.kind === "solid" &&
        solids[j].solid?.kind === "solid" &&
        solidOverlap(solids[i].solid!, solids[j].solid!, 1e-6)
      )
        pairs.push(
          `${solids[i].piece.name} @ ${solids[i].piece.position} ↔ ${solids[j].piece.name} @ ${solids[j].piece.position}`,
        );
  return pairs;
}

test("the default sauna retains its envelope and members without overlapping the terminal studs or ceiling joist", () => {
  const p = buildSaunaCabin(blank(), {
    clearWidth: 72,
    clearDepth: 72,
    clearHeight: 84,
  }).project;
  assert.equal(p.pieces.length, 48);
  assert.deepEqual(collisions(p), []);
  const boxes = p.pieces.map(bounds);
  assert.ok(
    Math.abs(
      Math.max(...boxes.map((box) => box.max[0])) -
        Math.min(...boxes.map((box) => box.min[0])) -
        82,
    ) < 1e-8,
  );
  assert.ok(
    Math.abs(
      Math.max(...boxes.map((box) => box.max[2])) -
        Math.min(...boxes.map((box) => box.min[2])) -
        82,
    ) < 1e-8,
  );
});

test("terminal framing stays nonintersecting around the near-grid boundary for both structure families and full world yaw", () => {
  for (const width of [71.9, 72, 72.1]) {
    const sauna = buildSaunaCabin(blank(), {
      clearWidth: width,
      clearDepth: width,
      clearHeight: 84,
      yaw: 37,
      origin: [7, 0, -11],
    }).project;
    assert.deepEqual(collisions(sauna), [], `sauna width ${width}`);
    const greenhouse = buildGreenhouse(blank(), {
      width: width + 10,
      depth: width + 10,
      eaveHeight: 84,
      roofRise: 24,
      doorWidth: 30,
      doorHeight: 68,
      yaw: 37,
      origin: [7, 0, -11],
    }).project;
    assert.deepEqual(
      collisions(greenhouse),
      [],
      `greenhouse width ${width + 10}`,
    );
  }
});
