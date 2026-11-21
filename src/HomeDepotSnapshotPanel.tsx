import { useState } from "react";
import { ZodError } from "zod";
import type { HomeDepotPurchaseItem } from "./handoff";
import type { HomeDepotSnapshotBatch } from "./homeDepotStoreSnapshots";
import type { Project } from "./model";

type Draft = { price: string; available: string; aisle: string; bay: string };
const blankDraft: Draft = { price: "", available: "", aisle: "", bay: "" };

export function HomeDepotSnapshotPanel({
  project,
  items,
  onRecord,
  onBack,
  backLabel = "Back to purchase list",
}: {
  project: Project;
  items: HomeDepotPurchaseItem[];
  onRecord: (batch: HomeDepotSnapshotBatch) => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const [store, setStore] = useState(project.store);
  const [zip, setZip] = useState(project.zip);
  const [when, setWhen] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  function update(id: string, field: keyof Draft, value: string) {
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? blankDraft), [field]: value },
    }));
    setError("");
  }
  return (
    <>
      <h2 id="modal-title">Record Home Depot store snapshots.</h2>
      <p className="small-note">
        Enter the price and available purchase units you checked. Add an aisle
        or area and bay from the Home Depot Product Locator to sort the in-store
        list. Recording selects this store and ZIP for the project.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const observations = Object.entries(drafts).flatMap(
              ([productId, draft]) => {
                const aisle = draft.aisle.trim(), bay = draft.bay.trim();
                if (!draft.price && !draft.available && !aisle && !bay) return [];
                if (!draft.price || !draft.available)
                  throw Error(
                    `Enter both price and available units for product ${productId}, or clear its fields.`,
                  );
                if (bay && !aisle) throw Error(`Enter an aisle or area for product ${productId} before adding a bay.`);
                return [
                  {
                    productId,
                    price: Number(draft.price),
                    available: Number(draft.available),
                    ...(aisle && { location: { aisle, ...(bay && { bay }) } }),
                  },
                ];
              },
            );
            onRecord({
              store,
              zip,
              checkedAt: new Date(when).toISOString(),
              observations,
            });
          } catch (problem) {
            setError(
              problem instanceof ZodError
                ? (problem.issues[0]?.message ?? "Check the snapshot fields.")
                : problem instanceof Error
                  ? problem.message
                  : "The snapshots could not be recorded.",
            );
          }
        }}
      >
        <div className="two-col">
          <label className="field">
            Home Depot store
            <input
              required
              maxLength={80}
              value={store}
              onChange={(event) => setStore(event.target.value)}
            />
          </label>
          <label className="field">
            Store ZIP code
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              value={zip}
              onChange={(event) => setZip(event.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Checked at
          <input
            required
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </label>
        <ul className="handoff-items snapshot-entries">
          {items.map((item) => {
            const id = item.productId;
            const draft = drafts[id] ?? blankDraft;
            return (
              <li key={id}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.name} · #{id}
                </a>
                <span>
                  List needs {item.quantity} {item.unit}
                </span>
                {item.suggested && (
                  <span>
                    Regional listing. Confirm grade, species and treatment.
                  </span>
                )}
                <div className="two-col">
                  <label className="field">
                    Price per purchase unit
                    <input
                      aria-label={`Price per purchase unit for product ${id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      max="100000"
                      value={draft.price}
                      onChange={(event) =>
                        update(id, "price", event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    Available purchase units
                    <input
                      aria-label={`Available purchase units for product ${id}`}
                      type="number"
                      min="0"
                      step="1"
                      max="1000000"
                      value={draft.available}
                      onChange={(event) =>
                        update(id, "available", event.target.value)
                      }
                    />
                  </label>
                </div>
                <details className="handoff-review">
                  <summary>Aisle and bay · optional</summary>
                  <div className="two-col">
                    <label className="field">
                      Aisle or area
                      <input aria-label={`Aisle or area for product ${id}`} maxLength={40}
                        value={draft.aisle} onChange={(event) => update(id, "aisle", event.target.value)} />
                    </label>
                    <label className="field">
                      Bay
                      <input aria-label={`Bay for product ${id}`} maxLength={40}
                        value={draft.bay} onChange={(event) => update(id, "bay", event.target.value)} />
                    </label>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="inline">
          <button type="submit" className="button primary">
            Save store snapshots
          </button>
          <button type="button" className="button secondary" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </form>
    </>
  );
}
