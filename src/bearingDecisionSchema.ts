import { z } from "zod";

export const maxRemovalLeg = 240;
const component = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
export const removalLegsSchema = z
  .array(
    z.strictObject({
      axis: z
        .tuple([component, component, component])
        .refine(
          (axis) => axis.filter((n) => n !== 0).length === 1,
          "Choose a straight direction along one axis.",
        ),
      travel: z.number().positive().max(maxRemovalLeg),
    }),
  )
  .min(1)
  .max(2);
export const recordedRemovalSchema = z.strictObject({
  legs: removalLegsSchema,
  testKey: z.string().regex(/^removal-[1-9][0-9]*-[0-9a-f]{16}$/),
  outcome: z.enum(["clear", "blocked", "needs-review"]),
});
export type RecordedRemoval = z.infer<typeof recordedRemovalSchema>;

export const bearingDecisionSchema = z.strictObject({
  topId: z.uuid(),
  baseId: z.uuid(),
  note: z.string().trim().min(1).max(400),
  contactSignature: z.string().min(1).max(2400),
  removalPath: recordedRemovalSchema.optional(),
});

export type BearingDecision = z.infer<typeof bearingDecisionSchema>;

export const bearingDecisionsSchema = z
  .array(bearingDecisionSchema)
  .max(2000)
  .refine(
    (rows) =>
      rows.every(({ topId, baseId }) => topId !== baseId) &&
      new Set(rows.map(({ topId, baseId }) => JSON.stringify([topId, baseId])))
        .size === rows.length,
    "Keep one removable decision per directed bearing pair.",
  );
