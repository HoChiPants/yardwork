import { useEffect, useRef, useState, type MouseEvent } from "react";
import { FileUp, Loader2 } from "lucide-react";
import {
  drawingAngleToXAxis, drawingCoordinateLimit, drawingPointDistance, drawingReferenceSchema, drawingReferenceSize,
  type DrawingCalibration, type DrawingPoint, type DrawingReference, type DrawingSource,
} from "./drawingReference";
import { readDrawing, type DrawingReader } from "./drawingPreview";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";

type Points = [DrawingPoint | null, DrawingPoint | null];
const blankCalibration: Omit<DrawingCalibration, "points"> = {
  distance: NaN, center: [0, 0], angle: 0, opacity: 0.58, visible: true,
};

function DrawingPreview({ source, points, onMark }: {
  source: DrawingSource;
  points: Points;
  onMark: (point: DrawingPoint) => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [a, b] = points;
  const mark = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0 || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onMark([
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ]);
  };
  const turn = a && b ? -drawingAngleToXAxis(source, [a, b]) : 0;
  return (
    <>
      <div className="drawing-sheet-scroll">
        <button type="button" aria-label="Mark a scale point on the drawing" className="drawing-sheet"
          style={{ width: `${zoom}%`, aspectRatio: `${source.width}/${source.height}` }} onClick={mark}>
          <img alt="" src={source.image} draggable={false} />
          {a && b && <span className="drawing-sheet-line" style={{
            left: `${a[0] * 100}%`, top: `${a[1] * 100}%`,
            width: `${drawingPointDistance(source, [a, b]) / source.width * 100}%`,
            transform: `rotate(${turn}deg)`,
          }} />}
          {points.map((value, i) => value && <span className="drawing-sheet-point" key={i}
            style={{ left: `${value[0] * 100}%`, top: `${value[1] * 100}%` }}>{i ? "B" : "A"}</span>)}
        </button>
      </div>
      <label className="field drawing-zoom">Preview zoom
        <select value={zoom} onChange={({ currentTarget }) => setZoom(Number(currentTarget.value))}>
          <option value={100}>100%</option>
          <option value={200}>200%</option>
          <option value={300}>300%</option>
        </select>
      </label>
    </>
  );
}

export function DrawingReferencePanel({ initial, onSave, onRemove }: {
  initial?: DrawingReference;
  onSave: (drawing: DrawingReference) => void;
  onRemove: () => void;
}) {
  const [source, setSource] = useState<DrawingSource | undefined>(initial);
  const [points, setPoints] = useState<Points>(initial?.calibration.points ?? [null, null]);
  const [settings, setSettings] = useState<Omit<DrawingCalibration, "points">>(initial?.calibration ?? blankCalibration);
  const [active, setActive] = useState<0 | 1>(0);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [pages, setPages] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const reader = useRef<DrawingReader | null>(null);
  useEffect(() => () => {
    request.current?.abort();
    reader.current?.close();
  }, []);

  function updateSettings(patch: Partial<Omit<DrawingCalibration, "points">>) {
    setSettings((value) => ({ ...value, ...patch }));
    setError("");
  }

  function applySource(drawing: DrawingSource) {
    setSource(drawing);
    setPage(drawing.page ?? 1);
    setPoints([null, null]);
    updateSettings({ distance: NaN });
    setActive(0);
  }

  async function choose(file: File) {
    request.current?.abort();
    const opening = new AbortController();
    request.current = opening;
    setError("");
    setBusy(true);
    let next: DrawingReader | undefined;
    try {
      next = await readDrawing(file, opening.signal);
      const drawing = await next.preview(1, opening.signal);
      opening.signal.throwIfAborted();
      reader.current?.close();
      reader.current = next;
      setPages(next.pages);
      applySource(drawing);
      next = undefined;
    } catch (issue) {
      if (!opening.signal.aborted) setError((issue as Error).message);
    } finally {
      next?.close();
      if (!opening.signal.aborted) setBusy(false);
    }
  }

  async function loadPage() {
    const opened = reader.current;
    if (!opened || busy) return;
    const loading = new AbortController();
    request.current = loading;
    setError("");
    setBusy(true);
    try {
      const drawing = await opened.preview(page, loading.signal);
      loading.signal.throwIfAborted();
      applySource(drawing);
    } catch (issue) {
      if (!loading.signal.aborted) setError((issue as Error).message);
    } finally {
      if (!loading.signal.aborted) setBusy(false);
    }
  }

  function mark(value: DrawingPoint) {
    setPoints((previous) => active ? [previous[0], value] : [value, previous[1]]);
    setActive(active ? 0 : 1);
    setError("");
  }

  const [a, b] = points;
  const reference = source && a && b && Number.isFinite(settings.distance)
    ? drawingReferenceSchema.safeParse({ name: source.name, page: source.page, image: source.image,
      width: source.width, height: source.height, calibration: { ...settings, points: [a, b] } })
    : null;
  const fitted = reference?.success ? drawingReferenceSize(reference.data, reference.data.calibration) : null;
  return (
    <section aria-label="Drawing calibration" className="drawing-calibration">
      <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-label="Drawing file"
        onChange={({ currentTarget }) => {
          const file = currentTarget.files?.[0];
          if (file) void choose(file);
          currentTarget.value = "";
        }} />
      <button type="button" className={`button ${source ? "secondary" : "primary"} full`} onClick={() => fileInput.current?.click()} disabled={busy}>
        {busy ? <Loader2 size={16} className="spin" /> : <FileUp size={16} />}
        {busy ? "Opening drawing…" : source ? "Choose another drawing" : "Choose PDF or image"}
      </button>
      {!source && <p className="small-note">PDF, PNG, JPEG or WebP up to 20 MB. The selected sheet stays in the project.</p>}
      {source && <>
        <p className="drawing-file-title">{source.name}{source.page ? ` · Page ${source.page}` : ""}</p>
        {pages && pages > 1 && <div className="drawing-page-row">
          <label className="field">PDF page (1–{pages})
            <input type="number" min={1} max={pages} value={Number.isFinite(page) ? page : ""} onChange={({ currentTarget }) => setPage(currentTarget.valueAsNumber)} />
          </label>
          <button type="button" className="button secondary" onClick={() => void loadPage()} disabled={busy || page === source.page}>Load page</button>
        </div>}
        <p>Mark two endpoints of a known dimension on the drawing.</p>
        <div className="inline drawing-point-tools">
          <button type="button" className="button secondary" aria-pressed={active === 0} onClick={() => setActive(0)}>Mark point A</button>
          <button type="button" className="button secondary" aria-pressed={active === 1} onClick={() => setActive(1)}>Mark point B</button>
          <button type="button" className="text-button" onClick={() => { setPoints([[0, 0.5], [1, 0.5]]); setError(""); }}>Use full drawing width</button>
        </div>
        <DrawingPreview key={`${source.name}:${source.page}`} source={source} points={points} onMark={mark} />
        <LengthInput label="Real distance between A and B" value={settings.distance} min={0.01} max={drawingCoordinateLimit}
          onChange={(distance) => updateSettings({ distance })} />
        <details>
          <summary>Enter point coordinates</summary>
          <div className="two-col">
            {([0, 1] as const).flatMap((index) => ([0, 1] as const).map((axis) => (
              <label key={`${index}/${axis}`} className="field">
                Point {index ? "B" : "A"} {axis ? "down" : "across"} (%)
                <input type="number" min={0} max={100} step="any"
                  value={points[index] ? Number((points[index]![axis] * 100).toFixed(4)) : ""}
                  onChange={({ currentTarget }) => {
                    const value = currentTarget.valueAsNumber;
                    if (!Number.isFinite(value) || value < 0 || value > 100) return;
                    const next: DrawingPoint = [...(points[index] ?? [0, 0])];
                    next[axis] = value / 100;
                    setPoints(index ? [a, next] : [next, b]);
                  }} />
              </label>
            )))}
          </div>
        </details>
        <details>
          <summary>Placement and display</summary>
          <div className="two-col">
            <LengthInput label="Drawing center X" value={settings.center[0]} min={-drawingCoordinateLimit} max={drawingCoordinateLimit}
              onChange={(x) => updateSettings({ center: [x, settings.center[1]] })} />
            <LengthInput label="Drawing center Z" value={settings.center[1]} min={-drawingCoordinateLimit} max={drawingCoordinateLimit}
              onChange={(z) => updateSettings({ center: [settings.center[0], z] })} />
          </div>
          <label className="field">Rotation in degrees
            <input type="number" min={-180} max={180} step="any" value={Number.isFinite(settings.angle) ? settings.angle : ""}
              onChange={({ currentTarget }) => updateSettings({ angle: currentTarget.valueAsNumber })} />
          </label>
          <button type="button" className="text-button" disabled={!a || !b}
            onClick={() => { if (a && b) updateSettings({ angle: Number(drawingAngleToXAxis(source, [a, b]).toFixed(4)) }); }}>Align A–B to the X axis</button>
          <label className="field">Drawing opacity
            <input type="range" min={0.1} max={1} step={0.01} value={settings.opacity}
              onChange={({ currentTarget }) => updateSettings({ opacity: currentTarget.valueAsNumber })} />
          </label>
          <label className="checkbox-field"><input type="checkbox" checked={settings.visible}
            onChange={({ currentTarget }) => updateSettings({ visible: currentTarget.checked })} />Show drawing in workspace</label>
        </details>
        {fitted && <p role="status">
          Drawing footprint {formatStockLength(fitted.width)} × {formatStockLength(fitted.depth)}
        </p>}
        <button type="button" className="button primary full" disabled={busy || !reference?.success}
          onClick={() => { if (reference?.success) onSave(reference.data); }}>
          {initial ? "Save drawing reference" : "Use drawing reference"}
        </button>
        {initial && <button type="button" className="text-button" onClick={onRemove}>Remove drawing reference</button>}
      </>}
      {(error || reference && !reference.success) && <p role="alert" className="form-error">
        {error || (reference && !reference.success ? reference.error.issues[0]?.message : "")}
      </p>}
    </section>
  );
}
