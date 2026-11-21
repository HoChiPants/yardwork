import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { plannedCutKerf, type inspectCutStock } from "./cutStock";
import { formatStockLength } from "./measurement";
import type { MaterialId, Piece, Project } from "./model";
import { fittingBoardOffcut } from "./offcutAssignment";
import { partLabel } from "./partLabels";

export type PlacementOffcut = { id: string; length: number; stockLengthAxis: Piece["stockLengthAxis"] };

export function MaterialPlacement({ group, project, inspection, onPlace }: {
  group: MaterialGroup;
  project: Project;
  inspection: ReturnType<typeof inspectCutStock>;
  onPlace: (id: MaterialId, offcut?: PlacementOffcut) => void;
}) {
  const { preferred, label, options } = materialPlacementOptions(group);
  const [selected, select] = useState(preferred.id);
  const [needed, setNeeded] = useState(NaN);
  const choice = options.find(({ id }) => id === selected)!;
  const compare = preferred.wood && preferred.cuttable && preferred.stockKind === "linear";
  const fits = (length: number, id: MaterialId) =>
    Math.abs(length - needed) < 1e-6 || length >= needed + plannedCutKerf(project, id);
  const shortest = needed > 0 ? options.find(({ id, value }) => fits(value, id)) : undefined;
  const enough = !(needed > 0) || fits(choice.value, choice.id);
  const remnant = compare && needed > 0
    ? fittingBoardOffcut(project, materialFamilyVariants(preferred.id), needed, inspection)
    : undefined;
  return <>
    <h2 id="modal-title">{group.name}</h2>
    <fieldset className="stock-size-options">
      <legend>{label}</legend>
      {options.map((option) => <label key={option.id}>
        <input type="radio" name="placement-stock-size" value={option.id} checked={selected === option.id}
          onChange={() => select(option.id)} /><span>{option.label}</span>
      </label>)}
    </fieldset>
    {compare && <div className="stock-length-check">
      <LengthInput label="Finished length (optional)" ariaLabel="Needed finished length" value={needed} onChange={setNeeded} />
      {needed > 0 && (!shortest ? <p role="status">No listed length fits this cut.</p> : !enough || shortest.value < choice.value ? <p role="status">
        {enough ? `${shortest.label} stock fits this cut with ${formatStockLength(choice.value - shortest.value)} less length to buy.` : `${shortest.label} stock fits this cut.`}{" "}
        <button type="button" className="text-button" onClick={() => select(shortest.id)}>Use {shortest.label}</button>
      </p> : <p role="status">{choice.label} stock fits this cut.</p>)}
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
              id: remnant.piece.id,
              length: needed,
              stockLengthAxis: remnant.stockLengthAxis,
            })}>
            Place from {partLabel(project, remnant.piece.id)}
          </button>
        </div>
      </div>}
    </div>}
    <button type="button" className={`button ${remnant ? "secondary" : "primary"}`} onClick={() => onPlace(choice.id)}>
      {remnant ? "Place new stock" : "Place material"}
    </button>
  </>;
}
