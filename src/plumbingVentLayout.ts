import { clearanceAxis } from "./siteClearance";
import { formatStockLength } from "./measurement";
import type { PlumbingVentLayout } from "./plumbingVentSchema";
import type { V3 } from "./model";

export const IPC_SIDEWALL_DISTANCE = 120;
const epsilon = 1e-7;

export function ventLayoutMeasurements(layout: PlumbingVentLayout) {
  const terminal = layout.terminal;
  const axis = clearanceAxis(layout.exteriorSide);
  const wallPoint = [...terminal] as V3;
  wallPoint[axis] = layout.wallCoordinate;
  const projection =
    (terminal[axis] - layout.wallCoordinate) *
    (layout.exteriorSide.startsWith("+") ? 1 : -1);
  const [x, y, z] = terminal;
  const lot = layout.lotLine;
  let lotPoint: V3 | null = null;
  if (lot) {
    const [[x1, z1], [x2, z2]] = lot;
    const dx = x2 - x1,
      dz = z2 - z1;
    const t = Math.min(
      1,
      Math.max(0, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)),
    );
    lotPoint = [x1 + t * dx, y, z1 + t * dz];
  }
  const grade = layout.gradePoint;
  const gradeInScope =
    !!grade &&
    Math.hypot(x - grade[0], z - grade[2]) <= IPC_SIDEWALL_DISTANCE + epsilon;
  return {
    wallPoint,
    projection: Math.abs(projection) <= epsilon ? 0 : projection,
    lotPoint,
    lotDistance: lotPoint ? Math.hypot(x - lotPoint[0], z - lotPoint[2]) : null,
    gradeInScope,
    gradeRise: grade && gradeInScope ? y - grade[1] : null,
  };
}

export function ventLayoutBounds(layout: PlumbingVentLayout) {
  const { wallPoint, lotPoint } = ventLayoutMeasurements(layout);
  const points = [
    layout.terminal,
    wallPoint,
    ...(lotPoint ? [lotPoint] : []),
    ...(layout.gradePoint ? [layout.gradePoint] : []),
  ];
  return {
    min: [0, 1, 2].map(
      (axis) => Math.min(...points.map((point) => point[axis])) - 14,
    ) as V3,
    max: [0, 1, 2].map(
      (axis) => Math.max(...points.map((point) => point[axis])) + 14,
    ) as V3,
  };
}

export function ventLayoutGuideLines(layout: PlumbingVentLayout) {
  const position = (point: number[]) => point.map(formatStockLength).join(", ");
  const point = layout.gradePoint;
  return [
    `Exterior wall datum · ${layout.exteriorSide} at ${formatStockLength(layout.wallCoordinate)}. Terminal (X, Y, Z) · ${position(layout.terminal)}.`,
    ...(layout.lotLine
      ? [
          `Measured nearest lot-line segment (X, Z) · (${position(layout.lotLine[0])}) to (${position(layout.lotLine[1])}).`,
        ]
      : []),
    ...(point
      ? [
          `Recorded highest adjacent grade point (X, Y, Z) · ${position(point)}.`,
        ]
      : []),
  ];
}
