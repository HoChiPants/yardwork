import { useState } from "react";
import type { floorBaseConnections } from "./floorBaseConnections";
import { floorHangerEndKey, floorHangerFit, type FloorHangerId } from "./floorHangerPlans";
import { floorHangerProductIds, floorHangerReport, floorHangerScope, floorHangers } from "./floorHangerReference";
import type { FloorHangerPlan } from "./floorHangerSchema";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

export function FloorHangerPanel({ project, base, saved, onSave }: {
  project: Project;
  base: ReturnType<typeof floorBaseConnections>[number];
  saved?: FloorHangerPlan;
  onSave: (plan: FloorHangerPlan | null) => void;
}) {
  const [productId, setProductId] = useState<FloorHangerId>(
    saved?.productId ?? (base.rows.some(({ joist }) => joist.size[1] >= 7.25) ? "simpson-lus28z" : "simpson-lus26z"),
  );
  const [reach, setReach] = useState(saved ? String(saved.flangeReach) : "");
  const [chosen, setChosen] = useState<string[]>(saved?.ends.map(floorHangerEndKey) ?? []);
  const measurement = Number(reach);
  const measured = Number.isFinite(measurement) && measurement > 0;
  const hanger = floorHangers[productId];
  const rows = base.rows.flatMap((joint) => {
    const { rim, joist, side } = joint;
    if (!rim) return [];
    const end = { rimId: rim.id, joistId: joist.id };
    return [{ end, side, key: floorHangerEndKey(end), issue: measured ? floorHangerFit(base, joint, productId, measurement) : "Enter the measured flange reach." }];
  });
  const eligible = rows.filter(({ issue }) => !issue);
  const selected = eligible.filter(({ key }) => chosen.includes(key));
  const canSave = selected.length > 0 && selected.length === chosen.length;
  return (
    <details className="field-section floor-hanger-plan">
      <summary>Plan face-mount hangers{saved ? ` · ${saved.ends.length} saved` : ""}</summary>
      <label className="field">
        Joist hanger
        <select value={productId} onChange={(event) => {
          const id = floorHangerProductIds.find((value) => value === event.target.value);
          if (id) setProductId(id);
          setChosen([]);
        }}>
          {floorHangerProductIds.map((id) => <option value={id} key={id}>{floorHangers[id].model} · {floorHangers[id].nominal}</option>)}
        </select>
      </label>
      <p className="small-note">{floorHangerScope}</p>
      <p className="small-note"><a href={hanger.url} target="_blank" rel="noreferrer">Home Depot #{hanger.internetNumber}</a>{" · "}<a href={floorHangerReport} target="_blank" rel="noreferrer">ESR-3096 Table 20</a></p>
      <label className="field">
        Measured flange reach (in)
        <input type="number" min="0.001" step="any" value={reach} onChange={(event) => setReach(event.target.value)} />
      </label>
      <p className="small-note">Measure how far the wider flange extends past the joist edge. Yardwork uses that distance on both sides.</p>
      {measured && (
        <>
          <p className="small-note">{eligible.length} of {base.rows.length} ends match the modeled contact and flange clearance.</p>
          <button type="button" className="button secondary small" disabled={!eligible.length} onClick={() => setChosen(eligible.map(({ key }) => key))}>Select matching ends</button>
          <details className="field-section">
            <summary>Choose individual ends</summary>
            {rows.map(({ end, side, key, issue }) => (
              <label key={key} className="checkbox-field">
                <input type="checkbox" checked={chosen.includes(key)} disabled={!!issue && !chosen.includes(key)}
                  onChange={(event) => setChosen(event.target.checked ? [...chosen, key] : chosen.filter((value) => value !== key))} />
                <span>{side === "back" ? "Back" : "Front"} rim · {partLabel(project, end.joistId)}{issue ? ` · ${issue}` : ""}</span>
              </label>
            ))}
          </details>
          <p className="small-note">{selected.length} selected · {selected.length * hanger.rimScrews} SD9112 rim screws · {selected.length * hanger.joistScrews} SD9212 joist screws.</p>
          {selected.length < chosen.length && <p className="small-note">Clear changed ends or select matching ends again before saving.</p>}
          <button type="button" className="button secondary full" disabled={!canSave} onClick={() =>
            onSave({ productId, flangeReach: measurement, checkedAt: new Date().toISOString(), ends: selected.map(({ end }) => end) })}>
            Save hanger plan
          </button>
        </>
      )}
      {saved && (
        <>
          <p className="small-note">Prepare Home Depot list to review the planned hardware and add purchases.</p>
          <button type="button" className="text-button" onClick={() => onSave(null)}>Remove hanger plan</button>
        </>
      )}
    </details>
  );
}
