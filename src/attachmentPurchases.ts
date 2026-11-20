import type { Project } from "./model";
import { attachmentReviews } from "./attachments";
import type { AttachmentReview, AttachmentState } from "./attachments";
import { addSupply, supplyProducts } from "./supplies";
import { retailerName } from "./retailers";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import { shelfPinProducts, type ShelfPinProductId } from "./shelfPinReference";

export { shelfPinProductId as attachmentPinProductId } from "./attachmentSchema";
import { shelfPinProductId } from "./attachmentSchema";
export type AttachmentPurchasePlanRow = {
  planId: string;
  name: string;
  state: AttachmentState;
  pinCount: number;
  proposedPinCount: number;
  included: boolean;
  reasons: string[];
  shelves: {
    shelfId: string;
    shelfRole: string;
    name: string;
    pinCount: number;
    proposedPinCount: number;
  }[];
};

/** Demand comparison only. Selected supply packs remain the sole purchase/BOM records. */
export function attachmentPurchaseSummary(
  project: Project,
  productId: ShelfPinProductId = shelfPinProductId,
) {
  return summarize(project, productId, attachmentReviews(project));
}

export function attachmentPurchaseSummaries(
  project: Project,
  reviews = attachmentReviews(project),
) {
  const products = new Set(reviews.map(({ plan }) => plan.productId));
  return [...products].map((productId) => summarize(project, productId, reviews));
}

function summarize(
  project: Project,
  productId: ShelfPinProductId,
  allReviews: AttachmentReview[],
) {
  const reviews = allReviews.filter(({ plan }) => plan.productId === productId);
  const product = findRetailerProduct(productId);
  const { packCount: pinsPerPack } = shelfPinProducts[productId];
  const planRows: AttachmentPurchasePlanRow[] = reviews.map((review) => ({
    planId: review.plan.id,
    name: review.plan.name,
    state: review.state,
    pinCount: review.activePinCount,
    proposedPinCount: review.plan.points.length,
    included: review.activePinCount > 0,
    reasons: review.issues.map((issue) => issue.message),
    shelves: [
      ...new Set(review.plan.points.map((point) => point.shelf.pieceId)),
    ].map((shelfId) => {
      const points = review.plan.points.filter(
          (point) => point.shelf.pieceId === shelfId,
        ),
        shelf = points[0].shelf;
      return {
        shelfId,
        shelfRole: shelf.role,
        name: shelf.name,
        pinCount: review.activePinCount > 0 ? points.length : 0,
        proposedPinCount: points.length,
      };
    }),
  }));
  const plannedPins = planRows.reduce(
      (sum, row) => sum + (row.included ? row.pinCount : 0),
      0,
    ),
    requiredPacks = Math.ceil(plannedPins / pinsPerPack),
    selectedPacks = project.supplies
      .filter((selection) => selection.productId === productId)
      .reduce((sum, selection) => sum + selection.quantity, 0),
    selectedPins = selectedPacks * pinsPerPack,
    shortfallPacks = Math.max(0, requiredPacks - selectedPacks),
    retailerSupported = supplyProducts(project.retailer).some(
      (product) => product.id === productId,
    ),
    warnings = planRows.flatMap((row) =>
      row.reasons.map((reason) => `Attachment plan ${row.planId}: ${reason}`),
    );
  if (plannedPins)
    warnings.push(
      "Pin demand is provisional planned intent, not installed support or a shelf-load assessment. No jig-kit contents or on-hand stock are credited.",
    );
  if ((plannedPins || selectedPacks) && !retailerSupported)
    warnings.push(
      `No reviewed ${retailerName(project.retailer)} offer exists for ${shelfPinProducts[productId].name}. No retailer substitution or store availability is inferred.`,
    );
  return {
    productId,
    productName: product?.name ?? shelfPinProducts[productId].name,
    referenceOffers: product ? referenceOffersForProduct(product) : [],
    pinsPerPack,
    plannedPins,
    requiredPacks,
    selectedPacks,
    shortfallPacks,
    selectedPins,
    sparePins: Math.max(0, selectedPins - plannedPins),
    provisional: plannedPins > 0,
    fitPending: reviews.some(
      (review) =>
        review.activePinCount > 0 && review.state === "needs-measurements",
    ),
    retailerSupported,
    canAddMissing: retailerSupported && shortfallPacks > 0,
    planRows,
    warnings: [...new Set(warnings)],
  };
}

/** Invoke only from an explicit user action; repeat calls cannot add the same shortfall twice. */
export function addMissingAttachmentPinPacks(
  project: Project,
  productId: ShelfPinProductId = shelfPinProductId,
): Project {
  const summary = attachmentPurchaseSummary(project, productId);
  if (!summary.shortfallPacks) return project;
  if (!summary.retailerSupported)
    throw Error(
      `${summary.productName} has no reviewed offer at ${retailerName(project.retailer)}. Choose a reviewed product before adding purchase packs.`,
    );
  return addSupply(
    project,
    productId,
    summary.shortfallPacks,
    "Planned shelf supports",
    `Added only the missing ${summary.pinsPerPack}-pin packs for these planned shelf supports. Fit, drilling setup and shelf capacity remain separate reviews.`,
  );
}
