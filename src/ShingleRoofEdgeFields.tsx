import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { uid } from "./model";
import {
  maxRoofEdges,
  roofEdgeKinds,
  type ShingleRoofEdge,
} from "./shingleRoofSchema";

export function ShingleRoofEdgeFields({
  edges,
  measuredDistance,
  onChange,
}: {
  edges: ShingleRoofEdge[];
  measuredDistance: number | null;
  onChange: (edges: ShingleRoofEdge[]) => void;
}) {
  const tapeLength =
    measuredDistance !== null &&
    measuredDistance >= 0.001 &&
    measuredDistance <= 12000
      ? measuredDistance
      : null;
  return (
    <details className="field-section">
      <summary>Starter strips and ridge caps</summary>
      <p className="small-note">
        Record each edge once. Use the length along the roof edge. You can copy
        a distance from the 3D tape or enter a field measurement.
      </p>
      {edges.map((edge, index) => {
        const prefix = `Edge ${index + 1}`;
        const update = (change: Partial<ShingleRoofEdge>) =>
          onChange(
            edges.map((item) =>
              item.id === edge.id ? { ...item, ...change } : item,
            ),
          );
        return (
          <fieldset key={edge.id} className="field">
            <legend>{prefix}</legend>
            <label className="field">
              {prefix} name
              <input
                required
                maxLength={80}
                value={edge.label}
                onChange={(event) => update({ label: event.target.value })}
              />
            </label>
            <label className="field">
              {prefix} type
              <select
                value={edge.kind}
                onChange={(event) =>
                  update({
                    kind: event.target.value as ShingleRoofEdge["kind"],
                  })
                }
              >
                {Object.entries(roofEdgeKinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <LengthInput
              label={`${prefix} length`}
              value={edge.length ?? NaN}
              min={0.001}
              max={12000}
              onChange={(value) =>
                update({ length: Number.isFinite(value) ? value : null })
              }
            />
            {tapeLength !== null && (
              <button
                type="button"
                className="text-button"
                onClick={() => update({ length: tapeLength })}
              >
                Copy tape length to {prefix.toLowerCase()} ·{" "}
                {formatStockLength(tapeLength)}
              </button>
            )}
            <LengthInput
              label={`${prefix} cut allowance`}
              value={edge.extra ?? NaN}
              min={0}
              max={12000}
              onChange={(value) =>
                update({ extra: Number.isFinite(value) ? value : null })
              }
            />
            <p className="small-note">
              {edge.kind === "hip" || edge.kind === "ridge"
                ? "Allow for finish cuts and intersections. The estimate already includes a starter cap for this run."
                : "Allow for the starter offset, overlaps and end trims for this run."}{" "}
              Enter zero if none is needed.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                onChange(edges.filter((item) => item.id !== edge.id))
              }
            >
              Remove {prefix.toLowerCase()}
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="text-button"
        disabled={edges.length >= maxRoofEdges}
        onClick={() =>
          onChange([
            ...edges,
            {
              id: uid(),
              label: `Roof edge ${edges.length + 1}`,
              kind: "eave",
              length: null,
              extra: null,
            },
          ])
        }
      >
        Add roof edge
      </button>
    </details>
  );
}
