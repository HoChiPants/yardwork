import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { plannedCutKerf, type inspectCutStock } from "./cutStock";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { MaterialId, Piece, Project } from "./model";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { partLabel } from "./partLabels";
import { stockSplitState } from "./packing";

export type BoardPlacement =
  | { kind: "offcut"; id: string; length: number; stockLengthAxis: Piece["stockLengthAxis"] }
  | { kind: "stock-cut"; length: number };

export function MaterialPlacement({ group, project, inspection, finishedLength, offcutId, onPlace }: {
  group: MaterialGroup;
  project: Project;
  inspection: ReturnType<typeof inspectCutStock>;
  finishedLength?: number;
  offcutId?: string;
  onPlace: (id: MaterialId, placement?: BoardPlacement) => void;
}) {
  const { preferred, canCutToLength, label, options } = materialPlacementOptions(group);
  const [selected, select] = useState(preferred.id);
  const [needed, setNeeded] = useState(finishedLength ?? NaN);
  const [selectedOffcut, selectOffcut] = useState(offcutId);
  const choice = options.find(({ id }) => id === selected)!;
  const kerf = plannedCutKerf(project, choice.id);
  const fits = (length: number, id: MaterialId) => {
    const state = stockSplitState(length, needed, plannedCutKerf(project, id));
    return state === "whole" || state === "cut";
  };
  const validLength = needed >= 0.125;
  const shortest = validLength ? options.find(({ id, value }) => fits(value, id)) : undefined;
  const enough = Number.isNaN(needed) || (validLength && fits(choice.value, choice.id));
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
        defaultUnit={preferredLengthUnit(finishedLength ?? NaN)} onChange={setNeeded} />
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
