import type { BearingConnectionReview } from "./bearingConnections";
import { nearbyConnectionPairs } from "./connectionContacts";
import type { ConnectionCoverage, ConnectionIntent } from "./connectionCoverage";
import type { Project } from "./model";

export type ModeledWoodContact = {
  id: string;
  memberIds: [string, string];
  title: string;
  state: "unplanned" | "pending" | "reviewed" | "removable";
  planLabels: string[];
};

export const modeledWoodContactScope =
  "These are modeled touching wood faces. Review how each pair is supported or joined. Hardware fit, loads and capacity require their own review.";

function pairKey(first: string, second: string) {
  return first < second ? `${first}/${second}` : `${second}/${first}`;
}

export function reviewModeledWoodContacts(
  project: Project,
  coverage: Pick<ConnectionCoverage, "parts" | "intents">,
  bearing: BearingConnectionReview,
) {
  const search = nearbyConnectionPairs(project, undefined, {
    maxGap: 0,
    limit: 1000,
    maxChecks: 20000,
  });
  const parts = new Map(coverage.parts.map((part) => [part.pieceId, part]));
  const plans = new Map<string, ConnectionIntent[]>();
  for (const intent of coverage.intents) {
    if (intent.pieceIds.length !== 2 || intent.activePieceIds.length !== 2 ||
        intent.purpose === "external-restraint") continue;
    const key = pairKey(intent.pieceIds[0], intent.pieceIds[1]);
    const existing = plans.get(key);
    if (existing) existing.push(intent);
    else plans.set(key, [intent]);
  }
  const decisions = new Map(bearing.pairs.flatMap(({ top, base, decision }) =>
    decision ? [[pairKey(top.id, base.id), decision.state] as const] : [],
  ));
  const pairs: ModeledWoodContact[] = search.pairs.map(({ aId, bId }) => {
    const id = pairKey(aId, bId);
    const records = plans.get(id) ?? [];
    const decision = decisions.get(id);
    const state = records.length
      ? decision !== "changed" && decision !== "hardware" &&
        records.every(({ current, state }) => current && state === "geometry-reviewed")
        ? "reviewed" : "pending"
      : decision === "current" ? "removable" : decision ? "pending" : "unplanned";
    const memberIds: [string, string] = [aId, bId];
    memberIds.sort((a, b) => (parts.get(a)?.label ?? a).localeCompare(parts.get(b)?.label ?? b, undefined, { numeric: true }));
    return {
      id, memberIds, state,
      title: memberIds.map((member) => {
        const part = parts.get(member);
        return part ? `${part.label} · ${part.name}` : member;
      }).join(" ↔ "),
      planLabels: [...new Set(records.map(({ label }) => label.split("/")[0]))],
    };
  });
  const priority = { pending: 0, unplanned: 1, removable: 2, reviewed: 3 };
  pairs.sort((a, b) => priority[a.state] - priority[b.state] ||
    a.title.localeCompare(b.title, undefined, { numeric: true }));
  return {
    pairs,
    needsReview: pairs.filter(({ state }) => state === "unplanned" || state === "pending"),
    limited: !search.complete || search.candidateCount > pairs.length,
  };
}

export type ModeledWoodContactReview = ReturnType<typeof reviewModeledWoodContacts>;

export function modeledWoodContactDetail({ state, planLabels }: ModeledWoodContact) {
  switch (state) {
    case "unplanned": return "No pair plan recorded.";
    case "removable": return "A removable bearing decision is recorded.";
    case "reviewed": return "This pair has geometry-reviewed plan locations.";
    case "pending":
      return planLabels.length
        ? `Review the saved joint details for ${planLabels.join(", ")}.`
        : "The removable bearing decision needs a fresh review.";
  }
}
