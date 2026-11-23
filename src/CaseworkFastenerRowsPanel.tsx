import { useState } from "react";
import { caseworkFastenerBodies, previewCaseworkFastenerRows, type CaseworkFastenerPreview } from "./caseworkFastenerRows";
import type { ConnectionIntent } from "./connectionCoverage";
import { woodFastenerProducts } from "./fastenerProducts";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

type Body = ReturnType<typeof caseworkFastenerBodies>[number];
const cabinetScrews = woodFastenerProducts.filter(({ productId }) => productId.startsWith("grk-cabinet-"));

export function CaseworkFastenerRows({ project, bodies, onReview, onApply }: {
  project: Project;
  bodies: Body[];
  onReview: (intent: ConnectionIntent) => void;
  onApply: (preview: CaseworkFastenerPreview) => void;
}) {
  const [bodyId, setBodyId] = useState("");
  const body = bodies.find(({ id }) => id === bodyId) ?? bodies[0];
  if (!body) return null;
  return <details className="field-section">
    <summary>Casework screw rows</summary>
    {bodies.length > 1 && <label className="field">Casework body
      <select value={body.id} onChange={(event) => setBodyId(event.target.value)}>
        {bodies.map(({ id, title, joints }) => {
          const panel = joints.find(({ pair }) => pair !== null)?.pair?.[0];
          return <option key={id} value={id}>{title}{panel && " · " + partLabel(project, panel.id)}</option>;
        })}
      </select>
    </label>}
    <CaseworkRowsForm key={body.id} project={project} body={body} onReview={onReview} onApply={onApply} />
  </details>;
}

function CaseworkRowsForm({ project, body, onReview, onApply }: {
  project: Project;
  body: Body;
  onReview: (intent: ConnectionIntent) => void;
  onApply: (preview: CaseworkFastenerPreview) => void;
}) {
  const [count, setCount] = useState(2);
  const [endInset, setEndInset] = useState(NaN);
  const [productId, setProductId] = useState("");
  const screw = cabinetScrews.find((product) => product.productId === productId);
  const [beforeFloorPlacement, setBeforeFloorPlacement] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preview, setPreview] = useState<CaseworkFastenerPreview>();
  const current = preview?.source === project ? preview : undefined;
  const available = body.joints.filter(({ pair, intents }) => pair && !intents.length);
  const selected = available.filter(({ id }) => !excluded.includes(id));
  const countReady = current?.results.filter(({ row }) => !!row).length ?? 0;
  const clear = () => setPreview(undefined);
  return <section aria-label="Casework screw rows">
    <p className="small-note">Review straight screw entries for the permanent body panels. Verify that the actual joint, plywood edge and chosen fastener suit this assembly.</p>
    <ul>
      {body.joints.map(({ id, title, pair, intents }) => {
        const result = current?.results.find((test) => test.id === id);
        const records = [...new Map(intents.map((intent) => [intent.planId, intent])).values()];
        return <li key={id}>
          {pair && !intents.length ? <label className="checkbox-field">
            <input type="checkbox" checked={!excluded.includes(id)} onChange={(event) => {
              setExcluded(event.target.checked ? excluded.filter((key) => key !== id) : [...excluded, id]);
              clear();
            }} />
            {title} · {partLabel(project, pair[0].id)} → {partLabel(project, pair[1].id)}
          </label> : <p className="small-note">{title}{!pair && " · Review missing or ambiguous panels"}</p>}
          {records.map((intent) => <button key={intent.planId} type="button" className="text-button"
            onClick={() => onReview({ ...intent, locationId: null })}>
            Review {intent.kind === "wood-fastener" ? intent.label.split("/")[0] : intent.label}
          </button>)}
          {result?.problem && <p className="form-error">{result.problem}</p>}
          {result?.row && <p className="small-note">
            {result.row.plan.label} · {result.row.plan.locations.length} marks · {formatStockLength(result.row.spacing)} on center.
            {result.row.floorAccess && " Drive before setting the body down."}
          </p>}
        </li>;
      })}
    </ul>
    {!!available.length && <>
      <label className="field">Cabinet screw
        <select value={productId} onChange={(event) => { setProductId(event.target.value); clear(); }}>
          <option value="">Choose a screw reference</option>
          {cabinetScrews.map(({ productId, name }) => <option key={productId} value={productId}>{name}</option>)}
        </select>
      </label>
      <label className="field">Marks per joint
        <input type="number" min={2} max={100} step={1} value={Number.isFinite(count) ? count : ""}
          onChange={(event) => { setCount(event.target.valueAsNumber); clear(); }} />
      </label>
      <LengthInput label="Inset from each contact end" value={endInset} min={0.001}
        onChange={(inches) => { setEndInset(inches); clear(); }} />
      <label className="checkbox-field">
        <input type="checkbox" checked={beforeFloorPlacement} onChange={(event) => {
          setBeforeFloorPlacement(event.target.checked);
          clear();
        }} />
        Assemble joints with floor-side entries before setting the body down
      </label>
      <div className="button-row">
        <button type="button" className="button secondary small"
          disabled={!selected.length || !screw || !Number.isInteger(count) || count < 2 || count > 100 || !(endInset > 0)}
          onClick={() => {
            if (screw) setPreview(previewCaseworkFastenerRows(project, body, selected.map(({ id }) => id),
              { count, endInset, beforeFloorPlacement, productId: screw.productId }));
          }}>Preview casework screw rows</button>
        {current && countReady > 0 && <button type="button" className="button primary small" onClick={() => onApply(current)}>
          Save {countReady} {countReady === 1 ? "screw row" : "screw rows"}
        </button>}
      </div>
      {current && <p className="small-note" role="status">
        {countReady} of {current.results.length} rows ready to save. Record actual seating and pilot measurements before drilling.
      </p>}
    </>}
  </section>;
}
