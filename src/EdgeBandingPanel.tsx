import { useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import {
  addMissingEdgeBanding,
  bandingKey,
  bandingStatus,
  edgeBandingEdges,
  edgeBandingFinding,
  edgeBandingLines,
  edgeBandingSequence,
  edgeBandingTitle,
  removeEdgeBanding,
  reviewEdgeBanding,
  saveEdgeBanding,
  type BandingEdge,
  type EdgeBandingReview,
} from "./edgeBanding";
import {
  edgeBandingMaxLength,
  edgeBandingProductIds,
  edgeBandingProducts,
  edgeBandingScope,
  type EdgeBandingProductId,
} from "./edgeBandingReference";
import { edgeBandingTrim } from "./edgeBandingSchema";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";

function RollOrder({ group }: { group: EdgeBandingReview[number] }) {
  const { rolls, issues } = edgeBandingLines(group);
  return (
    <>
      {issues.length > 0 && (
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {rolls.map(({ label, strips }) => (
        <div key={label}>
          <strong>{label}</strong>
          <ul>
            {strips.map((strip) => (
              <li key={strip}>{strip}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function PrintEdgeBanding({ groups }: { groups: EdgeBandingReview }) {
  if (!groups.length) return null;
  return (
    <section className="edge-banding-print">
      <h2>{edgeBandingTitle}</h2>
      <p>{edgeBandingScope}</p>
      <p>{edgeBandingSequence}</p>
      {groups.map((group) => {
        const stock = edgeBandingProducts[group.productId];
        return (
          <div key={group.productId}>
            <h3>{stock.name}</h3>
            <p>
              {edgeBandingLines(group).review}{" "}
              <a href={stock.listing}>Exact roll listing</a>
            </p>
            <RollOrder group={group} />
          </div>
        );
      })}
    </section>
  );
}

export function EdgeBandingPanel({
  project,
  shown,
  onShow,
  onChange,
}: {
  project: Project;
  shown: BandingEdge | null;
  onShow: (edge: BandingEdge | null) => void;
  onChange: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<EdgeBandingProductId>(
    edgeBandingProductIds[0],
  );
  const [partId, setPartId] = useState("");
  const [trim, setTrim] = useState(NaN);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const edges = useMemo(
    () => (open ? edgeBandingEdges(project) : []),
    [open, project],
  );
  const groups = useMemo(
    () => (open ? reviewEdgeBanding(project, edges) : []),
    [open, project, edges],
  );
  const panels = [...new Set(edges.map(({ pieceId }) => pieceId))];
  const selected = panels.includes(partId) ? partId : panels[0];
  const stock = edgeBandingProducts[productId];
  const allowance = Number.isFinite(trim) ? trim : 0;
  const draft = edges.filter((edge) => keys.has(bandingKey(edge)));
  const status = (edge: BandingEdge) =>
    bandingStatus(edge, productId, allowance);
  const alreadySaved = new Set(project.edgeBanding?.map(bandingKey));
  const fronts = edges.filter(
    (edge) =>
      edge.normal[2] >= 1 - 1e-6 &&
      status(edge) === "ready" &&
      !alreadySaved.has(bandingKey(edge)),
  );
  const ready =
    edgeBandingTrim.safeParse(trim).success &&
    draft.length > 0 &&
    draft.length === keys.size &&
    draft.every((edge) => status(edge) === "ready");
  const toggle = (key: string, checked: boolean) =>
    setKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  const apply = (edit: () => Project) => {
    setError("");
    try {
      onChange(edit());
      return true;
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The edge banding plan could not be saved.",
      );
      return false;
    }
  };
  return (
    <details
      className="field-section"
      id="edge-banding-plan"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {edgeBandingTitle} · {project.edgeBanding?.length ?? 0} saved edges
      </summary>
      {open && (
        <>
          <p className="small-note">
            Choose the straight edges of cut wood panels and enter the total
            extra length for both ends of each strip.
          </p>
          {!panels.length && (
            <p className="small-note">
              There are no straight, full-thickness panel edges to select.
            </p>
          )}
          {panels.length > 0 && (
            <>
              <label className="field">
                Edge banding roll
                <select
                  value={productId}
                  onChange={(event) =>
                    setProductId(event.target.value as EdgeBandingProductId)
                  }
                >
                  {edgeBandingProductIds.map((id) => (
                    <option key={id} value={id}>
                      {edgeBandingProducts[id].name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small-note">
                <a href={stock.listing} target="_blank" rel="noreferrer">
                  Home Depot product {stock.internetNumber}
                </a>
              </p>
              <LengthInput
                label="Total strip trim"
                min={0}
                max={edgeBandingMaxLength}
                value={trim}
                onChange={setTrim}
              />
              <label className="field">
                Panel to edge
                <select
                  value={selected}
                  onChange={(event) => {
                    setPartId(event.target.value);
                    onShow(null);
                  }}
                >
                  {panels.map((id) => {
                    const edge = edges.find(({ pieceId }) => pieceId === id)!;
                    return (
                      <option key={id} value={id}>
                        {edge.label.slice(
                          0,
                          edge.label.lastIndexOf(" · local "),
                        )}
                      </option>
                    );
                  })}
                </select>
              </label>
              <ul>
                {edges
                  .filter(({ pieceId }) => pieceId === selected)
                  .map((edge) => {
                    const key = bandingKey(edge),
                      state = status(edge);
                    return (
                      <li key={key}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={state !== "ready" && !keys.has(key)}
                            checked={keys.has(key)}
                            onChange={(event) =>
                              toggle(key, event.target.checked)
                            }
                          />{" "}
                          Local {edge.face} · {formatStockLength(edge.length)}
                        </label>{" "}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onShow(
                              shown && bandingKey(shown) === key ? null : edge,
                            )
                          }
                        >
                          Show {edge.face} edge in 3D
                        </button>
                        {state !== "ready" && (
                          <p className="small-note">
                            {edgeBandingFinding[state]}
                            {edge.coveredBy ? ` · ${edge.coveredBy}` : ""}
                          </p>
                        )}
                        {alreadySaved.has(key) && state === "ready" && (
                          <small> Already planned</small>
                        )}
                      </li>
                    );
                  })}
              </ul>
              <button
                type="button"
                className="button secondary full"
                disabled={!fronts.length}
                onClick={() =>
                  setKeys(
                    (current) =>
                      new Set([...current, ...fronts.map(bandingKey)]),
                  )
                }
              >
                Select available front edges (+Z)
              </button>
            </>
          )}
          {keys.size > 0 && (
            <>
              <details>
                <summary>{keys.size} edges selected</summary>
                <ul>
                  {draft.map((edge) => (
                    <li key={bandingKey(edge)}>
                      {edge.label} · {edgeBandingFinding[status(edge)]}{" "}
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => toggle(bandingKey(edge), false)}
                      >
                        Deselect
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setKeys(new Set())}
                >
                  Clear selection
                </button>
              </details>
              <button
                type="button"
                className="button primary full"
                disabled={!ready}
                onClick={() => {
                  if (
                    apply(() => saveEdgeBanding(project, keys, productId, trim))
                  )
                    setKeys(new Set());
                }}
              >
                Save {keys.size} {keys.size === 1 ? "edge" : "edges"}
              </button>
            </>
          )}
          {groups.map((group) => (
            <details key={group.productId}>
              <summary>
                {edgeBandingProducts[group.productId].name} ·{" "}
                {group.rows.length} edges
              </summary>
              <p>{edgeBandingLines(group).review}</p>
              <RollOrder group={group} />
              <details>
                <summary>Edit saved edges</summary>
                <ul>
                  {group.rows.map(({ entry, label }) => (
                    <li key={bandingKey(entry)}>
                      {label}{" "}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          apply(() =>
                            removeEdgeBanding(project, bandingKey(entry)),
                          )
                        }
                      >
                        Remove edge
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
              {group.missing !== null &&
                group.missing > 0 &&
                project.retailer === "home-depot" && (
                  <button
                    type="button"
                    className="button secondary full"
                    onClick={() =>
                      apply(() =>
                        addMissingEdgeBanding(project, group.productId),
                      )
                    }
                  >
                    Add {group.missing} missing{" "}
                    {group.missing === 1 ? "roll" : "rolls"}
                  </button>
                )}
            </details>
          ))}
          <p className="small-note">{edgeBandingScope}</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </details>
  );
}
