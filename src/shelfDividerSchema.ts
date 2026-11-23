import { z } from "zod";

const plan = z.strictObject({
  shelfId: z.uuid(),
  dividerId: z.uuid(),
  baseId: z.uuid().nullable(),
  offset: z.number().finite().positive().max(10000),
});
export type ShelfDividerPlan = z.infer<typeof plan>;
export const shelfDividerPlansSchema = z.array(plan).max(1000).refine((rows) =>
  new Set(rows.map(({ dividerId }) => dividerId)).size === rows.length, "Each fitted divider needs a distinct part.");
