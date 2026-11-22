import { Vector3 } from "three";
import { clipBox } from "./cutProfiles";
import { inspectCutStock } from "./cutStock";
import { formatCoverageArea } from "./depthCoverage";
import { greenhouseFoundationReviews } from "./greenhouseFoundation";
import { greenhouseBaseTimber, greenhouseBaseTimber12 } from "./greenhouseBaseReference";
import { homeDepotTreatedLumber } from "./homeDepotTreatedLumber";
import { formatStockLength } from "./measurement";
import { material, type MaterialId, type Piece, type Project, type V3 } from "./model";
import { orientedStockSize } from "./stockAxes";
import { pieceThroughOpenings, throughOpeningSurface } from "./throughOpenings";

export const fieldTreatmentTitle = "Pressure-treated wood cuts";

export const fieldTreatmentReference = {
  label: "American Wood Council field treatment guidance",
  url: "https://awc.org/faq/what-is-the-best-way-to-deal-with-the-exposed-ends-of-unpreserved-wood-when-pressure-treated-wood-is-cut/",
};

export const fieldTreatmentScope =
  "Check the delivered lumber’s end tag and intended exposure. For field cuts and holes, follow the applicable AWPA M4 guidance and the preservative label before the surfaces are covered. Confirm any prior treatment on shop scraps before reusing them.";

const treatedStock = new Set<MaterialId>([
  "treated",
  "post",
  greenhouseBaseTimber.materialId,
  greenhouseBaseTimber12.materialId,
  ...homeDepotTreatedLumber.map(({ materialId }) => materialId),
]);

export const isPressureTreated = (id: MaterialId) => treatedStock.has(id);

const tolerance = 1e-6;
const axes = ["X", "Y", "Z"] as const;

function sourceCutFaces(piece: Piece, verified: boolean) {
  const source = piece.cutStock;
  if (!source || !verified) return [];
  return axes.flatMap((_, axis) => [
    ...(source.offset[axis] > tolerance ? [{ axis, sign: -1 }] : []),
    ...(source.size[axis] - source.offset[axis] - piece.size[axis] > tolerance ? [{ axis, sign: 1 }] : []),
  ]);
}

/** Only retained modeled faces. A shorter blank alone does not identify the treated side. */
export function fieldTreatmentGeometry(piece: Piece, sourceVerified: boolean) {
  if (!isPressureTreated(piece.material)) return null;
  const stockFaces = sourceCutFaces(piece, sourceVerified);
  const openings = pieceThroughOpenings(piece);
  if (!stockFaces.length && !openings.length && !piece.cutPlanes.length) return null;
  const isStockCut = (normal: V3) => stockFaces.some(({ axis, sign }) => normal[axis] === sign);
  try {
    let faces: V3[][];
    if (openings.length) {
      faces = throughOpeningSurface(piece.size, openings).faces
        .filter(({ normal, openingWall }) => openingWall || isStockCut(normal))
        .map(({ points }) => points);
    } else {
      const solid = clipBox(piece.size, piece.cutPlanes);
      faces = solid.faces
        .filter(({ normal, kind }) => kind === "cut" || isStockCut(normal))
        .map(({ indices }) => indices.map((index) => solid.vertices[index]));
    }
    if (!faces.length) return null;
    let squareInches = 0;
    for (const points of faces) {
      const origin = new Vector3(...points[0]);
      for (let i = 1; i < points.length - 1; i++) {
        const a = new Vector3(...points[i]).sub(origin);
        const b = new Vector3(...points[i + 1]).sub(origin);
        squareInches += a.cross(b).length() / 2;
      }
    }
    return { faces, squareInches };
  } catch {
    return null;
  }
}

function fieldTreatmentArea(piece: Piece, sourceVerified: boolean) {
  if (piece.cutPlanes.length || pieceThroughOpenings(piece).length)
    return fieldTreatmentGeometry(piece, sourceVerified)?.squareInches;
  return sourceCutFaces(piece, sourceVerified).reduce((area, { axis }) =>
    area + piece.size[(axis + 1) % 3] * piece.size[(axis + 2) % 3], 0);
}

function stockTrim(piece: Piece, stock: ReturnType<typeof material>) {
  const catalogSpans = [...(stock.stockSize ?? stock.size)].sort((a, b) => a - b);
  const spans = orientedStockSize(piece);
  if (spans.some((size, i) => size > catalogSpans[i] + tolerance)) return "";
  const trimmed = ["thickness", "width", "length"].flatMap((direction, index) =>
    catalogSpans[index] - spans[index] > tolerance
      ? [`${direction} to ${formatStockLength(spans[index])}`]
      : [],
  );
  return trimmed.length ? `Planned trim from selected stock · ${trimmed.join(", ")}.` : "";
}

function cutFaceReview(
  piece: Piece,
  validSources: ReadonlySet<string>,
  onHand: ReadonlySet<string>,
) {
  const source = piece.cutStock;
  if (source && !validSources.has(source.id))
    return "Confirm cut faces from the original blank after resolving its cut-source review.";
  if (piece.cutPlanes.length)
    return "Shaped cut · inspect the saved profile and any trimmed faces.";
  if (!source) return piece.offcut ? "" : stockTrim(piece, material(piece.material));

  const faces = sourceCutFaces(piece, true).map(({ axis, sign }) =>
    `local ${sign < 0 ? "−" : "+"}${axes[axis]}`);
  if (faces.length)
    return `Recorded cut ${faces.length === 1 ? "face" : "faces"} · ${faces.join(", ")}.`;
  return onHand.has(source.id) && stockTrim(piece, material(piece.material))
    ? "On-hand blank · check which faces were previously cut and treated."
    : "";
}

export function treatedWoodCuts(
  project: Project,
  inspection?: ReturnType<typeof inspectCutStock>,
) {
  const pieces = project.pieces.filter(({ material: id }) => isPressureTreated(id));
  if (!pieces.length) return [];
  const checked = inspection ?? inspectCutStock(project);
  const onHand = new Set(project.onHandCutSources);
  const foundationBores = new Map<string, number>();
  for (const { anchors } of greenhouseFoundationReviews(project)) {
    for (const { mark, issues } of anchors?.rows ?? []) {
      if (issues.length) continue;
      foundationBores.set(mark.railId, (foundationBores.get(mark.railId) ?? 0) + 1);
    }
  }
  return pieces.flatMap((piece) => {
    const round = piece.roundOpenings?.length ?? 0;
    const rectangular = piece.rectangularOpenings?.length ?? 0;
    const anchors = foundationBores.get(piece.id) ?? 0;
    const surfaceArea = fieldTreatmentArea(piece, !!piece.cutStock && checked.valid.has(piece.cutStock.id));
    const details = [
      cutFaceReview(piece, checked.valid, onHand),
      round ? `${round} round ${round === 1 ? "opening" : "openings"}.` : "",
      rectangular ? `${rectangular} rectangular ${rectangular === 1 ? "opening or notch" : "openings or notches"}.` : "",
      anchors ? `${anchors} planned foundation anchor ${anchors === 1 ? "bore" : "bores"} through the rail.` : "",
      surfaceArea ? `Identified field-cut surfaces · ${formatCoverageArea(surfaceArea)}.` : "",
    ].filter(Boolean);
    return details.length ? [{ piece, detail: details.join(" "), surfaceArea: surfaceArea || undefined }] : [];
  });
}
