import { libertyBarPull } from "./cabinetPullReference";
import { drawingReferenceSchema } from "./drawingReference";
import { caseworkTipUpSchema } from "./caseworkTipUpSchema";
import { pureBondCasework } from "./homeDepotCaseworkReference";
import { homeDepotFraming } from "./homeDepotFramingReference";
import { baseBoardDepth, baseBoardIds, baseBoards, baseMemberLengths, baseMembers, floorBaseJoistCenters, floorBaseRoles, homeDepotTreatedLumber, treatedLumberProductId } from "./homeDepotTreatedLumber";
import { floorHangerPlanSchema } from "./floorHangerSchema";
import { rimAirSealPlansSchema, rimFoamCutRecordsSchema, rimFoamOffcutPoolSchema } from "./rimAirSealSchema";
import { roofValleysSchema } from "./roofValleySchema";
import { floorRegisterPlansSchema } from "./floorRegisterSchema";
import { roundDuctOffcutsSchema, roundDuctRunsSchema } from "./roundDuctSchema";
import { roundDuctElbowsSchema } from "./roundDuctElbowSchema";
import { roundDuctSealSchema } from "./roundDuctSealSchema";
import { roofVentFlashingsSchema } from "./roofVentFlashingSchema";
import { greenhouseFoundationSchema } from "./greenhouseFoundationSchema";
import { siteClearanceSchema } from "./siteClearanceSchema";
import { z } from "zod";
import { cutSourceAxesSchema, tubeCutPlansSchema, tubeKerfSchema, woodKerfSchema } from "./cutSourceAxes";
import { offcutCutSchema } from "./offcutCutSchema";
import { greenhouseDoorSealsSchema } from "./greenhouseDoorSealSchema";
import { openingFlashingPlansSchema } from "./openingFlashingSchema";
import { wallFramingStockIds, windowOpeningSchema, windowWallPrompt, windowWallScope, windowWallTemplate } from "./windowWall";
import { doorJambMaterial, doorOpeningSchema, doorUnitSchema, doorwayGuideNote, doorwayHinge, doorwayLeafRole, doorwayTemplate, interiorDoor, measuredDoorMaterial, wallStudPositions, doorWallPrompt } from "./doorWall";
import { nailShield, pexPipes, pexStockLength, type PexPipeId } from "./wallWaterReference";
import { waterRunSchema } from "./wallWaterSchema";
import { waterPressureTestsSchema } from "./waterPressureSchema";
import { waterSupportIds, waterSupportName, waterSupportProducts, waterSupportReference } from "./waterSupportReference";
import { waterFittingDimensions, waterFittingIds, waterFittingName, waterFittingProducts } from "./waterFittingReference";
import { waterFittingPorts, waterFittingSchema } from "./waterFittingSchema";
import { waterStop } from "./waterStopReference";
import { waterStopsSchema } from "./waterStopSchema";
import { sinkTrap } from "./sinkDrainReference";
import { subfloorPanel } from "./bottomPlateSealReference";
import { drywallStock } from "./drywallReference";
import { subfloorAdhesivePlansSchema, subfloorChecksSchema, subfloorJoistPlansSchema, subfloorNailPlansSchema } from "./subfloorSchema";
import { bottomPlateSealsSchema } from "./bottomPlateSealSchema";
import { topPlateSealsSchema } from "./topPlateSealSchema";
import { sinkDrainsSchema } from "./sinkDrainSchema";
import { materialIds } from "./materialIds";
export { materialIds } from "./materialIds";
import { moduleRecipeSchema } from "./recipeSchemas";
export { moduleRecipeSchema, type ModuleRecipe } from "./recipeSchemas";
import { ideaBindingSchema } from "./ideaBindingSchema";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { cutPlanesSchema, clipBox } from "./cutProfiles";
import { rectangularOpeningSchema, roundOpeningSchema } from "./throughOpeningSchema";
import { pieceThroughOpenings, throughOpeningProblem } from "./throughOpenings";
import { rodFitSchema } from "./rodFitSchema";
import { retailerSchema, retailerFromUrl } from "./retailers";
import { composeRotation, rotate } from "./spatial";
import { projectCodeSchema } from "./projectCodeSchema";
import { shelfSagPlansSchema } from "./shelfSagSchema";
import { saunaHeaterPlanSchema } from "./saunaHeaterSchema";
import { drawerSlideMountsSchema } from "./drawerSlideMountSchema";
import { greenhouseLatchSchema } from "./greenhouseLatchSchema";
import { saunaBenchTravelSchema } from "./saunaBenchTravelSchema";
import { saunaVentilationPlanSchema } from "./saunaVentilationSchema";
import { lidWeightPlanSchema } from "./lidWeightSchema";
import { lidStayFitSchema } from "./lidStayFitSchema";
import { cedarbrookLining } from "./saunaLiningReference";
import { cedarbrookDoor } from "./saunaDoorReference";
import { cedarbrookFoil } from "./saunaFoilReference";
import { saunaCeilingBatt, saunaCeilingJoists, saunaCeilingJoistSize } from "./saunaCeilingReference";
import { owensCorningWallBatt } from "./saunaWallReference";
import { everbiltClosetRod } from "./closetRodReference";
import { cedarbrookBenches, cedarbrookBenchSize } from "./saunaBenchReference";
import { sunliteProfilePlanSchema } from "./sunliteProfileSchema";
import { sunliteTapeCutsSchema } from "./sunliteTapeSchema";
import { edgeBandingSchema } from "./edgeBandingSchema";
import { sunliteMountsSchema } from "./sunliteMountSchema";
import { sunliteThermalSchema } from "./sunliteThermalSchema";
import { motionPlanSchema } from "./motionPlanSchema";
import { supplyInventorySchema, supplySelectionSchema } from "./supplySchema";
import { homeDepotPickupSchema } from "./homeDepotPickupSchema";
import { storeProductLocationSchema } from "./storeProductLocation";
import { attachmentPlanSchema } from "./attachmentSchema";
import { restraintPlanSchema } from "./restraintSchema";
import { fastenerPlanSchema } from "./fasteningSchema";
import { lidHingePlanSchema, recordedLidMotionSchema } from "./hingeSchema";
import { hingeStockSourceSchema } from "./hingeStockSchema";
import { connectorPlanSchema } from "./connectorSchema";
import { guidePlacementSchema } from "./guidePlacementSchema";
import { bearingDecisionsSchema } from "./bearingDecisionSchema";
import { woodJointDecisionsSchema } from "./woodJointDecisionSchema";
import { sillGasketPlansSchema } from "./sillGasketSchema";
import { greenhouseBaseTimber, greenhouseBaseTimber12 } from "./greenhouseBaseReference";
import { cedarDoorStop } from "./greenhouseDoorReference";
import {
  PROJECT_FORMAT_VERSION,
  migrateLegacyProject,
  projectFormatProblem,
} from "./projectVersion";
export const vec = z.tuple([
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
]);
const id = z.string().uuid();
export const maxPartDimension = 240;
export const maxProjectPieces = 2000;
export const pieceSchema = z
  .object({
    id,
    name: z.string().min(1).max(120),
    material: z.enum(materialIds),
    size: z.tuple([
      z.number().positive().max(maxPartDimension),
      z.number().positive().max(maxPartDimension),
      z.number().positive().max(maxPartDimension),
    ]),
    position: vec,
    rotation: vec,
    stepId: id,
    assembly: z.string().max(80),
    /** Explicit construction-task choice; physical section and design roles stay separate. */
    guidePlacement: guidePlacementSchema.optional(),
    /** Explicit generated or user-adopted identity within an idea entry. */
    designRole: z.string().min(1).max(100).optional(),
    /** Flat stock set aside for folding from each local X/Y edge. */
    foilReturns: z.strictObject({
      xStart: z.number().finite().min(0).max(12),
      xEnd: z.number().finite().min(0).max(12),
      yStart: z.number().finite().min(0).max(12),
      yEnd: z.number().finite().min(0).max(12),
    }).optional(),
    offcut: z.boolean().default(false),
    cutPlanes: cutPlanesSchema.default([]),
    roundOpenings: z.array(roundOpeningSchema).min(1).max(6).optional(),
    rectangularOpenings: z.array(rectangularOpeningSchema).min(1).max(6).optional(),
    stockLengthAxis: z
      .union([z.literal(0), z.literal(1), z.literal(2)])
      .nullable()
      .default(null),
    cutStock: z
      .object({
        id,
        sourceAxes: cutSourceAxesSchema.optional(),
        tubeKerf: tubeKerfSchema.optional(),
        woodKerf: woodKerfSchema.optional(),
        size: z.tuple([
          z.number().finite().positive().max(240),
          z.number().finite().positive().max(240),
          z.number().finite().positive().max(240),
        ]),
        offset: z.tuple([
          z.number().finite().min(0).max(240),
          z.number().finite().min(0).max(240),
          z.number().finite().min(0).max(240),
        ]),
      })
      .nullable()
      .default(null),
  })
  .superRefine((piece, ctx) => {
    const stock = catalog.find((m) => m.id === piece.material);
    if (piece.cutStock?.tubeKerf !== undefined && stock?.shape !== "tube-envelope")
      ctx.addIssue({
        code: "custom",
        path: ["cutStock", "tubeKerf"],
        message: "Measured tube cutting loss requires tube stock.",
      });
    if (piece.cutStock?.woodKerf !== undefined &&
        (!stock?.wood || !stock.cuttable || !["linear", "sheet"].includes(stock.stockKind)))
      ctx.addIssue({
        code: "custom",
        path: ["cutStock", "woodKerf"],
        message: "Measured wood cutting loss requires a cuttable wood board or panel.",
      });
    if (stock?.orderRollWidth && (
      piece.size[2] !== cedarbrookFoil.modelThickness ||
      piece.stockLengthAxis !== 0 || piece.cutPlanes.length || piece.cutStock || piece.offcut
    ))
      ctx.addIssue({
        code: "custom",
        path: ["size"],
        message: "Use the foil panel’s length and width. Its thickness is a drawing convention.",
      });
    if (piece.foilReturns && !stock?.orderRollWidth)
      ctx.addIssue({
        code: "custom", path: ["foilReturns"], message: "Fold returns are only available for foil stock.",
      });
    if (
      stock?.productReference &&
      ["fastener", "connector"].includes(stock.stockKind) &&
      piece.size.some(
        (value, axis) => Math.abs(value - stock.size[axis]) > 0.001,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["size"],
        message:
          "This reviewed hardware variant has fixed dimensions. Choose a different product instead of scaling its geometry.",
      });
    if (
      stock?.stockKind === "equipment" &&
      ((!stock.measuredEquipment && piece.size.some((value, axis) =>
        Math.abs(value - stock.size[axis]) > (stock.id === interiorDoor.materialId ? 0.125 : 0.000001))) ||
        piece.cutPlanes.length || piece.cutStock || piece.offcut)
    )
      ctx.addIssue({
        code: "custom",
        path: ["size"],
        message: "This kit uses fixed product dimensions. Change its position or choose a different kit.",
      });
    if (
      stock?.shape === "tube-envelope" &&
      ([0, 2].some(
        (axis) => Math.abs(piece.size[axis] - stock.size[axis]) > 0.001,
      ) ||
        (piece.stockLengthAxis !== null && piece.stockLengthAxis !== 1))
    )
      ctx.addIssue({
        code: "custom",
        path: ["size"],
        message:
          "This tube product has a fixed outside diameter and local Y length axis. Only its length can be shortened.",
      });
    const openings = pieceThroughOpenings(piece);
    if (openings.length) {
      const problem =
        piece.cutPlanes.length || stock?.shape === "tube-envelope" || !(stock?.cuttable || stock?.orderRollWidth)
          ? "Model through-cuts in rectangular cuttable stock or foil."
          : throughOpeningProblem(piece.size, openings);
      if (problem) ctx.addIssue({ code: "custom", path: [piece.rectangularOpenings ? "rectangularOpenings" : "roundOpenings"], message: problem });
    }
    if (piece.cutPlanes.length) {
      if (
        catalog.find((m) => m.id === piece.material)?.shape === "tube-envelope"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["cutPlanes"],
          message:
            "Tube envelope profiles are unsupported; only length cuts are modeled.",
        });
        return;
      }
      if (!catalog.find((m) => m.id === piece.material)?.cuttable) {
        ctx.addIssue({
          code: "custom",
          path: ["cutPlanes"],
          message:
            "Profile cuts apply only to cuttable stock, not hardware or uncuttable products.",
        });
        return;
      }
      try {
        clipBox(piece.size, piece.cutPlanes);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["cutPlanes"],
          message:
            error instanceof Error ? error.message : "Invalid profile geometry",
        });
      }
    }
  });
export const stepSchema = z.object({
  id,
  title: z.string().min(1).max(120),
  notes: z.string().max(5000),
  complete: z.boolean(),
  generated: z
    .discriminatedUnion("kind", [
      z.strictObject({
        kind: z.enum([
          "shelf-pin-preparation",
          "restraint-preparation",
          "wood-fastener-preparation",
          "lid-hinge-preparation",
          "connector-preparation",
          "project-preparation",
          "project-finish",
          "water-pressure-review",
          "bottom-plate-air-seal",
          "top-plate-air-seal",
          "subfloor-support-review",
        ]),
        planId: id,
        notes: z.string().max(4500),
        fingerprint: z.string().min(1).max(100).optional(),
        title: z.string().min(1).max(120).optional(),
      }),
      z.strictObject({
        kind: z.literal("assembly-stage"),
        /** Stable design entry/section/project identity, never a capacity claim. */
        planId: id,
        stageKey: z.string().min(1).max(100),
        memberIds: z
          .array(id)
          .min(1)
          .max(2000)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Stage members must be unique",
          ),
        notes: z.string().max(4500),
        fingerprint: z.string().min(1).max(100),
        title: z.string().min(1).max(120),
      }),
    ])
    .optional(),
});
export const jointSchema = z.object({
  id,
  a: id,
  b: id,
  kind: z.enum(["screw", "nail", "bracket"]),
  material: z.enum(materialIds).optional(),
  quantity: z.number().int().min(1).max(100),
  length: z.number().positive().max(12),
  stepId: id,
});
export const planLineSchema = z.object({ a: vec, b: vec });
/** Saved observations retain historical identities; current eligibility is checked separately. */
export const storedInventorySchema = z
  .object({
    retailer: retailerSchema.optional(),
    material: z.enum(materialIds),
    internetNumber: z.string().regex(/^\d{3,16}$/),
    name: z.string().min(1).max(240),
    price: z.number().nonnegative().max(100000),
    available: z.number().int().nonnegative(),
    store: z.string().min(1).max(80),
    zip: z.string().regex(/^\d{5}$/),
    checkedAt: z.iso.datetime(),
    location: storeProductLocationSchema.optional(),
    url: z
      .url()
      .refine(
        (s) => retailerFromUrl(s) !== null,
        "Use an official Home Depot or Lowe's HTTPS URL",
      ),
  })
  .superRefine((item, ctx) => {
    const retailer = item.retailer ?? "home-depot";
    if (retailer === "home-depot" && !/^\d{6,12}$/.test(item.internetNumber))
      ctx.addIssue({
        code: "custom",
        path: ["internetNumber"],
        message: "Use the Home Depot Internet number (6–12 digits).",
      });
    if (retailerFromUrl(item.url) !== retailer)
      ctx.addIssue({
        code: "custom",
        path: ["retailer"],
        message: "The product URL does not match the selected retailer.",
      });
  });
/** Current admission/pricing requires the exact currently reviewed product offer. */
export const inventorySchema = storedInventorySchema.superRefine((item, ctx) => {
    const retailer = item.retailer ?? "home-depot";
    const stock = catalog.find((m) => m.id === item.material);
    const expected = stock ? reviewedOfferForMaterial(stock, retailer) : null;
    if (stock?.productReference && !expected)
      ctx.addIssue({
        code: "custom",
        path: ["material"],
        message:
          "No current reviewed offer matches this exact material at the selected retailer. Choose its reviewed retailer or a different modeled product.",
      });
    if (expected && item.internetNumber !== expected.productId)
      ctx.addIssue({
        code: "custom",
        path: ["internetNumber"],
        message:
          "The product number does not match this exact reviewed stock/pack variant. Choose the matching product reference.",
      });
    if (expected) {
      const url = new URL(item.url);
      const prefix = retailer === "home-depot" ? "/p/" : "/pd/";
      if (
        !url.pathname.startsWith(prefix) ||
        url.pathname.replace(/\/$/, "").split("/").at(-1) !== expected.productId
      )
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: "The URL must identify the exact reviewed product number.",
        });
    }
  });
export const commandSchema = z.object({
  type: z.enum(["wall", "coop", "foundation"]),
  width: z
    .number()
    .min(24)
    .max(192)
    .describe("Overall width in inches; multiply feet by 12."),
  height: z
    .number()
    .min(12)
    .max(120)
    .describe(
      "Overall wall height in inches including plates; use 48 for a new foundation.",
    ),
  depth: z
    .number()
    .min(24)
    .max(192)
    .describe("Foundation depth in inches; use 48 for a new wall."),
  spacing: z
    .union([z.literal(12), z.literal(16), z.literal(24)])
    .describe("Stud/joist spacing in inches; default 16."),
  windowOpening: windowOpeningSchema.nullable().optional()
    .describe("One nonbearing rough window opening in a wall. All dimensions are inches. Sill is measured above the bottom of the wall. Offset is signed from the wall center. Use null only to explicitly remove a saved opening."),
  doorOpening: doorOpeningSchema.nullable().optional()
    .describe("One explicitly measured rough doorway in a nonbearing wall. Width and height are inches, floor is the finished floor rise above the wall base, and offset is signed from the wall center. Use null only to remove a saved doorway."),
});
export type Command = z.infer<typeof commandSchema>;
const baseBoardSchema = z.enum(baseBoardIds);
const sectionCommandSchema = commandSchema.extend({
  baseStock: z.strictObject({ rim: baseBoardSchema, joist: baseBoardSchema }).optional(),
  wallStock: z.enum(wallFramingStockIds).optional(),
  doorUnit: doorUnitSchema.nullable().optional(),
}).superRefine((command, ctx) => {
  if (command.wallStock && command.type !== "wall") {
    ctx.addIssue({ code: "custom", message: "Wall lumber needs a wall section.", path: ["wallStock"] });
  }
  if (command.windowOpening && command.type !== "wall") {
    ctx.addIssue({ code: "custom", message: "A window opening needs a wall section.", path: ["windowOpening"] });
  } else if (command.windowOpening) {
    try {
      windowWallTemplate(command, command.windowOpening, 3.5);
    } catch (issue) {
      ctx.addIssue({ code: "custom", message: (issue as Error).message, path: ["windowOpening"] });
    }
  }
  if (((command.doorOpening || command.doorUnit) && command.type !== "wall") ||
      (command.doorUnit && !command.doorOpening) || (command.doorOpening && command.windowOpening)) {
    ctx.addIssue({ code: "custom", message: "Plan one doorway or one window per generated wall panel. A fitted door needs its rough doorway.", path: ["doorOpening"] });
  } else if (command.doorOpening) {
    try {
      doorwayTemplate(command, command.doorOpening, framingStockDimensions(command.wallStock ?? "stud").depth, command.doorUnit);
    } catch (issue) {
      ctx.addIssue({ code: "custom", message: (issue as Error).message, path: ["doorOpening"] });
    }
  }
  if (!command.baseStock) return;
  if (command.type !== "foundation") {
    ctx.addIssue({ code: "custom", message: "Base stock can only be assigned to a floor base.", path: ["baseStock"] });
    return;
  }
  const lengths = baseMemberLengths(command);
  if (baseBoardDepth(command.baseStock.rim) !== baseBoardDepth(command.baseStock.joist))
    ctx.addIssue({
      code: "custom",
      message: "Rims and joists need the same actual board depth.",
      path: ["baseStock"],
    });
  for (const member of baseMembers) {
    const board = baseBoards.find(({ materialId }) => materialId === command.baseStock?.[member]);
    if (board && lengths[member] > board.size[2])
      ctx.addIssue({
        code: "custom",
        message: `The ${member} needs ${format(lengths[member])}. Choose a longer board or shorten the base.`,
        path: ["baseStock", member],
      });
  }
});
export type SectionCommand = z.infer<typeof sectionCommandSchema>;
export const sectionSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  pieceIds: z.array(id).min(1).max(2000),
  origin: vec,
  rotation: vec,
  generator: sectionCommandSchema.nullable(),
  floorHangerPlan: floorHangerPlanSchema.optional(),
  recipe: moduleRecipeSchema.nullable().default(null),
  recordedLidMotion: recordedLidMotionSchema.optional(),
  roomFraming: z.strictObject({
    id,
    wall: z.number().int().min(1).max(300),
    walls: z.number().int().min(4).max(300),
    panel: z.number().int().min(1).max(300),
    panels: z.number().int().min(1).max(300),
  }).refine(({ wall, walls, panel, panels }) => wall <= walls && panel <= panels && walls % 2 === 0,
    "Room framing must identify a panel on a valid outline wall.").optional(),
});
export type Section = z.infer<typeof sectionSchema>;
export const currentProjectSchema = z
  .strictObject({
    schemaVersion: z.literal(PROJECT_FORMAT_VERSION),
    rimAirSeals: rimAirSealPlansSchema.optional(),
    rimFoamOffcuts: rimFoamOffcutPoolSchema.optional(),
    rimFoamCutRecords: rimFoamCutRecordsSchema.optional(),
    roofValleys: roofValleysSchema.optional(),
    roofVentFlashings: roofVentFlashingsSchema.optional(),
    floorRegisterPlans: floorRegisterPlansSchema.optional(),
    roundDuctRuns: roundDuctRunsSchema.optional(),
    roundDuctOffcuts: roundDuctOffcutsSchema.optional(),
    roundDuctElbows: roundDuctElbowsSchema.optional(),
    roundDuctSeal: roundDuctSealSchema.optional(),
    id,
    name: z.string().min(1).max(120),
    kind: z.enum(["coop", "wall", "custom", "bathroom", "pool"]),
    retailer: retailerSchema.default("home-depot"),
    toolSelections: z
      .array(
        z.object({
          productId: z.string().min(1).max(120),
          checkedAt: z.iso.datetime(),
        }),
      )
      .max(100)
      .default([]),
    supplies: z.array(supplySelectionSchema).max(200).default([]),
    rodFitPlans: z.array(rodFitSchema).max(100).refine(
      (plans) => new Set(plans.map((plan) => plan.rodId)).size === plans.length,
      "Retain one measured fit per rod.",
    ).optional(),
    tubeCutPlans: tubeCutPlansSchema.optional(),
    woodKerfs: z.partialRecord(z.enum(materialIds), woodKerfSchema).optional(),
    onHandCutSources: z.array(id).max(2000)
      .refine((sources) => new Set(sources).size === sources.length, "Keep one entry per on-hand cut source.")
      .optional(),
    plannedCutSources: z.array(z.strictObject({
      sourceId: id,
      fingerprint: z.string().min(1).max(80),
      historyIds: z.array(id).min(1).max(2000),
    })).max(2000)
      .refine((plans) => new Set(plans.map(({ sourceId }) => sourceId)).size === plans.length,
        "Keep one cut plan per stock source.")
      .optional(),
    projectCode: projectCodeSchema.optional(),
    waterPressureTests: waterPressureTestsSchema.optional(),
    waterRuns: z.array(waterRunSchema).max(32)
      .refine((runs) => {
        const members = runs.flatMap((run) => [run.pipeId, ...run.shields.map(({ id }) => id),
          ...(run.isolators ?? []).map(({ id }) => id)]);
        return new Set(runs.map(({ id }) => id)).size === runs.length && new Set(members).size === members.length;
      }, "Each water line owns its pipe, shields and isolators.").optional(),
    waterFittings: z.array(waterFittingSchema).max(64).refine((rows) => {
      const ports = rows.flatMap(waterFittingPorts).map(({ runId, end }) => `${runId}/${end}`);
      return new Set(ports).size === ports.length && new Set(rows.map(({ id }) => id)).size === rows.length &&
        new Set(rows.map(({ pieceId }) => pieceId)).size === rows.length;
    }, "Each PEX endpoint and fitting can belong to one connection.").optional(),
    waterStops: waterStopsSchema.optional(),
    sinkDrains: sinkDrainsSchema.optional(),
    bottomPlateSeals: bottomPlateSealsSchema.optional(),
    topPlateSeals: topPlateSealsSchema.optional(),
    subfloorChecks: subfloorChecksSchema.optional(),
    subfloorAdhesivePlans: subfloorAdhesivePlansSchema.optional(),
    subfloorNailPlans: subfloorNailPlansSchema.optional(),
    subfloorJoistPlans: subfloorJoistPlansSchema.optional(),
    shelfSagPlans: shelfSagPlansSchema.optional(),
    saunaHeaterPlans: z.array(saunaHeaterPlanSchema).max(50).refine(
      (plans) => new Set(plans.map((plan) => plan.roomId)).size === plans.length,
      "Retain one heater review per sauna.",
    ).optional(),
    drawerSlideMounts: drawerSlideMountsSchema.optional(),
    greenhouseDoorSeals: greenhouseDoorSealsSchema.optional(),
    openingFlashings: openingFlashingPlansSchema.optional(),
    greenhouseLatchPlans: z.array(greenhouseLatchSchema).max(50).refine(
      (plans) => new Set(plans.map(({ motionId }) => motionId)).size === plans.length,
      "Keep one latch layout per door swing.",
    ).optional(),
    caseworkTipUpPlans: z.array(caseworkTipUpSchema).max(50).refine(
      (plans) => new Set(plans.map(({ entryId }) => entryId)).size === plans.length,
      "Keep one tip-up plan per carcass.",
    ).optional(),
    saunaBenchTravelPlans: z.array(saunaBenchTravelSchema).max(50).refine(
      (plans) => new Set(plans.map(({ roomId }) => roomId)).size === plans.length,
      "Keep one bench carry-in plan per sauna.",
    ).optional(),
    saunaVentilationPlans: z.array(saunaVentilationPlanSchema).max(50).refine(
      (plans) => new Set(plans.map(({ roomId }) => roomId)).size === plans.length,
      "Retain one ventilation layout per sauna.",
    ).optional(),
    sunliteProfilePlan: sunliteProfilePlanSchema.optional(),
    sunliteTapeCuts: sunliteTapeCutsSchema.optional(),
    edgeBanding: edgeBandingSchema.optional(),
    sunliteThermal: sunliteThermalSchema.optional(),
    sunliteMounts: sunliteMountsSchema.optional(),
    motionPlans: z.array(motionPlanSchema).max(50).refine(
      (plans) => new Set(plans.map((plan) => plan.id)).size === plans.length,
      "Retain distinct motion plans.",
    ).refine(
      (plans) => {
        const doorwayIds = plans.flatMap(({ mechanism }) =>
          mechanism.kind === "hinge" && mechanism.doorway ? [mechanism.doorway.sectionId] : [],
        );
        return new Set(doorwayIds).size === doorwayIds.length;
      },
      "Retain one linked swing per interior doorway.",
    ).optional(),
    attachmentPlans: z.array(attachmentPlanSchema).max(100).default([]),
    restraintPlans: z.array(restraintPlanSchema).max(100).default([]),
    fastenerPlans: z.array(fastenerPlanSchema).max(100).default([]),
    lidHingePlans: z.array(lidHingePlanSchema).max(100).default([]),
    lidWeightPlans: z.array(lidWeightPlanSchema).max(100).refine(
      (plans) => new Set(plans.map((plan) => plan.sectionId)).size === plans.length,
      "Retain one lid weight measurement per section.",
    ).optional(),
    lidStayFits: z.array(lidStayFitSchema).max(100).refine(
      (fits) => new Set(fits.map((fit) => fit.id)).size === fits.length,
      "Retain distinct folding stay plans.",
    ).optional(),
    hingeStockSources: z.array(hingeStockSourceSchema).max(200).default([]),
    connectorPlans: z.array(connectorPlanSchema).max(100).default([]),
    bearingDecisions: bearingDecisionsSchema.optional(),
    woodJointDecisions: woodJointDecisionsSchema.optional(),
    sillGaskets: sillGasketPlansSchema.optional(),
    connectorPlanLabels: z.array(z.strictObject({ planId: id, label: z.string().regex(/^C[0-9]{3,6}$/) })).max(10000).default([]),
    hingePlanLabels: z.array(z.strictObject({ planId: id, label: z.string().regex(/^H[0-9]{3,6}$/) })).max(10000).default([]),
    fastenerPlanLabels: z.array(z.strictObject({
      planId: id,
      label: z.string().regex(/^W[0-9]{3,6}$/),
    })).max(10000).default([]),
    partLabels: z
      .array(
        z.strictObject({
          partId: id,
          label: z.string().regex(/^[PO][0-9]{3,6}$/),
        }),
      )
      .max(10000)
      .default([]),
    supplyInventory: z.array(supplyInventorySchema).max(100).default([]),
    homeDepotPickup: homeDepotPickupSchema.optional(),
    zip: z.string().regex(/^\d{5}$/),
    store: z.string().max(80),
    updatedAt: z.iso.datetime(),
    pieces: z.array(pieceSchema).max(maxProjectPieces),
    steps: z.array(stepSchema).min(1).max(500),
    joints: z.array(jointSchema).max(5000),
    inventory: z.array(storedInventorySchema).max(100),
    planLines: z.array(planLineSchema).max(3000),
    drawingReference: drawingReferenceSchema.optional(),
    notes: z.string().max(10000),
    sections: z.array(sectionSchema).max(300).default([]),
    ideaBindings: z.array(ideaBindingSchema).max(200).default([]),
    siteClearances: z.array(siteClearanceSchema).max(64).optional(),
    greenhouseFoundations: z.array(greenhouseFoundationSchema).max(200).optional(),
    workZone: z
      .object({
        width: z.number().finite().min(1).max(1200),
        depth: z.number().finite().min(1).max(1200),
        height: z.number().finite().min(1).max(1200),
      })
      .nullable()
      .default(null),
    guideFingerprint: z.string().max(200).nullable().default(null),
    history: z
      .array(
        z.object({
          id,
          at: z.iso.datetime(),
          stepId: id,
          message: z.string().max(500),
          offcutCut: offcutCutSchema.optional(),
        }),
      )
      .max(5000)
      .default([]),
  })
  .superRefine((p, ctx) => {
    if (p.waterStops?.length) {
      const occupied = new Set((p.waterFittings ?? []).flatMap(waterFittingPorts).map(({ runId, end }) => `${runId}/${end}`));
      if (p.waterStops.some(({ port }) => occupied.has(`${port.runId}/${port.end}`)))
        ctx.addIssue({ code: "custom", path: ["waterStops"], message: "A pipe end can have a fitting or a fixture shutoff." });
    }
    for (const stock of catalog)
      if (p.woodKerfs?.[stock.id] !== undefined && !canPlanWoodKerf(stock.id))
        ctx.addIssue({
          code: "custom",
          path: ["woodKerfs", stock.id],
          message: "A wood blade kerf requires cuttable wood board or sheet stock.",
        });
    const pieceIds = new Set(p.pieces.map((x) => x.id)),
      stepIds = new Set(p.steps.map((x) => x.id));
    if (p.siteClearances && new Set(p.siteClearances.map((plane) => plane.id)).size !== p.siteClearances.length)
      ctx.addIssue({ code: "custom", path: ["siteClearances"], message: "Site clearance identifiers must be unique." });
    if (p.greenhouseFoundations && new Set(p.greenhouseFoundations.map(({ entryId }) => entryId)).size !== p.greenhouseFoundations.length)
      ctx.addIssue({ code: "custom", path: ["greenhouseFoundations"], message: "Each greenhouse can have one measured foundation footprint." });
    const generatedKeys = p.steps.flatMap((s) =>
      s.generated
        ? [
            JSON.stringify([
              s.generated.kind,
              s.generated.planId,
              s.generated.kind === "assembly-stage" ? s.generated.stageKey : "",
            ]),
          ]
        : [],
    );
    if (new Set(generatedKeys).size !== generatedKeys.length)
      ctx.addIssue({
        code: "custom",
        message: "Generated guide stage identities must be unique",
      });
    if (
      new Set(p.partLabels.map((row) => row.partId)).size !==
        p.partLabels.length ||
      new Set(p.partLabels.map((row) => row.label)).size !==
        p.partLabels.length ||
      new Set(p.fastenerPlanLabels.map((row) => row.planId)).size !== p.fastenerPlanLabels.length ||
      new Set(p.fastenerPlanLabels.map((row) => row.label)).size !== p.fastenerPlanLabels.length ||
      new Set(p.restraintPlans.map((plan) => plan.id)).size !==
        p.restraintPlans.length ||
      new Set(
        [...p.attachmentPlans, ...p.restraintPlans, ...p.fastenerPlans].map(
          (plan) => plan.id,
        ),
      ).size !==
        p.attachmentPlans.length +
          p.restraintPlans.length +
          p.fastenerPlans.length ||
      new Set(
        p.fastenerPlans.flatMap((plan) =>
          plan.locations.map((location) => location.id),
        ),
      ).size !==
        p.fastenerPlans.reduce((n, plan) => n + plan.locations.length, 0) ||
      new Set(
        p.restraintPlans.flatMap((plan) =>
          plan.locations.map((location) => location.id),
        ),
      ).size !==
        p.restraintPlans.reduce((n, plan) => n + plan.locations.length, 0) ||
      pieceIds.size !== p.pieces.length ||
      stepIds.size !== p.steps.length ||
      new Set(p.joints.map((j) => j.id)).size !== p.joints.length ||
      new Set(p.supplies.map((s) => s.id)).size !== p.supplies.length ||
      new Set(p.attachmentPlans.map((plan) => plan.id)).size !==
        p.attachmentPlans.length ||
      new Set(
        p.attachmentPlans.flatMap((plan) =>
          plan.points.map((point) => point.id),
        ),
      ).size !==
        p.attachmentPlans.reduce((n, plan) => n + plan.points.length, 0)
    )
      ctx.addIssue({ code: "custom", message: "Duplicate identifiers" });
    const fastenerLabels = new Map(p.fastenerPlanLabels.map((row) => [row.planId, row.label]));
    if (p.fastenerPlans.some((plan) => fastenerLabels.get(plan.id) !== plan.label))
      ctx.addIssue({code:"custom",message:"Each fastener plan must retain its reserved W label."});
    const hingeLabels = new Map(p.hingePlanLabels.map((row) => [row.planId, row.label]));
    const hingeIds = p.lidHingePlans.map((plan) => plan.id);
    const allPlanIds = [...p.attachmentPlans, ...p.restraintPlans, ...p.fastenerPlans, ...p.lidHingePlans, ...p.connectorPlans].map((plan) => plan.id);
    const hingeLocationIds = p.lidHingePlans.flatMap((plan) => plan.locations.map((location) => location.id));
    if (p.lidHingePlans.some((plan) => hingeLabels.get(plan.id) !== plan.label) ||
        hingeLabels.size !== p.hingePlanLabels.length ||
        new Set(p.hingePlanLabels.map((row) => row.label)).size !== p.hingePlanLabels.length ||
        new Set(hingeIds).size !== hingeIds.length || new Set(allPlanIds).size !== allPlanIds.length ||
        new Set(hingeLocationIds).size !== hingeLocationIds.length ||
        new Set(p.hingeStockSources.map((source) => source.id)).size !== p.hingeStockSources.length ||
        new Set(p.lidHingePlans.filter((plan) => plan.selectedForMotion).map((plan) => plan.sectionId)).size !== p.lidHingePlans.filter((plan) => plan.selectedForMotion).length)
      ctx.addIssue({code:"custom",message:"Hinge identifiers, labels and selected section mechanisms must remain unique."});
    const connectorLabels = new Map(p.connectorPlanLabels.map((row) => [row.planId, row.label]));
    const connectorEntryIds = p.connectorPlans.flatMap((plan) => plan.entries.map((entry) => entry.id));
    if (connectorLabels.size !== p.connectorPlanLabels.length ||
        new Set(p.connectorPlanLabels.map((row) => row.label)).size !== p.connectorPlanLabels.length ||
        p.connectorPlans.some((plan) => connectorLabels.get(plan.id) !== plan.label) ||
        new Set(connectorEntryIds).size !== connectorEntryIds.length)
      ctx.addIssue({code:"custom",message:"Connector identifiers and reserved C labels must remain unique."});
    const bindingIds = new Set<string>(),
      entryIds = new Set<string>(),
      boundSections = new Set<string>();
    for (const binding of p.ideaBindings) {
      if (bindingIds.has(binding.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate idea binding identifier",
        });
      bindingIds.add(binding.id);
      for (const entry of binding.entries) {
        if (entryIds.has(entry.id))
          ctx.addIssue({
            code: "custom",
            message: "Duplicate idea entry identifier",
          });
        entryIds.add(entry.id);
        const roles = new Set<string>();
        for (const mapping of entry.sections) {
          if (roles.has(mapping.role) || boundSections.has(mapping.sectionId))
            ctx.addIssue({
              code: "custom",
              message: "Idea roles must map sections once",
            });
          roles.add(mapping.role);
          boundSections.add(mapping.sectionId);
        }
      }
    }
    const buildPieceIds = new Set(
      p.pieces.filter((p) => !p.offcut).map((p) => p.id),
    );
    const members = new Set<string>(),
      sectionIds = new Set<string>(),
      roomPanels = new Set<string>(),
      roomSizes = new Map<string, number>(),
      wallSizes = new Map<string, number>();
    for (const section of p.sections) {
      if (section.recordedLidMotion && !section.recipe?.lidOpen)
        ctx.addIssue({ code: "custom", message: "A recorded open-lid transform requires a saved open lid." });
      const selectedHinge = p.lidHingePlans.find((plan) => plan.sectionId === section.id && plan.selectedForMotion);
      if (selectedHinge && section.recipe?.lidOpen && (!section.recordedLidMotion || section.recordedLidMotion.planId !== selectedHinge.id || section.recordedLidMotion.movingPieceId !== selectedHinge.moving.pieceId))
        ctx.addIssue({ code: "custom", message: "An open measured lid requires its matching recorded axis to close. Restore the original format-7 project; no provisional axis was substituted." });
      if (sectionIds.has(section.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate section identifier",
        });
      sectionIds.add(section.id);
      for (const pieceId of section.pieceIds) {
        if (!buildPieceIds.has(pieceId) || members.has(pieceId))
          ctx.addIssue({
            code: "custom",
            message:
              "Section membership must reference existing build parts once",
          });
        members.add(pieceId);
      }
      if (section.generator?.type === "coop")
        ctx.addIssue({
          code: "custom",
          message: "Coop generation cannot replace an individual section",
        });
      if (section.roomFraming) {
        const { id, wall, walls, panel, panels } = section.roomFraming;
        const wallKey = `${id}/${wall}`, panelKey = `${wallKey}/${panel}`;
        if (section.generator?.type !== "wall" || roomPanels.has(panelKey) ||
          (roomSizes.has(id) && roomSizes.get(id) !== walls) ||
          (wallSizes.has(wallKey) && wallSizes.get(wallKey) !== panels))
          ctx.addIssue({ code: "custom", message: "Room framing must use unique, consistently numbered generated wall panels." });
        roomPanels.add(panelKey);
        roomSizes.set(id, walls);
        wallSizes.set(wallKey, panels);
      }
    }
    for (const x of p.pieces)
      if (!stepIds.has(x.stepId))
        ctx.addIssue({
          code: "custom",
          message: "A piece references a missing step",
        });
    for (const j of p.joints)
      if (
        !pieceIds.has(j.a) ||
        !pieceIds.has(j.b) ||
        j.a === j.b ||
        !stepIds.has(j.stepId)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "A connection references missing or identical parts or a missing step",
        });
  });
export const projectSchema = z.preprocess((value, ctx) => {
  const problem = projectFormatProblem(value);
  if (problem) {
    ctx.addIssue({ code: "custom", message: problem });
    return z.NEVER;
  }
  return migrateLegacyProject(value);
}, currentProjectSchema);
export type V3 = z.infer<typeof vec>;
export type Piece = z.infer<typeof pieceSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
export type MaterialId = (typeof materialIds)[number];
export type Material = {
  id: MaterialId;
  name: string;
  subtitle: string;
  category: string;
  stockKind: "linear" | "sheet" | "roll" | "fastener" | "connector" | "equipment";
  wood: boolean;
  cuttable: boolean;
  packCount: number;
  fastenerLength?: number;
  fastenerType?: "screw" | "nail";
  connectorFastener?: boolean;
  headDiameter?: number;
  shankDiameter?: number;
  productReference?: string;
  /** Exact standalone stock without an author-reviewed generated-structure application. */
  placementOnly?: boolean;
  /** Geometry included in a purchased assembly, rather than a separate list item. */
  includedComponent?: boolean;
  /** Equipment dimensions established from field measurements. */
  measuredEquipment?: boolean;
  shape?: "tube-envelope" | "glazing-envelope" | "insulation-batt" | "door-leaf-envelope" | "pedestal-bench-envelope";
  priceKind?: "example" | "unpriced";
  size: V3;
  stockSize?: V3;
  /** Width of a continuous supplier roll with a quote-specific length. */
  orderRollWidth?: number;
  color: string;
  price: number;
  unit: string;
  search: string;
};
export const catalog: Material[] = [
  {
    id: "lowes-whitewood-1x6",
    placementOnly: true,
    name: "RELIABILT #2 whitewood 1 × 6 · Lowe’s reference",
    subtitle:
      "L51344628 · ¾ × 5½ in actual · 8 ft · untreated · manual placement",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [0.75, 96, 5.5],
    color: "#d4b68d",
    productReference: "lowes-reliabilt-one-six-8-951",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: "RELIABILT L51344628 1001067086 whitewood 1x6",
  },
  {
    id: "lowes-syp-2x6",
    placementOnly: true,
    name: "#2 Prime SYP 2 × 6 · Lowe’s reference",
    subtitle:
      "37015 · 1½ × 5½ in actual · 8 ft · treatment undeclared · manual placement",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [1.5, 96, 5.5],
    color: "#cda77c",
    productReference: "lowes-syp-two-six-8-73600",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: "37015 1000028789 Southern yellow pine 2x6",
  },
  {
    id: "lowes-syp-2x4-8",
    name: "#2 SYP 2 × 4 · Lowe’s reference",
    subtitle: "5014110787 · 1½ × 3½ in actual · 8 ft · kiln-dried",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [1.5, 96, 3.5],
    color: "#cda77c",
    productReference: "lowes-syp-2x4x96-5140",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: "Top Choice 020408#2 SYP 5014110787",
  },
  {
    id: "lowes-treated-post-4x4-8",
    placementOnly: true,
    name: "#2 treated SYP 4 × 4 post · Lowe’s reference",
    subtitle: "Y2L40408-GC · 3½ × 3½ in actual · 8 ft · MCA treated",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [3.5, 96, 3.5],
    color: "#9a9a73",
    productReference: "lowes-syp-treated-post-4x4x96-552328",
    priceKind: "unpriced",
    price: 0,
    unit: "post",
    search: "Severe Weather Y2L40408-GC 50121083",
  },
  {
    id: "hd-pine-1x4",
    name: "Common pine 1 × 4 · Home Depot reference",
    subtitle: "301993221 · ¾ × 3½ in actual · 8 ft",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [0.75, 96, 3.5],
    color: "#cda77c",
    productReference: "hd-common-pine-1x4x96-301993221",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: "301993221 common pine 1x4",
  },
  {
    id: "lowes-pine-1x4",
    name: "RELIABILT pine 1 × 4 · Lowe’s reference",
    subtitle: "LBR-940 · ¾ × 3½ in actual · 8 ft",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [0.75, 96, 3.5],
    color: "#cda77c",
    productReference: "lowes-reliabilt-lbr-940-1x4x96",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: "RELIABILT LBR-940",
  },
  {
    id: "plytanium-703",
    name: "Plytanium BC pine plywood · 23/32 category",
    subtitle:
      "201428 · 47.938 × 95.938 in · .703 in actual · dry interior casework only",
    category: "Panels",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [47.938, 0.703, 95.938],
    color: "#bc956b",
    productReference: "plytanium-bc-201428",
    priceKind: "unpriced",
    price: 0,
    unit: "sheet",
    search: "Plytanium 201428 BC sanded plywood",
  },
  {
    id: "sunlite-8mm",
    name: "SUNLITE 8 mm twinwall panel",
    subtitle: "132506 · 24 × 96 in · 8 mm thick · external envelope",
    category: "Panels",
    stockKind: "sheet",
    wood: false,
    cuttable: true,
    packCount: 1,
    size: [24, 8 / 25.4, 96],
    shape: "glazing-envelope",
    productReference: "sunlite-132506",
    priceKind: "unpriced",
    color: "#aacbc4",
    price: 0,
    unit: "panel",
    search: "SUNLITE 132506",
  },
  {
    id: "closet-rod-72",
    name: "Project Source 72 in closet rod",
    subtitle:
      "27773PHOLG · 1⁵⁄₁₆ in outside diameter · hollow wall thickness unverified",
    category: "Rods",
    stockKind: "linear",
    wood: false,
    cuttable: true,
    packCount: 1,
    size: [1.3125, 72, 1.3125],
    shape: "tube-envelope",
    productReference: "project-source-27773pholg",
    priceKind: "unpriced",
    color: "#a4a9a6",
    price: 0,
    unit: "rod",
    search: "Project Source 27773PHOLG",
  },
  {
    id: "stud",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    name: "2 × 4 framing lumber",
    subtitle: "1½ × 3½ in actual · 8 ft",
    category: "Lumber",
    size: [1.5, 96, 3.5],
    color: "#c69967",
    price: 4.25,
    unit: "board",
    search: "2x4x8 framing lumber",
  },
  {
    id: "treated",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    name: "Ground-contact 2 × 6",
    subtitle: "1½ × 5½ in actual · 8 ft",
    category: "Lumber",
    size: [1.5, 5.5, 96],
    color: "#89916b",
    price: 9.85,
    unit: "board",
    search: "2x6x8 ground contact pressure treated lumber",
  },
  {
    id: "post",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    name: "4 × 4 treated post",
    subtitle: "3½ × 3½ in actual · 8 ft",
    category: "Lumber",
    size: [3.5, 96, 3.5],
    color: "#aaa07c",
    price: 12.75,
    unit: "post",
    search: "4x4x8 ground contact post",
  },
  {
    id: "plywood",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    name: "¾ in exterior plywood",
    subtitle: "48 × 96 in · exterior grade",
    category: "Panels",
    size: [48, 0.75, 96],
    color: "#d6b889",
    price: 48.5,
    unit: "sheet",
    search: "3/4 exterior plywood 4x8",
  },
  {
    id: "siding",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    name: "Exterior siding panel",
    subtitle: "48 × 96 in · ⅜ in",
    category: "Panels",
    size: [48, 96, 0.375],
    color: "#798a7d",
    price: 38.75,
    unit: "sheet",
    search: "exterior wood siding panel 4x8",
  },
  {
    id: "roof",
    stockKind: "sheet",
    wood: false,
    cuttable: false,
    packCount: 1,
    name: "Corrugated roof panel",
    subtitle: "26 × 96 in · metal",
    category: "Roof & wire",
    size: [26, 0.04, 96],
    color: "#48594e",
    price: 29.5,
    unit: "panel",
    search: "26 in 8 ft corrugated metal roof panel",
  },
  {
    id: "mesh",
    stockKind: "roll",
    wood: false,
    cuttable: false,
    packCount: 1,
    name: "½ in hardware cloth",
    subtitle: "24 in × 25 ft roll",
    category: "Roof & wire",
    size: [24, 36, 0.04],
    stockSize: [24, 300, 0.04],
    color: "#a0aaa2",
    price: 39.9,
    unit: "roll",
    search: "1/2 inch hardware cloth 24 inch 25 ft",
  },
  {
    id: "screw",
    stockKind: "fastener",
    wood: false,
    cuttable: false,
    packCount: 100,
    fastenerLength: 3,
    name: "Exterior wood screws",
    subtitle: "#9 × 3 in · 100 count",
    category: "Fasteners",
    size: [0.2, 3, 0.2],
    color: "#697268",
    price: 13.5,
    unit: "100 pack",
    search: "exterior wood screws 3 inch 100 pack",
  },
  ...(
    [
      ["stud-10", "2 × 4 framing lumber · 10 ft", 1.5, 3.5, 120, 6.75],
      ["stud-12", "2 × 4 framing lumber · 12 ft", 1.5, 3.5, 144, 8.25],
      ["two-two", "2 × 2 lumber", 1.5, 1.5, 96, 4.25],
      ["two-six", "2 × 6 framing lumber", 1.5, 5.5, 96, 7.5],
      ["two-eight", "2 × 8 framing lumber", 1.5, 7.25, 96, 10.5],
      ["one-two", "1 × 2 board", 0.75, 1.5, 96, 3.75],
      ["one-four", "1 × 4 board", 0.75, 3.5, 96, 6.5],
      ["one-six", "1 × 6 board", 0.75, 5.5, 96, 9.5],
    ] as [MaterialId, string, number, number, number, number][]
  ).map(([id, name, thickness, width, length, price]): Material => ({
    id,
    name,
    subtitle: `${thickness} × ${width} in actual · ${length / 12} ft`,
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [thickness, length, width],
    color: "#c69967",
    price,
    unit: "board",
    search: name.replaceAll(" × ", "x"),
  })),
  {
    id: "plywood-half",
    name: "½ in plywood · 15/32 in actual",
    subtitle: "48 × 96 in · 15/32 in modeled thickness",
    category: "Panels",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [48, 15 / 32, 96],
    color: "#d6b889",
    price: 32,
    unit: "sheet",
    search: "15/32 plywood 4x8",
  },
  ...(
    [
      [
        "screw-short",
        "1¼ in wood screws",
        1.25,
        0.16,
        8.5,
        "wood screws 1-1/4 inch 100 pack",
      ],
      [
        "connector-screw",
        "1½ in connector screws",
        1.5,
        0.18,
        14,
        "connector screws 1-1/2 inch 100 pack",
      ],
      [
        "nail",
        "3 in framing nails",
        3,
        0.13,
        7,
        "framing nails 3 inch 100 count",
      ],
    ] as [MaterialId, string, number, number, number, string][]
  ).map(([id, name, length, diameter, price, search]): Material => ({
    id,
    name,
    subtitle: `${length} in long · 100 count · verify grade/finish`,
    category: "Fasteners",
    stockKind: "fastener",
    wood: false,
    cuttable: false,
    packCount: 100,
    fastenerLength: length,
    size: [diameter, length, diameter],
    color: "#697268",
    price,
    unit: "100 pack",
    search,
  })),
  {
    id: "bracket",
    name: "2 in angle bracket",
    subtitle: "2 × 2 × 1½ in envelope · specify fasteners separately",
    category: "Brackets",
    stockKind: "connector",
    wood: false,
    cuttable: false,
    packCount: 1,
    size: [2, 2, 1.5],
    color: "#697268",
    price: 3.5,
    unit: "each",
    search: "2 inch angle bracket",
  },
  {
    id: "sd9112r100",
    connectorFastener: true,
    name: "Simpson SD #9 × 1½ in connector screws",
    subtitle: "SD9112R100 · 100 count · .370 in head / .130 in shank",
    category: "Fasteners",
    stockKind: "fastener",
    wood: false,
    cuttable: false,
    packCount: 100,
    fastenerType: "screw",
    fastenerLength: 1.5,
    headDiameter: 0.37,
    shankDiameter: 0.13,
    productReference: "simpson-sd9112r100",
    priceKind: "unpriced",
    size: [0.37, 1.5, 0.37],
    color: "#89918a",
    price: 0,
    unit: "100 pack",
    search: "Simpson SD9112R100",
  },
  {
    id: "n10dhdg-r",
    connectorFastener: true,
    name: "Simpson 1½ in connector nails",
    subtitle: "N10DHDG-R · 120 count · .310 in head / .148 in shank",
    category: "Fasteners",
    stockKind: "fastener",
    wood: false,
    cuttable: false,
    packCount: 120,
    fastenerType: "nail",
    fastenerLength: 1.5,
    headDiameter: 0.31,
    shankDiameter: 0.148,
    productReference: "simpson-n10dhdg-r",
    priceKind: "unpriced",
    size: [0.31, 1.5, 0.31],
    color: "#89918a",
    price: 0,
    unit: "120 pack",
    search: "Simpson N10DHDG-R",
  },
  {
    id: "hd-purebond-birch-188",
    placementOnly: true,
    name: "PureBond birch plywood · 0.188 in actual",
    subtitle: "165891 · 48 × 96 in · interior · manual placement only",
    category: "Panels",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [48, 0.188, 96],
    color: "#d7c39b",
    productReference: "hd-purebond-birch-188-165891",
    priceKind: "unpriced",
    price: 0,
    unit: "sheet",
    search: "PureBond birch 165891 100092485",
  },
  {
    id: "hd-purebond-birch-453",
    placementOnly: true,
    name: "PureBond birch plywood · 0.453 in actual",
    subtitle: "833185 · 48 × 96 in · interior · manual placement only",
    category: "Panels",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [48, 0.453, 96],
    color: "#d7c39b",
    productReference: "hd-purebond-birch-453-833185",
    priceKind: "unpriced",
    price: 0,
    unit: "sheet",
    search: "PureBond birch 833185 100020218",
  },
  {
    id: "jm-u1330-batt",
    name: "Johns Manville U1330 R-13 unfaced wall batt",
    subtitle: "15 × 93 in · 3½ in thick · 11 batts per bag",
    category: "Panels",
    stockKind: "sheet",
    wood: false,
    cuttable: true,
    packCount: 11,
    size: [15, 3.5, 93],
    shape: "insulation-batt",
    productReference: "johns-manville-u1330",
    color: "#e8d9a9",
    priceKind: "unpriced",
    price: 0,
    unit: "bag",
    search: "fiberglass batt insulation Johns Manville JM U1330 R13",
  },
  {
    id: cedarbrookLining.materialId,
    name: "Cedarbrook 6 ft tongue-and-groove cedar",
    subtitle: "3 in installed reveal · 3⅜ in full width · 11/16 in thick · 6 boards per bundle",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: cedarbrookLining.packCount,
    size: [cedarbrookLining.length, cedarbrookLining.reveal, cedarbrookLining.thickness],
    stockSize: [cedarbrookLining.length, cedarbrookLining.fullWidth, cedarbrookLining.thickness],
    productReference: cedarbrookLining.productId,
    color: "#cf8f66",
    priceKind: "unpriced",
    price: 0,
    unit: "bundle",
    search: "Cedarbrook sauna 6-1X4-TNG",
  },
  {
    id: cedarbrookDoor.materialId,
    name: cedarbrookDoor.label,
    subtitle: "24 × 76 in rough opening · no window or threshold",
    category: "Doors",
    stockKind: "equipment",
    shape: "door-leaf-envelope",
    wood: false,
    cuttable: false,
    packCount: 1,
    size: [cedarbrookDoor.leafWidth, cedarbrookDoor.leafHeight, cedarbrookDoor.leafDepth],
    productReference: cedarbrookDoor.productId,
    color: "#c48e62",
    priceKind: "unpriced",
    price: 0,
    unit: "kit",
    search: cedarbrookDoor.productCode,
  },
  {
    id: measuredDoorMaterial,
    name: "Field-measured prehung door",
    subtitle: "Measure the unit and hinge line in the doorway planner",
    category: "Doors", stockKind: "equipment", shape: "door-leaf-envelope", wood: false, cuttable: false, packCount: 1, measuredEquipment: true,
    size: interiorDoor.leaf, color: "#f0e5d6", priceKind: "unpriced", price: 0, unit: "kit", search: "interior prehung door",
  },
  {
    id: interiorDoor.materialId,
    name: "Masonite 75777 prehung door",
    subtitle: "30 × 80 in leaf · right hand · adjustable split jamb",
    category: "Doors", stockKind: "equipment", shape: "door-leaf-envelope", wood: false, cuttable: false, packCount: 1,
    size: interiorDoor.leaf, color: "#f0e5d6", productReference: interiorDoor.productId, priceKind: "unpriced", price: 0, unit: "kit", search: "Masonite 75777 301300984",
  },
  {
    id: doorJambMaterial,
    name: "Included door jamb",
    subtitle: "Fitted frame component",
    category: "Doors", stockKind: "equipment", wood: false, cuttable: false, packCount: 1, includedComponent: true, measuredEquipment: true,
    size: [0.625, 81, 4.5], color: "#d5c8b6", priceKind: "unpriced", price: 0, unit: "piece", search: "interior door jamb",
  },
  ...(Object.keys(pexPipes) as PexPipeId[]).map((id): Material => {
    const pipe = pexPipes[id];
    return {
      id, name: `SharkBite ${pipe.nominal} in PEX-B`, subtitle: `10 ft straight · ${pipe.outside} in outside diameter`,
      category: "Plumbing", stockKind: "linear", wood: false, cuttable: true, packCount: 1, shape: "tube-envelope",
      size: [pipe.outside, pexStockLength, pipe.outside],
      color: "#e6e9eb", productReference: id, priceKind: "unpriced", price: 0, unit: "stick",
      search: `pex plumbing potable tubing ${pipe.model}`,
    };
  }),
  {
    id: nailShield.id, name: "Simpson Strong-Tie NS1 nail shield", subtitle: "1½ × 3 in · single plate",
    category: "Plumbing", stockKind: "equipment", wood: false, cuttable: false, packCount: 1,
    size: [nailShield.width, nailShield.length, nailShield.thickness],
    color: "#a7b2be", productReference: nailShield.productId, priceKind: "unpriced", price: 0, unit: "plate", search: "ns1 steel nail plate shield pipe",
  },
  ...waterFittingIds.map((id): Material => {
    const record = waterFittingProducts[id];
    return {
      id, name: waterFittingName(id), subtitle: record.model,
      category: "Plumbing", stockKind: "equipment", wood: false, cuttable: false, packCount: 1, measuredEquipment: true,
      size: waterFittingDimensions(id), color: "#ba9252", productReference: id, priceKind: "unpriced", price: 0,
      unit: "fitting", search: `pex line water plumbing brass fitting ${record.model}`,
    };
  }),
  {
    id: waterStop.id, name: waterStop.name, subtitle: waterStop.model, category: "Plumbing",
    stockKind: "equipment", wood: false, cuttable: false, measuredEquipment: true, packCount: 1,
    size: waterStop.size, color: "#9ca9ae", productReference: waterStop.id, priceKind: "unpriced",
    price: 0, unit: "valve", search: "sharkbite pex stop shutoff angle valve kitchenette water fixture ur23036",
  },
  {
    id: sinkTrap.id, name: sinkTrap.name, subtitle: sinkTrap.model, category: "Plumbing",
    stockKind: "equipment", wood: false, cuttable: false, measuredEquipment: true, packCount: 1,
    size: sinkTrap.nominal, color: "#e9ebe1", productReference: sinkTrap.id,
    priceKind: "unpriced", price: 0, unit: "kit", search: "oatey HDC9704B sink drainage p-trap kitchen waste",
  },
  {
    id: sinkTrap.tube, name: "Oatey 1½ in trap wall tube", subtitle: "Straight end included with HDC9704B",
    category: "Plumbing", stockKind: "linear", wood: false, cuttable: true, packCount: 1, includedComponent: true,
    shape: "tube-envelope", size: [sinkTrap.diameter, 12, sinkTrap.diameter], color: "#eff0e5",
    priceKind: "unpriced", price: 0, unit: "tube", search: "included sink wall tube",
  },
  ...waterSupportIds.map((id): Material => ({
    id, name: waterSupportName(id), subtitle: `${waterSupportProducts[id].model} · 15 per jar`,
    category: "Plumbing", stockKind: "equipment", wood: false, cuttable: false,
    packCount: waterSupportReference.packCount, measuredEquipment: true,
    size: [waterSupportReference.depth, waterSupportReference.flangeHeight, waterSupportReference.flangeWidth],
    color: "#709984", productReference: id, priceKind: "unpriced", price: 0, unit: "jar",
    search: `PEX tubing support through stud isolator ${waterSupportProducts[id].model}`,
  })),
  ...cedarbrookBenches.map((bench): Material => ({
    id: bench.materialId,
    name: `Cedarbrook ${bench.length / 12} ft pedestal sauna bench`,
    subtitle: "Freestanding cedar kit · 18 in high × 18 in deep",
    category: "Seating",
    stockKind: "equipment",
    shape: "pedestal-bench-envelope",
    wood: false,
    cuttable: false,
    packCount: 1,
    size: [bench.length, cedarbrookBenchSize.height, cedarbrookBenchSize.depth],
    productReference: bench.productId,
    color: "#c28d59",
    priceKind: "unpriced",
    price: 0,
    unit: "kit",
    search: bench.productCode,
  })),
  {
    id: cedarbrookFoil.materialId,
    name: "Cedarbrook sauna foil vapor barrier",
    subtitle: "54 in delivered width · quote by planned length",
    category: "Panels",
    stockKind: "roll",
    wood: false,
    cuttable: false,
    packCount: 1,
    orderRollWidth: cedarbrookFoil.rollWidth,
    size: [48, cedarbrookFoil.rollWidth, cedarbrookFoil.modelThickness],
    productReference: cedarbrookFoil.productId,
    color: "#a7b3bc",
    priceKind: "unpriced",
    price: 0,
    unit: "linear ft",
    search: cedarbrookFoil.productCode,
  },
  {
    id: saunaCeilingBatt.materialId,
    name: "Owens Corning C84A R-30 unfaced ceiling batt",
    subtitle: "16 × 48 in · 9½ in thick · 10 batts per bag",
    category: "Panels",
    stockKind: "sheet",
    shape: "insulation-batt",
    wood: false,
    cuttable: true,
    packCount: saunaCeilingBatt.packCount,
    size: [saunaCeilingBatt.width, saunaCeilingBatt.thickness, saunaCeilingBatt.length],
    productReference: saunaCeilingBatt.productId,
    color: "#eebdc8",
    priceKind: "unpriced",
    price: 0,
    unit: "bag",
    search: "Owens Corning C84A R30 unfaced fiberglass insulation batt",
  },
  ...saunaCeilingJoists.map((joist): Material => ({
    id: joist.materialId,
    name: joist.name,
    subtitle: "1½ × 11¼ × 96 in actual · kiln-dried",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...saunaCeilingJoistSize],
    productReference: joist.productId,
    color: "#c29057",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: joist.model,
  })),
  {
    id: everbiltClosetRod.materialId,
    name: "Everbilt 96 in closet rod",
    subtitle: "320V · 1.31 in listed outside diameter · tube envelope",
    category: "Rods",
    stockKind: "linear",
    wood: false,
    cuttable: true,
    packCount: 1,
    size: [...everbiltClosetRod.stockSize],
    shape: "tube-envelope",
    productReference: everbiltClosetRod.productId,
    priceKind: "unpriced",
    color: "#dadcd2",
    price: 0,
    unit: "rod",
    search: everbiltClosetRod.model,
  },
  {
    id: greenhouseBaseTimber.materialId,
    name: "Ground-contact 4 × 4 · Home Depot",
    subtitle: "194354 · #2 treated SYP · 3½ × 3½ in actual · 8 ft",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...greenhouseBaseTimber.size],
    productReference: greenhouseBaseTimber.productId,
    color: "#a78d60",
    priceKind: "unpriced",
    price: 0,
    unit: "timber",
    search: "194354 205220341 256276 4x4 pressure treated ground contact post timber",
  },
  {
    id: greenhouseBaseTimber12.materialId,
    name: "Ground-contact 4 × 4 · 12 ft · Home Depot",
    subtitle: "Cedar-tone treated SYP · 3½ × 3½ in actual · 12 ft",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...greenhouseBaseTimber12.size],
    productReference: greenhouseBaseTimber12.productId,
    color: "#9d7349",
    priceKind: "unpriced",
    price: 0,
    unit: "timber",
    search: "159740 203982343 1000004800 4x4 cedar tone pressure treated ground contact timber",
  },
  {
    id: owensCorningWallBatt.materialId,
    name: "Owens Corning ME22 R-15 unfaced wall batt",
    subtitle: "15 × 93 in · 3½ in thick · 8 batts per bag",
    category: "Panels",
    stockKind: "sheet",
    shape: "insulation-batt",
    wood: false,
    cuttable: true,
    packCount: owensCorningWallBatt.packCount,
    size: [...owensCorningWallBatt.size],
    productReference: owensCorningWallBatt.productId,
    color: "#eebdc8",
    priceKind: "unpriced",
    price: 0,
    unit: "bag",
    search: "Owens Corning ME22 R15 unfaced wall batt",
  },
  {
    id: cedarDoorStop.materialId,
    name: "Cedar 1 × 2 · Home Depot",
    subtitle: "¾ × 1½ in actual · 8 ft · tight-knot cedar",
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...cedarDoorStop.size],
    productReference: cedarDoorStop.productId,
    placementOnly: true,
    color: "#aa7654",
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: "206460933 161895 C BP102K08 cedar stop trim board 1x2",
  },
  {
    id: pureBondCasework.materialId,
    name: pureBondCasework.name,
    subtitle: "48 × 96 in · unfinished birch veneer · dry interiors",
    category: "Panels",
    stockKind: "sheet",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...pureBondCasework.stockSize],
    color: "#ddc49d",
    productReference: pureBondCasework.registryId,
    priceKind: "unpriced",
    price: 0,
    unit: "sheet",
    search: `PureBond birch ${pureBondCasework.model} ${pureBondCasework.internetNumber}`,
  },
  ...Object.values(homeDepotFraming).map((record): Material => ({
    id: record.materialId,
    name: `${record.name} · ${record.stockSize[1] / 12} ft`,
    subtitle: record.subtitle,
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...record.stockSize],
    color: "#cda77c",
    productReference: record.registryId,
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: `${record.internetNumber} ${record.model} ${record.storeSku}`,
  })),
  ...homeDepotTreatedLumber.map((record): Material => ({
    id: record.materialId,
    name: `${record.name} · Home Depot · ${record.size[2] / 12} ft`,
    subtitle: `1½ × ${String(record.size[1]).replace(/\.5$/, "½")} in actual · ground contact`,
    category: "Lumber",
    stockKind: "linear",
    wood: true,
    cuttable: true,
    packCount: 1,
    size: [...record.size],
    color: "#89916b",
    productReference: treatedLumberProductId(record),
    placementOnly: true,
    priceKind: "unpriced",
    price: 0,
    unit: "board",
    search: `pressure treated ground contact ${record.family.replace("treated-", "")} ${record.internetNumber} ${record.model} ${record.storeSku}`,
  })),
  {
    id: subfloorPanel.id,
    name: subfloorPanel.name,
    subtitle: "47.875 × 95.875 in · 0.703 in actual thickness",
    category: "Panels", wood: true, stockKind: "sheet", cuttable: true, packCount: 1,
    size: subfloorPanel.size, color: "#ba9160", productReference: subfloorPanel.id,
    price: 0, priceKind: "unpriced", unit: "sheet", search: "osb subfloor tongue groove t&g sturd-i-floor 486701",
  },
  ...drywallStock.map(({ id, length, model, internet }): Material => ({
    id,
    name: `½ in drywall · ${length / 12} ft`,
    subtitle: "USG Sheetrock UltraLight · interior wall and ceiling gypsum panel",
    category: "Panels",
    stockKind: "sheet",
    cuttable: true,
    wood: false,
    packCount: 1,
    size: [48, 0.5, length],
    color: "#e4decd",
    productReference: id,
    price: 0,
    priceKind: "unpriced",
    unit: "sheet",
    search: `gypsum plasterboard sheetrock ultralight wall ceiling ${model} ${internet}`,
  })),
  {
    id: libertyBarPull.id,
    name: libertyBarPull.name,
    subtitle: "96 mm mounting centers · polished chrome",
    category: "Hardware", stockKind: "equipment", cuttable: false, wood: false, packCount: 1,
    productReference: libertyBarPull.id, placementOnly: true,
    size: [...libertyBarPull.size], color: "#a9b2ba",
    price: 0, priceKind: "unpriced", unit: "each",
    search: "handle drawer cabinet pull 96 mm liberty solid bar P01012-PC-C",
  },
];
export const material = (id: MaterialId) => catalog.find((m) => m.id === id)!;
export function canPlanWoodKerf(id: MaterialId) {
  const stock = material(id);
  return stock.wood && stock.cuttable &&
    stock.shape !== "insulation-batt" &&
    (stock.stockKind === "linear" || stock.stockKind === "sheet");
}
export const isHardware = (id: MaterialId) =>
  ["fastener", "connector"].includes(material(id).stockKind);
export const isBatt = (id: MaterialId) =>
  material(id).shape === "insulation-batt";
export const uid = () => crypto.randomUUID();
export function step(title: string, notes = ""): Step {
  return { id: uid(), title, notes, complete: false };
}
export function part(
  name: string,
  material: MaterialId,
  size: V3,
  position: V3,
  stepId: string,
  assembly: string,
  rotation: V3 = [0, 0, 0],
): Piece {
  return {
    id: uid(),
    name,
    material,
    size,
    position,
    stepId,
    assembly,
    rotation,
    stockLengthAxis:
      catalog.find((m) => m.id === material)?.orderRollWidth
        ? 0
        : catalog.find((m) => m.id === material)?.shape === "tube-envelope"
        ? 1
        : isBatt(material) ? 2 : null,
    offcut: false,
    cutStock: null,
    cutPlanes: [],
  };
}
export function blank(name = "Untitled project"): Project {
  const s = step(
    "Lay out your project",
    "Establish the site, dimensions, and constraints before placing parts.",
  );
  return {
    schemaVersion: PROJECT_FORMAT_VERSION,
    id: uid(),
    name,
    kind: "custom",
    retailer: "home-depot",
    toolSelections: [],
    supplies: [],
    attachmentPlans: [],
    restraintPlans: [],
    fastenerPlans: [],
    lidHingePlans: [],
    hingeStockSources: [],
    connectorPlans: [],
    connectorPlanLabels: [],
    hingePlanLabels: [],
    fastenerPlanLabels: [],
    partLabels: [],
    supplyInventory: [],
    zip: "84121",
    store: "",
    updatedAt: new Date().toISOString(),
    pieces: [],
    steps: [s],
    joints: [],
    inventory: [],
    planLines: [],
    notes: "",
    history: [],
    sections: [],
    ideaBindings: [],
    workZone: null,
    guideFingerprint: null,
  };
}
export function wallParts(
  width: number,
  height: number,
  spacing: number,
  stepId: string,
  origin: V3 = [0, 0, 0],
  assembly = "Wall",
  stock?: (typeof wallFramingStockIds)[number],
): Piece[] {
  const [x, y, z] = origin;
  const materialId = stock ?? "stud";
  const depth = framingStockDimensions(materialId).depth;
  const pieces = [
    part(
      `${assembly} · bottom plate`,
      materialId,
      [width, 1.5, depth],
      [x, y + 0.75, z],
      stepId,
      assembly,
    ),
    part(
      `${assembly} · top plate`,
      materialId,
      [width, 1.5, depth],
      [x, y + height - 0.75, z],
      stepId,
      assembly,
    ),
  ];
  const legacyLocations = [0.75];
  for (let c = spacing; c < width - 1.5; c += spacing) legacyLocations.push(c);
  legacyLocations.push(width - 0.75);
  const locations = stock ? wallStudPositions(width, spacing) : legacyLocations.map((offset) => offset - width / 2);
  locations.forEach((offset, i) =>
    pieces.push(
      part(
        `${assembly} · stud ${i + 1}`,
        materialId,
        [1.5, height - 3, depth],
        [x + offset, y + height / 2, z],
        stepId,
        assembly,
      ),
    ),
  );
  return pieces;
}
export function framingStockDimensions(stock: (typeof wallFramingStockIds)[number]) {
  const board = material(stock);
  const [, depth, length] = [...(board.stockSize ?? board.size)].sort((a, b) => a - b);
  return { depth, length };
}
export function coop(): Project {
  const p = blank("The backyard coop");
  p.kind = "coop";
  p.steps = [
    step(
      "Set the foundation",
      "Concept layout: confirm site setbacks, soil bearing, frost requirements, and an appropriate anchored foundation.",
    ),
    step(
      "Frame the floor",
      "Check the frame for square. Specify connections and support spacing before construction.",
    ),
    step(
      "Raise the walls",
      "Fit the wall frames to the floor. Door, ventilation, and bracing design still need review.",
    ),
    step(
      "Add siding & roof",
      "The roof and siding are schematic. Confirm pitch, flashing, weather sealing, and snow/wind design.",
    ),
    step(
      "Finish & secure",
      "Plan predator protection, ventilation, roosts, nesting boxes, doors, and hardware before housing birds.",
    ),
  ];
  const [f, fl, w, en, fi] = p.steps.map((s) => s.id);
  for (const x of [-30, 30])
    for (const z of [-22, 22])
      p.pieces.push(
        part(
          "Foundation post",
          "post",
          [3.5, 18, 3.5],
          [x, 9, z],
          f,
          "Foundation",
        ),
      );
  for (const z of [-22.75, 22.75])
    p.pieces.push(
      part(
        "Floor rim joist",
        "treated",
        [72, 5.5, 1.5],
        [0, 20.75, z],
        fl,
        "Floor",
      ),
    );
  for (let x = -35.25; x <= 36; x += 17.625)
    p.pieces.push(
      part(
        "Floor joist",
        "treated",
        [1.5, 5.5, 44],
        [x, 20.75, 0],
        fl,
        "Floor",
      ),
    );
  p.pieces.push(
    part("Floor deck", "plywood", [72, 0.75, 48], [0, 23.875, 0], fl, "Floor"),
  );
  p.pieces.push(...wallParts(72, 48, 16, w, [0, 24.25, -22.25], "Back wall"));
  for (const x of [-34.25, 34.25]) {
    const ps = wallParts(
      41,
      48,
      16,
      w,
      [0, 24.25, 0],
      x < 0 ? "Left wall" : "Right wall",
    );
    for (const a of ps) {
      a.position = [x, a.position[1], -a.position[0] || 0];
      a.rotation = [0, Math.PI / 2, 0];
    }
    p.pieces.push(...ps);
  }
  p.pieces.push(
    part(
      "Front bottom plate",
      "stud",
      [72, 1.5, 3.5],
      [0, 25, 22.25],
      w,
      "Front wall",
    ),
    part(
      "Front top plate",
      "stud",
      [72, 1.5, 3.5],
      [0, 71.5, 22.25],
      w,
      "Front wall",
    ),
  );
  for (const x of [-35.25, -20, 4, 20, 35.25])
    p.pieces.push(
      part(
        "Front wall stud",
        "stud",
        [1.5, 45, 3.5],
        [x, 48.25, 22.25],
        w,
        "Front wall",
      ),
    );
  p.pieces.push(
    part(
      "Back siding",
      "siding",
      [72, 48, 0.375],
      [0, 48.25, -24.2],
      en,
      "Enclosure",
    ),
    part(
      "Left siding",
      "siding",
      [0.375, 48, 48],
      [-36.2, 48.25, 0],
      en,
      "Enclosure",
    ),
    part(
      "Right siding",
      "siding",
      [0.375, 48, 48],
      [36.2, 48.25, 0],
      en,
      "Enclosure",
    ),
  );
  p.pieces.push(
    part(
      "Front siding · left",
      "siding",
      [16, 48, 0.375],
      [-28, 48.25, 24.2],
      en,
      "Enclosure",
    ),
    part(
      "Front siding · right",
      "siding",
      [32, 48, 0.375],
      [20, 48.25, 24.2],
      en,
      "Enclosure",
    ),
    part(
      "Door header siding",
      "siding",
      [24, 12, 0.375],
      [-8, 66.25, 24.2],
      en,
      "Enclosure",
    ),
  );
  // An intentionally open doorway keeps the interior and assembly legible.
  for (const side of [-1, 1]) {
    const angle = -side * 0.42;
    for (const [width, offset] of [
      [26, -8.5],
      [17, 13],
    ])
      p.pieces.push(
        part(
          `${side < 0 ? "Left" : "Right"} roof panel`,
          "roof",
          [width, 0.04, 58],
          [
            side * 19.5 + Math.cos(angle) * offset,
            82.5 + Math.sin(angle) * offset,
            0,
          ],
          en,
          "Roof",
          [0, 0, angle],
        ),
      );
  }
  p.pieces.push(
    part(
      "Access ramp",
      "plywood",
      [18, 0.75, 43],
      [-8, 12, 43],
      fi,
      "Access ramp",
      [0.58, 0, 0],
    ),
  );
  for (let i = 0; i < 6; i++)
    p.pieces.push(
      part(
        "Ramp cleat",
        "stud",
        [18, 0.75, 1.5],
        [-8, 12 - (28 + i * 5 - 43) * Math.tan(0.58) + 0.7, 28 + i * 5],
        fi,
        "Access ramp",
        [0.58, 0, 0],
      ),
    );
  const names = [...new Set(p.pieces.map((a) => a.assembly))];
  p.sections = names.map((name) => {
    const members = p.pieces.filter((a) => a.assembly === name);
    let generator: Command | null = null,
      origin: V3 = [0, 0, 0],
      rotation: V3 = [0, 0, 0];
    if (name === "Back wall") {
      generator = {
        type: "wall",
        width: 72,
        height: 48,
        depth: 48,
        spacing: 16,
      };
      origin = [0, 24.25, -22.25];
    }
    if (name === "Left wall" || name === "Right wall") {
      generator = {
        type: "wall",
        width: 41,
        height: 48,
        depth: 48,
        spacing: 16,
      };
      origin = [name === "Left wall" ? -34.25 : 34.25, 24.25, 0];
      rotation = [0, Math.PI / 2, 0];
    }
    if (!generator)
      origin = [0, 1, 2].map(
        (i) =>
          members.reduce((sum, a) => sum + a.position[i], 0) / members.length,
      ) as V3;
    return {
      id: uid(),
      name,
      pieceIds: members.map((a) => a.id),
      origin,
      rotation,
      generator,
      recipe: null,
    };
  });
  p.notes =
    "Concept study, not a finished construction plan. Openings, roof framing, gables, anchors, weatherproofing, predator protection, and connections need detailing.";
  return p;
}
/** Generate a local assembly and transform every part into its section frame. */
export function sectionParts(
  command: SectionCommand,
  stepId: string,
  name: string,
  origin: V3,
  rotation: V3,
): Piece[] {
  let pieces: Piece[] = [];
  if (command.type === "wall" && command.doorOpening) {
    const stock = command.wallStock ?? "stud";
    const { depth } = framingStockDimensions(stock);
    pieces = doorwayTemplate(command, command.doorOpening, depth, command.doorUnit).map((member) => ({
      ...part(`${name} · ${member.name}`, member.material ?? stock, member.size, member.position, stepId, name),
      designRole: member.role,
    }));
  } else if (command.type === "wall" && command.windowOpening) {
    const stock = command.windowOpening.stock ?? command.wallStock ?? "stud";
    const { depth } = framingStockDimensions(stock);
    pieces = windowWallTemplate(command, command.windowOpening, depth).map((member) => ({
      ...part(`${name} · ${member.name}`, stock, member.size, member.position, stepId, name),
      designRole: member.role,
    }));
  } else if (command.type === "wall") {
    pieces = wallParts(
      command.width,
      command.height,
      command.spacing,
      stepId,
      [0, 0, 0],
      name,
      command.wallStock,
    );
    if (command.wallStock) pieces = pieces.map((piece, index) => ({
      ...piece,
      designRole: ["wall-bottom-plate", "wall-top-plate"][index] ?? `wall-stud-${index - 1}`,
    }));
  } else if (command.type === "foundation") {
    const lengths = baseMemberLengths(command);
    const depth = baseBoardDepth(command.baseStock?.rim);
    for (const [side, z] of [["back", -command.depth / 2 + 0.75], ["front", command.depth / 2 - 0.75]] as const)
      pieces.push(
        { ...part(
          `${name} · rim`,
          command.baseStock?.rim ?? "treated",
          [lengths.rim, depth, 1.5],
          [0, depth / 2, z],
          stepId,
          name,
        ), designRole: floorBaseRoles[side] },
      );
    for (const x of floorBaseJoistCenters(command.width, command.spacing))
      pieces.push(
        { ...part(
          `${name} · joist`,
          command.baseStock?.joist ?? "treated",
          [1.5, depth, lengths.joist],
          [x, depth / 2, 0],
          stepId,
          name,
        ), designRole: floorBaseRoles.joist },
      );
  } else
    throw Error(
      "Use the coop command for a whole project, not an individual section.",
    );
  return pieces.map((p) => ({
    ...p,
    position: rotate(p.position, rotation).map((v, i) => v + origin[i]) as V3,
    rotation: composeRotation(rotation, p.rotation),
  }));
}
export function commandStepTitle(command: Command) {
  return command.type === "wall"
    ? `Frame a ${format(command.width)} × ${format(command.height)} wall${command.windowOpening ? " with a window opening" : command.doorOpening ? " with a doorway" : ""}`
    : `Lay a ${format(command.width)} × ${format(command.depth)} base`;
}
export function syncDoorwayMotion(project: Project, sectionId: string): Project {
  const section = project.sections.find(({ id }) => id === sectionId);
  const unit = section?.generator?.doorUnit;
  const existing = project.motionPlans?.find(({ mechanism }) => mechanism.kind === "hinge" && mechanism.doorway?.sectionId === sectionId);
  if (!unit) return existing ? { ...project, motionPlans: project.motionPlans?.filter(({ id }) => id !== existing.id) } : project;
  const leaf = project.pieces.find(({ id, designRole }) => designRole === doorwayLeafRole && section.pieceIds.includes(id));
  if (!leaf) throw Error("The fitted door has no active leaf.");
  if (!existing && (project.motionPlans?.length ?? 0) >= 50) throw Error("The project already has 50 motion plans. Remove an unused motion before adding the door swing.");
  const plan = motionPlanSchema.parse({
    ...existing,
    id: existing?.id ?? uid(),
    label: `${section.name}: interior door swing`.slice(0, 100),
    memberIds: [leaf.id],
    mechanism: { ...doorwayHinge(unit), doorway: { sectionId } },
  });
  return { ...project, motionPlans: existing
    ? project.motionPlans?.map((row) => row.id === existing.id ? plan : row)
    : [...(project.motionPlans ?? []), plan] };
}
export function applyCommand(
  project: Project,
  raw: SectionCommand,
  targetSectionId?: string,
  placement?: { origin: V3; rotation: V3; stepNotes: string; roomFraming?: Section["roomFraming"] },
): Project {
  let command = sectionCommandSchema.parse(raw);
  if (targetSectionId) {
    const section = project.sections.find((s) => s.id === targetSectionId);
    if (!section?.generator)
      throw Error("Choose a generated wall or base section to regenerate.");
    if (command.type !== section.generator.type)
      throw Error(
        "A targeted command must keep the section type. Add a new section to change its type.",
      );
    if (command.type === "foundation" && !command.baseStock && section.generator.baseStock) {
      command = sectionCommandSchema.parse({ ...command, baseStock: section.generator.baseStock });
    }
    if (command.type === "wall") {
      const wallStock = command.wallStock ?? section.generator.wallStock;
      const windowOpening = command.windowOpening === undefined ? section.generator.windowOpening : command.windowOpening;
      const doorOpening = command.doorOpening === undefined ? section.generator.doorOpening : command.doorOpening;
      const doorUnit = doorOpening && (command.doorUnit === undefined ? section.generator.doorUnit : command.doorUnit);
      command = sectionCommandSchema.parse({
        ...command,
        ...(wallStock && { wallStock }),
        ...(windowOpening !== undefined && { windowOpening }),
        ...(doorOpening !== undefined && { doorOpening }),
        ...(doorOpening && doorUnit !== undefined && { doorUnit }),
      });
    }
    const oldIds = new Set(section.pieceIds);
    const existing = project.pieces.filter(({ id }) => oldIds.has(id));
    if (!existing.length) throw Error("The section has no active parts. Choose a wall or base with framing.");
    const stepId = existing[0].stepId;
    const generated = sectionParts(
      command,
      stepId,
      section.name,
      section.origin,
      section.rotation,
    );
    const keepMatchingParts = (command.windowOpening && section.generator.windowOpening) || command.doorOpening || section.generator.doorOpening ||
      (command.wallStock && section.generator.wallStock) || project.waterRuns?.some((run) => run.sectionId === section.id);
    const pieces = keepMatchingParts ? generated.map((candidate) => {
      const prior = existing.find((piece) =>
        piece.designRole === candidate.designRole && piece.material === candidate.material &&
        !piece.offcut && !piece.cutPlanes.length && pieceThroughOpenings(piece).every((opening) =>
          "source" in opening && opening.source && "waterRunId" in opening.source) &&
        piece.size.every((n, i) => Math.abs(n - candidate.size[i]) < 1e-7) &&
        piece.position.every((n, i) => Math.abs(n - candidate.position[i]) < 1e-7) &&
        piece.rotation.every((n, i) => Math.abs(n - candidate.rotation[i]) < 1e-7));
      return prior ?? candidate;
    }) : generated;
    const removed = new Set(oldIds);
    for (const { id } of pieces) removed.delete(id);
    return syncDoorwayMotion({
      ...project,
      pieces: [...project.pieces.filter((a) => !oldIds.has(a.id)), ...pieces],
      joints: project.joints.filter(
        (j) => !removed.has(j.a) && !removed.has(j.b),
      ),
      steps: project.steps.map((step) =>
        step.id === stepId &&
        step.title === commandStepTitle(section.generator!) &&
        project.pieces
          .filter((a) => a.stepId === stepId)
          .every((a) => oldIds.has(a.id))
          ? { ...step, title: commandStepTitle(command),
            notes: command.doorOpening && !step.notes.includes(doorwayGuideNote) ? `${step.notes}\n\n${doorwayGuideNote}`.trim()
              : !command.doorOpening && section.generator?.doorOpening ? step.notes.replace(doorwayGuideNote, "").trim() : step.notes }
          : step,
      ),
      sections: project.sections.map((s) =>
        s.id === section.id
          ? { ...s, generator: command, pieceIds: pieces.map((a) => a.id) }
          : s,
      ),
    }, section.id);
  }
  if (command.type === "coop") {
    const p = coop();
    p.id = project.id;
    p.zip = project.zip;
    p.store = project.store;
    p.inventory = project.inventory;
    p.history = project.history;
    return p;
  }
  const p = structuredClone(project),
    s = step(
      commandStepTitle(command),
      placement?.stepNotes ?? (command.windowOpening ? windowWallScope : command.doorOpening ? doorwayGuideNote
        : "Generated concept. Review connections, support, bracing, and stock dimensions."),
    );
  p.steps.push(s);
  // Rotated parts need their world bounds when finding free ground beside the project.
  const maxX = placement ? 0 : p.pieces.reduce(
    (max, a) =>
      Math.max(
        max,
        ...[-1, 1].flatMap((x) =>
          [-1, 1].flatMap((y) =>
            [-1, 1].map(
              (z) =>
                a.position[0] +
                rotate(
                  [
                    (x * a.size[0]) / 2,
                    (y * a.size[1]) / 2,
                    (z * a.size[2]) / 2,
                  ],
                  a.rotation,
                )[0],
            ),
          ),
        ),
      ),
    -command.width / 2 - 12,
  );
  const origin: V3 = placement?.origin ?? [
    p.pieces.length ? maxX + command.width / 2 + 12 : 0,
    0,
    0,
  ];
  const prefix = command.type === "wall" ? "Wall" : "Base";
  let n = 1;
  while (p.sections.some((s) => s.name === `${prefix} ${n}`)) n++;
  const rotation: V3 = placement?.rotation ?? [0, 0, 0];
  const name = `${prefix} ${n}`,
    pieces = sectionParts(command, s.id, name, origin, rotation);
  p.pieces.push(...pieces);
  const sectionId = uid();
  p.sections.push({
    id: sectionId,
    name,
    pieceIds: pieces.map((a) => a.id),
    generator: command,
    recipe: null,
    origin,
    rotation,
    ...(placement?.roomFraming ? { roomFraming: placement.roomFraming } : {}),
  });
  return syncDoorwayMotion(p, sectionId);
}
export function format(inches: number) {
  const n = Math.round(inches * 100) / 100;
  const ft = Math.floor(n / 12),
    rem = Math.round((n - ft * 12) * 100) / 100;
  return ft ? `${ft}′${rem ? ` ${rem}″` : ""}` : `${rem}″`;
}
export function parsePrompt(prompt: string, context?: Command): Command {
  const text = prompt.toLowerCase();
  const door = doorWallPrompt(text, context?.doorOpening);
  const window = windowWallPrompt(door.wallText, context?.windowOpening);
  const wallText = window.wallText;
  let type: Command["type"];
  if (/\b(coop|chicken)\b/.test(text)) type = "coop";
  else if (window.opening !== undefined || door.opening !== undefined) type = "wall";
  else if (/\b(wall|frame|framed)\b/.test(text)) type = "wall";
  else if (/\b(base|floor|foundation)\b/.test(text)) type = "foundation";
  else if (context) type = context.type;
  else
    throw new Error(
      "Try “a wall 8 ft wide and 6 ft tall, studs 16 inches on center” or “a 6 by 4 ft base”. Use Plan the idea for furniture and whole builds.",
    );
  const measurement =
    "(\\d+(?:\\.\\d+)?)\\s*(feet|foot|ft|inches|inch|in|['′\"″])?";
  const named = (label: string) => {
    const m = wallText.match(new RegExp(measurement + "\\s*(?:" + label + ")"));
    if (!m) return;
    return Number(m[1]) * (/^(?:in|["″])/.test(m[2] || "") ? 1 : 12);
  };
  const pair = wallText.match(
    /(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?/,
  );
  const pairUnit = pair?.[4] || pair?.[2] || "ft";
  const w =
    named("wide|width") ??
    (pair
      ? Number(pair[1]) * (/^in/.test(pair[2] || pairUnit) ? 1 : 12)
      : undefined);
  const h =
    named("tall|high|height") ??
    (pair && type === "wall"
      ? Number(pair[3]) * (/^in/.test(pairUnit) ? 1 : 12)
      : undefined);
  const d =
    named("deep|depth|long") ??
    (pair && type === "foundation"
      ? Number(pair[3]) * (/^in/.test(pairUnit) ? 1 : 12)
      : undefined);
  if (
    type !== "coop" &&
    !context &&
    (w === undefined || (type === "wall" ? h === undefined : d === undefined))
  )
    throw new Error(
      "Include dimensions, for example “wall 8 ft wide, 6 ft tall” or “base 6 by 4 ft”.",
    );
  if (
    context &&
    w === undefined &&
    h === undefined &&
    d === undefined &&
    window.opening === undefined && door.opening === undefined &&
    !/\b(12|16|24)\s*(?:inches|inch|in|["″])?\s*(?:on[ -]cent(?:er|re)|o\.?c\.?|spacing)/.test(
      text,
    )
  )
    throw Error(
      "Include a new dimension or spacing, for example “make it 10 ft wide” or “24 inches on center”.",
    );
  const spacing = Number(
    text.match(
      /\b(12|16|24)\s*(?:inches|inch|in|["″])?\s*(?:on[ -]cent(?:er|re)|o\.?c\.?|spacing)/,
    )?.[1] ||
      context?.spacing ||
      16,
  );
  return commandSchema.parse({
    type,
    width: w ?? context?.width ?? 72,
    height: h ?? context?.height ?? 48,
    depth: d ?? context?.depth ?? 48,
    spacing,
    ...(window.opening !== undefined && { windowOpening: window.opening }),
    ...(window.opening === undefined && context?.windowOpening && { windowOpening: context.windowOpening }),
    ...(door.opening !== undefined && { doorOpening: door.opening }),
    ...(door.opening === undefined && context?.doorOpening && { doorOpening: context.doorOpening }),
  });
}
