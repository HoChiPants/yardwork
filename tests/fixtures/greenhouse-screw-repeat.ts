import { createBuildStudy } from "../../src/buildFixtures";
import {
  retainedWoodFaces,
  reviewConnectionContact,
} from "../../src/connectionContacts";
import { previewEaveRoof } from "../../src/eaveStockFit";
import {
  greenhouseRoofAttachments,
  type RoofJoint,
} from "../../src/greenhouseRoofAttachments";
import { reviewGreenhouseRafterBearing } from "../../src/greenhouseRafterBearing";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../../src/fastenings";
import { type V3 } from "../../src/model";
import { inverseRotation, rotate } from "../../src/spatial";

export function greenhouseScrewRepeatFixture(
  kind: RoofJoint["kind"] = "rafter-block",
) {
  const frame = createBuildStudy("greenhouse").project;
  const [roof] = reviewGreenhouseRafterBearing(frame);
  const fitted = previewEaveRoof(frame, roof.rows[2].id, "stud", true).project;
  const joint = greenhouseRoofAttachments(fitted, [])[0].joints.filter(
    (row) => row.kind === kind,
  )[2];
  const [head, receiver] = joint.pieceIds.map((id) =>
    fitted.pieces.find((piece) => piece.id === id)!,
  );
  const inverse = inverseRotation(head.rotation);
  const entry = retainedWoodFaces(head).find(
    ({ normal }) => rotate(normal, inverse)[0] < -0.999,
  )!;
  const center = entry.points[0].map((_, i) =>
    entry.points.reduce(
      (total, point) => total + point[i] / entry.points.length,
      0,
    ),
  ) as V3;
  const interfacePoint = reviewConnectionContact(head, receiver, 0).center!;
  const direction = interfacePoint.map((value, i) => value - center[i]) as V3;
  const base = addFastenerLocation(
    makeFastenerPlan(fitted, head.id, receiver.id, {
      productId: "simpson-dsvt3r70",
      name: "Example roof screw marks",
    }),
  );
  const plan = {
    ...base,
    locations: [
      {
        ...base.locations[0],
        entranceLocal: rotate(
          center.map((value, i) => value - head.position[i]) as V3,
          inverse,
        ),
        driveLocal: rotate(
          direction.map((value) => value / Math.hypot(...direction)) as V3,
          inverse,
        ),
      },
    ],
  };
  return { project: saveFastenerPlan(fitted, plan), source: plan, joint };
}
