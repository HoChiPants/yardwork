import { z } from "zod";

const coordinate = z.number().finite().min(-12000).max(12000);
const point = z.tuple([coordinate, coordinate, coordinate]);
const length = z.number().finite().min(0.125).max(120);
const armSize = z.number().finite().min(0.001).max(12);
const armEnvelope = z.strictObject({ width: armSize, thickness: armSize });
export const lidStayFitInputSchema = z.strictObject({
  fixedPieceId: z.uuid(),
  productId: z
    .enum(["everbilt-19834-lid-stay", "everbilt-19844-lid-stay"])
    .nullable(),
  fixedPin: point,
  lidPin: point,
  fixedArm: length,
  lidArm: length,
  armEnvelopes: z.tuple([armEnvelope, armEnvelope]).optional(),
  foldSign: z.union([z.literal(-1), z.literal(1)]),
  testAngle: z.number().int().min(1).max(90),
});
export const lidStayFitSchema = lidStayFitInputSchema.extend({
  id: z.uuid(),
  sectionId: z.uuid(),
  lidPieceId: z.uuid(),
  baseline: z.string().min(1).max(120),
});
export type LidStayFitInput = z.infer<typeof lidStayFitInputSchema>;
export type LidStayFit = z.infer<typeof lidStayFitSchema>;
