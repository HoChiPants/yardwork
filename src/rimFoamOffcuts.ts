import { uid, type Project } from "./model";
import { reviewRimAirSeals, rimFoamSourceKey, type RimFoamSheet } from "./rimAirSeals";
import {
  rimFoamCutRecordsSchema,
  rimFoamLabelKey, rimFoamOffcutPoolSchema, rimFoamOffcutSchema,
  type RimFoamDimensions,
} from "./rimAirSealSchema";

function recordedFoamLabels(project: Project, currentSourceId?: string) {
  return (project.rimFoamCutRecords ?? []).flatMap(({ label, remnants }) =>
    [label, ...remnants.filter(({ id }) => id !== currentSourceId).map((remnant) => remnant.label)]);
}

export function addRimFoamOffcut(project: Project, measurements: RimFoamDimensions): Project {
  const parsed = rimFoamOffcutSchema.safeParse({ ...measurements, id: uid() });
  if (!parsed.success) throw Error("Enter a label and the measured width and length of the foam offcut.");
  const offcut = parsed.data;
  const key = rimFoamLabelKey(offcut.label);
  if (project.rimFoamOffcuts?.some(({ label }) => rimFoamLabelKey(label) === key))
    throw Error(`Foam offcut ${offcut.label} is already recorded. Use a different label for a second physical piece.`);
  if (recordedFoamLabels(project).some((label) => rimFoamLabelKey(label) === key))
    throw Error(`Foam label ${offcut.label} already belongs to a recorded cut. Use a distinct physical label.`);
  if ((project.rimAirSeals ?? []).some(({ input }) => input.offcut && rimFoamLabelKey(input.offcut.label) === key))
    throw Error(`Release foam offcut ${offcut.label} from its saved rim plan before recording it in Cut pool.`);
  return {
    ...project,
    rimFoamOffcuts: rimFoamOffcutPoolSchema.parse([...(project.rimFoamOffcuts ?? []), offcut]),
  };
}

export function removeRimFoamOffcut(project: Project, id: string): Project {
  if (project.rimFoamCutRecords?.some(({ poolOffcutId }) => poolOffcutId === id))
    throw Error("This source is linked to recorded cuts.");
  if (project.rimAirSeals?.some(({ input }) => input.poolOffcutIds?.includes(id)))
    throw Error("Release this foam offcut from its saved rim plan before removing it.");
  const previous = project.rimFoamOffcuts ?? [];
  const retained = previous.filter((row) => row.id !== id);
  if (retained.length === previous.length) return project;
  if (retained.length) return { ...project, rimFoamOffcuts: retained };
  const { rimFoamOffcuts: _removed, ...remaining } = project;
  return remaining;
}

export type MeasuredFoamRemnant = RimFoamDimensions & { slot: number };

export function recordRimFoamCuts(project: Project, selected: RimFoamSheet, sourceLabel: string, measurements: MeasuredFoamRemnant[]) {
  const review = reviewRimAirSeals(project);
  const key = rimFoamSourceKey(selected);
  const source = [...review.scraps, ...review.sheets].find((sheet) => rimFoamSourceKey(sheet) === key);
  if (!source) throw Error("This foam layout changed or was recorded. Open the current saved cut map.");
  const label = (source.offcutLabel ?? sourceLabel).trim();
  if (!label || label.length > 60) throw Error("Enter the label on the actual foam stock.");
  const available = project.rimFoamOffcuts ?? [];
  const labels = new Set([
    ...recordedFoamLabels(project, source.poolOffcutId),
    ...available.filter(({ id }) => id !== source.poolOffcutId).map(({ label }) => label),
    ...(project.rimAirSeals ?? []).flatMap(({ input }) =>
      input.offcut && input.offcut.label !== source.offcutLabel ? [input.offcut.label] : []),
  ].map(rimFoamLabelKey));
  if (labels.has(rimFoamLabelKey(label))) throw Error(`Foam label ${label} is already in use.`);
  labels.add(rimFoamLabelKey(label));
  const slots = new Set<number>();
  const remnants = measurements.map(({ slot, ...dimensions }) => {
    const expected = source.order.layout.leftovers[slot];
    if (!expected || slots.has(slot)) throw Error("Each remnant must match a different mark on this cut map.");
    slots.add(slot);
    const result = rimFoamOffcutSchema.safeParse({ ...dimensions, id: uid() });
    if (!result.success) throw Error(`Enter the measured width, length and physical label for R${slot + 1}.`);
    const offcut = result.data;
    if (offcut.width > expected.width + 1e-6 || offcut.length > expected.length + 1e-6)
      throw Error(`R${slot + 1} exceeds its rectangle on this cut map. Check its orientation and actual measurements.`);
    const labelKey = rimFoamLabelKey(offcut.label);
    if (labels.has(labelKey)) throw Error(`Foam label ${offcut.label} is already in use.`);
    labels.add(labelKey);
    return { ...offcut, slot };
  });
  const records = rimFoamCutRecordsSchema.parse([
    ...(project.rimFoamCutRecords ?? []),
    {
      id: uid(), label, kerf: source.kerf, remnants,
      stock: {
        width: source.stock.width,
        length: source.stock.length,
        usedLength: source.stock.usedLength,
        placements: source.stock.placements.map(({ id, name, x, y, width, length, rotated }) =>
          ({ id, name, x, y, width, length, rotated })),
      },
      source: source.poolOffcutId ? "pool" : source.offcutLabel ? "inline" : "sheet",
      ...(source.poolOffcutId && { poolOffcutId: source.poolOffcutId }),
    },
  ]);
  return {
    ...project,
    rimFoamCutRecords: records,
    rimFoamOffcuts: rimFoamOffcutPoolSchema.parse([...available, ...remnants.map(({ slot: _slot, ...offcut }) => offcut)]),
  };
}
