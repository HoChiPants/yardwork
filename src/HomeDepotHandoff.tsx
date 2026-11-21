import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
} from "lucide-react";
import { bom } from "./engine";
import {
  homeDepotHandoff,
  homeDepotShoppingList,
  retailerHandoff,
} from "./handoff";
import { retailerName } from "./retailers";
import { homeDepotAssemblyPurchaseReview } from "./handoffPurchases";
import type { Project } from "./model";
import { supplyRows } from "./supplies";
import type { HomeDepotSnapshotBatch } from "./homeDepotStoreSnapshots";
import { HomeDepotSnapshotPanel } from "./HomeDepotSnapshotPanel";
import { HomeDepotInStorePanel } from "./HomeDepotInStorePanel";
import type { PickupTarget } from "./homeDepotInStore";
import { storeProductLocationText } from "./storeProductLocation";

type HandoffProps = {
  project: Project;
  inventoryTick: number;
  onDownload: (text: string) => void;
  onDownloadStoreChecklist: (text: string) => void;
  onPick: (target: PickupTarget, quantity: number) => void;
  onAddPurchase: (productId: string) => void;
  onRecordSnapshots: (batch: HomeDepotSnapshotBatch) => void;
  onReview: (area: "list" | "tools" | "assembly") => void;
};

export function HomeDepotHandoff(props: HandoffProps) {
  return props.project.retailer === "lowes" ? (
    <RetailerChecklist {...props} />
  ) : (
    <HomeDepotShoppingHandoff {...props} />
  );
}

function HomeDepotShoppingHandoff({
  project,
  inventoryTick,
  onDownload,
  onDownloadStoreChecklist,
  onPick,
  onAddPurchase,
  onRecordSnapshots,
  onReview,
}: HandoffProps) {
  const { items, onHand, reviews, plannedNeeds, toolReview, text } = useMemo(
    () => homeDepotShoppingList(project),
    [project, inventoryTick],
  );
  const assemblyReview = useMemo(() => homeDepotAssemblyPurchaseReview(project), [project]);
  const toolReviewCount = toolReview.required.length + toolReview.conditional.length;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"purchase" | "snapshots" | "in-store">("purchase");
  const [snapshotFrom, setSnapshotFrom] = useState<"purchase" | "in-store">("purchase");
  const [recorded, setRecorded] = useState(0);
  function record(from: "purchase" | "in-store") {
    setRecorded(0);
    setCopied(false);
    setError("");
    setSnapshotFrom(from);
    setView("snapshots");
  }
  if (view === "snapshots")
    return <HomeDepotSnapshotPanel project={project} items={items} onBack={() => setView(snapshotFrom)}
      backLabel={snapshotFrom === "in-store" ? "Back to store checklist" : undefined}
      onRecord={(batch) => {
        onRecordSnapshots(batch);
        setRecorded(batch.observations.length);
        setView(snapshotFrom);
      }} />;
  if (view === "in-store")
    return <HomeDepotInStorePanel project={project} items={items} recorded={recorded}
      onPick={onPick} onDownload={onDownloadStoreChecklist}
      onRecord={() => record("in-store")} onBack={() => setView("purchase")} />;
  return (
    <>
      <h2 id="modal-title">Take your list to Home Depot.</h2>
      <p>
        {project.store ? `Store ${project.store} · ` : "No store selected · "}
        ZIP {project.zip}. Check current stock before ordering.
      </p>
      {recorded > 0 && <p className="small-note" role="status">
        {recorded} store {recorded === 1 ? "snapshot" : "snapshots"} recorded.
      </p>}
      {assemblyReview.scopeNotes.length > 0 && (
        <details className="handoff-review" open>
          <summary>Build systems to review</summary>
          <ul aria-label="Build systems to review">
            {assemblyReview.scopeNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </details>
      )}
      {assemblyReview.connections.length > 0 && (
        <details className="handoff-review">
          <summary>{assemblyReview.connections.length} assembly connection {assemblyReview.connections.length === 1 ? "review" : "reviews"}</summary>
          <ul className="handoff-items" aria-label="Assembly connections to review">
            {assemblyReview.connections.map(({ id, title, detail }) => (
              <li key={id}><strong>{title}</strong><span>{detail}</span></li>
            ))}
          </ul>
          <button type="button" className="text-button" onClick={() => onReview("assembly")}>
            Review assembly connections
          </button>
        </details>
      )}
      {items.length > 0 && (
        <div className="inline">
          <button type="button" className="button secondary small" onClick={() => setView("in-store")}>
            Shop in store
          </button>
          <button type="button" className="button secondary small" onClick={() => record("purchase")}>
            Record store snapshots
          </button>
        </div>
      )}
      {plannedNeeds.length > 0 && (
        <details className="handoff-review" open>
          <summary>
            {plannedNeeds.length} planned{" "}
            {plannedNeeds.length === 1 ? "purchase" : "purchases"} to review
          </summary>
          <ul
            className="handoff-items"
            aria-label="Planned purchases to review"
          >
            {plannedNeeds.map((need) => (
              <li key={need.id}>
                <strong>{need.name}</strong>
                <span>
                  {need.basis}
                  {need.missing === null
                    ? ""
                    : ` · ${need.quantityText} to select`}
                </span>
                {need.issue && <span>{need.issue}</span>}
                {need.canAdd && (
                  <button
                    type="button"
                    className="button secondary small"
                    aria-label={`Add ${need.quantityText} of ${need.name}`}
                    onClick={() => {
                      onAddPurchase(need.id);
                      setCopied(false);
                    }}
                  >
                    Add {need.quantityText}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {plannedNeeds.some((need) => need.issue) && (
            <button
              type="button"
              className="text-button"
              onClick={() => onReview("list")}
            >
              Review materials in List
            </button>
          )}
        </details>
      )}
      {toolReviewCount > 0 && (
        <>
          <details className="handoff-review">
            <summary>{toolReviewCount} tool {toolReviewCount === 1 ? "capability" : "capabilities"} to review</summary>
            {toolReview.required.length > 0 && (
              <ul className="handoff-items" aria-label="Tool capabilities to check">
                {toolReview.required.map(({ capability, name }) => <li key={capability}>{name}</li>)}
              </ul>
            )}
            {toolReview.conditional.length > 0 && (
              <>
                <p className="small-note">Tools to check for the chosen method</p>
                <ul className="handoff-items" aria-label="Tools for the chosen method">
                  {toolReview.conditional.map(({ capability, name, condition }) => (
                    <li key={capability}><strong>{name}</strong>{condition && <span>{condition}</span>}</li>
                  ))}
                </ul>
              </>
            )}
          </details>
          <button
            type="button"
            className="text-button"
            onClick={() => onReview("tools")}
          >
            Review tools
          </button>
        </>
      )}
      {onHand.length > 0 && (
        <details className="handoff-review">
          <summary>Stock on hand</summary>
          <ul>
            {onHand.map(({ id, name, quantity }) => (
              <li key={id}>{quantity} {quantity === 1 ? "source" : "sources"} · {name}</li>
            ))}
          </ul>
        </details>
      )}
      {items.length > 0 ? (
        <>
          <ul className="handoff-items" aria-label="Home Depot purchase review">
            {items.map(
              ({
                productId,
                name,
                quantity,
                unit,
                url,
                snapshot,
                suggested,
                isTool,
              }) => (
                <li key={productId}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {name} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  <span>
                    {quantity} {unit} · #{productId}
                    {isTool ? " · Tool purchase" : ""}
                  </span>
                  {suggested && (
                    <span>
                      Regional listing · Confirm grade, species and treatment
                    </span>
                  )}
                  <span
                    className={
                      snapshot && snapshot.available < quantity
                        ? "handoff-short"
                        : ""
                    }
                  >
                    {snapshot == null
                      ? "No recent store snapshot"
                      : snapshot.available < quantity
                        ? `Short by ${quantity - snapshot.available} in snapshot`
                        : `${snapshot.available} available in snapshot`}
                    {snapshot && (
                      <>
                        {" · "}{snapshot.price.toLocaleString("en-US", { style: "currency", currency: "USD" })} per purchase unit{" · "}
                        <time dateTime={snapshot.checkedAt}>
                          {new Date(snapshot.checkedAt).toLocaleDateString()}
                        </time>
                      </>
                    )}
                  </span>
                  {!!snapshot?.location && <span>{storeProductLocationText(snapshot.location)}</span>}
                </li>
              ),
            )}
          </ul>
          <label className="field">
            Home Depot paste list
            <textarea
              ref={textarea}
              rows={3}
              readOnly
              value={text}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        </>
      ) : (
        <p>
          {onHand.length
            ? "The current list has no products to copy."
            : "No products ready to copy. Match exact products in List to get started."}
        </p>
      )}
      {reviews.length > 0 && (
        <details className="handoff-review">
          <summary>
            {reviews.length}{" "}
            {reviews.length === 1 ? "item needs" : "items need"} separate review
          </summary>
          <ul>
            {reviews.map(({ name, reason }, index) => (
              <li key={index}>
                <strong>{name}</strong> · {reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="inline">
        <button
          className="button primary"
          disabled={!text}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setError("");
            } catch {
              textarea.current?.focus();
              textarea.current?.select();
              setError(
                "Clipboard access was blocked. Use your keyboard to copy the selected list.",
              );
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "List copied" : "Copy Home Depot list"}
        </button>
        <button
          className="button secondary"
          onClick={() => onDownload(homeDepotHandoff(project))}
        >
          <Download size={15} /> Download full checklist
        </button>
      </div>
      <p className="small-note">
        In Home Depot Pro Xtra, open My Account → Lists. Create a list, choose
        Add Materials → Paste an Existing List, and review the draft products
        and quantities. Move the reviewed list into a Project from Pro Xtra.
      </p>
      <a
        className="download-example"
        href="https://www.homedepot.com/c/create-a-list"
        target="_blank"
        rel="noreferrer"
      >
        Open Home Depot’s list instructions <ExternalLink size={13} />
      </a>
      <a className="download-example" href="https://www.homedepot.com/c/create-a-project" target="_blank" rel="noreferrer">
        Open Home Depot’s project instructions <ExternalLink size={13} />
      </a>
    </>
  );
}

function RetailerChecklist({ project, onDownload }: HandoffProps) {
  const text = useMemo(() => retailerHandoff(project), [project]),
    rows = useMemo(() => bom(project), [project]);
  const textarea = useRef<HTMLTextAreaElement>(null),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const unresolved = rows.reduce((n, r) => n + r.oversize, 0),
    hasQuantities =
      rows.some((r) => r.quantity > 0) ||
      supplyRows(project).some((r) => r.quantity > 0);
  return (
    <>
      <h2 id="modal-title">
        Take your list to {retailerName(project.retailer)}.
      </h2>
      <>
        <p>
          Copy or download this material checklist and review the exact products
          at your selected Lowe's store. Native Lowe's list import and account
          synchronization have not been verified.
        </p>
        <a
          className="download-example"
          href="https://www.lowes.com"
          target="_blank"
          rel="noreferrer"
        >
          Open Lowe's <ExternalLink size={13} />
        </a>
      </>
      {unresolved > 0 && (
        <div className="notice stock-incomplete">
          <AlertTriangle size={17} />
          <p>
            {unresolved} part(s) exceed the modeled stock. They are listed
            separately and excluded from the purchase quantities. Resolve them
            before ordering.
          </p>
        </div>
      )}
      {!hasQuantities && (
        <p className="small-note">
          Add fitting materials to create a purchase list.
        </p>
      )}
      <label className="field">
        Prepared material list
        <textarea
          ref={textarea}
          aria-label={`${retailerName(project.retailer)} material list`}
          rows={13}
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="inline">
        <button
          className="button primary"
          disabled={!hasQuantities && !unresolved}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setError("");
            } catch {
              textarea.current?.focus();
              textarea.current?.select();
              setError(
                "Clipboard access was blocked. The list is selected; copy it with your keyboard or download it.",
              );
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
          {copied ? "List copied" : "Copy material list"}
        </button>
        <button className="button secondary" onClick={() => onDownload(text)}>
          <Download size={15} />
          Download text
        </button>
      </div>
      <div className="notice">
        <Info size={16} />
        <p>
          This copies or downloads text. It does not sign in, create a retailer
          project, or submit an order. Home Depot’s draft still needs your
          review.
        </p>
      </div>
    </>
  );
}
