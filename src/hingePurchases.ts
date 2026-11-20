import type { Project } from "./model";
import { hingeProductId, getHingeProduct } from "./hingeProducts";
import { reviewHingeStock } from "./hingeStock";
import { addSupply, supplyProducts } from "./supplies";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import { retailerName } from "./retailers";

/** Derived by the hinge-plan review, never a persisted caller verification flag. */
export type HingePurchaseAllocation = {
  planId: string;
  sourceId: string;
  segmentId: string;
  included: boolean;
  reasons: string[];
};

/** Count distinct physical sources only. Manual supply rows are the sole priced purchases. */
export function hingePurchaseSummary(
  project: Project,
  allocations: readonly HingePurchaseAllocation[] = [],
) {
  const sources = project.hingeStockSources ?? [],
    byId = new Map(sources.map((source) => [source.id, source])),
    duplicateSources = new Set(
      sources
        .filter(
          (source, index) =>
            sources.findIndex((other) => other.id === source.id) !== index,
        )
        .map((source) => source.id),
    ),
    reviews = new Map(
      sources.map((source) => [source.id, reviewHingeStock(source)]),
    ),
    claims = new Map<string, number>();
  for (const allocation of allocations)
    if (allocation.included) {
      const key = `${allocation.sourceId}/${allocation.segmentId}`;
      claims.set(key, (claims.get(key) ?? 0) + 1);
    }
  const allocationRows = allocations.map((allocation) => {
    const source = byId.get(allocation.sourceId),
      review = reviews.get(allocation.sourceId),
      reasons = [...allocation.reasons];
    let included = allocation.included;
    if (!source || duplicateSources.has(allocation.sourceId)) {
      included = false;
      reasons.push(
        "The referenced physical hinge source is missing or has ambiguous duplicate identity.",
      );
    } else if (review!.state !== "geometry-reviewed") {
      included = false;
      reasons.push(...review!.issues.map((issue) => issue.message));
    } else if (
      !review!.segments.some((segment) => segment.id === allocation.segmentId)
    ) {
      included = false;
      reasons.push(
        "The retained hinge segment no longer exists in this source's measured cut layout.",
      );
    }
    if (
      (claims.get(`${allocation.sourceId}/${allocation.segmentId}`) ?? 0) > 1
    ) {
      included = false;
      reasons.push(
        "More than one active plan claims the same physical hinge segment; affected allocations are excluded.",
      );
    }
    return { ...allocation, included, reasons: [...new Set(reasons)] };
  });
  const usedSourceIds = new Set(
    allocationRows.filter((row) => row.included).map((row) => row.sourceId),
  );
  const sourceRows = sources.map((source) => {
    const review = reviews.get(source.id)!,
      selected = project.supplies.find(
        (selection) => selection.id === source.purchaseSelectionId,
      ),
      linkedPurchaseValid =
        !!selected && selected.productId === source.productId;
    return {
      sourceId: source.id,
      productId: source.productId,
      state: review.state,
      included: usedSourceIds.has(source.id),
      planIds: [
        ...new Set(
          allocationRows
            .filter((row) => row.sourceId === source.id && row.included)
            .map((row) => row.planId),
        ),
      ],
      purchaseSelectionId: source.purchaseSelectionId,
      linkedPurchaseValid,
      segments: review.segments.map((segment) => ({
        ...segment,
        allocated: allocationRows.some(
          (row) =>
            row.included &&
            row.sourceId === source.id &&
            row.segmentId === segment.id,
        ),
      })),
      reasons: [
        ...review.issues.map((issue) => issue.message),
        ...(source.purchaseSelectionId && !linkedPurchaseValid
          ? [
              "The source's linked manual supply selection is missing or names another product; no purchase credit is inferred from that link.",
            ]
          : []),
      ],
    };
  });
  const requiredHinges = usedSourceIds.size,
    selectedHinges = project.supplies
      .filter((selection) => selection.productId === hingeProductId)
      .reduce((sum, selection) => sum + selection.quantity, 0),
    shortfallHinges = Math.max(0, requiredHinges - selectedHinges),
    retailerSupported = supplyProducts(project.retailer).some(
      (product) => product.id === hingeProductId,
    ),
    product = findRetailerProduct(hingeProductId),
    reference = getHingeProduct(hingeProductId)!,
    warnings = [
      ...allocationRows.flatMap((row) =>
        row.reasons.map((reason) => `Hinge plan ${row.planId}: ${reason}`),
      ),
      ...sourceRows.flatMap((row) =>
        row.reasons.map((reason) => `Hinge source ${row.sourceId}: ${reason}`),
      ),
    ];
  if (requiredHinges || selectedHinges)
    warnings.push(
      "Each allocated physical source is counted once even when distinct retained segments serve several lids. Manual supplies are the only priced rows; selected units are not proof of ownership, stock or installed fit. No on-hand hinge, remnant from another source or supplied screw count is inferred.",
    );
  if ((requiredHinges || selectedHinges) && !retailerSupported)
    warnings.push(
      `No reviewed ${retailerName(project.retailer)} offer exists for the exact Everbilt29256 hinge. Its Home Depot reference remains visible; no Lowe's counterpart or local availability is inferred.`,
    );
  if (allocationRows.some((row) => !row.included))
    warnings.push(
      "Some hinge allocations are excluded or pending. Required units cover included measured source allocations only; unresolved installation demand is not a complete hardware takeoff.",
    );
  return {
    productId: hingeProductId,
    productName: reference.name,
    referenceOffers: product ? referenceOffersForProduct(product) : [],
    hingesPerPack: 1 as const,
    requiredHinges,
    plannedHinges: requiredHinges,
    selectedHinges,
    shortfallHinges,
    spareHinges: Math.max(0, selectedHinges - requiredHinges),
    requiredPacks: requiredHinges,
    selectedPacks: selectedHinges,
    shortfallPacks: shortfallHinges,
    provisional: requiredHinges > 0,
    incomplete: allocationRows.some((row) => !row.included),
    retailerSupported,
    canAddMissing: retailerSupported && shortfallHinges > 0,
    allocationRows,
    sourceRows,
    warnings: [...new Set(warnings)],
  };
}

/** Explicit UI action only. It adds missing manual supply units and never creates a source/mesh/screw. */
export function addMissingHingePacks(
  project: Project,
  allocations: readonly HingePurchaseAllocation[],
): Project {
  const summary = hingePurchaseSummary(project, allocations);
  if (!summary.shortfallHinges) return project;
  if (!summary.retailerSupported)
    throw Error(
      "Choose a retailer with the reviewed exact Everbilt29256 reference before adding hinge units; no substitute has been selected.",
    );
  return addSupply(
    project,
    hingeProductId,
    summary.shortfallHinges,
    "Planned measured lid hinges",
    "Only missing whole physical hinge sources were added. Their allocated segments/remnants are not extra purchases. Actual length/kerf, mounting, supplied screws, hold-open and seating loads remain separate reviews.",
  );
}
