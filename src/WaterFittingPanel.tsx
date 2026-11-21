import { useMemo, useState } from "react";
import { ZodError } from "zod";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import type { Project } from "./model";
import { previewWaterFitting } from "./waterFittingApply";
import { maxFittingInstructions, maxInsertionChart, waterFittingProducts } from "./waterFittingReference";
import type { WaterFitting, WaterRunEnd } from "./waterFittingSchema";
import { fittingLabel, reviewWaterFitting, waterFittingChoice, waterPortKey } from "./waterFittings";

type Proposal = ReturnType<typeof previewWaterFitting>;

export function WaterFittingPanel({ project, initialFitting, onApply, onRemove }: {
  project: Project;
  initialFitting?: string;
  onApply: (value: Proposal) => void;
  onRemove: (value: WaterFitting) => void;
}) {
  const fittings = project.waterFittings ?? [];
  const [selected, select] = useState(initialFitting ?? "");
  const current = fittings.find(({ id }) => id === selected);
  return <>
    <h2 id="modal-title">Connect PEX runs</h2>
    {!!fittings.length && <label className="field">Connection
      <select value={selected} onChange={(event) => select(event.target.value)}>
        <option value="">New connection</option>
        {fittings.map((item) => {
          const from = project.waterRuns?.find(({ id }) => id === item.a.runId)?.name;
          const to = project.waterRuns?.find(({ id }) => id === item.b.runId)?.name;
          return <option key={item.id} value={item.id}>{[from, to, waterFittingProducts[item.materialId].model].filter(Boolean).join(" · ")}</option>;
        })}
      </select>
    </label>}
    {(project.waterRuns?.length ?? 0) >= 2
      ? <FittingFields key={selected} project={project} current={current} onApply={onApply} />
      : <p>Add two wall water lines to connect their measured ends.</p>}
    {current && <p>
      <button type="button" className="text-button" onClick={() => onRemove(current)}>Remove fitting</button>
      <span className="small-note"> The two pipe cuts stay in the plan.</span>
    </p>}
  </>;
}

function FittingFields({ project, current, onApply }: { project: Project; current?: WaterFitting; onApply: (value: Proposal) => void }) {
  const runs = project.waterRuns!;
  const [a, setA] = useState<WaterRunEnd>(current?.a ?? { runId: runs[0].id, end: "end" });
  const [b, setB] = useState<WaterRunEnd>(current?.b ?? { runId: runs[1].id, end: "start" });
  const [reach, setReach] = useState<[number, number]>(current?.reach ?? [NaN, NaN]);
  const [review, setReview] = useState<{ source: Project; value: Proposal } | null>(null);
  const [error, setError] = useState("");
  const preview = review?.source === project ? review.value : null;
  const remnants = preview?.stock?.bins.flatMap(({ sourceId, remaining }) => !sourceId && remaining > 1e-6 ? [formatStockLength(remaining)] : []) ?? [];
  const savedProblem = useMemo(() => current ? reviewWaterFitting(project, current).problem : undefined, [project, current]);
  const selection = useMemo(() => {
    try {
      return { choice: waterFittingChoice(project, a, b, current?.id) };
    } catch (issue) {
      return { issue: issue instanceof Error ? issue.message : "Choose two valid pipe ends." };
    }
  }, [project, a, b, current?.id]);
  const reserved = new Set((project.waterFittings ?? []).filter(({ id }) => id !== current?.id).flatMap((row) => [row.a, row.b]).map(waterPortKey));
  const ports = runs.flatMap((run) => (["start", "end"] as const).map((end) => ({ runId: run.id, end, label: `${run.name} · ${end}` })));
  const choice = selection.choice, straight = choice?.product.kind === "coupling";
  function endpoint(label: string, value: WaterRunEnd, update: (port: WaterRunEnd) => void) {
    return <label className="field">{label}
      <select value={waterPortKey(value)} onChange={(event) => {
        const chosen = ports.find((p) => waterPortKey(p) === event.target.value);
        if (!chosen) return;
        update({ runId: chosen.runId, end: chosen.end });
        setReach([NaN, NaN]); setReview(null); setError("");
      }}>
        {!ports.some((port) => waterPortKey(port) === waterPortKey(value)) && <option value={waterPortKey(value)}>Missing pipe end</option>}
        {ports.map((port) => <option key={waterPortKey(port)} value={waterPortKey(port)} disabled={reserved.has(waterPortKey(port))}>{port.label}</option>)}
      </select>
    </label>;
  }
  const setDimensions = (value: [number, number]) => { setReach(value); setReview(null); setError(""); };
  function runPreview() {
    setError(""); setReview(null);
    try {
      if (!reach.every(Number.isFinite)) throw Error("Enter the measured fitting dimensions.");
      setReview({ source: project, value: previewWaterFitting(project, { a, b, reach }, current?.id) });
    } catch (issue) {
      setError(issue instanceof ZodError ? issue.issues[0]?.message ?? "Review the fitting dimensions."
        : issue instanceof Error ? issue.message : "The pipe connection needs review.");
    }
  }
  return <>
    {savedProblem && <p className="form-error" role="alert">{savedProblem}</p>}
    <div className="two-col">
      {endpoint("Pipe end A", a, setA)}
      {endpoint("Pipe end B", b, setB)}
    </div>
    {selection.issue && <p role="status">{selection.issue}</p>}
    {choice && <>
      <p><strong>{fittingLabel(choice.product)}</strong> · {dim(choice.product.insertion)} insertion per pipe</p>
      <p className="small-note">{straight
        ? `Measure between the two socket faces on the delivered coupling. Published overall length is ${dim(choice.product.body)}.`
        : `Measure along each leg from the intersection of the pipe centerlines to its socket face. The published envelope suggests about ${dim(choice.nominalReach)} per leg.`}</p>
      {straight ? <LengthInput label="Measured face-to-face length" min={0.125} max={12}
        value={2 * reach[0]} onChange={(value) => setDimensions([value / 2, value / 2])} />
        : <div className="two-col">
          <LengthInput label="Center to socket A" min={0.125} max={6} value={reach[0]} onChange={(value) => setDimensions([value, reach[1]])} />
          <LengthInput label="Center to socket B" min={0.125} max={6} value={reach[1]} onChange={(value) => setDimensions([reach[0], value])} />
        </div>}
      <button type="button" className="button secondary" onClick={runPreview}>Preview connection</button>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <section className="field-section" aria-label="PEX connection proposal">
      <ul>{preview.pipeCuts.map((cut, i) => <li key={i}>{cut.label} · {formatStockLength(cut.before)} → <strong>{formatStockLength(cut.after)} cut</strong>{cut.reused ? ` · Use ${cut.reused}` : ""}</li>)}</ul>
      {preview.stock && <p>{preview.stock.quantity} new {preview.stock.quantity === 1 ? "stick" : "sticks"} of this pipe size for the project.
        {!!remnants.length && ` Planned remnants from new sticks · ${remnants.join(" + ")}.`}
      </p>}
      {preview.affectedConnections > 0 && <p>{preview.affectedConnections} modeled attachments on replaced parts will be removed.</p>}
      <p>Check space to move the actual pipes into the sockets before assembly.</p>
      <button type="button" className="button primary" onClick={() => onApply(preview)}>{current ? "Update connection" : "Add connection"}</button>
    </section>}
    {choice && <p className="small-note">
      <a href={`https://www.homedepot.com/p/${choice.product.internet}`} target="_blank" rel="noreferrer">Exact fitting</a>{" · "}
      <a href={maxInsertionChart} target="_blank" rel="noreferrer">Insertion chart</a>{" · "}
      <a href={maxFittingInstructions} target="_blank" rel="noreferrer">SharkBite installation</a>
    </p>}
  </>;
}
