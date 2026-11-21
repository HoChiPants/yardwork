import { Euler, Matrix4, Vector3 } from "three";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { prepareCollisionBox, prepareCollisionSolid, solidGap, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { reviewWaterRun, waterRunFits } from "./wallWater";
import {
  isWaterFitting, maxFittingServiceGap, nominalSocketReach, waterFittingIds,
  waterFittingKindLabel, waterFittingProduct, waterFittingProducts, type WaterFittingId,
} from "./waterFittingReference";
import { waterFittingPorts, type WaterFitting, type WaterFittingInput, type WaterRunEnd } from "./waterFittingSchema";

const tolerance = 1e-6;
const up = new Vector3(0, 1, 0);
export const waterFittingStageKey = "water-fitting";
export const waterPortKey = ({ runId, end }: WaterRunEnd) => `${runId}/${end}`;
export const fittingLabel = (id: WaterFittingId) =>
  `SharkBite Max ${waterFittingProducts[id].model} ${waterFittingKindLabel(id)}`;

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

type Port = ReturnType<typeof readPort>;

function checkPortsAvailable(project: Project, ports: WaterRunEnd[], editing?: string) {
  if (new Set(ports.map(({ runId }) => runId)).size !== ports.length)
    throw Error("Choose a different straight run for each socket.");
  const keys = new Set(ports.map(waterPortKey));
  if (project.waterFittings?.some((row) => row.id !== editing && waterFittingPorts(row).some((port) => keys.has(waterPortKey(port)))))
    throw Error("A selected pipe end already belongs to another fitting. Choose a free endpoint.");
}

function centerlineOffset(first: Port, second: Port) {
  const between = second.selected.clone().sub(first.selected);
  if (Math.abs(between.y) > tolerance)
    throw Error("The pipe centerlines are at different heights. Align them before connecting.");
  return between;
}

function intersection(first: Port, second: Port, between: Vector3) {
  const center = first.selected.clone().addScaledVector(first.direction, between.dot(first.direction));
  if (center.clone().sub(second.selected).cross(second.direction).length() > tolerance)
    throw Error("The two centerlines do not meet in the same plane.");
  return center;
}

function teeChoice(main: Port, branch: Port) {
  const between = centerlineOffset(main, branch);
  if (Math.abs(main.direction.dot(branch.direction)) > tolerance)
    throw Error("A tee needs a perpendicular branch at the main centerline.");
  const center = intersection(main, branch, between);
  if (branch.opposite.clone().sub(center).dot(branch.direction) <= tolerance)
    throw Error("Choose the branch end facing the main.");
  const materialId = waterFittingIds.find((id) => {
    const product = waterFittingProduct(id);
    return product.kind === "tee" && product.pipe === main.run.materialId && product.branch?.pipe === branch.run.materialId;
  });
  if (!materialId) throw Error("Choose a same-size branch or a ½ in branch on a ¾ in main.");
  const product = waterFittingProduct(materialId);
  return { center, materialId, product, nominalReach: nominalSocketReach(materialId),
    nominalBranchReach: product.branch!.body - product.diameter / 2 };
}

export function splitWaterMainChoice(project: Project, mainId: string, branchEnd: WaterRunEnd) {
  if (mainId === branchEnd.runId) throw Error("Choose a separate branch run.");
  checkPortsAvailable(project, [branchEnd]);
  const main = readPort(project, { runId: mainId, end: "end" });
  const branch = readPort(project, branchEnd);
  const choice = teeChoice(main, branch);
  const centerDistance = main.run.end + main.selected.clone().sub(choice.center).dot(main.direction);
  if (centerDistance <= main.run.start + tolerance || centerDistance >= main.run.end - tolerance)
    throw Error("The branch centerline must cross between the two ends of the main.");
  return { ...choice, main: main.run, centerDistance };
}

/** Select the fitting from retained pipe centerlines, without moving geometry. */
export function waterFittingChoice(project: Project, endpoints: WaterRunEnd[], editing?: string) {
  checkPortsAvailable(project, endpoints, editing);
  const ports = endpoints.map((port) => readPort(project, port));
  const [first, second, branch] = ports;
  const dot = first.direction.dot(second.direction);
  const between = centerlineOffset(first, second);
  const opposed = Math.abs(dot + 1) < tolerance;
  const coaxial = first.direction.clone().cross(between).length() <= tolerance;
  if (branch) {
    if (first.run.materialId !== second.run.materialId)
      throw Error("The two inline tee sockets need the same pipe size.");
    if (!opposed || !coaxial || between.dot(first.direction) > tolerance)
      throw Error("Choose facing pipe ends along one main centerline for the tee.");
    return { ...teeChoice(first, branch), ports };
  }
  if (first.run.materialId !== second.run.materialId) throw Error("The selected Max fitting needs two pipes of the same size.");
  let center: Vector3;
  let kind: "coupling" | "elbow";
  if (opposed) {
    if (!coaxial)
      throw Error("A coupling needs both pipes on the same centerline.");
    if (between.dot(first.direction) > tolerance) throw Error("Choose pipe ends that face one another.");
    center = first.selected.clone().lerp(second.selected, 0.5);
    kind = "coupling";
  } else if (Math.abs(dot) < tolerance) {
    center = intersection(first, second, between);
    kind = "elbow";
  } else {
    throw Error("Choose facing collinear ends for a coupling or perpendicular centerlines for a 90° elbow.");
  }
  const materialId = waterFittingIds.find((id) =>
    waterFittingProducts[id].kind === kind && waterFittingProducts[id].pipe === first.run.materialId)!;
  return {
    ports, center, materialId, product: waterFittingProduct(materialId),
    nominalReach: nominalSocketReach(materialId), nominalBranchReach: undefined,
  };
}

export function waterFittingLayout(project: Project, input: WaterFittingInput, editing?: string) {
  const choice = waterFittingChoice(project, waterFittingPorts(input), editing);
  const { product, materialId, center, ports } = choice;
  if (product.kind === "coupling" && Math.abs(input.reach[0] - input.reach[1]) > tolerance)
    throw Error("For this straight coupling enter one measured face-to-face length.");
  const positions = ports.map(({ run, port, direction, selected, opposite }, index) => {
    const reach = index === 2 ? input.branch!.reach : input.reach[index];
    const insertion = index === 2 ? product.branch!.insertion : product.insertion;
    const seatedReach = waterSocketSeat(reach, insertion, index === 2 ? "the branch" : `pipe ${index + 1}`);
    if (opposite.clone().sub(center).dot(direction) <= reach + tolerance)
      throw Error(`${run.name} needs pipe extending beyond the socket face. Pick the other end or move the connection.`);
    const face = center.clone().addScaledVector(direction, reach);
    const cutEnd = center.clone().addScaledVector(direction, seatedReach);
    const change = cutEnd.clone().sub(selected).dot(direction) * (port.end === "start" ? 1 : -1);
    const distance = run[port.end] + change;
    return { run, port, distance, insertion, face: face.toArray(), cutEnd: cutEnd.toArray(),
      length: port.end === "start" ? run.end - distance : distance - run.start };
  });
  const x = ports[0].direction;
  const y = product.kind === "tee" ? ports[2].direction : product.kind === "elbow" ? ports[1].direction : up;
  const rotation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, x.clone().cross(y)));
  const diameter = product.diameter, radius = diameter / 2;
  const size: V3 = product.kind === "tee" ? [input.reach[0] + input.reach[1], input.branch!.reach + radius, diameter]
    : product.kind === "elbow" ? [input.reach[0] + radius, input.reach[1] + radius, diameter]
      : [input.reach[0] + input.reach[1], diameter, diameter];
  const position = center.clone();
  if (product.kind === "elbow")
    position.addScaledVector(x, (input.reach[0] - radius) / 2).addScaledVector(y, (input.reach[1] - radius) / 2);
  if (product.kind === "tee") {
    // The inline faces of the exact tees are symmetric around the branch axis.
    if (Math.abs(input.reach[0] - input.reach[1]) > tolerance)
      throw Error("Enter the measured inline face-to-face length of this tee.");
    position.addScaledVector(y, (input.branch!.reach - radius) / 2);
  }
  const pose: FittingPose = { material: materialId, size, position: position.toArray(), rotation: [rotation.x, rotation.y, rotation.z] };
  return { ...choice, positions, pose };
}

export function waterSocketSeat(reach: number, insertion: number, socket: string) {
  if (reach <= insertion + tolerance)
    throw Error(`The center-to-face measurement at ${socket} must allow ${dim(insertion)} of insertion.`);
  return reach - insertion;
}

/** Rectangular envelopes follow each leg and leave the empty corners clear. */
function fittingVolumes(pose: FittingPose) {
  if (!isWaterFitting(pose.material) || waterFittingProducts[pose.material].kind === "coupling")
    return [prepareCollisionBox(pose.size, pose.position, pose.rotation)];
  const [x, y, diameter] = pose.size;
  const leg = (size: V3, offset: V3) => {
    const position = rotate(offset, pose.rotation).map((value, i) => pose.position[i] + value) as V3;
    return prepareCollisionBox(size, position, pose.rotation);
  };
  if (waterFittingProducts[pose.material].kind === "tee")
    return [leg([x, diameter, diameter], [0, (diameter - y) / 2, 0]),
      leg([diameter, y, diameter], [0, 0, 0])];
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
    `${fittingLabel(layout.materialId)}.`,
    ...layout.positions.map(({ run, length, port, insertion }) => `${run.name} · Cut pipe to ${formatStockLength(length)}. Mark ${dim(insertion)} of insertion at the ${port.end}.`),
    ...(fitting.branch ? [`Inline pipe ends · ${dim(fitting.reach[0] + fitting.reach[1] - 2 * layout.product.insertion)} apart when both are seated.`] : []),
    "Confirm the measured socket faces, enough travel to assemble the pipes, and support without side load. Cut square and seat to the depth marks. Verify local test requirements and inspect the joint before closing the wall.",
  ];
}
