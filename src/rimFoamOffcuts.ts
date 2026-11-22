import { uid, type Project } from "./model";
import {
  rimFoamLabelKey, rimFoamOffcutPoolSchema, rimFoamOffcutSchema,
  type RimFoamDimensions,
} from "./rimAirSealSchema";

export function addRimFoamOffcut(project: Project, measurements: RimFoamDimensions): Project {
  const parsed = rimFoamOffcutSchema.safeParse({ ...measurements, id: uid() });
  if (!parsed.success) throw Error("Enter a label and the measured width and length of the foam offcut.");
  const offcut = parsed.data;
  const key = rimFoamLabelKey(offcut.label);
  if (project.rimFoamOffcuts?.some(({ label }) => rimFoamLabelKey(label) === key))
    throw Error(`Foam offcut ${offcut.label} is already recorded. Use a different label for a second physical piece.`);
  if ((project.rimAirSeals ?? []).some(({ input }) => input.offcut && rimFoamLabelKey(input.offcut.label) === key))
    throw Error(`Release foam offcut ${offcut.label} from its saved rim plan before recording it in Cut pool.`);
  return {
    ...project,
    rimFoamOffcuts: rimFoamOffcutPoolSchema.parse([...(project.rimFoamOffcuts ?? []), offcut]),
  };
}

export function removeRimFoamOffcut(project: Project, id: string): Project {
  if (project.rimAirSeals?.some(({ input }) => input.poolOffcutIds?.includes(id)))
    throw Error("Release this foam offcut from its saved rim plan before removing it.");
  const previous = project.rimFoamOffcuts ?? [];
  const retained = previous.filter((row) => row.id !== id);
  if (retained.length === previous.length) return project;
  if (retained.length) return { ...project, rimFoamOffcuts: retained };
  const { rimFoamOffcuts: _removed, ...remaining } = project;
  return remaining;
}
