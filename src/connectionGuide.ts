import type { Project } from "./model";
import { banquetteConstructionMarkdown } from "./banquetteConstructionGuide";
import {
  connectionCoverage,
  type ConnectionCoverage,
  type ConnectionIntent,
  type ConnectionIntentState,
  type ConnectionStageCoverage,
} from "./connectionCoverage";

export const CONNECTION_REVIEW_SCOPE =
  "Saved connection-intent review only. Current geometry evidence, plan references and intent groups do not establish complete joinery, installed hardware, strength or code approval. Explicit-location records and legacy quantities are not a shopping takeoff or drilling/machine instructions.";
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const plain = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
const md = (value: string) =>
  plain(value).replace(/[\\`*_{}\[\]<>|!#]/g, "\\$&");
const states: ConnectionIntentState[] = [
  "stale",
  "conflict",
  "started",
  "pending",
  "legacy-record",
  "geometry-reviewed",
];
const stateLabel: Record<ConnectionIntentState, string> = {
  started: "started / setup incomplete",
  pending: "pending details",
  "geometry-reviewed": "geometry reviewed",
  "legacy-record": "legacy quantity record, unlocated",
  stale: "stale, excluded",
  conflict: "conflict, excluded",
};
const kindLabel: Record<ConnectionIntent["kind"], string> = {
  "legacy-joint": "Legacy pair record",
  "wood-fastener": "Wood-screw plan",
  "wood-glue": "Nonstructural glue plan",
  "angle-connector": "A21Z connector plan",
  "lid-hinge": "Lid-hinge plan",
  "shelf-pin": "Shelf support plan",
  restraint: "External restraint plan",
};
function label(project: Project, coverage: ConnectionCoverage, id: string) {
  const current = coverage.parts.find((part) => part.pieceId === id),
    reserved = project.partLabels.find((row) => row.partId === id)?.label;
  return (
    current?.label ??
    (reserved ? `${reserved} (missing/offcut)` : `Missing member ${id}`)
  );
}
function members(
  project: Project,
  coverage: ConnectionCoverage,
  ids: readonly string[],
) {
  return (
    unique(ids)
      .map((id) => label(project, coverage, id))
      .join(", ") || "No actual member selected"
  );
}
function groups(rows: readonly ConnectionIntent[]) {
  const map = new Map<string, ConnectionIntent[]>();
  for (const row of rows) {
    const key = `${row.kind}/${row.planId}`,
      items = map.get(key) ?? [];
    items.push(row);
    map.set(key, items);
  }
  return [...map.values()];
}
function planLabel(rows: readonly ConnectionIntent[]) {
  const first = rows[0];
  return first.kind === "wood-fastener" || first.kind === "lid-hinge" || first.kind === "angle-connector"
    ? first.label.split("/")[0]
    : kindLabel[first.kind];
}
function purpose(
  project: Project,
  coverage: ConnectionCoverage,
  rows: readonly ConnectionIntent[],
) {
  const first = rows[0],
    task = unique(rows.flatMap((row) => row.coveragePieceIds)),
    context = unique(rows.flatMap((row) => row.pieceIds)).filter(
      (id) => !task.includes(id),
    );
  if (first.kind === "angle-connector") return "A21Z mounting reference; entered wood paths only, leaf/hole fit pending";
  switch (first.purpose) {
    case "assembly":
      return "Assembly members";
    case "lid-mounting":
      return `Lid mounting: ${members(project, coverage, task)}; fixed ${members(project, coverage, context)} is context, not carcass joinery`;
    case "shelf-support":
      return `Shelf support: ${members(project, coverage, task)}; side mounts are context, not carcass joinery`;
    case "external-restraint":
      return `External restraint: ${members(project, coverage, task)} → wall datum; no internal assembly credit`;
  }
}
function stateSummary(rows: readonly ConnectionIntent[]) {
  return states
    .map((state) => ({
      state,
      count: rows.filter((row) => row.state === state).length,
    }))
    .filter((row) => row.count)
    .map((row) => `${row.count} ${stateLabel[row.state]}`)
    .join("; ");
}
function schedule(
  project: Project,
  coverage: ConnectionCoverage,
  rows: readonly ConnectionIntent[],
) {
  if (!rows.length)
    return "No connection, support or restraint intent is recorded for these actual members.";
  const out = [
    "| Plan or record | Purpose | Actual members | State | Explicit-location records |",
    "|---|---|---|---|---|",
  ];
  for (const group of groups(rows)) {
    const first = group[0],
      locationCount = group.reduce(
        (count, row) => count + row.explicitLocationCount,
        0,
      ),
      joint =
        first.kind === "legacy-joint"
          ? project.joints.find((joint) => joint.id === first.planId)
          : undefined;
    const count = joint
      ? `${locationCount}; separate legacy quantity ${joint.quantity} ${joint.kind} (unlocated)`
      : String(locationCount);
    const actual =
      members(
        project,
        coverage,
        group.flatMap((row) => row.pieceIds),
      ) + (group.some((row) => row.external) ? " → external wall datum" : "");
    out.push(
      `| ${md(`${planLabel(group)} · ${first.name}`)} | ${md(purpose(project, coverage, group))} | ${md(actual)} | ${md(stateSummary(group))} | ${md(count)} |`,
    );
  }
  return out.join("\n");
}
function stageCounts(stage: ConnectionStageCoverage) {
  return `${stage.memberIds.length} actual part(s); ${stage.noCurrentIntentPartIds.length} have no current internal task intent; ${stage.startedPartIds.length} have started plans; ${stage.pendingPartIds.length} have pending details; ${stage.excludedPartIds.length} have excluded intent. These counts can overlap and do not measure construction completeness.`;
}
function detailNotes(rows: readonly ConnectionIntent[]) {
  const out: string[] = [];
  for (const group of groups(rows)) {
    const issues = unique(
        group.flatMap((row) => row.issues.map((issue) => issue.message)),
      ),
      labels = unique(
        group.filter((row) => row.locationId).map((row) => row.label),
      );
    if (labels.length)
      out.push(
        `- ${md(planLabel(group))} saved location labels: ${labels.map(md).join(", ")}.`,
      );
    if (issues.length)
      out.push(`- ${md(planLabel(group))} review: ${issues.map(md).join(" ")}`);
  }
  return out;
}

/** One compact global report. Source records are grouped only by kind/plan ID, never by name or product. */
export function connectionCoverageMarkdown(
  project: Project,
  coverage: ConnectionCoverage = connectionCoverage(project),
): string {
  if (!coverage.parts.length && !coverage.intents.length) return "";
  const summary = coverage.summary,
    out = [
      "\n\n## Connection intent review",
      "",
      CONNECTION_REVIEW_SCOPE,
      "",
      `${summary.activeParts} actual part(s); ${summary.noCurrentIntentParts} have no current internal task intent. ${summary.startedIntents} started record(s), ${summary.pendingIntents} pending record(s), ${summary.geometryReviewedIntents} geometry-reviewed record(s), ${summary.legacyRecords} legacy pair record(s), ${summary.excludedIntents} excluded record(s). External restraint associations remain separate from internal assembly.`,
      "",
      schedule(project, coverage, coverage.intents),
      "",
      "Legacy quantities and typed locations remain separate source records. Matching parts or products do not prove physical duplicates, and the values must not be added into a purchase quantity.",
      "",
      ...detailNotes(coverage.intents),
      "",
      "### Reviews by assembly stage",
      "",
    ];
  for (const stage of coverage.stages) {
    out.push(`- **${md(stage.title)}**: ${md(stageCounts(stage))}`);
    const gaps = coverage.gaps.filter(
      (gap) => gap.ownerId === stage.ownerId && gap.stageKey === stage.key,
    );
    for (const gap of gaps)
      out.push(
        `  - ${md(gap.title)}${gap.pieceIds.length ? `: ${md(members(project, coverage, gap.pieceIds))}` : ""}.`,
      );
  }
  const unassigned = coverage.gaps.filter(
    (gap) =>
      !coverage.stages.some(
        (stage) => stage.ownerId === gap.ownerId && stage.key === gap.stageKey,
      ),
  );
  if (unassigned.length) {
    out.push("", "### Retained intent without a current stage member", "");
    for (const gap of unassigned) {
      const rows = coverage.intents.filter((row) =>
        gap.intentIds.includes(row.id),
      );
      out.push(
        `- ${md(gap.title)}: ${groups(rows)
          .map((group) => md(`${planLabel(group)} · ${group[0].name}`))
          .join("; ")}.`,
      );
    }
  }
  const linked = coverage.components.filter((group) => group.intentIds.length),
    isolated = coverage.components
      .filter((group) => !group.intentIds.length)
      .reduce((count, group) => count + group.pieceIds.length, 0);
  out.push(
    "",
    "### Intent groups",
    "",
    `${linked.length} internal intent group(s) contain recorded relationships; ${isolated} actual part(s) have no current internal intent-group edge. These are saved-reference groups, not physical-support or strength groups.`,
  );
  for (const group of linked)
    out.push(
      `- ${md(members(project, coverage, group.pieceIds))}: ${group.intentIds.length} current intent record(s).`,
    );
  return out.join("\n") + "\n" + banquetteConstructionMarkdown(project);
}

/** Uses current owner/key/member identity even when a saved guide is stale; it never changes step metadata. */
export function connectionStageMarkdown(
  project: Project,
  stepId: string,
  coverage: ConnectionCoverage = connectionCoverage(project),
): string {
  const step = project.steps.find((step) => step.id === stepId);
  if (!step) return "";
  const generated = step.generated;
  const stages =
    generated?.kind === "assembly-stage"
      ? coverage.stages.filter(
          (stage) =>
            stage.ownerId === generated.planId &&
            stage.key === generated.stageKey,
        )
      : coverage.stages.filter((stage) => stage.stepId === stepId);
  const memberIds = stages.length
    ? unique(stages.flatMap((stage) => stage.memberIds))
    : coverage.parts
        .filter((part) =>
          project.pieces.some(
            (piece) => piece.id === part.pieceId && piece.stepId === stepId,
          ),
        )
        .map((part) => part.pieceId);
  const referenced = new Set(stages.flatMap((stage) => stage.intentIds));
  const rows = coverage.intents.filter(
    (row) =>
      referenced.has(row.id) ||
      row.stepId === stepId ||
      (!stages.length && row.pieceIds.some((id) => memberIds.includes(id))),
  );
  if (!memberIds.length && !rows.length) return "";
  const out = [
    "",
    "### Connections and supports",
    "",
    schedule(project, coverage, rows),
  ];
  for (const stage of stages) {
    out.push(
      "",
      ...(stages.length > 1 ? [`**${md(stage.title)}**`] : []),
      stageCounts(stage),
    );
    for (const gap of coverage.gaps.filter(
      (gap) => gap.ownerId === stage.ownerId && gap.stageKey === stage.key,
    ))
      out.push(
        `- ${md(gap.title)}${gap.pieceIds.length ? `: ${md(members(project, coverage, gap.pieceIds))}` : ""}.`,
      );
  }
  const outside = unique(rows.flatMap((row) => row.pieceIds)).filter(
    (id) => !memberIds.includes(id),
  );
  if (memberIds.length && outside.length)
    out.push(
      "",
      `Also references members outside this stage: ${md(members(project, coverage, outside))}. Their own assembly tasks remain separate reviews.`,
    );
  out.push("", ...detailNotes(rows), "", CONNECTION_REVIEW_SCOPE);
  return out.join("\n") + "\n";
}
