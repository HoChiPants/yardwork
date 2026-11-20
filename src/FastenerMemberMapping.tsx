import { useState } from "react";
import { material, type Project } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import type { FastenerPartRef, FastenerPlan } from "./fasteningSchema";
import {
  applyFastenerRemap,
  previewFastenerRemap,
  type FastenerRemapChoice,
} from "./fastenerRemapping";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";

const problemText = (problem: unknown) =>
  problem instanceof Error
    ? problem.message
    : "Review the selected members and try the preview again.";
const dims = (size: number[]) => size.map(formatPreciseInches).join(" × ");
const pointText = (point: number[] | null, units = false) =>
  point
    ? point.map((value) => String(value)).join(", ") + (units ? " in" : "")
    : "Unknown";

function RecordedMember({
  project,
  reference,
  label,
}: {
  project: Project;
  reference: FastenerPartRef;
  label: string;
}) {
  const baseline = reference.baseline;
  if (!baseline)
    return (
      <div className="small-note" data-testid="fastener-legacy-baseline">
        <strong>
          {label}: {partLabel(project, reference.pieceId)} · {reference.name}
        </strong>
        <p>
          Legacy baseline unknown. Original dimensions, material and source were
          not recorded; they cannot be reconstructed from the current part.
        </p>
      </div>
    );
  const product = baseline.productRegistryRef
    ? findRetailerProduct(baseline.productRegistryRef)
    : null;
  return (
    <div className="small-note" data-testid="fastener-recorded-member">
      <strong>
        {label}: {baseline.partLabel} · {reference.name}
      </strong>
      <p>
        {dims(baseline.size)} · {baseline.materialName} ({baseline.material}).
        <br />
        Stock: {baseline.stockSize ? dims(baseline.stockSize) : "Unknown"}.
        <br />
        Source:{" "}
        {product?.name ??
          baseline.productRegistryRef ??
          "Generic stock; no exact product binding"}
        .
      </p>
      <p>
        Recorded position: {pointText(baseline.position, true)}. Rotation:{" "}
        {pointText(baseline.rotation)} rad.
        <br />
        {baseline.cutPlanes.length} retained cut planes ·{" "}
        {!!(
          baseline.roundOpenings?.length || baseline.rectangularOpenings?.length
        ) && (
          <>
            {(baseline.roundOpenings?.length ?? 0) +
              (baseline.rectangularOpenings?.length ?? 0)}{" "}
            through-cuts ·{" "}
          </>
        )}
        {baseline.cutStock
          ? "Cut/source lineage recorded"
          : "No cut/source lineage recorded"}{" "}
        · stock length axis{" "}
        {baseline.stockLengthAxis === null
          ? "unspecified"
          : ["X", "Y", "Z"][baseline.stockLengthAxis]}
        .
      </p>
      {(baseline.cutPlanes.length > 0 || baseline.cutStock) && (
        <details>
          <summary>Recorded cuts and source blank</summary>
          {baseline.cutStock && (
            <p>
              Source blank: {dims(baseline.cutStock.size)}. Kept-region offset:{" "}
              {pointText(baseline.cutStock.offset, true)}.
            </p>
          )}
          {baseline.cutPlanes.map((plane, index) => (
            <p key={index}>
              Retained local plane {index + 1}: normal {pointText(plane.normal)}
              ; keep normal · point ≤ {plane.constant} in. This is geometry, not
              a saw setup.
            </p>
          ))}
        </details>
      )}
      {product && (
        <p>
          {referenceOffersForProduct(product).map((offer) => (
            <span key={`${offer.retailer}/${offer.productId}`}>
              <a href={offer.url} target="_blank" rel="noreferrer">
                {offer.retailer === "lowes" ? "Lowe’s" : "Home Depot"} product
                reference
              </a>
              {" · "}
            </span>
          ))}
        </p>
      )}
      <p>
        Baseline captured {new Date(baseline.capturedAt).toLocaleString()};
        recorded project provenance, not manufacturer certification.
      </p>
    </div>
  );
}

export function FastenerReferenceHistory({
  project,
  plan,
}: {
  project: Project;
  plan: FastenerPlan;
}) {
  if (!plan.referenceHistory.length) return null;
  return (
    <details
      className="attachment-plan"
      data-testid="fastener-reference-history"
    >
      <summary>
        Reference history ({plan.referenceHistory.length}) · obsolete
        measurements
      </summary>
      <p className="small-note">
        Historical coordinates and measurements belong to earlier references.
        They are retained for review and portable JSON, and do not supply
        current drilling or seating instructions.
      </p>
      {plan.referenceHistory.map((entry, index) => (
        <details key={entry.id} className="attachment-plan">
          <summary>
            {plan.label} ·{" "}
            {entry.kind === "remap"
              ? "Member replacement"
              : "Reference refresh"}{" "}
            {index + 1} · {new Date(entry.at).toLocaleString()}
          </summary>
          <p className="small-note">
            <strong>Review basis:</strong> {entry.basis}
            <br />
            Local coordinates:{" "}
            {entry.locationMode === "clear"
              ? "cleared for the next mapping"
              : "retained without scaling"}
            .
          </p>
          <RecordedMember
            project={project}
            reference={entry.previous.head}
            label="Previous head side"
          />
          <RecordedMember
            project={project}
            reference={entry.previous.receiver}
            label="Previous receiver"
          />
          <RecordedMember
            project={project}
            reference={entry.next.head}
            label="Reviewed next head side"
          />
          <RecordedMember
            project={project}
            reference={entry.next.receiver}
            label="Reviewed next receiver"
          />
          <details>
            <summary>Obsolete raw locations and measurements</summary>
            {entry.previous.locations.map((location) => (
              <p className="small-note" key={location.id}>
                <strong>
                  {plan.label}/{location.label} · {location.name}
                </strong>
                <br />
                Former local entry: {pointText(location.entranceLocal, true)}.
                <br />
                Former local drive: {pointText(location.driveLocal)}.
              </p>
            ))}
            <p className="small-note">
              Former proposed surface-to-tip:{" "}
              {entry.previous.measurements.surfaceToTipDepth === null
                ? "Unknown"
                : `${entry.previous.measurements.surfaceToTipDepth} in`}
              .<br />
              Former pilot diameter:{" "}
              {entry.previous.measurements.pilotDiameter === null
                ? "Unknown"
                : `${entry.previous.measurements.pilotDiameter} in`}
              .<br />
              Former deepest pilot-drill tip:{" "}
              {entry.previous.measurements.pilotDepth === null
                ? "Unknown"
                : `${entry.previous.measurements.pilotDepth} in`}
              .<br />
              Former user basis:{" "}
              {entry.previous.measurements.basis || "Not recorded"}.<br />
              Former measurement date:{" "}
              {entry.previous.measurements.measuredAt ?? "Not recorded"}.<br />
              Former screw product: {entry.previous.productId}; evidence{" "}
              {entry.previous.productEvidenceRevision}.
            </p>
          </details>
        </details>
      ))}
    </details>
  );
}

export function FastenerRemapping({
  project,
  plan,
  disabled,
  onChange,
  onBeforeApply,
}: {
  project: Project;
  plan: FastenerPlan;
  disabled: boolean;
  onChange: (project: Project) => void;
  onBeforeApply?: () => void;
}) {
  const [choice, setChoice] = useState<FastenerRemapChoice>({
    headPieceId: "",
    receiverPieceId: "",
    locationMode: "clear",
    basis: "",
  });
  const [preview, setPreview] = useState<ReturnType<
      typeof previewFastenerRemap
    > | null>(null),
    [error, setError] = useState("");
  const candidates = project.pieces.filter(
    (piece) =>
      !piece.offcut &&
      material(piece.material).wood &&
      ["linear", "sheet"].includes(material(piece.material).stockKind),
  );
  const update = (patch: Partial<FastenerRemapChoice>) => {
    setChoice((current) => ({ ...current, ...patch }));
    setPreview(null);
    setError("");
  };
  const valid =
    !!choice.headPieceId &&
    !!choice.receiverPieceId &&
    choice.headPieceId !== choice.receiverPieceId &&
    (choice.headPieceId !== plan.head.pieceId ||
      choice.receiverPieceId !== plan.receiver.pieceId) &&
    !!choice.basis.trim();
  const optionText = (piece: Project["pieces"][number]) =>
    `${partLabel(project, piece.id)} · ${piece.name} · ${dims(piece.size)} · ${material(piece.material).name}`;
  return (
    <details
      className="attachment-plan fastener-remapping"
      data-testid="fastener-remapping"
    >
      <summary>Replace actual members</summary>
      <p className="small-note">
        Choose actual retained wood parts by their P labels. W/F identities
        remain. No replacement is chosen by name or role, and local coordinates
        are never translated or scaled.
      </p>
      {disabled && (
        <p className="form-error" role="status">
          Save or discard the unsaved fastener edits before replacing members.
        </p>
      )}
      <RecordedMember
        project={project}
        reference={plan.head}
        label="Recorded head side"
      />
      <RecordedMember
        project={project}
        reference={plan.receiver}
        label="Recorded receiver"
      />
      <fieldset
        disabled={disabled}
        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
      >
        <label className="field">
          Replacement head-side member
          <select
            aria-label="Replacement head-side member"
            value={choice.headPieceId}
            onChange={(event) => update({ headPieceId: event.target.value })}
          >
            <option value="">Choose an actual head-side part</option>
            {candidates.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {optionText(piece)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Replacement receiving member
          <select
            aria-label="Replacement receiving member"
            value={choice.receiverPieceId}
            onChange={(event) =>
              update({ receiverPieceId: event.target.value })
            }
          >
            <option value="">Choose an actual receiver</option>
            {candidates.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {optionText(piece)}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["Head side", choice.headPieceId],
            ["Receiver", choice.receiverPieceId],
          ] as const
        ).map(([role, id]) => {
          const piece = candidates.find((candidate) => candidate.id === id);
          if (!piece) return null;
          const stock = material(piece.material),
            product = stock.productReference
              ? findRetailerProduct(stock.productReference)
              : null;
          return (
            <p
              className="small-note"
              key={role}
              data-testid="fastener-selected-member"
            >
              <strong>
                {role}: {partLabel(project, id)} · {piece.name}
              </strong>
              <br />
              Actual {dims(piece.size)}; stock{" "}
              {dims(stock.stockSize ?? stock.size)}.<br />
              {stock.name} ({stock.id}); source{" "}
              {product?.name ??
                stock.productReference ??
                "Generic stock; no exact product binding"}
              .
            </p>
          );
        })}
        <fieldset style={{ border: 0, margin: "12px 0", padding: 0 }}>
          <legend>Existing local locations</legend>
          <label className="checkbox-field">
            <input
              type="radio"
              name={`remap-locations-${plan.id}`}
              aria-label="Clear current location coordinates"
              checked={choice.locationMode === "clear"}
              onChange={() => update({ locationMode: "clear" })}
            />
            Clear entry points and directions
          </label>
          <label className="checkbox-field">
            <input
              type="radio"
              name={`remap-locations-${plan.id}`}
              aria-label="Retain local location coordinates without scaling"
              checked={choice.locationMode === "retain-local"}
              onChange={() => update({ locationMode: "retain-local" })}
            />
            Retain exact local coordinates without scaling
          </label>
        </fieldset>
        <p className="small-note">
          Both choices clear current surface-to-tip and pilot measurements,
          their basis and date. Exact previous values remain in reference
          history. Retained local coordinates still require a new path review on
          the selected parts.
        </p>
        <label className="field">
          Replacement review basis
          <textarea
            aria-label="Replacement review basis"
            maxLength={1000}
            value={choice.basis}
            placeholder="Why these actual parts replace the recorded members; how you reviewed the local datums"
            onChange={(event) => update({ basis: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={!valid}
          onClick={() => {
            try {
              setPreview(previewFastenerRemap(project, plan.id, choice));
              setError("");
            } catch (problem) {
              setError(problemText(problem));
            }
          }}
        >
          Preview member replacement
        </button>
      </fieldset>
      {preview && (
        <div
          className="attachment-refresh-preview"
          role="region"
          aria-label="Member replacement preview"
        >
          <strong>{plan.label} · reviewed member replacement</strong>
          <RecordedMember
            project={project}
            reference={preview.comparison.previousHead}
            label="Before head side"
          />
          <RecordedMember
            project={project}
            reference={preview.comparison.selectedHead}
            label="Selected head side"
          />
          <RecordedMember
            project={project}
            reference={preview.comparison.previousReceiver}
            label="Before receiver"
          />
          <RecordedMember
            project={project}
            reference={preview.comparison.selectedReceiver}
            label="Selected receiver"
          />
          <p className="small-note">
            {preview.comparison.clearedLocationCount} location coordinates
            cleared · {preview.comparison.retainedLocationCount} retained
            without scaling. Current seating and pilot measurements reset to
            unknown; raw values stay in history.
            <br />
            Preview state: {preview.review.state};{" "}
            {preview.review.activePointCount} provisional screw locations. No
            installed hardware, pilot pattern, joint strength or approval is
            created.
          </p>
          {preview.review.locations.map((point) => (
            <p className="small-note" key={point.location.id}>
              <strong>
                {plan.label}/{point.location.label}
              </strong>{" "}
              · {point.state}
              <br />
              Local entry: {pointText(point.location.entranceLocal, true)}.
              <br />
              Local drive: {pointText(point.location.driveLocal)}.
            </p>
          ))}
          <details>
            <summary>
              Replacement path issues ({preview.review.issues.length})
            </summary>
            {preview.review.issues.map((issue, index) => (
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
            className="button"
            disabled={disabled}
            onClick={() => {
              try {
                const next = applyFastenerRemap(
                  project,
                  plan.id,
                  choice,
                  preview.token,
                );
                onBeforeApply?.();
                onChange(next);
              } catch (problem) {
                setError(problemText(problem));
              }
            }}
          >
            Apply member replacement
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setPreview(null);
              setError("");
            }}
          >
            Cancel replacement preview
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
