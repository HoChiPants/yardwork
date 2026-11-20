import { useMemo, useState } from "react";
import { GreenhouseAnchorsPanel } from "./GreenhouseAnchorsPanel";
import { LengthInput } from "./LengthInput";
import { greenhouseBaseEntries } from "./greenhouseBaseConnections";
import {
  foundationFromBase,
  greenhouseFoundationRailText,
  greenhouseFoundationScope,
  greenhouseFoundationSummary,
  reviewGreenhouseFoundation,
} from "./greenhouseFoundation";
import {
  greenhouseFoundationCoordinateLimit as coordinateLimit,
  greenhouseFoundationSchema,
  type GreenhouseFoundation,
} from "./greenhouseFoundationSchema";
import type { Project } from "./model";

const fields = [
  { key: "width", label: "Foundation width", min: 0.125, max: 1200 },
  { key: "depth", label: "Foundation depth", min: 0.125, max: 1200 },
  {
    key: "centerX",
    label: "Center X",
    min: -coordinateLimit,
    max: coordinateLimit,
  },
  {
    key: "centerZ",
    label: "Center Z",
    min: -coordinateLimit,
    max: coordinateLimit,
  },
  {
    key: "topY",
    label: "Top elevation Y",
    min: -coordinateLimit,
    max: coordinateLimit,
  },
] as const;

export function GreenhouseFoundationsPanel({
  project,
  shownId,
  onShow,
  onChange,
}: {
  project: Project;
  shownId: string | null;
  onShow: (id: string | null) => void;
  onChange: (project: Project) => void;
}) {
  const [draft, setDraft] = useState<GreenhouseFoundation | null>(null);
  const [error, setError] = useState("");
  const bases = useMemo(() => greenhouseBaseEntries(project), [project]);
  const saved = project.greenhouseFoundations ?? [];
  const entries = [
    ...new Set([
      ...bases
        .filter(({ rails }) => rails.size > 0)
        .map(({ entryId }) => entryId),
      ...saved.map(({ entryId }) => entryId),
    ]),
  ];
  if (!entries.length) return null;

  function save() {
    const parsed = greenhouseFoundationSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        "Enter a valid number for every foundation dimension and coordinate.",
      );
      return;
    }
    const site = parsed.data;
    onChange({
      ...project,
      greenhouseFoundations: saved.some(
        ({ entryId }) => entryId === site.entryId,
      )
        ? saved.map((record) =>
            record.entryId === site.entryId ? site : record,
          )
        : [...saved, site],
    });
    setDraft(null);
  }

  return (
    <section
      className="field-section greenhouse-foundations"
      aria-labelledby="greenhouse-foundations-heading"
    >
      <h2 id="greenhouse-foundations-heading">
        Greenhouse foundation footprint
      </h2>
      <p className="small-note">{greenhouseFoundationScope}</p>
      {entries.map((id) => {
        const base = bases.find(({ entryId }) => entryId === id);
        const record = saved.find(({ entryId }) => entryId === id);
        const editing = draft?.entryId === id;
        const startingPoint = record ?? (base && foundationFromBase(base));
        const review = record ? reviewGreenhouseFoundation(record, base) : null;
        return (
          <section
            key={id}
            className="field-section"
            aria-label={base?.title ?? "Missing greenhouse design"}
          >
            <h3>{base?.title ?? "Missing greenhouse design"}</h3>
            {editing ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <p className="small-note">
                  Measure the rectangle along the workspace X and Z axes. Center
                  coordinates and top elevation are relative to the workspace
                  origin.
                  {!record &&
                    " Starting values come from your model. Replace them with site measurements."}
                </p>
                {fields.map(({ key, label, min, max }) => (
                  <LengthInput
                    key={key}
                    label={label}
                    min={min}
                    max={max}
                    required
                    value={draft[key]}
                    onChange={(value) => setDraft({ ...draft, [key]: value })}
                  />
                ))}
                {error && (
                  <p role="alert" className="small-note">
                    {error}
                  </p>
                )}
                <div className="button-row">
                  <button type="submit" className="button primary">
                    Save foundation measurements
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                {review && (
                  <>
                    <p className="small-note" role="status">
                      {greenhouseFoundationSummary(review)}
                    </p>
                    <ul className="small-note greenhouse-foundation-rails">
                      {review.rails.map((rail) => (
                        <li key={rail.label}>
                          {greenhouseFoundationRailText(project, rail)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="button-row">
                  {startingPoint ? (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        setError("");
                        setDraft(startingPoint);
                      }}
                    >
                      {record
                        ? "Edit foundation measurements"
                        : "Measure foundation footprint"}
                    </button>
                  ) : (
                    <p className="small-note">
                      Add base rail geometry to measure this footprint.
                    </p>
                  )}
                  {record && (
                    <>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => onShow(shownId === id ? null : id)}
                      >
                        {shownId === id
                          ? "Hide foundation in 3D"
                          : "Show foundation in 3D"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          if (shownId === id) onShow(null);
                          const remaining = saved.filter(
                            ({ entryId }) => entryId !== id,
                          );
                          const next: Project = {
                            ...project,
                            greenhouseFoundations: remaining,
                          };
                          if (!remaining.length)
                            delete next.greenhouseFoundations;
                          onChange(next);
                        }}
                      >
                        {record.anchors
                          ? "Remove foundation and anchor layout"
                          : "Remove foundation measurements"}
                      </button>
                    </>
                  )}
                </div>
                {record && (
                  <GreenhouseAnchorsPanel
                    project={project}
                    site={record}
                    base={base}
                    onChange={onChange}
                  />
                )}
              </>
            )}
          </section>
        );
      })}
    </section>
  );
}
