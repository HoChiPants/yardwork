import { bottomPlateSealReviews, bottomPlateSealTakeoff } from "./bottomPlateSeal";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { trimSealant } from "./trimSealantReference";
import { reviewOpeningFlashings } from "./openingFlashing";
import { flexWrap } from "./openingFlashingReference";
import { greenhouseDoorSealTakeoff } from "./greenhouseDoorSeal";
import { doorSeal } from "./greenhouseDoorSealReference";
import { trimBackerRodCutPlan, trimSeamPurchaseSummary, woodJointDecisionEntries } from "./woodJointDecisions";
import { concreteAnchor } from "./concreteAnchorReference";
import { assemblyStages } from "./assemblyStages";
import { connectionPreparationItems } from "./buildPreparation";
import { connectionCoverage } from "./connectionCoverage";
import { greenhouseAnchorPurchase } from "./greenhouseFoundation";
import { floorHangerPurchases } from "./floorHangerPlans";
import { sunliteFastener } from "./sunliteFastenerReference";
import { reviewSunliteMounts, sunliteMountPurchase } from "./sunliteMounts";
import { attachmentPurchaseSummaries } from "./attachmentPurchases";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";
import { connectorPurchaseSummary } from "./connectorPurchases";
import { drawerRailScrewPurchase } from "./drawerSlideMounts";
import { drawerRailScrew } from "./drawerRailScrewReference";
import { drawerSlidePurchaseReview } from "./drawerSlides";
import { bom, type BomRow } from "./engine";
import { fastenerPurchaseSummary } from "./fastenerPurchases";
import { doorKitDemand } from "./greenhouseDoors";
import { hingePurchaseSummary } from "./hingePurchases";
import { hingePurchaseAllocations } from "./hinges";
import { material, type Project } from "./model";
import { purchaseUnitLabel } from "./purchaseUnits";
import { restraintPurchaseSummary } from "./restraintPurchases";
import {
  findRetailerProduct,
  referenceOffersForProduct,
  shoppingOfferForMaterial,
} from "./retailerCatalog";
import {
  everbiltRodBracketPurchases,
  rodBracketPurchases,
  rodFlangeProductId,
  rodFlangePurchases,
  rodSocketPurchases,
} from "./rodFits";
import { rodBracketProductId } from "./rodSupports";
import { harviaKit } from "./saunaHeaterReference";
import { saunaHeaterPurchases } from "./saunaHeaters";
import {
  addSupply,
  purchaseDefinition,
  supplyProducts,
  supplyRows,
} from "./supplies";
import { reviewSunliteProfiles } from "./sunliteProfiles";
import { sunliteTakeoff } from "./sunliteTakeoff";
import { reviewSunliteTape, tapePlanTitle, tapePurchasePending } from "./sunliteTapePlan";
import { sunliteTapeProductId } from "./sunliteTapeSchema";
import { edgeBandingPending, edgeBandingTitle, reviewEdgeBanding } from "./edgeBanding";
import { selectedToolsForProject } from "./toolGuide";
import { toolChecklist } from "./tools";

export function homeDepotStockMatch(row: BomRow) {
  const reference = shoppingOfferForMaterial(material(row.id), "home-depot");
  const offer = reference?.offer;
  const inventory = row.inventory;
  const path = inventory && new URL(inventory.url).pathname.replace(/\/$/, "");
  const snapshot =
    inventory &&
    path &&
    path.startsWith("/p/") &&
    path.split("/").at(-1) === inventory.internetNumber
      ? inventory
      : undefined;
  return {
    offer,
    snapshot,
    productId: snapshot?.internetNumber ?? offer?.productId,
    url: snapshot?.url ?? offer?.url,
    suggested: !snapshot && reference?.suggested,
  };
}

type PurchaseDemand = {
  id: string;
  basis: string;
  required: number | null;
  review?: string;
};

export function homeDepotPurchaseNeeds(
  project: Project,
  rows = bom(project),
  supplies = supplyRows(project),
) {
  if (project.retailer === "lowes") return [];
  const demand: PurchaseDemand[] = [];
  const include = (
    id: string,
    basis: string,
    required: number | null,
    review?: string,
  ) => {
    if (required === null || required > 0) demand.push({ id, basis, required, review });
  };
  const sameMembers = (a: string, b: string, kind?: "screw") =>
    project.joints.some(
      (joint) =>
        (!kind || joint.kind === kind) &&
        ((joint.a === a && joint.b === b) || (joint.a === b && joint.b === a)),
    );
  if (project.fastenerPlans.length)
    for (const row of fastenerPurchaseSummary(project).products) {
      const overlap = row.planRows.some(
        ({ included, planId }) =>
          included > 0 &&
          project.fastenerPlans.some(
            ({ id, head, receiver }) =>
              id === planId &&
              sameMembers(head.pieceId, receiver.pieceId, "screw"),
          ),
      );
      include(
        row.productId,
        "Wood fastener locations",
        row.requiredPacks,
        overlap
          ? "Recorded screws also connect these parts. Check whether the quantities overlap in List."
          : undefined,
      );
    }
  if (project.connectorPlans.length)
    for (const row of connectorPurchaseSummary(project).products) {
      const overlap = row.planRows.some(
        ({ included, planId }) =>
          included &&
          project.connectorPlans.some(
            ({ id, base, post }) =>
              id === planId &&
              sameMembers(base.pieceId, post.pieceId),
          ),
      );
      include(
        row.productId,
        "Connector schedules",
        row.requiredPacks,
        overlap
          ? "Recorded connections also join these parts. Check whether the quantities overlap in List."
          : row.planRows.some(
                ({ included, state }) => included && state !== "paths-reviewed",
              )
            ? "Review the connector entries and paths before adding this budget."
            : undefined,
      );
    }
  for (const row of attachmentPurchaseSummaries(project))
    include(row.productId, "Shelf support locations", row.requiredPacks);
  for (const row of floorHangerPurchases(project))
    include(row.productId, "Floor base hanger plan", row.required);
  if (project.restraintPlans.length) {
    const row = restraintPurchaseSummary(project);
    include(row.productId, "Furniture restraint locations", row.requiredKits);
  }
  if (project.lidHingePlans.length) {
    const row = hingePurchaseSummary(
      project,
      hingePurchaseAllocations(project),
    );
    include(row.productId, "Allocated physical lid hinges", row.requiredHinges);
  }
  if (project.bottomPlateSeals?.length) {
    const seals = bottomPlateSealReviews(project);
    const { required } = bottomPlateSealTakeoff(project, seals);
    include(bottomPlateSealant.id, "Clear bottom plate bead runs by work session", required || null,
      required ? undefined : "Review changed or interrupted seams to establish cartridge use.");
  }
  if (project.woodJointDecisions?.some(({ trimSeam }) => trimSeam)) {
    const details = woodJointDecisionEntries(project);
    const trim = trimSeamPurchaseSummary(project, details);
    if (trim) include(trimSealant.id, "Measured wood trim seams", trim.required,
      trim.required === null ? "Review measured seams and cartridge coverage." : undefined);
  }
  if (project.greenhouseDoorSeals?.length) {
    const seal = greenhouseDoorSealTakeoff(project);
    include(doorSeal.id, "Reviewed greenhouse door weatherseal cuts", seal.required,
      seal.required === null ? "Review the saved door weatherseal plans before adding packs." : undefined);
  }
  if (project.woodJointDecisions?.some(({ trimSeam }) => trimSeam?.backerRodId) ||
      project.openingFlashings?.some(({ measurements }) => measurements.airSeal?.method === "silicone")) {
    for (const { product, rolls, hasAirSeal } of trimBackerRodCutPlan(project))
      include(product.id, hasAirSeal ? "Measured interior seal and matching trim backing cuts" : "Measured wood trim backing cuts", rolls.length);
  }
  if (project.openingFlashings?.length) {
    const { groups, tapeGroups, airSealBatches } = reviewOpeningFlashings(project);
    const retail = groups.find(({ width }) => width === flexWrap.retailWidth);
    if (retail) include(flexWrap.id, "Checked rough opening sill cuts", retail.rolls.length);
    for (const { product, boxes } of tapeGroups)
      include(product.id, "Checked jamb and head tape cuts", boxes);
    const units = new Map<string, number>();
    for (const { material, units: count } of airSealBatches)
      units.set(material.id, (units.get(material.id) ?? 0) + count);
    for (const [id, count] of units) include(id, "Interior air seal estimates by work session", count);
  }
  if (project.motionPlans?.length) {
    const slideReview = drawerSlidePurchaseReview(project);
    for (const { productId, needed } of slideReview.products) {
      if (needed) include(productId, "Reviewed drawer slide fit", needed);
      else if (slideReview.conflicts.some(({ productIds }) => productIds.includes(productId)))
        include(productId, "Drawer slide alternatives", null,
          "Choose one slide size for the drawer before adding its hardware.");
    }
    if (project.drawerSlideMounts?.some(({ cabinet, drawer }) =>
      cabinet.fasteners?.source === drawerRailScrew.id || drawer.fasteners?.source === drawerRailScrew.id)) {
      const screws = drawerRailScrewPurchase(project);
      include(drawerRailScrew.id,
        screws.screws === null ? "Drawer rail screws" : `${screws.screws} checked drawer rail screw locations`,
        screws.required, screws.issue);
    }
    const kit = "everbilt-24417-gate-kit";
    include(
      kit,
      "Greenhouse door hardware",
      doorKitDemand(project, kit).needed,
    );
  }
  include(
    everbiltClosetRod.socketProductId,
    "Closet rod end sockets",
    rodSocketPurchases(project).needed,
  );
  if (project.rodFitPlans?.length) {
    include(
      rodFlangeProductId,
      "Measured closet rod flanges",
      rodFlangePurchases(project).needed,
    );
    include(
      rodBracketProductId,
      "Closet rod center support locations",
      rodBracketPurchases(project).needed,
    );
    include(everbiltRodBracket.productId, "Measured Everbilt closet rod supports", everbiltRodBracketPurchases(project).needed);
  }
  if (project.saunaHeaterPlans?.length)
    include(
      harviaKit.productId,
      "Sauna heater candidate",
      saunaHeaterPurchases(project, harviaKit.productId).needed,
      harviaKit.installationReview,
    );
  if (project.greenhouseFoundations?.length) include(
    concreteAnchor.productId,
    "Reviewed concrete anchor layouts",
    greenhouseAnchorPurchase(project).required,
  );
  if (project.sunliteMounts?.length) include(
    sunliteFastener.productId,
    "Reviewed SUNLITE drill marks",
    Math.ceil(sunliteMountPurchase(project, reviewSunliteMounts(project)).ready / sunliteFastener.pack),
  );
  const estimate = sunliteTakeoff(project);
  const measured = reviewSunliteProfiles(project, estimate);
  for (const row of estimate?.quantities ?? []) {
    const profile = measured?.groups.find((group) => group.id === row.id);
    if (
      profile?.rows.length &&
      profile.rows.every(({ state }) => state === "ready") &&
      !profile.removed.length
    )
      include(row.id, "Measured glazing profile cuts", profile.sticks.length);
    else
      include(
        row.id,
        "Glazing accessory estimate",
        row.packs,
        "Review glazing measurements, allowances and accessory counts in List.",
      );
  }
  if (project.sunliteTapeCuts?.length) {
    const tape = reviewSunliteTape(project, estimate);
    if (tape)
      include(
        sunliteTapeProductId,
        tapePlanTitle,
        tape.required,
        tape.required === null ? tapePurchasePending : undefined,
      );
  }
  for (const banding of reviewEdgeBanding(project))
    include(
      banding.productId,
      edgeBandingTitle,
      banding.required,
      banding.required === null ? edgeBandingPending : undefined,
    );

  if (!demand.length) return [];
  const modeledPurchaseRows = rows.filter((row) => row.quantity > 0);
  const purchasable = new Set(supplyProducts("home-depot").map(({ id }) => id));
  return [...new Set(demand.map(({ id }) => id))].flatMap((id) => {
    const sources = demand.filter((row) => row.id === id);
    const { required, review } = sources[0];
    const basis = sources.map((row) => row.basis).join(" · ");
    const selected =
      supplies.find((row) => row.productId === id)?.quantity ?? 0;
    const missing = required === null ? null : Math.max(0, required - selected);
    if (missing === 0 && sources.length === 1) return [];
    const product = findRetailerProduct(id);
    const offer =
      product &&
      referenceOffersForProduct(product).find(
        (row) => row.retailer === "home-depot",
      );
    const canBuy = purchasable.has(id) && offer?.seller === "The Home Depot";
    const sameSku =
      !!offer &&
      (modeledPurchaseRows.some(
        (row) =>
          material(row.id).productReference === id ||
          homeDepotStockMatch(row).productId === offer.productId,
      ) ||
        supplies.some(
          (row) =>
            row.productId !== id &&
            row.quantity > 0 &&
            row.offer?.productId === offer.productId,
        ));
    const ambiguous = sources.length > 1 || sameSku;
    const issue = ambiguous
      ? "This product appears in multiple purchase sources. Check the combined quantity in List."
      : !canBuy
        ? "An exact direct Home Depot listing is needed for this purchase."
        : review;
    const unit = purchaseDefinition(id)?.purchaseUnit ?? "purchase unit";
    return [
      {
        id,
        name: product?.name ?? id,
        basis,
        required,
        selected,
        missing: ambiguous ? null : missing,
        issue,
        canAdd: missing !== null && missing > 0 && !issue,
        quantityText: missing === null ? "" : `${missing} ${purchaseUnitLabel(unit, missing)}`,
      },
    ];
  });
}

export function addHomeDepotPurchaseNeed(project: Project, id: string) {
  const row = homeDepotPurchaseNeeds(project).find((need) => need.id === id);
  if (!row) return project;
  if (!row.canAdd || row.missing == null)
    throw Error(row.issue ?? "Review this purchase in List.");
  return addSupply(
    project,
    id,
    row.missing,
    row.basis,
    "Counted from the current saved plan. Confirm the delivered product and installation before building.",
  );
}

export function homeDepotToolReview(project: Project) {
  const tools = toolChecklist(project, selectedToolsForProject(project).tools);
  const unknown = tools.requirements.filter(({ status }) => status === "unknown");
  return {
    required: unknown.filter(({ necessity }) => necessity === "required"),
    conditional: unknown.filter(({ necessity }) => necessity === "conditional"),
  };
}

export function homeDepotAssemblyPurchaseReview(project: Project) {
  const stages = assemblyStages(project);
  const scopeNotes = [...new Set(stages.flatMap(({ ownerReview }) => ownerReview ? [ownerReview] : []))];
  const coverage = connectionCoverage(project, { stages });
  const assembly = coverage.stages.filter(({ ownerId, memberIds, key, intentIds }) =>
    ownerId !== project.id || intentIds.length > 0 ||
    (key.startsWith("assembly:") && key !== "assembly:Loose parts" && memberIds.length > 1),
  );
  const stageKeys = new Set(assembly.map(({ ownerId, key }) => `${ownerId}/${key}`));
  const gaps = coverage.gaps.filter(({ ownerId, stageKey }) =>
    stageKeys.has(`${ownerId}/${stageKey}`) || stageKey === "unassigned-intents",
  );
  return {
    scopeNotes,
    connections: connectionPreparationItems({ stages: assembly, gaps }),
    incomplete: scopeNotes.length > 0 || gaps.some(({ kind }) => kind !== "legacy-unlocated"),
  };
}
