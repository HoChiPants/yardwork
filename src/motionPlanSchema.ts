import { z } from "zod";
import { accuride3732 } from "./drawerSlideReference";
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
    productId: z.literal(accuride3732.productId),
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

const motionMechanism = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("hinge"),
      axis,
      pivot: datum,
      travel: z.number().positive().max(180),
      greenhouseDoor: greenhouseDoorSetupSchema.optional(),
      greenhouseVent: greenhouseVentMotionSchema.optional(),
      saunaDoor: saunaDoorSetupSchema.optional(),
    })
    .refine(
      (setup) =>
        [setup.greenhouseDoor, setup.greenhouseVent, setup.saunaDoor].filter(
          Boolean,
        ).length <= 1,
      "Choose one moving assembly.",
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
        !drawerSlide || travel <= accuride3732.travel,
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

export const motionTestSetupSchema = z
  .strictObject({
    linkedId: z.uuid().optional(),
    openingOrder: motionOpeningOrder.optional(),
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
    ({ linkedId, held, openingOrder }) =>
      new Set(held.map(({ motionId }) => motionId)).size === held.length &&
      (linkedId ? !held.some(({ motionId }) => motionId === linkedId) : !openingOrder && held.length > 0),
    "Choose distinct motions to move together or hold in place.",
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
