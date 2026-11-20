import { Vector3 } from "three";
import { attachmentGeometryFingerprint } from "./attachments";
import { everbiltRodBracket } from "./closetRodReference";
import { fittedStockFaces } from "./fittedStock";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches as inches } from "./measurement";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { reviewRodFit, sameRodEnd } from "./rodFits";
import {
  rodBracketMountInputSchema,
  rodFitSchema,
  rodMeasurementTolerance,
  type RodSupport,
} from "./rodFitSchema";
import {
  reviewSocketPlateFace,
  reviewWoodMountHoles,
  socketFaceAxes,
  type BackplateExtents,
} from "./rodMountGeometry";
import { reviewRodSupports } from "./rodSupports";
import { inverseRotation, rotate } from "./spatial";

const epsilon = 1e-7;
type Fit = ReturnType<typeof reviewRodFit>;
const up: V3 = [0, 1, 0];
const vec = (point: V3) => new Vector3(...point);
const supportKey = (support: RodSupport) =>
  bindingHash([
    support.fitKey,
    support.fromStart,
    support.wallToRod,
    support.bracketReach,
    support.bracketProductId,
  ]);
export const rodBracketMountScope =
  "Confirm the delivered bracket and screws, mounting access, shelf attachment and how the backing carries the load.";

export function rodBracketBackingChoices(
  project: Project,
  fit: Fit,
  support: RodSupport,
  pieceId?: string,
) {
  const row = reviewRodSupports(fit).rows.find(
    (row) => row.support.id === support.id,
  );
  if (
    !fit.bay ||
    row?.state !== "reach-reviewed" ||
    support.bracketProductId !== everbiltRodBracket.productId ||
    support.bracketReach === null ||
    support.wallToRod === null ||
    Math.abs(fit.bay.axis.y) > epsilon
  )
    return [];
  const { axis } = fit.bay;
  const center = vec(support.centerWorld);
  const wallReach = support.wallToRod;
  const bracketReach = support.bracketReach;
  return project.pieces.flatMap((piece) => {
    const stock = material(piece.material);
    if (
      (pieceId && piece.id !== pieceId) ||
      piece.offcut ||
      !stock.wood ||
      stock.shape ||
      !["linear", "sheet"].includes(stock.stockKind)
    )
      return [];
    const inverse = inverseRotation(piece.rotation);
    const along = rotate(axis.toArray(), inverse);
    const vertical = rotate(up, inverse);
    if (!socketFaceAxes(along) || !socketFaceAxes(vertical)) return [];
    const faces = fittedStockFaces(project, piece.id).flatMap((face) => {
      const normal = vec(face.normalWorld);
      const frame = socketFaceAxes(face.normalLocal);
      if (
        !frame ||
        Math.abs(normal.y) > epsilon ||
        Math.abs(normal.dot(axis)) > epsilon
      )
        return [];
      const reach = center.clone().sub(vec(face.centerWorld)).dot(normal);
      if (
        reach <= epsilon ||
        Math.abs(wallReach - reach) > rodMeasurementTolerance ||
        Math.abs(bracketReach - reach) > rodMeasurementTolerance
      )
        return [];
      const projected = center
        .clone()
        .addScaledVector(normal, -reach)
        .sub(vec(piece.position));
      const local = rotate(projected.toArray(), inverse);
      if (
        Math.abs(Math.abs(local[frame.axis]) - piece.size[frame.axis] / 2) >
          epsilon ||
        frame.across.some((i) => Math.abs(local[i]) > piece.size[i] / 2 + 24)
      )
        return [];
      return [
        {
          piece,
          reach,
          along,
          vertical,
          face: {
            pieceId: piece.id,
            pointLocal: local,
            normalLocal: face.normalLocal,
            geometryFingerprint: attachmentGeometryFingerprint(piece),
          },
        },
      ];
    });
    return faces.length === 1 ? faces : [];
  });
}

type Backing = ReturnType<typeof rodBracketBackingChoices>[number];
function mountFace(
  backing: Backing,
  alongOffset: number,
  heightOffset: number,
) {
  return {
    ...backing.face,
    pointLocal: backing.face.pointLocal.map(
      (value, index) =>
        value +
        backing.along[index] * alongOffset +
        backing.vertical[index] * heightOffset,
    ) as V3,
  };
}

function replaceMount(
  project: Project,
  rodId: string,
  supportId: string,
  mounting?: RodSupport["mounting"],
) {
  return {
    ...project,
    rodFitPlans: (project.rodFitPlans ?? []).map((plan) =>
      plan.rodId !== rodId
        ? plan
        : rodFitSchema.parse({
            ...plan,
            intermediateSupports: plan.intermediateSupports?.map((support) => {
              if (support.id !== supportId) return support;
              const { mounting: _prior, ...rest } = support;
              return mounting ? { ...rest, mounting } : rest;
            }),
          }),
    ),
  };
}

export function saveRodBracketMount(
  project: Project,
  rodId: string,
  supportId: string,
  raw: unknown,
) {
  const input = rodBracketMountInputSchema.parse(raw);
  const fit = reviewRodFit(project, rodId);
  const support = fit.plan?.intermediateSupports?.find(
    ({ id }) => id === supportId,
  );
  if (!support) throw Error("Choose a saved center support.");
  const [backing] = rodBracketBackingChoices(
    project,
    fit,
    support,
    input.pieceId,
  );
  if (!backing)
    throw Error("Choose flat wood backing at the measured bracket reach.");
  return replaceMount(project, rodId, supportId, {
    ...input,
    face: mountFace(backing, input.alongOffset, input.heightOffset),
    supportKey: supportKey(support),
  });
}

export function removeRodBracketMount(
  project: Project,
  rodId: string,
  supportId: string,
) {
  return replaceMount(project, rodId, supportId);
}

export function reviewRodBracketMount(
  project: Project,
  fit: Fit,
  support: RodSupport,
) {
  const mount = support.mounting;
  if (!mount) return null;
  const stale = {
    state: "stale" as const,
    outline: null,
    reach: null,
    holes: null,
    detail:
      "The support position, reach or backing changed. Recheck the bracket measurements.",
  };
  if (mount.supportKey !== supportKey(support)) return stale;
  const [backing] = rodBracketBackingChoices(
    project,
    fit,
    support,
    mount.pieceId,
  );
  if (!backing) return stale;
  const face = mountFace(backing, mount.alongOffset, mount.heightOffset);
  const frame = socketFaceAxes(face.normalLocal);
  if (!frame || !sameRodEnd(mount.face, face)) return stale;
  const [u, v] = frame.across;
  const half = (axis: number) =>
    (Math.abs(backing.along[axis]) > 0.5 ? mount.width : mount.height) / 2;
  const extents: BackplateExtents = [half(u), half(u), half(v), half(v)];
  const plate = reviewSocketPlateFace(
    backing.piece,
    face.pointLocal,
    face.normalLocal,
    extents,
  )!;
  const issues = [
    ...(plate.crossesEdge
      ? ["The backplate extends past a retained edge."]
      : []),
    ...(plate.crossesVoid ? ["The backplate crosses a through-cut."] : []),
  ];
  const holes = reviewWoodMountHoles(
    backing.piece,
    face,
    extents,
    {
      ...mount,
      centers: mount.centers.map(([x, y]) => [
        x * backing.along[u] + y * backing.vertical[u],
        x * backing.along[v] + y * backing.vertical[v],
      ]),
    },
    !issues.length,
  );
  const outline = plate.corners.map(
    (local) =>
      rotate(local, backing.piece.rotation).map(
        (value, i) => value + backing.piece.position[i],
      ) as V3,
  );
  return {
    state: holes.state,
    holes,
    outline,
    reach: backing.reach,
    detail: [...issues, holes.detail].join(" "),
  };
}

export function rodBracketMountGuideLines(project: Project, fit: Fit) {
  return (fit.plan?.intermediateSupports ?? []).flatMap((support) => {
    const mount = support.mounting;
    const review = reviewRodBracketMount(project, fit, support);
    if (!mount || !review) return [];
    const title = `Center bracket mounting · Everbilt 14317 · ${partLabel(project, mount.pieceId)} · ${inches(support.fromStart)} from start. ${review.detail}`;
    if (!review.holes) return [title];
    if (review.state !== "checked")
      return [
        title,
        ...review.holes.marks.flatMap(({ index, issues }) =>
          issues.length ? [`Bracket hole ${index} · ${issues.join(" ")}`] : [],
        ),
      ];
    return [
      title,
      `Modeled reach ${inches(review.reach)} · Measured plate ${inches(mount.width)} wide × ${inches(mount.height)} high.`,
      `Entered pilot diameter ${inches(mount.pilotDiameter)}, deepest depth ${inches(mount.pilotDepth)}. Seated screw diameter ${inches(mount.screwDiameter)}, depth past wood face ${inches(mount.screwDepth)}. Notes · ${mount.basis.replace(/[\r\n]/g, " ")}.`,
      ...review.holes.marks.map(
        ({ index, local }) =>
          `Bracket hole ${index} · local X/Y/Z from backing blank center · ${local.map(inches).join(", ")}.`,
      ),
      rodBracketMountScope,
    ];
  });
}
