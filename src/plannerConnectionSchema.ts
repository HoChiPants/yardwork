import { z } from "zod";

export const plannerConnectionSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("built-in") }),
  z.strictObject({
    state: z.enum(["installed", "missing-model", "unreachable"]),
    model: z.string().min(1).max(128),
  }),
]);

export type PlannerConnectionStatus = z.infer<typeof plannerConnectionSchema>;
