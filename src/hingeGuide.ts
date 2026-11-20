import type { Project, V3 } from "./model";
import {
  lidHingeReviews,
  hingePurchaseAllocations,
  type HingeReview,
} from "./hinges";
import { hingePurchaseSummary } from "./hingePurchases";
import { getHingeProduct } from "./hingeProducts";
import { reviewHingeStock } from "./hingeStock";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";

const line = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
const inches = (value: number | null) =>
  value === null ? "PENDING" : formatPreciseInches(value);
const vector = (value: V3 | null) =>
  value === null ? "PENDING" : value.map(formatPreciseInches).join(", ");
const direction = (value: V3 | null) =>
  value === null
    ? "PENDING"
    : value.map((v) => Number(v.toFixed(6))).join(", ");
export const hingeDrillCandidate = (review: HingeReview) =>
  review.state !== "stale" && review.state !== "conflict";

/** Short stable checkoff; exact coordinate/provenance tables belong in the appendix. */
export function hingePreparationNotes(
  project: Project,
  planId: string,
  cachedReview?: HingeReview,
): string {
  const review =
    cachedReview ?? lidHingeReviews(project).find((r) => r.plan.id === planId);
  if (!review)
    return "The lid-hinge plan is no longer present. Review retained instructions.";
  const p = review.plan;
  return [
    `${p.label}: ${line(p.name)} — ${review.state}; ${hingeDrillCandidate(review) ? review.activeHoleCount : 0} candidate transferred holes.`,
    `Dry-fit the carcass and actual ${partLabel(project, p.moving.pieceId)} lid against ${partLabel(project, p.fixed.pieceId)} before marking. Use the detailed Lid-hinge installation review and separate H/L coordinate CSV.`,
    "Confirm the exact hinge, retained segment and original/cut end; enter measured usable length and metal-cut kerf. Clamp for the selected metal-cut process and deburr actual cut edges. Wood-saw capability and the wood kerf default do not cover this operation.",
    "Transfer the paired axis and actual leaf holes from the delivered hinge. Record the wood-entry datum, actual supplied screws/drive, seated surface-to-tip depth, pilot diameter and deepest drill-tip depth with their basis/date. The linked 1/16 in pilot reference does not establish pilot depth or screw fit.",
    "Clamp, test-drill suitable scrap and verify the actual depth/fit before drilling the members or driving screws. Dry-fit and inspect the measured-axis sweep and access before final installation. Pending, stale or conflicting coordinates are not released drilling instructions.",
    "Hinge/leaf fit, supplied screw/substrate suitability, hold-open stays, pinch protection and closed-seat support/load paths remain separate reviews; geometry review establishes no installation, capacity or code approval.",
    ...review.issues
      .slice(0, 3)
      .map((issue) => `Review: ${line(issue.message).slice(0, 230)}`),
  ]
    .join("\n")
    .slice(0, 4500);
}

export function hingeGuideText(
  project: Project,
  includeTitle = true,
  markdown = false,
): string {
  if (!project.lidHingePlans.length && !project.hingeStockSources.length)
    return "";
  const user = (value: string) =>
      markdown
        ? line(value).replace(/[\\`*_{}\[\]<>|#]/g, "\\$&")
        : line(value),
    text = includeTitle ? ["Lid-hinge installation review", ""] : [],
    reviews = lidHingeReviews(project);
  text.push(
    "Measured/proposed hinge datums and transferred wood-entry centerlines only. Member-local coordinates use the actual rectangular-blank center and saved axes, including retained profile cuts. User basis/date is not manufacturer geometry. A geometry review does not establish leaf/head fit, screw suitability, installation, hold-open action, pinch protection, seat capacity or code approval.",
  );
  for (const review of reviews) {
    const p = review.plan,
      candidate = hingeDrillCandidate(review);
    text.push(
      "",
      `${p.label} · ${user(p.name)} — ${review.state}`,
      `Moving ${partLabel(project, p.moving.pieceId)} · ${user(p.moving.name)}; fixed ${partLabel(project, p.fixed.pieceId)} · ${user(p.fixed.name)}.`,
      `Product: ${p.productId}; evidence ${p.evidenceRevision}; ${p.selectedForMotion ? "selected measured-candidate motion" : "not selected for motion"}.`,
      candidate
        ? `Entered moving-local axis A/B (in): ${vector(p.axis.movingA)} / ${vector(p.axis.movingB)}. Entered fixed-local axis A/B (in): ${vector(p.axis.fixedA)} / ${vector(p.axis.fixedB)}.`
        : "Active axis, hole coordinates and drilling dimensions withheld for this stale/conflicting plan. Exact saved values remain in editable JSON; do not transfer former locations.",
      `Axis user basis: ${user(p.axis.basis) || "PENDING"}; at ${p.axis.measuredAt ?? "PENDING"}.`,
    );
    if (candidate && review.resolvedAxis)
      text.push(
        `Candidate world pivot (in): ${vector(review.resolvedAxis.pivot)}; unit axis: ${direction(review.resolvedAxis.axis)}; endpoint distance ${inches(review.resolvedAxis.length)}. This measured-candidate line is separate from the provisional recipe pivot.`,
      );
    text.push(
      `Delivered hardware user observation: ${user(p.hardware.description) || "PENDING"}; drive ${user(p.hardware.drive) || "PENDING"}; observed screw count ${p.hardware.suppliedCount ?? "PENDING"}; included ${p.hardware.included === null ? "PENDING" : p.hardware.included ? "user reports yes" : "user reports no"}; leaf thickness ${candidate ? inches(p.hardware.leafThickness) : "WITHHELD"}.`,
      `Hardware user basis: ${user(p.hardware.basis) || "PENDING"}; at ${p.hardware.measuredAt ?? "PENDING"}. Observed contents do not create extra purchases or confirm screw suitability.`,
    );
    if (!review.locations.length)
      text.push(
        "No leaf holes have been transferred; no hole count or manufactured pattern is inferred.",
      );
    for (const item of review.locations) {
      const l = item.location,
        active =
          candidate && item.state !== "stale" && item.state !== "conflict",
        m = l.measurements;
      text.push(
        `${p.label}/${l.label} · ${user(l.name)} · ${l.leaf} leaf → ${partLabel(project, l.leaf === "moving" ? p.moving.pieceId : p.fixed.pieceId)} — ${item.state}; ${active ? "candidate/pending review" : "excluded"}.`,
      );
      if (active)
        text.push(
          `  Wood entrance local (in): ${vector(l.entranceLocal)}; local inward unit direction: ${direction(l.driveLocal)}; candidate world entrance (in): ${vector(item.entranceWorld)}.`,
          `  Entered seated surface-to-tip ${inches(m.surfaceToTipDepth)}; pilot diameter ${inches(m.pilotDiameter)}; deepest pilot-drill-tip ${inches(m.pilotDepth)}; retained ray depth ${inches(item.availableDepth)}. Pilot tip is not full-diameter bore or a machine/collar setting.`,
        );
      else
        text.push(
          "  Active coordinates/depths withheld; see editable JSON for retained intent and history.",
        );
      text.push(
        `  User measurement basis: ${user(m.basis) || "PENDING"}; at ${m.measuredAt ?? "PENDING"}.`,
        ...item.issues.map((issue) => `  Review: ${user(issue.message)}`),
      );
    }
    text.push(
      ...review.issues.map((issue) => `Review: ${user(issue.message)}`),
    );
    if (p.notes) text.push(`Saved notes: ${user(p.notes)}`);
    if (p.referenceHistory.length)
      text.push(
        `Historical reference reviews: ${p.referenceHistory.length}; latest at ${p.referenceHistory.at(-1)!.at}, basis ${user(p.referenceHistory.at(-1)!.basis)}. Earlier datums and depths remain in editable JSON, not active drilling instructions; Undo may restore an earlier active mapping without deleting history.`,
      );
  }
  text.push("", "PHYSICAL HINGE SOURCES AND REMNANTS");
  const purchases = hingePurchaseSummary(
    project,
    hingePurchaseAllocations(project),
  );
  project.hingeStockSources.forEach((source, index) => {
    const review = reviewHingeStock(source),
      sourceRow = purchases.sourceRows.find(
        (row) => row.sourceId === source.id,
      );
    text.push(
      `Source ${index + 1} · ${source.productId} — ${review.state}; entered usable length ${inches(source.usableLength)}.`,
      `  User basis: ${user(source.basis) || "PENDING"}; at ${source.measuredAt ?? "PENDING"}.`,
    );
    source.cuts.forEach((cut, cutIndex) =>
      text.push(
        `  Cut ${cutIndex + 1}: removed interval starts ${inches(cut.position)}, entered metal kerf ${inches(cut.kerf)}; user basis ${user(cut.basis) || "PENDING"}; at ${cut.measuredAt ?? "PENDING"}.`,
      ),
    );
    review.segments.forEach((segment, segmentIndex) => {
      const plans = reviews
        .filter(
          (r) =>
            r.plan.stockAllocation?.sourceId === source.id &&
            r.plan.stockAllocation.segmentId === segment.id,
        )
        .map((r) => r.plan.label);
      text.push(
        `  Segment ${segmentIndex + 1}: start ${inches(segment.start)}, length ${inches(segment.length)}, ${segment.startEnd.kind} → ${segment.endEnd.kind}; ${sourceRow?.segments.find((s) => s.id === segment.id)?.allocated ? `allocated to ${plans.join(", ")}` : "unallocated remnant; not another purchased hinge"}.`,
      );
    });
    text.push(
      ...review.issues.map((issue) => `  Review: ${user(issue.message)}`),
    );
    if (source.referenceHistory.length)
      text.push(
        `  ${source.referenceHistory.length} source-edit receipts retained in editable JSON; earlier cut/measurement values are historical.`,
      );
  });
  text.push(
    "",
    `HINGE PURCHASE COMPARISON: ${purchases.requiredHinges} provisional physical sources; ${purchases.selectedHinges} manual hinge units selected; missing ${purchases.shortfallHinges}. Distinct segments share their source once. Manual supplies alone produce purchase rows; no supplied screws, on-hand stock or extra remnant purchase is inferred.`,
  );
  const product = getHingeProduct("everbilt-29256-continuous-hinge")!;
  text.push(
    "",
    "PRODUCT REFERENCE LIMITS",
    ...product.unknowns.map((unknown) => `Review: ${unknown}`),
    ...product.sources.map(
      (source) => `Source: ${source.url} — ${source.scope}. ${source.note}`,
    ),
  );
  return text.join("\n");
}

export function hingeGuideMarkdown(project: Project): string {
  const content = hingeGuideText(project, false, true);
  return content ? `\n\n## Lid-hinge installation review\n\n${content}\n` : "";
}
