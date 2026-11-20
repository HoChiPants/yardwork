import { useState } from "react";
import { ZodError } from "zod";
import type { HomeDepotPurchaseItem } from "./handoff";
import type { HomeDepotSnapshotBatch } from "./homeDepotStoreSnapshots";
import type { Project } from "./model";

type Draft = { price: string; available: string };
const blankDraft: Draft = { price: "", available: "" };

export function HomeDepotSnapshotPanel({
  project,
  items,
  onRecord,
  onBack,
}: {
  project: Project;
  items: HomeDepotPurchaseItem[];
  onRecord: (batch: HomeDepotSnapshotBatch) => void;
  onBack: () => void;
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
        Enter the price and available purchase units you checked for each
        product. Leave both fields blank to skip a product. Recording selects
        this store and ZIP for the project.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const observations = Object.entries(drafts).flatMap(
              ([productId, draft]) => {
                if (!draft.price && !draft.available) return [];
                if (!draft.price || !draft.available)
                  throw Error(
                    `Enter both price and available units for product ${productId}, or clear both fields.`,
                  );
                return [
                  {
                    productId,
                    price: Number(draft.price),
                    available: Number(draft.available),
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
            Back to purchase list
          </button>
        </div>
      </form>
    </>
  );
}
