import { attachmentGeometryFingerprint } from "./attachments";
import { reviewConnectionContact } from "./connectionContacts";
import type { Piece, Project, V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import {
  woodJointDecisionSchema,
  woodJointDecisionsSchema,
  type WoodJointDecision,
  type WoodJointMethod,
} from "./woodJointDecisionSchema";

export const woodJointMethods: Record<WoodJointMethod, string> = {
  glue: "Glue joint",
  fitted: "Fitted joinery",
  sealant: "Seal exposed seam",
  "intentional-contact": "Intentional contact",
};

export const woodJointDecisionScope =
  "These are recorded joint details. Verify actual fit, materials, assembly and capacity before building.";

export function woodPairKey(firstId: string, secondId: string) {
  return firstId < secondId ? `${firstId}/${secondId}` : `${secondId}/${firstId}`;
}

function signature(first: Piece, second: Piece) {
  const inverse = inverseRotation(first.rotation);
  const relative = (vector: V3) => rotate(vector, inverse).map((n) => Number(n.toFixed(6)));
  const offset = second.position.map((n, i) => n - first.position[i]) as V3;
  const basis: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return JSON.stringify([
    attachmentGeometryFingerprint(first),
    attachmentGeometryFingerprint(second),
    relative(offset),
    basis.map((axis) => relative(rotate(axis, second.rotation))),
  ]);
}

function reviewable(first: Piece, second: Piece, method: WoodJointMethod) {
  const contact = reviewConnectionContact(first, second);
  return contact.state === "face-contact" || (method === "sealant" && contact.state === "near-face");
}

export function woodJointDecisionStatus(
  decision: WoodJointDecision,
  first: Piece | undefined,
  second: Piece | undefined,
): "current" | "changed" | "unavailable" {
  if (!first || !second || first.offcut || second.offcut) return "unavailable";
  return decision.contactSignature === signature(first, second) &&
    reviewable(first, second, decision.method) ? "current" : "changed";
}

export function saveWoodJointDecision(
  project: Project, aId: string, bId: string, method: WoodJointMethod, note: string,
): Project {
  const [firstId, secondId] = [aId, bId].sort();
  const first = project.pieces.find(({ id }) => id === firstId);
  const second = project.pieces.find(({ id }) => id === secondId);
  if (!first || !second || first.id === second.id ||
      !reviewable(first, second, method))
    throw Error("Choose wood parts with touching faces, or nearby faces for an exposed seam.");
  const decision = woodJointDecisionSchema.parse({
    firstId, secondId, method, note, contactSignature: signature(first, second),
  });
  const rest = (project.woodJointDecisions ?? []).filter((row) =>
    row.firstId !== firstId || row.secondId !== secondId);
  return { ...project, woodJointDecisions: woodJointDecisionsSchema.parse([...rest, decision]) };
}

export function clearWoodJointDecision(project: Project, aId: string, bId: string): Project {
  const [firstId, secondId] = [aId, bId].sort();
  const rest = project.woodJointDecisions?.filter((row) =>
    row.firstId !== firstId || row.secondId !== secondId);
  if (!rest || rest.length === project.woodJointDecisions?.length) return project;
  if (rest.length) return { ...project, woodJointDecisions: rest };
  const { woodJointDecisions: _removed, ...next } = project;
  return next;
}

export function woodJointDecisionEntries(project: Project) {
  if (!project.woodJointDecisions?.length) return [];
  const parts = new Map(project.pieces.map((part) => [part.id, part]));
  const labels = new Map(ensurePartLabels(project).partLabels.map(({ partId, label }) => [partId, label]));
  const stepNumbers = new Map(project.steps.map((step, i) => [step.id, i + 1]));
  return project.woodJointDecisions.map((decision) => {
    const memberIds: [string, string] = [decision.firstId, decision.secondId];
    const first = parts.get(decision.firstId);
    const second = parts.get(decision.secondId);
    const status = woodJointDecisionStatus(decision, first, second);
    const stage = first && second && status !== "unavailable"
      ? Math.max(stepNumbers.get(first.stepId) ?? 0, stepNumbers.get(second.stepId) ?? 0)
      : 0;
    const title = memberIds.map((id) => {
      const label = labels.get(id) ?? "Removed member";
      const part = parts.get(id);
      return part && !part.offcut ? `${label} · ${part.name}` : `${label} (unavailable)`;
    }).join(" ↔ ");
    return {
      id: woodPairKey(...memberIds), title, memberIds, decision, status, stage,
    };
  });
}

export type WoodJointDecisionEntry = ReturnType<typeof woodJointDecisionEntries>[number];

export function woodJointDecisionLine({ title, decision, status, stage }: WoodJointDecisionEntry) {
  return [
    title, woodJointMethods[decision.method],
    status === "changed" ? "Fit changed · review again" :
      status === "unavailable" ? "Member unavailable · review again" :
        stage ? `Step ${stage}` : "Current contact",
    decision.note,
  ].join(" · ");
}
