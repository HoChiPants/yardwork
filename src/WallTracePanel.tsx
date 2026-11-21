import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { framingStockDimensions, material } from "./model";
import type { PlanOutline } from "./planOutlines";
import { partitionCodeSource, partitionFramingSource, type OutlineFace, type reviewWallTrace, type WallTrace } from "./wallTrace";

const stockChoices = ["hd-kdht-2x4-8", "hd-spf-2x4-10", "hd-spf-2x4-12", "hd-spf-2x6-8", "hd-spf-2x6-12"] as const;

export function WallTracePanel({ trace, onChange, review, error, onAdd, onClose, onPick, outline }: {
  trace: WallTrace;
  onChange: (next: WallTrace) => void;
  review?: ReturnType<typeof reviewWallTrace>;
  error?: string;
  onAdd: () => void;
  onClose: () => void;
  onPick: () => void;
  outline?: {
    entries: PlanOutline[];
    error?: string;
    index: number;
    face: OutlineFace;
    onSelect: (index: number) => void;
    onFace: (face: OutlineFace) => void;
    onManual: () => void;
  };
}) {
  const row = review?.row;
  const assignments = review?.reuse?.assignments ?? [];
  if (outline && !outline.entries.length) return <section className="wall-trace-panel" aria-label="Frame room settings">
    <h3>Frame a room from DXF</h3>
    <p role="status">{outline.error ?? "No closed right-angle outline was found. Close any gaps in the source drawing, or trace the individual walls."}</p>
    <div className="inline">
      <button type="button" className="button secondary" onClick={outline.onManual}>Trace individual walls</button>
      <button type="button" className="text-button" onClick={onClose}>Cancel trace</button>
    </div>
  </section>;
  return (
    <section className="wall-trace-panel" aria-label={outline ? "Frame room settings" : "Trace wall settings"}>
      <h3>{outline ? "Frame a room from DXF" : "Trace an interior wall"}</h3>
      <p>{outline ? "Choose a closed outline and confirm which face the drawing represents. Yardwork previews editable nonbearing walls along its edges." : "Pick a run on the plan or enter the two ends. The preview places editable nonbearing framing along that line."}</p>
      <div className="inline">
        <button type="button" className="button secondary" onClick={onPick}>Pick on plan</button>
        {!outline && <button type="button" className="text-button" onClick={() => onChange({ ...trace, a: null, b: null })}>Clear points</button>}
      </div>
      {outline ? <label className="field"><span>Plan outline</span>
        <select value={outline.index} onChange={(event) => outline.onSelect(Number(event.target.value))}>
          <option value={-1} disabled>Select an outline</option>
          {outline.entries.map((entry, index) => <option key={index} value={index}>
            {`Outline ${index + 1} · ${formatStockLength(entry.width)} × ${formatStockLength(entry.depth)} · ${entry.points.length} sides`}
          </option>)}
        </select>
      </label> : <details open={!trace.a || !trace.b ? undefined : true}>
        <summary>Exact wall coordinates</summary>
        {(["a", "b"] as const).map((endpoint) => (
          <div className="wall-trace-fields" key={endpoint}>
            {(["X", "Z"] as const).map((axis, index) => (
              <LengthInput key={axis} label={`Point ${endpoint.toUpperCase()} ${axis}`} min={-12000} max={12000}
                value={trace[endpoint]?.[index] ?? NaN} onChange={(value) => {
                  const point: [number, number] = [...(trace[endpoint] ?? [NaN, NaN])];
                  point[index] = value;
                  onChange({ ...trace, [endpoint]: point });
                }} />
            ))}
          </div>
        ))}
      </details>}
      <div className="wall-trace-fields">
        <LengthInput label="Wall height" value={trace.height} min={12} max={120} defaultUnit="ft" onChange={(height) => onChange({ ...trace, height })} />
        <LengthInput label="Base elevation" value={trace.elevation} min={0} max={11880} onChange={(elevation) => onChange({ ...trace, elevation })} />
      </div>
      <label className="field">
        <span>Framing lumber</span>
        <select value={trace.stock} onChange={(event) => onChange({ ...trace, stock: event.target.value as WallTrace["stock"] })}>
          {stockChoices.map((id) => {
            const { length, depth } = framingStockDimensions(id);
            return <option key={id} value={id}>{depth === 3.5 ? "2 × 4" : "2 × 6"} · {formatStockLength(length)} · {material(id).name.includes("KD-HT") ? "KD-HT" : "SPF"}</option>;
          })}
        </select>
      </label>
      <div className="wall-trace-fields">
        <label className="field"><span>Stud spacing</span>
          <select value={trace.spacing} onChange={(event) => onChange({ ...trace, spacing: Number(event.target.value) as WallTrace["spacing"] })}>
            {[12, 16, 24].map((value) => <option key={value} value={value}>{value} in</option>)}
          </select>
        </label>
        {outline ? <label className="field"><span>Drawing line marks</span>
          <select value={outline.face} onChange={(event) => outline.onFace(event.target.value as OutlineFace)}>
            <option value="center">Wall centerline</option><option value="inside">Inside framing face</option><option value="outside">Outside framing face</option>
          </select>
        </label> : <label className="field"><span>Align line to</span>
          <select value={trace.alignment} onChange={(event) => onChange({ ...trace, alignment: event.target.value as WallTrace["alignment"] })}>
            <option value="center">Center</option><option value="left">Left face</option><option value="right">Right face</option>
          </select>
        </label>}
      </div>
      {!outline && <details>
        <summary>Trim the ends for adjoining walls</summary>
        <p>Left and right refer to the top view looking from point A to point B.</p>
        <div className="wall-trace-fields">
          <LengthInput label="Start trim" value={trace.startTrim} min={0} max={24000} onChange={(startTrim) => onChange({ ...trace, startTrim })} />
          <LengthInput label="End trim" value={trace.endTrim} min={0} max={24000} onChange={(endTrim) => onChange({ ...trace, endTrim })} />
        </div>
      </details>}
      <label className="check-row"><input type="checkbox" checked={trace.reuse} onChange={(event) => onChange({ ...trace, reuse: event.target.checked })} /> Use matching offcuts from this project</label>
      {error && <p role="status">{error}</p>}
      {review && (
        <div className="wall-trace-review">
          <output aria-label={outline ? "Room framing preview" : "Wall run preview"}>{outline ? `${review.runLengths.length} walls` : formatStockLength(review.runLength)} · {review.lengths.length} {review.lengths.length === 1 ? "panel" : "panels"} · {review.added.length} parts</output>
          {outline ? <p>Wall lengths {review.runLengths.map(formatStockLength).join(" · ")}. Alternate walls run through the corners. The other walls butt into their side faces.</p>
            : review.lengths.length > 1 && <p>Panel lengths {review.lengths.map(formatStockLength).join(" + ")}. The guide flags where to dry-fit the joints.</p>}
          {review.outsideZone && <p role="status">Part of this framing extends outside the work zone. Check the placement before adding it.</p>}
          {!!review.obstructions.length && <p role="alert">{outline ? "Framing overlaps" : "Wall overlaps"} {review.obstructions.slice(0, 3).map(({ name }) => name).join(", ")}{review.obstructions.length > 3 ? ` and ${review.obstructions.length - 3} more` : ""}. {outline ? "Adjust the alignment or review the existing walls." : "Adjust the ends, alignment or elevation."}</p>}
          {review.hasInternalOverlap && <p role="alert">The proposed walls cross each other. Check the outline and face alignment or choose narrower lumber.</p>}
          {!!row?.oversize && <p role="alert">Some members exceed the usable stock length after saw kerf. Adjust the dimensions or choose longer lumber.</p>}
          {row && <details>
            <summary>{row.purchasedStockUnits} {row.purchasedStockUnits === 1 ? "new board" : "new boards"} for this {outline ? "outline" : "run"}</summary>
            <ol>{row.bins.map((bin, index) => <li key={index}>
              {bin.cuts.map(({ name, length }) => `${name} ${formatStockLength(length)}`).join(" · ")}
              {bin.remaining > 0 && ` · ${formatStockLength(bin.remaining)} remaining`}
            </li>)}</ol>
          </details>}
          {!!assignments.length && <details>
            <summary>{assignments.length} {assignments.length === 1 ? "part from saved offcuts" : "parts from saved offcuts"}</summary>
            <ul>{assignments.map(({ partId, target, from, operations }) => <li key={partId}>{target} from {from}. {operations.join(" · ")}</li>)}</ul>
          </details>}
        </div>
      )}
      <div className="inline">
        <button type="button" className="button primary" disabled={!review || !!review.obstructions.length || review.hasInternalOverlap || !!row?.oversize} onClick={onAdd}>{outline ? "Add room framing" : "Add traced wall"}</button>
        <button type="button" className="text-button" onClick={onClose}>Cancel trace</button>
      </div>
      <p className="wall-trace-sources">Verify attachment, backing and fireblocking before building. <a href={partitionFramingSource} target="_blank" rel="noreferrer">PNNL framing</a> · <a href={partitionCodeSource} target="_blank" rel="noreferrer">IRC R602.5</a></p>
    </section>
  );
}
