import { z } from "zod";
import { edgeBandingProduct, edgeBandingTrim, measuredBandingThickness } from "./edgeBandingSchema";
import { libertyFlushHinge } from "./cabinetDoorsReference";
import { pureBondCasework } from "./homeDepotCaseworkReference";

export const cabinetDoorStock = [pureBondCasework.materialId, "plywood"] as const;
export const defaultCabinetDoorPull = { inset: 1.5, height: 4, datum: "bottom" } as const;
const frameIds = z.tuple([z.uuid(), z.uuid(), z.uuid(), z.uuid()]).refine(
  (ids) => new Set(ids).size === ids.length,
  "Choose four different face-frame members.",
);
export const cabinetDoorsInputSchema = z.strictObject({
  frameIds,
  leaves: z.enum(["left", "right", "pair"]),
  stock: z.enum(cabinetDoorStock),
  outerGap: z.number().min(0.03125).max(0.5),
  centerGap: z.number().min(0.03125).max(0.5),
  angle: z.number().min(5).max(180),
  pinTowardFrame: z.number().min(0).max(0.5),
  pinForward: z.number().min(0.001).max(1),
  hingesPerLeaf: z.number().int().min(2).max(4),
  hingeEnd: z.number().min(0.5).max(20),
  hinge: z.enum(["measured", libertyFlushHinge.id]),
  pull: z.strictObject({
    inset: z.number().positive().max(24),
    height: z.number().positive().max(96),
    datum: z.enum(["top", "bottom"]),
  }).optional(),
  banding: z.strictObject({
    productId: edgeBandingProduct,
    trim: edgeBandingTrim,
    thickness: measuredBandingThickness,
  }).optional(),
});
export type CabinetDoorsInput = z.infer<typeof cabinetDoorsInputSchema>;
