import { useMemo } from "react";
import type { Project } from "./model";
import { hardwareForJoint } from "./jointHardware";
import { formatPreciseInches } from "./measurement";
import { partLabel } from "./partLabels";
import {
  connectionCoverage,
  type ConnectionCoverage,
  type ConnectionIntent,
  type ConnectionIntentState,
} from "./connectionCoverage";

export type ConnectionReviewScope = {
  memberIds: readonly string[];
  title: string;
  ownerId?: string;
  stageKey?: string;
  stepId?: string;
  intentIds?: readonly string[];
  roofEntryId?: string;
  baseEntryId?: string;
  bearingPartId?: string;
  focusPair?: readonly [string, string];
  modeledContactList?: boolean;
};
export type ConnectionReviewActions = {
  onInspectPiece?: (id: string) => void;
  onReviewIntent?: (intent: ConnectionIntent) => void;
};
export const connectionStateText: Record<ConnectionIntentState, string> = {
  started: "Started · setup incomplete",
  pending: "Details pending",
  "geometry-reviewed": "Geometry reviewed",
  "legacy-record": "Quantity record only",
  stale: "References changed",
  conflict: "Conflicting or excluded",
};
const stateOrder: ConnectionIntentState[] = [
  "stale",
  "conflict",
  "started",
  "pending",
  "legacy-record",
  "geometry-reviewed",
];
const kindText: Record<ConnectionIntent["kind"], string> = {
  "legacy-joint": "Quantity record",
  "wood-fastener": "Wood-screw plan",
  "wood-glue": "Nonstructural glue plan",
  "angle-connector": "A21Z connector plan",
  "lid-hinge": "Lid-hinge plan",
  "shelf-pin": "Shelf support plan",
  restraint: "External restraint plan",
};
export function groupedConnectionIntents(intents: readonly ConnectionIntent[]) {
  const groups = new Map<string, ConnectionIntent[]>();
  for (const intent of intents) {
    const key = `${intent.kind}/${intent.planId}`,
      rows = groups.get(key) ?? [];
    rows.push(intent);
    groups.set(key, rows);
  }
  return [...groups].map(([id, rows]) => ({ id, rows, first: rows[0] }));
}
function memberText(
  project: Project,
  ids: readonly string[],
  separator = " ↔ ",
) {
  return [...new Set(ids)]
    .map((id) => {
      const piece = project.pieces.find(
        (part) => part.id === id && !part.offcut,
      );
      return `${partLabel(project, id)}${piece ? "" : " (missing)"}`;
    })
    .join(separator);
}
function taskContext(project: Project, rows: readonly ConnectionIntent[]) {
  const first = rows[0],
    tasks = [...new Set(rows.flatMap((row) => row.coveragePieceIds))],
    context = [...new Set(rows.flatMap((row) => row.pieceIds))].filter(
      (id) => !tasks.includes(id),
    ),
    targetText = memberText(project, tasks, ", "),
    contextText = memberText(project, context, ", ");
  if (first.kind === "lid-hinge")
    return `Lid task: ${targetText}; fixed-member context: ${contextText}.`;
  if (first.kind === "shelf-pin")
    return `Shelf support task: ${targetText}; side-mount context: ${contextText}.`;
  if (first.kind === "restraint")
    return "External restraint to wall; body joints remain separate.";
  if (first.kind === "angle-connector")
    return "One A21Z reference choice; entered wood paths only. Leaf/hole fit remains pending.";
  return null;
}
function quantityDescription(project: Project, intent: ConnectionIntent) {
  if (intent.kind !== "legacy-joint") return null;
  const joint = project.joints.find((row) => row.id === intent.planId);
  return joint
    ? `${joint.quantity} × ${hardwareForJoint(joint)?.name ?? `${joint.kind} · purchase size unresolved`}${joint.kind === "bracket" ? "; separate fasteners required" : ` · nominal ${formatPreciseInches(joint.length)}`}`
    : "Saved quantity record is missing";
}

/** Compact records grouped by plan; per-location states remain inspectable and are never summed as installation. */
export function ConnectionIntentSchedule({
  project,
  intents,
  printable = false,
  onInspectPiece,
  onReviewIntent,
}: {
  project: Project;
  intents: readonly ConnectionIntent[];
  printable?: boolean;
} & ConnectionReviewActions) {
  const groups = groupedConnectionIntents(intents);
  if (!groups.length) return null;
  return (
    <table
      className="guide-connection-table"
      style={{ width: "100%", tableLayout: "fixed", overflowWrap: "anywhere" }}
    >
      <thead>
        <tr>
          <th style={{ width: "28%" }}>Plan or record</th>
          <th style={{ width: "30%" }}>Actual members</th>
          <th>Current intent</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ id, rows, first }) => {
          const ids = [...new Set(rows.flatMap((row) => row.pieceIds))],
            label =
              first.kind === "legacy-joint"
                ? "Quantity record"
                : first.label.split("/")[0],
            counts = stateOrder
              .map((state) => ({
                state,
                count: rows.filter((row) => row.state === state).length,
              }))
              .filter((row) => row.count),
            quantity = quantityDescription(project, first),
            task = taskContext(project, rows),
            locations = rows.filter((row) => row.locationId !== null);
          return (
            <tr
              key={id}
              data-connection-kind={first.kind}
              data-connection-purpose={first.purpose}
              data-plan-id={first.planId}
              data-intent-count={rows.length}
            >
              <td>
                <strong>{label}</strong>
                <small>{kindText[first.kind]}</small>
                {printable ? (
                  <small>{first.name}</small>
                ) : (
                  <details className="connection-record-name">
                    <summary aria-label={`${label} full name: ${first.name}`}>
                      Full name
                    </summary>
                    <p>{first.name}</p>
                  </details>
                )}
                {!printable && onReviewIntent && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onReviewIntent(first)}
                  >
                    Review {label}
                  </button>
                )}
              </td>
              <td>
                {memberText(project, ids)}
                {rows.some((row) => row.external) && (
                  <small>→ external wall datum</small>
                )}
                {task && (
                  <small
                    className="connection-task-context"
                    data-connection-purpose={first.purpose}
                  >
                    {task}
                  </small>
                )}
                {!printable && onInspectPiece && (
                  <div>
                    {ids
                      .filter((pieceId) =>
                        project.pieces.some(
                          (piece) => piece.id === pieceId && !piece.offcut,
                        ),
                      )
                      .map((pieceId) => (
                        <button
                          type="button"
                          className="text-button"
                          key={pieceId}
                          onClick={() => onInspectPiece(pieceId)}
                        >
                          Inspect {partLabel(project, pieceId)}
                        </button>
                      ))}
                  </div>
                )}
              </td>
              <td>
                {counts.map(({ state, count }) => (
                  <div key={state} data-connection-state={state}>
                    {count > 1 ? `${count} · ` : ""}
                    {connectionStateText[state]}
                  </div>
                ))}
                {quantity && <small>{quantity}</small>}
                {first.kind !== "legacy-joint" && (
                  <small>
                    {first.kind === "angle-connector" ? `${locations.length} reference slots · ${rows.reduce((n, row) => n + row.explicitLocationCount, 0)} entered wood paths` : <>{locations.length} explicit{" "}{locations.length === 1 ? "location" : "locations"}</>}
                  </small>
                )}
                {!printable && (
                  <details>
                    <summary>Location states and findings</summary>
                    <ul>
                      {rows.map((row) => (
                        <li key={row.id}>
                          <strong>{row.label}</strong> ·{" "}
                          {connectionStateText[row.state]}
                          <small>Source review: {row.sourceState}.</small>
                          {row.issues.map((issue, index) => (
                            <small key={`${issue.code}/${index}`}>
                              {issue.message}
                            </small>
                          ))}
                          {onReviewIntent && row.locationId && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => onReviewIntent(row)}
                            >
                              Review {row.label}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Actual legacy/W/H/support/restraint intent at a stage; no automatic holes, purchases or installed state. */
export function GuideConnectionSchedule({
  project,
  stepId,
  printable = false,
  coverage: suppliedCoverage,
  onInspectPiece,
  onReviewIntent,
  onOpenConnections,
}: {
  project: Project;
  stepId: string;
  printable?: boolean;
  coverage?: ConnectionCoverage;
  onOpenConnections?: (scope: ConnectionReviewScope) => void;
} & ConnectionReviewActions) {
  const result = useMemo(() => {
    try {
      return {
        coverage: suppliedCoverage ?? connectionCoverage(project),
        error: false,
      };
    } catch {
      return { coverage: null, error: true };
    }
  }, [project, suppliedCoverage]);
  const step = project.steps.find((row) => row.id === stepId);
  if (!step) return null;
  if (result.error || !result.coverage)
    return (
      <p className="small-note">
        Connection intent review is unavailable. Saved records are retained.
      </p>
    );
  const coverage = result.coverage,
    generated = step.generated,
    matchingStages = coverage.stages.filter((row) =>
      generated?.kind === "assembly-stage"
        ? row.ownerId === generated.planId && row.key === generated.stageKey
        : row.stepId === stepId,
    ),
    stage = matchingStages.length === 1 ? matchingStages[0] : null,
    stageIntents = new Set(
      matchingStages.flatMap((row) => [
        ...row.intentIds,
        ...row.externalIntentIds,
      ]),
    ),
    kindForStep = {
      "wood-fastener-preparation": "wood-fastener",
      "lid-hinge-preparation": "lid-hinge",
      "connector-preparation": "angle-connector",
      "shelf-pin-preparation": "shelf-pin",
      "restraint-preparation": "restraint",
    } as const,
    preparationKind =
      generated && generated.kind in kindForStep
        ? kindForStep[generated.kind as keyof typeof kindForStep]
        : null,
    intents = coverage.intents.filter(
      (row) =>
        stageIntents.has(row.id) ||
        (generated?.kind !== "assembly-stage" && row.stepId === stepId) ||
        (!!preparationKind &&
          row.kind === preparationKind &&
          row.planId === generated!.planId),
    ),
    memberIds = [
      ...new Set(
        matchingStages.length
          ? matchingStages.flatMap((row) => row.memberIds)
          : generated?.kind === "assembly-stage"
            ? generated.memberIds
            : [
                ...project.pieces
                  .filter((piece) => piece.stepId === stepId && !piece.offcut)
                  .map((piece) => piece.id),
                ...intents.flatMap((row) => row.pieceIds),
              ],
      ),
    ],
    scope: ConnectionReviewScope = {
      memberIds,
      title: stage?.title ?? step.title,
      stepId,
      ...(stage
        ? { ownerId: stage.ownerId, stageKey: stage.key }
        : generated?.kind === "assembly-stage"
          ? { ownerId: generated.planId, stageKey: generated.stageKey }
          : {}),
      intentIds: intents.map((row) => row.id),
    },
    groupCount = groupedConnectionIntents(intents).length,
    countParts = (
      field:
        | "noCurrentIntentPartIds"
        | "startedPartIds"
        | "pendingPartIds"
        | "legacyPartIds"
        | "excludedPartIds",
    ) => new Set(matchingStages.flatMap((row) => row[field])).size;
  if (!stage && !intents.length && !memberIds.length) return null;
  const body = (
    <>
      {intents.length ? (
        <ConnectionIntentSchedule
          project={project}
          intents={intents}
          printable={printable}
          onInspectPiece={onInspectPiece}
          onReviewIntent={onReviewIntent}
        />
      ) : (
        <p className="small-note">
          No connection, support or restraint intent is recorded for these
          parts.
        </p>
      )}
      {matchingStages.length > 0 && (
        <p className="small-note" data-testid="stage-connection-coverage">
          {countParts("noCurrentIntentPartIds")} parts have no current
          attachment intent · {countParts("startedPartIds")} have started plans
          · {countParts("pendingPartIds")} have pending details ·{" "}
          {countParts("legacyPartIds")} have quantity records without locations
          · {countParts("excludedPartIds")} need changed/conflicting intent
          review.
        </p>
      )}
      {!printable && onOpenConnections && (
        <button
          type="button"
          className="button secondary full"
          onClick={() => onOpenConnections(scope)}
        >
          Review connections for this stage
        </button>
      )}
      {!printable && (
        <p className="small-note">
          Recorded intent and geometry checks are separate from installed work
          and joint strength. A plan reference does not cover every joint on a
          part.
        </p>
      )}
    </>
  );
  return printable ? (
    <div className="guide-connections">
      <h4>Connections and supports</h4>
      {body}
    </div>
  ) : (
    <details className="guide-connections">
      <summary>
        Connections and supports · {groupCount}{" "}
        {groupCount === 1 ? "plan/record" : "plans/records"}
      </summary>
      {body}
    </details>
  );
}
