import { useEffect, useMemo, useRef, useState } from "react";
import { ZodError } from "zod";
import type { Project, V3 } from "./model";
import type { FastenerPlan } from "./fasteningSchema";
import type { FastenerLayoutMarkerPreview } from "./FastenerMarkers";
import {
  appendFastenerLayout,
  fastenerLayoutDirection,
  fastenerLayoutFace,
  fastenerLayoutReceipt,
  previewFastenerLayout,
  type FastenerLayoutCandidate,
  type FastenerLayoutPreview,
} from "./fastenerLayout";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";

export type FastenerLayoutRequest = { seedId: string; nonce: number };
export type FastenerLayoutPanelProps = {
  project: Project;
  draft: FastenerPlan;
  onChange: (draft: FastenerPlan) => void;
  request?: FastenerLayoutRequest | null;
  disabled?: boolean;
  onBeforePreview?: () => void;
  onPreview?: (preview: FastenerLayoutMarkerPreview | null) => void;
  onInspectLayout?: () => void;
  pickingLocationId?: string | null;
  onSelectSeed?: (id: string) => void;
};
const errorText = (problem: unknown) =>
  problem instanceof ZodError
    ? (problem.issues[0]?.message ?? "Review the layout values.")
    : problem instanceof Error
      ? problem.message
      : "The layout could not be reviewed.";
const vectorText = (point: V3) =>
  point.map((value) => Number(value.toFixed(6))).join(", ");
const stateText = (candidate: FastenerLayoutCandidate) =>
  !candidate.eligible
    ? "Cannot add · review finding"
    : candidate.review.state === "path-reviewed"
      ? "Centerline reviewed"
      : "Measurements pending";

/** Blank values are unknown; unit switches preserve inches. form="" keeps transient
 * layout validity separate from the enclosing plan's Save validation. */
function LayoutLength({
  label,
  value,
  onChange,
  allowZero = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  allowZero?: boolean;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    [text, setText] = useState(value === null ? "" : String(value)),
    scale = unit === "ft" ? 12 : 1,
    emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value;
      setText(value === null ? "" : String(value / scale));
    }
  }, [value, scale]);
  return (
    <label className="field length-field">
      <span>{label}</span>
      <div className="length-entry">
        <input
          form=""
          type="number"
          step="any"
          aria-label={label}
          value={text}
          placeholder="Enter a value"
          min={allowZero ? 0 : 0.000001 / scale}
          max={12000 / scale}
          onChange={(event) => {
            setText(event.target.value);
            const next = event.target.value.trim()
              ? Number(event.target.value) * scale
              : null;
            emitted.current = next;
            onChange(next);
          }}
        />
        <select
          aria-label={`${label} units`}
          value={unit}
          onChange={(event) => {
            const next = event.target.value as "in" | "ft";
            setText(
              value === null ? "" : String(value / (next === "ft" ? 12 : 1)),
            );
            setUnit(next);
          }}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </div>
    </label>
  );
}

/** Projection of actual retained geometry; the diagram never supplies an entrance. */
export function LayoutDiagram({
  preview,
  selected,
  focusedId,
  onFocus,
}: {
  preview: FastenerLayoutPreview;
  selected: readonly string[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}) {
  const dot = (a: V3, b: V3) =>
      a.reduce((sum, value, i) => sum + value * b[i], 0),
    project = (point: V3) => {
      const relative = point.map(
        (value, i) => value - preview.face.originLocal[i],
      ) as V3;
      return [dot(relative, preview.uLocal), dot(relative, preview.vLocal)];
    },
    polygon = preview.face.polygonLocal.map(project),
    proposals = preview.candidates.map((point) =>
      project(point.location.entranceLocal!),
    ),
    all = [...polygon, [0, 0], ...proposals],
    min = [0, 1].map((axis) => Math.min(...all.map((point) => point[axis]))),
    max = [0, 1].map((axis) => Math.max(...all.map((point) => point[axis]))),
    scale = Math.min(
      218 / Math.max(max[0] - min[0], 1),
      144 / Math.max(max[1] - min[1], 1),
    ),
    center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
    screen = (point: number[]) => [
      130 + (point[0] - center[0]) * scale,
      90 - (point[1] - center[1]) * scale,
    ],
    seed = screen([0, 0]);
  return (
    <svg
      viewBox="0 0 260 180"
      role="img"
      aria-label="Repeat layout on the actual retained head face"
      style={{ width: "100%", display: "block" }}
    >
      <title>
        Existing seed and proposed entrances on the actual retained head face
      </title>
      <polygon
        points={polygon.map((point) => screen(point).join(",")).join(" ")}
        fill="#eee8d9"
        stroke="#9a9280"
      />
      <circle cx={seed[0]} cy={seed[1]} r={4} fill="#314b42" />
      {!focusedId && (
        <text
          x={seed[0] > 210 ? seed[0] - 6 : seed[0] + 6}
          y={seed[1] - 6}
          textAnchor={seed[0] > 210 ? "end" : "start"}
          fontSize="9"
        >
          {preview.face.seed.label}
        </text>
      )}
      {preview.candidates.map((candidate, index) => {
        const point = screen(proposals[index]),
          color = candidate.eligible ? "#b57524" : "#bd4e37";
        return (
          <g
            key={candidate.id}
            role="button"
            tabIndex={0}
            aria-label={`Focus New ${index + 1} on face diagram`}
            onClick={() => onFocus(candidate.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onFocus(candidate.id);
              }
            }}
          >
            <circle
              cx={point[0]}
              cy={point[1]}
              r={focusedId === candidate.id ? 5 : 3.5}
              fill={selected.includes(candidate.id) ? color : "white"}
              stroke={color}
              strokeWidth={2}
            />
            <title>{`New ${index + 1} · ${stateText(candidate)} · local ${vectorText(candidate.location.entranceLocal!)}`}</title>
            {focusedId === candidate.id && (
              <text
                x={point[0] > 210 ? point[0] - 7 : point[0] + 7}
                y={point[1] - 6}
                textAnchor={point[0] > 210 ? "end" : "start"}
                fontSize="9"
              >
                New {index + 1}
              </text>
            )}
          </g>
        );
      })}
      <text x="12" y="171" fontSize="9">
        Retained face · entrance layout only
      </text>
    </svg>
  );
}

export function FastenerLayoutPanel({
  project,
  draft,
  onChange,
  request,
  disabled = false,
  onBeforePreview,
  onPreview,
  onInspectLayout,
  pickingLocationId,
  onSelectSeed,
}: FastenerLayoutPanelProps) {
  const [open, setOpen] = useState(!!request),
    [seedId, setSeedId] = useState(request?.seedId ?? ""),
    [axis, setAxis] = useState(""),
    [reverse, setReverse] = useState(false),
    [countU, setCountU] = useState(""),
    [spacingU, setSpacingU] = useState<number | null>(null),
    [grid, setGrid] = useState(false),
    [countV, setCountV] = useState(""),
    [spacingV, setSpacingV] = useState<number | null>(null),
    [reverseV, setReverseV] = useState(false),
    [margin, setMargin] = useState<number | null>(null),
    [basis, setBasis] = useState(""),
    [preview, setPreview] = useState<FastenerLayoutPreview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [focusedId, setFocusedId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const callback = useRef(onPreview);
  callback.current = onPreview;
  const appendedDraft = useRef<string | null>(null);
  const draftKey = JSON.stringify(draft);
  const clear = () => {
    setPreview(null);
    setSelected([]);
    setFocusedId(null);
    callback.current?.(null);
  };
  const edit = (fn: () => void) => {
    clear();
    setError("");
    setMessage("");
    fn();
  };
  useEffect(() => {
    clear();
    setError("");
    if (appendedDraft.current === draftKey) appendedDraft.current = null;
    else setMessage("");
  }, [project, draftKey]);
  useEffect(() => {
    if (disabled || pickingLocationId) clear();
  }, [disabled, pickingLocationId]);
  useEffect(() => () => callback.current?.(null), [project.id, draft.id]);
  useEffect(() => {
    if (!request) return;
    setSeedId(request.seedId);
    setOpen(true);
    setAxis("");
    clear();
    setError("");
    setMessage("");
  }, [request?.nonce, project.id, draft.id]);
  const complete = draft.locations.filter(
      (location) => location.entranceLocal && location.driveLocal,
    ),
    face = useMemo(() => {
      if (!seedId) return { value: null, error: "" };
      try {
        return { value: fastenerLayoutFace(project, draft, seedId), error: "" };
      } catch (problem) {
        return { value: null, error: errorText(problem) };
      }
    }, [project, draftKey, seedId]),
    axes = ([0, 1, 2] as const).map((value) => {
      try {
        return {
          value,
          direction: face.value
            ? fastenerLayoutDirection(face.value, value, reverse)
            : null,
        };
      } catch {
        return { value, direction: null };
      }
    }),
    direction = axes.find((choice) => String(choice.value) === axis)?.direction;
  const faceKey = face.value
    ? JSON.stringify([face.value.normalLocal, face.value.polygonLocal])
    : "";
  const receipt = useMemo(() => {
    if (!preview || !selected.length) return { value: null, error: "" };
    try {
      return {
        value: fastenerLayoutReceipt(draft, preview, selected),
        error: "",
      };
    } catch (problem) {
      return { value: null, error: errorText(problem) };
    }
  }, [draftKey, preview, selected]);
  useEffect(() => {
    setAxis("");
    clear();
  }, [faceKey]);
  const emit = (
    value: FastenerLayoutPreview,
    ids: string[],
    focus: string | null,
  ) =>
    callback.current?.({
      review: value.review,
      seedLocationId: value.spec.seedLocationId,
      candidateIds: value.candidateIds,
      selectedCandidateIds: ids,
      focusedCandidateId: focus,
    });
  const focus = (id: string) => {
    if (!preview) return;
    setFocusedId(id);
    emit(preview, selected, id);
  };
  return (
    <details
      className="fastener-layout-panel field-section"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        if (!next) clear();
      }}
    >
      <summary>Repeat screw locations</summary>
      <p className="small-note">
        Repeat an entrance you picked or entered. Preview first, add selected
        locations to this draft, then Save.
      </p>
      <label className="field">
        Start from
        <select
          aria-label="Layout seed location"
          value={seedId}
          onChange={(event) =>
            edit(() => {
              setSeedId(event.target.value);
              setAxis("");
              if (event.target.value) onSelectSeed?.(event.target.value);
            })
          }
        >
          <option value="">Choose an existing complete location</option>
          {draft.locations.map((location) => (
            <option
              key={location.id}
              value={location.id}
              disabled={!location.entranceLocal || !location.driveLocal}
            >
              {draft.label}/{location.label} · {location.name}
              {!location.entranceLocal || !location.driveLocal
                ? " · entrance/direction pending"
                : ""}
            </option>
          ))}
        </select>
      </label>
      {!complete.length && (
        <p className="small-note">
          Pick or enter one entrance and normalize its direction first.
        </p>
      )}
      {face.error && (
        <p role="alert" className="form-error">
          {face.error}
        </p>
      )}
      {face.value && (
        <>
          <p className="small-note">
            <strong>
              {partLabel(project, face.value.headId)} →{" "}
              {partLabel(project, face.value.receiverId)}
            </strong>{" "}
            · anchor {draft.label}/{face.value.seed.label} ·{" "}
            {face.value.kind === "cut"
              ? "retained cut face"
              : "retained stock face"}
          </p>
          <div className="fastener-layout-controls">
            <label className="field">
              Repeat along
              <select
                aria-label="Layout face direction"
                value={axis}
                onChange={(event) => edit(() => setAxis(event.target.value))}
              >
                <option value="">Choose a part axis on this face</option>
                {axes.map((choice) => (
                  <option
                    key={choice.value}
                    value={String(choice.value)}
                    disabled={!choice.direction}
                  >
                    Project local {["X", "Y", "Z"][choice.value]} onto this face
                    {!choice.direction ? " · perpendicular" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                aria-label="Reverse layout row"
                checked={reverse}
                onChange={(event) =>
                  edit(() => setReverse(event.target.checked))
                }
              />
              Reverse row direction
            </label>
            {direction && (
              <p className="small-note">
                Resolved local direction: {vectorText(direction)}.
              </p>
            )}
            <label className="field">
              Total positions in row, including {face.value.seed.label}
              <input
                form=""
                type="number"
                step="1"
                min="2"
                max="100"
                aria-label="Layout row count including seed"
                value={countU}
                placeholder="Enter a count"
                onChange={(event) => edit(() => setCountU(event.target.value))}
              />
            </label>
            <LayoutLength
              label="Layout row spacing"
              value={spacingU}
              onChange={(value) => edit(() => setSpacingU(value))}
            />
          </div>
          <details className="field-section">
            <summary>Grid and face margin</summary>
            <label className="field checkbox">
              <input
                type="checkbox"
                aria-label="Add layout grid axis"
                checked={grid}
                onChange={(event) => edit(() => setGrid(event.target.checked))}
              />
              Add a second grid axis
            </label>
            {grid && (
              <>
                <label className="field">
                  Positions on second axis, including the anchor row
                  <input
                    form=""
                    type="number"
                    step="1"
                    min="2"
                    max="100"
                    aria-label="Layout grid count including seed row"
                    value={countV}
                    placeholder="Enter a count"
                    onChange={(event) =>
                      edit(() => setCountV(event.target.value))
                    }
                  />
                </label>
                <LayoutLength
                  label="Layout grid spacing"
                  value={spacingV}
                  onChange={(value) => edit(() => setSpacingV(value))}
                />
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    aria-label="Reverse layout grid axis"
                    checked={reverseV}
                    onChange={(event) =>
                      edit(() => setReverseV(event.target.checked))
                    }
                  />
                  Reverse second axis
                </label>
              </>
            )}
            <LayoutLength
              label="Minimum head-face edge margin"
              value={margin}
              allowZero
              onChange={(value) => edit(() => setMargin(value))}
            />
            <p className="small-note">
              Optional distance from the actual retained head-face perimeter.
              Your layout guide; manufacturer edge/end rules remain separate.
              Blank means not checked.
            </p>
          </details>
          <label className="field">
            Layout basis or note
            <textarea
              aria-label="Layout basis or note"
              value={basis}
              maxLength={500}
              rows={2}
              placeholder="Your reason or reference for this proposed layout"
              onChange={(event) => edit(() => setBasis(event.target.value))}
            />
          </label>
          <p className="small-note">
            Uses this plan’s drive and shared user measurements. Product length
            and installation spacing are not filled automatically.
          </p>
          {disabled && (
            <p className="small-note">
              Complete or clear partial location fields and confirm product
              changes before repeating.
            </p>
          )}
          <button
            type="button"
            className="button secondary full"
            disabled={disabled || !direction}
            onClick={() => {
              clear();
              setError("");
              setMessage("");
              try {
                if (!direction)
                  throw Error("Choose a direction on the retained face.");
                if (!countU.trim())
                  throw Error("Enter the total row count, including its seed.");
                if (spacingU === null) throw Error("Enter the row spacing.");
                if (grid && !countV.trim())
                  throw Error("Enter the second-axis count.");
                onBeforePreview?.();
                const next = previewFastenerLayout(project, draft, {
                  seedLocationId: seedId,
                  uLocal: direction,
                  countU: Number(countU),
                  spacingU,
                  countV: grid ? Number(countV) : 1,
                  spacingV: grid ? spacingV : null,
                  reverseV: grid && reverseV,
                  minimumFaceMargin: margin,
                  basis,
                });
                setPreview(next);
                emit(next, [], null);
              } catch (problem) {
                setError(errorText(problem));
              }
            }}
          >
            Preview repeated locations
          </button>
        </>
      )}
      {preview && (
        <div
          className="fastener-layout-preview"
          data-testid="fastener-layout-preview"
          data-token={preview.token}
        >
          <p>
            <strong>
              1 existing + {preview.candidates.length} new ={" "}
              {preview.candidates.length + 1} layout positions
            </strong>
          </p>
          <p className="small-note">
            {preview.eligibleCount} geometric candidates ·{" "}
            {preview.pendingCount} pending measurements ·{" "}
            {preview.excludedCount} excluded. Select the locations to add.
          </p>
          <LayoutDiagram
            preview={preview}
            selected={selected}
            focusedId={focusedId}
            onFocus={focus}
          />
          {onInspectLayout && (
            <button
              type="button"
              className="text-button"
              onClick={onInspectLayout}
            >
              Inspect layout in 3D
            </button>
          )}
          <div className="button-row">
            <button
              type="button"
              className="text-button"
              disabled={!preview.eligibleCount}
              onClick={() => {
                const ids = preview.candidates
                  .filter((candidate) => candidate.eligible)
                  .map((candidate) => candidate.id);
                setSelected(ids);
                emit(preview, ids, focusedId);
              }}
            >
              Select {preview.eligibleCount} geometric{" "}
              {preview.eligibleCount === 1 ? "candidate" : "candidates"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!selected.length}
              onClick={() => {
                setSelected([]);
                emit(preview, [], focusedId);
              }}
            >
              Clear selection
            </button>
          </div>
          {preview.candidates.map((candidate, index) => (
            <div
              key={candidate.id}
              className="fastener-layout-candidate"
              data-layout-candidate-id={candidate.id}
              data-layout-location-label={candidate.location.label}
              data-layout-state={candidate.review.state}
              data-layout-eligible={candidate.eligible}
            >
              <label className="field checkbox">
                <input
                  type="checkbox"
                  aria-label={`Select New ${index + 1}`}
                  disabled={!candidate.eligible}
                  checked={selected.includes(candidate.id)}
                  onChange={(event) => {
                    const ids = event.target.checked
                      ? [...selected, candidate.id]
                      : selected.filter((id) => id !== candidate.id);
                    setSelected(ids);
                    emit(preview, ids, focusedId);
                  }}
                />
                <strong>New {index + 1}</strong> · {stateText(candidate)}
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() => focus(candidate.id)}
              >
                Inspect New {index + 1}
              </button>
              <details>
                <summary>Coordinates and findings</summary>
                <p className="small-note">
                  {draft.label}/{candidate.location.label} if added · row{" "}
                  {candidate.row + 1}, column {candidate.column + 1}. Local
                  entry: {vectorText(candidate.location.entranceLocal!)} in.
                </p>
                <p className="small-note">
                  Head-face edge distance:{" "}
                  {candidate.faceMargin === null
                    ? "unknown"
                    : formatPreciseInches(candidate.faceMargin)}
                  .
                </p>
                {candidate.issues.map((issue, i) => (
                  <p
                    className={
                      issue.severity === "error" ? "form-error" : "small-note"
                    }
                    key={`${issue.code}/${i}`}
                  >
                    {issue.message}
                  </p>
                ))}
              </details>
            </div>
          ))}
          {!!preview.existingEligibilityChanges.length && (
            <p className="form-error">
              The full preview affects an existing path’s eligibility. Only a
              selected subset that preserves existing paths can be added.
            </p>
          )}
          <details>
            <summary>Software layout note for selected locations</summary>
            <p className="small-note" data-testid="selected-layout-note">
              {receipt.value?.note ??
                "Select locations to see their software layout note."}
            </p>
          </details>
          {receipt.value && !receipt.value.noteFits && (
            <p role="alert" className="form-error">
              This layout note exceeds the plan’s note limit. Shorten the
              entered basis or existing notes; nothing will be truncated.
            </p>
          )}
          {receipt.error && (
            <p role="alert" className="form-error">
              {receipt.error}
            </p>
          )}
          <button
            type="button"
            className="button primary full"
            disabled={!selected.length || !receipt.value?.noteFits || disabled}
            onClick={() => {
              try {
                const next = appendFastenerLayout(
                    project,
                    draft,
                    preview,
                    selected,
                  ),
                  count = next.locations.length - draft.locations.length;
                clear();
                appendedDraft.current = JSON.stringify(next);
                onChange(next);
                setError("");
                setMessage(
                  `Added ${count} ${count === 1 ? "location" : "locations"} to this draft. Save fastener plan to persist them.`,
                );
              } catch (problem) {
                clear();
                setError(errorText(problem));
              }
            }}
          >
            Add {selected.length} selected{" "}
            {selected.length === 1 ? "location" : "locations"} to draft
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              clear();
              setMessage(
                "Preview cancelled. Existing locations are unchanged.",
              );
            }}
          >
            Cancel layout preview
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="small-note">
          {message}
        </p>
      )}
    </details>
  );
}
