import { useEffect, useId, useState } from "react";
export function LengthInput({
  label,
  ariaLabel = label,
  name,
  required,
  value,
  onChange,
  defaultUnit = "in",
  min = 0.125,
  max = 1200,
}: {
  label: string;
  ariaLabel?: string;
  name?: string;
  required?: boolean;
  value: number;
  onChange: (inches: number) => void;
  defaultUnit?: "in" | "ft";
  min?: number;
  max?: number;
}) {
  const inputId = useId();
  const [unit, setUnit] = useState<"in" | "ft">(defaultUnit);
  const scale = unit === "ft" ? 12 : 1;
  const [draft, setDraft] = useState(
    Number.isFinite(value) ? String(Number((value / scale).toFixed(5))) : "",
  );
  useEffect(() => {
    if (Number.isFinite(value))
      setDraft(String(Number((value / scale).toFixed(5))));
  }, [value, scale]);
  return (
    <div className="field length-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="length-entry">
        <input
          id={inputId}
          aria-label={ariaLabel}
          name={name}
          required={required}
          type="number"
          step="any"
          min={min / scale}
          max={max / scale}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(
              e.target.value.trim() ? Number(e.target.value) * scale : NaN,
            );
          }}
        />
        <select
          aria-label={`${label} units`}
          name={name ? `${name}-unit` : undefined}
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value as "in" | "ft");
          }}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </div>
    </div>
  );
}
