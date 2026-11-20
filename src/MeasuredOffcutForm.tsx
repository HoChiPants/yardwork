import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import {
  measuredOffcutLimits,
  measuredOffcutMaterials,
} from "./measuredOffcuts";
import { material, type MaterialId, type V3 } from "./model";

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
        Measure the rectangular piece you have. Use the grain direction for
        length.
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
              label={kind === "linear" ? "Boards" : "Wood panels"}
            >
              {measuredOffcutMaterials
                .filter(({ stockKind }) => stockKind === kind)
                .map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.name} · {stock.subtitle}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <small>
          Stock limits · {limits.map(formatPreciseInches).join(" × ")} · length,
          width, thickness
        </small>
      </label>
      {(["Length", "Width", "Thickness"] as const).map((label, index) => (
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
