import { LengthInput } from "./LengthInput";
import { dryerLengthMethods } from "./dryerExhaust";
import { DryerDuctFields } from "./DryerDuctFields";
import type { V3 } from "./model";
import {
  blankDryerExhaust,
  dryerFittings,
  type DryerExhaust,
} from "./dryerExhaustSchema";

const fittings = Object.entries(dryerFittings) as [
  keyof typeof dryerFittings,
  (typeof dryerFittings)[keyof typeof dryerFittings],
][];

export function DryerExhaustFields({
  plan,
  measurement,
  onChange,
}: {
  plan?: DryerExhaust;
  measurement: { a: V3 | null; b: V3 | null };
  onChange: (value: DryerExhaust | undefined) => void;
}) {
  return (
    <fieldset className="field">
      <legend>Dryer exhaust</legend>
      <label className="code-trade-choice">
        <input
          type="checkbox"
          checked={!!plan}
          onChange={(event) =>
            onChange(event.target.checked ? blankDryerExhaust() : undefined)
          }
        />
        Review a dryer exhaust route
      </label>
      {plan && (
        <>
          <label className="field">
            Dryer type
            <select
              value={plan.appliance}
              onChange={(event) =>
                onChange({
                  ...plan,
                  appliance: event.target.value as DryerExhaust["appliance"],
                })
              }
            >
              <option value="unknown">Confirm dryer type</option>
              <option value="ducted">Ducted clothes dryer</option>
              <option value="ductless">Listed ductless dryer</option>
            </select>
          </label>
          {plan.appliance === "ducted" && (
            <>
              <DryerDuctFields layout={plan.layout} measurement={measurement}
                onChange={(layout) => onChange({ ...plan, layout })} />
              <label className="field">
                Dryer exhaust length method
                <select
                  value={plan.lengthMethod}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      lengthMethod: event.target
                        .value as DryerExhaust["lengthMethod"],
                    })
                  }
                >
                  {Object.entries(dryerLengthMethods).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small-note">
                Measure the fixed run from the transition connection to the
                outdoor terminal. Enter the separate connector below.
              </p>
              <LengthInput
                label="Fixed exhaust duct run"
                value={plan.runLength ?? NaN}
                defaultUnit="ft"
                min={0.001}
                max={2400}
                onChange={(value) =>
                  onChange({
                    ...plan,
                    runLength: Number.isFinite(value) ? value : null,
                  })
                }
              />
              {plan.lengthMethod === "specified" && (
                <details>
                  <summary>Exhaust duct fittings</summary>
                  {fittings.map(([key, { label }]) => (
                    <label className="field" key={key}>
                      {label}
                      <input
                        type="number"
                        step={1}
                        min={0}
                        max={99}
                        inputMode="numeric"
                        value={plan.fittingCounts[key] ?? ""}
                        onChange={(event) => {
                          const next = { ...plan.fittingCounts };
                          if (event.target.value === "") delete next[key];
                          else next[key] = Number(event.target.value);
                          onChange({
                            ...plan,
                            fittingCounts: next,
                            fittingsAccountedFor: false,
                          });
                        }}
                      />
                    </label>
                  ))}
                  <label className="code-trade-choice">
                    <input
                      type="checkbox"
                      checked={plan.fittingsAccountedFor}
                      onChange={(event) =>
                        onChange({
                          ...plan,
                          fittingsAccountedFor: event.target.checked,
                        })
                      }
                    />
                    All fittings accounted for, or the run has none
                  </label>
                </details>
              )}
              <LengthInput
                label="Separate transition connector length"
                value={plan.transitionLength ?? NaN}
                min={0.001}
                max={2400}
                onChange={(value) =>
                  onChange({
                    ...plan,
                    transitionLength: Number.isFinite(value) ? value : null,
                  })
                }
              />
              <label className="field">
                Transition connector concealed in construction
                <select
                  value={plan.transitionConcealed}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      transitionConcealed: event.target
                        .value as DryerExhaust["transitionConcealed"],
                    })
                  }
                >
                  <option value="unknown">Confirm connector location</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
