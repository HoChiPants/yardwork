import { formatPreciseInches as dim } from "./measurement";
import type { Project } from "./model";
import { reviewWaterRun } from "./wallWater";
import { reviewWaterFitting, waterPortKey } from "./waterFittings";
import { waterSupportReference } from "./waterSupportReference";

type RunReview = ReturnType<typeof reviewWaterRun>;
type FittingReview = ReturnType<typeof reviewWaterFitting>;
type Station = {
  key: string;
  label: string;
  runId?: string;
  pieceId?: string;
  kind: "support" | "endpoint" | "junction";
  edges: { to: Station; length: number }[];
};
type Span = {
  from: Omit<Station, "edges">;
  to: Omit<Station, "edges">;
  length: number;
  kind: "supported" | "end-reach" | "unanchored";
};

/** Trace the uninterrupted centerline paths, using a checked isolator as a support stop. */
export function waterSupportNetwork(
  project: Project,
  checkedRuns?: ReadonlyMap<string, RunReview>,
  checkedFittings?: ReadonlyMap<string, FittingReview>,
) {
  const stations = new Map<string, Station>();
  const unresolved: string[] = [];
  const add = (key: string, label: string, kind: Station["kind"], runId?: string, pieceId?: string) => {
    const station: Station = { key, label, kind, runId, pieceId, edges: [] };
    stations.set(key, station);
    return station;
  };
  const connect = (a: Station, b: Station, length: number) => {
    a.edges.push({ to: b, length });
    b.edges.push({ to: a, length });
  };
  for (const run of project.waterRuns ?? []) {
    const { measured } = checkedRuns?.get(run.id) ?? reviewWaterRun(project, run);
    if (!measured) {
      unresolved.push(run.name);
      continue;
    }
    const first = add(waterPortKey({ runId: run.id, end: "start" }), `${run.name} start`, "endpoint", run.id, run.pipeId);
    const last = add(waterPortKey({ runId: run.id, end: "end" }), `${run.name} end`, "endpoint", run.id, run.pipeId);
    let previous = first;
    let distance = 0;
    for (const support of measured.supports) {
      const item = run.isolators?.find(({ studId }) => studId === support.studId);
      const stud = measured.studs.find(({ piece }) => piece.id === support.studId);
      const node = add(`${run.id}/${support.studId}`, `${run.name} at ${stud?.piece.name ?? "stud"}`, "support", run.id, item?.id);
      connect(previous, node, support.distance - distance);
      previous = node;
      distance = support.distance;
    }
    connect(previous, last, measured.length - distance);
  }
  for (const fitting of project.waterFittings ?? []) {
    const { layout } = checkedFittings?.get(fitting.id) ?? reviewWaterFitting(project, fitting);
    if (!layout) {
      const fittedPart = project.pieces.find(({ id }) => id === fitting.pieceId);
      unresolved.push(fittedPart?.name ?? "Removed PEX fitting");
      continue;
    }
    const joint = add(fitting.id, layout.product.model, "junction", undefined, fitting.pieceId);
    for (const { port, cutEnd } of layout.positions) {
      const endpoint = stations.get(waterPortKey(port));
      if (!endpoint) continue;
      endpoint.kind = "junction";
      const insertedOffset = Math.hypot(...cutEnd.map((value, axis) => value - layout.center.getComponent(axis)));
      connect(endpoint, joint, insertedOffset);
    }
  }
  const stops = [...stations.values()].filter(({ kind }) => kind !== "junction");
  const reached = new Set<string>();
  let loop = false;
  const spans: Span[] = [];
  const stopInfo = ({ edges: _edges, ...point }: Station) => point;
  for (const origin of stops) {
    const visited = new Set([origin.key]);
    reached.add(origin.key);
    const pending = [{ at: origin, previous: "", length: 0 }];
    while (pending.length) {
      const { at, previous, length } = pending.pop()!;
      for (const edge of at.edges) {
        const { to } = edge;
        if (to.key === previous) continue;
        if (to === origin) {
          loop = true;
          continue;
        }
        const total = length + edge.length;
        if (to.kind !== "junction") {
          if (origin.key < to.key)
            spans.push({
              from: stopInfo(origin), to: stopInfo(to), length: total,
              kind: origin.kind === to.kind ? origin.kind === "support" ? "supported" : "unanchored" : "end-reach",
            });
          continue;
        }
        if (visited.has(to.key)) {
          loop = true;
          continue;
        }
        visited.add(to.key);
        reached.add(to.key);
        pending.push({ at: to, previous: at.key, length: total });
      }
    }
  }
  return {
    spans: spans.sort((a, b) => b.length - a.length || a.from.key.localeCompare(b.from.key)),
    unresolved,
    loop: loop || reached.size !== stations.size,
    count: stops.filter(({ kind }) => kind === "support").length,
  };
}

export type WaterSupportNetwork = ReturnType<typeof waterSupportNetwork>;
export const longSupportSpan = (span: Span) => span.length > waterSupportReference.maximumSpan + 1e-6;
export const waterSupportSpanLine = ({ from, to, length, kind }: Span) =>
  `${dim(length)} · ${from.label} to ${to.label} · ${kind === "supported"
    ? "Between isolators" : kind === "end-reach" ? "Review end support" : "Add support to this path"}`;

export function waterSupportGuideLines(review: WaterSupportNetwork) {
  const unreviewed = review.unresolved.length ? [`Resolve changed routes or fittings · ${review.unresolved.join(", ")}.`] : [];
  return [
    `${review.count} modeled through-stud supports. Centerline spans include the modeled path through valid fittings. Review the 32 in horizontal spacing and field support at open ends.`,
    ...unreviewed,
    ...(review.loop ? ["Review the unsupported loop before relying on its longest path."] : []),
    ...review.spans.map((span) => `${waterSupportSpanLine(span)}${longSupportSpan(span) ? " · Review the reach above 32 in" : ""}.`),
  ];
}
