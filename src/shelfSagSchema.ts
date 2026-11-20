import { z } from "zod";

const axis = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const shelfSagPlanSchema = z.strictObject({
  pieceId: z.uuid(),
  material: z.string().min(1).max(120),
  thickness: z.number().positive().max(1200),
  spanAxis: axis,
  stockLengthAxis: axis,
  weight: z.number().positive().max(10000),
  stiffness: z.number().positive().max(1e10),
  target: z.number().positive().max(12),
  basis: z.string().trim().min(1).max(400),
});
export const shelfSagPlansSchema = z
  .array(shelfSagPlanSchema)
  .max(100)
  .refine(
    (plans) =>
      new Set(plans.map(({ pieceId }) => pieceId)).size === plans.length,
    "Retain one sag estimate per shelf.",
  );
export type ShelfSagPlan = z.infer<typeof shelfSagPlanSchema>;
