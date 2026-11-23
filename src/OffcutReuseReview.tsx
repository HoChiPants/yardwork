import { useMemo, useState } from "react";
import { planOffcutReuse, planOnHandOffcutReuse, ripFirstReuseNote, type OffcutReusePlan } from "./offcutReusePlan";
import { formatCutDimensions } from "./offcutCutGuide";
import { partLabel } from "./partLabels";
import { purchaseUnitLabel } from "./purchaseUnits";
import { offcutSplitSuggestions, type OffcutSplitPreset } from "./offcutSplit";

export function OffcutReuseReview({
  plan,
  offcutId,
  initialOnHandOnly = false,
  onApply,
  onPreviewSplit,
}: {
  plan: OffcutReusePlan;
  offcutId?: string;
  initialOnHandOnly?: boolean;
  onApply: (chosen: OffcutReusePlan) => void;
  onPreviewSplit: (id: string, preset: OffcutSplitPreset) => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [onHandOnly, setOnHandOnly] = useState(initialOnHandOnly);
  const selectedPlan = useMemo(() => {
    if (offcutId) return targetId ? planOffcutReuse(plan.source, [offcutId], new Set([targetId])) : plan;
    if (onHandOnly === initialOnHandOnly) return plan;
    return onHandOnly ? planOnHandOffcutReuse(plan.source) : planOffcutReuse(plan.source);
  }, [plan, offcutId, targetId, onHandOnly, initialOnHandOnly]);
  const offcutLabel = offcutId ? partLabel(plan.source, offcutId) : undefined;
  const looseScrap = plan.source.pieces.find((piece) => piece.id === offcutId && piece.offcut);
  const suggestions = looseScrap && !plan.source.sections.some(({ pieceIds }) => pieceIds.includes(looseScrap.id))
    ? offcutSplitSuggestions(looseScrap) : [];
  return (
    <>
      <h2 id="modal-title">{offcutLabel ? `Plan cuts from ${offcutLabel}` : "Review offcut reuse"}</h2>
      {!offcutId && <label className="checkbox-field">
        <input type="checkbox" checked={onHandOnly} onChange={(event) => setOnHandOnly(event.target.checked)} />
        Use only on-hand offcuts
      </label>}
      {offcutLabel && plan.fittingPartIds.length > 1 && (
        <label className="field">
          Use offcut for
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">Suggested cut order</option>
            {plan.fittingPartIds.map((id) => (
              <option key={id} value={id}>
                {partLabel(plan.source, id)} · {plan.source.pieces.find((piece) => piece.id === id)?.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <OffcutReusePlanDetails plan={selectedPlan} offcutLabel={offcutLabel} onHandOnly={onHandOnly} />
      {selectedPlan.assignments.length > 0 && (
        <button className="button primary full" type="button" onClick={() => onApply(selectedPlan)}>
          Apply offcut plan
        </button>
      )}
      {looseScrap && suggestions.length > 0 && (
        <section className="field-section" aria-label="Other uses for this offcut">
          {suggestions.map(({ id, name, detail }) => (
            <div key={id}>
              <p className="small-note">{detail}</p>
              <button type="button" className="button secondary"
                onClick={() => onPreviewSplit(looseScrap.id, id)}>Preview {name.toLowerCase()}</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export function OffcutReusePlanDetails({ plan, fromCut = false, offcutLabel, onHandOnly = false }: {
  plan: OffcutReusePlan;
  fromCut?: boolean;
  offcutLabel?: string;
  onHandOnly?: boolean;
}) {
  return (
    <>
      {plan.assignments.length ? (
        <>
          <p>
            {plan.assignments.length} planned{" "}
            {plan.assignments.length === 1 ? "part fits" : "parts fit"}{" "}
            {offcutLabel ? `${offcutLabel} or its remnants.` : fromCut ? "an offcut from this trim." : onHandOnly
              ? "on-hand offcuts." : "stock in the Cut pool."}
          </p>
          {plan.shorterFirst && <p className="small-note">
            Cutting shorter parts from the offcuts first reduces the number of new boards to buy.
          </p>}
          {plan.ripFirstMaterials.length > 0 && <p className="small-note">{ripFirstReuseNote}</p>}
          <ol
            aria-label="Proposed cuts in order"
            style={{ overflowWrap: "anywhere" }}
          >
            {plan.assignments.map((row) => (
              <li key={row.partId}>
                <strong>{row.target}</strong>
                <p className="small-note">
                  {row.fromEarlierCut && "From an earlier cut · "}
                  {row.from}
                  {row.sourceCutPending && !row.fromEarlierCut && " · Expected after source cuts"}
                </p>
                <p className="small-note">
                  {row.operations.length
                    ? row.operations.join(" · ")
                    : row.sourceCutPending ? "Fits at the planned size." : "Fits as measured."}
                </p>
              </li>
            ))}
          </ol>
          {plan.remnants.length > 0 && (
            <>
              <h3>Scraps to keep</h3>
              <ul aria-label="Scraps to keep after these cuts">
                {plan.remnants.map(({ id, label, size }) => (
                  <li key={id}>{label} · {formatCutDimensions(size)}</li>
                ))}
              </ul>
            </>
          )}
          <h3>{fromCut ? "Stock to buy after reuse" : "Stock to buy"}</h3>
          {plan.purchases.length ? (
            <ul aria-label="Purchase changes">
              {plan.purchases.map(({ id, name, unit, before, after }) => (
                <li key={id}>
                  {name} · {before} → {after} {purchaseUnitLabel(unit, after)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small-note">
              The same purchase quantities cover the rest of the project.
            </p>
          )}
        </>
      ) : (
        <p>
          {offcutLabel ? `No unassigned parts fit ${offcutLabel}. Check stock type, thickness, orientation and cutting allowance.` : fromCut
            ? "These offcuts can stay in the Cut pool for another part."
            : onHandOnly ? "No on-hand offcuts fit the unassigned parts. Check the Cut pool for measured scraps and completed stock cuts."
            : "No rectangular offcuts fit the unassigned parts. Check stock type, thickness, orientation and cutting allowance."}
        </p>
      )}
    </>
  );
}
