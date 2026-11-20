import {
  faceContactPatch,
  retainedWoodFaces,
  type WoodFace,
} from "./connectionContacts";
import { material, type Piece, type Project, type V3 } from "./model";
import { ensurePartLabels } from "./partLabels";

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

function floorContact(underside: WoodFace[], floorHeight: number) {
  if (Math.abs(floorHeight) > EPSILON) return false;
  return underside.some(
    ({ normal, points }) =>
      Math.hypot(normal[0], normal[1] + 1, normal[2]) <= EPSILON &&
      points.every((point) => Math.abs(point[1]) <= EPSILON),
  );
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
      current.onFloor = floorContact(ready.underside, ready.min[1]);
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
      for (const a of top.underside)
        for (const b of base.facingUp)
          area += faceContactPatch(a, b)?.area ?? 0;
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

export function woodSupportGuideLines(
  project: Project,
  support: WoodSupportReview,
) {
  if (!support.size) return [];
  const labels = new Map(
    ensurePartLabels(project).partLabels.map((row) => [row.partId, row.label]),
  );
  const open = [...support.values()].filter((row) => !row.onFloor && !row.next);
  return [
    `${support.size - open.length} of ${support.size} modeled wood parts have a face-contact path to the floor.`,
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
