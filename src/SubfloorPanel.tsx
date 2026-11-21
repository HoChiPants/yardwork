import { useMemo, useState } from "react";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { isSubfloorPanel, subfloorBlockingLines, subfloorReviews } from "./subfloor";
import { workshopAsset } from "./workshopTransport";
import { subfloorNailing, subfloorNails, subfloorReference, subfloorScope } from "./subfloorReference";

type Props = {
  project: Project;
  initialId?: string;
  onShow: (id: string) => void;
  onTrack: (id: string, enabled: boolean) => void;
};

export function SubfloorPanel({ project, initialId, onShow, onTrack }: Props) {
  const saved = project.subfloorChecks ?? [];
  const panels = useMemo(() => project.pieces.filter((piece) =>
    isSubfloorPanel(piece) || project.subfloorChecks?.includes(piece.id)), [project]);
  const options = [...new Set([...panels.map(({ id }) => id), ...saved])];
  const [id, setId] = useState(() => initialId && options.includes(initialId) ? initialId : saved[0] ?? options[0] ?? "");
  const review = useMemo(() => subfloorReviews(project, id ? [id] : [])[0], [project, id]);
  const layout = review?.layout;
  const tracking = saved.includes(id);
  return <>
    <h2 id="modal-title">Check subfloor support</h2>
    <p>{subfloorScope}</p>
    {options.length ? <label className="field">Subfloor sheet
      <select value={id} onChange={(event) => setId(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>
          {partLabel(project, option)} · {panels.find(({ id }) => id === option)?.name ?? "Missing panel"}
          {saved.includes(option) ? " · Saved check" : ""}
        </option>)}
      </select>
    </label> : <>
      <p>Add a 23/32 in T&amp;G OSB subfloor sheet and model the solid wood joists beneath it.</p>
      <p><a href={workshopAsset("/examples/flooring/subfloor.yardwork.json")} download>Download the subfloor blocking study</a></p>
    </>}
    {review?.problem && <p role="alert" className="form-error">{review.problem}</p>}
    {layout && <section className="field-section" aria-label="Subfloor support preview">
      <p><strong>{layout.joistCount} continuous joist lines</strong>{layout.widest > 0 && <> · Widest spacing {formatPreciseInches(layout.widest)} on center</>}</p>
      {layout.issues.length > 0 ? <ul>{layout.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> :
        <p>All four edges have modeled backing and the joist spacing is within the panel reference.</p>}
      {layout.blocking.length > 0 && <details open><summary>Fitted blocking cut estimates</summary>
        <ul>{subfloorBlockingLines(project, layout.blocking).map((line) => <li key={line}>{line}</li>)}</ul>
      </details>}
      {layout.nails.length > 0 && <>
        <p><strong>{layout.nails.length} estimated panel nailing locations</strong></p>
        <p className="small-note">{subfloorNailing}</p>
      </>}
      <div className="inline">
        <button type="button" className="button secondary" onClick={() => onShow(id)}>Show support in 3D</button>
        {!tracking && <button type="button" className="button primary" onClick={() => onTrack(id, true)}>Save check to guide</button>}
      </div>
    </section>}
    {tracking && <button type="button" className="text-button" onClick={() => onTrack(id, false)}>Remove saved check</button>}
    <p className="small-note"><a href={subfloorReference.guide} target="_blank" rel="noreferrer">APA floor construction</a>{" · "}
      <a href={subfloorReference.specification} target="_blank" rel="noreferrer">APA Table 14 and Figure 1</a>{" · "}
      <a href={subfloorReference.code} target="_blank" rel="noreferrer">2021 IRC floor table (Seattle edition)</a>
      {layout?.nails.length ? <> · <a href={subfloorNails.listing} target="_blank" rel="noreferrer">8d common nail example</a></> : null}</p>
  </>;
}
