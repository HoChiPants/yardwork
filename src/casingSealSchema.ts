import { z } from "zod";
import { trimSeamInputSchema } from "./woodJointDecisionSchema";

export const casingSealInputSchema = trimSeamInputSchema.omit({ backerRodId: true });
export const casingSealSchema = casingSealInputSchema.extend({ signature: z.string().min(1).max(80) });
export type CasingSealInput = z.infer<typeof casingSealInputSchema>;
