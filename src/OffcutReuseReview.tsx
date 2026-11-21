import { type OffcutReusePlan } from "./offcutReusePlan";
import { formatStockLength } from "./measurement";
import { purchaseUnitLabel } from "./purchaseUnits";

export function OffcutReuseReview({
  plan,
  onApply,
}: {
  plan: OffcutReusePlan;
  onApply: () => void;
}) {
  return (
    <>
      <h2 id="modal-title">Review offcut reuse</h2>
      <OffcutReusePlanDetails plan={plan} />
      {plan.assignments.length > 0 && (
        <button className="button primary full" type="button" onClick={onApply}>
          Apply offcut plan
        </button>
      )}
    </>
  );
}

export function OffcutReusePlanDetails({ plan, fromCut = false }: {
  plan: OffcutReusePlan;
  fromCut?: boolean;
}) {
  return (
    <>
      {plan.assignments.length ? (
        <>
          <p>
            {plan.assignments.length} planned{" "}
            {plan.assignments.length === 1 ? "part fits" : "parts fit"}{" "}
            {fromCut ? "an offcut from this trim." : "stock in the Cut pool."}
          </p>
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
                </p>
                <p className="small-note">
                  {row.operations.length
                    ? row.operations.join(" · ")
                    : "Fits as measured."}
                </p>
              </li>
            ))}
          </ol>
          {plan.remnants.length > 0 && (
            <>
              <h3>Scraps to keep</h3>
              <ul aria-label="Scraps to keep after these cuts">
                {plan.remnants.map(({ id, label, size }) => (
                  <li key={id}>{label} · {size.map(formatStockLength).join(" × ")}</li>
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
          {fromCut
            ? "These offcuts can stay in the Cut pool for another part."
            : "No rectangular offcuts fit the unassigned wood parts. Check stock type, thickness, grain direction and room for the saw cut."}
        </p>
      )}
    </>
  );
}
