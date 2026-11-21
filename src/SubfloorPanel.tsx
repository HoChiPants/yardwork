import { useMemo, useState } from "react";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { isSubfloorPanel, subfloorBlockingLines, subfloorReviews } from "./subfloor";
import { reviewSubfloorAdhesive } from "./subfloorAdhesive";
import { SubfloorFastenerPlan } from "./SubfloorFastenerPlan";
import { previewSubfloorBlocking, type SubfloorBlockingPreview } from "./subfloorBlocking";
import { workshopAsset } from "./workshopTransport";
import { subfloorAdhesive, subfloorAdhesiveScope, subfloorNailing, subfloorNails, subfloorReference, subfloorScope } from "./subfloorReference";

type Props = {
  project: Project;
  initialId?: string;
  onShow: (id: string, view?: "support" | "adhesive") => void;
  onPreviewBlock: (preview: SubfloorBlockingPreview) => void;
  onTrack: (id: string, enabled: boolean) => void;
  onAdhesive: (id: string, signature: string | null) => void;
  onFastening: React.ComponentProps<typeof SubfloorFastenerPlan>["onSave"];
  onShowFastening: React.ComponentProps<typeof SubfloorFastenerPlan>["onShow"];
};

export function SubfloorPanel({ project, initialId, onShow, onPreviewBlock, onTrack, onAdhesive, onFastening, onShowFastening }: Props) {
  const saved = project.subfloorChecks ?? [];
  const panels = useMemo(() => project.pieces.filter((piece) =>
    isSubfloorPanel(piece) || project.subfloorChecks?.includes(piece.id)), [project]);
  const options = [...new Set([...panels.map(({ id }) => id), ...saved,
    ...(project.subfloorAdhesivePlans ?? []).map(({ panelId }) => panelId),
    ...(project.subfloorNailPlans ?? []).map(({ panelId }) => panelId)])];
  const [id, setId] = useState(() => initialId && options.includes(initialId) ? initialId : saved[0] ?? options[0] ?? "");
  const review = useMemo(() => subfloorReviews(project, id ? [id] : [])[0], [project, id]);
  const layout = review?.layout;
  const adhesive = useMemo(() => review && reviewSubfloorAdhesive(project, review), [project, review]);
  const [confirmed, setConfirmed] = useState(false);
  const tracking = saved.includes(id);
  const [bayId, setBayId] = useState("");
  const [placement, setPlacement] = useState<"under-sheet" | "centered">("under-sheet");
  const [source, setSource] = useState<"prefer-offcut" | "new-board">("prefer-offcut");
  const [error, setError] = useState("");
  const bays = layout?.blocking ?? [];
  const bay = bays.find((item) => item.id === bayId) ?? bays[0];
  function previewBlock() {
    if (!bay) return;
    try {
      onPreviewBlock(previewSubfloorBlocking(project, id, bay.id, placement, source));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review the joists and stock before fitting this block.");
    }
  }
  return <>
    <h2 id="modal-title">Check subfloor support</h2>
    <p>{subfloorScope}</p>
    {options.length ? <label className="field">Subfloor sheet
      <select value={id} onChange={(event) => { setId(event.target.value); setError(""); setConfirmed(false); }}>
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
      {bay && <details open><summary>Fitted blocking cut estimates</summary>
        <ul>{subfloorBlockingLines(project, bays).map((line) => <li key={line}>{line}</li>)}</ul>
        {bays.length > 1 && <label className="field">Blocking bay
          <select value={bay.id} onChange={(event) => { setBayId(event.target.value); setError(""); }}>
            {bays.map((item) => <option key={item.id} value={item.id}>
              {item.edge} · {partLabel(project, item.first.id)} to {partLabel(project, item.second.id)}
            </option>)}
          </select>
        </label>}
        <label className="field">Block alignment
          <select value={placement} onChange={(event) => { setPlacement(event.target.value === "centered" ? "centered" : "under-sheet"); setError(""); }}>
            <option value="under-sheet">Flush under this sheet</option>
            <option value="centered">Centered on the sheet edge</option>
          </select>
        </label>
        <label className="field">Blocking stock
          <select value={source} onChange={(event) => { setSource(event.target.value === "new-board" ? "new-board" : "prefer-offcut"); setError(""); }}>
            <option value="prefer-offcut">Use a matching Cut pool piece if available</option>
            <option value="new-board">Use a new board</option>
          </select>
        </label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button type="button" className="button secondary" onClick={previewBlock}>Preview blocking in 3D</button>
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
    {adhesive && <details className="field-section" open={adhesive.saved}>
      <summary>Subfloor adhesive</summary>
      {adhesive.problem && <p>{adhesive.problem}</p>}
      {adhesive.layout && <>
        <p><strong>{adhesive.layout.runs.length} bead runs · About {(adhesive.layout.inches / 12).toFixed(1)} linear ft</strong></p>
        <p className="small-note">{subfloorAdhesiveScope} <a href={subfloorAdhesive.specification} target="_blank" rel="noreferrer">Adhesive instructions</a></p>
        {!adhesive.planCurrent && <label className="checkbox-field">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          The delivered panel allows this adhesive on these framing surfaces.
        </label>}
        <div className="inline">
          <button type="button" className="button secondary" onClick={() => onShow(id, "adhesive")}>Show adhesive in 3D</button>
          {adhesive.planCurrent ? <span>Adhesive saved</span> :
            <button type="button" className="button primary" disabled={!confirmed}
              onClick={() => { onAdhesive(id, adhesive.layout!.signature); setConfirmed(false); }}>Save adhesive plan</button>}
        </div>
      </>}
      {adhesive.saved && <button type="button" className="text-button" onClick={() => onAdhesive(id, null)}>Remove adhesive plan</button>}
    </details>}
    {review && (layout?.nails.length || project.subfloorNailPlans?.some(({ panelId }) => panelId === id)) ?
      <SubfloorFastenerPlan key={id} project={project} panel={review} onSave={onFastening} onShow={onShowFastening} /> : null}
    {tracking && <button type="button" className="text-button" onClick={() => onTrack(id, false)}>Remove saved check</button>}
    <p className="small-note"><a href={subfloorReference.guide} target="_blank" rel="noreferrer">APA floor construction</a>{" · "}
      <a href={subfloorReference.specification} target="_blank" rel="noreferrer">APA Table 14 and Figure 1</a>{" · "}
      <a href={subfloorReference.code} target="_blank" rel="noreferrer">2021 IRC floor table (Seattle edition)</a>
      {layout?.nails.length ? <> · <a href={subfloorNails.listing} target="_blank" rel="noreferrer">8d common nail example</a></> : null}</p>
  </>;
}
