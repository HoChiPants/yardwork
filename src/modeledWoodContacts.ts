import type { BearingConnectionReview } from "./bearingConnections";
import { nearbyConnectionPairs } from "./connectionContacts";
import type { ConnectionCoverage, ConnectionIntent } from "./connectionCoverage";
import type { Project } from "./model";
import { woodJointDecisionEntries, woodJointMethods, woodPairKey, type WoodJointDecisionEntry } from "./woodJointDecisions";

export type ModeledWoodContact = {
  id: string;
  memberIds: [string, string];
  title: string;
  state: "unplanned" | "pending" | "reviewed" | "removable" | "documented";
  planLabels: string[];
  detail?: WoodJointDecisionEntry;
};

export const modeledWoodContactScope =
  "These are modeled touching wood faces. Review how each pair is supported or joined. Hardware fit, loads and capacity require their own review.";

export function modeledWoodContactState(
  records: readonly ConnectionIntent[], decision?: "current" | "changed" | "hardware", detail?: WoodJointDecisionEntry,
): ModeledWoodContact["state"] {
  const hasOpenRecord = records.some(({ current, state }) => !current || state !== "geometry-reviewed");
  if (hasOpenRecord || decision === "changed" || decision === "hardware" || (detail && detail.status !== "current")) return "pending";
  if (records.length) return "reviewed";
  if (decision === "current") return "removable";
  return detail ? "documented" : "unplanned";
}

export function reviewModeledWoodContacts(
  project: Project,
  coverage: Pick<ConnectionCoverage, "parts" | "intents">,
  bearing: BearingConnectionReview,
  details = woodJointDecisionEntries(project),
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
    const key = woodPairKey(intent.pieceIds[0], intent.pieceIds[1]);
    const existing = plans.get(key);
    if (existing) existing.push(intent);
    else plans.set(key, [intent]);
  }
  const decisions = new Map(bearing.pairs.flatMap(({ top, base, decision }) =>
    decision ? [[woodPairKey(top.id, base.id), decision.state] as const] : [],
  ));
  const jointDetails = new Map(details.map((row) => [row.id, row]));
  const pairs: ModeledWoodContact[] = search.pairs.map(({ aId, bId }) => {
    const id = woodPairKey(aId, bId);
    const records = plans.get(id) ?? [];
    const decision = decisions.get(id);
    const detail = jointDetails.get(id);
    jointDetails.delete(id);
    const state = modeledWoodContactState(records, decision, detail);
    const memberIds: [string, string] = [aId, bId];
    memberIds.sort((a, b) => (parts.get(a)?.label ?? a).localeCompare(parts.get(b)?.label ?? b, undefined, { numeric: true }));
    return {
      id, memberIds, state,
      title: memberIds.map((member) => {
        const part = parts.get(member);
        return part ? `${part.label} · ${part.name}` : member;
      }).join(" ↔ "),
      planLabels: [...new Set(records.map(({ label }) => label.split("/")[0]))],
      detail,
    };
  });
  for (const detail of jointDetails.values()) {
    if (detail.status === "current") continue;
    pairs.push({
      id: detail.id, memberIds: detail.memberIds, title: detail.title,
      state: "pending",
      planLabels: [], detail,
    });
  }
  const priority = { pending: 0, unplanned: 1, removable: 2, documented: 3, reviewed: 4 };
  pairs.sort((a, b) => priority[a.state] - priority[b.state] ||
    a.title.localeCompare(b.title, undefined, { numeric: true }));
  return {
    pairs,
    needsReview: pairs.filter(({ state }) => state === "unplanned" || state === "pending"),
    touchingCount: search.pairs.length,
    limited: !search.complete || search.candidateCount > search.pairs.length,
  };
}

export type ModeledWoodContactReview = ReturnType<typeof reviewModeledWoodContacts>;

export function modeledWoodContactDetail({ state, planLabels, detail }: Pick<ModeledWoodContact, "state" | "planLabels" | "detail">) {
  switch (state) {
    case "unplanned": return "No pair plan recorded.";
    case "removable": return "A removable bearing decision is recorded.";
    case "reviewed": return "This pair has geometry-reviewed plan locations.";
    case "documented": return detail ? `${woodJointMethods[detail.decision.method]} · ${detail.decision.note}` : "A joint detail is recorded.";
    case "pending":
      if (detail && detail.status !== "current")
        return detail.status === "changed" ? "Fit changed. Review the recorded joint detail." : "A member is unavailable. Review the recorded joint detail.";
      return planLabels.length
        ? `Review the saved joint details for ${planLabels.join(", ")}.`
        : "The removable bearing decision needs a fresh review.";
  }
}
