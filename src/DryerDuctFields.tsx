import { LengthInput } from "./LengthInput";
import { dryerDuctLayoutScope, dryerDuctRunLength } from "./dryerDuctLayout";
import type { DryerDuctLayout } from "./dryerExhaustSchema";
import { formatStockLength } from "./measurement";
import type { V3 } from "./model";

type Run = DryerDuctLayout["runs"][number];
const axes = ["X", "Y", "Z"] as const;
const endpoints = ["start", "end"] as const;

export function DryerDuctFields({
  layout,
  measurement,
  onChange,
}: {
  layout?: DryerDuctLayout;
  measurement: { a: V3 | null; b: V3 | null };
  onChange: (layout: DryerDuctLayout | undefined) => void;
}) {
  const runs = layout?.runs ?? [];
  const measured =
    measurement.a && measurement.b
      ? { start: measurement.a, end: measurement.b }
      : null;
  const canAdd = runs.length < 24;
  function addRun(run: Run) {
    onChange({
      envelopeWidth: layout?.envelopeWidth ?? 4,
      runs: [...runs, run],
    });
  }
  function addStraightRun() {
    const start = runs.at(-1)?.end ?? [0, 12, 0];
    if (start.some((value) => !Number.isFinite(value))) return;
    const forward = start[2] <= 11988 ? 12 : -12;
    addRun({ start, end: [start[0], start[1], start[2] + forward] });
  }
  return (
    <details className="field-section">
      <summary>3D fixed duct layout</summary>
      <p className="small-note">{dryerDuctLayoutScope}</p>
      {layout && (
        <LengthInput
          label="Duct envelope width"
          value={layout.envelopeWidth}
          min={0.125}
          max={24}
          required
          onChange={(envelopeWidth) => onChange({ ...layout, envelopeWidth })}
        />
      )}
      <div className="inline">
        <button
          className="button secondary"
          type="button"
          disabled={!canAdd}
          onClick={addStraightRun}
        >
          Add straight run
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={
            !canAdd || !measured || dryerDuctRunLength(measured) < 0.001
          }
          onClick={() => {
            if (measured) addRun(measured);
          }}
        >
          Add run from measurement
        </button>
      </div>
      {layout?.runs.map((run, index) => {
        const label = `Dryer run ${index + 1}`;
        const length = dryerDuctRunLength(run);
        return (
          <details key={index} className="field-section">
            <summary>
              {label}
              {Number.isFinite(length) && length > 0
                ? ` · ${formatStockLength(length)}`
                : " · Enter endpoints"}
            </summary>
            {endpoints.map((end) => (
              <div key={end} className="number-row">
                {axes.map((axis, i) => (
                  <LengthInput
                    key={axis}
                    label={`${end === "start" ? "Start" : "End"} ${axis}`}
                    ariaLabel={`${label} ${end} ${axis}`}
                    value={run[end][i]}
                    min={-12000}
                    max={12000}
                    required
                    onChange={(value) => {
                      const endpoint = run[end].map((n, coordinate) =>
                        coordinate === i ? value : n,
                      ) as V3;
                      onChange({
                        ...layout,
                        runs: runs.map((row, j) =>
                          j === index ? { ...row, [end]: endpoint } : row,
                        ),
                      });
                    }}
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const retained = runs.filter((_, i) => i !== index);
                onChange(
                  retained.length ? { ...layout, runs: retained } : undefined,
                );
              }}
            >
              Remove {label.toLowerCase()}
            </button>
          </details>
        );
      })}
    </details>
  );
}
