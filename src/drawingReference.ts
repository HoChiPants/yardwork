import { z } from "zod";
import { formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";

export const drawingPixelLimit = 2048;
export const drawingImageLimit = 480_000;
export const drawingCoordinateLimit = 12_000;
export const drawingLineLimit = 3000;

const coordinate = z.number().min(-drawingCoordinateLimit).max(drawingCoordinateLimit);
const fraction = z.number().min(0).max(1);
const point = z.tuple([fraction, fraction]);
export type DrawingPoint = z.infer<typeof point>;
const drawingLineSchema = z.tuple([fraction, fraction, fraction, fraction]).refine(([x, y, u, v]) => x !== u || y !== v,
  "Drawing lines need two distinct points.");
export type DrawingLine = z.infer<typeof drawingLineSchema>;

export const drawingCalibrationSchema = z.strictObject({
  points: z.tuple([point, point]),
  distance: z.number().min(0.01).max(drawingCoordinateLimit),
  center: z.tuple([coordinate, coordinate]),
  angle: z.number().min(-180).max(180),
  opacity: z.number().min(0.1).max(1),
  visible: z.boolean(),
});
export type DrawingCalibration = z.infer<typeof drawingCalibrationSchema>;

export const drawingSourceSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  page: z.number().int().min(1).max(20_000).optional(),
  width: z.number().int().min(2).max(drawingPixelLimit),
  height: z.number().int().min(2).max(drawingPixelLimit),
  image: z.string().max(drawingImageLimit).regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/),
  pdfLines: z.array(drawingLineSchema).min(1).max(drawingLineLimit).optional(),
});
export type DrawingSource = z.infer<typeof drawingSourceSchema>;

type Dimensions = Pick<DrawingSource, "width" | "height">;
const radians = (angle: number) => angle * Math.PI / 180;

export function drawingPointDistance(drawing: Dimensions, [a, b]: [DrawingPoint, DrawingPoint]) {
  return Math.hypot((b[0] - a[0]) * drawing.width, (b[1] - a[1]) * drawing.height);
}

export function drawingReferenceSize(drawing: Dimensions, calibration: DrawingCalibration) {
  const span = drawingPointDistance(drawing, calibration.points);
  if (span < 2) throw Error("Choose two distinct points farther apart on the drawing.");
  const inchesPerPixel = calibration.distance / span;
  return { width: inchesPerPixel * drawing.width, depth: inchesPerPixel * drawing.height };
}

export function drawingAngleToXAxis(drawing: Dimensions, [a, b]: [DrawingPoint, DrawingPoint]) {
  return -Math.atan2((b[1] - a[1]) * drawing.height, (b[0] - a[0]) * drawing.width) * 180 / Math.PI;
}

export function drawingReferenceBounds(drawing: Dimensions, calibration: DrawingCalibration) {
  const { width, depth } = drawingReferenceSize(drawing, calibration);
  const a = radians(calibration.angle);
  const x = (Math.abs(Math.cos(a) * width) + Math.abs(Math.sin(a) * depth)) / 2;
  const z = (Math.abs(Math.sin(a) * width) + Math.abs(Math.cos(a) * depth)) / 2;
  const [cx, cz] = calibration.center;
  return { min: [cx - x, 0, cz - z] as [number, number, number], max: [cx + x, 0, cz + z] as [number, number, number] };
}

export const drawingReferenceSchema = drawingSourceSchema.extend({ calibration: drawingCalibrationSchema })
  .superRefine((drawing, ctx) => {
    if (drawing.pdfLines && !drawing.page)
      ctx.addIssue({ code: "custom", path: ["pdfLines"], message: "PDF linework must identify its source page." });
    try {
      const { min, max } = drawingReferenceBounds(drawing, drawing.calibration);
      if ([...min, ...max].some((value) => Math.abs(value) > drawingCoordinateLimit + 1e-7))
        throw Error("The scaled drawing extends beyond the workspace. Check the distance or drawing center.");
    } catch (issue) {
      ctx.addIssue({ code: "custom", path: ["calibration"], message: (issue as Error).message });
    }
  });

export type DrawingReference = z.infer<typeof drawingReferenceSchema>;

export function drawingPlanLines(drawing?: DrawingReference): Project["planLines"] {
  if (!drawing?.pdfLines) return [];
  const { calibration } = drawing;
  const { width, depth } = drawingReferenceSize(drawing, calibration);
  const angle = radians(calibration.angle), cosine = Math.cos(angle), sine = Math.sin(angle);
  const [cx, cz] = calibration.center;
  const place = (u: number, v: number): V3 => {
    const x = (u - 0.5) * width, z = (v - 0.5) * depth;
    return [cx + x * cosine - z * sine, 0.1, cz + x * sine + z * cosine];
  };
  return drawing.pdfLines.map(([x, y, u, v]) => ({ a: place(x, y), b: place(u, v) }));
}


export function drawingReferenceDescription(drawing: DrawingReference) {
  const source = drawing.name.replace(/[\r\n]+/g, " ");
  const { width, depth } = drawingReferenceSize(drawing, drawing.calibration);
  return `${source}${drawing.page ? ` · Page ${drawing.page}` : ""} · ${formatStockLength(width)} × ${formatStockLength(depth)} workspace footprint · A–B ${formatStockLength(drawing.calibration.distance)}`;
}
