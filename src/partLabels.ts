import type { Project } from "./model";

/** The ledger retains removed parts so printed labels are never reassigned. */
export function ensurePartLabels(project: Project): Project {
  const labels = [...project.partLabels],
    assigned = new Set(labels.map((row) => row.partId)),
    used = new Set(labels.map((row) => row.label));
  let nextPart = 1,
    nextOffcut = 1;
  for (const part of project.pieces) {
    if (assigned.has(part.id)) continue;
    const prefix = part.offcut ? "O" : "P";
    let number = part.offcut ? nextOffcut : nextPart;
    while (used.has(`${prefix}${String(number).padStart(3, "0")}`)) number++;
    const label = `${prefix}${String(number).padStart(3, "0")}`;
    if (labels.length >= 10000)
      throw Error(
        "The part-label ledger is full. Export this project's history before starting a new labeled project.",
      );
    labels.push({ partId: part.id, label });
    assigned.add(part.id);
    used.add(label);
    if (part.offcut) nextOffcut = number + 1;
    else nextPart = number + 1;
  }
  return labels.length === project.partLabels.length
    ? project
    : { ...project, partLabels: labels };
}

/** Also works for a read-only legacy export, without altering the original project. */
export function partLabel(project: Project, partId: string): string {
  const existing = project.partLabels.find((row) => row.partId === partId);
  if (existing) return existing.label;
  return (
    ensurePartLabels(project).partLabels.find((row) => row.partId === partId)
      ?.label ?? "Removed part"
  );
}

/** Undo/redo changes the design, but printed label reservations remain history. */
export function retainPartLabelHistory(
  target: Project,
  history: Project,
): Project {
  if (target.id !== history.id) return ensurePartLabels(target);
  const rows = [...history.partLabels],
    ids = new Set(rows.map((row) => row.partId)),
    labels = new Set(rows.map((row) => row.label));
  for (const row of target.partLabels) {
    if (ids.has(row.partId)) continue;
    if (labels.has(row.label)) continue;
    rows.push(row);
    ids.add(row.partId);
    labels.add(row.label);
  }
  return ensurePartLabels({ ...target, partLabels: rows });
}
