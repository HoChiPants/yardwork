import { z } from "zod";
import { waterFittingIds, type WaterFittingId } from "./waterFittingReference";

const id = z.uuid();
export const waterRunEnd = z.strictObject({ runId: id, end: z.enum(["start", "end"]) });
const measuredReach = z.number().finite().positive().max(6);

export const waterFittingInput = z.strictObject({
  a: waterRunEnd,
  b: waterRunEnd,
  reach: z.tuple([measuredReach, measuredReach]),
  branch: z.strictObject({ port: waterRunEnd, reach: measuredReach }).optional(),
});
export type WaterRunEnd = z.infer<typeof waterRunEnd>;
export type WaterFittingInput = z.infer<typeof waterFittingInput>;
export const splitWaterMainInput = z.strictObject({
  mainId: id,
  branch: waterRunEnd,
  inlineLength: z.number().finite().positive().max(12),
  branchReach: measuredReach,
});
export const waterFittingSchema = waterFittingInput.extend({
  id,
  pieceId: id,
  materialId: z.enum(waterFittingIds as [WaterFittingId, ...WaterFittingId[]]),
}).refine((fitting) => {
  const ports = waterFittingPorts(fitting);
  return new Set(ports.map(({ runId }) => runId)).size === ports.length;
}, "Choose a different straight run for each socket.");
export type WaterFitting = z.infer<typeof waterFittingSchema>;

export function waterFittingPorts({ a, b, branch }: Pick<WaterFittingInput, "a" | "b" | "branch">) {
  return branch ? [a, b, branch.port] : [a, b];
}
