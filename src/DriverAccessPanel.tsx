import { useMemo, useState } from "react";
import {
  driverAccessScope,
  reviewDriverAccess,
  type DriverAccessLocation,
} from "./fastenerAccess";
import { driverAccessSchema, type DriverAccess } from "./fasteningSchema";
import type { FastenerReview } from "./fastenings";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";

const fields = [
  ["bitReach", "Exposed bit reach", 0.001],
  ["shaftWidth", "Bit or holder width", 0.001],
  ["bodyLength", "Tool body length along bit", 0.001],
  ["bodyWidth", "Widest part of tool body", 0.001],
  ["approachTravel", "Straight travel before seating", 0],
] as const;

const driverAccessStateName = {
  clear: "Clear",
  "before-stage": "Fasten before adding a later part",
  "within-stage": "Fasten before another part in this step",
  blocked: "Approach blocked",
  pending: "Path needs review",
} as const;

export function DriverAccessPanel({
  project,
  review,
  draft,
  onCheck,
  onShow,
}: {
  project: Project;
  review: FastenerReview | null;
  draft: DriverAccess | undefined;
  onCheck: (value: DriverAccess | undefined) => void;
  onShow?: (value: DriverAccessLocation | null) => void;
}) {
  const [input, setInput] = useState<DriverAccess>(
    draft ?? {
      bitReach: NaN,
      shaftWidth: NaN,
      bodyLength: NaN,
      bodyWidth: NaN,
      approachTravel: 0,
    },
  );
  // Empty review while the plan is invalid. Results follow the same draft validation as the paths.
  const result = useMemo(
    () =>
      review && draft ? reviewDriverAccess(project, [review])[0] : undefined,
    [project, review, draft],
  );
  const parsed = driverAccessSchema.safeParse(input);
  const edited = !!draft && fields.some(([key]) => input[key] !== draft[key]);

  return (
    <details className="attachment-plan">
      <summary>Check driver clearance</summary>
      <p className="small-note">
        Measure from the bit tip to the wider tool body. Include the battery,
        handle and grip in the widest dimension if they occupy the approach.
      </p>
      {fields.map(([key, label, min]) => (
        <LengthInput
          key={key}
          label={label}
          value={input[key]}
          min={min}
          max={48}
          onChange={(value) => {
            onShow?.(null);
            setInput({ ...input, [key]: value });
          }}
        />
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={!parsed.success}
        onClick={() => {
          if (parsed.success) {
            onShow?.(null);
            onCheck(parsed.data);
          }
        }}
      >
        Check tool approach
      </button>
      {draft && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onShow?.(null);
            onCheck(undefined);
          }}
        >
          Remove clearance check
        </button>
      )}
      {result && (
        <>
          <p className="small-note" role="status">
            {edited
              ? "Input changed. Check the tool approach again."
              : result.order === "saved"
                ? "Using saved guide order."
                : "Using suggested assembly order."}
          </p>
          {result.locations.length === 0 && (
            <p className="small-note">
              Record a screw location to check its tool approach.
            </p>
          )}
          {!edited &&
            result.locations.map((row) => (
              <div className="attachment-plan" key={row.id}>
                <p className="small-note">
                  <strong>
                    {row.label} · {driverAccessStateName[row.state]}
                  </strong>
                  <br />
                  {row.detail}
                </p>
                {onShow && row.envelopes.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onShow(row)}
                  >
                    Show approach for {row.label}
                  </button>
                )}
              </div>
            ))}
          <p className="small-note">
            Save the fastener plan to keep the measured setup in the build
            guide.
          </p>
        </>
      )}
      <p className="small-note">{driverAccessScope}</p>
    </details>
  );
}
