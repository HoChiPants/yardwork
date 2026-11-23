import { trimBackerRodCutPlan, trimSealantSessionDetail, trimSeamPurchaseSummary } from "./woodJointDecisions";
import { trimSealant } from "./trimSealantReference";
import { isSubfloorPanel, subfloorReviews } from "./subfloor";
import { bottomPlateSealReviews } from "./bottomPlateSeal";
import { reviewSillGaskets, sillGasketMarkText, sillPlateFootprint } from "./sillGaskets";
import { drywallPlateDetails, topPlateSealReviews } from "./topPlateSeal";
import { openingAirSealSummary } from "./openingAirSeal";
import type { BuildPreparationAction } from "./buildPreparation";
import { inspectCutStock, type Finding } from "./engine";
import { drawerBoxOpening, type DrawerSpacerLayers } from "./drawerBoxes";
import type { CabinetDoorsInput } from "./cabinetDoorsSchema";
import type { SeatLidTestStart } from "./seatLidMotions";
import { cabinetDoorFrameParts } from "./cabinetDoors";
import { drawerCabinetRequest, type DrawerCabinetRequest } from "./drawerCabinet";
import { drywallSheetChoice, drywallStartFace, resolveDrywallWalls, wallDrywallRequest, type WallDrywallRequest, type WallDrywallStart } from "./wallDrywallRequests";
import { reviewWallDrywallScrews } from "./wallDrywallScrews";
import { drywallScrews } from "./drywallReference";
import { reviewWallDrywallJoints } from "./wallDrywallJoints";
import { casingSealReviews } from "./casingSeal";
import { countertopOptions, countertopWallOptions, reviewCountertopSeals } from "./countertopSeal";
import { reviewFloorStop } from "./doorFloorStop";
import { casingSwing } from "./doorCasing";
import { parseDrawerStopAngles, type DrawerStopRequest } from "./drawerOpening";
import { checkGreenhouseDoorSeal, reviewGreenhouseDoorSeal } from "./greenhouseDoorSeal";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { inspectLidTravel } from "./lidTravelFindings";
import {
  canParkMotion,
  doorDrawerOrderSetup,
  independentlyMovingContact,
  motionApproachMarksLine,
  motionDirectionLimit,
  motionDistance,
  motionReviewDistance,
  motionReviewTargets,
  motionStopLine,
  motionTargetDistance,
  motionTestFindings,
  resolveMotionTestSetup,
  reviewMotionTests,
  runMotionTest,
  shorterMotionTrial,
  trialMotionOpeningOrder,
  type MotionDirection,
  type MotionGapPair,
} from "./mechanismMotion";
import { interactionSetup } from "./motionInteractionAudit";
import { motionOpeningOrders, motionOrderLabel } from "./motionOrderLabels";
import { parsePrompt, type Command, type MaterialId, type Project } from "./model";
import { windowWallScope } from "./windowWall";
import { doorAndWindowExample, doorAndWindowGuideNote } from "./wallOpenings";
import { reviewWaterRun } from "./wallWater";
import { fittingLabel, reviewWaterFitting } from "./waterFittings";
import { reviewWaterPressure, waterPressureReviewStep, waterRoughInLinings } from "./waterPressure";
import { guideIsCurrent } from "./guide";
import { reviewWaterStop } from "./waterStops";
import { reviewSinkDrain } from "./sinkDrain";
import { longSupportSpan, waterSupportNetwork, waterSupportSpanLine } from "./waterSupportNetwork";
import type { MotionPlan, MotionSequenceTargets, MotionTestSetup } from "./motionPlanSchema";
import { planOffcutReuse, planOnHandOffcutReuse, ripFirstReuseNote, type OffcutReusePlan } from "./offcutReusePlan";
import { usableOffcutEligible } from "./usableOffcut";
import { offcutSplitSuggestions, offcutSplitOptions, type OffcutSplitPreset } from "./offcutSplit";
import { drawerBalanceCabinets } from "./drawerBalance";
import { ensurePartLabels, partLabel } from "./partLabels";
import { previewPartElevation } from "./placement";
import { partOffcutOptions } from "./partStockReplacement";
import { openingDrainageNote, reviewOpeningFlashings } from "./openingFlashing";
import { openingFlashingScope } from "./openingFlashingReference";
import { windowFlashingPhaseKinds, windowFlashingSchedule } from "./windowFlashingGuide";
import { reviewAssemblyOrder } from "./assemblyOrder";
import { driverAccessOrderName, driverAccessScope, driverAccessStateName, reviewDriverAccess } from "./fastenerAccess";
import { fastenerReviews } from "./fastenings";
import { fieldTreatmentScope, fieldTreatmentTitle, treatedWoodCuts } from "./treatedWood";
import { reviewWoodSupport, woodSupportBreaks, woodSupportScope } from "./woodSupport";
import { groupedMaterials, materialFamilyVariants, materialPlacementOptions } from "./materialGroups";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { scribeSidePanels } from "./scribeFiller";
import { furnitureBracePosts } from "./furnitureBrace";
import { cabinetBackingReviews, cabinetBackingWalls } from "./cabinetBacking";
import { installationRouteTargets, reviewInstallationRoute } from "./installationRoute";
import { reviewPanelBearing } from "./panelBearing";
import { reviewShelfSag, shelfSagGeometry, shelfSagSummary } from "./shelfSag";
import { fitPanelOffcut, panelOffcutEligible } from "./panelOffcut";
import { compareRepeatedBoardCuts, maxRepeatedBoards } from "./repeatedBoardCuts";
import { findBoardCutListOffcuts, maxComparedOffcuts, maxMixedBoardCuts, mixedBoardStockOptions, planMixedBoardCuts, type BoardCutPlan } from "./mixedBoardCuts";
import { pipeAirSealOptions, reviewPipeAirSeals } from "./pipeAirSeal";
import { normalizeIdeaText } from "./ideaEdits";
import { framedWallRequest, type FramedWallDimensions } from "./framedWallRequest";
import { reviewRimAirSeals, rimAirSealKey, rimEdgeSealEstimate, uncutRimFoamOffcuts } from "./rimAirSeals";
import { rimSealScope } from "./rimAirSealReference";
import { modeledRoofValleys } from "./roofValleys";
import { roofDeckSpacingReference } from "./roofDeckSpacing";
import { roofDeckBlockingScope, roofDeckBlockingTargets } from "./roofDeckBlocking";
import { workspaceDimensionForCut } from "./workspaceDimensions";
import { valleyScope } from "./roofValleyReference";
import { floorRegisterScope } from "./floorRegisterReference";
import { floorRegisterCutoutLabel, floorRegisterCutoutUse, floorRegisterReviews } from "./floorRegister";
import { availableRoundDuctOffcuts, roundDuctReviews } from "./roundDuct";
import { roundDuctElbowScope, roundDuctScope, roundDuctSealScope } from "./roundDuctReference";
import { roofVentFlashingScope } from "./roofVentFlashingReference";
import type { RimSide } from "./rimAirSealSchema";

export type BuildQuestion =
  | { kind: "checks" }
  | { kind: "part-elevation"; label: string; height: number }
  | { kind: "part-offcuts"; label: string }
  | { kind: "wood-support"; label: string }
  | { kind: "shelf-divider"; label?: string }
  | { kind: "installation-route" }
  | { kind: "drawer-balance" }
  | { kind: "motion"; subject: string; shorter?: true; direction?: MotionDirection }
  | { kind: "motion-contact"; subject: string; direction?: MotionDirection; testName?: string }
  | { kind: "motion-sequence"; legs: MotionRequestLeg[] }
  | { kind: "motion-audit" }
  | { kind: "independent-motion"; subjects: [string, string]; minimum?: number }
  | { kind: "seat-lid-pair" }
  | { kind: "motion-gap"; labels: [string, string]; testName?: string }
  | { kind: "drawer-opening"; stop?: DrawerStopRequest; compareOrder?: true }
  | { kind: "greenhouse-weatherseal" }
  | { kind: "opening-flashing"; sillLabel?: string }
  | { kind: "window-seal-order"; sillLabel?: string }
  | { kind: "window-wall"; prompt: string }
  | { kind: "framed-wall"; request: NonNullable<ReturnType<typeof framedWallRequest>> }
  | { kind: "wall-water"; subject?: string }
  | { kind: "water-fitting"; tee?: boolean }
  | { kind: "water-pressure" }
  | { kind: "rough-in-before-drywall"; wall?: string }
  | { kind: "water-stop" }
  | { kind: "sink-drain" }
  | { kind: "subfloor-support"; panelLabel?: string }
  | { kind: "trim-sealant" }
  | { kind: "countertop-seal"; label?: string }
  | { kind: "pipe-air-seal" }
  | { kind: "casing-seal" }
  | { kind: "door-hardware" }
  | { kind: "floor-door-stop" }
  | { kind: "cabinet-doors"; leaves?: CabinetDoorsInput["leaves"]; barPull?: boolean }
  | { kind: "cabinet-pulls"; inset?: number; label?: string }
  | { kind: "usable-offcut"; label: string }
  | { kind: "offcut-split"; label: string; preset?: OffcutSplitPreset }
  | { kind: "scribe-filler"; panelLabel?: string }
  | { kind: "furniture-brace"; posts?: [string, string] }
  | { kind: "cabinet-backing"; height?: number }
  | { kind: "cabinet-screw-reach" }
  | { kind: "driver-clearance"; planLabel?: string; locationLabel?: string; coverLabel?: string }
  | { kind: "backer-rod-offcuts" }
  | { kind: "bottom-plate-seal" }
  | { kind: "sill-gasket"; label?: string }
  | { kind: "top-plate-seal" }
  | { kind: "drywall-bottom-plate-seal" }
  | { kind: "rim-air-seal" }
  | { kind: "roof-valley" }
  | { kind: "roof-deck-spacing" }
  | { kind: "roof-deck-ends" }
  | { kind: "roof-deck-blocking"; panelLabels: string[]; reuse: boolean }
  | { kind: "floor-register"; reuse?: true }
  | { kind: "round-duct" }
  | { kind: "round-duct-elbow" }
  | { kind: "round-duct-seal" }
  | { kind: "round-duct-offcuts" }
  | { kind: "roof-vent-flashing" }
  | { kind: "water-support" }
  | { kind: "treated-wood" }
  | { kind: "drawer-cabinet"; request: DrawerCabinetRequest }
  | { kind: "wall-drywall"; request: WallDrywallRequest }
  | { kind: "drawer-box"; labels: [string, string]; spacers?: DrawerSpacerLayers; barPull?: boolean }
  | { kind: "board-cut-list"; nominal: string; treated: boolean; lengths: number[]; offcutLabels?: string[]; issue?: string }
  | { kind: "board-stock"; length: number; nominal: string; treated: boolean; quantity: number }
  | { kind: "dimension-stock"; dimensionName: string; nominal: string; treated: boolean; quantity: number }
  | { kind: "board-offcut"; length: number; nominal: string; treated: boolean; offcutLabel?: string }
  | { kind: "panel-offcut"; width: number; length: number; label: string }
  | { kind: "offcuts"; label?: string; onHandOnly?: true };

export type BuildQuestionAction =
  | { kind: "finding"; id: string }
  | { kind: "driver-approach"; planId?: string; locationId?: string }
  | { kind: "part-elevation"; id: string; height: number }
  | { kind: "part-offcuts"; id: string; offcutId: string }
  | { kind: "checks" }
  | { kind: "wood-support"; id: string }
  | { kind: "shelf-divider"; id: string }
  | { kind: "installation-route"; routeId?: string }
  | { kind: "drawer-balance"; sectionId?: string }
  | { kind: "cut-pool" }
  | { kind: "motion-setup"; audit?: true }
  | { kind: "motion-direction"; planId: string; direction: MotionDirection; setup?: MotionTestSetup; name?: string;
      scenarioId?: string; savedSetup?: true; approach?: true }
  | { kind: "independent-motion"; selectedId: string; companionId: string; minimum?: number }
  | ({ kind: "seat-lid-pair" } & SeatLidTestStart)
  | { kind: "shorter-motion"; planId: string; variant: "baseline" | "saved"; scenarioId?: string }
  | { kind: "motion-gap"; planId: string; scenarioId?: string; pair: MotionGapPair }
  | { kind: "drawer-opening"; drawerId: string; doorId: string; stop?: DrawerStopRequest; compareOrder?: true }
  | { kind: "greenhouse-weatherseal"; motionId: string }
  | { kind: "opening-flashing"; sillId?: string }
  | { kind: "window-wall"; command?: Command }
  | ({ kind: "framed-wall" } & FramedWallDimensions)
  | { kind: "wall-water"; runId?: string }
  | { kind: "water-fitting"; fittingId?: string; tee?: boolean }
  | { kind: "water-pressure"; recordId?: string }
  | { kind: "water-stop"; stopId?: string }
  | { kind: "sink-drain"; drainId?: string }
  | { kind: "subfloor-support"; panelId?: string }
  | { kind: "trim-sealant" }
  | { kind: "countertop-seal"; topId?: string; planId?: string }
  | { kind: "pipe-air-seal"; planId?: string }
  | { kind: "casing-seal"; sectionId: string }
  | { kind: "door-hardware"; sectionId: string }
  | { kind: "floor-door-stop"; sectionId: string }
  | { kind: "cabinet-doors"; leaves?: CabinetDoorsInput["leaves"]; barPull?: boolean }
  | { kind: "cabinet-pulls"; sectionId: string; inset?: number }
  | { kind: "usable-offcut"; offcutId: string }
  | { kind: "offcut-split"; offcutId: string; preset?: OffcutSplitPreset }
  | { kind: "scribe-filler"; panelId?: string }
  | { kind: "furniture-brace"; firstId?: string; secondId?: string }
  | { kind: "cabinet-backing"; height?: number; row?: { wallId: string; planId: string } }
  | { kind: "bottom-plate-seal"; planId?: string }
  | { kind: "sill-gasket"; partId?: string }
  | { kind: "top-plate-seal"; planId?: string }
  | { kind: "drywall-bottom-plate-seal"; planId?: string }
  | { kind: "rim-air-seal"; sectionId?: string; side?: RimSide }
  | { kind: "roof-valley" }
  | { kind: "roof-deck-blocking"; jointId: string; bayIds: string[]; reuse: boolean }
  | { kind: "floor-register"; planId?: string }
  | { kind: "round-duct"; runId?: string }
  | { kind: "round-duct-elbow" }
  | { kind: "round-duct-seal" }
  | { kind: "roof-vent-flashing" }
  | { kind: "water-support" }
  | { kind: "drawer-cabinet"; request: DrawerCabinetRequest }
  | { kind: "wall-drywall"; request: WallDrywallStart }
  | { kind: "drawer-box"; panelIds: [string, string]; spacers?: DrawerSpacerLayers; barPull?: boolean }
  | { kind: "treated-wood" }
  | { kind: "board-cut-list"; name: string; plan: BoardCutPlan }
  | { kind: "offcut-reuse"; plan: OffcutReusePlan; offcutId?: string; onHandOnly?: true }
  | { kind: "board-placement"; groupId: string; length: number; offcutId?: string; quantity?: number; stock?: MaterialId }
  | { kind: "dimension-stock"; dimensionId: string; groupId: string; quantity: number }
  | { kind: "panel-offcut"; offcutId: string; width?: number; length?: number }
  | Extract<BuildPreparationAction, { kind: "motion" | "lid" | "part" | "offcut" | "field-treatment" | "guide-step" }>;

type ReviewLink = { label: string; action: BuildQuestionAction };
type ReviewRow = {
  id: string;
  title: string;
  detail: string;
  link?: ReviewLink;
};
export type BuildQuestionAnswer = {
  title: string;
  detail: string;
  rows?: ReviewRow[];
  link?: ReviewLink;
  scope?: string;
};

const clean = (text: string) =>
  text
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[.!?]+$/, "")
    .trim();
const searchName = (text: string) =>
  clean(text)
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/^(?:the|my|our)\s+/, "");
const partNumber = /^([op])(\d{1,6})$/i;
const labelKey = (value: string) => {
  const match = partNumber.exec(value);
  return match ? match[1].toUpperCase() + match[2].padStart(3, "0") : value;
};
const weaknessQuestion =
  /^(?:what (?:looks|is|seems) weak(?: (?:here|in (?:this|my|the) (?:build|design|plan|project)))?|(?:where|what) are (?:the |my )?weak (?:spots|points)(?: in .+)?|what should i (?:fix|check|review) before (?:i )?build(?:ing)?|(?:review|check|show) (?:the )?(?:weak spots|weak points|structural checks)(?: in .+)?)$/i;
const driverClearanceQuestion =
  /^(?:check|review|show) (?:the |my )?(?:driver (?:clearance|access)|screw (?:access|clearance)|tool approaches?)(?: for (?<plan>w\d{1,6})(?:\s*\/\s*(?<location>f\d{1,6}))?)?$/i;
const driverBlockerQuestion =
  /^what (?:blocks|is blocking) (?:my |the )?(?:driver|drill|tool)(?: at (?<plan>w\d{1,6})(?:\s*\/\s*(?<location>f\d{1,6}))?)?$/i;
const driverReachQuestion =
  /^(?:can|will|could) (?:my |the )?(?:driver|drill|bit) reach (?<plan>w\d{1,6})(?:\s*\/\s*(?<location>f\d{1,6}))?$/i;
const coverOrderQuestion =
  /^(?:which|what) screws (?:should|do|must) i (?:drive|fasten|install) before (?:adding |fitting |installing |placing |hanging )?(p\d{1,6})$/i;
const woodSupportQuestion =
  /^(?:where does support stop for|(?:show|check|trace) (?:the )?support (?:to the floor )?for) (p\d{1,6})$/i;
const partElevationQuestion = /^(?:(?:set|place|preview|move) (?:the )?(?:bottom|underside) of (p\d{1,6}) (?:to|at) |(?:set|place|preview|move) (p\d{1,6})['’]s (?:bottom|underside) (?:to|at) |(?:move|raise|lower|place) (p\d{1,6}) so (?:its|the) (?:bottom|underside) is )(.+?)(?: (?:above|off) (?:the )?floor)?$/i;
const treatmentQuestion =
  /^(?:which (?:cuts|parts|holes|cut ends) (?:need|require) (?:field )?treatment|(?:which|what) (?:treated|pressure[- ]treated) (?:wood|lumber) (?:cuts|parts|holes|cut ends) (?:need|require) (?:field )?treatment|(?:do|should) i (?:need to )?treat (?:the |my )?(?:cut ends|drilled holes)|(?:show|review|check) (?:the )?(?:field treatment|pressure[- ]treated wood cuts))$/i;
const scrapQuestion =
  /^(?:what (?:could|can|should) i (?:use|reuse) ([op]\d{1,6}) for|(?:show|find|suggest) (?:uses|reuse options) for (?:offcut |scrap )?([op]\d{1,6})|(?:can|could) i reuse (?:offcut |scrap )?([op]\d{1,6}))$/i;
const offcutQuestion =
  /^(?:(?:what|which) (?:offcuts|scraps|leftovers) (?:could|can|should) i (?:use|reuse)|(?:can|could) i reuse (?:any |my |the )?(?:offcuts|scraps|leftovers)|(?:review|show|plan|find) (?:the )?(?:offcut reuse|scrap reuse|uses for (?:my |the )?(?:scraps|offcuts)))$/i;
const offcutSavingsQuestion =
  /^(?:(?:can|could) i )?(?:buy fewer (?:boards|sheets)|save (?:a|one) (?:board|sheet)|use less new (?:lumber|plywood)) (?:with|using) (?:my |the )?(?:offcuts|scraps|leftovers)$/i;
const onHandOffcutQuestion =
  /^(?:(?:what can i (?:reuse|make|cut) from|(?:review|show|find) (?:uses for )?)\s*(?:my |the )?on[ -]hand (?:offcuts|scraps)|what can i (?:reuse|make|cut) from (?:my |the )?(?:offcuts|scraps) i already have)$/i;
const namedBoardOffcutQuestion =
  /^(?:can|could) i (?:make|cut|get) (?:a |one )?(.+) from (?:offcut |scrap |leftover )?(o\d{1,6})$/i;
const boardOffcutQuestion =
  /^(?:(?:can|could) i (?:make|cut|get) (?:a |one )?(.+) from (?:an? |my |the |any )?(?:offcuts?|scraps?|leftovers?|cut pool)|do i have (?:any |an? )?(?:offcuts?|scraps?|leftovers?) for (?:a |one )?(.+))$/i;
const panelOffcutQuestion =
  /^(?:(?:can|could) i (?:cut|make)|plan|cut|make) (?:a )?(?<width>\d+(?:\.\d+)?)\s*(?<widthUnit>in(?:ch(?:es)?)?|ft|feet|foot|["″'′])?\s*(?:by|x|×)\s*(?<length>\d+(?:\.\d+)?)\s*(?<lengthUnit>in(?:ch(?:es)?)?|ft|feet|foot|["″'′]) (?:plywood )?panel from (?:offcut |scrap )?(?<label>o\d{1,6})$/i;
const boardPurchaseQuestion =
  /^(?:(?:what|which) (?:stock|board) lengths? should i buy|compare (?:stock|board) lengths?) for (?:an? )?(.+)$/i;
const mixedBoardQuestion =
  /^(?:plan|compare|show) (?:the )?(?:(pressure[- ]treated|treated) )?(\d{1,2})\s*(?:[x×]|by)\s*(\d{1,2}) (?:cuts|cut list)(?:\s*(?:of\s+|for\s+|:\s*)(.*))?$/i;
const boardOffcutSize =
  /^(.+?)\s+(?:(pressure[- ]treated|treated)\s+)?(\d{1,2})\s*(?:[x×]|by)\s*(\d{1,2})s?(?:\s+(?:boards?|posts?|framing lumber))?$/i;
const boardFeet = /^(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|['′])(?:\s*(\d+(?:\.\d+)?)\s*(?:inches|inch|in|["″]))?$/i;
const boardInches = /^(\d+(?:\.\d+)?)\s*(?:inches|inch|in|["″])$/i;
const drawerQuestion = /^(?:plan|fit|size|design|add) (?:a |the )?(?:cabinet )?drawer(?: box)? between (?<first>p\d{1,6}) and (?<second>p\d{1,6})(?: with (?:(?<left>\d+) left spacer layers?(?: and (?<bothRight>\d+) right spacer layers?)?|(?<right>\d+) right spacer layers?))?$/i;
const drawerOpeningQuestion = /^(?:how (?:far|wide) (?:do|should|can|must) i open (?:the |my )?(?:cabinet )?door (?:before (?:opening|pulling out|extending) (?:the |my )?drawer|(?:for|to clear) (?:the |my )?drawer)|(?:find|check|test) (?:a |the )?door opening (?:for|to clear) (?:the |my )?drawer)$/i;
const drawerOrderQuestion = /^(?:compare (?:the )?(?:cabinet )?door and drawer opening orders|should i open (?:the )?(?:cabinet )?door or (?:the )?drawer first)$/i;
const sillGasketQuestion = /^(?:(?:plan|fit|check|review|show) (?:an? |the |my )?sill (?:gaskets?|seals?)|how (?:do|can|should) i (?:air[ -]seal|seal) (?:the |my |a )?(?:wood )?sill plate (?:to|on|over) (?:the )?(?:concrete|masonry|foundation))(?: (?:for|on) (p\d{1,6}))?$/i;
const partialOpening = String.raw`(?:at different (?:openings|positions|angles)|(?:if|when|with) (?:one(?: of them)?|either(?: one)?|both|they|(?:the |my )?(?:cabinet )?(?:door|drawer|lid)) (?:is |are )?(?:only )?(?:partly|partially) open)`;
const motionSubject = String.raw`("[^"]+"|[^"].*?)`;
const independentMotionQuestion = new RegExp(
  `^(?:(?:can|could|will|would|does) ${motionSubject} (?:hit|collide with|interfere with) ${motionSubject}|(?:check|test|compare) ${motionSubject} and ${motionSubject}) ${partialOpening}$`,
  "i",
);
const independentGapQuestion = new RegExp(
  String.raw`^(?:check|test|verify) (?:a )?(\d+(?:\.\d+)?|\d+/\d+)\s*(?:inches|inch|in|["″]) (?:minimum )?gap between ${motionSubject} and ${motionSubject} ${partialOpening}$`,
  "i",
);
const drawerStopQuestion = /^will (?:an? |the )?(?<angle>\d+(?:\.\d+)?)\s*(?:°|degrees?)[ -](?:cabinet )?door stop (?:let|allow) (?:the |my )?drawer (?:open|extend)(?: (?:to )?(?<length>.+))?$/i;
const drawerTravelAtStopQuestion = /^(?:can|will) (?:the |my )?(?:cabinet )?drawer (?:open|extend)(?: (?:to )?(?<length>.+?))? (?:with|if) (?:the |my )?(?:cabinet )?door (?:is )?(?:at|stops at|limited to) (?<angle>\d+(?:\.\d+)?)\s*(?:°|degrees?)$/i;
const drawerStopComparisonQuestion = /^compare (?:(?:door stops? at )(?<after>.+?)|(?<before>.+?) door stops?)(?: for (?<length>.+?) (?:of )?drawer travel)?$/i;
const doorSealQuestion =
  /^(?:how (?:can|do|should) i (?:weatherstrip|weatherseal|seal) (?:the |my )?greenhouse door|(?:check|review|plan|show) (?:the )?(?:weatherstrip|weatherseal|weatherstripping) (?:for|on) (?:the |my )?greenhouse door)$/i;
const openingFlashingQuestion = /^(?:how (?:can|do|should) i (?:flash|air[ -]seal) (?:the |my )?(?:window|door) opening|(?:plan|review|check|show) (?:(?:(?:sill|opening|window|door|jamb and head) )?flashing|(?:the )?interior air[ -]seal))(?: (?:at|on|for) (p\d{1,6}))?$/i;
const windowWallQuestion = /^(?:(?:(?:build|frame|design|plan|make|create|add)\s+(?:(?:a|an|the)\s+)?)?(?:window wall|(?:(?:nonbearing|framed)\s+)?wall\b.*\bwindows?\b))/i;
const wallWaterQuestion = /^(?:(?:plan|route|add|lay out) (?:a |the )?(?:pex|water(?: supply)?) (?:line|pipe)(?: through (?:the |a )?(?:wall|studs))?|(?:review|check) (?:the |my )?water line(?: (.+))?|how (?:do|can|should) i run (?:a )?(?:pex|water) (?:line|pipe) through (?:the |a )?(?:wall|studs))$/i;
const fittingQuestion = /^(?:(?:how (?:do|can|should) i )?(?:connect|join) (?:two |my |these |the )?(?:pex|water) (?:runs|lines|pipes)(?: (?:at|around) (?:a |the )?corner)?|(?:review|check|plan) (?:the |my |a )?pex (?:fittings?|connections?))$/i;
const teeQuestion = /^(?:(?:how (?:do|can|should) i )?(?:branch|tee off) (?:the |a |my )?(?:pex|water) (?:main|line|pipe)|(?:add|plan) (?:a |the )?tee (?:in|into|on|to) (?:the |a |my )?(?:pex|water) (?:main|line|pipe)(?: for .+)?)$/i;
const pressureQuestion = /^(?:(?:how (?:do|can|should) i )?pressure[- ]test (?:the |my |a )?(?:pex|water(?: supply)?) (?:main|runs?|lines?|pipes?|system)|(?:log|record|review|check|show) (?:a |the |my )?(?:pex |water )?pressure tests?)$/i;
const namedSubfloorQuestion = /^(?:(?:plan|fit|add|preview|check|show) (?:(?:subfloor )?blocking|subfloor adhesive|subfloor fasteners|(?:floor )?joist (?:bearing|span))|(?:count|how many) (?:subfloor )?nails) (?:under|at|for) (p\d{1,6})$/i;
const subfloorQuestion = /^(?:(?:check|review|show|plan) (?:the |my )?(?:subfloor(?: support| blocking| joist spacing| adhesive| fasteners| (?:panel )?joints| joint spacing| end spacing)?|(?:floor )?joist (?:spacing|bearing|span))|does (?:the |my )?subfloor need (?:more )?blocking|(?:count|how many) subfloor nails|how far do (?:my |the )?(?:floor )?joists span)$/i;
const trimSealantQuestion = /^(?:how much trim (?:sealant|caulk)(?: do i need)?|how much (?:sealant|caulk)(?: do i need)? for (?:the |my )?(?:wood )?trim|how many (?:cartridges|tubes) of (?:trim sealant|trim caulk)(?: do i need)?|(?:estimate|review|show|check) (?:the |my )?trim (?:sealant|caulk)(?: work sessions?)?)$/i;
const backerRodQuestion = /^(?:(?:can|could) i (?:re)?use (?:my |the )?backer rod (?:offcuts|scraps)|(?:show|review|check) (?:my |the )?backer rod (?:cuts|offcuts))$/i;
const bottomPlateQuestion = /^(?:(?:how (?:do|can|should) i )?(?:air[ -]seal|seal|caulk) (?:the |a |my )?(?:wall )?(?:bottom|sole) plates?(?: to (?:the )?(?:wood )?subfloor)?|(?:plan|review|check|show) (?:the |a )?(?:bottom|sole) plate (?:air[ -]seals?|seals?))$/i;
const rimAirSealQuestion = /^(?:(?:how (?:do|can|should) i )?(?:air[- ]seal|seal|insulate) (?:the |my )?(?:rim[- ]joists?|band[- ]joists?|floor rims?)|(?:plan|review|check|show) (?:the )?(?:rim(?:[- ]joist)?|band[- ]joist|floor rim) (?:air[- ]seal(?:ing)?|insulation|foam cuts))$/i;
const roofValleyQuestion = /^(?:(?:how (?:do|can|should) i )?(?:line|seal|waterproof) (?:the |a |my )?roof valle(?:y|ys)|(?:plan|review|check|show) (?:the )?roof valley (?:lining|membrane|cuts))$/i;
const roofDeckBlockingQuestion = /^(?:fit|plan|preview|add) (?:the )?(?:roof (?:deck|sheathing) blocking|blocking (?:under|beneath|for) (?:the )?roof (?:deck|sheathing))(?: (?:between|for|on) (p\d{1,6})(?: (?:and|to) (p\d{1,6}))?)?(?: (?:using|with|from) (?:my |the )?((?:on[- ]hand )?(?:scraps?|offcuts?)|new (?:stock|boards|lumber)))?$/i;
const floorRegisterQuestion = /^(?:(?:plan|fit|check|review|show) (?:a |the |my )?floor (?:register|duct boot)|how (?:do|can|should) i (?:air[- ]seal|seal) (?:a |the |my )?floor (?:register|duct boot))$/i;
const floorRegisterCutoutQuestion = /^(?:(?:(?:how (?:do|can|should) i )?(?:record|keep|reuse|save)|what can i do with) (?:a |the |my )?floor (?:register|duct boot) (?:cutout|offcut|scrap))$/i;
const roundDuctQuestion = /^(?:how (?:do|can|should) i )?(?:plan|lay out|check|review|show) (?:a |the |my )?(?:straight )?(?:6 in(?:ch)? )?(?:round |metal |supply )?duct (?:runs?|cuts?)$/i;
const roundDuctElbowQuestion = /^(?:how (?:do|can|should) i )?(?:fit|plan|check|add) (?:a |the |my )?(?:90(?:°|[- ]degree) )?(?:round )?duct elbow$/i;
const roundDuctSealQuestion = /^(?:(?:how (?:can|do|should) i )?(?:plan |estimate |check )?(?:seal(?:ing)? (?:my |the )?(?:round )?ducts?|(?:round )?duct sealing)|how much (?:mastic|sealant)(?: do i need)? for (?:my |the )?(?:round )?ducts?)$/i;
const roundDuctOffcutsQuestion = /^(?:(?:how|where) (?:do|can|should) i )?(?:reuse|use|record|check|show) (?:the |my |a )?(?:round |metal )?duct (?:offcuts?|tails?|scrap)$/i;
const roofVentFlashingQuestion = /^(?:how (?:do|can|should) i (?:flash|seal) (?:the |a |my )?(?:(?:plumbing )?vent(?: pipe)? through (?:the |a |my )?roof|roof vent(?: pipe)?)|(?:plan|review|check|show) (?:the |my )?roof vent flashing)$/i;
const sinkDrainQuestion = /^(?:plan|fit|add|review|check|show|size) (?:a |the |my )?(?:(?:kitchen |kitchenette |cabinet )?sink (?:drain|trap)|(?:sink |kitchen )?p[ -]?trap|trap arm)(?: (?:at|under|for|in) .+)?$/i;
const waterStopQuestion = /^(?:plan|fit|add|review|check|show) (?:a |the |my )?(?:(?:pex |fixture |sink |kitchen |kitchenette )?(?:shut[ -]?offs?|angle stops?)(?: (?:for|at|under|on) .+)?|(?:a )?(?:shutoff |stop )valves?(?: (?:at|for|under) .+)?)$/i;
const waterSupportQuestion = /^(?:(?:how (?:do|can|should) i )support (?:the |my )?(?:pex|water) (?:runs?|lines?|pipes?)|(?:check|review|show|plan) (?:the |my )?(?:pex |water line )(?:supports?|support spacing))$/i;
const closestGapQuestion = /^(?:(?:(?:find|show|measure|what is|what['’]s) (?:the )?(?:closest|smallest|tightest) gap between|how close (?:do|can|will)) (?<first>p\d{1,6}) and (?<second>p\d{1,6})(?: get)?(?: (?:in|during) (?<testName>.+))?)$/i;
const motionContactQuestion = /^(?:where (?:does|will|would|might|can) (?<subject>.+?) (?:hit|collide|make contact)(?: first)?|(?:show|mark|locate) (?:the )?(?:first )?contact for (?<target>.+?))(?:(?: on| during| while| when) (?<direction>opening|closing))?(?: in (?:the test )?(?<testName>.+))?$/i;
const motionQuestion =
  /^(?:(?:can|will|does) (.+?) (?:open|close|slide|swing|extend|clear)(?: fully| freely| all the way| without (?:hitting|touching)(?: anything)?)?|(?:can|could) i (?:open|close|extend) (.+?)|(?:will|does) (.+?) (?:hit|touch|bump)(?: anything)?|(?:check|review|test) (?:the )?(?:motion|travel|clearance) (?:of|for) (.+))$/i;
const shorterMotionQuestion = /^(?:how far (?:(?:can|could) i (?:open|extend) (.+?)|(?:can|could|will) (.+?) (?:open|extend|swing))(?: before (?:it )?(?:hits|hitting|collides)(?: .+)?| without (?:hitting|touching)(?: anything)?)?|(?:find|try) (?:a )?shorter (?:motion|travel|opening) for (.+))$/i;

function inchesFromLength(text: string) {
  const feet = boardFeet.exec(text), inches = boardInches.exec(text);
  return feet ? Number(feet[1]) * 12 + Number(feet[2] ?? 0) : Number(inches?.[1]);
}

type MotionRequestLeg = {
  subject: string;
  direction: MotionDirection;
  target?: NonNullable<MotionSequenceTargets["selected"]>;
};

function isMotionSubject(subject: string) {
  return /^"[^"]+"$/.test(subject) || /^p\d{1,6}$/i.test(searchName(subject)) ||
    (/^(?:[\w -]+\s)?(?:door|drawer|tray|sliding panel)$/i.test(subject) && !/\b(?:and|or|then)\b/i.test(subject));
}

const motionAngle = /^(\d+(?:\.\d+)?)\s*(?:degrees?|°)$/i;
const motionLegTarget = new RegExp(
  `^(?<subject>.+?)\\s+(?:(?<preposition>to|from)\\s+)?(?<target>${[motionAngle, boardFeet, boardInches].map((pattern) => pattern.source.slice(1, -1)).join("|")})$`, "i",
);

function readMotionLeg(text: string): MotionRequestLeg | null {
  const match = /^(open|extend|pull out|close|retract|push in)\s+(.+)$/i.exec(text);
  if (!match) return null;
  const [, verb, body] = match;
  const direction = /^(?:open|extend|pull out)$/i.test(verb) ? "opening" : "closing";
  if (isMotionSubject(body)) return { subject: body, direction };
  const measured = motionLegTarget.exec(body)?.groups;
  if (!measured || !isMotionSubject(measured.subject)) return null;
  if ((direction === "closing") !== (measured.preposition?.toLowerCase() === "from")) return null;
  const angle = motionAngle.exec(measured.target);
  const target = angle ? { kind: "hinge" as const, travel: Number(angle[1]) }
    : { kind: "slide" as const, travel: inchesFromLength(measured.target.toLowerCase()) };
  return { subject: measured.subject, direction, target };
}

function splitMotionClauses(text: string) {
  const clauses: string[] = [];
  let start = 0;
  // Consume quoted names first so a separator inside a label is left intact.
  for (const match of text.matchAll(/(?<!\S)"[^"\n]+"(?=\s|,|$)|,?\s+(?:and\s+)?then\s+/gi)) {
    if (match[0].startsWith('"')) continue;
    clauses.push(text.slice(start, match.index).trim());
    start = match.index + match[0].length;
  }
  clauses.push(text.slice(start).trim());
  return clauses;
}

function boardSize(text: string) {
  const size = boardOffcutSize.exec(text);
  if (!size) return null;
  const length = inchesFromLength(size[1]);
  if (!Number.isFinite(length) || length <= 0) return null;
  return { length, nominal: `${Number(size[3])} × ${Number(size[4])}`, treated: !!size[2] };
}

function readBoardCutList(text: string): Extract<BuildQuestion, { kind: "board-cut-list" }> | null {
  const selected = /,?\s+(?:using|from)\s+((?:(?:offcuts?|scraps?)\s+)?o\d{1,6}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)(?:(?:offcut|scrap)\s+)?o\d{1,6})*|(?:(?:my|the|existing|available)\s+)?(?:cut pool|offcuts?|scraps?|leftovers))$/i.exec(text);
  const match = mixedBoardQuestion.exec(selected ? text.slice(0, selected.index) : text);
  if (!match) return null;
  const [, treatment, width, depth, entries = ""] = match;
  const result = { kind: "board-cut-list" as const, nominal: `${Number(width)} × ${Number(depth)}`,
    treated: !!treatment, lengths: [] as number[],
    ...(selected ? { offcutLabels: [...new Set((selected[1].match(/\bo\d{1,6}\b/gi) ?? []).map(labelKey))] } : {}) };
  for (const entry of entries.split(/\s*,\s*(?:and\s+)?|\s+and\s+/)) {
    const value = entry.trim();
    const explicitCount = /^(\d+)\s*[x×]\s*(.+)$/.exec(value);
    const implicitCount = /^(\d+)\s+(\d.+)$/.exec(value);
    const single = inchesFromLength(value);
    const count = explicitCount ?? implicitCount;
    const quantity = Number.isFinite(single) ? 1 : Number(count?.[1] ?? 1);
    const length = Number.isFinite(single) ? single : inchesFromLength(count?.[2] ?? value);
    if (!Number.isFinite(length) || length < 0.125)
      return { ...result, issue: "Enter each finished length with a unit, for example 60 in, 4 ft, and 2 × 46 in." };
    if (quantity < 1 || result.lengths.length + quantity > maxMixedBoardCuts)
      return { ...result, issue: `Choose 1 to ${maxMixedBoardCuts} pieces per cut list.` };
    for (let index = 0; index < quantity; index++) result.lengths.push(length);
  }
  return result;
}

export function buildQuestion(prompt: string): BuildQuestion | null {
  const text = clean(prompt).replace(
    /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,
    "",
  );
  if (weaknessQuestion.test(text)) return { kind: "checks" };
  const driver = (driverClearanceQuestion.exec(text) ??
    driverBlockerQuestion.exec(text) ?? driverReachQuestion.exec(text))?.groups;
  if (driver) {
    const { plan, location } = driver;
    return { kind: "driver-clearance",
      ...(plan && { planLabel: `W${plan.slice(1).padStart(3, "0")}` }),
      ...(location && { locationLabel: `F${location.slice(1).padStart(3, "0")}` }),
    };
  }
  const cover = coverOrderQuestion.exec(text);
  if (cover) return { kind: "driver-clearance", coverLabel: labelKey(cover[1]) };
  const partOffcuts = /^(?:(?:what|which) (?:offcuts?|scraps?) (?:can (?:i use for|fit)|fits?)|(?:find|compare|show) (?:matching )?(?:offcuts?|scraps?) for|(?:do i have|can i use) (?:any )?(?:offcuts?|scraps?) for) (p\d{1,6})$/i.exec(text);
  if (partOffcuts) return { kind: "part-offcuts", label: labelKey(partOffcuts[1]) };
  const elevation = partElevationQuestion.exec(text);
  if (elevation) return {
    kind: "part-elevation", label: labelKey(elevation[1] ?? elevation[2] ?? elevation[3]),
    height: inchesFromLength(normalizeIdeaText(elevation[4])),
  };
  const dimensionStock = /^(?:cut|plan) (?:(?:an?|the) |(\d+) )?(?:(treated|pressure[- ]treated) )?(\d{1,2})\s*[x×]\s*(\d{1,2})(?: (?:boards?|pieces?|lumber))? to (?:the )?saved dimension (.+)$/i.exec(text);
  if (dimensionStock) return {
    kind: "dimension-stock", dimensionName: dimensionStock[5].trim().replace(/^["'‘](.*)["'’]$/, "$1"),
    nominal: `${Number(dimensionStock[3])} × ${Number(dimensionStock[4])}`,
    treated: !!dimensionStock[2], quantity: Number(dimensionStock[1] ?? 1),
  };
  const woodSupport = woodSupportQuestion.exec(text);
  if (woodSupport) return { kind: "wood-support", label: labelKey(woodSupport[1]) };
  const shelfDivider = /^(?:(?:fit|plan|add|try|preview|find) (?:a |the )?(?:off-center |center )?shelf divider|how (?:can|do|should) i (?:reduce|fix|check) (?:the |my )?shelf sag)(?: (?:for|under|in) (p\d{1,6}))?$/i.exec(text);
  if (shelfDivider) return { kind: "shelf-divider", label: shelfDivider[1] && labelKey(shelfDivider[1]) };
  if (/^(?:(?:plan|check|test|show|review) (?:an? |the |my )?(?:carry|carry-in|install|installation|placement) (?:route|path)|(?:will|can) (?:the |my |this )?(?:cabinet|closet|bookcase|assembly|bench|vanity|island) (?:fit|pass|go) through (?:a |the |this )?(?:door|doorway|opening))$/i.test(text))
    return { kind: "installation-route" };
  if (/^(?:(?:check|compare|test|review) (?:the |my )?(?:loaded )?drawer balance|(?:can|will|could) (?:the |my |this )?(?:cabinet|dresser) tip(?: over| forward)? (?:with|when) .*\bdrawers?\b.*)$/i.test(text))
    return { kind: "drawer-balance" };
  if (/^(?:(?:plan|check|review) (?:a |the )?pipe (?:air )?seal|how (?:do|can|should) i (?:air[ -]seal|seal|caulk) (?:around )?(?:a |the |my )?(?:pvc |abs |plumbing )?pipe(?: (?:through|in) (?:a |the |my )?(?:wall|floor|subfloor))?)$/i.test(text))
    return { kind: "pipe-air-seal" };
  if (treatmentQuestion.test(text)) return { kind: "treated-wood" };
  const counterSeal = /^(?:(?:plan|check|review) (?:a |the )?(?:countertop|worktop) (?:splash )?(?:seal|seam)|how (?:do|should|can) i (?:seal|caulk) (?:my |the )?(?:countertop|worktop)(?: (?:to|against) (?:the )?wall)?)(?: (?:for|on) (p\d{1,6}))?$/i.exec(text);
  if (counterSeal) return { kind: "countertop-seal", label: counterSeal[1] && labelKey(counterSeal[1]) };
  const brace = /^(?:(?:plan|fit|add) (?:a |the )?(?:furniture )?diagonal brace|how (?:can|do|should) i brace (?:this |my |the )?(?:frame|workbench))(?: between (p\d{1,6}) and (p\d{1,6}))?$/i.exec(text);
  if (brace) return { kind: "furniture-brace", ...(brace[1] && { posts: [labelKey(brace[1]), labelKey(brace[2])] }) };
  const cabinetBacking = /^(?:(?:plan|fit|add|check) (?:the )?(?:wall )?cabinet (?:backing|blocking)|(?:plan|add|check) (?:wall )?(?:backing|blocking) for (?:my |the )?(?:wall |upper )?cabinets?|where (?:can|do|should) i (?:mount|hang) (?:my |the )?(?:wall |upper )?cabinets?)(?: at (.+))?$/i.exec(text);
  if (cabinetBacking) {
    const height = cabinetBacking[1] ? inchesFromLength(cabinetBacking[1]) : NaN;
    return { kind: "cabinet-backing", ...(height > 0 && { height }) };
  }
  if (/^(?:(?:check|review|show|compare) (?:the |my )?(?:wall )?cabinet (?:screws?|screw (?:reach|depth|length))|will (?:the |my )?cabinet screws? (?:reach (?:the )?(?:wood|backing)|go through (?:the )?(?:wood|backing)))$/i.test(text))
    return { kind: "cabinet-screw-reach" };
  const scribe = /^(?:(?:plan|fit|add) (?:a |the )?(?:cabinet )?scribe(?: filler| strip)|how (?:do|can|should) i (?:scribe|fill) (?:the )?gap (?:beside|next to) (?:the |my )?cabinet)(?: (?:for|beside) (p\d{1,6}))?$/i.exec(text);
  if (scribe) return { kind: "scribe-filler", ...(scribe[1] && { panelLabel: labelKey(scribe[1]) }) };
  const independentGap = independentGapQuestion.exec(text);
  if (independentGap) {
    const [numerator, denominator = "1"] = independentGap[1].split("/");
    return { kind: "independent-motion", subjects: [independentGap[2], independentGap[3]], minimum: Number(numerator) / Number(denominator) };
  }
  const independent = independentMotionQuestion.exec(text);
  if (independent) return { kind: "independent-motion", subjects: [independent[1] ?? independent[3], independent[2] ?? independent[4]] };
  if (/^(?:(?:which|do any|will any) (?:of )?(?:the |my )?(?:doors(?: or drawers| and drawers)?|drawers(?: or doors| and doors)?|moving parts) (?:collide|hit each other|interfere)|(?:find|scan(?: for)?|check|review) (?:all |the |my )?(?:motion (?:pairs|interactions|collisions)|interacting motions))$/i.test(text))
    return { kind: "motion-audit" };
  if (drawerOrderQuestion.test(text)) return { kind: "drawer-opening", compareOrder: true };
  const gasket = sillGasketQuestion.exec(text);
  if (gasket) return { kind: "sill-gasket", ...(gasket[1] && { label: labelKey(gasket[1]) }) };
  if (drawerOpeningQuestion.test(text)) return { kind: "drawer-opening" };
  const stopText = normalizeIdeaText(text);
  const comparison = drawerStopComparisonQuestion.exec(stopText)?.groups;
  if (comparison) {
    const angles = parseDrawerStopAngles(comparison.after ?? comparison.before);
    const extension = comparison.length === undefined ? undefined : inchesFromLength(comparison.length);
    if (angles && angles.length > 1 && (extension === undefined || (Number.isFinite(extension) && extension > 0)))
      return { kind: "drawer-opening", stop: { angles, ...(extension !== undefined && { extension }) } };
  }
  const stop = (drawerStopQuestion.exec(stopText) ?? drawerTravelAtStopQuestion.exec(stopText))?.groups;
  if (stop) {
    const extension = stop.length === undefined ? undefined : inchesFromLength(stop.length);
    if (extension === undefined || (Number.isFinite(extension) && extension > 0))
      return { kind: "drawer-opening", stop: { angle: Number(stop.angle), ...(extension !== undefined && { extension }) } };
  }
  const pullRequest = /(?: with| and) (?:a |the )?(?:cabinet |bar )?(?:pull|handle)$/i.exec(stopText);
  const drawer = drawerQuestion.exec(pullRequest ? stopText.slice(0, pullRequest.index) : stopText)?.groups;
  if (drawer) {
    const right = drawer.bothRight ?? drawer.right;
    return { kind: "drawer-box", labels: [labelKey(drawer.first), labelKey(drawer.second)],
      ...((drawer.left || right) && { spacers: { left: Number(drawer.left ?? 0), right: Number(right ?? 0) } }),
      ...(pullRequest && { barPull: true }) };
  }
  const cabinetPull = /^(?:edit|move|reposition|add|preview) (?:the |my )?(?:cabinet (?:door )?)?(?:pulls?|handles?)(?: (?:on|for) (?<label>p\d{1,6}))?(?: (?:to )?(?<offset>.+?) from (?:the )?(?:finished )?free edge)?$/i.exec(text)?.groups;
  if (cabinetPull) {
    const inset = cabinetPull.offset && inchesFromLength(cabinetPull.offset);
    if (!cabinetPull.offset || (typeof inset === "number" && Number.isFinite(inset)))
      return { kind: "cabinet-pulls", ...(cabinetPull.label && { label: labelKey(cabinetPull.label) }),
        ...(typeof inset === "number" && { inset }) };
  }
  if (/^(?:fit|plan|size|lay out|help me fit|how (?:do|can) i fit)\b/i.test(text) &&
    /\b(?:cabinet doors?|inset doors?|doors? (?:onto|for|in|to) (?:this |the |my )?(?:cabinet|face frame))\b/i.test(text) &&
    !/\b(?:frameless|overlay|concealed|35 ?mm)\b/i.test(text)) {
    const pair = /\b(?:pair|double|(?:two|2) (?:flush |inset )?(?:cabinet )?doors)\b/i.test(text);
    const left = /\b(?:left[- ]hinged|hinge (?:on|at) (?:the )?left)\b/i.test(text);
    const right = /\b(?:right[- ]hinged|hinge (?:on|at) (?:the )?right)\b/i.test(text);
    const leaves = pair ? "pair" : left === right ? undefined : left ? "left" : "right";
    const barPull = /\b(?:with|add) (?:a |matching |vertical )*(?:bar |cabinet )?(?:pulls?|handles?)\b/i.test(text);
    return { kind: "cabinet-doors", ...(leaves && { leaves }), ...(barPull && { barPull }) };
  }
  const cabinet = drawerCabinetRequest(text);
  if (cabinet) return { kind: "drawer-cabinet", request: cabinet };
  const drywall = wallDrywallRequest(text);
  if (drywall) return { kind: "wall-drywall", request: drywall };
  if (/^(?:how|where|why|can i|should i|show|plan|check|review|seal|caulk|estimate)\b/i.test(text) &&
    /\b(?:casing|door trim)\b/i.test(text) && /\b(?:caulk(?:ing)?|seal(?:ant|ing)?)\b/i.test(text))
    return { kind: "casing-seal" };
  if (/^(?:how|where|what|can|could|should|please|show|plan|place|position|fit|review|check|add|test|install)\b/i.test(text) &&
    /\b(?:door[ -]?stop|door bumper|floor stop)\b/i.test(text) &&
    !/\b(?:greenhouse|drawer|lid|hinge pin|wall[ -]mount(?:ed)?)\b/i.test(text))
    return { kind: "floor-door-stop" };
  if (/^(?:will|would|can|could|does|where|check|review|show|fit|test)\b/i.test(text) &&
    /\b(?:door (?:knob|lever|handle|hardware)|doorknob)\b/i.test(text))
    return { kind: "door-hardware" };
  const scrap = scrapQuestion.exec(text);
  if (scrap)
    return { kind: "offcuts", label: labelKey(scrap.slice(1).find(Boolean)!) };
  const panel = panelOffcutQuestion.exec(text)?.groups;
  if (panel) return {
    kind: "panel-offcut",
    width: inchesFromLength(`${panel.width} ${panel.widthUnit ?? panel.lengthUnit}`),
    length: inchesFromLength(`${panel.length} ${panel.lengthUnit}`),
    label: labelKey(panel.label),
  };
  const mixedBoard = readBoardCutList(stopText);
  if (mixedBoard) return mixedBoard;
  const purchase = boardPurchaseQuestion.exec(stopText);
  if (purchase) {
    const count = /^(\d+)\s+(.+)$/.exec(purchase[1]);
    const repeated = count && boardSize(count[2]);
    if (repeated) return { kind: "board-stock", ...repeated, quantity: Number(count[1]) };
    const single = boardSize(purchase[1]);
    if (single) return { kind: "board-stock", ...single, quantity: 1 };
  }
  const namedStock = namedBoardOffcutQuestion.exec(text);
  const stock = namedStock ?? boardOffcutQuestion.exec(text);
  const size = stock && boardSize(normalizeIdeaText(stock[1] ?? stock[2]));
  if (size) return {
    kind: "board-offcut", ...size,
    ...(namedStock ? { offcutLabel: labelKey(namedStock[2]) } : {}),
  };
  if (onHandOffcutQuestion.test(text)) return { kind: "offcuts", onHandOnly: true };
  if (offcutQuestion.test(text) || offcutSavingsQuestion.test(text)) return { kind: "offcuts" };
  const measureOffcut = /^(?:(?:measure|remeasure) (?:(?:the |a )?usable (?:blank|area) (?:from|in|on) )?(?:offcut |scrap )?(o\d{1,6}))$/i.exec(text);
  if (measureOffcut) return { kind: "usable-offcut", label: labelKey(measureOffcut[1]) };
  const split = /^(?:split|divide) (?:offcut |scrap )?(o\d{1,6})(?: (?:into )?(?:two |2 )?(?:equal )?(?:pieces|blanks))?$/i.exec(text);
  if (split) return { kind: "offcut-split", label: labelKey(split[1]), preset: "equal" };
  const equalBlanks = /^(split|divide|rip|crosscut) (?:offcut |scrap )?(o\d{1,6}) into (\d+) (?:equal |matching )?(?:pieces|blanks|blocks|strips)$/i.exec(normalizeIdeaText(text));
  if (equalBlanks) {
    const [, verb, label, count] = equalBlanks;
    const kind = verb === "rip" || verb === "crosscut" ? verb : undefined;
    return { kind: "offcut-split", label: labelKey(label), preset: { count: Number(count), kind } };
  }
  if (doorSealQuestion.test(text)) return { kind: "greenhouse-weatherseal" };
  const windowOrder = /^(?:when (?:do|should) i (?:air[ -]seal|seal|flash) (?:the |my )?window(?: perimeter)?|(?:review|check|show) (?:the )?window (?:flashing|seal|installation) (?:order|sequence))(?: (?:at|for) (p\d{1,6}))?$/i.exec(text);
  if (windowOrder) return { kind: "window-seal-order", ...(windowOrder[1] && { sillLabel: labelKey(windowOrder[1]) }) };
  const flashing = openingFlashingQuestion.exec(text);
  if (flashing) return { kind: "opening-flashing", ...(flashing[1] && { sillLabel: labelKey(flashing[1]) }) };
  const water = wallWaterQuestion.exec(text);
  if (water) return { kind: "wall-water", ...(water[1] && { subject: water[1] }) };
  if (fittingQuestion.test(text)) return { kind: "water-fitting" };
  if (teeQuestion.test(text)) return { kind: "water-fitting", tee: true };
  if (pressureQuestion.test(text)) return { kind: "water-pressure" };
  const drywallRoughIn = /^(?:what (?:should|do) i (?:check|review) before (?:hanging|installing) drywall|(?:check|review) (?:the )?(?:water )?rough[ -]in before drywall)(?: (?:on|in|for) (.+))?$/i.exec(text);
  if (drywallRoughIn) return { kind: "rough-in-before-drywall", ...(drywallRoughIn[1] && { wall: searchName(drywallRoughIn[1]) }) };
  if (waterStopQuestion.test(text)) return { kind: "water-stop" };
  const namedSubfloor = namedSubfloorQuestion.exec(text);
  if (namedSubfloor) return { kind: "subfloor-support", panelLabel: labelKey(namedSubfloor[1]) };
  if (subfloorQuestion.test(text)) return { kind: "subfloor-support" };
  if (trimSealantQuestion.test(text)) return { kind: "trim-sealant" };
  if (backerRodQuestion.test(text)) return { kind: "backer-rod-offcuts" };
  if (/^(?:(?:how (?:can|do|should) i |plan |check |review )?(?:air[- ])?seal (?:the |a |my )?bottom plate (?:to|behind) (?:the )?drywall|(?:how (?:can|do|should) i )?(?:air[- ])?seal (?:the )?drywall to (?:the |a )?bottom plate)$/i.test(text))
    return { kind: "drywall-bottom-plate-seal" };
  if (bottomPlateQuestion.test(text)) return { kind: "bottom-plate-seal" };
  if (/^(?:(?:how (?:can|do|should) i |plan |check |review )?(?:air[ -])?seal (?:the |a |my )?top plate(?: to (?:the )?drywall)?|(?:how (?:can|do|should) i )?seal (?:the )?drywall to (?:the |a )?top plate)$/i.test(text))
    return { kind: "top-plate-seal" };
  if (rimAirSealQuestion.test(text) ||
      /^how much (?:edge )?(?:sealant|spray foam)(?: do i need)? for (?:the |my )?(?:rim[- ]joists?|band[- ]joists?|floor rims?)$/i.test(text) ||
      /^(?:can|could|should) i (?:use|reuse) (?:my |the |any )?(?:foam|rigid foam|xps) (?:offcuts|scraps) (?:for|at|on) (?:the |my )?(?:rim|rim[- ]joists?|band[- ]joists?|floor rims?)$/i.test(text))
    return { kind: "rim-air-seal" };
  if (roofValleyQuestion.test(text)) return { kind: "roof-valley" };
  const roofBlocking = roofDeckBlockingQuestion.exec(text);
  if (roofBlocking) return {
    kind: "roof-deck-blocking",
    panelLabels: roofBlocking.slice(1, 3).filter(Boolean).map(labelKey),
    reuse: !roofBlocking[3]?.toLowerCase().startsWith("new "),
  };
  if (/^(?:check|review|show) (?:the )?roof (?:deck|sheathing) (?:gaps?|spacing|backing|support|joint spacing|joint support)$/i.test(text))
    return { kind: "roof-deck-spacing" };
  if (/^(?:check|review|show) (?:the )?roof (?:deck|sheathing) (?:(?:panel )?ends?|(?:panel )?end (?:bearing|support|framing))$/i.test(text))
    return { kind: "roof-deck-ends" };
  if (floorRegisterCutoutQuestion.test(text)) return { kind: "floor-register", reuse: true };
  if (floorRegisterQuestion.test(text)) return { kind: "floor-register" };
  if (roundDuctQuestion.test(text)) return { kind: "round-duct" };
  if (roundDuctElbowQuestion.test(text)) return { kind: "round-duct-elbow" };
  if (roundDuctSealQuestion.test(text)) return { kind: "round-duct-seal" };
  if (roundDuctOffcutsQuestion.test(text)) return { kind: "round-duct-offcuts" };
  if (roofVentFlashingQuestion.test(text)) return { kind: "roof-vent-flashing" };
  if (sinkDrainQuestion.test(text)) return { kind: "sink-drain" };
  if (waterSupportQuestion.test(text)) return { kind: "water-support" };
  const framedWall = framedWallRequest(text);
  if (framedWall) return { kind: "framed-wall", request: framedWall };
  if (windowWallQuestion.test(text) ||
      (/^(?:build|frame|design|plan|make|create|add)\b/i.test(text) && /\bwall\b/i.test(text) && /\bwindows?\b/i.test(text)))
    return { kind: "window-wall", prompt: text };
  const closest = closestGapQuestion.exec(text)?.groups;
  if (closest) return {
    kind: "motion-gap",
    labels: [labelKey(closest.first), labelKey(closest.second)],
    ...(closest.testName && { testName: searchName(closest.testName) }),
  };
  const motionContact = motionContactQuestion.exec(text)?.groups;
  if (motionContact) return {
    kind: "motion-contact", subject: motionContact.subject ?? motionContact.target,
    ...(motionContact.direction && {
      direction: motionContact.direction.toLowerCase() === "opening" ? "opening" : "closing",
    }),
    ...(motionContact.testName && { testName: searchName(motionContact.testName) }),
  };
  const shorterMotion = shorterMotionQuestion.exec(text);
  if (shorterMotion) return { kind: "motion", subject: shorterMotion.slice(1).find(Boolean)!, shorter: true };
  const motionClauses = splitMotionClauses(text.replace(/^preview\s+/i, ""));
  if (motionClauses.length > 1) {
    const legs = motionClauses.map(readMotionLeg);
    if (legs.every((leg) => leg !== null)) return { kind: "motion-sequence", legs };
  } else {
    const leg = readMotionLeg(motionClauses[0]);
    if (leg && !leg.target) return { kind: "motion", subject: leg.subject, direction: leg.direction };
  }
  if (/^(?:can|could|will|do|check|review|test|show)\b/i.test(text) &&
      /\b(?:banquette|seat|storage|bench|both|two)\b/i.test(text) &&
      /\blids\b/i.test(text) && /\b(?:together|at once|at the same time|simultaneously)\b/i.test(text))
    return { kind: "seat-lid-pair" };
  const motion = motionQuestion.exec(text);
  return motion
    ? { kind: "motion", subject: motion.slice(1).find(Boolean)! }
    : null;
}

const supportScope =
  "These checks describe the modeled parts and connections. Verify the intended loads, bracing, fasteners and anchorage for the actual build.";
const motionScope =
  "The result covers modeled parts and recorded site measurements. Verify concealed hinge travel and account for any trim or handles still to be modeled.";

function supportOrder(finding: Finding) {
  const { id, area, severity } = finding;
  if (severity !== "info") {
    if (area?.kind === "panel-floor-bearing") return 0;
    if (id === "collision") return 1;
    if (
      area?.kind === "panel-bearing" ||
      area?.kind === "seat-span" ||
      area?.kind === "shelf-span" ||
      area?.kind === "rafter-eave" ||
      area?.kind === "rafter-ridge"
    )
      return 2;
    if (id === "floating") return 3;
    if (id.startsWith("furniture-frame-")) return 4;
    if (
      id === "unconnected" ||
      id === "connections" ||
      id === "connection-details" ||
      finding.restraintPlanId ||
      id.startsWith("wood-fasteners-") ||
      id.startsWith("casework-tip-up-")
    )
      return 5;
  }
  return id.startsWith("racking-") ? 6 : Infinity;
}

function answerChecks(
  project: Project,
  findings: readonly Finding[],
): BuildQuestionAnswer {
  const concerns = findings
    .filter((finding) => Number.isFinite(supportOrder(finding)))
    .sort((a, b) => supportOrder(a) - supportOrder(b));
  return {
    title: "Support and connection review",
    detail: concerns.length
      ? `Showing ${Math.min(5, concerns.length)} of ${concerns.length} modeled concerns to review before assembly.`
      : project.pieces.some(({ offcut }) => !offcut)
        ? "The current geometry checks found no listed support or connection concerns."
        : "Add or open a build to review its supports and connections.",
    rows: concerns.slice(0, 5).map(({ id, title, detail }) => ({
      id,
      title,
      detail,
      link: { label: "Inspect this check", action: { kind: "finding", id } },
    })),
    link: { label: "Open all checks", action: { kind: "checks" } },
    scope: supportScope,
  };
}

function answerWoodSupport(project: Project, label: string): BuildQuestionAnswer {
  const title = "Wood support to floor";
  const labeled = ensurePartLabels(project);
  const id = labeled.partLabels.find((part) => part.label === label)?.partId;
  const review = reviewWoodSupport(project);
  const row = id && review.get(id);
  if (!row) return { title, detail: `Use the label of a current wood part in the build. Check ${label} in the workspace.` };
  const breaks = woodSupportBreaks(review, row.piece.id);
  const names = breaks.map((stop) => `${partLabel(labeled, stop)} · ${review.get(stop)?.piece.name}`);
  return {
    title,
    detail: [
      `${label} · ${row.piece.name}.`,
      !row.geometryAvailable ? "Check the retained faces and dimensions of this part." :
        row.onFloor ? "A retained face rests on the modeled floor." :
        row.next ? "A contact path reaches the modeled floor." : "Check the contact path below this part.",
      breaks.length ? `Review the contact beneath ${names.join(", ")}.` : "",
    ].filter(Boolean).join(" "),
    scope: woodSupportScope,
    link: { label: "Open support review", action: { kind: "wood-support", id: row.piece.id } },
  };
}

function answerOffcuts(project: Project, { label, onHandOnly }: Extract<BuildQuestion, { kind: "offcuts" }>): BuildQuestionAnswer {
  const title = "Offcut matches";
  const cutPool: ReviewLink = {
    label: "Open Cut pool",
    action: { kind: "cut-pool" },
  };
  const labeled = ensurePartLabels(project);
  const id = labeled.partLabels.find((row) => row.label === label)?.partId;
  if (label && !project.pieces.some((part) => part.offcut && part.id === id))
    return {
      title,
      detail: `${label} is missing from the current Cut pool. Check its label or add the measured scrap.`,
      link: cutPool,
    };
  if (!project.pieces.some(({ offcut }) => offcut))
    return {
      title,
      detail:
        "The Cut pool is empty. Add a measured offcut or cut a part to record stock you can reuse.",
      link: cutPool,
    };
  const plan = onHandOnly ? planOnHandOffcutReuse(project) : planOffcutReuse(project, id ? [id] : undefined);
  const namedPanel = labeled.pieces.find((piece) => piece.id === id && panelOffcutEligible(piece));
  const namedOffcut = labeled.pieces.find((piece) => piece.id === id && offcutSplitOptions(piece).length);
  const splitRows = namedOffcut ? offcutSplitSuggestions(namedOffcut).map(({ id, name, detail }) => ({
    id, title: name, detail,
    link: { label: `Preview ${name.toLowerCase()}`, action: { kind: "offcut-split" as const, offcutId: namedOffcut.id, preset: id } },
  })) : [];
  if (!plan.assignments.length)
    return {
      title,
      detail: splitRows.length
        ? `${label} is available for a new cut. Preview a use below and keep both pieces in the Cut pool.`
        : namedPanel ? `No current unassigned part fits ${label}. Enter dimensions to preview a new panel from this scrap.`
          : onHandOnly ? "No on-hand offcuts fit the current unassigned parts. Check the Cut pool for measured scraps and completed stock cuts."
          : "No current unassigned part fits the selected stock. Matching considers material, thickness, grain direction and space for the saw cut.",
      ...(splitRows.length && { rows: splitRows }),
      link: namedPanel ? { label: "Plan a panel from this offcut", action: { kind: "panel-offcut", offcutId: namedPanel.id } } : cutPool,
    };
  return {
    title,
    detail: [
      `${plan.assignments.length} planned ${plan.assignments.length === 1 ? "part fits" : "parts fit"} ${label ? `stock from ${label}` : onHandOnly ? "on-hand offcuts" : "stock in the Cut pool"}.`,
      plan.shorterFirst && "Cutting shorter parts from the offcuts first reduces the number of new boards to buy.",
      plan.ripFirstMaterials.length > 0 && ripFirstReuseNote,
      "Review the cut order before applying.",
    ].filter(Boolean).join(" "),
    rows: [...plan.assignments
      .slice(0, 3)
      .map(({ partId, target, from, operations, sourceCutPending, fromEarlierCut }) => ({
        id: partId,
        title: target,
        detail: [
          `From ${from}.`,
          ...(fromEarlierCut ? ["Use the remnant from an earlier cut."] : sourceCutPending ? ["Expected after source cuts."] : []),
          operations.join(" · ") || (sourceCutPending ? "Fits at the planned size." : "Fits as measured."),
        ].join(" "),
      })), ...splitRows],
    link: {
      label: "Review cuts and stock to buy",
      action: { kind: "offcut-reuse", plan, offcutId: id, onHandOnly },
    },
  };
}

function answerPanelOffcut(project: Project, { width, length, label }: Extract<BuildQuestion, { kind: "panel-offcut" }>): BuildQuestionAnswer {
  const title = "Panel from an offcut";
  const labeled = ensurePartLabels(project);
  const id = labeled.partLabels.find((row) => row.label === label)?.partId;
  const offcut = labeled.pieces.find((piece) => piece.id === id && panelOffcutEligible(piece));
  if (!offcut) return {
    title, detail: `${label} is not available as a rectangular wood panel offcut.`,
    link: { label: "Open Cut pool", action: { kind: "cut-pool" } },
  };
  const fit = fitPanelOffcut(labeled, offcut, width, length);
  const dimension = `${formatStockLength(width)} wide and ${formatStockLength(length)} along grain`;
  return {
    title,
    detail: fit ? `${label} fits a panel ${dimension} with its recorded saw allowance.` :
      `${label} cannot supply a panel ${dimension} with the recorded grain direction and saw allowance.`,
    link: {
      label: fit ? "Review panel cuts" : "Adjust panel size",
      action: { kind: "panel-offcut", offcutId: offcut.id, width, length },
    },
  };
}

function boardMaterialGroup(nominal: string, treated: boolean) {
  return groupedMaterials("Lumber").find(({ name, id }) =>
    treated ? name.includes(nominal) && id.startsWith("treated-") :
      name.startsWith(`${nominal} `) && !id.startsWith("treated-"));
}

function answerBoardCutList(
  project: Project,
  { nominal, treated, lengths, offcutLabels, issue }: Extract<BuildQuestion, { kind: "board-cut-list" }>,
): BuildQuestionAnswer {
  const title = "Lumber cut list";
  if (issue) return { title, detail: issue };
  const group = boardMaterialGroup(nominal, treated);
  if (!group) return { title, detail: `No ${treated ? "treated " : ""}${nominal} board matches the material shelf.` };
  if (offcutLabels && offcutLabels.length > lengths.length)
    return { title, detail: "Choose at most one named offcut per finished piece." };
  const matched = offcutLabels ? findBoardCutListOffcuts(project, group, lengths, offcutLabels) : undefined;
  const named = !!offcutLabels?.length;
  const selected = named && offcutLabels
    ? offcutLabels.flatMap((label) => {
      const offcut = matched?.get(label);
      return offcut ? [offcut] : [];
    })
    : [...(matched?.values() ?? [])].sort((a, b) =>
      Number(a.source.pending) - Number(b.source.pending) ||
      Number(b.onHand) - Number(a.onHand) || b.length - a.length || a.kerf - b.kerf);
  const missing = offcutLabels?.filter((label) => !matched?.has(label)) ?? [];
  if (missing.length)
    return { title, detail: `${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no matching full-width blank for these cuts.` };
  const plan = planMixedBoardCuts(project, mixedBoardStockOptions(project, group), lengths,
    selected.slice(0, maxComparedOffcuts), named);
  if (!plan) return { title, detail: named
    ? "The cuts cannot use every named offcut with the listed stock and blade allowances. Try a smaller selection."
    : `The cut list does not fit the listed ${group.name} stock with the planned blade allowance.` };
  const labels = plan.boards.flatMap(({ source }) => source ? [source.label] : []);
  const purchases = plan.boards.length - labels.length;
  const pieces = `${lengths.length} ${lengths.length === 1 ? "piece" : "pieces"}`;
  return {
    title,
    detail: labels.length
      ? `${pieces} using ${labels.join(", ")} · ${purchases} ${purchases === 1 ? "board" : "boards"} to buy.`
      : `${pieces} from ${plan.boards.length} ${plan.boards.length === 1 ? "board" : "boards"} · ${formatStockLength(plan.purchaseLength)} of ${group.name} to buy.`,
    scope: [
      "Uses the least total length of listed new stock across the compared options, with each source’s blade allowance.",
      ...(offcutLabels && !selected.length ? ["No matching Cut pool offcuts fit these cuts."] : []),
      ...(selected.length > maxComparedOffcuts
        ? [`Considered up to ${maxComparedOffcuts} of ${selected.length} matching offcuts. Name specific offcuts to compare another selection.`] : []),
    ].join(" "),
    rows: plan.boards.map(({ length, cuts, offcut, source }, index) => ({
      id: String(index),
      title: source ? `${source.label} · ${formatStockLength(length)} from Cut pool` : `Board ${index + 1} · ${formatStockLength(length)}`,
      detail: `${cuts.map(formatStockLength).join(" + ")}${offcut > 1e-8 ? ` · ${formatStockLength(offcut)} offcut` : ""}`,
    })),
    link: { label: "Preview cut list in 3D", action: { kind: "board-cut-list", name: group.name, plan } },
  };
}

function answerBoardStock(
  project: Project,
  { nominal, treated, length, quantity }: Extract<BuildQuestion, { kind: "board-stock" }>,
): BuildQuestionAnswer {
  const title = "Stock lengths for your cuts";
  const group = boardMaterialGroup(nominal, treated);
  if (!group) return { title, detail: `No ${treated ? "treated " : ""}${nominal} board matches the material shelf.` };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxRepeatedBoards)
    return { title, detail: `Choose 1 to ${maxRepeatedBoards} pieces at the same finished length.` };
  const { options } = materialPlacementOptions(group);
  const plans = compareRepeatedBoardCuts(project, options, length, quantity);
  const [best] = plans;
  if (!best) return { title, detail: `No listed ${group.name} stock fits ${formatStockLength(length)} with the planned blade allowance.` };
  return {
    title,
    detail: `${best.boards.length} × ${best.label} makes ${quantity} ${quantity === 1 ? "piece" : "pieces"} at ${formatStockLength(length)} from ${formatStockLength(best.purchaseLength)} of ${group.name}.`,
    scope: "Compares new boards of a single stock length and accounts for the planned blade loss.",
    rows: plans.map((plan) => ({
      id: plan.id,
      title: `${plan.boards.length} × ${plan.label}`,
      detail: `${formatStockLength(plan.purchaseLength)} of stock · pieces per board ${plan.boards.map(({ count }) => count).join(", ")}`,
      link: { label: `Preview ${plan.label} stock`, action: { kind: "board-placement", groupId: group.id,
        length, quantity, stock: plan.id } },
    })),
  };
}

function answerBoardOffcut(
  project: Project,
  question: Extract<BuildQuestion, { kind: "board-offcut" }>,
): BuildQuestionAnswer {
  const { nominal, treated, length, offcutLabel } = question;
  const title = "Offcut for a finished board";
  const group = boardMaterialGroup(nominal, treated);
  if (!group) return {
    title,
    detail: `No ${treated ? "treated " : ""}${nominal} board matches the material shelf. Check the nominal size and treatment.`,
    link: { label: "Open Cut pool", action: { kind: "cut-pool" } },
  };
  const labeled = ensurePartLabels(project);
  const matches = fittingBoardOffcuts(labeled, materialFamilyVariants(group.preferred), length, inspectCutStock(labeled));
  const needed = `${formatStockLength(length)} of ${group.name}`;
  const namedId = offcutLabel && labeled.partLabels.find(({ label }) => label === offcutLabel)?.partId;
  const available = offcutLabel ? matches.filter(({ piece }) => piece.id === namedId) : matches;
  if (offcutLabel && !available.length) return {
    title,
    detail: labeled.pieces.some(({ id, offcut }) => offcut && id === namedId)
      ? `${offcutLabel} cannot supply ${needed}. Check the material, grain and room for the saw cut.`
      : `${offcutLabel} is no longer available in the Cut pool.`,
    link: { label: "Open Cut pool", action: { kind: "cut-pool" } },
  };
  const [first] = available;
  return {
    title,
    detail: !first ? `No recorded offcut fits ${needed}. Review new stock lengths for this board.`
      : available.length === 1 ? `${partLabel(labeled, first.piece.id)} fits ${needed}.`
      : `${available.length} offcuts fit ${needed}. Review the choices before placing the board.`,
    rows: available.slice(0, 3).map((remnant) => ({
      id: remnant.piece.id,
      title: `${partLabel(labeled, remnant.piece.id)} · ${formatStockLength(remnant.available[2])}`,
      detail: [remnant.sourceCutPending && "Complete the cuts that produce this offcut first.",
        remnant.operations.length ? remnant.operations.map(({ text }) => text).join(" · ")
          : remnant.sourceCutPending ? "Fits at the planned size." : "Fits as measured."].filter(Boolean).join(" "),
    })),
    link: { label: "Review board placement", action: {
      kind: "board-placement", groupId: group.id, length,
      ...(namedId ? { offcutId: namedId } : {}),
    } },
  };
}

function motionRows(project: Project, plan: MotionPlan, shorter?: true): ReviewRow[] {
  const { baseline, saved, scenarios } = reviewMotionTests(project, plan);
  const tests = [
    {
      id: "baseline",
      variant: "baseline" as const,
      title: "Motion alone",
      result: baseline,
      setup: undefined,
      scenarioId: undefined,
    },
    ...(saved
      ? [
          {
            id: "saved",
            variant: "saved" as const,
            title: "Saved setup",
            result: saved,
            setup: plan.testSetup,
            scenarioId: undefined,
          },
        ]
      : []),
    ...scenarios.map(({ id, name, result, setup }) => ({
      id,
      variant: "saved" as const,
      title: name,
      result,
      setup,
      scenarioId: id,
    })),
  ];
  return tests.flatMap(({ id, variant, title, result, setup, scenarioId }): ReviewRow[] => {
    const findings = motionTestFindings(project, result, true);
    const first = findings.find(({ gapStatus }) => gapStatus !== "met") ?? findings[0];
    const { review } = result;
    const travel = review && motionReviewTargets(review)
      .map(({ plan: member, travel }) =>
        `${member.label}${review.sequence ? " at" : ""} ${motionTargetDistance(travel, member.mechanism.kind)}`,
      )
      .join(review.sequence ? ", then " : " with ");
    const held = review
      ? resolveMotionTestSetup(project, setup).held.map(
          ({ plan: member, travel }) =>
            `${member.label} held at ${motionDistance(travel, member.mechanism.kind)}`,
        )
      : [];
    const obstruction =
      review?.hits[0] &&
      project.pieces.find(({ id }) => id === review.hits[0].obstacleId);
    const row: ReviewRow = {
      id,
      title,
      detail: [
        first.detail,
        ...(obstruction ? [`Obstruction · ${obstruction.name}.`] : []),
        ...(review
          ? [`Travel tested · ${[travel, ...held].join(" · ")}.`]
          : []),
        ...(findings.length > 1
          ? [`${findings.length - 1} more test details.`]
          : []),
      ].join(" "),
      link: {
        label: "Inspect this motion",
        action: {
          kind: "motion",
          planId: plan.id,
          variant,
          findingId: first.id,
          scenarioId,
        },
      },
    };
    const trial = shorter && review ? shorterMotionTrial(project, review, setup) : undefined;
    return trial ? [row, {
      id: `${id}/shorter`,
      title: `${title} · Shorter travel`,
      detail: `${trial.targets} cleared the modeled opening and closing paths.`,
      link: { label: "Try this travel", action: { kind: "shorter-motion", planId: plan.id, variant, scenarioId } },
    }] : [row];
  });
}

function directionalMotionRow(
  project: Project, plan: MotionPlan, direction: MotionDirection, setup?: MotionTestSetup, name?: string,
  contactRequest?: {
    context: string;
    result: ReturnType<typeof runMotionTest>;
    scenarioId?: string;
    savedSetup?: true;
  },
): ReviewRow {
  const opening = direction === "opening";
  const path = opening ? "Opening path" : "Closing path";
  const title = contactRequest ? `${path} · ${contactRequest.context}` : path;
  const { review, error } = contactRequest?.result ?? runMotionTest(project, plan, setup);
  if (!review) return { id: direction, title, detail: error };
  const stop = motionDirectionLimit(review, direction);
  const paused = stop.inspectAt !== undefined;
  const unverified = review.unresolvedIds.length > 0;
  const endpoint = review.sequence
    ? opening ? "both requested opening positions" : "both closed positions"
    : motionDistance(stop.travel, plan.mechanism.kind);
  const detail = paused
    ? motionStopLine(project, review, opening ? "Opening" : "Closing", stop, (id) =>
      `${partLabel(project, id)} · ${project.pieces.find((piece) => piece.id === id)?.name ?? "Missing part"}`)
    : !unverified ? `Modeled path clears to ${endpoint}.` : "";
  const marks = contactRequest && review.contactApproach(stop);
  const approach = marks && stop.contact && `Approach at ${motionReviewDistance(review, marks.travel, stop.phase)}. ${motionApproachMarksLine(project, [stop.contact.movingId, stop.contact.obstacleId], marks.localMarks)}`;
  return {
    id: direction,
    title,
    detail: [detail, approach, ...(unverified ? ["Some part profiles could not be checked."] : [])].filter(Boolean).join(" "),
    ...(paused || !unverified ? { link: {
      label: approach ? `Show ${direction} approach` : paused ? `Inspect ${direction} stop` : opening ? "Preview open" : "Preview closed",
      action: { kind: "motion-direction", planId: plan.id, direction, setup, name,
        ...(contactRequest?.scenarioId && { scenarioId: contactRequest.scenarioId }),
        ...(contactRequest?.savedSetup && { savedSetup: true }),
        ...(approach && { approach: true }),
      },
    } } : {}),
  };
}

function answerMotionContactRows(
  project: Project, plan: MotionPlan, { direction, testName }: Extract<BuildQuestion, { kind: "motion-contact" }>,
): ReviewRow[] {
  const scenarios = testName ? (plan.testScenarios ?? []).filter(({ name }) => searchName(name) === testName) : [];
  if (testName && scenarios.length !== 1) return [{
    id: plan.id, title: "Named test",
    detail: scenarios.length ? `Several tests for ${plan.label} match “${testName}”. Use a distinct test name.`
      : `No named test “${testName}” is saved for ${plan.label}.`,
  }];
  const scenario = scenarios[0];
  const setup = scenario?.setup ?? plan.testSetup;
  const context = scenario?.name ?? (setup ? "Saved test setup" : "Motion alone");
  const result = runMotionTest(project, plan, setup);
  const directions: MotionDirection[] = direction ? [direction] : ["opening", "closing"];
  return directions.map((mode) => directionalMotionRow(project, plan, mode, setup,
    scenario?.name ?? `${plan.label} · ${context}`, {
      context, result, scenarioId: scenario?.id, ...(!scenario && setup ? { savedSetup: true } : {}),
    }));
}

function answerMotion(project: Project, question: Extract<BuildQuestion, { kind: "motion" | "motion-contact" }>): BuildQuestionAnswer {
  const { subject, direction } = question;
  const contact = question.kind === "motion-contact";
  const title = contact ? "Where movement meets an obstruction" : "Modeled motion review";
  const name = searchName(subject);
  const labeled = ensurePartLabels(project);
  const pieces = new Map(
    labeled.pieces
      .filter(({ offcut }) => !offcut)
      .map((part) => [part.id, part.name]),
  );
  const labels = new Map(
    labeled.partLabels.map(({ partId, label }) => [partId, label]),
  );
  const partNames = (ids: string[]) =>
    ids.flatMap((id) =>
      pieces.has(id) ? [pieces.get(id)!, labels.get(id)!] : [],
    );
  const candidates = [
    ...(project.motionPlans ?? []).map((plan) => ({
      name: plan.label,
      names: [plan.label, ...partNames(plan.memberIds)],
      rows: () => contact ? answerMotionContactRows(project, plan, question)
        : direction ? [directionalMotionRow(project, plan, direction)] : motionRows(project, plan, question.shorter),
    })),
    ...project.sections
      .filter((section) => !direction && !contact && section.recipe?.openingLid)
      .map((section) => ({
        name: `${section.name} lid`,
        names: [
          section.name,
          `${section.name} lid`,
          ...partNames(
            section.pieceIds.filter((id) =>
              /\blid\b/i.test(pieces.get(id) ?? ""),
            ),
          ),
        ],
        rows: (): ReviewRow[] => {
          const { review, findings } = inspectLidTravel(project, section.id);
          const first = findings[0];
          return [
            {
              id: section.id,
              title: `${section.name} lid`,
              detail: first
                ? `${first.detail}${findings.length > 1 ? ` ${findings.length - 1} more test details.` : ""}`
                : `No modeled lid travel findings through ${motionDistance(review!.travel, "hinge")}.`,
              link: {
                label: "Inspect lid travel",
                action: {
                  kind: "lid",
                  sectionId: section.id,
                  findingId: first?.id ?? "clear",
                },
              },
            },
          ];
        },
      })),
  ];
  const exact = candidates.filter(({ names }) =>
    names.some(
      (value) => searchName(value) === name || value === labelKey(name),
    ),
  );
  const words = name.split(/\s+/);
  const matches = exact.length
    ? exact
    : candidates.filter(({ names }) =>
        words.every((word) =>
          names.some((candidate) =>
            searchName(candidate)
              .split(/[\s·–-]+/)
              .includes(word),
          ),
        ),
      );
  if (matches.length === 1)
    return {
      title,
      detail: direction && !contact ? `${matches[0].name} · Other parts stay in their saved positions.` : matches[0].name,
      rows: matches[0].rows(),
      scope: motionScope,
    };
  if (matches.length > 1)
    return {
      title,
      detail: `Several motions match “${subject}”. Use the exact name or part label. ${matches.map(({ name }) => name).join(", ")}.`,
    };
  return {
    title,
    detail: `There is no matching motion for “${subject}”. Use a saved motion's name or set up the moving parts first.`,
    link: { label: "Open movement setup", action: { kind: "motion-setup" } },
  };
}

function lookupMotionPairs(project: Project, subjects: [string, string]) {
  const labeled = ensurePartLabels(project);
  const labels = new Map(labeled.partLabels.map(({ partId, label }) => [partId, label]));
  const names = new Map(project.pieces.filter(({ offcut }) => !offcut).map(({ id, name }) => [id, name]));
  const candidates = (project.motionPlans ?? []).map((plan) => ({
    plan,
    names: [plan.label, ...plan.memberIds.flatMap((id) => names.has(id) ? [names.get(id)!, labels.get(id) ?? ""] : [])],
  }));
  const lookup = (subject: string) => {
    const name = searchName(subject);
    const exact = candidates.filter(({ names }) => names.some((value) =>
      searchName(value) === name || value === labelKey(name)));
    if (exact.length || subject.includes('"') || partNumber.test(name)) return exact;
    const term = name.replace(/^cabinet (door|drawer)$/, "$1");
    return candidates.filter(({ names }) => names.some((value) =>
      term.split(/\s+/).every((word) => searchName(value).split(/[\s·–-]+/).includes(word))));
  };
  const [first, second] = subjects.map(lookup);
  const pairs = first.flatMap(({ plan: selected }) => second.flatMap(({ plan: companion }) =>
    canParkMotion(project, selected, companion) && canParkMotion(project, companion, selected) ? [{ selected, companion }] : [],
  ));
  return { pairs, labels };
}

function answerMotionSequence(project: Project, legs: MotionRequestLeg[]): BuildQuestionAnswer {
  const title = "Ordered motion review";
  const [first, second] = legs;
  if (legs.length !== 2 || first.direction !== second.direction)
    return { title, detail: "Enter two opening moves or two closing moves to check their order." };
  const { pairs } = lookupMotionPairs(project, [first.subject, second.subject]);
  if (!pairs.length) return {
    title,
    detail: "Choose two saved motions with separate moving parts. Use their exact names or part labels.",
    link: { label: "Open movement setup", action: { kind: "motion-setup" } },
  };
  if (pairs.length > 1) return {
    title,
    detail: `Several pairs match “${first.subject}” and “${second.subject}”. Use two exact motion names in quotes or their part labels.`,
  };
  const [{ selected, companion }] = pairs;
  for (const [leg, motion] of [[first, selected], [second, companion]] as const) {
    const { target } = leg;
    if (target && (target.kind !== motion.mechanism.kind || !Number.isFinite(target.travel) ||
      target.travel <= 0 || target.travel > motion.mechanism.travel)) {
      const limit = motionDistance(motion.mechanism.travel, motion.mechanism.kind);
      return { title, detail: `Choose a positive ${motion.mechanism.kind === "hinge" ? "angle" : "extension"} for ${motion.label} up to its saved limit of ${limit}.` };
    }
  }
  const opening = first.direction === "opening";
  const setup: MotionTestSetup = {
    linkedId: companion.id,
    held: [],
    openingOrder: opening ? "selected-first" : "companion-first",
    ...(first.target || second.target ? { sequenceTargets: { selected: first.target, companion: second.target } } : {}),
  };
  const requested = ([ [first, selected], [second, companion] ] as const).map(([leg, motion]) =>
    `${motion.label} ${opening ? "to" : "from"} ${motionTargetDistance(leg.target?.travel ?? motion.mechanism.travel, motion.mechanism.kind)}`);
  return {
    title,
    detail: `${requested.join(", then ")}. Other parts stay in their saved positions.`,
    rows: [directionalMotionRow(project, selected, first.direction, setup,
      `${opening ? "Opening" : "Closing"} · ${selected.label} → ${companion.label}`)],
    scope: motionScope,
  };
}

function answerIndependentMotion(project: Project, { subjects, minimum }: Extract<BuildQuestion, { kind: "independent-motion" }>): BuildQuestionAnswer {
  const title = minimum === undefined ? "Contact at different openings" : "Minimum gap at different openings";
  if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0.001 || minimum > 24))
    return { title, detail: "Enter a minimum gap from 0.001 to 24 inches." };
  const { pairs, labels } = lookupMotionPairs(project, subjects);
  const setupLink: ReviewLink = { label: "Open movement tests", action: { kind: "motion-setup" } };
  if (!pairs.length) return {
    title, detail: "I need two saved motions with separate moving parts. Use their exact motion names or the part labels shown in the workspace.", link: setupLink,
  };
  if (pairs.length > 1) return {
    title,
    detail: `More than one pair matches “${subjects[0]}” and “${subjects[1]}”. Ask again with two exact motion names in quotes or use their part labels.`,
    rows: pairs.slice(0, 8).map(({ selected, companion }) => ({
      id: `${selected.id}/${companion.id}`, title: `${selected.label} + ${companion.label}`,
      detail: `${selected.memberIds.map((id) => labels.get(id)).join(", ")} / ${companion.memberIds.map((id) => labels.get(id)).join(", ")}`,
    })),
  };
  const [{ selected, companion }] = pairs;
  const scope = minimum === undefined
    ? "This checks the two moving groups across their saved travel. Opening order suggestions also check the other modeled parts and site measurements."
    : "The gap check covers the two moving groups across their saved travel. Suggested orders check the reported pair's gap, plus other modeled obstructions and site measurements.";
  try {
    const contact = independentlyMovingContact(project, selected, companion, undefined, minimum);
    if (!("movingId" in contact)) return {
      title, scope,
      detail: contact.status === "clear"
        ? `${selected.label} and ${companion.label} ${minimum === undefined ? "clear each other" : `keep the ${formatPreciseInches(minimum)} minimum gap`} throughout their modeled travel ranges.`
        : `Some combinations of ${selected.label} and ${companion.label} are too close for the search to verify.`,
      link: { label: "Open motion scan", action: { kind: "motion-setup", audit: true } },
    };
    const setup = interactionSetup(companion);
    if ("minimum" in contact)
      setup.clearance = { movingId: contact.movingId, otherId: contact.obstacleId, minimum: contact.minimum };
    const alternatives = motionOpeningOrders.filter((order) => trialMotionOpeningOrder(project, selected, setup, order).clear);
    const description = contact.status === "short"
      ? `Modeled gap ${formatPreciseInches(contact.gap)}, below the required ${formatPreciseInches(contact.minimum)},`
      : contact.status === "envelope-gap" ? "Possible gap shortfall at an exterior envelope"
        : contact.status === "solid" ? "Modeled contact" : "Possible contact";
    return {
      title, scope,
      detail: `${description} with ${selected.label} at ${motionDistance(contact.selectedTravel, selected.mechanism.kind)} and ${companion.label} at ${motionDistance(contact.companionTravel, companion.mechanism.kind)}.`,
      ...(alternatives.length ? { rows: [{ id: "clear-orders", title: minimum === undefined ? "Modeled paths that clear" : "Paths that meet this pair’s gap", detail:
        alternatives.map((order) => order ? motionOrderLabel(selected.label, companion.label, order)
          : "Move together at the same percentage of travel").join(" · ") }] } : {}),
      link: { label: minimum === undefined ? "Inspect contact" : "Inspect gap", action: {
        kind: "independent-motion", selectedId: selected.id, companionId: companion.id, ...(minimum !== undefined && { minimum }),
      } },
    };
  } catch (problem) {
    return { title, detail: problem instanceof Error ? problem.message : "Review the moving parts and their saved travel.", link: setupLink };
  }
}

function answerMotionGap(project: Project, { labels, testName }: Extract<BuildQuestion, { kind: "motion-gap" }>): BuildQuestionAnswer {
  const title = "Closest gap through movement";
  const labeled = ensurePartLabels(project);
  const ids = new Map(labeled.partLabels.map(({ label, partId }) => [label, partId]));
  const parts = labels.map((label) => labeled.pieces.find(({ id, offcut }) => !offcut && id === ids.get(label)));
  const [first, second] = parts;
  if (!first || !second || first.id === second.id)
    return { title, detail: "Choose two different part labels from the current model, such as P003 and P009." };

  const plans = project.motionPlans ?? [];
  const options = plans.flatMap((plan) => {
    const variants = [{ setup: plan.testSetup, name: plan.label, id: undefined }, ...(plan.testScenarios ?? [])];
    return variants.flatMap((variant) => {
      const linked = plans.find(({ id }) => id === variant.setup?.linkedId);
      const active = new Set([...plan.memberIds, ...(linked?.memberIds ?? [])]);
      const moving = active.has(first.id) ? first : active.has(second.id) ? second : undefined;
      if (!moving) return [];
      return [{
        plan, linked, variant,
        bothMove: active.has(first.id) && active.has(second.id),
        pair: { movingId: moving.id, otherId: moving.id === first.id ? second.id : first.id },
      }];
    });
  });
  const nameMatches = options.filter(({ variant }) => testName && searchName(variant.name) === testName);
  const candidates = testName
    ? (nameMatches.length ? nameMatches : options.filter(({ plan }) => searchName(plan.label) === testName))
    : options.sort((a, b) => Number(b.bothMove) - Number(a.bothMove));
  if (!candidates.length)
    return {
      title,
      detail: testName ? `No motion or named test matching “${testName}” moves either of these parts.`
        : "Save a movement for one of these parts first.",
      link: { label: "Open movement setup", action: { kind: "motion-setup" } },
    };

  const rows: ReviewRow[] = candidates.map(({ plan, linked, variant, pair }) => {
    const order = variant.setup?.openingOrder;
    const path = linked
      ? order === "companion-first" ? `${linked.label}, then ${plan.label}`
        : order === "selected-first" ? `${plan.label}, then ${linked.label}`
        : `${plan.label} and ${linked.label} together`
      : plan.label;
    return {
      id: variant.id ?? plan.id,
      title: variant.id ? `${variant.name} · ${plan.label}` : path,
      detail: variant.id ? `Uses the travel and held positions from this test. ${path}.`
        : variant.setup ? "Uses the saved movement setup." : "Uses the full saved travel.",
      link: { label: "Measure this gap", action: { kind: "motion-gap", planId: plan.id, scenarioId: variant.id, pair } },
    };
  });
  return {
    title,
    detail: `Measure the gap between ${labels[0]} · ${first.name} and ${labels[1]} · ${second.name}.`,
    rows: rows.slice(0, 12),
  };
}

function answerDriverClearance(
  project: Project,
  { planLabel, locationLabel, coverLabel }: Extract<BuildQuestion, { kind: "driver-clearance" }>,
): BuildQuestionAnswer {
  const title = "Driver clearance";
  const plans = project.fastenerPlans.filter(({ label }) => !planLabel || label === planLabel);
  if (!plans.length) return planLabel
    ? { title, detail: `Screw plan ${planLabel} is missing from this build. Check the W-label in the screw editor.` }
    : { title, detail: "Record a wood-screw plan and measure your bit and driver to check the approach.",
        link: { label: "Open screw plans", action: { kind: "driver-approach" } } };
  const location = locationLabel && plans[0].locations.find(({ label }) => label === locationLabel);
  if (locationLabel && !location) return {
    title, detail: `Screw location ${planLabel}/${locationLabel} is missing. Check the F-labels in this screw plan.`,
    link: { label: "Open screw plan", action: { kind: "driver-approach", planId: plans[0].id } },
  };
  const coverId = coverLabel
    ? ensurePartLabels(project).partLabels.find(({ label }) => label === coverLabel)?.partId
    : undefined;
  const cover = project.pieces.find(({ id, offcut }) => id === coverId && !offcut);
  if (coverLabel && !cover) return { title, detail: `Choose an active part. ${coverLabel} is missing from the build.` };
  const planIds = new Set(plans.map(({ id }) => id));
  const tested = plans.some(({ driverAccess, locations }) => driverAccess && locations.length)
    ? reviewDriverAccess(project, fastenerReviews(project).filter(({ plan }) => planIds.has(plan.id)))
    : [];
  const priority = { blocked: 0, pending: 1, "before-stage": 2, "within-stage": 3, clear: 4 };
  const results = tested.flatMap(({ review, locations }) =>
    locations.map((row) => ({ planId: review.plan.id, row })),
  ).filter(({ row }) => (!location || row.id === location.id) && (!cover || row.blockerIds.includes(cover.id)))
    .sort((a, b) => priority[a.row.state] - priority[b.row.state]);
  const rows: ReviewRow[] = results.map(({ planId, row }) => ({
    id: `${planId}/${row.id}`,
    title: `${row.label} · ${driverAccessStateName[row.state]}`,
    detail: `${driverAccessOrderName[row.order]} · ${row.detail}`,
    link: {
      label: row.envelopes.length ? `Show approach for ${row.label}` : `Open ${row.label}`,
      action: { kind: "driver-approach", planId, locationId: row.id },
    },
  }));
  const missing = plans.filter(({ driverAccess, locations }) => !driverAccess || !locations.length);
  const pending = tested.reduce((n, { locations }) => n + locations.filter(({ state }) => state === "pending").length, 0);
  if (!cover) for (const plan of missing) {
    rows.push({
      id: plan.id,
      title: `${plan.label} · ${plan.name}`,
      detail: plan.locations.length
        ? "Save measured bit and tool dimensions to check the approach."
        : "Record a screw location to check its tool approach.",
      link: { label: `Open ${plan.label}`, action: {
        kind: "driver-approach", planId: plan.id, ...(location && { locationId: location.id }),
      } },
    });
  }
  let detail = results.length
    ? "Review the tool path and assembly timing for these screw locations."
    : "Record locations and save measured tool dimensions to check driver clearance.";
  if (cover) {
    const subject = results.length === 0 ? "No checked approach meets"
      : results.length === 1 ? "1 measured approach meets"
        : `${results.length} measured approaches meet`;
    detail = `${subject} ${coverLabel} · ${cover.name}.`;
    if (missing.length || pending) detail += " Some screw paths or tool dimensions still need review.";
  }
  return {
    title,
    detail: detail + (rows.length > 12 ? " Showing the first 12. Ask about a W-label to narrow the list." : ""),
    rows: rows.slice(0, 12),
    scope: driverAccessScope,
  };
}

export function answerBuildQuestion(
  project: Project,
  question: BuildQuestion,
  findings: readonly Finding[],
  selectedSectionId?: string | null,
): BuildQuestionAnswer {
  switch (question.kind) {
    case "driver-clearance":
      return answerDriverClearance(project, question);
    case "part-offcuts": {
      const title = `Offcuts for ${question.label}`;
      const labeled = ensurePartLabels(project);
      const id = labeled.partLabels.find(({ label }) => label === question.label)?.partId;
      const part = labeled.pieces.find((piece) => piece.id === id && !piece.offcut);
      if (!part) return { title, detail: "Choose the P-label of a part currently in the workspace." };
      if (part.cutStock) return { title, detail: `${part.name} already has a recorded stock source.` };
      const options = partOffcutOptions(project, part);
      return {
        title,
        detail: options.length ? `Compare fitting remnants for ${part.name}.`
          : `No matching offcut fits ${part.name} with its current dimensions and cutting allowance.`,
        rows: options.slice(0, 8).map((match) => ({
          id: match.piece.id,
          title: `${partLabel(labeled, match.piece.id)} · ${match.piece.name}`,
          detail: [
            match.operations.map(({ text }) => text).join(" · ") || "Fits at the recorded size",
            match.sourceCutPending ? "Expected after source cuts" : match.onHand ? "On hand" : "",
          ].filter(Boolean).join(" · "),
          link: { label: "Review this offcut", action: { kind: "part-offcuts", id: part.id, offcutId: match.piece.id } },
        })),
      };
    }
    case "part-elevation": {
      const title = `Set the bottom height of ${question.label}`;
      if (!Number.isFinite(question.height) || question.height < 0 || question.height > 12000)
        return { title, detail: `Enter a height in feet or inches, as in “Set the bottom of ${question.label} to 2 ft.”` };
      const labeled = ensurePartLabels(project);
      const id = labeled.partLabels.find(({ label }) => label === question.label)?.partId;
      const piece = labeled.pieces.find((row) => row.id === id && !row.offcut);
      if (!piece) return { title, detail: "Choose the P-label of a part currently in the workspace." };
      try {
        const trial = previewPartElevation(project, piece, question.height);
        const height = formatStockLength(trial.bottom);
        const detail = trial.stop
          ? `${trial.stop} with the bottom at ${height} above the floor. Requested ${formatStockLength(trial.requested)}.`
          : `${piece.name} ${trial.changed ? "would move to" : "is already at"} ${height} above the floor, measured to its underside.`;
        return {
          title, detail,
          ...((trial.changed || trial.stop) && { link: {
            label: "Review height in 3D",
            action: { kind: "part-elevation", id: piece.id, height: question.height },
          } }),
        };
      } catch (error) {
        return { title, detail: error instanceof Error ? error.message : "Check the part before setting its height." };
      }
    }
    case "usable-offcut": {
      const labeled = ensurePartLabels(project);
      const id = labeled.partLabels.find(({ label }) => label === question.label)?.partId;
      const pending = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
      const piece = labeled.pieces.find((row) => row.id === id && usableOffcutEligible(row, pending));
      return {
        title: `Measure usable blank from ${question.label}`,
        detail: piece ? "Record the corners of the usable area so future parts fit the actual scrap."
          : "Choose a current rectangular wood or drywall offcut you have already cut.",
        link: piece ? { label: "Open offcut measurement", action: { kind: "usable-offcut", offcutId: piece.id } }
          : { label: "Open Cut pool", action: { kind: "cut-pool" } },
      };
    }
    case "offcut-split": {
      const labeled = ensurePartLabels(project);
      const id = labeled.partLabels.find(({ label }) => label === question.label)?.partId;
      const repeated = typeof question.preset === "object" ? question.preset : undefined;
      const piece = labeled.pieces.find((piece) => piece.id === id &&
        offcutSplitOptions(piece).some(({ kind }) => !repeated?.kind || repeated.kind === kind));
      return {
        title: `Split ${question.label}`,
        detail: piece ? repeated ? "Preview the equal blank sizes and cut order using the saved saw allowance."
          : "Choose dimensions and preview both pieces with the saved saw allowance."
          : "Choose the label of a rectangular wood offcut in the Cut pool.",
        link: piece ? { label: "Open offcut split", action: { kind: "offcut-split", offcutId: piece.id, preset: question.preset } }
          : { label: "Open Cut pool", action: { kind: "cut-pool" } },
      };
    }
    case "checks":
      return answerChecks(project, findings);
    case "wood-support":
      return answerWoodSupport(project, question.label);
    case "shelf-divider": {
      const shelves = reviewPanelBearing(project).filter(({ piece, role }) => role === "shelf" &&
        (!question.label || partLabel(project, piece.id) === question.label));
      return {
        title: "Compare shelf divider positions",
        detail: shelves.length ? "Open a shelf to compare support positions using its saved sag estimate, nearby parts and movement tests."
          : "Choose the label of a level rectangular shelf on continuous supports.",
        rows: shelves.slice(0, 12).map((row) => {
          const { id, name } = row.piece;
          const plan = project.shelfSagPlans?.find(({ pieceId }) => pieceId === id);
          return { id, title: `${partLabel(project, id)} · ${name}`,
            detail: plan ? shelfSagSummary(reviewShelfSag(row, plan), plan.target) : shelfSagGeometry(row)
              ? "Enter the distributed weight and panel stiffness before fitting a divider."
              : "A rectangular shelf and continuous full-depth end supports are needed for this estimate.",
            link: { label: "Open shelf support", action: { kind: "shelf-divider" as const, id } } };
        }),
      };
    }
    case "installation-route": {
      const available = installationRouteTargets(project).length > 0;
      return {
        title: "Test the installation route",
        detail: available ? "Choose an assembled section, enter the starting pose and turn locations, then review the moves toward its final position."
          : "Group the parts you carry together into a section, then test the modeled opening and turn space.",
        ...(available && { link: { label: "Open installation routes", action: { kind: "installation-route" } } }),
        rows: (project.installationRoutes ?? []).map((plan) => ({ id: plan.id, title: plan.name,
          detail: reviewInstallationRoute(project, plan).detail,
          link: { label: "Open saved installation route", action: { kind: "installation-route", routeId: plan.id } } })),
      };
    }
    case "drawer-balance": {
      const choices = drawerBalanceCabinets(project);
      const active = choices.find(({ section }) => section.id === selectedSectionId);
      return {
        title: "Compare drawer balance",
        detail: choices.length ? "Compare the estimated balance point with one drawer or several drawers extended."
          : "Save drawer slides with both mounts in the same fixed cabinet section to begin the comparison.",
        ...(choices.length && { link: { label: "Open drawer balance", action: { kind: "drawer-balance", sectionId: active?.section.id } } }),
      };
    }
    case "casing-seal": {
      const choices = project.sections.filter(({ doorCasing }) => doorCasing);
      const selected = choices.filter(({ id, doorCasing }) => id === selectedSectionId || doorCasing?.wallId === selectedSectionId);
      const reviews = new Map(casingSealReviews(project).map((row) => [row.section.id, row]));
      return {
        title: "Casing finish seal",
        detail: choices.length ? "Review the outer edge of each trim piece where it meets drywall."
          : "Fit the casing and drywall before measuring the finish seam.",
        rows: (selected.length ? selected : choices).map(({ id, name }) => {
          const review = reviews.get(id);
          const estimate = review?.estimate;
          return {
            id, title: name,
            detail: review?.issue ?? (estimate
              ? `${formatPreciseInches(estimate.lengthInches)} of marked seam · ${estimate.cartridges} ${estimate.cartridges === 1 ? "cartridge" : "cartridges"} before sharing with other trim.`
              : "Measure the gap and mark the spans to leave open."),
            link: { label: "Open casing seal", action: { kind: "casing-seal", sectionId: id } },
          };
        }),
      };
    }
    case "seat-lid-pair": {
      const lids = project.sections.filter(({ recipe }) => recipe?.openingLid);
      const main = lids.find(({ id }) => id === selectedSectionId) ?? lids[0];
      const other = lids.find(({ id }) => id !== main?.id);
      return {
        title: "Storage lids opening together",
        detail: main && other ? "Choose the two lids and review their opening and closing paths together."
          : "Add two storage seats with opening lids to set up a paired test.",
        rows: main && other ? [{
          id: main.id,
          title: `${main.name} and ${other.name}`,
          detail: "You can change the two lids before saving the test.",
          link: { label: "Set up paired lid test", action: {
            kind: "seat-lid-pair", sectionId: main.id, companionSectionId: other.id,
          } },
        }] : [],
      };
    }
    case "floor-door-stop": {
      const walls = project.sections.filter(({ generator }) => generator?.doorUnit);
      const selected = project.sections.find(({ id }) => id === selectedSectionId);
      const wallId = selected?.doorFloorStop?.wallId ?? selected?.doorCasing?.wallId ?? selected?.wallDrywall?.wallId ?? selectedSectionId;
      const target = walls.find(({ id }) => id === wallId);
      return {
        title: "Floor door stop placement",
        detail: walls.length ? "Compare the current door swing with a measured floor stop and get a floor mark."
          : "Fit an interior door and hinge to preview a floor-mounted stop.",
        rows: (target ? [target] : walls).map(({ id, name }) => {
          const saved = project.sections.find(({ doorFloorStop }) => doorFloorStop?.wallId === id);
          const review = saved && reviewFloorStop(project, saved);
          return {
            id, title: name,
            detail: review?.issue ?? (review && "result" in review ? review.result :
              "Measure the stop and choose the angle you want the door to open."),
            link: { label: "Open the floor stop planner", action: { kind: "floor-door-stop", sectionId: id } },
          };
        }),
      };
    }
    case "door-hardware": {
      const walls = project.sections.filter(({ generator }) => generator?.doorUnit);
      const selected = project.sections.find(({ id }) => id === selectedSectionId);
      const wallId = selected?.doorCasing?.wallId ?? selected?.wallDrywall?.wallId ?? selectedSectionId;
      const target = walls.find(({ id }) => id === wallId);
      return {
        title: "Door hardware clearance",
        detail: walls.length ? "Check the knob or lever against the wall and nearby objects through the swing."
          : "Fit an interior door and hinge before reviewing its hardware clearance.",
        rows: (target ? [target] : walls).map((wall) => {
          const swing = wall.generator?.doorUnit?.hardware ? casingSwing(project, wall.id, { useSavedSetup: false }) : undefined;
          const angle = Number(swing?.limit?.travel.toFixed(1));
          return {
            id: wall.id, title: wall.name,
            detail: swing?.error ?? (swing?.limit
              ? swing.stop || swing.limit.uncertain
                ? `Review the modeled clearance near ${angle}°${swing.stop?.obstacleNames.length ? ` at ${swing.stop.obstacleNames.join(", ")}` : ""}.`
                : `Both hardware faces clear the modeled ${angle}° swing.`
              : "Enter the bore position and measured hardware projection on each face."),
            link: { label: "Open the door hardware check", action: { kind: "door-hardware", sectionId: wall.id } },
          };
        }),
      };
    }
    case "pipe-air-seal":
      return {
        title: "Plan a pipe air seal",
        detail: pipeAirSealOptions(project).length ?
          "Choose the round cut and enter the delivered pipe diameter and its position. Check the sealant gap and whether the cavity needs backing." :
          "Add a round cut to the air-barrier part, then measure the pipe to plan its seal.",
        link: { label: "Open pipe air seal planner", action: { kind: "pipe-air-seal" } },
        rows: reviewPipeAirSeals(project).map(({ plan, preview, issue }) => ({
          id: plan.id, title: preview?.label ?? partLabel(project, plan.partId),
          detail: issue ?? `Checked ${plan.side} face · ${plan.session}.`,
          link: { label: "Open saved pipe seal", action: { kind: "pipe-air-seal", planId: plan.id } },
        })),
      };
    case "countertop-seal": {
      const tops = countertopOptions(project).filter(({ id }) => !question.label || partLabel(project, id) === question.label);
      const ready = tops.length > 0 && countertopWallOptions(project).length > 0;
      const saved = reviewCountertopSeals(project).filter(({ plan }) => !question.label || plan.topId === tops[0]?.id);
      return {
        title: "Plan a countertop splash seal",
        detail: ready ? "Choose the finished wall and mark where the gap, bead or backing changes. Check the modeled runs and estimate kitchen-and-bath silicone."
          : "Choose a level wood countertop and model the finished wall surface beside it first.",
        ...(ready && { link: { label: "Open countertop seal planner", action: { kind: "countertop-seal", topId: tops[0]?.id } } }),
        rows: saved.map(({ plan, preview, issue }) => ({ id: plan.id,
          title: `${partLabel(project, plan.topId)} · ${plan.edge} worktop edge`,
          detail: issue ?? `${formatStockLength(preview!.plannedLength)} of marked bead runs.`,
          link: { label: "Open saved countertop seam", action: { kind: "countertop-seal", planId: plan.id, topId: plan.topId } } })),
      };
    }
    case "trim-sealant": {
      const estimate = trimSeamPurchaseSummary(project);
      const review = estimate?.review ?? 0;
      return {
        title: "Trim sealant by work session",
        scope: trimSealant.scope,
        detail: [
          estimate?.required != null
            ? `${estimate.required} ${estimate.required === 1 ? "cartridge" : "cartridges"} for ${estimate.length} of reviewed trim seams. ${estimate.selected} in the shopping list.`
            : estimate?.ready
              ? "Review the measured coverage. The combined estimate exceeds the supported purchase quantity."
              : "Save measured trim seams on wood joint details or enter field measurements in List.",
          ...(review > 0 ? [`${review} ${review === 1 ? "seam needs" : "seams need"} a fresh fit review.`] : []),
        ].join(" "),
        rows: estimate?.batches.map((batch) => ({
          id: batch.name,
          title: batch.name,
          detail: trimSealantSessionDetail(batch),
        })),
        ...(project.retailer === "home-depot" && { link: { label: "Open trim sealant estimate", action: { kind: "trim-sealant" } } }),
      };
    }
    case "backer-rod-offcuts": {
      const plan = trimBackerRodCutPlan(project);
      const stock = plan.flatMap(({ offcuts }) => offcuts);
      const completed = plan.flatMap(({ completed }) => completed);
      const recorded = completed.reduce((count, { record }) => count + record.cuts.length, 0);
      const changed = completed.reduce((count, row) => count + row.changed, 0);
      const newRolls = plan.reduce((count, { rolls }) => count + rolls.length, 0);
      return {
        title: "Backer rod offcut matches",
        detail: plan.length
          ? [
            `${stock.length} matching ${stock.length === 1 ? "offcut" : "offcuts"} used in the plan. ${newRolls} new ${newRolls === 1 ? "roll" : "rolls"} for the reviewed runs.`,
            recorded ? `${recorded} ${recorded === 1 ? "cut" : "cuts"} recorded.` : "",
            changed ? `${changed} recorded ${changed === 1 ? "run has" : "runs have"} changed or been removed.` : "",
          ].filter(Boolean).join(" ")
          : "Save a measured trim seam or interior opening seal with backing to check the offcuts.",
        rows: stock.slice(0, 12).map(({ source, runs, left }) => ({
          id: source.id, title: source.label,
          detail: `Cut ${runs.map(({ length }) => formatStockLength(length)).join(" + ")} · ${formatStockLength(left)} expected left`,
        })),
        link: { label: "Open Cut pool", action: { kind: "cut-pool" } },
      };
    }
    case "sill-gasket": {
      const title = "Sill gasket layout";
      const partId = question.label && ensurePartLabels(project).partLabels.find(({ label }) => label === question.label)?.partId;
      const part = project.pieces.find(({ id }) => id === partId);
      const footprint = part && sillPlateFootprint(part);
      const saved = part && reviewSillGaskets(project).rows.find(({ plan }) => plan.partId === part.id);
      const link: ReviewLink = { label: "Open sill gasket planner", action: { kind: "sill-gasket", ...(footprint && part && { partId: part.id }) } };
      if (saved?.issues.length) return { title, link, detail: saved.issues.join(" ") };
      if (saved?.length && saved.product) return {
        title, link,
        detail: `The measured run for ${saved.title} uses a continuous ${formatStockLength(saved.length)} strip of ${formatPreciseInches(saved.product.width)} ComfortSeal.`,
        rows: saved.marks.map((mark, index) => ({ id: String(index), title: `Modeled bore ${index + 1}`, detail: sillGasketMarkText(mark) })),
      };
      return { title, link, detail: footprint && part
        ? `Measure the foundation supporting ${part.name}. The modeled sill is ${formatStockLength(footprint.length)} long and ${formatPreciseInches(footprint.width)} wide.`
        : "Choose a horizontal wood sill and measure the continuous concrete or masonry support before planning the gasket." };
    }
    case "motion-audit": {
      const count = project.motionPlans?.length ?? 0;
      return {
        title: "Scan interacting motions",
        detail: count < 2
          ? "Save the motions for at least two doors, drawers or lids, then scan for interference."
          : `Search ${count} saved motions for overlapping paths. Check both opening orders, synchronized movement and different openings for each nearby pair.`,
        link: { label: count < 2 ? "Open movement tests" : "Open motion scan",
          action: { kind: "motion-setup", ...(count >= 2 && { audit: true }) } },
      };
    }
    case "drawer-opening": {
      const plans = project.motionPlans ?? [];
      const hinges = plans.filter(({ mechanism }) => mechanism.kind === "hinge");
      const label = question.compareOrder ? "Open order comparison"
        : question.stop?.angles ? "Compare door stops" : question.stop ? "Check the door stop" : "Find a door opening";
      const pairs = plans.filter(({ mechanism }) => mechanism.kind === "slide").flatMap((drawer) =>
        hinges.filter((door) => canParkMotion(project, drawer, door) && canParkMotion(project, door, drawer))
          .map((door) => ({
            drawer, door,
            id: drawer.id + "/" + door.id,
            title: drawer.label + " behind " + door.label,
            detail: question.compareOrder ? "Compare both opening sequences and moving together."
              : question.stop?.angles ? "Compare verified drawer reach at each stop." : "Check the door swing and find an opening for the requested drawer extension.",
            link: { label,
              action: { kind: "drawer-opening" as const, drawerId: drawer.id, doorId: door.id,
                ...(question.stop && { stop: question.stop }), ...(question.compareOrder && { compareOrder: question.compareOrder }) } },
          })));
      if (question.compareOrder && pairs.length === 1) {
        const [{ door, drawer, link }] = pairs;
        const { plan, companion, setup } = doorDrawerOrderSetup(door, drawer);
        const alternatives = [
          { title: `${plan.label} first`, order: "selected-first" as const },
          { title: `${companion.label} first`, order: "companion-first" as const },
          { title: "move together", order: undefined },
        ];
        const clears = alternatives.filter(({ order }) => trialMotionOpeningOrder(project, plan, setup, order).clear).map(({ title }) => title);
        return {
          title: "Door and drawer opening order",
          detail: clears.length ? `At the current travel targets and gaps, these modeled paths clear opening and closing: ${clears.join(", ")}.`
            : "None of the three orders cleared the current travel targets and gaps. Open the comparison to inspect the stops.",
          link,
        };
      }
      return {
        title: question.compareOrder ? "Door and drawer opening order" : question.stop?.angles ? "Compare drawer travel at different door stops" :
          question.stop ? "Check a fixed door stop" : "Find a door opening for the drawer",
        detail: pairs.length ? "Choose the door and drawer to test. Other parts and recorded site clearances stay in the check."
          : "Use Test movement to save the door's hinge motion and the drawer's sliding motion. Then link them to check clearance.",
        ...(pairs.length === 1 ? { link: pairs[0].link } : pairs.length ? { rows: pairs.slice(0, 12).map(({ id, title, detail, link }) => ({ id, title, detail, link })) } :
          { link: { label: "Open movement tests", action: { kind: "motion-setup" } } }),
      };
    }
    case "board-cut-list":
      return answerBoardCutList(project, question);
    case "board-stock":
      return answerBoardStock(project, question);
    case "dimension-stock": {
      const title = "Lumber cut from a saved dimension";
      const { dimensionName, nominal, treated, quantity } = question;
      const marks = project.workspaceDimensions?.filter(({ name }) =>
        name.toLowerCase() === dimensionName.toLowerCase()) ?? [];
      if (marks.length !== 1) return { title, detail: marks.length
        ? `More than one saved dimension is named “${dimensionName}”. Open the intended mark from Saved dimensions.`
        : `No saved dimension is named “${dimensionName}”. Save or check its name in Measure.` };
      const group = boardMaterialGroup(nominal, treated);
      if (!group) return { title, detail: `No ${treated ? "treated " : ""}${nominal} board matches the material shelf.` };
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxRepeatedBoards)
        return { title, detail: `Choose 1 to ${maxRepeatedBoards} pieces at the same finished length.` };
      try {
        const { id, name, length } = workspaceDimensionForCut(project, marks[0].id);
        return {
          title,
          detail: `${name} · ${formatStockLength(length)} finished length · ${quantity} ${quantity === 1 ? "piece" : "pieces"} · ${group.name}.`,
          link: { label: "Compare lumber and scraps", action: { kind: "dimension-stock", dimensionId: id, groupId: group.id, quantity } },
        };
      } catch (problem) {
        return { title, detail: problem instanceof Error ? problem.message : "Review the saved dimension in Measure." };
      }
    }
    case "board-offcut":
      return answerBoardOffcut(project, question);
    case "panel-offcut":
      return answerPanelOffcut(project, question);
    case "motion":
    case "motion-contact":
      return answerMotion(project, question);
    case "motion-sequence":
      return answerMotionSequence(project, question.legs);
    case "independent-motion":
      return answerIndependentMotion(project, question);
    case "motion-gap":
      return answerMotionGap(project, question);
    case "greenhouse-weatherseal": {
      const title = "Greenhouse door weatherseal review";
      const motions = new Map<string, MotionPlan>();
      for (const motion of project.motionPlans ?? []) {
        const entryId = motion.mechanism.kind === "hinge" ? motion.mechanism.greenhouseDoor?.entryId : undefined;
        if (!entryId) continue;
        const isSavedSeal = project.greenhouseDoorSeals?.some(({ motionId }) => motionId === motion.id);
        if (!motions.has(entryId) || isSavedSeal) motions.set(entryId, motion);
      }
      if (!motions.size) return {
        title,
        detail: "Set up the greenhouse door swing and fit its stops before checking the weatherseal.",
        link: { label: "Open movement setup", action: { kind: "motion-setup" } },
      };
      return {
        title,
        detail: "Closed gaps and travel are checked against the modeled door and its stops.",
        rows: [...motions.values()].slice(0, 5).map((motion) => {
          const saved = project.greenhouseDoorSeals?.find(({ motionId }) => motionId === motion.id);
          const result = saved ? reviewGreenhouseDoorSeal(project, saved) : checkGreenhouseDoorSeal(project, motion);
          return {
            id: motion.id,
            title: motion.label,
            detail: [result.detail, ...result.rows.flatMap(({ name, issues }) => issues.map((issue) => `${name} · ${issue}`))].join(" "),
            link: { label: "Open door movement", action: { kind: "greenhouse-weatherseal", motionId: motion.id } },
          };
        }),
      };
    }
    case "water-fitting":
      return {
        title: question.tee ? "Branch a PEX main" : "Connect measured PEX runs",
        detail: question.tee
          ? "Choose a continuous main and an existing perpendicular branch run. Enter the delivered tee measurements to preview the three pipe cuts, fitting clearance and insertion marks."
          : "Pick the pipe ends and measure the fitting. Yardwork checks the centerlines and the space around the fitting, then shows the adjusted pipe cuts and insertion marks.",
        rows: (project.waterFittings ?? []).map((fitting) => ({
          id: fitting.id, title: fittingLabel(fitting.materialId),
          detail: reviewWaterFitting(project, fitting).problem ?? "The saved pipe ends match the fitting layout.",
          link: { label: "Review this connection", action: { kind: "water-fitting", fittingId: fitting.id } },
        })),
        link: question.tee
          ? { label: "Branch a PEX main", action: { kind: "water-fitting", tee: true } }
          : { label: "Connect PEX runs", action: { kind: "water-fitting" } },
      };
    case "subfloor-support": {
      const target = question.panelLabel
        ? ensurePartLabels(project).partLabels.find(({ label }) => label === question.panelLabel)?.partId : undefined;
      const selected = target && project.pieces.find((piece) => piece.id === target && isSubfloorPanel(piece));
      const rows = selected ? subfloorReviews(project, [selected.id]) : subfloorReviews(project);
      return {
        title: "Check subfloor support",
        detail: question.panelLabel && !selected
          ? `No supported subfloor sheet matches ${question.panelLabel}. Select an actual horizontal sheet to check joist spacing and blocking.`
          : "Choose a sheet to check its joist bearing, span and perimeter backing. Fit blocking from recorded stock, preview adhesive routes and count fasteners.",
        rows: rows.map(({ panelId, layout, problem }) => ({
          id: panelId, title: layout?.piece.name ?? "Saved subfloor check",
          detail: problem || layout?.issues.join(" ") || `${layout?.joistCount} continuous joist lines. ${layout?.nails.length} estimated panel nailing locations.`,
          link: { label: "Review this subfloor sheet", action: { kind: "subfloor-support", panelId } },
        })),
        link: { label: "Open subfloor support", action: { kind: "subfloor-support", ...(selected && { panelId: selected.id }) } },
      };
    }
    case "bottom-plate-seal":
      return {
        title: "Seal a bottom plate",
        detail: "Choose a modeled wood plate on subfloor. The planner checks the exposed bead path and estimates cartridge use from the clear sections.",
        rows: bottomPlateSealReviews(project).map(({ record, title, layout, problem }) => ({
          id: record.id, title,
          detail: problem || `${formatStockLength(layout!.clearLength)} of bead path. ${layout!.runs.some(({ problem }) => problem) ? "Review the marked interruptions." : "Backing and bead space are clear in the model."}`,
          link: { label: "Review this bottom plate seam", action: { kind: "bottom-plate-seal", planId: record.id } },
        })),
        link: { label: "Open bottom plate air seal", action: { kind: "bottom-plate-seal" } },
      };
    case "top-plate-seal":
    case "drywall-bottom-plate-seal": {
      const kind = question.kind;
      const face = kind === "top-plate-seal" ? "top" : "bottom";
      return {
        title: `Seal a ${face} plate to drywall`,
        detail: face === "top" ? "Check the marked drywall backing and the bead route before hanging the panel."
          : "Check where the lower edge of the drywall meets the plate and whether it covers the bead before hanging the panel.",
        scope: drywallPlateDetails[face].scope,
        rows: topPlateSealReviews(project, face).map(({ record, title, layout, problem }) => ({
          id: record.id, title,
          detail: problem || `${formatStockLength(layout!.clearLength)} of modeled bead path.`,
          link: { label: `Review this ${face} plate seam`, action: { kind, planId: record.id } },
        })),
        link: { label: face === "top" ? "Open top plate air seal" : "Open drywall-to-bottom-plate seal", action: { kind } },
      };
    }
    case "floor-register":
      if (question.reuse) return {
        title: "Reuse a floor register cutout",
        detail: `${floorRegisterCutoutUse} Record the usable rectangle after cutting.`,
        rows: floorRegisterReviews(project).map(({ plan, issue }) => ({
          id: plan.id,
          title: `${partLabel(project, plan.input.panelId)} · Floor register`,
          detail: floorRegisterCutoutLabel(project, plan) || issue || "Ready to record the measured offcut after cutting.",
          link: { label: "Open saved floor register", action: { kind: "floor-register", planId: plan.id } },
        })),
        link: project.floorRegisterPlans?.length ? undefined : { label: "Plan floor register", action: { kind: "floor-register" } },
      };
      return {
        title: "Floor register fit and sealing",
        detail: "Check a measured floor opening and boot against the surrounding framing before cutting.",
        scope: floorRegisterScope,
        link: { label: "Plan floor register", action: { kind: "floor-register" } },
      };
    case "round-duct-seal":
      return {
        title: "Estimate sealant for round metal ducts",
        detail: "Review the saved pipe seams and joints, add measured fitting seams and check trial coverage.",
        scope: roundDuctSealScope,
        link: { label: "Plan duct sealing", action: { kind: "round-duct-seal" } },
      };
    case "round-duct-elbow":
      return {
        title: "Connect two round duct runs with a measured elbow",
        detail: "Select two saved pipe ends, enter the actual elbow setbacks and identify the crimped port.",
        scope: roundDuctElbowScope,
        link: { label: "Fit round duct elbow", action: { kind: "round-duct-elbow" } },
      };
    case "round-duct-offcuts":
      return {
        title: "Reuse measured round duct offcuts",
        detail: "Match a measured piece to a saved cut in the Cut pool. After using it, record the completed cut and measure any remnant before using it again.",
        rows: availableRoundDuctOffcuts(project).map((offcut) => ({ id: offcut.id, title: offcut.label,
          detail: `${formatStockLength(offcut.length)} · ${offcut.ends.join(" / ")} ends.` })),
        link: { label: "Open Cut pool", action: { kind: "cut-pool" } },
      };
    case "round-duct":
      return {
        title: "Cut and fit a straight round duct run",
        detail: "Use measured collar tips and pipe overlap to check the clearance, cut lengths, and seal joints.",
        scope: roundDuctScope,
        rows: roundDuctReviews(project).map(({ id, input, issues, cuts }) => ({
          id, title: input.name, detail: issues.length ? issues.join(" ") : `${cuts?.length ?? 0} pipe sections in the current cut list.`,
          link: { label: "Open saved duct run", action: { kind: "round-duct", runId: id } },
        })),
        link: { label: "Plan round duct run", action: { kind: "round-duct" } },
      };
    case "roof-vent-flashing":
      return {
        title: "Flash a roof vent pipe",
        detail: "Choose the retained deck panel and enter the measured pipe position and flange edges. The preview lays out the opening across the full thickness of the sloped decking.",
        scope: roofVentFlashingScope,
        link: { label: "Open roof vent flashing planner", action: { kind: "roof-vent-flashing" } },
      };
    case "roof-valley": {
      const valleys = modeledRoofValleys(project).filter(({ issue }) => !issue);
      return {
        title: "Line a roof valley",
        detail: valleys.length
          ? `${valleys.length} modeled ${valleys.length === 1 ? "valley is" : "valleys are"} available. Measure the centerline and peak extension to plan full-width lining strips and end overlaps.`
          : "In Checks, choose Roofing and save the adjoining modeled deck panels as roof areas. Yardwork looks for two roof slopes that drain toward a shared edge.",
        scope: valleyScope,
        link: { label: "Open roof valley planner", action: { kind: "roof-valley" } },
      };
    }
    case "roof-deck-spacing": {
      const joints = findings.filter((finding) => finding.area?.kind === "roof-deck-joint");
      return {
        title: "Roof deck joint spacing",
        detail: joints.length ? `Measured ${joints.length} ${joints.length === 1 ? "joint" : "joints"} between saved roof panels.`
          : "In Checks, save two adjacent rectangular wood deck panels as roof areas on the same plane to measure their joint.",
        rows: joints.map(({ id, title, detail }) => ({
          id, title, detail, link: { label: "Show joint in 3D", action: { kind: "finding", id } },
        })),
        scope: `${roofDeckSpacingReference.scope} ${roofDeckSpacingReference.backingScope}`,
        ...(!joints.length ? { link: { label: "Open Checks", action: { kind: "checks" } } } : {}),
      };
    }
    case "roof-deck-ends": {
      const ends = findings.filter(({ area }) => area?.kind === "roof-deck-end");
      const missingAxis = findings.filter(({ id }) => id.startsWith("roof-deck-end-axis-"));
      return {
        title: "Roof deck end bearing",
        detail: ends.length ? `Checked ${ends.length} panel ends against the modeled framing.`
          : missingAxis.length ? "Set the stock length axis to match the panel stamp."
          : "In Checks, save a rectangular wood deck panel as a modeled roof area to check its ends.",
        rows: [...ends.map(({ id, title, detail }) => ({
          id, title, detail, link: { label: "Show end in 3D", action: { kind: "finding" as const, id } },
        })), ...missingAxis.map(({ id, title, detail }) => ({ id, title, detail }))],
        scope: roofDeckSpacingReference.endScope,
        ...(!ends.length ? { link: { label: "Open Checks", action: { kind: "checks" } } } : {}),
      };
    }
    case "roof-deck-blocking": {
      const joints = findings.filter(({ area, pieceIds }) => area?.kind === "roof-deck-joint" &&
        question.panelLabels.every((label) => pieceIds?.some((id) => partLabel(project, id) === label)));
      const unsupported = new Set(joints.filter(({ area }) => area?.lines?.length).map(({ id }) => id));
      const targets = new Map(roofDeckBlockingTargets(project, unsupported).map(({ jointId, bayIds }) => [jointId, bayIds]));
      return {
        title: "Fit roof deck blocking",
        detail: !joints.length
          ? question.panelLabels.length
            ? "No modeled roof deck joint matches those panel labels. Check the labels and saved roof areas."
            : "Save two adjacent wood deck panels as modeled roof areas under Checks to find their joint."
          : question.reuse
            ? "Choose a joint to preview fitted blocks using matching on-hand scraps and new stock as needed."
            : "Choose a joint to preview fitted blocks from new stock and reuse the remainders between cuts.",
        rows: joints.map(({ id, title, detail }) => {
          const bayIds = targets.get(id) ?? [];
          return {
            id, title,
            detail: bayIds.length ? `${bayIds.length} candidate framing ${bayIds.length === 1 ? "bay" : "bays"}.`
              : unsupported.has(id) ? "The unsupported runs have no matching pair of framing faces for this fit." : detail,
            link: bayIds.length ? {
              label: bayIds.length === 1 ? "Preview block" : "Preview blocking for all bays",
              action: { kind: "roof-deck-blocking", jointId: id, bayIds, reuse: question.reuse },
            } : { label: "Show joint in 3D", action: { kind: "finding", id } },
          };
        }),
        scope: roofDeckBlockingScope,
        ...(!joints.length ? { link: { label: "Open Checks", action: { kind: "checks" } } } : {}),
      };
    }
    case "rim-air-seal": {
      const review = reviewRimAirSeals(project);
      const floor = project.sections.find(({ generator }) => generator?.type === "foundation");
      const takeoff = review.edgeSealant;
      const quantities = takeoff?.issue ?? (takeoff?.required ? `The saved trial coverage estimates ${takeoff.required} ${takeoff.required === 1 ? "can" : "cans"} of edge sealant.`
        : "Enter matching trial coverage to estimate the sealant.");
      const pooled = review.scraps.filter(({ poolOffcutId }) => poolOffcutId).length;
      const pooledStock = uncutRimFoamOffcuts(project).length;
      const completed = review.completed.size;
      const savedCuts = completed && !review.needsReview
        ? ` The cut records cover ${completed} ${completed === 1 ? "blank" : "blanks"}.` : "";
      const foamReuse = pooled && !review.needsReview
        ? ` The saved layouts use ${pooled} Cut pool ${pooled === 1 ? "offcut" : "offcuts"} and ${review.sheets.length} new foam ${review.sheets.length === 1 ? "sheet" : "sheets"}.`
        : completed && !review.needsReview
          ? ` The remaining layouts need ${review.sheets.length} new foam ${review.sheets.length === 1 ? "sheet" : "sheets"}.`
        : pooledStock
          ? ` Cut pool has ${pooledStock} measured foam ${pooledStock === 1 ? "offcut" : "offcuts"}. Select the pieces in the rim planner to check which cuts fit.`
          : "";
      return {
        title: "Air-seal the floor rim",
        detail: floor
          ? `Select the rim and measure the openings with continuous backing. Check the foam fit, then review the shared sheet cuts and any reusable offcuts. ${quantities}${savedCuts}${foamReuse}`
          : "Add a Floor & foundation assembly so Yardwork can identify the actual rims and joist bays.",
        rows: review.rows.map((row) => {
          const { plan, name, issues, cuts } = row;
          const edge = rimEdgeSealEstimate(row);
          return {
            id: rimAirSealKey(plan.input), title: name,
            detail: issues.join(" ") || `${cuts.length} measured foam ${cuts.length === 1 ? "insert" : "inserts"}. ${edge
              ? `Seal ${formatStockLength(edge.run)} along all four edges after dry fitting.`
              : "Seal all four edges after dry fitting."}`,
            link: { label: "Review these rim bays", action: { kind: "rim-air-seal", sectionId: plan.input.sectionId, side: plan.input.side } },
          };
        }),
        ...(floor && { link: { label: "Open rim air seal planner", action: { kind: "rim-air-seal", sectionId: floor.id } } }),
        scope: rimSealScope,
      };
    }
    case "sink-drain":
      return {
        title: "Fit a sink drain",
        detail: "Mark the tailpiece and wall socket. The planner uses your dry-fit dimensions to check the trap, measure the straight tube cut and review the path to the vent.",
        rows: (project.sinkDrains ?? []).map((record) => ({
          id: record.id, title: record.name,
          detail: reviewSinkDrain(project, record).problem ?? "The saved trap and cut tube match their fit measurements.",
          link: { label: "Review this sink drain", action: { kind: "sink-drain", drainId: record.id } },
        })),
        link: { label: "Open sink drains", action: { kind: "sink-drain" } },
      };
    case "water-stop":
      return {
        title: "Fit a fixture shutoff",
        detail: "Choose an open ½ in PEX stub-out. Enter its exposed length, outlet direction and service clearances to preview the angle stop and pipe cut.",
        rows: (project.waterStops ?? []).map((stop) => ({
          id: stop.id, title: stop.name,
          detail: reviewWaterStop(project, stop).problem ?? "The saved valve and its entered access spaces fit the current model.",
          link: { label: "Review this shutoff", action: { kind: "water-stop", stopId: stop.id } },
        })),
        link: { label: "Open fixture shutoffs", action: { kind: "water-stop" } },
      };
    case "water-pressure":
      return {
        title: "Record a water pressure test",
        detail: "Choose a connected section and enter the installer’s water test observations. Yardwork compares the saved readings with the supported code and fitting references.",
        rows: (project.waterPressureTests ?? []).map((test) => {
          const review = reviewWaterPressure(project, test);
          return {
            id: test.id, title: test.name,
            detail: review.rows.map(({ detail }) => detail).join(" "),
            link: { label: "Open test record", action: { kind: "water-pressure", recordId: test.id } },
          };
        }),
        link: { label: "Open water pressure tests", action: { kind: "water-pressure" } },
      };
    case "rough-in-before-drywall": {
      const title = "Water rough-in before drywall";
      const wallIds = new Set(project.sections.filter(({ name }) => !question.wall || searchName(name) === question.wall).map(({ id }) => id));
      const hasWater = project.waterRuns?.some(({ sectionId }) => wallIds.has(sectionId));
      const linings = waterRoughInLinings(project).filter(({ wallId }) => wallIds.has(wallId));
      const numbered = project.steps.map((step, index) => ({ step, number: index + 1 }));
      const review = waterPressureReviewStep(project);
      const pressure = numbered.find(({ step }) => step === review);
      const active = new Map(project.pieces.filter(({ offcut }) => !offcut).map(({ id, stepId }) => [id, stepId]));
      const current = linings.length > 0 && guideIsCurrent(project);
      return {
        title,
        detail: linings.length ? "Review the installed water lines, field test results and any required inspections before covering the modeled rough-in."
          : question.wall && !wallIds.size ? "Use the wall’s name as it appears in Sections."
            : hasWater ? "Review the water test and any required inspection before installing a lining over the modeled water run."
              : "No modeled water run was found in this view. Verify the services and required inspections at the wall.",
        rows: linings.slice(0, 12).map((lining) => {
          const steps = new Set(lining.pieceIds.map((id) => active.get(id)));
          const cover = numbered.find(({ step }) => steps.has(step.id));
          const early = pressure && cover && cover.number < pressure.number;
          const detail = pressure && cover
            ? early ? `Step ${cover.number} can cover the rough-in before its review at step ${pressure.number}. Move the lining after the review.`
              : cover.number === pressure.number ? `Review the water test before hanging this lining within step ${pressure.number}.`
                : `Review the water test at step ${pressure.number} before hanging this lining at step ${cover.number}.`
            : "Generate the build guide to place the water review before this lining.";
          return {
            id: lining.id,
            title: lining.name,
            detail: !current && pressure && cover ? `${detail} Regenerate the build guide to edit its current steps.` : detail,
            link: current && pressure && cover ? {
              label: early ? "Open lining step" : "Open water review step",
              action: { kind: "guide-step", id: early ? cover.step.id : pressure.step.id },
            } : undefined,
          };
        }),
        ...(hasWater && { link: { label: "Open water pressure tests", action: { kind: "water-pressure" } } }),
      };
    }
    case "water-support": {
      const spacing = waterSupportNetwork(project);
      return {
        title: "Check the PEX supports",
        detail: `${spacing.count} modeled isolators. Review centerline reaches over 32 in and confirm support at open ends.`,
        rows: spacing.spans.filter(longSupportSpan).slice(0, 6).map((span, index) => ({
          id: `${span.from.key}/${index}`,
          title: "Review a long reach",
          detail: waterSupportSpanLine(span),
          link: { label: "Inspect PEX support spacing", action: { kind: "water-support" } },
        })),
        link: { label: "Open PEX support spacing", action: { kind: "water-support" } },
      };
    }
    case "wall-water": {
      const runs = (project.waterRuns ?? []).filter(({ name }) => !question.subject || searchName(name) === searchName(question.subject));
      return {
        title: "Plan a straight water line",
        detail: "Choose a generated nonbearing wall, then enter the actual endpoints, center height, depth and bore. The preview uses the retained studs and checks the pipe route and face protection.",
        scope: "Confirm the wall type, concealed services, fittings, support and local requirements before drilling.",
        rows: runs.map((run) => {
          const review = reviewWaterRun(project, run);
          return {
            id: run.id,
            title: run.name,
            detail: review.problem ?? `${review.measured?.studs.length ?? 0} modeled stud bores and ${run.shields.length} shield plates.`,
            link: { label: "Open water-line layout", action: { kind: "wall-water", runId: run.id } },
          };
        }),
        link: { label: "Plan a wall water line", action: { kind: "wall-water" } },
      };
    }
    case "window-seal-order": {
      const title = "Window flashing and air-seal order";
      const sillId = question.sillLabel && ensurePartLabels(project).partLabels.find(({ label }) => label === question.sillLabel)?.partId;
      const rows = windowFlashingSchedule(project).filter(({ plan }) => !question.sillLabel || plan.members.sill === sillId);
      const current = rows.length > 0 && guideIsCurrent(project);
      const order = current ? reviewAssemblyOrder(project) : [];
      return {
        title,
        detail: rows.length
          ? "Flash the sill before setting the window. Flash the jambs and head, then inspect the interior air seal before fitting trim."
          : "Save the measured window flashing plan first. Keep the sill outlets clear and inspect the interior air seal before fitting trim.",
        rows: rows.slice(0, 8).map(({ plan, title, wall, covers }) => {
          const id = plan.members.sill;
          const step = project.steps.find(({ generated }) => generated?.kind === windowFlashingPhaseKinds[2] && generated.planId === id);
          const early = step && order.find(({ prerequisites }) => prerequisites.some(({ step: previous }) => previous.id === step.id));
          const cover = covers.map(({ name }) => name).slice(0, 4);
          return {
            id, title: wall?.name ?? title,
            detail: early ? `Step ${early.current.number} is ahead of the window air-seal step. Review the order before closing access.`
              : cover.length ? `Keep access to the seal before fitting ${cover.join(", ")}.`
                : "Inspect the seal while the whole perimeter is accessible.",
            link: current && step ? {
              label: early ? "Open step scheduled too early" : "Open window air-seal step",
              action: { kind: "guide-step", id: early?.current.step.id ?? step.id },
            } : { label: "Open flashing plan", action: { kind: "opening-flashing", sillId: id } },
          };
        }),
        ...(!rows.length && { link: { label: "Plan opening flashing", action: { kind: "opening-flashing", sillId: sillId || undefined } } }),
      };
    }
    case "opening-flashing": {
      const title = "Opening flashing review";
      const sillId = question.sillLabel
        ? ensurePartLabels(project).partLabels.find(({ label }) => label === question.sillLabel)?.partId
        : undefined;
      if (question.sillLabel && (!sillId || !project.pieces.some(({ id, offcut }) => id === sillId && !offcut)))
        return { title, detail: "Use the part label of an active rough sill in the model." };
      const { rows } = reviewOpeningFlashings(project);
      const relevant = sillId ? rows.filter(({ plan }) => plan.members.sill === sillId) : rows;
      return {
        title,
        detail: relevant.length
          ? "The recorded flashing cuts and drainage details follow the four framing members."
          : "Choose the modeled sill, two jambs and head. Keep the exterior sill outlets clear, then seal the interior perimeter after setting the unit.",
        scope: openingFlashingScope,
        rows: relevant.slice(0, 6).map(({ plan, title, issues, result }) => ({
          id: plan.members.sill,
          title,
          detail: !result || issues.length ? issues.join(" ") :
            `Cut one ${formatStockLength(result.length)} piece of ${plan.measurements.tapeWidth} in FlexWrap. ${openingDrainageNote(plan.measurements)}${result.jambHead ? ` Window tape cuts are ${result.jambHead.cuts.map(({ edge, length }) => `${edge.toLowerCase()} ${formatStockLength(length)}`).join(", ")}.` : ""}${result.airSeal ? ` ${openingAirSealSummary(result.airSeal)}.` : ""}`,
          link: { label: "Open flashing plan", action: { kind: "opening-flashing", sillId: plan.members.sill } },
        })),
        link: { label: "Plan opening flashing", action: { kind: "opening-flashing", sillId } },
      };
    }
    case "framed-wall": {
      const title = "Framed wall layout";
      const { request } = question;
      if ("issue" in request) return { title, detail: request.issue };
      const { width, height, spacing, lumber } = request.dimensions;
      return {
        title,
        detail: `${formatStockLength(width)} wide by ${formatStockLength(height)} high. ${lumber.replace("x", " × ")} framing at ${spacing} in on center.`,
        scope: "Interior nonbearing framing. Review the placement, cut list and attachments before building.",
        link: { label: "Preview framed wall", action: { kind: "framed-wall", ...request.dimensions } },
      };
    }
    case "window-wall": {
      const combined = /\b(?:doorways?|doors?)\b/i.test(question.prompt);
      const title = combined ? "Wall with a doorway and window" : "Window wall layout";
      const scope = combined ? doorAndWindowGuideNote : windowWallScope;
      let command: Command | undefined;
      try {
        const parsed = parsePrompt(question.prompt);
        if (parsed.type === "wall" && parsed.windowOpening) command = parsed;
      } catch (issue) {
        return {
          title, detail: issue instanceof Error ? issue.message : "Enter the wall and rough opening dimensions.",
          scope, link: combined && /bearing wall needs/.test(String(issue)) ? undefined : {
            label: "Choose dimensions", action: { kind: "window-wall", command: combined ? parsePrompt(doorAndWindowExample) : undefined },
          },
        };
      }
      return {
        title,
        detail: command?.windowOpening
          ? `${formatStockLength(command.width)} wide by ${formatStockLength(command.height)} high with a ${formatPreciseInches(command.windowOpening.width)} by ${formatPreciseInches(command.windowOpening.height)} rough window opening${command.doorOpening ? ` and a ${formatPreciseInches(command.doorOpening.width)} by ${formatPreciseInches(command.doorOpening.height)} rough doorway` : ""}.`
          : "Set the wall size, rough opening and sill elevation.",
        scope,
        link: {
          label: command ? combined ? "Preview both openings" : "Preview the window wall" : "Choose dimensions",
          action: { kind: "window-wall", command },
        },
      };
    }
    case "scribe-filler": {
      const panels = scribeSidePanels(project);
      const panel = question.panelLabel ? panels.find(({ id }) => partLabel(project, id) === question.panelLabel) : undefined;
      const ready = question.panelLabel ? !!panel : panels.length > 0;
      return {
        title: "Fit a cabinet scribe filler",
        detail: ready ? "Enter the wall gap at the bottom, middle and top. Preview the cut marks, matching scraps and movement with the filler in place."
          : "Choose an upright rectangular wooden side panel with its thickness along local X.",
        ...(ready && { link: { label: "Open filler planner", action: { kind: "scribe-filler", panelId: panel?.id } } }),
      };
    }
    case "furniture-brace": {
      const posts = furnitureBracePosts(project);
      const selected = question.posts?.map((label) => posts.find(({ id }) => partLabel(project, id) === label));
      const ready = selected ? selected.every(Boolean) && selected[0] !== selected[1] : posts.length >= 2;
      return {
        title: "Plan a furniture diagonal brace",
        detail: ready ? "Set two attachment marks on aligned post faces. Preview the square cuts, face contact and any compatible offcut."
          : "Choose two different upright wood posts in the same furniture frame.",
        ...(ready && { link: { label: "Open diagonal brace planner", action: {
          kind: "furniture-brace", firstId: selected?.[0]?.id, secondId: selected?.[1]?.id,
        } } }),
      };
    }
    case "cabinet-backing": {
      const ready = cabinetBackingWalls(project).length > 0;
      return {
        title: "Check wall cabinet mounting points",
        detail: ready ? "Find which mounting points reach studs and which need backing. Preview the needed crosscuts and check the wall cavity."
          : "Add an upright framed wall to check cabinet mounting points against the actual model.",
        ...(ready && { link: { label: "Open cabinet backing planner", action: { kind: "cabinet-backing", height: question.height } } }),
      };
    }
    case "cabinet-screw-reach": {
      const reviews = cabinetBackingReviews(project);
      return {
        title: "Check cabinet screw reach",
        detail: reviews.length ? "Choose a mounting row. Compare the measured wall stack, available wood and screw path."
          : "First mark the cabinet mounting points on a framed wall and save the mounting row.",
        ...(reviews.length ? { rows: reviews.map(({ plan, layout, issue, fastening }) => {
          const needsReview = fastening?.locations.filter(({ issues }) => issues.length).length ?? 0;
          return { id: plan.id, title: `${layout?.wall.name ?? "Wall"} · ${formatPreciseInches(plan.input.height)} above base`,
            detail: issue ?? (fastening ? `${needsReview} of ${fastening.locations.length} marks need a reach review.` : "Enter the measured seated screw and wall stack."),
            link: { label: "Open mounting row", action: { kind: "cabinet-backing" as const, row: { wallId: plan.input.wallId, planId: plan.id } } } };
        }) } : cabinetBackingWalls(project).length ? { link: { label: "Open cabinet backing planner", action: { kind: "cabinet-backing" as const } } } : {}),
      };
    }
    case "cabinet-pulls": {
      const choices = project.sections.filter((section) => section.cabinetDoors &&
        (!question.label || section.pieceIds.some((id) => partLabel(project, id) === question.label)));
      const selected = choices.find(({ id }) => id === selectedSectionId);
      const inset = question.inset;
      const link = (sectionId: string): ReviewLink => ({ label: "Open cabinet pulls", action: { kind: "cabinet-pulls", sectionId, inset } });
      const detail = inset === undefined ? "Preview the pull positions against the saved door swings."
        : `Preview pull centers ${formatPreciseInches(inset)} from the finished free edge.`;
      return {
        title: "Edit cabinet pulls",
        detail: choices.length ? detail : question.label ? `${question.label} is outside the fitted cabinet door sections.`
          : "Fit cabinet doors before editing the pulls.",
        ...(selected || choices.length === 1 ? { link: link((selected ?? choices[0]).id) } : {
          rows: choices.map(({ id, name, pieceIds }) => ({ id, title: name, detail: pieceIds.map((partId) => partLabel(project, partId)).join(" · "), link: link(id) })),
        }),
      };
    }
    case "cabinet-doors": {
      const ready = cabinetDoorFrameParts(project).length >= 4;
      return {
        title: "Fit doors to a cabinet opening",
        detail: ready ? `Choose the two stiles and two rails. Yardwork sizes the doors to the opening and checks the hinge travel${question.barPull ? " with vertical cabinet pulls" : ""}.`
          : "Add or import the four wood face-frame members first. The planner uses their actual dimensions to size the doors.",
        rows: ready ? [{
          id: "cabinet-doors", title: "Flush inset doors", detail: "Fit a single door or a matched pair with fixed-pin hinges.",
          link: { label: "Open cabinet door fitting", action: question },
        }] : [],
      };
    }
    case "drawer-cabinet": {
      const { request } = question;
      return {
        title: request.bayCount > 1 ? "Cabinet run with drawers"
          : request.drawerHeights.length > 1 ? "Cabinet with stacked drawers" : "Cabinet with a fitted drawer",
        detail: request.issue ?? "Review the cabinet layout, drawer sizes, slide travel and cuts.",
        link: request.issue ? undefined : { label: "Set up cabinet and drawer", action: { kind: "drawer-cabinet", request } },
      };
    }
    case "wall-drywall": {
      const { request } = question;
      const title = request.task === "tape" ? "Drywall joint tape"
        : request.task === "layout" ? "Drywall layout" : "Drywall screws and backing";
      if (request.issue) return { title, detail: request.issue };
      const { walls, named } = resolveDrywallWalls(project, request, selectedSectionId);
      if (!walls.length) return { title, detail: named
        ? `No framed wall matches “${request.wall}”. Use its section name from the model.`
        : "Frame or open a wall section to lay out its drywall and check the backing." };
      const rows = walls.map((wall) => {
        const side = drywallStartFace(project, wall, request);
        const sheets = drywallSheetChoice(wall, request.sheetLength);
        const sides = side === "both" ? "both faces" : `the ${side} face`;
        const lining = project.sections.filter(({ wallDrywall }) =>
          wallDrywall?.wallId === wall.id && (side === "both" || wallDrywall.side === side));
        if (request.task === "tape") {
          const rows = lining.map((section) => {
            const { length, problem } = reviewWallDrywallJoints(project, section);
            const label = section.wallDrywall?.side === "back" ? "Back face" : "Front face";
            return label + " · " + (problem ?? formatStockLength(length) + " of net flat joints.");
          });
          const action: BuildQuestionAction = { kind: "wall-drywall", request: {
            wallId: wall.id, side, task: rows.length ? "tape" : "layout",
          } };
          return { id: wall.id, title: wall.name,
            detail: rows.join(" ") || "Lay out drywall on the requested face to measure the panel joints.",
            link: { label: rows.length ? "Review drywall joint tape" : "Preview drywall layout", action },
          };
        }
        const allLined = lining.length === (side === "both" ? 2 : 1);
        const directReview = (request.task === "screws" && lining.length > 0) || (allLined && !request.backing);
        const review = directReview ? lining.map((section) => reviewWallDrywallScrews(project, section)) : [];
        const faceNames = review.map(({ section }) => section.wallDrywall?.side);
        const total = review.reduce((sum, face) => sum + face.total, 0);
        const boxes = Math.ceil(total / drywallScrews.estimatedBoxCount);
        const estimate = total && review.every(({ problem }) => !problem)
          ? `${total} planned screws across the selected ${review.length === 1 ? "face" : "faces"}. Estimate ${boxes} × 1-lb ${boxes === 1 ? "box" : "boxes"}. ` : "";
        const detail = directReview
          ? estimate + review.map(({ section, problem, total }) => `${section.wallDrywall!.side === "front" ? "Front" : "Back"} face · ${problem ?? `${total} planned screws.`}`).join(" ")
          : `Lay out ${sides} with 4 × ${sheets.length / 12} ft sheets and a ${formatPreciseInches(request.floorGap ?? 0.5)} gap above the wall base.${request.reuse ? " Try matching scraps for the new panels." : ""}${request.backing ? " Include backing studs above the window in the preview." : ""}`;
        const label = directReview ? "Review screw locations"
          : `Preview drywall on ${wall.name}`;
        const action: BuildQuestionAction = { kind: "wall-drywall", request: {
          wallId: wall.id, side: directReview && faceNames.length === 1 ? faceNames[0] : side,
          task: directReview ? "screws" : "layout", sheetLength: request.sheetLength ?? sheets.length,
          floorGap: request.floorGap, reuse: request.reuse, backing: request.backing,
        } };
        return { id: wall.id, title: wall.name, detail, link: { label, action } };
      });
      return {
        title,
        detail: rows.length > 1 ? "Choose the framed wall you want to review."
          : request.task === "tape" ? "The tape estimate covers the modeled flat joints on the selected faces."
            : "Review the wall layout and backing before adding material.",
        rows,
      };
    }
    case "drawer-box": {
      const title = "Drawer opening";
      const { partLabels } = ensurePartLabels(project);
      const [first, second] = question.labels.map((label) => partLabels.find((row) => row.label === label)?.partId);
      if (!first || !second)
        return { title, detail: "Use the part labels of the two fixed cabinet sides." };
      const panelIds: [string, string] = [first, second];
      try {
        const opening = drawerBoxOpening(project, panelIds);
        return {
          title,
          detail: `${question.labels.join(" and ")} give a ${formatPreciseInches(opening.width)} wide opening with ${formatPreciseInches(opening.front - opening.back)} of common depth.${question.barPull ? " The drawer setup includes the pull in its motion preview." : ""}`,
          link: { label: "Open drawer setup", action: {
            kind: "drawer-box", panelIds, ...(question.spacers && { spacers: question.spacers }),
            ...(question.barPull && { barPull: true }),
          } },
        };
      } catch (issue) {
        return { title, detail: issue instanceof Error ? issue.message : "Review both cabinet sides." };
      }
    }
    case "treated-wood": {
      const cuts = treatedWoodCuts(project);
      const labels = new Map(ensurePartLabels(project).partLabels.map(({ partId, label }) => [partId, label]));
      return {
        title: fieldTreatmentTitle,
        detail: cuts.length
          ? `Showing ${Math.min(6, cuts.length)} of ${cuts.length} labeled pieces with cuts or holes to review.`
          : "The model has no listed cuts or holes in pressure-treated wood.",
        scope: fieldTreatmentScope,
        rows: cuts.slice(0, 6).map(({ piece, detail, surfaceArea }) => ({
          id: piece.id,
          title: `${labels.get(piece.id)} · ${piece.name}`,
          detail,
          link: {
            label: surfaceArea ? "Show treatment surfaces" : piece.offcut ? "Inspect offcut" : "Inspect part",
            action: { kind: surfaceArea ? "field-treatment" : piece.offcut ? "offcut" : "part", id: piece.id },
          },
        })),
        ...(cuts.length && {
          link: { label: "Open build preparation", action: { kind: "treated-wood" } },
        }),
      };
    }
    case "offcuts":
      return answerOffcuts(project, question);
  }
}
