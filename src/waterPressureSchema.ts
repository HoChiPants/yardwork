import { z } from "zod";

const id = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const pressure = z.number().finite().min(0).max(1000).nullable();
const positivePressure = z.number().finite().positive().max(1000).nullable();
const duration = z.number().finite().min(0).max(10080).nullable();
const fact = z.enum(["unknown", "yes", "no"]);
const phase = z.strictObject({ psi: pressure, minutes: duration });

export const waterPressureInput = z.strictObject({
  name: text(80).min(1),
  rootRunId: id,
  testedOn: z.iso.date().nullable(),
  waterSource: z.enum(["unknown", "potable", "other"]),
  boundaryConfirmed: fact,
  boundaryNotes: text(600),
  workingPsi: positivePressure,
  setupLimitPsi: positivePressure,
  temperatureF: z.number().finite().min(-80).max(250).nullable(),
  gaugeScalePsi: positivePressure,
  gaugeLimitPsi: positivePressure,
  gaugeIncrementPsi: positivePressure,
  gaugeReference: text(160),
  peakPsi: pressure,
  firstHold: phase,
  reducedHold: phase,
  secondHold: phase,
  secondHoldEndPsi: pressure,
  finalHold: z.strictObject({
    startPsi: pressure, lowestPsi: pressure, endPsi: pressure, minutes: duration,
  }),
  addedWater: fact,
  leakage: fact,
  notes: text(1000),
});
export type WaterPressureInput = z.infer<typeof waterPressureInput>;

export const waterPressureTestSchema = waterPressureInput.extend({
  id,
  scope: z.strictObject({
    geometry: z.string().min(1).max(50000),
    runs: z.array(z.strictObject({ id, pipeId: id, name: text(60).min(1), model: text(30).min(1) })).min(1).max(32),
    fittings: z.array(z.strictObject({ id, model: text(40).min(1) })).max(64),
    openEnds: z.array(z.strictObject({ runId: id, end: z.enum(["start", "end"]) })).max(64),
  }),
});
export type WaterPressureTest = z.infer<typeof waterPressureTestSchema>;

export const waterPressureTestsSchema = z.array(waterPressureTestSchema).max(16)
  .refine((rows) => new Set(rows.map(({ id }) => id)).size === rows.length, "Keep a unique ID for each water test.");

export function blankWaterPressure(rootRunId: string, name: string): WaterPressureInput {
  return {
    name, rootRunId, testedOn: null, waterSource: "unknown", boundaryConfirmed: "unknown", boundaryNotes: "",
    workingPsi: null, setupLimitPsi: null, temperatureF: null, gaugeScalePsi: null, gaugeLimitPsi: null, gaugeIncrementPsi: null,
    gaugeReference: "", peakPsi: null, firstHold: { psi: null, minutes: null },
    reducedHold: { psi: null, minutes: null }, secondHold: { psi: null, minutes: null }, secondHoldEndPsi: null,
    finalHold: { startPsi: null, lowestPsi: null, endPsi: null, minutes: null },
    addedWater: "unknown", leakage: "unknown", notes: "",
  };
}
