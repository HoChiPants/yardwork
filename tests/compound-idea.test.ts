import assert from "node:assert/strict";
import { test } from "node:test";
import { compoundIdeaRequest } from "../src/compositeIdea";
import { bounds } from "../src/engine";
import { blank } from "../src/model";
import { localIdeaPlan, previewIdeaPlan } from "../src/planning";

const prompt = "Build a 72 in wide, 24 in deep, 18 in tall storage banquette with three sections and lift-up lids. No back. Add a 30 in wide, 14 in deep, 66 in tall plywood bookcase with four shelves to its right, with a 3 in gap.";
const workZone = { width: 126, depth: 66, height: 96 };

test("keeps both designs and fits a measured gap using the geometry inside the work zone", () => {
  const plan = localIdeaPlan({ prompt, workZone });
  assert.equal(plan.pendingPlacement, undefined);
  assert.equal(plan.modules.length, 3);
  assert.ok(plan.modules.every((m) => m.width === 24 && m.depth === 24 && m.height === 18 &&
    m.storage && m.openingLid && !m.backHeight));
  assert.equal(plan.structures.length, 1);
  const bookcase = plan.structures[0];
  assert.equal(bookcase.kind, "casework-shelves");
  assert.deepEqual([bookcase.parameters.width, bookcase.parameters.depth, bookcase.parameters.height, bookcase.parameters.shelfCount],
    [30, 14, 66, 4]);
  const preview = previewIdeaPlan({ ...blank(), workZone }, plan);
  const entries = preview.project.ideaBindings[0].entries;
  const entryBounds = entries.map((entry) => {
    const sections = new Set(entry.sections.map(({ sectionId }) => sectionId));
    const members = new Set(preview.project.sections.filter(({ id }) => sections.has(id)).flatMap(({ pieceIds }) => pieceIds));
    return preview.project.pieces.filter(({ id }) => members.has(id)).map(bounds);
  });
  const seatRight = Math.max(...entryBounds.slice(0, 3).flat().map(({ max }) => max[0]));
  const caseworkLeft = Math.min(...entryBounds[3].map(({ min }) => min[0]));
  assert.ok(Math.abs(caseworkLeft - seatRight - 3) < 0.001);
  assert.ok(preview.min[0] >= -63.001 && preview.max[0] <= 63.001);
  assert.ok(preview.min[2] >= -33.001 && preview.max[2] <= 33.001);
  const revised = localIdeaPlan({ prompt: "Make the plywood bookcase have five shelves.", previousPlan: plan });
  assert.deepEqual(revised.modules, plan.modules);
  assert.deepEqual(revised.structures[0].parameters.origin, bookcase.parameters.origin);
  const revisedBookcase = revised.structures[0];
  assert.equal(revisedBookcase.kind, "casework-shelves");
  assert.equal(revisedBookcase.parameters.shelfCount, 5);
});

test("keeps requested geometry when a gap is missing units or the full layout cannot fit", () => {
  const narrow = localIdeaPlan({ prompt, workZone: { ...workZone, width: 95 } });
  assert.equal(narrow.modules.length, 3);
  assert.equal(narrow.structures.length, 1);
  assert.match(narrow.pendingPlacement![0].question, /needs more room/);
  const units = localIdeaPlan({ prompt: prompt.replace("3 in gap", "3 gap"), workZone });
  assert.match(units.pendingPlacement![0].question, /with units/);
  assert.equal(units.structures.length, 1);
});

test("independent additions leave the existing pose in place and keep feature requests together", () => {
  assert.equal(compoundIdeaRequest({ prompt: "Build a banquette and make the seats open and add storage." }), null);
  const previousPlan = localIdeaPlan({ prompt: "Build a bench 60 in wide, 24 in deep and 18 in high with no back." });
  previousPlan.modules[0].position = [-20, 0, -20];
  const next = localIdeaPlan({
    prompt: "Add a 22 in wide, 12 in deep, 48 in tall plywood bookcase to its right, with a 4 in gap. Add a 22 in wide cabinet to the left of the bench with a 6 in gap.",
    previousPlan,
  });
  assert.deepEqual(next.modules[0], previousPlan.modules[0]);
  assert.equal(next.structures[0].kind, "casework-shelves");
  assert.equal(next.modules[1].kind, "cabinet");
  assert.equal(next.pendingPlacement, undefined);
});

test("seat measurements stay with the banquette instead of creating a phantom module", () => {
  for (const prompt of [
    "Build a straight 72 in storage banquette with three sections, a finished seat height of 18 in, opening lids, and no back.",
    "Build a straight banquette with three 24-inch-wide sections. Each section has 18 in seat height, 24 in depth, enclosed storage, opening lids, and no back.",
  ]) {
    assert.equal(compoundIdeaRequest({ prompt }), null);
    const plan = localIdeaPlan({ prompt });
    assert.equal(plan.modules.length, 3);
    assert.ok(plan.modules.every(({ width, height, openingLid, storage, backHeight }) =>
      width === 24 && height === 18 && openingLid && storage && backHeight === 0));
  }
  const conflicting = localIdeaPlan({ prompt: "Build a straight 84 in wide banquette with three 24 in wide sections." });
  assert.equal(conflicting.modules.length, 0);
  assert.match(conflicting.questions[0], /widths disagree/);
});
