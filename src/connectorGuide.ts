import type { Project, V3 } from "./model";
import { connectorReviews, type ConnectorReview } from "./connectors";
import { getConnectorProduct, getConnectorSchedule } from "./connectorProducts";
import { connectorPurchaseSummary } from "./connectorPurchases";
import { formatPreciseInches } from "./measurement";
import { partLabel } from "./partLabels";

const line = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
const inches = (value: number | null) => value === null ? "PENDING" : formatPreciseInches(value);
const vector = (value: V3 | null) => value === null ? "PENDING" : value.map(formatPreciseInches).join(", ");
const direction = (value: V3 | null) => value === null ? "PENDING" : value.map((n) => Number(n.toFixed(6))).join(", ");

export function connectorPreparationNotes(project: Project, planId: string, cachedReview?: ConnectorReview) {
  const review = cachedReview ?? connectorReviews(project).find((row) => row.plan.id === planId);
  if (!review) return "The connector plan is no longer present. Review retained instructions.";
  const plan = review.plan, schedule = getConnectorSchedule(plan.scheduleId);
  return [
    `Plan ${plan.label}: ${line(plan.name)} — ${review.state}. Base ${partLabel(project, plan.base.pieceId)}; post ${partLabel(project, plan.post.pieceId)}.`,
    `One A21Z connector; ${schedule?.fastenerName ?? plan.scheduleId} reference: two base + two post. ${review.activeConnectorCount} provisional connector / ${review.scheduledFastenerCount} reference fasteners included; ${review.activeEntryCount}/4 entered wood paths eligible.`,
    "Dry-fit the actual connector on the selected members. Confirm delivered instructions, leaf contact/bend, all required holes, fastener/finish fit and access. Named flange dimensions and four reference slots supply no manufactured hole coordinates or installed fit.",
    "Transfer each entered datum on its assigned wood member. Wood-entry-to-tip and deepest pilot-tip depths start at that wood surface; they exclude the metal/head seating datum and are not the nominal 1½ in fastener length or a machine setting.",
    "Use one complete source schedule, never a GRK substitution or mixed screw/nail set. Review the exact driver or hammer, workholding and actual access before closing the frame. User measurements and wood-centerline reviews do not release installation, loads or code approval.",
    ...[...new Set(review.issues.map((issue) => issue.message))].slice(0, 3).map((issue) => `Review: ${line(issue).slice(0, 240)}`),
  ].join("\n");
}

export function connectorGuideText(project: Project, includeTitle = true, markdown = false) {
  if (!project.connectorPlans.length) return "";
  const user = (value: string) => markdown ? line(value).replace(/[\\`*_{}\[\]<>|#]/g, "\\$&") : line(value);
  const text = includeTitle ? ["A21Z connector plans", ""] : [];
  text.push("Explicit A21Z reference choices and entered wood paths only. Each plan is one connector with one complete two-base/two-post alternative schedule. Four slots are reference quantities, not a manufactured hole pattern. Actual leaf/bend/hole fit, fastener seating, wood suitability, exposure, load path and installation remain separate reviews.");
  for (const review of connectorReviews(project)) {
    const plan = review.plan, product = getConnectorProduct(plan.productId), schedule = getConnectorSchedule(plan.scheduleId);
    text.push("", `Plan ${plan.label}: ${user(plan.name)} — ${review.state}.`,
      `Base ${partLabel(project, plan.base.pieceId)} · ${user(plan.base.name)}; post ${partLabel(project, plan.post.pieceId)} · ${user(plan.post.name)}.`,
      `${product?.name ?? plan.productId}; named nominal flanges W1 2 in / W2 1½ in / L 1⅜ in, 18 gauge. These are not an exact outer envelope, measured thickness, bend or manufactured hole geometry.`,
      `${schedule?.fastenerName ?? plan.scheduleId}: reference two per member, four total; ${review.activeConnectorCount} provisional connector and ${review.scheduledFastenerCount} fasteners included. Paid quantities come only from separate manual purchase rows.`,
      `${review.activeEntryCount}/4 entered wood paths eligible. Even four reviewed wood paths do not establish connector/leaf/hole fit, installation or strength.`);
    for (const point of review.entries) {
      const entry = point.entry, usable = review.activeConnectorCount === 1 && point.includedInDemand && point.state !== "stale" && point.state !== "conflict";
      text.push(`${plan.label}/${entry.label} · ${user(entry.name)}; ${entry.role} ${partLabel(project, point.memberId)} — ${point.state}${usable ? "; candidate wood path only" : "; numerical transfer withheld"}.`);
      if (usable) text.push(
        `  Member-local entrance (in): ${vector(entry.entranceLocal)}; local unit drive ${direction(entry.driveLocal)}.`,
        `  Candidate world wood entry (in): ${vector(point.entranceWorld)}; available wood path ${inches(point.availableWoodDepth)}; proposed tip ${vector(point.tipWorld)}; deepest pilot tip ${vector(point.pilotTipWorld)}.`,
        `  User wood-entry-to-tip depth ${inches(point.measurementsCurrent ? entry.measurements.woodEntryToTipDepth : null)}; pilot diameter ${inches(point.measurementsCurrent ? entry.measurements.pilotDiameter : null)}; deepest pilot-tip depth ${inches(point.measurementsCurrent ? entry.measurements.pilotDepth : null)}. ${point.measurementsCurrent ? "User basis" : "Saved basis (not current)"}: ${user(entry.measurements.basis) || "PENDING"}; measured at ${entry.measurements.measuredAt ?? "PENDING"}.`);
      else text.push("  Current coordinates/depths are pending or excluded. Retained values/history in editable JSON are not current installation instructions.");
      text.push(...point.issues.map((issue) => `  Review: ${user(issue.message)}`));
    }
    text.push(...review.issues.map((issue) => `Review: ${user(issue.message)}`));
    if (plan.notes) text.push(`Saved plan notes: ${user(plan.notes)}`);
    if (plan.referenceHistory.length) {
      text.push(`Historical reference reviews · ${plan.referenceHistory.length} recorded. Historical provenance only; earlier numerical mounting/wood-entry inputs remain in editable JSON and are not reprinted as current instructions.`);
      for (const event of plan.referenceHistory) text.push(
        `  ${event.kind === "schedule" ? "Schedule change" : "Same-member reference refresh"} at ${event.at}; basis: ${user(event.basis)}. Earlier base ${event.previous.base.pieceId}, post ${event.previous.post.pieceId}, schedule ${event.previous.scheduleId}; retained ${event.previous.entries.length} earlier reference entries.`);
    }
    if (product) text.push(...product.conflicts.map((issue) => `Source conflict: ${issue}`), ...product.unknowns.map((issue) => `Unresolved: ${issue}`), ...product.sources.map((source) => `Source: ${source.url} — ${source.revision}; ${source.note}`));
  }
  const purchases = connectorPurchaseSummary(project);
  text.push("", "CONNECTOR PURCHASE COMPARISON — no added paid lines");
  for (const row of purchases.products) text.push(`${row.productName}: ${row.requiredUnits} provisional units; ${row.unitsPerPack}/pack; required packs ${row.requiredPacks}; selected packs ${row.selectedPacks}; missing packs ${row.shortfallPacks}; excluded units ${row.excludedUnits}.`);
  text.push(...purchases.warnings.map((warning) => `Review: ${user(warning)}`));
  return text.join("\n");
}

export function connectorGuideMarkdown(project: Project) {
  const text = connectorGuideText(project, false, true);
  return text ? `\n\n## A21Z connector plans\n\n${text}\n` : "";
}
