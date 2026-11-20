import type { OffcutReleasePlan } from "./offcutReleasePlan";
import { purchaseUnitLabel } from "./purchaseUnits";

export type OffcutReleasePreview =
  { plan: OffcutReleasePlan } | { error: string };

export function OffcutReleaseReview({
  preview,
  onApply,
}: {
  preview: OffcutReleasePreview;
  onApply: (plan: OffcutReleasePlan) => void;
}) {
  return (
    <>
      <h2 id="modal-title">Review offcut assignment</h2>
      {"error" in preview ? (
        <p className="notice">{preview.error}</p>
      ) : (
        <>
          <p className="notice">
            Return this piece only if the starting offcut is still uncut.
          </p>
          <p>
            <strong>{preview.plan.offcut}</strong> · {preview.plan.size}
          </p>
          <h3>Parts that will need stock</h3>
          <ul aria-label="Parts that will need stock">
            {preview.plan.targets.map(({ id, text }) => (
              <li key={id}>{text}</li>
            ))}
          </ul>
          <p className="small-note">
            Yardwork will keep the part dimensions and remove remnants from
            these planned cuts.
          </p>
          {preview.plan.purchase && (
            <p className="small-note">
              Stock to buy · {preview.plan.purchase.name} ·{" "}
              {preview.plan.purchase.before} → {preview.plan.purchase.after}{" "}
              {purchaseUnitLabel(
                preview.plan.purchase.unit,
                preview.plan.purchase.after,
              )}
            </p>
          )}
          <button
            className="button primary full"
            type="button"
            onClick={() => onApply(preview.plan)}
          >
            Return uncut offcut
          </button>
        </>
      )}
    </>
  );
}
