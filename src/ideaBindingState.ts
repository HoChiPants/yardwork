import { uid, type Project, type V3 } from "./model";
import type { IdeaBinding, IdeaEntry } from "./ideaBindingSchema";
import { fastenerReviews } from "./fastenings";
import { fastenerPhysicalIntent } from "./fastenerIntent";
export function stableValue(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : typeof item === "number"
        ? Number(item.toFixed(8))
        : item,
  );
}
export function bindingHash(value: unknown) {
  let hash = 14695981039346656037n;
  for (const char of stableValue(value)) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `binding-v1-${hash.toString(16).padStart(16, "0")}`;
}
export function entryPartIds(project: Project, entry: IdeaEntry) {
  return new Set(
    entry.sections.flatMap(
      (mapping) =>
        project.sections.find((s) => s.id === mapping.sectionId)?.pieceIds ??
        [],
    ),
  );
}
export function currentBindingFingerprint(
  project: Project,
  binding: IdeaBinding,
) {
  const ids = new Set(
      binding.entries.flatMap((entry) => [...entryPartIds(project, entry)]),
    ),
    sources = new Set(
      project.pieces
        .filter((p) => ids.has(p.id) && p.cutStock)
        .map((p) => p.cutStock!.id),
    ),
    relatedFasteners = project.fastenerPlans.filter(
      (plan) => ids.has(plan.head.pieceId) || ids.has(plan.receiver.pieceId),
    );
  // Read actual same-ID members and current path eligibility, never cached refs as approval.
  // This branch is absent for old/empty plans, preserving their existing hash inputs.
  let fastenerContext: object = {};
  if (relatedFasteners.length) {
    const relatedIds = new Set(relatedFasteners.map((plan) => plan.id)),
      reviews = fastenerReviews(project).filter((review) =>
        relatedIds.has(review.plan.id),
      ),
      contextIds = new Set(
        relatedFasteners.flatMap((plan) => [
          plan.head.pieceId,
          plan.receiver.pieceId,
        ]),
      );
    const issueInput = (issue: (typeof reviews)[number]["issues"][number]) => ({
      code: issue.code,
      severity: issue.severity,
      locationId: issue.locationId ?? null,
      pieceIds: [...(issue.pieceIds ?? [])].sort(),
    });
    for (const review of reviews)
      for (const issue of [
        ...review.issues,
        ...review.locations.flatMap((location) => location.issues),
      ])
        for (const id of issue.pieceIds ?? []) contextIds.add(id);
    const actual = new Map(project.pieces.map((piece) => [piece.id, piece]));
    fastenerContext = {
      fasteners: relatedFasteners.map(fastenerPhysicalIntent),
      fastenerMembers: [...contextIds].sort().map((pieceId) => {
        const piece = actual.get(pieceId);
        return {
          pieceId,
          actual: piece
            ? {
                id: piece.id,
                material: piece.material,
                size: piece.size,
                position: piece.position,
                rotation: piece.rotation,
                offcut: piece.offcut,
                cutStock: piece.cutStock ?? null,
                cutPlanes: piece.cutPlanes ?? [],
                ...(piece.roundOpenings?.length ? { roundOpenings: piece.roundOpenings } : {}),
                ...(piece.rectangularOpenings?.length ? { rectangularOpenings: piece.rectangularOpenings } : {}),
                stockLengthAxis: piece.stockLengthAxis ?? null,
              }
            : null,
        };
      }),
      fastenerReview: reviews.map((review) => ({
        planId: review.plan.id,
        state: review.state,
        activePointCount: review.activePointCount,
        issues: review.issues.map(issueInput),
        locations: review.locations.map((location) => ({
          id: location.location.id,
          state: location.state,
          includedInDemand: location.includedInDemand,
          issues: location.issues.map(issueInput),
        })),
      })),
    };
  }
  return bindingHash({
    entries: binding.entries,
    sections: binding.entries.flatMap((e) =>
      e.sections.map((m) => ({
        role: m.role,
        section: project.sections.find((s) => s.id === m.sectionId) ?? null,
      })),
    ),
    pieces: project.pieces.filter(
      (p) =>
        ids.has(p.id) || (p.offcut && p.cutStock && sources.has(p.cutStock.id)),
    ),
    joints: project.joints.filter((j) => ids.has(j.a) || ids.has(j.b)),
    ...fastenerContext,
  });
}
export function reconcileIdeaBindings(project: Project): Project {
  const bindings = project.ideaBindings.flatMap((binding) => {
    const entries = binding.entries.filter((entry) =>
      entry.sections.some((mapping) =>
        project.sections.some((s) => s.id === mapping.sectionId),
      ),
    );
    if (!entries.length) return [];
    const next = { ...binding, entries },
      fingerprint = currentBindingFingerprint(project, next);
    return [
      {
        ...next,
        revision:
          binding.revision +
          (binding.currentFingerprint &&
          binding.currentFingerprint !== fingerprint
            ? 1
            : 0),
        currentFingerprint: fingerprint,
      },
    ];
  });
  return { ...project, ideaBindings: bindings };
}
const yaw = (rotation: V3) =>
  (((((rotation[1] * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
function mapSectionEntry(
  project: Project,
  sectionId: string,
  change: (entry: IdeaEntry) => IdeaEntry,
): Project {
  return reconcileIdeaBindings({
    ...project,
    ideaBindings: project.ideaBindings.map((binding) => ({
      ...binding,
      entries: binding.entries.map((entry) =>
        entry.sections.some((m) => m.sectionId === sectionId)
          ? change(entry)
          : entry,
      ),
    })),
  });
}
export function updateBoundSectionPose(
  project: Project,
  sectionId: string,
): Project {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section) return reconcileIdeaBindings(project);
  return mapSectionEntry(project, sectionId, (entry) =>
    entry.spec.type === "furniture"
      ? {
          ...entry,
          pose: {
            origin: [...section.origin],
            rotation: [...section.rotation],
          },
          spec: {
            type: "furniture",
            recipe: {
              ...entry.spec.recipe,
              entryId: entry.id,
              position: [...section.origin],
              yaw: yaw(section.rotation),
            },
          },
        }
      : entry,
  );
}
export function refreshBoundRecipe(
  project: Project,
  sectionId: string,
): Project {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section?.recipe) return reconcileIdeaBindings(project);
  return mapSectionEntry(project, sectionId, (entry) =>
    entry.spec.type === "furniture"
      ? {
          ...entry,
          pose: {
            origin: [...section.origin],
            rotation: [...section.rotation],
          },
          spec: {
            type: "furniture",
            recipe: { ...section.recipe!, entryId: entry.id },
          },
        }
      : entry,
  );
}
export function syncBoundLid(project: Project, sectionId: string): Project {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section?.recipe) return reconcileIdeaBindings(project);
  return mapSectionEntry(project, sectionId, (entry) =>
    entry.spec.type === "furniture"
      ? {
          ...entry,
          spec: {
            type: "furniture",
            recipe: { ...entry.spec.recipe, lidOpen: section.recipe!.lidOpen },
          },
        }
      : entry,
  );
}
export function forgetBoundSection(
  project: Project,
  _sectionId: string,
): Project {
  return reconcileIdeaBindings(project);
}
export function copyBoundFurniture(
  project: Project,
  sourceSectionId: string,
  newSectionId: string,
): Project {
  const binding = project.ideaBindings.find((b) =>
      b.entries.some(
        (e) =>
          e.spec.type === "furniture" &&
          e.sections.some((m) => m.sectionId === sourceSectionId),
      ),
    ),
    source = binding?.entries.find(
      (e) =>
        e.spec.type === "furniture" &&
        e.sections.some((m) => m.sectionId === sourceSectionId),
    ),
    section = project.sections.find((s) => s.id === newSectionId);
  if (!binding || !source || source.spec.type !== "furniture" || !section)
    return reconcileIdeaBindings(project);
  const id = uid(),
    entry: IdeaEntry = {
      ...structuredClone(source),
      id,
      pose: { origin: [...section.origin], rotation: [...section.rotation] },
      spec: {
        type: "furniture",
        recipe: {
          ...source.spec.recipe,
          entryId: id,
          name: section.name,
          position: [...section.origin],
          yaw: yaw(section.rotation),
        },
      },
      sections: [{ role: "body", sectionId: newSectionId }],
    };
  const next: IdeaBinding = {
    ...structuredClone(binding),
    id: uid(),
    revision: 1,
    currentFingerprint: "",
    title: section.name,
    reviewBlock: "",
    entries: [entry],
  };
  return reconcileIdeaBindings({
    ...project,
    ideaBindings: [...project.ideaBindings, next],
  });
}
