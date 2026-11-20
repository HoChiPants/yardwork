import { z } from "zod";
import {
  catalog,
  material,
  moduleRecipeSchema,
  type ModuleRecipe,
  type MaterialId,
} from "./model";
import { structureIdeaSchema } from "./recipeSchemas";
import { generatedStockAllows } from "./retailerCatalog";
export const planningZoneSchema = z.object({
  width: z.number().min(1).max(1200),
  depth: z.number().min(1).max(1200),
  height: z.number().min(1).max(1200),
});
export type PlanningZone = z.infer<typeof planningZoneSchema>;
export const moduleSchema = moduleRecipeSchema.superRefine((module, ctx) => {
  if (module.kind !== "panel" && !generatedStockAllows(material(module.frameMaterial), "frameLumber"))
    ctx.addIssue({
      code: "custom",
      path: ["frameMaterial"],
      message:
        "This stock is available for manual placement and cuts, with no reviewed application in generated framing. Choose another frame material or build with individual boards.",
    });
  if (module.kind !== "panel" && !generatedStockAllows(material(module.panelMaterial), "caseworkPanels"))
    ctx.addIssue({
      code: "custom",
      path: ["panelMaterial"],
      message:
        "This sheet is available for manual placement and cuts, with no reviewed application in generated seats or casework. Choose another panel material or add a standalone panel.",
    });
});
export type PlanModule = ModuleRecipe;
export const ideaPlanSchema = z
  .object({
    title: z.string().min(1).max(100),
    summary: z.string().min(1).max(1000),
    assumptions: z.array(z.string().min(1).max(400)).max(12),
    questions: z.array(z.string().min(1).max(400)).max(8),
    pendingPlacement: z
      .array(
        z.object({
          request: z.string().min(1).max(3000),
          question: z.string().min(1).max(400),
        }),
      )
      .max(24)
      .optional(),
    placementChanges: z.array(z.string().min(1).max(3060)).max(24).optional(),
    suggestions: z.array(z.string().min(1).max(500)).max(12),
    modules: z.array(moduleSchema).max(12),
    structures: z.array(structureIdeaSchema).max(4).default([]),
  })
  .superRefine((plan, ctx) => {
    for (const [i, m] of plan.modules.entries()) {
      if (m.openingLid && (m.kind !== "bench" || !m.storage))
        ctx.addIssue({
          code: "custom",
          path: ["modules", i],
          message: "An opening seat lid requires a storage bench module.",
        });
      if (m.lidOpen && !m.openingLid)
        ctx.addIssue({
          code: "custom",
          path: ["modules", i],
          message: "Only an opening lid can be shown open.",
        });
      if (
        m.kind !== "panel" &&
        (!isStock(m.frameMaterial, "linear") ||
          !material(m.frameMaterial).wood ||
          !isStock(m.panelMaterial, "sheet") ||
          !material(m.panelMaterial).wood)
      )
        ctx.addIssue({
          code: "custom",
          path: ["modules", i],
          message:
            "Frames need linear lumber and panels need sheet stock from the catalog.",
        });
      if (m.kind === "panel" && !isStock(m.panelMaterial, "sheet"))
        ctx.addIssue({
          code: "custom",
          path: ["modules", i, "panelMaterial"],
          message: "Choose a sheet material for a panel.",
        });
      if (m.kind !== "panel" && Math.min(m.width, m.depth, m.height) < 8)
        ctx.addIssue({
          code: "custom",
          path: ["modules", i],
          message: "Framed modules need at least 8 inches in each dimension.",
        });
    }
  });
export type IdeaPlan = z.infer<typeof ideaPlanSchema>;
export const plannerRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(3000),
  previousPlan: ideaPlanSchema.optional(),
  workZone: planningZoneSchema.nullable().optional(),
  existingSections: z
    .array(
      z.object({
        name: z.string().max(80),
        min: z.tuple([
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
        ]),
        max: z.tuple([
          z.number().finite(),
          z.number().finite(),
          z.number().finite(),
        ]),
      }),
    )
    .max(300)
    .optional(),
});
export type PlannerRequest = z.infer<typeof plannerRequestSchema>;
export function isStock(id: MaterialId, kind: "linear" | "sheet") {
  const m = material(id) as (typeof catalog)[number] & { stockKind?: string };
  return m.stockKind
    ? m.stockKind === kind
    : kind === "linear"
      ? m.category === "Lumber"
      : m.category === "Panels";
}
