import { greenhouseAnchorPurchase } from "./greenhouseFoundation";
import { useState } from "react";
import { concreteAnchor, concreteAnchorScope } from "./concreteAnchorReference";
import {
  anchorLayoutText,
  anchorMarkText,
  reviewGreenhouseAnchors,
} from "./greenhouseAnchors";
import type { greenhouseBaseEntries } from "./greenhouseBaseConnections";
import {
  foundationAnchorLayoutSchema,
  greenhouseFoundationCoordinateLimit,
  type FoundationAnchorLayout,
  type GreenhouseFoundation,
} from "./greenhouseFoundationSchema";
import { LengthInput } from "./LengthInput";
import { uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import { addSupply } from "./supplies";

type Mark = FoundationAnchorLayout["locations"][number];

const detailFields = [
  {
    key: "anchorLength",
    label: "Measured anchor length under head",
    min: 0.125,
    max: 12,
  },
  {
    key: "fixtureStack",
    label: "Fixture and washer thickness above rail",
    min: 0,
    max: 6,
  },
  { key: "thickness", label: "Measured slab thickness", min: 0.125, max: 1200 },
  {
    key: "embedment",
    label: "Specified nominal embedment",
    min: 0.125,
    max: 6,
  },
  {
    key: "edge",
    label: "Specified minimum center-to-edge distance",
    min: 0.125,
    max: 1200,
  },
  {
    key: "spacing",
    label: "Specified minimum anchor spacing",
    min: 0.125,
    max: 1200,
  },
] as const;

const blankLayout = (): FoundationAnchorLayout => ({
  productId: concreteAnchor.productId,
  detail: "",
  thickness: NaN,
  embedment: NaN,
  fixtureStack: NaN,
  anchorLength: NaN,
  edge: NaN,
  spacing: NaN,
  locations: [],
});

export function GreenhouseAnchorsPanel({
  project,
  site,
  base,
  onChange,
}: {
  project: Project;
  site: GreenhouseFoundation;
  base?: ReturnType<typeof greenhouseBaseEntries>[number];
  onChange: (next: Project) => void;
}) {
  const [detailDraft, setDetailDraft] = useState<FoundationAnchorLayout | null>(
    null,
  );
  const [markDraft, setMarkDraft] = useState<Mark | null>(null);
  const [error, setError] = useState("");
  const review = reviewGreenhouseAnchors(site, base);
  const rails = [...(base?.rails.entries() ?? [])];
  const {
    required,
    selected: added,
    missing,
  } = greenhouseAnchorPurchase(project);
  const canAdd =
    !!review?.rows.length &&
    review.rows.every(({ issues }) => !issues.length) &&
    (project.retailer ?? "home-depot") === "home-depot" &&
    missing > 0;

  function commit(anchors?: FoundationAnchorLayout) {
    const { anchors: _previous, ...footprint } = site;
    onChange({
      ...project,
      greenhouseFoundations: project.greenhouseFoundations?.map((record) =>
        record.entryId === site.entryId
          ? { ...footprint, ...(anchors ? { anchors } : {}) }
          : record,
      ),
    });
    setDetailDraft(null);
    setMarkDraft(null);
    setError("");
  }

  return (
    <details className="field-section greenhouse-anchor-layout">
      <summary>Concrete anchor layout</summary>
      <p className="small-note">{concreteAnchorScope}</p>
      <p className="small-note">
        {concreteAnchor.label}.{" "}
        <a href={concreteAnchor.instructions} target="_blank" rel="noreferrer">
          Installation details
        </a>{" "}
        ·{" "}
        <a href={concreteAnchor.listing} target="_blank" rel="noreferrer">
          Home Depot reference
        </a>
        {" · "}
        <a href={concreteAnchor.evaluation} target="_blank" rel="noreferrer">
          Evaluation table
        </a>
      </p>
      {detailDraft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = foundationAnchorLayoutSchema.safeParse(detailDraft);
            if (parsed.success) commit(parsed.data);
            else
              setError(
                "Enter a valid measurement and a drawing or specification reference for this anchor layout.",
              );
          }}
        >
          <label className="field">
            Anchor detail reference
            <input
              required
              maxLength={200}
              value={detailDraft.detail}
              placeholder="Drawing or specification and revision"
              onChange={(event) =>
                setDetailDraft({ ...detailDraft, detail: event.target.value })
              }
            />
          </label>
          {detailFields.map(({ key, label, min, max }) => (
            <LengthInput
              key={key}
              label={label}
              required
              value={detailDraft[key]}
              min={min}
              max={max}
              onChange={(value) =>
                setDetailDraft({ ...detailDraft, [key]: value })
              }
            />
          ))}
          <div className="button-row">
            <button type="submit" className="button primary small">
              Save anchor detail
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDetailDraft(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : review ? (
        <>
          <p className="small-note">
            {anchorLayoutText(review.layout, review.bore)}
          </p>
          {review.rows.map(
            (row) =>
              row.mark.id !== markDraft?.id && (
                <div key={row.mark.id} className="field-section">
                  <p
                    className="small-note"
                    data-anchor-status={row.issues.length ? "review" : "fits"}
                  >
                    {anchorMarkText(project, row)}
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMarkDraft(row.mark);
                        setError("");
                      }}
                    >
                      Edit anchor {row.index + 1}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        commit({
                          ...review.layout,
                          locations: review.layout.locations.filter(
                            ({ id }) => id !== row.mark.id,
                          ),
                        })
                      }
                    >
                      Remove anchor {row.index + 1}
                    </button>
                  </div>
                </div>
              ),
          )}
          {markDraft ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const locations = review.layout.locations.some(
                  ({ id }) => id === markDraft.id,
                )
                  ? review.layout.locations.map((old) =>
                      old.id === markDraft.id ? markDraft : old,
                    )
                  : [...review.layout.locations, markDraft];
                const parsed = foundationAnchorLayoutSchema.safeParse({
                  ...review.layout,
                  locations,
                });
                if (parsed.success) commit(parsed.data);
                else
                  setError(
                    "Select a base rail and enter both workspace coordinates.",
                  );
              }}
            >
              <label className="field">
                Base rail
                <select
                  value={markDraft.railId}
                  onChange={(event) =>
                    setMarkDraft({ ...markDraft, railId: event.target.value })
                  }
                >
                  {rails.every(([, rail]) => rail.id !== markDraft.railId) && (
                    <option value={markDraft.railId}>Missing rail</option>
                  )}
                  {rails.map(([side, rail]) => (
                    <option key={rail.id} value={rail.id}>
                      {side} · {partLabel(project, rail.id)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small-note">
                Set the drill center on the workspace grid.
              </p>
              {(["x", "z"] as const).map((key) => (
                <LengthInput
                  key={key}
                  label={`Anchor ${key.toUpperCase()}`}
                  required
                  value={markDraft[key]}
                  min={-greenhouseFoundationCoordinateLimit}
                  max={greenhouseFoundationCoordinateLimit}
                  onChange={(value) =>
                    setMarkDraft({ ...markDraft, [key]: value })
                  }
                />
              ))}
              <div className="button-row">
                <button type="submit" className="button primary small">
                  Save anchor mark
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMarkDraft(null);
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="button-row">
              {!!rails.length && review.rows.length < 64 && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    const rail = rails[0][1];
                    setMarkDraft({
                      id: uid(),
                      railId: rail.id,
                      x: rail.position[0],
                      z: rail.position[2],
                    });
                    setError("");
                  }}
                >
                  Add anchor mark
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDetailDraft(review.layout);
                  setError("");
                }}
              >
                Edit anchor detail
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => commit()}
              >
                Remove anchor layout
              </button>
            </div>
          )}
          {!markDraft && (canAdd || added > 0) && (
            <div className="field-section">
              <p className="small-note">
                {required} concrete anchors from reviewed layouts · {added}{" "}
                selected for the project.
              </p>
              {canAdd && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    try {
                      onChange(
                        addSupply(
                          project,
                          concreteAnchor.productId,
                          missing,
                          "Reviewed concrete anchor layouts",
                          "Check project detail and site suitability before use.",
                        ),
                      );
                      setError("");
                    } catch (problem) {
                      setError(
                        problem instanceof Error
                          ? problem.message
                          : "The shopping list could not be updated.",
                      );
                    }
                  }}
                >
                  Add {missing} to Home Depot list
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          className="button secondary small"
          onClick={() => {
            setDetailDraft(blankLayout());
            setError("");
          }}
        >
          Enter specified anchor detail
        </button>
      )}
      {error && (
        <p className="small-note" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
