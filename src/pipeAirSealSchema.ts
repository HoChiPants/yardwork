import { z } from "zod";

const offset = z.number().finite().min(-480).max(480);
export const pipeAirSealInput = z.strictObject({
  id: z.uuid(),
  partId: z.uuid(),
  openingKey: z.string().min(1).max(160),
  side: z.enum(["positive", "negative"]),
  pipeDiameter: z.number().finite().positive().max(48),
  offset: z.tuple([offset, offset]),
  cavityDepth: z.number().finite().positive().max(12),
  rodRecess: z.number().finite().positive().max(1).optional(),
  dryFit: z.boolean(),
  session: z.string().trim().min(1).max(60).regex(/^[^\r\n]+$/),
});
export type PipeAirSealInput = z.infer<typeof pipeAirSealInput>;

export const pipeAirSealsSchema = z.array(pipeAirSealInput.extend({
  signature: z.string().min(1).max(80),
})).max(120).refine((rows) => new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ partId, openingKey }) => `${partId}/${openingKey}`)).size === rows.length,
"Save one exposed seal per opening.");
