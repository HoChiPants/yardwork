import { test } from "node:test";
import assert from "node:assert/strict";
import { blank, part } from "../src/model";
import { addMaterial, connect } from "../src/engine";
import { homeDepotHandoff } from "../src/handoff";
import { homeDepotAssemblyPurchaseReview } from "../src/handoffPurchases";
function frame() {
  const project = blank("Hardware purchase study");
  project.pieces = [
    part(
      "Left\nrail",
      "stud",
      [1.5, 36, 3.5],
      [0, 18, 0],
      project.steps[0].id,
      "Frame",
    ),
    part(
      "Right rail",
      "stud",
      [1.5, 36, 3.5],
      [1.5, 18, 0],
      project.steps[0].id,
      "Frame",
    ),
  ];
  return project;
}
test("unresolved legacy hardware makes the handoff incomplete instead of inventing a purchase size", () => {
  let p = frame();
  p = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 8, 3);
  delete p.joints[0].material;
  p.joints[0].length = 2;
  const text = homeDepotHandoff(p);
  assert.match(text, /INCOMPLETE MATERIAL LIST/);
  assert.match(text, /UNRESOLVED HARDWARE — excluded from purchase quantities/);
  assert.match(text, /8 × 2 in screw: Left rail → Right rail/);
  assert.match(text, /no substitute has been counted/);
  assert.ok(!text.includes("— Exterior wood screws"));
  assert.ok(!text.includes("Left\nrail"));
});
test("supported hardware lengths and kinds remain separate purchases", () => {
  let p = frame();
  const a = p.pieces[0].id,
    b = p.pieces[1].id,
    stepId = p.steps[0].id;
  p = connect(p, a, b, stepId, 4, 1.25, "screw", "screw-short");
  p = connect(p, a, b, stepId, 4, 3, "nail", "nail");
  p = connect(p, a, b, stepId, 3, 3, "bracket", "bracket");
  const text = homeDepotHandoff(p);
  assert.match(text, /MATERIAL LIST FOR REVIEW/);
  assert.ok(!text.includes("INCOMPLETE"));
  assert.match(text, /1 100 pack — 1¼ in wood screws/);
  assert.match(text, /1 100 pack — 3 in framing nails/);
  assert.match(text, /3 each — 2 in angle bracket/);
  assert.ok(!text.includes("eachs"));
});
test("physical hardware and connection records trigger a review without silently deduplicating", () => {
  let p = frame();
  p = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 100, 3);
  p = addMaterial(p, "screw", [10, 0, 0], p.steps[0].id);
  const text = homeDepotHandoff(p);
  assert.match(text, /INCOMPLETE MATERIAL LIST/);
  assert.match(text, /POSSIBLE HARDWARE DOUBLE COUNTING/);
  assert.match(
    text,
    /1 placed item\(s\) \+ 100 item\(s\) specified by connections/,
  );
  assert.match(text, /2 100 packs — Exterior wood screws/);
  assert.match(text, /no automatic deduction/);
  assert.ok(!text.includes("UNRESOLVED HARDWARE"));
});
test("different hardware materials do not produce a false double-count question", () => {
  let p = frame();
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    4,
    3,
    "nail",
    "nail",
  );
  p = addMaterial(p, "screw", [10, 0, 0], p.steps[0].id);
  assert.ok(!homeDepotHandoff(p).includes("DOUBLE COUNTING"));
  assert.ok(!homeDepotHandoff(p).includes("INCOMPLETE"));
});

test("loose stock is a purchase without an implied assembly", () => {
  let project = blank("Two loose boards");
  project = addMaterial(project, "stud", [0, 0, 0], project.steps[0].id);
  project = addMaterial(project, "stud", [12, 0, 0], project.steps[0].id);
  assert.deepEqual(homeDepotAssemblyPurchaseReview(project), {
    scopeNotes: [], connections: [], incomplete: false,
  });
  const text = homeDepotHandoff(project);
  assert.match(text, /MATERIAL LIST FOR REVIEW/);
  assert.doesNotMatch(text, /ASSEMBLY CONNECTIONS TO REVIEW/);
  assert.match(text, /2 boards — 2 × 4 framing lumber/);
});
