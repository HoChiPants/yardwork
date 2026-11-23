import { z } from "zod";
import { flatCasing } from "./doorCasingReference";

const measure = z.number().finite().min(0).max(240);
export const braceFaces = ["+Z", "-Z", "+X", "-X"] as const;
export const braceStocks = ["hd-pine-1x4", flatCasing.id] as const;
export const furnitureBraceInputSchema = z.strictObject({
  firstId: z.uuid(),
  secondId: z.uuid(),
  face: z.enum(braceFaces),
  firstHeight: measure,
  secondHeight: measure,
  extension: measure,
  stock: z.enum(braceStocks),
});
export type FurnitureBraceInput = z.infer<typeof furnitureBraceInputSchema>;

const record = z.strictObject({ partId: z.uuid(), input: furnitureBraceInputSchema });
export type FurnitureBraceRecord = z.infer<typeof record>;
export const furnitureBracesSchema = z.array(record).max(1000).refine((rows) =>
  new Set(rows.map(({ partId }) => partId)).size === rows.length, "Each diagonal brace needs a distinct part.",
);
