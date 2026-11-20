import { useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import { fitDesignToSiteClearance } from "./ideaBindings";
import { formatPreciseInches } from "./measurement";
import { siteFaceLidShortfall } from "./lidMotion";
import { uid, type Project } from "./model";
import {
  clearanceAxis,
  reviewSiteClearance,
  siteClearanceText,
} from "./siteClearance";
import { siteClearanceSchema, type SiteClearance } from "./siteClearanceSchema";

const faceSides = {
  "-Z": "Back (−Z)",
  "+Z": "Front (+Z)",
  "-X": "Left (−X)",
  "+X": "Right (+X)",
} as const;

export function SiteClearancesPanel({
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
  const [draft, setDraft] = useState<SiteClearance | null>(null);
  const [error, setError] = useState("");
  const [lidFitFaceId, setLidFitFaceId] = useState<string | null>(null);
  const lidFit = useMemo(() => {
    const plane = project.siteClearances?.find(
      (item) => item.id === lidFitFaceId,
    );
    if (!plane || plane.top !== null) return null;
    try {
      return { ...siteFaceLidShortfall(project, plane), error: "" };
    } catch (problem) {
      return {
        shortfall: 0,
        lidCount: 0,
        error:
          problem instanceof Error
            ? problem.message
            : "Lid clearance needs review.",
      };
    }
  }, [project, lidFitFaceId]);
  const saved = project.siteClearances ?? [];
  function commit(next: () => Project) {
    try {
      onChange(next());
      setError("");
      setDraft(null);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The clearance could not be updated.",
      );
    }
  }
  return (
    <section
      className="field-section site-clearances"
      aria-labelledby="site-clearances-title"
    >
      <h2 id="site-clearances-title">Measured site clearances</h2>
      <p className="small-note">
        Record the measured face of a wall or baseboard on the workspace grid. A
        face can apply to the whole project or one saved design. The solid line
        shows the face and the dashed line shows the minimum gap.
      </p>
      {saved.map((plane) => {
        const review = reviewSiteClearance(project, plane);
        const direction = `${plane.side.startsWith("-") ? "+" : "-"}${clearanceAxis(plane.side) === 0 ? "X" : "Z"}`;
        const includesLids = plane.top === null && lidFitFaceId === plane.id;
        const shortfall = Math.max(
          review.shortfall,
          includesLids ? (lidFit?.shortfall ?? 0) : 0,
        );
        return (
          <div className="field-section" key={plane.id}>
            <strong>{plane.label}</strong>
            <p className="small-note">{siteClearanceText(project, review)}</p>
            {plane.top === null &&
              review.status !== "missing" &&
              review.status !== "empty" && (
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    checked={includesLids}
                    onChange={(event) =>
                      setLidFitFaceId(event.target.checked ? plane.id : null)
                    }
                  />
                  Include lid swing
                </label>
              )}
            {includesLids && lidFit && (
              <p
                className="small-note"
                role={lidFit.error ? "alert" : undefined}
              >
                {lidFit.error ||
                  (lidFit.lidCount === 0
                    ? "There are no opening lids in this clearance’s scope."
                    : lidFit.shortfall > 0
                      ? `The modeled lid swing needs ${formatPreciseInches(lidFit.shortfall)} more clearance.`
                      : "The modeled lid swing meets the minimum gap.")}
              </p>
            )}
            {plane.bindingId !== null &&
              shortfall > 1e-7 &&
              !(includesLids && lidFit?.error) && (
                <button
                  className="button secondary full"
                  type="button"
                  onClick={() =>
                    commit(() =>
                      fitDesignToSiteClearance(project, plane.id, includesLids),
                    )
                  }
                >
                  Move {formatPreciseInches(shortfall)} along {direction}
                </button>
              )}
            <div className="inline">
              {review.status !== "missing" && (
                <button
                  className="text-button"
                  type="button"
                  aria-pressed={shownId === plane.id}
                  onClick={() => onShow(shownId === plane.id ? null : plane.id)}
                >
                  {shownId === plane.id ? "Hide face" : "Show face"}
                </button>
              )}
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setDraft(plane);
                  setError("");
                }}
              >
                Edit {plane.label}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  commit(() => ({
                    ...project,
                    siteClearances: saved.filter(
                      (entry) => entry.id !== plane.id,
                    ),
                  }))
                }
              >
                Remove {plane.label}
              </button>
            </div>
          </div>
        );
      })}
      {!draft && saved.length < 64 && (
        <button
          className="button secondary full"
          type="button"
          onClick={() => {
            setDraft({
              id: uid(),
              bindingId: null,
              label: "",
              side: "-Z",
              coordinate: NaN,
              top: null,
              minimum: 0,
            });
            setError("");
          }}
        >
          Add measured face
        </button>
      )}
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            commit(() => {
              const plane = siteClearanceSchema.parse(draft);
              if (
                plane.bindingId !== null &&
                !project.ideaBindings.some(
                  (design) => design.id === plane.bindingId,
                )
              )
                throw Error("Choose an existing saved design.");
              return {
                ...project,
                siteClearances: [
                  ...saved.filter((entry) => entry.id !== plane.id),
                  plane,
                ],
              };
            });
          }}
        >
          <label className="field">
            Face name
            <input
              value={draft.label}
              maxLength={80}
              required
              onChange={(event) =>
                setDraft({ ...draft, label: event.target.value })
              }
            />
          </label>
          <label className="field">
            Apply clearance to
            <select
              value={draft.bindingId ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, bindingId: event.target.value || null })
              }
            >
              <option value="">Entire project</option>
              {draft.bindingId !== null &&
                !project.ideaBindings.some(
                  (design) => design.id === draft.bindingId,
                ) && <option value={draft.bindingId}>Missing design</option>}
              {project.ideaBindings.map((design) => (
                <option key={design.id} value={design.id}>
                  {design.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Face is on the
            <select
              value={draft.side}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  side: event.target.value as SiteClearance["side"],
                })
              }
            >
              {Object.entries(faceSides).map(([side, label]) => (
                <option key={side} value={side}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <LengthInput
            label="Face coordinate from grid origin"
            value={draft.coordinate}
            min={-12000}
            max={12000}
            onChange={(coordinate) => setDraft({ ...draft, coordinate })}
          />
          <label className="field">
            Height of face
            <select
              value={draft.top === null ? "full" : "low"}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  top: event.target.value === "full" ? null : 4,
                })
              }
            >
              <option value="full">Full height</option>
              <option value="low">From floor to measured height</option>
            </select>
          </label>
          {draft.top !== null && (
            <LengthInput
              label="Height above floor"
              value={draft.top}
              onChange={(top) => setDraft({ ...draft, top })}
            />
          )}
          <LengthInput
            label="Minimum gap"
            value={draft.minimum}
            min={0}
            onChange={(minimum) => setDraft({ ...draft, minimum })}
          />
          <div className="inline">
            <button
              className="button primary"
              type="submit"
              disabled={
                !draft.label.trim() ||
                !siteClearanceSchema.safeParse(draft).success
              }
            >
              Save clearance
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
