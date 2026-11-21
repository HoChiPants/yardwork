import { inspectCutStock } from "./cutStock";
import { greenhouseFoundationReviews } from "./greenhouseFoundation";
import { greenhouseBaseTimber, greenhouseBaseTimber12 } from "./greenhouseBaseReference";
import { homeDepotTreatedLumber } from "./homeDepotTreatedLumber";
import { formatStockLength } from "./measurement";
import { material, type MaterialId, type Piece, type Project } from "./model";
import { orientedStockSize } from "./stockAxes";

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

  const faces = axes.flatMap((axis, i) => [
    ...(source.offset[i] > tolerance ? [`local −${axis}`] : []),
    ...(source.size[i] - source.offset[i] - piece.size[i] > tolerance ? [`local +${axis}`] : []),
  ]);
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
    const details = [
      cutFaceReview(piece, checked.valid, onHand),
      round ? `${round} round ${round === 1 ? "opening" : "openings"}.` : "",
      rectangular ? `${rectangular} rectangular ${rectangular === 1 ? "opening or notch" : "openings or notches"}.` : "",
      anchors ? `${anchors} planned foundation anchor ${anchors === 1 ? "bore" : "bores"} through the rail.` : "",
    ].filter(Boolean);
    return details.length ? [{ piece, detail: details.join(" ") }] : [];
  });
}
