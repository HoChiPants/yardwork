import { useMemo, useState } from "react";
import { type Project } from "./model";
import { partLabel } from "./partLabels";
import { type SubfloorReview } from "./subfloor";
import { reviewSubfloorFastening, type SubfloorNailSchedule } from "./subfloorFastening";
import { subfloorNails, subfloorNailSchedules } from "./subfloorReference";
import { type SubfloorNailPlan } from "./subfloorSchema";

type Props = {
  project: Project;
  panel: SubfloorReview;
  onSave: (panelId: string, plan: Omit<SubfloorNailPlan, "panelId"> | null) => void;
  onShow: (panelId: string, schedule: SubfloorNailSchedule) => void;
};

export function SubfloorFastenerPlan({ project, panel, onSave, onShow }: Props) {
  const saved = project.subfloorNailPlans?.find(({ panelId }) => panelId === panel.panelId);
  const [schedule, setSchedule] = useState<SubfloorNailSchedule>(saved?.schedule ?? "deformed-6d");
  const [confirmed, setConfirmed] = useState(false);
  const review = useMemo(() => reviewSubfloorFastening(project, panel, schedule), [project, panel, schedule]);
  const nail = subfloorNailSchedules[schedule];
  return <details className="field-section" open={!!saved}>
    <summary>Subfloor fasteners</summary>
    <label className="field">Fastener schedule
      <select value={schedule} onChange={(event) => {
        setSchedule(event.target.value === "common-8d" ? "common-8d" : "deformed-6d");
        setConfirmed(false);
      }}>
        <option value="deformed-6d">6d ring- or screw-shank</option>
        <option value="common-8d">8d common for a glue-nailed floor</option>
      </select>
    </label>
    <p className="small-note">{nail.length} in × {nail.shank.toFixed(3)} in shank · Check the delivered fastener and floor schedule.</p>
    {review.problem && <p>{review.problem}</p>}
    {review.ready && <>
      <p><strong>{review.marks} nails for this sheet</strong></p>
      <details><summary>Count by framing member</summary>
        <ul>{review.groups.map(({ id, count }) => <li key={id}>{partLabel(project, id)} · {count} locations</li>)}</ul>
      </details>
      {!review.current && schedule === "common-8d" && <label className="checkbox-field">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        The specified 6d nails are unavailable, and the approved glue-nailed detail allows this nail on dry, untreated framing.
      </label>}
      {schedule === "common-8d" && <p className="small-note">Box estimates use about {subfloorNails.estimatedBoxCount} nails per 1-lb box. <a href={subfloorNails.specification} target="_blank" rel="noreferrer">Grip-Rite specifications</a></p>}
      {review.current ? <span>Fastener plan saved</span> :
        <button type="button" className="button primary" disabled={schedule === "common-8d" && !confirmed}
          onClick={() => { onSave(panel.panelId, { schedule, signature: review.signature }); setConfirmed(false); }}>Save fastener plan</button>}
    </>}
    {(review.ready || review.problemMarks.length > 0) &&
      <button type="button" className="button secondary" onClick={() => onShow(panel.panelId, schedule)}>Show nail marks in 3D</button>}
    {saved && <button type="button" className="text-button" onClick={() => onSave(panel.panelId, null)}>Remove fastener plan</button>}
  </details>;
}
