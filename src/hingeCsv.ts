import type { Project } from "./model";
import { lidHingeReviews, hingePurchaseAllocations } from "./hinges";
import { hingeDrillCandidate } from "./hingeGuide";
import { hingePurchaseSummary } from "./hingePurchases";
import { reviewHingeStock } from "./hingeStock";
import { partLabel } from "./partLabels";

const headers = [
  "Record type",
  "Plan label",
  "Plan name",
  "Plan ID",
  "Product",
  "Plan state",
  "Location label",
  "Location name",
  "Location ID",
  "Leaf",
  "Member label",
  "Member ID",
  "Numeric status",
  "Entrance local X (in)",
  "Entrance local Y (in)",
  "Entrance local Z (in)",
  "Drive local X (unit)",
  "Drive local Y (unit)",
  "Drive local Z (unit)",
  "Entrance world X (in)",
  "Entrance world Y (in)",
  "Entrance world Z (in)",
  "Seated tip world X (in)",
  "Seated tip world Y (in)",
  "Seated tip world Z (in)",
  "Pilot tip world X (in)",
  "Pilot tip world Y (in)",
  "Pilot tip world Z (in)",
  "Entered surface-to-tip depth (in)",
  "Entered pilot diameter (in)",
  "Deepest pilot-drill-tip depth (in)",
  "Available retained ray depth (in)",
  "Moving axis A local X (in)",
  "Moving axis A local Y (in)",
  "Moving axis A local Z (in)",
  "Moving axis B local X (in)",
  "Moving axis B local Y (in)",
  "Moving axis B local Z (in)",
  "Fixed axis A local X (in)",
  "Fixed axis A local Y (in)",
  "Fixed axis A local Z (in)",
  "Fixed axis B local X (in)",
  "Fixed axis B local Y (in)",
  "Fixed axis B local Z (in)",
  "User hole basis",
  "Hole measured at",
  "User axis basis",
  "Axis measured at",
  "Hardware observation",
  "Hardware basis",
  "Hardware measured at",
  "Source ID",
  "Segment ID",
  "Source usable length (in)",
  "Segment start (in)",
  "Segment length (in)",
  "Start end identity",
  "End end identity",
  "Allocated plan labels",
  "Cut ID",
  "Kerf start (in)",
  "Metal kerf (in)",
  "User stock/cut basis",
  "Stock/cut measured at",
  "Review issues",
  "Notes",
  "Scope",
] as const;
type Row = Partial<Record<(typeof headers)[number], unknown>>;
const scope =
  "User-entered candidate datums only; blank numeric fields are pending/excluded. No manufactured hole pattern, collar/full-bore setting, thread engagement, installed mesh, fastening capacity or installation approval. Stock records are not extra shopping rows.";
const cell = (value: unknown): string => {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

/** Separate rectangular drilling/source schedule. Never an additional material purchase CSV. */
export function hingeScheduleCsv(project: Project): string {
  const rows: Row[] = [],
    reviews = lidHingeReviews(project),
    purchases = hingePurchaseSummary(
      project,
      hingePurchaseAllocations(project),
    );
  for (const review of reviews) {
    const p = review.plan,
      planCandidate = hingeDrillCandidate(review);
    for (const item of review.locations.length ? review.locations : [null]) {
      const location = item?.location,
        m = location?.measurements,
        active =
          planCandidate &&
          !!item &&
          item.state !== "stale" &&
          item.state !== "conflict",
        hostId =
          location?.leaf === "moving"
            ? p.moving.pieceId
            : location?.leaf === "fixed"
              ? p.fixed.pieceId
              : null;
      const row: Row = {
        "Record type": location ? "hole" : "pending-plan",
        "Plan label": p.label,
        "Plan name": p.name,
        "Plan ID": p.id,
        Product: p.productId,
        "Plan state": review.state,
        "Location label": location ? `${p.label}/${location.label}` : null,
        "Location name": location?.name,
        "Location ID": location?.id,
        Leaf: location?.leaf,
        "Member label": hostId ? partLabel(project, hostId) : null,
        "Member ID": hostId,
        "Numeric status": active
          ? `${item!.state}: candidate/pending review`
          : "PENDING/excluded; active drilling coordinates withheld",
        "User hole basis": m?.basis,
        "Hole measured at": m?.measuredAt,
        "User axis basis": p.axis.basis,
        "Axis measured at": p.axis.measuredAt,
        "Hardware observation": p.hardware.description,
        "Hardware basis": p.hardware.basis,
        "Hardware measured at": p.hardware.measuredAt,
        "Source ID": p.stockAllocation?.sourceId,
        "Segment ID": p.stockAllocation?.segmentId,
        "Review issues": [
          ...new Set(
            [...review.issues, ...(item?.issues ?? [])].map(
              (issue) => issue.message,
            ),
          ),
        ].join("; "),
        Notes: p.notes,
        Scope: scope,
      };
      const vectors = [
        ["Entrance local", "in", active ? location!.entranceLocal : null],
        ["Drive local", "unit", active ? location!.driveLocal : null],
        ["Entrance world", "in", active ? item!.entranceWorld : null],
        ["Seated tip world", "in", active ? item!.tipWorld : null],
        ["Pilot tip world", "in", active ? item!.pilotTipWorld : null],
        ["Moving axis A local", "in", planCandidate ? p.axis.movingA : null],
        ["Moving axis B local", "in", planCandidate ? p.axis.movingB : null],
        ["Fixed axis A local", "in", planCandidate ? p.axis.fixedA : null],
        ["Fixed axis B local", "in", planCandidate ? p.axis.fixedB : null],
      ] as const;
      for (const [prefix, unit, value] of vectors)
        ["X", "Y", "Z"].forEach((axis, index) => {
          row[`${prefix} ${axis} (${unit})` as keyof Row] =
            value?.[index] ?? null;
        });
      row["Entered surface-to-tip depth (in)"] = active
        ? m?.surfaceToTipDepth
        : null;
      row["Entered pilot diameter (in)"] = active ? m?.pilotDiameter : null;
      row["Deepest pilot-drill-tip depth (in)"] = active ? m?.pilotDepth : null;
      row["Available retained ray depth (in)"] = active
        ? item?.availableDepth
        : null;
      rows.push(row);
    }
  }
  for (const source of project.hingeStockSources) {
    const review = reviewHingeStock(source),
      sourceRow = purchases.sourceRows.find(
        (row) => row.sourceId === source.id,
      ),
      common: Row = {
        Product: source.productId,
        "Source ID": source.id,
        "Source usable length (in)": source.usableLength,
        "Plan state": review.state,
        "User stock/cut basis": source.basis,
        "Stock/cut measured at": source.measuredAt,
        "Review issues": review.issues.map((issue) => issue.message).join("; "),
        Notes: source.notes,
        Scope: scope,
      };
    for (const segment of review.segments) {
      const allocated = sourceRow?.segments.find(
          (s) => s.id === segment.id,
        )?.allocated,
        labels = reviews
          .filter(
            (r) =>
              r.plan.stockAllocation?.sourceId === source.id &&
              r.plan.stockAllocation.segmentId === segment.id,
          )
          .map((r) => r.plan.label);
      rows.push({
        ...common,
        "Record type": "hinge-segment",
        "Segment ID": segment.id,
        "Numeric status": allocated
          ? "allocated retained source interval"
          : "unallocated remnant; no new purchase",
        "Segment start (in)": segment.start,
        "Segment length (in)": segment.length,
        "Start end identity": `${segment.startEnd.kind}${segment.startEnd.cutId ? `:${segment.startEnd.cutId}` : ""}`,
        "End end identity": `${segment.endEnd.kind}${segment.endEnd.cutId ? `:${segment.endEnd.cutId}` : ""}`,
        "Allocated plan labels": allocated ? labels.join("; ") : "",
      });
    }
    for (const cut of source.cuts)
      rows.push({
        ...common,
        "Record type": "hinge-cut",
        "Cut ID": cut.id,
        "Kerf start (in)": cut.position,
        "Metal kerf (in)": cut.kerf,
        "User stock/cut basis": cut.basis,
        "Stock/cut measured at": cut.measuredAt,
        "Numeric status":
          review.state === "geometry-reviewed"
            ? "entered measured cut interval"
            : "PENDING/conflicted source layout; do not cut from this schedule",
      });
    if (!review.segments.length && !source.cuts.length)
      rows.push({
        ...common,
        "Record type": "pending-source",
        "Numeric status":
          "PENDING source measurements; no retained segments derived",
      });
  }
  return (
    [
      headers.map(cell).join(","),
      ...rows.map((row) =>
        headers.map((header) => cell(row[header])).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

export const hingeCsv = hingeScheduleCsv;
