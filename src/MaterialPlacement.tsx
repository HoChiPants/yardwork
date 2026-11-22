import { useLayoutEffect, useState } from "react";
import { LengthInput } from "./LengthInput";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { plannedCutKerf, type inspectCutStock } from "./cutStock";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { MaterialId, Piece, Project, V3 } from "./model";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { partLabel } from "./partLabels";
import { stockSplitState } from "./packing";
import { compareRepeatedBoardCuts, maxRepeatedBoards } from "./repeatedBoardCuts";

export type BoardPlacement =
  | { kind: "offcut"; id: string; length: number; stockLengthAxis: Piece["stockLengthAxis"] }
  | { kind: "stock-cut"; length: number; quantity?: number };

export function MaterialPlacement({ group, project, inspection, position = [0, 0, 0], finishedLength, measuredLength, offcutId, initialQuantity = 1, initialStock, onPreview, onPlace }: {
  group: MaterialGroup;
  project: Project;
  inspection: ReturnType<typeof inspectCutStock>;
  position?: V3;
  finishedLength?: number;
  measuredLength?: number;
  offcutId?: string;
  initialQuantity?: number;
  initialStock?: MaterialId;
  onPreview: (id: MaterialId | null, placement?: BoardPlacement) => void;
  onPlace: (id: MaterialId, placement?: BoardPlacement) => void;
}) {
  const { preferred, canCutToLength, label, options } = materialPlacementOptions(group);
  const [selected, select] = useState(initialStock ?? preferred.id);
  const [needed, setNeeded] = useState(finishedLength ?? NaN);
  const [count, setCount] = useState(String(initialQuantity));
  const [selectedOffcut, selectOffcut] = useState(offcutId);
  const choice = options.find(({ id }) => id === selected)!;
  const zone = project.workZone;
  const [x, y, z] = position;
  const zoneClearance = zone && Math.abs(x) <= zone.width / 2 && Math.abs(z) <= zone.depth / 2
    ? zone.height - y : 0;
  const canUseZoneClearance = zoneClearance >= 0.125 && preferred.size[1] === Math.max(...preferred.size);
  const kerf = plannedCutKerf(project, choice.id);
  const fits = (length: number, id: MaterialId, finished: number) => {
    const state = stockSplitState(length, finished, plannedCutKerf(project, id));
    return state === "whole" || state === "cut";
  };
  const validLength = needed >= 0.125;
  const shortestFor = (length: number) => options.find(({ id, value }) => fits(value, id, length));
  const shortest = validLength ? shortestFor(needed) : undefined;
  const quantity = validLength ? Number(count) : 1;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= maxRepeatedBoards;
  const repeated = quantity > 1 && validQuantity;
  const repeats = repeated ? compareRepeatedBoardCuts(project, options, needed, quantity) : [];
  const batch = repeats.find(({ id }) => id === choice.id);
  const recommendedBatch = repeats[0];
  const enough = validQuantity && (Number.isNaN(needed) || (validLength && fits(choice.value, choice.id, needed)));
  const zoneStock = canCutToLength && canUseZoneClearance && zoneClearance < choice.value && Number.isNaN(needed)
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
  useLayoutEffect(() => {
    const placement = previewOffcut && previewAxis !== undefined
      ? { kind: "offcut", id: previewOffcut, length: needed, stockLengthAxis: previewAxis } as const
      : planCut ? { kind: "stock-cut", length: needed, quantity } as const : undefined;
    onPreview(validQuantity ? previewStock : null, placement);
    return () => onPreview(null);
  }, [needed, onPreview, planCut, previewAxis, previewOffcut, previewStock, quantity, validQuantity]);
  return <>
    <h2 id="modal-title">{group.name}</h2>
    {options.length > 1 ? <fieldset className="stock-size-options">
      <legend>{label}</legend>
      {options.map((option) => <label key={option.id}>
        <input type="radio" name="placement-stock-size" value={option.id} checked={selected === option.id}
          onChange={() => select(option.id)} /><span>{option.label}</span>
      </label>)}
    </fieldset> : <p className="single-stock-size">{choice.label} stock</p>}
    {canCutToLength && <div className="stock-length-check">
      <LengthInput label="Finished length (optional)" ariaLabel="Needed finished length" value={needed}
        defaultUnit={preferredLengthUnit(finishedLength ?? measuredLength ?? zoneClearance)} onChange={setNeeded} />
      {validLength && !offcutId && <label className="field stock-cut-quantity">
        Pieces at this length
        <input type="number" min="1" max={maxRepeatedBoards} step="1" value={count}
          onChange={(event) => setCount(event.target.value)} />
      </label>}
      {!validQuantity && <p role="status">Choose 1 to {maxRepeatedBoards} whole pieces.</p>}
      {measuredLength !== undefined && <button type="button" className="text-button use-measured-length"
        onClick={() => setNeeded(measuredLength)}>Use measured span ({formatStockLength(measuredLength)})</button>}
      {zoneStock && <div>
        <p className="small-note">{choice.label} is taller than the available space.{zoneStock.value < choice.value &&
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
          {remnant.sourceCutPending && <p>Complete the source stock cut order first.</p>}
          {!!remnant.operations.length && <p>{remnant.operations.map(({ text }) => text).join(" · ")}</p>}
          <button type="button" className="button primary"
            onClick={() => onPlace(remnant.piece.material, {
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
        onClick={() => onPlace(choice.id, { kind: "stock-cut", length: needed, quantity })}>
        Plan and place {quantity} pieces
      </button>
    </div>}
    {planCut && !batch && <div className="stock-length-check">
      <p className="small-note">
        Crosscut to {formatStockLength(needed)} with a {formatStockLength(kerf)} blade allowance.
        {leftover > 1e-8 ? ` Expected offcut · ${formatStockLength(leftover)}.` : " The blade uses the remaining length."}
      </p>
      <button type="button" className={`button ${remnant ? "secondary" : "primary"}`}
        onClick={() => onPlace(choice.id, { kind: "stock-cut", length: needed })}>
        {remnant ? "Plan cut from new stock" : "Plan cut and place"}
      </button>
    </div>}
    {!planCut && <button type="button" disabled={!enough || repeated} className={`button ${remnant ? "secondary" : "primary"}`}
      onClick={() => onPlace(choice.id)}>
      {remnant ? "Place new stock" : "Place material"}
    </button>}
  </>;
}
