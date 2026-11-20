import {
  fastenerEntranceCovered,
  fastenerReviews,
  makeFastenerPlan,
  sameFastenerPairPose,
  saveFastenerPlan,
  type FastenerReview,
} from "./fastenings";
import { canonicalFastenerValue } from "./fastenerReferences";
import type { FastenerPlan } from "./fasteningSchema";
import {
  greenhouseRoofAttachments,
  roofJointPairLabel,
} from "./greenhouseRoofAttachments";
import { uid, type Piece, type Project, type Section, type V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";

const epsilon = 1e-6;
type Destination = Pick<Section, "id" | "name"> & { jointLabel?: string };
type Pair = { head: Piece; receiver: Piece };
type Target = Pair & {
  plan: FastenerPlan;
  floorAccess: boolean;
};
type RepeatRow =
  | { section: Destination; issue: string; target: null }
  | { section: Destination; issue: null; target: Target };
type RepeatScope = {
  kind: "modules" | "roof";
  candidates: { section: Destination; pairs: Pair[] }[];
};

function matchingPart(piece: Piece, source: Piece) {
  return (
    piece.designRole === source.designRole &&
    piece.material === source.material &&
    (piece.stockLengthAxis ?? null) === (source.stockLengthAxis ?? null) &&
    piece.size.every(
      (value, axis) => Math.abs(value - source.size[axis]) <= epsilon,
    ) &&
    piece.cutPlanes.length === source.cutPlanes.length &&
    piece.cutPlanes.every((plane, i) => {
      const other = source.cutPlanes[i];
      return (
        Math.abs(plane.constant - other.constant) <= epsilon &&
        plane.normal.every(
          (value, axis) => Math.abs(value - other.normal[axis]) <= epsilon,
        )
      );
    }) &&
    canonicalFastenerValue(pieceThroughOpenings(piece)) ===
      canonicalFastenerValue(pieceThroughOpenings(source))
  );
}

function moduleScope(
  project: Project,
  source: Pair,
  pieces: ReadonlyMap<string, Piece>,
): RepeatScope | null {
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  const owners = project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) =>
      entry.sections.flatMap((mapping) => {
        const section = sections.get(mapping.sectionId);
        return section?.pieceIds.includes(source.head.id) &&
          section.pieceIds.includes(source.receiver.id)
          ? [{ binding, entry, mapping }]
          : [];
      }),
    ),
  );
  if (owners.length !== 1) return null;
  const [{ binding, entry, mapping }] = owners;
  if (entry.spec.type !== "furniture") return null;
  const kind = entry.spec.recipe.kind;
  const candidates = binding.entries
    .filter(
      (candidate) =>
        candidate.id !== entry.id &&
        candidate.spec.type === "furniture" &&
        candidate.spec.recipe.kind === kind,
    )
    .flatMap((candidate) =>
      candidate.sections.flatMap((peer) => {
        const section = sections.get(peer.sectionId);
        if (
          peer.role !== mapping.role ||
          !section ||
          section.id === mapping.sectionId
        )
          return [];
        const members = section.pieceIds.flatMap((id) => pieces.get(id) ?? []);
        const heads = members.filter((part) => matchingPart(part, source.head));
        const receivers = members.filter((part) =>
          matchingPart(part, source.receiver),
        );
        return [
          {
            section,
            pairs: heads.flatMap((head) =>
              receivers.flatMap((receiver) =>
                head.id !== receiver.id &&
                sameFastenerPairPose(
                  source.head,
                  source.receiver,
                  head,
                  receiver,
                )
                  ? [{ head, receiver }]
                  : [],
              ),
            ),
          },
        ];
      }),
    );
  return { kind: "modules", candidates };
}

function roofPairPose(source: Pair, target: Pair) {
  const { head, receiver } = target;
  if (sameFastenerPairPose(source.head, source.receiver, head, receiver))
    return true;
  // The same uninterrupted receiving rail can support repeated entries at
  // several stations. Preserve the full local orientation and cross-section.
  if (
    receiver.id !== source.receiver.id ||
    receiver.cutPlanes.length ||
    pieceThroughOpenings(receiver).length
  )
    return false;
  const delta = source.receiver.position.map(
    (value, i) => value - source.head.position[i],
  ) as V3;
  const expected = rotate(
    rotate(delta, inverseRotation(source.head.rotation)),
    head.rotation,
  ).map((value, i) => value + head.position[i]) as V3;
  const drift = rotate(
    receiver.position.map((value, i) => value - expected[i]) as V3,
    inverseRotation(receiver.rotation),
  );
  drift[stockAxes(receiver).length] = 0;
  return (
    Math.hypot(...drift) <= epsilon &&
    sameFastenerPairPose(source.head, source.receiver, head, {
      ...receiver,
      position: expected,
    })
  );
}

function roofScope(
  project: Project,
  source: Pair,
  pieces: ReadonlyMap<string, Piece>,
): RepeatScope | null {
  if (
    ![source.head, source.receiver].some(
      ({ designRole }) =>
        designRole === "greenhouse-rafter" ||
        designRole === "greenhouse-eave-block",
    )
  )
    return null;
  const hasPair = ({ pieceIds }: { pieceIds: readonly string[] }) =>
    pieceIds.includes(source.head.id) && pieceIds.includes(source.receiver.id);
  const roof = greenhouseRoofAttachments(project, []).find(({ joints }) =>
    joints.some(hasPair),
  );
  if (!roof) return null;
  const original = roof.joints.find(hasPair)!;
  const headIsFirst = original.pieceIds[0] === source.head.id;
  return {
    kind: "roof",
    candidates: roof.joints
      .filter(({ id, kind }) => id !== original.id && kind === original.kind)
      .map((joint) => {
        const [a, b] = joint.pieceIds;
        const head = pieces.get(headIsFirst ? a : b);
        const receiver = pieces.get(headIsFirst ? b : a);
        const pairs =
          head &&
          receiver &&
          matchingPart(head, source.head) &&
          matchingPart(receiver, source.receiver) &&
          roofPairPose(source, { head, receiver })
            ? [{ head, receiver }]
            : [];
        return {
          section: {
            id: joint.id,
            jointLabel: joint.label,
            name: `${joint.label} · ${roofJointPairLabel(project, joint)}`,
          },
          pairs,
        };
      }),
  };
}

function repeatScope(project: Project, source: FastenerPlan) {
  const pieces = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const head = pieces.get(source.head.pieceId);
  const receiver = pieces.get(source.receiver.pieceId);
  if (!head?.designRole || !receiver?.designRole) return null;
  const pair = { head, receiver };
  return roofScope(project, pair, pieces) ?? moduleScope(project, pair, pieces);
}

export function fastenerRepeatKind(project: Project, source: FastenerPlan) {
  if (!source.locations.length) return null;
  const scope = repeatScope(project, source);
  return scope?.candidates.length ? scope.kind : null;
}

function transferableReview(review: FastenerReview | undefined) {
  return (
    !!review &&
    review.locations.length > 0 &&
    review.locations.every(
      (location) =>
        location.includedInDemand &&
        location.entranceWorld &&
        location.driveWorld &&
        location.gap === 0 &&
        location.state !== "conflict" &&
        location.state !== "stale",
    )
  );
}

export function previewFastenerRepeat(project: Project, sourceId: string) {
  const source = project.fastenerPlans.find((plan) => plan.id === sourceId);
  if (!source) throw Error("Choose a saved screw layout.");
  const scope = repeatScope(project, source);
  if (!scope?.candidates.length)
    throw Error("This design has no other joints of this kind to check.");
  if (
    !transferableReview(
      fastenerReviews(project).find(({ plan }) => plan.id === sourceId),
    )
  )
    throw Error(
      "Save complete, current entry points that pass through both touching members before repeating this layout.",
    );

  const pending: FastenerPlan[] = [];
  const rows: RepeatRow[] = scope.candidates.map(({ section, pairs }) => {
    const reject = (issue: string) => ({ section, issue, target: null });
    if (pairs.length !== 1)
      return reject(
        pairs.length
          ? "Several parts match. Choose the joint manually."
          : "The parts, cut shapes, or joint position differ.",
      );
    const [{ head, receiver }] = pairs;
    if (
      project.fastenerPlans.some((plan) => {
        const ids = [plan.head.pieceId, plan.receiver.pieceId];
        return ids.includes(head.id) && ids.includes(receiver.id);
      })
    )
      return reject("This pair already has a screw plan.");
    if (scope.kind === "roof") {
      const samePair = (a: string, b: string) =>
        (a === head.id && b === receiver.id) ||
        (a === receiver.id && b === head.id);
      if (
        project.connectorPlans.some((plan) =>
          samePair(plan.base.pieceId, plan.post.pieceId),
        ) ||
        project.joints.some(({ a, b }) => samePair(a, b))
      )
        return reject(
          "This pair already has a connection record. Review it before adding any screw marks.",
        );
    }
    if (project.fastenerPlans.length + pending.length >= 100)
      return reject("This project has reached its 100-plan limit.");
    const plan = makeFastenerPlan(
      { ...project, fastenerPlans: [...project.fastenerPlans, ...pending] },
      head.id,
      receiver.id,
      {
        productId: source.productId,
        name: `Repeated layout from ${source.label}`,
        notes: `Entry coordinates copied from ${source.label} onto matching parts. Review access, seating depth and pilot for this joint.`,
      },
    );
    plan.locations = source.locations.map((location, index) => ({
      id: uid(),
      label: `F${String(index + 1).padStart(3, "0")}`,
      name: `From ${source.label}/${location.label}`,
      entranceLocal: location.entranceLocal && [...location.entranceLocal],
      driveLocal: location.driveLocal && [...location.driveLocal],
    }));
    plan.nextLocationNumber = plan.locations.length + 1;
    pending.push(plan);
    return {
      section,
      issue: null,
      target: { head, receiver, plan, floorAccess: false },
    };
  });
  const reviews = pending.length
    ? fastenerReviews({
        ...project,
        fastenerPlans: [...project.fastenerPlans, ...pending],
      })
    : [];
  for (const [index, row] of rows.entries()) {
    if (!row.target) continue;
    const target = row.target;
    const review = reviews.find(({ plan }) => plan.id === target.plan.id);
    if (!review || !transferableReview(review)) {
      rows[index] = {
        section: row.section,
        issue:
          review?.issues.find(({ severity }) => severity === "error")
            ?.message ?? "One or more marks cannot pass through this joint.",
        target: null,
      };
      continue;
    }
    if (
      review.locations.some(({ entranceWorld, driveWorld }) =>
        fastenerEntranceCovered(
          project,
          target.head,
          target.receiver,
          entranceWorld!,
          driveWorld!,
        ),
      )
    ) {
      rows[index] = {
        section: row.section,
        issue: "Another modeled part covers a screw entrance.",
        target: null,
      };
      continue;
    }
    target.floorAccess = review.locations.some(
      ({ entranceWorld, driveWorld }) =>
        entranceWorld![1] <= epsilon && driveWorld![1] > epsilon,
    );
  }
  const signature = canonicalFastenerValue({
    projectId: project.id,
    sourceId,
    product: [source.productId, source.productEvidenceRevision],
    locations: source.locations,
    targets: rows.flatMap(({ section, target }) =>
      target
        ? [
            {
              destinationId: section.id,
              head: [
                target.plan.head.pieceId,
                target.plan.head.geometryFingerprint,
                target.plan.head.baselinePose,
              ],
              receiver: [
                target.plan.receiver.pieceId,
                target.plan.receiver.geometryFingerprint,
                target.plan.receiver.baselinePose,
              ],
              floorAccess: target.floorAccess,
            },
          ]
        : [],
    ),
  });
  return { sourceId, signature, rows };
}

export function applyFastenerRepeat(
  project: Project,
  preview: Pick<
    ReturnType<typeof previewFastenerRepeat>,
    "sourceId" | "signature"
  >,
  destinationIds: readonly string[],
  beforeFloorPlacement: boolean,
) {
  if (
    !destinationIds.length ||
    new Set(destinationIds).size !== destinationIds.length
  )
    throw Error("Select at least one distinct matching joint.");
  const current = previewFastenerRepeat(project, preview.sourceId);
  if (current.signature !== preview.signature)
    throw Error(
      "The layout or destination changed. Find matching joints again.",
    );
  let result = project;
  for (const id of destinationIds) {
    const target = current.rows.find(
      ({ section }) => section.id === id,
    )?.target;
    if (!target)
      throw Error("One of the selected joints is no longer available.");
    if (target.floorAccess && !beforeFloorPlacement)
      throw Error(
        "Confirm access to the floor-side entries before placing the assembly.",
      );
    const plan = makeFastenerPlan(result, target.head.id, target.receiver.id, {
      productId: target.plan.productId,
      name: target.plan.name,
      notes:
        target.plan.notes +
        (target.floorAccess
          ? "\nFloor-side access. Drive these entries before setting the assembly down."
          : ""),
    });
    result = saveFastenerPlan(result, {
      ...plan,
      locations: target.plan.locations,
      nextLocationNumber: target.plan.nextLocationNumber,
    });
  }
  return result;
}
