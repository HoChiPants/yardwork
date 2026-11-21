import { z } from "zod";

export const greenhouseDoorSealSchema = z.strictObject({
  entryId: z.uuid(),
  motionId: z.uuid(),
  layoutKey: z.string().max(80).min(1),
});

export const greenhouseDoorSealsSchema = z.array(greenhouseDoorSealSchema).max(50).refine(
  (rows) => new Set(rows.map(({ entryId }) => entryId)).size === rows.length &&
    new Set(rows.map(({ motionId }) => motionId)).size === rows.length,
  "Save one weatherseal plan per greenhouse door.",
);

export type GreenhouseDoorSeal = z.infer<typeof greenhouseDoorSealSchema>;
