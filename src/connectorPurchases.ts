import { catalog, type Project } from "./model";
import { connectorReviews } from "./connectors";
import {
  connectorProductId,
  getConnectorProduct,
  getConnectorSchedule,
} from "./connectorProducts";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import { supplyProducts } from "./supplies";
import { retailerName } from "./retailers";

/** Provisional reference comparison only. Manual supply selections remain the sole purchase rows. */
export function connectorPurchaseSummary(project: Project, now = Date.now()) {
  const reviews = connectorReviews(project, now),
    definition = getConnectorProduct(connectorProductId)!,
    planRows = reviews.map((review) => {
      const schedule = getConnectorSchedule(review.plan.scheduleId),
        included =
          review.activeConnectorCount === 1 &&
          review.scheduledFastenerCount === 4 &&
          review.sourceCurrent &&
          review.state !== "stale" &&
          review.state !== "conflict" &&
          !!schedule,
        reasons = [...new Set(review.issues.map((issue) => issue.message))];
      return {
        planId: review.plan.id,
        label: review.plan.label,
        name: review.plan.name,
        state: review.state,
        scheduleId: review.plan.scheduleId,
        fastenerProductId: schedule?.fastenerProductId ?? null,
        included,
        activeConnectorCount: included ? 1 : 0,
        scheduledFastenerCount: included ? 4 : 0,
        excludedConnectorCount: included ? 0 : 1,
        excludedFastenerCount: included ? 0 : 4,
        reasons,
      };
    }),
    plannedConnectors = planRows.reduce(
      (sum, row) => sum + row.activeConnectorCount,
      0,
    ),
    excludedConnectors = planRows.reduce(
      (sum, row) => sum + row.excludedConnectorCount,
      0,
    ),
    eligibleSupplyIds = new Set(
      supplyProducts(project.retailer).map((product) => product.id),
    ),
    productDefinitions = [
      {
        productId: connectorProductId,
        productName: definition.name,
        unitsPerPack: 1,
      },
      ...definition.schedules.map((schedule) => ({
        productId: schedule.fastenerProductId,
        productName: schedule.fastenerName,
        unitsPerPack: schedule.packCount,
      })),
    ],
    products = productDefinitions.map((entry) => {
      const product = findRetailerProduct(entry.productId),
        matchingPlans = planRows.filter(
          (row) =>
            entry.productId === connectorProductId ||
            row.fastenerProductId === entry.productId,
        ),
        unitsPerPlan = entry.productId === connectorProductId ? 1 : 4,
        requiredUnits =
          matchingPlans.filter((row) => row.included).length * unitsPerPlan,
        excludedUnits =
          matchingPlans.filter((row) => !row.included).length * unitsPerPlan,
        requiredPacks = Math.ceil(requiredUnits / entry.unitsPerPack),
        selectedPacks = project.supplies
          .filter((selection) => selection.productId === entry.productId)
          .reduce((sum, selection) => sum + selection.quantity, 0),
        selectedUnits = selectedPacks * entry.unitsPerPack,
        modeledIds = new Set(
          catalog
            .filter((material) => material.productReference === entry.productId)
            .map((material) => material.id),
        ),
        hasSeparateMaterialRepresentation =
          project.pieces.some((piece) => modeledIds.has(piece.material)) ||
          project.joints.some(
            (joint) => !!joint.material && modeledIds.has(joint.material),
          );
      return {
        ...entry,
        referenceOffers: product ? referenceOffersForProduct(product) : [],
        requiredUnits,
        excludedUnits,
        requiredPacks,
        selectedPacks,
        selectedUnits,
        shortfallPacks: Math.max(0, requiredPacks - selectedPacks),
        spareUnits: Math.max(0, selectedUnits - requiredUnits),
        retailerSupported: eligibleSupplyIds.has(entry.productId),
        hasSeparateMaterialRepresentation,
        provisional: requiredUnits > 0,
        planRows: matchingPlans,
      };
    }),
    warnings: string[] = [];
  if (plannedConnectors)
    warnings.push(
      "Each included C intent budgets one A21Z and one complete four-fastener reference schedule provisionally. Empty measured-entry slots retain that budget; it is not installed coverage, fitting holes, a complete takeoff or capacity approval. Manual supplies are the only paid rows; recomputing never adds purchases.",
    );
  for (const row of planRows) {
    if (!row.included)
      warnings.push(
        `${row.label}: one angle and four reference fasteners are excluded as a whole while ${row.state}. ${row.reasons.join(" ")}`.trim(),
      );
    else if (row.state !== "paths-reviewed")
      warnings.push(
        `${row.label}: entry/measurement review is pending; one angle and four fasteners remain a provisional reference budget only.`,
      );
  }
  for (const row of products) {
    if ((row.requiredUnits || row.selectedPacks) && !row.retailerSupported)
      warnings.push(
        `The exact ${row.productName} has no current reviewed ${retailerName(project.retailer)} supply reference. Saved selections remain; no substitute or local availability is inferred.`,
      );
    if (row.hasSeparateMaterialRepresentation)
      warnings.push(
        `${row.productName} also appears as a placed part or recorded joint. Those independent material quantities and manual supplies remain counted separately; confirm whether they represent additional physical items. No legacy offset or automatic substitution is applied.`,
      );
  }
  for (const review of reviews) {
    const { base, post } = review.plan;
    if (
      project.joints.some(
        (joint) =>
          (joint.a === base.pieceId && joint.b === post.pieceId) ||
          (joint.a === post.pieceId && joint.b === base.pieceId),
      )
    )
      warnings.push(
        `${review.plan.label}: legacy pairwise quantities also connect these members. Review their physical meaning separately; C intent does not install, replace or offset them.`,
      );
  }
  return {
    productId: connectorProductId,
    products,
    planRows,
    plannedConnectors,
    excludedConnectors,
    plannedFasteners: plannedConnectors * 4,
    provisional: plannedConnectors > 0,
    incomplete: planRows.some(
      (row) => !row.included || row.state !== "paths-reviewed",
    ),
    warnings: [...new Set(warnings)],
  };
}
