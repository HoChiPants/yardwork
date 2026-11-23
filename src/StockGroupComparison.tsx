import { useMemo, useState } from "react";
import { formatStockLength } from "./measurement";
import { material, type MaterialId, type Project } from "./model";
import { materialStockDisplayName } from "./materialGroups";
import { canCompareMixedStock, previewGroupStockReplacement, previewMixedGroupStockReplacement, stockReplacementGroup } from "./partStockReplacement";
import { purchaseUnitLabel } from "./purchaseUnits";
import { reviewedOfferForMaterial } from "./retailerCatalog";

export function StockGroupComparison({
  project,
  source,
  inventoryTick,
  onReplace,
  onRecordSnapshot,
  onApplyMixed,
}: {
  project: Project;
  source: MaterialId;
  inventoryTick: number;
  onReplace: (source: MaterialId, replacement: MaterialId) => void;
  onRecordSnapshot: (stock: MaterialId) => void;
  onApplyMixed: (source: Project, replacement: Project) => void;
}) {
  const [selection, setSelection] = useState("");
  const [comparingMixed, setComparingMixed] = useState(false);
  const group = useMemo(() => stockReplacementGroup(project, source), [project, source]);
  const mixedAvailable = canCompareMixedStock(project, source, group.parts);
  const mixed = useMemo(() => {
    if (!comparingMixed || !mixedAvailable) return null;
    try {
      return { result: previewMixedGroupStockReplacement(project, source) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Review the available stock and cutting allowance." };
    }
  }, [comparingMixed, mixedAvailable, project, source]);
  const mixedResult = mixed?.result;
  const alternate = group.options.find(({ id }) => id === selection);
  const preview = useMemo(() => {
    if (!alternate) return null;
    try {
      return { result: previewGroupStockReplacement(project, source, alternate.id) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Review this stock choice." };
    }
  }, [alternate, project, source, inventoryTick]);
  const offer = alternate && reviewedOfferForMaterial(alternate, project.retailer);
  if (!group.options.length && !mixedAvailable) return null;
  const purchase = preview?.result?.purchase;
  const before = purchase?.reduce((total, row) => total + row.before, 0);
  const after = purchase?.reduce((total, row) => total + row.after, 0);
  const snapshot = preview?.result?.snapshot;
  const length = preview?.result?.purchasedLength;
  const needed = purchase?.find(({ id }) => id === alternate?.id)?.after ?? 0;
  return (
    <details className="field-section stock-group-comparison">
      <summary>Compare stock for {group.parts.length} parts</summary>
      <p className="small-note">
        Applies to parts without a recorded source. Their dimensions, cuts and placement stay the same.
        {group.recordedCount > 0 && ` ${group.recordedCount} already linked to recorded stock stay with their sources.`}
      </p>
      {group.options.length > 0 && <label className="field">
        Alternate stock
        <select value={alternate?.id ?? ""} onChange={(event) => setSelection(event.target.value)}>
          <option value="">Choose a stock size or grade</option>
          {group.options.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
      {offer && <p><a href={offer.url} target="_blank" rel="noreferrer">Product #{offer.productId}</a></p>}
      {preview?.error && <p role="alert" className="form-error">{preview.error}</p>}
      {alternate && purchase && before !== undefined && after !== undefined && (
        <>
          <p><strong>Affected lines · {before} → {after} {purchaseUnitLabel(alternate.unit, after)} to buy</strong></p>
          {length && <p className="small-note">Total board length to buy · {formatStockLength(length.before)} → {formatStockLength(length.after)}</p>}
          <ul aria-label="Stock purchase changes">
            {purchase.map(({ id, before, after }) => (
              <li key={id}>{material(id).name} · {before} → {after} {purchaseUnitLabel(material(id).unit, after)} to buy</li>
            ))}
          </ul>
          <p className="small-note">
            {snapshot
              ? `Store ${snapshot.store}, ZIP ${snapshot.zip} snapshot · ${snapshot.available} available · ${needed} needed`
              : "Current store availability unverified"}
          </p>
          <button type="button" className="text-button" onClick={() => onRecordSnapshot(alternate.id)}>
            Record snapshot for alternate
          </button>
          <p className="small-note">Review grade, treatment and saved connections. Rebuilding a generated section uses its saved stock choices.</p>
          <button type="button" className="button secondary full" onClick={() => {
            onReplace(source, alternate.id);
            setSelection("");
          }}>
            Change stock for {group.parts.length} parts
          </button>
        </>
      )}
      {mixedAvailable && (
        <button type="button" className="button secondary full" aria-expanded={comparingMixed}
          onClick={() => setComparingMixed(!comparingMixed)}>Compare mixed lengths</button>
      )}
      {mixed?.error && <p role="alert" className="form-error">{mixed.error}</p>}
      {mixed && mixed.result === null && <p className="small-note">
        No checked mixed-length plan reduces the total board length to buy.
      </p>}
      {mixedResult && (
        <section aria-label="Mixed stock preview" className="field-section">
          <p><strong>Total board length to buy · {formatStockLength(mixedResult.purchasedLength.before)} → {formatStockLength(mixedResult.purchasedLength.after)}</strong></p>
          <ul aria-label="Mixed stock purchase changes">
            {mixedResult.purchase.filter(({ before, after }) => before !== after).map(({ id, before, after }) => (
              <li key={id}>{materialStockDisplayName(id)} · {before} → {after} {purchaseUnitLabel(material(id).unit, after)} to buy</li>
            ))}
          </ul>
          <details>
            <summary>Review cuts and expected offcuts</summary>
            <ul aria-label="Mixed stock cut order">
              {mixedResult.cutOrders.map((order) => (
                <li key={order.partIds.join("/")}>
                  <strong>{order.title} · {formatStockLength(order.layout.length)}</strong>
                  <ol>{order.steps.map((text, index) => <li key={index}>{text}</li>)}</ol>
                  {order.remnants.length > 0 && <p className="small-note">Expected offcuts · {order.remnants.join(" · ")}</p>}
                </li>
              ))}
            </ul>
          </details>
          <p className="small-note">Confirm grade, treatment and store availability for each board. Rebuilding a generated section uses its saved stock choices.</p>
          <button type="button" className="button secondary full" onClick={() => {
            onApplyMixed(mixedResult.source, mixedResult.project);
            setComparingMixed(false);
          }}>Apply mixed stock lengths</button>
        </section>
      )}
    </details>
  );
}
