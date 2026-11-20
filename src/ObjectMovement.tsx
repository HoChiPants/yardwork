import { formatStockLength } from "./measurement";
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
  bottom,
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
  bottom?: number;
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
      <p className="small-note">
        {bottom !== undefined
          ? `Bottom elevation: ${formatStockLength(bottom)}. `
          : ""}
        Lift-drag or Alt-drag up/down. Alt + ↑ / ↓ nudges by the chosen
        increment.
      </p>
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
