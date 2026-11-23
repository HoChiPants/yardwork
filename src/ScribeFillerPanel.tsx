import { useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import { PreviewBoundary } from "./IdeaPlanner";
import { formatPreciseInches } from "./measurement";
import { proposalMotionChanges } from "./motionImpact";
import type { MotionPreview } from "./mechanismMotion";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { previewProposalStock } from "./proposalStock";
import { planStockCutLayouts } from "./recordStockCutLayout";
import { Scene } from "./Scene";
import { previewScribeFiller, scribeFillerMarks, scribeInstallation, scribeScope, scribeSidePanels, scribeStockNames } from "./scribeFiller";
import { scribeStocks, type ScribeFillerInput } from "./scribeFillerSchema";

type Draft = ReturnType<typeof previewScribeFiller>;
const view = { preset: "iso", nonce: 0 };
const noop = () => {};
const measurementFields = [
  ["start", "Start above cabinet bottom"], ["height", "Filler length"], ["bottom", "Wall gap at bottom"],
  ["middle", "Wall gap halfway up"], ["top", "Wall gap at top"], ["wallGap", "Gap to leave at wall"],
  ["setback", "Setback from cabinet front"],
] as const;

export function ScribeFillerPanel({ project, initialPanelId, onApply }: {
  project: Project;
  initialPanelId: string | null;
  onApply: (candidate: Project, source: Project, partId: string) => void;
}) {
  const panels = useMemo(() => scribeSidePanels(project), [project]);
  const initial = panels.find(({ id }) => id === initialPanelId) ?? panels[0];
  const [input, setInput] = useState<ScribeFillerInput>(() => ({
    panelId: initial?.id ?? "", side: "right", front: "front", stock: scribeStocks[0],
    start: 0, height: initial?.size[1] ?? 0, bottom: NaN, middle: NaN, top: NaN, wallGap: 0, setback: 0,
  }));
  const [reuse, setReuse] = useState(true);
  const [saveCut, setSaveCut] = useState(true);
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const [pose, setPose] = useState<MotionPreview>();
  const value = draft?.source === project ? draft : undefined;
  const changes = useMemo(() => value ? proposalMotionChanges(project, value.project) : [], [project, value]);
  const cut = useMemo(() => value && !value.match ? previewProposalStock(project, value.project, null)
    .recordable.find(({ existingPartIds }) => existingPartIds.length === 0) : undefined, [project, value]);

  function reset() {
    setDraft(undefined);
    setPose(undefined);
    setError("");
  }
  function update<Key extends keyof ScribeFillerInput>(key: Key, value: ScribeFillerInput[Key]) {
    reset();
    setInput((current) => ({ ...current, [key]: value }));
  }
  function apply() {
    if (!value) return;
    try {
      const next = saveCut && cut ? planStockCutLayouts(value.project, [cut.layout]).project : value.project;
      onApply(next, project, value.filler.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this filler.");
    }
  }

  return <>
    <h2 id="modal-title">Fit a cabinet scribe filler</h2>
    {panels.length > 0 ? <form onSubmit={(event) => {
      event.preventDefault();
      reset();
      try {
        setDraft(previewScribeFiller(project, input, reuse));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not fit this filler.");
      }
    }}>
      <p>Measure from the outside of the cabinet side to the finished wall at the depth where the filler will sit.</p>
      <label className="field">Cabinet side panel
        <select value={input.panelId} onChange={(event) => {
          const panel = panels.find(({ id }) => id === event.target.value)!;
          reset();
          setInput((current) => ({ ...current, panelId: panel.id, height: panel.size[1], start: 0, bottom: NaN, middle: NaN, top: NaN }));
        }}>
          {panels.map(({ id, name }) => <option key={id} value={id}>{partLabel(project, id)} · {name}</option>)}
        </select>
      </label>
      <div className="two-col">
        <label className="field">Side to fill
          <select value={input.side} onChange={(event) => update("side", event.target.value as ScribeFillerInput["side"])}>
            <option value="left">Left · local −X</option><option value="right">Right · local +X</option>
          </select>
        </label>
        <label className="field">Cabinet front edge
          <select value={input.front} onChange={(event) => update("front", event.target.value as ScribeFillerInput["front"])}>
            <option value="front">Local +Z</option><option value="back">Local −Z</option>
          </select>
        </label>
      </div>
      <label className="field">Board
        <select value={input.stock} onChange={(event) => update("stock", event.target.value as ScribeFillerInput["stock"])}>
          {scribeStocks.map((id) => <option key={id} value={id}>{scribeStockNames[id]}</option>)}
        </select>
      </label>
      <div className="two-col">
        {measurementFields.map(([key, label]) => <LengthInput key={key} label={label} min={0} value={input[key]}
          onChange={(number) => update(key, number)} required />)}
      </div>
      <label className="checkbox-field">
        <input type="checkbox" checked={reuse} onChange={(event) => { setReuse(event.target.checked); reset(); }} />
        Use a matching Cut pool offcut
      </label>
      <button type="submit" className="button secondary">Preview filler and travel</button>
    </form> : <p>Add or select an upright rectangular wood cabinet side first. Its thickness runs along local X.</p>}
    {value && <section aria-label="Scribe filler preview">
      <div className="idea-preview" aria-label="Filler fit in 3D">
        <PreviewBoundary>
          <Scene project={value.project} selected={value.filler.id} onSelect={noop} onMove={noop}
            selectedSectionId={null} onSectionMove={noop} mode="rotate" snap={false} explode={false}
            xray={false} stage={null} view={view} onCamera={noop} fitToView readOnly motionPreview={pose} />
        </PreviewBoundary>
      </div>
      <p>{scribeFillerMarks(value)}</p>
      <p>Blank · {[1, 0, 2].map((axis) => formatPreciseInches(value.filler.size[axis])).join(" × ")} (length × width × thickness).</p>
      {value.match && <p>Use {partLabel(project, value.match.piece.id)} · {value.match.operations.map(({ text }) => text).join(" · ") || "Fits as measured."}</p>}
      {cut && <label className="checkbox-field">
        <input type="checkbox" checked={saveCut} onChange={(event) => setSaveCut(event.target.checked)} />
        Save the blank cut order and expected remnant
      </label>}
      {changes.length > 0 ? <section aria-label="Changes to saved movement" className="field-section">
        <h3>Changes to saved movement</h3>
        <ul>{changes.map(({ id, label, detail, show }) => <li key={id}>
          <p>{label} · {detail}</p>
          {show && <button type="button" className="text-button" onClick={() => setPose(show())}>Show contact in 3D</button>}
        </li>)}</ul>
        {pose && <button type="button" className="text-button" onClick={() => setPose(undefined)}>Return to closed view</button>}
      </section> : !!project.motionPlans?.length && <p>No new clearance findings in the saved movement tests.</p>}
      <button type="button" className="button primary" onClick={apply}>Add filler to project</button>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="small-note">{scribeScope} <a href={scribeInstallation} target="_blank" rel="noreferrer">Cabinet filler installation guide</a></p>
  </>;
}
