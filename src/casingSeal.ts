import { casingSealInputSchema } from "./casingSealSchema";
import { clipBox } from "./cutProfiles";
import { casingFit } from "./doorCasing";
import { bounds } from "./engine";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches } from "./measurement";
import { projectSchema, type Project, type Section, type V3 } from "./model";
import { prepareCollisionSolid, solidSegmentRanges } from "./solidCollision";
import { rotate } from "./spatial";
import { trimSeamEdgeRuns, trimSeamMarker } from "./trimSeamGeometry";
import { defaultTrimSealantSession } from "./trimSealantReference";
import { estimateTrimSealant } from "./trimSealantTakeoff";
import type { TrimSeamOpenSpan } from "./woodJointDecisionSchema";

const tiny = 0.0001;
type Span = { start: number; end: number };
type Interruption = Span & { reason: string };
const styles = [
  { id: "left", role: "casing-left", label: "Left leg", sign: -1, forward: false },
  { id: "head", role: "casing-head", label: "Head", sign: 1, forward: true },
  { id: "right", role: "casing-right", label: "Right leg", sign: 1, forward: false },
] as const;

function gaps(length: number, spans: Span[]): Span[] {
  let progress = 0;
  const missing: Span[] = [];
  for (const { start, end } of spans.sort((a, b) => a.start - b.start)) {
    if (start - progress > tiny) missing.push({ start: progress, end: start });
    progress = Math.max(end, progress);
  }
  if (length - progress > tiny) missing.push({ start: progress, end: length });
  return missing;
}

const overlaps = (a: Span, b: Span) => Math.min(a.end, b.end) - Math.max(a.start, b.start) > tiny;

export function casingSealGeometry(project: Project, section: Section) {
  const { geometry, parts } = casingFit(project, section);
  if (geometry.wallGap === undefined || !geometry.drywall.length)
    throw Error("Fit drywall on this casing face to check the finish seam against its actual surface.");
  const backing = geometry.drywall.map(prepareCollisionSolid);
  const hosts = new Set([...parts, ...geometry.drywall].map(({ id }) => id));
  const blockers = project.pieces.filter(({ id, offcut }) => !offcut && !hosts.has(id))
    .map((piece) => ({ piece, box: bounds(piece) }));
  const edges = styles.map(({ id, role, label, sign, forward }) => {
    const trim = parts.find(({ designRole }) => designRole === role);
    if (!trim) throw Error("The head and both legs are needed to locate the casing seams.");
    const [width, thickness] = trim.size;
    const x = sign * width / 2, y = -thickness / 2;
    const solid = clipBox(trim.size, trim.cutPlanes);
    const edge = solid.vertices.filter(([u, v]) => Math.abs(u - x) < tiny && Math.abs(v - y) < tiny);
    const min = Math.min(...edge.map(([, , w]) => w)), max = Math.max(...edge.map(([, , w]) => w));
    if (max - min <= tiny) throw Error("The outside casing edge could not be measured.");
    const z = forward ? [min, max] : [max, min];
    const length = max - min;
    const at = (offset: number, depth: number) => z.map((w) =>
      rotate([x + sign * offset, y + depth, w], trim.rotation)
        .map((value, i) => value + trim.position[i]) as V3) as [V3, V3];
    const points = at(0, 0);
    // Check just beyond the trim and just inside the paper face.
    const supportDepth = -geometry.wallGap! - 0.005;
    const missing = [1 / 32, 3 / 32].flatMap((offset) => {
      const [start, end] = at(offset, supportDepth);
      return gaps(length, backing.flatMap((panel) =>
        panel ? solidSegmentRanges(panel, start, end).map(([a, b]) => ({ start: a * length, end: b * length })) : []));
    });
    const interruptions: Interruption[] = [];
    for (const span of missing.sort((a, b) => a.start - b.start)) {
      const last = interruptions.at(-1);
      if (last && span.start <= last.end + tiny) last.end = Math.max(last.end, span.end);
      else interruptions.push({ ...span, reason: "Drywall coverage ends here" });
    }
    // Check the space immediately along the exposed corner for modeled trim and furniture.
    const [start, end] = at(1 / 32, 1 / 32);
    for (const { piece, box } of blockers) {
      if (box.min.some((v, index) => Math.max(start[index], end[index]) < v - tiny ||
        Math.min(start[index], end[index]) > box.max[index] + tiny)) continue;
      const solid = prepareCollisionSolid(piece);
      const ranges = solid ? solidSegmentRanges(solid, start, end) : [[0, 1]];
      for (const [from, to] of ranges) {
        if ((to - from) * length <= tiny) continue;
        interruptions.push({ start: from * length, end: to * length, reason: `Covered by ${piece.name}` });
      }
    }
    return { id, label, length, points, localStart: [x, y, z[0]] as V3, interruptions };
  });
  return { edges, parts, wallGap: geometry.wallGap };
}

export type CasingSealGeometry = ReturnType<typeof casingSealGeometry>;
type Edge = CasingSealGeometry["edges"][number];

export function casingSealMarker(edge: Edge, open: TrimSeamOpenSpan[]) {
  const marker = trimSeamMarker(edge, edge.label, open, edge.interruptions.map((span) => ({
    ...span, edgeId: edge.id, partId: span.reason, name: span.reason, step: 0, later: false, possible: false,
  })));
  return { ...marker, label: edge.label };
}

export function estimateCasingSeal(shape: CasingSealGeometry, fields: unknown) {
  const input = casingSealInputSchema.parse(fields);
  if (shape.wallGap > input.gapWidth + tiny)
    throw Error("The entered width is smaller than the modeled gap behind the casing. Measure the widest point again.");
  const edges = input.edgeIds.map((id) => shape.edges.find((edge) => edge.id === id));
  if (edges.some((edge) => !edge) || input.openSpans?.some(({ edgeId }) => !input.edgeIds.includes(edgeId)))
    throw Error("Choose actual casing edges and keep-open ranges on those edges.");
  const runs = edges.map((edge) => ({ ...edge!, ...trimSeamEdgeRuns(edge!, input.openSpans ?? []) }));
  for (const run of runs) {
    const issue = run.interruptions.find((span) => run.sealedSpans.some((wet) => overlaps(wet, span)));
    if (issue) throw Error(`${run.label} · ${issue.reason}. Leave the interrupted range open or revise the fit.`);
  }
  const lengthInches = runs.reduce((sum, run) => sum + run.sealedSpans.reduce((total, { start, end }) => total + end - start, 0), 0);
  const estimate = estimateTrimSealant({ ...input, lengthInches });
  const signature = bindingHash(runs.map(({ id, length, sealedSpans, openSpans }) => [id, length, sealedSpans, openSpans]));
  return { ...estimate, lengthInches, runs, input, signature };
}

export function saveCasingSeal(project: Project, sectionId: string, fields: unknown | null) {
  const section = project.sections.find(({ id }) => id === sectionId);
  if (!section?.doorCasing) throw Error("Choose a saved door casing.");
  const { seal: _previous, ...casing } = section.doorCasing;
  const estimate = fields === null ? undefined : estimateCasingSeal(casingSealGeometry(project, section), fields);
  const doorCasing = estimate ? { ...casing, seal: { ...estimate.input, signature: estimate.signature } } : casing;
  return projectSchema.parse({ ...project, guideFingerprint: null,
    sections: project.sections.map((row) => row.id === sectionId ? { ...row, doorCasing } : row),
  });
}

type CasingSealReview = { section: Section; session: string; estimate?: ReturnType<typeof estimateCasingSeal>; issue?: string };

export function casingSealReviews(project: Project) {
  return project.sections.flatMap<CasingSealReview>((section) => {
    const seal = section.doorCasing?.seal;
    if (!seal) return [];
    const { signature, ...input } = seal;
    const context = { section, session: input.session ?? defaultTrimSealantSession };
    try {
      const estimate = estimateCasingSeal(casingSealGeometry(project, section), input);
      if (signature !== estimate.signature) throw Error("The marked spans changed. Review and save the finish seam again.");
      return [{ ...context, estimate, issue: undefined }];
    } catch (error) {
      return [{ ...context, estimate: undefined,
        issue: error instanceof Error ? error.message : "Review the fit of this finish seam." }];
    }
  });
}

export function casingSealLines(project: Project) {
  return casingSealReviews(project).flatMap(({ section, estimate, issue }) => [
    `${section.name} · ${issue ?? estimate?.note}`,
    ...(estimate?.runs.map(({ id, label, sealedSpans, openSpans }) => {
      const mark = ({ start, end }: Span) => `${formatPreciseInches(start)} to ${formatPreciseInches(end)}`;
      const origin = id === "head" ? "left end" : "floor end";
      return `${label} · from the ${origin}, seal ${sealedSpans.map(mark).join(", ") || "none"}.${openSpans.length ? ` Leave open ${openSpans.map(mark).join(", ")}.` : ""}`;
    }) ?? []),
  ]);
}
