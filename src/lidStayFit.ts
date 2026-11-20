import { Vector3 } from "three";
import { attachmentGeometryFingerprint } from "./attachments";
import { bindingHash } from "./ideaBindingState";
import { lidWeightPose } from "./lidMotion";
import {
  reviewStayClearance,
  stayClearanceStep,
  type StayArmContact,
  type StayArmPreview,
} from "./lidStayClearance";
import {
  foldingLidStays,
  type FoldingLidStayProductId,
} from "./lidStayReference";
import {
  lidStayFitInputSchema,
  lidStayFitSchema,
  type LidStayFit,
  type LidStayFitInput,
} from "./lidStayFitSchema";
import { formatPreciseInches } from "./measurement";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { addSupply } from "./supplies";

const radians = Math.PI / 180;
const epsilon = 1e-7;
const unitVectors: V3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const vec = (value: V3) => new Vector3(...value);
const fromPiece = (point: V3, piece: Piece) =>
  vec(rotate(point, piece.rotation)).add(vec(piece.position));

export const lidStayFitScope =
  "Enter arm dimensions to check rectangular pin-to-pin bodies against modeled parts. Check pivot and bracket shapes, arm-to-arm clearance, release access, pinch points and load suitability on the hardware.";

function mountFrame(project: Project, sectionId: string, fixedPieceId: string) {
  const closed = lidWeightPose(project, sectionId);
  const section = project.sections.find((row) => row.id === sectionId)!;
  const fixed = project.pieces.find(
    (piece) =>
      piece.id === fixedPieceId &&
      section.pieceIds.includes(piece.id) &&
      piece.id !== closed.piece.id &&
      !piece.offcut &&
      material(piece.material).wood,
  );
  if (!fixed)
    throw Error("Choose a stationary wood member in this lid's section.");
  return { closed, fixed };
}

function baseline({ closed, fixed }: ReturnType<typeof mountFrame>) {
  const inverse = inverseRotation(fixed.rotation);
  const direction = (value: V3) =>
    rotate(value, inverse).map((n) => Number(n.toFixed(7)));
  const point = (value: V3) =>
    direction(value.map((n, i) => n - fixed.position[i]) as V3);
  return bindingHash([
    attachmentGeometryFingerprint(fixed),
    attachmentGeometryFingerprint(closed.piece),
    point(closed.pivot),
    direction(closed.axis),
    point(closed.piece.position),
    unitVectors.map((axis) => direction(rotate(axis, closed.piece.rotation))),
    closed.mechanism?.planId ?? null,
  ]);
}

export function saveLidStayFit(
  project: Project,
  sectionId: string,
  input: LidStayFitInput,
  id?: string,
): Project {
  const parsed = lidStayFitInputSchema.parse(input);
  const fits = project.lidStayFits ?? [];
  if (id && !fits.some((row) => row.id === id && row.sectionId === sectionId))
    throw Error("Choose a saved stay in this section.");
  const frame = mountFrame(project, sectionId, parsed.fixedPieceId);
  const stay = lidStayFitSchema.parse({
    ...parsed,
    id: id ?? uid(),
    sectionId,
    lidPieceId: frame.closed.piece.id,
    baseline: baseline(frame),
  });
  return projectSchema.parse({
    ...project,
    lidStayFits: id
      ? fits.map((fit) => (fit.id === id ? stay : fit))
      : [...fits, stay],
    guideFingerprint: null,
  });
}
export function removeLidStayFit(project: Project, id: string): Project {
  const fits = project.lidStayFits?.filter((fit) => fit.id !== id);
  if (fits?.length === project.lidStayFits?.length) return project;
  const { lidStayFits: _old, ...rest } = project;
  return {
    ...rest,
    ...(fits?.length ? { lidStayFits: fits } : {}),
    guideFingerprint: null,
  };
}

export type LidStayLink = {
  id: string;
  points: V3[];
  state: "reachable" | "too-short" | "too-far";
  distance: number;
  arms?: StayArmPreview[];
};

function linkReview(
  project: Project,
  frame: ReturnType<typeof mountFrame>,
  fit: LidStayFit,
) {
  const { closed, fixed } = frame;
  const base = fromPiece(fit.fixedPin, fixed);
  const hinge = vec(closed.pivot),
    axis = vec(closed.axis).normalize();
  const lever = fromPiece(fit.lidPin, closed.piece).sub(hinge);
  const axial = axis.clone().multiplyScalar(lever.dot(axis));
  const radial = lever.clone().sub(axial);
  const tangent = axis.clone().cross(radial).negate();
  const offset = hinge.clone().add(axial).sub(base);
  const constant = offset.lengthSq() + radial.lengthSq();
  const cosine = 2 * offset.dot(radial);
  const sine = 2 * offset.dot(tangent);
  const phase = Math.atan2(sine, cosine);
  const minimum = Math.abs(fit.fixedArm - fit.lidArm);
  const maximum = fit.fixedArm + fit.lidArm;
  const distanceAt = (angle: number) =>
    Math.sqrt(
      Math.max(
        0,
        constant +
          cosine * Math.cos(angle * radians) +
          sine * Math.sin(angle * radians),
      ),
    );
  const stateAt = (distance: number): LidStayLink["state"] =>
    distance <= epsilon || distance < minimum - epsilon
      ? "too-short"
      : distance > maximum + epsilon
        ? "too-far"
        : "reachable";
  function pointsBetween(from: number, to: number) {
    const low = Math.min(from, to),
      high = Math.max(from, to);
    const points = [from, to];
    if (Math.hypot(cosine, sine) > epsilon) {
      const first = Math.ceil((low * radians - phase) / Math.PI);
      const last = Math.floor((high * radians - phase) / Math.PI);
      for (let i = first; i <= last; i++) {
        const angle = (phase + i * Math.PI) / radians;
        if (angle > low && angle < high) points.push(angle);
      }
    }
    return points.sort((a, b) => Math.sign(to - from) * (a - b));
  }
  function playbackLimit(from: number, to: number) {
    if (
      ![from, to].every(
        (angle) => Number.isFinite(angle) && angle >= 0 && angle <= 90,
      )
    )
      throw Error("Choose folding stay playback angles from 0° to 90°.");
    let clear = from;
    for (const angle of pointsBetween(from, to)) {
      if (stateAt(distanceAt(angle)) === "reachable") {
        clear = angle;
        continue;
      }
      let blocked = angle;
      while (Math.abs(blocked - clear) > 0.0001) {
        const mid = (clear + blocked) / 2;
        if (stateAt(distanceAt(mid)) === "reachable") clear = mid;
        else blocked = mid;
      }
      return {
        travel: clear,
        inspectAt: blocked,
        id: fit.id,
        kind: "reach" as const,
      };
    }
    return null;
  }
  function preview(angle: number): LidStayLink {
    const upper = hinge
      .clone()
      .add(lever.clone().applyAxisAngle(axis, -angle * radians));
    const delta = upper.clone().sub(base);
    const distance = delta.length();
    const state = stateAt(distance);
    const ends: V3[] = [base.toArray(), upper.toArray()];
    if (state !== "reachable")
      return { id: fit.id, points: ends, state, distance };
    const along =
      (fit.fixedArm ** 2 - fit.lidArm ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, fit.fixedArm ** 2 - along ** 2));
    const line = delta.normalize();
    const side = axis.clone().cross(line).normalize();
    const elbow = base
      .clone()
      .addScaledVector(line, along)
      .addScaledVector(side, height * fit.foldSign);
    return {
      id: fit.id,
      points: [ends[0], elbow.toArray(), ends[1]],
      state,
      distance,
    };
  }
  const coplanar = Math.abs(offset.dot(axis)) <= epsilon;
  if (!coplanar)
    return {
      state: "needs-measurement" as const,
      reason:
        "Align the two measured pin centers in one plane perpendicular to the lid hinge axis.",
    };
  const distances = pointsBetween(0, fit.testAngle).map(distanceAt);
  const clearance = reviewStayClearance(
    project,
    fit,
    closed,
    base,
    (angle) => preview(angle).points,
  );
  const limit = playbackLimit(0, fit.testAngle);
  return {
    state: "current" as const,
    distanceRange: [Math.min(...distances), Math.max(...distances)] as [
      number,
      number,
    ],
    allowedRange: [minimum, maximum] as [number, number],
    limit,
    armClearance: clearance
      ? () => clearance.playbackLimit(0, limit?.travel ?? fit.testAngle)
      : null,
    playbackLimit(from: number, to: number) {
      const reach = playbackLimit(from, to);
      return clearance?.playbackLimit(from, reach?.travel ?? to) ?? reach;
    },
    preview(angle: number) {
      const link = preview(angle);
      return clearance ? { ...link, arms: clearance.preview(angle) } : link;
    },
  };
}

export function reviewLidStayFit(project: Project, fit: LidStayFit) {
  try {
    const frame = mountFrame(project, fit.sectionId, fit.fixedPieceId);
    if (
      frame.closed.piece.id !== fit.lidPieceId ||
      baseline(frame) !== fit.baseline
    )
      return {
        state: "stale" as const,
        reason:
          "The lid, hinge axis or mounting member changed. Verify the pin marks and save the measurements again.",
      };
    return linkReview(project, frame, fit);
  } catch (problem) {
    return {
      state: "stale" as const,
      reason:
        problem instanceof Error
          ? problem.message
          : "Restore both mounting members before reviewing the stay.",
    };
  }
}

export function limitLidStayPlayback(
  reviews: readonly ReturnType<typeof reviewLidStayFit>[],
  from: number,
  to: number,
) {
  const first = reviews
    .flatMap((review) => {
      if (review.state !== "current") return [];
      const limit = review.playbackLimit(from, to);
      return limit ? [limit] : [];
    })
    .sort((a, b) => Math.abs(a.travel - from) - Math.abs(b.travel - from))
    .at(0);
  return first ?? null;
}

export function lidStayPurchases(
  project: Project,
  id: FoldingLidStayProductId,
) {
  const needed = (project.lidStayFits ?? []).filter(
    (fit) =>
      fit.productId === id && reviewLidStayFit(project, fit).state !== "stale",
  ).length;
  const already = project.supplies
    .filter((item) => item.productId === id)
    .reduce((n, line) => n + line.quantity, 0);
  return { needed, already, missing: Math.max(needed - already, 0) };
}
export function addMissingLidStays(
  project: Project,
  id: FoldingLidStayProductId,
) {
  const { missing } = lidStayPurchases(project, id);
  return missing
    ? addSupply(project, id, missing, "Folding lid stays")
    : project;
}

const range = (values: readonly number[]) =>
  values.map(formatPreciseInches).join(" to ");
export function armContactText(project: Project, hit: StayArmContact) {
  return `Modeled stay arm hits ${hit.hitIds.map((id) => partLabel(project, id)).join(", ")} near ${Number(hit.inspectAt.toFixed(2))}°.`;
}
export function lidStayFitGuideRows(project: Project) {
  return (project.lidStayFits ?? []).map((fit) => {
    const review = reviewLidStayFit(project, fit);
    const source = fit.productId ? foldingLidStays[fit.productId] : null;
    const label = `${partLabel(project, fit.fixedPieceId)} to ${partLabel(project, fit.lidPieceId)} · ${source ? `Everbilt ${source.model} ${source.hand.toLowerCase()}` : "Measured folding stay"}`;
    const armHit = review.state === "current" ? review.armClearance?.() : null;
    const result =
      review.state === "current"
        ? [
            `Pin spacing ${range(review.distanceRange)} over 0–${fit.testAngle}°. Measured arms allow ${range(review.allowedRange)}.`,
            review.limit
              ? `Measured reach stops travel near ${Number(review.limit.inspectAt.toFixed(2))}°.`
              : "Measured pin reach covers the tested swing.",
            review.armClearance
              ? armHit
                ? armContactText(project, armHit)
                : `No modeled arm overlap found at ${stayClearanceStep}° intervals through ${Number((review.limit?.travel ?? fit.testAngle).toFixed(2))}°. Check clearances between those angles.`
              : "Add measured arm dimensions to review overlap.",
          ].join(" ")
        : review.reason;
    const sizes = fit.armEnvelopes?.map(
      ({ width, thickness }) =>
        `${formatPreciseInches(width)} wide × ${formatPreciseInches(thickness)} thick`,
    );
    const settings = `Cabinet pin (${fit.fixedPin.map(formatPreciseInches).join(", ")}), lid pin (${fit.lidPin.map(formatPreciseInches).join(", ")}), from the respective blank centers in local X/Y/Z. Arm spans ${[fit.fixedArm, fit.lidArm].map(formatPreciseInches).join(" and ")}. Elbow setting ${fit.foldSign === 1 ? "A" : "B"}.${sizes ? ` Cabinet arm ${sizes[0]}. Lid arm ${sizes[1]}.` : ""}`;
    const sourceNote =
      source &&
      fit.testAngle < 90 &&
      "The listed 90° setup is outside this tested swing.";
    return { id: fit.id, label, result, settings, source, sourceNote };
  });
}
export function lidStayFitGuideMarkdown(project: Project) {
  const rows = lidStayFitGuideRows(project);
  return rows.length
    ? `\n\n## Folding lid stay fit\n\n${rows
        .map(
          (row) =>
            `- **${row.label}** · ${row.result}\n  - Entered marks: ${row.settings}${row.sourceNote ? `\n  - ${row.sourceNote}` : ""}${row.source ? `\n  - [Home Depot reference](${row.source.listing}) · [Installation drawing](${row.source.manual})` : ""}`,
        )
        .join("\n")}\n\n${lidStayFitScope}\n`
    : "";
}
