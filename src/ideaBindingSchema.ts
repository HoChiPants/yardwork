import { z } from "zod";
import { moduleRecipeSchema, structureIdeaSchema } from "./recipeSchemas";
const id = z.string().uuid(),
  vec = z.tuple([
    z.number().finite().min(-12000).max(12000),
    z.number().finite().min(-12000).max(12000),
    z.number().finite().min(-12000).max(12000),
  ]);
export const boundSpecSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("furniture"), recipe: moduleRecipeSchema }),
  z.object({ type: z.literal("structure"), structure: structureIdeaSchema }),
]);
export const ideaEntrySchema = z.object({
  id,
  spec: boundSpecSchema,
  generatedNotes: z.string().max(10000).default(""),
  pose: z.object({ origin: vec, rotation: vec }),
  sections: z
    .array(
      z.object({
        role: z.string().min(1).max(100),
        sectionId: id,
        stepId: id.optional(),
      }),
    )
    .min(1)
    .max(100),
});
export const ideaBindingSchema = z.object({
  version: z.literal(1),
  id,
  revision: z.number().int().min(1).max(1000000000),
  currentFingerprint: z.string().max(100).default(""),
  reviewBlock: z.string().max(10000).default(""),
  generatedNotes: z.string().max(10000).default(""),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(1000),
  assumptions: z.array(z.string().min(1).max(400)).max(12),
  questions: z.array(z.string().min(1).max(400)).max(8),
  suggestions: z.array(z.string().min(1).max(500)).max(12),
  entries: z.array(ideaEntrySchema).min(1).max(16),
});
export type BoundSpec = z.infer<typeof boundSpecSchema>;
export type IdeaEntry = z.infer<typeof ideaEntrySchema>;
export type IdeaBinding = z.infer<typeof ideaBindingSchema>;
