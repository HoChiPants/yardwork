import {
  bearingDecisionsSchema,
  bearingDecisionSchema,
} from "./bearingDecisionSchema";
import type { Piece, Project, V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";
import { reviewWoodSupport } from "./woodSupport";

export const bearingDecisionKey = (topId: string, baseId: string) =>
  `${topId}/${baseId}`;

export function bearingContactSignature(top: Piece, base: Piece) {
  const shape = ({ material, size, cutPlanes }: Piece) => [
    material,
    size,
    cutPlanes.map(({ normal, constant }) => [normal, constant]),
  ];
  const inverse = inverseRotation(base.rotation);
  const relative = (world: V3) =>
    rotate(world, inverse).map((n) => Number(n.toFixed(6)));
  const offset = top.position.map((n, axis) => n - base.position[axis]) as V3;
  const basis: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return JSON.stringify([
    shape(top),
    shape(base),
    relative(offset),
    basis.map((axis) => relative(rotate(axis, top.rotation))),
  ]);
}

export function saveBearingDecision(
  project: Project,
  topId: string,
  baseId: string,
  note: string,
) {
  const wood = reviewWoodSupport(project);
  const top = wood.get(topId);
  const base = wood.get(baseId);
  if (!top || !base || !top.supports.some(({ pieceId }) => pieceId === baseId))
    throw Error(
      "These parts no longer share a wood bearing face. Review the current placement.",
    );
  const existing = project.bearingDecisions ?? [];
  const matches = (row: { topId: string; baseId: string }) =>
    row.topId === topId && row.baseId === baseId;
  const previous = existing.find(matches);
  const decision = bearingDecisionSchema.parse({
    ...previous,
    topId,
    baseId,
    note,
    contactSignature: bearingContactSignature(top.piece, base.piece),
  });
  return {
    ...project,
    bearingDecisions: bearingDecisionsSchema.parse(
      previous
        ? existing.map((row) => (matches(row) ? decision : row))
        : [...existing, decision],
    ),
  };
}

export function clearBearingDecision(
  project: Project,
  topId: string,
  baseId: string,
): Project {
  const existing = project.bearingDecisions;
  if (!existing) return project;
  const kept = existing.filter(
    (row) => row.topId !== topId || row.baseId !== baseId,
  );
  if (kept.length === existing.length) return project;
  if (kept.length) return { ...project, bearingDecisions: kept };
  const { bearingDecisions: _removed, ...next } = project;
  return next;
}
