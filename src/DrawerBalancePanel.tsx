import { useMemo, useState } from "react";
import {
  drawerBalanceCabinets, drawerBalancePhysics, drawerBalanceReference, drawerBalanceScope, drawerBalanceText,
  drawerBalanceTitle, previewDrawerBalance, saveDrawerBalance,
} from "./drawerBalance";
import type { DrawerBalanceInput } from "./drawerBalanceSchema";
import { bounds } from "./engine";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import { Scene } from "./Scene";
import type { Project } from "./model";
import "./DrawerBalancePanel.css";

const iso = { preset: "iso", nonce: 0 };
const noop = () => {};
type Cabinet = ReturnType<typeof drawerBalanceCabinets>[number];
type Balance = ReturnType<typeof previewDrawerBalance>;

export function DrawerBalancePanel({ project, initialSection, onSave }: {
  project: Project;
  initialSection?: string;
  onSave: (next: Project, source: Project) => void;
}) {
  const choices = useMemo(() => drawerBalanceCabinets(project), [project]);
  const [sectionId, select] = useState(() => {
    const preferred = initialSection ?? project.drawerBalancePlans?.[0]?.input.sectionId;
    return choices.some(({ section }) => section.id === preferred) ? preferred! : choices[0]?.section.id ?? "";
  });
  const cabinet = choices.find(({ section }) => section.id === sectionId);
  return <>
    <h2 id="modal-title">{drawerBalanceTitle}</h2>
    {choices.length === 0 ? <p>Fit a saved drawer slide whose two mounts belong to the same fixed cabinet section.</p> : <>
      <label className="field">Cabinet
        <select value={cabinet ? sectionId : ""} onChange={({ currentTarget }) => select(currentTarget.value)}>
          {!cabinet && <option value="">Choose a cabinet</option>}
          {choices.map(({ section, plans }) => <option key={section.id} value={section.id}>
            {section.name} ({plans.length} {plans.length === 1 ? "drawer" : "drawers"})
          </option>)}
        </select>
      </label>
      {cabinet && <BalanceForm key={sectionId} project={project} cabinet={cabinet} onSave={onSave} />}
    </>}
    <p className="small-note">{drawerBalanceScope} <a href={drawerBalanceReference} target="_blank" rel="noreferrer">CPSC stability testing</a>{" · "}
      <a href={drawerBalancePhysics} target="_blank" rel="noreferrer">How the balance point shifts</a></p>
  </>;
}

function BalanceForm({ project, cabinet, onSave }: {
  project: Project;
  cabinet: Cabinet;
  onSave: (next: Project, source: Project) => void;
}) {
  const saved = project.drawerBalancePlans?.find(({ input }) => input.sectionId === cabinet.section.id);
  const [input, setInput] = useState<DrawerBalanceInput>(() => ({
    sectionId: cabinet.section.id,
    loadedWeight: saved?.input.loadedWeight ?? NaN,
    closedSetback: saved?.input.closedSetback ?? NaN,
    drawers: cabinet.plans.map(({ id, mechanism }) =>
      saved?.input.drawers.find(({ motionId }) => motionId === id) ?? { motionId: id, weight: NaN, extension: mechanism.travel }),
  }));
  const current = useMemo(() => {
    if (!saved) return {};
    try {
      return { report: previewDrawerBalance(project, saved.input, saved.geometryKey) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Review the saved balance estimate." };
    }
  }, [project, saved]);
  const [draft, setDraft] = useState<{ source: Project; report: Balance }>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState(1);
  const report = draft?.source === project ? draft.report : editing ? undefined : current.report;
  const pose = show ? report?.previewAt(progress) : undefined;
  function update(next: DrawerBalanceInput) {
    setEditing(true);
    setShow(false);
    setProgress(1);
    setDraft(undefined);
    setError("");
    setInput(next);
  }
  const present = Number.isFinite(input.loadedWeight) && Number.isFinite(input.closedSetback) &&
    input.drawers.every(({ weight, extension }) => Number.isFinite(weight) && Number.isFinite(extension));
  return <>
    <form onSubmit={(event) => {
      event.preventDefault();
      setShow(false);
      setProgress(1);
      setError("");
      try {
        setDraft({ source: project, report: previewDrawerBalance(project, input) });
      } catch (cause) {
        setDraft(undefined);
        setError(cause instanceof Error ? cause.message : "Check the balance inputs.");
      }
    }}>
      <p>Use estimated or documented loaded weights and the closed cabinet’s balance point. Enter its distance behind the front floor contact. A negative distance places it forward of that line.</p>
      <div className="two-col">
        <label className="field">Total loaded cabinet weight (lb)
          <input type="number" min="0.01" max="2000" step="any" required
            value={Number.isFinite(input.loadedWeight) ? input.loadedWeight : ""}
            onChange={({ currentTarget }) => update({ ...input, loadedWeight: currentTarget.valueAsNumber })} />
        </label>
        <LengthInput label="Closed balance point behind front floor contact" value={input.closedSetback}
          min={-120} max={120} required onChange={(closedSetback) => update({ ...input, closedSetback })} />
      </div>
      {input.drawers.map((drawer, index) => {
        const plan = cabinet.plans[index];
        function edit(values: Partial<(typeof input.drawers)[number]>) {
          update({ ...input, drawers: input.drawers.map((item, i) => i === index ? { ...item, ...values } : item) });
        }
        return <fieldset key={drawer.motionId} className="drawer-balance-load">
          <legend>{plan.label}</legend>
          <div className="two-col">
            <label className="field">Loaded drawer weight (lb)
              <input aria-label={`${plan.label} loaded weight`} type="number" min="0.01" max="2000" step="any" required
                value={Number.isFinite(drawer.weight) ? drawer.weight : ""}
                onChange={({ currentTarget }) => edit({ weight: currentTarget.valueAsNumber })} />
            </label>
            <LengthInput label="Requested extension" ariaLabel={`${plan.label} extension`} value={drawer.extension}
              min={0} max={plan.mechanism.travel} required onChange={(extension) => edit({ extension })} />
          </div>
        </fieldset>;
      })}
      <button type="submit" className="button secondary" disabled={!present}>Preview drawer balance</button>
    </form>
    {(error || (!report && current.error)) && <p role="alert" className="form-error">{error || current.error}</p>}
    {report && <section className="field-section" aria-label="Drawer balance result">
      <BalanceDiagram report={report} />
      <dl className="drawer-balance-results">
        <div><dt>All drawers closed</dt><dd>{drawerBalanceText(report.closed)}</dd></div>
        <div><dt>Largest individual shift · {report.largest.plan.label}</dt><dd>{drawerBalanceText(report.single)}</dd></div>
        <div><dt>At requested openings</dt><dd>{drawerBalanceText(report.combined)}</dd></div>
      </dl>
      {report.crossing !== undefined && report.crossing > 0 && <p role="status">
        The combined balance point reaches the support line at {Number((report.crossing * 100).toFixed(1))}% of the requested openings.
      </p>}
      {report.travelMessage && <p>{report.travelMessage} At the last checked pose the balance point is {drawerBalanceText(report.reached).toLowerCase()}.</p>}
      {report.pose && <button type="button" className="text-button" onClick={() => setShow(!show)}>
        {show ? "Hide drawer positions" : "Show drawer positions in 3D"}
      </button>}
      {report && pose && <>
        <label className="field">Drawer opening progress
          <input type="range" min={0} max={report.fraction * 100} step="any" value={Math.min(progress, report.fraction) * 100}
            onChange={({ currentTarget }) => setProgress(currentTarget.valueAsNumber / 100)} />
        </label>
        <p>At this position · {drawerBalanceText(report.balanceAt(progress)).toLowerCase()}.</p>
        <div className="idea-preview" aria-label="Modeled drawer positions">
        <PreviewBoundary><Scene project={{ ...project, pieces: project.pieces.filter((piece) => {
          if (piece.offcut) return false;
          const box = bounds(piece);
          const area = pose.bounds;
          return box.min.every((value, axis) => value <= area.max[axis] + 12 && box.max[axis] >= area.min[axis] - 12);
        }) }} selected={null} onSelect={noop} onMove={noop} selectedSectionId={null} onSectionMove={noop}
          mode="rotate" snap={false} explode={false} xray={false} stage={null} view={iso} onCamera={noop}
          fitToView readOnly motionPreview={pose} /></PreviewBoundary>
        </div>
      </>}
      {draft?.source === project && <button type="button" className="button primary full" onClick={() => {
        try {
          onSave(saveDrawerBalance(project, draft.report), project);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save the balance check.");
        }
      }}>Save balance check</button>}
    </section>}
  </>;
}

function BalanceDiagram({ report }: { report: Balance }) {
  const extent = Math.max(1, Math.abs(report.closed), Math.abs(report.combined)) * 1.15;
  const left = (value: number) => `${(1 - value / extent) * 50}%`;
  return <figure className="drawer-balance-diagram" aria-label="Balance point relative to the front support line">
    <div className="drawer-balance-axis" aria-hidden="true">
      <span className="drawer-balance-pivot" />
      <span className="drawer-balance-dot closed" style={{ left: left(report.closed) }} />
      <span className="drawer-balance-dot requested" style={{ left: left(report.combined) }} />
    </div>
    <figcaption>Closed position in grey · front support line in the center · requested openings in orange</figcaption>
  </figure>;
}
