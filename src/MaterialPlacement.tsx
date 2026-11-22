import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { plannedCutKerf, type inspectCutStock } from "./cutStock";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { MaterialId, Piece, Project, V3 } from "./model";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { partLabel } from "./partLabels";
import { stockSplitState } from "./packing";

export type BoardPlacement =
  | { kind: "offcut"; id: string; length: number; stockLengthAxis: Piece["stockLengthAxis"] }
  | { kind: "stock-cut"; length: number };

export function MaterialPlacement({ group, project, inspection, position = [0, 0, 0], finishedLength, measuredLength, offcutId, onPlace }: {
  group: MaterialGroup;
  project: Project;
  inspection: ReturnType<typeof inspectCutStock>;
  position?: V3;
  finishedLength?: number;
  measuredLength?: number;
  offcutId?: string;
  onPlace: (id: MaterialId, placement?: BoardPlacement) => void;
}) {
  const { preferred, canCutToLength, label, options } = materialPlacementOptions(group);
  const [selected, select] = useState(preferred.id);
  const [needed, setNeeded] = useState(finishedLength ?? NaN);
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
  const enough = Number.isNaN(needed) || (validLength && fits(choice.value, choice.id, needed));
  const zoneStock = canCutToLength && canUseZoneClearance && zoneClearance < choice.value && Number.isNaN(needed)
    ? shortestFor(zoneClearance) : undefined;
  const planCut = canCutToLength && validLength && stockSplitState(choice.value, needed, kerf) === "cut";
  const leftover = choice.value - needed - kerf;
  const remnants = canCutToLength && validLength
    ? fittingBoardOffcuts(project, materialFamilyVariants(preferred.id), needed, inspection)
    : [];
  const remnant = selectedOffcut
    ? remnants.find(({ piece }) => piece.id === selectedOffcut)
    : remnants[0];
  const changedOffcut = selectedOffcut && !remnant && validLength
    ? partLabel(project, selectedOffcut)
    : undefined;
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
      {measuredLength !== undefined && <button type="button" className="text-button use-measured-length"
        onClick={() => setNeeded(measuredLength)}>Use measured span ({formatStockLength(measuredLength)})</button>}
      {zoneStock && <div>
        <p className="small-note">{choice.label} is taller than the available space.{zoneStock.value < choice.value &&
          ` A cut from ${zoneStock.label} stock can fit.`}</p>
        <button type="button" className="text-button use-measured-length"
          onClick={() => setNeeded(zoneClearance)}>Use work zone clearance ({formatStockLength(zoneClearance)})</button>
      </div>}
      {!Number.isNaN(needed) && !validLength && <p role="status">Enter at least ⅛ in or clear the finished length.</p>}
      {validLength && (!shortest ? <p role="status">No listed length fits this cut.</p> : !enough || shortest.value < choice.value ? <p role="status">
        {enough ? `${shortest.label} stock fits this cut with ${formatStockLength(choice.value - shortest.value)} less length to buy.` : `${shortest.label} stock fits this cut.`}{" "}
        <button type="button" className="text-button" onClick={() => select(shortest.id)}>Use {shortest.label}</button>
      </p> : <p role="status">{choice.label} stock fits this cut.</p>)}
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
    {planCut && <div className="stock-length-check">
      <p className="small-note">
        Crosscut to {formatStockLength(needed)} with a {formatStockLength(kerf)} blade allowance.
        {leftover > 1e-8 ? ` Expected offcut · ${formatStockLength(leftover)}.` : " The blade uses the remaining length."}
      </p>
      <button type="button" className={`button ${remnant ? "secondary" : "primary"}`}
        onClick={() => onPlace(choice.id, { kind: "stock-cut", length: needed })}>
        {remnant ? "Plan cut from new stock" : "Plan cut and place"}
      </button>
    </div>}
    <button type="button" disabled={!enough} className={`button ${remnant || planCut ? "secondary" : "primary"}`} onClick={() => onPlace(choice.id)}>
      {planCut ? "Place full board" : remnant ? "Place new stock" : "Place material"}
    </button>
  </>;
}
