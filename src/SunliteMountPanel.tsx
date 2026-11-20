import { useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import { material, uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";
import { addSupply } from "./supplies";
import { sunliteFastener } from "./sunliteFastenerReference";
import type {
  SunliteMountDetail,
  SunliteMountHole,
} from "./sunliteMountSchema";
import {
  removeSunliteMount,
  saveSunliteMount,
  sunliteMountHoleText,
  sunliteMountLines,
  sunliteMountPurchase,
  sunliteMountScope,
  type SunliteMountReview,
} from "./sunliteMounts";

const emptyDetail = (): SunliteMountDetail => ({
  face: 1,
  neutral: [NaN, NaN],
  shank: NaN,
  washer: NaN,
  minimumCoverage: NaN,
  basis: "",
});

export function SunliteMountPanel({
  project,
  reviews,
  panelId,
  onSelectPanel,
  onChange,
  onShow,
}: {
  project: Project;
  reviews: readonly SunliteMountReview[];
  panelId: string;
  onSelectPanel: (id: string) => void;
  onChange: (project: Project) => void;
  onShow: (panelId: string) => void;
}) {
  const [detailDraft, setDetailDraft] = useState<SunliteMountDetail | null>(
    null,
  );
  const [holeDraft, setHoleDraft] = useState<SunliteMountHole | null>(null);
  const [error, setError] = useState("");
  const pieces = useMemo(
    () => project.pieces.filter(({ offcut }) => !offcut),
    [project],
  );
  const panels = pieces.filter(({ material }) => material === "sunlite-8mm");
  const known =
    panels.some(({ id }) => id === panelId) ||
    reviews.some(({ plan }) => plan.panelId === panelId);
  const current = known ? panelId : (panels[0]?.id ?? reviews[0]?.plan.panelId);
  const selected = panels.find(({ id }) => id === current);
  const result = reviews.find(({ plan }) => plan.panelId === current);
  const plan = result?.plan;
  const axes = selected ? stockAxes(selected) : null;
  const wood = pieces.filter((piece) => material(piece.material).wood);
  const purchase = sunliteMountPurchase(project, reviews);

  function reset() {
    setError("");
    setDetailDraft(null);
    setHoleDraft(null);
  }
  function update(action: () => Project) {
    try {
      onChange(action());
      reset();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Review the layout measurements.",
      );
    }
  }

  if (!panels.length && !reviews.length) return null;
  return (
    <details className="field-section sunlite-mount-panel">
      <summary>SUNLITE fastener holes</summary>
      <p className="small-note">{sunliteMountScope}</p>
      <p className="small-note">
        {sunliteFastener.name}.{" "}
        <a href={sunliteFastener.listing}>Home Depot reference</a> ·{" "}
        <a href={sunliteFastener.installation}>Palram installation notes</a>
      </p>
      <label className="field">
        Glazing panel for fasteners
        <select
          value={current ?? ""}
          onChange={(event) => {
            reset();
            onSelectPanel(event.target.value);
          }}
        >
          {panels.map(({ id, name }) => (
            <option key={id} value={id}>
              {partLabel(project, id)} · {name}
            </option>
          ))}
          {reviews
            .filter(({ plan }) => !panels.some(({ id }) => plan.panelId === id))
            .map(({ plan, label }) => (
              <option key={plan.panelId} value={plan.panelId}>
                {label} · Missing panel
              </option>
            ))}
        </select>
      </label>
      {axes && (detailDraft || holeDraft) && (
        <p className="small-note">
          Panel axes · across {"XYZ"[axes.width]} · along {"XYZ"[axes.length]} ·
          thickness {"XYZ"[axes.thickness]}.
        </p>
      )}
      {detailDraft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (current)
              update(() =>
                saveSunliteMount(project, current, {
                  detail: detailDraft,
                  holes: plan?.holes ?? [],
                }),
              );
          }}
        >
          <label className="field">
            Mounting detail reference
            <input
              required
              maxLength={200}
              value={detailDraft.basis}
              onChange={(event) =>
                setDetailDraft({ ...detailDraft, basis: event.target.value })
              }
            />
          </label>
          <label className="field">
            Exterior thickness face
            <select
              value={detailDraft.face}
              onChange={(event) =>
                setDetailDraft({
                  ...detailDraft,
                  face: event.target.value === "-1" ? -1 : 1,
                })
              }
            >
              <option value={1}>
                Positive local {"XYZ"[axes?.thickness ?? 2]} face
              </option>
              <option value={-1}>
                Negative local {"XYZ"[axes?.thickness ?? 2]} face
              </option>
            </select>
          </label>
          <LengthInput
            label="Stationary datum across flutes"
            required
            min={-480}
            max={480}
            value={detailDraft.neutral[0]}
            onChange={(value) =>
              setDetailDraft({
                ...detailDraft,
                neutral: [value, detailDraft.neutral[1]],
              })
            }
          />
          <LengthInput
            label="Stationary datum along flutes"
            required
            min={-480}
            max={480}
            value={detailDraft.neutral[1]}
            onChange={(value) =>
              setDetailDraft({
                ...detailDraft,
                neutral: [detailDraft.neutral[0], value],
              })
            }
          />
          <p className="small-note">
            Enter signed distances from the panel’s local center to the
            stationary mounting datum.
          </p>
          {(
            [
              ["shank", "Measured shank diameter"],
              ["washer", "Effective gasket contact diameter"],
              ["minimumCoverage", "Required radial gasket cover"],
            ] as const
          ).map(([key, label]) => (
            <LengthInput
              key={key}
              label={label}
              required
              min={0.001}
              max={2}
              value={detailDraft[key]}
              onChange={(value) =>
                setDetailDraft({ ...detailDraft, [key]: value })
              }
            />
          ))}
          {result?.issue && (
            <p className="small-note">
              {result.issue} The existing marks keep their panel-local
              coordinates.
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="button primary small">
              Save mounting detail
            </button>
            <button type="button" className="text-button" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      ) : plan ? (
        <>
          {result?.issue && (
            <p className="small-note" role="status">
              {result.issue}
            </p>
          )}
          {result?.rows.map(
            (row) =>
              row.hole.id !== holeDraft?.id && (
                <div key={row.hole.id} className="field-section">
                  <p
                    className="small-note"
                    data-glazing-hole-state={
                      row.issues.length ? "review" : "fits"
                    }
                  >
                    {sunliteMountHoleText(project, row)}
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        reset();
                        setHoleDraft(row.hole);
                      }}
                    >
                      Edit hole {row.index + 1}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        update(() =>
                          saveSunliteMount(project, plan.panelId, {
                            detail: plan.detail,
                            holes: plan.holes.filter(
                              ({ id }) => id !== row.hole.id,
                            ),
                          }),
                        )
                      }
                    >
                      Remove hole {row.index + 1}
                    </button>
                  </div>
                </div>
              ),
          )}
          {holeDraft ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                update(() =>
                  saveSunliteMount(project, plan.panelId, {
                    detail: plan.detail,
                    holes: plan.holes.some(({ id }) => id === holeDraft.id)
                      ? plan.holes.map((hole) =>
                          hole.id === holeDraft.id ? holeDraft : hole,
                        )
                      : [...plan.holes, holeDraft],
                  }),
                );
              }}
            >
              <label className="field">
                Wood backing for this hole
                <select
                  required
                  value={holeDraft.backingId}
                  onChange={(event) =>
                    setHoleDraft({
                      ...holeDraft,
                      backingId: event.target.value,
                    })
                  }
                >
                  <option value="">Choose the receiving member</option>
                  {holeDraft.backingId &&
                    !wood.some(({ id }) => id === holeDraft.backingId) && (
                      <option value={holeDraft.backingId}>
                        Missing backing
                      </option>
                    )}
                  {wood.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {partLabel(project, id)} · {name}
                    </option>
                  ))}
                </select>
              </label>
              <LengthInput
                label="Hole center across flutes"
                required
                min={-480}
                max={480}
                value={holeDraft.center[0]}
                onChange={(value) =>
                  setHoleDraft({
                    ...holeDraft,
                    center: [value, holeDraft.center[1]],
                  })
                }
              />
              <LengthInput
                label="Hole center along flutes"
                required
                min={-480}
                max={480}
                value={holeDraft.center[1]}
                onChange={(value) =>
                  setHoleDraft({
                    ...holeDraft,
                    center: [holeDraft.center[0], value],
                  })
                }
              />
              <LengthInput
                label="Proposed drill diameter"
                required
                min={0.001}
                max={2}
                value={holeDraft.diameter}
                onChange={(value) =>
                  setHoleDraft({ ...holeDraft, diameter: value })
                }
              />
              <div className="button-row">
                <button type="submit" className="button primary small">
                  Save drill mark
                </button>
                <button type="button" className="text-button" onClick={reset}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="button-row">
              {selected && !result?.issue && plan.holes.length < 96 && (
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    reset();
                    setHoleDraft({
                      id: uid(),
                      backingId: "",
                      center: [...plan.detail.neutral],
                      diameter: NaN,
                    });
                  }}
                >
                  Add drill mark
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    reset();
                    setDetailDraft(plan.detail);
                  }}
                >
                  Edit mounting detail
                </button>
              )}
              {!!result?.rows.length && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onShow(plan.panelId)}
                >
                  Show holes in 3D
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  update(() => removeSunliteMount(project, plan.panelId))
                }
              >
                Remove this panel’s layout
              </button>
            </div>
          )}
        </>
      ) : (
        selected && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => setDetailDraft(emptyDetail())}
          >
            Enter mounting detail
          </button>
        )
      )}
      {error && (
        <p role="alert" className="small-note">
          {error}
        </p>
      )}
      {(purchase.ready > 0 || purchase.selected > 0) && (
        <div className="field-section">
          <p className="small-note">
            {purchase.ready} holes with measured fit · {purchase.selected} bags
            on the shopping list · {sunliteFastener.pack} screws per bag.
          </p>
          {purchase.missing > 0 && project.retailer === "home-depot" && (
            <button
              type="button"
              className="button secondary small"
              onClick={() =>
                update(() =>
                  addSupply(
                    project,
                    sunliteFastener.productId,
                    purchase.missing,
                    "SUNLITE glazing screws",
                    "Match the delivered screw and gasket to the saved mounting detail.",
                  ),
                )
              }
            >
              Add {purchase.missing} to Home Depot list
            </button>
          )}
        </div>
      )}
    </details>
  );
}

export function PrintSunliteMounts({
  project,
  reviews,
}: {
  project: Project;
  reviews: readonly SunliteMountReview[];
}) {
  return (
    <section className="sunlite-mount-print">
      <h2>SUNLITE fastener hole layout</h2>
      <p>{sunliteMountScope}</p>
      <p>
        {sunliteFastener.name} · {sunliteFastener.hex} hex.{" "}
        <a href={sunliteFastener.installation}>Palram installation notes</a>
      </p>
      <ul>
        {reviews
          .flatMap((review) => sunliteMountLines(project, review))
          .map((line, index) => (
            <li key={index}>{line}</li>
          ))}
      </ul>
    </section>
  );
}
