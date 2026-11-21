import { useState, type FormEvent } from "react";
import type { Project } from "./model";
import { addHomeDepotPurchaseNeed } from "./handoffPurchases";
import { trimBackerRodCutPlan, trimBackerRodGuideLines, trimSeamPurchaseSummary, woodJointDecisionEntries } from "./woodJointDecisions";
import { addSupply } from "./supplies";
import { trimSealant } from "./trimSealantReference";
import { estimateTrimSealant } from "./trimSealantTakeoff";

export function TrimSealantPanel({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const joints = project.woodJointDecisions?.some(({ trimSeam }) => trimSeam)
    ? woodJointDecisionEntries(project) : [];
  const planned = trimSeamPurchaseSummary(project, joints);
  const backing = trimBackerRodCutPlan(project, joints);
  const missing = Math.max(0, (planned?.required ?? 0) - (planned?.selected ?? 0));
  const [basis, setBasis] = useState("");
  const [result, setResult] = useState<ReturnType<typeof estimateTrimSealant>>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      setResult(estimateTrimSealant({
        lengthInches: Number(form.get("length")) * (form.get("unit") === "ft" ? 12 : 1),
        gapWidth: Number(form.get("width")),
        gapDepth: Number(form.get("depth")),
        fieldCoverageFeet: basis === "field" ? Number(form.get("field-coverage")) : undefined,
      }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function add() {
    if (!result) return;
    const { cartridges, note } = result;
    try {
      onChange(addSupply(project, trimSealant.id, cartridges, "Dry interior wood trim seams", note));
      setResult(undefined);
      setMessage(`Added ${cartridges} ${cartridges === 1 ? "cartridge" : "cartridges"} to the project shopping list.`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <details className="field-section">
      <summary>Estimate trim sealant</summary>
      <p className="small-note">{trimSealant.scope}</p>
      {planned && (
        <section className="field-section" aria-label="Measured trim seams">
          <h3>Measured trim seams</h3>
          {planned.required !== null && <p className="small-note">
            {planned.length} across {planned.ready} {planned.ready === 1 ? "joint" : "joints"} · {planned.required} planned {planned.required === 1 ? "cartridge" : "cartridges"} · {planned.selected} in List
          </p>}
          {planned.review > 0 && <p className="small-note">
            {planned.review} {planned.review === 1 ? "joint needs" : "joints need"} a fresh seam review.
          </p>}
          {missing > 0 && project.retailer === "home-depot" && <button type="button"
            className="button secondary" onClick={() => {
              try {
                onChange(addHomeDepotPurchaseNeed(project, trimSealant.id));
                setError("");
              } catch (issue) {
                setError(issue instanceof Error ? issue.message : "Review the trim sealant purchase.");
              }
            }}>Add missing seam {missing === 1 ? "cartridge" : "cartridges"}</button>}
        </section>
      )}
      {backing.length > 0 && (
        <details>
          <summary>Backer rod cuts and leftovers</summary>
          <ul>{trimBackerRodGuideLines(backing).map((line, index) => <li key={index} className="small-note">{line}</li>)}</ul>
        </details>
      )}
      <form onSubmit={estimate} onChange={() => {
        setResult(undefined);
        setError("");
        setMessage("");
      }}>
        <div>
          <label className="field">
            Total seam length
            <input name="length" type="number" min="0.001" step="any" required />
          </label>
          <label className="field">
            Length unit
            <select name="unit">
              <option value="ft">Feet</option>
              <option value="in">Inches</option>
            </select>
          </label>
          <label className="field">
            Widest gap (in)
            <input name="width" type="number" min="0.001" step="any" required />
          </label>
          <label className="field">
            Deepest gap (in)
            <input name="depth" type="number" min="0.001" step="any" required />
          </label>
        </div>
        <label className="field">
          Coverage basis
          <select value={basis} onChange={(event) => setBasis(event.target.value)} required>
            <option value="" disabled>Choose coverage</option>
            <option value="dap">3/16 in bead · DAP estimate</option>
            <option value="field">Measured from a trial</option>
          </select>
        </label>
        {basis === "field" && (
          <label className="field">
            Trial coverage (ft per cartridge)
            <input name="field-coverage" type="number" min="0.001" step="any" required />
          </label>
        )}
        <button type="submit" className="button secondary full">Preview cartridge estimate</button>
      </form>
      {error && <p className="small-note" role="alert">{error}</p>}
      {message && <p className="small-note" role="status">{message}</p>}
      {result && (
        <>
          <p className="small-note">{result.note}</p>
          <button type="button" className="button secondary full" onClick={add}>
            Add {result.cartridges} {result.cartridges === 1 ? "cartridge" : "cartridges"}
          </button>
        </>
      )}
      <p className="small-note">
        <a href={trimSealant.specification} target="_blank" rel="noreferrer">DAP application and coverage</a>
        {" · "}
        <a href={trimSealant.listing} target="_blank" rel="noreferrer">Home Depot cartridge</a>
      </p>
    </details>
  );
}
