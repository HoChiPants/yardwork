import { formatStockLength } from "./measurement";
import type { AttachmentReview } from "./attachments";
import type { Piece, V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";

type Interval = [number, number];
type Direction = "width" | "depth";
type SpanKind = "between" | "overhang" | "unsupported";
type Span = {
  direction: Direction;
  kind: SpanKind;
  length: number;
  line: [V3, V3];
};
type BearingSurface = {
  piece: Piece;
  undersides: V3[][];
  contacts: { outline: V3[] }[];
};
type PinRow = {
  row: "front" | "rear";
  problem: "unpaired" | "offset" | "cut" | null;
  reaches: [V3, V3][];
  spans: Span[];
};

const epsilon = 1e-7;
const samplePositions = [0.5, 0.25, 0.75];
const directions = ["width", "depth"] as const;
const kinds = ["between", "overhang", "unsupported"] as const;
const spanLabels = {
  between: "between contacts",
  overhang: "edge overhang",
  unsupported: "without contact along the measured line",
};

// All input faces are convex. A cutline through a vertex can hit both of its edges.
function section(outline: V3[], along: number, across: number, at: number) {
  const hits = outline.flatMap((a, index) => {
    const b = outline[(index + 1) % outline.length];
    const da = a[across] - at,
      db = b[across] - at;
    if (Math.abs(da) <= epsilon) return [a[along]];
    if (da * db < 0)
      return [a[along] + ((b[along] - a[along]) * da) / (da - db)];
    return [];
  });
  const min = Math.min(...hits),
    max = Math.max(...hits);
  return max - min > epsilon ? ([min, max] as Interval) : null;
}

function merge(intervals: Interval[]) {
  const merged: Interval[] = [];
  for (const [low, high] of intervals.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && low <= last[1] + epsilon) last[1] = Math.max(last[1], high);
    else merged.push([low, high]);
  }
  return merged;
}

function panelSections({ piece, undersides, contacts }: BearingSurface) {
  const inverse = inverseRotation(piece.rotation);
  const local = (point: V3) =>
    rotate(
      point.map((value, axis) => value - piece.position[axis]) as V3,
      inverse,
    );
  const faces = undersides.map((outline) => outline.map(local)),
    patches = contacts.map(({ outline }) => outline.map(local));
  const points = faces.flat();
  const { thickness } = stockAxes(piece, piece.cutStock?.size ?? piece.size);
  const axes = ([0, 1, 2] as const).filter((axis) => axis !== thickness);
  const level = points[0]?.[thickness];
  // A single set of coplanar intervals cannot describe a stepped underside.
  if (
    level === undefined ||
    points.some((point) => Math.abs(point[thickness] - level) > epsilon)
  )
    return null;

  const trackAxes = (direction: Direction) => {
    const index = directions.indexOf(direction);
    return [axes[index], axes[1 - index]] as const;
  };
  const track = (direction: Direction, at: number) => {
    const [along, across] = trackAxes(direction);
    const intervals = (outlines: V3[][]) =>
      merge(
        outlines.flatMap((outline) => {
          const hit = section(outline, along, across, at);
          return hit ? [hit] : [];
        }),
      );
    const world = (coordinate: number): V3 => {
      const point: V3 = [0, 0, 0];
      point[thickness] = level;
      point[along] = coordinate;
      point[across] = at;
      return rotate(point, piece.rotation).map(
        (n, axis) => n + piece.position[axis],
      ) as V3;
    };
    return {
      direction,
      world,
      material: intervals(faces),
      contacts: intervals(patches),
    };
  };
  const samples = (direction: Direction) => {
    const [, across] = trackAxes(direction);
    const low = Math.min(...points.map((point) => point[across]));
    const high = Math.max(...points.map((point) => point[across]));
    return samplePositions.map((fraction) =>
      track(direction, low + (high - low) * fraction),
    );
  };
  return { local, thickness, level, track, samples };
}

type PanelTrack = ReturnType<
  NonNullable<ReturnType<typeof panelSections>>["track"]
>;
function measureTrack(track: PanelTrack, pinContacts: Interval[] = []) {
  const { direction, world, material, contacts } = track;
  const spans: Span[] = [];
  const bearing = pinContacts.length
    ? merge([...contacts, ...pinContacts])
    : contacts;
  const record = (start: number, end: number, kind: SpanKind) => {
    if (end - start > epsilon)
      spans.push({
        direction,
        kind,
        length: end - start,
        line: [world(start), world(end)],
      });
  };
  for (const [start, end] of material) {
    const supported = bearing.flatMap(([low, high]): Interval[] => {
      const left = Math.max(start, low),
        right = Math.min(end, high);
      return right - left > epsilon ? [[left, right]] : [];
    });
    if (!supported.length) {
      record(start, end, "unsupported");
      continue;
    }
    let cursor = start;
    for (const [index, [left, right]] of supported.entries()) {
      record(cursor, left, index === 0 ? "overhang" : "between");
      cursor = right;
    }
    record(cursor, end, "overhang");
  }
  return spans;
}

/** Measure retained panel material along three interior lines in each local direction. */
export function reviewWoodSpans(surface: BearingSurface) {
  const panel = panelSections(surface);
  if (!panel) return null;
  const spans = directions.flatMap((direction) =>
    panel.samples(direction).flatMap((track) => measureTrack(track)),
  );
  // Keep one longest witness per direction and kind for a legible 3D overlay.
  return directions.flatMap((direction) =>
    kinds.flatMap((kind) => {
      const longest = spans.reduce<Span | null>(
        (best, span) =>
          span.direction === direction &&
          span.kind === kind &&
          (!best || span.length > best.length + epsilon)
            ? span
            : best,
        null,
      );
      return longest ? [longest] : [];
    }),
  );
}

/** Use the actual bearing reach in the shelf underside plane, one opposed pin row at a time. */
export function reviewShelfPinRows(
  surface: BearingSurface,
  reviews: readonly AttachmentReview[],
) {
  const panel = panelSections(surface);
  if (!panel || panel.thickness !== 1) return [];
  const { local, level } = panel;
  return reviews.flatMap((review) => {
    const reach = review.plan.measurements.bearingReach;
    if (review.state !== "geometry-checked" || reach === null) return [];
    const points = review.points.filter(
      ({ point }) => point.shelf.pieceId === surface.piece.id,
    );
    if (!points.length) return [];
    const rows = (["front", "rear"] as const).map((row): PinRow => {
      const pins = points.filter((pin) => pin.point.row === row);
      const problem = (code: PinRow["problem"]): PinRow => ({
        row,
        problem: code,
        reaches: [],
        spans: [],
      });
      if (pins.length !== 2 || pins[0].point.side === pins[1].point.side)
        return problem("unpaired");
      const endpoints = pins.map((pin) => {
        const tip = pin.bearingTargetWorld.map(
          (n, i) => n - reach * pin.drillDirectionWorld[i],
        ) as V3;
        return [local(pin.shelfAnchorWorld), local(tip)] as const;
      });
      const depth = endpoints[0][0][2];
      if (
        endpoints
          .flat()
          .some(
            (point) =>
              Math.abs(point[1] - level) > epsilon ||
              Math.abs(point[2] - depth) > epsilon,
          )
      )
        return problem("offset");
      const track = panel.track("width", depth);
      const reaches = endpoints.map(([anchor, tip]): Interval => [
        Math.min(anchor[0], tip[0]),
        Math.max(anchor[0], tip[0]),
      ]);
      if (
        reaches.some(
          ([start, end]) =>
            !track.material.some(
              ([low, high]) => start >= low - epsilon && end <= high + epsilon,
            ),
        )
      )
        return problem("cut");
      return {
        row,
        problem: null,
        reaches: reaches.map(([start, end]) => [
          track.world(start),
          track.world(end),
        ]),
        spans: measureTrack(track, reaches),
      };
    });
    return [{ rows }];
  });
}

export function seatSpanSummary(spans: Span[]) {
  return [
    ...woodSpanLines(spans, "seat"),
    ...(spans.some(({ kind }) => kind === "unsupported")
      ? [
          "Check whether a rail or cleat can reach the highlighted run and leave room for the lid to open.",
        ]
      : []),
    "Seating capacity still needs review.",
  ].join(" ");
}

function woodSpanLines(spans: Span[], panel: "seat" | "shelf") {
  const byDirection = directions.flatMap((direction) => {
    const lengths = spans
      .filter((span) => span.direction === direction)
      .map(
        (span) => `${formatStockLength(span.length)} ${spanLabels[span.kind]}`,
      );
    return lengths.length
      ? [
          `${direction === "width" ? `Across the ${panel}` : "Along the depth"}, ${lengths.join(", ")}.`,
        ]
      : [];
  });
  return [
    "Longest unsupported runs measured at three lines in each direction.",
    ...(byDirection.length
      ? byDirection
      : ["Wood contact covers the retained material along all six lines."]),
  ];
}

export function shelfSpanSummary({
  wood,
  pinRows,
  reviewedPinSet,
}: {
  wood: Span[] | null;
  pinRows: PinRow[];
  reviewedPinSet: boolean;
}) {
  const sources = pinRows.map(({ row, problem, spans }) => {
    const label = row === "front" ? "Front pin row" : "Rear pin row";
    if (problem === "unpaired")
      return `${label} needs one current pin on each side.`;
    if (problem === "offset")
      return `${label} needs both pin reaches on the same line.`;
    if (problem === "cut")
      return `${label} crosses removed shelf material under a pin. Review that bearing location.`;
    const lengths = kinds.flatMap((kind) => {
      const length = Math.max(
        0,
        ...spans
          .filter((span) => span.kind === kind)
          .map((span) => span.length),
      );
      return length > epsilon
        ? [`${formatStockLength(length)} ${spanLabels[kind]}`]
        : [];
    });
    return `${label}, ${lengths.length ? lengths.join(", ") : "bearing covers the retained line"}.`;
  });
  return [
    ...(wood ? woodSpanLines(wood, "shelf") : []),
    ...sources,
    ...(pinRows.some((row) => row.reaches.length)
      ? ["The 3D view shows measured pin reaches in blue."]
      : []),
    ...(pinRows.length &&
    !reviewedPinSet &&
    pinRows.every((row) => !row.problem)
      ? [
          "The shelf center lies outside the area between the measured pin reaches.",
        ]
      : []),
    ...(wood?.some(({ kind }) => kind === "unsupported")
      ? ["Check whether a cleat or divider can reach the highlighted strip."]
      : []),
    "Shelf load capacity still needs review.",
  ].join(" ");
}
