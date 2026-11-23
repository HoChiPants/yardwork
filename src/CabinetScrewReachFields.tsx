import { useState } from "react";
import { previewCabinetScrewCheck } from "./cabinetBacking";
import type { CabinetBackingPlan, CabinetScrewMeasurements } from "./cabinetBackingSchema";
import { cabinetScrewDepthSummary, cabinetScrewLocationText, cabinetScrewReference, cabinetScrewScope, type CabinetScrewReview } from "./cabinetScrewReach";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";

type Draft = ReturnType<typeof previewCabinetScrewCheck>;
const empty: CabinetScrewMeasurements = { seatedLength: NaN, stack: NaN, diameter: NaN, minimumDepth: NaN, excludedTip: 0 };

export function CabinetScrewReachFields({ project, plan, saved, onSave }: {
  project: Project;
  plan: CabinetBackingPlan;
  saved: CabinetScrewReview | null;
  onSave: (candidate: Project, source: Project) => void;
}) {
  const [input, setInput] = useState(plan.fastening?.measurements ?? empty);
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const live = draft?.source === project ? draft : undefined;
  const results = live?.review ?? saved;
  const fields: { key: keyof CabinetScrewMeasurements; label: string; minimum?: number; max?: number }[] = [
    { key: "seatedLength", label: "Seated screw length" },
    { key: "stack", label: "Head seat to wood", minimum: 0 },
    { key: "diameter", label: "Shank diameter", max: 2 },
    { key: "minimumDepth", label: "Specified minimum depth in wood" },
    { key: "excludedTip", label: "Tip length excluded by instructions", minimum: 0 },
  ];
  return <div className="field-section">
    <h4>Check cabinet screw reach</h4>
    <p className="small-note">Use measurements that apply at every point in this row. Include the mounting hardware, shims and finish when measuring from the head seat to the wood.</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      try {
        setDraft(previewCabinetScrewCheck(project, plan.id, input));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not check these screw measurements.");
      }
    }}>
      <div className="two-col">
        {fields.map(({ key, label, minimum, max }) => <LengthInput key={key} label={label}
          value={input[key]} min={minimum ?? 0.001} max={max ?? 12} required
          onChange={(value) => { setInput((old) => ({ ...old, [key]: value })); setDraft(undefined); setError(""); }} />)}
      </div>
      <button type="submit" className="button secondary">Compare screw reach</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {results && <section aria-label={live ? "Screw reach preview" : "Saved screw reach check"}>
      <p>{cabinetScrewDepthSummary(results)}</p>
      <ul>{results.locations.map((row) => <li key={row.offset}>{cabinetScrewLocationText(project, row)}</li>)}</ul>
      {live && <button type="button" className="button primary" onClick={() => {
        try {
          onSave(live.project, live.source);
          setDraft(undefined);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save the check.");
        }
      }}>Save screw check</button>}
    </section>}
    <p className="small-note">{cabinetScrewScope} <a href={cabinetScrewReference} target="_blank" rel="noreferrer">IKEA ENHET wall cabinet installation guide</a></p>
  </div>;
}
