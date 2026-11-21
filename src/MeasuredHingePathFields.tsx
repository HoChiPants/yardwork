import type { Dispatch, SetStateAction } from "react";
import type { V3 } from "./model";
import { hingePathLimit, type HingePath } from "./motionPlanSchema";

export function MeasuredHingePathFields({
  travel,
  hingePath,
  setHingePath,
}: {
  travel: number;
  hingePath: HingePath | undefined;
  setHingePath: Dispatch<SetStateAction<HingePath | undefined>>;
}) {
  return (
    <details className="field-section" open={hingePath !== undefined || undefined}>
      <summary>Measured hinge path</summary>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={hingePath !== undefined}
          onChange={(event) => setHingePath(event.target.checked ? [{ angle: travel, offset: [0, 0, 0] }] : undefined)}
        />
        Use measured hinge movement
      </label>
      {hingePath && (
        <>
          <p className="small-note">
            Set the closed hinge axis through a mark on the moving door. At each angle, enter how far that mark moved from its closed position along the workspace X, Y, and Z axes. Use signed inches.
          </p>
          <p className="small-note">
            Match the full opening reading to the maximum opening angle above. Yardwork interpolates between readings. Include intermediate angles where the hinge shifts near a wall, trim, or drawer.
          </p>
          {hingePath.map((reading, index) => {
            const last = index === hingePath.length - 1;
            const name = last ? "Full opening" : `Reading ${index + 1}`;
            return (
              <fieldset className="field-section" key={index}>
                <legend>{name}</legend>
                <label className="field">
                  {name} angle (degrees)
                  <input
                    type="number"
                    min="0.01"
                    max="180"
                    step="any"
                    required
                    value={Number.isFinite(reading.angle) ? reading.angle : ""}
                    onChange={(event) => {
                      const angle = event.target.valueAsNumber;
                      setHingePath((current) => current?.map((row, i) => i === index ? { ...row, angle } : row));
                    }}
                  />
                </label>
                <div className="number-row">
                  {(["X", "Y", "Z"] as const).map((axis, component) => (
                    <label className="field" key={axis}>
                      <span>{axis} offset (in)</span>
                      <input
                        aria-label={`${name} ${axis} offset (in)`}
                        type="number"
                        step="any"
                        required
                        value={Number.isFinite(reading.offset[component]) ? reading.offset[component] : ""}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          setHingePath((current) => current?.map((row, i) => i === index
                            ? { ...row, offset: row.offset.map((offset, j) => j === component ? value : offset) as V3 }
                            : row));
                        }}
                      />
                    </label>
                  ))}
                </div>
                {!last && (
                  <button className="text-button" type="button" onClick={() =>
                    setHingePath((current) => current?.filter((_, i) => i !== index))}>
                    Remove {name.toLowerCase()}
                  </button>
                )}
              </fieldset>
            );
          })}
          <button
            type="button"
            className="button secondary small"
            disabled={hingePath.length >= hingePathLimit ||
              !(hingePath[hingePath.length - 1].angle - (hingePath[hingePath.length - 2]?.angle ?? 0) >= 0.02)}
            onClick={() => setHingePath((current) => {
              if (!current) return current;
              const previous = current[current.length - 2]?.angle ?? 0;
              const last = current[current.length - 1];
              return [
                ...current.slice(0, -1),
                { angle: (previous + last.angle) / 2, offset: [0, 0, 0] },
                last,
              ];
            })}
          >
            Add angle reading
          </button>
        </>
      )}
    </details>
  );
}
