import type { Project, V3 } from "./model";
import { attachmentReviews } from "./attachments";
import { nominalShelfPinBore } from "./attachmentSchema";
import { partLabel } from "./partLabels";

const headers = [
  "Plan ID",
  "Plan name",
  "Design entry ID",
  "Product ID",
  "Plan state",
  "Point ID",
  "Point state",
  "Coordinate status",
  "Shelf role",
  "Shelf name",
  "Shelf part ID",
  "Shelf section ID",
  "Mount role",
  "Mount name",
  "Mount part ID",
  "Mount section ID",
  "Side",
  "Row",
  "Mount face",
  "Nominal 5 mm bore (in)",
  "Bearing target mount-local X (in)",
  "Bearing target mount-local Y (in)",
  "Bearing target mount-local Z (in)",
  "Shelf anchor local X (in)",
  "Shelf anchor local Y (in)",
  "Shelf anchor local Z (in)",
  "Computed hole mount-local X (in)",
  "Computed hole mount-local Y (in)",
  "Computed hole mount-local Z (in)",
  "Computed hole world X (in)",
  "Computed hole world Y (in)",
  "Computed hole world Z (in)",
  "Inward drill axis world X (unitless)",
  "Inward drill axis world Y (unitless)",
  "Inward drill axis world Z (unitless)",
  "32 mm row index",
  "Layout system",
  "Front inset (in)",
  "Rear inset (in)",
  "First-hole datum above side bottom (in)",
  "User pin insertion depth (in)",
  "User bearing reach (in)",
  "User signed bearing offset above axis (in)",
  "User full-diameter bore depth (in)",
  "User deepest drill-tip depth (in)",
  "User measurement basis",
  "User measured at",
  "Issues",
  "Scope",
  "Shelf label",
  "Mount label",
  "Hole above mount blank bottom (in)",
  "Hole inset from named blank front/rear edge (in)",
] as const;
const pending = "PENDING",
  excluded = "PENDING (excluded)";
const fixed = (value: number | null) =>
  value === null || !Number.isFinite(value) ? pending : value.toFixed(6);
const vector = (value: V3 | null, fallback = pending): string[] =>
  value === null ? [fallback, fallback, fallback] : value.map(fixed);
/** Keep user text inert when a spreadsheet opens the CSV; JSON retains the exact original. */
const userText = (value: string) =>
  /^\s*[=+@-]/.test(value) ? `'${value}` : value;
const csvRow = (values: readonly string[]) =>
  values.map((value) => `"${value.replace(/"/g, '""')}"`).join(",");

/** Reviewable attachment coordinates only; no stock demand, purchase row or installation approval. */
export function attachmentScheduleCsv(project: Project): string {
  const lines = [csvRow(headers)];
  for (const review of attachmentReviews(project)) {
    const plan = review.plan,
      blocked = review.state === "stale" || review.state === "conflict",
      measurements = plan.measurements;
    for (const point of plan.points) {
      const resolved = review.points.find((item) => item.point.id === point.id),
        local = !blocked ? (resolved?.holeCenterLocal ?? null) : null,
        world = !blocked ? (resolved?.holeCenterWorld ?? null) : null,
        candidate = local !== null && world !== null,
        coordinateStatus = blocked
          ? `EXCLUDED — ${review.state}`
          : candidate
            ? review.state === "needs-measurements"
              ? "candidate/pending"
              : "geometric-review-only"
            : pending,
        mount = project.pieces.find(
          (piece) => piece.id === point.mount.pieceId && !piece.offcut,
        ),
        height = local && mount ? local[1] + mount.size[1] / 2 : null,
        inset =
          local && mount
            ? point.row === "front"
              ? mount.size[2] / 2 - local[2]
              : local[2] + mount.size[2] / 2
            : null,
        issues = review.issues
          .map(
            (issue) =>
              `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}` +
              (issue.pointIds.length
                ? ` [points: ${issue.pointIds.join(", ")}]`
                : "") +
              (issue.pieceIds.length
                ? ` [parts: ${issue.pieceIds.join(", ")}]`
                : ""),
          )
          .join("\n");
      lines.push(
        csvRow([
          plan.id,
          userText(plan.name),
          plan.entryId,
          plan.productId,
          review.state,
          point.id,
          resolved?.state ?? review.state,
          coordinateStatus,
          userText(point.shelf.role),
          userText(point.shelf.name),
          point.shelf.pieceId,
          point.shelf.sectionId,
          userText(point.mount.role),
          userText(point.mount.name),
          point.mount.pieceId,
          point.mount.sectionId,
          point.side,
          point.row,
          `${["X", "Y", "Z"][point.mountFace.axis]}${point.mountFace.sign > 0 ? "+" : "-"}`,
          fixed(nominalShelfPinBore),
          ...vector(point.bearingTargetLocal),
          ...vector(point.shelfAnchorLocal),
          ...vector(local, blocked ? excluded : pending),
          ...vector(world, blocked ? excluded : pending),
          ...vector(
            candidate ? resolved!.drillDirectionWorld : null,
            blocked ? excluded : pending,
          ),
          !blocked &&
          resolved?.rowIndex !== null &&
          resolved?.rowIndex !== undefined
            ? String(resolved.rowIndex)
            : blocked
              ? excluded
              : pending,
          plan.layout.system,
          fixed(plan.layout.frontInset),
          fixed(plan.layout.rearInset),
          fixed(plan.layout.datumHeight),
          fixed(measurements.pinInsertionDepth),
          fixed(measurements.bearingReach),
          fixed(measurements.bearingOffset),
          fixed(measurements.fullDiameterBoreDepth),
          fixed(measurements.deepestDrillTipDepth),
          userText(measurements.basis),
          measurements.measuredAt ?? pending,
          issues,
          "Saved intent and geometric review only; not proof of drilled holes, installed supports, load capacity, anchorage adequacy or code/engineering approval. Numeric display rounds to six decimals. User text starting a spreadsheet formula is prefixed with an apostrophe; exact originals remain in project JSON.",
          partLabel(project, point.shelf.pieceId),
          partLabel(project, point.mount.pieceId),
          blocked ? excluded : fixed(height),
          blocked ? excluded : fixed(inset),
        ]),
      );
    }
  }
  return lines.join("\r\n");
}
