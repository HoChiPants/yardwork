import { LengthInput } from "./LengthInput";
import {
  defaultGreenhouseRoofVent,
  type GreenhouseRoofVent,
} from "./recipeSchemas";

export function RoofVentFields({
  value,
  onChange,
}: {
  value?: GreenhouseRoofVent;
  onChange: (vent: GreenhouseRoofVent | undefined) => void;
}) {
  return (
    <div className="field-section">
      <label className="inline">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { ...defaultGreenhouseRoofVent }
                : undefined,
            )
          }
        />
        Add a roof vent
      </label>
      {value && (
        <div className="planner-module-grid">
          <label className="field">
            Roof slope from front
            <select
              value={value.side}
              onChange={(event) =>
                onChange({
                  ...value,
                  side: event.target.value === "left" ? "left" : "right",
                })
              }
            >
              <option value="left">Left slope</option>
              <option value="right">Right slope</option>
            </select>
          </label>
          <label className="field">
            Rafter bay from back
            <input
              type="number"
              min="1"
              max="32"
              step="1"
              value={Number.isFinite(value.bay) ? value.bay : ""}
              onChange={(event) =>
                onChange({ ...value, bay: event.target.valueAsNumber })
              }
            />
          </label>
          <LengthInput
            label="Vent setback from ridge"
            value={value.ridgeOffset}
            onChange={(ridgeOffset) => onChange({ ...value, ridgeOffset })}
            min={4}
            max={120}
          />
          <LengthInput
            label="Vent length down roof"
            value={value.length}
            onChange={(length) => onChange({ ...value, length })}
            min={10}
            max={60}
          />
          <p className="small-note">
            The width comes from the gap between the two rafters. Both lengths
            are measured along the roof slope.
          </p>
        </div>
      )}
    </div>
  );
}
