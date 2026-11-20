import { useState } from "react";
import type { Project } from "./model";
import {
  paslodeFinishNailer as nailer,
  paslodeFinishNails as nails,
} from "./paslodeFinishReference";
import { purchaseUnitLabel } from "./purchaseUnits";
import { addSaunaNailBoxes, saunaNailBoxPlan } from "./saunaLiningPurchases";
import { addSupply } from "./supplies";
import { maxSupplyQuantity } from "./supplySchema";

const maxNails = maxSupplyQuantity * nails.packCount;

export function SaunaLiningPurchasePanel({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const [count, setCount] = useState("");
  const [error, setError] = useState("");
  const entered = Number(count);
  const plan =
    Number.isSafeInteger(entered) && entered > 0 && entered <= maxNails
      ? saunaNailBoxPlan(project, entered)
      : null;
  const nailerSelected = project.supplies.some(
    (row) => row.productId === nailer.id,
  );
  const apply = (next: () => Project) => {
    setError("");
    try {
      onChange(next());
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The purchase could not be added.",
      );
    }
  };
  return (
    <details className="field-section">
      <summary>Sauna lining nails and nailer</summary>
      <p className="small-note">
        Check backing and fastener fit first. Enter your project’s total for
        this nail model after subtracting usable nails already on hand.
      </p>
      <a href={nails.listing} target="_blank" rel="noreferrer">
        Paslode 650282 at Home Depot · 2,000 per box
      </a>
      <label className="field">
        Finish nails needed from new boxes
        <input
          type="number"
          min="1"
          max={maxNails}
          step="1"
          value={count}
          aria-invalid={!!count && !plan}
          onChange={(event) => {
            setCount(event.target.value);
            setError("");
          }}
        />
      </label>
      {count && !plan && (
        <p className="small-note">
          Enter a positive whole number within the shopping list limit.
        </p>
      )}
      {plan && (
        <p className="small-note" role="status">
          {plan.boxes} {purchaseUnitLabel("box", plan.boxes)} needed ·{" "}
          {plan.selected} on shopping list.
        </p>
      )}
      <button
        type="button"
        className="button secondary full"
        disabled={!plan?.missing}
        onClick={() => apply(() => addSaunaNailBoxes(project, entered))}
      >
        Add missing nail boxes
      </button>
      <p className="small-note">
        <a href={nailer.listing} target="_blank" rel="noreferrer">
          Paslode 515500 at Home Depot
        </a>
        . The pneumatic nailer needs a separate air supply and hose.
      </p>
      {nailerSelected ? (
        <p className="small-note">Finish nailer on shopping list.</p>
      ) : (
        <button
          type="button"
          className="button secondary full"
          onClick={() =>
            apply(() => addSupply(project, nailer.id, 1, "Sauna cedar lining"))
          }
        >
          Add finish nailer to list
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
