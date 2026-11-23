import type {
  ConnectionCoverage,
  ConnectionIntent,
} from "./connectionCoverage";
import {
  bearingContactSignature,
  bearingDecisionKey,
} from "./bearingDecisions";
import type { BearingDecision } from "./bearingDecisionSchema";
import type { Piece, Project } from "./model";
import { partLabel } from "./partLabels";
import { recordedRemovalText, removalGeometryKey } from "./recordedRemoval";
import { fittedSupportBlockEnds, type WoodSupportReview } from "./woodSupport";
import { modeledWoodContactDetail, modeledWoodContactState } from "./modeledWoodContacts";
import { woodJointDecisionEntries, woodPairKey } from "./woodJointDecisions";

export type BearingConnection = {
  top: Piece;
  base: Piece;
  area: number;
  records: ConnectionIntent[];
  decision?: {
    saved: BearingDecision;
    state: "current" | "changed" | "hardware";
    removalText: string;
  };
};

export type BearingConnectionReview = {
  pairs: BearingConnection[];
  withoutContact: BearingDecision[];
};

export const bearingConnectionScope =
  "Review how each touching pair is held in the build. Some contacts are intended to stay removable. Saved plans describe the intended hardware and locations. Verify installation and capacity for the actual use.";

const pairKey = (a: string, b: string) =>
  JSON.stringify(a < b ? [a, b] : [b, a]);

export function bearingConnections(
  project: Project,
  wood: WoodSupportReview,
  coverage: ConnectionCoverage,
): BearingConnectionReview {
  const intents = new Map<string, ConnectionIntent[]>();
  for (const row of coverage.intents) {
    if (row.purpose === "external-restraint" || row.pieceIds.length !== 2)
      continue;
    const key = pairKey(row.pieceIds[0], row.pieceIds[1]);
    const prior = intents.get(key) ?? [];
    prior.push(row);
    intents.set(key, prior);
  }
  const decisions = new Map(
    (project.bearingDecisions ?? []).map((row) => [
      bearingDecisionKey(row.topId, row.baseId),
      row,
    ]),
  );
  const removalGeometry = project.bearingDecisions?.some(
    ({ removalPath }) => removalPath,
  )
    ? removalGeometryKey(project)
    : null;
  const pairs = Array.from(wood.values()).flatMap(({ piece: top, supports }) =>
    supports.map(({ pieceId, area }): BearingConnection => {
      const base = wood.get(pieceId)!.piece;
      const records = intents.get(pairKey(top.id, pieceId)) ?? [];
      const key = bearingDecisionKey(top.id, pieceId);
      const saved = decisions.get(key);
      if (!saved) return { top, base, area, records };
      decisions.delete(key);
      const state =
        saved.contactSignature !== bearingContactSignature(top, base)
          ? "changed"
          : records.some(
                ({ purpose, state }) =>
                  purpose !== "shelf-support" &&
                  state !== "stale" &&
                  state !== "conflict",
              )
            ? "hardware"
            : "current";
      return {
        top,
        base,
        area,
        records,
        decision: {
          saved,
          state,
          removalText: recordedRemovalText(
            saved,
            state === "changed" ? null : removalGeometry,
          ),
        },
      };
    }),
  );
  return { pairs, withoutContact: [...decisions.values()] };
}

export function summarizeBearingConnections(
  rows: readonly BearingConnection[],
) {
  const without = rows.filter(
    ({ records, decision }) => !records.length && !decision,
  ).length;
  const reviewed = rows.filter(({ records }) =>
    records.some(
      ({ state, current }) => state === "geometry-reviewed" && current,
    ),
  ).length;
  const pending = rows.filter(({ records }) =>
    records.some(
      ({ state, current }) => state !== "geometry-reviewed" || !current,
    ),
  ).length;
  const removable = rows.filter(
    ({ decision }) => decision?.state === "current",
  ).length;
  const revisit = rows.filter(
    ({ decision }) => decision && decision.state !== "current",
  ).length;
  return `${rows.length} touching wood ${rows.length === 1 ? "pair" : "pairs"} · ${without} without pair records · ${pending} with detail to review · ${reviewed} with geometry-reviewed locations${removable ? ` · ${removable} marked removable` : ""}${revisit ? ` · ${revisit} removable decisions to review` : ""}`;
}

export function fittedSupportBlockJoints(
  project: Project, wood: WoodSupportReview, bearing: BearingConnectionReview,
  woodDetails = woodJointDecisionEntries(project),
) {
  const blocks = fittedSupportBlockEnds(wood);
  if (!blocks.length) return [];
  const pairByEnds = new Map(bearing.pairs.map((pair) => [bearingDecisionKey(pair.top.id, pair.base.id), pair]));
  const details = new Map(woodDetails.filter(({ decision }) => decision.method !== "sealant").map((detail) => [detail.id, detail]));
  return blocks.map(({ block, aboveIds, baseId, fit, onFloor }) => {
    const readEnd = (topId: string, lowerId: string, upper: boolean) => {
      const pair = pairByEnds.get(bearingDecisionKey(topId, lowerId));
      const records = pair?.records ?? [];
      const detail = details.get(woodPairKey(topId, lowerId));
      const state = modeledWoodContactState(records, pair?.decision?.state, detail);
      const label = partLabel(project, upper ? topId : lowerId);
      return {
        text: `${upper ? "Upper" : "Lower"} joint with ${label}. ${modeledWoodContactDetail({ state, detail,
          planLabels: [...new Set(records.map(({ label }) => label.split("/")[0]))] })}`,
        needsReview: state === "unplanned" || state === "pending",
      };
    };
    const ends = fit ? [...aboveIds.map((id) => readEnd(id, block.id, true)),
      ...(baseId ? [readEnd(block.id, baseId, false)] : []),
    ] : [];
    const siteNote = onFloor ? "Check bearing and restraint at the actual floor." : "";
    return {
      block, fit, siteNote,
      detail: fit ? [...ends.map(({ text }) => text), siteNote].filter(Boolean).join(" ")
        : "The modeled fit changed. Check bearing at both ends before choosing a joint.",
      needsReview: !fit || ends.some((end) => end.needsReview),
    };
  });
}

export type FittedSupportBlockJointReview = ReturnType<typeof fittedSupportBlockJoints>[number];

export const bearingDecisionStateText: Record<
  NonNullable<BearingConnection["decision"]>["state"],
  string
> = {
  current: "Removable contact",
  changed: "Review removable contact · Parts or placement changed",
  hardware:
    "Review removable contact · Saved fastening or hinge details also use these parts",
};

export function bearingConnectionGuideLines(
  project: Project,
  review: BearingConnectionReview,
  coverage: ConnectionCoverage,
) {
  const byUpper = new Map<string, BearingConnection[]>();
  for (const row of review.pairs) {
    const group = byUpper.get(row.top.id) ?? [];
    group.push(row);
    byUpper.set(row.top.id, group);
  }
  const describe = ({ topId, baseId, note }: BearingDecision, text: string) =>
    `${partLabel(project, topId)} on ${partLabel(project, baseId)} · ${text} · ${note}`;
  const lines = coverage.stages.flatMap(({ title, memberIds }) => {
    const pairs = memberIds.flatMap((id) => byUpper.get(id) ?? []);
    return pairs.length
      ? [
          `${title} · ${summarizeBearingConnections(pairs)}`,
          ...pairs.flatMap(({ decision }) =>
            decision
              ? [
                  describe(
                    decision.saved,
                    bearingDecisionStateText[decision.state],
                  ),
                  ...(decision.removalText
                    ? [
                        `${partLabel(project, decision.saved.topId)} · ${decision.removalText}`,
                      ]
                    : []),
                ]
              : [],
          ),
        ]
      : [];
  });
  return [
    ...lines,
    ...review.withoutContact.flatMap((saved) => [
      describe(
        saved,
        "Review removable contact · The saved parts no longer bear on each other",
      ),
      ...(saved.removalPath
        ? [
            `${partLabel(project, saved.topId)} · ${recordedRemovalText(saved, null)}`,
          ]
        : []),
    ]),
  ];
}
