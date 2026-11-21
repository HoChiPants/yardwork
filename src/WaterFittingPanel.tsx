import { useMemo, useState } from "react";
import { ZodError } from "zod";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import { material, type Project } from "./model";
import { previewSplitWaterMain, previewWaterFitting } from "./waterFittingApply";
import { maxFittingInstructions, maxInsertionChart, waterFittingProducts } from "./waterFittingReference";
import { waterFittingPorts, type WaterFitting, type WaterRunEnd } from "./waterFittingSchema";
import { fittingLabel, reviewWaterFitting, splitWaterMainChoice, waterFittingChoice, waterPortKey } from "./waterFittings";

type Proposal = ReturnType<typeof previewWaterFitting> & { split?: ReturnType<typeof previewSplitWaterMain>["split"] };
type ConnectionMode = "two" | "tee" | "split";

export function WaterFittingPanel({ project, initialFitting, startWithTee, onApply, onRemove }: {
  project: Project;
  initialFitting?: string;
  startWithTee?: boolean;
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
          const names = waterFittingPorts(item).map(({ runId }) => project.waterRuns?.find(({ id }) => id === runId)?.name);
          return <option key={item.id} value={item.id}>{[...names, waterFittingProducts[item.materialId].model].filter(Boolean).join(" · ")}</option>;
        })}
      </select>
    </label>}
    {(project.waterRuns?.length ?? 0) >= 2
      ? <FittingFields key={selected} project={project} current={current} startWithTee={startWithTee} onApply={onApply} />
      : <p>Add two wall water lines to connect their measured ends.</p>}
    {current && <p>
      <button type="button" className="text-button" onClick={() => onRemove(current)}>Remove fitting</button>
      <span className="small-note"> The pipe cuts stay in the plan.</span>
    </p>}
  </>;
}

function FittingFields({ project, current, startWithTee, onApply }: {
  project: Project; current?: WaterFitting; startWithTee?: boolean; onApply: (value: Proposal) => void;
}) {
  const runs = project.waterRuns!;
  const [mode, setMode] = useState<ConnectionMode>(current ? (current.branch ? "tee" : "two") : startWithTee ? "split" : "two");
  const [a, setA] = useState<WaterRunEnd>(current?.a ?? { runId: runs[0].id, end: "end" });
  const [b, setB] = useState<WaterRunEnd>(current?.b ?? { runId: runs[1].id, end: "start" });
  const [branch, setBranch] = useState<WaterRunEnd>(current?.branch?.port ?? {
    runId: (runs[mode === "tee" ? 2 : 1] ?? runs[1]).id, end: "start",
  });
  const [reach, setReach] = useState<[number, number]>(current?.reach ?? [NaN, NaN]);
  const [branchReach, setBranchReach] = useState(current?.branch?.reach ?? NaN);
  const [review, setReview] = useState<{ source: Project; value: Proposal } | null>(null);
  const [error, setError] = useState("");
  const preview = review?.source === project ? review.value : null;
  const savedProblem = useMemo(() => current ? reviewWaterFitting(project, current).problem : undefined, [project, current]);
  const selection = useMemo(() => {
    try {
      const choice = mode === "split" ? splitWaterMainChoice(project, a.runId, branch)
        : waterFittingChoice(project, mode === "tee" ? [a, b, branch] : [a, b], current?.id);
      return { choice };
    } catch (issue) {
      return { issue: issue instanceof Error ? issue.message : "Choose two valid pipe ends." };
    }
  }, [project, mode, a, b, branch, current?.id]);
  const reserved = new Set((project.waterFittings ?? []).filter(({ id }) => id !== current?.id).flatMap(waterFittingPorts).map(waterPortKey));
  const ports = runs.flatMap((run) => (["start", "end"] as const).map((end) => ({ runId: run.id, end, label: `${run.name} · ${end}` })));
  const choice = selection.choice, tee = mode !== "two", straight = choice?.product.kind === "coupling";
  const reset = () => { setReach([NaN, NaN]); setBranchReach(NaN); setReview(null); setError(""); };
  function endpoint(label: string, value: WaterRunEnd, update: (port: WaterRunEnd) => void) {
    return <label className="field">{label}
      <select value={waterPortKey(value)} onChange={(event) => {
        const chosen = ports.find((p) => waterPortKey(p) === event.target.value);
        if (!chosen) return;
        update({ runId: chosen.runId, end: chosen.end });
        reset();
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
      if (!reach.every(Number.isFinite) || (tee && !Number.isFinite(branchReach)))
        throw Error("Enter the measured fitting dimensions.");
      const value = mode === "split"
        ? previewSplitWaterMain(project, { mainId: a.runId, branch, inlineLength: 2 * reach[0], branchReach })
        : previewWaterFitting(project, { a, b, reach, ...(tee && { branch: { port: branch, reach: branchReach } }) }, current?.id);
      setReview({ source: project, value });
    } catch (issue) {
      setError(issue instanceof ZodError ? issue.issues[0]?.message ?? "Review the fitting dimensions."
        : issue instanceof Error ? issue.message : "The pipe connection needs review.");
    }
  }
  return <>
    {savedProblem && <p className="form-error" role="alert">{savedProblem}</p>}
    {!current && <label className="field">Connection type
      <select value={mode} onChange={(event) => {
        const next = event.target.value as ConnectionMode;
        setMode(next);
        if (next === "tee") setBranch({ runId: runs[2].id, end: "start" });
        reset();
      }}>
        <option value="two">Coupling or elbow</option>
        <option value="split">Tee into a continuous main</option>
        {runs.length >= 3 && <option value="tee">Tee between three pipe ends</option>}
      </select>
    </label>}
    {mode === "split" ? <div className="two-col">
      <label className="field">Main to split
        <select value={a.runId} onChange={(event) => {
          setA({ runId: event.target.value, end: "end" }); reset();
        }}>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.name}</option>)}
        </select>
      </label>
      {endpoint("Branch pipe end", branch, setBranch)}
    </div> : <>
      <div className="two-col">
        {endpoint(tee ? "Inline pipe end A" : "Pipe end A", a, setA)}
        {endpoint(tee ? "Inline pipe end B" : "Pipe end B", b, setB)}
      </div>
      {tee && endpoint("Branch pipe end", branch, setBranch)}
    </>}
    {selection.issue && <p role="status">{selection.issue}</p>}
    {choice && <>
      <p><strong>{fittingLabel(choice.materialId)}</strong> · {dim(choice.product.insertion)} {tee ? "inline insertion" : "insertion per pipe"}
        {choice.product.branch && ` · ${dim(choice.product.branch.insertion)} branch insertion`}</p>
      <p className="small-note">{tee
        ? `Measure between the two inline faces and from their centerline to the branch face. Published dimensions suggest ${dim(choice.product.body)} inline and ${dim(choice.nominalBranchReach!)} to the branch face.`
        : straight
        ? `Measure between the two socket faces on the delivered coupling. Published overall length is ${dim(choice.product.body)}.`
        : `Measure along each leg from the intersection of the pipe centerlines to its socket face. The published envelope suggests about ${dim(choice.nominalReach)} per leg.`}</p>
      {tee ? <div className="two-col">
        <LengthInput label="Measured inline face-to-face length" min={0.125} max={12}
          value={2 * reach[0]} onChange={(value) => setDimensions([value / 2, value / 2])} />
        <LengthInput label="Main centerline to branch socket" min={0.125} max={6}
          value={branchReach} onChange={(value) => { setBranchReach(value); setReview(null); setError(""); }} />
      </div> : straight ? <LengthInput label="Measured face-to-face length" min={0.125} max={12}
        value={2 * reach[0]} onChange={(value) => setDimensions([value / 2, value / 2])} />
        : <div className="two-col">
          <LengthInput label="Center to socket A" min={0.125} max={6} value={reach[0]} onChange={(value) => setDimensions([value, reach[1]])} />
          <LengthInput label="Center to socket B" min={0.125} max={6} value={reach[1]} onChange={(value) => setDimensions([reach[0], value])} />
        </div>}
      <button type="button" className="button secondary" onClick={runPreview}>Preview connection</button>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {preview && <section className="field-section" aria-label="PEX connection proposal">
      {preview.split && <p>{preview.split.name} · {dim(preview.split.before)} main becomes {dim(preview.split.left)} + {dim(preview.split.right)}.
        {preview.split.recorded
          ? ` ${dim(preview.split.trim)} center trim goes to the Cut pool. Both main pieces keep their recorded stock source.`
          : ` The tee leaves ${dim(preview.split.removed)} between the seated ends. Review the new stock cut order in List.`}
      </p>}
      <ul>{preview.pipeCuts.map((cut, i) => <li key={i}>{cut.label} · {Math.abs(cut.before - cut.after) > 1e-6 && `${formatStockLength(cut.before)} → `}<strong>{formatStockLength(cut.after)} cut</strong>{cut.reused ? ` · Use ${cut.reused}` : ""}</li>)}</ul>
      {preview.stocks.map((stock) => {
        const remnants = stock.bins.flatMap(({ sourceId, remaining }) => !sourceId && remaining > 1e-6 ? [formatStockLength(remaining)] : []);
        return <p key={stock.id}>{stock.quantity} new {stock.quantity === 1 ? "stick" : "sticks"} of {material(stock.id).name}.
          {!!remnants.length && ` Planned remnants from new sticks · ${remnants.join(" + ")}.`}
        </p>;
      })}
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
