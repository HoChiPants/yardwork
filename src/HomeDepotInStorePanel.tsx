import { useMemo, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { HomeDepotPurchaseItem } from "./handoff";
import {
  compareHomeDepotStores,
  homeDepotStoreChecklist,
  homeDepotStoreList,
  type PickupTarget,
} from "./homeDepotInStore";
import type { Project } from "./model";
import { storeProductLocationText } from "./storeProductLocation";

export function HomeDepotInStorePanel({
  project,
  items,
  recorded,
  onPick,
  onSelectStore,
  onDownload,
  onRecord,
  onBack,
}: {
  project: Project;
  items: HomeDepotPurchaseItem[];
  recorded: number;
  onPick: (target: PickupTarget, quantity: number) => void;
  onSelectStore: (store: string) => void;
  onDownload: (text: string) => void;
  onRecord: () => void;
  onBack: () => void;
}) {
  const [remainingOnly, setRemainingOnly] = useState(false);
  const [stockOnly, setStockOnly] = useState(false);
  const [error, setError] = useState("");
  const list = homeDepotStoreList(project, items);
  const stores = useMemo(() => compareHomeDepotStores(project, items), [project, items]);
  const { store, zip } = project;
  const canPick = !!store.trim();
  return (
    <>
      <h2 id="modal-title">Shop in store</h2>
      <p>
        {store ? `Store ${store} · ` : ""}ZIP {zip}.
      </p>
      <p role="status">
        {list.pickedLines} of {list.totalLines} product lines picked.
      </p>
      {recorded > 0 && (
        <p className="small-note">
          {recorded} store {recorded === 1 ? "snapshot" : "snapshots"} recorded.
        </p>
      )}
      {!canPick && (
        <p>
          Record a store snapshot or choose a store in Project settings to track
          pickup.
        </p>
      )}
      {!list.totalLines && (
        <p>
          Match products in the purchase list to add them to this checklist.
        </p>
      )}
      {!!items.length && stores.some(({ store: candidate }) => candidate !== store) && (
        <details className="handoff-review">
          <summary>Compare recorded stores</summary>
          <p className="small-note">
            Recent snapshots in ZIP {zip} for the quantities you still need.
          </p>
          <ul className="handoff-items" aria-label="Stock comparison by store">
            {stores.map(({ store: candidate, covered, short, unchecked }) => (
              <li key={candidate}>
                <strong>Store {candidate}{candidate === store ? " · Selected" : ""}</strong>
                <span>{list.pickedLines === list.totalLines
                  ? "All listed products picked"
                  : `${covered} covered · ${short} short · ${unchecked} unchecked`}</span>
                {candidate !== store && (
                  <button type="button" className="button secondary small" onClick={() => {
                    onSelectStore(candidate);
                    setError("");
                  }}>Use store {candidate}</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="inline">
        <button
          className="button secondary small"
          type="button"
          disabled={!list.totalLines}
          onClick={onRecord}
        >
          Record store snapshots
        </button>
        <label className="shop-remaining">
          <input
            type="checkbox"
            checked={remainingOnly}
            onChange={(event) => setRemainingOnly(event.target.checked)}
          />
          Show remaining only
        </label>
        {(list.stockChecks > 0 || stockOnly) && (
          <button type="button" className="button secondary small" aria-pressed={stockOnly}
            onClick={() => setStockOnly(!stockOnly)}>
            Check stock ({list.stockChecks})
          </button>
        )}
      </div>
      {list.groups.map(({ key, title, rows }) => {
        const shown = stockOnly ? rows.filter(({ availability }) =>
          availability.state === "short" || availability.state === "unchecked")
          : remainingOnly ? rows.filter(({ remaining }) => remaining > 0) : rows;
        if (!shown.length) return null;
        return (
          <section key={key} className="shop-aisle" aria-label={title}>
            <h3>{title}</h3>
            <ul className="handoff-items" aria-label={`Products · ${title}`}>
              {shown.map((row) => (
                <li key={row.productId}>
                  <a href={row.url} target="_blank" rel="noreferrer">
                    {row.name} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  <span>
                    {row.quantity} {row.unit} · #{row.productId}
                    {row.isTool ? " · Tool purchase" : ""}
                  </span>
                  {row.suggested && (
                    <span>
                      Regional listing · Confirm grade, species and treatment
                    </span>
                  )}
                  {row.snapshot && (
                    <span
                      className={
                        row.availability.state === "short"
                          ? "handoff-short"
                          : ""
                      }
                    >
                      {row.snapshot.location && (
                        <>
                          {storeProductLocationText(row.snapshot.location)}{" "}
                          ·{" "}
                        </>
                      )}
                      {row.snapshot.available} in snapshot ·{" "}
                      <time dateTime={row.snapshot.checkedAt}>
                        {new Date(row.snapshot.checkedAt).toLocaleDateString()}
                      </time>
                      {row.availability.state === "short" && ` · Short by ${row.availability.units}`}
                    </span>
                  )}
                  {row.availability.state === "unchecked" && <span>No recent store snapshot</span>}
                  <div className="inline shop-pick">
                    {canPick && row.editLimit > 0 && (
                      <PickupQuantity
                        key={JSON.stringify([store, zip, row.productId])}
                        productId={row.productId}
                        picked={row.picked}
                        target={row.targetHere}
                        limit={row.editLimit}
                        onPick={(picked) => {
                          try {
                            onPick(
                              { store, zip, productId: row.productId },
                              picked,
                            );
                            setError("");
                          } catch (problem) {
                            setError(
                              problem instanceof Error
                                ? problem.message
                                : "Could not update the pickup count.",
                            );
                          }
                        }}
                      />
                    )}
                    {row.pickedElsewhere > 0 && (
                      <span>{row.pickedElsewhere} picked elsewhere</span>
                    )}
                    <span>{row.remaining} remaining</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {stockOnly && !list.stockChecks && <p>No outstanding stock checks in this view.</p>}
      {!stockOnly && remainingOnly &&
        list.totalLines > 0 &&
        list.pickedLines === list.totalLines && (
          <p>All listed items are marked picked.</p>
        )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="inline">
        <button
          className="button secondary"
          type="button"
          disabled={!list.totalLines}
          onClick={() => onDownload(homeDepotStoreChecklist(project, list))}
        >
          <Download size={15} /> Download store checklist
        </button>
        <button className="button secondary" type="button" onClick={onBack}>
          Back to purchase list
        </button>
      </div>
      <a
        className="download-example"
        href="https://www.homedepot.com/c/ai/find-everything-you-need-inside-the-home-depot-store/9ba683603be9fa5395fab901c3a65572"
        target="_blank"
        rel="noreferrer"
      >
        Verify locations in Home Depot’s Product Locator{" "}
        <ExternalLink size={13} />
      </a>
    </>
  );
}

function PickupQuantity({
  productId,
  picked,
  target,
  limit,
  onPick,
}: {
  productId: string;
  picked: number;
  target: number;
  limit: number;
  onPick: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const label = `Picked purchase units for product ${productId}`;
  const complete = picked >= target;
  return (
    <>
      <label>
        Picked here
        <input
          aria-label={label}
          type="number"
          step={1}
          min={0}
          max={limit}
          value={draft ?? picked}
          inputMode="numeric"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === undefined) return;
            if (draft.trim()) onPick(Number(draft));
            setDraft(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            else if (event.key === "Escape") setDraft(undefined);
          }}
        />
      </label>
      <button
        className="text-button"
        type="button"
        aria-label={`${complete ? "Clear picked quantity" : "Mark picked"} for product ${productId}`}
        onClick={() => {
          setDraft(undefined);
          onPick(complete ? 0 : target);
        }}
      >
        {complete ? "Clear" : "Mark picked"}
      </button>
    </>
  );
}
