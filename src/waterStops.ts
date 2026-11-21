import { Euler, Matrix4, Vector3 } from "three";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { waterRunFits } from "./wallWater";
import { readWaterRunPort, waterPortKey } from "./waterFittings";
import { waterFittingPorts, type WaterRunEnd } from "./waterFittingSchema";
import { waterStop, waterStopDepthNote } from "./waterStopReference";
import type { WaterStop, WaterStopInput } from "./waterStopSchema";

export const waterStopStageKey = "water-stop";
const tolerance = 1e-6;

export function stopEndSign({ end }: WaterRunEnd) {
  return end === "start" ? -1 : 1;
}

export function waterStopOccupant(project: Project, port: WaterRunEnd, editing?: string) {
  const key = waterPortKey(port);
  if (project.waterFittings?.some((fitting) => waterFittingPorts(fitting).some((end) => waterPortKey(end) === key)))
    return "a PEX fitting";
  return project.waterStops?.find((row) => row.id !== editing && waterPortKey(row.port) === key)?.name;
}

export function waterStopLayout(project: Project, input: WaterStopInput, pieceId?: string, editing?: string) {
  const taken = waterStopOccupant(project, input.port, editing);
  if (taken) throw Error(`That pipe end already belongs to ${taken}.`);
  const { run, selected, direction } = readWaterRunPort(project, input.port);
  if (run.materialId !== waterStop.pipe) throw Error("This valve needs a ½ in SharkBite PEX stub-out.");
  const exposed = (run[input.port.end] - input.face) * stopEndSign(input.port);
  const gap = exposed - waterStop.insertion;
  if (gap < -tolerance) throw Error("Leave at least 1 in of exposed pipe past the finished face for the Max socket.");
  const x = direction.negate();
  const up = new Vector3(0, 1, 0);
  const right = up.clone().cross(x);
  const y = input.outlet === "up" ? up : input.outlet === "down" ? up.negate()
    : input.outlet === "right" ? right : right.negate();
  const angle = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, x.clone().cross(y)));
  const rotation: V3 = [angle.x, angle.y, angle.z];
  const [length, height, width] = waterStop.size;
  const mouth = selected.clone().addScaledVector(x, -waterStop.insertion);
  const center = mouth.clone().addScaledVector(x, length / 2).addScaledVector(y, (height - width) / 2);
  const pose = { material: waterStop.id, size: [...waterStop.size] as V3, position: center.toArray(), rotation };
  const body = prepareCollisionBox(pose.size, pose.position, rotation);
  const access = prepareCollisionBox([input.access, height, width],
    center.clone().addScaledVector(x, (length + input.access) / 2).toArray(), rotation);
  const hose = prepareCollisionBox([length, input.hose, width],
    center.clone().addScaledVector(y, (height + input.hose) / 2).toArray(), rotation);
  const insertion = prepareCollisionBox([waterStop.insertion, height, width],
    center.clone().addScaledVector(x, (length + waterStop.insertion) / 2).toArray(), rotation);
  const envelopes = [
    { name: "Valve", shape: body }, { name: "Front access", shape: access },
    { name: "Outlet clearance", shape: hose }, { name: "Insertion travel", shape: insertion },
  ];
  if (project.workZone) {
    const { width: zoneWidth, height: zoneHeight, depth } = project.workZone;
    const limit = [[-zoneWidth / 2, zoneWidth / 2], [0, zoneHeight], [-depth / 2, depth / 2]];
    const outside = envelopes.find(({ shape: { bounds } }) =>
      limit.some(([lo, hi], i) => bounds.min[i] < lo - tolerance || bounds.max[i] > hi + tolerance));
    if (outside) throw Error(`${outside.name} crosses the work-zone boundary.`);
  }
  for (const piece of project.pieces) {
    if (piece.offcut || piece.id === run.pipeId || piece.id === pieceId) continue;
    const radius = Math.hypot(...piece.size) / 2;
    if (!envelopes.some(({ shape: { bounds } }) => piece.position.every((value, i) =>
      value - radius < bounds.max[i] && value + radius > bounds.min[i]))) continue;
    const box = prepareCollisionBox(piece.size, piece.position, piece.rotation);
    const nearby = envelopes.filter(({ shape: { bounds } }) => bounds.min.every((value, i) =>
      value < box.bounds.max[i] - tolerance && bounds.max[i] > box.bounds.min[i] + tolerance));
    if (!nearby.length) continue;
    const solid = prepareCollisionSolid(piece) ?? box;
    const blocked = nearby.find(({ shape }) => solidOverlap(shape, solid));
    if (blocked) throw Error(`${blocked.name} hits ${piece.name}. Check the outlet direction or the available room.`);
  }
  return { run, pose, mouth: mouth.toArray(), exposed, gap, envelopes };
}

export function reviewWaterStop(project: Project, record: WaterStop) {
  try {
    const layout = waterStopLayout(project, record, record.pieceId, record.id);
    const piece = project.pieces.find(({ id }) => id === record.pieceId);
    if (!piece || !waterRunFits(piece, layout.pose))
      return { problem: "The valve or stub-out moved. Reopen the shutoff planner and check the fit again." };
    return { layout };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : "This valve needs a new fit review." };
  }
}

export function removeWaterStop(project: Project, record: WaterStop): Project {
  return {
    ...project, waterStops: project.waterStops?.filter(({ id }) => id !== record.id),
    pieces: project.pieces.filter(({ id }) => id !== record.pieceId),
    joints: project.joints.filter(({ a, b }) => a !== record.pieceId && b !== record.pieceId),
    guideFingerprint: null,
  };
}

export function waterStopGuide(project: Project, stop: WaterStop) {
  const { layout, problem } = reviewWaterStop(project, stop);
  if (!layout) return [`${stop.name} · Review before installation. ${problem}`];
  return [
    `${stop.name} · SharkBite Max ${waterStop.model}, ½ in push inlet and ⅜ in compression outlet. Outlet points ${stop.outlet} viewed from the valve toward the finished face.`,
    `${layout.run.name} · Final pipe cut ${formatStockLength(layout.run.end - layout.run.start)}. Leave ${dim(layout.exposed)} exposed at the ${stop.port.end} and mark ${dim(waterStop.insertion)} for insertion. Valve mouth is ${dim(layout.gap)} from the finished face.`,
    `Check the accessible handle, hose bend and support in the field. Modeled clearances reserve ${dim(stop.access)} in front and ${dim(stop.hose)} at the outlet. Check installed connections for leaks within the 125 psi valve rating.`,
    waterStopDepthNote,
  ];
}
