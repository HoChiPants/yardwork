import { addFastenerLocation, makeFastenerPlan, saveFastenerPlan } from "../../src/fastenings";
import { blank, part, type V3 } from "../../src/model";

export function fastenerDistanceStudy(entrance: V3 = [8, 0.75, 1.5], trimReceiver = false) {
  const project = blank("Framing screw edge-distance study");
  const stepId = project.steps[0].id;
  const head = part("Top board", "stud", [18, 1.5, 3.5], [0, 2.25, 0], stepId, "Framing");
  const receiver = part("Receiving board", "stud", [18, 1.5, 3.5], [0, 0.75, 0], stepId, "Framing");
  if (trimReceiver) receiver.cutPlanes = [{ normal: [1, 0, 0], constant: 8.5 }];
  project.pieces = [head, receiver];
  const plan = addFastenerLocation(makeFastenerPlan(project, head.id, receiver.id, {
    productId: "simpson-sdws16300qr150",
    measurements: {
      surfaceToTipDepth: 2.9, pilotDiameter: 0.0625, pilotDepth: 2.8,
      basis: "Synthetic distance comparison", measuredAt: "2024-10-01T12:00:00.000Z",
    },
  }));
  plan.locations[0].entranceLocal = entrance;
  plan.locations[0].driveLocal = [0, -1, 0];
  return { project: saveFastenerPlan(project, plan), plan, head, receiver };
}
