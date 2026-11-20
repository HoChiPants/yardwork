import { Euler, Quaternion, Vector3 } from "three";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { attachmentGeometryFingerprint } from "./attachments";
import {
  captureFastenerReference,
  fastenerSourceCurrent,
} from "./fastenerReferences";
import { canonicalFastenerValue as canonical } from "./fastenerHistory";
import { emptyFastenerMeasurements } from "./fasteningSchema";
import {
  lidHingePlanSchema,
  hingeIntentSnapshot,
  emptyHingeAxis,
  HINGE_REFERENCE_HISTORY_LIMIT,
  type LidHingePlan,
  type HingeLocation,
  type RecordedLidMotion,
} from "./hingeSchema";
import {
  hingeStockSourceSchema,
  type HingeStockSource,
} from "./hingeStockSchema";
import { getHingeProduct, hingeProductId } from "./hingeProducts";
import {
  reviewHingeStock,
  sourceFingerprint,
  assertHingeStockHistoryPrefix,
} from "./hingeStock";
import { assertHingeHistoryPrefix } from "./hingeHistory";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";
import { prepareCollisionSolid } from "./solidCollision";
export { retainHingeLabelHistory } from "./hingeHistory";

const EPS = 1e-6,
  ALIGN = 0.001;
const add = (a: V3, b: V3): V3 => a.map((v, i) => v + b[i]) as V3;
const sub = (a: V3, b: V3): V3 => a.map((v, i) => v - b[i]) as V3;
const dot = (a: V3, b: V3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const local = (v: V3, piece: Piece) =>
  rotate(sub(v, piece.position), inverseRotation(piece.rotation));
const world = (v: V3, piece: Piece) =>
  add(rotate(v, piece.rotation), piece.position);
const active = (p: Project, id: string) =>
  p.pieces.find((piece) => piece.id === id && !piece.offcut);
const hash = (value: unknown) => {
  let result = 2166136261;
  for (const c of canonical(value))
    result = Math.imul(result ^ c.charCodeAt(0), 16777619);
  return `hinge-v1-${(result >>> 0).toString(16)}`;
};
export type HingeState =
  "stale" | "conflict" | "needs-measurements" | "geometry-reviewed";
export type HingeIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  pieceIds?: string[];
};
export type HingeAxisWorld = { pivot: V3; axis: V3; length: number };
export type HingeLocationReview = {
  location: HingeLocation;
  state: HingeState;
  issues: HingeIssue[];
  entranceWorld: V3 | null;
  tipWorld: V3 | null;
  pilotTipWorld: V3 | null;
  availableDepth: number | null;
};
export type HingeReview = {
  plan: LidHingePlan;
  state: HingeState;
  issues: HingeIssue[];
  locations: HingeLocationReview[];
  resolvedAxis: HingeAxisWorld | null;
  stockAllocation: LidHingePlan["stockAllocation"];
  activeHoleCount: number;
};

/** Positive opening rotates about the directed A→B axis using the existing lid convention. */
export function hingePoseAroundAxis(
  piece: Piece,
  pivot: V3,
  axis: V3,
  openingDelta: number,
): Piece {
  if (!Number.isFinite(openingDelta) || Math.abs(Math.hypot(...axis) - 1) > EPS)
    throw Error("Use a finite angle and normalized hinge axis.");
  if (openingDelta === 0) return piece;
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(...axis),
    (-openingDelta * Math.PI) / 180,
  );
  const offset = new Vector3(...sub(piece.position, pivot)).applyQuaternion(q);
  const orientation = q
    .clone()
    .multiply(new Quaternion().setFromEuler(new Euler(...piece.rotation)));
  const e = new Euler().setFromQuaternion(orientation);
  return {
    ...piece,
    position: add(offset.toArray() as V3, pivot),
    rotation: [e.x, e.y, e.z],
  };
}
export function closeRecordedHingePose(
  piece: Piece,
  recorded: RecordedLidMotion,
): Piece {
  if (piece.id !== recorded.movingPieceId)
    throw Error("The recorded closing pose belongs to another moving member.");
  const unchanged =
    piece.position.every(
      (value, i) => value === recorded.openedPose.position[i],
    ) &&
    piece.rotation.every(
      (value, i) => value === recorded.openedPose.rotation[i],
    );
  return unchanged
    ? {
        ...piece,
        position: [...recorded.closedPose.position] as V3,
        rotation: [...recorded.closedPose.rotation] as V3,
      }
    : hingePoseAroundAxis(
        piece,
        recorded.pivot,
        recorded.axis,
        -LID_OPEN_ANGLE_DEGREES,
      );
}
function provisionalAxis(project: Project, sectionId: string): HingeAxisWorld {
  const s = project.sections.find((s) => s.id === sectionId);
  if (!s?.recipe?.openingLid)
    throw Error("Choose an opening storage lid section.");
  const t = Math.min(...material(s.recipe.panelMaterial).size);
  return {
    pivot: add(
      rotate([0, s.recipe.height - t, -s.recipe.depth / 2], s.rotation),
      s.origin,
    ),
    axis: rotate([1, 0, 0], s.rotation),
    length: s.recipe.width,
  };
}
export function closedHingeMovingPiece(
  project: Project,
  plan: LidHingePlan,
): Piece | null {
  const moving = active(project, plan.moving.pieceId),
    section = project.sections.find((s) => s.id === plan.sectionId);
  if (!moving || !section?.recipe) return null;
  if (!section.recipe.lidOpen) return moving;
  const recorded = section.recordedLidMotion;
  if (recorded && recorded.movingPieceId !== moving.id) return null;
  if (recorded) return closeRecordedHingePose(moving, recorded);
  const axis = provisionalAxis(project, section.id);
  return hingePoseAroundAxis(
    moving,
    axis.pivot,
    axis.axis,
    -LID_OPEN_ANGLE_DEGREES,
  );
}
function relativePose(moving: Piece, fixed: Piece) {
  return {
    position: local(moving.position, fixed),
    rotation: composeRotation(inverseRotation(fixed.rotation), moving.rotation),
  };
}
function samePose(
  a: { position: V3; rotation: V3 },
  b: { position: V3; rotation: V3 },
) {
  return (
    Math.hypot(...sub(a.position, b.position)) <= EPS &&
    (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as V3[]
    ).every(
      (axis) =>
        Math.hypot(
          ...sub(rotate(axis, a.rotation), rotate(axis, b.rotation)),
        ) <= EPS,
    )
  );
}
function requireClosed(project: Project, sectionId: string) {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section?.recipe?.openingLid)
    throw Error("Choose an existing section with an opening seat lid.");
  if (section.recipe.lidOpen)
    throw Error(
      "Close the saved lid before changing its mechanism, axis, references or stock allocation.",
    );
  return section;
}
/** Missing owner sections have no persisted pose to protect; live owners keep their close-first guard. */
function requirePreviousSectionClosed(project: Project, sectionId: string) {
  const previous = project.sections.find((section) => section.id === sectionId);
  if (previous?.recipe?.lidOpen) requireClosed(project, sectionId);
}
function requireMember(project: Project, id: string) {
  const piece = active(project, id);
  if (!piece || !material(piece.material).wood)
    throw Error(
      "Choose an actual active wood member, not a missing part or offcut.",
    );
  return piece;
}
export function makeLidHingePlan(
  project: Project,
  sectionId: string,
  movingId: string,
  fixedId: string,
): LidHingePlan {
  const section = requireClosed(project, sectionId),
    moving = requireMember(project, movingId),
    fixed = requireMember(project, fixedId);
  if (!section.pieceIds.includes(moving.id) || movingId === fixedId)
    throw Error(
      "Choose this section's actual lid and a distinct fixed member.",
    );
  const product = getHingeProduct(hingeProductId)!,
    at = new Date().toISOString();
  const number =
    1 +
    Math.max(
      0,
      ...project.hingePlanLabels.map((row) => Number(row.label.slice(1))),
    );
  return lidHingePlanSchema.parse({
    id: uid(),
    label: `H${String(number).padStart(3, "0")}`,
    kind: "continuous-hinge",
    name: "Measured lid hinge",
    createdAt: at,
    updatedAt: at,
    sectionId,
    productId: product.productId,
    evidenceRevision: product.evidenceRevision,
    moving: captureFastenerReference(project, moving, at),
    fixed: captureFastenerReference(project, fixed, at),
    closedPose: relativePose(moving, fixed),
    axis: emptyHingeAxis(),
    stockAllocation: null,
    hardware: {
      description: "",
      drive: "",
      suppliedCount: null,
      included: null,
      leafThickness: null,
      basis: "",
      measuredAt: null,
    },
    locations: [],
    nextLocationNumber: 1,
    selectedForMotion: false,
    referenceHistory: [],
    notes: "",
  });
}
export function addHingeLocation(
  plan: LidHingePlan,
  leaf: "moving" | "fixed" = "moving",
): LidHingePlan {
  return lidHingePlanSchema.parse({
    ...plan,
    nextLocationNumber: plan.nextLocationNumber + 1,
    locations: [
      ...plan.locations,
      {
        id: uid(),
        label: `L${String(plan.nextLocationNumber).padStart(3, "0")}`,
        name: `Transferred hole ${plan.nextLocationNumber}`,
        leaf,
        entranceLocal: null,
        driveLocal: null,
        measurements: emptyFastenerMeasurements(),
      },
    ],
  });
}
function cleared(
  plan: LidHingePlan,
  mode: "clear" | "retain-local" = "clear",
): LidHingePlan {
  return {
    ...plan,
    axis: emptyHingeAxis(),
    locations: plan.locations.map((location) => ({
      ...location,
      entranceLocal: mode === "clear" ? null : location.entranceLocal,
      driveLocal: mode === "clear" ? null : location.driveLocal,
      measurements: emptyFastenerMeasurements(),
    })),
  };
}
function archive(
  plan: LidHingePlan,
  old: LidHingePlan,
  kind: "refresh" | "remap" | "axis" | "allocation",
  basis: string,
  mode: "clear" | "retain-local" = "clear",
) {
  if (old.referenceHistory.length >= HINGE_REFERENCE_HISTORY_LIMIT)
    throw Error(
      "Hinge history is full. Export its history before starting a new plan; no receipt was removed.",
    );
  return lidHingePlanSchema.parse({
    ...plan,
    referenceHistory: [
      ...old.referenceHistory,
      {
        id: uid(),
        kind,
        at: new Date().toISOString(),
        basis,
        locationMode: mode,
        previous: hingeIntentSnapshot(old),
        next: hingeIntentSnapshot(plan),
      },
    ],
  });
}
export function saveLidHingePlan(project: Project, raw: LidHingePlan): Project {
  let plan = lidHingePlanSchema.parse(raw);
  const old = project.lidHingePlans.find((p) => p.id === plan.id);
  if (old) {
    assertHingeHistoryPrefix([old], [plan]);
    if (
      old.label !== plan.label ||
      old.locations.some((location) =>
        plan.locations.some(
          (next) => next.id === location.id && next.label !== location.label,
        ),
      ) ||
      plan.nextLocationNumber < old.nextLocationNumber
    )
      throw Error(
        "Existing hinge plans and hole labels keep their reservations.",
      );
    const changedRefs =
      canonical([
        old.sectionId,
        old.moving,
        old.fixed,
        old.closedPose,
        old.productId,
        old.evidenceRevision,
      ]) !==
      canonical([
        plan.sectionId,
        plan.moving,
        plan.fixed,
        plan.closedPose,
        plan.productId,
        plan.evidenceRevision,
      ]);
    if (
      changedRefs &&
      plan.referenceHistory.length === old.referenceHistory.length
    )
      throw Error(
        "Reference changes require the explicit hinge refresh or replacement preview.",
      );
    const allocationChanged =
        canonical(old.stockAllocation) !== canonical(plan.stockAllocation),
      axisChanged = canonical(old.axis) !== canonical(plan.axis);
    if (
      allocationChanged ||
      axisChanged ||
      old.selectedForMotion !== plan.selectedForMotion
    )
      requirePreviousSectionClosed(project, old.sectionId);
    if (plan.referenceHistory.length === old.referenceHistory.length) {
      if (allocationChanged) {
        if (old.stockAllocation) plan = cleared(plan);
        plan = archive(
          plan,
          old,
          "allocation",
          "Explicit retained hinge segment allocation; earlier source/end and mounting inputs remain historical.",
        );
      } else if (axisChanged)
        plan = archive(
          plan,
          old,
          "axis",
          "Explicit entered hinge-axis datum change. Earlier datums remain historical.",
          "retain-local",
        );
    }
  }
  const reserved = project.hingePlanLabels.find(
    (row) => row.planId === plan.id,
  );
  if (
    (reserved && reserved.label !== plan.label) ||
    project.hingePlanLabels.some(
      (row) => row.planId !== plan.id && row.label === plan.label,
    )
  )
    throw Error("This H label is reserved for another hinge plan.");
  if (
    plan.selectedForMotion &&
    project.lidHingePlans.some(
      (p) =>
        p.id !== plan.id &&
        p.sectionId === plan.sectionId &&
        p.selectedForMotion,
    )
  )
    throw Error("Choose one measured mechanism per lid section.");
  return projectSchema.parse({
    ...project,
    guideFingerprint: null,
    hingePlanLabels: reserved
      ? project.hingePlanLabels
      : [...project.hingePlanLabels, { planId: plan.id, label: plan.label }],
    lidHingePlans: old
      ? project.lidHingePlans.map((p) =>
          p.id === plan.id
            ? { ...plan, updatedAt: new Date().toISOString() }
            : p,
        )
      : [...project.lidHingePlans, plan],
  });
}
export function saveHingeStockSource(
  project: Project,
  raw: HingeStockSource,
): Project {
  const source = hingeStockSourceSchema.parse(raw);
  assertHingeStockHistoryPrefix(project.hingeStockSources, [
    source,
    ...project.hingeStockSources.filter((s) => s.id !== source.id),
  ]);
  return projectSchema.parse({
    ...project,
    guideFingerprint: null,
    hingeStockSources: project.hingeStockSources.some((s) => s.id === source.id)
      ? project.hingeStockSources.map((s) => (s.id === source.id ? source : s))
      : [...project.hingeStockSources, source],
  });
}
export function allocateHingeStock(
  project: Project,
  plan: LidHingePlan,
  sourceId: string,
  segmentId: string,
): LidHingePlan {
  const source = project.hingeStockSources.find((s) => s.id === sourceId);
  if (
    !source ||
    !reviewHingeStock(source).segments.some((s) => s.id === segmentId)
  )
    throw Error(
      "Choose an actual retained hinge segment with entered source dimensions.",
    );
  return {
    ...plan,
    stockAllocation: {
      sourceId,
      segmentId,
      sourceFingerprint: sourceFingerprint(source),
    },
  };
}
export function removeLidHingePlan(project: Project, id: string): Project {
  const plan = project.lidHingePlans.find((p) => p.id === id);
  if (plan?.selectedForMotion)
    requirePreviousSectionClosed(project, plan.sectionId);
  return projectSchema.parse({
    ...project,
    lidHingePlans: project.lidHingePlans.filter((p) => p.id !== id),
    guideFingerprint: null,
  });
}

function planes(piece: Piece) {
  return [
    ...([0, 1, 2] as const).flatMap((axis) =>
      ([-1, 1] as const).map((sign) => {
        const normal: V3 = [0, 0, 0];
        normal[axis] = sign;
        return { normal, constant: piece.size[axis] / 2 };
      }),
    ),
    ...piece.cutPlanes,
  ];
}
function interval(piece: Piece, entrance: V3, drive: V3) {
  let enter = -Infinity,
    exit = Infinity;
  for (const p of planes(piece)) {
    const denominator = dot(p.normal, drive),
      margin = p.constant - dot(p.normal, entrance);
    if (Math.abs(denominator) < EPS) {
      if (margin < -EPS) return null;
      continue;
    }
    const t = margin / denominator;
    if (denominator < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
  }
  return exit - enter > EPS ? { enter, exit } : null;
}
const issue = (
  code: string,
  message: string,
  severity: "error" | "review" = "review",
  pieceIds?: string[],
): HingeIssue => ({
  code,
  message,
  severity,
  ...(pieceIds ? { pieceIds } : {}),
});
function freshMeasurement(basis: string, at: string | null) {
  return !!basis.trim() && !!at && Date.parse(at) <= Date.now() + 1000;
}
function reviewPlan(project: Project, plan: LidHingePlan): HingeReview {
  const issues: HingeIssue[] = [],
    section = project.sections.find((s) => s.id === plan.sectionId),
    moving = closedHingeMovingPiece(project, plan),
    fixed = active(project, plan.fixed.pieceId),
    product = getHingeProduct(plan.productId);
  let stale = false,
    resolvedAxis: HingeAxisWorld | null = null;
  if (
    !section?.recipe?.openingLid ||
    !section.pieceIds.includes(plan.moving.pieceId) ||
    !moving ||
    !fixed
  ) {
    stale = true;
    issues.push(
      issue(
        "missing-reference",
        "An actual section/member is missing. Select replacement IDs explicitly; names do not rebind a hinge.",
      ),
    );
  } else if (
    attachmentGeometryFingerprint(moving) !== plan.moving.geometryFingerprint ||
    attachmentGeometryFingerprint(fixed) !== plan.fixed.geometryFingerprint ||
    !fastenerSourceCurrent(moving, plan.moving) ||
    !fastenerSourceCurrent(fixed, plan.fixed) ||
    !samePose(relativePose(moving, fixed), plan.closedPose) ||
    product?.evidenceRevision !== plan.evidenceRevision
  ) {
    stale = true;
    issues.push(
      issue(
        "changed-reference",
        "Member geometry/source, closed relative pose or product evidence changed. Close, review and explicitly refresh or replace the references.",
      ),
    );
  }
  let source = plan.stockAllocation
    ? project.hingeStockSources.find(
        (s) => s.id === plan.stockAllocation!.sourceId,
      )
    : undefined;
  const sourceReview = source ? reviewHingeStock(source) : null,
    segment = sourceReview?.segments.find(
      (s) => s.id === plan.stockAllocation?.segmentId,
    );
  if (!plan.stockAllocation)
    issues.push(
      issue(
        "stock-pending",
        "Allocate a retained interval from one entered physical hinge source.",
      ),
    );
  else if (
    !source ||
    sourceFingerprint(source) !== plan.stockAllocation.sourceFingerprint ||
    !segment
  ) {
    stale = true;
    issues.push(
      issue(
        "stock-changed",
        "The allocated physical source/cut-end interval is missing or changed. Review its exact end identity and allocate explicitly again.",
      ),
    );
  }
  if (sourceReview)
    issues.push(
      ...sourceReview.issues.map((i) =>
        issue(`stock-${i.code}`, i.message, i.severity),
      ),
    );
  if (
    plan.stockAllocation &&
    project.lidHingePlans.some(
      (other) =>
        other.id !== plan.id &&
        other.stockAllocation?.sourceId === plan.stockAllocation!.sourceId &&
        other.stockAllocation.segmentId === plan.stockAllocation!.segmentId,
    )
  )
    issues.push(
      issue(
        "duplicate-allocation",
        "Two hinge plans claim the same retained physical segment; neither claim is included.",
        "error",
      ),
    );
  const { movingA, movingB, fixedA, fixedB } = plan.axis;
  if (
    !stale &&
    moving &&
    fixed &&
    movingA &&
    movingB &&
    fixedA &&
    fixedB &&
    freshMeasurement(plan.axis.basis, plan.axis.measuredAt)
  ) {
    const ma = world(movingA, moving),
      mb = world(movingB, moving),
      fa = world(fixedA, fixed),
      fb = world(fixedB, fixed),
      length = Math.hypot(...sub(fb, fa));
    if (length < 0.125 || Math.hypot(...sub(mb, ma)) < 0.125)
      issues.push(
        issue(
          "axis-degenerate",
          "Use two distinct axis endpoints at the retained hinge segment ends.",
          "error",
        ),
      );
    else if (
      Math.hypot(...sub(ma, fa)) > ALIGN ||
      Math.hypot(...sub(mb, fb)) > ALIGN
    )
      issues.push(
        issue(
          "axis-alignment",
          "Moving and fixed endpoint pairs do not identify the same closed world axis. The 0.001 in comparison is numerical, not a fit allowance.",
          "error",
        ),
      );
    else if (segment && Math.abs(segment.length - length) > ALIGN)
      issues.push(
        issue(
          "axis-length",
          "Entered endpoint distance does not match the allocated retained segment length.",
          "error",
        ),
      );
    else
      resolvedAxis = {
        pivot: fa,
        axis: sub(fb, fa).map((n) => n / length) as V3,
        length,
      };
  } else if (!stale)
    issues.push(
      issue(
        "axis-pending",
        "Record paired moving/fixed local axis endpoints and their basis/date.",
      ),
    );
  const locations = plan.locations.map((location): HingeLocationReview => {
    const list: HingeIssue[] = [],
      host = location.leaf === "moving" ? moving : fixed;
    const result: HingeLocationReview = {
      location,
      state: stale ? "stale" : "needs-measurements",
      issues: list,
      entranceWorld: null,
      tipWorld: null,
      pilotTipWorld: null,
      availableDepth: null,
    };
    if (stale || !host) return result;
    if (!location.entranceLocal || !location.driveLocal) {
      list.push(
        issue(
          "hole-pending",
          "Transfer the actual leaf hole to its wood entrance and enter the inward direction.",
        ),
      );
      return result;
    }
    const entrance = location.entranceLocal,
      drive = location.driveLocal,
      facePlanes = planes(host),
      boundaries = facePlanes.filter(
        (p) => Math.abs(dot(p.normal, entrance) - p.constant) <= EPS,
      );
    if (
      facePlanes.some((p) => dot(p.normal, entrance) > p.constant + EPS) ||
      boundaries.length !== 1 ||
      dot(boundaries[0].normal, drive) >= -EPS
    ) {
      list.push(
        issue(
          "entrance-conflict",
          "The wood entrance must be on one actual retained face with an inward ray; removed stock/edges/outward directions are excluded.",
          "error",
          [host.id],
        ),
      );
      result.state = "conflict";
      return result;
    }
    const hit = interval(host, entrance, drive);
    if (!hit || Math.abs(hit.enter) > EPS) {
      list.push(
        issue(
          "path-conflict",
          "The entered ray does not enter the actual retained wood solid.",
          "error",
        ),
      );
      result.state = "conflict";
      return result;
    }
    result.entranceWorld = world(entrance, host);
    result.availableDepth = hit.exit;
    const m = location.measurements,
      depths = [m.surfaceToTipDepth, m.pilotDepth].filter(
        (n): n is number => n !== null,
      );
    if (depths.some((depth) => depth >= hit.exit - EPS))
      list.push(
        issue(
          "breakthrough",
          "A seated tip or deepest pilot-drill tip reaches or passes the assigned wood member's exit.",
          "error",
          [host.id],
        ),
      );
    if (m.surfaceToTipDepth !== null)
      result.tipWorld = world(
        add(entrance, drive.map((n) => n * m.surfaceToTipDepth!) as V3),
        host,
      );
    if (m.pilotDepth !== null)
      result.pilotTipWorld = world(
        add(entrance, drive.map((n) => n * m.pilotDepth!) as V3),
        host,
      );
    const depth = Math.max(0, ...depths),
      direction = rotate(drive, host.rotation);
    for (const other of project.pieces) {
      if (other.id === host.id || other.offcut || depth <= EPS) continue;
      const piece = other.id === moving?.id ? moving : other;
      const cross = interval(
        piece,
        local(result.entranceWorld, piece),
        rotate(direction, inverseRotation(piece.rotation)),
      );
      if (
        !cross ||
        Math.min(cross.exit, depth) - Math.max(cross.enter, 0) <= EPS
      )
        continue;
      let geometry: ReturnType<typeof prepareCollisionSolid> = null;
      try {
        geometry = prepareCollisionSolid(piece);
      } catch {
        /* A failed profile remains an incomplete path review. */
      }
      list.push(
        issue(
          "intervening-material",
          geometry?.kind === "solid"
            ? "The screw/drill centerline enters another retained member before its entered tip depth."
            : "Another material envelope may occupy the entered path; its actual profile needs review.",
          geometry?.kind === "solid" ? "error" : "review",
          [piece.id],
        ),
      );
    }
    if (
      !depths.length ||
      m.surfaceToTipDepth === null ||
      m.pilotDepth === null ||
      m.pilotDiameter === null ||
      !freshMeasurement(m.basis, m.measuredAt)
    )
      list.push(
        issue(
          "depths-pending",
          "Record actual seated surface-to-tip, pilot diameter, deepest pilot-tip depth and their basis/date. Nominal screw length is not a seating datum.",
        ),
      );
    result.state = list.some((i) => i.severity === "error")
      ? "conflict"
      : list.length
        ? "needs-measurements"
        : "geometry-reviewed";
    if (result.state === "conflict") {
      result.tipWorld = null;
      result.pilotTipWorld = null;
    }
    return result;
  });
  if (
    !plan.locations.length ||
    !plan.locations.some((l) => l.leaf === "moving") ||
    !plan.locations.some((l) => l.leaf === "fixed")
  )
    issues.push(
      issue(
        "holes-pending",
        "Transfer actual mounting holes for both leaves; no manufactured hole pattern or count is inferred.",
      ),
    );
  if (
    !plan.hardware.description.trim() ||
    !plan.hardware.drive.trim() ||
    plan.hardware.suppliedCount === null ||
    !freshMeasurement(plan.hardware.basis, plan.hardware.measuredAt)
  )
    issues.push(
      issue(
        "hardware-pending",
        "Record the actual screw identity/drive and observed contents; hinge screws are not substituted by a generic wood-screw product.",
      ),
    );
  const errors =
    issues.some((i) => i.severity === "error") ||
    locations.some((l) => l.state === "conflict");
  const pending =
    issues.some((i) => i.severity === "review") ||
    locations.some((l) => l.state === "needs-measurements");
  return {
    plan,
    state: stale
      ? "stale"
      : errors
        ? "conflict"
        : pending
          ? "needs-measurements"
          : "geometry-reviewed",
    issues,
    locations,
    resolvedAxis:
      !stale &&
      segment &&
      sourceReview?.state === "geometry-reviewed" &&
      !issues.some((i) => i.severity === "error")
        ? resolvedAxis
        : null,
    stockAllocation: plan.stockAllocation,
    activeHoleCount: stale
      ? 0
      : locations.filter((l) => l.state !== "conflict").length,
  };
}
export function lidHingeReviews(project: Project): HingeReview[] {
  return project.lidHingePlans.map((plan) => reviewPlan(project, plan));
}
export function hingePurchaseAllocations(project: Project) {
  return lidHingeReviews(project).flatMap((review) =>
    review.plan.stockAllocation
      ? [
          {
            planId: review.plan.id,
            sourceId: review.plan.stockAllocation.sourceId,
            segmentId: review.plan.stockAllocation.segmentId,
            included:
              review.state !== "stale" &&
              !review.issues.some((i) => i.severity === "error"),
            reasons: review.issues
              .filter(
                (i) =>
                  review.state === "stale" ||
                  i.severity === "error" ||
                  ["stock-pending", "stock-changed"].includes(i.code),
              )
              .map((i) => i.message),
          },
        ]
      : [],
  );
}
export function selectHingeMotion(
  project: Project,
  id: string,
  enabled: boolean,
): Project {
  const plan = project.lidHingePlans.find((p) => p.id === id);
  if (!plan) throw Error("Choose a saved hinge plan.");
  requireClosed(project, plan.sectionId);
  if (enabled && !reviewPlan(project, plan).resolvedAxis)
    throw Error(
      "Resolve the actual references, retained allocation and paired axis before selecting measured motion. Mounting holes may remain pending.",
    );
  return projectSchema.parse({
    ...project,
    guideFingerprint: null,
    lidHingePlans: project.lidHingePlans.map((p) =>
      p.sectionId === plan.sectionId
        ? { ...p, selectedForMotion: p.id === id ? enabled : false }
        : p,
    ),
  });
}
export function selectedHingeAxis(project: Project, sectionId: string) {
  const plan = project.lidHingePlans.find(
    (p) => p.sectionId === sectionId && p.selectedForMotion,
  );
  if (!plan) return null;
  const review = reviewPlan(project, plan);
  if (!review.resolvedAxis)
    throw Error(
      `${plan.label}: selected measured mechanism needs review. Close using its recorded axis, then refresh/remap; it has not fallen back to the provisional pivot.`,
    );
  return {
    ...review.resolvedAxis,
    planId: plan.id,
    movingPieceId: plan.moving.pieceId,
  };
}
export function refreshHingePlan(
  project: Project,
  plan: LidHingePlan,
): LidHingePlan {
  requireClosed(project, plan.sectionId);
  const old = project.lidHingePlans.find((p) => p.id === plan.id) ?? plan;
  if (
    old.moving.pieceId !== plan.moving.pieceId ||
    old.fixed.pieceId !== plan.fixed.pieceId
  )
    throw Error("Replacement IDs require the explicit mapping preview.");
  const review = reviewPlan(project, plan);
  if (review.state !== "stale") return plan;
  const moving = requireMember(project, plan.moving.pieceId),
    fixed = requireMember(project, plan.fixed.pieceId),
    at = new Date().toISOString();
  const next = cleared(
    {
      ...plan,
      moving: captureFastenerReference(project, moving, at),
      fixed: captureFastenerReference(project, fixed, at),
      closedPose: relativePose(moving, fixed),
      evidenceRevision: getHingeProduct(plan.productId)!.evidenceRevision,
      stockAllocation:
        plan.stockAllocation &&
        project.hingeStockSources.some(
          (s) => s.id === plan.stockAllocation!.sourceId,
        )
          ? {
              ...plan.stockAllocation,
              sourceFingerprint: sourceFingerprint(
                project.hingeStockSources.find(
                  (s) => s.id === plan.stockAllocation!.sourceId,
                )!,
              ),
            }
          : plan.stockAllocation,
    },
    "retain-local",
  );
  return archive(
    next,
    old,
    "refresh",
    "Explicit same-ID closed reference/source refresh. Earlier axis/depth observations are historical.",
    "retain-local",
  );
}
export type HingeRemapRequest = {
  movingId: string;
  fixedId: string;
  sectionId?: string;
  mode: "clear" | "retain-local";
  basis: string;
};
function reviewToken(project: Project, id: string) {
  return hash({
    id,
    plans: project.lidHingePlans,
    sources: project.hingeStockSources,
    pieces: project.pieces,
    sections: project.sections,
    zone: project.workZone,
  });
}
export function previewHingeRemap(
  project: Project,
  id: string,
  request: HingeRemapRequest,
) {
  const old = project.lidHingePlans.find((p) => p.id === id);
  if (!old || !request.basis.trim())
    throw Error("Choose a saved plan and record the replacement review basis.");
  const sectionId = request.sectionId ?? old.sectionId;
  requireClosed(project, sectionId);
  requirePreviousSectionClosed(project, old.sectionId);
  if (
    sectionId === old.sectionId &&
    request.movingId === old.moving.pieceId &&
    request.fixedId === old.fixed.pieceId
  )
    throw Error(
      "Choose at least one different actual member for replacement. Use Refresh references for changed members with the same IDs.",
    );
  const moving = requireMember(project, request.movingId),
    fixed = requireMember(project, request.fixedId),
    at = new Date().toISOString();
  if (
    moving.id === fixed.id ||
    !project.sections
      .find((s) => s.id === sectionId)!
      .pieceIds.includes(moving.id)
  )
    throw Error(
      "Choose a lid in the selected section and a distinct fixed receiver.",
    );
  let plan = cleared(
    {
      ...old,
      sectionId,
      selectedForMotion: false,
      moving: captureFastenerReference(project, moving, at),
      fixed: captureFastenerReference(project, fixed, at),
      closedPose: relativePose(moving, fixed),
      evidenceRevision: getHingeProduct(old.productId)!.evidenceRevision,
    },
    request.mode,
  );
  plan = archive(plan, old, "remap", request.basis.trim(), request.mode);
  return {
    token: reviewToken(project, id),
    plan,
    project: saveLidHingePlan(project, plan),
    changed: true,
    request,
  };
}
export function applyHingeRemap(
  project: Project,
  preview: ReturnType<typeof previewHingeRemap>,
): Project {
  if (preview.token !== reviewToken(project, preview.plan.id))
    throw Error(
      "The project changed after this hinge mapping preview. Preview again; no replacement was applied.",
    );
  return saveLidHingePlan(project, preview.plan);
}
