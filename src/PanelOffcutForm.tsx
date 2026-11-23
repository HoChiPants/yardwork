import { useLayoutEffect, useMemo, useState } from "react";
import type { TrimOrder } from "./cutPlan";
import { LengthInput } from "./LengthInput";
import { materialDisplayName } from "./materialGroups";
import { formatStockLength } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { previewPanelOffcut } from "./panelOffcut";
import { partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";

type PanelPreview = ReturnType<typeof previewPanelOffcut>;

export function PanelOffcutForm({ project, offcut, initialWidth, initialLength, stepId, center, onPreview, onApply }: {
  project: Project;
  offcut: Piece;
  initialWidth?: number;
  initialLength?: number;
  stepId: string;
  center: V3;
  onPreview: (piece: Piece | null) => void;
  onApply: (preview: PanelPreview) => void;
}) {
  const [width, setWidth] = useState(initialWidth ?? NaN);
  const [length, setLength] = useState(initialLength ?? NaN);
  const [name, setName] = useState("");
  const [order, setOrder] = useState<TrimOrder>("crosscut-first");
  const axes = stockAxes(offcut, offcut.cutStock?.size);
  const { size } = offcut;
  const [x, , z] = center;
  const review = useMemo((): { preview?: PanelPreview; error?: string } => {
    if (!(width > 0 && length > 0)) return {};
    try {
      return { preview: previewPanelOffcut(project, offcut, width, length, name, stepId, [x, 0, z], order) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not prepare this panel." };
    }
  }, [project, offcut, width, length, name, stepId, x, z, order]);
  const { preview, error } = review;
  useLayoutEffect(() => {
    onPreview(preview?.panel ?? null);
    return () => onPreview(null);
  }, [preview, onPreview]);
  const label = partLabel(project, offcut.id);
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (preview) onApply(preview);
  }}>
    <h2 id="modal-title">Cut a panel from {label}</h2>
    <p>{materialDisplayName(material(offcut.material).name)} · {formatStockLength(size[axes.thickness])} thick</p>
    <p className="small-note">{formatStockLength(size[axes.width])} wide · {formatStockLength(size[axes.length])} along grain</p>
    <LengthInput label="Finished width" value={width} onChange={setWidth} min={0.001} required />
    <LengthInput label="Finished length along grain" value={length} onChange={setLength} min={0.001} required />
    <label className="field">Part name (optional)
      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
    </label>
    {preview?.cuts.length === 2 && <label className="field">Cut order
      <select value={order} onChange={(event) => setOrder(event.target.value === "rip-first" ? "rip-first" : "crosscut-first")}>
        <option value="crosscut-first">Crosscut first</option>
        <option value="rip-first">Rip first</option>
      </select>
    </label>}
    {error && <p role="status">{error}</p>}
    {preview && <section aria-label="Panel cut preview" className="field-section">
      {preview.pending && <p className="small-note">Complete the planned source cuts first to free {label}.</p>}
      {preview.cuts.length > 0 ? <>
        <p className="small-note">{formatStockLength(preview.kerf)} saw allowance per cut.</p>
        <ol>{preview.cuts.map(({ kind, text }) => <li key={kind}>{text}</li>)}</ol>
      </> : <p>Fits as measured.</p>}
      {preview.remnants.length > 0 && <>
        <p><strong>Offcuts to keep</strong></p>
        <ul aria-label="Offcuts to keep">
          {preview.remnants.map(({ id, size: [, w, l] }) => <li key={id}>
            {formatStockLength(w)} wide · {formatStockLength(l)} along grain
          </li>)}
        </ul>
      </>}
    </section>}
    <button className="button primary full" type="submit" disabled={!preview}>Place panel from {label}</button>
  </form>;
}
