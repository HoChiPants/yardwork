import { z } from "zod";
import { materialIds } from "./materialIds";
const dimension = z.number().finite().min(0.125).max(240);
export const moduleRecipeSchema = z
  .object({
    entryId: z.string().uuid().optional(),
    kind: z.enum(["bench", "workbench", "cabinet", "shelf", "frame", "panel"]),
    name: z.string().min(1).max(80),
    width: dimension,
    height: dimension,
    depth: dimension,
    position: z.tuple([
      z.number().finite().min(-1200).max(1200),
      z.number().finite().min(0).max(1200),
      z.number().finite().min(-1200).max(1200),
    ]),
    yaw: z.number().finite().min(-180).max(180),
    frameMaterial: z.enum(materialIds),
    panelMaterial: z.enum(materialIds),
    backHeight: z.number().finite().min(0).max(48),
    levels: z.number().int().min(1).max(6),
    storage: z.boolean().default(false),
    openingLid: z.boolean().default(false),
    lidOpen: z.boolean().default(false),
  })
  .superRefine((m, ctx) => {
    if (m.openingLid && (m.kind !== "bench" || !m.storage))
      ctx.addIssue({
        code: "custom",
        message: "An opening seat lid requires a storage bench module.",
      });
    if (m.lidOpen && !m.openingLid)
      ctx.addIssue({
        code: "custom",
        message: "Only an opening lid can be shown open.",
      });
  });
export type ModuleRecipe = z.infer<typeof moduleRecipeSchema>;

const inch = z.number().finite().min(1).max(240),
  positive = z.number().finite().positive().max(120);
const pose = {
  origin: z
    .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
    .default([0, 0, 0]),
  yaw: z.number().finite().min(-180).max(180).default(0),
};
export const greenhouseRoofVentSchema = z.strictObject({
  side: z.enum(["left", "right"]),
  bay: z.number().int().min(1).max(32),
  ridgeOffset: z.number().finite().min(4).max(120),
  length: z.number().finite().min(10).max(60),
});
export type GreenhouseRoofVent = z.infer<typeof greenhouseRoofVentSchema>;
export const defaultGreenhouseRoofVent: GreenhouseRoofVent = {
  side: "right",
  bay: 2,
  ridgeOffset: 8,
  length: 24,
};
export const greenhouseParamsSchema = z.object({
  width: inch.min(48),
  depth: inch.min(48),
  eaveHeight: inch.min(60),
  roofRise: positive.min(6),
  doorWidth: inch.min(18).default(30),
  doorHeight: inch.min(36).default(68),
  rafterSpacing: positive.min(8).max(48).default(24),
  roofVent: greenhouseRoofVentSchema.optional(),
  doorSwing: z.number().min(0).max(90).default(0),
  ...pose,
});
export type GreenhouseParams = z.input<typeof greenhouseParamsSchema>;
export const saunaParamsSchema = z.object({
  clearWidth: inch.min(48),
  clearDepth: inch.min(48),
  clearHeight: inch.min(72),
  interiorLayerAllowance: z.number().finite().min(0).max(12).default(1.5),
  doorWidth: inch.min(18).default(28),
  doorHeight: inch.min(48).default(72),
  benchWidth: inch.min(24).default(60),
  benchDepth: inch.min(12).default(24),
  benchHeight: inch.min(12).default(36),
  benchOffsetX: z.number().finite().min(-120).max(120).optional(),
  benchRearGap: z.number().finite().min(0).max(240).optional(),
  ...pose,
});
export type SaunaCabinParams = z.input<typeof saunaParamsSchema>;
export const closetParamsSchema = z.object({
  width: inch.min(30),
  depth: inch.min(12),
  height: inch.min(36),
  towerWidth: inch.min(8).default(25),
  shelfCount: z.number().int().min(1).max(6).default(4),
  rodHeight: z.number().finite().min(6).max(240).optional(),
  ...pose,
});
export type ClosetInsertParams = z.input<typeof closetParamsSchema>;

export const caseworkShelvesParamsSchema = z.object({
  width: inch.min(8),
  depth: inch.min(8),
  height: inch.min(8),
  shelfCount: z.number().int().min(1).max(6).default(3),
  shelfClearance: z.number().finite().min(0).max(2).default(0.25),
  ...pose,
});
export type CaseworkShelvesParams = z.input<typeof caseworkShelvesParamsSchema>;

const selection = z.object({
  materialId: z.enum(materialIds),
  productRegistryRef: z.string().min(1).max(120),
});
const selectionFields = z
  .object({
    frameLumber: selection.optional(),
    ridgeLumber: selection.optional(),
    caseworkPanels: selection.optional(),
    greenhouseGlazing: selection.optional(),
    saunaInsulation: selection.optional(),
    saunaCeilingJoists: selection.optional(),
    saunaCeilingInsulation: selection.optional(),
    saunaInterior: selection.optional(),
    saunaDoor: selection.optional(),
    saunaBench: selection.optional(),
    saunaVaporBarrier: selection.optional(),
    closetRod: selection.optional(),
    closetRodSupport: selection.optional(),
  });
const selections = selectionFields.default({});
export const structureIdeaSchema = z.discriminatedUnion("kind", [
  z.object({
    entryId: z.string().uuid().optional(),
    kind: z.literal("casework-shelves"),
    parameters: caseworkShelvesParamsSchema,
    selections,
  }),
  z.object({
    entryId: z.string().uuid().optional(),
    kind: z.literal("greenhouse"),
    parameters: greenhouseParamsSchema,
    selections: selectionFields.extend({ greenhouseBase: selection.optional() }).default({}),
  }),
  z.object({
    entryId: z.string().uuid().optional(),
    kind: z.literal("sauna"),
    parameters: saunaParamsSchema,
    selections,
  }),
  z.object({
    entryId: z.string().uuid().optional(),
    kind: z.literal("closet-insert"),
    parameters: closetParamsSchema,
    selections,
  }),
]);
export type StructureIdea = z.infer<typeof structureIdeaSchema>;
