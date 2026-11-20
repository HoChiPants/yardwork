import type { Project } from "./model";
import {
  connectionCoverage,
  type ConnectionCoverage,
} from "./connectionCoverage";
import { CONNECTION_REVIEW_SCOPE } from "./connectionGuide";

const headers = [
  "Record type",
  "Record ID",
  "Stage owner ID",
  "Stage key",
  "Stage title",
  "Associated stage scopes",
  "Actual part labels",
  "Actual part IDs",
  "Intent IDs",
  "Intent kind",
  "Purpose",
  "Plan ID",
  "Plan or location label",
  "Plan name",
  "Location ID",
  "Current internal intent",
  "State",
  "Source state",
  "Explicit-location records",
  "Legacy recorded quantity (unlocated)",
  "Legacy record kind",
  "Task part labels",
  "Task part IDs",
  "Context part labels",
  "Context part IDs",
  "Step ID",
  "External association",
  "External location ID",
  "Wall datum recorded",
  "Wall substrate",
  "Issues or review",
  "Scope",
] as const;
type Row = Partial<Record<(typeof headers)[number], unknown>>;
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
function cell(value: unknown): string {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
/** Review/export ledger only. No coordinates, automatic purchase totals or newly placed connection records. */
export function connectionCoverageCsv(
  project: Project,
  coverage: ConnectionCoverage = connectionCoverage(project),
): string {
  const rows: Row[] = [
      {
        "Record type": "summary",
        "Record ID": "connection-intent-review",
        "Issues or review": `${coverage.summary.activeParts} actual parts; ${coverage.summary.noCurrentIntentParts} have no current internal task intent. Counts describe saved intent, not installation completeness.`,
        Scope: CONNECTION_REVIEW_SCOPE,
      },
    ],
    byPart = new Map(coverage.parts.map((part) => [part.pieceId, part])),
    byIntent = new Map(coverage.intents.map((intent) => [intent.id, intent]));
  const label = (id: string) =>
    byPart.get(id)?.label ??
    `${project.partLabels.find((row) => row.partId === id)?.label ?? id} (missing/offcut)`;
  const partLabels = (ids: readonly string[]) =>
      unique(ids).map(label).join(" | "),
    ids = (values: readonly string[]) => unique(values).join(" | ");
  for (const intent of coverage.intents) {
    const stage = intent.coveragePieceIds
        .map((id) =>
          coverage.stages.find((stage) => stage.memberIds.includes(id)),
        )
        .find((stage) => !!stage),
      context = intent.pieceIds.filter(
        (id) => !intent.coveragePieceIds.includes(id),
      ),
      joint =
        intent.kind === "legacy-joint"
          ? project.joints.find((joint) => joint.id === intent.planId)
          : undefined;
    rows.push({
      "Record type": "intent",
      "Record ID": intent.id,
      "Stage owner ID": stage?.ownerId,
      "Stage key": stage?.key,
      "Stage title": stage?.title,
      "Associated stage scopes": coverage.stages
        .filter((stage) =>
          intent.pieceIds.some((id) => stage.memberIds.includes(id)),
        )
        .map((stage) => `${stage.ownerId}/${stage.key}`)
        .join(" | "),
      "Actual part labels": partLabels(intent.pieceIds),
      "Actual part IDs": ids(intent.pieceIds),
      "Intent IDs": intent.id,
      "Intent kind": intent.kind,
      Purpose: intent.purpose,
      "Plan ID": intent.planId,
      "Plan or location label": intent.label,
      "Plan name": intent.name,
      "Location ID": intent.locationId,
      "Current internal intent":
        intent.purpose === "external-restraint"
          ? "external association only"
          : intent.current
            ? "yes (intent only)"
            : "no",
      State: intent.state,
      "Source state": intent.sourceState,
      "Explicit-location records": intent.explicitLocationCount,
      "Legacy recorded quantity (unlocated)": joint?.quantity,
      "Legacy record kind": joint?.kind,
      "Task part labels": partLabels(intent.coveragePieceIds),
      "Task part IDs": ids(intent.coveragePieceIds),
      "Context part labels": partLabels(context),
      "Context part IDs": ids(context),
      "Step ID": intent.stepId,
      "External association":
        intent.purpose === "external-restraint"
          ? "wall association; no wall part node"
          : "",
      "External location ID": intent.external?.locationId,
      "Wall datum recorded": intent.external
        ? intent.external.wallEyeWorld
          ? "yes"
          : "no"
        : "",
      "Wall substrate": intent.external?.substrate,
      "Issues or review": intent.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join(" | "),
      Scope: CONNECTION_REVIEW_SCOPE,
    });
  }
  for (const gap of coverage.gaps) {
    const stage = coverage.stages.find(
      (stage) => stage.ownerId === gap.ownerId && stage.key === gap.stageKey,
    );
    rows.push({
      "Record type": "gap",
      "Record ID": gap.id,
      "Stage owner ID": gap.ownerId,
      "Stage key": gap.stageKey,
      "Stage title": stage?.title,
      "Associated stage scopes": stage ? `${stage.ownerId}/${stage.key}` : "",
      "Actual part labels": partLabels(gap.pieceIds),
      "Actual part IDs": ids(gap.pieceIds),
      "Intent IDs": ids(gap.intentIds),
      State: gap.kind,
      "Issues or review": gap.title,
      Scope: CONNECTION_REVIEW_SCOPE,
    });
  }
  for (const component of coverage.components) {
    rows.push({
      "Record type": "intent-group",
      "Record ID": component.id,
      "Associated stage scopes": coverage.stages
        .filter((stage) =>
          component.pieceIds.some((id) => stage.memberIds.includes(id)),
        )
        .map((stage) => `${stage.ownerId}/${stage.key}`)
        .join(" | "),
      "Actual part labels": partLabels(component.pieceIds),
      "Actual part IDs": ids(component.pieceIds),
      "Intent IDs": ids(component.intentIds),
      "Issues or review": component.intentIds.length
        ? "Current saved internal intent relationships only; not physical support or strength."
        : "No current internal intent-group edge. Contact is reviewed separately.",
      Scope: CONNECTION_REVIEW_SCOPE,
    });
  }
  // Rows identify source records individually. Shared endpoint/product identities never prove duplicate physical hardware.
  for (const row of rows)
    if (row["Intent IDs"])
      for (const id of String(row["Intent IDs"]).split(" | "))
        if (!byIntent.has(id))
          throw Error(
            `The supplied connection review contains an unknown intent identifier: ${id}`,
          );
  return (
    [
      headers.map(cell).join(","),
      ...rows.map((row) =>
        headers.map((header) => cell(row[header])).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
