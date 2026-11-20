import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2, Wrench } from "lucide-react";
import type { Project, V3 } from "./model";
import { LengthInput } from "./LengthInput";
import { ClosetSupportMapping } from "./ClosetSupportMapping";
import {
  emptyShelfPinMeasurements,
  shelfPinMeasurementsSchema,
  shelfPinProductId,
  type AttachmentPlan,
  type ShelfPinLayout,
  type ShelfPinMeasurements,
} from "./attachmentSchema";
import {
  attachmentReviews,
  makeShelfPinPlan,
  removeAttachmentPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
  type AttachmentReview,
  type AttachmentState,
  type ShelfSupportEntry,
} from "./attachments";
import {
  addMissingAttachmentPinPacks,
  attachmentPurchaseSummaries,
} from "./attachmentPurchases";
import {
  angleShelfPinReference,
  everbiltShelfPin,
  shelfPinProducts,
  type ShelfPinProductId,
} from "./shelfPinReference";
import { retailerName } from "./retailers";

const coordinate = (point: V3) =>
  point.map((n) => String(Number(n.toFixed(3)))).join(", ");
const roleName = (role: string) =>
  role.replace(/^tower-shelf-/, "Tower shelf ").replace(/^shelf-/, "Shelf ");
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The support plan could not be saved.";
const stateLabels: Record<AttachmentState, string> = {
  stale: "Geometry changed · review needed",
  conflict: "Geometry conflict",
  "needs-measurements": "Measurements pending",
  "geometry-checked": "Geometry checked · installation review remains",
};
const workspaceToken = (project: Project) =>
  JSON.stringify({
    pieces: project.pieces,
    bindings: project.ideaBindings,
    plans: project.attachmentPlans,
  });
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

function OptionalLength({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1;
  const [draft, setDraft] = useState(
    value === null ? "" : String(Number((value / scale).toFixed(5))),
  );
  useEffect(
    () =>
      setDraft(
        value === null ? "" : String(Number((value / scale).toFixed(5))),
      ),
    [value, scale],
  );
  return (
    <label className="field length-field">
      <span>{label}</span>
      <div className="length-entry">
        <input
          aria-label={label}
          type="number"
          step="any"
          min={min / scale}
          max={max / scale}
          placeholder="Unknown"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(
              event.target.value.trim()
                ? Number(event.target.value) * scale
                : null,
            );
          }}
        />
        <select
          aria-label={`${label} units`}
          value={unit}
          onChange={(event) => setUnit(event.target.value as "in" | "ft")}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </div>
    </label>
  );
}

function PinProductField({
  productId,
  onChange,
}: {
  productId: ShelfPinProductId;
  onChange: (productId: ShelfPinProductId) => void;
}) {
  return (
    <label className="field">
      Shelf pin product
      <select
        value={productId}
        onChange={(event) => onChange(event.target.value as ShelfPinProductId)}
      >
        {Object.entries(shelfPinProducts).map(([id, product]) => (
          <option key={id} value={id}>
            {product.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function LayoutFields({
  layout,
  onChange,
}: {
  layout: ShelfPinLayout;
  onChange: (layout: ShelfPinLayout) => void;
}) {
  return (
    <>
      <div className="attachment-layout-fields">
        <LengthInput
          label="Front inset"
          value={layout.frontInset}
          min={0.001}
          max={120}
          onChange={(frontInset) => onChange({ ...layout, frontInset })}
        />
        <LengthInput
          label="Rear inset"
          value={layout.rearInset}
          min={0.001}
          max={120}
          onChange={(rearInset) => onChange({ ...layout, rearInset })}
        />
      </div>
      <p className="small-note">
        Insets start at the front and rear edges of each side panel.
      </p>
      <label className="field">
        Row layout
        <select
          aria-label="Support row layout"
          value={layout.system}
          onChange={(event) =>
            onChange({
              ...layout,
              system: event.target.value as ShelfPinLayout["system"],
              datumHeight: null,
            })
          }
        >
          <option value="custom">Custom shelf targets</option>
          <option value="kreg-32mm">Kreg 32 mm rows</option>
        </select>
      </label>
      {layout.system === "kreg-32mm" && (
        <>
          <OptionalLength
            label="First hole-center datum from side bottom"
            value={layout.datumHeight}
            max={240}
            onChange={(datumHeight) => onChange({ ...layout, datumHeight })}
          />
          <p className="small-note">
            32 mm row pitch. The datum is the first hole center above the
            side-panel bottom; measured bearing offset is still needed to locate
            a hole.
          </p>
        </>
      )}
    </>
  );
}

function ShelfChoices({
  entry,
  roles,
  onChange,
  existingRoles = [],
}: {
  entry: ShelfSupportEntry | null;
  roles: string[];
  onChange: (roles: string[]) => void;
  existingRoles?: string[];
}) {
  const all = [
    ...new Set([
      ...(entry?.shelves.map((s) => s.role) ?? []),
      ...existingRoles,
    ]),
  ];
  return (
    <fieldset className="attachment-shelf-choices">
      <legend>Shelves to support</legend>
      {!all.length && (
        <p className="small-note">
          This saved design has no current shelf parts.
        </p>
      )}
      {all.map((role) => {
        const shelf = entry?.shelves.find((s) => s.role === role);
        return (
          <label className="field" key={role}>
            <span>
              <input
                type="checkbox"
                aria-label={`Plan supports for ${roleName(role)}`}
                checked={roles.includes(role)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...roles, role]
                      : roles.filter((r) => r !== role),
                  )
                }
              />{" "}
              {roleName(role)}
              {!shelf && " · missing part"}
            </span>
          </label>
        );
      })}
      {!!entry?.shelves.length && (
        <button
          className="text-button"
          type="button"
          onClick={() => onChange(entry.shelves.map((s) => s.role))}
        >
          Select all current shelves
        </button>
      )}
      <p className="small-note">
        Four explicit bearing targets per selected shelf: left/right,
        front/rear.
      </p>
    </fieldset>
  );
}

function MeasurementFields({
  measurements,
  testFitNote,
  onChange,
}: {
  measurements: ShelfPinMeasurements;
  testFitNote?: string;
  onChange: (value: ShelfPinMeasurements) => void;
}) {
  const fields = [
    ["pinInsertionDepth", "Pin insertion into side panel", 0, 12],
    ["bearingReach", "Pin bearing reach", 0, 12],
    ["bearingOffset", "Shelf underside above pin axis", -2, 2],
    ["fullDiameterBoreDepth", "Bore depth at full diameter", 0, 12],
    ["deepestDrillTipDepth", "Deepest drill-tip depth", 0, 12],
  ] as const;
  return (
    <details className="attachment-measurements">
      <summary>User measurements · unknown values stay blank</summary>
      <p className="small-note">
        Record measurements from the actual pins and drilling setup. Enter a
        basis and date for any measured values. This records your evidence;
        geometry review leaves loads and installation decisions open.
      </p>
      {testFitNote && (
        <>
          <p className="small-note">{testFitNote}</p>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={measurements.fitTestConfirmed === true}
                onChange={(event) => onChange({
                  ...measurements,
                  fitTestConfirmed: event.target.checked ? true : undefined,
                })}
              />{" "}
              Confirmed the delivered pin fits a 5 mm test bore in matching stock
            </span>
          </label>
        </>
      )}
      {fields.map(([key, label, min, max]) => (
        <OptionalLength
          key={key}
          label={label}
          min={min}
          max={max}
          value={measurements[key]}
          onChange={(value) => onChange({ ...measurements, [key]: value })}
        />
      ))}
      <p className="small-note">
        Bearing offset is signed: positive places the shelf underside above the
        pin axis.
      </p>
      <label className="field">
        Measurement basis
        <textarea
          aria-label="Support measurement basis"
          rows={3}
          maxLength={1000}
          placeholder="What you measured, on which actual parts, and how"
          value={measurements.basis}
          onChange={(event) =>
            onChange({ ...measurements, basis: event.target.value })
          }
        />
      </label>
      <label className="field">
        Measured at
        <input
          aria-label="Support measurement date"
          type="datetime-local"
          value={localDate(measurements.measuredAt)}
          onChange={(event) => {
            const date = event.target.value
              ? new Date(event.target.value)
              : null;
            onChange({
              ...measurements,
              measuredAt:
                date && Number.isFinite(date.getTime())
                  ? date.toISOString()
                  : null,
            });
          }}
        />
      </label>
    </details>
  );
}

function SupportSchedule({
  review,
  onSelectPart,
}: {
  review: AttachmentReview;
  onSelectPart?: (id: string) => void;
}) {
  return (
    <details className="attachment-schedule">
      <summary>
        Point and hole schedule · {review.points.length} targets
      </summary>
      <p className="small-note">
        World coordinates in inches, displayed to 0.001 in. Targets describe
        intended bearing positions. A planned hole center appears when its
        measurement inputs are available.
      </p>
      {review.plan.shelfRoles.map((role) => (
        <details key={role}>
          <summary>{roleName(role)}</summary>
          <div className="attachment-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Side / row</th>
                  <th>Target X, Y, Z</th>
                  <th>Hole center X, Y, Z</th>
                  <th>Row index</th>
                </tr>
              </thead>
              <tbody>
                {review.points
                  .filter((p) => p.point.shelf.role === role)
                  .map((p) => (
                    <tr key={p.point.id}>
                      <td>
                        <button
                          className="text-button"
                          type="button"
                          disabled={!onSelectPart}
                          onClick={() => onSelectPart?.(p.point.shelf.pieceId)}
                        >
                          {p.point.side} / {p.point.row}
                        </button>
                      </td>
                      <td>{coordinate(p.bearingTargetWorld)}</td>
                      <td>
                        {p.holeCenterWorld
                          ? coordinate(p.holeCenterWorld)
                          : "Pending bearing offset"}
                      </td>
                      <td>{p.rowIndex ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </details>
  );
}

function PlanIssues({
  project,
  review,
  onSelectPart,
}: {
  project: Project;
  review: AttachmentReview;
  onSelectPart?: (id: string) => void;
}) {
  if (!review.issues.length) return null;
  return (
    <div className="attachment-issues">
      <h4>Review this plan</h4>
      {review.issues.map((issue, index) => (
        <div
          key={`${issue.code}/${index}`}
          className={issue.severity === "error" ? "form-error" : "small-note"}
        >
          <p>{issue.message}</p>
          {onSelectPart &&
            [...new Set(issue.pieceIds)].map((id) => {
              const part = project.pieces.find((p) => p.id === id);
              return part ? (
                <button
                  key={id}
                  type="button"
                  className="text-button"
                  onClick={() => onSelectPart(id)}
                >
                  Show {part.assembly || part.name}
                </button>
              ) : null;
            })}
        </div>
      ))}
    </div>
  );
}

type PointChange = {
  label: string;
  before: string;
  after: string;
  referencesChanged: boolean;
};
type RefreshPreview = {
  plan: AttachmentPlan;
  review: AttachmentReview;
  token: string;
  added: string[];
  removed: string[];
  changed: PointChange[];
  missingRoles: string[];
};
function pointKey(point: AttachmentReview["points"][number]) {
  return `${point.point.shelf.role}/${point.point.side}/${point.point.row}`;
}

function PlanEditor({
  project,
  review,
  entry,
  onChange,
  onSelectPart,
}: {
  project: Project;
  review: AttachmentReview;
  entry: ShelfSupportEntry | null;
  onChange: (p: Project) => void;
  onSelectPart?: (id: string) => void;
}) {
  const plan = review.plan;
  const [name, setName] = useState(plan.name),
    [productId, setProductId] = useState(plan.productId),
    [roles, setRoles] = useState([...plan.shelfRoles]),
    [layout, setLayout] = useState({ ...plan.layout }),
    [measurements, setMeasurements] = useState(
      structuredClone(plan.measurements),
    ),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<RefreshPreview | null>(null);
  const productChanged = productId !== plan.productId;
  const layoutChanged =
    productChanged ||
    JSON.stringify({ roles, layout }) !==
      JSON.stringify({ roles: plan.shelfRoles, layout: plan.layout });
  function previewRefresh() {
    setError("");
    setMessage("");
    try {
      if (!entry)
        throw Error(
          "This saved design is missing. Its existing targets remain saved; restore the design or remove this plan.",
        );
      shelfPinMeasurementsSchema.parse(measurements);
      const current = new Set(entry.shelves.map((s) => s.role)),
        retained = roles.filter((role) => current.has(role)),
        missingRoles = roles.filter((role) => !current.has(role));
      if (!retained.length)
        throw Error(
          "No selected shelf parts remain. Choose a current shelf or remove the plan; the saved targets are retained.",
        );
      const candidate = makeShelfPinPlan(project, plan.entryId, {
        id: plan.id,
        createdAt: plan.createdAt,
        name,
        productId,
        shelfRoles: retained,
        layout,
        measurements,
      });
      const result = attachmentReviews(
        saveShelfPinPlan(project, candidate),
      ).find((r) => r.plan.id === plan.id)!;
      const old = new Map(review.points.map((p) => [pointKey(p), p])),
        next = new Map(result.points.map((p) => [pointKey(p), p]));
      const added = [...next.keys()].filter((key) => !old.has(key)),
        removed = [...old.keys()].filter((key) => !next.has(key)),
        changed: PointChange[] = [];
      for (const [key, point] of next) {
        const before = old.get(key);
        if (!before) continue;
        const referencesChanged =
          JSON.stringify([before.point.shelf, before.point.mount]) !==
          JSON.stringify([point.point.shelf, point.point.mount]);
        if (
          referencesChanged ||
          point.bearingTargetWorld.some(
            (v, i) => Math.abs(v - before.bearingTargetWorld[i]) > 0.000001,
          ) ||
          JSON.stringify(before.holeCenterWorld) !==
            JSON.stringify(point.holeCenterWorld)
        )
          changed.push({
            label: key,
            before: coordinate(before.bearingTargetWorld),
            after: coordinate(point.bearingTargetWorld),
            referencesChanged,
          });
      }
      setPreview({
        plan: candidate,
        review: result,
        token: workspaceToken(project),
        added,
        removed,
        changed,
        missingRoles,
      });
    } catch (e) {
      setError(errorText(e));
      setPreview(null);
    }
  }
  function saveMeasurements() {
    setError("");
    setMessage("");
    try {
      if (layoutChanged)
        throw Error(
          "Review the layout changes before saving their point coordinates.",
        );
      const value = shelfPinMeasurementsSchema.parse(measurements);
      onChange(
        saveShelfPinPlan(project, {
          ...plan,
          name,
          measurements: value,
          updatedAt: new Date().toISOString(),
        }),
      );
      setMessage(
        "Saved user measurements and plan name. Existing geometry references were retained.",
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="attachment-plan-editor">
      <label className="field">
        Plan name
        <input
          aria-label="Support plan name"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <PinProductField
        productId={productId}
        onChange={(nextProduct) => {
          setProductId(nextProduct);
          setPreview(null);
          setMeasurements(
            nextProduct === plan.productId
              ? structuredClone(plan.measurements)
              : emptyShelfPinMeasurements(),
          );
        }}
      />
      {productChanged && (
        <p className="small-note">
          Confirm the product change in the preview, then enter measurements
          for the new pin.
        </p>
      )}
      <details>
        <summary>Layout and shelf selection</summary>
        <ShelfChoices
          entry={entry}
          roles={roles}
          existingRoles={plan.shelfRoles}
          onChange={setRoles}
        />
        <LayoutFields layout={layout} onChange={setLayout} />
      </details>
      <MeasurementFields
        measurements={measurements}
        testFitNote={angleShelfPinReference(productId)?.fitNote}
        onChange={setMeasurements}
      />
      <div className="inline attachment-actions">
        <button
          type="button"
          className="button secondary"
          onClick={saveMeasurements}
          disabled={layoutChanged}
        >
          Save measurements and name
        </button>
        <button type="button" className="text-button" onClick={previewRefresh}>
          <RefreshCw size={14} />
          {layoutChanged
            ? "Review layout changes"
            : "Refresh from current geometry"}
        </button>
      </div>
      {layoutChanged && (
        <p className="small-note">
          Layout edits need a point preview before they replace the saved
          targets.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="small-note" role="status">
          {message}
        </p>
      )}
      {preview && (
        <section
          className="notice attachment-refresh-preview"
          aria-label="Support refresh preview"
        >
          <h4>Review point changes</h4>
          <p>
            {preview.changed.length} targets change; {preview.added.length}{" "}
            added; {preview.removed.length} removed.
          </p>
          {!!preview.missingRoles.length && (
            <p>
              Missing shelf roles removed from this proposed layout:{" "}
              {preview.missingRoles.map(roleName).join(", ")}.
            </p>
          )}
          <ul>
            {preview.changed.map((change) => (
              <li key={change.label}>
                {change.label}: ({change.before}) → ({change.after}) in
                {change.referencesChanged ? " · part reference changes" : ""}
              </li>
            ))}
            {preview.added.map((key) => (
              <li key={`add/${key}`}>Add {key}</li>
            ))}
            {preview.removed.map((key) => (
              <li key={`remove/${key}`}>Remove {key}</li>
            ))}
          </ul>
          <p className="small-note">
            {stateLabels[preview.review.state]}.{" "}
            {preview.plan.productId === plan.productId
              ? "Refreshing updates this plan’s saved targets and part references."
              : `Changing to ${shelfPinProducts[preview.plan.productId].name} clears the old measurement record.`}
          </p>
          {preview.token !== workspaceToken(project) && (
            <p className="form-error">
              The workspace changed. Create a new preview before confirming.
            </p>
          )}
          <div className="inline">
            <button
              type="button"
              className="button"
              disabled={preview.token !== workspaceToken(project)}
              onClick={() => {
                try {
                  if (preview.token !== workspaceToken(project))
                    throw Error("The workspace changed; refresh the preview.");
                  onChange(saveShelfPinPlan(project, preview.plan));
                  setPreview(null);
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Confirm support refresh
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setPreview(null)}
            >
              Keep saved targets
            </button>
          </div>
        </section>
      )}
      <PlanIssues
        project={project}
        review={review}
        onSelectPart={onSelectPart}
      />
      <SupportSchedule review={review} onSelectPart={onSelectPart} />
    </div>
  );
}

export type AttachmentsPanelProps = {
  project: Project;
  onChange: (p: Project) => void;
  onSelectPart?: (id: string) => void;
  selectedPlanId?: string | null;
  onSelectPlan?: (id: string | null) => void;
  onOpenTools?: () => void;
};
export function AttachmentsPanel({
  project,
  onChange,
  onSelectPart,
  selectedPlanId,
  onSelectPlan,
  onOpenTools,
}: AttachmentsPanelProps) {
  const context = useMemo(() => {
    try {
      return {
        entries: shelfSupportEntries(project),
        reviews: attachmentReviews(project),
        purchases: attachmentPurchaseSummaries(project),
        error: "",
      };
    } catch (e) {
      return { entries: [], reviews: [], purchases: [], error: errorText(e) };
    }
  }, [project]);
  const [localSelection, setLocalSelection] = useState<string | null>(null),
    selected = selectedPlanId === undefined ? localSelection : selectedPlanId;
  const select = (id: string | null) => {
    setLocalSelection(id);
    onSelectPlan?.(id);
  };
  const [creating, setCreating] = useState(false),
    [entryId, setEntryId] = useState(""),
    [productId, setProductId] = useState<ShelfPinProductId>(shelfPinProductId),
    [roles, setRoles] = useState<string[]>([]),
    [layout, setLayout] = useState<ShelfPinLayout>({
      system: "custom",
      frontInset: 2,
      rearInset: 2,
      datumHeight: null,
    }),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [mappingEntryId, setMappingEntryId] = useState<string | null>(null);
  useEffect(() => {
    setCreating(false);
    setRoles([]);
    setName("");
    setError("");
    setMessage("");
    setEntryId("");
    setLocalSelection(null);
    setMappingEntryId(null);
  }, [project.id]);
  useEffect(() => {
    if (!context.entries.some((e) => e.entryId === entryId)) {
      setEntryId(context.entries[0]?.entryId ?? "");
      setRoles([]);
    }
  }, [context.entries, entryId]);
  const entry = context.entries.find((e) => e.entryId === entryId) ?? null,
    purchases = context.purchases;
  if (mappingEntryId)
    return (
      <ClosetSupportMapping
        key={mappingEntryId}
        project={project}
        entryId={mappingEntryId}
        onChange={onChange}
        onCancel={() => setMappingEntryId(null)}
        onComplete={() => {
          setMappingEntryId(null);
          setRoles([]);
          setMessage(
            "Saved the closet panel roles. Choose the shelves to support.",
          );
        }}
      />
    );
  return (
    <section className="attachments-panel" aria-label="Shelf support plans">
      <span className="eyebrow">PLANNED ATTACHMENTS</span>
      <h2>Plan shelf supports.</h2>
      <p className="small-note">
        Choose actual shelves and save explicit bearing targets. Missing pin and
        drilling measurements stay unknown; no holes or installed supports are
        added to the model.
      </p>
      <p className="small-note">
        Round markers are bearing targets; diamonds are planned hole centers.
        Amber means measurements are pending; red means changed geometry or a
        conflict needs review.
      </p>
      {context.error && (
        <p role="alert" className="form-error">
          {context.error}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={!context.entries.length}
        onClick={() => {
          if (!creating)
            setProductId(
              project.retailer === "home-depot"
                ? everbiltShelfPin.productId
                : shelfPinProductId,
            );
          setCreating(!creating);
          setError("");
        }}
      >
        <Plus size={14} />
        Create a shelf support plan
      </button>
      {!context.entries.length && (
        <p className="small-note">
          Open or create a saved panel bookcase or closet insert to plan its
          shelf supports.
        </p>
      )}
      {creating && (
        <form
          data-testid="attachment-create"
          className="section-description attachment-create"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setMessage("");
            try {
              if (!entry)
                throw Error("Choose a saved bookcase or closet insert.");
              if (entry.requiresRoleMapping)
                throw Error(
                  "Map the closet's actual panels before planning supports.",
                );
              const plan = makeShelfPinPlan(project, entry.entryId, {
                name:
                  name.trim() ||
                  `Shelf supports · ${entry.title}`.slice(0, 100),
                productId,
                shelfRoles: roles,
                layout,
                measurements: emptyShelfPinMeasurements(),
              });
              onChange(saveShelfPinPlan(project, plan));
              select(plan.id);
              setCreating(false);
              setMessage(
                "Saved explicit support targets. Pin and drilling measurements are still pending.",
              );
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          <label className="field">
            Saved bookcase or closet
            <select
              aria-label="Bookcase or closet to support"
              value={entryId}
              onChange={(event) => {
                setEntryId(event.target.value);
                setRoles([]);
              }}
            >
              {context.entries.map((e) => (
                <option key={e.entryId} value={e.entryId}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          {entry?.kind === "closet-insert" && (
            <div className="attachment-refresh-preview">
              {entry.requiresRoleMapping ? (
                <p className="small-note">
                  Identify this closet's actual tower dividers and shelves
                  before planning supports. Suggestions need your confirmation.
                </p>
              ) : (
                <p className="small-note">
                  The closet's tower dividers and shelves have recorded roles.
                  Review them if you have reassigned its panels.
                </p>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => setMappingEntryId(entry.entryId)}
              >
                {entry.requiresRoleMapping
                  ? "Map closet support roles"
                  : "Review closet panel roles"}
              </button>
            </div>
          )}
          <label className="field">
            Plan name
            <input
              aria-label="New support plan name"
              maxLength={100}
              value={name}
              placeholder="For example, adjustable shelf supports"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <PinProductField productId={productId} onChange={setProductId} />
          {!entry?.requiresRoleMapping && (
            <ShelfChoices entry={entry} roles={roles} onChange={setRoles} />
          )}
          <LayoutFields layout={layout} onChange={setLayout} />
          <p className="small-note">
            The initial 2 in insets are provisional layout choices. Review them
            before creating targets.
          </p>
          <button
            type="submit"
            className="button"
            disabled={!roles.length || entry?.requiresRoleMapping}
          >
            Create {roles.length * 4} support targets
          </button>
        </form>
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
      <div className="attachment-plans">
        {context.reviews.map((review) => (
          <section
            className="attachment-plan section-description"
            key={review.plan.id}
            data-plan-id={review.plan.id}
          >
            <button
              type="button"
              className="text-button attachment-plan-select"
              aria-expanded={selected === review.plan.id}
              onClick={() =>
                select(selected === review.plan.id ? null : review.plan.id)
              }
            >
              <strong>{review.plan.name}</strong>
              <span>
                {review.points.length} targets · {stateLabels[review.state]}
              </span>
            </button>
            {selected === review.plan.id && (
              <>
                <PlanEditor
                  key={`${review.plan.id}/${review.plan.updatedAt}`}
                  project={project}
                  review={review}
                  entry={
                    context.entries.find(
                      (e) => e.entryId === review.plan.entryId,
                    ) ?? null
                  }
                  onChange={onChange}
                  onSelectPart={onSelectPart}
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    try {
                      onChange(removeAttachmentPlan(project, review.plan.id));
                      select(null);
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  <Trash2 size={13} />
                  Remove support plan
                </button>
              </>
            )}
          </section>
        ))}
      </div>
      {purchases.map((purchases) => (
        <details className="attachment-purchases" key={purchases.productId}>
          <summary>
            Pin purchase plan · {purchases.plannedPins} planned pins
            {context.purchases.length > 1 && ` · ${purchases.productName}`}
          </summary>
          <p className="small-note">
            Demand from the active targets for this exact product.
          </p>
          <p>
            {purchases.plannedPins} planned pins · {purchases.requiredPacks}{" "}
            packs required · {purchases.selectedPacks} packs selected.
          </p>
          <p className="small-note">
            Each pack contains {purchases.pinsPerPack} pins.{" "}
            {purchases.sparePins} pins from selected purchase packs remain
            unallocated.
          </p>
          <details>
            <summary>Demand by plan and shelf</summary>
            {purchases.planRows.map((row) => (
              <div className="small-note" key={row.planId}>
                <strong>{row.name}</strong>
                <p>
                  {row.included
                    ? `${row.pinCount} pins included`
                    : `${row.proposedPinCount} proposed pins excluded while this plan needs review`}
                  .
                </p>
                <ul>
                  {row.shelves.map((shelf) => (
                    <li key={shelf.shelfId}>
                      {roleName(shelf.shelfRole)} ·{" "}
                      {row.included ? shelf.pinCount : shelf.proposedPinCount}{" "}
                      planned points
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
          <p className="small-note">
            {purchases.productName}
            {purchases.referenceOffers.map((offer) => (
              <span key={`${offer.retailer}/${offer.productId}`}>
                {" · "}
                <a href={offer.url} target="_blank" rel="noreferrer">
                  {retailerName(offer.retailer)}{" "}
                  reference {offer.productId}
                </a>
              </span>
            ))}
          </p>
          {!purchases.retailerSupported && (
            <p className="small-note">
              This exact pack has no reviewed {retailerName(project.retailer)} offer.
            </p>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!purchases.canAddMissing}
            onClick={() => {
              try {
                onChange(
                  addMissingAttachmentPinPacks(project, purchases.productId),
                );
                setMessage("Added only the missing pin purchase packs.");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Add {purchases.shortfallPacks} missing pin{" "}
            {purchases.shortfallPacks === 1 ? "pack" : "packs"}
          </button>
          {onOpenTools && (
            <button type="button" className="text-button" onClick={onOpenTools}>
              <Wrench size={13} />
              Review drilling tools
            </button>
          )}
          <details>
            <summary>Purchase review</summary>
            <ul className="small-note">
              {purchases.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        </details>
      ))}
    </section>
  );
}
