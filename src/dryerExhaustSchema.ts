import { z } from "zod";

// Equivalent length in inches from 2021 IRC Table M1502.4.6.1.
export const dryerFittings = {
  "mitered-4-45": { label: "Mitered 45° · 4 in radius", length: 30 },
  "mitered-4-90": { label: "Mitered 90° · 4 in radius", length: 60 },
  "smooth-6-45": { label: "Smooth 45° · 6 in radius", length: 12 },
  "smooth-6-90": { label: "Smooth 90° · 6 in radius", length: 21 },
  "smooth-8-45": { label: "Smooth 45° · 8 in radius", length: 12 },
  "smooth-8-90": { label: "Smooth 90° · 8 in radius", length: 19 },
  "smooth-10-45": { label: "Smooth 45° · 10 in radius", length: 9 },
  "smooth-10-90": { label: "Smooth 90° · 10 in radius", length: 18 },
} as const;

const length = z.number().finite().positive().max(2400).nullable();
const coord = z.number().finite().min(-12000).max(12000);
const point = z.tuple([coord, coord, coord]);
const ductRun = z.strictObject({ start: point, end: point }).refine(
  ({ start, end }) => Math.hypot(...end.map((value, i) => value - start[i])) >= 0.001,
  "Give each straight duct run distinct start and end points.",
);
export const dryerDuctLayoutSchema = z.strictObject({
  envelopeWidth: z.number().finite().min(0.125).max(24),
  runs: ductRun.array().min(1).max(24),
});
export type DryerDuctLayout = z.infer<typeof dryerDuctLayoutSchema>;

export const dryerExhaustSchema = z.strictObject({
  appliance: z.enum(["unknown", "ducted", "ductless"]),
  lengthMethod: z.enum([
    "unknown",
    "specified",
    "manufacturer",
    "power-ventilator",
  ]),
  runLength: length,
  fittingCounts: z.partialRecord(
    z.enum(Object.keys(dryerFittings) as (keyof typeof dryerFittings)[]),
    z.number().int().min(0).max(99),
  ),
  fittingsAccountedFor: z.boolean(),
  transitionLength: length,
  transitionConcealed: z.enum(["unknown", "yes", "no"]),
  layout: dryerDuctLayoutSchema.optional(),
});

export type DryerExhaust = z.infer<typeof dryerExhaustSchema>;

export function blankDryerExhaust(): DryerExhaust {
  return {
    appliance: "unknown",
    lengthMethod: "unknown",
    runLength: null,
    fittingCounts: {},
    fittingsAccountedFor: false,
    transitionLength: null,
    transitionConcealed: "unknown",
  };
}
