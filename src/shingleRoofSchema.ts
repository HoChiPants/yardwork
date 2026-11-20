import { z } from "zod";
import { gafRoofShingle } from "./shingleRoofReference";
import { gibraltarDripEdge } from "./dripEdgeReference";

const length = z.number().finite().min(0.001).max(12000).nullable();
export const roofUnderlaymentChoices = {
  unknown: "Confirm underlayment",
  single: "Single ordinary layer",
  double: "Two-layer application",
  membrane: "Listed membrane assembly",
} as const;
const plane = z.strictObject({
  id: z.uuid(),
  label: z.string().trim().min(1).max(80),
  basis: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("panel"), pieceId: z.uuid().nullable() }),
    z.strictObject({
      kind: z.literal("field"),
      run: length,
      rise: z.number().finite().min(0).max(12000).nullable(),
      width: length,
    }),
  ]),
  underlayment: z.enum(["unknown", "single", "double", "membrane"]),
});
export const roofEdgeKinds = {
  eave: "Eave",
  rake: "Rake",
  hip: "Hip",
  ridge: "Ridge",
} as const;
const roofEdge = z.strictObject({
  id: z.uuid(),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["eave", "rake", "hip", "ridge"]),
  length,
  extra: z.number().finite().min(0).max(12000).nullable(),
  dripEdgeExtra: z.number().finite().min(0).max(12000).nullable().optional(),
});
const layerOrder = z.enum(["unknown", "over", "under"]);
const dripEdgeSchema = z.strictObject({
  productId: z.literal(gibraltarDripEdge.id).nullable(),
  lap: z.number().finite().min(0).max(24).nullable(),
  deckReach: z.number().finite().min(0).max(24).nullable(),
  belowSheathing: z.number().finite().min(0).max(24).nullable(),
  fastenerSpacing: z.number().finite().min(0.001).max(120).nullable(),
  eaveUnderlayment: layerOrder,
  rakeUnderlayment: layerOrder,
});
export const maxRoofEdges = 48;
export const shingleRoofSchema = z.strictObject({
  productId: z.literal(gafRoofShingle.id).nullable(),
  planes: z
    .array(plane)
    .min(1)
    .max(24)
    .superRefine((planes, ctx) => {
      const ids = new Set<string>(),
        pieces = new Set<string>();
      for (const [index, item] of planes.entries()) {
        if (ids.has(item.id))
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: "Retain distinct roof areas.",
          });
        ids.add(item.id);
        if (item.basis.kind !== "panel" || !item.basis.pieceId) continue;
        if (pieces.has(item.basis.pieceId))
          ctx.addIssue({
            code: "custom",
            path: [index, "basis"],
            message: "Count each modeled deck panel once.",
          });
        pieces.add(item.basis.pieceId);
      }
    }),
  coveragePerBundle: z.number().finite().min(0.1).max(500).nullable(),
  wastePercent: z.number().finite().min(0).max(100).nullable(),
  coverageBasis: z.string().trim().max(300),
  dripEdge: dripEdgeSchema.optional(),
  edges: z
    .array(roofEdge)
    .max(maxRoofEdges)
    .refine(
      (edges) => new Set(edges.map(({ id }) => id)).size === edges.length,
      "Retain distinct roof edges.",
    )
    .optional(),
});
export type ShingleRoof = z.infer<typeof shingleRoofSchema>;
export type ShingleRoofPlane = ShingleRoof["planes"][number];
export type ShingleRoofEdge = z.infer<typeof roofEdge>;
export type DripEdge = z.infer<typeof dripEdgeSchema>;
