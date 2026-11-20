import { useMemo, useState } from "react";
import { material, type Project } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import {
  banquetteConstruction,
  type BanquetteConstructionReport,
  type BanquettePairReview,
  type BanquetteSeatReview,
} from "./banquetteConstruction";

const seatText: Record<BanquetteSeatReview["state"], string> = {
  missing: "No role-tagged seat remains",
  ambiguous: "Multiple role-tagged seats need review",
  open: "Seat is currently open",
  "not-horizontal": "Seat underside is not horizontal",
  unsupported: "Seat surface review is unavailable",
  incomplete: "Seat contact review is incomplete",
  "contacts-found": "Closed-seat contacts found",
  "no-bearing-contact": "No closed-seat contact found",
  interference: "Seat overlaps other retained material",
};
const pairText: Record<BanquettePairReview["state"], string> = {
  "no-record": "No plan for this pair",
  started: "Plan started · no locations",
  "needs-layout": "Entrance and direction needed",
  "measurements-pending": "Measurements need review",
  "paths-reviewed": "Entered paths reviewed · joint design remains",
  mixed: "Mixed location states need review",
  excluded: "Changed or conflicting plan",
  "legacy-unlocated": "Quantity record only · no locations",
};
export const banquetteMemberLabel = (project: Project, id: string) => {
  const piece = project.pieces.find((part) => part.id === id);
  return piece && !piece.offcut
    ? partLabel(project, id)
    : `${project.partLabels.find((part) => part.partId === id)?.label ?? id} (missing/offcut)`;
};
const contactText = (pair: BanquettePairReview) => {
  const contact = pair.contact;
  if (!contact) return "Actual endpoint unavailable";
  if (contact.state === "face-contact") return "Retained faces meet";
  if (contact.state === "interference") return "Retained material overlaps";
  if (contact.gap !== null)
    return `Modeled separation ${formatPreciseInches(contact.gap)}`;
  return contact.reason;
};
function SeatSummary({
  project,
  report,
  onInspect,
  seatSpanActions,
}: {
  project: Project;
  report: BanquetteConstructionReport;
  onInspect?: (id: string) => void;
  seatSpanActions?: ReadonlyMap<string, () => void>;
}) {
  return (
    <>
      {report.seats.map((seat, index) => (
        <div key={seat.pieceId ?? index} data-seat-state={seat.state}>
          <p>
            <strong>
              {seat.pieceId
                ? `${banquetteMemberLabel(project, seat.pieceId)} · `
                : ""}
              {seatText[seat.state]}
            </strong>
          </p>
          <p className="small-note">
            {["contacts-found", "no-bearing-contact", "interference"].includes(
              seat.state,
            )
              ? `${seat.supportIds.length} actual member${seat.supportIds.length === 1 ? "" : "s"} meet the current underside. `
              : "Closed-seat contacts are not established in this state. "}
            Bearing adequacy and seating capacity remain unresolved.
          </p>
          {seat.pieceId && seatSpanActions?.has(seat.pieceId) && (
            <button type="button" className="text-button" onClick={seatSpanActions.get(seat.pieceId)}>
              Show seat spans in 3D
            </button>
          )}
          {!!seat.contacts.length && (
            <details open={!onInspect}>
              <summary>Inspect seat contacts ({seat.contacts.length})</summary>
              {seat.contacts.map((row) => (
                <div
                  className="banquette-review-row"
                  key={row.memberId}
                  data-bearing-member-id={row.memberId}
                  data-bearing-actual-contact={row.actualContact}
                >
                  <strong>
                    {banquetteMemberLabel(project, row.memberId)} ·{" "}
                    {project.pieces
                      .find((piece) => piece.id === row.memberId)
                      ?.designRole?.replaceAll("-", " ") ?? "actual member"}
                  </strong>
                  <p className="small-note">
                    {row.actualContact
                      ? "Retained underside contact"
                      : "Contact needs review"}
                    {row.contact.gap !== null
                      ? ` · modeled gap ${formatPreciseInches(row.contact.gap)}`
                      : ""}
                    {row.contact.area !== null
                      ? ` · face overlap ${Number(row.contact.area.toFixed(3))} in²`
                      : ""}
                  </p>
                  {onInspect && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onInspect(row.memberId)}
                    >
                      Inspect support{" "}
                      {banquetteMemberLabel(project, row.memberId)}
                    </button>
                  )}
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
    </>
  );
}

export function BanquetteConstructionReview({
  project,
  memberIds,
  ownerId,
  focusedEntryId,
  onEntryChange,
  onInspectPiece,
  seatSpanActions,
  onPlanPair,
  onPlanConnectorPair,
  onReviewPlan,
}: {
  project: Project;
  memberIds: readonly string[];
  ownerId?: string;
  focusedEntryId?: string;
  onEntryChange?: (id: string) => void;
  onInspectPiece: (id: string) => void;
  seatSpanActions?: ReadonlyMap<string, () => void>;
  onPlanPair: (a: string, b: string) => void;
  onPlanConnectorPair?: (a: string, b: string) => void;
  onReviewPlan?: (
    kind: "wood-fastener" | "angle-connector",
    planId: string,
  ) => void;
}) {
  const all = useMemo(() => banquetteConstruction(project), [project]);
  const [entryId, setEntryId] = useState(""),
    [limit, setLimit] = useState(6);
  const reports = all.filter(
    (report) =>
      report.entryId === ownerId ||
      report.memberIds.some((id) => memberIds.includes(id)),
  );
  const report =
    reports.find((item) => item.entryId === (focusedEntryId ?? entryId)) ??
    reports[0];
  if (!report) return null;
  const frame = report.pairs.filter(
      (pair) => pair.kind === "frame" || pair.kind === "existing-only",
    ),
    shell = report.pairs.filter((pair) => pair.kind === "shell");
  const renderPair = (pair: BanquettePairReview) => {
    const [a, b] = pair.pieceIds,
      labels = pair.pieceIds.map((id) => banquetteMemberLabel(project, id)),
      members = pair.pieceIds.map((id) =>
        project.pieces.find((piece) => piece.id === id && !piece.offcut),
      );
    const canPlan = members.every(
        (piece) => piece && material(piece.material).wood,
      ),
      canConnector =
        canPlan &&
        members.every(
          (piece) => piece && material(piece.material).stockKind === "linear",
        );
    return (
      <div
        key={pair.id}
        className="banquette-review-row"
        data-banquette-pair-id={pair.id}
        data-pair-state={pair.state}
        data-pair-a-id={a}
        data-pair-b-id={b}
      >
        <strong>{labels.join(" ↔ ")}</strong>
        <p className="small-note">
          {members
            .map(
              (member) =>
                member?.designRole?.replaceAll("-", " ") ??
                member?.name ??
                "Missing endpoint",
            )
            .join(" ↔ ")}
        </p>
        <p className="small-note">
          {contactText(pair)} · {pairText[pair.state]}
        </p>
        {!!pair.externalPieceIds.length && (
          <p className="small-note">
            Includes an endpoint outside this module.
          </p>
        )}
        {!!pair.intents.length && (
          <p className="small-note">
            {pair.intents
              .map((intent) => `${intent.label} · ${intent.state}`)
              .join("; ")}
          </p>
        )}
        <div className="banquette-review-actions">
          {onReviewPlan &&
            pair.intents
              .filter((intent) => intent.kind !== "legacy-joint")
              .map((intent) => (
                <button
                  type="button"
                  className="text-button"
                  key={`${intent.kind}/${intent.planId}`}
                  onClick={() =>
                    onReviewPlan(
                      intent.kind as "wood-fastener" | "angle-connector",
                      intent.planId,
                    )
                  }
                >
                  Review {intent.label} for {labels.join(" to ")}
                </button>
              ))}
          {members.map(
            (member, index) =>
              member && (
                <button
                  type="button"
                  className="text-button"
                  key={member.id}
                  onClick={() => onInspectPiece(member.id)}
                >
                  Inspect {labels[index]}
                </button>
              ),
          )}
          {canPlan && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => onPlanPair(a, b)}
            >
              Plan screws: {labels.join(" to ")}
            </button>
          )}
          {canConnector && onPlanConnectorPair && (
            <button
              type="button"
              className="text-button"
              onClick={() => onPlanConnectorPair(a, b)}
            >
              Plan A21Z: {labels.join(" to ")}
            </button>
          )}
        </div>
      </div>
    );
  };
  return (
    <section
      className="field-section banquette-construction-review"
      aria-label="Banquette construction"
      data-banquette-entry-id={report.entryId}
    >
      <h4>Banquette construction</h4>
      {reports.length > 1 && (
        <label className="field">
          Storage module
          <select
            aria-label="Banquette construction module"
            value={report.entryId}
            onChange={(event) => {
              setEntryId(event.target.value);
              onEntryChange?.(event.target.value);
              setLimit(6);
            }}
          >
            {reports.map((item) => (
              <option key={item.entryId} value={item.entryId}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {reports.length === 1 && (
        <p>
          <strong>{report.name}</strong>
        </p>
      )}
      <SeatSummary
        project={project}
        report={report}
        onInspect={onInspectPiece}
        seatSpanActions={seatSpanActions}
      />
      {!!report.findings.length && (
        <details open>
          <summary>Review findings ({report.findings.length})</summary>
          <ul>
            {report.findings.map((finding, index) => (
              <li key={`${finding.code}/${index}`}>
                {finding.message}
                {finding.pieceIds.length
                  ? ` · ${finding.pieceIds.map((id) => banquetteMemberLabel(project, id)).join(", ")}`
                  : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      <h4>Join the actual members</h4>
      <p className="small-note">
        {frame.length} frame or saved pairs · {shell.length} other shell pairs.
        These are current contact candidates and authored pairs, not a required
        fastening schedule. A plan on one pair does not join its neighbors.
        Hinges and lid stays have separate purposes.
      </p>
      {frame.slice(0, limit).map(renderPair)}
      {frame.length > limit && (
        <button
          type="button"
          className="text-button"
          onClick={() => setLimit((value) => value + 6)}
        >
          Show {Math.min(6, frame.length - limit)} more frame pairs
        </button>
      )}
      {!!shell.length && (
        <details>
          <summary>Other shell contact pairs ({shell.length})</summary>
          {shell.map(renderPair)}
        </details>
      )}
      {!report.enumeration.complete && (
        <p role="status" className="small-note">
          Review incomplete: {report.enumeration.checkedPairs} of{" "}
          {report.enumeration.possiblePairs} possible checks attempted;{" "}
          {report.enumeration.omittedPairs} skipped.{" "}
          {report.enumeration.omittedPairs
            ? "Narrow the assembly to review the remaining pairs."
            : "Some retained surfaces were unavailable; inspect the findings above."}
        </p>
      )}
    </section>
  );
}

/** A derived appendix; rendering never edits generated guide phases or checklist state. */
export function BanquetteConstructionAppendix({
  project,
}: {
  project: Project;
}) {
  const reports = useMemo(() => banquetteConstruction(project), [project]);
  if (!reports.length) return null;
  return (
    <section className="banquette-construction-appendix">
      <h2>Banquette construction review</h2>
      <p>
        Actual geometry and saved pair intent. Contact and entered paths do not
        establish complete joinery, installed hardware or seating capacity.
      </p>
      {reports.map((report) => (
        <section key={report.entryId}>
          <h3>{report.name}</h3>
          <SeatSummary project={project} report={report} />
          <p>
            {report.pairs.filter((pair) => pair.kind === "frame").length} frame
            contact candidates ·{" "}
            {report.pairs.filter((pair) => pair.kind === "shell").length} shell
            contact candidates.
          </p>
          <table>
            <thead>
              <tr>
                <th>Actual pair</th>
                <th>Geometry</th>
                <th>Recorded intent</th>
              </tr>
            </thead>
            <tbody>
              {report.pairs
                .filter((pair) => pair.kind !== "shell")
                .map((pair) => (
                  <tr key={pair.id}>
                    <td>
                      {pair.pieceIds
                        .map((id) => banquetteMemberLabel(project, id))
                        .join(" ↔ ")}
                    </td>
                    <td>{contactText(pair)}</td>
                    <td>
                      {pairText[pair.state]}
                      {pair.intents.length
                        ? ` · ${pair.intents.map((intent) => intent.label).join(", ")}`
                        : ""}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {report.findings.map((finding, index) => (
            <p key={index}>
              {finding.message} ·{" "}
              {finding.pieceIds
                .map((id) => banquetteMemberLabel(project, id))
                .join(", ")}
            </p>
          ))}
          {!report.enumeration.complete && (
            <p>
              Incomplete review: {report.enumeration.checkedPairs}/
              {report.enumeration.possiblePairs} checks attempted;{" "}
              {report.enumeration.omittedPairs} skipped. Retained surfaces or
              remaining pairs still need review.
            </p>
          )}
        </section>
      ))}
    </section>
  );
}
