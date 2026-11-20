import { DriverAccessPanel } from "./DriverAccessPanel";
import type { DriverAccessLocation } from "./fastenerAccess";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Trash2, Wrench } from "lucide-react";
import { ZodError } from "zod";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import {
  addFastenerLocation,
  changeFastenerProduct,
  fastenerReviews,
  makeFastenerPlan,
  normalizedFastenerDrive,
  qualifiedFastenerLabel,
  refreshFastenerPlan,
  removeFastenerPlan,
  saveFastenerPlan,
  suggestCenteredFastener,
  type FastenerReview,
  type FastenerState,
  type ReviewedFastenerLocation,
} from "./fastenings";
import { type FastenerLocation, type FastenerPlan } from "./fasteningSchema";
import {
  getWoodFastenerProduct,
  woodFastenerProducts,
} from "./fastenerProducts";
import {
  addMissingFastenerPacks,
  fastenerPurchaseSummary,
} from "./fastenerPurchases";
import {
  FastenerReferenceHistory,
  FastenerRemapping,
} from "./FastenerMemberMapping";
import {
  FastenerLayoutPanel,
  type FastenerLayoutRequest,
} from "./FastenerLayoutPanel";
import type { FastenerLayoutMarkerPreview } from "./FastenerMarkers";
import {
  previewFastenerContactRow,
  type FastenerContactRowPreview,
} from "./fastenerContactRow";
import { FastenerContactRowFields } from "./FastenerContactRowFields";
import { FastenerEntryComparison } from "./FastenerEntryComparison";
import { FastenerRepeatPanel } from "./FastenerRepeatPanel";

export type FastenersPanelProps = {
  project: Project;
  onChange: (project: Project) => void;
  onBack: () => void;
  backLabel?: string;
  initialPair?: { headId: string; receiverId: string; nonce: number; compareSides?: boolean };
  selectedPieceId?: string | null;
  selectedPlanId?: string | null;
  onSelectPlan?: (id: string | null) => void;
  focusedLocationId?: string | null;
  onFocusLocation?: (locationId: string | null, planId: string) => void;
  onOpenTools?: () => void;
  onRequestEntrancePick?: (target: FastenerEntrancePickTarget) => void;
  onCancelEntrancePick?: () => void;
  pickingLocationId?: string | null;
  pickedEntrance?: PickedFastenerEntrance | null;
  onLayoutPreview?: (preview: FastenerLayoutMarkerPreview | null) => void;
  onInspectLayout?: () => void;
  onDriverPreview?: (value: DriverAccessLocation | null) => void;
};
export type FastenerEntrancePickTarget = {
  planId: string;
  locationId: string;
  headPieceId: string;
};
export type PickedFastenerEntrance = {
  planId: string;
  locationId: string;
  entranceLocal: V3;
  driveLocal: V3;
  nonce: number;
};
const stateLabel: Record<FastenerState, string> = {
  stale: "References changed · review needed",
  conflict: "Path conflict",
  "needs-measurements": "Measurements pending",
  "path-reviewed": "Centerline reviewed · fastening design remains",
};
const errorText = (error: unknown) =>
  error instanceof ZodError
    ? (error.issues[0]?.message ?? "Review the plan fields.")
    : error instanceof Error
      ? error.message
      : "The fastener plan could not be saved.";
const coordinates = (point: V3 | null) =>
  point ? point.map((value) => Number(value.toFixed(5))).join(", ") : "Unknown";
const dimension = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "Unknown"
    : formatPreciseInches(value);
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const workspaceToken = (project: Project) =>
  JSON.stringify({
    id: project.id,
    pieces: project.pieces,
    plans: project.fastenerPlans,
  });

function OptionalLength({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1,
    [draft, setDraft] = useState(value === null ? "" : String(value)),
    emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value;
      setDraft(value === null ? "" : String(value / scale));
    }
  }, [value, scale]);
  return (
    <label className="field length-field">
      <span>{label}</span>
      <div className="length-entry">
        <input
          type="number"
          aria-label={label}
          value={draft}
          placeholder="Unknown"
          step="any"
          min={0.000001 / scale}
          max={12 / scale}
          onChange={(event) => {
            setDraft(event.target.value);
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
            setDraft(
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

/** Unentered axes stay unknown. Unit toggles never round unchanged canonical axes. */
function VectorInput({
  label,
  value,
  direction = false,
  onChange,
  onPending,
}: {
  label: string;
  value: V3 | null;
  direction?: boolean;
  onChange: (point: V3 | null) => void;
  onPending: (pending: boolean) => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1,
    [draft, setDraft] = useState<string[]>(
      value ? value.map(String) : ["", "", ""],
    ),
    canonical = useRef<(number | null)[]>(
      value ? [...value] : [null, null, null],
    ),
    serialized = JSON.stringify(value),
    emitted = useRef(serialized),
    [error, setError] = useState("");
  useEffect(() => {
    if (serialized !== emitted.current) {
      emitted.current = serialized;
      canonical.current = value ? [...value] : [null, null, null];
      setDraft(
        value
          ? value.map((axis) => String(axis / (direction ? 1 : scale)))
          : ["", "", ""],
      );
      setError("");
    }
  }, [serialized, scale, direction]);
  const emit = (point: V3 | null) => {
    emitted.current = JSON.stringify(point);
    onChange(point);
  };
  const chooseDirection = (point: V3) => {
    canonical.current = [...point];
    setDraft(point.map(String));
    onPending(false);
    emit(point);
    setError("");
  };
  const some = draft.some((axis) => axis.trim()),
    complete = canonical.current.every((axis) => axis !== null);
  return (
    <fieldset
      className="field-section"
      style={{ minWidth: 0, border: 0, padding: 0 }}
    >
      <legend>{label}</legend>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 8,
        }}
      >
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label className="field" key={axis}>
            {axis}
            <input
              aria-label={`${label} ${axis}`}
              type="number"
              step="any"
              placeholder="Unknown"
              value={draft[index]}
              min={direction ? undefined : -12000 / scale}
              max={direction ? undefined : 12000 / scale}
              onChange={(event) => {
                const next = draft.map((text, i) =>
                  i === index ? event.target.value : text,
                );
                setDraft(next);
                canonical.current[index] =
                  event.target.value.trim() &&
                  Number.isFinite(Number(event.target.value))
                    ? Number(event.target.value) * (direction ? 1 : scale)
                    : null;
                const entered = next.some((text) => text.trim()),
                  done = canonical.current.every((value) => value !== null);
                onPending(entered && (direction || !done));
                emit(
                  !direction && done ? ([...canonical.current] as V3) : null,
                );
                setError("");
              }}
            />
          </label>
        ))}
      </div>
      {direction ? (
        <>
          <p className="small-note">
            Unitless direction in the head member's local axes. Choose an axis
            or explicitly normalize your vector.
          </p>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}
          >
            {([0, 1, 2] as const).flatMap((axis) =>
              ([-1, 1] as const).map((sign) => (
                <button
                  type="button"
                  className="button secondary small"
                  key={`${axis}/${sign}`}
                  aria-label={`Drive along local ${["X", "Y", "Z"][axis]} ${sign === 1 ? "positive" : "negative"}`}
                  onClick={() => {
                    const point: V3 = [0, 0, 0];
                    point[axis] = sign;
                    chooseDirection(point);
                  }}
                >
                  {["X", "Y", "Z"][axis]}
                  {sign === 1 ? "+" : "−"}
                </button>
              )),
            )}
          </div>
          <button
            type="button"
            className="text-button"
            disabled={!some || !complete}
            style={{ marginTop: 10 }}
            onClick={() => {
              try {
                chooseDirection(
                  normalizedFastenerDrive(canonical.current as V3),
                );
              } catch (problem) {
                setError(errorText(problem));
              }
            }}
          >
            Normalize this direction
          </button>
        </>
      ) : (
        <label className="field">
          Coordinate units
          <select
            aria-label={`${label} units`}
            value={unit}
            onChange={(event) => {
              const next = event.target.value as "in" | "ft",
                factor = next === "ft" ? 12 : 1;
              setDraft(
                canonical.current.map((axis) =>
                  axis === null ? "" : String(axis / factor),
                ),
              );
              setUnit(next);
            }}
          >
            <option value="in">in</option>
            <option value="ft">ft</option>
          </select>
        </label>
      )}
      {some && (
        <button
          type="button"
          className="text-button"
          style={{ marginTop: 8 }}
          onClick={() => {
            canonical.current = [null, null, null];
            setDraft(["", "", ""]);
            onPending(false);
            emit(null);
            setError("");
          }}
        >
          Clear {label.toLowerCase()}
        </button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {some && !direction && !complete && (
        <p className="form-error">
          Enter all three coordinates or clear this point to keep it unknown.
        </p>
      )}
      {direction && some && !value && (
        <p className="small-note">
          Normalize the entered vector before saving, or clear it to keep
          direction unknown.
        </p>
      )}
    </fieldset>
  );
}

function ProductEvidence({
  productId,
}: {
  productId: FastenerPlan["productId"];
}) {
  const product = getWoodFastenerProduct(productId);
  if (!product)
    return (
      <p className="form-error">
        This screw product has no current reviewed reference.
      </p>
    );
  return (
    <div className="field-section">
      <strong>{product.name}</strong>
      <p className="small-note">
        Nominal label: {formatPreciseInches(product.nominalLength)} ·{" "}
        {product.drive} drive · {product.packCount} per purchase box. Enter the
        actual surface-to-tip depth after seating; the nominal label does not
        fill a measurement.
      </p>
      <p className="small-note">
        {product.conflicts.length} source conflicts remain unresolved. Product
        profile and installation requirements still need review.
      </p>
      <details>
        <summary>Product evidence, conflicts and length datums</summary>
        <p className="small-note">
          Evidence revision: {product.evidenceRevision}. These facts remain
          separate from user measurements.
        </p>
        <h4>Conflicts to resolve</h4>
        <ul>
          {product.conflicts.map((text) => (
            <li className="small-note" key={text}>
              {text}
            </li>
          ))}
        </ul>
        <h4>Reference datums</h4>
        {product.datums.map((datum) => (
          <p className="small-note" key={datum.id}>
            <strong>{datum.label}.</strong> {datum.note}
          </p>
        ))}
        <h4>Remaining unknowns</h4>
        <ul>
          {product.unknowns.map((text) => (
            <li className="small-note" key={text}>
              {text}
            </li>
          ))}
        </ul>
        <h4>Reviewed sources</h4>
        {product.sources.map((source) => (
          <p
            className="small-note"
            key={`${source.url}/${source.revision}`}
            style={{ overflowWrap: "anywhere" }}
          >
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.revision}
            </a>{" "}
            · {source.scope}
            <br />
            {source.note}
          </p>
        ))}
      </details>
    </div>
  );
}

function PathValues({
  point,
}: {
  point: ReviewedFastenerLocation | undefined;
}) {
  return (
    <div className="small-note" data-testid="fastener-path-values">
      <p>
        World entry: {coordinates(point?.entranceWorld ?? null)} in.
        <br />
        World drive vector: {coordinates(point?.driveWorld ?? null)}.
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          columnGap: 10,
          rowGap: 5,
        }}
      >
        <dt>Head-side exit depth</dt>
        <dd>{dimension(point?.headExitDepth)}</dd>
        <dt>Receiver entry depth</dt>
        <dd>{dimension(point?.receiverEnterDepth)}</dd>
        <dt>Receiver exit depth</dt>
        <dd>{dimension(point?.receiverExitDepth)}</dd>
        <dt>Gap between members</dt>
        <dd>{dimension(point?.gap)}</dd>
        <dt>Candidate penetration</dt>
        <dd>{dimension(point?.penetration)}</dd>
        <dt>Available receiver depth</dt>
        <dd>{dimension(point?.availableReceiverDepth)}</dd>
      </dl>
      <p>
        Head exit world: {coordinates(point?.headExitWorld ?? null)} in.
        <br />
        Receiver entry world: {coordinates(
          point?.receiverEnterWorld ?? null,
        )}{" "}
        in.
        <br />
        Receiver exit world: {coordinates(point?.receiverExitWorld ?? null)} in.
        <br />
        Candidate tip world: {coordinates(point?.tipWorld ?? null)} in.
      </p>
    </div>
  );
}

type RefreshPreview = {
  plan: FastenerPlan;
  review: FastenerReview;
  token: string;
  draftToken: string;
};
function PlanEditor({
  project,
  plan,
  onChange,
  onRequestEntrancePick,
  onCancelEntrancePick,
  pickingLocationId,
  pickedEntrance,
  consumeEntrancePick,
  onDiscardDraft,
  onLayoutPreview,
  onInspectLayout,
  onDriverPreview,
  openLocationIds,
  onLocationOpenChange,
  focusedLocationId,
  onFocusLocation,
}: {
  project: Project;
  plan: FastenerPlan;
  onChange: (project: Project) => void;
  onRequestEntrancePick?: FastenersPanelProps["onRequestEntrancePick"];
  onCancelEntrancePick?: () => void;
  pickingLocationId?: string | null;
  pickedEntrance?: PickedFastenerEntrance | null;
  consumeEntrancePick: (nonce: number) => boolean;
  onDiscardDraft: () => void;
  onLayoutPreview?: FastenersPanelProps["onLayoutPreview"];
  onInspectLayout?: () => void;
  onDriverPreview?: (value: DriverAccessLocation | null) => void;
  openLocationIds: readonly string[];
  onLocationOpenChange: (id: string, open: boolean) => void;
  focusedLocationId?: string | null;
  onFocusLocation?: FastenersPanelProps["onFocusLocation"];
}) {
  const [draft, setDraft] = useState(() => structuredClone(plan)),
    [productChoice, setProductChoice] = useState(plan.productId),
    [pending, setPending] = useState<Record<string, boolean>>({}),
    [inputVersions, setInputVersions] = useState<Record<string, number>>({}),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<RefreshPreview | null>(null),
    [layoutRequest, setLayoutRequest] = useState<FastenerLayoutRequest | null>(
      null,
    );
  useEffect(() => {
    if (
      !pickedEntrance ||
      pickedEntrance.planId !== plan.id ||
      !draft.locations.some(
        (location) => location.id === pickedEntrance.locationId,
      ) ||
      !consumeEntrancePick(pickedEntrance.nonce)
    )
      return;
    setDraft((current) => ({
      ...current,
      locations: current.locations.map((location) =>
        location.id === pickedEntrance.locationId
          ? {
              ...location,
              entranceLocal: [...pickedEntrance.entranceLocal] as V3,
              driveLocal: [...pickedEntrance.driveLocal] as V3,
            }
          : location,
      ),
    }));
    setPending((current) => ({
      ...current,
      [`${pickedEntrance.locationId}/entry`]: false,
      [`${pickedEntrance.locationId}/direction`]: false,
    }));
    setInputVersions((current) => ({
      ...current,
      [pickedEntrance.locationId]: pickedEntrance.nonce,
    }));
    setPreview(null);
    onLayoutPreview?.(null);
    setError("");
  }, [pickedEntrance, plan.id, draft.locations, consumeEntrancePick]);
  const update = (patch: Partial<FastenerPlan>) => {
    onLayoutPreview?.(null);
    onDriverPreview?.(null);
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
    setError("");
  };
  const context = useMemo(() => {
    try {
      return {
        review:
          fastenerReviews(saveFastenerPlan(project, draft)).find(
            (review) => review.plan.id === draft.id,
          ) ?? null,
        error: "",
      };
    } catch (problem) {
      return { review: null, error: errorText(problem) };
    }
  }, [project, draft]);
  const pendingCount = Object.values(pending).filter(Boolean).length,
    productChanged = productChoice !== draft.productId,
    hasUnsavedChanges =
      pendingCount > 0 ||
      productChanged ||
      JSON.stringify(draft) !== JSON.stringify(plan),
    head = project.pieces.find(
      (piece) => piece.id === draft.head.pieceId && !piece.offcut,
    ),
    receiver = project.pieces.find(
      (piece) => piece.id === draft.receiver.pieceId && !piece.offcut,
    );
  const updateLocation = (value: FastenerLocation) =>
    update({
      locations: draft.locations.map((location) =>
        location.id === value.id ? value : location,
      ),
    });
  const activeLocation =
    focusedLocationId === null || focusedLocationId === undefined
      ? (context.review?.locations.find((point) => point.entranceWorld)
          ?.location.id ??
        draft.locations[0]?.id ??
        "")
      : draft.locations.some((location) => location.id === focusedLocationId)
        ? focusedLocationId
        : "";
  const focusLocation = (id: string) => onFocusLocation?.(id, draft.id);
  return (
    <form
      className="fastener-plan-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          if (pendingCount)
            throw Error(
              "Complete or clear entry coordinates, and normalize or clear custom directions before saving.",
            );
          if (productChanged)
            throw Error(
              "Confirm or cancel the screw-product change before saving.",
            );
          onLayoutPreview?.(null);
          onChange(saveFastenerPlan(project, draft));
          onCancelEntrancePick?.();
        } catch (problem) {
          setError(errorText(problem));
        }
      }}
    >
      <label className="field">
        Plan name
        <input
          aria-label="Fastener plan name"
          value={draft.name}
          maxLength={100}
          onChange={(event) => update({ name: event.target.value })}
        />
      </label>
      <p className="small-note">
        <strong>Head side:</strong> {partLabel(project, draft.head.pieceId)} ·{" "}
        {head?.name ?? draft.head.name}
        {!head && " · missing or offcut"}.<br />
        <strong>Receiver:</strong> {partLabel(project, draft.receiver.pieceId)}{" "}
        · {receiver?.name ?? draft.receiver.name}
        {!receiver && " · missing or offcut"}.
      </p>
      <label className="field">
        Recorded screw product
        <select
          aria-label="Recorded screw product"
          value={productChoice}
          onChange={(event) => {
            setProductChoice(event.target.value as FastenerPlan["productId"]);
            setPreview(null);
          }}
        >
          {woodFastenerProducts.map((product) => (
            <option key={product.productId} value={product.productId}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      {productChanged && (
        <div className="attachment-refresh-preview">
          <p className="small-note">
            Changing product clears the shared user measurements, their basis
            and date. Re-measure the delivered screw for this plan.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              try {
                setDraft(changeFastenerProduct(project, draft, productChoice));
                setPreview(null);
                setError("");
              } catch (problem) {
                setError(errorText(problem));
              }
            }}
          >
            Use selected screw product
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setProductChoice(draft.productId)}
          >
            Keep recorded product
          </button>
        </div>
      )}
      <ProductEvidence productId={productChoice} />
      <DriverAccessPanel project={project} review={context.review} draft={draft.driverAccess}
        onCheck={(value) => update({ driverAccess: value })} onShow={onDriverPreview} />
      <div className="attachment-plan">
        <h3>Explicit screw locations</h3>
        <p className="small-note">
          {draft.locations.length} locations recorded. Each added location
          starts with an unknown entry point and direction. Save edits to update
          scene markers and purchasing.
        </p>
        {draft.locations.length > 0 && (
          <label className="field">
            Active screw location
            <select
              aria-label="Active screw location"
              value={activeLocation}
              onChange={(event) =>
                onFocusLocation?.(event.target.value || null, draft.id)
              }
            >
              <option value="">Choose a recorded location</option>
              {draft.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {qualifiedFastenerLabel(draft, location)} ·{" "}
                  {context.review?.locations.find(
                    (point) => point.location.id === location.id,
                  )?.state
                    ? stateLabel[
                        context.review.locations.find(
                          (point) => point.location.id === location.id,
                        )!.state
                      ]
                    : "Measurements pending"}
                </option>
              ))}
            </select>
            <small>
              Sets one canvas caption. Open a location below to edit its fields.
            </small>
          </label>
        )}
        <FastenerLayoutPanel
          project={project}
          draft={draft}
          request={layoutRequest}
          disabled={pendingCount > 0 || productChanged || !!context.error}
          pickingLocationId={pickingLocationId}
          onBeforePreview={() => {
            if (pickedEntrance) consumeEntrancePick(pickedEntrance.nonce);
            onCancelEntrancePick?.();
            setPreview(null);
          }}
          onPreview={onLayoutPreview}
          onInspectLayout={onInspectLayout}
          onSelectSeed={(id) => {
            focusLocation(id);
            onLocationOpenChange(id, true);
          }}
          onChange={(next) => {
            if (pickedEntrance) consumeEntrancePick(pickedEntrance.nonce);
            onCancelEntrancePick?.();
            setDraft(next);
            setPreview(null);
            setError("");
          }}
        />
        {draft.locations.map((location) => {
          const reviewed = context.review?.locations.find(
            (point) => point.location.id === location.id,
          );
          return (
            <details
              className="attachment-plan"
              key={location.id}
              data-location-id={location.id}
              data-focused={String(activeLocation === location.id)}
              open={openLocationIds.includes(location.id)}
              onToggle={(event) =>
                onLocationOpenChange(location.id, event.currentTarget.open)
              }
              aria-label={`Fastener location ${location.label}`}
              onFocusCapture={() => focusLocation(location.id)}
            >
              <summary onClick={() => focusLocation(location.id)}>
                {qualifiedFastenerLabel(draft, location)} · {location.name}
                {reviewed && ` · ${stateLabel[reviewed.state]}`}
              </summary>
              <label className="field">
                Location name
                <input
                  aria-label={`${location.label} name`}
                  value={location.name}
                  maxLength={100}
                  onChange={(event) =>
                    updateLocation({ ...location, name: event.target.value })
                  }
                />
              </label>
              <p className="small-note">
                Entry coordinates are measured in the head member's local axes,
                centered on that actual part. Choose an actual retained surface;
                no center or hole pattern is supplied.
              </p>
              <button
                type="button"
                className="text-button"
                disabled={
                  !location.entranceLocal ||
                  !location.driveLocal ||
                  !!pending[`${location.id}/entry`] ||
                  !!pending[`${location.id}/direction`] ||
                  productChanged
                }
                onClick={() => {
                  if (pickedEntrance) consumeEntrancePick(pickedEntrance.nonce);
                  onCancelEntrancePick?.();
                  onLocationOpenChange(location.id, true);
                  focusLocation(location.id);
                  setLayoutRequest((current) => ({
                    seedId: location.id,
                    nonce: (current?.nonce ?? 0) + 1,
                  }));
                }}
              >
                Repeat from {location.label}
              </button>
              {onRequestEntrancePick && (
                <>
                  <button
                    type="button"
                    className="button secondary small"
                    aria-pressed={pickingLocationId === location.id}
                    disabled={!head}
                    onClick={() => {
                      onLayoutPreview?.(null);
                      onLocationOpenChange(location.id, true);
                      focusLocation(location.id);
                      onRequestEntrancePick({
                        planId: draft.id,
                        locationId: location.id,
                        headPieceId: draft.head.pieceId,
                      });
                    }}
                  >
                    {pickingLocationId === location.id
                      ? "Picking entrance in 3D…"
                      : "Pick entrance in 3D"}
                  </button>
                  <p
                    className="small-note"
                    role={
                      pickingLocationId === location.id ? "status" : undefined
                    }
                  >
                    Click a retained face of{" "}
                    {partLabel(project, draft.head.pieceId)} in the 3D view. The
                    picked point and inward face normal fill this draft. Escape
                    cancels; Save records the location.
                  </p>
                </>
              )}
              <VectorInput
                key={`${location.id}/entry/${inputVersions[location.id] ?? "initial"}`}
                label={`${location.label} entry point`}
                value={location.entranceLocal}
                onChange={(entranceLocal) =>
                  updateLocation({ ...location, entranceLocal })
                }
                onPending={(value) =>
                  setPending((current) => ({
                    ...current,
                    [`${location.id}/entry`]: value,
                  }))
                }
              />
              <VectorInput
                key={`${location.id}/direction/${inputVersions[location.id] ?? "initial"}`}
                label={`${location.label} drive direction`}
                value={location.driveLocal}
                direction
                onChange={(driveLocal) =>
                  updateLocation({ ...location, driveLocal })
                }
                onPending={(value) =>
                  setPending((current) => ({
                    ...current,
                    [`${location.id}/direction`]: value,
                  }))
                }
              />
              <details>
                <summary>Ray path and measurements</summary>
                <PathValues point={reviewed} />
                {reviewed?.issues.map((issue, index) => (
                  <p
                    className={
                      issue.severity === "error" ? "form-error" : "small-note"
                    }
                    key={`${issue.code}/${index}`}
                  >
                    {issue.message}
                  </p>
                ))}
              </details>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (pickingLocationId === location.id)
                    onCancelEntrancePick?.();
                  update({
                    locations: draft.locations.filter(
                      (point) => point.id !== location.id,
                    ),
                  });
                  setPending((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(
                        ([key]) => !key.startsWith(location.id + "/"),
                      ),
                    ),
                  );
                }}
              >
                <Trash2 size={13} />
                Remove {location.label}
              </button>
            </details>
          );
        })}
        <button
          type="button"
          className="button secondary"
          disabled={draft.locations.length >= 100}
          onClick={() => {
            try {
              const next = addFastenerLocation(draft);
              onLocationOpenChange(next.locations.at(-1)!.id, true);
              focusLocation(next.locations.at(-1)!.id);
              setDraft(next);
              setPreview(null);
              setError("");
            } catch (problem) {
              setError(errorText(problem));
            }
          }}
        >
          <Plus size={13} />
          Add screw location
        </button>
      </div>
      <details className="attachment-plan">
        <summary>User measurements · unknown values stay blank</summary>
        <OptionalLength
          label="Surface-to-tip depth after seating"
          value={draft.measurements.surfaceToTipDepth}
          onChange={(surfaceToTipDepth) =>
            update({
              measurements: { ...draft.measurements, surfaceToTipDepth },
            })
          }
        />
        <p className="small-note">
          Measure from the actual entry surface to the screw tip along the
          entered drive direction, after the chosen seating condition. Product
          length datums are reference information.
        </p>
        <OptionalLength
          label="User pilot diameter"
          value={draft.measurements.pilotDiameter}
          onChange={(pilotDiameter) =>
            update({ measurements: { ...draft.measurements, pilotDiameter } })
          }
        />
        <OptionalLength
          label="Deepest pilot drill-tip depth"
          value={draft.measurements.pilotDepth}
          onChange={(pilotDepth) =>
            update({ measurements: { ...draft.measurements, pilotDepth } })
          }
        />
        <p className="small-note">
          Pilot tip depth uses the same entry surface and drive direction.
          Record the deepest drill-tip reach; full-bore depth and collar
          settings are separate setup information.
        </p>
        <label className="field">
          User measurement basis
          <textarea
            aria-label="Fastener measurement basis"
            maxLength={1000}
            value={draft.measurements.basis}
            placeholder="Delivered screw, seating condition, surfaces, pilot tool and measurement method"
            onChange={(event) =>
              update({
                measurements: {
                  ...draft.measurements,
                  basis: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="field">
          Measurement date
          <input
            aria-label="Fastener measurement date"
            type="datetime-local"
            value={localDate(draft.measurements.measuredAt)}
            onChange={(event) =>
              update({
                measurements: {
                  ...draft.measurements,
                  measuredAt:
                    event.target.value &&
                    Number.isFinite(Date.parse(event.target.value))
                      ? new Date(event.target.value).toISOString()
                      : null,
                },
              })
            }
          />
        </label>
      </details>
      <label className="field">
        Plan notes
        <textarea
          aria-label="Fastener plan notes"
          value={draft.notes}
          maxLength={3000}
          onChange={(event) => update({ notes: event.target.value })}
        />
      </label>
      {context.review && (
        <div
          className="attachment-refresh-preview"
          aria-label="Fastener draft review"
        >
          <strong>{stateLabel[context.review.state]}</strong>
          <p className="small-note">
            {context.review.activePointCount} locations included in provisional
            screw demand. A reviewed centerline does not resolve head fit,
            pilots, edge distances, grain loading or connection capacity.
          </p>
          {context.review.issues.find(
            (issue) => issue.severity === "error",
          ) && (
            <p role="alert" className="form-error">
              {
                context.review.issues.find(
                  (issue) => issue.severity === "error",
                )!.message
              }
            </p>
          )}
          <details>
            <summary>Review issues ({context.review.issues.length})</summary>
            <ul>
              {context.review.issues.map((issue, index) => (
                <li className="small-note" key={`${issue.code}/${index}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <details className="attachment-plan">
        <summary>Review current part references</summary>
        <p className="small-note">
          Refresh only these same actual part IDs and the current product
          evidence. Local points are retained. Changed physical references
          archive the old measurements and clear the current measurements for a
          new path review; an unchanged reference keeps them. Use Replace actual
          members below for a different part.
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={!head || !receiver || pendingCount > 0 || productChanged}
          onClick={() => {
            try {
              const next = refreshFastenerPlan(project, draft),
                review = fastenerReviews(saveFastenerPlan(project, next)).find(
                  (item) => item.plan.id === draft.id,
                );
              if (!review)
                throw Error("The refreshed plan could not be reviewed.");
              setPreview({
                plan: next,
                review,
                token: workspaceToken(project),
                draftToken: JSON.stringify(draft),
              });
              setError("");
            } catch (problem) {
              setError(errorText(problem));
            }
          }}
        >
          <RefreshCw size={13} />
          Preview reference refresh
        </button>
        {preview && (
          <div
            className="attachment-refresh-preview"
            aria-label="Fastener reference refresh preview"
          >
            <strong>
              Current references · {stateLabel[preview.review.state]}
            </strong>
            <p className="small-note">
              Head: {head?.size.map(formatPreciseInches).join(" × ")}; position{" "}
              {coordinates(head?.position ?? null)} in.
              <br />
              Receiver: {receiver?.size.map(formatPreciseInches).join(" × ")};
              position {coordinates(receiver?.position ?? null)} in.
              <br />
              {preview.review.activePointCount} included locations after
              refresh.
            </p>
            <p className="small-note">
              {JSON.stringify(preview.plan.measurements) !==
              JSON.stringify(draft.measurements)
                ? "Previous measurements will be archived in reference history; current seating and pilot measurements reset to unknown."
                : "Current measurements are unchanged by this reference refresh."}
            </p>
            {preview.review.locations.map((point) => (
              <details key={point.location.id}>
                <summary>
                  {qualifiedFastenerLabel(preview.plan, point.location)} ·{" "}
                  {stateLabel[point.state]}
                </summary>
                <PathValues point={point} />
                {point.issues.map((issue, index) => (
                  <p className="small-note" key={`${issue.code}/${index}`}>
                    {issue.message}
                  </p>
                ))}
              </details>
            ))}
            <button
              type="button"
              className="button"
              onClick={() => {
                try {
                  if (
                    preview.token !== workspaceToken(project) ||
                    preview.draftToken !== JSON.stringify(draft)
                  )
                    throw Error(
                      "The parts or draft changed. Preview their references again before applying.",
                    );
                  onChange(saveFastenerPlan(project, preview.plan));
                  onCancelEntrancePick?.();
                } catch (problem) {
                  setError(errorText(problem));
                }
              }}
            >
              Apply reference refresh
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setPreview(null)}
            >
              Cancel refresh
            </button>
          </div>
        )}
      </details>
      <FastenerRemapping
        project={project}
        plan={plan}
        disabled={hasUnsavedChanges}
        onBeforeApply={() => {
          if (pickedEntrance) consumeEntrancePick(pickedEntrance.nonce);
          onCancelEntrancePick?.();
        }}
        onChange={onChange}
      />
      {hasUnsavedChanges && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onCancelEntrancePick?.();
            onDiscardDraft();
          }}
        >
          Discard unsaved fastener edits
        </button>
      )}
      <FastenerReferenceHistory project={project} plan={plan} />
      <FastenerRepeatPanel
        project={project}
        plan={plan}
        disabled={hasUnsavedChanges}
        onChange={onChange}
        onBeforeApply={() => {
          if (pickedEntrance) consumeEntrancePick(pickedEntrance.nonce);
          onCancelEntrancePick?.();
        }}
      />
      {(error || context.error) && (
        <p className="form-error" role="alert">
          {error || context.error}
        </p>
      )}
      {pendingCount > 0 && (
        <p className="form-error">
          Complete or clear partial entry points, and normalize or clear custom
          directions, before saving.
        </p>
      )}
      <button
        type="submit"
        className="button primary full"
        disabled={pendingCount > 0 || productChanged || !!context.error}
      >
        Save fastener plan
      </button>
    </form>
  );
}

export function FastenersPanel({
  project,
  onChange,
  onBack,
  backLabel = "Back to part",
  initialPair,
  selectedPieceId,
  selectedPlanId,
  onSelectPlan,
  onOpenTools,
  onRequestEntrancePick,
  onCancelEntrancePick,
  pickingLocationId,
  pickedEntrance,
  onLayoutPreview,
  onInspectLayout,
  onDriverPreview,
  focusedLocationId,
  onFocusLocation,
}: FastenersPanelProps) {
  const [editorVersion, setEditorVersion] = useState(0);
  const [locationDisclosures, setLocationDisclosures] = useState<
    Record<string, string[]>
  >({});
  const [localLocationFocus, setLocalLocationFocus] = useState<{
    projectId: string;
    planId: string;
    locationId: string | null;
  } | null>(null);
  const focusLocation = (locationId: string | null, planId: string) => {
    setLocalLocationFocus((previous) =>
      previous?.projectId === project.id &&
      previous.planId === planId &&
      previous.locationId === locationId
        ? previous
        : { projectId: project.id, planId, locationId },
    );
    onFocusLocation?.(locationId, planId);
  };
  useEffect(() => setLocationDisclosures({}), [project.id]);
  const seededPair = useRef<{ projectId: string; nonce: number | null }>({
    projectId: project.id,
    nonce: null,
  });
  const consumedPickNonce = useRef<number | null>(null);
  const consumeEntrancePick = (nonce: number) => {
    if (consumedPickNonce.current === nonce) return false;
    consumedPickNonce.current = nonce;
    return true;
  };
  const candidates = project.pieces.filter(
      (piece) => !piece.offcut && material(piece.material).wood,
    ),
    [localSelection, setLocalSelection] = useState<string | null>(null),
    [headId, setHeadId] = useState(""),
    [receiverId, setReceiverId] = useState(""),
    [productId, setProductId] =
      useState<FastenerPlan["productId"]>("grk-r4-103101"),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [centered, setCentered] = useState<{
      project: Project;
      plan: FastenerPlan;
    } | null>(null),
    [contactRow, setContactRow] = useState<{
      project: Project;
      preview: FastenerContactRowPreview;
    } | null>(null);
  const selectedPlan =
    selectedPlanId === undefined ? localSelection : selectedPlanId;
  const setSelectedPlan = (id: string | null) => {
    onCancelEntrancePick?.();
    setLocalSelection(id);
    onSelectPlan?.(id);
  };
  const centeredCurrent =
    centered?.project === project &&
    !selectedPlan &&
    centered.plan.head.pieceId === headId &&
    centered.plan.receiver.pieceId === receiverId &&
    centered.plan.productId === productId
      ? centered
      : null;
  const clearCentered = () => {
    if (!centered) return;
    onLayoutPreview?.(null);
    setCentered(null);
  };
  const contactCurrent =
    contactRow?.project === project &&
    !selectedPlan &&
    contactRow.preview.plan.head.pieceId === headId &&
    contactRow.preview.plan.receiver.pieceId === receiverId &&
    contactRow.preview.plan.productId === productId
      ? contactRow.preview
      : null;
  const clearContactRow = () => {
    if (!contactRow) return;
    onLayoutPreview?.(null);
    setContactRow(null);
  };
  useEffect(() => {
    if (centered && !centeredCurrent) clearCentered();
  }, [centered, centeredCurrent]);
  useEffect(() => {
    if (contactRow && !contactCurrent) clearContactRow();
  }, [contactRow, contactCurrent]);
  useEffect(() => {
    setHeadId(
      candidates.some((piece) => piece.id === selectedPieceId)
        ? selectedPieceId!
        : "",
    );
    setReceiverId("");
    setName("");
    setLocalSelection(null);
    setError("");
    setMessage("");
  }, [project.id, selectedPieceId]);
  useEffect(() => {
    if (seededPair.current.projectId !== project.id) {
      // A stale navigation seed must not replay against a newly opened project.
      seededPair.current = {
        projectId: project.id,
        nonce: initialPair?.nonce ?? null,
      };
      return;
    }
    if (!initialPair || seededPair.current.nonce === initialPair.nonce) return;
    seededPair.current.nonce = initialPair.nonce;
    if (selectedPlan !== null) return; // Existing-plan navigation takes precedence.
    onCancelEntrancePick?.();
    const eligible = (id: string) =>
      project.pieces.some(
        (part) =>
          part.id === id && !part.offcut && material(part.material).wood,
      );
    const validHead = eligible(initialPair.headId),
      validReceiver = eligible(initialPair.receiverId),
      distinct = initialPair.headId !== initialPair.receiverId;
    setHeadId(validHead && distinct ? initialPair.headId : "");
    setReceiverId(validReceiver && distinct ? initialPair.receiverId : "");
    setName("");
    setError(
      validHead && validReceiver && distinct
        ? ""
        : "The selected pair changed. Choose two distinct actual active wood members again.",
    );
    setMessage(
      validHead && validReceiver && distinct
        ? "Pair selected for an unsaved draft. Review the entry side and product; nothing has been added."
        : "",
    );
  }, [project.id, initialPair?.nonce, selectedPlan]);
  const context = useMemo(() => {
      try {
        return {
          reviews: fastenerReviews(project),
          purchases: fastenerPurchaseSummary(project),
          error: "",
        };
      } catch (problem) {
        return { reviews: [], purchases: null, error: errorText(problem) };
      }
    }, [project]),
    purchaseRows =
      context.purchases?.products.filter(
        (product) =>
          product.plannedScrews ||
          product.selectedPacks ||
          product.excludedLocations,
      ) ?? [],
    validPair =
      !!headId &&
      !!receiverId &&
      headId !== receiverId &&
      candidates.some((piece) => piece.id === headId) &&
      candidates.some((piece) => piece.id === receiverId),
    optionText = (id: string) => {
      const piece = candidates.find((part) => part.id === id)!;
      return `${partLabel(project, id)} · ${piece.name} · ${piece.size.map(formatPreciseInches).join(" × ")}`;
    };
  const planOptions = () => ({
    productId,
    name:
      name.trim() ||
      `Wood screws · ${partLabel(project, headId)} ↔ ${partLabel(project, receiverId)}`,
  });
  const createPlan = (kind: "centered" | "row" | null) => {
    setError("");
    try {
      if (!validPair) throw Error("Choose two distinct active wood members.");
      const preview =
        kind === "centered"
          ? centeredCurrent?.plan
          : kind === "row"
            ? contactCurrent?.plan
            : undefined;
      if (kind && !preview)
        throw Error("The pair or product changed. Preview the entries again.");
      const plan = preview
        ? { ...preview, name: planOptions().name }
        : makeFastenerPlan(project, headId, receiverId, planOptions());
      onChange(saveFastenerPlan(project, plan));
      clearCentered();
      clearContactRow();
      setSelectedPlan(plan.id);
      if (kind) focusLocation(plan.locations[0].id, plan.id);
      setMessage(
        kind
          ? `Added ${kind === "centered" ? "the centered entry" : "the screw row"}. Enter the seating depth and review the pilot for this joint.`
          : "Created an empty plan. Add the actual screw locations and measurements.",
      );
    } catch (problem) {
      setError(errorText(problem));
    }
  };
  const showCentered = (proposal: ReturnType<typeof suggestCenteredFastener>) => {
    setError("");
    setMessage("");
    clearContactRow();
    setHeadId(proposal.plan.head.pieceId);
    setReceiverId(proposal.plan.receiver.pieceId);
    setCentered({ project, plan: proposal.plan });
    onLayoutPreview?.({
      kind: "centered-entry",
      review: { ...proposal.review, plan: proposal.plan },
      seedLocationId: proposal.plan.locations[0].id,
      candidateIds: [],
      selectedCandidateIds: [],
    });
  };
  const previewCentered = () => {
    try {
      showCentered(suggestCenteredFastener(
        project,
        headId,
        receiverId,
        planOptions(),
      ));
    } catch (problem) {
      setMessage("");
      clearContactRow();
      setError(errorText(problem));
    }
  };
  const previewContact = (
    inputs: Parameters<typeof previewFastenerContactRow>[3],
  ) => {
    setError("");
    setMessage("");
    clearCentered();
    clearContactRow();
    try {
      const preview = previewFastenerContactRow(
        project,
        headId,
        receiverId,
        inputs,
        planOptions(),
      );
      const ids = preview.plan.locations.map(({ id }) => id);
      setContactRow({ project, preview });
      onLayoutPreview?.({
        kind: "contact-row",
        review: preview.review,
        seedLocationId: ids[0],
        candidateIds: ids,
        selectedCandidateIds: ids,
      });
    } catch (problem) {
      setError(errorText(problem));
    }
  };
  return (
    <section
      className="attachments-panel fasteners-panel"
      aria-label="Wood fastener plans"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <button
        type="button"
        className="text-button"
        onClick={() => {
          onCancelEntrancePick?.();
          onBack();
        }}
      >
        <ArrowLeft size={13} />
        {backLabel}
      </button>
      <span className="eyebrow" style={{ display: "block", marginTop: 18 }}>
        PLANNED WOOD SCREWS
      </span>
      <h2>Plan a fastener path.</h2>
      <p className="small-note">
        Choose the entry-side and receiving wood members. Preview a centered
        entry where their faces meet, or place each entry yourself.
      </p>
      <p className="small-note">
        W/F labels identify the saved plan and its location. Orange dashed lines
        end only at a user-depth candidate tip; a direction-only arrow has no
        physical length. Red marks need review.
      </p>
      <details
        className="attachment-plan"
        open={
          context.reviews.length === 0 ||
          (!!initialPair && selectedPlan === null)
        }
      >
        <summary>New wood-screw plan</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!centeredCurrent && !contactCurrent) createPlan(null);
          }}
        >
          {headId && receiverId && (
            <div className="field-section" data-testid="fastener-draft-pair">
              <p className="small-note">
                Entry side <strong>{partLabel(project, headId)}</strong> →
                receiving wood <strong>{partLabel(project, receiverId)}</strong>
                . Review or change this order before creating a plan.
              </p>
              <button
                type="button"
                className="button secondary small"
                onClick={() => {
                  onCancelEntrancePick?.();
                  setHeadId(receiverId);
                  setReceiverId(headId);
                }}
              >
                Swap entry and receiver
              </button>
            </div>
          )}
          <label className="field">
            Head-side member
            <select
              aria-label="Fastener head-side member"
              value={headId}
              onChange={(event) => {
                setHeadId(event.target.value);
                if (receiverId === event.target.value) setReceiverId("");
              }}
            >
              <option value="">Choose the entry-side wood part</option>
              {candidates.map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {optionText(piece.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Receiving member
            <select
              aria-label="Fastener receiving member"
              value={receiverId}
              onChange={(event) => setReceiverId(event.target.value)}
            >
              <option value="">Choose the receiving wood part</option>
              {candidates
                .filter((piece) => piece.id !== headId)
                .map((piece) => (
                  <option key={piece.id} value={piece.id}>
                    {optionText(piece.id)}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Screw product
            <select
              aria-label="New screw product"
              value={productId}
              onChange={(event) =>
                setProductId(event.target.value as FastenerPlan["productId"])
              }
            >
              {woodFastenerProducts.map((product) => (
                <option key={product.productId} value={product.productId}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Plan name
            <input
              aria-label="New fastener plan name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="For example, base-to-rail screw locations"
            />
          </label>
          {centeredCurrent ? (
            <section
              className="field-section fastener-centered-preview"
              aria-label="Centered entry preview"
            >
              <p className="small-note">
                A centered direction through the joint. Verify spacing, tool
                access and the actual screw and pilot depths.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => createPlan("centered")}
                >
                  Use centered entry
                </button>
                {onInspectLayout && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={onInspectLayout}
                  >
                    View entry in 3D
                  </button>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={clearCentered}
                >
                  Cancel entry preview
                </button>
              </div>
            </section>
          ) : (
            <div className="button-row">
              <button
                type="submit"
                className="button secondary"
                disabled={!validPair || !!contactCurrent}
              >
                <Plus size={13} />
                Create fastener plan
              </button>
              {validPair && !selectedPlan && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={previewCentered}
                >
                  Preview centered entry
                </button>
              )}
            </div>
          )}
          {validPair && !selectedPlan && !centeredCurrent && !contactCurrent && (
            <FastenerEntryComparison
              key={initialPair?.nonce}
              project={project}
              headId={headId}
              receiverId={receiverId}
              productId={productId}
              initiallyOpen={initialPair?.compareSides}
              onPreview={showCentered}
            />
          )}
          {validPair && !selectedPlan && !centeredCurrent && (
            <FastenerContactRowFields
              preview={contactCurrent}
              onPreview={previewContact}
              onUse={() => createPlan("row")}
              onClear={clearContactRow}
              onInspect={onInspectLayout}
            />
          )}
        </form>
      </details>
      {!candidates.length && (
        <p className="small-note">
          Place actual wood members before creating a fastener plan.
        </p>
      )}
      {(error || context.error) && (
        <p role="alert" className="form-error">
          {error || context.error}
        </p>
      )}
      {message && (
        <p role="status" className="small-note">
          {message}
        </p>
      )}
      {context.reviews.map((review) => (
        <section
          className="attachment-plan"
          key={review.plan.id}
          data-fastener-plan-id={review.plan.id}
        >
          <button
            type="button"
            className="text-button attachment-plan-select"
            aria-expanded={selectedPlan === review.plan.id}
            onClick={() =>
              setSelectedPlan(
                selectedPlan === review.plan.id ? null : review.plan.id,
              )
            }
          >
            <strong>
              {review.plan.label} · {review.plan.name}
            </strong>
            <span>
              {review.plan.locations.length} locations ·{" "}
              {stateLabel[review.state]}
            </span>
          </button>
          {selectedPlan === review.plan.id && (
            <>
              <PlanEditor
                key={`${review.plan.id}/${review.plan.updatedAt}/${review.plan.head.pieceId}/${review.plan.receiver.pieceId}/${review.plan.referenceHistory.length}/${editorVersion}`}
                project={project}
                plan={review.plan}
                onRequestEntrancePick={onRequestEntrancePick}
                onCancelEntrancePick={onCancelEntrancePick}
                pickingLocationId={pickingLocationId}
                pickedEntrance={pickedEntrance}
                onLayoutPreview={onLayoutPreview}
                onInspectLayout={onInspectLayout}
                onDriverPreview={onDriverPreview}
                focusedLocationId={
                  focusedLocationId === undefined
                    ? localLocationFocus?.projectId === project.id &&
                      localLocationFocus.planId === review.plan.id
                      ? localLocationFocus.locationId
                      : null
                    : focusedLocationId
                }
                onFocusLocation={focusLocation}
                openLocationIds={
                  locationDisclosures[review.plan.id] ??
                  review.plan.locations
                    .slice(0, 1)
                    .map((location) => location.id)
                }
                onLocationOpenChange={(id, open) =>
                  setLocationDisclosures((current) => {
                    const previous =
                      current[review.plan.id] ??
                      review.plan.locations
                        .slice(0, 1)
                        .map((location) => location.id);
                    if (previous.includes(id) === open) return current;
                    return {
                      ...current,
                      [review.plan.id]: open
                        ? [...previous, id]
                        : previous.filter((value) => value !== id),
                    };
                  })
                }
                consumeEntrancePick={consumeEntrancePick}
                onDiscardDraft={() =>
                  setEditorVersion((current) => current + 1)
                }
                onChange={(next) => {
                  onChange(next);
                  setMessage(
                    "Saved fastener intent and user measurements. Installation and capacity remain under review.",
                  );
                }}
              />
              <button
                type="button"
                className="text-button"
                style={{ marginTop: 16 }}
                onClick={() => {
                  onChange(removeFastenerPlan(project, review.plan.id));
                  setSelectedPlan(null);
                  setMessage("Removed the fastener plan.");
                }}
              >
                <Trash2 size={13} />
                Remove fastener plan
              </button>
            </>
          )}
        </section>
      ))}
      {context.purchases && (
        <details className="attachment-purchases fastener-purchases" open>
          <summary>Fastener purchase comparison</summary>
          {!purchaseRows.length && (
            <p className="small-note">
              No saved explicit screw locations or purchase boxes are selected.
            </p>
          )}
          {purchaseRows.map((row) => (
            <div
              className="attachment-plan"
              key={row.productId}
              data-fastener-product-id={row.productId}
            >
              <strong>{row.productName}</strong>
              <p>
                {row.plannedScrews} included screw locations · Required boxes:{" "}
                {row.requiredPacks} · Selected boxes: {row.selectedPacks} ·
                Missing boxes: {row.shortfallPacks}.
              </p>
              <p className="small-note">
                {row.excludedLocations} locations excluded while stale or
                conflicting. Each box has {row.packCount} screws;{" "}
                {row.spareScrews} selected-pack screws remain unallocated.
                Purchase records do not establish on-hand stock or installation.
              </p>
              <details>
                <summary>Demand by saved plan</summary>
                {row.planRows.map((plan) => (
                  <p className="small-note" key={plan.planId}>
                    {
                      project.fastenerPlans.find(
                        (item) => item.id === plan.planId,
                      )?.label
                    }{" "}
                    · {plan.name} · {plan.included} included / {plan.excluded}{" "}
                    excluded · {stateLabel[plan.state]}
                  </p>
                ))}
              </details>
              <p className="small-note">
                {row.referenceOffers.map((offer) => (
                  <span key={`${offer.retailer}/${offer.productId}`}>
                    <a href={offer.url} target="_blank" rel="noreferrer">
                      {offer.retailer === "lowes" ? "Lowe's" : "Home Depot"}{" "}
                      reference {offer.productId}
                    </a>
                    {" · "}
                  </span>
                ))}
              </p>
              {!row.retailerSupported && (
                <p className="small-note">
                  No reviewed offer for this exact box is available for the
                  selected retailer.
                </p>
              )}
              <button
                type="button"
                className="button secondary"
                aria-label={`Add missing packs for ${row.productName}`}
                disabled={!row.canAddMissing}
                onClick={() => {
                  try {
                    onChange(addMissingFastenerPacks(project, row.productId));
                    setMessage(
                      "Added only the missing complete purchase boxes.",
                    );
                    setError("");
                  } catch (problem) {
                    setError(errorText(problem));
                  }
                }}
              >
                Add {row.shortfallPacks} missing {row.packCount}-screw{" "}
                {row.shortfallPacks === 1 ? "box" : "boxes"}
              </button>
            </div>
          ))}
          {context.purchases.warnings
            .filter((warning) => /legacy pairwise/i.test(warning))
            .map((warning) => (
              <p className="form-error" key={warning}>
                {warning}
              </p>
            ))}
          {context.purchases.warnings.length > 0 && (
            <details>
              <summary>Purchase review notes</summary>
              <ul>
                {context.purchases.warnings.map((warning) => (
                  <li className="small-note" key={warning}>
                    {warning}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </details>
      )}
      {onOpenTools && (
        <button
          type="button"
          className="text-button"
          style={{ marginTop: 16 }}
          onClick={onOpenTools}
        >
          <Wrench size={13} />
          Review drill and driver tools
        </button>
      )}
    </section>
  );
}
