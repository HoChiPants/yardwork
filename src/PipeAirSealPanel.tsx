import { useMemo, useState } from "react";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "./handoffPurchases";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import { uid, type Project } from "./model";
import { openingSilicone } from "./openingAirSealReference";
import { pipeAirSealOptions, pipeAirSealReference, pipeAirSealScope, previewPipeAirSeal, reviewPipeAirSeals, savePipeAirSeal } from "./pipeAirSeal";
import type { PipeAirSealInput } from "./pipeAirSealSchema";
import type { TrimSeamMarker } from "./trimSeamGeometry";

type Preview = ReturnType<typeof previewPipeAirSeal>;
export function PipeAirSealPanel({ project, initialPlanId, initiallyOpen, onApply, onShow }: {
  project: Project;
  initialPlanId?: string;
  initiallyOpen?: boolean;
  onApply: (candidate: Project, source: Project) => void;
  onShow: (marker: TrimSeamMarker | null) => void;
}) {
  const options = useMemo(() => pipeAirSealOptions(project), [project]);
  const records = useMemo(() => reviewPipeAirSeals(project), [project]);
  const create = (): PipeAirSealInput => ({
    id: uid(), partId: options[0]?.part.id ?? "", openingKey: options[0]?.key ?? "",
    side: "positive", pipeDiameter: NaN, offset: [0, 0], cavityDepth: NaN,
    dryFit: false, session: "Pipe air sealing",
  });
  const [input, setInput] = useState(() => records.find(({ plan }) => plan.id === initialPlanId)?.plan ?? create());
  const [checked, setChecked] = useState<{ project: Project; preview: Preview }>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const saved = records.find(({ plan }) => plan.id === input.id);
  const live = checked?.project === project ? checked.preview : undefined;
  const result = live ?? (!dirty ? saved?.preview : undefined);
  const target = options.find(({ part, key }) => part.id === input.partId && key === input.openingKey);
  const needs = useMemo(() => records.some(({ preview }) => preview) && project.retailer === "home-depot"
    ? homeDepotPurchaseNeeds(project).filter(({ id, canAdd }) => id === openingSilicone.id && canAdd) : [],
  [project, records]);

  function edit(input: PipeAirSealInput, dirty = true) {
    setInput(input);
    setDirty(dirty);
    setChecked(undefined);
    setError("");
    onShow(null);
  }
  function apply(candidate: () => Project, next?: PipeAirSealInput) {
    try {
      onApply(candidate(), project);
      edit(next ?? input, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review this pipe seal.");
    }
  }
  return <details className="field-section" id="pipe-air-seal" open={initiallyOpen || undefined}>
    <summary>Plan pipe air seal</summary>
    {records.length > 0 && <label className="field">Saved pipe seal
      <select value={saved ? input.id : ""} onChange={({ currentTarget }) =>
        edit(records.find(({ plan }) => plan.id === currentTarget.value)?.plan ?? create(), false)}>
        <option value="">New pipe seal</option>
        {records.map(({ plan, preview }) => <option key={plan.id} value={plan.id}>
          {preview?.label ?? (options.find(({ part, key }) => part.id === plan.partId && key === plan.openingKey)?.label ?? "Changed opening")} · {plan.side} face
        </option>)}
      </select>
    </label>}
    {!dirty && saved?.issue && <p className="form-error" role="alert">{saved.issue}</p>}
    {options.length ? <form onSubmit={(event) => {
      event.preventDefault();
      setError("");
      try {
        setChecked({ project, preview: previewPipeAirSeal(project, input) });
      } catch (cause) {
        setChecked(undefined);
        setError(cause instanceof Error ? cause.message : "Check the opening measurements.");
      }
    }}>
      <label className="field">Round opening
        <select value={target ? String(options.indexOf(target)) : ""} onChange={({ currentTarget }) => {
          const row = options[Number(currentTarget.value)];
          if (row) edit({ ...input, partId: row.part.id, openingKey: row.key, dryFit: false });
        }}>
          {!target && <option value="" disabled>Choose a current opening</option>}
          {options.map(({ part, key, label }, index) => <option key={`${part.id}/${key}`} value={index}>{label}</option>)}
        </select>
      </label>
      <p className="small-note">Confirm the cut diameter on site. Enter the actual pipe outside diameter. A centered pipe has zero offset along both local axes.</p>
      <div className="two-col">
        <label className="field">Seal face
          <select value={input.side} onChange={({ currentTarget }) => edit({
            ...input, side: currentTarget.value === "negative" ? "negative" : "positive", dryFit: false,
          })}>
            <option value="positive">+{target ? "XYZ"[target.opening.axis] : ""} face</option>
            <option value="negative">−{target ? "XYZ"[target.opening.axis] : ""} face</option>
          </select>
        </label>
        <LengthInput label="Pipe outside diameter" min={0.01} max={48} required value={input.pipeDiameter}
          onChange={(pipeDiameter) => edit({ ...input, pipeDiameter, dryFit: false })} />
        <LengthInput label={`Pipe center offset · local ${target?.axes[0] ?? "first axis"}`} min={-48} max={48} required value={input.offset[0]}
          onChange={(value) => edit({ ...input, offset: [value, input.offset[1]], dryFit: false })} />
        <LengthInput label={`Pipe center offset · local ${target?.axes[1] ?? "second axis"}`} min={-48} max={48} required value={input.offset[1]}
          onChange={(value) => edit({ ...input, offset: [input.offset[0], value], dryFit: false })} />
        <LengthInput label="Available cavity depth" max={12} min={0.01} required value={input.cavityDepth}
          onChange={(cavityDepth) => edit({ ...input, cavityDepth, rodRecess: cavityDepth > openingSilicone.maxDepth ? input.rodRecess : undefined, dryFit: false })} />
        <label className="field">Work session
          <input required maxLength={60} value={input.session} onChange={({ currentTarget }) => edit({ ...input, session: currentTarget.value })} />
        </label>
      </div>
      {input.cavityDepth > openingSilicone.maxDepth && <div className="two-col">
        <LengthInput label="Recess to top of rod" min={0.25} max={0.5} required value={input.rodRecess ?? NaN}
          onChange={(rodRecess) => edit({ ...input, rodRecess, dryFit: false })} />
        <label className="checkbox-field">
          <input type="checkbox" checked={input.dryFit} onChange={({ currentTarget }) => edit({ ...input, dryFit: currentTarget.checked })} />
          Dry-fitted a snug rod all the way around
        </label>
      </div>}
      <button type="submit" className="button secondary full" disabled={!target}>Check pipe seal</button>
    </form> : <p className="small-note">Add a round opening to a wood or drywall part using its Cuts tools.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {result && <section className="field-section" aria-label="Pipe seal review">
      <p>Gap {formatPreciseInches(result.narrow)} to {formatPreciseInches(result.wide)}</p>
      {result.rod && <p>Trial fit {result.rod.name} · start with a {formatPreciseInches(result.rodLength)} ring.</p>}
      {result.issues.length > 0 && <ul className="form-error">{result.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      <p className="small-note">The solid ring marks the cut. The dashed ring marks the pipe.</p>
      <div className="button-row">
        <button className="button secondary" type="button" onClick={() => onShow(result.marker)}>Show rings in 3D</button>
        {live && !live.issues.length && <button className="button primary" type="button" onClick={() =>
          apply(() => savePipeAirSeal(project, input))}>Save pipe seal</button>}
      </div>
    </section>}
    <div className="button-row">
      {needs.length > 0 && !dirty && <button className="button secondary" type="button" onClick={() =>
        apply(() => addHomeDepotPurchaseNeed(project, openingSilicone.id))}>Add missing sealant to List</button>}
      {saved && <button className="text-button" type="button" onClick={() =>
        apply(() => ({ ...project, guideFingerprint: null, pipeAirSeals: project.pipeAirSeals?.filter(({ id }) => id !== input.id) }), create())
      }>Remove saved pipe seal</button>}
    </div>
    <p className="small-note">{pipeAirSealScope} <a href={pipeAirSealReference} target="_blank" rel="noreferrer">PNNL installation guidance</a></p>
  </details>;
}
