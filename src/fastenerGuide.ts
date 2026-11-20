import type { Project, V3 } from "./model";
import { driverAccessGuideLines } from "./fastenerAccess";
import { fastenerReviews } from "./fastenings";
import { getWoodFastenerProduct } from "./fastenerProducts";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import { fastenerPurchaseSummary } from "./fastenerPurchases";
import type { FastenerPartRef } from "./fasteningSchema";

const inches = (value: number | null) =>
  value === null ? "PENDING" : formatPreciseInches(value);
const vector = (value: V3 | null) =>
  value === null ? "PENDING" : value.map(formatPreciseInches).join(", ");
const direction = (value: V3 | null) =>
  value === null
    ? "PENDING"
    : value.map((v) => Number(v.toFixed(6))).join(", ");
const line = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();

export function fastenerPreparationNotes(project: Project, planId: string, cachedReview?: ReturnType<typeof fastenerReviews>[number]) {
  const review = cachedReview ?? fastenerReviews(project).find((r) => r.plan.id === planId);
  if (!review) return "The fastening plan is no longer present. Review retained instructions.";
  const product = getWoodFastenerProduct(review.plan.productId);
  return [
    `Plan ${review.plan.label}: ${line(review.plan.name)} — ${review.state}; ${review.activePointCount} provisional screw locations, ${review.plan.locations.length - review.activePointCount} excluded.`,
    `${partLabel(project, review.plan.head.pieceId)} → ${partLabel(project, review.plan.receiver.pieceId)}; ${product?.name ?? review.plan.productId}.`,
    "Use the labeled Wood-fastener locations appendix and separate CSV. Entrance coordinates use the actual head-side member's local center origin; direction components are a unit vector in that same frame. Measure and transfer the datum before cutting or driving.",
    "Nominal screw length is not a seating-depth setting. Record the proposed entrance-surface-to-tip depth after seating, actual pilot diameter and deepest pilot-drill-tip depth with user basis/date. Full-bore depth, thread engagement, countersink, edge/grain requirements and driver access need separate review.",
    "Stale or conflicting locations are excluded; pending values are not released drilling instructions. A centerline review does not prove installation, joint strength or code compliance.",
    ...[...new Set(review.issues.map((issue) => issue.message))]
      .slice(0, 4)
      .map((issue) => `Review: ${line(issue).slice(0, 240)}`),
  ].join("\n");
}

export function fastenerGuideText(project: Project, includeTitle = true, markdown = false) {
  if (!project.fastenerPlans.length) return "";
  const user = (value: string) => {
    const flat = line(value);
    return markdown ? flat.replace(/[\\`*_{}\[\]<>|#]/g, "\\$&") : flat;
  };
  const text = includeTitle ? ["Wood-fastener locations", ""] : [];
  text.push(
    "Explicit planning locations and user measurements only. Local origin is the head-side member's rectangular-blank center; local X/Y/Z and unit drive direction follow that member's saved axes. Transfer these datums before profile cuts. Centerline intersections do not locate an approved pilot pattern or establish thread engagement, edge distances, driver access, installation, loads or code compliance.",
    "Nominal product lengths and conflicting source datums are references. Surface-to-tip depth is separately measured after the proposed seating. Pilot depth means the deepest drill tip from the same entrance, not full-diameter bore depth or a collar/machine setting.",
  );
  const reviews = fastenerReviews(project);
  for (const review of reviews) {
    const plan = review.plan,
      product = getWoodFastenerProduct(plan.productId),
      currentMeasurements = review.state !== "stale" && review.activePointCount > 0;
    text.push(
      "",
      `Plan ${plan.label}: ${user(plan.name)}`,
      `State: ${review.state}; provisional included locations ${review.activePointCount}/${plan.locations.length}.`,
      `Head-side ${partLabel(project, plan.head.pieceId)} · ${user(plan.head.name)} → receiver ${partLabel(project, plan.receiver.pieceId)} · ${user(plan.receiver.name)}.`,
      `${product?.name ?? plan.productId}; nominal ${product?.nominalLength ?? "unknown"} in; ${product?.drive ?? "unknown"} drive. Nominal length does not set the tip position.`,
      currentMeasurements
        ? `User measurements, applying only to included locations: proposed surface-to-tip ${inches(plan.measurements.surfaceToTipDepth)}; entered pilot diameter ${inches(plan.measurements.pilotDiameter)}; deepest pilot-drill-tip ${inches(plan.measurements.pilotDepth)}.`
        : "Saved measured depths and diameters withheld while no current locations are eligible. Retained values in editable JSON are not current drilling instructions.",
      `${currentMeasurements ? "User basis" : "Earlier saved measurement basis"}: ${user(plan.measurements.basis) || "PENDING"}; measured at ${plan.measurements.measuredAt ?? "PENDING"}. These remain user evidence.`,
    );
    for (const item of review.locations) {
      const usable = item.includedInDemand && item.state !== "stale" && item.state !== "conflict";
      text.push(
        `${plan.label}/${item.location.label} · ${user(item.location.name)} — ${item.state}${usable ? "; candidate only" : "; excluded"}.`,
        usable
          ? `  Local entrance (in): ${vector(item.location.entranceLocal)}; local unit drive: ${direction(item.location.driveLocal)}.`
          : "  Coordinates and depths withheld. Review the saved intent in editable JSON; do not transfer former locations.",
      );
      if (usable)
        text.push(
          `  Candidate world entrance (in): ${vector(item.entranceWorld)}; head exit ${inches(item.headExitDepth)}; receiver entry ${inches(item.receiverEnterDepth)}; receiver exit ${inches(item.receiverExitDepth)}; gap ${inches(item.gap)}.`,
          `  Candidate tip (in): ${vector(item.tipWorld)}; receiver tip-path penetration ${inches(item.penetration)}. This is not thread engagement.`,
        );
      text.push(...item.issues.map((issue) => `  Review: ${user(issue.message)}`));
    }
    text.push(...review.issues.map((issue) => `Review: ${user(issue.message)}`));
    if (plan.notes) text.push(`Saved plan notes: ${user(plan.notes)}`);
    if (plan.referenceHistory.length) {
      const describe = (ref: FastenerPartRef) => {
        const baseline = ref.baseline;
        return `${baseline?.partLabel ?? partLabel(project, ref.pieceId)} · ${user(ref.name)}; ${baseline
          ? `recorded ${baseline.size.map(formatPreciseInches).join(" × ")}, ${user(baseline.materialName)}${baseline.productRegistryRef ? `, source ${user(baseline.productRegistryRef)}` : ""}`
          : "original geometry was not captured"}`;
      };
      text.push("", `Historical reference reviews · ${plan.referenceHistory.length} recorded`,
        "Historical provenance only; these events are not current drilling instructions. Undo may restore an earlier active reference without erasing a review. Use the current references and eligible locations above. Earlier local coordinates and measured depths remain in editable JSON and are not reprinted here.");
      for (const event of plan.referenceHistory)
        text.push(
          `${event.kind === "remap" ? "Member replacement" : "Same-member reference refresh"} reviewed at ${event.at}; user basis: ${user(event.basis)}.`,
          `  Earlier head: ${describe(event.previous.head)}.`,
          `  Selected head at that review: ${describe(event.next.head)}.`,
          `  Earlier receiver: ${describe(event.previous.receiver)}.`,
          `  Selected receiver at that review: ${describe(event.next.receiver)}.`,
          `  ${event.previous.locations.length} earlier locations archived; local coordinates ${event.locationMode === "clear" ? "cleared" : "retained without scaling"} at that review. Previous measured values/basis/date are preserved as history; new current measurements must be reviewed.`,
        );
    }
    if (product) {
      text.push(...product.conflicts.map((issue) => `Source conflict: ${issue}`));
      text.push(...product.unknowns.map((issue) => `Unresolved: ${issue}`));
      text.push(...product.sources.map((source) => `Source: ${source.url} — ${source.revision}; ${source.note}`));
    }
  }
  const access = driverAccessGuideLines(project, reviews);
  if (access.length) text.push("", "Driver clearance and assembly order", "", ...access.map(user));
  const purchases = fastenerPurchaseSummary(project);
  text.push("", "SCREW PURCHASE COMPARISON");
  for (const row of purchases.products.filter((p) => p.plannedScrews || p.selectedPacks || p.excludedLocations))
    text.push(
      `${row.productName}: ${row.plannedScrews} provisional screws; ${row.packCount}/pack; required packs ${row.requiredPacks}; selected packs ${row.selectedPacks}; missing packs ${row.shortfallPacks}; selected-pack surplus ${row.spareScrews}. Existing supply rows alone purchase packs; this comparison adds no duplicate charge or on-hand credit.`,
    );
  text.push(...purchases.warnings.map((warning) => `Review: ${user(warning)}`));
  return text.join("\n");
}

export function fastenerGuideMarkdown(project: Project) {
  const text = fastenerGuideText(project, false, true);
  return text ? `\n\n## Wood-fastener locations\n\n${text}\n` : "";
}
