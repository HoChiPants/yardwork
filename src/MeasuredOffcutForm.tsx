import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import {
  measuredOffcutLimits,
  measuredOffcutMaterials,
} from "./measuredOffcuts";
import { material, type MaterialId, type V3 } from "./model";
import { isPexPipe } from "./wallWaterReference";
import { isDrywall } from "./drywallReference";

function defaults(id: MaterialId): V3 {
  const [, width, thickness] = measuredOffcutLimits(material(id));
  return [NaN, material(id).stockKind === "linear" ? width : NaN, thickness];
}

export function MeasuredOffcutForm({
  onAdd,
}: {
  onAdd: (id: MaterialId, dimensions: V3, name: string) => void;
}) {
  const [id, setId] = useState<MaterialId>("stud");
  const [dimensions, setDimensions] = useState(() => defaults(id));
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const limits = measuredOffcutLimits(material(id));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onAdd(id, dimensions, name);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The offcut could not be added.",
      );
    }
  }
  return (
    <form onSubmit={submit}>
      <h2 id="modal-title">Add a measured offcut</h2>
      <p className="small-note">
        {isPexPipe(id) ? "Measure the usable length of this exact pipe with clean ends."
          : isDrywall(id) ? "Measure the usable width and length and keep track of the face paper."
            : "Measure the rectangular piece you have along the grain for length."}
      </p>
      <label className="field">
        Matching stock
        <select
          value={id}
          onChange={(event) => {
            const next = event.target.value as MaterialId;
            setId(next);
            setDimensions(defaults(next));
            setError("");
          }}
        >
          {(["linear", "sheet"] as const).map((kind) => (
            <optgroup
              key={kind}
              label={kind === "linear" ? "Boards" : "Panels"}
            >
              {measuredOffcutMaterials
                .filter(({ stockKind, id }) => stockKind === kind && !isPexPipe(id))
                .map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.name} · {stock.subtitle}
                  </option>
                ))}
            </optgroup>
          ))}
          <optgroup label="PEX pipe">
            {measuredOffcutMaterials.filter((stock) => isPexPipe(stock.id)).map((stock) =>
              <option key={stock.id} value={stock.id}>{stock.name} · {stock.subtitle}</option>)}
          </optgroup>
        </select>
        <small>
          {isPexPipe(id) ? `Outside diameter ${formatPreciseInches(limits[1])} · up to ${formatPreciseInches(limits[0])} long`
            : `Stock limits · ${limits.map(formatPreciseInches).join(" × ")} · length, width, thickness`}
        </small>
      </label>
      {(isPexPipe(id) ? ["Length"] as const : isDrywall(id)
        ? ["Length", "Width"] as const : ["Length", "Width", "Thickness"] as const).map((label, index) => (
        <LengthInput
          key={`${id}/${label}`}
          label={label}
          value={dimensions[index]}
          required
          min={0.00001}
          max={limits[index]}
          onChange={(value) =>
            setDimensions((current) => {
              const next: V3 = [...current];
              next[index] = value;
              return next;
            })
          }
        />
      ))}
      <label className="field">
        Name (optional)
        <input
          value={name}
          maxLength={110}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="submit" className="button primary full">
        Add to Cut pool
      </button>
    </form>
  );
}
