import { useEffect, useState } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength, preferredLengthUnit } from "./measurement";

function Elevation({ bottom, top, onSetBottom }: {
  bottom: number;
  top: number;
  onSetBottom: (value: number) => void;
}) {
  const [target, setTarget] = useState<number>();
  useEffect(() => setTarget(undefined), [bottom]);
  const canSet = target !== undefined && Number.isFinite(target) && target >= 0 &&
    target <= 12000 && Math.abs(target - bottom) > 1e-7;
  return <>
    <form className="object-elevation" onSubmit={(event) => {
      event.preventDefault();
      if (!canSet) return;
      onSetBottom(target);
      setTarget(undefined);
    }}>
      <LengthInput label="Bottom above floor" value={target ?? bottom} defaultUnit={preferredLengthUnit(bottom)}
        min={0} max={12000} onChange={setTarget} />
      <button type="submit" className="button secondary" disabled={!canSet}>Set height</button>
    </form>
    <p className="small-note">Top above floor · {formatStockLength(top)}</p>
  </>;
}

export function ObjectMovement({
  onMove,
  onLift,
  onNudge,
  onCopy,
  onPaste,
  onDuplicate,
  hasClipboard,
  increment,
  onIncrement,
  elevation,
  onSetBottom,
  lifting,
}: {
  onMove: () => void;
  onLift: () => void;
  onNudge: (direction: number) => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  hasClipboard: boolean;
  increment: number;
  onIncrement: (n: number) => void;
  elevation?: { bottom: number; top: number };
  onSetBottom: (value: number) => void;
  lifting: boolean;
}) {
  return (
    <section className="object-movement" aria-label="Move and copy objects">
      <h4>Move / copy</h4>
      <div className="button-row">
        <button className="button secondary" onClick={onMove}>
          Move XYZ
        </button>
        <button
          className="button secondary"
          aria-pressed={lifting}
          onClick={onLift}
        >
          Lift / lower (L)
        </button>
      </div>
      <div className="button-row">
        <button
          className="button secondary"
          aria-label="Lower object"
          onClick={() => onNudge(-1)}
        >
          ↓ Lower
        </button>
        <select
          aria-label="Move increment"
          value={increment}
          onChange={(e) => onIncrement(Number(e.target.value))}
        >
          {[0.125, 0.5, 1, 6, 12].map((n) => (
            <option key={n} value={n}>
              {formatStockLength(n)}
            </option>
          ))}
        </select>
        <button
          className="button secondary"
          aria-label="Raise object"
          onClick={() => onNudge(1)}
        >
          ↑ Raise
        </button>
      </div>
      {elevation && <Elevation {...elevation} onSetBottom={onSetBottom} />}
      <p className="small-note">Lift-drag or Alt-drag up/down. Alt + ↑ / ↓ uses the move increment.</p>
      <div className="button-row">
        <button className="text-button" onClick={onCopy}>
          Copy object
        </button>
        <button
          className="text-button"
          disabled={!hasClipboard}
          onClick={onPaste}
        >
          Paste object
        </button>
        <button className="text-button" onClick={onDuplicate}>
          Duplicate object
        </button>
      </div>
      <small className="muted">⌘/Ctrl C · V · D — outside text fields</small>
    </section>
  );
}
