import { cutKerf, inspectCutStock } from "./cutStock";
import { retainedWoodFaces } from "./connectionContacts";
import { cutPiece } from "./engine";
import {
  reviewGreenhouseRafterBearing,
  type EaveFitSurface,
} from "./greenhouseRafterBearing";
import {
  material,
  part,
  projectSchema,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";

const epsilon = 1e-6;
const dot = (a: V3, b: V3) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);

function zInterval(polygon: V3[], x: number) {
  const values: number[] = [];
  for (const [index, a] of polygon.entries()) {
    const b = polygon[(index + 1) % polygon.length];
    if (Math.abs(a[0] - x) <= epsilon) values.push(a[2]);
    if (x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]))
      values.push(a[2] + ((x - a[0]) * (b[2] - a[2])) / (b[0] - a[0]));
  }
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

function blockFootprint(
  surface: EaveFitSurface,
  width: number,
  height: number,
) {
  const points = surface.footprint;
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  if (maxX - minX < width - epsilon) return [];
  const baseY = points[0][1];
  const {
    normal,
    points: [origin],
  } = surface.underside;
  return [...new Set([(minX + maxX - width) / 2, minX, maxX - width])].flatMap(
    (left) => {
      const right = left + width;
      const front = zInterval(points, left),
        back = zInterval(points, right);
      if (!front || !back) return [];
      const minZ = Math.max(front[0], back[0]),
        maxZ = Math.min(front[1], back[1]);
      const length = maxZ - minZ;
      if (length <= epsilon) return [];
      const heights = [left, right].flatMap((x) =>
        [minZ, maxZ].map(
          (z) =>
            origin[1] -
            baseY -
            (normal[0] * (x - origin[0]) + normal[2] * (z - origin[2])) /
              normal[1],
        ),
      );
      if (
        Math.min(...heights) <= epsilon ||
        Math.max(...heights) > height + epsilon
      )
        return [];
      return [
        {
          center: [
            (left + right) / 2,
            baseY + height / 2,
            (minZ + maxZ) / 2,
          ] as V3,
          size: [width, height, length] as V3,
          heights: [Math.min(...heights), Math.max(...heights)] as [
            number,
            number,
          ],
        },
      ];
    },
  );
}

export type EaveBlockPreview = {
  project: Project;
  block: Piece;
  rafterId: string;
  plateId: string;
  reusedId: string | null;
  remnantLength: number;
  heights: [number, number];
  outlines: V3[][];
  point: V3;
};

export function previewEaveBlock(
  project: Project,
  rafterId: string,
  materialId: MaterialId,
  reuse: boolean,
): EaveBlockPreview {
  const stock = material(materialId);
  if (
    !stock.wood ||
    !stock.cuttable ||
    stock.stockKind !== "linear" ||
    stock.shape
  )
    throw Error("Choose rectangular wood lumber for this block.");
  const [thin, wide, stockLength] = [...(stock.stockSize ?? stock.size)].sort(
    (a, b) => a - b,
  );
  const roof = reviewGreenhouseRafterBearing(project, rafterId).find(
    ({ rows }) => rows.some(({ id }) => id === rafterId),
  );
  const surfaces = roof?.rows.find(({ id }) => id === rafterId)?.eave
    .fitSurfaces;
  const entry = project.ideaBindings
    .flatMap(({ entries }) => entries)
    .find(({ id }) => id === roof?.entryId);
  const rafter = project.pieces.find(({ id }) => id === rafterId);
  const section = project.sections.find(
    ({ id, pieceIds }) =>
      pieceIds.includes(rafterId) &&
      entry?.sections.some(
        ({ sectionId, role }) => sectionId === id && role === "roof-framing",
      ),
  );
  if (!entry || !rafter || !section || !surfaces?.length)
    throw Error(
      "Choose a rafter with a clear gap or edge contact over a wall plate.",
    );
  const { rotation, origin } = entry.pose;
  const toWorld = (point: V3) =>
    rotate(point, rotation).map((value, i) => value + origin[i]) as V3;
  const obstacles = project.pieces
    .filter((piece) => !piece.offcut)
    .map(
      (piece) =>
        prepareCollisionSolid(piece) ??
        prepareCollisionSolid({ ...piece, material: "stud", cutPlanes: [] })!,
    );
  const lineage = reuse ? inspectCutStock(project).valid : new Set<string>();
  const kerf = cutKerf(materialId);
  const fitsLength = (available: number, needed: number) =>
    Math.abs(available - needed) <= epsilon ||
    available > needed + kerf + epsilon;
  const possibilities = surfaces.flatMap((surface) =>
    [
      [thin, wide],
      [wide, thin],
    ].flatMap(([width, height]) =>
      blockFootprint(surface, width, height).map((fit) => ({ surface, fit })),
    ),
  );
  let obstruction = false;
  for (const { surface, fit } of possibilities) {
    const [width, height, length] = fit.size;
    if (!fitsLength(stockLength, length)) continue;
    const offcut = project.pieces.find(
      (piece) =>
        piece.offcut &&
        piece.material === materialId &&
        piece.stockLengthAxis === 2 &&
        !piece.cutPlanes.length &&
        piece.cutStock &&
        lineage.has(piece.cutStock.id) &&
        Math.abs(piece.size[0] - width) <= epsilon &&
        Math.abs(piece.size[1] - height) <= epsilon &&
        fitsLength(piece.size[2], length),
    );
    const blankLength = offcut?.size[2] ?? stockLength;
    const cutLength =
      Math.abs(blankLength - length) <= epsilon ? blankLength : length;
    const fullCenter = [...fit.center] as V3;
    fullCenter[2] += (blankLength - cutLength) / 2;
    const name = "Beveled eave block";
    const blank = {
      ...part(
        name,
        materialId,
        [width, height, blankLength],
        toWorld(fullCenter),
        rafter.stepId,
        section.name,
        rotation,
      ),
      ...(offcut ? { id: offcut.id, cutStock: offcut.cutStock } : {}),
      stockLengthAxis: 2 as const,
    };
    const working = {
      ...project,
      pieces: [...project.pieces.filter(({ id }) => id !== offcut?.id), blank],
    };
    const trimmed =
      cutLength < blankLength
        ? cutPiece(working, blank.id, cutLength, 2)
        : working;
    const block = trimmed.pieces.find(({ id }) => id === blank.id)!;
    block.designRole = "greenhouse-eave-block";
    const { normal } = surface.underside;
    const cap = normal.map((value) => (value === 0 ? 0 : -value)) as V3;
    block.cutPlanes = [
      {
        normal: cap,
        constant: dot(
          cap,
          surface.underside.points[0].map(
            (value, i) => value - fit.center[i],
          ) as V3,
        ),
      },
    ];
    const solid = prepareCollisionSolid(block)!;
    const zone = project.workZone;
    if (
      obstacles.some((other) => solidOverlap(solid, other, epsilon)) ||
      (zone &&
        solid.vertices.some(
          ([x, y, z]) =>
            Math.abs(x) > zone.width / 2 + epsilon ||
            Math.abs(z) > zone.depth / 2 + epsilon ||
            y < -epsilon ||
            y > zone.height + epsilon,
        ))
    ) {
      obstruction = true;
      continue;
    }
    const next = projectSchema.parse({
      ...trimmed,
      sections: trimmed.sections.map((item) =>
        item.id === section.id
          ? { ...item, pieceIds: [...item.pieceIds, block.id] }
          : item,
      ),
      guideFingerprint: null,
    });
    const contact = reviewGreenhouseRafterBearing(next)
      .find(({ entryId }) => entryId === entry.id)
      ?.rows.find(({ id }) => id === rafterId)
      ?.eave.patches.some(
        ({ supportIds }) =>
          supportIds.includes(block.id) && supportIds.includes(surface.plateId),
      );
    if (!contact) continue;
    const outlines = retainedWoodFaces(block).map(({ points }) => points);
    const point = solid.vertices.reduce(
      (mean, vertex) =>
        mean.map((value, i) => value + vertex[i] / solid.vertices.length) as V3,
      [0, 0, 0] as V3,
    );
    return {
      project: next,
      block,
      rafterId,
      plateId: surface.plateId,
      reusedId: offcut?.id ?? null,
      remnantLength:
        cutLength < blankLength ? blankLength - cutLength - kerf : 0,
      heights: fit.heights,
      outlines,
      point,
    };
  }
  throw Error(
    obstruction
      ? "Nearby parts or the work zone obstruct the modeled block."
      : "This stock cannot fit a positive-thickness block between the retained faces. Choose another board or review the joint.",
  );
}

type EaveBlockFit = Omit<EaveBlockPreview, "project">;

export type EaveRoofPreview = {
  project: Project;
  fits: EaveBlockFit[];
  skipped: { rafterId: string; reason: string }[];
  freshBoards: number;
  outlines: V3[][];
  point: V3;
};

export type EaveFitPreview = EaveBlockPreview | EaveRoofPreview;

/** Work through just one linked roof so later fits see earlier blocks and their real offcut. */
export function previewEaveRoof(
  project: Project,
  rafterId: string,
  materialId: MaterialId,
  reuse: boolean,
): EaveRoofPreview {
  const roof = reviewGreenhouseRafterBearing(project).find(({ rows }) =>
    rows.some(({ id }) => id === rafterId),
  );
  if (!roof) throw Error("Choose a rafter from a current greenhouse roof.");
  const targets = roof.rows.filter(
    ({ eave }) => eave.state === "gap" || eave.state === "edge",
  );
  if (!targets.length)
    throw Error("This roof has no modeled plate gaps or edge contacts to fit.");
  let next = project;
  const fits: EaveBlockFit[] = [];
  const skipped: EaveRoofPreview["skipped"] = [];
  for (const { id } of targets) {
    try {
      const { project: updated, ...fit } = previewEaveBlock(
        next,
        id,
        materialId,
        reuse,
      );
      fits.push(fit);
      next = updated;
    } catch (problem) {
      skipped.push({
        rafterId: id,
        reason:
          problem instanceof Error
            ? problem.message
            : "Review the retained rafter and wall plate.",
      });
    }
  }
  const point = fits.length
    ? fits.reduce(
        (center, fit) =>
          center.map((value, i) => value + fit.point[i] / fits.length) as V3,
        [0, 0, 0] as V3,
      )
    : targets[0].eave.point;
  return {
    project: next,
    fits,
    skipped,
    freshBoards: fits.filter(({ reusedId }) => !reusedId).length,
    outlines: fits.flatMap(({ outlines }) => outlines),
    point,
  };
}
