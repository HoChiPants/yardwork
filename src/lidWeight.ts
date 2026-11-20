import { Vector3 } from "three";
import { bindingHash } from "./ideaBindingState";
import { lidWeightPose } from "./lidMotion";
import { lidWeightPlanSchema, type LidWeightPlan } from "./lidWeightSchema";
import type { Piece, Project } from "./model";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";
import { rotate } from "./spatial";
import { everbiltLidSupport, springLidStay } from "./lidStayReference";

export const lidMomentReference =
  "https://global.sugatsune.com/-/media/pim/SUGATSUNE/SUGATSUNE_GLOBAL/Manual/1079/1079_5_hg_knt_e";
export const lidWeightScope =
  "Gravity only. Check the chosen hardware’s mounting, torque range, hold-open and soft-close behavior separately.";

const radians = Math.PI / 180;
const geometryKey = (piece: Piece) =>
  bindingHash([piece.material, piece.size, piece.cutPlanes]);

export function saveLidWeight(
  project: Project,
  sectionId: string,
  input: Pick<LidWeightPlan, "weightLb" | "centerLocal">,
) {
  const { piece } = lidWeightPose(project, sectionId);
  const plan = lidWeightPlanSchema.parse({
    ...input,
    sectionId,
    pieceId: piece.id,
    geometryKey: geometryKey(piece),
  });
  const others = (project.lidWeightPlans ?? []).filter(
    (row) => row.sectionId !== sectionId,
  );
  if (others.length >= 100)
    throw Error("Limit the project to 100 lid weight measurements.");
  return {
    ...project,
    lidWeightPlans: [...others, plan],
    guideFingerprint: null,
  };
}

export function removeLidWeight(project: Project, sectionId: string) {
  const { lidWeightPlans, ...rest } = project;
  const remaining = lidWeightPlans?.filter(
    (plan) => plan.sectionId !== sectionId,
  );
  return {
    ...rest,
    ...(remaining?.length ? { lidWeightPlans: remaining } : {}),
    guideFingerprint: null,
  };
}

export function reviewLidWeight(project: Project, plan: LidWeightPlan) {
  let closed;
  try {
    closed = lidWeightPose(project, plan.sectionId);
  } catch {
    return {
      state: "stale" as const,
      reason:
        "Restore or review the lid and its hinge axis to calculate torque.",
    };
  }
  if (
    closed.piece.id !== plan.pieceId ||
    geometryKey(closed.piece) !== plan.geometryKey
  )
    return {
      state: "stale" as const,
      reason:
        "The lid changed shape or material. Recheck its weight and balance point.",
    };

  const axis = new Vector3(...closed.axis).normalize();
  const offset = new Vector3(...rotate(plan.centerLocal, closed.piece.rotation))
    .add(new Vector3(...closed.piece.position))
    .sub(new Vector3(...closed.pivot));
  const gravity = new Vector3(0, -plan.weightLb, 0);
  const torque = (arm: Vector3) => arm.clone().cross(gravity).dot(axis);
  // Opening rotates around the negative axis. Constant axial offsets create no moment.
  const a = torque(offset);
  const b = torque(new Vector3().crossVectors(offset, axis));
  const at = (angle: number) =>
    a * Math.cos(angle * radians) + b * Math.sin(angle * radians);
  const criticalAngle = Math.atan2(b, a) / radians;
  function peakThrough(lastAngle: number) {
    const angles = [
      0,
      lastAngle,
      ...[criticalAngle - 180, criticalAngle, criticalAngle + 180].filter(
        (angle) => angle > 0 && angle < lastAngle,
      ),
    ];
    const peakAngle = angles.reduce((best, angle) =>
      Math.abs(at(angle)) > Math.abs(at(best)) ? angle : best,
    );
    return { peakAngle, peak: at(peakAngle) };
  }
  return {
    state: "ready" as const,
    angleTorque: at,
    ...peakThrough(LID_OPEN_ANGLE_DEGREES),
    peakThrough,
    levelTopOpening:
      Math.abs(axis.y) <= 1e-5 &&
      Math.abs(rotate([0, 1, 0], closed.piece.rotation)[1]) >= 1 - 1e-5,
    axisLabel: closed.mechanism
      ? "Measured hinge axis"
      : "Provisional rear pivot",
  };
}

export const formatLidWeightNumber = (value: number) =>
  String(Number(value.toFixed(2)));
export function formatLidTorque(lbfIn: number) {
  const magnitude = formatLidWeightNumber(Math.abs(lbfIn));
  return magnitude === "0"
    ? "0 lb-in"
    : `${magnitude} lb-in ${lbfIn > 0 ? "closing" : "opening"}`;
}

export const lidStayScope = `Published torque ranges use the lid’s horizontal moment. Review the mounting drawing, hinge type, fasteners and hold-open behavior. The 3D clearance preview covers 0–${LID_OPEN_ANGLE_DEGREES}°. The ${springLidStay.model} installation drawing uses ${springLidStay.maxAngle}°.`;

export function lidStayTorqueComparison(
  review: ReturnType<typeof reviewLidWeight>,
) {
  if (review.state !== "ready") return { note: review.reason, rows: [] };
  if (
    !review.levelTopOpening ||
    [0, springLidStay.maxAngle].some(
      (angle) => review.angleTorque(angle) < -1e-7,
    )
  )
    return {
      note: "The published ranges apply to a level top lid that gravity pulls closed. Review this orientation with the manufacturer.",
      rows: [],
    };
  const closed = review.angleTorque(0);
  const { peak, peakAngle } = review.peakThrough(springLidStay.maxAngle);
  const toNm = (lbfIn: number) => lbfIn * 4.4482216152605 * 0.0254;
  const torqueNm = toNm(closed);
  const rows = springLidStay.mounts.map(({ location, minNm, maxNm }) => ({
    location,
    range: `${minNm}–${maxNm} N·m`,
    result:
      torqueNm < minNm
        ? "Below published range"
        : torqueNm > maxNm
          ? "Above published range"
          : "Within published range",
  }));
  const note = `${formatLidTorque(closed)} at 0° (${formatLidWeightNumber(torqueNm)} N·m) · ${review.axisLabel}.`;
  const peakNote =
    peak - closed >= 0.01
      ? `Gravity torque peaks at ${formatLidWeightNumber(toNm(peak))} N·m at ${formatLidWeightNumber(peakAngle)}° with the entered balance point. Review this higher torque with the manufacturer.`
      : "";
  return {
    note: peakNote ? `${note} ${peakNote}` : note,
    rows,
  };
}

export function lidWeightGuideRows(project: Project) {
  return (project.lidWeightPlans ?? []).map((plan) => {
    const review = reviewLidWeight(project, plan);
    const label =
      project.sections.find((section) => section.id === plan.sectionId)?.name ??
      "Removed lid section";
    const input = `${formatLidWeightNumber(plan.weightLb)} lb · balance offset (local X, Y, Z) ${plan.centerLocal.map(formatLidWeightNumber).join(", ")} in`;
    const result =
      review.state === "ready"
        ? `${review.axisLabel} · closed ${formatLidTorque(review.angleTorque(0))} · peak ${formatLidTorque(review.peak)} at ${formatLidWeightNumber(review.peakAngle)}° over the modeled 0–${LID_OPEN_ANGLE_DEGREES}° swing`
        : review.reason;
    const stay = lidStayTorqueComparison(review);
    const stayText = stay.rows.length
      ? `${springLidStay.model} · ${stay.note} ${stay.rows.map(({ location, range, result }) => `${location} ${range} · ${result}`).join(". ")}.`
      : stay.note;
    return {
      id: plan.sectionId,
      label,
      text: `${input} · ${result}`,
      stayText,
    };
  });
}

export function lidWeightGuideMarkdown(project: Project) {
  const rows = lidWeightGuideRows(project);
  if (!rows.length) return "";
  const clean = (line: string) =>
    line.replace(/[\r\n]+/g, " ").replace(/[\x5c`*_\[\]<>]/g, "\\$&");
  return (
    "## Lid weight and gravity torque\n\n" +
    rows
      .map(({ label, text }) => `- ${clean(label)} · ${clean(text)}`)
      .join("\n") +
    `\n\n${lidWeightScope} [Manufacturer lid moment reference](${lidMomentReference})\n\n## Lid stay torque comparison\n\n` +
    rows
      .map(({ label, stayText }) => `- ${clean(label)} · ${clean(stayText)}`)
      .join("\n") +
    `\n\n${lidStayScope} [Sugatsune installation manual](${springLidStay.manual})\n\nEverbilt ${everbiltLidSupport.model} · ${everbiltLidSupport.scope} [Home Depot listing](${everbiltLidSupport.listing})\n\n`
  );
}
