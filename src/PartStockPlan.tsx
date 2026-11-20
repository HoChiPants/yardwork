import { useMemo, useState } from "react";
import { CutStockLayout } from "./CutStockLayoutView";
import type { CutStockInspection } from "./cutStockLayout";
import type { BomRow } from "./engine";
import { material, type MaterialId, type Piece, type Project } from "./model";
import { partStockOptions, previewPartStockReplacement } from "./partStockReplacement";
import { purchaseUnitLabel } from "./purchaseUnits";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { partLabel } from "./partLabels";
import { formatStockLength } from "./measurement";
import { fittingOffcuts } from "./offcutAssignment";
import { MaterialCutNote, StockCutUnit } from "./StockCutSequenceList";
import {
  stockCutSequenceContext,
  type StockCutLayout,
  type StockCutSequence,
} from "./stockCutSequence";

export function PartStockPlan({
  project,
  piece,
  row,
  sequences,
  inspection,
  onRecord,
  onStockOnHand,
  onSaveLoss,
  onAssignOffcut,
  onReviewOffcut,
  onReplaceStock,
}: {
  project: Project;
  piece: Piece;
  row?: BomRow;
  sequences?: readonly StockCutSequence[];
  inspection: CutStockInspection;
  onRecord: (layout: StockCutLayout, onHand: boolean) => void;
  onStockOnHand: (sourceId: string, onHand: boolean) => void;
  onSaveLoss: (layout: StockCutLayout) => void;
  onAssignOffcut: (pieceId: string, offcutId: string) => void;
  onReviewOffcut: (historyId: string) => void;
  onReplaceStock: (pieceId: string, stockId: MaterialId) => void;
}) {
  const [offcutId, setOffcutId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const label = partLabel(project, piece.id);
  const sequence = sequences?.find(({ partIds }) => partIds.includes(piece.id));
  const offcuts = fittingOffcuts(project, piece, inspection);
  const assignment = project.history.find(
    ({ offcutCut }) =>
      offcutCut?.targetId === piece.id && !offcutCut.releasedAt,
  );
  const chosen =
    offcuts.find(({ piece }) => piece.id === offcutId) ??
    (offcuts.length === 1 ? offcuts[0] : undefined);
  const choices = partStockOptions(project, piece);
  const replacement = choices.find(({ id }) => id === replacementId);
  const replacementPreview = useMemo(() => {
    if (!replacement) return null;
    try {
      const { purchase } = previewPartStockReplacement(project, piece.id, replacement.id);
      return { purchase, error: null };
    } catch (error) {
      return { purchase: null, error: error instanceof Error ? error.message : "Review the selected blank." };
    }
  }, [project, piece.id, replacement]);
  const offer = replacement && reviewedOfferForMaterial(replacement, project.retailer);
  const section = project.sections.find(({ pieceIds }) => pieceIds.includes(piece.id));
  const generated = section && (section.generator || section.recipe || project.ideaBindings.some(({ entries }) =>
    entries.some(({ sections }) => sections.some(({ sectionId }) => sectionId === section.id))));
  return (
    <>
      <h2 id="modal-title">Stock for {label}</h2>
      <p>
        {piece.name} · {material(piece.material).name}
      </p>
      {choices.length > 0 && (
        <details className="field-section">
          <summary>Change stock for this part</summary>
          <label className="field">
            Replacement stock
            <select value={replacement?.id ?? ""} onChange={(event) => setReplacementId(event.target.value)}>
              <option value="">Choose a matching blank</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>{choice.name}{!choice.productReference && " · example stock"}</option>
              ))}
            </select>
          </label>
          {replacement && (
            <>
              <p className="small-note">
                Blank dimensions {piece.size.map(formatStockLength).join(" × ")}.
                {" "}The part keeps its position, orientation and cut profiles.
                {" "}Check the grade, treatment and any saved connections.
              </p>
              {generated && <p className="small-note">Rebuilding this section reapplies its saved stock choices.</p>}
              {offer && <p><a href={offer.url} target="_blank" rel="noreferrer">Product #{offer.productId}</a></p>}
            </>
          )}
          {replacementPreview?.error && <p role="alert" className="form-error">{replacementPreview.error}</p>}
          {replacement && replacementPreview?.purchase && (
            <>
              <ul aria-label="Project purchase changes">
                {replacementPreview.purchase.map(({ id, before, after }) => (
                  <li key={id}>
                    {material(id).name} · {before} → {after} {purchaseUnitLabel(material(id).unit, after)} to buy
                  </li>
                ))}
              </ul>
              <button type="button" className="button secondary full" onClick={() => {
                onReplaceStock(piece.id, replacement.id);
                setReplacementId("");
              }}>Apply replacement stock</button>
            </>
          )}
        </details>
      )}
      {assignment && (
        <button
          type="button"
          className="button secondary full"
          onClick={() => onReviewOffcut(assignment.id)}
        >
          Review offcut assignment
        </button>
      )}
      {offcuts.length > 0 && (
        <details className="field-section">
          <summary>Use an offcut from the Cut pool ({offcuts.length})</summary>
          <label className="field">
            Matching offcut
            <select
              value={chosen?.piece.id ?? ""}
              onChange={(event) => setOffcutId(event.target.value)}
            >
              {offcuts.length > 1 && <option value="">Choose an offcut</option>}
              {offcuts.map((entry) => (
                <option key={entry.piece.id} value={entry.piece.id}>
                  {partLabel(project, entry.piece.id)} · {entry.piece.name} ·{" "}
                  {[...entry.available]
                    .reverse()
                    .map(formatStockLength)
                    .join(" × ")}
                  {entry.onHand ? " · on hand" : ""}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <>
              <p className="small-note">
                {chosen.operations.length
                  ? chosen.operations.map(({ text }) => text).join(" · ")
                  : "Fits as measured."}
              </p>
              <button
                type="button"
                className="button secondary full"
                onClick={() => onAssignOffcut(piece.id, chosen.piece.id)}
              >
                Use offcut for this part
              </button>
            </>
          )}
        </details>
      )}
      {piece.cutStock ? (
        <CutStockLayout
          project={project}
          sourceId={piece.cutStock.id}
          inspection={inspection}
          focusedId={piece.id}
          onStockOnHand={(onHand) => onStockOnHand(piece.cutStock!.id, onHand)}
        />
      ) : row && sequence ? (
        <div className="stock-cut-order">
          <p className="small-note">{stockCutSequenceContext}</p>
          <MaterialCutNote id={row.id} />
          <StockCutUnit
            project={project}
            row={row}
            sequence={sequence}
            initiallyOpen
            onRecord={onRecord}
            onSaveLoss={onSaveLoss}
          />
        </div>
      ) : (
        <p className="notice">
          {row?.oversizedParts.some(({ id }) => id === piece.id)
            ? "This blank is oversized for its selected stock. Resize it or choose larger stock before cutting."
            : "An ordered cut plan is unavailable for this piece. Review its material in List."}
        </p>
      )}
    </>
  );
}
