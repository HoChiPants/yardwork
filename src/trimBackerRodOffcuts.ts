import { z } from "zod";
import type { Project } from "./model";
import { packRuns } from "./stockRunPacking";
import { trimBackerRodLength, trimBackerRods } from "./trimBackerRodReference";

export const backerRodOffcutInput = z.strictObject({
  label: z.string().trim().min(1).max(60),
  productId: z.enum(trimBackerRods.map(({ id }) => id)),
  length: z.number().finite().positive().max(trimBackerRodLength),
});
const backerRodOffcutSchema = backerRodOffcutInput.extend({ id: z.uuid() });
export const backerRodOffcutsSchema = z.array(backerRodOffcutSchema).max(100)
  .refine((rows) => new Set(rows.map(({ id }) => id)).size === rows.length, "Use distinct backer rod offcut IDs.")
  .refine((rows) => new Set(rows.map(({ label }) => label.toLowerCase())).size === rows.length,
    "Give each backer rod offcut its own label.");
export type BackerRodOffcutInput = z.infer<typeof backerRodOffcutInput>;
export type BackerRodOffcut = z.infer<typeof backerRodOffcutSchema>;

const lengthTolerance = 1e-7;
const backerRodRunSchema = z.strictObject({
  key: z.string().min(1).max(3200),
  kind: z.enum(["trim", "opening", "countertop", "pipe-seal"]),
  title: z.string().min(1).max(400),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  length: z.number().finite().positive().max(trimBackerRodLength + lengthTolerance),
}).refine(({ start, end, length }) => Math.abs(end - start - length) <= lengthTolerance,
  "Keep the measured span of each backing cut.");
export type BackerRodRun = z.infer<typeof backerRodRunSchema>;
export const backerRodCutRecordsSchema = z.array(z.strictObject({
  source: backerRodOffcutSchema,
  cuts: z.array(backerRodRunSchema).min(1),
  remnant: backerRodOffcutSchema.optional(),
}).refine(({ source, cuts, remnant }) =>
  (!remnant || (remnant.productId === source.productId && remnant.id !== source.id)) &&
  cuts.reduce((length, cut) => length + cut.length, remnant?.length ?? 0) <= source.length + lengthTolerance,
"The recorded cuts and remnant must fit the measured source.")).max(1000).refine((rows) => {
  const keys = rows.flatMap(({ cuts }) => cuts.map(({ key }) => key));
  const remnants = rows.flatMap(({ remnant }) => remnant ? [remnant.id] : []);
  return new Set(rows.map(({ source }) => source.id)).size === rows.length &&
    new Set(keys).size === keys.length && new Set(remnants).size === remnants.length;
}, "Record each source, run and measured remnant once.");
export type BackerRodCutRecord = z.infer<typeof backerRodCutRecordsSchema>[number];

export function backerRodAllocationKey(source: BackerRodOffcut, runs: BackerRodRun[]) {
  return JSON.stringify([source, runs.map(({ key }) => key)]);
}

export function saveBackerRodOffcut(project: Project, input: BackerRodOffcutInput, id?: string): Project {
  const offcuts = project.backerRodOffcuts ?? [];
  if (id && !offcuts.some((row) => row.id === id)) throw Error("This offcut is no longer in the Cut pool.");
  const record = { ...backerRodOffcutInput.parse(input), id: id ?? crypto.randomUUID() };
  if (offcuts.some((row) => row.id !== id && row.label.toLowerCase() === record.label.toLowerCase()))
    throw Error("Give each backer rod offcut its own label.");
  const next = id ? offcuts.map((row) => row.id === id ? record : row) : [...offcuts, record];
  return { ...project, backerRodOffcuts: backerRodOffcutsSchema.parse(next) };
}

export function removeBackerRodOffcut(project: Project, id: string): Project {
  const offcuts = project.backerRodOffcuts?.filter((offcut) => offcut.id !== id);
  return { ...project, backerRodOffcuts: offcuts?.length ? offcuts : undefined };
}

export function packBackerRodRuns<T extends { length: number }>(runs: T[], stock: BackerRodOffcut[]) {
  const measured = [...stock].sort((a, b) => a.length - b.length)
    .map((source) => ({ source, left: source.length, runs: [] as T[] }));
  const rest: T[] = [];
  for (const run of [...runs].sort((a, b) => b.length - a.length)) {
    const bin = measured.find(({ left }) => left >= run.length - lengthTolerance);
    if (bin) {
      bin.runs.push(run);
      bin.left = Math.max(0, bin.left - run.length);
    } else rest.push(run);
  }
  return { offcuts: measured.filter(({ runs }) => runs.length), rolls: packRuns(rest, trimBackerRodLength).bins };
}
