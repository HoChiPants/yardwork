import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import type { Piece } from "./model";
import { formatPreciseInches } from "./measurement";
import { motionGapCheckLimit, motionGapPairKey, type MotionPairClearance } from "./motionPlanSchema";

export function MotionPairClearanceFields({ pieces, movingIds, labels, current, activeIndex, onTest }: {
  pieces: Piece[];
  movingIds: string[];
  labels: Map<string, string>;
  current: readonly MotionPairClearance[];
  activeIndex: number;
  onTest: (requirements: MotionPairClearance[], activeIndex: number) => void;
}) {
  const active = pieces.filter(({ offcut }) => !offcut);
  const choices = active.filter(({ id }) => movingIds.includes(id));
  const defaultMoving = choices.length === 1 ? choices[0].id : "";
  const initial = current[activeIndex];
  const [editing, setEditing] = useState<number | undefined>(initial ? activeIndex : undefined);
  const [movingId, setMovingId] = useState(initial?.movingId ?? defaultMoving);
  const [otherId, setOtherId] = useState(initial?.otherId ?? "");
  const [minimum, setMinimum] = useState(initial?.minimum ?? NaN);
  const validMoving = choices.some(({ id }) => id === movingId);
  const otherParts = active.filter(({ id }) => id !== movingId);
  const validOther = otherParts.some(({ id }) => id === otherId);
  const describe = (piece: Piece) => `${labels.get(piece.id) ?? "Part"} · ${piece.name}`;

  const pair = motionGapPairKey({ movingId, otherId });
  const alreadyChecked = validMoving && validOther &&
    current.some((check, index) => index !== editing && motionGapPairKey(check) === pair);

  function edit(index?: number) {
    const check = index === undefined ? undefined : current[index];
    setEditing(index);
    setMovingId(check?.movingId ?? defaultMoving);
    setOtherId(check?.otherId ?? "");
    setMinimum(check?.minimum ?? NaN);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validMoving || !validOther || alreadyChecked || !Number.isFinite(minimum) || minimum < 0.001 || minimum > 24) return;
    const requirement = { movingId, otherId, minimum };
    if (editing !== undefined)
      onTest(current.map((check, index) => index === editing ? requirement : check), editing);
    else if (current.length < motionGapCheckLimit)
      onTest([...current, requirement], current.length);
  }

  function remove(index: number) {
    const remaining = current.filter((_, i) => i !== index);
    onTest(remaining, Math.min(index, Math.max(0, remaining.length - 1)));
  }

  return (
    <details className="field-section" open={current.length ? true : undefined}>
      <summary>Check a minimum gap</summary>
      {current.length > 0 && (
        <ul aria-label="Minimum gaps in this test">
          {current.map((check, index) => {
            const label = `${labels.get(check.movingId) ?? "Missing part"} and ${labels.get(check.otherId) ?? "Missing part"}`;
            return (
              <li key={motionGapPairKey(check)}>
                {label} · {formatPreciseInches(check.minimum)}
                {editing !== index && <button type="button" className="text-button" onClick={() => edit(index)}
                  aria-label={`Edit gap between ${label}`}>Edit</button>}
              </li>
            );
          })}
        </ul>
      )}
      {editing !== undefined && current.length < motionGapCheckLimit &&
        <button type="button" className="text-button" onClick={() => edit()}>Add another minimum gap</button>}
      <form onSubmit={submit}>
        <label className="field">
          Moving part for gap
          <select value={validMoving ? movingId : ""} onChange={(event) => setMovingId(event.target.value)} required>
            <option value="">Choose moving part</option>
            {choices.map((piece) => <option key={piece.id} value={piece.id}>{describe(piece)}</option>)}
          </select>
        </label>
        <label className="field">
          Part to clear
          <select value={validOther ? otherId : ""} onChange={(event) => setOtherId(event.target.value)} required>
            <option value="">Choose nearby part</option>
            {otherParts.map((piece) => <option key={piece.id} value={piece.id}>{describe(piece)}</option>)}
          </select>
        </label>
        <LengthInput label="Required minimum gap" min={0.001} max={24} required value={minimum} onChange={setMinimum} />
        <div className="motion-actions">
          <button type="submit" className="button secondary small" disabled={alreadyChecked}
          >Check gap through travel</button>
          {editing !== undefined && <button type="button" className="text-button"
            onClick={() => remove(editing)}>Remove minimum gap check</button>}
          {editing === undefined && current.length > 0 && <button type="button" className="text-button"
            onClick={() => edit(activeIndex)}>Cancel new gap</button>}
        </div>
      </form>
      {alreadyChecked && <p role="status">This pair already has a minimum gap. Edit its existing check to change it.</p>}
      <p className="small-note">Enter the gap your design needs. Include any handles, trim or other obstacles you want checked as modeled parts.</p>
    </details>
  );
}
