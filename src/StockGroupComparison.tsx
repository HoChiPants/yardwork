import { useMemo, useState } from "react";
import { formatStockLength } from "./measurement";
import { material, type MaterialId, type Project } from "./model";
import { previewGroupStockReplacement, stockReplacementGroup } from "./partStockReplacement";
import { purchaseUnitLabel } from "./purchaseUnits";
import { reviewedOfferForMaterial } from "./retailerCatalog";

export function StockGroupComparison({
  project,
  source,
  inventoryTick,
  onReplace,
  onRecordSnapshot,
}: {
  project: Project;
  source: MaterialId;
  inventoryTick: number;
  onReplace: (source: MaterialId, replacement: MaterialId) => void;
  onRecordSnapshot: (stock: MaterialId) => void;
}) {
  const [selection, setSelection] = useState("");
  const group = useMemo(() => stockReplacementGroup(project, source), [project, source]);
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
  if (!group.options.length) return null;
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
      <label className="field">
        Alternate stock
        <select value={alternate?.id ?? ""} onChange={(event) => setSelection(event.target.value)}>
          <option value="">Choose a stock size or grade</option>
          {group.options.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
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
    </details>
  );
}
