import { useState } from "react";
import type { OffcutReleasePlan } from "./offcutReleasePlan";
import { purchaseUnitLabel } from "./purchaseUnits";

type ReleaseChoice = { plan: OffcutReleasePlan } | { error: string };
export type OffcutReleasePreview = Record<OffcutReleasePlan["disposition"], ReleaseChoice>;

export function OffcutReleaseReview({
  preview,
  onApply,
}: {
  preview: OffcutReleasePreview;
  onApply: (plan: OffcutReleasePlan) => void;
}) {
  const [disposition, setDisposition] = useState<OffcutReleasePlan["disposition"]>("return");
  const choice = preview[disposition];
  return (
    <>
      <h2 id="modal-title">Review offcut assignment</h2>
      <label className="field">
        Starting offcut
        <select value={disposition} onChange={(event) =>
          setDisposition(event.target.value === "unavailable" ? "unavailable" : "return")}>
          <option value="return">Still available and uncut</option>
          <option value="unavailable">Missing or used elsewhere</option>
        </select>
      </label>
      {"error" in choice ? (
        <p className="notice">{choice.error}</p>
      ) : (
        <>
          <p className="notice">
            {disposition === "return"
              ? "Return this piece only if the starting offcut is still uncut."
              : "Mark this starting offcut unavailable and return its reservations to the stock plan."}
          </p>
          <p>
            <strong>{choice.plan.offcut}</strong> · {choice.plan.size}
          </p>
          <h3>Parts that will need stock</h3>
          <ul aria-label="Parts that will need stock">
            {choice.plan.targets.map(({ id, text }) => (
              <li key={id}>{text}</li>
            ))}
          </ul>
          <p className="small-note">
            Yardwork will keep the part dimensions and remove remnants from
            these planned cuts.
          </p>
          {choice.plan.purchases.map(({ id, name, before, after, unit }) => (
            <p className="small-note" key={id}>Stock to buy · {name} · {before} → {after} {purchaseUnitLabel(unit, after)}</p>
          ))}
          <button
            className="button primary full"
            type="button"
            onClick={() => onApply(choice.plan)}
          >
            {disposition === "return" ? "Return uncut offcut" : "Mark unavailable and replan"}
          </button>
        </>
      )}
    </>
  );
}
