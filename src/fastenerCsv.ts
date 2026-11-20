import type { Project } from "./model";
import { fastenerReviews } from "./fastenings";
import { partLabel } from "./partLabels";

const cell = (value: unknown) => {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(Number(value.toFixed(6))) : "";
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function fastenerScheduleCsv(project: Project) {
  const rows: unknown[][] = [[
    "Plan label", "Plan name", "Location label", "Location name", "Product", "State",
    "Included provisional demand", "Head part label", "Receiver part label",
    "Plan ID", "Location ID", "Head part ID", "Receiver part ID",
    "Entrance local X (in)", "Entrance local Y (in)", "Entrance local Z (in)",
    "Drive local X (unit)", "Drive local Y (unit)", "Drive local Z (unit)",
    "Entrance world X (in)", "Entrance world Y (in)", "Entrance world Z (in)",
    "Head exit depth (in)", "Receiver entry depth (in)", "Receiver exit depth (in)",
    "Gap (in)", "Proposed surface-to-tip depth (in)", "Receiver tip-path penetration (in)",
    "Entered pilot diameter (in)", "Deepest pilot-drill-tip depth (in)",
    "User measurement basis", "Measured at", "Review issues", "Scope",
    "Recorded reference reviews", "Latest historical review at", "Latest historical review basis", "History scope",
  ]];
  for (const review of fastenerReviews(project))
    for (const item of review.locations) {
      const p = review.plan,
        candidate = item.includedInDemand && item.state !== "stale" && item.state !== "conflict",
        local = candidate ? item.location.entranceLocal : null,
        drive = candidate ? item.location.driveLocal : null,
        world = candidate ? item.entranceWorld : null;
      rows.push([
        p.label, p.name, `${p.label}/${item.location.label}`, item.location.name, p.productId, item.state,
        item.includedInDemand ? "yes (provisional)" : "no",
        partLabel(project, p.head.pieceId), partLabel(project, p.receiver.pieceId),
        p.id, item.location.id, p.head.pieceId, p.receiver.pieceId,
        ...[0, 1, 2].map((axis) => local?.[axis] ?? null),
        ...[0, 1, 2].map((axis) => drive?.[axis] ?? null),
        ...[0, 1, 2].map((axis) => world?.[axis] ?? null),
        candidate ? item.headExitDepth : null,
        candidate ? item.receiverEnterDepth : null,
        candidate ? item.receiverExitDepth : null,
        candidate ? item.gap : null,
        candidate ? p.measurements.surfaceToTipDepth : null,
        candidate ? item.penetration : null,
        candidate ? p.measurements.pilotDiameter : null,
        candidate ? p.measurements.pilotDepth : null,
        p.measurements.basis, p.measurements.measuredAt,
        [...new Set([...review.issues, ...item.issues].map((issue) => issue.message))].join("; "),
        "Candidate centerline and user measurements only; blank numeric fields are pending/excluded. No released pilot pattern, full-bore depth, thread engagement, installation, capacity or code approval.",
        p.referenceHistory.length,
        p.referenceHistory.at(-1)?.at ?? null,
        p.referenceHistory.at(-1)?.basis ?? null,
        "Historical provenance only. A recorded review is not necessarily the active mapping after Undo; earlier drilling values are retained only in editable JSON.",
      ]);
    }
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
