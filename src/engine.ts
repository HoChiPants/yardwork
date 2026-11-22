import { subfloorReport, subfloorReviews } from "./subfloor";
import { subfloorAdhesiveReport, subfloorAdhesiveReviews } from "./subfloorAdhesive";
import { subfloorFasteningReport, subfloorFasteningReviews } from "./subfloorFastening";
import { subfloorJoistReport, subfloorJoistReviews } from "./subfloorJoists";
import { floorJoistReference } from "./floorJoistReference";
import { subfloorAdhesive, subfloorNails, subfloorReference } from "./subfloorReference";
import { bottomPlateSealGuide, bottomPlateSealReviews } from "./bottomPlateSeal";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { drawingReferenceDescription } from "./drawingReference";
import { caseworkTipUpGuideLines, reviewCaseworkTipUp } from "./caseworkTipUp";
import { buildPreparation, buildPreparationMarkdown } from "./buildPreparation";
import { reviewModeledWoodContacts } from "./modeledWoodContacts";
import { trimBackerRodCutPlan, trimBackerRodGuideLines, woodJointDecisionEntries, woodJointDecisionLine, woodJointDecisionScope } from "./woodJointDecisions";
import { trimBackerRodInstructions, trimBackerRodScope } from "./trimBackerRodReference";
import { reviewSillGaskets, sillGasketGuideLines } from "./sillGaskets";
import { openingFlashingGuideLines, reviewGeneratedWindowWalls, reviewOpeningFlashings } from "./openingFlashing";
import { nonbearingHeaderSource, windowFramingSource, windowWallScope } from "./windowWall";
import { flexWrap, openingAirSealGuide, openingFlashingScope } from "./openingFlashingReference";
import { sillGasketBuildingGuide, sillGasketInstructions, sillGasketScope } from "./sillGasketReference";
import { offcutCutOrderMarkdown, offcutCutRows } from "./offcutCutGuide";
import { plannedStockCutOrders, plannedStockCutOrdersMarkdown } from "./plannedCutSources";
import { beamSource, reviewShelfSag, shelfSagGuideLines, shelfSagScope, shelfSagSummary, stiffnessSource } from "./shelfSag";
import { homeDepotShoppingList } from "./handoff";
import { stockCutSequences } from "./stockCutSequence";
import { isDrywall } from "./drywallReference";
import { reviewSunliteMounts, sunliteMountLines, sunliteMountScope } from "./sunliteMounts";
import { sunliteFastener } from "./sunliteFastenerReference";
import { reviewGreenhouseVentBacking, ventBackingGuideLines, ventBackingScope, ventBackingSource, ventBackingSummary } from "./greenhouseVentBacking";
import { concreteAnchor, concreteAnchorScope } from "./concreteAnchorReference";
import { anchorMarkText } from "./greenhouseAnchors";
import {
  greenhouseFoundationGuide, greenhouseFoundationRailText, greenhouseFoundationReviews,
  greenhouseFoundationScope, greenhouseFoundationSummary,
} from "./greenhouseFoundation";
import { reviewSiteClearance, siteClearanceText } from "./siteClearance";
import { lidSiteGuideMarkdown } from "./lidSiteGuide";
import { lidWeightGuideMarkdown, reviewLidWeight } from "./lidWeight";
import { armContactText, lidStayFitGuideMarkdown, reviewLidStayFit } from "./lidStayFit";
import {
  catalog,
  format,
  inventorySchema,
  isHardware,
  isBatt,
  material,
  part,
  uid,
  wallParts,
  type Inventory,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { retailerSearch } from "./retailers";
import { reviewedOfferForMaterial, reviewedSupplierForMaterial, shoppingOfferForMaterial } from "./retailerCatalog";
import { balanceBoardCutEnds, packRectangles, stockSplitState, type StockPlan } from "./packing";
import { everbiltClosetRod } from "./closetRodReference";
import { foilBlankSize, foilReturnText, saunaFoilLayoutChanges } from "./saunaFoil";
import { cedarbrookFoil } from "./saunaFoilReference";
import { ceilingCoverageText, ceilingGapArea, saunaCeilingCoverage, saunaCeilingGuideLines } from "./saunaCeilingCoverage";
import { formatCoverageArea } from "./depthCoverage";
import { saunaWallCoverage, saunaWallCoverageScope, saunaWallGuideLines, wallGapText } from "./saunaWallCoverage";
import { clipBox } from "./cutProfiles";
import { pieceThroughOpenings, shiftedThroughOpenings, throughOpeningPrisms, throughOpeningProblem } from "./throughOpenings";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { orientedStockSize, stockAxes } from "./stockAxes";
import { cutInstructions, cutInstructionsText } from "./cutInstructions";
import { stockCutSequenceMarkdown } from "./stockCutSequence";
import { reviewWoodSupport, woodSupportGuideLines, woodSupportScope } from "./woodSupport";
import { bearingConnectionGuideLines, bearingConnections, bearingConnectionScope } from "./bearingConnections";
import { purchaseCount } from "./purchaseUnits";
import { freshStoreCheck } from "./storeSnapshotTime";
import { suppliesMarkdown, supplyRows, formatSupplyContent } from "./supplies";
import { codeRowLabels, projectCodeMarkdown, reviewProjectCode } from "./projectCode";
import { reviewWaterPressure, waterPressureGuideStep, waterPressureObservations } from "./waterPressure";
import { longSupportSpan, waterSupportGuideLines, waterSupportNetwork, waterSupportSpanLine } from "./waterSupportNetwork";
import { waterSupportReference } from "./waterSupportReference";
import { reviewWaterRun, waterRunGuide } from "./wallWater";
import { reviewWaterFitting, waterFittingGuide } from "./waterFittings";
import { reviewWaterStop, waterStopGuide } from "./waterStops";
import { waterStop } from "./waterStopReference";
import { reviewSinkDrain, sinkDrainCodeRows, sinkDrainGuide } from "./sinkDrain";
import { sinkTrap, sinkDrainReferences } from "./sinkDrainReference";
import { maxFittingInstructions, maxInsertionChart, waterFittingProducts } from "./waterFittingReference";
import { pexInstallation, pipeProtectionSource, studBoreSource } from "./wallWaterReference";
import { reviewShingleRoof, roofAreaText, roofPitchText } from "./shingleRoof";
import { saunaHeaterMarkdown, saunaHeaterReview } from "./saunaHeaters";
import { saunaVentilationMarkdown, saunaVentilationReview, saunaVentOpeningsReview } from "./saunaVentilation";
import { liningBackingText, saunaLiningBacking, saunaLiningGuideLines, saunaLiningScope, saunaLiningSources, saunaLiningTools } from "./saunaLiningBacking";
import { motionReviewLines, projectMotionReviews } from "./mechanismMotion";
import { projectLidTravelChecks } from "./lidTravelFindings";
import { accuride3732 } from "./drawerSlideReference";
import { reviewDrawerSlideMount } from "./drawerSlideMounts";
import { reviewDrawerSlide } from "./drawerSlides";
import { everbiltLatch, greenhouseLatchGuideLines, reviewGreenhouseLatch } from "./greenhouseLatch";
import { greenhouseDoorReview } from "./greenhouseDoors";
import { greenhouseDoorStopGuideLines, greenhouseDoorStopReview } from "./greenhouseDoorStops";
import { greenhouseDoorSealGuideLines, reviewGreenhouseDoorSeal } from "./greenhouseDoorSeal";
import { doorSeal } from "./greenhouseDoorSealReference";
import { greenhouseVentReview } from "./greenhouseVents";
import { saunaDoorReview } from "./saunaDoors";
import { saunaBenchTravelGuideLines } from "./saunaBenchTravel";
import { saunaBenchGuideLines, saunaBenchReviews } from "./saunaBenches";
import { cedarbrookBenchInstructions } from "./saunaBenchReference";
import { greenhouseDoorKits } from "./greenhouseDoorReference";
import { profileNames, reviewSunliteProfiles, sunliteProfileMarkdown } from "./sunliteProfiles";
import { sunliteFluteDrainage, sunliteGuideMarkdown } from "./sunliteTakeoff";
import { sunliteTapeMarkdown } from "./sunliteTapePlan";
import { edgeBandingMarkdown } from "./edgeBanding";
import { coldRetentionText, sunliteThermalMarkdown, sunliteThermalReview, thermalAxisText } from "./sunliteThermal";
import {
  reviewSunliteRoofBacking, roofBackingGuideLines, roofBackingScope,
  roofBackingSummary, sunliteRoofDetail,
} from "./sunliteRoofBacking";
import { panelBearingGuideLines, panelBearingScope, panelBearingSummary, panelFloorBearing, panelFloorBearingSummary, reviewPanelBearing } from "./panelBearing";
import { seatSpanSummary, shelfSpanSummary } from "./panelSpans";
import { rafterBearingGuideLines, rafterBearingScope, rafterJointSummary, reviewGreenhouseRafterBearing } from "./greenhouseRafterBearing";
import { greenhouseAttachmentScope, greenhouseRoofAttachmentLines, greenhouseRoofAttachments, roofAttachmentSummary } from "./greenhouseRoofAttachments";
import { greenhouseBaseConnections, greenhouseBaseGuideLines, greenhouseBaseScope, greenhouseBaseSummary } from "./greenhouseBaseConnections";
import { floorBaseConnections, floorBaseConnectionGuideLines, floorBaseConnectionScope } from "./floorBaseConnections";
import { reviewRimAirSeals, rimAirSealGuideLines, rimAirSealKey } from "./rimAirSeals";
import { rimFoam, rimSealGuide, rimSealScope } from "./rimAirSealReference";
import { reviewRoofValleys, roofValleyGuideLines } from "./roofValleys";
import { valleyKey } from "./roofValleySchema";
import { valleyFieldGuide, valleyScope, weatherWatch } from "./roofValleyReference";
import { roofVentFlashingGuideLines, roofVentFlashingReviews } from "./roofVentFlashing";
import { oateyRoofVentBoot, roofVentFlashingScope } from "./roofVentFlashingReference";
import { floorHangerGuideLines } from "./floorHangerPlans";
import { floorHangerReport, floorHangerScope } from "./floorHangerReference";
import { closetRods, reviewRodFit, rodFitMarkdown } from "./rodFits";
import { reviewRodSocketPlates } from "./rodSocketPlates";
import { reviewRodSupports } from "./rodSupports";
import { reviewRodBracketMount } from "./rodBracketMounts";
import { bindingGuideMarkdown } from "./bindingGuide";
import { attachmentReviews } from "./attachments";
import { attachmentGuideMarkdown } from "./attachmentGuide";
import { ensurePartLabels, partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import { attachmentPurchaseSummaries, attachmentPinProductId } from "./attachmentPurchases";
import { restraintReviews } from "./restraints";
import { restraintPurchaseSummary } from "./restraintPurchases";
import { restraintGuideMarkdown } from "./restraintGuide";
import { projectNotesMarkdown } from "./projectNotes";
import { fastenerReviews } from "./fastenings";
import { fastenerPurchaseSummary } from "./fastenerPurchases";
import { reviewDriverAccess } from "./fastenerAccess";
import { fastenerGuideMarkdown } from "./fastenerGuide";
import { hingePurchaseAllocations, lidHingeReviews } from "./hinges";
import { hingePurchaseSummary } from "./hingePurchases";
import { hingeGuideMarkdown } from "./hingeGuide";
import { connectorGuideMarkdown } from "./connectorGuide";
import { hardwareForJoint } from "./jointHardware";
export { hardwareForJoint } from "./jointHardware";
import { connectionCoverage } from "./connectionCoverage";
import { connectionCoverageMarkdown, connectionStageMarkdown } from "./connectionGuide";
import {
  pricingCoverage,
  pricingCoverageMarkdown,
  type PriceSource,
  type UnresolvedPricingQuantity,
} from "./pricing";
import { inspectCutStock, pieceCutKerf, plannedCutKerf } from "./cutStock";
export { cutKerf, inspectCutStock, KERF, pieceCutKerf } from "./cutStock";
export { rotate } from "./spatial";
import { rotate } from "./spatial";
export function bounds(p: Piece) {
  let points: V3[];
  const openings = pieceThroughOpenings(p);
  if (openings.length) {
    points = throughOpeningPrisms(p.size, openings).hull.vertices.map((point) => rotate(point, p.rotation));
  } else if (p.cutPlanes?.length) {
    points = clipBox(p.size, p.cutPlanes).vertices.map((point) =>
      rotate(point, p.rotation),
    );
  } else {
    points = [];
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1])
          points.push(
            rotate(
              [(p.size[0] * x) / 2, (p.size[1] * y) / 2, (p.size[2] * z) / 2],
              p.rotation,
            ),
          );
  }
  return {
    min: p.position.map(
      (v, i) => v + Math.min(...points.map((q) => q[i])),
    ) as V3,
    max: p.position.map(
      (v, i) => v + Math.max(...points.map((q) => q[i])),
    ) as V3,
  };
}
export function distance(a: Piece, b: Piece) {
  const aa = bounds(a),
    bb = bounds(b);
  return Math.hypot(
    ...[0, 1, 2].map((i) =>
      Math.max(0, aa.min[i] - bb.max[i], bb.min[i] - aa.max[i]),
    ),
  );
}
export function cutPiece(
  p: Project,
  id: string,
  length: number,
  requestedAxis?: number,
): Project {
  const source = p.pieces.find((x) => x.id === id);
  if (!source) throw Error("Choose a part to cut.");
  if (!material(source.material).cuttable)
    throw Error("Select cuttable stock. Hardware cannot be cut.");
  if (requestedAxis !== undefined && ![0, 1, 2].includes(requestedAxis))
    throw Error("Choose a local X, Y, or Z cut axis.");
  const tube = material(source.material).shape === "tube-envelope";
  const kerf = pieceCutKerf(source);
  const axis =
      requestedAxis ??
      (tube
        ? 1
        : isBatt(source.material) || isDrywall(source.material) || source.cutStock?.sourceAxes ? stockAxes(source).length
        : (source.stockLengthAxis ??
          source.size.indexOf(Math.max(...source.size)))),
    original = source.size[axis];
  if (tube && axis !== 1)
    throw Error(
      "Tube stock can be shortened along its length. Change the product to change its diameter.",
    );
  if (isBatt(source.material) && axis === stockAxes(source).thickness)
    throw Error("Trim a batt to width or length. Choose stock of the correct thickness for the cavity.");
  if (isDrywall(source.material) && axis === stockAxes(source).thickness)
    throw Error("Score and snap the panel to width or length. The sheet thickness stays fixed.");
  if (!Number.isFinite(length) || length <= 0 || length + kerf >= original)
    throw Error(
      `Cut must be greater than zero and below ${format(original - kerf)} to leave an offcut.`,
    );
  const next = structuredClone(p),
    a = next.pieces.find((x) => x.id === id)!;
  const lineage = source.cutStock ?? {
    id: uid(),
    size: [...source.size] as V3,
    offset: [0, 0, 0] as V3,
  };
  a.cutStock = structuredClone(lineage);
  a.size[axis] = length;
  const direction = [0, 0, 0] as V3;
  direction[axis] = 1;
  const world = rotate(direction, a.rotation);
  a.position = a.position.map(
    (v, i) => v + (world[i] * (length - original)) / 2,
  ) as V3;
  const spare = structuredClone(source);
  spare.id = uid();
  spare.name = `Offcut · ${source.name.replace(/^Offcut · /, "")}`.slice(0, 120);
  spare.offcut = true;
  delete spare.guidePlacement;
  spare.cutStock = structuredClone(lineage);
  spare.cutStock.offset[axis] += length + kerf;
  spare.size[axis] = original - length - kerf;
  spare.position = spare.position.map(
    (v, i) => v + (world[i] * (length + kerf)) / 2,
  ) as V3;
  if (source.roundOpenings?.length || source.rectangularOpenings?.length) {
    const keptShift = (length - original) / 2;
    const spareShift = (length + kerf) / 2;
    const keptRound = shiftedThroughOpenings(source.roundOpenings ?? [], a.size, axis, keptShift);
    const spareRound = shiftedThroughOpenings(source.roundOpenings ?? [], spare.size, axis, spareShift)
      .map(({ source: _obligation, ...opening }) => opening);
    const keptRectangular = shiftedThroughOpenings(source.rectangularOpenings ?? [], a.size, axis, keptShift);
    const spareRectangular = shiftedThroughOpenings(source.rectangularOpenings ?? [], spare.size, axis, spareShift);
    const retainedProblem = throughOpeningProblem(a.size, [...keptRound, ...keptRectangular]);
    if (retainedProblem) throw Error(retainedProblem);
    if (keptRound.length) a.roundOpenings = keptRound;
    else delete a.roundOpenings;
    if (keptRectangular.length) a.rectangularOpenings = keptRectangular;
    else delete a.rectangularOpenings;
    const remnantProblem = throughOpeningProblem(spare.size, [...spareRound, ...spareRectangular]);
    if (remnantProblem === "The openings would remove the whole blank.") return next;
    if (remnantProblem) throw Error(remnantProblem);
    if (spareRound.length) spare.roundOpenings = spareRound;
    else delete spare.roundOpenings;
    if (spareRectangular.length) spare.rectangularOpenings = spareRectangular;
    else delete spare.rectangularOpenings;
  }
  if (source.cutPlanes?.length) {
    const keptShift = (length - original) / 2;
    const spareShift = (length + kerf) / 2;
    a.cutPlanes = source.cutPlanes.map((plane) => ({
      normal: [...plane.normal] as V3,
      constant: plane.constant - plane.normal[axis] * keptShift,
    }));
    spare.cutPlanes = source.cutPlanes.map((plane) => ({
      normal: [...plane.normal] as V3,
      constant: plane.constant - plane.normal[axis] * spareShift,
    }));
    // Work entirely on the cloned project. Invalid/empty retained solids reject
    // the operation; an empty offcut represents waste, not a phantom wood part.
    clipBox(a.size, a.cutPlanes);
    try {
      clipBox(spare.size, spare.cutPlanes);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Cut planes remove the stock") ||
          error.message.startsWith("Cut planes leave empty"))
      )
        return next;
      throw error;
    }
  }
  next.pieces.push(spare);
  return next;
}
export function addMaterial(
  p: Project,
  id: MaterialId,
  position: V3,
  stepId: string,
): Project {
  const m = material(id);
  return {
    ...p,
    pieces: [
      ...p.pieces,
      part(
        m.name,
        id,
        [...m.size],
        [position[0], position[1] + m.size[1] / 2, position[2]],
        stepId,
        "Loose parts",
      ),
    ],
  };
}
export type CutBin = {
  sourceId?: string;
  sourceSize?: V3;
  remaining: number;
  cuts: { name: string; length: number; id: string }[];
};
export type BomRow = {
  id: MaterialId;
  /** Purchase packs/sell units; physical cut stock is counted separately. */
  quantity: number;
  physicalStockUnits: number;
  onHandStockUnits: number;
  packCount: number;
  purchasedStockUnits: number;
  surplusStockUnits: number;
  pieces: number;
  price: number;
  priceSource: PriceSource;
  unpriced: boolean;
  total: number;
  bins: CutBin[];
  oversize: number;
  oversizedParts: Piece[];
  rolls: StockPlan[];
  sheets: StockPlan[];
  inventory?: Inventory;
  supplier?: NonNullable<ReturnType<typeof reviewedSupplierForMaterial>>;
  verified: boolean;
};
export function usableInventory(p: Project, id: MaterialId, now = Date.now()) {
  return p.inventory
    .filter(
      (i) =>
        i.material === id &&
        (i.retailer ?? "home-depot") === (p.retailer ?? "home-depot") &&
        i.zip === p.zip &&
        !!p.store &&
        i.store === p.store &&
        freshStoreCheck(i.checkedAt, now) &&
        inventorySchema.safeParse(i).success,
    )
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
}
export function bom(p: Project, now = Date.now()): BomRow[] {
  const cutStock = inspectCutStock(p);
  const onHand = new Set(p.onHandCutSources);
  const fittedSinkTraps = new Set((p.sinkDrains ?? []).map(({ bodyId }) => bodyId));
  return catalog
    .filter((material) => !material.includedComponent)
    .map((m) => {
      const parts = p.pieces.filter((x) => x.material === m.id),
        bins: CutBin[] = [],
        oversizedParts: Piece[] = [],
        seenSources = new Set<string>();
      const kerf = plannedCutKerf(p, m.id);
      const measured = p.woodKerfs?.[m.id] !== undefined;
      let rolls: StockPlan[] = [];
      let sheets: StockPlan[] = [];
      let physicalStockUnits = 0,
        oversize = 0;
      if (m.stockKind === "linear") {
        const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b),
          length = stock[2],
          normalBins: CutBin[] = [];
        for (const piece of [...parts].sort(
          (a, b) => Math.max(...b.size) - Math.max(...a.size),
        )) {
          const s = orientedStockSize(
            piece,
            m.shape === "tube-envelope" ? 1 : null,
          );
          if (
            s[0] > stock[0] + 0.001 ||
            s[1] > stock[1] + 0.001 ||
            s[2] > length + 0.001
          ) {
            oversize++;
            oversizedParts.push(piece);
            continue;
          }
          if (piece.cutStock && cutStock.valid.has(piece.cutStock.id)) {
            if (!seenSources.has(piece.cutStock.id)) {
              const originalLength = orientedStockSize(
                { ...piece, size: piece.cutStock.size },
                m.shape === "tube-envelope" ? 1 : null,
              )[2];
              bins.push({
                sourceId: piece.cutStock.id,
                sourceSize: piece.cutStock.size,
                remaining: Math.max(
                  0,
                  length -
                    originalLength -
                    (originalLength < length - 0.000001 ? pieceCutKerf(piece) : 0),
                ),
                cuts: [
                  {
                    id: piece.id,
                    name: "Shared cut source — review individual retained pieces and offcuts",
                    length: originalLength,
                  },
                ],
              });
              seenSources.add(piece.cutStock.id);
            }
            continue;
          }
          let bin = normalBins.find((bin) => {
            if (!measured) return bin.remaining >= s[2] - 0.001;
            const fit = stockSplitState(bin.remaining, s[2], kerf);
            return fit === "whole" || fit === "cut";
          });
          if (!bin) {
            bin = { remaining: length, cuts: [] };
            bins.push(bin);
            normalBins.push(bin);
          }
          bin.cuts.push({ id: piece.id, name: piece.name, length: s[2] });
          bin.remaining = Math.max(0, bin.remaining - s[2] - kerf);
        }
        if ((m.wood || m.id === everbiltClosetRod.materialId) && m.cuttable)
          balanceBoardCutEnds(normalBins, length, kerf);
        physicalStockUnits = bins.length;
      } else if (isHardware(m.id)) {
        const connectionUnits = p.joints
          .filter((j) => hardwareForJoint(j)?.id === m.id)
          .reduce((sum, j) => sum + j.quantity, 0);
        physicalStockUnits = parts.length + connectionUnits;
      } else if (m.orderRollWidth && parts.length) {
        const cuts = parts.map((piece) => {
          const [length, width] = foilBlankSize(piece);
          return { id: piece.id, name: piece.name, width, length };
        });
        // The sum is a packing bound, not an advertised roll length. Quote
        // the length of a feasible cut layout rounded up to whole feet.
        const bound = cuts.reduce((total, cut) => total + cut.length, 0);
        const packed = packRectangles(cuts, m.orderRollWidth, bound, { allowRotation: false });
        const plan = packed.plans[0];
        if (plan) {
          physicalStockUnits = Math.ceil(plan.usedLength / 12);
          rolls = [{ ...plan, length: physicalStockUnits * 12 }];
        }
        const rejected = new Set(packed.rejected.map((cut) => cut.id));
        oversizedParts.push(...parts.filter((piece) => rejected.has(piece.id)));
        oversize = oversizedParts.length;
      } else if (m.id === "mesh") {
        const [thickness, width, length] = [...(m.stockSize ?? m.size)].sort(
          (a, b) => a - b,
        );
        const rectangles = [];
        for (const piece of parts) {
          const sizes = [...piece.size].sort((a, b) => a - b);
          if (sizes[0] > thickness + 1e-8) oversizedParts.push(piece);
          else
            rectangles.push({
              id: piece.id,
              name: piece.name,
              width: sizes[1],
              length: sizes[2],
            });
        }
        const packed = packRectangles(rectangles, width, length);
        rolls = packed.plans;
        const rejected = new Set(packed.rejected.map((p) => p.id));
        oversizedParts.push(...parts.filter((p) => rejected.has(p.id)));
        oversize = oversizedParts.length;
        physicalStockUnits = rolls.length;
      } else if (m.stockKind === "sheet" && m.cuttable) {
        const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b),
          rectangles = [];
        for (const piece of parts) {
          const s = orientedStockSize(piece);
          if (s.some((v, i) => v > stock[i] + 0.001)) {
            oversize++;
            oversizedParts.push(piece);
          } else if (piece.cutStock) {
            // Existing physical cut sources cannot be repacked into new stock.
            // Invalid lineage stays conservative: one stock unit per piece.
            if (!cutStock.valid.has(piece.cutStock.id)) physicalStockUnits++;
            else if (!seenSources.has(piece.cutStock.id)) {
              physicalStockUnits++;
              seenSources.add(piece.cutStock.id);
            }
          } else
            rectangles.push({
              id: piece.id,
              name: piece.name,
              width: s[1],
              length: s[2],
            });
        }
        const packed = packRectangles(rectangles, stock[1], stock[2], {
          kerf,
          allowRotation: false,
          checkEdgeCuts: measured,
        });
        sheets = packed.plans;
        physicalStockUnits += sheets.length;
        const rejected = new Set(packed.rejected.map((piece) => piece.id));
        oversizedParts.push(...parts.filter((piece) => rejected.has(piece.id)));
        oversize = oversizedParts.length;
      } else {
        const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b);
        for (const x of parts) {
          const s = [...x.size].sort((a, b) => a - b);
          // The catalog width is the tube OD. A fitted assembly includes its measured collar.
          const fittedTrap = m.id === sinkTrap.id && fittedSinkTraps.has(x.id);
          if (!fittedTrap && s.some((v, i) => v > stock[i] + 0.001)) {
            oversize++;
            oversizedParts.push(x);
          } else if (
            m.stockKind === "sheet" &&
            x.cutStock &&
            cutStock.valid.has(x.cutStock.id)
          ) {
            if (!seenSources.has(x.cutStock.id)) physicalStockUnits++;
            seenSources.add(x.cutStock.id);
          } else physicalStockUnits++;
        }
      }
      const onHandStockUnits = [...seenSources].filter((id) => onHand.has(id)).length;
      const counts = purchaseCount(physicalStockUnits - onHandStockUnits, m.packCount),
        inventory = usableInventory(p, m.id, now),
        price = inventory?.price ?? m.price,
        priceSource: PriceSource = inventory
          ? "snapshot"
          : m.priceKind === "unpriced"
            ? "unknown"
            : "example";
      const supplier = reviewedSupplierForMaterial(m);
      return {
        id: m.id,
        ...counts,
        physicalStockUnits,
        onHandStockUnits,
        pieces: parts.length,
        price,
        priceSource,
        unpriced: priceSource === "unknown",
        total: price * counts.quantity,
        bins,
        oversize,
        oversizedParts,
        rolls,
        sheets,
        inventory,
        ...(supplier && !reviewedOfferForMaterial(m, p.retailer) ? { supplier } : {}),
        verified: !!inventory,
      };
    })
    .filter((r) => r.pieces > 0 || r.quantity > 0);
}

export function stockOnHand(rows: readonly BomRow[]) {
  return rows.flatMap(({ id, onHandStockUnits }) =>
    onHandStockUnits ? [{ id, name: material(id).name, quantity: onHandStockUnits }] : [],
  );
}
/** Coverage of calculated purchase lines, never a complete-project quote. */
export function projectPricingCoverage(
  project: Project,
  materialRows: readonly BomRow[] = bom(project),
  supplyPurchases: ReturnType<typeof supplyRows> = supplyRows(project),
) {
  const supplyLines = supplyPurchases.filter((row) => !row.isTool);
  const unresolvedQuantities: UnresolvedPricingQuantity[] = [],
    unresolvedJoints = project.joints.filter(
      (joint) => !hardwareForJoint(joint),
    );
  if (unresolvedJoints.length)
    unresolvedQuantities.push({
      description: "Legacy connection hardware has no matching purchase size; its quantities are outside the subtotal",
      count: unresolvedJoints.reduce((sum, joint) => sum + joint.quantity, 0),
      unit: "connection items",
    });
  for (const row of supplyLines)
    if (row.unresolved)
      unresolvedQuantities.push({
        description: `Supply identity or current retailer offer unresolved: ${row.name}`,
        count: row.quantity,
        unit: row.purchaseUnit,
      });
  const lineage = inspectCutStock(project);
  if (lineage.invalid.length)
    unresolvedQuantities.push({
      description: "Cut-source provenance is unresolved; stock quantities are conservative and need review",
      count: lineage.invalid.length,
      unit: "cut sources",
    });
  if (project.lidHingePlans.length) {
    const reviews = lidHingeReviews(project), comparison = hingePurchaseSummary(project, hingePurchaseAllocations(project));
    const pending = reviews.filter((review) => review.state !== "geometry-reviewed").length;
    if (pending) unresolvedQuantities.push({ description: "Hinge mounting/source measurements remain unresolved; the subtotal is not a complete installation takeoff", count: pending, unit: "hinge plans" });
    if (comparison.shortfallHinges) unresolvedQuantities.push({ description: "Allocated physical hinge sources need manual purchase selections; retained segments are not extra purchase units", count: comparison.shortfallHinges, unit: "whole hinges" });
  }
  return pricingCoverage({
    materials: materialRows.map((row) => ({
      id: row.id,
      name: material(row.id).name,
      quantity: row.quantity,
      purchaseUnit: material(row.id).unit,
      priceSource: row.priceSource,
      total: row.unpriced ? null : row.total,
    })),
    supplies: supplyLines.map((row) => ({
      id: row.productId,
      name: row.name,
      quantity: row.quantity,
      purchaseUnit: row.purchaseUnit,
      priceSource:
        row.inventory && row.total !== null ? "snapshot" : "unknown",
      total: row.total,
    })),
    excludedPartCount: materialRows.reduce((sum, row) => sum + row.oversize, 0),
    unresolvedQuantities,
    warnings: supplyLines.flatMap((row) => row.issues),
  });
}
export type Finding = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  pieceId?: string;
  pieceIds?: string[];
  attachmentPlanId?: string;
  restraintPlanId?: string;
  fastenerPlanId?: string;
  hingePlanId?: string;
  openingFlashingSillId?: string;
  area?: {
    outlines: V3[][];
    boundaries?: V3[][];
    lines?: [V3, V3][];
    referenceLines?: [V3, V3][];
    kind?: "glazing-hole-layout" | "vent-sash-gap" | "roof-seam-gap" | "wall-batt-gap" | "panel-bearing" | "panel-floor-bearing" | "seat-span" | "shelf-span" | "rafter-eave" | "rafter-ridge" | "eave-block-preview" | "roof-plane" | "shelf-divider-preview" | "support-block-preview" | "subfloor-block-preview";
    label: string;
    labelPoint: V3;
    tone?: "reference";
  };
  connectionScope?: {memberIds:string[];title:string;ownerId?:string;stageKey?:string;roofEntryId?:string;baseEntryId?:string};
};
export function validate(p: Project, woodSupport = reviewWoodSupport(p)): Finding[] {
  const findings: Finding[] = [];
  for (const row of reviewGeneratedWindowWalls(p)) {
    if (!row.ready) findings.push({
      id: `window-wall-${row.section.id}`, title: `Window framing needs review · ${row.section.name}`,
      severity: "warning", detail: row.detail, pieceId: row.members?.sill,
    });
  }
  for (const row of reviewSillGaskets(p).rows) {
    if (row.issues.length) findings.push({
      id: `sill-gasket-${row.plan.partId}`,
      title: `Sill gasket needs review · ${row.title}`,
      severity: "warning",
      detail: row.issues.join(" "),
      pieceId: row.outline ? row.plan.partId : undefined,
    });
  }
  for (const { name, rimId, plan, issues } of reviewRimAirSeals(p).rows) {
    if (issues.length) findings.push({
      id: `rim-air-seal-${rimAirSealKey(plan.input)}`, title: `Review rim air seal · ${name}`,
      severity: "warning", detail: issues.join(" "), pieceId: rimId,
    });
  }
  for (const { plan, issue } of reviewRoofValleys(p).rows) {
    if (issue) findings.push({
      id: `roof-valley-${valleyKey(plan.input.panels)}`, title: `Review roof valley · ${plan.input.label}`,
      severity: "warning", detail: issue,
    });
  }
  for (const { plan, issue } of roofVentFlashingReviews(p)) {
    if (issue) findings.push({
      id: `roof-vent-flashing-${plan.id}`, title: `Review roof vent flashing · ${plan.input.label}`,
      severity: "warning", detail: issue, pieceId: plan.input.panelId,
    });
  }
  for (const row of reviewOpeningFlashings(p).rows) {
    if (row.issues.length) findings.push({
      id: `opening-flashing-${row.plan.members.sill}`,
      title: `Opening flashing needs review · ${row.title}`,
      severity: "warning",
      detail: row.issues.join(" "),
      openingFlashingSillId: row.plan.members.sill,
    });
  }
  for (const plan of p.lidWeightPlans ?? []) {
    const review = reviewLidWeight(p, plan);
    if (review.state === "stale") findings.push({
      id: `lid-weight-${plan.sectionId}`,
      severity: "warning",
      title: "Review lid weight measurements",
      detail: review.reason,
      ...(p.pieces.some((piece) => piece.id === plan.pieceId && !piece.offcut) ? { pieceId: plan.pieceId } : {}),
    });
  }
  for (const fit of p.lidStayFits ?? []) {
    const review = reviewLidStayFit(p, fit);
    const armHit = review.state === "current" ? review.armClearance?.() : null;
    if (review.state === "current" && !review.limit && !armHit) continue;
    findings.push({
      id: `lid-stay-fit-${fit.id}`,
      severity: "warning",
      title: "Folding lid stay needs review",
      detail: review.state !== "current" ? review.reason
        : armHit ? armContactText(p, armHit)
          : `Measured reach stops travel near ${Number(review.limit!.inspectAt.toFixed(2))}°. Review the mounting pins and measured arm lengths.`,
      ...(p.pieces.some((piece) => piece.id === fit.lidPieceId && !piece.offcut) ? { pieceId: fit.lidPieceId } : {}),
    });
  }
  const roofBearing = reviewGreenhouseRafterBearing(p);
  for (const review of roofBearing)
    for (const joint of ["eave", "ridge"] as const) {
      const connections = review.rows.map((row) => row[joint]);
      const pending = connections.filter(({ state }) => state !== "contact");
      const title = joint === "eave" ? "Eave bearing" : "Ridge fit";
      findings.push({
        id: `rafter-${joint}-${review.entryId}`,
        severity: pending.length ? "warning" : "info",
        title: `Greenhouse rafters · ${title}`,
        detail: `${review.title} · ${rafterJointSummary(review, joint)} ${joint === "eave"
          ? "Resolve the seat or hardware at the wall."
          : "Review ridge supports and connections separately."}`,
        area: {
          kind: joint === "eave" ? "rafter-eave" : "rafter-ridge",
          outlines: connections.flatMap(({ patches }) => patches.map(({ outline }) => outline)),
          lines: pending.map(({ point: [x, y, z] }) => [[x, y - 1.5, z], [x, y + 1.5, z]]),
          label: `${title} · ${connections.length - pending.length} of ${connections.length} face contacts`,
          labelPoint: (pending[0] ?? connections[0]).point,
        },
      });
    }
  for (const review of reviewSunliteRoofBacking(p)) {
    const gaps = review.seams.flatMap(({ gaps }) => gaps);
    if (!gaps.length) continue;
    const longest = gaps.reduce((highest, current) => current.length > highest.length ? current : highest);
    const partial = review.seams.filter((seam) => seam.partial).length;
    findings.push({
      id: `sunlite-roof-backing-${review.roomId}`,
      severity: "warning",
      title: "Roof glazing seams need backing review",
      detail: `${review.title} · ${roofBackingSummary(review)} Longest gap ${formatPreciseInches(longest.length)}.${partial ? ` Includes ${partial} partial edge overlaps. Review backing and profile terminations at the transitions.` : ""}`,
      area: {
        outlines: [],
        lines: gaps.map(({ points }) => points),
        kind: "roof-seam-gap",
        label: `Roof seam gap · ${formatPreciseInches(longest.length)}`,
        labelPoint: longest.points[0].map((n, i) => (n + longest.points[1][i]) / 2) as V3,
      },
    });
  }
  for (const review of reviewGreenhouseVentBacking(p)) {
    const gaps = review.edges.flatMap(({ gaps }) => gaps);
    const longest = gaps.reduce<typeof gaps[number] | undefined>(
      (largest, gap) => !largest || largest.length < gap.length ? gap : largest,
      undefined,
    );
    const needsReview = !review.parts.length || review.parts.some(({ warning }) => warning);
    const focus = review.parts.find(({ warning }) => warning)?.id ?? review.parts[0]?.id;
    findings.push({
      id: `sunlite-vent-backing-${review.id}`,
      severity: longest || needsReview ? "warning" : "info",
      title: "Roof vent sash backing",
      detail: [
        `${review.title} · ${ventBackingSummary(review)}`,
        ...(longest ? [`Longest gap ${formatPreciseInches(longest.length)}. Review backing attached to the moving sash.`] : []),
        ...review.parts.flatMap(({ warning }) => warning ? [warning] : []),
      ].join(" "),
      ...(focus ? { pieceId: focus } : {}),
      ...(longest ? { area: {
        outlines: [],
        lines: gaps.map(({ points }) => points),
        kind: "vent-sash-gap" as const,
        label: `Sash backing gap · ${formatPreciseInches(longest.length)}`,
        labelPoint: longest.points[0].map((n, i) => (n + longest.points[1][i]) / 2) as V3,
      } } : {}),
    });
  }
  for (const pane of p.pieces) {
    if (pane.offcut || pane.material !== "sunlite-8mm") continue;
    const { issue } = sunliteFluteDrainage(pane);
    if (issue) findings.push({
      id: `sunlite-flute-drainage-${pane.id}`,
      severity: "warning",
      title: "Glazing flute direction needs review",
      detail: `${pane.name} · ${issue}`,
      pieceId: pane.id,
    });
  }
  if (p.sunliteProfilePlan?.cuts.length) {
    for (const group of reviewSunliteProfiles(p)?.groups ?? []) {
      const stale = group.removed.length + group.rows.filter((row) => row.state === "stale").length;
      const oversize = group.rows.filter((row) => row.state === "oversize").length;
      if (stale || oversize) findings.push({
        id: `profile-cut-review-${group.id}`,
        severity: "warning",
        title: `Review ${profileNames[group.id]} cuts`,
        detail: [
          ...(stale ? [`Remeasure changed or missing edges (${stale}).`] : []),
          ...(oversize ? [`Resolve cuts that exceed the usable stock and saw kerf (${oversize}).`] : []),
        ].join(" "),
      });
    }
  }
  const waterRunsReviewed = new Map<string, ReturnType<typeof reviewWaterRun>>();
  for (const run of p.waterRuns ?? []) {
    const review = reviewWaterRun(p, run);
    waterRunsReviewed.set(run.id, review);
    if (review.problem) findings.push({
      id: `water-line-${run.id}`, severity: "warning", title: `Review water line · ${run.name}`, detail: review.problem,
      ...(p.pieces.some(({ id }) => id === run.pipeId) && { pieceId: run.pipeId }),
    });
  }
  const checkedPipeHardware = new Set<string>();
  const waterFittingsReviewed = new Map<string, ReturnType<typeof reviewWaterFitting>>();
  for (const fitting of p.waterFittings ?? []) {
    const review = reviewWaterFitting(p, fitting);
    waterFittingsReviewed.set(fitting.id, review);
    if (review.layout) checkedPipeHardware.add(fitting.pieceId);
    if (review.problem) findings.push({
      id: `water-fitting-${fitting.id}`, severity: "warning", title: `Review PEX connection · ${waterFittingProducts[fitting.materialId].model}`,
      detail: review.problem, ...(p.pieces.some(({ id }) => id === fitting.pieceId) && { pieceId: fitting.pieceId }),
    });
  }
  for (const stop of p.waterStops ?? []) {
    const review = reviewWaterStop(p, stop);
    if (review.layout) checkedPipeHardware.add(stop.pieceId);
    if (review.problem) findings.push({
      id: `water-stop-${stop.id}`, severity: "warning", title: `Review fixture shutoff · ${stop.name}`,
      detail: review.problem, ...(p.pieces.some(({ id }) => id === stop.pieceId) && { pieceId: stop.pieceId }),
    });
  }
  for (const { panelId, layout, problem } of subfloorReviews(p)) {
    const detail = problem || layout?.issues.join(" ");
    if (detail) findings.push({ id: `subfloor-${panelId}`, severity: "warning",
      title: `Review subfloor support${layout ? ` · ${layout.piece.name}` : ""}`, detail,
      ...(p.pieces.some(({ id }) => id === panelId) && { pieceId: panelId }),
    });
  }
  for (const { panelId, problem } of subfloorAdhesiveReviews(p)) {
    if (problem) findings.push({ id: `subfloor-adhesive-${panelId}`, severity: "warning",
      title: "Review subfloor adhesive", detail: problem,
      ...(p.pieces.some(({ id }) => id === panelId) && { pieceId: panelId }),
    });
  }
  for (const { panelId, problem } of subfloorFasteningReviews(p)) {
    if (problem) findings.push({ id: `subfloor-fasteners-${panelId}`, severity: "warning",
      title: "Review subfloor fasteners", detail: problem,
      ...(p.pieces.some(({ id }) => id === panelId) && { pieceId: panelId }),
    });
  }
  for (const review of subfloorJoistReviews(p)) {
    const { panelId, rows, problem, referenceProblem } = review;
    const issue = problem ?? referenceProblem;
    if (issue) findings.push({ id: `subfloor-joists-${panelId}`, severity: "warning",
      title: "Review joist bearing and span", detail: issue,
      ...(p.pieces.some(({ id }) => id === panelId) && { pieceId: panelId }) });
    for (const { id, ends, issue } of rows) {
      const detail = [...ends.flatMap(({ label, issue }) => issue ? [`${label}. ${issue}`] : []), issue].filter(Boolean).join(" ");
      if (detail) findings.push({ id: `subfloor-joist-${panelId}-${id}`, severity: "warning",
        title: `Review joist ${partLabel(p, id)}`, detail, pieceId: id });
    }
  }
  for (const { record, title, layout, problem } of bottomPlateSealReviews(p)) {
    const detail = problem || layout?.runs.find(({ problem }) => problem)?.problem;
    if (detail) findings.push({ id: `bottom-plate-${record.id}`, severity: "warning",
      title: `Review bottom plate air seal · ${title}`, detail,
      ...(layout && { pieceId: record.plateId }),
    });
  }
  for (const drain of p.sinkDrains ?? []) {
    const review = reviewSinkDrain(p, drain);
    const detail = review.layout
      ? sinkDrainCodeRows(p, drain, review.layout).filter(({ state }) => state === "discrepancy").map(({ detail }) => detail).join(" ")
      : review.problem;
    if (detail) findings.push({
      id: `sink-drain-${drain.id}`, severity: "warning", title: `Review sink drain · ${drain.name}`, detail,
      ...(p.pieces.some(({ id }) => id === drain.bodyId) && { pieceId: drain.bodyId }),
    });
  }
  if (p.waterRuns?.length) {
    const spacing = waterSupportNetwork(p, waterRunsReviewed, waterFittingsReviewed);
    const longest = spacing.spans.find(longSupportSpan);
    if (longest || spacing.loop) findings.push({
      id: "water-support-spacing", severity: "warning", title: "Review PEX support spacing",
      detail: spacing.loop
        ? "Review unsupported loops and confirm field support locations before relying on the longest span."
        : `${waterSupportSpanLine(longest!)}. The horizontal reference is 32 in.`,
      ...(longest?.from.pieceId && { pieceId: longest.from.pieceId }),
    });
  }
  for (const test of p.waterPressureTests ?? []) {
    const { rows } = reviewWaterPressure(p, test);
    const issues = rows.filter(({ state }) => state === "discrepancy");
    if (issues.length) findings.push({
      id: `water-pressure-${test.id}`, severity: "warning", title: `Review water test · ${test.name}`,
      detail: issues.map(({ detail }) => detail).join(" "),
      pieceId: test.scope.runs.find(({ id }) => id === test.rootRunId)?.pipeId,
    });
  }
  if (p.projectCode) {
    for (const row of reviewProjectCode(p.projectCode, p).rows) {
      if (row.state === "discrepancy")
        findings.push({ id: `project-code-${row.id}`, severity: "warning", title: row.label, detail: row.detail });
    }
    if (p.projectCode.trades.includes("roofing") && p.projectCode.shingleRoof) {
      const review = reviewShingleRoof(p, p.projectCode.shingleRoof);
      for (const { plane, pitch, area, pieceId, faces, reason } of review.planes) {
        const outlines = faces.map(({ points }) => points);
        const points = outlines.flat();
        const label = `${plane.label} · ${pitch === null ? "Roof pitch pending" : roofPitchText(pitch)}`;
        findings.push({
          id: `shingle-roof-plane-${plane.id}`,
          severity: pitch === null ? "warning" : "info",
          title: `Roof area · ${plane.label}`,
          detail: [pitch === null ? "" : label, area === null ? reason : `Measured roof surface ${roofAreaText(area)}.`].filter(Boolean).join(" "),
          ...(pieceId ? { pieceId } : {}),
          ...(points.length ? { area: {
            kind: "roof-plane" as const, tone: "reference" as const, outlines, label,
            labelPoint: [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length) as V3,
          } } : {}),
        });
      }
      if (review.overlaps) findings.push({ id: "shingle-roof-overlap", severity: "warning", title: "Review overlapping roof areas",
        detail: "Two selected deck surfaces overlap on the same plane. Review the roof area selection before estimating shingles." });
    }
  }
  for (const plan of p.motionPlans ?? []) {
    const door = greenhouseDoorReview(p, plan);
    if (door?.warning) findings.push({
      id: `greenhouse-door-${plan.id}`, severity: "warning",
      title: `Review greenhouse door setup · ${plan.label}`, detail: door.warning,
    });
    const stopFindings = greenhouseDoorStopReview(p, plan).filter(({ warning }) => warning);
    if (stopFindings.length) findings.push({
      id: `greenhouse-door-stops-${plan.id}`, severity: "warning",
      title: "Review fitted greenhouse door stops",
      detail: stopFindings.map(({ line }) => line).join(" "),
    });
    const vent = greenhouseVentReview(p, plan);
    if (vent?.warning) findings.push({
      id: `greenhouse-roof-vent-${plan.id}`, severity: "warning",
      title: `Review greenhouse roof vent · ${plan.label}`, detail: vent.warning,
    });
    const saunaDoor = saunaDoorReview(p, plan);
    if (saunaDoor?.warning) findings.push({
      id: `sauna-door-${plan.id}`, severity: "warning",
      title: `Review sauna door setup · ${plan.label}`, detail: saunaDoor.warning,
    });
    const fit = reviewDrawerSlide(p, plan);
    if (fit && !fit.ready) findings.push({
      id: `drawer-slide-fit-${plan.id}`,
      severity: "warning",
      title: `Review drawer slide fit · ${plan.label}`,
      detail: fit.rows.filter((row) => !row.matches).map((row) => `${row.label}. ${row.detail}`).join(" "),
    });
  }
  for (const mount of p.drawerSlideMounts ?? []) {
    const review = reviewDrawerSlideMount(p, mount);
    if (review.state === "checked") continue;
    findings.push({
      id: `drawer-slide-mount-${mount.motionId}`,
      severity: "warning",
      title: "Review drawer rail mounting",
      detail: review.detail,
    });
  }
  for (const layout of saunaFoilLayoutChanges(p))
    findings.push({
      id: `sauna-foil-${layout.id}`,
      severity: "warning",
      title: "Review edited sauna foil coverage",
      detail: `${layout.label} has changed foil panels. Check overlaps, returns and the full wall and ceiling coverage before ordering.`,
    });
  for (const review of saunaWallCoverage(p)) {
    if (review.depthMismatch) findings.push({
      id: `sauna-wall-depth-${review.roomId}`,
      severity: "warning",
      title: "Review sauna wall cavity depth",
      detail: `${review.title} · ${review.depthMismatch}`,
    });
    for (const gap of review.gaps) findings.push({
      id: `sauna-wall-coverage-${review.roomId}-${gap.wall}`,
      severity: "warning",
      title: `Sauna wall insulation gap · ${gap.wall}`,
      detail: `${review.title} · ${wallGapText(gap)}`,
      area: {
        kind: "wall-batt-gap",
        outlines: gap.outlines,
        label: `${gap.wall} · ${formatCoverageArea(gap.openArea)} uncovered`,
        labelPoint: gap.labelPoint,
      },
    });
    for (const pieceId of review.unseatedPartIds) findings.push({
      id: `sauna-wall-seat-${review.roomId}-${pieceId}`,
      severity: "warning",
      title: "Wall batt needs placement review",
      detail: `${partLabel(p, pieceId)} does not fill the layer at any modeled wall bay. Check its depth, position and orientation.`,
      pieceId,
    });
  }
  for (const review of saunaCeilingCoverage(p)) {
    if (!review.enoughFramingDepth || review.labelPoint) findings.push({
      id: `sauna-ceiling-coverage-${review.roomId}`,
      severity: "warning",
      title: review.labelPoint ? "Sauna ceiling insulation gap" : "Review sauna ceiling depth",
      detail: `${review.title} · ${ceilingCoverageText(review)}`,
      ...(review.labelPoint ? {
        area: {
          outlines: review.outlines,
          label: `Uncovered ceiling · ${ceilingGapArea(review.openArea)}`,
          labelPoint: review.labelPoint,
        },
      } : {}),
    });
    for (const pieceId of review.overlappingPartIds) findings.push({
      id: `sauna-ceiling-overlap-${review.roomId}-${pieceId}`,
      severity: "warning",
      title: "Ceiling batt overlaps framing or insulation",
      detail: `${partLabel(p, pieceId)} occupies space shared with another ceiling part. Check its position or cut width.`,
      pieceId,
    });
    for (const pieceId of review.unseatedPartIds) findings.push({
      id: `sauna-ceiling-seat-${review.roomId}-${pieceId}`,
      severity: "warning",
      title: "Ceiling batt needs placement review",
      detail: `${partLabel(p, pieceId)} has no full-depth footprint at the modeled ceiling. Check its height, position and thickness.`,
      pieceId,
    });
  }
  for (const review of saunaLiningBacking(p)) {
    const pieceId = review.missing[0] ?? review.separated[0] ?? review.ends[0] ?? review.shaped[0];
    if (!pieceId) continue;
    findings.push({
      id: `sauna-lining-backing-${review.id}`,
      severity: "warning",
      title: `Review sauna lining backing · ${review.label}`,
      detail: `${review.title} · ${liningBackingText(review)}. Inspect ${partLabel(p, pieceId)}. Confirm the layer stack and add solid backing where needed before fastening.`,
      pieceId,
    });
  }
  for (const saved of p.greenhouseDoorSeals ?? []) {
    const review = reviewGreenhouseDoorSeal(p, saved);
    if (!review.ready) findings.push({
      id: `greenhouse-door-seal-${saved.entryId}`,
      severity: "warning",
      title: "Review greenhouse door weatherseal",
      detail: review.detail,
    });
  }
  for (const plan of p.greenhouseLatchPlans ?? []) {
    const review = reviewGreenhouseLatch(p, plan);
    if (review.state !== "checked") findings.push({
      id: `greenhouse-latch-${plan.motionId}`,
      severity: "warning",
      title: "Review greenhouse latch fit",
      detail: review.detail,
      pieceId: plan.latchId,
    });
  }
  for (const plan of p.caseworkTipUpPlans ?? []) {
    const report = reviewCaseworkTipUp(p, plan);
    if (report.state !== "clear") findings.push({
      id: `casework-tip-up-${plan.entryId}`,
      severity: "warning",
      title: `${report.name} · Review tip-up clearance`,
      detail: report.detail,
    });
  }
  for (const bench of saunaBenchReviews(p))
    for (const finding of bench.findings)
      findings.push({
        id: `sauna-bench-${finding.kind}-${bench.entryId}`,
        severity: "warning",
        title: finding.kind === "approach" ? "Sauna bench overlaps the door approach" : "Review sauna bench placement",
        detail: finding.detail,
        pieceId: bench.piece?.id,
      });
  for (const plan of p.saunaHeaterPlans ?? []) {
    const review = saunaHeaterReview(p, plan.roomId);
    if (review && !review.ready)
      findings.push({
        id: `sauna-heater-review-${plan.roomId}`,
        severity: "warning",
        title: "Review sauna heater clearance and sizing",
        detail: review.checks.filter((check) => check.state !== "within")
          .map((check) => `${check.label}. ${check.detail}`).join(" "),
      });
  }
  for (const plan of p.saunaVentilationPlans ?? []) {
    const review = saunaVentilationReview(p, plan);
    const issues = [...review.issues];
    const openings = saunaVentOpeningsReview(p, review);
    if (openings.applied && !openings.current) issues.push("Applied round openings differ from the current layout.");
    if (issues.length)
      findings.push({
        id: `sauna-ventilation-${plan.roomId}`,
        severity: "warning",
        title: "Review sauna ventilation layout",
        detail: issues.join(" "),
      });
  }
  for (const rod of closetRods(p)) {
    const fit = reviewRodFit(p, rod.id);
    const supports = reviewRodSupports(fit);
    if (supports.exceedsReference)
      findings.push({
        id: `rod-span-${rod.id}`, severity: "warning", title: "Review intermediate closet rod supports",
        detail: `${partLabel(p, rod.id)} · A planned gap exceeds this rod’s ${supports.spacingReference} in spacing reference. Review bracket placement and backing.`,
        pieceId: rod.id,
      });
    if (fit.bay && supports.spacingReference === null)
      findings.push({
        id: `rod-spacing-reference-${rod.id}`, severity: "warning", title: "Confirm Everbilt intermediate rod supports",
        detail: `${partLabel(p, rod.id)} · Confirm bracket fit, spacing and backing for your actual opening and hanging load.`,
        pieceId: rod.id,
      });
    if (supports.rows.some(({ state }) => state !== "reach-reviewed"))
      findings.push({
        id: `rod-supports-${rod.id}`, severity: "warning", title: "Review closet rod bracket measurements",
        detail: "Recheck flagged support positions, backing and delivered bracket reach before installation.",
        pieceId: rod.id,
      });
    for (const { support } of supports.rows) {
      const mount = reviewRodBracketMount(p, fit, support);
      if (mount && mount.state !== "checked") findings.push({
        id: `rod-bracket-mount-${support.id}`, severity: "warning",
        title: "Review closet rod center bracket mounting", detail: mount.detail,
        pieceId: support.mounting?.pieceId,
      });
    }
    for (const row of reviewRodSocketPlates(p, fit)) {
      if (row.state === "stale" || row.state === "conflict")
        findings.push({
          id: `rod-socket-${rod.id}-${row.side}`,
          severity: "warning",
          title: "Review closet rod socket backplate",
          detail: `${row.side === "start" ? "Start" : "End"} socket · ${row.detail}`,
          pieceId: row.pieceId ?? rod.id,
        });
      if (row.holes && row.holes.state !== "checked")
        findings.push({
          id: `rod-socket-holes-${rod.id}-${row.side}`,
          severity: "warning",
          title: "Review closet rod socket mounting holes",
          detail: `${row.side === "start" ? "Start" : "End"} socket · ${row.holes.detail} ${row.holes.marks.flatMap((mark) => mark.issues.length ? [`Hole ${mark.index}, ${mark.issues.join(" ")}`] : []).join(" ")}`.trim(),
          pieceId: row.pieceId ?? rod.id,
        });
    }
    if (fit.state === "stale" || !fit.bay)
      findings.push({
        id: `rod-fit-${rod.id}`, severity: "warning",
        title: fit.state === "stale" ? "Saved closet rod measurements need review" : "Review closet rod mounting faces",
        detail: fit.note, pieceId: rod.id,
      });
  }
  for (const review of greenhouseFoundationReviews(p)) {
    for (const mark of review.anchors?.rows ?? []) {
      if (!mark.issues.length) continue;
      findings.push({
        id: `greenhouse-anchor-${review.site.entryId}-${mark.mark.id}`,
        severity: "warning",
        title: `Review concrete anchor ${mark.index + 1} · ${review.title}`,
        detail: anchorMarkText(p, mark),
        pieceId: p.pieces.some(({ id }) => id === mark.mark.railId) ? mark.mark.railId : undefined,
      });
    }
    if (review.fitCount === 4) continue;
    findings.push({
      id: `greenhouse-foundation-${review.site.entryId}`,
      severity: "warning",
      title: `Review foundation footprint · ${review.title}`,
      detail: [
        greenhouseFoundationSummary(review),
        ...review.rails.filter(({ fits }) => !fits).map((rail) => greenhouseFoundationRailText(p, rail)),
      ].join(" "),
      pieceId: review.rails.find(({ fits, pieceId }) => !fits && pieceId)?.pieceId,
    });
  }
  for (const plane of p.siteClearances ?? []) {
    const review = reviewSiteClearance(p, plane);
    if (review.status === "short" || review.status === "missing")
      findings.push({
        id: `site-clearance-${plane.id}`,
        severity: "warning",
        title: `Review clearance · ${plane.label}`,
        detail: siteClearanceText(p, review),
        pieceId: review.pieceId ?? undefined,
      });
  }
  const active = p.pieces.filter((x) => !x.offcut && !isHardware(x.material));
  const rows = bom(p);
  const fastenerReviewCache = fastenerReviews(p), hingeReviewCache = lidHingeReviews(p), attachmentReviewCache = attachmentReviews(p), restraintReviewCache = restraintReviews(p, undefined, fastenerReviewCache);
  const panelReviews = reviewPanelBearing(p, attachmentReviewCache);
  for (const row of panelReviews) {
    const label = partLabel(p, row.piece.id);
    const contactCount = new Set(row.contacts.map(({ pieceId }) => pieceId)).size;
    const name = row.role === "seat" ? "Seat" : "Shelf";
    const reviewNeeded = !row.centerBetweenContacts && !row.reviewedPinSet;
    findings.push({
      id: `panel-bearing-${row.piece.id}`,
      severity: reviewNeeded ? "warning" : "info",
      title: `${name} bearing · ${label}`,
      detail: `${row.piece.name} · ${panelBearingSummary(p, row)}`,
      pieceId: row.piece.id,
      area: {
        kind: "panel-bearing",
        outlines: row.contacts.map(({ outline }) => outline),
        boundaries: row.undersides,
        label: `${label} · ${contactCount
          ? `${contactCount} wood ${contactCount === 1 ? "contact" : "contacts"}`
          : row.reviewedPinSet ? "Shelf-pin plan reviewed" : "No wood bearing"}`,
        labelPoint: row.center,
      },
    });
    const floor = panelFloorBearing(row, woodSupport);
    if (floor)
      findings.push({
        id: `panel-floor-bearing-${row.piece.id}`,
        severity: floor.interruptedCount ? "warning" : "info",
        title: `${name} support to floor · ${label}`,
        detail: panelFloorBearingSummary(p, floor),
        pieceId: row.piece.id,
        area: {
          kind: "panel-floor-bearing",
          outlines: floor.outlines,
          boundaries: row.undersides,
          label: `${label} · ${floor.interruptedCount ? "Contacts to review" : "Contacts traced to floor"}`,
          labelPoint: row.center,
          tone: floor.interruptedCount ? undefined : "reference",
        },
      });
    if (row.seatSpans)
      findings.push({
        id: `seat-span-${row.piece.id}`,
        severity: row.seatSpans.some((span) => span.kind === "unsupported") ? "warning" : "info",
        title: `Seat spans · ${label}`,
        detail: seatSpanSummary(row.seatSpans),
        pieceId: row.piece.id,
        area: {
          kind: "seat-span",
          outlines: row.contacts.map(({ outline }) => outline),
          boundaries: row.undersides,
          lines: row.seatSpans.map(({ line }) => line),
          label: `${label} · Seat spans`,
          labelPoint: row.center,
        },
      });
    if (row.shelfSpans) {
      const { wood, pinRows, reviewedPinSet } = row.shelfSpans;
      const spans = [...(wood ?? []), ...pinRows.flatMap(({ spans }) => spans)];
      const reviewSpans = pinRows.some(({ problem }) => problem) ||
        (pinRows.length > 0 && !reviewedPinSet) || spans.some(({ kind }) => kind === "unsupported");
      findings.push({
        id: `shelf-span-${row.piece.id}`,
        severity: reviewSpans ? "warning" : "info",
        title: `Shelf spans · ${label}`,
        detail: shelfSpanSummary(row.shelfSpans),
        pieceId: row.piece.id,
        area: {
          kind: "shelf-span",
          outlines: row.contacts.map(({ outline }) => outline),
          boundaries: row.undersides,
          lines: spans.map(({ line }) => line),
          referenceLines: pinRows.flatMap(({ reaches }) => reaches),
          label: `${label} · Shelf spans`,
          labelPoint: row.center,
        },
      });
    }
  }
  for (const plan of p.shelfSagPlans ?? []) {
    const piece = p.pieces.find(({ id, offcut }) => id === plan.pieceId && !offcut);
    if (!piece) continue;
    const label = partLabel(p, piece.id);
    const row = panelReviews.find((item) => item.piece.id === piece.id);
    const result = row && reviewShelfSag(row, plan);
    const geometry = result && "geometry" in result ? result.geometry : null;
    findings.push({
      id: `shelf-sag-${piece.id}`,
      severity: result && "withinTarget" in result && result.withinTarget ? "info" : "warning",
      title: `Shelf sag estimate · ${label}`,
      detail: result ? shelfSagSummary(result, plan.target) : "Restore a level rectangular shelf and review its supports.",
      pieceId: piece.id,
      area: row && geometry ? {
        kind: "shelf-span", outlines: row.contacts.map(({ outline }) => outline),
        boundaries: row.undersides, lines: [geometry.line],
        label: `${label} · Longest support span`, labelPoint: row.center,
      } : undefined,
    });
  }
  const connections = connectionCoverage(p,{fasteners:fastenerReviewCache,hinges:hingeReviewCache,attachments:attachmentReviewCache,restraints:restraintReviewCache});
  for (const base of greenhouseBaseConnections(p, connections.intents)) {
    const summary = greenhouseBaseSummary(base.corners);
    findings.push({
      id: `greenhouse-base-corners-${base.entryId}`,
      title: "Review greenhouse base corners",
      detail: `${base.title} · ${summary.line}`,
      severity: summary.needsReview ? "warning" : "info",
      connectionScope: {
        title: "Greenhouse base connections",
        memberIds: base.memberIds,
        baseEntryId: base.entryId,
      },
    });
  }
  for (const roof of greenhouseRoofAttachments(p, connections.intents, roofBearing)) {
    const summary = roofAttachmentSummary(roof.joints);
    findings.push({
      id: `greenhouse-attachments-${roof.entryId}`,
      title: "Review greenhouse roof attachments",
      detail: `${roof.title} · ${summary.line}`,
      severity: summary.needsReview ? "warning" : "info",
      connectionScope: {
        title: "Greenhouse roof connections",
        memberIds: [...new Set(roof.joints.flatMap(({ pieceIds }) => pieceIds))],
        roofEntryId: roof.entryId,
      },
    });
  }
  const connectionScope = {memberIds:connections.parts.map((part) => part.pieceId),title:"Connections in this project",ownerId:p.id,stageKey:"all-connections"};
  for (const source of inspectCutStock(p).invalid)
    findings.push({
      id: `cut-source-${source.sourceId}`,
      severity: "warning",
      title: "Cut stock provenance needs review",
      detail: `${source.detail} Shared-stock grouping is disabled for these pieces; the estimate counts them conservatively as separate parts. Choose matching stock or recreate the cuts from a fresh source.`,
      pieceId: source.pieceId,
    });
  if (!p.pieces.length)
    findings.push({
      id: "empty",
      severity: "info",
      title: "Your blank canvas is ready",
      detail:
        "Add a part or generate a framed wall to start checking the design.",
    });
  for (const row of rows) {
    if (row.oversize)
      findings.push({
        id: `stock-${row.id}`,
        severity: "error",
        title: `${row.oversize} ${material(row.id).name} part(s) exceed stock`,
        detail:
          "Resize these parts or specify a larger stock product. They are excluded from the cost estimate.",
      });
    if (!row.verified)
      findings.push({
        id: `inventory-${row.id}`,
        severity: "info",
        title: `Availability unverified · ${material(row.id).name}`,
        detail: row.supplier
          ? `Confirm availability and price directly with ${row.supplier.seller} for ${row.supplier.productCode}.`
          : "Choose an exact store and import a snapshot checked in the last 24 hours. Example prices are estimates.",
      });
    else if (row.inventory!.available < row.quantity)
      findings.push({
        id: `short-${row.id}`,
        severity: "warning",
        title: `Store stock is short by ${row.quantity - row.inventory!.available}`,
        detail: `${material(row.id).name}: ${row.quantity} needed, ${row.inventory!.available} reported.`,
      });
  }
  if (p.workZone) {
    const zone = p.workZone;
    const outside = p.pieces.filter((piece) => {
      if (piece.offcut) return false;
      const b = bounds(piece);
      return (
        b.min[0] < -zone.width / 2 - 0.01 ||
        b.max[0] > zone.width / 2 + 0.01 ||
        b.min[2] < -zone.depth / 2 - 0.01 ||
        b.max[2] > zone.depth / 2 + 0.01 ||
        b.min[1] < -0.01 ||
        b.max[1] > zone.height + 0.01
      );
    });
    if (outside.length)
      findings.push({
        id: "work-zone",
        severity: "warning",
        title: `${outside.length} part(s) extend outside your work zone`,
        detail: `Available space is ${format(zone.width)} wide × ${format(zone.depth)} deep × ${format(zone.height)} high. Move, rotate, or cut the highlighted part to fit.`,
        pieceId: outside[0].id,
      });
  }
  // Nonwood parts retain a proximity screen. Envelope geometry cannot establish a wood bearing path.
  const boxes = new Map(active.map((a) => [a.id, bounds(a)]));
  const nonwood = active.filter((piece) =>
    !material(piece.material).wood && !isBatt(piece.material) && !material(piece.material).orderRollWidth,
  );
  const grounded = new Set(
    nonwood.filter((a) => boxes.get(a.id)!.min[1] <= 0.25).map((a) => a.id),
  );
  for (const [id, row] of woodSupport)
    if (row.onFloor || row.next) grounded.add(id);
  const supports = new Map<string, string[]>();
  for (const base of active) {
    const b = boxes.get(base.id)!;
    const children: string[] = [];
    for (const top of nonwood) {
      if (base.id === top.id) continue;
      const a = boxes.get(top.id)!;
      if (
        Math.abs(a.min[1] - b.max[1]) <= 0.3 &&
        [0, 2].every(
          (i) =>
            Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > 0,
        )
      )
        children.push(top.id);
    }
    supports.set(base.id, children);
  }
  const queue = [...grounded];
  for (let i = 0; i < queue.length; i++)
    for (const child of supports.get(queue[i]) ?? [])
      if (!grounded.has(child)) {
        grounded.add(child);
        queue.push(child);
      }
  const floatingWood = [...woodSupport.values()].filter((row) => !row.onFloor && !row.next);
  const floatingNonwood = nonwood.filter((piece) => !grounded.has(piece.id));
  if (floatingWood.length || floatingNonwood.length) {
    const floating = [...floatingWood.map(({ piece }) => piece), ...floatingNonwood];
    const names = floating.slice(0, 3).map((piece) => piece.name).join(", ");
    findings.push({
      id: "floating",
      severity: "warning",
      title: `${floating.length} part(s) need support review`,
      detail: `${names}${floating.length > 3 ? ", and other parts" : ""}. ${
        floatingWood.length ? `${floatingWood.length} wood part(s) lack a retained-face contact path to the floor. ` : ""
      }${
        floatingNonwood.length ? `${floatingNonwood.length} nonwood part(s) need a support check for their material or hardware. ` : ""
      }Review placement, saved shelf supports or fasteners, and the intended load path.`,
      pieceId: floating[0].id,
      connectionScope: {memberIds:floating.map((piece) => piece.id),title:"Support connections"},
    });
  }
  const buried = active.find((a) => boxes.get(a.id)!.min[1] < -0.25);
  if (buried)
    findings.push({
      id: "buried",
      severity: "warning",
      title: "A part extends below the ground plane",
      detail:
        "Confirm whether this is intentional embedment. Footing depth and soil conditions are not validated.",
      pieceId: buried.id,
    });
  // Current fittings already checked their leg volumes against the model, with
  // their intentionally seated pipes allowed inside the sockets.
  const collisionSolids = active.filter(({ id }) => !checkedPipeHardware.has(id)).map((piece) => {
    try {
      return { piece, solid: prepareCollisionSolid(piece) };
    } catch {
      // Older valid files can contain very small positive stock dimensions.
      // Keep those editable; failed numerical geometry is an incomplete check.
      findings.push({
        id: `collision-geometry-${piece.id}`,
        severity: "warning",
        title: "A part needs collision-geometry review",
        detail: `${piece.name}: its retained shape cannot be checked at this precision. Review its dimensions and profile; no clear-space result is available for this part.`,
        pieceId: piece.id,
      });
      return { piece, solid: null };
    }
  });
  let collisions = 0, firstCollision = "", envelopeCollisions = 0, firstEnvelope = "";
  const collisionPieceIds = new Set<string>();
  for (let i = 0; i < collisionSolids.length; i++)
    for (let j = i + 1; j < collisionSolids.length; j++) {
      const a = collisionSolids[i], b = collisionSolids[j];
      if (!a.solid || !b.solid || !solidOverlap(a.solid, b.solid)) continue;
      if (a.solid.kind === "envelope" || b.solid.kind === "envelope") {
        envelopeCollisions++;
        firstEnvelope ||= a.piece.id;
      } else {
        collisions++;
        collisionPieceIds.add(a.piece.id); collisionPieceIds.add(b.piece.id);
        firstCollision ||= a.piece.id;
      }
    }
  if (collisions)
    findings.push({
      id: "collision",
      severity: "warning",
      title: `${collisions} overlapping part pair(s)`,
      detail:
        "Retained solid parts occupy the same space. Check placement or detail the intended joinery. Face contact is excluded. Round openings use the modeled cut perimeter.",
      pieceId: firstCollision,
      pieceIds: [...collisionPieceIds],
    });
  if (envelopeCollisions)
    findings.push({
      id: "envelope-collision",
      severity: "warning",
      title: `${envelopeCollisions} overlapping envelope pair(s) need review`,
      detail:
        "Exterior envelopes overlap. Review the actual profiles, intended laps and mounting clearances.",
      pieceId: firstEnvelope,
    });
  if (connections.summary.activeParts > 1 && connections.summary.noCurrentIntentParts > 0)
    findings.push({
      id: connections.intents.length ? "unconnected" : "connections",
      severity: "warning",
      title: `${connections.summary.noCurrentIntentParts} ${connections.summary.noCurrentIntentParts === 1 ? "part needs" : "parts need"} connection details`,
      detail: `${connections.summary.noIntentParts} have no saved task intent. ${connections.summary.startedIntents} plans are started without current location details; ${connections.summary.excludedIntents} records are stale or conflicting. Review the actual members and their intended joints. Contacts, purchases and a single referenced connection do not establish complete or installed joinery.`,
      connectionScope,
    });
  else if (connections.summary.pendingIntents || connections.summary.legacyRecords || connections.summary.excludedIntents)
    findings.push({id:"connection-details",severity:"warning",title:"Saved connection details still need review",detail:`${connections.summary.pendingIntents} pending location records, ${connections.summary.legacyRecords} unlocated quantity records and ${connections.summary.excludedIntents} excluded records remain. This is saved intent, not installed hardware or structural approval.`,connectionScope});
  for (const j of p.joints) {
    const a = p.pieces.find((x) => x.id === j.a)!,
      b = p.pieces.find((x) => x.id === j.b)!;
    if (distance(a, b) > 0.5)
      findings.push({
        id: j.id,
        severity: "error",
        title: "A connection no longer touches both parts",
        detail: `${a.name} → ${b.name}. Move the parts together or remove this connection.`,
        pieceId: a.id,
      });
    if (!hardwareForJoint(j))
      findings.push({
        id: `hardware-${j.id}`,
        severity: "error",
        title: "Connection hardware does not match a stocked size",
        detail: `The ${j.length} in ${j.kind} connection has no matching catalog purchase unit and is excluded from hardware totals. Choose the exact size and type.`,
        pieceId: a.id,
      });
    if (
      j.kind === "bracket" &&
      !p.joints.some(
        (other) =>
          other.kind !== "bracket" &&
          ((other.a === j.a && other.b === j.b) ||
            (other.a === j.b && other.b === j.a)),
      )
    )
      findings.push({
        id: `bracket-${j.id}`,
        severity: "warning",
        title: "Specify bracket fasteners separately",
        detail:
          "A bracket alone does not attach the parts. Record the manufacturer's specified connector nails or screws; ordinary wood/deck screws are not automatically compatible.",
        pieceId: a.id,
      });
    if (j.kind !== "bracket" && j.length <= Math.min(...a.size))
      findings.push({
        id: `grip-${j.id}`,
        severity: "warning",
        title: "Check fastener penetration",
        detail: `The ${j.length} in ${j.kind} may not pass through ${a.name}. Direction, edge distances, shear, and pullout are not modeled.`,
        pieceId: a.id,
      });
  }
  for (const section of p.sections) {
    const command = section.generator;
    const members = section.pieceIds
      .map((id) => active.find((piece) => piece.id === id))
      .filter((piece): piece is Piece => !!piece);
    if (!command) {
      const frame = members.filter(
        (piece) => material(piece.material).stockKind === "linear",
      );
      const verticalComponents = frame.map((piece) => {
        const axis = piece.size.indexOf(Math.max(...piece.size));
        const direction: V3 = [0, 0, 0];
        direction[axis] = 1;
        return Math.abs(rotate(direction, piece.rotation)[1]);
      });
      const uprights = verticalComponents.filter((y) => y >= 0.9).length;
      const rails = verticalComponents.filter((y) => y <= 0.1).length;
      if (uprights >= 2 && rails >= 2) {
        const panels = members.filter(
          (piece) => material(piece.material).stockKind === "sheet",
        ).length;
        findings.push({
          id: `furniture-frame-${section.id}`,
          severity: "warning",
          title: `Review lateral bracing and frame joints · ${section.name}`,
          detail: `${section.name} has ${uprights} upright members and ${rails} horizontal rails. Review the corner joints and how sideways forces reach the floor. Consider a designed diagonal brace or appropriately attached back/side panel. ${panels ? `${panels} panel(s) are present, but a seat or back panel's presence alone does not establish effective bracing.` : "No sheet panels are recorded in this section."} Joint capacity, panel fastening, and tipping resistance need design review.`,
          pieceId: frame[0].id,
        });
      }
    }
    if (command?.type !== "wall") continue;
    const hasPanel = section.pieceIds.some((id) =>
      active.some(
        (piece) =>
          piece.id === id && material(piece.material).stockKind === "sheet",
      ),
    );
    const hasDiagonal = section.pieceIds.some((id) =>
      active.some(
        (piece) =>
          piece.id === id &&
          piece.rotation.some((angle) => Math.abs(Math.sin(angle * 2)) > 0.1),
      ),
    );
    if (!hasPanel && !hasDiagonal)
      findings.push({
        id: `racking-${section.id}`,
        severity: "info",
        title: `${section.name}: review sideways bracing`,
        detail:
          "This section is an open frame with no recorded panel or diagonal brace. Consider an appropriate plywood back or diagonal bracing to resist racking; fastening and loads still need design review.",
        pieceId: section.pieceIds[0],
      });
    if (command.windowOpening) continue;
    const count = section.pieceIds.filter((id) =>
      active.some((p) => p.id === id && p.material === "stud"),
    ).length;
    const expected = wallParts(
      command.width,
      command.height,
      command.spacing,
      p.steps[0].id,
    ).length;
    if (count > expected)
      findings.push({
        id: `extra-frame-${section.id}`,
        severity: "info",
        title: `${section.name} has ${count - expected} extra framing part(s)`,
        detail: `Its saved ${command.spacing} in layout uses ${expected} framing parts; this section contains ${count}. Review manually added or duplicated boards before purchasing.`,
        pieceId: section.pieceIds[0],
      });
    if (command.spacing === 12) {
      const alternate = wallParts(
        command.width,
        command.height,
        16,
        p.steps[0].id,
      ).length;
      const extra = expected - alternate;
      if (extra > 0)
        findings.push({
          id: `spacing-quantity-${section.id}`,
          severity: "info",
          title: `${section.name}: closer spacing uses ${extra} extra stud(s)`,
          detail: `A 12 in layout uses ${expected - 2} studs; a 16 in layout of the same width uses ${alternate - 2}. This compares quantities only. Loads, sheathing, and the design specification determine appropriate spacing.`,
        });
    }
  }
  const dense = p.pieces.filter(
    (x) => x.assembly.includes("Wall") && x.name.includes("stud"),
  ).length;
  if (dense > 80)
    findings.push({
      id: "dense",
      severity: "info",
      title: "Review the framing quantity",
      detail:
        "This plan has more than 80 generated wall studs. Check for duplicate assemblies before buying materials.",
    });
  if (p.kind === "coop")
    findings.push({
      id: "coop-review",
      severity: "warning",
      title: "Coop concept needs enclosure detailing",
      detail:
        "Add roof framing, gable closures, ventilation, a secure door, predator protection, and anchors. This template is not ready to build.",
    });
  findings.push({
    id: "engineering",
    severity: "info",
    title: "Geometric checks, not structural approval",
    detail:
      "Loads, spans, soil, wind/snow, local code, fastener capacity, and animal welfare are not certified. No “safe to build” score is issued.",
  });
  const unpriced = rows.filter((row) => row.quantity > 0 && row.unpriced && !row.supplier);
  if (unpriced.length)
    findings.push({
      id: "unpriced-products",
      severity: "warning",
      title: `${unpriced.length} product(s) need a price snapshot`,
      detail:
        "These reviewed product references have no current price. They are excluded from the displayed cost; the total is incomplete until you record matching store prices.",
    });
  const supplierQuotes = rows.filter((row) => row.quantity > 0 && row.supplier);
  if (supplierQuotes.length)
    findings.push({
      id: "supplier-quotes",
      severity: "warning",
      title: `${supplierQuotes.length} product(s) need a direct supplier quote`,
      detail: "Check the supplier links in the shopping list for price, availability and delivery.",
    });
  for (const review of attachmentReviewCache)
    for (const [index, issue] of review.issues.entries())
      findings.push({
        id: `attachment-${review.plan.id}-${issue.code}-${index}`,
        severity: issue.severity === "error" ? "error" : "warning",
        title: review.plan.name,
        detail: issue.message,
        pieceId: issue.pieceIds.find((id) =>
          active.some((piece) => piece.id === id),
        ),
        attachmentPlanId: review.plan.id,
      });
  for (const pinPurchases of attachmentPurchaseSummaries(p, attachmentReviewCache)) {
    if (!pinPurchases.shortfallPacks) continue;
    findings.push({
      id: pinPurchases.productId === attachmentPinProductId
        ? "attachment-pin-purchases"
        : `attachment-pin-purchases-${pinPurchases.productId}`,
      severity: "warning",
      title: "Planned shelf pins need a purchase selection",
      detail: `${pinPurchases.plannedPins} planned pins require ${pinPurchases.requiredPacks} purchase packs; ${pinPurchases.selectedPacks} packs are selected. ${pinPurchases.shortfallPacks} packs remain to choose. Counts are provisional; selected supply rows alone contribute to cost.`,
      attachmentPlanId: pinPurchases.planRows.find((row) => row.included)
        ?.planId,
    });
  }
  for (const review of restraintReviewCache)
    for (const [index, issue] of review.issues.entries())
      findings.push({
        id: `restraint-${review.plan.id}-${issue.code}-${index}`,
        severity: issue.severity === "error" ? "error" : "warning",
        title: review.plan.name,
        detail: issue.message,
        pieceId: issue.pieceIds?.find((id) =>
          active.some((piece) => piece.id === id),
        ),
        restraintPlanId: review.plan.id,
      });
  const restraintPurchases = restraintPurchaseSummary(p);
  if (restraintPurchases.shortfallKits > 0)
    findings.push({
      id: "restraint-kit-purchases",
      severity: "warning",
      title: "Planned restraint locations need a kit purchase selection",
      detail: `${restraintPurchases.plannedKits} provisional kit locations; ${restraintPurchases.selectedKits} kits selected. Included components are counted within each complete kit.`,
      restraintPlanId: p.restraintPlans[0]?.id,
    });
  for (const row of sunliteThermalReview(p)?.rows ?? []) {
    if (row.stale || (row.along.shortage ?? 0) > 1e-8 || (row.across.shortage ?? 0) > 1e-8)
      findings.push({
        id: `sunlite-thermal-${row.id}`,
        severity: "warning",
        title: row.stale ? "Remeasure SUNLITE panel travel" : "SUNLITE panel needs more room for growth",
        detail: row.stale
          ? `${row.label} changed geometry or installation temperature. Remeasure travel and overlap in its current profile.`
          : `${row.label} · Along flutes ${thermalAxisText(row.along)}. Across flutes ${thermalAxisText(row.across)}.`,
        pieceId: row.id,
      });
    if ((row.along.retention?.shortage ?? 0) > 1e-8 || (row.across.retention?.shortage ?? 0) > 1e-8)
      findings.push({
        id: `sunlite-cold-${row.id}`,
        severity: "warning",
        title: "SUNLITE panel may lose required overlap in the cold",
        detail: `${row.label} · Along flutes ${coldRetentionText(row.along)}. Across flutes ${coldRetentionText(row.across)}.`,
        pieceId: row.id,
      });
  }
  for (const review of reviewSunliteMounts(p)) {
    const failed = review.rows.filter(({ issues }) => issues.length);
    const shown = failed.length ? failed : review.rows;
    const issues = [...new Set(failed.flatMap(({ issues }) => issues))];
    findings.push({
      id: `sunlite-mount-${review.plan.panelId}`,
      title: `SUNLITE fastener holes · ${review.label}`,
      severity: review.issue || failed.length ? "warning" : "info",
      detail: review.issue ?? (review.rows.length
        ? `${review.rows.length - failed.length} of ${review.rows.length} holes pass measured geometry checks.${issues.length ? ` ${issues.slice(0, 2).join(" ")}` : ""}`
        : "Add drill marks to review this layout."),
      pieceId: review.plan.panelId,
      ...(shown.length ? { area: {
        kind: "glazing-hole-layout" as const,
        ...(!failed.length ? { tone: "reference" as const } : {}),
        outlines: shown.map(({ outline }) => outline),
        label: failed.length ? `${failed.length} glazing hole${failed.length === 1 ? "" : "s"} to review` : `${shown.length} glazing drill mark${shown.length === 1 ? "" : "s"}`,
        labelPoint: shown[0].point,
      } } : {}),
    });
  }
  const priority = { error: 0, warning: 1, info: 2 };
  for (const review of fastenerReviewCache) {
    if (review.state === "path-reviewed") continue;
    const messages = [...new Set([
      ...review.issues,
      ...review.locations.flatMap((location) => location.issues),
    ].map((issue) => issue.message))];
    findings.push({
      id: `wood-fasteners-${review.plan.id}`,
      severity: review.state === "conflict" ? "error" : "warning",
      title: `${review.plan.name}: ${review.state}`,
      detail: `${review.activePointCount}/${review.plan.locations.length} provisional locations included. ${messages.slice(0, 4).join(" ")}${messages.length > 4 ? " Open the plan for all review items." : ""}`,
      pieceId: review.plan.head.pieceId,
      fastenerPlanId: review.plan.id,
    });
  }
  for (const { review, locations } of reviewDriverAccess(p, fastenerReviewCache)) {
    const issues = locations.filter((row) => row.state !== "clear");
    if (!issues.length) continue;
    const first = issues.find((row) => row.state === "blocked") ?? issues[0];
    findings.push({
      id: `driver-access-${review.plan.id}`,
      severity: "warning",
      title: `${review.plan.label} · Review driver clearance`,
      detail: `${first.label} · ${first.detail}${issues.length > 1 ? ` ${issues.length - 1} other approaches to review.` : ""}`,
      pieceId: review.plan.head.pieceId,
      fastenerPlanId: review.plan.id,
    });
  }
  for (const row of fastenerPurchaseSummary(p).products)
    if (row.shortfallPacks)
      findings.push({
        id: `wood-fastener-purchases-${row.productId}`,
        severity: "warning",
        title: "Planned screw locations need purchase packs",
        detail: `${row.productName}: ${row.plannedScrews} provisional screws; ${row.shortfallPacks} missing ${row.packCount}-screw packs. No stock or installation is inferred.`,
        fastenerPlanId: row.planRows[0]?.planId,
      });
  for (const review of hingeReviewCache) {
    const messages = [...new Set([...review.issues, ...review.locations.flatMap((hole) => hole.issues)].map((i) => i.message))];
    findings.push({ id: `lid-hinge-${review.plan.id}`, severity: review.state === "conflict" ? "error" : review.state === "geometry-reviewed" ? "info" : "warning",
      title: `${review.plan.label} · ${review.plan.name}: ${review.state}`,
      detail: `${messages.slice(0, 3).join(" ")} Entered centerlines do not establish hinge/wood capacity, leaf fit, hold-open protection or the closed seat's load path. Open Sections → Measured hinges.`,
      pieceId: review.plan.moving.pieceId, hingePlanId: review.plan.id,
    });
  }
  const hingePurchases = hingePurchaseSummary(p, hingePurchaseAllocations(p));
  if (hingePurchases.shortfallHinges)
    findings.push({ id: "hinge-source-purchases", severity: "warning", title: "Allocated hinge sources need purchase selections", detail: `${hingePurchases.requiredHinges} physical sources planned; ${hingePurchases.selectedHinges} whole hinges selected; ${hingePurchases.shortfallHinges} missing. Each source is counted once across its retained segments.`, hingePlanId: p.lidHingePlans[0]?.id });
  return findings.sort((a, b) => priority[a.severity] - priority[b.severity]);
}
export function connect(
  p: Project,
  a: string,
  b: string,
  stepId: string,
  quantity = 2,
  length = 3,
  kind: "screw" | "nail" | "bracket" = "screw",
  hardwareMaterial?: MaterialId,
): Project {
  const aa = p.pieces.find((x) => x.id === a),
    bb = p.pieces.find((x) => x.id === b);
  if (!aa || !bb || a === b) throw Error("Choose two different parts.");
  if (aa.offcut || bb.offcut)
    throw Error("Place the offcut back into the build before connecting it.");
  if (isBatt(aa.material) || isBatt(bb.material))
    throw Error("Wall batts fill cavities. Choose framing members for a mechanical connection.");
  if ([aa, bb].some((piece) => material(piece.material).orderRollWidth))
    throw Error("Use the foil system’s seam and backing instructions. Wood joints do not model sheet fastening.");
  if ([aa, bb].some((piece) => material(piece.material).shape === "door-leaf-envelope"))
    throw Error("Verify mounting on the prehung door’s actual jamb. The modeled leaf is for fit and swing review.");
  if ([aa, bb].some((piece) => material(piece.material).stockKind === "equipment"))
    throw Error("Use the delivered kit’s assembly instructions. The modeled kit represents its assembled footprint.");
  if (distance(aa, bb) > 0.5)
    throw Error("Move the parts within ½ inch before recording a connection.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    throw Error("Connection quantity must be a whole number from 1 to 100.");
  if (!Number.isFinite(length) || length <= 0 || length > 12)
    throw Error("Choose a valid fastener length in inches.");
  const candidate = { kind, length, material: hardwareMaterial };
  const hardware = hardwareForJoint(candidate as Project["joints"][number]);
  if (!hardware)
    throw Error(
      "Choose a matching catalog fastener length and type. Available screw lengths: 1¼, 1½, or 3 in; nails: 3 in. Brackets require a connector material.",
    );
  return {
    ...p,
    joints: [
      ...p.joints,
      {
        id: uid(),
        a,
        b,
        stepId,
        quantity,
        length,
        kind,
        material: hardware.id,
      },
    ],
  };
}
const csvCell = (v: unknown) => {
  const text = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
};
export function shoppingCsv(p: Project) {
  const rows = [
    [
      "Material",
      p.retailer === "lowes" ? "Retailer product number" : "Internet number",
      "Stock units to buy",
      "Unit",
      "Unit price USD",
      "Estimated total USD",
      "ZIP",
      "Store",
      "Availability",
      "Checked at",
      "Product/search URL",
      "Oversize parts excluded",
      "Individual stock units required",
      "Units per purchase pack",
      "Individual stock units supplied",
      "Surplus stock units",
      "Supply pack contents and usage",
      "Price basis",
      "Individual stock units on hand",
    ],
  ];
  for (const r of bom(p)) {
    const m = material(r.id);
    const offer = shoppingOfferForMaterial(m, p.retailer ?? "home-depot")?.offer;
    rows.push([
      m.name,
      r.inventory?.internetNumber ?? offer?.productId ?? "",
      String(r.quantity),
      m.unit,
      r.unpriced ? "UNPRICED" : r.price.toFixed(2),
      r.unpriced ? "UNPRICED" : r.total.toFixed(2),
      r.supplier ? "" : p.zip,
      r.supplier ? "" : p.store,
      r.inventory ? String(r.inventory.available) : r.supplier ? "SUPPLIER QUOTE" : "UNVERIFIED",
      r.inventory?.checkedAt ?? "",
      r.inventory?.url ??
        offer?.url ??
        r.supplier?.url ??
        retailerSearch(p.retailer ?? "home-depot", m.search),
      String(r.oversize),
      String(r.physicalStockUnits),
      String(r.packCount),
      String(r.purchasedStockUnits),
      String(r.surplusStockUnits),
      r.supplier ? `${r.supplier.seller} · ${r.supplier.productCode}${m.orderRollWidth ? ` · Request ${r.quantity} linear ft at ${m.orderRollWidth} in wide; confirm supplied roll lengths` : ""}` : "",
      r.priceSource,
      String(r.onHandStockUnits),
    ]);
  }
  for (const r of supplyRows(p)) {
    rows.push([
      r.name,
      r.offer?.productId ?? "",
      String(r.quantity),
      r.purchaseUnit,
      r.inventory ? r.inventory.price.toFixed(2) : "UNPRICED",
      r.total === null ? "UNPRICED" : r.total.toFixed(2),
      p.zip,
      p.store,
      r.inventory ? String(r.inventory.available) : "UNVERIFIED",
      r.inventory?.checkedAt ?? "",
      r.offer?.url ?? "",
      "",
      "",
      "",
      "",
      "",
      [
        r.isTool ? "Tool purchase" : "",
        r.contents.map(formatSupplyContent).join("; "),
        ...r.selections.map((s) =>
          [s.purpose, s.note].filter(Boolean).join(": "),
        ),
        ...r.issues,
      ]
        .filter(Boolean)
        .join(" | "),
      r.inventory && r.total !== null ? "snapshot" : "unknown",
      "",
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function guideHomeDepotStock(project: Project, rows: readonly BomRow[]) {
  if (project.retailer !== "home-depot") return [];
  return rows.flatMap((row) => {
    if (row.quantity <= 0) return [];
    const stock = material(row.id);
    const offer = reviewedOfferForMaterial(stock, "home-depot");
    return offer ? [{ id: row.id, stock, quantity: row.quantity, offer }] : [];
  });
}
export function guideMarkdown(p: Project) {
  p = ensurePartLabels(p);
  const materialRows = bom(p);
  const supplierRows = materialRows.filter((row) => row.quantity > 0 && row.supplier);
  const homeDepotStock = guideHomeDepotStock(p, materialRows);
  const onHand = stockOnHand(materialRows);
  const lineage = inspectCutStock(p);
  const savedStockOrders = plannedStockCutOrders(p, lineage);
  const savedStockStepIds = new Set(savedStockOrders.flatMap(({ stepIds }) => stepIds));
  const connections = connectionCoverage(p);
  const motionReviews = projectMotionReviews(p);
  const motions = motionReviewLines(p, motionReviews);
  const saunaSeating = saunaBenchGuideLines(p);
  const caseworkTipUp = caseworkTipUpGuideLines(p);
  const saunaBenchTravel = saunaBenchTravelGuideLines(p);
  const saunaWalls = saunaWallGuideLines(p);
  const saunaCeiling = saunaCeilingGuideLines(p);
  const saunaLining = saunaLiningGuideLines(p);
  const foilChanges = saunaFoilLayoutChanges(p);
  const roofBacking = reviewSunliteRoofBacking(p);
  const ventBacking = reviewGreenhouseVentBacking(p);
  const glazingMounts = reviewSunliteMounts(p);
  const panelReviews = reviewPanelBearing(p);
  const woodSupportReview = reviewWoodSupport(p);
  const panelBearing = panelBearingGuideLines(p, panelReviews, woodSupportReview);
  const shelfSag = shelfSagGuideLines(p, panelReviews);
  const woodSupport = woodSupportGuideLines(p, woodSupportReview);
  const bearingReview = bearingConnections(p, woodSupportReview, connections);
  const bearingJoints = bearingConnectionGuideLines(p, bearingReview, connections);
  const woodJointDetails = woodJointDecisionEntries(p);
  const trimBacking = trimBackerRodCutPlan(p, woodJointDetails);
  const roofBearing = reviewGreenhouseRafterBearing(p);
  const rafterBearing = rafterBearingGuideLines(p, roofBearing);
  const roofAttachments = greenhouseRoofAttachmentLines(p, greenhouseRoofAttachments(p, connections.intents, roofBearing));
  const foundations = greenhouseFoundationGuide(p);
  const sillGasketLines = sillGasketGuideLines(reviewSillGaskets(p));
  const flashingLines = openingFlashingGuideLines(reviewOpeningFlashings(p));
  const windowWalls = reviewGeneratedWindowWalls(p);
  const baseConnections = greenhouseBaseGuideLines(p, greenhouseBaseConnections(p, connections.intents));
  const floorJoints = floorBaseConnectionGuideLines(p, floorBaseConnections(p, connections.intents));
  const rimAirSeals = rimAirSealGuideLines(reviewRimAirSeals(p));
  const roofValleys = roofValleyGuideLines(p);
  const roofVentFlashings = roofVentFlashingGuideLines(p);
  const floorHangers = floorHangerGuideLines(p, connections.intents);
  const doorKits = new Set((p.motionPlans ?? []).flatMap((plan) => {
    const kit = plan.mechanism.kind === "hinge" ? plan.mechanism.greenhouseDoor?.kitId : null;
    return kit ? [kit] : [];
  }));
  const doorStops = greenhouseDoorStopGuideLines(p);
  const doorSeals = greenhouseDoorSealGuideLines(p);
  const latch = greenhouseLatchGuideLines(p);
  const supplies = supplyRows(p);
  const preparation = buildPreparation(p, {
    stock: materialRows,
    supplies,
    sequences: stockCutSequences(p, materialRows),
    connections,
    woodContacts: reviewModeledWoodContacts(p, connections, bearingReview, woodJointDetails),
    findings: validate(p, woodSupportReview),
    motions: motionReviews,
    lids: projectLidTravelChecks(p),
    handoff: p.retailer === "lowes" ? undefined : homeDepotShoppingList(p, materialRows, supplies),
  });
  const plannedSources = new Set(p.plannedCutSources?.map(({ sourceId }) => sourceId));
  const describePiece = (x: Piece) => {
    const m = material(x.material);
    const instructions = m.cuttable || pieceThroughOpenings(x).length
      ? cutInstructionsText(
          cutInstructions(x, {
            kerf: pieceCutKerf(x),
            lineageStatus:
              x.cutStock && lineage.valid.has(x.cutStock.id)
                ? "validated"
                : "unverified",
          }),
        )
          .split("\n")
          .map((line) => `  - ${line}`)
          .join("\n")
      : "";
    const pending = x.offcut && x.cutStock && plannedSources.has(x.cutStock.id) ? " · Expected after cutting" : "";
    return `- ${partLabel(p, x.id)} · ${x.name}: ${x.size.map(formatPreciseInches).join(" × ")} (${m.name})${pending}${instructions ? `\n${instructions}` : ""}`;
  };
  const offcuts = p.pieces.filter(
    (piece) => piece.offcut && material(piece.material).cuttable,
  );
  return (
    `# ${p.name}\n\nConcept plan · ${p.zip}${p.store ? ` · Store ${p.store}` : ""}\n\n` +
    projectNotesMarkdown(p.notes) +
    (p.drawingReference?.calibration.visible
      ? `## Drawing reference\n\n${drawingReferenceDescription(p.drawingReference)}. Use the calibrated workspace for layout.\n\n`
      : "") +
    "Geometric planning only. Verify engineering, code, connections, and site conditions before construction.\n\n" +
    buildPreparationMarkdown(preparation) +
    plannedStockCutOrdersMarkdown(savedStockOrders) +
    offcutCutOrderMarkdown(offcutCutRows(p, lineage, savedStockOrders)) +
    ((p.siteClearances ?? []).length
      ? "## Measured site clearances\n\n" +
        p.siteClearances!.map((plane) => `- ${plane.label.replace(/\r?\n/g, " ")} · ${siteClearanceText(p, reviewSiteClearance(p, plane))}`).join("\n") +
        "\n\n"
      : "") +
    (foundations.length
      ? "## Greenhouse foundation footprint\n\n" + greenhouseFoundationScope + "\n\n" +
        foundations.map(({ title, summary, rails, anchors }) =>
          [
            `- ${title.replace(/[\r\n]+/g, " ")} · ${summary}`,
            ...rails.map((rail) => `  - ${rail}`),
            ...(anchors ? [
              `  - Concrete anchor layout · ${concreteAnchor.label}. ${anchors.detail}`,
              ...anchors.marks.map((mark) => `    - ${mark}`),
              `    - ${concreteAnchorScope} [Manufacturer instructions](${concreteAnchor.instructions}) and [evaluation table](${concreteAnchor.evaluation}).`,
            ] : []),
          ].join("\n")
        ).join("\n") + "\n\n"
      : "") +
    (windowWalls.length
      ? "## Window rough framing\n\n" + windowWallScope + "\n\n" +
        windowWalls.map(({ section, detail }) => `- ${`${section.name} · ${detail}`.replace(/\r?\n/g, " ")}`).join("\n") +
        `\n\n[PNNL window framing](${windowFramingSource}) · [IRC nonbearing headers](${nonbearingHeaderSource})\n\n`
      : "") +
    (flashingLines.length
      ? "## Opening flashing and drainage\n\n" + openingFlashingScope + "\n\n" +
        flashingLines.map((line) => `- ${line.replace(/\r?\n/g, " ")}`).join("\n") +
        `\n\n[DuPont installation guide](${flexWrap.instructions}) · [PNNL interior air seal](${openingAirSealGuide})\n\n`
      : "") +
    (sillGasketLines.length
      ? "## Sill gasket cut plan\n\n" + sillGasketScope + "\n\n" +
        sillGasketLines.map((line) => `- ${line.replace(/\r?\n/g, " ")}`).join("\n") +
        `\n\n[Owens Corning instructions](${sillGasketInstructions}) · [PNNL sill plate detail](${sillGasketBuildingGuide})\n\n`
      : "") +
    lidSiteGuideMarkdown(p) +
    lidWeightGuideMarkdown(p) +
    lidStayFitGuideMarkdown(p) +
    pricingCoverageMarkdown(projectPricingCoverage(p, materialRows)) +
    (onHand.length
      ? "\n## Stock on hand\n\n" +
        onHand.map(({ name, quantity }) =>
          `- ${quantity} ${quantity === 1 ? "source" : "sources"} · ${name}.`,
        ).join("\n") +
        "\n\nThe purchase list credits each marked source once.\n\n"
      : "") +
    (homeDepotStock.length
      ? "\n## Home Depot stock references\n\n" +
        homeDepotStock.map(({ stock, quantity, offer }) =>
          `- ${quantity} × ${stock.unit} · ${stock.name} · [Internet #${offer.productId}](${offer.url})${offer.retailerModel ? ` · model ${offer.retailerModel}` : ""}.`,
        ).join("\n") +
        "\n\nCheck the delivered stock and confirm availability for the selected store.\n\n"
      : "") +
    (supplierRows.length
      ? "\n## Direct supplier stock\n\n" +
        supplierRows.map((row) => {
          const stock = material(row.id);
          const supplier = row.supplier!;
          const units = stock.orderRollWidth
            ? `Request ${row.quantity} linear ft at ${stock.orderRollWidth} in wide. Confirm supplied roll lengths, cuts and price.`
            : `${row.physicalStockUnits} individual stock items required, ${row.packCount} per purchase unit.`;
          return `- ${row.quantity} × ${stock.unit} · ${stock.name} · ${units} [${supplier.seller} ${supplier.productCode}](${supplier.url}) · price and availability to confirm.`;
        }).join("\n") +
        "\n\n"
      : "") +
    p.steps
      .map(
        (s, i) =>
          `## ${i + 1}. ${s.title}${s.complete ? " [complete]" : ""}\n\n${s.notes}\n\n` +
          p.pieces
            .filter((x) => x.stepId === s.id && !x.offcut)
            .map(describePiece)
            .join("\n") +
          "\n\n" +
          p.joints
            .filter((j) => j.stepId === s.id)
            .map((j) => {
              const hardware = hardwareForJoint(j);
              const a = p.pieces.find((piece) => piece.id === j.a);
              const b = p.pieces.find((piece) => piece.id === j.b);
              return `- Connection: ${j.quantity} × ${hardware?.name ?? `${j.length} in ${j.kind} (purchase size unresolved)`}: ${a ? `${partLabel(p, a.id)} · ${a.name}` : "missing part"} → ${b ? `${partLabel(p, b.id)} · ${b.name}` : "missing part"}.`;
            })
            .join("\n") +
          "\n" +
          p.history
            .filter((h) => h.stepId === s.id && !savedStockStepIds.has(h.id))
            .map((h) => `- ${h.offcutCut?.releasedAt ? "Released plan" : "Operation"}: ${h.message}`)
            .join("\n") +
          connectionStageMarkdown(p, s.id, connections),
      )
      .join("\n") +
    (offcuts.length
      ? "\n\n## Recorded offcuts\n\nModeled remnants; review dimensions, profiles and source lineage before reuse.\n\n" +
        offcuts.map(describePiece).join("\n")
      : "") +
    stockCutSequenceMarkdown(p, materialRows) +
    bindingGuideMarkdown(p) +
    rollGuideMarkdown(p) +
    (materialRows.some((row) => row.id === cedarbrookFoil.materialId)
      ? `\n\n## Sauna foil layout\n\nRoll rectangles include planned folds. Confirm the room and actual supplier roll segments before cutting.\n\n${foilChanges.length ? "The saved foil layout was edited. Recheck continuity, overlaps and turns against the room.\n\n" : ""}[Cedarbrook foil installation](${cedarbrookFoil.instructions})\n\n`
      : "") +
    sunliteGuideMarkdown(p) +
    sunliteThermalMarkdown(p) +
    (rafterBearing.length ? "\n\n## Greenhouse rafter joints\n\n" + rafterBearingScope + "\n\n" +
      rafterBearing.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (roofAttachments.length ? "\n\n## Greenhouse roof attachments\n\n" + greenhouseAttachmentScope + "\n\n" +
      roofAttachments.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (baseConnections.length ? "\n\n## Greenhouse base corners\n\n" + greenhouseBaseScope + "\n\n" +
      baseConnections.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (floorJoints.length ? "\n\n## Floor base joist ends\n\n" + floorBaseConnectionScope + "\n\n" +
      floorJoints.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (floorHangers.length ? `\n\n## Floor base hanger plan\n\n${floorHangerScope}\n\n[ESR-3096 Table 20](${floorHangerReport})\n\n` +
      floorHangers.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (rimAirSeals.length ? `\n\n## Floor rim foam and air seals\n\n${rimSealScope}\n\n[PNNL field guide](${rimSealGuide}) · [Owens Corning instructions](${rimFoam.manufacturer})\n\n` +
      rimAirSeals.map((line) => "- " + line.replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (panelBearing.length ? "\n\n## Shelf and seat bearing\n\n" + panelBearingScope + "\n\n" +
      panelBearing.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      "\n" : "") +
    (shelfSag.length ? "\n\n## Shelf sag estimates\n\n" + shelfSagScope + "\n\n" +
      shelfSag.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n[Panel stiffness reference](${stiffnessSource}) · [Bending formula](${beamSource})\n` : "") +
    (woodSupport.length ? "\n\n## Wood contact to floor\n\n" + woodSupportScope + "\n\n" +
      woodSupport.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      "\n" : "") +
    (bearingJoints.length ? "\n\n## Bearing joints\n\n" + bearingConnectionScope + "\n\n" +
      bearingJoints.map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      "\n" : "") +
    (woodJointDetails.length ? "\n\n## Recorded wood joint details\n\n" + woodJointDecisionScope + "\n\n" +
      woodJointDetails.map((entry) => "- " +
        woodJointDecisionLine(entry).replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      "\n" : "") +
    (trimBacking.length ? `\n\n## ${trimBacking.some(({ hasAirSeal }) => hasAirSeal) ? "Backer rod cut plan" : "Trim backer rod cut plan"}\n\n` + trimBackerRodScope + "\n\n" +
      trimBackerRodGuideLines(trimBacking).map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n[Frost King instructions](${trimBackerRodInstructions}) · ${trimBacking.map(({ product }) =>
        `[${product.model} at Home Depot](${product.listing})`).join(" · ")}\n` : "") +
    (roofBacking.length ? "\n\n## SUNLITE roof seam backing\n\n" +
      roofBackingScope + "\n\n" +
      roofBacking.flatMap(roofBackingGuideLines).map((line) => "- " +
        line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n[Palram roof connector detail](${sunliteRoofDetail})\n\n` : "") +
    (ventBacking.length ? "\n\n## Roof vent sash backing\n\n" +
      ventBackingScope + "\n\n" +
      ventBacking.flatMap((review) => ventBackingGuideLines(p, review)).map((line) =>
        "- " + line.replace(/[\r\n]/g, " "),
      ).join("\n") +
      `\n\n[Palram SUNLITE installation resources](${ventBackingSource})\n\n` : "") +
    (glazingMounts.length ? "\n\n## SUNLITE fastener hole layout\n\n" + sunliteMountScope +
      `\n\n${sunliteFastener.name} · ${sunliteFastener.hex} hex. [Palram installation notes](${sunliteFastener.installation}).\n\n` +
      glazingMounts.flatMap((review) => sunliteMountLines(p, review)).map((line) => "- " + line).join("\n") + "\n" : "") +
    sunliteProfileMarkdown(p) +
    sunliteTapeMarkdown(p) +
    edgeBandingMarkdown(p) +
    rodFitMarkdown(p) +
    saunaHeaterMarkdown(p) +
    saunaVentilationMarkdown(p) +
    (saunaWalls.length ? "\n\n## Sauna wall insulation coverage\n\n" +
      saunaWalls.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n${saunaWallCoverageScope}\n` : "") +
    (saunaCeiling.length ? "\n\n## Sauna ceiling coverage\n\n" +
      saunaCeiling.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      "\n\nCoverage is a dimensional check of the saved model. Verify the actual ceiling assembly, supports and services.\n" : "") +
    (saunaLining.length ? "\n\n## Sauna lining backing\n\n" +
      saunaLining.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n${saunaLiningScope}\n\n${saunaLiningTools}\n\n` +
      saunaLiningSources.map(([name, url]) => `- [${name}](${url})`).join("\n") + "\n" : "") +
    (saunaSeating.length ? "\n\n## Sauna seating layout\n\n" +
      saunaSeating.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n[Cedarbrook pedestal bench assembly instructions](${cedarbrookBenchInstructions})\n\n` : "") +
    (caseworkTipUp.length ? "\n\n## Casework tip-up and placement\n\n" +
      caseworkTipUp.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (saunaBenchTravel.length ? "\n\n## Sauna bench carry-in\n\n" +
      saunaBenchTravel.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    projectCodeMarkdown(p) +
    (roofValleys.length ? `\n\n## Roof valley membrane cuts\n\n${valleyScope}\n\n[GAF installation instructions](${weatherWatch.instructions}) · [PNNL roof valley guidance](${valleyFieldGuide})\n\n` +
      roofValleys.map((line) => "- " + line.replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (roofVentFlashings.length ? `\n\n## Roof vent flashing\n\n${roofVentFlashingScope}\n\n[Oatey installation guidance](${oateyRoofVentBoot.installation}) · [PNNL roof penetration guidance](${oateyRoofVentBoot.integration})\n\n` +
      roofVentFlashings.map((line) => "- " + line.replace(/[\r\n]/g, " ")).join("\n") + "\n" : "") +
    (p.waterRuns?.length ? "\n\n## Wall water-line schedule\n\n" +
      p.waterRuns.flatMap((run) => waterRunGuide(p, run)).map((line) => "- " + line.replace(/[\r\n]+/g, " ")).join("\n") +
      `\n\n[Stud boring](${studBoreSource}) · [Pipe protection](${pipeProtectionSource}) · [SharkBite installation](${pexInstallation})\n` : "") +
    (p.waterFittings?.length ? "\n\n## PEX fittings and insertion marks\n\n" +
      p.waterFittings.flatMap((fitting) => waterFittingGuide(p, fitting)).map((line) => "- " + line.replace(/[\r\n]+/g, " ")).join("\n") +
      `\n\n[SharkBite Max insertion depth](${maxInsertionChart}) · [SharkBite installation guide](${maxFittingInstructions})\n` : "") +
    (p.waterRuns?.length ? "\n\n## PEX support spacing\n\n" +
      waterSupportGuideLines(waterSupportNetwork(p)).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[PEX support guidance](${pexInstallation}) · [IRC piping support](${waterSupportReference.code}) · [HoldRite installation](${waterSupportReference.instructions})\n` : "") +
    (p.subfloorChecks?.length ? "\n\n## Subfloor support and blocking\n\n" +
      subfloorReport(p).map((line) => "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[APA Table 14 and Figure 1](${subfloorReference.specification}) · [2021 IRC floor table (Seattle edition)](${subfloorReference.code}) · [8d common nail example](${subfloorNails.listing})\n` : "") +
    (p.subfloorAdhesivePlans?.length ? "\n\n## Subfloor adhesive\n\n" +
      subfloorAdhesiveReport(p).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[Adhesive instructions](${subfloorAdhesive.specification}) · [APA glued floor guide](${subfloorAdhesive.apa})\n` : "") +
    (p.subfloorNailPlans?.length ? "\n\n## Subfloor fasteners\n\n" +
      subfloorFasteningReport(p).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[APA fastening schedule](${subfloorReference.specification}) · [Grip-Rite specifications](${subfloorNails.specification})\n` : "") +
    (p.subfloorJoistPlans?.length ? "\n\n## Joist bearing and span\n\n" +
      subfloorJoistReport(p).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[R502.6 and floor joist span table](${floorJoistReference.code}) · [AWC span measurement](${floorJoistReference.spanGuide})\n` : "") +
    (p.bottomPlateSeals?.length ? "\n\n## Bottom plate air seals\n\n" +
      bottomPlateSealGuide(p).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[PNNL bottom plate guidance](${bottomPlateSealant.fieldGuide}) · [OSI instructions](${bottomPlateSealant.specification})\n` : "") +
    (p.sinkDrains?.length ? "\n\n## Sink drains and wall-tube cuts\n\n" +
      p.sinkDrains.flatMap((record) => sinkDrainGuide(p, record)).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[Oatey kit drawing](${sinkTrap.drawing}) · [Installation](${sinkTrap.installation}) · [IRC fixture vents](${sinkDrainReferences.ircVent.url}) · [IPC fixture vents](${sinkDrainReferences.ipcVent.url})\n` : "") +
    (p.waterStops?.length ? "\n\n## Fixture shutoffs\n\n" +
      p.waterStops.flatMap((stop) => waterStopGuide(p, stop)).map((line) =>
        "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")).join("\n") +
      `\n\n[SharkBite Max stop specifications](${waterStop.spec}) · [Installation](${waterStop.instructions}) · [IRC fixture access reference](${waterStop.code})\n` : "") +
    (p.waterPressureTests?.length ? "\n\n## Water pressure test records\n\n" + waterPressureGuideStep +
      p.waterPressureTests.map((test) => {
        const clean = (line: string) => line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
        const rows = reviewWaterPressure(p, test).rows;
        const sources = [...new Map(rows.flatMap((row) => row.sources ?? []).map((source) => [source.url, source])).values()];
        return `\n\n### ${clean(test.name)}\n\n` +
          [...waterPressureObservations(test), ...rows.map((row) => `${row.label} · ${codeRowLabels[row.state]} · ${row.detail}`)]
            .map((line) => "- " + clean(line)).join("\n") +
          sources.map(({ title, url }) => `\n- [${title}](${url})`).join("");
      }).join("") + "\n" : "") +
    (motions.length ? "\n\n## Motion and clearance\n\n" +
      motions.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") : "") +
    (latch.length ? "\n\n## Greenhouse door latch layout\n\n" +
      latch.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") +
      `\n\n[Everbilt 24417 installation instructions](${everbiltLatch.instructions})\n` : "") +
    (doorSeals.length ? "\n\n## Greenhouse door weatherseal\n\n" +
      doorSeals.map((line) => `- ${line.replace(/[\r\n]+/g, " ")}`).join("\n") +
      `\n\n[Frost King installation instructions](${doorSeal.instructions}) · [Home Depot weatherseal](${doorSeal.listing})\n` : "") +
    (doorStops.length ? "\n\n## Fitted greenhouse door stops\n\n" +
      doorStops.map((line) => "- " + line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ")).join("\n") : "") +
    (p.motionPlans?.some((plan) => plan.mechanism.kind === "slide" && plan.mechanism.drawerSlide)
      ? `\n\n[Accuride 3732 installation and travel](${accuride3732.manual})` : "") +
    [...doorKits].map((id) => {
      const kit = greenhouseDoorKits[id];
      return `\n\n[${kit.label} manufacturer document](${kit.instructions})`;
    }).join("") +
    suppliesMarkdown(p) +
    attachmentGuideMarkdown(p) +
    restraintGuideMarkdown(p) +
    fastenerGuideMarkdown(p) +
    hingeGuideMarkdown(p) +
    connectorGuideMarkdown(p) +
    connectionCoverageMarkdown(p, connections)
  );
}
export function rollGuideMarkdown(project: Project) {
  const rolls = bom(project).flatMap((row) =>
    row.rolls.map((roll, i) => ({
      material: material(row.id).name,
      quoted: material(row.id).orderRollWidth !== undefined,
      roll,
      number: i + 1,
    })),
  );
  if (!rolls.length) return "";
  return (
    "\n\n## Roll cutting layouts\n\nDimensions are inches. X is across the roll width; Y is along its length from the starting edge. Snip cuts use zero kerf. This is a feasible layout, not a guarantee of minimum waste.\n\n" +
    rolls
      .map(
        ({ material, quoted, roll, number }) =>
          `### ${material} — ${quoted ? "requested continuous stock" : `roll ${number}`} (${roll.width} × ${roll.length} in)\n` +
          roll.placements
            .map(
              (c) => {
                const folds = quoted ? foilReturnText(project.pieces.find((piece) => piece.id === c.id)?.foilReturns) : "";
                return `- ${partLabel(project, c.id)} · ${c.name}: ${formatPreciseInches(c.width)} × ${formatPreciseInches(c.length)}; start X ${formatPreciseInches(c.x)}, Y ${formatPreciseInches(c.y)}.${folds ? ` Fold returns · ${folds}.` : ""}`;
              },
            )
            .join("\n"),
      )
      .join("\n\n")
  );
}
export function parseInventory(text: string): Inventory[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(
      "Inventory must be a JSON array; download the example for the expected format.",
    );
  }
  return inventorySchema.array().max(100).parse(data);
}
export function parseDxf(
  text: string,
  inchesPerUnit: number,
): Project["planLines"] {
  if (
    !Number.isFinite(inchesPerUnit) ||
    inchesPerUnit <= 0 ||
    inchesPerUnit > 100
  )
    throw Error("Choose a valid DXF scale.");
  const lines = text.replaceAll("\r", "").split("\n");
  const pairs: { code: number; value: string }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2)
    pairs.push({ code: Number(lines[i].trim()), value: lines[i + 1].trim() });
  const result: Project["planLines"] = [];
  const hasSections = pairs.some(({ code, value }) => code === 0 && value === "SECTION");
  let section = "";
  const coordinate = (input: string | undefined) => input?.trim() ? Number(input) : NaN;
  const addLine = (coordinates: number[], entity: string) => {
    if (coordinates.some((value) => !Number.isFinite(value)))
      throw Error(`A DXF ${entity} has missing or invalid coordinates.`);
    const [x, z, xx, zz] = coordinates.map((value) => value * inchesPerUnit);
    if ([x, z, xx, zz].some((value) => Math.abs(value) > 12000))
      throw Error("DXF coordinates exceed the workspace. Check scale or move the drawing near its origin.");
    if (result.length >= 3000) throw Error("Limit drawings to 3,000 reference segments.");
    result.push({ a: [x, 0.1, z], b: [xx, 0.1, zz] });
  };
  for (let i = 0; i < pairs.length; i++) {
    const { code, value: entity } = pairs[i];
    if (code !== 0) continue;
    if (entity === "SECTION") section = pairs[i + 1]?.code === 2 ? pairs[i + 1].value : "";
    if (entity === "ENDSEC") section = "";
    if ((hasSections && section !== "ENTITIES") || (entity !== "LINE" && entity !== "LWPOLYLINE")) continue;
    const values = new Map<number, string>();
    const vertices: [number, number][] = [];
    let curved = false;
    for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j++) {
      const { code, value } = pairs[j];
      values.set(code, value);
      if (entity !== "LWPOLYLINE") continue;
      if (code === 10) vertices.push([coordinate(value), NaN]);
      if (code === 20 && vertices.length) vertices[vertices.length - 1][1] = coordinate(value);
      if (code === 42 && Number(value) !== 0) curved = true;
    }
    const layout = values.get(410);
    if (Number(values.get(67)) === 1 || (layout && layout.toLowerCase() !== "model")) continue;
    if (entity === "LINE") {
      addLine([10, 20, 11, 21].map((code) => coordinate(values.get(code))), entity);
      continue;
    }
    if (curved || Number(values.get(210) ?? 0) !== 0 || Number(values.get(220) ?? 0) !== 0 || Number(values.get(230) ?? 1) !== 1) continue;
    if (vertices.length < 2 || vertices.length !== Number(values.get(90) ?? vertices.length))
      throw Error("A DXF LWPOLYLINE has missing or invalid vertices.");
    const closed = (Number(values.get(70) ?? 0) & 1) !== 0;
    for (let index = 0; index < vertices.length - (closed ? 0 : 1); index++)
      addLine([...vertices[index], ...vertices[(index + 1) % vertices.length]], entity);
  }
  if (!result.length)
    throw Error("No supported model-space linework found. Export an ASCII DXF with LINE entities or straight 2D polylines.");
  return result;
}

/** Record edits as human-readable operations for the guide, independently of undo state. */
export function recordChanges(before: Project, after: Project): Project {
  const messages: { stepId: string; message: string }[] = [];
  const oldPieces = new Map(before.pieces.map((p) => [p.id, p]));
  const added = after.pieces.filter((p) => !oldPieces.has(p.id));
  const offcuts = added.filter((p) => p.offcut);
  const addedByStep = new Map<string, number>();
  for (const p of added.filter((p) => !p.offcut))
    addedByStep.set(p.stepId, (addedByStep.get(p.stepId) ?? 0) + 1);
  for (const [stepId, count] of addedByStep)
    messages.push({
      stepId,
      message: `Added ${count} part${count === 1 ? "" : "s"} to the layout.`,
    });
  for (const p of after.pieces) {
    const old = oldPieces.get(p.id);
    if (!old) continue;
    if (p.material !== old.material)
      messages.push({
        stepId: p.stepId,
        message: `Changed stock for ${p.name} from ${material(old.material).name} to ${material(p.material).name}.`,
      });
    if (p.size.some((v, i) => v !== old.size[i])) {
      messages.push({
        stepId: p.stepId,
        message: `${offcuts.length ? "Cut" : "Resized"} ${p.name} to ${p.size.map(format).join(" × ")}.${offcuts.length
          ? isDrywall(p.material) ? " Kept the score-and-snap offcut."
            : isBatt(p.material) ? " Kept the offcut; no knife kerf modeled."
              : " Kept the offcut; ⅛ in saw kerf removed."
          : ""}`,
      });
    } else if (
      JSON.stringify(p.roundOpenings ?? []) !==
      JSON.stringify(old.roundOpenings ?? [])
    ) {
      const count = p.roundOpenings?.length ?? 0;
      messages.push({
        stepId: p.stepId,
        message: `Updated the round-opening layout for ${p.name}. ${count} opening${count === 1 ? "" : "s"} in the current plan.`,
      });
    }
    if (
      JSON.stringify(p.rectangularOpenings ?? []) !==
      JSON.stringify(old.rectangularOpenings ?? []) &&
      p.size.every((value, i) => value === old.size[i])
    ) {
      const count = p.rectangularOpenings?.length ?? 0;
      messages.push({
        stepId: p.stepId,
        message: `Updated the rectangular cut layout for ${p.name}. ${count} cut${count === 1 ? "" : "s"} in the current plan.`,
      });
    }
    if (p.position.some((v, i) => v !== old.position[i]) && !offcuts.length)
      messages.push({
        stepId: p.stepId,
        message: `Positioned ${p.name} at ${p.position.map((v) => `${Math.round(v * 100) / 100} in`).join(", ")} (X, Y, Z).`,
      });
    if (p.rotation.some((v, i) => v !== old.rotation[i]))
      messages.push({
        stepId: p.stepId,
        message: `Rotated ${p.name} to ${p.rotation.map((v) => `${Math.round((v * 180) / Math.PI)}°`).join(", ")} (pitch, yaw, roll).`,
      });
  }
  const ids = new Set(after.pieces.map((p) => p.id));
  for (const p of before.pieces)
    if (!ids.has(p.id))
      messages.push({
        stepId: p.stepId,
        message: `Removed ${p.name} from the layout.`,
      });
  const oldJoints = new Set(before.joints.map((j) => j.id));
  for (const j of after.joints)
    if (!oldJoints.has(j.id)) {
      const a = after.pieces.find((p) => p.id === j.a),
        b = after.pieces.find((p) => p.id === j.b);
      messages.push({
        stepId: j.stepId,
        message: `Specified ${j.quantity} ${hardwareForJoint(j)?.name ?? j.kind}: ${a?.name} → ${b?.name}. Verify the attachment schedule before construction.`,
      });
    }
  const afterJoints = new Set(after.joints.map((j) => j.id));
  for (const j of before.joints)
    if (!afterJoints.has(j.id))
      messages.push({
        stepId: j.stepId,
        message: "Removed a connection from the plan.",
      });
  return {
    ...after,
    history: [
      ...after.history,
      ...messages
        .slice(0, 100)
        .map((m) => ({ ...m, id: uid(), at: new Date().toISOString() })),
    ].slice(-5000),
  };
}
