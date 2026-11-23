import { useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import type { Piece, Project } from "./model";
import { formatCutDimensions } from "./offcutCutGuide";
import { partLabel } from "./partLabels";
import { offcutStockSize } from "./stockAxes";
import { previewUsableOffcut, type UsableOffcutMarks } from "./usableOffcut";

export function UsableOffcutForm({ project, piece, onApply }: {
  project: Project;
  piece: Piece;
  onApply: (next: Project, source: Project) => void;
}) {
  const [, width, length] = offcutStockSize(piece);
  const [marks, setMarks] = useState<UsableOffcutMarks>({ length, width, fromEnd: 0, fromEdge: 0 });
  const changed = marks.width !== width || marks.length !== length || marks.fromEdge !== 0 || marks.fromEnd !== 0;
  const result = useMemo(() => {
    if (!changed) return {};
    try {
      return { preview: previewUsableOffcut(project, piece.id, marks) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Review the measured rectangle." };
    }
  }, [project, piece.id, marks, changed]);
  const label = partLabel(project, piece.id);
  const measured = result.preview && offcutStockSize(result.preview.output);

  return <form onSubmit={(event) => {
    event.preventDefault();
    if (result.preview) onApply(result.preview.next, project);
  }}>
    <h2 id="modal-title">Measure usable blank from {label}</h2>
    <p>{piece.name} · {formatCutDimensions(offcutStockSize(piece))}</p>
    <p className="small-note">Measure material you have in hand. Mark the corners of one usable rectangle. Measure length along the grain on wood and keep the existing thickness.</p>
    <div className="two-col">
      <LengthInput label="Usable length" value={marks.length} min={0.001} max={length} required
        onChange={(length) => setMarks({ ...marks, length })} />
      <LengthInput label="Usable width" value={marks.width} min={0.001} max={width} required
        onChange={(width) => setMarks({ ...marks, width })} />
      <LengthInput label="Start from original end" value={marks.fromEnd} min={0} max={length} required
        onChange={(fromEnd) => setMarks({ ...marks, fromEnd })} />
      <LengthInput label="Start from original side" value={marks.fromEdge} min={0} max={width} required
        onChange={(fromEdge) => setMarks({ ...marks, fromEdge })} />
    </div>
    {result.error && <p role="status" className="form-error">{result.error}</p>}
    {result.preview && measured && <section className="field-section" aria-label="Measured blank preview">
      <div className="usable-offcut-outline" role="img" aria-label="Usable rectangle inside the original offcut"
        style={{ aspectRatio: length / width, maxWidth: 120 * length / width }}>
        <div style={{
          left: `${100 * marks.fromEnd / length}%`, top: `${100 * marks.fromEdge / width}%`,
          width: `${100 * measured[2] / length}%`, height: `${100 * measured[1] / width}%`,
        }} />
      </div>
      <p>{partLabel(result.preview.next, result.preview.output.id)} · {formatCutDimensions(measured)}</p>
      <p className="small-note">Relabel the usable blank. Future fit checks use this rectangle.</p>
    </section>}
    <button type="submit" className="button primary full" disabled={!result.preview}>Save usable blank</button>
  </form>;
}
