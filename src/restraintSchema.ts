import { z } from "zod";
const id = z.string().uuid();
const vec = z.tuple([
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
]);
const date = z.iso.datetime().nullable();
const dimension = z.number().finite().positive().max(1200).nullable();
export const restraintProductId = "hillman-simple-mount-9976524" as const;
export const restraintReceiverSchema = z.strictObject({
  pieceId: id,
  name: z.string().min(1).max(120),
  geometryFingerprint: z.string().min(1).max(100),
  baselinePose: z.strictObject({ position: vec, rotation: vec }),
});
export const restraintLocationSchema = z.strictObject({
  id,
  name: z.string().min(1).max(100),
  receiverFace: z.strictObject({
    axis: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    sign: z.union([z.literal(-1), z.literal(1)]),
  }),
  receiverMountLocal: vec.nullable(),
  furnitureEyeLocal: vec.nullable(),
  wallEyeWorld: vec.nullable(),
  wallSubstrate: z.enum([
    "unknown",
    "wood-stud",
    "steel-stud",
    "masonry",
    "drywall-only",
    "other",
  ]),
  wallBasis: z.string().max(1000),
  wallReviewedAt: date,
});
export const restraintMeasurementsSchema = z
  .strictObject({
    cableEyeToEyeLength: dimension,
    deepestFurnitureTipDepth: dimension,
    wallFastenerLength: dimension,
    studEngagement: dimension,
    basis: z.string().max(1000),
    measuredAt: date,
  })
  .superRefine((value, ctx) => {
    if (
      [
        value.cableEyeToEyeLength,
        value.deepestFurnitureTipDepth,
        value.wallFastenerLength,
        value.studEngagement,
      ].some((item) => item !== null) &&
      (!value.basis.trim() || !value.measuredAt)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record the user measurement basis and date with measured restraint dimensions.",
      });
  });
export const restraintPlanSchema = z
  .strictObject({
    id,
    kind: z.literal("furniture-anti-tip"),
    productId: z.literal(restraintProductId),
    name: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    entryId: id.nullable(),
    receiver: restraintReceiverSchema.nullable(),
    receiverJointIds: z.array(id).max(200),
    receiverFastenerPlanIds: z.array(id).max(100).optional(),
    receiverSolidWoodBasis: z.string().max(1000),
    receiverMeasuredAt: date,
    instructionBasis: z.string().max(1000),
    instructionRevision: z.string().max(200),
    instructionReviewedAt: date,
    notes: z.string().max(3000),
    locations: z.array(restraintLocationSchema).max(20),
    measurements: restraintMeasurementsSchema,
  })
  .superRefine((plan, ctx) => {
    if (
      new Set(plan.locations.map((location) => location.id)).size !==
      plan.locations.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["locations"],
        message: "Restraint location IDs must be unique.",
      });
    if (new Set(plan.receiverJointIds).size !== plan.receiverJointIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["receiverJointIds"],
        message: "Receiver connection IDs must be unique.",
      });
    const fasteners = plan.receiverFastenerPlanIds ?? [];
    if (new Set(fasteners).size !== fasteners.length)
      ctx.addIssue({
        code: "custom",
        path: ["receiverFastenerPlanIds"],
        message: "Select each screw plan once.",
      });
  });
export type RestraintPlan = z.infer<typeof restraintPlanSchema>;
export type RestraintLocation = z.infer<typeof restraintLocationSchema>;
export type RestraintReceiver = z.infer<typeof restraintReceiverSchema>;
export type RestraintMeasurements = z.infer<typeof restraintMeasurementsSchema>;
export function emptyRestraintMeasurements(): RestraintMeasurements {
  return {
    cableEyeToEyeLength: null,
    deepestFurnitureTipDepth: null,
    wallFastenerLength: null,
    studEngagement: null,
    basis: "",
    measuredAt: null,
  };
}
