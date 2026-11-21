import { z } from "zod";
import type { Piece, V3 } from "./model";

const axis = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const woodKerfSchema = z.number().finite().positive().max(240);
export const tubeKerfSchema = z.number().finite().min(0).max(240);
export const tubeCutPlansSchema = z
  .array(
    z.strictObject({
      rodIds: z.array(z.string().uuid()).min(1).max(100),
      kerf: tubeKerfSchema,
    }),
  )
  .max(100)
  .refine((plans) => {
    const ids = plans.flatMap((plan) => plan.rodIds);
    return new Set(ids).size === ids.length;
  }, "Each rod can belong to one saved stock tube.");

export const tubeGroupKey = (ids: readonly string[]) =>
  [...ids].sort().join("/");
export const cutSourceAxesSchema = z
  .tuple([axis, axis, axis])
  .refine(
    (axes) => new Set(axes).size === 3,
    "Stock thickness, width, and length must use different local axes.",
  );
export type CutSourceAxes = z.infer<typeof cutSourceAxesSchema>;
const identity: CutSourceAxes = [0, 1, 2];

/** The packed source uses T/W/L. A reversed permutation flips thickness to preserve handedness. */
export function cutSourceFrame(axes: CutSourceAxes = identity) {
  const [a, b, c] = axes;
  const flip = (Number(a > b) + Number(a > c) + Number(b > c)) % 2 !== 0;
  const toSourceSize = (value: V3): V3 => [value[a], value[b], value[c]];
  const toSourceDirection = (value: V3): V3 => [
    flip ? -value[a] : value[a],
    value[b],
    value[c],
  ];
  const toPartDirection = (value: V3): V3 => {
    const local: V3 = [0, 0, 0];
    local[a] = flip ? -value[0] : value[0];
    local[b] = value[1];
    local[c] = value[2];
    return local;
  };
  const toPartSize = (value: V3): V3 => {
    const local = toPartDirection(value);
    local[a] = Math.abs(local[a]);
    return local;
  };
  const toPartOffset = (offset: V3, source: V3, kept: V3): V3 => {
    const local = toPartSize(offset);
    if (flip) local[a] = Math.max(0, source[0] - offset[0] - kept[0]);
    return local;
  };
  return {
    toSourceSize,
    toSourceDirection,
    toPartDirection,
    toPartSize,
    toPartOffset,
    flip,
  };
}

export function cutSourceRegion(piece: Piece) {
  const stock = piece.cutStock;
  if (!stock) throw Error("The part has no recorded cut source.");
  const frame = cutSourceFrame(stock.sourceAxes);
  const size = frame.toSourceSize(piece.size);
  const sourceSize = frame.toSourceSize(stock.size);
  const offset = frame.toSourceSize(stock.offset);
  if (frame.flip) offset[0] = sourceSize[0] - offset[0] - size[0];
  return { ...frame, size, sourceSize, offset };
}
