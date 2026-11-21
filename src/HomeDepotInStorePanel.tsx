import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { HomeDepotPurchaseItem } from "./handoff";
import {
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
  onDownload,
  onRecord,
  onBack,
}: {
  project: Project;
  items: HomeDepotPurchaseItem[];
  recorded: number;
  onPick: (target: PickupTarget, quantity: number) => void;
  onDownload: (text: string) => void;
  onRecord: () => void;
  onBack: () => void;
}) {
  const [remainingOnly, setRemainingOnly] = useState(false);
  const [error, setError] = useState("");
  const list = homeDepotStoreList(project, items);
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
      </div>
      {list.groups.map(({ key, title, rows }) => {
        const shown = remainingOnly
          ? rows.filter(({ remaining }) => remaining > 0)
          : rows;
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
                        row.snapshot.available < row.remaining
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
                    </span>
                  )}
                  {canPick && (
                    <div className="inline shop-pick">
                      <PickupQuantity
                        key={JSON.stringify([store, zip, row.productId])}
                        productId={row.productId}
                        picked={row.picked}
                        quantity={row.quantity}
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
                      <span>{row.remaining} remaining</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {remainingOnly &&
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
  quantity,
  onPick,
}: {
  productId: string;
  picked: number;
  quantity: number;
  onPick: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const label = `Picked purchase units for product ${productId}`;
  return (
    <>
      <label>
        Picked
        <input
          aria-label={label}
          type="number"
          step={1}
          min={0}
          max={quantity}
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
        aria-label={`${picked === quantity ? "Clear picked quantity" : "Mark picked"} for product ${productId}`}
        onClick={() => {
          setDraft(undefined);
          onPick(picked === quantity ? 0 : quantity);
        }}
      >
        {picked === quantity ? "Clear" : "Mark picked"}
      </button>
    </>
  );
}
