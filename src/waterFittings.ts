import { Euler, Matrix4, Vector3 } from "three";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { prepareCollisionBox, prepareCollisionSolid, solidGap, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { reviewWaterRun, waterRunFits } from "./wallWater";
import {
  isWaterFitting, maxFittingServiceGap, nominalSocketReach, waterFittingIds, waterFittingProducts, type WaterFittingId,
} from "./waterFittingReference";
import type { WaterFitting, WaterFittingInput, WaterRunEnd } from "./waterFittingSchema";

const tolerance = 1e-6;
const up = new Vector3(0, 1, 0);
export const waterFittingStageKey = "water-fitting";
export const waterPortKey = ({ runId, end }: WaterRunEnd) => `${runId}/${end}`;
export const fittingLabel = (product: (typeof waterFittingProducts)[WaterFittingId]) =>
  `SharkBite Max ${product.model} ${product.kind === "elbow" ? "90° elbow" : "straight coupling"}`;

type FittingPose = Pick<Piece, "material" | "position" | "rotation" | "size">;

function readPort(project: Project, port: WaterRunEnd) {
  const run = project.waterRuns?.find(({ id }) => id === port.runId);
  if (!run) throw Error("One of the straight pipe runs is missing.");
  const checked = reviewWaterRun(project, run);
  if (!checked.measured) throw Error(`${run.name} needs a valid straight run first. ${checked.problem}`);
  const { pipe } = checked.measured;
  const orientation = new Vector3(...rotate([0, 1, 0], pipe.rotation));
  const direction = orientation.multiplyScalar(port.end === "start" ? 1 : -1);
  const opposite = new Vector3(...pipe.position).addScaledVector(direction, pipe.size[1] / 2);
  const selected = new Vector3(...pipe.position).addScaledVector(direction, -pipe.size[1] / 2);
  return { run, port, direction, selected, opposite };
}

/** Choose the straight coupling or 90° elbow from the actual centerlines. */
export function waterFittingChoice(project: Project, a: WaterRunEnd, b: WaterRunEnd, editing?: string) {
  if (a.runId === b.runId) throw Error("Choose two different straight runs.");
  const keys = new Set([waterPortKey(a), waterPortKey(b)]);
  if (project.waterFittings?.some((row) => row.id !== editing && [row.a, row.b].some((port) => keys.has(waterPortKey(port)))))
    throw Error("A selected pipe end already belongs to another fitting. Choose a free endpoint.");
  const first = readPort(project, a), second = readPort(project, b);
  if (first.run.materialId !== second.run.materialId) throw Error("The selected Max fitting needs two pipes of the same size.");
  if (Math.abs(first.selected.y - second.selected.y) > tolerance)
    throw Error("The pipe centerlines are at different heights. Align them before connecting.");
  const dot = first.direction.dot(second.direction);
  const between = second.selected.clone().sub(first.selected);
  let center: Vector3;
  let kind: "coupling" | "elbow";
  if (Math.abs(dot + 1) < tolerance) {
    if (first.direction.clone().cross(between).length() > tolerance)
      throw Error("A coupling needs both pipes on the same centerline.");
    if (between.dot(first.direction) > tolerance) throw Error("Choose pipe ends that face one another.");
    center = first.selected.clone().lerp(second.selected, 0.5);
    kind = "coupling";
  } else if (Math.abs(dot) < tolerance) {
    center = first.selected.clone().addScaledVector(first.direction, between.dot(first.direction));
    if (center.clone().sub(second.selected).cross(second.direction).length() > tolerance)
      throw Error("The two centerlines do not meet in the same plane.");
    kind = "elbow";
  } else {
    throw Error("Choose facing collinear ends for a coupling or perpendicular centerlines for a 90° elbow.");
  }
  const materialId = waterFittingIds.find((id) =>
    waterFittingProducts[id].kind === kind && waterFittingProducts[id].pipe === first.run.materialId)!;
  return {
    ports: [first, second] as const, center, materialId, product: waterFittingProducts[materialId],
    nominalReach: nominalSocketReach(materialId),
  };
}

export function waterFittingLayout(project: Project, input: WaterFittingInput, editing?: string) {
  const choice = waterFittingChoice(project, input.a, input.b, editing);
  const { product, materialId, center, ports } = choice;
  if (product.kind === "coupling" && Math.abs(input.reach[0] - input.reach[1]) > tolerance)
    throw Error("For this straight coupling enter one measured face-to-face length.");
  const positions = ports.map(({ run, port, direction, selected, opposite }, index) => {
    const reach = input.reach[index];
    if (reach <= product.insertion + tolerance)
      throw Error(`The center-to-face measurement at pipe ${index + 1} must allow ${dim(product.insertion)} of insertion.`);
    if (opposite.clone().sub(center).dot(direction) <= reach + tolerance)
      throw Error(`${run.name} needs pipe extending beyond the socket face. Pick the other end or move the connection.`);
    const face = center.clone().addScaledVector(direction, reach);
    const cutEnd = center.clone().addScaledVector(direction, reach - product.insertion);
    const change = cutEnd.clone().sub(selected).dot(direction) * (port.end === "start" ? 1 : -1);
    const distance = run[port.end] + change;
    return { run, port, distance, face: face.toArray(), cutEnd: cutEnd.toArray(),
      length: port.end === "start" ? run.end - distance : distance - run.start };
  });
  const x = ports[0].direction, y = product.kind === "elbow" ? ports[1].direction : up;
  const rotation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, x.clone().cross(y)));
  const diameter = product.diameter, radius = diameter / 2;
  const size: V3 = product.kind === "elbow" ? [input.reach[0] + radius, input.reach[1] + radius, diameter]
    : [input.reach[0] + input.reach[1], diameter, diameter];
  const position = center.clone();
  if (product.kind === "elbow")
    position.addScaledVector(x, (input.reach[0] - radius) / 2).addScaledVector(y, (input.reach[1] - radius) / 2);
  const pose: FittingPose = { material: materialId, size, position: position.toArray(), rotation: [rotation.x, rotation.y, rotation.z] };
  return { ...choice, positions, pose };
}

/** Rectangular envelopes follow each leg and leave the elbow's empty corner clear. */
function fittingVolumes(pose: FittingPose) {
  if (!isWaterFitting(pose.material) || waterFittingProducts[pose.material].kind === "coupling")
    return [prepareCollisionBox(pose.size, pose.position, pose.rotation)];
  const [x, y, diameter] = pose.size;
  const leg = (size: V3, offset: V3) => {
    const position = rotate(offset, pose.rotation).map((value, i) => pose.position[i] + value) as V3;
    return prepareCollisionBox(size, position, pose.rotation);
  };
  return [leg([x, diameter, diameter], [0, (diameter - y) / 2, 0]),
    leg([diameter, y, diameter], [(diameter - x) / 2, 0, 0])];
}

export function verifyFittingClearance(project: Project, layout: ReturnType<typeof waterFittingLayout>, pieceId?: string) {
  const ignored = new Set([pieceId, ...layout.ports.map(({ run }) => run.pipeId)]);
  const volumes = fittingVolumes(layout.pose);
  if (project.workZone) {
    const { width, height, depth } = project.workZone;
    const ranges = [[-width / 2, width / 2], [0, height], [-depth / 2, depth / 2]];
    if (volumes.some(({ bounds }) => ranges.some(([lo, hi], i) => bounds.min[i] < lo - tolerance || bounds.max[i] > hi + tolerance)))
      throw Error("The fitting envelope crosses the work-zone boundary.");
  }
  for (const piece of project.pieces) {
    if (piece.offcut || ignored.has(piece.id)) continue;
    const otherFitting = isWaterFitting(piece.material);
    const gap = otherFitting ? maxFittingServiceGap : 0;
    const radius = Math.hypot(...piece.size) / 2 + gap;
    const nearby = volumes.filter(({ bounds }) => piece.position.every((value, i) =>
      value - radius <= bounds.max[i] && value + radius >= bounds.min[i]));
    if (!nearby.length) continue;
    const envelope = prepareCollisionBox(piece.size, piece.position, piece.rotation);
    const candidates = nearby.filter(({ bounds }) => bounds.min.every((value, i) =>
      value <= envelope.bounds.max[i] + gap && bounds.max[i] >= envelope.bounds.min[i] - gap));
    if (!candidates.length) continue;
    const solids = otherFitting ? fittingVolumes(piece) : [prepareCollisionSolid(piece) ?? envelope];
    if (candidates.some((first) => solids.some((second) => solidOverlap(first, second))))
      throw Error(`The fitting envelope hits ${piece.name}. Move the connection to an open space.`);
    if (otherFitting && candidates.some((first) => solids.some((second) => solidGap(first, second) < gap - tolerance)))
      throw Error(`Leave at least 1 in between this fitting and ${piece.name} for service access.`);
  }
}

export function reviewWaterFitting(project: Project, record: WaterFitting) {
  try {
    const layout = waterFittingLayout(project, record, record.id);
    const piece = project.pieces.find(({ id }) => id === record.pieceId);
    if (record.materialId !== layout.materialId || !piece || !waterRunFits(piece, layout.pose) ||
        layout.positions.some(({ run, port, distance }) => Math.abs(run[port.end] - distance) > tolerance))
      return { problem: "The fitting or pipe ends moved. Reopen this connection and review its cuts and clearances." };
    verifyFittingClearance(project, layout, record.pieceId);
    return { layout };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : "This fitting needs review." };
  }
}

export function removeWaterFitting(project: Project, fitting: WaterFitting): Project {
  return {
    ...project,
    waterFittings: project.waterFittings?.filter(({ id }) => id !== fitting.id),
    pieces: project.pieces.filter(({ id }) => id !== fitting.pieceId),
    joints: project.joints.filter(({ a, b }) => a !== fitting.pieceId && b !== fitting.pieceId),
    guideFingerprint: null,
  };
}

export function waterFittingGuide(project: Project, fitting: WaterFitting) {
  const { layout, problem } = reviewWaterFitting(project, fitting);
  if (!layout) return [`${waterFittingProducts[fitting.materialId].model} · Review connection before joining. ${problem}`];
  return [
    `SharkBite Max ${layout.product.model} · ${layout.product.kind === "elbow" ? "90° elbow" : "Straight coupling"}.`,
    ...layout.positions.map(({ run, length, port }) => `${run.name} · Cut pipe to ${formatStockLength(length)}. Mark ${dim(layout.product.insertion)} of insertion at the ${port.end}.`),
    "Confirm the measured socket faces, enough travel to assemble the pipes, and support without side load. Cut square and seat to the depth marks. Verify local test requirements and inspect the joint before closing the wall.",
  ];
}
