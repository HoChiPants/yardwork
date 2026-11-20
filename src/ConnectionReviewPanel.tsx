import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { material, type Project } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import { BanquetteConstructionReview } from "./BanquetteConstructionReview";
import { GreenhouseConnectionsPanel } from "./GreenhouseConnectionsPanel";
import { GreenhouseBasePanel, type GreenhouseRailAdjustment } from "./GreenhouseBasePanel";
import { BearingConnectionsPanel } from "./BearingConnectionsPanel";
import { FloorBaseConnectionsPanel } from "./FloorBaseConnectionsPanel";
import type { FloorHangerPlan } from "./floorHangerSchema";
import type { BearingConnectionReview } from "./bearingConnections";
import {
  connectionCoverage,
  type ConnectionIntent,
} from "./connectionCoverage";
import {
  nearbyConnectionPairs,
  reviewConnectionContact,
  type ConnectionContactReview,
} from "./connectionContacts";
import {
  ConnectionIntentSchedule,
  connectionStateText,
  type ConnectionReviewScope,
} from "./GuideConnections";

export type ConnectionReviewPanelProps = {
  project: Project;
  scope: ConnectionReviewScope;
  bearingReview: BearingConnectionReview;
  onSaveBearingDecision: (topId: string, baseId: string, note: string) => void;
  onClearBearingDecision: (topId: string, baseId: string) => void;
  onSaveHangers?: (sectionId: string, plan: FloorHangerPlan | null) => void;
  onTestRemoval: (topId: string, baseId: string) => void;
  onBack: () => void;
  backLabel?: string;
  onInspectPiece: (id: string) => void;
  seatSpanActions?: ReadonlyMap<string, () => void>;
  onPlanPair: (aId: string, bId: string) => void;
  onPlanConnectorPair?: (baseId: string, postId: string) => void;
  onFitStockBetween?: (firstId: string, secondId: string) => void;
  fittedBlock?: { blockId: string; endpoints: [string, string] } | null;
  constructionEntryId?: string;
  onConstructionEntryChange?: (id: string) => void;
  onReviewIntent: (intent: ConnectionIntent) => void;
  baseRailAdjustment?: GreenhouseRailAdjustment;
  onMeasureFoundation?: () => void;
};
const contactText: Record<ConnectionContactReview["state"], string> = {
  "face-contact": "Retained faces meet",
  "near-face": "Nearby opposite faces",
  interference: "Retained solids overlap",
  "outside-search": "Outside this nearby-face search",
  "no-facing-contact": "No opposite-face contact found",
  unsupported: "Surface review unavailable",
};
const isWood = (project: Project, id: string) =>
  project.pieces.some(
    (piece) =>
      piece.id === id && !piece.offcut && material(piece.material).wood,
  );

/** Read-only review and explicit navigation. Opening this view creates no plans, paths or purchases. */
export function ConnectionReviewPanel({
  project,
  scope,
  bearingReview,
  onSaveBearingDecision,
  onClearBearingDecision,
  onSaveHangers,
  onTestRemoval,
  onBack,
  backLabel = "Back",
  onInspectPiece,
  seatSpanActions,
  onPlanPair,
  onPlanConnectorPair,
  onFitStockBetween,
  fittedBlock,
  constructionEntryId,
  onConstructionEntryChange,
  onReviewIntent,
  baseRailAdjustment,
  onMeasureFoundation,
}: ConnectionReviewPanelProps) {
  const [anchorId, setAnchorId] = useState(""),
    [firstId, setFirstId] = useState(""),
    [secondId, setSecondId] = useState(""),
    [partLimit, setPartLimit] = useState(12),
    [pairLimit, setPairLimit] = useState(6);
  const context = useMemo(() => {
    try {
      return { coverage: connectionCoverage(project), error: false };
    } catch {
      return { coverage: null, error: true };
    }
  }, [project]);
  const globalScope =
      scope.ownerId === project.id && scope.stageKey === "all-connections",
    liveStage = context.coverage?.stages.find(
      (stage) =>
        stage.ownerId === scope.ownerId && stage.key === scope.stageKey,
    ),
    requestedIds = globalScope
      ? (context.coverage?.parts.map((part) => part.pieceId) ?? scope.memberIds)
      : (liveStage?.memberIds ?? scope.memberIds),
    memberIds = [...new Set(requestedIds)].filter((id) =>
      project.pieces.some((piece) => piece.id === id && !piece.offcut),
    ),
    memberSet = new Set(memberIds),
    scopeKey = JSON.stringify([
      project.id,
      scope.ownerId,
      scope.stageKey,
      scope.roofEntryId,
      scope.baseEntryId,
      scope.bearingPartId,
      memberIds,
      scope.intentIds,
    ]),
    scopeMissing =
      !globalScope &&
      scope.stageKey !== "unassigned-intents" &&
      !!scope.ownerId &&
      !!scope.stageKey &&
      !liveStage,
    missingCount = requestedIds.length - memberIds.length,
    parts =
      context.coverage?.parts.filter((part) => memberSet.has(part.pieceId)) ??
      [],
    gapIntentIds = new Set(
      context.coverage?.gaps
        .filter(
          (gap) =>
            gap.ownerId === scope.ownerId && gap.stageKey === scope.stageKey,
        )
        .flatMap((gap) => gap.intentIds),
    ),
    scopedIntents =
      context.coverage?.intents.filter(
        (intent) =>
          globalScope ||
          !!scope.intentIds?.includes(intent.id) ||
          gapIntentIds.has(intent.id) ||
          intent.pieceIds.some((id) => memberSet.has(id)) ||
          !!liveStage?.intentIds.includes(intent.id) ||
          !!liveStage?.externalIntentIds.includes(intent.id),
      ) ?? [],
    wood = project.pieces.filter(
      (piece) => !piece.offcut && material(piece.material).wood,
    ),
    firstChoices = wood.filter((piece) => memberSet.has(piece.id)),
    noIntentCount = parts.filter((part) => !part.intentIds.length).length,
    noCurrentCount = parts.filter(
      (part) => !part.currentIntentIds.length,
    ).length,
    startedCount = parts.filter((part) => part.startedIntentIds.length).length,
    pendingCount = parts.filter((part) => part.state === "pending").length,
    legacyCount = parts.filter((part) => part.state === "legacy-record").length,
    excludedCount = parts.filter(
      (part) => part.excludedIntentIds.length,
    ).length;
  useEffect(() => {
    setAnchorId(memberIds.length === 1 ? memberIds[0] : "");
    setFirstId("");
    setSecondId("");
    setPartLimit(12);
    setPairLimit(6);
  }, [scopeKey]);
  useEffect(() => setPairLimit(6), [anchorId]);
  const neighbors = useMemo(() => {
    try {
      return nearbyConnectionPairs(project, anchorId ? [anchorId] : memberIds, {
        limit: 24,
        maxChecks: 5000,
        maxGap: 0.125,
      });
    } catch {
      return null;
    }
  }, [project, anchorId, scopeKey]);
  const chosen = useMemo(() => {
    const a = project.pieces.find((piece) => piece.id === firstId),
      b = project.pieces.find((piece) => piece.id === secondId);
    if (!a || !b || a.id === b.id) return null;
    try {
      return reviewConnectionContact(a, b);
    } catch {
      return null;
    }
  }, [project, firstId, secondId]);
  const planPair = (a: string, b: string) => {
    if (a === b || !isWood(project, a) || !isWood(project, b)) return;
    onPlanPair(a, b);
  };
  const frameMember = (id: string) => project.pieces.some((piece) => piece.id === id && !piece.offcut && material(piece.material).wood && material(piece.material).stockKind === "linear");
  const optionText = (id: string) => {
    const piece = project.pieces.find((part) => part.id === id)!;
    return `${partLabel(project, id)} · ${piece.name}`;
  };
  return (
    <section
      className="connection-review-panel"
      aria-label="Connection review"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={13} /> {backLabel}
      </button>
      <span className="eyebrow" style={{ display: "block", marginTop: 16 }}>
        CONNECTIONS AND SUPPORTS
      </span>
      <h2>{liveStage?.title ?? scope.title}</h2>
      <p className="small-note">
        Inspect actual members, review saved intent, or choose two wood parts
        for an unsaved screw-plan draft. Contact does not fasten them.
      </p>
      {(scopeMissing || missingCount > 0) && (
        <p role="status" className="small-note">
          {scopeMissing
            ? "The original stage changed or is no longer present. "
            : ""}
          {missingCount > 0
            ? `${missingCount} original part references are missing. `
            : ""}
          Only current actual members are shown; no replacement is inferred.
        </p>
      )}
      {context.error && (
        <p role="alert">
          Connection intent review is unavailable. Existing saved records have
          not changed.
        </p>
      )}
      {context.coverage && (
        <p className="small-note" data-testid="connection-review-summary">
          {parts.length} actual members · {noCurrentCount} without current task
          intent. {noIntentCount} have no plan or record; {startedCount} have
          started plans; {pendingCount} have pending details; {legacyCount} have
          quantity records without locations; {excludedCount} have
          changed/conflicting intent.
        </p>
      )}
      {fittedBlock && [fittedBlock.blockId, ...fittedBlock.endpoints].every((id) => isWood(project, id)) && (
        <div className="field-section" data-testid="fitted-block-end-connections">
          <h4>Plan both ends of {partLabel(project, fittedBlock.blockId)}</h4>
          <p className="small-note">The stock is added. Choose the fastening details for each end.</p>
          {fittedBlock.endpoints.map((id, index) => (
            <button key={id} type="button" className="button secondary full" onClick={() => planPair(fittedBlock.blockId, id)}>
              Plan end {index + 1}: {partLabel(project, fittedBlock.blockId)} to {partLabel(project, id)}
            </button>
          ))}
        </div>
      )}
      <BanquetteConstructionReview project={project} memberIds={memberIds} ownerId={scope.ownerId}
        focusedEntryId={constructionEntryId} onEntryChange={onConstructionEntryChange}
        onReviewPlan={(kind, id) => { const intent = context.coverage?.intents.find((row) => row.kind === kind && row.planId === id); if (intent) onReviewIntent(intent); }}
        onInspectPiece={onInspectPiece} seatSpanActions={seatSpanActions} onPlanPair={planPair} onPlanConnectorPair={onPlanConnectorPair} />
      <GreenhouseConnectionsPanel
        project={project}
        memberIds={memberIds}
        intents={context.coverage?.intents ?? []}
        initiallyOpen={!!scope.roofEntryId}
        entryId={scope.roofEntryId}
        onPlanPair={planPair}
        onReviewIntent={onReviewIntent}
      />
      <GreenhouseBasePanel project={project} memberIds={memberIds} intents={context.coverage?.intents ?? []}
        entryId={scope.baseEntryId ?? (scope.stageKey === "base" ? scope.ownerId : undefined)}
        onPlanPair={planPair} onReviewIntent={onReviewIntent} onInspectPiece={onInspectPiece} adjustment={baseRailAdjustment} onMeasureFoundation={onMeasureFoundation} />
      <FloorBaseConnectionsPanel project={project} memberIds={memberIds} ownerId={scope.ownerId}
        intents={context.coverage?.intents ?? []} onPlanPair={planPair} onReviewIntent={onReviewIntent} onInspectPiece={onInspectPiece}
        onSaveHangers={onSaveHangers} />
      <BearingConnectionsPanel
        key={scopeKey}
        project={project}
        pairs={globalScope ? bearingReview.pairs : bearingReview.pairs.filter(({ top, base }) => memberSet.has(top.id) || memberSet.has(base.id))}
        withoutContact={globalScope ? bearingReview.withoutContact : bearingReview.withoutContact.filter(({ topId, baseId }) => memberSet.has(topId) || memberSet.has(baseId))}
        focused={!!scope.bearingPartId}
        onPlan={planPair}
        onReview={onReviewIntent}
        onSaveDecision={onSaveBearingDecision}
        onClearDecision={onClearBearingDecision}
        onTestRemoval={onTestRemoval}
      />
      <div className="field-section">
        <h4>Actual parts</h4>
        {parts.slice(0, partLimit).map((part) => (
          <div
            key={part.pieceId}
            style={{ padding: "8px 0", borderBottom: "1px solid #e6e5dc" }}
            data-review-part-id={part.pieceId}
            data-coverage-state={part.state}
          >
            <strong>
              {part.label} · {part.name}
            </strong>
            <p className="small-note">
              {part.state === "missing"
                ? "No intent for this part’s task"
                : connectionStateText[part.state]}
              {part.excludedIntentIds.length > 0 &&
                part.state !== "stale" &&
                part.state !== "conflict" &&
                " · Also has changed/conflicting intent to review"}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="text-button"
                onClick={() => onInspectPiece(part.pieceId)}
              >
                Inspect {part.label}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setAnchorId(part.pieceId)}
              >
                Nearby faces for {part.label}
              </button>
            </div>
          </div>
        ))}
        {parts.length > partLimit && (
          <button
            type="button"
            className="text-button"
            onClick={() => setPartLimit((limit) => limit + 12)}
          >
            Show {Math.min(12, parts.length - partLimit)} more parts
          </button>
        )}
        {!memberIds.length && (
          <p className="small-note">
            No active members remain in this scope. Choose the actual parts or a
            current stage before planning a connection.
          </p>
        )}
      </div>
      <div className="field-section">
        <h4>Nearby wood faces</h4>
        <label className="field">
          Inspect around
          <select
            aria-label="Connection contact focus"
            value={anchorId}
            onChange={(event) => setAnchorId(event.target.value)}
          >
            <option value="">All members in this view</option>
            {memberIds.map((id) => (
              <option key={id} value={id}>
                {optionText(id)}
              </option>
            ))}
          </select>
        </label>
        <p className="small-note">
          Search within 0.125 in of opposite retained wood faces. The measured
          model gap is not a fit allowance, hole location or required fixing
          pattern.
        </p>
        {neighbors?.pairs.slice(0, pairLimit).map((pair) => {
          const aId = pair.bId === anchorId ? pair.bId : pair.aId,
            bId = aId === pair.aId ? pair.bId : pair.aId,
            existing = scopedIntents.filter(
              (intent) =>
                intent.pieceIds.includes(aId) && intent.pieceIds.includes(bId),
            );
          return (
            <div
              className="field-section"
              key={`${pair.aId}/${pair.bId}`}
              data-contact-a-id={aId}
              data-contact-b-id={bId}
              data-contact-state={pair.state}
            >
              <strong>
                {partLabel(project, aId)} ↔ {partLabel(project, bId)}
              </strong>
              <p className="small-note">
                {contactText[pair.state]} · modeled gap{" "}
                {pair.gap === null ? "unknown" : formatPreciseInches(pair.gap)}.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onInspectPiece(aId)}
                >
                  Inspect {partLabel(project, aId)}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onInspectPiece(bId)}
                >
                  Inspect {partLabel(project, bId)}
                </button>
              </div>
              {!!existing.length && (
                <p className="small-note">
                  Recorded intent:{" "}
                  {[
                    ...new Set(
                      existing.map(
                        (intent) =>
                          `${intent.label} · ${connectionStateText[intent.state]}`,
                      ),
                    ),
                  ].join("; ")}
                  . This does not cover every joint on either member.
                </p>
              )}
              <button
                type="button"
                className="button secondary small"
                onClick={() => planPair(aId, bId)}
              >
                Plan wood screws for {partLabel(project, aId)} and{" "}
                {partLabel(project, bId)}
              </button>
              {onPlanConnectorPair && frameMember(aId) && frameMember(bId) && (
                <button type="button" className="text-button" onClick={() => onPlanConnectorPair(aId, bId)}>
                  Plan A21Z connector for {partLabel(project, aId)} and {partLabel(project, bId)}
                </button>
              )}
              {onFitStockBetween && <button type="button" className="text-button" onClick={() => onFitStockBetween(aId, bId)}>
                Fit stock between {partLabel(project, aId)} and {partLabel(project, bId)}
              </button>}
            </div>
          );
        })}
        {neighbors && neighbors.pairs.length > pairLimit && (
          <button
            type="button"
            className="text-button"
            onClick={() => setPairLimit((limit) => limit + 6)}
          >
            Show {Math.min(6, neighbors.pairs.length - pairLimit)} more face
            pairs
          </button>
        )}
        {neighbors && !neighbors.pairs.length && (
          <p className="small-note">
            No opposite retained wood faces were found in this search. This does
            not establish that the assembly is joined; inspect gaps, edges and
            the intended detail.
          </p>
        )}
        {neighbors?.issues.length ? (
          <details>
            <summary>Placement conflicts ({neighbors.issueCount})</summary>
            {neighbors.issues.map((pair) => (
              <div key={`${pair.aId}/${pair.bId}`}>
                <p className="small-note">
                  {partLabel(project, pair.aId)} ↔{" "}
                  {partLabel(project, pair.bId)} · {pair.reason}
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onInspectPiece(pair.aId)}
                >
                  Inspect {partLabel(project, pair.aId)}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onInspectPiece(pair.bId)}
                >
                  Inspect {partLabel(project, pair.bId)}
                </button>
              </div>
            ))}
          </details>
        ) : null}
        {neighbors && (neighbors.truncated || !neighbors.complete) && (
          <p role="status" className="small-note">
            Showing {Math.min(pairLimit, neighbors.pairs.length)} of{" "}
            {neighbors.candidateCount} found pairs and {neighbors.issues.length}{" "}
            of {neighbors.issueCount} overlap findings; {neighbors.checkedPairs}{" "}
            pairs checked. Results are limited.
            {!neighbors.complete &&
              " Not every candidate pair was examined."}{" "}
            Focus one actual part to narrow the review.
          </p>
        )}
        {!!neighbors?.unsupportedPieceIds.length && (
          <p className="small-note">
            Wood-face search is unavailable for{" "}
            {neighbors.unsupportedPieceIds
              .map((id) => partLabel(project, id))
              .join(", ")}
            . Those materials need their own attachment detail; no generic screw
            plan is inferred.
          </p>
        )}
        {!neighbors && (
          <p className="small-note">
            The nearby-face review is unavailable for this scope. Saved intent
            remains unchanged.
          </p>
        )}
      </div>
      <details className="field-section">
        <summary>Choose another actual wood pair</summary>
        <label className="field">
          Entry-side part in this view
          <select
            aria-label="Connection first actual part"
            value={firstId}
            onChange={(event) => {
              setFirstId(event.target.value);
              if (event.target.value === secondId) setSecondId("");
            }}
          >
            <option value="">Choose an actual wood member…</option>
            {firstChoices.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {optionText(piece.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Receiving wood part
          <select
            aria-label="Connection second actual part"
            value={secondId}
            onChange={(event) => setSecondId(event.target.value)}
          >
            <option value="">Choose the actual receiving member…</option>
            {wood
              .filter((piece) => piece.id !== firstId)
              .map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {optionText(piece.id)}
                </option>
              ))}
          </select>
        </label>
        {chosen && (
          <p className="small-note">
            {contactText[chosen.state]}
            {chosen.gap === null
              ? ""
              : ` · modeled face gap ${formatPreciseInches(chosen.gap)}`}
            . {chosen.reason}
          </p>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={
            !firstId ||
            !secondId ||
            firstId === secondId ||
            !isWood(project, firstId) ||
            !isWood(project, secondId)
          }
          onClick={() => planPair(firstId, secondId)}
        >
          Open unsaved wood-screw draft
        </button>
        {onPlanConnectorPair && <button type="button" className="text-button"
          disabled={!firstId || !secondId || firstId === secondId || !frameMember(firstId) || !frameMember(secondId)}
          onClick={() => onPlanConnectorPair(firstId, secondId)}>Open unsaved A21Z connector draft</button>}
        {onFitStockBetween && <button type="button" className="button secondary full"
          disabled={!firstId || !secondId || firstId === secondId || !isWood(project, firstId) || !isWood(project, secondId)}
          onClick={() => onFitStockBetween(firstId, secondId)}>Fit stock between selected members</button>}
        {!firstChoices.length && (
          <p className="small-note">
            This view has no active wood member for a wood-to-wood plan. Inspect
            its actual material and record the appropriate installation detail.
          </p>
        )}
      </details>
      <details className="field-section" open={scopedIntents.length > 0}>
        <summary>Saved connection and support intent</summary>
        {scopedIntents.length ? (
          <ConnectionIntentSchedule
            project={project}
            intents={scopedIntents}
            onInspectPiece={onInspectPiece}
            onReviewIntent={onReviewIntent}
          />
        ) : (
          <p className="small-note">No intent is recorded for these members.</p>
        )}
      </details>
      <p className="small-note">
        A user guide checkmark, a purchase selection and an entered geometry
        review are different records. None marks this stage installed or
        strength-approved.
      </p>
    </section>
  );
}
