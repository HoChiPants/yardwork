import { z } from "zod";
import { drawerSlideIds, drawerSlideReference } from "./drawerSlideReference";
import {
  greenhouseDoorKits,
  type GreenhouseDoorKitId,
} from "./greenhouseDoorReference";

const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const axis = vector.refine(
  (v) => Math.abs(Math.hypot(...v) - 1) <= 1e-7,
  "Use a unit direction.",
);
const datum = vector.refine(
  (v) => v.every((n) => Math.abs(n) <= 24000),
  "Use coordinates within the workshop.",
);
const members = z
  .array(z.string().uuid())
  .min(1)
  .max(32)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Choose distinct moving parts.",
  );

export const drawerSideLabels = {
  cabinetLeft: "Left cabinet side",
  drawerLeft: "Left drawer side",
  drawerRight: "Right drawer side",
  cabinetRight: "Right cabinet side",
} as const;
export const drawerSlideSchema = z
  .strictObject({
    productId: z.enum(drawerSlideIds),
    cabinetLeft: z.uuid(),
    drawerLeft: z.uuid(),
    drawerRight: z.uuid(),
    cabinetRight: z.uuid(),
  })
  .refine(
    ({ cabinetLeft, drawerLeft, drawerRight, cabinetRight }) =>
      new Set([cabinetLeft, drawerLeft, drawerRight, cabinetRight]).size === 4,
    "Choose four different mounting panels.",
  );
export type DrawerSlideSetup = z.infer<typeof drawerSlideSchema>;

const outwardHingePlacement = {
  entryId: z.uuid(),
  side: z.enum(["left", "right"]),
  outset: z.number().finite().min(-3).max(6),
  sideOffset: z.number().finite().min(-3).max(3),
};
export const greenhouseDoorSetupSchema = z.strictObject({
  ...outwardHingePlacement,
  kitId: z
    .enum(Object.keys(greenhouseDoorKits) as GreenhouseDoorKitId[])
    .nullable(),
});
export type GreenhouseDoorSetup = z.infer<typeof greenhouseDoorSetupSchema>;

export const greenhouseVentMotionSchema = z.strictObject({
  entryId: z.uuid(),
  outset: z.number().finite().min(-3).max(6),
});
export type GreenhouseVentSetup = z.infer<typeof greenhouseVentMotionSchema>;

export const saunaDoorSetupSchema = z.strictObject({
  ...outwardHingePlacement,
  finishedWallDepth: z.number().finite().positive().max(240).optional(),
});
export type SaunaDoorSetup = z.infer<typeof saunaDoorSetupSchema>;

export const hingePathLimit = 12;
const hingePathSchema = z.array(z.strictObject({
  angle: z.number().finite().min(0.01).max(180),
  offset: datum,
})).min(1).max(hingePathLimit).refine(
  (stations) => stations.every((station, i) => !i || station.angle - stations[i - 1].angle >= 0.01 - 1e-9),
  "Enter hinge measurements in angle order, at least 0.01° apart.",
);
export type HingePath = z.infer<typeof hingePathSchema>;

const motionMechanism = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("hinge"),
      axis,
      pivot: datum,
      hingePath: hingePathSchema.optional(),
      travel: z.number().positive().max(180),
      greenhouseDoor: greenhouseDoorSetupSchema.optional(),
      greenhouseVent: greenhouseVentMotionSchema.optional(),
      saunaDoor: saunaDoorSetupSchema.optional(),
    })
    .refine(
      (setup) =>
        [setup.greenhouseDoor, setup.greenhouseVent, setup.saunaDoor, setup.hingePath].filter(
          Boolean,
        ).length <= 1,
      "Choose one moving assembly path.",
    )
    .refine(
      ({ hingePath, travel }) => !hingePath || hingePath[hingePath.length - 1].angle === travel,
      { path: ["hingePath"], message: "Measure the hinge path at the maximum opening angle." },
    ),
  z
    .strictObject({
      kind: z.literal("slide"),
      axis,
      travel: z.number().positive().max(240),
      drawerSlide: drawerSlideSchema.optional(),
    })
    .refine(
      ({ travel, drawerSlide }) =>
        !drawerSlide || travel <= drawerSlideReference(drawerSlide.productId).travel,
      {
        path: ["travel"],
        message: "Extension exceeds the documented drawer slide travel.",
      },
    ),
]);

export const motionPlanInputSchema = z.strictObject({
  label: z.string().trim().min(1).max(100),
  memberIds: members,
  mechanism: motionMechanism,
});

const motionOpeningOrder = z.enum(["selected-first", "companion-first"]);
export type MotionOpeningOrder = z.infer<typeof motionOpeningOrder>;

const motionTestTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hinge"), travel: z.number().finite().positive().max(180) }),
  z.strictObject({ kind: z.literal("slide"), travel: z.number().finite().positive().max(240) }),
]);
const motionSequenceTargetsSchema = z.strictObject({
  selected: motionTestTargetSchema.optional(),
  companion: motionTestTargetSchema.optional(),
}).refine(({ selected, companion }) => !!(selected || companion), "Enter a target for at least one motion.");
export type MotionSequenceTargets = z.infer<typeof motionSequenceTargetsSchema>;

const motionPairClearanceSchema = z.strictObject({
  movingId: z.uuid(),
  otherId: z.uuid(),
  minimum: z.number().finite().min(0.001).max(24),
}).refine(({ movingId, otherId }) => movingId !== otherId, "Choose two different parts.");
export type MotionPairClearance = z.infer<typeof motionPairClearanceSchema>;

export const motionTestSetupSchema = z
  .strictObject({
    linkedId: z.uuid().optional(),
    openingOrder: motionOpeningOrder.optional(),
    sequenceTargets: motionSequenceTargetsSchema.optional(),
    clearance: motionPairClearanceSchema.optional(),
    held: z
      .array(
        z.strictObject({
          motionId: z.uuid(),
          percent: z.number().finite().min(0).max(100),
        }),
      )
      .max(49),
  })
  .refine(
    ({ linkedId, held, openingOrder, clearance }) =>
      new Set(held.map(({ motionId }) => motionId)).size === held.length &&
      (linkedId ? !held.some(({ motionId }) => motionId === linkedId) : !openingOrder && (held.length > 0 || !!clearance)),
    "Choose distinct motions to move or hold, or enter a clearance between two parts.",
  )
  .refine(
    ({ linkedId, openingOrder, sequenceTargets }) => !sequenceTargets || !!(linkedId && openingOrder),
    { path: ["sequenceTargets"], message: "Choose two motions and an opening order before setting travel targets." },
  );

export const motionTestScenarioLimit = 8;
export const motionTestNameLength = 80;
export const motionTestScenarioSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(motionTestNameLength).regex(/^[^\r\n]+$/),
  setup: motionTestSetupSchema,
});

export const motionPlanSchema = motionPlanInputSchema
  .extend({
    id: z.string().uuid(),
    testSetup: motionTestSetupSchema.optional(),
    testScenarios: z.array(motionTestScenarioSchema).min(1).max(motionTestScenarioLimit)
      .refine((scenarios) =>
        new Set(scenarios.map(({ id }) => id)).size === scenarios.length &&
        new Set(scenarios.map(({ name }) => name.toLowerCase())).size === scenarios.length,
      "Keep distinct clearance test names and IDs.").optional(),
  })
  .strict();

export type MotionPlan = z.infer<typeof motionPlanSchema>;
export type MotionPlanInput = z.infer<typeof motionPlanInputSchema>;
export type MotionTestSetup = z.infer<typeof motionTestSetupSchema>;
