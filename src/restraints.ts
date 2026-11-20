import { invalidCutSources } from "./cutStock";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { attachmentGeometryFingerprint } from "./attachments";
import { rotate } from "./spatial";
import { clipBox } from "./cutProfiles";
import { stockAxes } from "./stockAxes";
import { fastenerReviews, type FastenerReview } from "./fastenings";
import {
  restraintPlanSchema,
  restraintLocationSchema,
  restraintProductId,
  emptyRestraintMeasurements,
  type RestraintPlan,
  type RestraintLocation,
} from "./restraintSchema";

export type RestraintState = "stale" | "conflict" | "needs-review";
export type RestraintIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  pieceIds?: string[];
};
export type ReviewedRestraintLocation = {
  location: RestraintLocation;
  furnitureEyeWorld: V3 | null;
  span: number | null;
  availableReceiverDepth: number | null;
};
export type RestraintReview = {
  plan: RestraintPlan;
  state: RestraintState;
  issues: RestraintIssue[];
  locations: ReviewedRestraintLocation[];
  activeKitCount: number;
  screwLinks: RestraintScrewLink[];
};
type RestraintScrewLink = {
  id: string;
  label: string;
  pieceIds: string[];
  state: "current" | "pending" | "stale" | "conflict";
  detail: string;
  paths: { entry: V3; tip: V3 }[];
};
const EPS = 1e-6;
const dot = (a: V3, b: V3) =>
  a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const world = (point: V3, piece: Piece): V3 =>
  rotate(point, piece.rotation).map(
    (value, axis) => value + piece.position[axis],
  ) as V3;
const validDate = (value: string | null, now: number) =>
  value !== null &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= now;
function entryParts(project: Project, entryId: string) {
  const entry = project.ideaBindings
    .flatMap((binding) => binding.entries)
    .find((entry) => entry.id === entryId);
  return entry
    ? new Set(
        entry.sections.flatMap(
          (reference) =>
            project.sections.find(
              (section) => section.id === reference.sectionId,
            )?.pieceIds ?? [],
        ),
      )
    : null;
}
function caseworkFrameTargets(project: Project, entryId: string | null) {
  const entry = project.ideaBindings
    .flatMap(({ entries }) => entries)
    .find(({ id }) => id === entryId);
  if (
    entry?.spec.type !== "structure" ||
    entry.spec.structure.kind !== "casework-shelves"
  )
    return null;
  const frame = new Set(
    entry.sections
      .filter(({ role }) =>
        ["side-left", "side-right", "top", "bottom"].includes(role),
      )
      .map(({ sectionId }) => sectionId),
  );
  return new Set(
    project.sections
      .filter(({ id }) => frame.has(id))
      .flatMap(({ pieceIds }) => pieceIds),
  );
}

function screwLinks(
  project: Project,
  plan: RestraintPlan,
  reviews: readonly FastenerReview[],
): RestraintScrewLink[] {
  return (plan.receiverFastenerPlanIds ?? []).map((id) => {
    const row = reviews.find(({ plan: screwPlan }) => screwPlan.id === id);
    const label =
      row?.plan.label ??
      project.fastenerPlanLabels.find(({ planId }) => planId === id)?.label ??
      "Missing screw plan";
    if (!row)
      return {
        id,
        label,
        pieceIds: [],
        state: "stale",
        detail: "The selected screw plan is missing.",
        paths: [],
      };
    const pieceIds = [row.plan.head.pieceId, row.plan.receiver.pieceId];
    const state =
      row.state === "stale" || row.state === "conflict"
        ? row.state
        : row.state === "path-reviewed" &&
            row.locations.length > 0 &&
            row.locations.every(
              ({ includedInDemand, gap, state, entranceWorld, tipWorld }) =>
                includedInDemand &&
                gap === 0 &&
                state === "path-reviewed" &&
                entranceWorld &&
                tipWorld,
            )
          ? "current"
          : "pending";
    const detail =
      state === "current"
        ? `${row.locations.length} entered screw ${row.locations.length === 1 ? "path" : "paths"} checked across touching members.`
        : state === "pending"
          ? "Review all screw paths and bring both members into direct contact."
          : (row.issues.find(({ severity }) => severity === "error")?.message ??
            "Review the selected screw plan and its actual members.");
    const paths =
      state === "current"
        ? row.locations.map(({ entranceWorld, tipWorld }) => ({
            entry: entranceWorld!,
            tip: tipWorld!,
          }))
        : [];
    return { id, label, pieceIds, state, detail, paths };
  });
}

export function connectedRestraintMembers(
  receiverId: string,
  edges: readonly (readonly string[])[],
) {
  const connected = new Set([receiverId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      if (!edge.some((id) => connected.has(id))) continue;
      for (const id of edge) {
        if (connected.has(id)) continue;
        connected.add(id);
        grew = true;
      }
    }
  }
  return connected;
}

function planes(piece: Piece) {
  const box = ([0, 1, 2] as const).flatMap((axis) =>
    ([-1, 1] as const).map((sign) => {
      const normal: V3 = [0, 0, 0];
      normal[axis] = sign;
      return { normal, constant: piece.size[axis] / 2 };
    }),
  );
  return [...box, ...piece.cutPlanes];
}
function retainedWorldBounds(piece: Piece) {
  try {
    const points = clipBox(piece.size, piece.cutPlanes).vertices.map((point) =>
      world(point, piece),
    );
    return {
      min: [0, 1, 2].map((axis) =>
        Math.min(...points.map((point) => point[axis])),
      ),
      max: [0, 1, 2].map((axis) =>
        Math.max(...points.map((point) => point[axis])),
      ),
    };
  } catch {
    return null;
  }
}
function sourceFitIssues(
  piece: Piece,
  sourceIssues: ReadonlyMap<string, string>,
): string[] {
  const stock = [
      ...(material(piece.material).stockSize ?? material(piece.material).size),
    ].sort((a, b) => a - b),
    axes = stockAxes(piece, piece.cutStock?.size ?? piece.size),
    oriented = (size: V3) => [
      size[axes.thickness],
      size[axes.width],
      size[axes.length],
    ],
    issues: string[] = [];
  if (oriented(piece.size).some((value, axis) => value > stock[axis] + EPS))
    issues.push(
      "The stated receiver dimensions exceed the selected catalog stock's actual thickness, width or length in its recorded stock axes. Rips may reduce a cross-section; manual scaling cannot create thicker or wider stock.",
    );
  if (piece.cutStock) {
    const issue = sourceIssues.get(piece.cutStock.id);
    if (issue) issues.push(issue);
  }
  return issues;
}
/** Exact center-ray exit through the retained convex stock. Unknown fitting footprint is a separate review. */
function mountingDepth(
  piece: Piece,
  point: V3,
  face: RestraintLocation["receiverFace"],
) {
  const constraints = planes(piece),
    normal: V3 = [0, 0, 0];
  normal[face.axis] = face.sign;
  if (
    constraints.some((plane) => dot(plane.normal, point) > plane.constant + EPS)
  )
    return {
      depth: null,
      issue:
        "The receiver mount point is outside the retained stock or lies in a removed cut region.",
    };
  if (
    !constraints.some(
      (plane) =>
        dot(plane.normal, normal) > 1 - EPS &&
        Math.abs(dot(plane.normal, point) - plane.constant) <= EPS,
    )
  )
    return {
      depth: null,
      issue:
        "The mount point is not on a retained face matching the selected axis/sign. Angled-face fitting geometry is not inferred.",
    };
  const direction = normal.map((value) => -value) as V3;
  let depth = Infinity;
  for (const plane of constraints) {
    const rate = dot(plane.normal, direction);
    if (rate > EPS)
      depth = Math.min(
        depth,
        (plane.constant - dot(plane.normal, point)) / rate,
      );
  }
  return Number.isFinite(depth) && depth > EPS
    ? { depth, issue: null }
    : {
        depth: null,
        issue:
          "The selected receiver face leaves no positive retained depth along the inward mounting axis.",
      };
}

export function makeRestraintPlan(
  project: Project,
  entryId?: string,
): RestraintPlan {
  if (entryId && !entryParts(project, entryId))
    throw Error(
      "Choose an existing saved furniture design or leave the design reference unset.",
    );
  const time = new Date().toISOString();
  return restraintPlanSchema.parse({
    id: uid(),
    kind: "furniture-anti-tip",
    productId: restraintProductId,
    name: "Furniture anti-tip review",
    createdAt: time,
    updatedAt: time,
    entryId: entryId ?? null,
    receiver: null,
    receiverJointIds: [],
    receiverSolidWoodBasis: "",
    receiverMeasuredAt: null,
    instructionBasis: "",
    instructionRevision: "",
    instructionReviewedAt: null,
    notes: "",
    locations: [],
    measurements: emptyRestraintMeasurements(),
  });
}
export function saveRestraintPlan(
  project: Project,
  input: RestraintPlan,
): Project {
  const plan = restraintPlanSchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
  });
  const existing = project.restraintPlans.some((item) => item.id === plan.id);
  if (!existing && project.restraintPlans.length >= 100)
    throw Error("Limit the project to 100 restraint plans.");
  return projectSchema.parse({
    ...project,
    restraintPlans: existing
      ? project.restraintPlans.map((item) =>
          item.id === plan.id ? plan : item,
        )
      : [...project.restraintPlans, plan],
  });
}
export function removeRestraintPlan(project: Project, planId: string): Project {
  return {
    ...project,
    restraintPlans: project.restraintPlans.filter((plan) => plan.id !== planId),
  };
}
export function selectRestraintReceiver(
  project: Project,
  input: RestraintPlan,
  pieceId: string,
): RestraintPlan {
  const piece = project.pieces.find(
    (piece) => piece.id === pieceId && !piece.offcut,
  );
  if (!piece) throw Error("Choose an existing active furniture receiver part.");
  return restraintPlanSchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
    receiver: {
      pieceId: piece.id,
      name: piece.name,
      geometryFingerprint: attachmentGeometryFingerprint(piece),
      baselinePose: {
        position: [...piece.position],
        rotation: [...piece.rotation],
      },
    },
    receiverJointIds: [],
    ...(input.receiverFastenerPlanIds ? { receiverFastenerPlanIds: [] } : {}),
    receiverSolidWoodBasis: "",
    receiverMeasuredAt: null,
    measurements: emptyRestraintMeasurements(),
    locations: input.locations.map((location) => ({
      ...location,
      receiverMountLocal: null,
      furnitureEyeLocal: null,
    })),
  });
}
export function addRestraintLocation(input: RestraintPlan): RestraintPlan {
  if (input.locations.length >= 20)
    throw Error("Limit this plan to 20 explicitly chosen restraint locations.");
  const location = restraintLocationSchema.parse({
    id: uid(),
    name: `Restraint location ${input.locations.length + 1}`,
    receiverFace: { axis: 2, sign: -1 },
    receiverMountLocal: null,
    furnitureEyeLocal: null,
    wallEyeWorld: null,
    wallSubstrate: "unknown",
    wallBasis: "",
    wallReviewedAt: null,
  });
  return restraintPlanSchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
    locations: [...input.locations, location],
  });
}

export function restraintReviews(
  project: Project,
  now = Date.now(),
  fastenerCache?: readonly FastenerReview[],
): RestraintReview[] {
  if (!project.restraintPlans.length) return [];
  const result: RestraintReview[] = [];
  const cutSourceIssues = invalidCutSources(project);
  const fasteners =
    fastenerCache ??
    (project.restraintPlans.some(
      ({ receiverFastenerPlanIds }) => receiverFastenerPlanIds?.length,
    )
      ? fastenerReviews(project, now)
      : []);
  for (const plan of project.restraintPlans) {
    const issues: RestraintIssue[] = [];
    const linkedScrews = screwLinks(project, plan, fasteners);
    let stale = false,
      receiverSourceValid = false;
    const issue = (
      code: string,
      severity: RestraintIssue["severity"],
      message: string,
      pieceIds?: string[],
    ) =>
      issues.push({
        code,
        severity,
        message,
        ...(pieceIds ? { pieceIds } : {}),
      });
    const selected = plan.receiver,
      receiver = selected
        ? (project.pieces.find(
            (piece) => piece.id === selected.pieceId && !piece.offcut,
          ) ?? null)
        : null,
      furniture = plan.entryId ? entryParts(project, plan.entryId) : null;
    if (plan.entryId && !furniture) {
      stale = true;
      issue(
        "missing-design",
        "error",
        "The saved furniture design reference was removed. Reassociate this restraint plan before using its locations.",
      );
    }
    if (!selected)
      issue(
        "receiver-unselected",
        "review",
        "No actual connected solid-wood furniture receiver has been selected. A kit purchase or plywood back is not a receiver.",
      );
    else if (!receiver) {
      stale = true;
      issue(
        "missing-receiver",
        "error",
        "The selected furniture receiver is missing or became an offcut. Reselect its actual replacement.",
        [selected.pieceId],
      );
    } else {
      if (
        attachmentGeometryFingerprint(receiver) !== selected.geometryFingerprint
      ) {
        stale = true;
        issue(
          "receiver-changed",
          "error",
          "The receiver material, retained shape, cut source or stock orientation changed. Its measured mounting plan is stale.",
          [receiver.id],
        );
      }
      const stock = material(receiver.material);
      if (!stock.wood || stock.stockKind !== "linear")
        issue(
          "receiver-material",
          "error",
          "This exact kit requires a solid-wood furniture attachment. The selected plywood/panel, metal or hardware profile cannot establish that receiver; no plywood or material substitution is permitted.",
          [receiver.id],
        );
      else {
        const sourceIssues = sourceFitIssues(receiver, cutSourceIssues);
        receiverSourceValid = sourceIssues.length === 0;
        for (const message of sourceIssues)
          issue("receiver-stock-fit", "error", message, [receiver.id]);
        if (
          !plan.receiverSolidWoodBasis.trim() ||
          !validDate(plan.receiverMeasuredAt, now)
        )
          issue(
            "receiver-basis",
            "review",
            "Record a dated user inspection/source basis for the actual solid-wood receiver. A generic linear-wood model is not proof of the purchased member.",
            [receiver.id],
          );
        issue(
          "receiver-source-scope",
          "review",
          "User inspection and catalog dimensions do not establish receiver strength, species/grade, fitting compatibility or the receiver-to-carcass joint capacity.",
          [receiver.id],
        );
      }
      if (!plan.receiverJointIds.length && !linkedScrews.length)
        issue(
          "receiver-connections",
          "review",
          "The receiver-to-furniture attachment schedule is unspecified. Select its actual designed connection records; contact with a back or top alone does not establish a connected member.",
          [receiver.id],
        );
      else {
        const joints = plan.receiverJointIds.flatMap((id) => {
          const joint = project.joints.find((joint) => joint.id === id);
          if (
            !joint ||
            !project.pieces.some(
              (piece) => piece.id === joint.a && !piece.offcut,
            ) ||
            !project.pieces.some(
              (piece) => piece.id === joint.b && !piece.offcut,
            )
          ) {
            stale = true;
            issue(
              "missing-receiver-connection",
              "error",
              "A selected receiver connection or one of its active endpoints is missing. Reassociate the actual attachment schedule.",
              [receiver.id],
            );
            return [];
          }
          return [joint];
        });
        for (const link of linkedScrews) {
          if (link.state === "current") continue;
          if (link.state === "stale") stale = true;
          issue(
            "receiver-screw-" + link.state,
            "error",
            `${link.label}. ${link.detail}`,
            link.pieceIds,
          );
        }
        const measuredEdges = linkedScrews
          .filter(({ state }) => state === "current")
          .map(({ pieceIds }) => pieceIds);
        const edges = [
          ...joints.map(({ a, b }) => [a, b] as const),
          ...measuredEdges,
        ];
        for (const joint of joints) {
          if (joint.kind !== "screw" && joint.kind !== "nail") continue;
          const a = project.pieces.find((piece) => piece.id === joint.a)!,
            b = project.pieces.find((piece) => piece.id === joint.b)!,
            aa = retainedWorldBounds(a),
            bb = retainedWorldBounds(b);
          if (!aa || !bb) {
            issue(
              "receiver-connection-geometry",
              "error",
              "A selected connection endpoint has invalid retained geometry; its reach cannot be checked.",
              [joint.a, joint.b],
            );
            continue;
          }
          const gap = Math.hypot(
            ...[0, 1, 2].map((axis) =>
              Math.max(
                0,
                aa.min[axis] - bb.max[axis],
                bb.min[axis] - aa.max[axis],
              ),
            ),
          );
          if (gap > joint.length + EPS)
            issue(
              "receiver-connection-reach",
              "error",
              `A selected ${joint.kind} connection has a retained-world-bounds gap of ${Number(gap.toFixed(6))} in, exceeding its recorded ${joint.length} in fastener length. This necessary reach check does not establish hole locations, engagement or connection capacity.`,
              [joint.a, joint.b],
            );
        }
        const connected = connectedRestraintMembers(receiver.id, edges);
        const targets =
          (linkedScrews.length
            ? caseworkFrameTargets(project, plan.entryId)
            : null) ?? furniture;
        const checkedChain = linkedScrews.length
          ? connectedRestraintMembers(receiver.id, measuredEdges)
          : connected;
        const target = [...checkedChain].some(
          (id) =>
            id !== receiver.id &&
            (targets
              ? targets.has(id)
              : project.pieces.some(
                  (piece) =>
                    piece.id === id &&
                    !piece.offcut &&
                    material(piece.material).wood,
                )),
        );
        if (
          !target ||
          edges.some(([a, b]) => !connected.has(a) || !connected.has(b))
        )
          issue(
            "receiver-disconnected",
            "error",
            linkedScrews.length
              ? "The selected screw plans must form a checked path from the receiver into the furniture frame. Review any loose members and the remaining connections."
              : "The selected connection records do not form a path from the receiver into the selected furniture. Unrelated or loose-member connections cannot complete that chain.",
            [receiver.id],
          );
        issue(
          "connection-schedule-scope",
          "review",
          linkedScrews.length
            ? "Verify the fitted receiver, fasteners, backing and complete load path on site."
            : "Recorded joints identify intended connections only. Their actual hole positions, edge distances, fastener compatibility and capacity still require design review.",
          [receiver.id],
        );
      }
    }
    if (!plan.entryId)
      issue(
        "furniture-unbound",
        "review",
        "No saved furniture design is associated. Confirm which complete assembly the receiver connections restrain.",
      );
    if (
      !plan.instructionBasis.trim() ||
      !plan.instructionRevision.trim() ||
      !validDate(plan.instructionReviewedAt, now)
    )
      issue(
        "instructions-pending",
        "review",
        "Review the delivered exact 9976524 instructions and record their basis, revision/identifier and review date. The reviewed retailer graphics are not a revisioned complete manual.",
      );
    issue(
      "manufacturer-limits",
      "review",
      "Exact fitting footprint/holes, cable geometry, screw gauges and pilots remain unverified manufacturer data. User measurements do not release an installation schedule; the source rating is not a furniture capacity approval.",
    );
    const measurements = plan.measurements;
    if (
      [
        measurements.cableEyeToEyeLength,
        measurements.deepestFurnitureTipDepth,
        measurements.wallFastenerLength,
        measurements.studEngagement,
      ].some((value) => value === null)
    )
      issue(
        "measurements-pending",
        "review",
        "Record actual cable reach, deepest furniture-tip depth from the wood mounting surface, wall fastener identity/length and stud engagement with user measurement provenance. No 1½-inch wall assignment or minimum penetration is inferred.",
      );
    if (
      [
        measurements.cableEyeToEyeLength,
        measurements.deepestFurnitureTipDepth,
        measurements.wallFastenerLength,
        measurements.studEngagement,
      ].some((value) => value !== null) &&
      (!measurements.basis.trim() || !validDate(measurements.measuredAt, now))
    )
      issue(
        "measurement-date",
        "review",
        "The user measurement basis/date is missing or future-dated; measured dimensions are not current reviewed evidence.",
      );
    if (
      measurements.wallFastenerLength !== null &&
      measurements.studEngagement !== null &&
      measurements.studEngagement > measurements.wallFastenerLength + EPS
    )
      issue(
        "stud-engagement",
        "error",
        "Recorded stud engagement exceeds the entire recorded wall fastener length; verify the actual finish, fitting and fastener stack.",
      );
    if (!plan.locations.length)
      issue(
        "locations-unselected",
        "review",
        "No restraint locations were chosen. One kit contains one cable connection, not a prescribed project restraint count.",
      );
    const locations: ReviewedRestraintLocation[] = plan.locations.map(
      (location) => {
        const furnitureEyeWorld =
          receiver && !stale && location.furnitureEyeLocal
            ? world(location.furnitureEyeLocal, receiver)
            : null;
        const span =
          furnitureEyeWorld && location.wallEyeWorld
            ? Math.hypot(
                ...furnitureEyeWorld.map(
                  (value, axis) => value - location.wallEyeWorld![axis],
                ),
              )
            : null;
        let availableReceiverDepth: number | null = null;
        if (receiver && location.receiverMountLocal && receiverSourceValid) {
          const mount = mountingDepth(
            receiver,
            location.receiverMountLocal,
            location.receiverFace,
          );
          availableReceiverDepth = mount.depth;
          if (mount.issue)
            issue(
              "receiver-mount",
              "error",
              `${location.name}: ${mount.issue}`,
              [receiver.id],
            );
          if (
            mount.depth !== null &&
            measurements.deepestFurnitureTipDepth !== null &&
            measurements.deepestFurnitureTipDepth >= mount.depth - EPS
          )
            issue(
              "receiver-breakthrough",
              "error",
              `${location.name}: the recorded deepest furniture-tip depth reaches or crosses the retained receiver boundary along its mounting axis.`,
              [receiver.id],
            );
        } else if (!receiver || !location.receiverMountLocal)
          issue(
            "receiver-mount-pending",
            "review",
            `${location.name}: choose and measure the actual receiver mount point and face; no fitting or hole pattern is invented.`,
          );
        if (!location.furnitureEyeLocal || !location.wallEyeWorld)
          issue(
            "cable-targets-pending",
            "review",
            `${location.name}: furniture and wall cable-eye locations remain incomplete.`,
          );
        if (
          span !== null &&
          measurements.cableEyeToEyeLength !== null &&
          span > measurements.cableEyeToEyeLength + EPS
        )
          issue(
            "cable-overreach",
            "error",
            `${location.name}: the straight eye-to-eye span exceeds the measured cable eye-to-eye length. Change the actual placement or reviewed kit; no stretched cable is assumed.`,
          );
        if (location.wallSubstrate === "unknown")
          issue(
            "wall-pending",
            "review",
            `${location.name}: actual wall/stud substrate is unknown. The work-zone box and common stud spacing do not establish a fixing target.`,
          );
        else if (location.wallSubstrate !== "wood-stud")
          issue(
            "wall-substrate",
            "error",
            `${location.name}: the reviewed exact kit method requires a wood-stud fixing. Steel studs, masonry, drywall-only and other substrates have no qualified method here.`,
          );
        else if (
          !location.wallBasis.trim() ||
          !validDate(location.wallReviewedAt, now)
        )
          issue(
            "wall-evidence",
            "review",
            `${location.name}: record dated evidence for the actual wood stud and wall finish; selecting wood-stud is not verification.`,
          );
        return { location, furnitureEyeWorld, span, availableReceiverDepth };
      },
    );
    const state: RestraintState = stale
      ? "stale"
      : issues.some((issue) => issue.severity === "error")
        ? "conflict"
        : "needs-review";
    result.push({
      plan,
      state,
      issues,
      locations,
      activeKitCount: state === "needs-review" ? plan.locations.length : 0,
      screwLinks: linkedScrews,
    });
  }
  return result;
}
