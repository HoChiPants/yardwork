import { z } from "zod";

const coordinate = z.number().finite().min(-12000).max(12000);
const planPoint = z.tuple([coordinate, coordinate]);
const spacePoint = z.tuple([coordinate, coordinate, coordinate]);
const observed = z.enum(["unknown", "yes", "no"]);
const lotSegment = z
  .tuple([planPoint, planPoint])
  .refine(
    ([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-7,
    "Enter two different points for the lot-line segment.",
  );

export const plumbingVentLayoutSchema = z.strictObject({
  exteriorSide: z.enum(["-X", "+X", "-Z", "+Z"]),
  wallCoordinate: coordinate,
  terminal: spacePoint,
  lotLine: lotSegment.nullable(),
  gradePoint: spacePoint.nullable(),
  underVentedOverhang: observed,
  openingProtected: observed,
});

export type PlumbingVentLayout = z.infer<typeof plumbingVentLayoutSchema>;
