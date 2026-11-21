import { drawingLineLimit, type DrawingLine } from "./drawingReference";

type Point = [number, number];
type Segment = [Point, Point];
type Matrix = [number, number, number, number, number, number];
type Polygon = { points: Point[]; direction: number };
type OperatorList = { fnArray: number[]; argsArray: unknown[] };
type PageImage = { width: number; height: number; data: Uint8ClampedArray };
type Graphics = {
  matrix: Matrix;
  clips: Polygon[] | null;
  dashed: boolean;
  strokeAlpha: number;
  fillAlpha: number;
  lineWidth: number;
  masked: boolean;
};

const identity: Matrix = [1, 0, 0, 1, 0, 0];
const difference = ([x, y]: Point, [u, v]: Point): Point => [x - u, y - v];
const cross = ([x, y]: Point, [u, v]: Point) => x * v - y * u;
const epsilon = 1e-7;
const transform = ([a, b, c, d, e, f]: Matrix, [x, y]: Point): Point => [a * x + c * y + e, b * x + d * y + f];

function multiply([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix {
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

function asMatrix(value: unknown): Matrix | null {
  if (!numericList(value) || value.length !== 6) return null;
  const entries = Array.from(value);
  return entries.every(Number.isFinite) ? entries as Matrix : null;
}

function numericList(value: unknown): value is ArrayLike<number> {
  return Array.isArray(value) || ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function samePoint(a: Point, b: Point) {
  return Math.hypot(...difference(a, b)) <= epsilon;
}

/** PDF.js 6 packs the path into args[1][0] using its DrawOPS encoding. */
function decodePath(data: ArrayLike<number>, matrix: Matrix) {
  const parts: Point[][] = [], straight: Segment[] = [];
  let start: Point | undefined, current: Point | undefined;
  let points: Point[] = [], curved = false;
  const addLine = (next: Point) => {
    if (current && !samePoint(current, next)) straight.push([current, next]);
    current = next;
  };
  for (let i = 0; i < data.length;) {
    const operator = data[i++];
    if (operator === 4) {
      if (start) addLine(start);
      continue;
    }
    const count = operator === 0 || operator === 1 ? 2 : operator === 2 ? 6 : operator === 3 ? 4 : 0;
    if (!count || i + count > data.length) return null;
    const end = i + count;
    const point = transform(matrix, [data[end - 2], data[end - 1]]);
    if (!point.every(Number.isFinite)) return null;
    if (operator === 0) {
      points = [point];
      parts.push(points);
      current = start = point;
    } else if (operator === 1) {
      addLine(point);
      points.push(point);
    } else {
      current = point;
      curved = true;
    }
    i = end;
  }
  return { straight, parts, curved };
}

function convexPolygon(points: Point[]): Polygon | null {
  if (points.length < 3) return null;
  const base = points[0];
  let twiceArea = 0;
  for (const [index, point] of points.entries())
    twiceArea += cross(difference(point, base), difference(points[(index + 1) % points.length], base));
  const direction = Math.sign(twiceArea);
  if (!direction || points.length > 32) return null;
  for (const [index, point] of points.entries()) {
    const edge = difference(points[(index + 1) % points.length], point);
    if (points.some((other) => cross(edge, difference(other, point)) * direction < -epsilon)) return null;
  }
  return { points, direction };
}

function rectangle(box: unknown, matrix: Matrix): Polygon | null {
  if (!numericList(box) || box.length !== 4 || !Array.from(box).every(Number.isFinite)) return null;
  const [x, y, u, v] = Array.from(box);
  return convexPolygon(([[x, y], [u, y], [u, v], [x, v]] as Point[]).map((point) => transform(matrix, point)));
}

function clipSegment([a, b]: Segment, clips: Polygon[]): Segment | null {
  const delta = difference(b, a);
  let start = 0, end = 1;
  for (const { points, direction } of clips) {
    for (const [index, edgeStart] of points.entries()) {
      const edge = difference(points[(index + 1) % points.length], edgeStart);
      const from = direction * cross(edge, difference(a, edgeStart));
      const rate = direction * cross(edge, delta);
      if (Math.abs(rate) <= epsilon) {
        if (from < -epsilon) return null;
      } else {
        const t = -from / rate;
        if (rate > 0) start = Math.max(start, t);
        else end = Math.min(end, t);
        if (start >= end) return null;
      }
    }
  }
  return [[a[0] + start * delta[0], a[1] + start * delta[1]], [a[0] + end * delta[0], a[1] + end * delta[1]]];
}

/** Compare the pixels across the path already rendered by PDF.js. */
function isVisibleLine([a, b]: Segment, image: PageImage, widthHint: number) {
  const [dx, dy] = difference(b, a), length = Math.hypot(dx, dy);
  if (length < 3) return false;
  const nx = -dy / length, ny = dx / length;
  const radius = Math.min(24, Math.max(3, widthHint / 2 + 2));
  const offsets = [...new Set([0, -1, 1, -2, 2, -radius, radius, -radius / 2, radius / 2])];
  const tests = Math.min(24, Math.max(3, Math.ceil(length / 7)));
  let matches = 0, gaps = 0;
  for (let i = 0; i < tests; i++) {
    const t = (i + 0.5) / tests, x = a[0] + t * dx, y = a[1] + t * dy;
    const min = [255, 255, 255], max = [0, 0, 0];
    let count = 0;
    for (const offset of offsets) {
      const px = Math.floor(x + nx * offset), py = Math.floor(y + ny * offset);
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const first = (py * image.width + px) * 4;
      count++;
      for (let channel = 0; channel < 3; channel++) {
        const value = image.data[first + channel];
        min[channel] = Math.min(min[channel], value);
        max[channel] = Math.max(max[channel], value);
      }
    }
    if (count > 1 && max.some((value, channel) => value - min[channel] >= 18)) {
      matches++;
      gaps = 0;
    } else if (++gaps >= 3) return false;
  }
  return matches >= Math.ceil(tests * 0.8);
}

export function extractPdfPlanLines(
  operators: OperatorList,
  ops: Readonly<Record<string, number>>,
  viewport: number[],
  image: PageImage,
  layerVisible: (value: unknown) => boolean,
): DrawingLine[] {
  const matrix = asMatrix(viewport);
  const page = rectangle([0, 0, image.width, image.height], identity);
  if (!matrix || !page) return [];
  let state: Graphics = { matrix, clips: [page], dashed: false, strokeAlpha: 1, fillAlpha: 1, lineWidth: 1, masked: false };
  const stack: Graphics[] = [], layers: boolean[] = [];
  const result = new Map<string, { line: DrawingLine; length: number }>();
  const strokeOps = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const fillOps = new Set([ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  let pendingClip = false, pathUnits = 0, hiddenLayers = 0;
  const save = () => stack.push({ ...state });
  const restore = () => { state = stack.pop() ?? state; };
  const putClip = (polygon: Polygon | null) => { state.clips = state.clips && polygon ? [...state.clips, polygon] : null; };
  const setDash = (value: unknown) => { state.dashed = numericList(value) && value.length > 0; };
  const retainLongest = () => {
    const ordered = [...result].sort(([keyA, a], [keyB, b]) => b.length - a.length || keyA.localeCompare(keyB));
    result.clear();
    for (const [key, candidate] of ordered.slice(0, drawingLineLimit)) result.set(key, candidate);
  };
  const append = (segments: Segment[], widthHint: number) => {
    for (const segment of segments) {
      const clipped = state.clips && clipSegment(segment, state.clips);
      if (!clipped || !isVisibleLine(clipped, image, widthHint)) continue;
      const [a, b] = clipped.map(([x, y]): Point => [normalize(x / image.width), normalize(y / image.height)]);
      const [from, to] = a[0] < b[0] || a[0] === b[0] && a[1] <= b[1] ? [a, b] : [b, a];
      const line: DrawingLine = [...from, ...to];
      const length = Math.hypot((to[0] - from[0]) * image.width, (to[1] - from[1]) * image.height);
      result.set(line.join(","), { line, length });
      if (result.size > drawingLineLimit * 2) retainLongest();
    }
  };
  for (const [index, operator] of operators.fnArray.entries()) {
    const args = operators.argsArray[index];
    const values = Array.isArray(args) ? args : [];
    switch (operator) {
      case ops.save: save(); break;
      case ops.restore: restore(); break;
      case ops.transform: {
        const matrix = asMatrix(values);
        if (matrix) state.matrix = multiply(state.matrix, matrix);
        break;
      }
      case ops.setLineWidth: state.lineWidth = Number(values[0]); break;
      case ops.setDash: setDash(values[0]); break;
      case ops.setGState:
        for (const [key, value] of values[0] ?? []) {
          if (key === "CA") state.strokeAlpha = Number(value);
          if (key === "ca") state.fillAlpha = Number(value);
          if (key === "D") setDash(value?.[0]);
          if (key === "LW") state.lineWidth = Number(value);
        }
        break;
      case ops.paintFormXObjectBegin: {
        save();
        const matrix = asMatrix(values[0]);
        if (matrix) state.matrix = multiply(state.matrix, matrix);
        if (values[1]) putClip(rectangle(values[1], state.matrix));
        break;
      }
      case ops.beginGroup: {
        save();
        const group = values[0];
        const matrix = asMatrix(group?.matrix);
        if (group?.bbox) putClip(rectangle(group.bbox, matrix ? multiply(state.matrix, matrix) : state.matrix));
        // Form painting supplies its own transform. The group's matrix applies to its clip.
        if (group?.smask) state.masked = true;
        break;
      }
      case ops.paintFormXObjectEnd:
      case ops.endGroup: restore(); break;
      case ops.beginMarkedContent:
      case ops.beginMarkedContentProps: {
        const hidden = operator === ops.beginMarkedContentProps && values[0] === "OC" && !layerVisible(values[1]);
        layers.push(hidden);
        if (hidden) hiddenLayers++;
        break;
      }
      case ops.endMarkedContent: if (layers.pop()) hiddenLayers--; break;
      case ops.clip:
      case ops.eoClip: pendingClip = true; break;
      case ops.constructPath: {
        const data = values[1]?.[0];
        const operation = values[0];
        const stroke = strokeOps.has(operation) && !state.dashed && state.strokeAlpha > 0;
        const fill = fillOps.has(operation) && state.fillAlpha > 0;
        if (!numericList(data) || !pendingClip && (!stroke && !fill || hiddenLayers || state.masked || !state.clips)) {
          pendingClip = false;
          break;
        }
        pathUnits += data.length;
        if (pathUnits > drawingLineLimit * 240) return [];
        const path = decodePath(data, state.matrix);
        if (path && !hiddenLayers && !state.masked && state.clips) {
          const [a, b, c, d] = state.matrix;
          if (stroke) append(path.straight, state.lineWidth * Math.max(Math.hypot(a, b), Math.hypot(c, d)));
          else if (fill && !path.curved) append(path.parts.flatMap((points): Segment[] => points.length < 3 ? []
            : points.map((point, i) => [point, points[(i + 1) % points.length]])), 0);
        }
        if (pendingClip) {
          putClip(path && !path.curved && path.parts.length === 1 ? convexPolygon(path.parts[0]) : null);
          pendingClip = false;
        }
        break;
      }
      case ops.endPath: pendingClip = false; break;
    }
  }
  if (result.size > drawingLineLimit) retainLongest();
  return [...result.values()].map(({ line }) => line);
}

const normalize = (fraction: number) => Math.min(1, Math.max(0, Math.round(fraction * 1e8) / 1e8));
