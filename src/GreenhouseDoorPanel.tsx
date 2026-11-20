import { useState, type FormEvent } from "react";
import {
  doorKitDemand,
  greenhouseDoorChoices,
  greenhouseDoorMotionInput,
  greenhouseDoorReview,
} from "./greenhouseDoors";
import {
  cedarDoorStop,
  greenhouseDoorKits,
  type GreenhouseDoorKitId,
} from "./greenhouseDoorReference";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";
import type {
  GreenhouseDoorSetup,
  MotionPlan,
  MotionPlanInput,
} from "./motionPlanSchema";
import { retailerName } from "./retailers";
import {
  doorStopScope,
  greenhouseDoorStopReview,
  previewGreenhouseDoorStops,
} from "./greenhouseDoorStops";
import { formatPreciseInches } from "./measurement";

export function GreenhouseDoorEditor({
  project,
  existing,
  onSave,
  onCancel,
}: {
  project: Project;
  existing?: MotionPlan;
  onSave: (draft: MotionPlanInput) => void;
  onCancel: () => void;
}) {
  const reserved = new Set(
    (project.motionPlans ?? []).flatMap((plan) =>
      plan.id !== existing?.id &&
      plan.mechanism.kind === "hinge" &&
      plan.mechanism.greenhouseDoor
        ? [plan.mechanism.greenhouseDoor.entryId]
        : [],
    ),
  );
  const choices = greenhouseDoorChoices(project).filter(
    ({ entry }) => !reserved.has(entry.id),
  );
  const initial =
    existing?.mechanism.kind === "hinge"
      ? existing.mechanism.greenhouseDoor
      : undefined;
  const [id, setId] = useState(initial?.entryId ?? choices[0]?.entry.id ?? "");
  const [side, setSide] = useState<GreenhouseDoorSetup["side"]>(
    initial?.side ?? "left",
  );
  const [outset, setOutset] = useState(initial?.outset ?? 0);
  const [sideOffset, setSideOffset] = useState(initial?.sideOffset ?? 0);
  const [travel, setTravel] = useState(existing?.mechanism.travel ?? 90);
  const [kit, setKit] = useState<GreenhouseDoorKitId | "">(
    initial?.kitId ?? "",
  );
  const [error, setError] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onSave(
        greenhouseDoorMotionInput(
          project,
          { entryId: id, side, outset, sideOffset, kitId: kit || null },
          travel,
        ),
      );
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Review the door setup.",
      );
    }
  }

  return (
    <form
      className="field-section"
      aria-label="Greenhouse door setup"
      onSubmit={save}
    >
      <h3>Greenhouse door swing</h3>
      <p className="small-note">
        Use the closed leaf. Yardwork includes its frame and any door glazing in
        the swing.
      </p>
      <label className="field">
        Greenhouse
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {!choices.some(({ entry }) => entry.id === id) && (
            <option value="">Choose a current greenhouse</option>
          )}
          {choices.map(({ entry, label }, index) => (
            <option key={entry.id} value={entry.id}>
              {label}
              {choices.length > 1 ? ` · ${index + 1}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Hinge side from outside
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as typeof side)}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <LengthInput
        label="Pivot offset from leaf front"
        value={outset}
        onChange={setOutset}
        min={-3}
        max={6}
      />
      <p className="small-note">
        Positive moves the pivot toward the exterior. Use the measured axis for
        your hardware.
      </p>
      <LengthInput
        label="Pivot offset toward jamb"
        value={sideOffset}
        onChange={setSideOffset}
        min={-3}
        max={3}
      />
      <label className="field">
        Maximum opening (degrees)
        <input
          type="number"
          min="0.01"
          max="180"
          step="any"
          required
          value={Number.isFinite(travel) ? travel : ""}
          onChange={(e) => setTravel(e.target.valueAsNumber)}
        />
      </label>
      <label className="field">
        Door hardware reference
        <select
          value={kit}
          onChange={(e) => setKit(e.target.value as typeof kit)}
        >
          <option value="">Choose later</option>
          {Object.entries(greenhouseDoorKits).map(([key, option]) => (
            <option value={key} key={key}>
              {option.label} · {retailerName(option.retailer)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={
          !id || !Number.isFinite(outset) || !Number.isFinite(sideOffset)
        }
      >
        Save and test door swing
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel setup
      </button>
    </form>
  );
}

export function GreenhouseDoorDetails({
  project,
  plan,
  onAdd,
  onFitStops,
}: {
  project: Project;
  plan: MotionPlan;
  onAdd: (id: GreenhouseDoorKitId) => void;
  onFitStops: (next: Project) => void;
}) {
  const review = greenhouseDoorReview(project, plan);
  if (plan.mechanism.kind !== "hinge" || !review) return null;
  const kitId = plan.mechanism.greenhouseDoor?.kitId;
  const demand =
    kitId && review.kit?.retailer === project.retailer && !review.warning
      ? doorKitDemand(project, kitId)
      : null;

  return (
    <section
      className="field-section"
      aria-label="Greenhouse door and hardware"
    >
      <h3>Greenhouse door and hardware</h3>
      {review.warning && <p className="form-error">{review.warning}</p>}
      {review.lines.map((line) => (
        <p className="small-note" key={line}>
          {line}
        </p>
      ))}
      {review.kit && (
        <p className="small-note">
          <a href={review.kit.listing} target="_blank" rel="noreferrer">
            Product at {retailerName(review.kit.retailer)}
          </a>
          {" · "}
          <a href={review.kit.instructions} target="_blank" rel="noreferrer">
            Manufacturer document
          </a>
        </p>
      )}
      {review.kit && review.kit.retailer !== project.retailer && (
        <p className="small-note">
          Choose {retailerName(review.kit.retailer)} in project settings to add
          this exact kit.
        </p>
      )}
      {demand && (
        <p className="small-note">
          {demand.needed} planned {demand.needed === 1 ? "kit" : "kits"} ·{" "}
          {demand.selected} in shopping list
        </p>
      )}
      {kitId && demand && demand.missing > 0 && (
        <button
          type="button"
          className="button secondary"
          onClick={() => onAdd(kitId)}
        >
          Add missing door hardware to list
        </button>
      )}
      {!review.warning && (
        <DoorStops
          key={plan.id}
          project={project}
          plan={plan}
          onFit={onFitStops}
        />
      )}
    </section>
  );
}

function DoorStops({
  project,
  plan,
  onFit,
}: {
  project: Project;
  plan: MotionPlan;
  onFit: (next: Project) => void;
}) {
  const [sealGap, setSealGap] = useState(0);
  const [sillGap, setSillGap] = useState(0);
  const [reuse, setReuse] = useState(true);
  const [preview, setPreview] = useState<{
    base: Project;
    result: ReturnType<typeof previewGreenhouseDoorStops>;
  } | null>(null);
  const [error, setError] = useState("");
  const saved = greenhouseDoorStopReview(project, plan);
  const current = preview?.base === project ? preview.result : null;
  const clear = () => {
    setPreview(null);
    setError("");
  };
  function check() {
    clear();
    try {
      setPreview({
        base: project,
        result: previewGreenhouseDoorStops(project, plan, {
          sealGap,
          sillGap,
          reuse,
        }),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not fit the door stops.",
      );
    }
  }
  return (
    <details className="field-section">
      <summary>Fit door stops</summary>
      {saved.length > 0 ? (
        <ul className="small-note">
          {saved.map(({ line, warning }) => (
            <li key={line}>
              {warning && "Review · "}
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="small-note">
            Fit cedar strips behind the closed leaf at both jambs and the head.
          </p>
          <LengthInput
            label="Gap behind closed leaf"
            min={0}
            max={0.5}
            value={sealGap}
            onChange={(value) => {
              clear();
              setSealGap(value);
            }}
          />
          <LengthInput
            label="Jamb stop clearance above sill"
            min={0}
            max={3}
            value={sillGap}
            onChange={(value) => {
              clear();
              setSillGap(value);
            }}
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={reuse}
              onChange={(event) => {
                clear();
                setReuse(event.target.checked);
              }}
            />
            Use matching offcuts first
          </label>
          <button
            type="button"
            className="button secondary full"
            disabled={!Number.isFinite(sealGap) || !Number.isFinite(sillGap)}
            onClick={check}
          >
            Preview stop cuts
          </button>
          {current && (
            <>
              <ul className="small-note">
                {current.rows.map((row) => (
                  <li key={row.name}>
                    {row.name} · {formatPreciseInches(row.length)} long ·{" "}
                    {formatPreciseInches(row.backingDepth)} narrowest backing ·{" "}
                    {row.reused ? "Reuse offcut" : "Plan new stock"}
                  </li>
                ))}
              </ul>
              <p className="small-note">
                The three stops clear the saved swing in the model.
              </p>
              <button
                type="button"
                className="button primary full"
                onClick={() => {
                  try {
                    onFit(current.project);
                    clear();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not add the door stops.",
                    );
                  }
                }}
              >
                Add fitted door stops
              </button>
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="small-note">{doorStopScope}</p>
      <p className="small-note">
        <a href={cedarDoorStop.listing} target="_blank" rel="noreferrer">
          Cedar 1 × 2 at Home Depot
        </a>
      </p>
    </details>
  );
}
