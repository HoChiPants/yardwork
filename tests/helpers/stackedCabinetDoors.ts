import { saveMotionPlan } from "../../src/mechanismMotion";
import { blank, part, type V3 } from "../../src/model";

export function stackedCabinetDoors(gap = 1 / 16) {
  const base = blank("Stacked cabinet doors");
  const stepId = base.steps[0].id;
  const lower = part("Lower door", "plywood", [24, 24, 0.75], [0, 12, 0], stepId, "Cabinet doors");
  const upper = part("Upper door", "plywood", [24, 24, 0.75], [0, 36 + gap, 0], stepId, "Cabinet doors");
  function hinge(body: typeof lower) {
    return {
      label: body.name, memberIds: [body.id], mechanism: {
        kind: "hinge" as const, axis: [0, 1, 0] as V3, pivot: [-12, body.position[1], 0] as V3, travel: 90,
      },
    };
  }
  const first = saveMotionPlan({ ...base, pieces: [lower, upper] }, hinge(lower));
  const second = saveMotionPlan(first.project, hinge(upper));
  return { project: second.project, lower, upper, selected: first.plan, companion: second.plan };
}
