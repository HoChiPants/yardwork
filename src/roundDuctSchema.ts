import { z } from "zod";
import { roundDuctStock } from "./roundDuctReference";

const coordinate = z.number().finite().min(-12000).max(12000);
const point = z.tuple([coordinate, coordinate, coordinate]);
const engagement = z.number().finite().min(0).max(roundDuctStock.length);

export const roundDuctInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  start: point,
  end: point,
  envelopeWidth: z.number().finite().min(roundDuctStock.diameter).max(48),
  stockLength: z.number().finite().min(1).max(roundDuctStock.length),
  startEngagement: engagement,
  endEngagement: engagement,
  jointOverlap: engagement,
  cutLoss: engagement,
});

export type RoundDuctInput = z.infer<typeof roundDuctInputSchema>;

export const roundDuctRunsSchema = z.array(z.strictObject({
  id: z.uuid(),
  input: roundDuctInputSchema,
})).max(24).refine((records) => new Set(records.map(({ id }) => id)).size === records.length,
  "Use distinct round duct run identifiers.");
