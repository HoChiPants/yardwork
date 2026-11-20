import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, RefreshCw, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import {
  connectorPlanSchema,
  type ConnectorEntry,
  type ConnectorPlan,
} from "./connectorSchema";
import {
  changeConnectorSchedule,
  connectorReviews,
  makeConnectorPlan,
  refreshConnectorPlan,
  removeConnectorPlan,
  saveConnectorPlan,
  type ConnectorReview,
  type ReviewedConnectorEntry,
} from "./connectors";
import { getConnectorProduct, getConnectorSchedule } from "./connectorProducts";
import { connectorPurchaseSummary } from "./connectorPurchases";

export type ConnectorEntrancePickTarget = {
  planId: string;
  entryId: string;
  memberId: string;
};
export type PickedConnectorEntrance = {
  planId: string;
  entryId: string;
  entranceLocal: V3;
  driveLocal: V3;
  nonce: number;
};
export type ConnectorsPanelProps = {
  project: Project;
  onChange: (project: Project) => void;
  onBack: () => void;
  backLabel?: string;
  selectedPieceId?: string | null;
  selectedPlanId?: string | null;
  onSelectPlan?: (id: string | null) => void;
  initialPair?: { baseId: string; postId: string; nonce: number };
  onInspectPiece?: (id: string) => void;
  onOpenSupplies?: () => void;
  onOpenTools?: () => void;
  onRequestEntrancePick?: (target: ConnectorEntrancePickTarget) => void;
  onCancelEntrancePick?: () => void;
  pickingEntryId?: string | null;
  pickedEntrance?: PickedConnectorEntrance | null;
  onPreview?: (review: ConnectorReview | null) => void;
  onFocusEntry?: (entryId: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
};
const stateText = {
  stale: "References changed · review needed",
  conflict: "Entry or reference conflict",
  "needs-measurements": "Measurements pending",
  "paths-reviewed": "Wood centerlines reviewed · mounting fit pending",
  "path-reviewed": "Wood centerline reviewed · mounting fit pending",
};
const errorText = (error: unknown) =>
  error instanceof ZodError
    ? (error.issues[0]?.message ?? "Review the entered fields.")
    : error instanceof Error
      ? error.message
      : "The connector plan could not be saved.";
const dimension = (value: number | null | undefined) =>
  value == null ? "Unknown" : formatPreciseInches(value);
const coordinates = (value: V3 | null) =>
  value ? value.map((n) => formatPreciseInches(n)).join(", ") : "Unknown";
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const eligibleMembers = (project: Project) =>
  project.pieces.filter((piece) => {
    const stock = material(piece.material);
    return !piece.offcut && stock.wood && stock.stockKind === "linear";
  });

const measurementLabels: Record<string, string> = {
  woodEntryToTipDepth: "wood-entry-to-tip depth",
  pilotDiameter: "pilot diameter",
  pilotDepth: "deepest pilot-drill-tip depth",
  entry: "wood-entry coordinates",
  drive: "inward direction",
};

/** A typed or imported draft is not evidence until its complete schema is valid. */
export function reviewConnectorDraft(
  project: Project,
  draft: ConnectorPlan,
  pendingFields: readonly string[] = [],
): {
  review: ConnectorReview | undefined;
  error: string | null;
} {
  if (pendingFields.length) {
    const [entryId, field] = pendingFields[0].split("/"),
      entry = draft.entries.find((row) => row.id === entryId);
    return {
      review: undefined,
      error: `Finish ${entry?.label ?? "the entry"} ${measurementLabels[field] ?? "input"}, or clear it to leave it unknown.`,
    };
  }
  const parsed = connectorPlanSchema.safeParse(draft);
  if (!parsed.success) {
    const issue = parsed.error.issues[0],
      index =
        issue.path[0] === "entries" && typeof issue.path[1] === "number"
          ? issue.path[1]
          : null,
      entry = index === null ? null : draft.entries[index],
      field = String(issue.path.at(-1) ?? ""),
      name = entry
        ? `${entry.label} ${measurementLabels[field] ?? (field === "measurements" ? "measurement basis/date" : field)}`
        : "Connector draft";
    return { review: undefined, error: `${name}: ${issue.message}` };
  }
  try {
    return {
      review: connectorReviews({
        ...project,
        connectorPlans: [
          ...project.connectorPlans.filter((plan) => plan.id !== draft.id),
          parsed.data,
        ],
      }).find((row) => row.plan.id === draft.id),
      error: null,
    };
  } catch (error) {
    return { review: undefined, error: errorText(error) };
  }
}

/** Incomplete number strings remain input drafts, rather than invented numeric zeroes. */
export function parseConnectorLengthInput(
  text: string,
  scale = 1,
  badInput = false,
): { value: number | null; pending: boolean } {
  if (!text.trim()) return { value: null, pending: badInput };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()))
    return { value: null, pending: true };
  const value = Number(text) * scale;
  return {
    value: Number.isFinite(value) ? value : null,
    pending: !Number.isFinite(value) || badInput,
  };
}

/** Nullable input with its own unit choice. Unit changes never round the canonical value. */
export function ConnectorLengthInput({
  label,
  value,
  onChange,
  onPending,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onPending?: (pending: boolean) => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1,
    [text, setText] = useState(value === null ? "" : String(value)),
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
          aria-label={label}
          type="number"
          step="any"
          min={0}
          max={12 / scale}
          aria-invalid={
            value !== null &&
            (!Number.isFinite(value) || value <= 0 || value > 12)
          }
          placeholder="Unknown"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const next = parseConnectorLengthInput(
              event.target.value,
              scale,
              event.currentTarget.validity.badInput,
            );
            emitted.current = next.value;
            onPending?.(next.pending);
            onChange(next.value);
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
            onPending?.(false);
          }}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </div>
    </label>
  );
}

/** Partial input stays pending; editing Y never re-parses rounded X or Z. */
function EntryVector({
  label,
  value,
  direction = false,
  onChange,
  onPending,
}: {
  label: string;
  value: V3 | null;
  direction?: boolean;
  onChange: (value: V3 | null) => void;
  onPending: (pending: boolean) => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    factor = direction || unit === "in" ? 1 : 12,
    [texts, setTexts] = useState(value ? value.map(String) : ["", "", ""]),
    axes = useRef<(number | null)[]>(value ? [...value] : [null, null, null]),
    emitted = useRef(JSON.stringify(value)),
    serialized = JSON.stringify(value),
    [error, setError] = useState("");
  useEffect(() => {
    if (serialized !== emitted.current) {
      emitted.current = serialized;
      axes.current = value ? [...value] : [null, null, null];
      setTexts(axes.current.map((n) => (n === null ? "" : String(n / factor))));
      setError("");
    }
  }, [serialized, factor]);
  const emit = (next: V3 | null) => {
    emitted.current = JSON.stringify(next);
    onChange(next);
  };
  const choose = (next: V3 | null) => {
    axes.current = next ? [...next] : [null, null, null];
    setTexts(axes.current.map((n) => (n === null ? "" : String(n / factor))));
    onPending(false);
    emit(next);
    setError("");
  };
  return (
    <fieldset className="connector-vector">
      <legend>{label}</legend>
      <div className="connector-coordinate-grid">
        {["X", "Y", "Z"].map((axis, index) => (
          <label className="field" key={axis}>
            {axis}
            <input
              aria-label={`${label} ${axis}`}
              type="number"
              step="any"
              value={texts[index]}
              placeholder="Unknown"
              onChange={(event) => {
                const next = texts.map((text, i) =>
                  i === index ? event.target.value : text,
                );
                setTexts(next);
                axes.current[index] = event.target.value.trim()
                  ? Number(event.target.value) * factor
                  : null;
                const any =
                    next.some((text) => text.trim()) ||
                    event.currentTarget.validity.badInput,
                  complete = axes.current.every(
                    (n) => n !== null && Number.isFinite(n),
                  );
                onPending(any && (direction || !complete));
                emit(!direction && complete ? ([...axes.current] as V3) : null);
                setError("");
              }}
            />
          </label>
        ))}
      </div>
      {direction ? (
        <>
          <div className="connector-actions">
            {([0, 1, 2] as const).flatMap((axis) =>
              ([-1, 1] as const).map((sign) => (
                <button
                  type="button"
                  className="button secondary small"
                  key={`${axis}/${sign}`}
                  aria-label={`${label} local ${["X", "Y", "Z"][axis]} ${sign > 0 ? "positive" : "negative"}`}
                  onClick={() => {
                    const next: V3 = [0, 0, 0];
                    next[axis] = sign;
                    choose(next);
                  }}
                >
                  {["X", "Y", "Z"][axis]}
                  {sign > 0 ? "+" : "−"}
                </button>
              )),
            )}
          </div>
          <button
            type="button"
            className="text-button"
            disabled={axes.current.some((n) => n === null)}
            onClick={() => {
              const raw = axes.current as V3,
                length = Math.hypot(...raw);
              if (!Number.isFinite(length) || length < 1e-12) {
                setError("Enter a nonzero direction.");
                return;
              }
              choose(raw.map((n) => n / length) as V3);
            }}
          >
            Normalize {label.toLowerCase()}
          </button>
        </>
      ) : (
        <label className="field">
          Coordinate units
          <select
            aria-label={`${label} units`}
            value={unit}
            onChange={(event) => {
              const next = event.target.value as "in" | "ft";
              setTexts(
                axes.current.map((n) =>
                  n === null ? "" : String(n / (next === "ft" ? 12 : 1)),
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
      {texts.some((text) => text.trim()) && (
        <button
          type="button"
          className="text-button"
          onClick={() => choose(null)}
        >
          Clear {label.toLowerCase()}
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Original schematic of named dimensions, deliberately not a manufactured outline. */
export function ConnectorDimensionGuide() {
  const product = getConnectorProduct("simpson-a21z");
  return (
    <figure className="connector-dimension-guide">
      <svg
        viewBox="0 0 260 116"
        role="img"
        aria-label="A21Z named nominal dimensions: W1 2 inches, W2 1.5 inches, L 1.375 inches"
      >
        <title>
          Named dimensions only; no hole pattern, bend or exact envelope
        </title>
        <path
          d="M30 89H218M30 56H153M30 23H183"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M30 83V95M218 83V95M30 50V62M153 50V62M30 17V29M183 17V29"
          stroke="currentColor"
        />
        <text x="32" y="15">
          W1 · 2 in
        </text>
        <text x="32" y="48">
          W2 · 1.5 in
        </text>
        <text x="32" y="81">
          L · 1.375 in
        </text>
      </svg>
      <figcaption>
        Nominal dimension guide · 18 gauge · ZMAX. Separate named dimensions,
        not a scale drawing or installed envelope.
        {product && (
          <>
            {" "}
            <a href={product.sources[0].url} target="_blank" rel="noreferrer">
              Manufacturer reference
            </a>
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function ConnectorReferenceDetails({ plan }: { plan: ConnectorPlan }) {
  const product = getConnectorProduct(plan.productId),
    schedule = getConnectorSchedule(plan.scheduleId);
  if (!product || !schedule) return null;
  return (
    <details className="field-section connector-references">
      <summary>A21Z dimensions and source references</summary>
      <ConnectorDimensionGuide />
      <p>
        {schedule.fastenerName} · nominal {dimension(schedule.nominalLength)}{" "}
        purchase label. Wood-entry depth stays independently measured.
      </p>
      <p className="small-note">
        Metal contact, bend, hole centers and delivered fit remain pending. The
        four entry slots represent quantity, not an installed hole pattern.
      </p>
      <ul>
        {[...product.conflicts, ...product.unknowns].map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {[
        ...new Map(
          [...product.sources, ...schedule.sources].map((source) => [
            source.url,
            source,
          ]),
        ).values(),
      ].map((source) => (
        <p className="small-note" key={source.url}>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.scope}
          </a>
          <br />
          {source.revision} · reviewed {source.reviewedAt.slice(0, 10)}
          <br />
          {source.note}
        </p>
      ))}
    </details>
  );
}

function ReferenceHistory({ plan }: { plan: ConnectorPlan }) {
  if (!plan.referenceHistory.length) return null;
  return (
    <details className="field-section connector-history">
      <summary>
        Earlier reference records · {plan.referenceHistory.length}
      </summary>
      <p className="small-note">
        Historical events retained across Undo. An event does not necessarily
        describe the current references.
      </p>
      {plan.referenceHistory.map((event) => (
        <details key={event.id}>
          <summary>
            {event.kind === "schedule"
              ? "Schedule change"
              : "Reference refresh"}{" "}
            · {event.at}
          </summary>
          <p>{event.basis}</p>
          <p>
            Previous schedule:{" "}
            {getConnectorSchedule(event.previous.scheduleId)?.name ??
              event.previous.scheduleId}
          </p>
          {event.previous.entries.map((entry) => (
            <p className="small-note" key={entry.id}>
              {plan.label}/{entry.label} · {entry.role} · earlier entry{" "}
              {coordinates(entry.entranceLocal)}
              <br />
              Earlier wood-entry-to-tip:{" "}
              {dimension(entry.measurements.woodEntryToTipDepth)} · pilot
              diameter: {dimension(entry.measurements.pilotDiameter)} · deepest
              pilot-drill-tip: {dimension(entry.measurements.pilotDepth)}
              <br />
              {entry.measurements.basis || "No measurement basis"} ·{" "}
              {entry.measurements.measuredAt || "Date unknown"}
            </p>
          ))}
        </details>
      ))}
    </details>
  );
}

function EntryReview({ point }: { point: ReviewedConnectorEntry | undefined }) {
  if (!point) return null;
  return (
    <div className="connector-path-review" data-entry-state={point.state}>
      <p>
        <strong>{stateText[point.state]}</strong>
      </p>
      <dl className="connector-datums">
        <dt>World wood entry</dt>
        <dd>{coordinates(point.entranceWorld)}</dd>
        <dt>Available wood on ray</dt>
        <dd>{dimension(point.availableWoodDepth)}</dd>
        <dt>User-depth candidate tip</dt>
        <dd>{coordinates(point.tipWorld)}</dd>
        <dt>Deepest pilot-tip candidate</dt>
        <dd>{coordinates(point.pilotTipWorld)}</dd>
      </dl>
      {!!point.issues.length && (
        <ul className="small-note">
          {point.issues.map((issue, i) => (
            <li key={`${issue.code}/${i}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConnectorsPanel(props: ConnectorsPanelProps) {
  const { project } = props,
    members = eligibleMembers(project),
    [baseId, setBaseId] = useState(
      props.initialPair?.baseId ??
        (members.some((p) => p.id === props.selectedPieceId)
          ? props.selectedPieceId!
          : ""),
    ),
    [postId, setPostId] = useState(props.initialPair?.postId ?? ""),
    [scheduleId, setScheduleId] =
      useState<ConnectorPlan["scheduleId"]>("sd9112"),
    [draft, setDraft] = useState<ConnectorPlan | null>(
      () =>
        project.connectorPlans.find((p) => p.id === props.selectedPlanId) ??
        null,
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [fieldEpoch, setFieldEpoch] = useState(0),
    [pending, setPending] = useState<Record<string, boolean>>({}),
    [openEntries, setOpenEntries] = useState<string[]>(
      () =>
        project.connectorPlans
          .find((p) => p.id === props.selectedPlanId)
          ?.entries.slice(0, 1)
          .map((e) => e.id) ?? [],
    ),
    [scheduleChoice, setScheduleChoice] = useState<ConnectorPlan["scheduleId"]>(
      draft?.scheduleId ?? "sd9112",
    ),
    consumedPair = useRef(props.initialPair?.nonce),
    consumedPick = useRef(0),
    previousProject = useRef(project.id),
    selectedProp = useRef(props.selectedPlanId),
    saved = draft
      ? project.connectorPlans.find((plan) => plan.id === draft.id)
      : undefined,
    dirty =
      !!draft &&
      (JSON.stringify(draft) !== JSON.stringify(saved) ||
        Object.values(pending).some(Boolean));
  const pick = props.pickedEntrance;
  useEffect(() => {
    if (previousProject.current === project.id) return;
    previousProject.current = project.id;
    setDraft(null);
    setPending({});
    setError("");
    setNotice("");
    consumedPick.current = pick?.nonce ?? consumedPick.current;
    props.onCancelEntrancePick?.();
  }, [project.id]);
  useEffect(() => {
    if (!props.initialPair || props.initialPair.nonce === consumedPair.current)
      return;
    consumedPair.current = props.initialPair.nonce;
    setBaseId(props.initialPair.baseId);
    setPostId(props.initialPair.postId);
  }, [props.initialPair]);
  useEffect(() => {
    if (selectedProp.current === props.selectedPlanId) return;
    selectedProp.current = props.selectedPlanId;
    const next = project.connectorPlans.find(
      (plan) => plan.id === props.selectedPlanId,
    );
    if (next && !dirty) {
      setDraft(next);
      setScheduleChoice(next.scheduleId);
      setPending({});
      setOpenEntries(next.entries.slice(0, 1).map((e) => e.id));
    }
  }, [props.selectedPlanId, project.connectorPlans, dirty]);
  useEffect(() => {
    if (!pick || pick.nonce <= consumedPick.current) return;
    consumedPick.current = pick.nonce;
    if (
      !draft ||
      pick.planId !== draft.id ||
      !draft.entries.some((entry) => entry.id === pick.entryId)
    )
      return;
    setDraft((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry) =>
              entry.id === pick.entryId
                ? {
                    ...entry,
                    entranceLocal: pick.entranceLocal,
                    driveLocal: pick.driveLocal,
                  }
                : entry,
            ),
          }
        : null,
    );
    setPending((current) => ({
      ...current,
      [`${pick.entryId}/entry`]: false,
      [`${pick.entryId}/drive`]: false,
    }));
    setOpenEntries((current) => [...new Set([...current, pick.entryId])]);
  }, [pick, draft?.id]);
  useEffect(
    () => () => {
      props.onCancelEntrancePick?.();
      props.onPreview?.(null);
      props.onDirtyChange?.(false);
    },
    [],
  );
  useEffect(() => {
    props.onDirtyChange?.(dirty);
  }, [dirty, props.onDirtyChange]);
  const draftReview = useMemo(
      () =>
        draft
          ? reviewConnectorDraft(
              project,
              draft,
              Object.entries(pending)
                .filter(([, value]) => value)
                .map(([key]) => key),
            )
          : { review: undefined, error: null },
      [project, draft, pending],
    ),
    review = draftReview.review;
  useEffect(() => {
    props.onPreview?.(review ?? null);
  }, [review, props.onPreview]);
  const execute = (operation: () => void) => {
    try {
      operation();
      setError("");
    } catch (problem) {
      setError(errorText(problem));
    }
  };
  const editEntry = (
    id: string,
    update: (entry: ConnectorEntry) => ConnectorEntry,
  ) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry) =>
              entry.id === id ? update(entry) : entry,
            ),
          }
        : null,
    );
  const selectPlan = (plan: ConnectorPlan) => {
    if (dirty && draft?.id !== plan.id) {
      setError(
        "Save or discard the current draft before opening another plan.",
      );
      return;
    }
    props.onCancelEntrancePick?.();
    consumedPick.current = pick?.nonce ?? consumedPick.current;
    setDraft(plan);
    setScheduleChoice(plan.scheduleId);
    setPending({});
    setFieldEpoch((n) => n + 1);
    setOpenEntries(plan.entries.slice(0, 1).map((e) => e.id));
    setError("");
    setNotice("");
    props.onSelectPlan?.(plan.id);
  };
  return (
    <section className="connectors-panel" aria-label="A21Z connector plans">
      <button
        type="button"
        className="text-button"
        disabled={dirty}
        onClick={() => {
          props.onCancelEntrancePick?.();
          props.onBack();
        }}
      >
        <ArrowLeft size={15} /> {props.backLabel ?? "Back to part"}
      </button>
      <h2>A21Z connector plans</h2>
      <p className="small-note">
        One angle on two actual wood members. Enter wood fastening paths
        separately from the pending metal mounting fit.
      </p>
      {!!project.connectorPlans.length && (
        <div className="connector-plan-list">
          {project.connectorPlans.map((plan) => (
            <button
              type="button"
              key={plan.id}
              className="attachment-plan-select"
              aria-expanded={draft?.id === plan.id}
              data-plan-id={plan.id}
              onClick={() => selectPlan(plan)}
            >
              <strong>{plan.label}</strong>
              <span>{plan.name}<small>{getConnectorSchedule(plan.scheduleId)?.name}</small></span>
            </button>
          ))}
        </div>
      )}
      <details className="field-section" open={!draft}>
        <summary>New connector plan</summary>
        <label className="field">
          Base member
          <select
            aria-label="Connector base member"
            value={baseId}
            onChange={(event) => setBaseId(event.target.value)}
          >
            <option value="">Choose actual wood member</option>
            {members.map((piece) => (
              <option value={piece.id} key={piece.id}>
                {partLabel(project, piece.id)} · {piece.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Post member
          <select
            aria-label="Connector post member"
            value={postId}
            onChange={(event) => setPostId(event.target.value)}
          >
            <option value="">Choose actual wood member</option>
            {members.map((piece) => (
              <option value={piece.id} key={piece.id}>
                {partLabel(project, piece.id)} · {piece.name}
              </option>
            ))}
          </select>
        </label>
        <div className="connector-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setBaseId(postId);
              setPostId(baseId);
            }}
          >
            Swap base and post
          </button>
        </div>
        <label className="field">
          Complete reference schedule
          <select
            aria-label="New connector schedule"
            value={scheduleId}
            onChange={(event) =>
              setScheduleId(event.target.value as ConnectorPlan["scheduleId"])
            }
          >
            <option value="sd9112">SD9112 screws · 2 base + 2 post</option>
            <option value="n10dhdg">N10DHDG-R nails · 2 base + 2 post</option>
          </select>
        </label>
        <button
          type="button"
          className="button"
          disabled={!baseId || !postId || baseId === postId || dirty}
          onClick={() =>
            execute(() => {
              props.onCancelEntrancePick?.();
              consumedPick.current = pick?.nonce ?? consumedPick.current;
              const next = makeConnectorPlan(project, baseId, postId, {
                scheduleId,
              });
              setDraft(next);
              setScheduleChoice(next.scheduleId);
              setPending({});
              setFieldEpoch((n) => n + 1);
              setOpenEntries(next.entries.slice(0, 1).map((e) => e.id));
              setNotice(
                "Draft created with four unknown entry slots. Save when ready.",
              );
              props.onSelectPlan?.(null);
            })
          }
        >
          Create connector draft
        </button>
      </details>
      {draft && (
        <form
          className="connector-editor"
          aria-label={`${draft.label} connector editor`}
          onSubmit={(event) => {
            event.preventDefault();
            execute(() => {
              const next = saveConnectorPlan(project, draft),
                savedPlan = next.connectorPlans.find(
                  (plan) => plan.id === draft.id,
                )!;
              props.onCancelEntrancePick?.();
              consumedPick.current = pick?.nonce ?? consumedPick.current;
              props.onChange(next);
              setDraft(savedPlan);
              props.onSelectPlan?.(savedPlan.id);
              setNotice(`${savedPlan.label} connector plan saved.`);
            });
          }}
        >
          <h3>{draft.label} · One A21Z angle</h3>
          <label className="field">
            Plan name
            <input
              aria-label="Connector plan name"
              value={draft.name}
              maxLength={100}
              required
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <div className="connector-members">
            {(["base", "post"] as const).map((role) => (
              <p key={role}>
                <strong>
                  {role === "base" ? "Base" : "Post"}:{" "}
                  {partLabel(project, draft[role].pieceId)}
                </strong>{" "}
                ·{" "}
                {project.pieces.find((p) => p.id === draft[role].pieceId)
                  ?.name ?? draft[role].name}
                {props.onInspectPiece &&
                  project.pieces.some((p) => p.id === draft[role].pieceId) && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        props.onInspectPiece?.(draft[role].pieceId)
                      }
                    >
                      <Eye size={13} /> Inspect{" "}
                      {partLabel(project, draft[role].pieceId)}
                    </button>
                  )}
              </p>
            ))}
          </div>
          <p className="connector-state" data-testid="connector-plan-state">
            {review
              ? stateText[review.state]
              : draftReview.error
                ? "Correct entered fields before preview"
                : "Review pending"}
          </p>
          {draftReview.error && (
            <p
              role="alert"
              className="form-error"
              data-testid="connector-draft-validation"
            >
              {draftReview.error}
            </p>
          )}
          <p>
            <strong>Reference: 1 angle · 2 base + 2 post fasteners.</strong>
            <br />
            <span className="small-note">
              Four quantity slots; no manufactured hole centers or installed
              holes. Mounting fit remains pending.
            </span>
          </p>
          <details className="field-section">
            <summary>Change reference schedule</summary>
            <label className="field">
              Schedule
              <select
                aria-label="Connector schedule"
                value={scheduleChoice}
                onChange={(event) =>
                  setScheduleChoice(
                    event.target.value as ConnectorPlan["scheduleId"],
                  )
                }
              >
                <option value="sd9112">SD9112 screws · 2 base + 2 post</option>
                <option value="n10dhdg">
                  N10DHDG-R nails · 2 base + 2 post
                </option>
              </select>
            </label>
            <p className="small-note">
              Changing the saved schedule retains an earlier record and clears
              current entries and measurements.
            </p>
            <button
              type="button"
              className="button secondary small"
              disabled={scheduleChoice === draft.scheduleId}
              onClick={() =>
                execute(() => {
                  props.onCancelEntrancePick?.();
                  setDraft(
                    changeConnectorSchedule(project, draft, scheduleChoice),
                  );
                  setPending({});
                  setFieldEpoch((n) => n + 1);
                  setNotice(
                    "Schedule changed in draft. Review the unknown entries, then Save.",
                  );
                })
              }
            >
              Use selected connector schedule
            </button>
          </details>
          <ConnectorReferenceDetails plan={draft} />
          <p className="small-note">
            Coordinates use the assigned member's local X/Y/Z axes, in inches or
            feet. Drive points inward from the actual wood surface; nominal
            fastener length is not wood-entry-to-tip depth.
          </p>
          {draft.entries.map((entry) => {
            const point = review?.entries.find((p) => p.entry.id === entry.id),
              memberId = draft[entry.role].pieceId,
              qualified = `${draft.label}/${entry.label}`;
            return (
              <details
                className="connector-entry field-section"
                key={`${entry.id}/${fieldEpoch}`}
                aria-label={`Connector entry ${entry.label}`}
                data-entry-id={entry.id}
                data-entry-role={entry.role}
                onFocusCapture={() => props.onFocusEntry?.(entry.id)}
                open={openEntries.includes(entry.id)}
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  if (open) props.onFocusEntry?.(entry.id);
                  setOpenEntries((old) =>
                    open
                      ? [...new Set([...old, entry.id])]
                      : old.filter((id) => id !== entry.id),
                  );
                }}
              >
                <summary>
                  <strong>{qualified}</strong> · {entry.role}{" "}
                  {partLabel(project, memberId)}
                  <small>
                    {point ? stateText[point.state] : "Measurements pending"}
                  </small>
                </summary>
                {props.onRequestEntrancePick && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() =>
                      props.onRequestEntrancePick?.({
                        planId: draft.id,
                        entryId: entry.id,
                        memberId,
                      })
                    }
                  >
                    {props.pickingEntryId === entry.id
                      ? "Click the assigned wood surface · Escape cancels"
                      : "Pick wood entry in 3D"}
                  </button>
                )}
                <EntryVector
                  label={`${entry.label} wood entry`}
                  value={entry.entranceLocal}
                  onChange={(value) =>
                    editEntry(entry.id, (e) => ({ ...e, entranceLocal: value }))
                  }
                  onPending={(value) =>
                    setPending((old) => ({
                      ...old,
                      [`${entry.id}/entry`]: value,
                    }))
                  }
                />
                <EntryVector
                  label={`${entry.label} inward direction`}
                  direction
                  value={entry.driveLocal}
                  onChange={(value) =>
                    editEntry(entry.id, (e) => ({ ...e, driveLocal: value }))
                  }
                  onPending={(value) =>
                    setPending((old) => ({
                      ...old,
                      [`${entry.id}/drive`]: value,
                    }))
                  }
                />
                <details>
                  <summary>
                    Measured depths and pilot · independent user evidence
                  </summary>
                  {(
                    [
                      "woodEntryToTipDepth",
                      "pilotDiameter",
                      "pilotDepth",
                    ] as const
                  ).map((field) => (
                    <ConnectorLengthInput
                      key={field}
                      label={`${entry.label} ${field === "woodEntryToTipDepth" ? "wood-entry-to-tip depth" : field === "pilotDiameter" ? "pilot diameter" : "deepest pilot-drill-tip depth"}`}
                      value={entry.measurements[field]}
                      onPending={(value) =>
                        setPending((old) => ({
                          ...old,
                          [`${entry.id}/${field}`]: value,
                        }))
                      }
                      onChange={(value) =>
                        editEntry(entry.id, (e) => ({
                          ...e,
                          measurements: { ...e.measurements, [field]: value },
                        }))
                      }
                    />
                  ))}
                  <label className="field">
                    Measurement basis
                    <textarea
                      aria-label={`${entry.label} measurement basis`}
                      maxLength={1000}
                      value={entry.measurements.basis}
                      onChange={(event) =>
                        editEntry(entry.id, (e) => ({
                          ...e,
                          measurements: {
                            ...e.measurements,
                            basis: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Measurement date
                    <input
                      type="datetime-local"
                      aria-label={`${entry.label} measurement date`}
                      value={localDate(entry.measurements.measuredAt)}
                      onChange={(event) =>
                        editEntry(entry.id, (e) => ({
                          ...e,
                          measurements: {
                            ...e.measurements,
                            measuredAt: event.target.value
                              ? new Date(event.target.value).toISOString()
                              : null,
                          },
                        }))
                      }
                    />
                  </label>
                </details>
                <EntryReview point={point} />
              </details>
            );
          })}
          <details className="field-section">
            <summary>Plan findings · {review?.issues.length ?? 0}</summary>
            <ul>
              {review?.issues.map((issue, i) => (
                <li key={`${issue.code}/${i}`}>{issue.message}</li>
              ))}
            </ul>
          </details>
          <label className="field">
            Plan notes
            <textarea
              aria-label="Connector plan notes"
              value={draft.notes}
              maxLength={3000}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </label>
          <ReferenceHistory plan={draft} />
          <div className="connector-actions">
            <button
              className="button"
              type="submit"
              disabled={
                Object.values(pending).some(Boolean) || !!draftReview.error
              }
            >
              Save connector plan
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                props.onCancelEntrancePick?.();
                props.onPreview?.(null);
                consumedPick.current = pick?.nonce ?? consumedPick.current;
                setDraft(saved ?? null);
                setPending({});
                setFieldEpoch((n) => n + 1);
                setNotice("Draft discarded.");
              }}
            >
              Discard draft
            </button>
          </div>
          {!!Object.values(pending).some(Boolean) && (
            <p className="small-note">
              Finish all three coordinates or normalize the direction before
              saving; clear a field to leave it unknown.
            </p>
          )}
          {saved && (
            <details className="field-section">
              <summary>Refresh or remove this plan</summary>
              <p className="small-note">
                Refresh keeps the actual member IDs, archives changed references
                and clears the current entry/depth measurements. Save explicitly
                after reviewing.
              </p>
              <div className="connector-actions">
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() =>
                    execute(() => {
                      props.onCancelEntrancePick?.();
                      const next = refreshConnectorPlan(project, draft),
                        unchanged =
                          JSON.stringify(next) === JSON.stringify(draft);
                      if (!unchanged) {
                        setDraft(next);
                        setPending({});
                        setFieldEpoch((n) => n + 1);
                      }
                      setNotice(
                        unchanged
                          ? "References are current; existing entry data retained."
                          : "References refreshed in draft. Current entry measurements cleared; earlier values retained. Save after review.",
                      );
                    })
                  }
                >
                  <RefreshCw size={14} /> Refresh connector references
                </button>
                <button
                  type="button"
                  className="button danger small"
                  onClick={() =>
                    execute(() => {
                      props.onCancelEntrancePick?.();
                      props.onChange(removeConnectorPlan(project, draft.id));
                      setDraft(null);
                      props.onSelectPlan?.(null);
                      setNotice(
                        `${draft.label} plan removed; label remains reserved.`,
                      );
                    })
                  }
                >
                  <Trash2 size={14} /> Remove {draft.label} connector plan
                </button>
              </div>
            </details>
          )}
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="small-note">
          {notice}
        </p>
      )}
      <ConnectorPurchaseComparison project={project} />
      {dirty && (
        <p className="small-note">
          Save or discard this draft before leaving. Inspecting a member keeps
          your edits here.
        </p>
      )}
      <div className="connector-actions">
        {props.onOpenSupplies && (
          <button
            className="button secondary small"
            type="button"
            disabled={dirty}
            onClick={props.onOpenSupplies}
          >
            Review connector purchases
          </button>
        )}
        {props.onOpenTools && (
          <button
            className="button secondary small"
            type="button"
            disabled={dirty}
            onClick={props.onOpenTools}
          >
            Review connector tools
          </button>
        )}
      </div>
    </section>
  );
}

export function ConnectorPurchaseComparison({ project }: { project: Project }) {
  const summary = connectorPurchaseSummary(project),
    rows = summary.products.filter(
      (row) => row.requiredUnits || row.excludedUnits || row.selectedPacks,
    );
  if (!rows.length) return null;
  return (
    <details className="field-section connector-purchases">
      <summary>Saved-plan purchase comparison</summary>
      <p className="small-note">
        Provisional reference quantities, not installed coverage. Only your
        manual supply selections create purchase rows.
      </p>
      {rows.map((row) => (
        <div
          className="connector-purchase-row"
          key={row.productId}
          data-product-id={row.productId}
        >
          <strong>{row.productName}</strong>
          <p>
            {row.requiredUnits} reference units · {row.unitsPerPack} per
            purchase pack
            <br />
            Required packs: {row.requiredPacks} · Selected packs:{" "}
            {row.selectedPacks} · Missing packs: {row.shortfallPacks}
          </p>
          {!!row.excludedUnits && (
            <p className="small-note">
              {row.excludedUnits} units excluded from the comparison pending
              reference/path review.
            </p>
          )}
          {!row.retailerSupported && (
            <p className="small-note">
              No reviewed offer at the selected retailer. Choose a reference
              explicitly; no substitution is made.
            </p>
          )}
        </div>
      ))}
      <details>
        <summary>Comparison scope and duplicate representations</summary>
        <ul className="small-note">
          {summary.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </details>
    </details>
  );
}
