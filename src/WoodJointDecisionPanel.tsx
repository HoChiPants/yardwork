import { useState } from "react";
import type { WoodJointMethod } from "./woodJointDecisionSchema";
import { woodJointMethods, type WoodJointDecisionEntry } from "./woodJointDecisions";

const detailHints: Record<WoodJointMethod, string> = {
  glue: "Record the adhesive, faces and clamp setup. Check working time and cure for the product you select.",
  fitted: "Record the joint or hardware detail and the order you plan to assemble it.",
  sealant: "Identify the exposed edge, the sealant and any drainage or movement gaps to keep open.",
  "intentional-contact": "Record why these faces touch and how each part will be supported or held.",
};

export function WoodJointDecisionPanel({
  entry, canSave, sealantOnly, onSave, onClear,
}: {
  entry?: WoodJointDecisionEntry;
  canSave: boolean;
  sealantOnly: boolean;
  onSave: (method: WoodJointMethod, note: string) => void;
  onClear: () => void;
}) {
  const [method, setMethod] = useState<WoodJointMethod | "">(entry?.decision.method ?? "");
  const [note, setNote] = useState(entry?.decision.note ?? "");
  const validMethod = sealantOnly && method !== "sealant" ? "" : method;
  if (!canSave && !entry) return null;
  return (
    <details className="field-section" open={entry ? true : undefined}>
      <summary>Record joint detail</summary>
      {entry && (
        <p className="small-note" role="status">
          {woodJointMethods[entry.decision.method]} · {entry.status === "current" ? "Saved" :
            entry.status === "changed" ? "Fit changed · review again" : "Member unavailable · review again"}.
          {" "}{entry.decision.note}
        </p>
      )}
      {canSave && (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (validMethod && note.trim()) onSave(validMethod, note);
        }}>
          <label className="field">
            Joint method
            <select value={validMethod} onChange={(event) => setMethod(event.target.value as WoodJointMethod | "")} required>
              <option value="">Choose a joint method</option>
              {Object.entries(woodJointMethods).filter(([value]) => !sealantOnly || value === "sealant").map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            Joint detail for the guide
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} rows={3} required />
          </label>
          {validMethod && <p className="small-note">{detailHints[validMethod]}</p>}
          <button type="submit" className="button secondary" disabled={!validMethod || !note.trim()}>
            Save joint detail
          </button>
        </form>
      )}
      {entry && (
        <button type="button" className="text-button" onClick={onClear}>Remove joint detail</button>
      )}
    </details>
  );
}
