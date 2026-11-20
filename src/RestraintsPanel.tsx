import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import {
  addRestraintLocation,
  connectedRestraintMembers,
  makeRestraintPlan,
  removeRestraintPlan,
  restraintReviews,
  saveRestraintPlan,
  selectRestraintReceiver,
  type RestraintReview,
  type RestraintState,
} from "./restraints";
import {
  addMissingRestraintKits,
  restraintPurchaseSummary,
} from "./restraintPurchases";
import { type RestraintLocation, type RestraintPlan } from "./restraintSchema";

export type RestraintsPanelProps = {
  project: Project;
  onChange: (project: Project) => void;
  onBack: () => void;
  backLabel?: string;
  initialPlanId?: string | null;
};
const numberText = (value: number) => String(Number(value.toFixed(4)));
const stateLabel: Record<RestraintState, string> = {
  stale: "Changed geometry · review needed",
  conflict: "Geometry conflict",
  "needs-review": "Review remains",
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The restraint review could not be saved.";
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const dateValue = (value: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;

function EvidenceDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="datetime-local"
        aria-label={label}
        value={localDate(value)}
        onChange={(event) => onChange(dateValue(event.target.value))}
      />
    </label>
  );
}

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
          min={0.00001 / scale}
          max={1200 / scale}
          step="any"
          placeholder="Unknown"
          value={draft}
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

/** Partial coordinate entry remains local draft text; a missing axis is never zero-filled. */
function CoordinateFields({
  label,
  value,
  onChange,
  onIncomplete,
}: {
  label: string;
  value: V3 | null;
  onChange: (value: V3 | null) => void;
  onIncomplete: (incomplete: boolean) => void;
}) {
  const [unit, setUnit] = useState<"in" | "ft">("in"),
    scale = unit === "ft" ? 12 : 1,
    [draft, setDraft] = useState<string[]>(
      value ? value.map(String) : ["", "", ""],
    ),
    serialized = JSON.stringify(value),
    emitted = useRef(serialized),
    axisValues = useRef<(number | null)[]>(
      value ? [...value] : [null, null, null],
    );
  useEffect(() => {
    if (serialized !== emitted.current) {
      emitted.current = serialized;
      axisValues.current = value ? [...value] : [null, null, null];
      setDraft(value ? value.map((v) => String(v / scale)) : ["", "", ""]);
    }
  }, [serialized, scale]);
  const edit = (next: string[], index?: number) => {
    setDraft(next);
    if (index === undefined) axisValues.current = [null, null, null];
    else
      axisValues.current[index] =
        next[index].trim() && Number.isFinite(Number(next[index]))
          ? Number(next[index]) * scale
          : null;
    const some = next.some((text) => text.trim()),
      complete = axisValues.current.every((axis) => axis !== null);
    const point = complete ? ([...axisValues.current] as V3) : null;
    emitted.current = JSON.stringify(point);
    onIncomplete(some && !complete);
    onChange(point);
  };
  return (
    <fieldset className="attachment-plan" style={{ minWidth: 0 }}>
      <legend>{label}</legend>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label className="field" key={axis}>
            {axis}
            <input
              type="number"
              aria-label={`${label} ${axis}`}
              value={draft[index]}
              placeholder="Unknown"
              min={-12000 / scale}
              max={12000 / scale}
              step="any"
              onChange={(event) =>
                edit(
                  draft.map((text, i) =>
                    i === index ? event.target.value : text,
                  ),
                  index,
                )
              }
            />
          </label>
        ))}
      </div>
      <label className="field">
        Coordinate units
        <select
          aria-label={`${label} units`}
          value={unit}
          onChange={(event) => {
            const next = event.target.value as "in" | "ft",
              nextScale = next === "ft" ? 12 : 1;
            setDraft(
              axisValues.current.map((axis) =>
                axis === null ? "" : String(axis / nextScale),
              ),
            );
            setUnit(next);
          }}
        >
          <option value="in">in</option>
          <option value="ft">ft</option>
        </select>
      </label>
      {draft.some((text) => text.trim()) && (
        <button
          type="button"
          className="text-button"
          onClick={() => edit(["", "", ""])}
        >
          Clear {label.toLowerCase()}
        </button>
      )}
      {draft.some((text) => text.trim()) &&
        draft.some((text) => !text.trim()) && (
          <p className="form-error">
            Enter all three coordinates or clear this point to keep it unknown.
          </p>
        )}
    </fieldset>
  );
}

function LocationEditor({
  location,
  index,
  receiverId,
  reviewed,
  onChange,
  onRemove,
  onIncomplete,
}: {
  location: RestraintLocation;
  index: number;
  receiverId: string | null;
  reviewed: RestraintReview["locations"][number] | undefined;
  onChange: (location: RestraintLocation) => void;
  onRemove: () => void;
  onIncomplete: (field: string, incomplete: boolean) => void;
}) {
  return (
    <details
      className="attachment-plan"
      open
      aria-label={`Restraint location ${index + 1}`}
    >
      <summary>{location.name}</summary>
      <label className="field">
        Location name
        <input
          aria-label={`Restraint location ${index + 1} name`}
          maxLength={100}
          value={location.name}
          onChange={(event) =>
            onChange({ ...location, name: event.target.value })
          }
        />
      </label>
      <p className="small-note">
        Straight eye span:{" "}
        {reviewed?.span === null || reviewed?.span === undefined
          ? "Unknown"
          : `${numberText(reviewed.span)} in`}
        . Retained receiver depth:{" "}
        {reviewed?.availableReceiverDepth === null ||
        reviewed?.availableReceiverDepth === undefined
          ? "Unknown"
          : `${numberText(reviewed.availableReceiverDepth)} in`}
        .
      </p>
      <label className="field">
        Receiver mounting face
        <select
          aria-label={`Receiver face for location ${index + 1}`}
          value={`${location.receiverFace.axis}/${location.receiverFace.sign}`}
          onChange={(event) => {
            const [axis, sign] = event.target.value.split("/").map(Number);
            onChange({
              ...location,
              receiverFace: { axis: axis as 0 | 1 | 2, sign: sign as -1 | 1 },
            });
          }}
        >
          {([0, 1, 2] as const).flatMap((axis) =>
            ([-1, 1] as const).map((sign) => (
              <option key={`${axis}/${sign}`} value={`${axis}/${sign}`}>
                {["X", "Y", "Z"][axis]}
                {sign === 1 ? "+" : "−"} local face
              </option>
            )),
          )}
        </select>
      </label>
      <p className="small-note">
        Receiver-local points use the part's axes and center as their origin.
        Enter measured mounting and eye centers.
      </p>
      <CoordinateFields
        key={`${location.id}/${receiverId}/mount`}
        label="Receiver mount point"
        value={location.receiverMountLocal}
        onChange={(point) =>
          onChange({ ...location, receiverMountLocal: point })
        }
        onIncomplete={(value) => onIncomplete("mount", value)}
      />
      <CoordinateFields
        key={`${location.id}/${receiverId}/furniture`}
        label="Furniture cable-eye center"
        value={location.furnitureEyeLocal}
        onChange={(point) =>
          onChange({ ...location, furnitureEyeLocal: point })
        }
        onIncomplete={(value) => onIncomplete("furniture", value)}
      />
      <CoordinateFields
        label="Wall cable-eye center · project coordinates"
        value={location.wallEyeWorld}
        onChange={(point) => onChange({ ...location, wallEyeWorld: point })}
        onIncomplete={(value) => onIncomplete("wall", value)}
      />
      <p className="small-note">
        The wall target stays at its project coordinates when the furniture
        moves.
      </p>
      <label className="field">
        Actual wall substrate
        <select
          aria-label={`Wall substrate for location ${index + 1}`}
          value={location.wallSubstrate}
          onChange={(event) =>
            onChange({
              ...location,
              wallSubstrate: event.target
                .value as RestraintLocation["wallSubstrate"],
            })
          }
        >
          <option value="unknown">Unknown · inspect the actual wall</option>
          <option value="wood-stud">Wood stud · dated evidence required</option>
          <option value="steel-stud">Steel stud · method unqualified</option>
          <option value="masonry">Masonry · method unqualified</option>
          <option value="drywall-only">
            Drywall only · method unqualified
          </option>
          <option value="other">Other · method unqualified</option>
        </select>
      </label>
      <label className="field">
        Wall inspection basis
        <textarea
          aria-label={`Wall evidence for location ${index + 1}`}
          value={location.wallBasis}
          maxLength={1000}
          placeholder="Identify the actual stud, wall finish and how you checked them"
          onChange={(event) =>
            onChange({ ...location, wallBasis: event.target.value })
          }
        />
      </label>
      <EvidenceDate
        label={`Wall inspection date for location ${index + 1}`}
        value={location.wallReviewedAt}
        onChange={(wallReviewedAt) => onChange({ ...location, wallReviewedAt })}
      />
      <button type="button" className="text-button" onClick={onRemove}>
        <Trash2 size={13} />
        Remove location {index + 1}
      </button>
    </details>
  );
}

function PlanEditor({
  project,
  plan,
  onChange,
}: {
  project: Project;
  plan: RestraintPlan;
  onChange: (project: Project) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(plan)),
    [candidateId, setCandidateId] = useState(plan.receiver?.pieceId ?? ""),
    [receiverVersion, setReceiverVersion] = useState(0),
    [incomplete, setIncomplete] = useState<Record<string, boolean>>({}),
    [error, setError] = useState("");
  const context = useMemo(() => {
    try {
      return {
        review: restraintReviews(saveRestraintPlan(project, draft)).find(
          (item) => item.plan.id === draft.id,
        )!,
        error: "",
      };
    } catch (problem) {
      return { review: null, error: errorText(problem) };
    }
  }, [project, draft]);
  const candidates = project.pieces.filter((piece) => !piece.offcut),
    candidate = candidates.find((piece) => piece.id === candidateId),
    entries = project.ideaBindings.flatMap((binding) =>
      binding.entries.map((entry, index) => ({
        id: entry.id,
        title: `${binding.title}${binding.entries.length > 1 ? ` · design ${index + 1}` : ""}`,
      })),
    ),
    incompleteCount = Object.values(incomplete).filter(Boolean).length,
    activeIds = new Set(candidates.map((piece) => piece.id)),
    joints = project.joints.filter(
      (joint) => activeIds.has(joint.a) && activeIds.has(joint.b),
    ),
    missingJointIds = draft.receiverJointIds.filter(
      (id) => !joints.some((joint) => joint.id === id),
    );
  const linked = draft.receiverFastenerPlanIds ?? [];
  const selectedScrews = context.review?.screwLinks ?? [];
  const connected = draft.receiver && connectedRestraintMembers(draft.receiver.pieceId, [
    ...selectedScrews.map(({ pieceIds }) => pieceIds),
    ...joints.filter(({ id }) => draft.receiverJointIds.includes(id)).map(({ a, b }) => [a, b]),
  ]);
  const screwPlans = project.fastenerPlans.filter((screw) =>
    linked.includes(screw.id) || (connected &&
      (connected.has(screw.head.pieceId) || connected.has(screw.receiver.pieceId))));
  function toggleScrew(id: string, checked: boolean) {
    update({ receiverFastenerPlanIds: checked ? [...linked, id] : linked.filter((value) => value !== id) });
  }
  const update = (patch: Partial<RestraintPlan>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  };
  const locationChange = (value: RestraintLocation) =>
    setDraft((current) => ({
      ...current,
      locations: current.locations.map((item) =>
        item.id === value.id ? value : item,
      ),
    }));
  return (
    <form
      className="restraint-plan-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          if (incompleteCount)
            throw Error(
              "Complete all three axes of each partial point, or clear the point to leave it unknown.",
            );
          onChange(saveRestraintPlan(project, draft));
        } catch (problem) {
          setError(errorText(problem));
        }
      }}
    >
      <label className="field">
        Review name
        <input
          aria-label="Restraint review name"
          value={draft.name}
          maxLength={100}
          onChange={(event) => update({ name: event.target.value })}
        />
      </label>
      <label className="field">
        Saved furniture design
        <select
          aria-label="Furniture design for restraint"
          value={draft.entryId ?? ""}
          onChange={(event) => update({ entryId: event.target.value || null })}
        >
          <option value="">Unassociated · assembly review required</option>
          {draft.entryId &&
            !entries.some((entry) => entry.id === draft.entryId) && (
              <option value={draft.entryId}>Missing saved design</option>
            )}
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} · {entry.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Actual furniture receiver
        <select
          aria-label="Furniture receiver part"
          value={candidateId}
          onChange={(event) => {
            setCandidateId(event.target.value);
            setError("");
          }}
        >
          <option value="">Choose an actual part</option>
          {candidateId && !candidate && (
            <option value={candidateId}>
              Missing receiver · {candidateId.slice(0, 8)}
            </option>
          )}
          {candidates.map((piece) => (
            <option key={piece.id} value={piece.id}>
              {partLabel(project, piece.id)} · {piece.name} ·{" "}
              {material(piece.material).name} · {piece.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {draft.receiver && (
        <p className="small-note">
          Recorded receiver: {partLabel(project, draft.receiver.pieceId)} ·{" "}
          {draft.receiver.name}.
        </p>
      )}
      <p className="small-note">
        Recording a receiver clears its previous connection choices, receiver
        evidence, local mounting/eye points and measured dimensions. Review
        those fields again for the selected part.
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={!candidate}
        onClick={() => {
          try {
            setDraft(selectRestraintReceiver(project, draft, candidateId));
            setReceiverVersion((value) => value + 1);
            setIncomplete((current) =>
              Object.fromEntries(
                Object.entries(current).filter(([key]) =>
                  key.endsWith("/wall"),
                ),
              ),
            );
            setError("");
          } catch (problem) {
            setError(errorText(problem));
          }
        }}
      >
        Use selected receiver
      </button>
      <details className="attachment-plan">
        <summary>Receiver material and connection evidence</summary>
        <label className="field">
          Solid-wood receiver basis
          <textarea
            aria-label="Solid-wood receiver basis"
            maxLength={1000}
            placeholder="Identify the actual purchased member and your inspection or source evidence"
            value={draft.receiverSolidWoodBasis}
            onChange={(event) =>
              update({ receiverSolidWoodBasis: event.target.value })
            }
          />
        </label>
        <EvidenceDate
          label="Receiver inspection date"
          value={draft.receiverMeasuredAt}
          onChange={(receiverMeasuredAt) => update({ receiverMeasuredAt })}
        />
        <fieldset className="attachment-shelf-choices">
          <legend>Receiver-to-furniture connection records</legend>
          <p className="small-note">
            Select the actual designed connection path into this furniture.
            Contact alone does not establish a connection or its capacity.
          </p>
          {!joints.length && !screwPlans.length && (
            <p className="small-note">
              {draft.receiver
                ? "Plan screw locations connected to this receiver, then return to this review."
                : "Choose the solid-wood receiver to find its screw plans."}
            </p>
          )}
          {screwPlans.map((screw) => {
            const status = selectedScrews.find(({ id }) => id === screw.id);
            return (
              <label className="checkbox-field" key={screw.id}>
                <input type="checkbox" aria-label={`Receiver screw plan ${screw.label}`}
                  checked={linked.includes(screw.id)}
                  onChange={(event) => toggleScrew(screw.id, event.target.checked)} />
                <span>
                  <strong>{screw.label} · {screw.name}</strong><br />
                  {partLabel(project, screw.head.pieceId)} → {partLabel(project, screw.receiver.pieceId)}
                  {status && <><br />{status.detail}</>}
                </span>
              </label>
            );
          })}
          {selectedScrews.filter(({ id }) => !screwPlans.some((screw) => screw.id === id)).map(({ id, label }) => (
            <label className="checkbox-field" key={id}>
              <input type="checkbox" aria-label={`Remove missing screw plan ${label}`} checked
                onChange={() => toggleScrew(id, false)} />
              {label} · Missing plan
            </label>
          ))}
          {joints.map((joint) => (
            <label className="field" key={joint.id}>
              <span>
                <input
                  type="checkbox"
                  aria-label={`Receiver connection ${joint.id}`}
                  checked={draft.receiverJointIds.includes(joint.id)}
                  style={{ width: 15 }}
                  onChange={(event) =>
                    update({
                      receiverJointIds: event.target.checked
                        ? [...draft.receiverJointIds, joint.id]
                        : draft.receiverJointIds.filter(
                            (id) => id !== joint.id,
                          ),
                    })
                  }
                />{" "}
                {partLabel(project, joint.a)} ↔ {partLabel(project, joint.b)} ·{" "}
                {joint.quantity} {joint.kind}
                {joint.quantity === 1 ? "" : "s"} · {joint.id.slice(0, 8)}
              </span>
            </label>
          ))}
          {missingJointIds.map((id) => (
            <label className="field" key={id}>
              <span>
                <input
                  type="checkbox"
                  aria-label={`Remove missing receiver connection ${id}`}
                  checked
                  style={{ width: 15 }}
                  onChange={() =>
                    update({
                      receiverJointIds: draft.receiverJointIds.filter(
                        (value) => value !== id,
                      ),
                    })
                  }
                />{" "}
                Missing connection · {id.slice(0, 8)} · uncheck to remove
              </span>
            </label>
          ))}
        </fieldset>
      </details>
      <div className="attachment-plan">
        <h3>Explicit restraint locations</h3>
        <p className="small-note">
          {draft.locations.length} locations recorded. Choose each actual
          location; the kit does not prescribe a count.
        </p>
        {draft.locations.map((location, index) => (
          <LocationEditor
            key={location.id}
            location={location}
            index={index}
            receiverId={`${draft.receiver?.pieceId ?? ""}/${receiverVersion}`}
            reviewed={context.review?.locations.find(
              (item) => item.location.id === location.id,
            )}
            onChange={locationChange}
            onIncomplete={(field, value) =>
              setIncomplete((current) => ({
                ...current,
                [`${location.id}/${field}`]: value,
              }))
            }
            onRemove={() => {
              update({
                locations: draft.locations.filter(
                  (item) => item.id !== location.id,
                ),
              });
              setIncomplete((current) =>
                Object.fromEntries(
                  Object.entries(current).filter(
                    ([key]) => !key.startsWith(`${location.id}/`),
                  ),
                ),
              );
            }}
          />
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={draft.locations.length >= 20}
          onClick={() => {
            try {
              setDraft(addRestraintLocation(draft));
              setError("");
            } catch (problem) {
              setError(errorText(problem));
            }
          }}
        >
          <Plus size={13} />
          Add restraint location
        </button>
      </div>
      <details className="attachment-plan">
        <summary>User measurements · unknown values stay blank</summary>
        <OptionalLength
          label="Cable eye-to-eye length"
          value={draft.measurements.cableEyeToEyeLength}
          onChange={(value) =>
            update({
              measurements: {
                ...draft.measurements,
                cableEyeToEyeLength: value,
              },
            })
          }
        />
        <OptionalLength
          label="Deepest furniture screw-tip depth"
          value={draft.measurements.deepestFurnitureTipDepth}
          onChange={(value) =>
            update({
              measurements: {
                ...draft.measurements,
                deepestFurnitureTipDepth: value,
              },
            })
          }
        />
        <OptionalLength
          label="Wall fastener length"
          value={draft.measurements.wallFastenerLength}
          onChange={(value) =>
            update({
              measurements: {
                ...draft.measurements,
                wallFastenerLength: value,
              },
            })
          }
        />
        <OptionalLength
          label="Measured wood-stud engagement"
          value={draft.measurements.studEngagement}
          onChange={(value) =>
            update({
              measurements: { ...draft.measurements, studEngagement: value },
            })
          }
        />
        <p className="small-note">
          Tip depth starts at the wood mounting surface. Identify the actual
          wall fastener and finish/fitting stack in your basis; no minimum stud
          engagement is assumed.
        </p>
        <label className="field">
          Measurement basis
          <textarea
            aria-label="Restraint measurement basis"
            maxLength={1000}
            value={draft.measurements.basis}
            placeholder="Your measured kit, fastener identity, reference surfaces and method"
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
        <EvidenceDate
          label="Restraint measurement date"
          value={draft.measurements.measuredAt}
          onChange={(measuredAt) =>
            update({ measurements: { ...draft.measurements, measuredAt } })
          }
        />
      </details>
      <details className="attachment-plan">
        <summary>Delivered instructions and review notes</summary>
        <label className="field">
          Instruction basis
          <textarea
            aria-label="Restraint instruction basis"
            maxLength={1000}
            value={draft.instructionBasis}
            placeholder="Identify the instructions delivered with this exact kit"
            onChange={(event) =>
              update({ instructionBasis: event.target.value })
            }
          />
        </label>
        <label className="field">
          Instruction revision or identifier
          <input
            aria-label="Restraint instruction revision"
            maxLength={200}
            value={draft.instructionRevision}
            onChange={(event) =>
              update({ instructionRevision: event.target.value })
            }
          />
        </label>
        <EvidenceDate
          label="Restraint instruction review date"
          value={draft.instructionReviewedAt}
          onChange={(instructionReviewedAt) =>
            update({ instructionReviewedAt })
          }
        />
        <label className="field">
          Review notes
          <textarea
            aria-label="Restraint review notes"
            maxLength={3000}
            value={draft.notes}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </label>
      </details>
      {context.review && (
        <div
          className="attachment-refresh-preview"
          aria-label="Restraint draft review"
        >
          <strong>{stateLabel[context.review.state]}</strong>
          <p className="small-note">
            {context.review.activeKitCount} explicit locations included in
            provisional kit demand after saving.
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
      {(error || context.error) && (
        <p role="alert" className="form-error">
          {error || context.error}
        </p>
      )}
      {incompleteCount > 0 && (
        <p className="form-error">
          Complete or clear {incompleteCount} partial coordinate{" "}
          {incompleteCount === 1 ? "point" : "points"} before saving.
        </p>
      )}
      <p className="small-note">
        Save the review to update scene intent markers, the guide and purchase
        comparison. Review remains required for the complete furniture and wall
        assembly.
      </p>
      <button
        type="submit"
        className="button primary full"
        disabled={incompleteCount > 0 || !!context.error}
      >
        Save restraint review
      </button>
    </form>
  );
}

export function RestraintsPanel({
  project,
  onChange,
  onBack,
  backLabel = "Back to sections",
  initialPlanId,
}: RestraintsPanelProps) {
  const [selected, setSelected] = useState<string | null>(initialPlanId ?? null),
    [entryId, setEntryId] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setSelected(null);
    setEntryId("");
    setError("");
    setMessage("");
  }, [project.id]);
  useEffect(() => { if (initialPlanId !== undefined) setSelected(initialPlanId); }, [project.id, initialPlanId]);
  const context = useMemo(() => {
      try {
        return {
          reviews: restraintReviews(project),
          purchases: restraintPurchaseSummary(project),
          error: "",
        };
      } catch (problem) {
        return { reviews: [], purchases: null, error: errorText(problem) };
      }
    }, [project]),
    entries = project.ideaBindings.flatMap((binding) =>
      binding.entries.map((entry, index) => ({
        id: entry.id,
        title: `${binding.title}${binding.entries.length > 1 ? ` · design ${index + 1}` : ""}`,
      })),
    ),
    purchases = context.purchases;
  return (
    <section
      className="attachments-panel restraints-panel"
      aria-label="Furniture anti-tip plans"
    >
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={13} />
        {backLabel}
      </button>
      <span className="eyebrow" style={{ display: "block", marginTop: 18 }}>
        FURNITURE RESTRAINT INTENT
      </span>
      <h2>Plan furniture restraints.</h2>
      <p className="small-note">
        Record actual receiver, connection and wall locations for review. Each
        new plan starts without a receiver or restraint count.
      </p>
      <div className="attachment-refresh-preview">
        <strong>Exact kit scope · solid wood + wood stud</strong>
        <p className="small-note">
          Hillman Simple Mount 9976524 requires a solid-wood furniture
          attachment and a wood-stud wall fixing.
        </p>
        <details>
          <summary>Review the kit's limits</summary>
          <p className="small-note">
            Plywood backs, drywall-only anchors, steel studs and masonry have no
            qualified method for this kit here. Delivered instructions, fitting
            geometry and fasteners remain to be reviewed. A product rating does
            not establish the capacity of your furniture or wall assembly.
          </p>
        </details>
      </div>
      <label className="field">
        Design for a new review
        <select
          aria-label="Design for new restraint review"
          value={entryId}
          onChange={(event) => setEntryId(event.target.value)}
        >
          <option value="">Choose later · no association yet</option>
          {entries.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.title} · {entry.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setError("");
          try {
            const plan = makeRestraintPlan(project, entryId || undefined);
            onChange(saveRestraintPlan(project, plan));
            setSelected(plan.id);
            setMessage(
              "Created an empty review. Select an actual receiver and add each intended location.",
            );
          } catch (problem) {
            setError(errorText(problem));
          }
        }}
      >
        <Plus size={14} />
        Create anti-tip review
      </button>
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
          data-restraint-plan-id={review.plan.id}
        >
          <button
            type="button"
            className="text-button attachment-plan-select"
            aria-expanded={selected === review.plan.id}
            onClick={() =>
              setSelected(selected === review.plan.id ? null : review.plan.id)
            }
          >
            <strong>{review.plan.name}</strong>
            <span>
              {review.plan.locations.length} locations ·{" "}
              {stateLabel[review.state]}
            </span>
          </button>
          {selected === review.plan.id && (
            <>
              <PlanEditor
                key={`${review.plan.id}/${review.plan.updatedAt}`}
                project={project}
                plan={review.plan}
                onChange={(next) => {
                  onChange(next);
                  setMessage(
                    "Saved restraint intent and user evidence. Installation and assembly review remain.",
                  );
                }}
              />
              <button
                type="button"
                className="text-button"
                style={{ marginTop: 16 }}
                onClick={() => {
                  onChange(removeRestraintPlan(project, review.plan.id));
                  setSelected(null);
                  setMessage("Removed the restraint review.");
                }}
              >
                <Trash2 size={13} />
                Remove restraint review
              </button>
            </>
          )}
        </section>
      ))}
      {purchases && (
        <details className="attachment-purchases restraint-purchases" open>
          <summary>Restraint kit purchase comparison</summary>
          <p>
            {purchases.plannedLocations} planned locations · Required kits:{" "}
            {purchases.requiredKits} · Selected kits: {purchases.selectedKits} ·
            Missing kits: {purchases.shortfallKits}.
          </p>
          <p className="small-note">
            One complete kit contains eleven included parts. Those contents
            create no separate purchase charges. Selected-kit surplus:{" "}
            {purchases.spareKits}; this is purchase planning, not on-hand stock.
          </p>
          <details>
            <summary>Demand by saved review</summary>
            {purchases.planRows.map((row) => (
              <p className="small-note" key={row.planId}>
                {row.name} · {row.explicitLocations} explicit locations ·{" "}
                {row.activeKitCount} included kits · {stateLabel[row.state]}
              </p>
            ))}
          </details>
          <p className="small-note">
            {purchases.productName}
            {purchases.referenceOffers.map((offer) => (
              <span key={`${offer.retailer}/${offer.productId}`}>
                {" "}
                ·{" "}
                <a href={offer.url} target="_blank" rel="noreferrer">
                  {offer.retailer === "lowes" ? "Lowe's" : "Home Depot"}{" "}
                  reference {offer.productId}
                </a>
              </span>
            ))}
          </p>
          {!purchases.retailerSupported && (
            <p className="small-note">
              The selected retailer has no reviewed offer for this exact kit.
              Choose a retailer with a matching reference before adding it.
            </p>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!purchases.canAddMissing}
            onClick={() => {
              try {
                onChange(addMissingRestraintKits(project));
                setMessage("Added only the missing complete restraint kits.");
                setError("");
              } catch (problem) {
                setError(errorText(problem));
              }
            }}
          >
            Add missing restraint kits
          </button>
        </details>
      )}
    </section>
  );
}
