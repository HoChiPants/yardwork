import { useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import { pieceCutKerf } from "./cutStock";
import { formatStockLength } from "./measurement";
import { formatCutDimensions } from "./offcutCutGuide";
import {
  offcutSplitOptions, offcutSplitSuggestions, previewEqualOffcutSplit, previewOffcutSplit, stainSampleInstructions,
  type OffcutSplitKind, type OffcutSplitPreset,
} from "./offcutSplit";
import { type Piece, type Project } from "./model";
import { partLabel } from "./partLabels";
import { offcutStockSize } from "./stockAxes";

export function OffcutSplitForm({ project, piece, preset, onApply }: {
  project: Project;
  piece: Piece;
  preset?: OffcutSplitPreset;
  onApply: (next: Project, source: Project) => void;
}) {
  const options = offcutSplitOptions(piece);
  const suggestions = offcutSplitSuggestions(piece);
  const starting = suggestions.find(({ id }) => id === preset) ?? suggestions[0];
  const request = typeof preset === "object" ? preset : undefined;
  const [kind, setKind] = useState<OffcutSplitKind>(request?.kind ?? options[0]?.kind ?? "crosscut");
  const [count, setCount] = useState<number | null>(request?.count ?? starting?.count ?? null);
  const [size, setSize] = useState(starting?.size ??
    (options[0] ? (piece.size[options[0].axis] - pieceCutKerf(piece)) / 2 : NaN));
  const [name, setName] = useState(starting?.label ?? "");
  const label = partLabel(project, piece.id);
  const result = useMemo(() => {
    try {
      return { preview: count === null ? previewOffcutSplit(project, piece.id, kind, size, name)
        : previewEqualOffcutSplit(project, piece.id, kind, count, name) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Review the split dimensions." };
    }
  }, [project, piece.id, kind, size, name, count]);
  const { preview, error } = result;
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (preview) onApply(preview.next, project);
  }}>
    <h2 id="modal-title">Split {label}</h2>
    <p>{piece.name} · {formatCutDimensions(offcutStockSize(piece))}</p>
    {suggestions.length > 0 && <div className="button-row" aria-label="Suggested uses">
      {suggestions.map((suggestion) => <button className="button secondary" type="button" key={suggestion.id} onClick={() => {
        setKind("crosscut");
        setCount(suggestion.count);
        setSize(suggestion.size);
        setName(suggestion.label);
      }}>{suggestion.name}</button>)}
    </div>}
    <label className="field">Cut pattern
      <select value={count === null ? "split" : "equal"} onChange={({ currentTarget }) =>
        setCount(currentTarget.value === "equal" ? 2 : null)}>
        <option value="split">One cut at a measured size</option>
        <option value="equal">Divide into equal blanks</option>
      </select>
    </label>
    {options.length > 1 && <label className="field">Cut direction
      <select value={kind} onChange={({ currentTarget }) => {
        const option = options.find(({ kind }) => kind === currentTarget.value);
        if (option) {
          setKind(option.kind);
          setSize((piece.size[option.axis] - pieceCutKerf(piece)) / 2);
          if (count === null) setName("");
        }
      }}>
        {options.map(({ kind }) => <option key={kind} value={kind}>{kind === "rip" ? "Rip to width" : "Crosscut to length"}</option>)}
      </select>
    </label>}
    {count === null ?
      <LengthInput label={kind === "rip" ? "Width of first piece" : "Length of first piece"} value={size} onChange={setSize} min={0.001} required /> :
      <label className="field">Number of equal blanks
        <input type="number" min={2} step={1} required value={Number.isFinite(count) ? count : ""}
          onChange={({ currentTarget }) => setCount(currentTarget.valueAsNumber)} />
      </label>}
    <label className="field">{count === null ? "Label first piece" : "Label all blanks"}
      <input value={name} maxLength={111} onChange={({ currentTarget }) => setName(currentTarget.value)} />
    </label>
    {name === "Finish sample" && <p className="small-note">Use a sample that matches your project wood and preparation.{" "}
      <a href={stainSampleInstructions} target="_blank" rel="noreferrer">Minwax sample guidance</a>
    </p>}
    {error && <p role="status">{error}</p>}
    {preview && <section aria-label="Split cut preview" className="field-section">
      {preview.pending && <p>Complete the source cuts before dividing {label}.</p>}
      <p>{preview.outputs.length - 1} {preview.outputs.length === 2 ? "cut" : "cuts"} · {formatStockLength(preview.kerf)} blade allowance per cut</p>
      <ul aria-label="Pieces to keep">
        {preview.outputs.map((output) => <li key={output.id}>
          {partLabel(preview.next, output.id)} · {output.name} · {formatCutDimensions(offcutStockSize(output))}
        </li>)}
      </ul>
    </section>}
    <button className="button primary full" type="submit" disabled={!preview}>Save split to Cut pool</button>
  </form>;
}
