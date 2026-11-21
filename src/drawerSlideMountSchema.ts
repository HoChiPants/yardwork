import { z } from "zod";
import { drawerRailScrew } from "./drawerRailScrewReference";

const positive = (maximum: number) => z.number().finite().positive().max(maximum);
const back = z.number().finite().nonnegative().max(32);
const rise = z.number().finite().min(-4).max(4);
const centers = z.array(z.tuple([back, rise])).min(3, "Transfer at least three screw centers for each rail.").max(12);
const available = z.number().int().nonnegative().max(9999);
const fasteners = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("included"), available }),
  z.strictObject({ source: z.literal("on-hand"), available }),
  z.strictObject({ source: z.literal(drawerRailScrew.id), seatToWood: positive(4) }),
]);
const rail = z.strictObject({
  length: positive(32),
  height: positive(4),
  setback: back,
  centerOffset: rise,
  centers,
  rightCenters: centers.optional(),
  pilotDiameter: positive(1),
  pilotDepth: positive(4),
  screwDiameter: positive(1),
  screwDepth: positive(4),
  fasteners: fasteners.optional(),
});

export const drawerSlideMountInputSchema = z.strictObject({
  centerHeight: positive(240),
  cabinet: rail,
  drawer: rail,
});
export const drawerSlideMountSchema = drawerSlideMountInputSchema.extend({
  motionId: z.uuid(),
  layoutKey: z.string().min(1).max(80),
});
export const drawerSlideMountsSchema = z.array(drawerSlideMountSchema).max(50).refine(
  (rows) => new Set(rows.map(({ motionId }) => motionId)).size === rows.length,
  "Save one rail layout per drawer motion.",
);
export type DrawerSlideMountInput = z.infer<typeof drawerSlideMountInputSchema>;
export type DrawerSlideMount = z.infer<typeof drawerSlideMountSchema>;
