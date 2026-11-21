import { useMemo } from "react";
import type { Project } from "./model";
import { longSupportSpan, waterSupportNetwork, waterSupportSpanLine } from "./waterSupportNetwork";
import { waterSupportReference } from "./waterSupportReference";
import { pexInstallation } from "./wallWaterReference";

export function WaterSupportPanel({ project, onPlanRun, onInspect }: {
  project: Project;
  onPlanRun: (runId: string) => void;
  onInspect: (pieceId: string) => void;
}) {
  const review = useMemo(() => waterSupportNetwork(project), [project]);
  const large = review.spans.filter(longSupportSpan).length;
  return <>
    <h2 id="modal-title">PEX support spacing</h2>
    <p>{review.count} modeled isolators. The spans follow the pipe centerline through checked fittings.</p>
    {review.unresolved.length > 0 && <p className="form-error" role="alert">
      Review changed routes or fittings · {review.unresolved.join(", ")}.
    </p>}
    {review.loop && <p className="form-error" role="alert">Review the unsupported loop before relying on its longest path.</p>}
    {!!project.waterRuns?.length && <details className="field-section">
      <summary>Set up isolators on a line</summary>
      <ul>{project.waterRuns.map((run) => <li key={run.id}>
        <button type="button" className="text-button" onClick={() => onPlanRun(run.id)}>{run.name}</button>
        {" · "}{run.isolators?.length ?? 0} in plan
      </li>)}</ul>
    </details>}
    {!!review.spans.length && <section className="field-section" aria-label="Modeled pipe spans">
      <h3>{large ? "Long reaches to review" : "Measured support paths"}</h3>
      <p className="small-note">Review the 32 in horizontal spacing and the actual fixture support at each open end.</p>
      <ul className="code-review-list">{review.spans.map((span, index) =>
        <li key={`${span.from.key}/${span.to.key}/${index}`}>
          <strong>{waterSupportSpanLine(span)}</strong>
          {longSupportSpan(span) && <p className="small-note">Above the 32 in reference.</p>}
          <div className="two-col">
            {[span.from, span.to].flatMap(({ kind, pieceId, label }) => kind === "support" && pieceId
              ? [<button type="button" className="text-button" key={pieceId} onClick={() => onInspect(pieceId)}>
                Inspect {label}
              </button>]
              : [])}
          </div>
        </li>)}</ul>
    </section>}
    <p className="small-note">
      <a href={pexInstallation} target="_blank" rel="noreferrer">RWC PEX support guidance</a>{" · "}
      <a href={waterSupportReference.code} target="_blank" rel="noreferrer">IRC piping support table</a>{" · "}
      <a href={waterSupportReference.instructions} target="_blank" rel="noreferrer">HoldRite installation</a>
    </p>
  </>;
}
