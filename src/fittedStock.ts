import { Euler, Matrix4, Vector3 } from "three";
import {
  catalog,
  material,
  projectSchema,
  uid,
  type Material,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { clipBox } from "./cutProfiles";
import { plannedCutKerf } from "./cutStock";
import { rotate } from "./spatial";
import { guidePlacementTargets } from "./guidePlacement";
import type { GuidePlacement } from "./guidePlacementSchema";
import {
  prepareCollisionSolid,
  solidOverlap,
  type CollisionSolid,
} from "./solidCollision";
import { partLabel } from "./partLabels";

export type FittedFaceRef = {
  pieceId: string;
  pointLocal: V3;
  normalLocal: V3;
};
export type FittedStockFace = {
  ref: FittedFaceRef;
  label: string;
  verticesLocal: V3[];
  verticesWorld: V3[];
  centerLocal: V3;
  centerWorld: V3;
  normalLocal: V3;
  normalWorld: V3;
};
export type FittedStockSpec = {
  first: FittedFaceRef;
  second: FittedFaceRef;
  datumLocal: V3;
  material: MaterialId;
  rollDegrees: number;
  clearanceA: number;
  clearanceB: number;
  sectionId: string | null;
  stepId: string;
  name: string;
  guidePlacement?: GuidePlacement;
};
export type FittedStockPreview = {
  project: Project;
  spec: FittedStockSpec;
  fingerprint: string;
  blockId: string;
  offcutIds: string[];
  sourceId: string | null;
  span: number;
  cutLength: number;
  sourceLength: number;
  stockLengthAxis: 0 | 1 | 2;
  kerfLoss: number;
  firstFace: FittedStockFace;
  secondFace: FittedStockFace;
  /** Cross-section projections onto the chosen mating planes, before end clearances. */
  endFootprintsWorld: { first: V3[]; second: V3[] };
  notes: string[];
};

// Numerical roundoff only. Collision uses zero fit tolerance, not the 0.01in advisory default.
const EPS = 1e-7;
type Axis = 0 | 1 | 2;
const add = (a: V3, b: V3): V3 => a.map((n, i) => n + b[i]) as V3;
const sub = (a: V3, b: V3): V3 => a.map((n, i) => n - b[i]) as V3;
const scale = (a: V3, n: number): V3 => a.map((v) => v * n) as V3;
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vector = (v: unknown): v is V3 =>
  Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const unit = (v: V3): V3 => scale(v, 1 / Math.hypot(...v));
const toWorld = (p: V3, member: Piece): V3 =>
  add(rotate(p, member.rotation), member.position);
const memberName = (project: Project, id: string) => {
  const piece = project.pieces.find((piece) => piece.id === id);
  return `${partLabel(project, id)}${piece ? ` · ${piece.name}` : ""}`;
};
const canonical = (v: unknown) =>
  JSON.stringify(v, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
function hash(value: unknown) {
  let n = 14695981039346656037n;
  for (const c of canonical(value)) {
    n ^= BigInt(c.charCodeAt(0));
    n = BigInt.asUintN(64, n * 1099511628211n);
  }
  return `fitted-stock-v1-${n.toString(16)}`;
}
function member(project: Project, id: string): Piece {
  const piece = project.pieces.find(
    (piece) => piece.id === id && !piece.offcut,
  );
  if (
    !piece ||
    !material(piece.material).wood ||
    !["linear", "sheet"].includes(material(piece.material).stockKind) ||
    material(piece.material).shape
  )
    throw Error(
      `Choose an actual active rectangular wood member for ${memberName(project, id)}; missing parts, offcuts and unsupported profiles cannot define a fit.`,
    );
  return piece;
}
function lengthAxis(stock: Material): Axis | null {
  if (
    !stock.wood ||
    !stock.cuttable ||
    stock.stockKind !== "linear" ||
    stock.shape ||
    !vector(stock.size) ||
    stock.size.some((n) => n <= 0 || n > 240)
  )
    return null;
  const longest = Math.max(...stock.size),
    axes = ([0, 1, 2] as Axis[]).filter((axis) => stock.size[axis] === longest);
  return axes.length === 1 ? axes[0] : null;
}
export function fittedStockMaterials(): Material[] {
  return catalog
    .filter((stock) => lengthAxis(stock) !== null)
    .map((stock) => structuredClone(stock));
}
function insideFace(face: FittedStockFace, point: V3) {
  if (Math.abs(dot(face.normalLocal, sub(point, face.centerLocal))) > EPS)
    return false;
  return face.verticesLocal.every((vertex, i) => {
    const edge = sub(
        face.verticesLocal[(i + 1) % face.verticesLocal.length],
        vertex,
      ),
      length = Math.hypot(...edge);
    return (
      dot(cross(edge, sub(point, vertex)), face.normalLocal) >= -EPS * length
    );
  });
}
export function fittedStockFaces(
  project: Project,
  pieceId: string,
): FittedStockFace[] {
  const piece = member(project, pieceId),
    solid = clipBox(piece.size, piece.cutPlanes),
    faces: FittedStockFace[] = [];
  for (const raw of solid.faces) {
    const verticesLocal = raw.indices.map((i) => [...solid.vertices[i]] as V3),
      normalLocal = [...raw.normal] as V3,
      centerLocal = scale(
        verticesLocal.reduce(add, [0, 0, 0] as V3),
        1 / verticesLocal.length,
      );
    if (
      faces.some(
        (face) =>
          Math.hypot(...sub(face.normalLocal, normalLocal)) <= EPS &&
          Math.abs(dot(normalLocal, sub(centerLocal, face.centerLocal))) <= EPS,
      )
    )
      continue;
    const axis = normalLocal.findIndex((n) => Math.abs(Math.abs(n) - 1) <= EPS),
      label =
        axis >= 0
          ? `Local ${["X", "Y", "Z"][axis]}${normalLocal[axis] > 0 ? "+" : "−"} face`
          : `Retained cut face ${(raw.planeIndex ?? faces.length) + 1}`;
    faces.push({
      ref: {
        pieceId,
        pointLocal: [...centerLocal],
        normalLocal: [...normalLocal],
      },
      label,
      verticesLocal,
      verticesWorld: verticesLocal.map((p) => toWorld(p, piece)),
      centerLocal,
      centerWorld: toWorld(centerLocal, piece),
      normalLocal,
      normalWorld: rotate(normalLocal, piece.rotation),
    });
  }
  return faces;
}
/** The pick identifies a real retained polygon and preserves the exact clicked local point. */
export function resolveFittedStockFace(
  project: Project,
  ref: FittedFaceRef,
): FittedStockFace {
  if (
    !ref ||
    !vector(ref.pointLocal) ||
    !vector(ref.normalLocal) ||
    Math.abs(Math.hypot(...ref.normalLocal) - 1) > EPS
  )
    throw Error(
      "A fitted face needs an actual member ID, a finite local surface point and a normalized outward normal.",
    );
  const matches = fittedStockFaces(project, ref.pieceId).filter(
    (face) =>
      Math.hypot(...sub(face.normalLocal, ref.normalLocal)) <= EPS &&
      insideFace(face, ref.pointLocal),
  );
  if (matches.length !== 1)
    throw Error(
      `The selected face of ${memberName(project, ref.pieceId)} is missing, ambiguous or removed by a cut. Pick one actual retained planar face again.`,
    );
  return { ...matches[0], ref: structuredClone(ref) };
}
export function pickFittedStockFace(
  project: Project,
  pieceId: string,
  pointLocal: V3,
  outwardLocal: V3,
): FittedFaceRef {
  return resolveFittedStockFace(project, {
    pieceId,
    pointLocal,
    normalLocal: outwardLocal,
  }).ref;
}
/** An unsupported shape is a conservative external box, never a claimed filled profile. */
function envelope(piece: Piece): CollisionSolid {
  const box = clipBox(piece.size, []),
    vertices = box.vertices.map((p) => toWorld(p, piece)),
    axes = ([0, 1, 2] as Axis[]).map((axis) => {
      const v: V3 = [0, 0, 0];
      v[axis] = 1;
      return rotate(v, piece.rotation);
    });
  return {
    vertices,
    faceNormals: axes,
    edgeDirections: axes,
    bounds: {
      min: ([0, 1, 2] as Axis[]).map((axis) =>
        Math.min(...vertices.map((p) => p[axis])),
      ) as V3,
      max: ([0, 1, 2] as Axis[]).map((axis) =>
        Math.max(...vertices.map((p) => p[axis])),
      ) as V3,
    },
    kind: "envelope",
  };
}
function context(project: Project, spec: FittedStockSpec) {
  return { project, spec, catalog };
}
type CapturedIds = {
  blockId: string;
  sourceId: string | null;
  offcutIds: string[];
};
function candidate(
  project: Project,
  raw: FittedStockSpec,
  ids?: CapturedIds,
): Omit<FittedStockPreview, "fingerprint"> {
  const spec = structuredClone(raw);
  if (
    !spec ||
    !spec.first ||
    !spec.second ||
    !vector(spec.datumLocal) ||
    ![spec.rollDegrees, spec.clearanceA, spec.clearanceB].every(
      Number.isFinite,
    ) ||
    spec.clearanceA < 0 ||
    spec.clearanceB < 0
  )
    throw Error(
      "Enter a finite first-face center datum, roll angle and two nonnegative end clearances.",
    );
  if (
    typeof spec.name !== "string" ||
    !spec.name.trim() ||
    spec.name.length > 120
  )
    throw Error("Give the fitted member a name between 1 and 120 characters.");
  if (!project.steps.some((step) => step.id === spec.stepId))
    throw Error("Choose an existing build step for the fitted member.");
  if (spec.guidePlacement && !guidePlacementTargets(project).some((target) => target.ownerId === spec.guidePlacement!.ownerId && target.stageKey === spec.guidePlacement!.stageKey))
    throw Error("The selected build stage changed or is unavailable. Choose a current stage or Automatic and preview again.");
  const section =
    spec.sectionId === null
      ? null
      : project.sections.find((section) => section.id === spec.sectionId);
  if (spec.sectionId !== null && !section)
    throw Error("The chosen destination section no longer exists.");
  if (section?.recipe?.lidOpen)
    throw Error(
      "Close the destination lid before adding a custom fitted member to its section.",
    );
  if (spec.first.pieceId === spec.second.pieceId)
    throw Error("Choose faces on two distinct actual wood members.");
  const firstFace = resolveFittedStockFace(project, spec.first),
    secondFace = resolveFittedStockFace(project, spec.second),
    first = member(project, spec.first.pieceId);
  if (Math.hypot(...add(firstFace.normalWorld, secondFace.normalWorld)) > EPS)
    throw Error(
      "Choose opposed parallel retained faces; this first stock fit makes square ends, not guessed bevel cuts.",
    );
  if (!insideFace(firstFace, spec.datumLocal))
    throw Error(
      "The explicit first-face center datum must lie on that actual retained polygon.",
    );
  const start = toWorld(spec.datumLocal, first),
    normal = firstFace.normalWorld,
    span = dot(sub(secondFace.centerWorld, start), normal);
  if (span <= EPS)
    throw Error(
      "The second opposed face must be a positive distance in front of the first outward normal.",
    );
  const stock = catalog.find((stock) => stock.id === spec.material),
    axis = stock ? lengthAxis(stock) : null;
  if (!stock || axis === null)
    throw Error(
      "Choose cuttable rectangular linear wood stock with one unique catalog length axis; sheets, rolls, hardware and shaped envelopes cannot be scaled into a fitted block.",
    );
  const sourceLength = stock.size[axis],
    requestedLength = span - spec.clearanceA - spec.clearanceB;
  if (requestedLength <= EPS)
    throw Error("The two clearances leave no positive fitted stock length.");
  if (requestedLength > sourceLength + EPS)
    throw Error(
      `The ${requestedLength} in fit exceeds the selected ${sourceLength} in stock length. Select longer physical stock; no source scaling is allowed.`,
    );
  const cutLength =
    Math.abs(sourceLength - requestedLength) <= EPS
      ? sourceLength
      : requestedLength;
  const uAxis = ((axis + 1) % 3) as Axis,
    vAxis = ((axis + 2) % 3) as Axis,
    tangentAxis = ([0, 1, 2] as Axis[]).sort(
      (a, b) =>
        Math.abs(firstFace.normalLocal[a]) -
          Math.abs(firstFace.normalLocal[b]) || a - b,
    )[0],
    tangent: V3 = [0, 0, 0];
  tangent[tangentAxis] = 1;
  const u0 = rotate(
      unit(
        sub(
          tangent,
          scale(firstFace.normalLocal, dot(tangent, firstFace.normalLocal)),
        ),
      ),
      first.rotation,
    ),
    v0 = cross(normal, u0),
    angle = ((spec.rollDegrees % 360) * Math.PI) / 180,
    u = add(scale(u0, Math.cos(angle)), scale(v0, Math.sin(angle))),
    v = cross(normal, u),
    basis: V3[] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
  basis[axis] = normal;
  basis[uAxis] = u;
  basis[vAxis] = v;
  const matrix = new Matrix4().makeBasis(
      new Vector3(...basis[0]),
      new Vector3(...basis[1]),
      new Vector3(...basis[2]),
    ),
    euler = new Euler().setFromRotationMatrix(matrix),
    rotation: V3 = [euler.x, euler.y, euler.z];
  const footprint = (center: V3) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) =>
        add(
          add(center, scale(u, (a * stock.size[uAxis]) / 2)),
          scale(v, (b * stock.size[vAxis]) / 2),
        ),
      ),
    endFootprintsWorld = {
      first: footprint(start),
      second: footprint(add(start, scale(normal, span))),
    };
  for (const [face, points, which] of [
    [firstFace, endFootprintsWorld.first, "first"],
    [secondFace, endFootprintsWorld.second, "second"],
  ] as const) {
    const host = member(project, face.ref.pieceId),
      axes = ([0, 1, 2] as Axis[]).map((axis) => {
        const p: V3 = [0, 0, 0];
        p[axis] = 1;
        return rotate(p, host.rotation);
      });
    if (
      points.some(
        (point) =>
          !insideFace(
            face,
            axes.map((axis) => dot(sub(point, host.position), axis)) as V3,
          ),
      )
    )
      throw Error(
        `The complete stock cross-section does not fit inside the ${which} retained face at this datum and roll. Choose a smaller actual stock cross-section or another explicit datum.`,
      );
  }
  const kerf = plannedCutKerf(project, stock.id);
  const measuredKerf = project.woodKerfs?.[stock.id];
  const leftover = sourceLength - cutLength,
    hasCut = leftover > EPS,
    hasRemnant = leftover > kerf + EPS,
    blockId = ids?.blockId ?? uid(),
    sourceId = hasCut ? (ids ? ids.sourceId : uid()) : null,
    offcutIds = hasRemnant ? (ids ? ids.offcutIds : [uid()]) : [];
  if (
    (hasCut && !sourceId) ||
    (ids &&
      ((hasCut ? ids.sourceId === null : ids.sourceId !== null) ||
        ids.offcutIds.length !== (hasRemnant ? 1 : 0)))
  )
    throw Error(
      "Captured fitted-stock source/remnant identities no longer match this cut.",
    );
  if (
    new Set([blockId, ...offcutIds]).size !== 1 + offcutIds.length ||
    [blockId, ...offcutIds].some((id) =>
      project.pieces.some((piece) => piece.id === id),
    ) ||
    (sourceId &&
      project.pieces.some((piece) => piece.cutStock?.id === sourceId))
  )
    throw Error(
      "Captured fitted-stock identities collide with an existing part or stock source; preview again.",
    );
  const size = [...stock.size] as V3;
  size[axis] = cutLength;
  const position = add(start, scale(normal, spec.clearanceA + cutLength / 2));
  const block: Piece = {
    id: blockId,
    name: spec.name,
    material: stock.id,
    size,
    position,
    rotation,
    stepId: spec.stepId,
    assembly: section?.name ?? "Loose parts",
    offcut: false,
    cutPlanes: [],
    stockLengthAxis: axis,
    cutStock: sourceId
      ? { id: sourceId, size: [...stock.size], offset: [0, 0, 0], ...(measuredKerf !== undefined ? { woodKerf: measuredKerf } : {}) }
      : null,
    ...(spec.guidePlacement ? { guidePlacement: structuredClone(spec.guidePlacement) } : {}),
  };
  const solid = prepareCollisionSolid(block)!;
  for (const other of project.pieces) {
    if (other.offcut) continue;
    const actual = prepareCollisionSolid(other),
      shape = actual ?? envelope(other);
    if (solidOverlap(solid, shape, 0))
      throw Error(
        shape.kind === "envelope"
          ? `Unknown profile envelope ${memberName(project, other.id)} may obstruct the fitted stock. Review its actual profile; a clear path is not established.`
          : `Actual member ${memberName(project, other.id)} obstructs the fitted stock's retained solid.`,
      );
  }
  if (project.workZone) {
    const zone = project.workZone;
    if (
      solid.vertices.some(
        (p) =>
          p[0] < -zone.width / 2 - EPS ||
          p[0] > zone.width / 2 + EPS ||
          p[2] < -zone.depth / 2 - EPS ||
          p[2] > zone.depth / 2 + EPS ||
          p[1] < -EPS ||
          p[1] > zone.height + EPS,
      )
    )
      throw Error(
        "The fitted stock lies outside the entered work zone. Move the datum or review the space before adding it.",
      );
  }
  const pieces = [...project.pieces, block];
  if (hasRemnant) {
    const remnantSize = [...stock.size] as V3;
    remnantSize[axis] = leftover - kerf;
    const offset: V3 = [0, 0, 0];
    offset[axis] = cutLength + kerf;
    const remnant: Piece = {
      ...structuredClone(block),
      id: offcutIds[0],
      name: `Offcut · ${spec.name}`.slice(0, 120),
      size: remnantSize,
      position: add(position, scale(normal, (sourceLength + kerf) / 2)),
      offcut: true,
      cutStock: { id: sourceId!, size: [...stock.size], offset, ...(measuredKerf !== undefined ? { woodKerf: measuredKerf } : {}) },
    };
    delete remnant.guidePlacement;
    pieces.push(remnant);
  }
  const next = projectSchema.parse({
    ...project,
    pieces,
    sections: project.sections.map((s) =>
      s.id === spec.sectionId
        ? { ...s, pieceIds: [...s.pieceIds, blockId] }
        : s,
    ),
    guideFingerprint: null,
  });
  return {
    project: next,
    spec,
    blockId,
    offcutIds,
    sourceId,
    span,
    cutLength,
    sourceLength,
    stockLengthAxis: axis,
    kerfLoss: hasCut ? Math.min(kerf, leftover) : 0,
    firstFace,
    secondFace,
    endFootprintsWorld,
    notes: [
      hasCut
        ? hasRemnant
          ? `One fresh ${sourceLength} in stock source: ${cutLength} in fitted member, ${kerf} in kerf and ${leftover - kerf} in reusable offcut.`
          : `One fresh ${sourceLength} in stock source: ${cutLength} in fitted member; the remaining ${leftover} in is end-trim waste with no reusable offcut.`
        : `Full ${sourceLength} in stock use; no cut, kerf or remnant was invented.`,
      "Square-ended stock with explicit clearances only. No grain, fastening, load capacity, joint suitability or installation approval is inferred.",
      section
        ? "Added as an ordinary custom section member, without a generated design role. A later recipe rebuild must review this manual addition."
        : "Added as a loose ordinary build member. Parent movement does not create a persistent fit constraint.",
    ],
  };
}
export function previewFittedStock(
  project: Project,
  spec: FittedStockSpec,
): FittedStockPreview {
  const result = candidate(project, spec);
  return {
    ...result,
    fingerprint: hash({ context: context(project, spec), result }),
  };
}
export function commitFittedStock(
  project: Project,
  spec: FittedStockSpec,
  preview: FittedStockPreview,
): Project {
  if (canonical(spec) !== canonical(preview.spec))
    throw Error(
      "The fitted-stock inputs changed after Preview. Preview again before adding it.",
    );
  const { fingerprint, ...captured } = preview;
  if (
    hash({ context: context(project, spec), result: captured }) !== fingerprint
  )
    throw Error(
      "The project, source, selected faces or captured preview changed. Preview again; nothing was added.",
    );
  const expected = candidate(project, spec, {
    blockId: preview.blockId,
    offcutIds: preview.offcutIds,
    sourceId: preview.sourceId,
  });
  if (canonical(expected) !== canonical(captured))
    throw Error(
      "The fitted-stock candidate no longer matches its exact captured geometry and source. Preview again.",
    );
  return structuredClone(preview.project);
}
