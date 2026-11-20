import { z } from "zod";
import { concreteAnchor } from "./concreteAnchorReference";

export const greenhouseFoundationCoordinateLimit = 12000;
const coordinate = z
  .number()
  .finite()
  .min(-greenhouseFoundationCoordinateLimit)
  .max(greenhouseFoundationCoordinateLimit);
const span = z.number().finite().min(0.125).max(1200);

const anchorLocationSchema = z.strictObject({
  id: z.uuid(),
  railId: z.uuid(),
  x: coordinate,
  z: coordinate,
});

export const foundationAnchorLayoutSchema = z.strictObject({
  productId: z.literal(concreteAnchor.productId),
  thickness: span,
  embedment: span.max(6),
  fixtureStack: z.number().finite().min(0).max(6),
  anchorLength: span.max(12),
  edge: span,
  spacing: span,
  detail: z.string().trim().min(1).max(200),
  locations: z
    .array(anchorLocationSchema)
    .max(64)
    .refine(
      (locations) =>
        new Set(locations.map(({ id }) => id)).size === locations.length,
      "Anchor mark identifiers must be unique.",
    ),
});
export type FoundationAnchorLayout = z.infer<
  typeof foundationAnchorLayoutSchema
>;

export const greenhouseFoundationSchema = z.strictObject({
  entryId: z.uuid(),
  width: span,
  depth: span,
  centerX: coordinate,
  centerZ: coordinate,
  topY: coordinate,
  anchors: foundationAnchorLayoutSchema.optional(),
});

export type GreenhouseFoundation = z.infer<typeof greenhouseFoundationSchema>;
