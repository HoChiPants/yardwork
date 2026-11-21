import { z } from "zod";
import { flexWrap } from "./openingFlashingReference";

export const openingMembersSchema = z.strictObject({
  sill: z.uuid(),
  jambA: z.uuid(),
  jambB: z.uuid(),
  head: z.uuid(),
}).refine((members) => new Set(Object.values(members)).size === 4, "Choose four distinct framing members.");

export const openingFlashingMeasurementsSchema = z.strictObject({
  unit: z.enum(["window", "door"]),
  exterior: z.enum(["positive", "negative"]),
  sheathing: z.number().nonnegative().max(6),
  frameDepth: z.number().positive().max(12),
  faceLap: z.number().min(flexWrap.minFaceLap).max(flexWrap.maxFaceLap),
  jambReturn: z.number().min(flexWrap.minJambReturn).max(48),
  tapeWidth: z.union([z.literal(6), z.literal(9)]),
  pan: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("slope") }),
    z.strictObject({ kind: z.literal("back-dam"), rise: z.number().positive().max(3) }),
  ]),
  drainage: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("open") }),
    z.strictObject({ kind: z.literal("gaps"), centers: z.array(z.number().nonnegative()).min(2).max(100) }),
  ]),
});

const openingFlashingPlanSchema = z.strictObject({
  members: openingMembersSchema,
  measurements: openingFlashingMeasurementsSchema,
  signature: z.string().min(1).max(2400),
});

export const openingFlashingPlansSchema = z.array(openingFlashingPlanSchema).max(400)
  .refine((plans) => new Set(plans.map(({ members }) => members.sill)).size === plans.length,
    "Save one flashing plan per rough sill.");
export type OpeningMembers = z.infer<typeof openingMembersSchema>;
export type OpeningFlashingMeasurements = z.infer<typeof openingFlashingMeasurementsSchema>;
export type OpeningFlashingPlan = z.infer<typeof openingFlashingPlanSchema>;
