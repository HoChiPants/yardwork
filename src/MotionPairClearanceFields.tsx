import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import type { Piece } from "./model";
import type { MotionPairClearance } from "./motionPlanSchema";

export function MotionPairClearanceFields({ pieces, movingIds, labels, current, onTest }: {
  pieces: Piece[];
  movingIds: string[];
  labels: Map<string, string>;
  current?: MotionPairClearance;
  onTest: (requirement?: MotionPairClearance) => void;
}) {
  const active = pieces.filter(({ offcut }) => !offcut);
  const choices = active.filter(({ id }) => movingIds.includes(id));
  const [movingId, setMovingId] = useState(current?.movingId ?? (choices.length === 1 ? choices[0].id : ""));
  const [otherId, setOtherId] = useState(current?.otherId ?? "");
  const [minimum, setMinimum] = useState(current?.minimum ?? NaN);
  const validMoving = choices.some(({ id }) => id === movingId);
  const otherParts = active.filter(({ id }) => id !== movingId);
  const validOther = otherParts.some(({ id }) => id === otherId);
  const describe = (piece: Piece) => `${labels.get(piece.id) ?? "Part"} · ${piece.name}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validMoving && validOther && Number.isFinite(minimum) && minimum >= 0.001 && minimum <= 24)
      onTest({ movingId, otherId, minimum });
  }

  return (
    <details className="field-section" open={current ? true : undefined}>
      <summary>Check a minimum gap</summary>
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
          <button type="submit" className="button secondary small">Check gap through travel</button>
          {current && <button type="button" className="text-button" onClick={() => onTest()}>Remove minimum gap check</button>}
        </div>
      </form>
      <p className="small-note">Enter the gap your design needs. Include any handles, trim or other obstacles you want checked as modeled parts.</p>
    </details>
  );
}
