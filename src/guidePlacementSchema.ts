import { z } from "zod";

/** Explicit construction-task placement, independent of physical design identity. */
export const guidePlacementSchema = z.strictObject({
  ownerId: z.string().uuid(),
  stageKey: z.string().min(1).max(100),
});
export type GuidePlacement = z.infer<typeof guidePlacementSchema>;
