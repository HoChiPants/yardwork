import { gibraltarDripEdge as stock, wissSnips } from "./dripEdgeReference";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { packRectangles } from "./packing";
import type { CodeReviewRow } from "./projectCode";
import {
  roofEdgeKinds,
  type DripEdge,
  type ShingleRoof,
} from "./shingleRoofSchema";
import { utahSources } from "./utahCodeSources";

const tolerance = 1e-7;
const minimumProjection = 2;
const minimumDrop = 0.25;
const maximumSpacing = 12;
const eligibleEdges = (roof: ShingleRoof) =>
  (roof.edges ?? []).filter(({ kind }) => kind === "eave" || kind === "rake");

export function reviewDripEdge(
  roof: ShingleRoof,
  plan: DripEdge,
  supplies: Project["supplies"],
  pitches: (number | null)[],
  overlaps: boolean,
) {
  const runs = eligibleEdges(roof).map((edge) => ({
    ...edge,
    blankLength:
      edge.length !== null && edge.dripEdgeExtra != null
        ? edge.length + edge.dripEdgeExtra
        : null,
  }));
  const joins = runs.some(
    ({ blankLength }) =>
      blankLength !== null && blankLength > stock.stockLength + tolerance,
  );
  const selected = supplies
    .filter(({ productId }) => productId === stock.id)
    .reduce((sum, item) => sum + item.quantity, 0);
  let pending = "";
  if (!plan.productId) pending = "Choose a stock profile to estimate sticks.";
  else if (!runs.length)
    pending = "Record at least one eave or rake in the roof edge list.";
  else if (runs.some(({ blankLength }) => blankLength === null))
    pending =
      "Enter each eave and rake length and its drip edge allowance. Enter zero when no extra is needed.";
  else if (
    overlaps ||
    pitches.some(
      (pitch) => pitch === null || pitch < stock.minPitch - tolerance,
    )
  )
    pending =
      "Review the roof areas. This profile is recommended for 3:12 or steeper.";
  else if (
    joins &&
    (plan.lap === null ||
      plan.lap < stock.minLap ||
      plan.lap > stock.maxGuideLap)
  )
    pending = "Enter a 2–3 in splice overlap for this profile’s cut estimate.";

  const layouts = pending
    ? []
    : runs.map((run) => {
        const length = run.blankLength!;
        const lap = plan.lap ?? 0;
        const remaining = length - stock.stockLength;
        if (remaining <= tolerance)
          return {
            run,
            full: length >= stock.stockLength - tolerance ? 1 : 0,
            cuts: length >= stock.stockLength - tolerance ? [] : [length],
          };
        const effective = stock.stockLength - lap;
        const segments = 1 + Math.ceil((remaining - tolerance) / effective);
        const last = length - (segments - 1) * effective;
        if (last >= stock.stockLength - tolerance)
          return { run, full: segments, cuts: [] };
        // Split the final two pieces so the last splice is not immediately at the end.
        const cut = (stock.stockLength + last) / 2;
        return { run, full: segments - 2, cuts: [cut, cut] };
      });
  const whole = layouts.reduce((sum, layout) => sum + layout.full, 0);
  const { plans } = packRectangles(
    layouts.flatMap(({ run, full, cuts }) =>
      cuts.map((length, index) => ({
        id: `${run.id}-${index}`,
        name: `${run.label} · piece ${full + index + 1}`,
        width: 1,
        length,
      })),
    ),
    1,
    stock.stockLength,
    { allowRotation: false },
  );
  const sticks = pending ? null : whole + plans.length;
  return {
    runs,
    layouts,
    pending,
    selected,
    whole,
    sticks,
    cuts: plans,
    missing: sticks === null ? 0 : Math.max(0, sticks - selected),
    cutToolNeeded:
      plans.length > 0 || runs.some(({ dripEdgeExtra }) => !!dripEdgeExtra),
  };
}

export function dripEdgeCutLines(review: ReturnType<typeof reviewDripEdge>) {
  return [
    ...review.layouts.map(({ run, full, cuts }) => {
      const lengths = [
        ...(full ? [`${full} × 10 ft`] : []),
        ...cuts.map(formatStockLength),
      ];
      return `${run.label} · ${lengths.join(" + ")} before corner shaping.`;
    }),
    ...review.cuts.map((stick, index) => {
      const lengths = stick.placements.map(
        (cut) => `${cut.name} ${formatStockLength(cut.length)}`,
      );
      const left = formatStockLength(
        Math.max(0, stock.stockLength - stick.usedLength),
      );
      return `Drip edge stick ${review.whole + index + 1} · ${lengths.join(" + ")} · ${left} left.`;
    }),
    "The estimate assumes full 10 ft stock and no kerf from snips. Verify delivered lengths and corner fit.",
  ];
}

export function dripEdgeGuideLines(
  plan: DripEdge,
  review: ReturnType<typeof reviewDripEdge>,
) {
  const units = (length: number | null) =>
    length === null ? "pending" : formatStockLength(length);
  const order = (value: DripEdge["eaveUnderlayment"]) =>
    value === "unknown" ? "pending" : `${value} the drip edge`;
  return [
    `Drip edge · recorded lap ${units(plan.lap)} · deck projection ${units(plan.deckReach)} · drop below sheathing ${units(plan.belowSheathing)} · maximum fastener spacing ${units(plan.fastenerSpacing)}.`,
    `Underlayment · eaves ${order(plan.eaveUnderlayment)} · rakes ${order(plan.rakeUnderlayment)}.`,
    ...review.runs.map(
      (edge) =>
        `${edge.label} · ${roofEdgeKinds[edge.kind]} · ${units(edge.length)} edge · ${units(edge.dripEdgeExtra ?? null)} corner and trim allowance.`,
    ),
    ...(review.sticks === null
      ? [review.pending]
      : [
          `${stock.label} · ${review.sticks} × 10 ft estimated · ${review.selected} on the shopping list.`,
          ...dripEdgeCutLines(review),
          "Verify splice positions, fastener type and corrosion compatibility.",
          ...(review.cutToolNeeded
            ? [
                `For sheet-metal cuts, review ${wissSnips.label} and the cut setup. Verify access across the actual formed profile.`,
              ]
            : []),
        ]),
  ];
}

export function dripEdgeCodeRows(
  roof: ShingleRoof,
  plan: DripEdge,
  scoped: boolean,
): CodeReviewRow[] {
  const sources = [
    utahSources.ircDripEdge,
    utahSources.ircMechanicalAmendments,
    utahSources.local,
  ];
  if (plan.productId)
    sources.push({
      title: "Gibraltar galvanized roof edge installation guide",
      url: stock.instructions,
    });
  const row = (
    key: string,
    label: string,
    state: CodeReviewRow["state"],
    detail: string,
  ): CodeReviewRow => ({
    id: `drip-edge-${key}`,
    label: `Drip edge · ${label}`,
    state,
    detail,
    sources,
  });
  if (!scoped)
    return [
      row(
        "scope",
        "Code scope",
        "authority-review",
        "Confirm the Utah 2021 IRC path, local applicability and the reviewed project date before using these comparisons.",
      ),
    ];
  const edges = eligibleEdges(roof);
  const compare = (
    key: string,
    label: string,
    value: number | null,
    limit: number,
    direction: "at least" | "at most",
  ) =>
    row(
      key,
      label,
      value === null
        ? "needs-input"
        : (direction === "at least" ? value >= limit : value <= limit)
          ? "measured-match"
          : "discrepancy",
      `${value === null ? "Measurement pending" : `Recorded ${formatStockLength(value)}`}. 2021 IRC reference is ${direction} ${formatStockLength(limit)}.`,
    );
  return [
    ...(edges.length
      ? []
      : [
          row(
            "runs",
            "Edge locations",
            "needs-input",
            "Record the eave and rake runs included in this review.",
          ),
        ]),
    ...(plan.lap !== null ||
    (plan.productId &&
      edges.some(
        ({ length, dripEdgeExtra }) =>
          (length ?? 0) + (dripEdgeExtra ?? 0) > stock.stockLength + tolerance,
      ))
      ? [compare("lap", "Splice overlap", plan.lap, stock.minLap, "at least")]
      : []),
    compare(
      "reach",
      "Deck projection",
      plan.deckReach,
      minimumProjection,
      "at least",
    ),
    compare(
      "drop",
      "Drop below sheathing",
      plan.belowSheathing,
      minimumDrop,
      "at least",
    ),
    compare(
      "spacing",
      "Fastener spacing",
      plan.fastenerSpacing,
      maximumSpacing,
      "at most",
    ),
    ...(["eave", "rake"] as const).flatMap((kind) => {
      if (!edges.some((edge) => edge.kind === kind)) return [];
      const recorded =
        kind === "eave" ? plan.eaveUnderlayment : plan.rakeUnderlayment;
      const expected = kind === "eave" ? "over" : "under";
      return [
        row(
          kind,
          `${roofEdgeKinds[kind]} underlayment order`,
          recorded === "unknown"
            ? "needs-input"
            : recorded === expected
              ? "recorded-condition"
              : "discrepancy",
          `${recorded === "unknown" ? "Order pending" : `Recorded ${recorded} the drip edge`}. The reference places underlayment ${expected} the drip edge at the ${kind}.`,
        ),
      ];
    }),
  ];
}
