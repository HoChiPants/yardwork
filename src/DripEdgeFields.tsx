import { gibraltarDripEdge as product, wissSnips } from "./dripEdgeReference";
import { dripEdgeCutLines, type reviewDripEdge } from "./dripEdge";
import { LengthInput } from "./LengthInput";
import type { DripEdge, ShingleRoof } from "./shingleRoofSchema";

const blank: DripEdge = {
  productId: null,
  lap: null,
  deckReach: null,
  belowSheathing: null,
  fastenerSpacing: null,
  eaveUnderlayment: "unknown",
  rakeUnderlayment: "unknown",
};
const nullableLength = (value: number) =>
  Number.isFinite(value) ? value : null;

export function DripEdgeFields({
  roof,
  onChange,
}: {
  roof: ShingleRoof;
  onChange: (roof: ShingleRoof) => void;
}) {
  const plan = roof.dripEdge;
  const runs = (roof.edges ?? []).filter(
    ({ kind }) => kind === "eave" || kind === "rake",
  );
  return (
    <details className="field-section">
      <summary>Roof drip edge</summary>
      <label className="code-trade-choice">
        <input
          type="checkbox"
          checked={!!plan}
          onChange={(event) =>
            onChange({
              ...roof,
              dripEdge: event.target.checked ? blank : undefined,
            })
          }
        />
        Review roof drip edge
      </label>
      {plan && (
        <>
          <label className="field">
            Drip edge profile
            <select
              value={plan.productId ?? ""}
              onChange={(event) =>
                onChange({
                  ...roof,
                  dripEdge: {
                    ...plan,
                    productId: event.target.value ? product.id : null,
                  },
                })
              }
            >
              <option value="">Generic drip edge</option>
              <option value={product.id}>{product.label} · 10 ft</option>
            </select>
          </label>
          <p className="small-note">
            Record the smallest deck projection and drop, and the largest
            fastener spacing across the reviewed runs.
          </p>
          {(
            [
              ["lap", "Drip edge splice overlap", 0, 24],
              ["deckReach", "Minimum deck projection", 0, 24],
              ["belowSheathing", "Minimum drop below sheathing", 0, 24],
              [
                "fastenerSpacing",
                "Maximum drip edge fastener spacing",
                0.001,
                120,
              ],
            ] as const
          ).map(([key, label, min, max]) => (
            <LengthInput
              key={key}
              label={label}
              min={min}
              max={max}
              value={plan[key] ?? NaN}
              onChange={(value) =>
                onChange({
                  ...roof,
                  dripEdge: { ...plan, [key]: nullableLength(value) },
                })
              }
            />
          ))}
          {(
            [
              ["eaveUnderlayment", "Eave underlayment order"],
              ["rakeUnderlayment", "Rake underlayment order"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <select
                value={plan[key]}
                onChange={(event) =>
                  onChange({
                    ...roof,
                    dripEdge: {
                      ...plan,
                      [key]: event.target.value as DripEdge[typeof key],
                    },
                  })
                }
              >
                <option value="unknown">Confirm order</option>
                <option value="over">Underlayment over drip edge</option>
                <option value="under">Underlayment under drip edge</option>
              </select>
            </label>
          ))}
          {plan.productId && (
            <>
              <p className="small-note">
                The stock estimate uses the eave and rake lengths recorded under
                Starter strips and ridge caps. Enter extra length for corner
                folds and trim. Splice overlaps are added separately.
              </p>
              {runs.map((run, index) => (
                <LengthInput
                  key={run.id}
                  label={`${run.label} · drip edge allowance`}
                  ariaLabel={`Drip edge allowance for run ${index + 1} · ${run.label}`}
                  min={0}
                  max={12000}
                  value={run.dripEdgeExtra ?? NaN}
                  onChange={(value) =>
                    onChange({
                      ...roof,
                      edges: roof.edges?.map((edge) =>
                        edge.id === run.id
                          ? { ...edge, dripEdgeExtra: nullableLength(value) }
                          : edge,
                      ),
                    })
                  }
                />
              ))}
            </>
          )}
        </>
      )}
    </details>
  );
}

export function DripEdgeEstimate({
  review,
  onAdd,
}: {
  review: ReturnType<typeof reviewDripEdge>;
  onAdd?: () => void;
}) {
  return (
    <section className="section-description" aria-label="Drip edge estimate">
      <strong>{product.label}</strong>
      <p className="small-note">
        {review.sticks === null
          ? review.pending
          : `${review.sticks} × 10 ft estimated · ${review.selected} on the shopping list.`}
      </p>
      <p className="small-note">
        <a href={product.listing} target="_blank" rel="noreferrer">
          Home Depot product
        </a>
        {" · "}
        <a href={product.instructions} target="_blank" rel="noreferrer">
          Installation guide
        </a>
        {review.sticks !== null && review.cutToolNeeded && (
          <>
            {" · "}
            <a href={wissSnips.listing} target="_blank" rel="noreferrer">
              M3R aviation snips
            </a>
          </>
        )}
      </p>
      {review.sticks !== null && (
        <details>
          <summary>Cut list and leftovers</summary>
          <ul className="small-note">
            {dripEdgeCutLines(review).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {onAdd && review.missing > 0 && (
        <button type="button" className="button secondary full" onClick={onAdd}>
          Add {review.missing} drip edge{" "}
          {review.missing === 1 ? "stick" : "sticks"} to list
        </button>
      )}
    </section>
  );
}
