import type {
  ConnectionIntent,
  ConnectionIntentState,
} from "./connectionCoverage";
import {
  reviewGreenhouseRafterBearing,
  type RafterBearingReview,
} from "./greenhouseRafterBearing";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

const jointTypes = {
  "rafter-plate": "Rafter to wall plate",
  "rafter-block": "Rafter to eave block",
  "block-plate": "Eave block to wall plate",
  "rafter-ridge": "Rafter to ridge",
} as const;
type RoofJointKind = keyof typeof jointTypes;
export type RoofJoint = {
  id: string;
  kind: RoofJointKind;
  label: string;
  pieceIds: [string, string];
  contact: boolean;
  intents: ConnectionIntent[];
};
export type GreenhouseRoofAttachments = {
  entryId: string;
  title: string;
  joints: RoofJoint[];
};

const key = (a: string, b: string) => (a < b ? `${a}/${b}` : `${b}/${a}`);
const attachmentKinds = new Set([
  "wood-fastener",
  "angle-connector",
  "legacy-joint",
]);
const states: Record<ConnectionIntentState, string> = {
  started: "plan started",
  pending: "details pending",
  "geometry-reviewed": "geometry reviewed",
  "legacy-record": "quantity only",
  stale: "references changed",
  conflict: "conflict needs review",
};

export const greenhouseAttachmentScope =
  "Each row follows one pair of actual parts. Review the selected hardware, fastening schedule, access and site loads before building.";

/** Face contact creates a checklist row. Only an exact saved pair contributes fastening intent. */
export function greenhouseRoofAttachments(
  project: Project,
  intents: readonly ConnectionIntent[],
  roofs: readonly RafterBearingReview[] = reviewGreenhouseRafterBearing(
    project,
  ),
): GreenhouseRoofAttachments[] {
  const byPair = new Map<string, ConnectionIntent[]>();
  for (const intent of intents) {
    if (intent.pieceIds.length !== 2 || !attachmentKinds.has(intent.kind))
      continue;
    const [a, b] = intent.pieceIds,
      id = key(a, b);
    const current = byPair.get(id);
    if (current) current.push(intent);
    else byPair.set(id, [intent]);
  }
  return roofs.flatMap((roof) => {
    const joints = new Map<string, RoofJoint>();
    const add = (
      kind: RoofJointKind,
      a: string,
      b: string,
      contact: boolean,
    ) => {
      const id = key(a, b);
      if (a === b || joints.has(id)) return;
      joints.set(id, {
        id,
        kind,
        label: jointTypes[kind],
        pieceIds: [a, b],
        contact,
        intents: byPair.get(id) ?? [],
      });
    };
    const rafters = new Set(roof.rows.map(({ id }) => id));
    const plates = new Set(roof.plateIds);
    const ridges = new Set(roof.ridgeIds);
    const blocks = new Set(roof.fittedBlockIds);
    for (const { id, ridge, eave } of roof.rows) {
      for (const { supportIds } of ridge.patches)
        for (const member of supportIds) add("rafter-ridge", id, member, true);
      for (const {
        supportIds: [seat, ...underneath],
      } of eave.patches) {
        if (!underneath.length) {
          add("rafter-plate", id, seat, true);
          continue;
        }
        blocks.add(seat);
        add("rafter-block", id, seat, true);
        for (const plate of underneath) add("block-plate", seat, plate, true);
      }
    }
    // Saved plans remain reviewable when a previously modeled pair separates.
    for (const [
      {
        pieceIds: [a, b],
      },
    ] of byPair.values())
      for (const [upper, lower] of [
        [a, b],
        [b, a],
      ]) {
        if (rafters.has(upper)) {
          if (plates.has(lower)) add("rafter-plate", upper, lower, false);
          else if (blocks.has(lower)) add("rafter-block", upper, lower, false);
          else if (ridges.has(lower)) add("rafter-ridge", upper, lower, false);
        } else if (blocks.has(upper) && plates.has(lower))
          add("block-plate", upper, lower, false);
      }
    return joints.size
      ? [
          {
            entryId: roof.entryId,
            title: roof.title,
            joints: [...joints.values()],
          },
        ]
      : [];
  });
}

export function roofJointPairLabel(project: Project, joint: RoofJoint) {
  return joint.pieceIds.map((id) => partLabel(project, id)).join(" ↔ ");
}

const hasPlan = (joint: RoofJoint) =>
  joint.intents.some(({ kind }) => kind !== "legacy-joint");

export function roofJointIntentText(joint: RoofJoint) {
  const records = joint.intents.map(
    ({ label, state }) => `${label} · ${states[state]}`,
  );
  if (!hasPlan(joint)) records.unshift("Attachment plan needed");
  return records.join(", ");
}

export function roofAttachmentSummary(joints: readonly RoofJoint[]) {
  const unplanned = joints.filter((joint) => !hasPlan(joint)).length;
  const pending = joints.filter(
    (joint) =>
      !joint.contact ||
      joint.intents.some(
        ({ kind, state }) =>
          kind !== "legacy-joint" && state !== "geometry-reviewed",
      ),
  ).length;
  return {
    line: `${joints.length} ${joints.length === 1 ? "joint" : "joints"} · ${unplanned} without a plan · ${pending} with fit or plan details to review.`,
    needsReview: unplanned > 0 || pending > 0,
  };
}

export function greenhouseRoofAttachmentLines(
  project: Project,
  reviews: readonly GreenhouseRoofAttachments[],
) {
  return reviews.flatMap(({ title, joints }) => [
    `${title} · ${roofAttachmentSummary(joints).line}`,
    ...joints.map(
      (joint) =>
        `${joint.label} ${roofJointPairLabel(project, joint)} · ${joint.contact ? "Wood face contact" : "Check fit"} · ${roofJointIntentText(joint)}`,
    ),
  ]);
}
