import { useState, type FormEvent } from "react";
import { reviewConnectionContact } from "./connectionContacts";
import type { Project } from "./model";
import { purchaseUnitLabel } from "./purchaseUnits";
import { woodGlue } from "./woodGlueReference";
import { estimateWoodGlue, isWoodGlueEstimate, saveWoodGlueEstimate } from "./woodGlueTakeoff";
import type { WoodJointDecisionEntry } from "./woodJointDecisions";

export function WoodGluePanel({ project, joints, onChange }: {
  project: Project;
  joints: WoodJointDecisionEntry[];
  onChange: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{
    project: Project;
    area: number;
    extra: number;
    result: ReturnType<typeof estimateWoodGlue>;
  }>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saved = project.supplies.find(isWoodGlueEstimate);
  const glueJoints = joints.filter(({ decision }) => decision.method === "glue");
  const ready = glueJoints.filter(({ status }) => status === "current");
  const result = preview?.project === project ? preview.result : undefined;

  if (!glueJoints.length && !saved) return null;
  const parts = new Map(open ? project.pieces.map((part) => [part.id, part]) : []);

  function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const area = Number(form.get("area")) * (form.get("unit") === "ft" ? 144 : 1);
    const extra = Number(form.get("extra"));
    try {
      setPreview({ project, area, extra, result: estimateWoodGlue(area, extra) });
      setError("");
      setMessage("");
    } catch (cause) {
      setPreview(undefined);
      setError((cause as Error).message);
    }
  }

  function save() {
    if (!preview || !result || !ready.length) return;
    try {
      onChange(saveWoodGlueEstimate(project, preview.area, preview.extra));
      setPreview(undefined);
      setMessage(`Saved ${result.bottles} ${purchaseUnitLabel("bottle", result.bottles)} to the shopping list.`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <details className="field-section" onToggle={(event) => {
      setOpen(event.currentTarget.open);
      if (!event.currentTarget.open) {
        setPreview(undefined);
        setError("");
        setMessage("");
      }
    }}>
      <summary>Estimate wood glue</summary>
      {open && (
        <>
          <p className="small-note">{woodGlue.scope}</p>
          {saved && <p className="small-note">Saved estimate · {saved.note}</p>}
          {glueJoints.length > ready.length && (
            <p className="small-note">{glueJoints.length - ready.length} glue {glueJoints.length - ready.length === 1 ? "joint needs" : "joints need"} fit review.</p>
          )}
          {ready.length ? (
            <>
              <p className="small-note">Largest modeled face per joint. Confirm the areas you will actually coat and count each coated surface once.</p>
              <ul className="small-note">
                {ready.map(({ id, title, memberIds }) => {
                  const area = reviewConnectionContact(parts.get(memberIds[0])!, parts.get(memberIds[1])!).area;
                  return <li key={id}>{title} · {area?.toLocaleString("en-US", { maximumSignificantDigits: 6 })} sq in</li>;
                })}
              </ul>
              <form onSubmit={estimate} onChange={() => {
                setPreview(undefined);
                setMessage("");
                setError("");
              }}>
                <label className="field">
                  Total area to coat
                  <input name="area" type="number" min="0" step="any" required />
                </label>
                <label className="field">
                  Area unit
                  <select name="unit">
                    <option value="in">Square inches</option>
                    <option value="ft">Square feet</option>
                  </select>
                </label>
                <label className="field">
                  Extra glue (%)
                  <input name="extra" type="number" min="0" max="100" step="any" defaultValue="0" required />
                </label>
                <button type="submit" className="button secondary full">Preview bottle estimate</button>
              </form>
            </>
          ) : <p className="small-note">Record or update a glue joint on touching wood faces to estimate it here.</p>}
          {error && <p className="small-note" role="alert">{error}</p>}
          {message && <p className="small-note" role="status">{message}</p>}
          {result && (
            <>
              <p className="small-note">{result.note}</p>
              <button type="button" className="button secondary full" onClick={save}>
                {saved ? "Replace estimate with" : "Add"} {result.bottles} {purchaseUnitLabel("bottle", result.bottles)}
              </button>
            </>
          )}
          <p className="small-note">
            <a href={woodGlue.specification} target="_blank" rel="noreferrer">Titebond application and coverage</a>
            {" · "}
            <a href={woodGlue.listing} target="_blank" rel="noreferrer">Home Depot bottle</a>
          </p>
        </>
      )}
    </details>
  );
}
