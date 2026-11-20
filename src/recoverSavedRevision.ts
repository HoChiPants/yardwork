import { designFingerprint, guideIsCurrent } from "./guide";
import { rekeyGuidePlacements } from "./guidePlacement";
import { uid, type Project } from "./model";

export function copySavedRevision(saved: Project, revision: number) {
  return copyProjectDraft(saved, ` · revision ${revision} copy`);
}

export function copyProjectDraft(saved: Project, suffix: string) {
  const copy = rekeyGuidePlacements(saved, uid());
  const recovered = {
    ...copy,
    name: saved.name.slice(0, 120 - suffix.length) + suffix,
    steps: copy.steps.map((step) =>
      step.generated?.planId === saved.id
        ? { ...step, generated: { ...step.generated, planId: copy.id } }
        : step,
    ),
  };
  if (guideIsCurrent(saved))
    recovered.guideFingerprint = designFingerprint(recovered);
  return recovered;
}
