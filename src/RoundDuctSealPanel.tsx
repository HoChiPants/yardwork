import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { previewRoundDuctSeal, reviewRoundDuctSeal } from "./roundDuctSeal";
import { roundDuctMastic, roundDuctSealScope, roundDuctStock } from "./roundDuctReference";
import type { RoundDuctSealInput } from "./roundDuctSealSchema";

export function RoundDuctSealPanel({ project, onSave }: {
  project: Project;
  onSave: (input: RoundDuctSealInput) => void;
}) {
  const [input, setInput] = useState<RoundDuctSealInput>(() => project.roundDuctSeal?.input ?? {
    jointCircumference: Math.PI * roundDuctStock.diameter,
    fittingSeams: project.roundDuctElbows?.length ? NaN : 0,
    reinforcedSeams: 0, coveragePerTube: NaN,
  });
  const [checked, setChecked] = useState<{ source: Project; estimate: ReturnType<typeof previewRoundDuctSeal> }>();
  const result = checked?.source === project ? checked.estimate : undefined;
  const existingIssue = reviewRoundDuctSeal(project)?.issue;
  function update(patch: Partial<RoundDuctSealInput>) {
    setInput((previous) => ({ ...previous, ...patch }));
    setChecked(undefined);
  }
  function check(event: FormEvent) {
    event.preventDefault();
    setChecked({ source: project, estimate: previewRoundDuctSeal(project, input) });
  }
  const fields: { key: keyof RoundDuctSealInput; label: string; min: number; max: number }[] = [
    { key: "jointCircumference", label: "Average joint circumference", min: 0.125, max: 120 },
    { key: "fittingSeams", label: "Additional fitting seam length", min: 0, max: 100000 },
    { key: "reinforcedSeams", label: "Seams needing mesh", min: 0, max: 100000 },
    { key: "coveragePerTube", label: "Usable coverage per tube", min: 0.125, max: 100000 },
  ];
  return <>
    <h2 id="modal-title">Plan round duct sealing</h2>
    <p>{roundDuctSealScope}</p>
    {existingIssue && !result && <p role="status">{existingIssue}</p>}
    <form className="valley-plan" onSubmit={check}>
      <div className="valley-fields">
        {fields.map(({ key, label, min, max }) => <LengthInput key={key} label={label} required
          value={input[key]} min={min} max={max} defaultUnit={key === "coveragePerTube" ? "ft" : "in"}
          onChange={(value) => update({ [key]: value })} />)}
      </div>
      <button type="submit" className="button secondary">Check sealant estimate</button>
      {result && <section className="valley-results" aria-label="Round duct sealing estimate">
        {result.issue && <p role="alert">{result.issue}</p>}
        {result.input && <>
          <p>{formatStockLength(result.longitudinal)} of pipe seams · {result.joints} round joints · {formatStockLength(result.input.fittingSeams)} of additional seams.</p>
          <p><strong>{result.tubes} {result.tubes === 1 ? "tube" : "tubes"}</strong> for {formatStockLength(result.total)} of seams.</p>
          {result.input.reinforcedSeams > 0 && <p>Plan mesh on {formatStockLength(result.input.reinforcedSeams)} of measured wider seams.</p>}
          <button type="button" className="button primary" onClick={() => onSave(result.input)}>Save duct sealing plan</button>
        </>}
      </section>}
    </form>
    <p className="small-note"><a href={roundDuctMastic.listing} target="_blank" rel="noreferrer">Master Flow sealant reference</a>{" · "}
      <a href={roundDuctStock.sealing} target="_blank" rel="noreferrer">PNNL duct sealing</a></p>
  </>;
}
