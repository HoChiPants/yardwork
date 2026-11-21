import { useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { Piece, Project } from "./model";
import { partLabel } from "./partLabels";
import { sillGasketBuildingGuide, sillGasketInstructions, sillGasketListing, sillGasketScope } from "./sillGasketReference";
import type { SillGasketMeasurements } from "./sillGasketSchema";
import {
  addMissingSillGasketRolls, removeSillGasket, reviewSillGaskets,
  saveSillGasket, sillPlateFootprint,
} from "./sillGaskets";

function SillMeasurements({ part, saved, onSave }: {
  part: Piece;
  saved?: SillGasketMeasurements;
  onSave: (measurements: SillGasketMeasurements) => void;
}) {
  const footprint = sillPlateFootprint(part)!;
  const [fields, setFields] = useState<SillGasketMeasurements>(saved ?? {
    substrate: "concrete", top: NaN, supportWidth: NaN,
    supportLength: NaN, centerOffset: 0, allowance: NaN,
  });
  const number = (key: Exclude<keyof SillGasketMeasurements, "substrate">) =>
    (value: number) => setFields((previous) => ({ ...previous, [key]: value }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(fields);
  }
  return (
    <form onSubmit={submit}>
      <p className="small-note">Modeled sill {formatStockLength(footprint.length)} long and {formatPreciseInches(footprint.width)} across, with its seated underside at {formatPreciseInches(footprint.bottom)}.</p>
      <label className="field">
        Foundation substrate
        <select value={fields.substrate} onChange={(event) =>
          setFields({ ...fields, substrate: event.target.value === "masonry" ? "masonry" : "concrete" })}>
          <option value="concrete">Concrete</option>
          <option value="masonry">Masonry</option>
        </select>
      </label>
      <LengthInput label="Measured top elevation" value={fields.top} min={-12000} max={12000} onChange={number("top")} required />
      <LengthInput label="Continuous support length under this sill" value={fields.supportLength} min={0.001} max={2400} onChange={number("supportLength")} required />
      <LengthInput label="Measured support width" value={fields.supportWidth} min={0.001} max={240} onChange={number("supportWidth")} required />
      <LengthInput label="Support center offset" value={fields.centerOffset} min={-240} max={240} onChange={number("centerOffset")} required />
      <p className="small-note">Use zero when the measured support is centered. Enter the displacement across the sill if its edges are uneven. Measure continuous support from one sill end to the other.</p>
      <LengthInput label="Extra length for overlaps and trimming" value={fields.allowance} min={0} max={600} onChange={number("allowance")} required />
      <button type="submit" className="button secondary full">Save gasket run</button>
    </form>
  );
}

export function SillGasketPanel({ project, review, shownId, onShow, onChange }: {
  project: Project;
  review: ReturnType<typeof reviewSillGaskets>;
  shownId: string | null;
  onShow: (id: string | null) => void;
  onChange: (project: Project) => void;
}) {
  const plates = useMemo(() => project.pieces.filter(sillPlateFootprint), [project]);
  const [partId, setPartId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const part = plates.find(({ id }) => id === partId);
  const saved = review.rows.find(({ plan }) => plan.partId === partId)?.plan;
  if (!plates.length && !review.rows.length) return null;

  function update(transaction: () => Project, nextMessage: string) {
    try {
      onChange(transaction());
      setError("");
      setMessage(nextMessage);
    } catch (cause) {
      setMessage("");
      setError((cause as Error).message);
    }
  }
  const missing = review.groups.some(({ rolls, selected }) => rolls.length > selected);
  return (
    <details className="field-section">
      <summary>Plan sill gaskets</summary>
      <p className="small-note">{sillGasketScope}</p>
      <label className="field">
        Wood sill plate
        <select value={part?.id ?? ""} onChange={(event) => {
          setPartId(event.target.value);
          setError("");
          setMessage("");
        }}>
          <option value="">Choose a modeled sill plate</option>
          {plates.map((plate) => <option key={plate.id} value={plate.id}>{partLabel(project, plate.id)} · {plate.name}</option>)}
        </select>
      </label>
      {part && <SillMeasurements key={part.id} part={part} saved={saved?.measured}
        onSave={(measured) => update(() => saveSillGasket(project, part.id, measured), "Gasket measurements saved.")} />}
      {error && <p role="alert" className="form-error">{error}</p>}
      {message && <p role="status" className="small-note">{message}</p>}
      {review.rows.length > 0 && (
        <ul aria-label="Measured sill gasket runs">
          {review.rows.map(({ plan, title, issues, length, outline }) => (
            <li key={plan.partId}>
              <strong>{title}</strong>
              <p className="small-note">{issues.length
                ? `Needs review. ${issues.join(" ")}`
                : `One ${formatStockLength(length!)} strip before setting the plate.`}</p>
              {outline && <button className="text-button" type="button"
                onClick={() => onShow(shownId === plan.partId ? null : plan.partId)}>
                {shownId === plan.partId ? "Hide gasket footprint" : "Show gasket footprint"}
              </button>}
              <button type="button" className="text-button"
                onClick={() => update(() => removeSillGasket(project, plan.partId), "Gasket run removed.")}>Remove run</button>
            </li>
          ))}
        </ul>
      )}
      {review.groups.map(({ product, selected, rolls }) => (
        <details className="field-section" key={product.id}>
          <summary>{formatPreciseInches(product.width)} ComfortSeal · {rolls.length} {rolls.length === 1 ? "roll" : "rolls"} needed · {selected} selected</summary>
          <ol aria-label={`${product.width} inch gasket roll cuts`}>
            {rolls.map(({ runs, left }, i) => (
              <li key={i}>
                <strong>Roll {i + 1}</strong> · {runs.map(({ title, length }) => `${title}, ${formatStockLength(length)}`).join(" · ")}
                {" · "}{formatStockLength(left)} remaining
              </li>
            ))}
          </ol>
          <p className="small-note"><a href={sillGasketListing(product.internetNumber)} target="_blank" rel="noreferrer">Home Depot {product.model} roll</a></p>
        </details>
      ))}
      {missing && project.retailer === "home-depot" && (
        <button type="button" className="button secondary full" onClick={() =>
          update(() => addMissingSillGasketRolls(project), "Missing gasket rolls added to the shopping list.")}>
          Add missing gasket rolls
        </button>
      )}
      <p className="small-note">
        <a href={sillGasketInstructions} target="_blank" rel="noreferrer">Owens Corning instructions</a>
        {" · "}
        <a href={sillGasketBuildingGuide} target="_blank" rel="noreferrer">PNNL sill plate detail</a>
      </p>
    </details>
  );
}
