import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";
import { saunaRooms } from "./saunaHeaters";
import {
  applySaunaVentOpenings,
  removeSaunaVentOpenings,
  removeSaunaVentilation,
  saunaVentNames,
  saunaVentReference,
  saunaVentScope,
  saunaVentWallNames,
  saunaVentilationReview,
  saunaVentOpeningsReview,
  saveSaunaVentilation,
} from "./saunaVentilation";
import {
  saunaVentilationInputSchema,
  saunaVentWalls,
  type SaunaVentOpening,
  type SaunaVentilationInput,
} from "./saunaVentilationSchema";

function newOpening(wall: SaunaVentOpening["wall"]): SaunaVentOpening {
  return { wall, offset: NaN, height: NaN, bore: NaN, depth: NaN };
}

function OpeningFields({
  label,
  opening,
  onChange,
  duct,
}: {
  label: string;
  opening: SaunaVentOpening;
  onChange: (value: SaunaVentOpening) => void;
  duct?: { value: number; onChange: (value: number) => void };
}) {
  return (
    <fieldset className="field-section">
      <legend>{label}</legend>
      <label className="field">
        {label} wall
        <select
          value={opening.wall}
          onChange={(event) =>
            onChange({
              ...opening,
              wall: event.target.value as SaunaVentOpening["wall"],
            })
          }
        >
          {saunaVentWalls.map((wall) => (
            <option key={wall} value={wall}>
              {saunaVentWallNames[wall]}
            </option>
          ))}
        </select>
      </label>
      <LengthInput
        label={`${label} center offset`}
        value={opening.offset}
        onChange={(offset) => onChange({ ...opening, offset })}
        min={-240}
        max={240}
      />
      <LengthInput
        label={`${label} height above finished floor`}
        value={opening.height}
        onChange={(height) => onChange({ ...opening, height })}
        min={0}
        max={240}
      />
      {duct && (
        <LengthInput
          label={`${label} inside duct diameter`}
          value={duct.value}
          onChange={duct.onChange}
          max={48}
        />
      )}
      <LengthInput
        label={`${label} rough diameter`}
        value={opening.bore}
        onChange={(bore) => onChange({ ...opening, bore })}
        max={48}
      />
      <LengthInput
        label={`${label} wall depth`}
        value={opening.depth}
        onChange={(depth) => onChange({ ...opening, depth })}
        max={48}
      />
    </fieldset>
  );
}

function LayoutForm({
  project,
  roomId,
  onChange,
}: {
  project: Project;
  roomId: string;
  onChange: (project: Project) => void;
}) {
  const saved = project.saunaVentilationPlans?.find(
    (row) => row.roomId === roomId,
  );
  const [draft, setDraft] = useState<SaunaVentilationInput>(() =>
    saved
      ? {
          mode: saved.mode,
          intake: saved.intake,
          exhaust: saved.exhaust,
          drying: saved.drying,
        }
      : {
          mode: "mechanical",
          intake: { ...newOpening("front"), duct: NaN },
          exhaust: { ...newOpening("back"), duct: NaN },
          drying: null,
        },
  );
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(!saved);
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onChange(saveSaunaVentilation(project, roomId, draft));
      setEditing(false);
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Review the opening dimensions.",
      );
    }
  }
  if (!editing)
    return (
      <button
        className="button secondary full"
        type="button"
        onClick={() => setEditing(true)}
      >
        Edit ventilation layout
      </button>
    );
  return (
    <form onSubmit={submit}>
      <label className="field">
        Ventilation type
        <select
          value={draft.mode}
          onChange={(event) =>
            setDraft({
              ...draft,
              mode: event.target.value === "gravity" ? "gravity" : "mechanical",
            })
          }
        >
          <option value="mechanical">Fan-assisted</option>
          <option value="gravity">Gravity</option>
        </select>
      </label>
      <p className="small-note">
        Measure from the finished wall center and floor. Positive X is toward
        the room’s right side. Positive Z is toward its door.
      </p>
      {(["intake", "exhaust"] as const).map((kind) => (
        <OpeningFields
          key={kind}
          label={saunaVentNames[kind]}
          opening={draft[kind]}
          onChange={(opening) =>
            setDraft({ ...draft, [kind]: { ...draft[kind], ...opening } })
          }
          duct={{
            value: draft[kind].duct,
            onChange: (duct) =>
              setDraft({ ...draft, [kind]: { ...draft[kind], duct } }),
          }}
        />
      ))}
      <label className="field">
        After-use drying
        <select
          value={
            draft.drying === null
              ? "unset"
              : draft.drying === "door"
                ? "door"
                : "vent"
          }
          onChange={(event) =>
            setDraft({
              ...draft,
              drying:
                event.target.value === "door"
                  ? "door"
                  : event.target.value === "vent"
                    ? newOpening(draft.exhaust.wall)
                    : null,
            })
          }
        >
          <option value="unset">Choose drying method</option>
          <option value="door">Open door after use</option>
          <option value="vent">Dedicated wall opening</option>
        </select>
      </label>
      {draft.drying && draft.drying !== "door" && (
        <OpeningFields
          label="Drying opening"
          opening={draft.drying}
          onChange={(drying) => setDraft({ ...draft, drying })}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={!saunaVentilationInputSchema.safeParse(draft).success}
      >
        Save and check vent layout
      </button>
    </form>
  );
}

export function SaunaVentilationPanel({
  project,
  onChange,
  shownId,
  onShow,
}: {
  project: Project;
  onChange: (project: Project) => void;
  shownId: string | null;
  onShow: (id: string | null) => void;
}) {
  const rooms = saunaRooms(project);
  const orphaned = (project.saunaVentilationPlans ?? []).filter(
    (plan) => !rooms.some(({ entry }) => entry.id === plan.roomId),
  );
  const [selected, setSelected] = useState("");
  const [openingError, setOpeningError] = useState("");
  const room = rooms.find(({ entry }) => entry.id === selected) ?? rooms[0];
  if (!room && !orphaned.length) return null;
  const plan = project.saunaVentilationPlans?.find(
    ({ roomId }) => roomId === room?.entry.id,
  );
  const review = plan && saunaVentilationReview(project, plan);
  const cuts = review && saunaVentOpeningsReview(project, review);
  return (
    <details className="field-section">
      <summary>Plan sauna ventilation</summary>
      <p className="small-note">
        Wall openings for the U.S. HUUM STEEL 6 layout.{" "}
        <a href={saunaVentReference.url} target="_blank" rel="noreferrer">
          Ventilation reference
        </a>
      </p>
      {rooms.length > 1 && (
        <label className="field">
          Sauna room
          <select
            value={room?.entry.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {rooms.map(({ entry, title }, index) => (
              <option key={entry.id} value={entry.id}>
                {title} · Room {index + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {review && (
        <>
          {review.issues.length ? (
            <ul className="motion-findings">
              {review.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p role="status">Modeled opening checks passed.</p>
          )}
          {review.openings.length > 0 && (
            <button
              className="button secondary full"
              type="button"
              aria-pressed={shownId === plan.roomId}
              onClick={() =>
                onShow(shownId === plan.roomId ? null : plan.roomId)
              }
            >
              {shownId === plan.roomId
                ? "Hide openings"
                : "Show openings in 3D"}
            </button>
          )}
          {cuts && (
            <div className="field-section">
              {cuts.current ? (
                <p role="status">
                  {cuts.applied} wall parts with modeled round openings.
                </p>
              ) : (
                <>
                  {!!cuts.applied && (
                    <p>Applied openings differ from this layout.</p>
                  )}
                  {cuts.issue && <p className="small-note">{cuts.issue}</p>}
                  {!cuts.issue && plan && (
                    <button
                      type="button"
                      className="button secondary full"
                      onClick={() => {
                        try {
                          onChange(applySaunaVentOpenings(project, plan));
                          setOpeningError("");
                        } catch (problem) {
                          setOpeningError(
                            problem instanceof Error
                              ? problem.message
                              : "Review the opening layout.",
                          );
                        }
                      }}
                    >
                      {cuts.applied
                        ? "Update modeled openings"
                        : "Apply openings to wall parts"}
                    </button>
                  )}
                </>
              )}
              {cuts.applied > 0 && plan && (
                <>
                  <p className="small-note">
                    Motion checks use the modeled openings. Check delivered
                    hardware and fastener placement in the field.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      onChange(removeSaunaVentOpenings(project, plan.roomId))
                    }
                  >
                    Remove modeled openings
                  </button>
                </>
              )}
              {openingError && (
                <p role="alert" className="form-error">
                  {openingError}
                </p>
              )}
            </div>
          )}
          <p className="small-note">{saunaVentScope}</p>
        </>
      )}
      {room && (
        <LayoutForm
          key={JSON.stringify([room.entry.id, plan])}
          roomId={room.entry.id}
          project={project}
          onChange={onChange}
        />
      )}
      {plan && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(removeSaunaVentilation(project, plan.roomId))}
        >
          Remove saved ventilation layout
        </button>
      )}
      {orphaned.map(({ roomId }) => (
        <p key={roomId} className="small-note">
          A saved ventilation layout refers to a missing room.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(removeSaunaVentilation(project, roomId))}
          >
            Remove orphaned layout
          </button>
        </p>
      ))}
    </details>
  );
}
