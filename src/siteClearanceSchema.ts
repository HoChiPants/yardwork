import { z } from "zod";

export const siteClearanceSchema = z.strictObject({
  id: z.uuid(),
  bindingId: z.uuid().nullable(),
  label: z.string().trim().min(1).max(80),
  side: z.enum(["-X", "+X", "-Z", "+Z"]),
  coordinate: z.number().finite().min(-12000).max(12000),
  top: z.number().finite().positive().max(1200).nullable(),
  minimum: z.number().finite().min(0).max(1200),
});
export type SiteClearance = z.infer<typeof siteClearanceSchema>;
