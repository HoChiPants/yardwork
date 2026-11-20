import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { saveMotionPlan } from "../src/mechanismMotion";
import { blank, projectSchema } from "../src/model";
import { cedarbrookBenches } from "../src/saunaBenchReference";
import {
  reviewSaunaBenchTravel,
  saunaBenchLegPreview,
  saunaBenchTravelRooms,
  saveSaunaBenchTravel,
} from "../src/saunaBenchTravel";
import { cedarbrookDoor } from "../src/saunaDoorReference";
import { saunaDoorMotionInput } from "../src/saunaDoors";
import { harviaKit } from "../src/saunaHeaterReference";
import { saveSaunaHeater } from "../src/saunaHeaters";
import { rotate } from "../src/spatial";

function fixture(withDoor = false) {
  const bench = cedarbrookBenches[1];
  const selections = {
    saunaBench: {
      materialId: bench.materialId,
      productRegistryRef: bench.productId,
    },
    ...(withDoor
      ? {
          saunaDoor: {
            materialId: cedarbrookDoor.materialId,
            productRegistryRef: cedarbrookDoor.productId,
          },
        }
      : {}),
  };
  const opening = withDoor
    ? {
        doorWidth: cedarbrookDoor.roughWidth,
        doorHeight: cedarbrookDoor.roughHeight,
      }
    : {};
  const { project } = createBuildStudy(
    "sauna",
    {
      ...defaultBuildStudyParameters("sauna"),
      ...opening,
    },
    blank(),
    selections,
  );
  const roomId = saunaBenchTravelRooms(project)[0].entry.id;
  const heated = saveSaunaHeater(project, roomId, {
    productId: harviaKit.productId,
    wall: "right",
    offset: 0,
    bottom: 10,
    supply: "240",
    uninsulatedWallArea: 0,
    notes: "",
  });
  return { project, roomId, heated };
}

const measured = {
  openingOffset: 0,
  openingWidth: 24,
  openingHeight: 69,
  sillRise: 1,
  passageDepth: 5,
  lift: 2,
  turnOffset: 0,
  heaterPlaced: false,
};

test("an assembled sauna bench completes a measured route and stops at the heater during the turn", () => {
  const { heated, roomId } = fixture();
  const before = saveSaunaBenchTravel(heated, roomId, measured);
  const [plan] = before.saunaBenchTravelPlans;
  const route = reviewSaunaBenchTravel(before, plan);
  assert.equal(route.state, "clear", route.detail);
  assert.deepEqual(
    route.legs.map(({ kind, amount }) => [kind, amount]),
    [
      ["slide", 72],
      ["hinge", 90],
      ["slide", 27],
      ["slide", 2],
    ],
  );
  const end = saunaBenchLegPreview(route.legs[3], 2).pieces[0];
  const bench = before.pieces.find((piece) => piece.id === plan.benchId)!;
  assert.deepEqual(end.position, bench.position);
  assert.ok(
    rotate([1, 0, 0], end.rotation).every(
      (value, i) =>
        Math.abs(value - rotate([1, 0, 0], bench.rotation)[i]) < 1e-7,
    ),
  );
  assert.deepEqual(before.pieces, heated.pieces);

  const after = saveSaunaBenchTravel(before, roomId, {
    ...measured,
    heaterPlaced: true,
  });
  const blocked = reviewSaunaBenchTravel(after, after.saunaBenchTravelPlans[0]);
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.legs.length, 2);
  const turn = blocked.legs[1];
  assert.equal(turn.blocker, "Modeled heater body");
  assert.ok(turn.limit.travel > 50 && turn.limit.travel < 55);
  const pose = saunaBenchLegPreview(turn, turn.limit.travel, true);
  assert.match(pose.obstacleNames[0], /Modeled heater body/);
  assert.ok(pose.interferenceIds.includes(pose.obstaclePieces![0].id));
  assert.match(
    guideMarkdown(before),
    /Sauna bench carry-in[\s\S]*Lower onto the finished floor/,
  );
  assert.match(
    guideMarkdown(after),
    /Heater body in place[\s\S]*Modeled heater body/,
  );
  const guided = generateBuildGuide(before);
  assert.equal(guideIsCurrent(guided), true);
  assert.equal(
    guideIsCurrent({
      ...guided,
      saunaBenchTravelPlans: after.saunaBenchTravelPlans,
    }),
    false,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(after)))
      .saunaBenchTravelPlans,
    after.saunaBenchTravelPlans,
  );
  assert.equal(
    projectSchema.parse({ ...heated, schemaVersion: 60 }).saunaBenchTravelPlans,
    undefined,
  );
});

test("insufficient opening, threshold, or turning room stops a carry-in before playback", () => {
  const { project, roomId } = fixture();
  for (const [input, message] of [
    [{ openingWidth: 17.75 }, /needs 18/],
    [{ lift: 0.5 }, /above the sill/],
    [{ turnOffset: 7 }, /turning point/],
  ] as const) {
    const saved = saveSaunaBenchTravel(project, roomId, {
      ...measured,
      ...input,
    });
    const review = reviewSaunaBenchTravel(
      saved,
      saved.saunaBenchTravelPlans[0],
    );
    assert.equal(review.state, "blocked");
    assert.equal(review.legs.length, 0);
    assert.match(review.detail, message);
  }
  assert.throws(
    () =>
      saveSaunaBenchTravel(project, roomId, { ...measured, openingWidth: 29 }),
    /exceeds the modeled rough opening/,
  );

  const saved = saveSaunaBenchTravel(project, roomId, {
    ...measured,
    heaterPlaced: true,
  });
  const [plan] = saved.saunaBenchTravelPlans;
  assert.match(
    reviewSaunaBenchTravel(saved, plan).detail,
    /Save the heater body location/,
  );
  assert.match(
    reviewSaunaBenchTravel(saved, { ...plan, roughHeight: 61 }).detail,
    /opening has changed/,
  );
});

test("a modeled sauna door needs a reviewed parked angle before checking the carry-in", () => {
  const { project, roomId } = fixture(true);
  const planned = saveSaunaBenchTravel(project, roomId, {
    ...measured,
    openingWidth: 20,
    openingOffset: 1.5,
  });
  const [plan] = planned.saunaBenchTravelPlans;
  assert.match(
    reviewSaunaBenchTravel(planned, plan).detail,
    /Save an opening angle/,
  );
  const open = saveMotionPlan(
    planned,
    saunaDoorMotionInput(
      planned,
      {
        entryId: roomId,
        side: "left",
        outset: 0,
        sideOffset: 0,
      },
      90,
    ),
  );
  const route = reviewSaunaBenchTravel(open.project, plan);
  assert.equal(route.state, "clear", route.detail);
  assert.ok(saunaBenchLegPreview(route.legs[0], 0).pieces.length > 1);
});
