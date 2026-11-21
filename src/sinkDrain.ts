import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Piece, Project } from "./model";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import type { CodeReviewRow } from "./projectCode";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { sinkTrap, sinkDrainReferences, sinkTrapSlope, sinkTrapVentReach } from "./sinkDrainReference";
import type { SinkDrain, SinkDrainInput } from "./sinkDrainSchema";
import { utahAdoptionVersions, utahSources } from "./utahCodeSources";
import { waterRunFits } from "./wallWater";

export const sinkDrainStageKey = "sink-drain";
export const drainTolerance = 1e-6;
const planningRangeReviewedThrough = "2026-11-21";
const up = new Vector3(0, 1, 0);
type Pose = Pick<Piece, "material" | "position" | "rotation" | "size">;

export function sinkDrainLayout(project: Project, input: SinkDrainInput, editing?: SinkDrain) {
  if ((project.sinkDrains ?? []).some((row) => row.id !== editing?.id &&
      (["tail", "wall"] as const).some((name) => new Vector3(...input[name]).distanceTo(new Vector3(...row[name])) < 0.0625)))
    throw Error("These marks already belong to a sink drain plan.");
  const tail = new Vector3(...input.tail), wall = new Vector3(...input.wall);
  const x = wall.clone().sub(tail).setY(0).normalize();
  const horizontal = wall.clone().sub(tail).dot(x) - input.bendReach;
  if (horizontal <= drainTolerance) throw Error("The wall mouth needs room beyond the measured bend before the straight tube can connect.");
  const lip = tail.clone().addScaledVector(up, input.tailSeat);
  const start = lip.clone().addScaledVector(x, input.bendReach).addScaledVector(up, -input.outletDrop);
  const diameter = sinkTrap.diameter, radius = diameter / 2;
  const lowest = lip.y - input.bodyDrop, highest = Math.max(lip.y, start.y + radius);
  if (lowest > Math.min(tail.y, start.y - radius) - drainTolerance)
    throw Error("The trap depth must include the tailpiece engagement and the wall tube at the bend.");
  const collar = input.bodyWidth / 2;
  if (input.bendReach <= collar + radius)
    throw Error("The measured bend reach needs room for the inlet collar and the outlet tube.");
  const bodyOrientation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, up, x.clone().cross(up)));
  const bodyPosition = lip.clone().addScaledVector(x, (input.bendReach - collar) / 2).setY((lowest + highest) / 2);
  const body: Pose = {
    material: sinkTrap.id, size: [input.bendReach + collar, highest - lowest, input.bodyWidth],
    position: bodyPosition.toArray(), rotation: [bodyOrientation.x, bodyOrientation.y, bodyOrientation.z],
  };
  const direction = wall.clone().sub(start);
  const visible = direction.length();
  direction.normalize();
  const keep = visible + input.wallSeat;
  if (keep > input.blank + drainTolerance)
    throw Error(`This fit needs ${dim(keep)} of straight wall tube, including the wall engagement. The measured blank is ${dim(input.blank)}.`);
  const fall = start.y - wall.y;
  const slope = fall * 12 / horizontal;
  const rotation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(up, direction));
  const tube: Pose = {
    material: sinkTrap.tube, size: [diameter, keep, diameter],
    position: start.clone().addScaledVector(direction, keep / 2).toArray(), rotation: [rotation.x, rotation.y, rotation.z],
  };
  const access = bodyPosition.clone().setY(lowest - input.service / 2);
  const checks = [
    { name: "Trap envelope", solid: prepareCollisionBox(body.size, body.position, body.rotation) },
    { name: "Straight wall tube", solid: prepareCollisionBox(tube.size, tube.position, tube.rotation) },
    { name: "Trap removal space", solid: prepareCollisionBox([body.size[0], input.service, body.size[2]], access.toArray(), body.rotation) },
  ];
  const zone = project.workZone;
  for (const { name, solid } of checks) {
    const limits = zone ? [[-zone.width / 2, zone.width / 2], [0, zone.height], [-zone.depth / 2, zone.depth / 2]] : undefined;
    if (limits?.some(([min, max], i) => solid.bounds.min[i] < min - drainTolerance || solid.bounds.max[i] > max + drainTolerance)
      || solid.bounds.min[1] < -drainTolerance)
      throw Error(`${name} crosses the ${solid.bounds.min[1] < -drainTolerance ? "floor" : "work-zone boundary"}.`);
  }
  const ignored = new Set([editing?.bodyId, editing?.tubeId]);
  for (const piece of project.pieces) {
    if (piece.offcut || ignored.has(piece.id)) continue;
    const checkRadius = Math.hypot(...piece.size) / 2;
    const broad = checks.filter(({ solid: { bounds } }) => piece.position.every((value, i) =>
      value - checkRadius < bounds.max[i] && value + checkRadius > bounds.min[i]));
    if (!broad.length) continue;
    const envelope = prepareCollisionBox(piece.size, piece.position, piece.rotation);
    const near = broad.filter(({ solid }) => solid.bounds.min.every((value, i) =>
      value < envelope.bounds.max[i] - drainTolerance && solid.bounds.max[i] > envelope.bounds.min[i] + drainTolerance));
    if (!near.length) continue;
    const obstacle = prepareCollisionSolid(piece) ?? envelope;
    const hit = near.find(({ solid }) => solidOverlap(solid, obstacle));
    if (hit) throw Error(`${hit.name} hits ${piece.name}. Check the fixture marks and access.`);
  }
  return { body, tube, start: start.toArray(), lip: lip.toArray(), keep, visible, horizontal, fall, slope };
}

export function reviewSinkDrain(project: Project, record: SinkDrain) {
  try {
    const layout = sinkDrainLayout(project, record, record);
    const body = project.pieces.find(({ id }) => id === record.bodyId);
    const tube = project.pieces.find(({ id }) => id === record.tubeId);
    if (!body || !tube || body.offcut || tube.offcut || !waterRunFits(body, layout.body) || !waterRunFits(tube, layout.tube))
      return { problem: "The trap or tube changed. Reopen this drain plan to check its fit and cut." };
    return { layout };
  } catch (issue) {
    return { problem: issue instanceof Error ? issue.message : "Review this sink drain fit." };
  }
}

export function sinkDrainCodeRows(project: Project, input: SinkDrainInput, layout: ReturnType<typeof sinkDrainLayout>): CodeReviewRow[] {
  const code = project.projectCode;
  const version = utahAdoptionVersions[0];
  const reviewed = !!(code?.region === "utah" && code.projectDate && code.projectDate >= version.effectiveFrom &&
    code.projectDate <= planningRangeReviewedThrough && code.trades.includes("plumbing") &&
    code.codePath !== "unknown" && code.work !== "unknown" && code.buildingAuthority && code.authorityBasis);
  const ipc = code?.codePath === "ibc", selected = reviewed ? ipc ? [sinkDrainReferences.ipcSlope, sinkDrainReferences.ipcVent] :
    [sinkDrainReferences.ircSlope, sinkDrainReferences.ircVent] : Object.values(sinkDrainReferences);
  const jurisdiction = reviewed ? [version.source, ipc ? utahSources.ipc : utahSources.irc] : [];
  const diameter = sinkTrap.diameter;
  const shortfall = layout.horizontal * sinkTrapSlope / 12 - layout.fall;
  const row = (id: string, label: string, state: CodeReviewRow["state"], detail: string): CodeReviewRow =>
    ({ id, label, state, detail, sources: [...selected, ...jurisdiction] });
  const rows = [row("visible-slope", "Visible tube slope", shortfall > drainTolerance ? "discrepancy" : "measured-match",
    `${dim(layout.slope)} per foot toward the wall.${shortfall > drainTolerance
      ? ` The measured endpoints need ${dim(shortfall)} more fall to reach the ¼ in per foot reference.` : " Matches the ¼ in per foot reference for this size."}`)];
  if (!input.vent) rows.push(row("vent", "Measured trap-to-vent path", "needs-input",
    "Measure the full path from the trap weir to the vent connection, including the section beyond the wall."));
  else {
    const { length, fall, takeoff, uniform } = input.vent;
    const notes = [
      ...(length < layout.visible - drainTolerance ? ["The entered path is shorter than the visible tube."] : []),
      ...(Math.abs(fall) >= length - drainTolerance ? ["The entered fall is inconsistent with the developed length."] : []),
      ...(length < 2 * diameter - drainTolerance ? ["The vent is closer than two pipe diameters to the trap weir."] : []),
      ...(length > sinkTrapVentReach + drainTolerance ? ["The developed length exceeds the 6 ft reference for this trap."] : []),
      ...(fall > diameter + drainTolerance ? ["The total fall exceeds one nominal pipe diameter."] : []),
      ...(fall < layout.fall - drainTolerance ? ["The entered total fall is smaller than the fall in the visible tube."] : []),
      ...(takeoff < -drainTolerance ? ["The vent takeoff is below the trap weir."] : []),
      ...(Math.abs(fall) < length - drainTolerance && fall * 12 / Math.sqrt(length ** 2 - fall ** 2) < sinkTrapSlope - drainTolerance
        ? ["The overall fall is below the reference for this length."] : []),
    ];
    rows.push(row("vent", "Measured trap-to-vent path", notes.length ? "discrepancy" : uniform ? "measured-match" : "needs-input",
      [`Developed length ${dim(length)}, total fall ${dim(fall)} and takeoff height relative to weir ${dim(takeoff)}.`,
        ...(notes.length ? notes : uniform ? ["The field measurements match the distance, fall and takeoff references."] :
          ["Verify uniform fall along the entire run, including concealed sections."])].join(" ")));
  }
  if (!reviewed) rows.push(row("jurisdiction", "Local applicability", "authority-review",
    `These are published reference comparisons. Confirm the applicable jurisdiction, edition and inspection. The reviewed Utah period is July 1 through ${planningRangeReviewedThrough}.`));
  return rows;
}

export function sinkDrainOffcut(piece: Piece, name: string): Piece {
  const { guidePlacement: _guide, designRole: _role, ...loose } = piece;
  return { ...loose, name, offcut: true, assembly: "" };
}

export function removeSinkDrain(project: Project, record: SinkDrain, keepTube = true): Project {
  const ids = new Set([record.bodyId, record.tubeId]);
  return {
    ...project, sinkDrains: project.sinkDrains?.filter(({ id }) => id !== record.id),
    pieces: project.pieces.flatMap((piece) => piece.id === record.tubeId && keepTube && piece.cutStock
      ? [sinkDrainOffcut(piece, "Offcut · Removed sink wall tube")] : ids.has(piece.id) ? [] : [piece]),
    joints: project.joints.filter(({ a, b }) => !ids.has(a) && !ids.has(b)), guideFingerprint: null,
  };
}

export function sinkDrainGuide(project: Project, record: SinkDrain) {
  const { layout, problem } = reviewSinkDrain(project, record);
  if (!layout) return [`${record.name} · Review drain fit. ${problem}`];
  const tube = project.pieces.find(({ id }) => id === record.tubeId)!;
  const siblings = project.pieces.filter((piece) => piece.offcut && tube.cutStock && piece.cutStock?.id === tube.cutStock.id);
  return [
    `${record.name} · One Oatey ${sinkTrap.model} kit at a compatible, existing wall waste connector. Tailpiece ${dim(record.tailDiameter)}${record.tailDiameter === 1.25 ? " with the kit reducing washer" : " with the matching 1½ in washer"}.`,
    `Square-cut the straight wall tube to ${formatStockLength(layout.keep)} measured from the bend tangent. Wall engagement ${dim(record.wallSeat)}. Tailpiece engagement ${dim(record.tailSeat)}. Dry-fit the kit and confirm the cut mark, the tube alignment and unstrained slip joints.`,
    ...(siblings.length ? [`Cut pool · ${siblings.map(({ size }) => dim(size[1])).join(", ")} from this kit. Check diameter, undamaged ends and both engagement lengths before planning reuse.`] : []),
    `Leave the measured ${dim(record.service)} clearance below the trap. Fit the supplied nuts and matching washers, keep the joint accessible and water-test the finished drain for leaks.`,
    ...sinkDrainCodeRows(project, record, layout).map(({ label, detail }) => `${label} · ${detail}`),
  ];
}
