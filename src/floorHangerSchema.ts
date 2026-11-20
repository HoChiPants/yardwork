import { z } from "zod";
import { floorHangerProductIds } from "./floorHangerReference";

export const floorHangerPlanSchema = z.strictObject({
  productId: z.enum(floorHangerProductIds),
  flangeReach: z.number().positive(),
  checkedAt: z.iso.datetime(),
  ends: z.array(z.strictObject({
    joistId: z.uuid(),
    rimId: z.uuid(),
  })).min(1).max(64),
}).superRefine(({ ends }, ctx) => {
  if (new Set(ends.map(({ joistId, rimId }) => `${joistId}/${rimId}`)).size !== ends.length)
    ctx.addIssue({ code: "custom", path: ["ends"], message: "Choose each joist end only once." });
});
export type FloorHangerPlan = z.infer<typeof floorHangerPlanSchema>;
