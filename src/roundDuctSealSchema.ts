import { z } from "zod";

const seamLength = z.number().finite().min(0).max(100000);
export const roundDuctSealInputSchema = z.strictObject({
  jointCircumference: z.number().finite().positive().max(120),
  fittingSeams: seamLength,
  reinforcedSeams: seamLength,
  coveragePerTube: z.number().finite().min(0.125).max(100000),
});
export const roundDuctSealSchema = z.strictObject({
  input: roundDuctSealInputSchema,
  layout: z.string().min(1).max(30000),
});
export type RoundDuctSealInput = z.infer<typeof roundDuctSealInputSchema>;
