import type { Project } from "./model";
import { connectorReviews } from "./connectors";
import { partLabel } from "./partLabels";

function cell(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function connectorScheduleCsv(project: Project) {
  const rows: unknown[][] = [[
    "Plan label", "Plan name", "Product", "Schedule", "Plan state", "Entry label", "Entry name", "Assigned role", "Member label", "Member ID", "Plan ID", "Entry ID", "Entry state", "Included provisional connector", "Reference fasteners", "Current wood path",
    "Wood entry local X (in)", "Wood entry local Y (in)", "Wood entry local Z (in)", "Local drive X (unit)", "Local drive Y (unit)", "Local drive Z (unit)",
    "Wood entry world X (in)", "Wood entry world Y (in)", "Wood entry world Z (in)", "Available wood path (in)", "Measurement provenance current", "User wood-entry-to-tip depth (in)", "Entered pilot diameter (in)", "Deepest pilot-tip depth (in)", "User basis", "Measured at", "Review issues", "Reference history records", "Scope",
  ]];
  for (const review of connectorReviews(project)) for (const point of review.entries) {
    const plan = review.plan, entry = point.entry,
      usable = review.activeConnectorCount === 1 && point.includedInDemand && point.state !== "stale" && point.state !== "conflict";
    rows.push([
      plan.label, plan.name, plan.productId, plan.scheduleId, review.state, `${plan.label}/${entry.label}`, entry.name, entry.role, partLabel(project, point.memberId), point.memberId, plan.id, entry.id, point.state, review.activeConnectorCount, review.scheduledFastenerCount, usable ? "candidate only" : "pending/excluded",
      ...[0, 1, 2].map((axis) => usable ? entry.entranceLocal?.[axis] ?? null : null),
      ...[0, 1, 2].map((axis) => usable ? entry.driveLocal?.[axis] ?? null : null),
      ...[0, 1, 2].map((axis) => usable ? point.entranceWorld?.[axis] ?? null : null),
      usable ? point.availableWoodDepth : null, usable && point.measurementsCurrent ? "yes" : "no", usable && point.measurementsCurrent ? entry.measurements.woodEntryToTipDepth : null, usable && point.measurementsCurrent ? entry.measurements.pilotDiameter : null, usable && point.measurementsCurrent ? entry.measurements.pilotDepth : null,
      entry.measurements.basis, entry.measurements.measuredAt, [...new Set([...review.issues, ...point.issues].map((issue) => issue.message))].join("; "), plan.referenceHistory.length,
      "One assigned wood-member centerline per fastener. Reference2+2 quantity is not manufactured hole geometry, metal/head seating, fit, installed work, capacity or code approval. Blank numerical fields are pending/excluded; historical values remain only in editable JSON.",
    ]);
  }
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
