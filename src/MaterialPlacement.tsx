import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { cutKerf } from "./cutStock";
import { formatStockLength } from "./measurement";
import type { MaterialId } from "./model";

export function MaterialPlacement({ group, onPlace }: { group: MaterialGroup; onPlace: (id: MaterialId) => void }) {
  const { preferred, label, options } = materialPlacementOptions(group);
  const [selected, select] = useState(preferred.id);
  const [needed, setNeeded] = useState(NaN);
  const choice = options.find(({ id }) => id === selected)!;
  const compare = preferred.wood && preferred.cuttable && preferred.stockKind === "linear";
  const fits = (length: number, id: MaterialId) => Math.abs(length - needed) < 1e-6 || length >= needed + cutKerf(id);
  const shortest = needed > 0 ? options.find(({ id, value }) => fits(value, id)) : undefined;
  const enough = !(needed > 0) || fits(choice.value, choice.id);
  return <>
    <h2 id="modal-title">{group.name}</h2>
    <fieldset className="stock-size-options">
      <legend>{label}</legend>
      {options.map((option) => <label key={option.id}>
        <input type="radio" name="placement-stock-size" value={option.id} checked={selected === option.id}
          onChange={() => select(option.id)} /><span>{option.label}</span>
      </label>)}
    </fieldset>
    {compare && <details>
      <summary>Compare a finished length</summary>
      <LengthInput label="Needed finished length" value={needed} onChange={setNeeded} />
      {needed > 0 && (!shortest ? <p>No listed length fits this cut.</p> : !enough || shortest.value < choice.value ? <p>
        {enough ? `${shortest.label} stock fits this cut with ${formatStockLength(choice.value - shortest.value)} less length to buy.` : `${shortest.label} stock fits this cut.`}{" "}
        <button type="button" className="text-button" onClick={() => select(shortest.id)}>Use {shortest.label}</button>
      </p> : <p>{choice.label} stock fits this cut.</p>)}
    </details>}
    <button type="button" className="button primary" onClick={() => onPlace(choice.id)}>Place material</button>
  </>;
}
