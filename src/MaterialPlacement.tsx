import { useLayoutEffect, useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { plannedCutKerf, type inspectCutStock } from "./cutStock";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { MaterialId, Piece, Project, V3 } from "./model";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { partLabel } from "./partLabels";
import { stockSplitState } from "./packing";
import { compareRepeatedBoardCuts, maxRepeatedBoards } from "./repeatedBoardCuts";
import { isFloorDimension, previewBoardAlongDimension } from "./dimensionBoardPlacement";

export type BoardPlacement =
  | { kind: "offcut"; id: string; length: number; stockLengthAxis: Piece["stockLengthAxis"] }
  | { kind: "stock-cut"; length: number; quantity?: number };
export type MaterialOrientation = "upright" | "flat" | "flat-depth" | "along-mark";

// These three positions keep the board's original local cut axes.
export const boardPlacementPositions = {
  upright: { rotation: [0, 0, 0], section: [0, 2], length: 1, columns: 0, rows: 2 },
  flat: { rotation: [0, 0, Math.PI / 2], section: [1, 2], length: 0, columns: 2, rows: 0 },
  "flat-depth": { rotation: [0, Math.PI / 2, Math.PI / 2], section: [1, 0], length: 2, columns: 0, rows: 2 },
} satisfies Record<Exclude<MaterialOrientation, "along-mark">, {
  rotation: V3;
  section: [0 | 1, 0 | 2];
  length: 0 | 1 | 2;
  columns: 0 | 2;
  rows: 0 | 2;
}>;

export function MaterialPlacement({ group, project, inspection, position = [0, 0, 0], finishedLength, measuredLength, offcutId, initialQuantity = 1, initialStock, dimensionSource, onPreview, onPlace }: {
  group: MaterialGroup;
  project: Project;
  inspection: ReturnType<typeof inspectCutStock>;
  position?: V3;
  finishedLength?: number;
  measuredLength?: number;
  offcutId?: string;
  initialQuantity?: number;
  initialStock?: MaterialId;
  dimensionSource?: {
    name: string;
    length: number;
    a: V3;
    b: V3;
    groups: readonly MaterialGroup[];
    onGroupChange: (id: string) => void;
  };
  onPreview: (id: MaterialId | null, placement?: BoardPlacement, orientation?: MaterialOrientation) => void;
  onPlace: (id: MaterialId, placement?: BoardPlacement, orientation?: MaterialOrientation) => void;
}) {
  const { preferred, canCutToLength, label, options } = materialPlacementOptions(group);
  const [selected, select] = useState(initialStock ?? preferred.id);
  const [needed, setNeeded] = useState(finishedLength ?? NaN);
  const [count, setCount] = useState(String(initialQuantity));
  const [selectedOffcut, selectOffcut] = useState(offcutId);
  const [orientation, setOrientation] = useState<MaterialOrientation>("upright");
  const choice = options.find(({ id }) => id === selected) ?? options.find(({ id }) => id === preferred.id)!;
  const zone = project.workZone;
  const [x, y, z] = position;
  const canChooseOrientation = canCutToLength && preferred.size[1] === Math.max(...preferred.size);
  const along = orientation === "along-mark";
  const axes = along ? boardPlacementPositions.upright : boardPlacementPositions[orientation];
  const free = zone && [zone.width - 2 * Math.abs(x), zone.height - y, zone.depth - 2 * Math.abs(z)];
  const zoneClearance = free && canChooseOrientation && !along && y >= 0 &&
    free[axes.section[0]] >= preferred.size[0] && free[axes.section[1]] >= preferred.size[2]
    ? free[axes.length] : 0;
  const kerf = plannedCutKerf(project, choice.id);
  const fits = (length: number, id: MaterialId, finished: number) => {
    const state = stockSplitState(length, finished, plannedCutKerf(project, id));
    return state === "whole" || state === "cut";
  };
  const validLength = needed >= 0.125;
  const shortestFor = (length: number) => options.find(({ id, value }) => fits(value, id, length));
  const shortest = validLength ? shortestFor(needed) : undefined;
  const quantity = validLength && !along ? Number(count) : 1;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= maxRepeatedBoards;
  const repeated = quantity > 1 && validQuantity;
  const repeats = repeated ? compareRepeatedBoardCuts(project, options, needed, quantity) : [];
  const batch = repeats.find(({ id }) => id === choice.id);
  const recommendedBatch = repeats[0];
  const enough = validQuantity && ((!dimensionSource && Number.isNaN(needed)) || (validLength && fits(choice.value, choice.id, needed)));
  const zoneStock = zoneClearance >= 0.125 && zoneClearance < choice.value && Number.isNaN(needed)
    ? shortestFor(zoneClearance) : undefined;
  const planCut = canCutToLength && validLength && validQuantity &&
    (repeated ? !!batch : stockSplitState(choice.value, needed, kerf) === "cut");
  const leftover = choice.value - needed - kerf;
  const remnants = canCutToLength && validLength && validQuantity && !repeated
    ? fittingBoardOffcuts(project, materialFamilyVariants(preferred.id), needed, inspection)
    : [];
  const remnant = selectedOffcut
    ? remnants.find(({ piece }) => piece.id === selectedOffcut)
    : remnants[0];
  const changedOffcut = selectedOffcut && !remnant && validLength && !repeated
    ? partLabel(project, selectedOffcut)
    : undefined;
  const previewOffcut = remnant?.piece.id;
  const previewStock = remnant?.piece.material ?? choice.id;
  const previewAxis = remnant?.stockLengthAxis;
  const marks = dimensionSource;
  const issues = useMemo(() => {
    if (!along || !marks || !validLength) return {};
    const check = (id: MaterialId) => {
      try {
        previewBoardAlongDimension(project, marks, id, needed);
      } catch (problem) {
        return problem instanceof Error ? problem.message : "Review the placement along the saved dimension.";
      }
    };
    const stock = enough || previewStock === choice.id ? check(choice.id) : undefined;
    return { stock, preview: previewStock === choice.id ? stock : check(previewStock) };
  }, [along, marks, validLength, project, needed, enough, choice.id, previewStock]);
  const showPreview = validQuantity && (!along || (validLength && !issues.preview && (enough || !!previewOffcut)));
  useLayoutEffect(() => {
    const placement = previewOffcut && previewAxis !== undefined
      ? { kind: "offcut", id: previewOffcut, length: needed, stockLengthAxis: previewAxis } as const
      : planCut ? { kind: "stock-cut", length: needed, quantity } as const : undefined;
    onPreview(showPreview ? previewStock : null, placement, orientation);
    return () => onPreview(null);
  }, [needed, onPreview, orientation, planCut, previewAxis, previewOffcut, previewStock, quantity, showPreview]);
  const place = (id: MaterialId, placement?: BoardPlacement) => onPlace(id, placement, orientation);
  return <>
    <h2 id="modal-title">{group.name}</h2>
    {dimensionSource && <>
      <p className="small-note">Saved dimension · {dimensionSource.name} · {formatStockLength(dimensionSource.length)}</p>
      <label className="field">Lumber for saved dimension
        <select value={group.id} onChange={(event) => {
          const next = dimensionSource.groups.find(({ id }) => id === event.target.value);
          if (!next) return;
          select(materialPlacementOptions(next).preferred.id);
          selectOffcut(undefined);
          dimensionSource.onGroupChange(next.id);
        }}>
          {dimensionSource.groups.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
        </select>
      </label>
    </>}
    <div className="placement-options">
      {options.length > 1 ? <fieldset className="stock-size-options">
        <legend>{label}</legend>
        {options.map((option) => <label key={option.id}>
          <input type="radio" name="placement-stock-size" value={option.id} checked={choice.id === option.id}
            onChange={() => select(option.id)} /><span>{option.label}</span>
        </label>)}
      </fieldset> : <p className="single-stock-size">{choice.label}{label === "Stock length" ? " stock" : ""}</p>}
      {(canChooseOrientation || marks) && <fieldset className="stock-size-options stock-orientation">
        <legend>Position</legend>
        <button type="button" aria-pressed={orientation === "upright"} onClick={() => setOrientation("upright")}>
          {canChooseOrientation ? "Stand up" : "Place freely"}
        </button>
        {canChooseOrientation && <>
          <button type="button" aria-pressed={orientation === "flat"} onClick={() => setOrientation("flat")}>Lay flat</button>
          <button type="button" aria-pressed={orientation === "flat-depth"} onClick={() => setOrientation("flat-depth")}>Lay front to back</button>
        </>}
        {marks && <button type="button" aria-pressed={along} onClick={() => setOrientation("along-mark")}>Along saved mark</button>}
      </fieldset>}
    </div>
    {canCutToLength && <div className="stock-length-check">
      <LengthInput label={dimensionSource ? "Finished length" : "Finished length (optional)"} ariaLabel="Needed finished length" value={needed}
        defaultUnit={preferredLengthUnit(finishedLength ?? measuredLength ?? zoneClearance)} onChange={setNeeded} />
      {along && marks && validLength && (enough || remnant) && <p role="status">
        {issues.preview ?? (isFloorDimension(marks)
          ? "The board lies flat along the floor mark."
          : "The board’s end centers align along the mark. Any extra space is split between the ends.")}
      </p>}
      {validLength && !along && !offcutId && <label className="field stock-cut-quantity">
        Pieces at this length
        <input type="number" min="1" max={maxRepeatedBoards} step="1" value={count}
          onChange={(event) => setCount(event.target.value)} />
      </label>}
      {!validQuantity && <p role="status">Choose 1 to {maxRepeatedBoards} whole pieces.</p>}
      {measuredLength !== undefined && (!dimensionSource || needed !== measuredLength) && <button type="button" className="text-button use-measured-length"
        onClick={() => setNeeded(measuredLength)}>{dimensionSource ? "Use saved dimension" : "Use measured span"} ({formatStockLength(measuredLength)})</button>}
      {zoneStock && <div>
        <p className="small-note">{choice.label} is {orientation === "upright" ? "taller" : "longer"} than the available space.{zoneStock.value < choice.value &&
          ` A cut from ${zoneStock.label} stock can fit.`}</p>
        <button type="button" className="text-button use-measured-length"
          onClick={() => setNeeded(zoneClearance)}>Use work zone clearance ({formatStockLength(zoneClearance)})</button>
      </div>}
      {!Number.isNaN(needed) && !validLength && <p role="status">Enter at least ⅛ in or clear the finished length.</p>}
      {validLength && validQuantity && !repeated && (!shortest ? <p role="status">No listed length fits this cut.</p> : !enough || shortest.value < choice.value ? <div className="stock-length-recommendation">
        <p role="status">{enough ? `${shortest.label} stock fits this cut with ${formatStockLength(choice.value - shortest.value)} less length to buy.` : `${shortest.label} stock fits this cut.`}</p>
        <button type="button" className="button secondary small" onClick={() => select(shortest.id)}>Use {shortest.label}</button>
      </div> : <p role="status">{choice.label} stock fits this cut.</p>)}
      {repeated && <div className="stock-length-recommendation" aria-label="Repeated cut plan" role="region">
        {batch ? <p><strong>{batch.boards.length} × {batch.label}</strong> to make {quantity} pieces.</p>
          : <p role="status">{choice.label} stock cannot supply this length.</p>}
        {recommendedBatch && recommendedBatch.id !== choice.id && <div>
          <p>{recommendedBatch.boards.length} × {recommendedBatch.label} uses the least stock at a single stock length.</p>
          <button type="button" className="button secondary small" onClick={() => select(recommendedBatch.id)}>
            Use {recommendedBatch.label}
          </button>
        </div>}
      </div>}
      {changedOffcut && <p role="status">{changedOffcut} no longer fits this length.</p>}
      {(remnants.length > 1 || (changedOffcut && !!remnants.length)) && <details className="stock-offcut-options" open={changedOffcut ? true : undefined}>
        <summary>{remnants.length === 1 ? "Show matching offcut" : `Compare ${remnants.length} matching offcuts`}</summary>
        <fieldset>
          <legend>Choose an offcut</legend>
          {remnants.map((match) => <label key={match.piece.id}>
            <input type="radio" name="placement-offcut" checked={remnant?.piece.id === match.piece.id}
              onChange={() => selectOffcut(match.piece.id)} />
            <span>{partLabel(project, match.piece.id)} · {formatStockLength(match.available[2])}
              {match.sourceCutPending ? " · Expected offcut" : match.onHand ? " · On hand" : ""}</span>
          </label>)}
        </fieldset>
      </details>}
      {remnant && <div className="notice stock-remnant">
        <div>
          <p>
            <strong>{partLabel(project, remnant.piece.id)}</strong> from Cut pool · {formatStockLength(remnant.available[2])}
            {remnant.sourceCutPending ? " · Expected offcut" : remnant.onHand && " · On hand"}
          </p>
          {remnant.sourceCutPending && <p>Complete the cuts that produce this offcut first.</p>}
          {!!remnant.operations.length && <p>{remnant.operations.map(({ text }) => text).join(" · ")}</p>}
          <button type="button" className="button primary" disabled={!!issues.preview}
            onClick={() => place(remnant.piece.material, {
              kind: "offcut",
              id: remnant.piece.id,
              length: needed,
              stockLengthAxis: remnant.stockLengthAxis,
            })}>
            Place from {partLabel(project, remnant.piece.id)}
          </button>
        </div>
      </div>}
    </div>}
    {planCut && batch && <div className="stock-length-check">
      <p className="small-note">
        {batch.boards.some(({ remaining }) => remaining > 1e-8)
          ? `Expected offcuts · ${batch.boards.filter(({ remaining }) => remaining > 1e-8)
              .map(({ remaining }) => formatStockLength(remaining)).join(", ")}.`
          : "The plan uses each board up."}
      </p>
      <button type="button" className="button primary"
        onClick={() => place(choice.id, { kind: "stock-cut", length: needed, quantity })}>
        Plan and place {quantity} pieces
      </button>
    </div>}
    {planCut && !batch && <div className="stock-length-check">
      <p className="small-note">
        Crosscut to {formatStockLength(needed)} with a {formatStockLength(kerf)} blade allowance.
        {leftover > 1e-8 ? ` Expected offcut · ${formatStockLength(leftover)}.` : " The blade uses the remaining length."}
      </p>
      <button type="button" className={`button ${remnant ? "secondary" : "primary"}`} disabled={!!issues.stock}
        onClick={() => place(choice.id, { kind: "stock-cut", length: needed })}>
        {remnant ? "Plan cut from new stock" : "Plan cut and place"}
      </button>
    </div>}
    {!planCut && <button type="button" disabled={!enough || repeated || !!issues.stock} className={`button ${remnant ? "secondary" : "primary"}`}
      onClick={() => place(choice.id)}>
      {remnant ? "Place new stock" : "Place material"}
    </button>}
  </>;
}
