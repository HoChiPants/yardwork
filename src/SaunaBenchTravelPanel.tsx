import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { motionDistance, type MotionPreview } from "./mechanismMotion";
import type { Project } from "./model";
import { cedarbrookBenchInstructions } from "./saunaBenchReference";
import {
  benchTravelScope,
  reviewSaunaBenchTravel,
  saunaBenchLegPreview,
  saunaBenchTravelRooms,
  saveSaunaBenchTravel,
} from "./saunaBenchTravel";
import type { SaunaBenchTravelPlan } from "./saunaBenchTravelSchema";
import { useMotionPlayback } from "./useMotionPlayback";

type Props = {
  project: Project;
  onChange: (project: Project) => void;
  previewActive: boolean;
  onStartPreview: () => void;
  onPreview: (value: MotionPreview | null) => void;
};

type Measurements = Omit<
  SaunaBenchTravelPlan,
  "roomId" | "benchId" | "roughWidth" | "roughHeight"
>;
const lengths = [
  {
    key: "openingWidth",
    label: "Finished opening width",
    min: 0.125,
    max: 120,
  },
  {
    key: "openingHeight",
    label: "Finished opening height",
    min: 0.125,
    max: 120,
  },
  { key: "sillRise", label: "Sill above the sauna floor", min: 0, max: 24 },
  { key: "passageDepth", label: "Doorway passage depth", min: 0.125, max: 36 },
  { key: "lift", label: "Carry height above the floor", min: 0, max: 48 },
] as const;

function CarryForm({
  project,
  onChange,
  onPreview,
  id,
  plan,
}: Props & { id: string; plan?: SaunaBenchTravelPlan }) {
  const [draft, setDraft] = useState<Measurements>({
    openingOffset: plan?.openingOffset ?? 0,
    openingWidth: plan?.openingWidth ?? NaN,
    openingHeight: plan?.openingHeight ?? NaN,
    sillRise: plan?.sillRise ?? NaN,
    passageDepth: plan?.passageDepth ?? NaN,
    lift: plan?.lift ?? NaN,
    turnOffset: plan?.turnOffset ?? 0,
    heaterPlaced: plan?.heaterPlaced ?? false,
  });
  const [error, setError] = useState("");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = saveSaunaBenchTravel(project, id, draft);
      onPreview(null);
      onChange(next);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The carry-in test could not be saved.",
      );
    }
  }
  return (
    <form onSubmit={save}>
      <p className="small-note">
        Measure the narrowest clear opening with the door open. Measure height
        from the top of the sill and depth from the outside opening to the
        inside wall face.
      </p>
      {lengths.map(({ key, label, min, max }) => (
        <LengthInput
          key={key}
          label={label}
          value={draft[key]}
          min={min}
          max={max}
          required
          onChange={(value) =>
            setDraft((current) => ({ ...current, [key]: value }))
          }
        />
      ))}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={draft.heaterPlaced}
          onChange={(event) =>
            setDraft({ ...draft, heaterPlaced: event.target.checked })
          }
        />
        Heater body is already in place
      </label>
      <details>
        <summary>Adjust opening and turning point</summary>
        <p className="small-note">
          If the open door shifts the center of the clear opening, measure that
          offset from the rough opening center. Positive values move right when
          facing the outside of the doorway.
        </p>
        <LengthInput
          label="Clear opening center offset"
          value={draft.openingOffset}
          min={-60}
          max={60}
          required
          onChange={(value) => setDraft({ ...draft, openingOffset: value })}
        />
        <p className="small-note">
          Start at room center. Positive values shift the turn toward the
          doorway.
        </p>
        <LengthInput
          label="Turn offset from room center"
          value={draft.turnOffset}
          min={-120}
          max={120}
          required
          onChange={(value) => setDraft({ ...draft, turnOffset: value })}
        />
      </details>
      <button className="button secondary full" type="submit">
        Save and check carry-in
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function SaunaBenchTravelPanel(props: Props) {
  const { project, onChange, onPreview, previewActive } = props;
  const [roomId, setRoomId] = useState("");
  const rooms = saunaBenchTravelRooms(project);
  const plans = project.saunaBenchTravelPlans ?? [];
  const choices = [
    ...rooms.map((room) => ({ id: room.entry.id, title: room.title })),
    ...plans
      .filter((plan) => !rooms.some((room) => room.entry.id === plan.roomId))
      .map((plan) => ({ id: plan.roomId, title: "Missing sauna or bench" })),
  ];
  const id =
    choices.find((choice) => choice.id === roomId)?.id ?? choices[0]?.id;
  const plan = plans.find((row) => row.roomId === id);
  const review = useMemo(
    () => (plan ? reviewSaunaBenchTravel(project, plan) : null),
    [project, plan],
  );
  const { play, cancel } = useMotionPlayback(review ?? project, true);
  useEffect(() => {
    if (!previewActive) cancel();
  }, [previewActive]);

  if (!id) return null;
  return (
    <details className="field-section" id="sauna-bench-carry-in">
      <summary>Test sauna bench carry-in</summary>
      {choices.length > 1 && (
        <label className="field">
          Choose sauna room
          <select
            value={id}
            onChange={(event) => {
              cancel();
              onPreview(null);
              setRoomId(event.target.value);
            }}
          >
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {review && (
        <div>
          <p className="small-note" role="status">
            <strong>
              {review.state === "clear"
                ? "Carry-in clears"
                : review.state === "blocked"
                  ? "Carry-in blocked"
                  : "Carry-in needs review"}
            </strong>
            <br />
            {plan?.heaterPlaced
              ? "Heater body in place"
              : "Bench before heater"}{" "}
            · {review.detail}
          </p>
          {review.legs.length > 0 && (
            <ol>
              {review.legs.map((leg) => (
                <li key={leg.label}>
                  <p className="small-note">
                    {leg.label} · {motionDistance(leg.amount, leg.kind)}
                    {leg.blocker && (
                      <>
                        {" "}
                        · Stops at {motionDistance(
                          leg.limit.travel,
                          leg.kind,
                        )}{" "}
                        · {leg.blocker}
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Play: ${leg.label}`}
                    onClick={() => {
                      props.onStartPreview();
                      onPreview(saunaBenchLegPreview(leg, 0));
                      play(
                        0,
                        leg.limit.travel,
                        leg.amount,
                        (position, stopped) => {
                          onPreview(
                            saunaBenchLegPreview(leg, position, stopped),
                          );
                        },
                      );
                    }}
                  >
                    Play in 3D
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {rooms.some((room) => room.entry.id === id) && (
        <details open={!plan}>
          <summary>
            {plan
              ? "Edit carry-in measurements"
              : "Enter carry-in measurements"}
          </summary>
          <CarryForm key={id} {...props} id={id} plan={plan} />
        </details>
      )}
      {plan && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            cancel();
            onPreview(null);
            onChange({
              ...project,
              saunaBenchTravelPlans: plans.filter((row) => row.roomId !== id),
            });
          }}
        >
          Remove carry-in test
        </button>
      )}
      <p className="small-note">{benchTravelScope}</p>
      <p className="small-note">
        <a href={cedarbrookBenchInstructions} target="_blank" rel="noreferrer">
          Cedarbrook bench assembly instructions
        </a>
      </p>
    </details>
  );
}
