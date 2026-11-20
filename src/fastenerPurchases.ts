import type { Project } from "./model";
import { fastenerReviews } from "./fastenings";
import { woodFastenerProducts } from "./fastenerProducts";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import { addSupply, supplyProducts } from "./supplies";
import { retailerName } from "./retailers";

/** Explicit locations request screws; only supply selections purchase packs. */
export function fastenerPurchaseSummary(project: Project) {
  const reviews = fastenerReviews(project);
  const products = woodFastenerProducts.map((definition) => {
    const product = findRetailerProduct(definition.productId),
      matching = reviews.filter(
        (review) => review.plan.productId === definition.productId,
      ),
      planRows = matching.map((review) => ({
        planId: review.plan.id,
        name: review.plan.name,
        state: review.state,
        included: review.activePointCount,
        excluded: review.plan.locations.length - review.activePointCount,
        reasons: [...new Set(review.issues.map((issue) => issue.message))],
      })),
      plannedScrews = planRows.reduce((sum, row) => sum + row.included, 0),
      excludedLocations = planRows.reduce((sum, row) => sum + row.excluded, 0),
      selectedPacks = project.supplies
        .filter((selection) => selection.productId === definition.productId)
        .reduce((sum, selection) => sum + selection.quantity, 0),
      requiredPacks = Math.ceil(plannedScrews / definition.packCount),
      shortfallPacks = Math.max(0, requiredPacks - selectedPacks),
      selectedScrews = selectedPacks * definition.packCount,
      retailerSupported = supplyProducts(project.retailer).some(
        (reference) => reference.id === definition.productId,
      );
    return {
      productId: definition.productId,
      productName: product?.name ?? definition.name,
      referenceOffers: product ? referenceOffersForProduct(product) : [],
      packCount: definition.packCount,
      plannedScrews,
      excludedLocations,
      selectedPacks,
      selectedScrews,
      requiredPacks,
      shortfallPacks,
      spareScrews: Math.max(0, selectedScrews - plannedScrews),
      retailerSupported,
      canAddMissing: retailerSupported && shortfallPacks > 0,
      provisional: plannedScrews > 0,
      planRows,
    };
  });
  const warnings: string[] = [];
  for (const row of products) {
    if (row.plannedScrews)
      warnings.push(
        `${row.productName}: ${row.plannedScrews} provisional screw locations; purchasing a box does not establish fit, pilot requirements, thread engagement or installation.`,
      );
    if (row.excludedLocations)
      warnings.push(
        `${row.productName}: ${row.excludedLocations} stale or conflicting locations are excluded from demand.`,
      );
    if ((row.plannedScrews || row.selectedPacks) && !row.retailerSupported)
      warnings.push(
        `No reviewed ${retailerName(project.retailer)} offer exists for ${row.productName}. No substitute or store availability is inferred.`,
      );
  }
  for (const review of reviews) {
    const { head, receiver } = review.plan;
    if (
      project.joints.some(
        (joint) =>
          (joint.a === head.pieceId && joint.b === receiver.pieceId) ||
          (joint.a === receiver.pieceId && joint.b === head.pieceId),
      )
    )
      warnings.push(
        `${review.plan.name}: legacy pairwise connection quantities also exist for these parts. Review whether they represent the same physical fasteners; those separate records are retained and are not automatically offset or substituted.`,
      );
  }
  return { products, warnings: [...new Set(warnings)] };
}

/** An explicit, repeatable action. Recomputing demand alone never adds purchases. */
export function addMissingFastenerPacks(project: Project, productId: string) {
  const row = fastenerPurchaseSummary(project).products.find(
    (product) => product.productId === productId,
  );
  if (!row) throw Error("Choose a reviewed wood-fastener product.");
  if (!row.shortfallPacks) return project;
  if (!row.retailerSupported)
    throw Error("Choose a retailer with a reviewed reference for this exact pack.");
  return addSupply(
    project,
    productId,
    row.shortfallPacks,
    "Planned wood-fastener locations",
    "Only missing complete packs for explicit active locations. No installed hardware, on-hand stock, tool contents or legacy connection quantities are credited.",
  );
}
