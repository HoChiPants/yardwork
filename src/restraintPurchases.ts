import type { Project } from "./model";
import { restraintReviews } from "./restraints";
import { restraintProductId } from "./restraintSchema";
import { addSupply, supplyProducts } from "./supplies";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import { retailerName } from "./retailers";

/** Compare explicit restraint intent with existing purchase-only kit selections; never add a BOM row. */
export function restraintPurchaseSummary(project: Project) {
  const reviews = restraintReviews(project),
    product = findRetailerProduct(restraintProductId),
    planRows = reviews.map((review) => ({
      planId: review.plan.id,
      name: review.plan.name,
      state: review.state,
      explicitLocations: review.plan.locations.length,
      activeKitCount: review.activeKitCount,
      included: review.activeKitCount > 0,
      reasons: review.issues.map((issue) => issue.message),
    })),
    plannedLocations = planRows.reduce(
      (sum, row) => sum + row.activeKitCount,
      0,
    ),
    requiredKits = plannedLocations,
    selectedKits = project.supplies
      .filter((selection) => selection.productId === restraintProductId)
      .reduce((sum, selection) => sum + selection.quantity, 0),
    shortfallKits = Math.max(0, requiredKits - selectedKits),
    retailerSupported = supplyProducts(project.retailer).some(
      (product) => product.id === restraintProductId,
    ),
    warnings = planRows.flatMap((row) =>
      row.reasons.map((reason) => `${row.name} (${row.planId}): ${reason}`),
    );
  if (plannedLocations)
    warnings.push(
      "Kit demand is provisional for explicitly entered locations, not a prescribed restraint count or installed anchorage. One kit contains eleven included parts; those parts create no separate purchase charges.",
    );
  if ((plannedLocations || selectedKits) && !retailerSupported)
    warnings.push(
      `The exact restraint kit has no reviewed reference offer at ${retailerName(project.retailer)}; no substitution or local availability is inferred.`,
    );
  return {
    productId: restraintProductId,
    productName: product?.name ?? restraintProductId,
    referenceOffers: product ? referenceOffersForProduct(product) : [],
    plannedLocations,
    plannedKits: requiredKits,
    requiredKits,
    selectedKits,
    shortfallKits,
    spareKits: Math.max(0, selectedKits - requiredKits),
    provisional: requiredKits > 0,
    retailerSupported,
    canAddMissing: retailerSupported && shortfallKits > 0,
    planRows,
    warnings: [...new Set(warnings)],
  };
}
/** Explicit user action only. Existing manual same-product kit selections cover demand once. */
export function addMissingRestraintKits(project: Project): Project {
  const summary = restraintPurchaseSummary(project);
  if (!summary.shortfallKits) return project;
  if (!summary.retailerSupported)
    throw Error(
      "Choose a retailer with a reviewed offer for the exact 9976524 kit; no substitute is selected.",
    );
  return addSupply(
    project,
    restraintProductId,
    summary.shortfallKits,
    "Planned furniture restraints",
    "Only missing whole kits for active explicit restraint locations were added. Included eleven-part contents are not extra purchases. Receiver, wall, fasteners, actual instructions and complete assembly capacity remain separate reviews.",
  );
}
