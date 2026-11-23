import { z } from "zod";

export const drawerBalanceInputSchema = z.strictObject({
  sectionId: z.uuid(),
  loadedWeight: z.number().positive().max(2000),
  closedSetback: z.number().min(-120).max(120),
  drawers: z.array(z.strictObject({
    motionId: z.uuid(),
    weight: z.number().positive().max(2000),
    extension: z.number().min(0).max(240),
  })).min(1).max(12).refine((drawers) =>
    new Set(drawers.map(({ motionId }) => motionId)).size === drawers.length, "Enter each drawer once."),
});
export type DrawerBalanceInput = z.infer<typeof drawerBalanceInputSchema>;
export const drawerBalancePlansSchema = z.array(z.strictObject({
  input: drawerBalanceInputSchema,
  geometryKey: z.string().min(1).max(128),
})).max(30).refine((plans) => new Set(plans.map(({ input }) => input.sectionId)).size === plans.length,
  "Keep one drawer balance plan per cabinet.");
export type DrawerBalancePlan = z.infer<typeof drawerBalancePlansSchema>[number];
