import { useMemo, useState } from "react";
import { addHomeDepotPurchaseNeed } from "./handoffPurchases";
import { countertopEdgeMarker, countertopOptions, countertopSealPurchase, countertopSealRunText, countertopWallOptions,
  previewCountertopSeal, reviewCountertopSeals, saveCountertopSeal } from "./countertopSeal";
import { countertopSealScope, countertopSealant } from "./countertopSealReference";
import { countertopEdges, type CountertopSealInput, type CountertopSealSpan } from "./countertopSealSchema";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import { trimBackerRods } from "./trimBackerRodReference";
import type { TrimSeamMarker } from "./trimSeamGeometry";
import { trimBackerRodCutPlan, trimBackerRodGuideLines } from "./woodJointDecisions";

type Preview = ReturnType<typeof previewCountertopSeal>;
const draftSpan = (kind: CountertopSealSpan["kind"], start: number, end: number): CountertopSealSpan => {
  if (kind === "leave-open") return { kind, start, end };
  if (kind === "corner") return { kind, start, end, width: NaN };
  return { kind, start, end, width: NaN, cavityDepth: NaN, rodId: "frost-king-c23h", coverage: NaN, dryFit: false };
};

export function CountertopSealPanel({ project, initialPlanId, initialTopId, initiallyOpen, onApply, onShow, onChange }: {
  project: Project;
  initialPlanId?: string;
  initialTopId?: string;
  initiallyOpen?: boolean;
  onApply: (candidate: Project, source: Project) => void;
  onShow: (marker: TrimSeamMarker | null) => void;
  onChange: (project: Project) => void;
}) {
  const tops = useMemo(() => countertopOptions(project), [project]);
  const walls = useMemo(() => countertopWallOptions(project), [project]);
  const saved = useMemo(() => reviewCountertopSeals(project), [project]);
  const first = tops.find(({ id }) => id === initialTopId) ?? tops[0];
  const create = (): CountertopSealInput => ({
    id: uid(), topId: first?.id ?? "", wallId: walls[0]?.id ?? "", edge: "-Z",
    session: "Countertop sealing", spans: [draftSpan("corner", 0, first?.size[0] ?? NaN)],
  });
  const [input, setInput] = useState<CountertopSealInput>(() => saved.find(({ plan }) => plan.id === initialPlanId)?.plan ?? create());
  const [draft, setDraft] = useState<{ source: Project; preview: Preview; candidate?: Project }>();
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const live = draft?.source === project ? draft : undefined;
  const record = saved.find(({ plan }) => plan.id === input.id);
  const report = live?.preview ?? (!dirty ? record?.preview : null);
  const quantity = useMemo(() => countertopSealPurchase(project), [project]);
  const backingLines = useMemo(() => {
    if (!live?.candidate && (dirty || !record?.preview)) return [];
    const allocation = trimBackerRodCutPlan(live?.candidate ?? project);
    return trimBackerRodGuideLines(allocation.filter(({ hasCountertop }) => hasCountertop));
  }, [dirty, live, project, record]);
  const worktop = tops.find(({ id }) => id === input.topId);
  const edgeSpan = worktop?.size[input.edge.endsWith("Z") ? 0 : 2];
  const missing = Math.max(0, (quantity.count ?? 0) - quantity.selected);

  function update(fn: (plan: CountertopSealInput) => CountertopSealInput) {
    setInput(fn);
    setDraft(undefined);
    setDirty(true);
    setError("");
    onShow(null);
  }
  function editSpan(index: number, mapper: (span: CountertopSealSpan) => CountertopSealSpan) {
    update((plan) => ({ ...plan, spans: plan.spans.map((row, i) => i === index ? mapper(row) : row) }));
  }
  if (!tops.length && !saved.length) return null;
  return <details className="field-section" id="countertop-seal" open={initiallyOpen || undefined}>
    <summary>Plan countertop splash seal</summary>
    {saved.length > 0 && <label className="field">Saved countertop seal
      <select value={record?.plan.id ?? ""} onChange={({ currentTarget }) => {
        const previous = saved.find(({ plan }) => plan.id === currentTarget.value);
        update(() => previous?.plan ?? create());
        setDirty(false);
      }}>
        <option value="">New seal</option>
        {saved.map(({ plan }) => <option key={plan.id} value={plan.id}>{partLabel(project, plan.topId)} · {plan.edge} · {plan.session}</option>)}
      </select>
    </label>}
    {record?.issue && !dirty && <p className="form-error" role="alert">{record.issue}</p>}
    <form onSubmit={(event) => {
      event.preventDefault();
      setError("");
      setDraft(undefined);
      try {
        const preview = previewCountertopSeal(project, input);
        const candidate = !preview.issues.length && preview.plannedLength ? saveCountertopSeal(project, input) : undefined;
        setDraft({ source: project, preview, candidate });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Check the marked sealing runs.");
      }
    }}>
      <p className="small-note">Choose the worktop edge and the finished wall beside it. Measure from the start of that edge. Split the run where the gap or backing changes.</p>
      <div className="two-col">
        <label className="field">Worktop
          <select value={input.topId} onChange={({ currentTarget }) => {
            const id = currentTarget.value;
            update((plan) => ({ ...plan, topId: id, spans: [draftSpan("corner", 0,
              tops.find((row) => row.id === id)?.size[plan.edge.endsWith("Z") ? 0 : 2] ?? NaN)] }));
          }}>
            {!tops.some(({ id }) => id === input.topId) && <option value={input.topId}>Choose a worktop</option>}
            {tops.map(({ id, name }) => <option key={id} value={id}>{partLabel(project, id)} · {name}</option>)}
          </select>
        </label>
        <label className="field">Finished wall panel
          <select value={input.wallId} onChange={({ currentTarget }) => {
            const id = currentTarget.value;
            update((plan) => ({ ...plan, wallId: id }));
          }}>
            {!walls.some(({ id }) => id === input.wallId) && <option value={input.wallId}>Choose a finished panel</option>}
            {walls.map(({ id, name }) => <option key={id} value={id}>{partLabel(project, id)} · {name}</option>)}
          </select>
        </label>
        <label className="field">Worktop edge
          <select value={input.edge} onChange={({ currentTarget }) => {
            const edge = currentTarget.value as CountertopSealInput["edge"];
            update((plan) => ({ ...plan, edge, spans: [draftSpan("corner", 0,
              tops.find(({ id }) => id === plan.topId)?.size[edge.endsWith("Z") ? 0 : 2] ?? NaN)] }));
          }}>
            {countertopEdges.map((edge) => <option key={edge} value={edge}>Local {edge}</option>)}
          </select>
        </label>
        <label className="field">Work session
          <input required maxLength={60} value={input.session} onChange={({ currentTarget }) => {
            const session = currentTarget.value;
            update((plan) => ({ ...plan, session }));
          }} />
        </label>
      </div>
      {worktop && <button type="button" className="text-button" onClick={() => onShow(countertopEdgeMarker(worktop, input.edge))}>Show worktop edge start in 3D</button>}
      {input.spans.map((span, index) => <fieldset className="field-section" key={index}>
        <legend>Run {index + 1}</legend>
        <div className="two-col">
          <LengthInput label="Start from edge start" ariaLabel={`Run ${index + 1} start`} value={span.start} min={0} max={edgeSpan} required
            onChange={(start) => editSpan(index, (row) => ({ ...row, start }))} />
          <LengthInput label="End from edge start" ariaLabel={`Run ${index + 1} end`} value={span.end} min={0} max={edgeSpan} required
            onChange={(end) => editSpan(index, (row) => ({ ...row, end }))} />
        </div>
        <label className="field">Run {index + 1} detail
          <select value={span.kind} onChange={({ currentTarget }) => {
            const kind = currentTarget.value as CountertopSealSpan["kind"];
            editSpan(index, (row) => draftSpan(kind, row.start, row.end));
          }}>
            <option value="corner">Tool a corner bead</option>
            <option value="backed">Dry-fit rod and seal</option>
            <option value="leave-open">Leave open for a separate detail</option>
          </select>
        </label>
        {span.kind !== "leave-open" && <div className="two-col">
          <LengthInput label="Widest measured opening" ariaLabel={`Run ${index + 1} widest opening`} value={span.width}
            min={0} max={1} required onChange={(width) => editSpan(index, (row) => row.kind === "leave-open" ? row : { ...row, width })} />
          <label className="field">{span.kind === "backed" ? "Trial coverage" : "Trial coverage (optional)"} · ft per cartridge
            <input type="number" required={span.kind === "backed"} min={0.001} max={500} step="any"
              aria-label={`Run ${index + 1} trial coverage`} value={Number.isFinite(span.coverage) ? span.coverage : ""}
              onChange={({ currentTarget }) => {
                const value = currentTarget.valueAsNumber;
                editSpan(index, (row) => row.kind === "leave-open" ? row : {
                  ...row, coverage: row.kind === "corner" && Number.isNaN(value) ? undefined : value,
                } as CountertopSealSpan);
              }} />
          </label>
        </div>}
        {span.kind === "backed" && <>
          <div className="two-col">
            <LengthInput label="Available cavity depth" ariaLabel={`Run ${index + 1} cavity depth`} value={span.cavityDepth} max={3} required
              onChange={(cavityDepth) => editSpan(index, (row) => row.kind === "backed" ? { ...row, cavityDepth } : row)} />
            <label className="field">Backing rod
              <select value={span.rodId} onChange={({ currentTarget }) => {
                const rodId = currentTarget.value as typeof span.rodId;
                editSpan(index, (row) => row.kind === "backed" ? { ...row, rodId, dryFit: false } : row);
              }}>
                {trimBackerRods.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={span.dryFit} onChange={({ currentTarget }) => {
            const dryFit = currentTarget.checked;
            editSpan(index, (row) => row.kind === "backed" ? { ...row, dryFit } : row);
          }} />Rod was dry-fitted along this run</label>
        </>}
        {input.spans.length > 1 && <button type="button" className="text-button"
          onClick={() => update((plan) => ({ ...plan, spans: plan.spans.filter((_, i) => i !== index) }))}>Remove run {index + 1}</button>}
      </fieldset>)}
      {input.spans.length < 24 && <button type="button" className="text-button" onClick={() =>
        update((plan) => ({ ...plan, spans: [...plan.spans, draftSpan("corner", plan.spans.at(-1)?.end ?? 0, edgeSpan ?? NaN)] }))}>Add seal run</button>}
      <button type="submit" className="button secondary full" disabled={!tops.length || !walls.length}>Check countertop runs</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
    {report && <section className="field-section countertop-seal-result" aria-label="Countertop seal review">
      <h3>Marked seal runs</h3>
      <ul>{report.rows.map((row, index) => <li key={index} className={row.issue ? "form-error" : undefined}>{countertopSealRunText(row)}</li>)}</ul>
      {report.unmarked > 0.00001 && <p>{formatStockLength(report.unmarked)} of the edge remains unmarked.</p>}
      <div className="button-row">
        <button type="button" className="button secondary" onClick={() => onShow(report.marker)}>Show marks in 3D</button>
        {live?.candidate && <button type="button" className="button primary" onClick={() => {
          if (!live.candidate) return;
          try {
            onApply(live.candidate, live.source);
            setDraft(undefined);
            setDirty(false);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save these countertop runs.");
          }
        }}>Save countertop seal</button>}
      </div>
    </section>}
    {backingLines.length > 0 && <details className="field-section">
      <summary>Backer rod cuts and leftovers</summary>
      <ul>{backingLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </details>}
    {quantity.batches.length > 0 && <section className="field-section" aria-label="Countertop seal shopping">
      <p>{quantity.count ?? "Review the sealant count"} planned {quantity.count === 1 ? "cartridge" : "cartridges"} · {quantity.selected} in List.</p>
      {missing > 0 && project.retailer === "home-depot" && <button type="button" className="button secondary" onClick={() => {
        try {
          onChange(addHomeDepotPurchaseNeed(project, countertopSealant.id));
          setError("");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Review the sealant purchase.");
        }
      }}>Add missing sealant to List</button>}
    </section>}
    {record && <button className="text-button" type="button" onClick={() => {
      onChange({ ...project, guideFingerprint: null, countertopSeals: project.countertopSeals?.filter(({ id }) => id !== record.plan.id) });
      update(create);
    }}>Remove saved countertop seal</button>}
    <p className="small-note">{countertopSealScope} <a href={countertopSealant.specification} target="_blank" rel="noreferrer">GE sealant instructions</a></p>
  </details>;
}
