import {
  faceContactPatch,
  retainedWoodFaces,
  type WoodFace,
} from "./connectionContacts";
import { material, type Piece, type Project, type V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import { stockAxes } from "./stockAxes";

const EPSILON = 1e-7;

type WoodSupportPart = {
  piece: Piece;
  geometryAvailable: boolean;
  onFloor: boolean;
  supports: { pieceId: string; area: number }[];
  /** First step on a shortest contact path to the floor. */
  next?: string;
};

export const woodSupportScope =
  "Checks follow positive-area wood contact down to the modeled floor. Review the actual substrate, hardware, stability and load capacity separately.";
export const fittedSupportBlockRole = "fitted-support-block";

function prepare(piece: Piece) {
  const faces = retainedWoodFaces(piece);
  const points = faces.flatMap((face) => face.points);
  const min = [0, 1, 2].map((axis) =>
    Math.min(...points.map((point) => point[axis])),
  ) as V3;
  const max = [0, 1, 2].map((axis) =>
    Math.max(...points.map((point) => point[axis])),
  ) as V3;
  return {
    piece,
    min,
    max,
    underside: faces.filter((face) => face.normal[1] < -EPSILON),
    facingUp: faces.filter((face) => face.normal[1] > EPSILON),
  };
}

function floorFace({ normal, points }: WoodFace) {
  return Math.hypot(normal[0], normal[1] + 1, normal[2]) <= EPSILON &&
    points.every((point) => Math.abs(point[1]) <= EPSILON);
}

function* bearingPatches(top: ReturnType<typeof prepare>, base: ReturnType<typeof prepare>) {
  for (const first of top.underside) {
    for (const second of base.facingUp) {
      const patch = faceContactPatch(first, second);
      if (patch) yield patch;
    }
  }
}

export function reviewWoodSupport(project: Project) {
  const byId = new Map<string, WoodSupportPart>();
  const children = new Map<string, string[]>();
  const floor: string[] = [];
  const wood = project.pieces.flatMap((piece) => {
    if (piece.offcut || !material(piece.material).wood) return [];
    const current: WoodSupportPart = {
      piece,
      geometryAvailable: false,
      onFloor: false,
      supports: [],
    };
    byId.set(piece.id, current);
    try {
      const ready = prepare(piece);
      if (ready.min.some((value, axis) => value >= ready.max[axis])) return [];
      current.geometryAvailable = true;
      current.onFloor = Math.abs(ready.min[1]) <= EPSILON && ready.underside.some(floorFace);
      if (current.onFloor) floor.push(piece.id);
      return [ready];
    } catch {
      // Numerically degenerate stock can exist in older saves.
      return [];
    }
  });
  for (const top of wood) {
    const current = byId.get(top.piece.id)!;
    for (const base of wood) {
      if (
        base === top ||
        top.min[1] > base.max[1] + EPSILON ||
        top.max[1] < base.min[1] - EPSILON
      )
        continue;
      if (
        [0, 2].some(
          (axis) =>
            Math.min(top.max[axis], base.max[axis]) -
              Math.max(top.min[axis], base.min[axis]) <=
            EPSILON,
        )
      )
        continue;
      let area = 0;
      for (const patch of bearingPatches(top, base)) area += patch.area;
      if (!area) continue;
      current.supports.push({ pieceId: base.piece.id, area });
      const above = children.get(base.piece.id) ?? [];
      above.push(top.piece.id);
      children.set(base.piece.id, above);
    }
  }

  const queue = [...floor];
  const grounded = new Set(floor);
  for (let index = 0; index < queue.length; index++) {
    const base = queue[index];
    for (const top of children.get(base) ?? []) {
      if (grounded.has(top)) continue;
      grounded.add(top);
      byId.get(top)!.next = base;
      queue.push(top);
    }
  }
  return byId;
}

export type WoodSupportReview = ReturnType<typeof reviewWoodSupport>;

export function woodSupportPath(review: WoodSupportReview, pieceId: string) {
  const path: Piece[] = [];
  let next = review.get(pieceId)?.next;
  while (next) {
    const row = review.get(next)!;
    path.push(row.piece);
    next = row.next;
  }
  return path;
}

/** Inspect every downward branch rather than only the shortest path. */
export function woodSupportBreaks(review: WoodSupportReview, pieceId: string) {
  const pending = new Set([pieceId]);
  const breaks: string[] = [];
  const ungrounded: string[] = [];
  for (const id of pending) {
    const row = review.get(id);
    if (row?.onFloor) continue;
    if (!row?.next) ungrounded.push(id);
    if (!row?.supports.length) breaks.push(id);
    for (const support of row?.supports ?? []) pending.add(support.pieceId);
  }
  // A closed loop can lack a floor route without having an endpoint.
  return breaks.length ? breaks : ungrounded.slice(0, 1);
}

export function woodSupportTrace(project: Project, review: WoodSupportReview, pieceId: string) {
  const faces = new Map<string, ReturnType<typeof prepare>>();
  const geometry = (piece: Piece) => {
    const ready = faces.get(piece.id) ?? prepare(piece);
    faces.set(piece.id, ready);
    return ready;
  };
  const patches: { outline: V3[]; kind: "grounded" | "open" | "floor" }[] = [];
  const pending = new Set([pieceId]);
  for (const id of pending) {
    const row = review.get(id);
    if (!row?.geometryAvailable) continue;
    const top = geometry(row.piece);
    if (row.onFloor) {
      for (const face of top.underside.filter(floorFace)) {
        patches.push({ outline: face.points, kind: "floor" });
      }
      continue;
    }
    for (const { pieceId: baseId } of row.supports) {
      const base = review.get(baseId)!;
      const kind = base.onFloor || base.next ? "grounded" : "open";
      for (const { outline } of bearingPatches(top, geometry(base.piece))) {
        patches.push({ outline, kind });
      }
      pending.add(baseId);
    }
  }
  const labels = new Map(project.partLabels?.map(({ partId, label }) => [partId, label]));
  const stops = woodSupportBreaks(review, pieceId).flatMap((id) => {
    const row = review.get(id);
    if (!row) return [];
    const [x, y, z] = row.piece.position;
    const position: V3 = [x, row.geometryAvailable ? geometry(row.piece).min[1] : y, z];
    return [{
      id,
      position,
      label: labels.get(id) ?? row.piece.name,
      reason: row.geometryAvailable ? "Check below" : "Check geometry",
    }];
  });
  return { patches, stops };
}

export type WoodSupportTrace = ReturnType<typeof woodSupportTrace>;

export function fittedSupportBlockEnds(support: WoodSupportReview) {
  return [...support.values()].flatMap(({ piece, geometryAvailable, onFloor, next, supports }) => {
    if (piece.designRole !== fittedSupportBlockRole) return [];
    const { width, thickness } = stockAxes(piece);
    const endArea = piece.size[width] * piece.size[thickness];
    const aboveIds = [...support.values()].flatMap((row) => row.supports.some(({ pieceId, area }) =>
      pieceId === piece.id && area >= endArea - EPSILON) ? [row.piece.id] : []);
    const baseId = next && supports.some(({ pieceId, area }) =>
      pieceId === next && area >= endArea - EPSILON) ? next : undefined;
    const fit = geometryAvailable && !piece.cutPlanes.length && !piece.roundOpenings?.length &&
      !piece.rectangularOpenings?.length && aboveIds.length > 0 && (onFloor || !!baseId);
    return [{ block: piece, aboveIds, baseId, onFloor, fit }];
  });
}

export function woodSupportGuideLines(
  project: Project,
  support: WoodSupportReview,
) {
  if (!support.size) return [];
  const labels = new Map(
    ensurePartLabels(project).partLabels.map((row) => [row.partId, row.label]),
  );
  const open = [...support.values()].filter((row) => !row.onFloor && !row.next);
  const placements = fittedSupportBlockEnds(support).map(({ block, aboveIds, baseId, onFloor, fit }) => {
    const title = `${labels.get(block.id)} · ${block.name}`;
    if (!fit) return `${title} · Review the fitted block's current bearing at both ends.`;
    const [x, , z] = block.position;
    const supportBelow = onFloor ? "the modeled floor" : labels.get(baseId!);
    return `${title} · Center X ${formatPreciseInches(x)}, Z ${formatPreciseInches(z)} · from ${supportBelow} to ${aboveIds.map((id) => labels.get(id)).join(", ")}.`;
  });
  return [
    `${support.size - open.length} of ${support.size} modeled wood parts have a face-contact path to the floor.`,
    ...placements,
    ...open.map(
      ({ piece, geometryAvailable, supports }) =>
        `${labels.get(piece.id)} · ${piece.name} · ${
          !geometryAvailable
            ? "Retained faces could not be reviewed. Check the part dimensions and cut profile."
            : supports.length
              ? `Touches ${supports.map(({ pieceId }) => labels.get(pieceId)).join(", ")} below. Check where that contact path stops.`
              : "No bearing face reaches another wood part or the floor. Check its position or review its hardware and support detail."
        }`,
    ),
  ];
}
