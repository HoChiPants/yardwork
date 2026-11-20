import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Plus, Trash2 } from "lucide-react";
import type { Project } from "./model";
import type { SupplySelection } from "./supplySchema";
import { retailerName } from "./retailers";
import {
  addSupply,
  parseSupplyInventory,
  recordSupplyInventory,
  supplyProducts,
  purchaseDefinition,
  supplyRows,
  formatSupplyContent,
} from "./supplies";
import { pricingCoverage } from "./pricing";
import { mergeStoreSnapshots } from "./storeSnapshotFiles";

type SupplyRow = ReturnType<typeof supplyRows>[number];
type SelectionPatch = Partial<
  Pick<SupplySelection, "quantity" | "purpose" | "note">
>;
const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const localTime = (value = new Date().toISOString()) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const wholePacks = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 100000
    ? number
    : null;
};
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function SelectionEditor({
  selection,
  name,
  onUpdate,
  onRemove,
}: {
  selection: SupplySelection;
  name: string;
  onUpdate: (patch: SelectionPatch) => void;
  onRemove: () => void;
}) {
  const [quantity, setQuantity] = useState(String(selection.quantity));
  useEffect(
    () => setQuantity(String(selection.quantity)),
    [selection.quantity],
  );
  const valid = wholePacks(quantity) !== null;
  return (
    <div className="section-description supply-selection">
      <label className="field">
        Purchase packs
        <input
          aria-label={`Purchase packs for ${name}`}
          type="number"
          min="1"
          max="100000"
          step="1"
          value={quantity}
          aria-invalid={!valid}
          onChange={(event) => {
            setQuantity(event.target.value);
            const next = wholePacks(event.target.value);
            if (next !== null) onUpdate({ quantity: next });
          }}
          onBlur={() => {
            if (!valid) setQuantity(String(selection.quantity));
          }}
        />
        {!valid && (
          <small>Enter a whole purchase count from 1 to 100,000.</small>
        )}
      </label>
      <label className="field">
        Purpose
        <input
          aria-label={`Supply purpose for ${name}`}
          maxLength={80}
          placeholder="For example, seat lid hinge"
          value={selection.purpose}
          onChange={(event) => onUpdate({ purpose: event.target.value })}
        />
      </label>
      <label className="field">
        Usage note
        <textarea
          aria-label={`Supply note for ${name}`}
          maxLength={1000}
          rows={2}
          placeholder="Placement, quantity assumptions or installation questions"
          value={selection.note}
          onChange={(event) => onUpdate({ note: event.target.value })}
        />
      </label>
      <button
        type="button"
        className="text-button"
        aria-label={`Remove supply purchase ${name}`}
        onClick={onRemove}
      >
        <Trash2 size={13} /> Remove purchase
      </button>
    </div>
  );
}

export function SuppliesPanel({
  project,
  onChange,
  kind = "supplies",
}: {
  project: Project;
  onChange: (project: Project) => void;
  kind?: "supplies" | "tools";
}) {
  const tools = kind === "tools";
  const products = useMemo(
    () => supplyProducts(project.retailer, kind),
    [project.retailer, kind],
  );
  // Parent inventoryTick rerenders this panel; re-evaluate snapshot freshness each time.
  const rows = supplyRows(project).filter((row) => row.isTool === tools);
  const [productId, setProductId] = useState(() => products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [addError, setAddError] = useState("");
  const [message, setMessage] = useState("");
  const [snapshotProductId, setSnapshotProductId] = useState<string | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState({
    price: "",
    available: "",
    store: project.store,
    zip: project.zip,
    checkedAt: localTime(),
    url: "",
  });
  const [snapshotError, setSnapshotError] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  useEffect(() => {
    if (!products.some((product) => product.id === productId))
      setProductId(products[0]?.id ?? "");
  }, [products, productId]);
  useEffect(() => {
    // A store switch must not record a stale form against a different retailer offer.
    setSnapshotProductId(null);
    setSnapshotError("");
    setMessage("");
  }, [project.retailer, project.store, project.zip]);
  const snapshotRow =
    rows.find((row) => row.productId === snapshotProductId) ?? null;
  const packs = wholePacks(quantity);
  const selectedDefinition = purchaseDefinition(productId);
  const supplyPricing = pricingCoverage({
    materials: [],
    supplies: rows.map((row) => ({
      id: row.productId,
      name: row.name,
      quantity: row.quantity,
      purchaseUnit: row.purchaseUnit,
      priceSource: row.total === null ? "unknown" : "snapshot",
      total: row.total,
    })),
  }).supplies;

  function updateSelection(id: string, patch: SelectionPatch) {
    onChange({
      ...project,
      supplies: project.supplies.map((selection) =>
        selection.id === id ? { ...selection, ...patch } : selection,
      ),
    });
  }
  function removeSelection(id: string) {
    onChange({
      ...project,
      supplies: project.supplies.filter((selection) => selection.id !== id),
    });
  }
  function openSnapshot(row: SupplyRow) {
    if (!row.offer || !row.storeSnapshotEligible) return;
    setSnapshotProductId(row.productId);
    setSnapshotError("");
    setMessage("");
    setSnapshot({
      price: row.inventory ? String(row.inventory.price) : "",
      available: row.inventory ? String(row.inventory.available) : "",
      store: project.store,
      zip: project.zip,
      checkedAt: row.inventory
        ? localTime(row.inventory.checkedAt)
        : localTime(),
      url: row.offer.url,
    });
  }
  async function readSnapshotFile(file: File | undefined) {
    if (!file) return;
    setImportError("");
    setImportMessage("");
    try {
      if (file.size > 1000000)
        throw Error("Choose a snapshot JSON file smaller than 1 MB.");
      setImportText(await file.text());
    } catch (error) {
      setImportError(errorText(error, "The snapshot file could not be read."));
    }
  }

  if (tools && !rows.length) return null;
  return (
    <details className="supplies-panel" data-purchase-kind={kind}>
      <summary>
        {tools ? "Tools to buy" : "Hardware and supplies"} · {rows.length}{" "}
        selected {tools && rows.length === 1 ? "product" : "products"}
      </summary>
      <p className="small-note">
        {tools
          ? "Selected tool purchases have their own subtotal. Review the operation and actual tool setup in Tools."
          : "Choose purchase quantities for hinges, supports and other supplies. Shopping selections leave installation, fit and attachment requirements open."}
      </p>
      <form
        className="supply-add"
        onSubmit={(event) => {
          event.preventDefault();
          setAddError("");
          setMessage("");
          try {
            if (packs === null)
              throw Error(
                "Enter a whole number of purchase packs from 1 to 100,000.",
              );
            onChange(addSupply(project, productId, packs, purpose, note));
            setMessage(
              `Added ${packs} purchase ${packs === 1 ? "pack" : "packs"}.`,
            );
            setPurpose("");
            setNote("");
          } catch (error) {
            setAddError(errorText(error, "The supply could not be added."));
          }
        }}
      >
        <label className="field">
          Reviewed {tools ? "tool" : "supply"} at{" "}
          {retailerName(project.retailer)}
          <select
            aria-label={tools ? "Choose a tool to buy" : "Choose a supply"}
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setAddError("");
            }}
          >
            {!products.length && (
              <option value="">
                No reviewed {tools ? "tool" : "supply"} offers
              </option>
            )}
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        {selectedDefinition && (
          <p className="small-note">
            Each {selectedDefinition.purchaseUnit}:{" "}
            {selectedDefinition.contents.map(formatSupplyContent).join("; ")}.
          </p>
        )}
        <label className="field">
          Purchase packs to add
          <input
            aria-label="Supply purchase packs to add"
            type="number"
            min="1"
            max="100000"
            step="1"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <details>
          <summary>Purpose and usage note</summary>
          <label className="field">
            Purpose
            <input
              aria-label="New supply purpose"
              maxLength={80}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>
          <label className="field">
            Usage note
            <textarea
              aria-label="New supply note"
              maxLength={1000}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </details>
        <button
          type="submit"
          className="button secondary full"
          disabled={!productId || packs === null || !products.length}
        >
          <Plus size={14} /> {tools ? "Add tool purchase" : "Add supply"}
        </button>
        {addError && (
          <p className="form-error" role="alert">
            {addError}
          </p>
        )}
        {message && (
          <p className="small-note" role="status">
            {message}
          </p>
        )}
      </form>

      {rows.length > 0 && (
        <p
          className="small-note"
          data-testid={
            tools ? "tool-pricing-coverage" : "supply-pricing-coverage"
          }
          data-observed-supply-subtotal={
            supplyPricing.pricedSubtotal ?? "unknown"
          }
        >
          {supplyPricing.pricedSubtotal === null
            ? `No observed ${tools ? "tool" : "supply"} subtotal`
            : `${money(supplyPricing.pricedSubtotal)} observed ${tools ? "tool" : "supply"} subtotal`}
          {` · ${supplyPricing.observedLineCount} observed ${supplyPricing.observedLineCount === 1 ? "product line" : "product lines"}`}
          {supplyPricing.unpricedLineCount
            ? ` · ${supplyPricing.unpricedLineCount} unpriced ${supplyPricing.unpricedLineCount === 1 ? "product line" : "product lines"} (${supplyPricing.unpricedPurchaseUnits.map(({ unit, quantity }) => `${quantity} × ${unit}`).join("; ")} purchase units)`
            : ""}
          . Unknown prices are excluded, not free. Prices and stock use matching
          store observations checked within 24 hours; this is not a complete
          quote.
        </p>
      )}
      {rows.map((row) => (
        <div
          key={row.productId}
          className="section-description supply-row"
          data-supply-product-id={row.productId}
        >
          <strong>{row.name}</strong>
          <p className="small-note">
            {row.quantity.toLocaleString()} × {row.purchaseUnit}
            {row.total === null
              ? " · Unpriced"
              : ` · ${money(row.total)} observed subtotal`}
            {row.unresolved ? " · Unresolved saved selection" : ""}
          </p>
          <p className="small-note">
            {row.isTool
              ? "Package highlights: "
              : "Each purchase pack contains: "}
            {row.contents.length
              ? row.contents.map(formatSupplyContent).join("; ")
              : "contents unresolved"}
            .
          </p>
          {row.purchaseSpec?.kind === "mass" && (
            <p className="small-note" data-testid="mass-purchase-contents">
              Selected boxes: {row.quantity * row.purchaseSpec.amount}{" "}
              {row.purchaseSpec.unit} advertised in total. Exact piece count is
              unknown; no nail-count, coverage or spare-piece credit is
              inferred.
            </p>
          )}
          {!row.isTool && row.purchaseSpec?.kind === "counted" && (
            <p className="small-note" data-testid="counted-purchase-contents">
              Selected packs contain {row.quantity * row.purchaseSpec.count}{" "}
              counted items. This is pack content, not verified on-hand stock or
              installed coverage.
            </p>
          )}
          {row.offer && (
            <p className="small-note">
              <a href={row.offer.url} target="_blank" rel="noreferrer">
                {retailerName(project.retailer)} product {row.offer.productId}{" "}
                <ExternalLink size={11} />
              </a>
              <br />
              Seller: {row.offer.seller}
            </p>
          )}
          {row.inventory && (
            <p className="small-note">
              {row.inventory.available.toLocaleString()} purchase packs reported
              available · {money(row.inventory.price)} per purchase pack.
              <br />
              Checked {new Date(row.inventory.checkedAt).toLocaleString()} ·
              store {row.inventory.store} · ZIP {row.inventory.zip}.
            </p>
          )}
          {row.issues.length > 0 && (
            <div className="notice warning">
              <AlertTriangle size={14} />
              <ul>
                {row.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>
              Edit purchase quantities and usage · {row.selections.length}{" "}
              records
            </summary>
            {row.selections.map((selection, index) => (
              <SelectionEditor
                key={selection.id}
                selection={selection}
                name={`${row.name}${row.selections.length > 1 ? ` · purchase ${index + 1}` : ""}`}
                onUpdate={(patch) => updateSelection(selection.id, patch)}
                onRemove={() => removeSelection(selection.id)}
              />
            ))}
          </details>
          <details>
            <summary>
              Fit, installation and sources · {row.requirements.length}{" "}
              requirements
            </summary>
            {row.requirements.length > 0 && (
              <ul className="small-note">
                {row.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            )}
            {row.product && (
              <p className="small-note">
                {row.product.manufacturer} ·{" "}
                {row.product.manufacturerPartNumber ??
                  "Product identity needs review"}
              </p>
            )}
            {row.product?.sources.map((source, index) => (
              <p key={source.url} className="small-note">
                <a href={source.url} target="_blank" rel="noreferrer">
                  Specification source {index + 1} <ExternalLink size={11} />
                </a>{" "}
                {source.note}
              </p>
            ))}
          </details>
          {row.offer && row.storeSnapshotEligible && (
            <button
              type="button"
              className="text-button"
              aria-label={`Record supply snapshot for ${row.name}`}
              onClick={() => openSnapshot(row)}
            >
              Record store snapshot
            </button>
          )}
        </div>
      ))}
      {!rows.length && <p className="small-note">No supplies selected yet.</p>}

      {snapshotRow?.offer && snapshotRow.storeSnapshotEligible && (
        <form
          className="supply-snapshot"
          onSubmit={(event) => {
            event.preventDefault();
            setSnapshotError("");
            setMessage("");
            try {
              if (!snapshot.price.trim() || !snapshot.available.trim())
                throw Error(
                  "Enter the observed price and available purchase packs.",
                );
              const priorCheck = snapshotRow.inventory?.checkedAt;
              const checkedAt = priorCheck && snapshot.checkedAt === localTime(priorCheck)
                ? priorCheck
                : new Date(snapshot.checkedAt).toISOString();
              if (Date.parse(checkedAt) > Date.now())
                throw Error(
                  "Use the time you checked the retailer; it cannot be in the future.",
                );
              const next = recordSupplyInventory(project, {
                productId: snapshotRow.productId,
                retailer: project.retailer,
                retailerProductId: snapshotRow.offer!.productId,
                price: Number(snapshot.price),
                available: Number(snapshot.available),
                store: snapshot.store.trim(),
                zip: snapshot.zip,
                checkedAt,
                url: snapshot.url,
              });
              onChange({
                ...next,
                store: snapshot.store.trim(),
                zip: snapshot.zip,
              });
              setMessage(
                `${tools ? "Tool" : "Supply"} snapshot recorded. Only fresh observations matching the project's retailer, store and ZIP enter the observed subtotal.`,
              );
              setSnapshotProductId(null);
            } catch (error) {
              setSnapshotError(
                errorText(error, "Check the supply snapshot fields."),
              );
            }
          }}
        >
          <h4>Record a {tools ? "tool" : "supply"} snapshot</h4>
          <p className="small-note">
            {snapshotRow.name}
            <br />
            {retailerName(project.retailer)} product{" "}
            {snapshotRow.offer.productId} · seller {snapshotRow.offer.seller}.
            Copy values you checked for one {snapshotRow.purchaseUnit}.
            Recording also selects this store and ZIP for the project.
          </p>
          <label className="field">
            Product URL
            <input
              aria-label="Supply snapshot URL"
              type="url"
              required
              value={snapshot.url}
              onChange={(event) =>
                setSnapshot((current) => ({
                  ...current,
                  url: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            Price per purchase pack (USD)
            <input
              aria-label="Supply snapshot price per pack"
              type="number"
              min="0"
              max="100000"
              step="0.01"
              required
              value={snapshot.price}
              onChange={(event) =>
                setSnapshot((current) => ({
                  ...current,
                  price: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            Available purchase packs
            <input
              aria-label="Supply snapshot available packs"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              value={snapshot.available}
              onChange={(event) =>
                setSnapshot((current) => ({
                  ...current,
                  available: event.target.value,
                }))
              }
            />
          </label>
          <div className="two-col">
            <label className="field">
              Project store
              <input
                aria-label="Supply snapshot store"
                maxLength={80}
                required
                value={snapshot.store}
                onChange={(event) =>
                  setSnapshot((current) => ({
                    ...current,
                    store: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              Project ZIP
              <input
                aria-label="Supply snapshot ZIP"
                pattern="[0-9]{5}"
                required
                value={snapshot.zip}
                onChange={(event) =>
                  setSnapshot((current) => ({
                    ...current,
                    zip: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="field">
            Checked at
            <input
              aria-label="Supply snapshot checked at"
              type="datetime-local"
              required
              value={snapshot.checkedAt}
              onChange={(event) =>
                setSnapshot((current) => ({
                  ...current,
                  checkedAt: event.target.value,
                }))
              }
            />
          </label>
          {snapshotError && (
            <p className="form-error" role="alert">
              {snapshotError}
            </p>
          )}
          <div className="inline">
            <button className="button secondary" type="submit">
              Record {tools ? "tool" : "supply"} snapshot
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setSnapshotProductId(null)}
            >
              Cancel snapshot
            </button>
          </div>
        </form>
      )}

      {!tools && (
        <details className="supply-snapshot-import">
          <summary>Import supply snapshot JSON</summary>
          <p className="small-note">
            Import exact-product observations. Newer checks update matching
            records. Your selected store and ZIP stay in place.
          </p>
          <label className="field">
            Snapshot JSON file
            <input
              aria-label="Supply snapshot JSON file"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void readSnapshotFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <label className="field">
            Snapshot JSON
            <textarea
              aria-label="Supply snapshot JSON"
              rows={4}
              maxLength={1000000}
              placeholder='[{"productId":"…","retailer":"home-depot","retailerProductId":"…","price":0,"available":0,"store":"…","zip":"84121","checkedAt":"…","url":"…"}]'
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportError("");
                setImportMessage("");
              }}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!importText.trim()}
            onClick={() => {
              setImportError("");
              setImportMessage("");
              try {
                const observations = parseSupplyInventory(importText);
                const imported = mergeStoreSnapshots(project, { supplies: observations });
                if (imported.changed) onChange(imported.project);
                setImportMessage(
                  `${imported.changed} supply ${imported.changed === 1 ? "snapshot" : "snapshots"} recorded.${imported.skipped ? ` Skipped ${imported.skipped} duplicate or older rows.` : ""}`,
                );
              } catch (error) {
                setImportError(
                  errorText(error, "Check the supply snapshot JSON."),
                );
              }
            }}
          >
            Import supply snapshots
          </button>
          {importError && (
            <p className="form-error" role="alert">
              {importError}
            </p>
          )}
          {importMessage && (
            <p className="small-note" role="status">
              {importMessage}
            </p>
          )}
        </details>
      )}
    </details>
  );
}
