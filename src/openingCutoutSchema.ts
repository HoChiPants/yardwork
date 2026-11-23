import { z } from "zod";

const size = z.number().finite().positive().max(240);
const edge = z.number().finite().nonnegative().max(240);
const axis = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const recovery = z.strictObject({
  panelId: z.uuid(),
  offcutId: z.uuid(),
  sourceId: z.uuid(),
  axis,
  fromEdges: z.tuple([edge, edge]),
  spans: z.tuple([size, size]),
  dimensions: z.tuple([size, size, size]),
});
export type OpeningCutoutRecord = z.infer<typeof recovery>;

export const openingCutoutRecordsSchema = z.array(recovery).max(4000).refine((records) =>
  new Set(records.map(({ sourceId }) => sourceId)).size === records.length &&
  new Set(records.map(({ offcutId }) => offcutId)).size === records.length,
  "Each recovered opening cutout needs its own stock source and offcut label.",
);
