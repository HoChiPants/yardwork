import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import { lidPreview, type LidPreview } from "./lidMotion";
import { type LidHingePlan, type HingeLocation } from "./hingeSchema";
import {
  addHingeLocation,
  allocateHingeStock,
  applyHingeRemap,
  hingePurchaseAllocations,
  lidHingeReviews,
  makeLidHingePlan,
  removeLidHingePlan,
  previewHingeRemap,
  refreshHingePlan,
  saveHingeStockSource,
  saveLidHingePlan,
  selectHingeMotion,
} from "./hinges";
import { addMissingHingePacks, hingePurchaseSummary } from "./hingePurchases";
import { getHingeProduct, hingeProductId } from "./hingeProducts";
import {
  makeHingeStockCut,
  makeHingeStockSource,
  reviewHingeStock,
  updateHingeStockSource,
  hingeStockSnapshot,
} from "./hingeStock";
import type { HingeStockSource } from "./hingeStockSchema";

export type LidHingesPanelProps = {
  project: Project;
  sectionId: string | null;
  onChange: (project: Project) => void;
  onPreview?: (preview: LidPreview | null) => void;
  initialPlanId?: string | null;
  onSelectPlan?: (id: string | null) => void;
};
const textError = (error: unknown) =>
  error instanceof ZodError
    ? (error.issues[0]?.message ?? "Review the entered fields.")
    : error instanceof Error
      ? error.message
      : "The hinge plan could not be saved.";
const dimension = (value: number | null) =>
  value === null ? "Unknown" : formatPreciseInches(value);
const coordinates = (value: V3 | null) =>
  value ? value.map((n) => String(Number(n.toFixed(6)))).join(", ") : "Unknown";
const dateText = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const stateText = (state: string) =>
  ({
    stale: "References changed · review needed",
    conflict: "Geometry conflict",
    "needs-measurements": "Measurements pending",
    "geometry-reviewed": "Measured geometry reviewed",
  })[state] ?? state;

/** Local draft text preserves partial numbers and full canonical precision. */
function NumberField({
  label,
  value,
  onChange,
  positive = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  positive?: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value)),
    emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value;
      setDraft(value === null ? "" : String(value));
    }
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        step="any"
        min={positive ? 0.000001 : undefined}
        placeholder="Unknown"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.target.value.trim()
            ? Number(event.target.value)
            : null;
          emitted.current = next;
          onChange(next);
        }}
      />
    </label>
  );
}
function DatumFields({
  label,
  basis,
  measuredAt,
  onChange,
}: {
  label: string;
  basis: string;
  measuredAt: string | null;
  onChange: (patch: { basis?: string; measuredAt?: string | null }) => void;
}) {
  return (
    <>
      <label className="field">
        {label} basis
        <textarea
          aria-label={`${label} basis`}
          value={basis}
          maxLength={1000}
          placeholder="What was measured or proposed, and how?"
          onChange={(event) => onChange({ basis: event.target.value })}
        />
      </label>
      <label className="field">
        {label} date
        <input
          aria-label={`${label} date`}
          type="datetime-local"
          value={dateText(measuredAt)}
          onChange={(event) =>
            onChange({
              measuredAt: event.target.value
                ? new Date(event.target.value).toISOString()
                : null,
            })
          }
        />
      </label>
    </>
  );
}
function VectorFields({
  label,
  value,
  onChange,
  onPending,
  direction = false,
}: {
  label: string;
  value: V3 | null;
  onChange: (value: V3 | null) => void;
  onPending: (pending: boolean) => void;
  direction?: boolean;
}) {
  const [draft, setDraft] = useState(value ? value.map(String) : ["", "", ""]),
    canonical = useRef<(number | null)[]>(
      value ? [...value] : [null, null, null],
    ),
    serialized = JSON.stringify(value),
    emitted = useRef(serialized);
  useEffect(() => {
    if (serialized !== emitted.current) {
      emitted.current = serialized;
      canonical.current = value ? [...value] : [null, null, null];
      setDraft(value ? value.map(String) : ["", "", ""]);
      onPending(false);
    }
  }, [serialized]);
  const emit = (next: V3 | null) => {
    emitted.current = JSON.stringify(next);
    onChange(next);
  };
  const choose = (next: V3) => {
    canonical.current = [...next];
    setDraft(next.map(String));
    onPending(false);
    emit(next);
  };
  return (
    <fieldset
      className="field-section"
      style={{ border: 0, padding: 0, minWidth: 0 }}
    >
      <legend>
        {label}
        {direction ? " · unit vector" : " · local inches"}
      </legend>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 8,
        }}
      >
        {["X", "Y", "Z"].map((axis, index) => (
          <label className="field" key={axis}>
            {axis}
            <input
              aria-label={`${label} ${axis}`}
              type="number"
              step="any"
              placeholder="Unknown"
              value={draft[index]}
              onChange={(event) => {
                const next = draft.map((text, i) =>
                  i === index ? event.target.value : text,
                );
                setDraft(next);
                canonical.current[index] = event.target.value.trim()
                  ? Number(event.target.value)
                  : null;
                const entered = next.some((text) => text.trim()),
                  complete = canonical.current.every(
                    (n) => n !== null && Number.isFinite(n),
                  );
                const vector = complete ? (canonical.current as V3) : null;
                onPending(
                  entered &&
                    (!complete ||
                      (direction &&
                        Math.abs(Math.hypot(...vector!) - 1) > 1e-6)),
                );
                if (!entered) emit(null);
                else if (
                  vector &&
                  (!direction || Math.abs(Math.hypot(...vector) - 1) <= 1e-6)
                )
                  emit([...vector]);
              }}
            />
          </label>
        ))}
      </div>
      {direction && (
        <div className="button-row">
          {(["+X", "−X", "+Y", "−Y", "+Z", "−Z"] as const).map((name, i) => (
            <button
              type="button"
              className="subtle"
              key={name}
              aria-label={`${label} ${name}`}
              onClick={() =>
                choose(
                  [0, 1, 2].map((axis) =>
                    axis === Math.floor(i / 2) ? (i % 2 ? -1 : 1) : 0,
                  ) as V3,
                )
              }
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            className="subtle"
            onClick={() => {
              const nums = canonical.current;
              if (
                nums.some((n) => n === null || !Number.isFinite(n)) ||
                !Math.hypot(...(nums as number[]))
              )
                return;
              const length = Math.hypot(...(nums as number[]));
              choose(nums.map((n) => n! / length) as V3);
            }}
          >
            Normalize entered vector
          </button>
        </div>
      )}
      {draft.some((n) => n.trim()) &&
        canonical.current.some((n) => n === null) && (
          <p className="small-note">
            Enter all three coordinates or clear all three.
          </p>
        )}
    </fieldset>
  );
}
function StockEditor({
  project,
  source,
  onChange,
}: {
  project: Project;
  source: HingeStockSource;
  onChange: (project: Project) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(source)),
    [error, setError] = useState("");
  const review = useMemo(() => {
    try {
      return reviewHingeStock(draft);
    } catch {
      return null;
    }
  }, [draft]);
  const edit = (patch: Partial<HingeStockSource>) =>
    setDraft((value) => ({ ...value, ...patch }));
  const purchases = project.supplies.filter(
    (selection) => selection.productId === hingeProductId,
  );
  return (
    <div className="field-section" data-testid="hinge-stock-editor">
      <p className="small-note">
        One actual hinge source. Nominal 48 in is a reference; enter its usable
        measured length. Cuts remove [position, position + kerf].
      </p>
      <NumberField
        label="Usable hinge length (in)"
        value={draft.usableLength}
        positive
        onChange={(usableLength) => edit({ usableLength })}
      />
      <DatumFields
        label="Stock measurement"
        basis={draft.basis}
        measuredAt={draft.measuredAt}
        onChange={edit}
      />
      <label className="field">
        Link an existing manual purchase
        <select
          aria-label="Hinge source purchase"
          value={draft.purchaseSelectionId ?? ""}
          onChange={(event) =>
            edit({ purchaseSelectionId: event.target.value || null })
          }
        >
          <option value="">No purchase linked</option>
          {purchases.map((selection, index) => (
            <option key={selection.id} value={selection.id}>
              Hinge selection {index + 1} · {selection.quantity} unit(s)
            </option>
          ))}
        </select>
      </label>
      {draft.cuts.map((cut, index) => (
        <details key={cut.id} className="field-section" open>
          <summary>
            Cut {index + 1} · {dimension(cut.position)} · kerf{" "}
            {dimension(cut.kerf)}
          </summary>
          <NumberField
            label={`Cut ${index + 1} kerf start (in)`}
            value={cut.position}
            onChange={(position) =>
              edit({
                cuts: draft.cuts.map((row) =>
                  row.id === cut.id ? { ...row, position } : row,
                ),
              })
            }
          />
          <NumberField
            label={`Cut ${index + 1} metal kerf (in)`}
            positive
            value={cut.kerf}
            onChange={(kerf) =>
              edit({
                cuts: draft.cuts.map((row) =>
                  row.id === cut.id ? { ...row, kerf } : row,
                ),
              })
            }
          />
          <DatumFields
            label={`Cut ${index + 1} measurement`}
            basis={cut.basis}
            measuredAt={cut.measuredAt}
            onChange={(patch) =>
              edit({
                cuts: draft.cuts.map((row) =>
                  row.id === cut.id ? { ...row, ...patch } : row,
                ),
              })
            }
          />
          <button
            className="subtle danger"
            onClick={() =>
              edit({ cuts: draft.cuts.filter((row) => row.id !== cut.id) })
            }
          >
            Remove cut {index + 1}
          </button>
        </details>
      ))}
      <button
        className="subtle"
        onClick={() => edit({ cuts: [...draft.cuts, makeHingeStockCut()] })}
      >
        <Plus size={14} /> Add hinge cut
      </button>
      {review && (
        <>
          <p role="status">{stateText(review.state)}</p>
          {review.segments.map((segment, index) => (
            <p className="small-note" key={segment.id}>
              Segment {index + 1}: {formatPreciseInches(segment.start)} to{" "}
              {formatPreciseInches(segment.start + segment.length)} ·{" "}
              {formatPreciseInches(segment.length)} retained ·{" "}
              {segment.startEnd.kind} → {segment.endEnd.kind}
            </p>
          ))}
          {review.issues.map((issue, index) => (
            <p className="small-note" key={`${issue.code}/${index}`}>
              {issue.message}
            </p>
          ))}
        </>
      )}
      <label className="field">
        Source notes
        <textarea
          aria-label="Hinge source notes"
          value={draft.notes}
          maxLength={3000}
          onChange={(event) => edit({ notes: event.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="primary"
        disabled={JSON.stringify(draft) === JSON.stringify(source)}
        onClick={() => {
          try {
            const updated = updateHingeStockSource(
              source,
              hingeStockSnapshot(draft),
              draft.basis,
              draft.measuredAt ?? undefined,
            );
            onChange(saveHingeStockSource(project, updated));
            setError("");
          } catch (error) {
            setError(textError(error));
          }
        }}
      >
        Save hinge source
      </button>
      {!!source.referenceHistory.length && (
        <details>
          <summary>
            Recorded source changes ({source.referenceHistory.length})
          </summary>
          {source.referenceHistory.map((event) => (
            <p className="small-note" key={event.id}>
              {event.at} · {event.basis}. Previous usable length{" "}
              {dimension(event.previous.usableLength)};{" "}
              {event.previous.cuts.length} previous cuts.
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
function ReferenceReview({
  project,
  plan,
  disabled,
  onChange,
  onPreview,
}: {
  project: Project;
  plan: LidHingePlan;
  disabled: boolean;
  onChange: (project: Project) => void;
  onPreview?: LidHingesPanelProps["onPreview"];
}) {
  const [targetSectionId, setTargetSectionId] = useState(
      project.sections.some(
        (section) =>
          section.id === plan.sectionId && !!section.recipe?.openingLid,
      )
        ? plan.sectionId
        : "",
    ),
    [movingId, setMovingId] = useState(""),
    [fixedId, setFixedId] = useState(""),
    [mode, setMode] = useState<"clear" | "retain-local">("clear"),
    [basis, setBasis] = useState(""),
    [preview, setPreview] = useState<ReturnType<
      typeof previewHingeRemap
    > | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const members = project.pieces.filter(
      (piece) => !piece.offcut && material(piece.material).wood,
    ),
    section = project.sections.find((row) => row.id === targetSectionId),
    hasOpeningOwner = project.sections.some(
      (row) => row.id === plan.sectionId && !!row.recipe?.openingLid,
    );
  const clear = () => {
    setPreview(null);
    setError("");
    setMessage("");
  };
  const describe = (reference: LidHingePlan["moving"]) => {
    const baseline = reference.baseline;
    return baseline
      ? `${baseline.partLabel} · ${baseline.materialName} · ${baseline.size.map((n) => formatPreciseInches(n)).join(" × ")}${baseline.productRegistryRef ? ` · source ${baseline.productRegistryRef}` : " · generic source"}`
      : "Historical material, dimensions and source baseline unknown";
  };
  return (
    <details className="field-section">
      <summary>Refresh or replace actual members</summary>
      <p className="small-note">
        Save or discard other edits first. Changed references clear the current
        axis and drilling depths; exact earlier observations remain in history.
      </p>
      <button
        className="subtle"
        disabled={disabled || !hasOpeningOwner}
        onClick={() => {
          try {
            const next = refreshHingePlan(project, plan);
            if (next === plan) {
              clear();
              setMessage("References are current; no measurements changed.");
              return;
            }
            onPreview?.(null);
            onChange(saveLidHingePlan(project, next));
            clear();
          } catch (error) {
            setError(textError(error));
          }
        }}
      >
        Review same member IDs
      </button>
      <label className="field">
        Replacement lid section
        <select
          aria-label="Replacement hinge section"
          value={targetSectionId}
          disabled={disabled}
          onChange={(event) => {
            setTargetSectionId(event.target.value);
            setMovingId("");
            setFixedId("");
            clear();
          }}
        >
          <option value="">Choose an existing closed lid section…</option>
          {project.sections
            .filter((row) => row.recipe?.openingLid)
            .map((row) => (
              <option
                key={row.id}
                value={row.id}
                disabled={!!row.recipe?.lidOpen}
              >
                {row.name}
                {row.recipe?.lidOpen ? " · close saved lid first" : ""}
              </option>
            ))}
        </select>
      </label>
      {!hasOpeningOwner && (
        <p className="small-note">
          This plan has no opening section. Choose a replacement section
          explicitly, or remove this saved intent.
        </p>
      )}
      <label className="field">
        Replacement moving lid
        <select
          aria-label="Replacement hinge moving member"
          value={movingId}
          disabled={disabled}
          onChange={(event) => {
            setMovingId(event.target.value);
            clear();
          }}
        >
          <option value="">Choose the actual replacement…</option>
          {members
            .filter((piece) => section?.pieceIds.includes(piece.id))
            .map((piece) => (
              <option key={piece.id} value={piece.id}>
                {partLabel(project, piece.id)} · {piece.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Replacement fixed member
        <select
          aria-label="Replacement hinge fixed member"
          value={fixedId}
          disabled={disabled}
          onChange={(event) => {
            setFixedId(event.target.value);
            clear();
          }}
        >
          <option value="">Choose the actual replacement…</option>
          {members
            .filter((piece) => piece.id !== movingId)
            .map((piece) => (
              <option key={piece.id} value={piece.id}>
                {partLabel(project, piece.id)} · {piece.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Existing local hole coordinates
        <select
          aria-label="Hinge replacement coordinate mode"
          value={mode}
          disabled={disabled}
          onChange={(event) => {
            setMode(event.target.value as typeof mode);
            clear();
          }}
        >
          <option value="clear">Clear coordinates and directions</option>
          <option value="retain-local">
            Retain local coordinates for explicit review
          </option>
        </select>
      </label>
      <label className="field">
        Replacement review basis
        <textarea
          aria-label="Hinge replacement review basis"
          value={basis}
          maxLength={1000}
          disabled={disabled}
          onChange={(event) => {
            setBasis(event.target.value);
            clear();
          }}
        />
      </label>
      <button
        className="subtle"
        disabled={
          disabled ||
          !section?.recipe?.openingLid ||
          !!section.recipe.lidOpen ||
          !movingId ||
          !fixedId ||
          !basis.trim()
        }
        onClick={() => {
          try {
            setPreview(
              previewHingeRemap(project, plan.id, {
                sectionId: targetSectionId,
                movingId,
                fixedId,
                mode,
                basis,
              }),
            );
            setError("");
          } catch (error) {
            setError(textError(error));
          }
        }}
      >
        Preview hinge member replacement
      </button>
      {preview && (
        <div className="field-section" data-testid="hinge-remap-preview">
          <h4>Explicit replacement review</h4>
          <p className="small-note">
            Previous section:{" "}
            {project.sections.find((row) => row.id === plan.sectionId)?.name ??
              "Missing section"}
            . Selected section: {section?.name}. Measured motion will stay off
            until the new axis is reviewed.
          </p>
          <p className="small-note">
            Previous moving: {describe(plan.moving)}
            <br />
            Selected moving: {describe(preview.plan.moving)}
          </p>
          <p className="small-note">
            Previous fixed: {describe(plan.fixed)}
            <br />
            Selected fixed: {describe(preview.plan.fixed)}
          </p>
          <p className="small-note">
            {mode === "clear" ? "Clear" : "Retain"} {plan.locations.length}{" "}
            local hole coordinate sets. Current axis and drilling depths become
            unknown; H/L labels and exact earlier records stay intact.
          </p>
          <div className="button-row">
            <button
              className="primary"
              disabled={disabled}
              onClick={() => {
                try {
                  const next = applyHingeRemap(project, preview);
                  onPreview?.(null);
                  onChange(next);
                  clear();
                } catch (error) {
                  setError(textError(error));
                }
              }}
            >
              Apply hinge member replacement
            </button>
            <button className="subtle" onClick={clear}>
              Cancel hinge replacement
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="small-note" role="status">
          {message}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
function HingeEditor({
  project,
  plan,
  sectionId,
  onChange,
  onPreview,
}: {
  project: Project;
  plan: LidHingePlan;
  sectionId: string | null;
  onChange: (project: Project) => void;
  onPreview?: LidHingesPanelProps["onPreview"];
}) {
  const [draft, setDraft] = useState(() => structuredClone(plan)),
    [error, setError] = useState(""),
    [pending, setPending] = useState<Record<string, boolean>>({}),
    [sourceId, setSourceId] = useState(plan.stockAllocation?.sourceId ?? ""),
    [segmentId, setSegmentId] = useState(plan.stockAllocation?.segmentId ?? "");
  const edit = (patch: Partial<LidHingePlan>) =>
    setDraft((value) => ({ ...value, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan),
    source = project.hingeStockSources.find((row) => row.id === sourceId),
    stock = source ? reviewHingeStock(source) : null,
    review = useMemo(() => {
      try {
        return lidHingeReviews({
          ...project,
          lidHingePlans: project.lidHingePlans.map((row) =>
            row.id === draft.id ? draft : row,
          ),
        }).find((row) => row.plan.id === draft.id);
      } catch {
        return null;
      }
    }, [project, draft]);
  const editLocation = (id: string, patch: Partial<HingeLocation>) =>
    edit({
      locations: draft.locations.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  const pendingField = (key: string) => (value: boolean) =>
    setPending((current) =>
      current[key] === value ? current : { ...current, [key]: value },
    );
  const run = (operation: () => Project) => {
    try {
      onChange(operation());
      setError("");
    } catch (error) {
      setError(textError(error));
    }
  };
  return (
    <div data-testid="lid-hinge-editor">
      {!project.sections.some(
        (row) => row.id === plan.sectionId && !!row.recipe?.openingLid,
      ) && (
        <p className="small-note" role="status">
          This plan has no opening section. Its exact intent is retained for
          explicit replacement or removal.
        </p>
      )}
      <h4>
        {plan.label} · {plan.name}
      </h4>
      <p className="small-note">
        Moving {partLabel(project, plan.moving.pieceId)} · {plan.moving.name}
        <br />
        Fixed {partLabel(project, plan.fixed.pieceId)} · {plan.fixed.name}
      </p>
      <label className="field">
        Plan name
        <input
          aria-label="Hinge plan name"
          value={draft.name}
          maxLength={100}
          onChange={(event) => edit({ name: event.target.value })}
        />
      </label>
      <details className="field-section">
        <summary>1. Allocate measured hinge stock</summary>
        <label className="field">
          Actual source
          <select
            aria-label="Hinge allocation source"
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setSegmentId("");
            }}
          >
            <option value="">Choose a source…</option>
            {project.hingeStockSources.map((row, index) => (
              <option key={row.id} value={row.id}>
                Source {index + 1} · usable {dimension(row.usableLength)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Retained segment
          <select
            aria-label="Hinge allocation segment"
            value={segmentId}
            onChange={(event) => setSegmentId(event.target.value)}
          >
            <option value="">Choose a retained segment…</option>
            {stock?.segments.map((segment, index) => (
              <option key={segment.id} value={segment.id}>
                Segment {index + 1} · {formatPreciseInches(segment.length)} ·{" "}
                {segment.startEnd.kind} → {segment.endEnd.kind}
              </option>
            ))}
          </select>
        </label>
        {stock?.issues.map((issue, index) => (
          <p className="small-note" key={`${issue.code}/${index}`}>
            {issue.message}
          </p>
        ))}
        <button
          className="subtle"
          disabled={!sourceId || !segmentId}
          onClick={() => {
            try {
              setDraft(allocateHingeStock(project, draft, sourceId, segmentId));
              setError("");
            } catch (error) {
              setError(textError(error));
            }
          }}
        >
          Use retained segment in draft
        </button>
        <p className="small-note">
          Segment allocation stays in this draft until Save. Unallocated
          segments remain reusable remnants, not extra purchases.
        </p>
        {plan.stockAllocation && (
          <p className="small-note">
            Changing the saved allocation clears current axis and drilling
            measurements when saved; earlier observations remain in history.
          </p>
        )}
      </details>
      <details className="field-section">
        <summary>2. Measure the closed hinge axis</summary>
        <p className="small-note">
          Enter matching A/B ends in each member’s local frame, in the same
          physical end order. Local origin is the part center; axes turn with
          the part.
        </p>
        {(["movingA", "movingB", "fixedA", "fixedB"] as const).map((key) => (
          <VectorFields
            key={key}
            label={`Axis ${key}`}
            value={draft.axis[key]}
            onPending={pendingField(`axis/${key}`)}
            onChange={(value) =>
              edit({ axis: { ...draft.axis, [key]: value } })
            }
          />
        ))}
        <DatumFields
          label="Axis measurement"
          basis={draft.axis.basis}
          measuredAt={draft.axis.measuredAt}
          onChange={(patch) => edit({ axis: { ...draft.axis, ...patch } })}
        />
      </details>
      <details className="field-section">
        <summary>3. Record delivered hardware</summary>
        <label className="field">
          Supplied screw description
          <input
            aria-label="Supplied hinge screw description"
            value={draft.hardware.description}
            maxLength={300}
            onChange={(event) =>
              edit({
                hardware: {
                  ...draft.hardware,
                  description: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="field">
          Driver
          <input
            aria-label="Supplied hinge screw drive"
            value={draft.hardware.drive}
            maxLength={120}
            onChange={(event) =>
              edit({
                hardware: { ...draft.hardware, drive: event.target.value },
              })
            }
          />
        </label>
        <NumberField
          label="Observed supplied screw count"
          value={draft.hardware.suppliedCount}
          onChange={(suppliedCount) =>
            edit({ hardware: { ...draft.hardware, suppliedCount } })
          }
        />
        <label className="field">
          Included with this hinge?
          <select
            aria-label="Hinge screws included"
            value={
              draft.hardware.included === null
                ? ""
                : String(draft.hardware.included)
            }
            onChange={(event) =>
              edit({
                hardware: {
                  ...draft.hardware,
                  included:
                    event.target.value === ""
                      ? null
                      : event.target.value === "true",
                },
              })
            }
          >
            <option value="">Unknown</option>
            <option value="true">Observed included</option>
            <option value="false">Separate hardware</option>
          </select>
        </label>
        <NumberField
          label="Observed hinge leaf thickness (in)"
          positive
          value={draft.hardware.leafThickness}
          onChange={(leafThickness) =>
            edit({ hardware: { ...draft.hardware, leafThickness } })
          }
        />
        <DatumFields
          label="Hardware observation"
          basis={draft.hardware.basis}
          measuredAt={draft.hardware.measuredAt}
          onChange={(patch) =>
            edit({ hardware: { ...draft.hardware, ...patch } })
          }
        />
      </details>
      <div className="field-section">
        <h4>Transferred holes · {draft.locations.length}</h4>
        <p className="small-note">
          Add only holes transferred from the actual hinge. No hole pattern,
          screw depth or metal-cut kerf is filled automatically.
        </p>
        <div className="button-row">
          <button
            className="subtle"
            onClick={() => {
              try {
                setDraft(addHingeLocation(draft, "moving"));
                setError("");
              } catch (error) {
                setError(textError(error));
              }
            }}
          >
            <Plus size={14} /> Add moving-leaf hole
          </button>
          <button
            className="subtle"
            onClick={() => {
              try {
                setDraft(addHingeLocation(draft, "fixed"));
                setError("");
              } catch (error) {
                setError(textError(error));
              }
            }}
          >
            <Plus size={14} /> Add fixed-leaf hole
          </button>
        </div>
        {draft.locations.map((location) => {
          const point = review?.locations.find(
              (row) => row.location.id === location.id,
            ),
            label = `${draft.label}/${location.label}`;
          return (
            <details
              key={location.id}
              className="field-section"
              open={draft.locations.length === 1}
            >
              <summary>
                {label} · {location.leaf} leaf ·{" "}
                {point ? stateText(point.state) : "Draft incomplete"}
              </summary>
              <p className="small-note">
                Wood entrance on{" "}
                {partLabel(
                  project,
                  location.leaf === "moving"
                    ? draft.moving.pieceId
                    : draft.fixed.pieceId,
                )}
                . Depths start at this wood surface, not the top of a metal
                leaf.
              </p>
              <VectorFields
                label={`${location.label} entrance`}
                value={location.entranceLocal}
                onPending={pendingField(`${location.id}/entry`)}
                onChange={(entranceLocal) =>
                  editLocation(location.id, { entranceLocal })
                }
              />
              <VectorFields
                direction
                label={`${location.label} inward drive`}
                value={location.driveLocal}
                onPending={pendingField(`${location.id}/drive`)}
                onChange={(driveLocal) =>
                  editLocation(location.id, { driveLocal })
                }
              />
              <NumberField
                label={`${location.label} seated wood-surface-to-tip depth (in)`}
                positive
                value={location.measurements.surfaceToTipDepth}
                onChange={(surfaceToTipDepth) =>
                  editLocation(location.id, {
                    measurements: {
                      ...location.measurements,
                      surfaceToTipDepth,
                    },
                  })
                }
              />
              <NumberField
                label={`${location.label} pilot diameter (in)`}
                positive
                value={location.measurements.pilotDiameter}
                onChange={(pilotDiameter) =>
                  editLocation(location.id, {
                    measurements: { ...location.measurements, pilotDiameter },
                  })
                }
              />
              <NumberField
                label={`${location.label} deepest pilot-drill-tip depth (in)`}
                positive
                value={location.measurements.pilotDepth}
                onChange={(pilotDepth) =>
                  editLocation(location.id, {
                    measurements: { ...location.measurements, pilotDepth },
                  })
                }
              />
              <DatumFields
                label={`${location.label} measurement`}
                basis={location.measurements.basis}
                measuredAt={location.measurements.measuredAt}
                onChange={(patch) =>
                  editLocation(location.id, {
                    measurements: { ...location.measurements, ...patch },
                  })
                }
              />
              {point && (
                <div className="small-note" data-testid="hinge-hole-review">
                  <p>
                    Closed-datum world wood entrance:{" "}
                    {coordinates(point.entranceWorld)} in.
                    <br />
                    Candidate screw tip: {coordinates(point.tipWorld)} in.
                    <br />
                    Candidate pilot-drill tip:{" "}
                    {coordinates(point.pilotTipWorld)} in.
                  </p>
                  {point.issues.map((issue, index) => (
                    <p key={`${issue.code}/${index}`}>{issue.message}</p>
                  ))}
                </div>
              )}
              <button
                className="subtle danger"
                onClick={() => {
                  edit({
                    locations: draft.locations.filter(
                      (row) => row.id !== location.id,
                    ),
                  });
                  setPending((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(
                        ([key]) => !key.startsWith(`${location.id}/`),
                      ),
                    ),
                  );
                }}
              >
                <Trash2 size={14} /> Remove {location.label}
              </button>
            </details>
          );
        })}
      </div>
      <label className="field">
        Hinge plan notes
        <textarea
          aria-label="Hinge plan notes"
          value={draft.notes}
          maxLength={3000}
          onChange={(event) => edit({ notes: event.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {Object.values(pending).some(Boolean) && (
        <p role="alert">
          Complete or clear each partial coordinate; directions must be nonzero
          unit vectors.
        </p>
      )}
      <div className="button-row">
        <button
          className="primary"
          disabled={!dirty || Object.values(pending).some(Boolean)}
          onClick={() => run(() => saveLidHingePlan(project, draft))}
        >
          Save hinge plan
        </button>
        <button
          className="subtle"
          disabled={!dirty}
          onClick={() => {
            setDraft(structuredClone(plan));
            setPending({});
            setError("");
          }}
        >
          Discard hinge edits
        </button>
      </div>
      <div className="field-section" data-testid="hinge-plan-review">
        <h4>{dirty ? "Draft geometry review" : "Saved geometry review"}</h4>
        {review ? (
          <>
            <p role="status">
              {stateText(review.state)} · {review.activeHoleCount} active hole
              intents
            </p>
            {review.resolvedAxis && (
              <p className="small-note">
                Resolved world pivot: {coordinates(review.resolvedAxis.pivot)}{" "}
                in. Axis: {coordinates(review.resolvedAxis.axis)} · span{" "}
                {formatPreciseInches(review.resolvedAxis.length)}.
              </p>
            )}
            {review.issues.slice(0, 4).map((issue, index) => (
              <p className="small-note" key={`${issue.code}/${index}`}>
                {issue.message}
              </p>
            ))}
            {review.issues.length > 4 && (
              <details>
                <summary>All review findings ({review.issues.length})</summary>
                {review.issues.map((issue, index) => (
                  <p className="small-note" key={`${issue.code}/${index}`}>
                    {issue.message}
                  </p>
                ))}
              </details>
            )}
          </>
        ) : (
          <p className="small-note">
            Complete required coordinates and their basis/date to review this
            draft.
          </p>
        )}
        <button
          className="subtle"
          disabled={
            dirty ||
            plan.selectedForMotion ||
            !project.sections.some(
              (row) => row.id === plan.sectionId && !!row.recipe?.openingLid,
            ) ||
            !plan.stockAllocation ||
            !review?.resolvedAxis
          }
          onClick={() => run(() => selectHingeMotion(project, plan.id, true))}
        >
          Use measured axis for this lid
        </button>
        <button
          className="subtle"
          disabled={
            dirty ||
            !plan.selectedForMotion ||
            !project.sections.some(
              (row) => row.id === plan.sectionId && !!row.recipe?.openingLid,
            )
          }
          onClick={() => run(() => selectHingeMotion(project, plan.id, false))}
        >
          Use provisional rear pivot
        </button>
        {onPreview && (
          <>
            <button
              className="subtle"
              disabled={dirty || plan.sectionId !== sectionId}
              onClick={() => {
                try {
                  onPreview(lidPreview(project, plan.sectionId, 0));
                  setError("");
                } catch (error) {
                  setError(textError(error));
                }
              }}
            >
              Review measured lid travel above
            </button>
            {plan.sectionId !== sectionId && (
              <p className="small-note">
                Choose this plan’s section before previewing its motion.
              </p>
            )}
          </>
        )}
        <p className="small-note">
          {!project.sections.some(
            (row) => row.id === plan.sectionId && !!row.recipe?.openingLid,
          )
            ? "The saved mechanism is inactive because it has no opening section."
            : plan.selectedForMotion
              ? "Measured candidate selected."
              : "Provisional rear-pivot motion remains selected."}{" "}
          Geometry review does not establish hinge capacity or a hold-open
          mechanism.
        </p>
      </div>
      <ReferenceReview
        project={project}
        plan={plan}
        disabled={dirty}
        onChange={onChange}
        onPreview={onPreview}
      />
      <details className="field-section">
        <summary>Member changes and recorded history</summary>
        <p className="small-note">
          A changed or missing member needs explicit reference review. Current
          coordinates never rebind to a similar name.
        </p>
        {plan.referenceHistory.length ? (
          plan.referenceHistory.map((event) => (
            <details key={event.id} className="small-note">
              <summary>
                Recorded {event.kind} · {event.at}
              </summary>
              <p>{event.basis}</p>
              <p>
                Previous moving{" "}
                {event.previous.moving.baseline?.partLabel ??
                  "Unknown historical label"}{" "}
                · fixed{" "}
                {event.previous.fixed.baseline?.partLabel ??
                  "Unknown historical label"}
                ; {event.previous.locations.length} historical holes. Historical
                values are not current drill settings.
              </p>
              <p>
                Historical axis, moving A/B:{" "}
                {coordinates(event.previous.axis.movingA)} /{" "}
                {coordinates(event.previous.axis.movingB)} in.
                <br />
                Historical axis, fixed A/B:{" "}
                {coordinates(event.previous.axis.fixedA)} /{" "}
                {coordinates(event.previous.axis.fixedB)} in.
                <br />
                Basis: {event.previous.axis.basis || "Unknown"} ·{" "}
                {event.previous.axis.measuredAt || "Date unknown"}.
              </p>
              {event.previous.locations.map((location) => (
                <p key={location.id}>
                  Historical {plan.label}/{location.label} · {location.leaf}{" "}
                  leaf.
                  <br />
                  Local wood entrance: {coordinates(location.entranceLocal)} in.
                  Inward vector: {coordinates(location.driveLocal)}.<br />
                  Seated wood-surface-to-tip:{" "}
                  {dimension(location.measurements.surfaceToTipDepth)} · Pilot
                  diameter: {dimension(location.measurements.pilotDiameter)} ·
                  Deepest pilot-drill tip:{" "}
                  {dimension(location.measurements.pilotDepth)}.<br />
                  {location.measurements.basis || "Basis unknown"} ·{" "}
                  {location.measurements.measuredAt || "Date unknown"}.
                </p>
              ))}
            </details>
          ))
        ) : (
          <p className="small-note">No reference changes recorded.</p>
        )}
      </details>
      <button
        className="subtle danger"
        onClick={() => run(() => removeLidHingePlan(project, plan.id))}
      >
        <Trash2 size={14} /> Remove {plan.label} hinge plan
      </button>
    </div>
  );
}
export function LidHingesPanel({
  project,
  sectionId,
  onChange,
  onPreview,
  initialPlanId,
  onSelectPlan,
}: LidHingesPanelProps) {
  const [chosenSection, setChosenSection] = useState(sectionId ?? ""),
    [movingId, setMovingId] = useState(""),
    [fixedId, setFixedId] = useState(""),
    [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId ?? null),
    [error, setError] = useState("");
  useEffect(() => {
    setChosenSection(sectionId ?? "");
    setSelectedPlanId(initialPlanId ?? null);
    setFixedId("");
  }, [project.id, sectionId]);
  useEffect(() => {
    if (initialPlanId !== undefined) setSelectedPlanId(initialPlanId);
  }, [project.id, initialPlanId]);
  const section = project.sections.find((row) => row.id === chosenSection),
    candidates = project.pieces.filter(
      (piece) => !piece.offcut && material(piece.material).wood,
    ),
    plans = project.lidHingePlans.filter(
      (plan) =>
        !chosenSection ||
        plan.sectionId === chosenSection ||
        !project.sections.some(
          (section) =>
            section.id === plan.sectionId && !!section.recipe?.openingLid,
        ),
    ),
    selected =
      plans.find((plan) => plan.id === selectedPlanId) ??
      plans.find((plan) => plan.sectionId === chosenSection) ??
      plans[0];
  useEffect(() => { onSelectPlan?.(selected?.id ?? null); }, [project.id, selected?.id, onSelectPlan]);
  const previewSectionId = sectionId ?? project.sections.find((row) => row.id === selected?.sectionId && row.recipe?.openingLid)?.id ?? null;
  useEffect(() => {
    const lids = project.pieces.filter(
      (piece) =>
        section?.pieceIds.includes(piece.id) &&
        piece.designRole === "seat-lid" &&
        !piece.offcut,
    );
    setMovingId(lids.length === 1 ? lids[0].id : "");
    setFixedId("");
  }, [project.id, section?.id]);
  const product = getHingeProduct(hingeProductId)!,
    allocations = hingePurchaseAllocations(project),
    purchases = hingePurchaseSummary(project, allocations);
  const previewCallback = useRef(onPreview);
  previewCallback.current = onPreview;
  useEffect(
    () => () => previewCallback.current?.(null),
    [project.id, sectionId],
  );
  return (
    <section
      aria-label="Measured lid hinges"
      className="attachment-panel lid-hinges-panel"
    >
      <div className="panel-heading">
        <h3>Lid hinges</h3>
      </div>
      <p className="small-note">
        Choose the actual members, allocate a measured hinge segment, then
        record its axis and transferred holes.
      </p>
      {section?.recipe?.lidOpen && (
        <p className="small-note">
          Close the saved lid to inspect mounting datums in 3D. Coordinates
          refer to the closed assembly.
        </p>
      )}
      <label className="field">
        Storage section
        <select
          aria-label="Hinge storage section"
          value={chosenSection}
          onChange={(event) => {
            setChosenSection(event.target.value);
            setSelectedPlanId(null);
          }}
        >
          <option value="">Choose a storage section…</option>
          {project.sections
            .filter((row) => row.recipe?.openingLid)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
      </label>
      <details className="field-section" open={!plans.length}>
        <summary>Create a hinge plan</summary>
        <label className="field">
          Moving lid
          <select
            aria-label="Hinge moving member"
            value={movingId}
            onChange={(event) => setMovingId(event.target.value)}
          >
            <option value="">Choose the actual lid…</option>
            {candidates
              .filter((piece) => section?.pieceIds.includes(piece.id))
              .map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {partLabel(project, piece.id)} · {piece.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Fixed member
          <select
            aria-label="Hinge fixed member"
            value={fixedId}
            onChange={(event) => setFixedId(event.target.value)}
          >
            <option value="">Choose an actual fixed member…</option>
            {candidates
              .filter((piece) => piece.id !== movingId)
              .map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {partLabel(project, piece.id)} · {piece.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="primary"
          disabled={!section || !movingId || !fixedId}
          onClick={() => {
            try {
              const plan = makeLidHingePlan(
                project,
                chosenSection,
                movingId,
                fixedId,
              );
              onChange(saveLidHingePlan(project, plan));
              setSelectedPlanId(plan.id);
              setError("");
            } catch (error) {
              setError(textError(error));
            }
          }}
        >
          <Plus size={14} /> Create hinge plan
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
      <details className="field-section">
        <summary>
          Physical hinge sources ({project.hingeStockSources.length})
        </summary>
        <p className="small-note">
          Sources describe actual hardware stock; creating one does not buy it
          or add a mesh.
        </p>
        <button
          className="subtle"
          onClick={() => {
            try {
              onChange(saveHingeStockSource(project, makeHingeStockSource()));
              setError("");
            } catch (error) {
              setError(textError(error));
            }
          }}
        >
          <Plus size={14} /> Add hinge source
        </button>
        {project.hingeStockSources.map((source, index) => (
          <details key={source.id} className="field-section">
            <summary>
              Source {index + 1} · usable {dimension(source.usableLength)}
            </summary>
            <StockEditor
              key={JSON.stringify(source)}
              project={project}
              source={source}
              onChange={onChange}
            />
          </details>
        ))}
      </details>
      {!!plans.length && (
        <label className="field">
          Saved hinge plan
          <select
            aria-label="Saved hinge plan"
            value={selected?.id ?? ""}
            onChange={(event) => setSelectedPlanId(event.target.value)}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label} · {plan.name}
                {project.sections.some(
                  (section) =>
                    section.id === plan.sectionId &&
                    !!section.recipe?.openingLid,
                )
                  ? ""
                  : " · no opening section"}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <HingeEditor
          key={`${project.id}/${selected.id}/${selected.updatedAt}/${JSON.stringify(selected)}`}
          project={project}
          plan={selected}
          sectionId={previewSectionId}
          onChange={onChange}
          onPreview={onPreview}
        />
      )}
      <details className="field-section" data-testid="hinge-purchases">
        <summary>Hinge purchase comparison</summary>
        <p className="small-note">
          Required physical sources: {purchases.requiredHinges} · Selected hinge
          units: {purchases.selectedHinges} · Missing units:{" "}
          {purchases.shortfallHinges}.
        </p>
        <p className="small-note">
          Each allocated source is counted once. Segments and remnants are not
          extra hinges; observed included screws are not extra purchase rows.
        </p>
        {purchases.sourceRows.map((row, index) => (
          <div key={row.sourceId} className="small-note">
            <p>
              <strong>Source {index + 1}</strong> · {stateText(row.state)} ·{" "}
              {row.included ? "Included once" : "Not included in demand"}
            </p>
            {row.segments.map((segment, segmentIndex) => (
              <p key={segment.id}>
                Segment {segmentIndex + 1} ·{" "}
                {formatPreciseInches(segment.length)} ·{" "}
                {segment.allocated
                  ? "Allocated"
                  : "Reusable unallocated remnant"}
              </p>
            ))}
          </div>
        ))}
        {purchases.incomplete && (
          <p className="small-note">
            Excluded or pending allocations are not included in required units.
            Review their source and member findings above.
          </p>
        )}
        {!purchases.retailerSupported && (
          <p className="small-note">
            The exact Everbilt hinge has no reviewed offer at the selected
            retailer. Its Home Depot reference remains available; no substitute
            was selected.
          </p>
        )}
        <button
          className="subtle"
          disabled={!purchases.canAddMissing}
          onClick={() => {
            try {
              onChange(addMissingHingePacks(project, allocations));
              setError("");
            } catch (error) {
              setError(textError(error));
            }
          }}
        >
          Add missing hinge units
        </button>
      </details>
      <details className="field-section">
        <summary>Product reference and installation unknowns</summary>
        <p className="small-note">
          {product.name}. Linked pilot reference:{" "}
          {formatPreciseInches(product.referencePilotDiameter)}; this does not
          fill any operation value.
        </p>
        {product.sources.map((source) => (
          <p className="small-note" key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.revision}
            </a>
            <br />
            {source.scope}. {source.note}
          </p>
        ))}
        {[...product.conflicts, ...product.unknowns].map((text) => (
          <p className="small-note" key={text}>
            {text}
          </p>
        ))}
      </details>
    </section>
  );
}
