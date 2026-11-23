import { faceContactPatch, touchingWoodPatches, type WoodFace } from "./connectionContacts";
import { bandingKey, edgeBandingEdges } from "./edgeBanding";
import { formatPreciseInches } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { glueFacesInputSchema, woodJointDecisionSchema, type GlueFacesInput } from "./woodJointDecisionSchema";
import { woodJointDecisionEntries, type WoodJointDecisionEntry } from "./woodJointDecisions";
import { estimateWoodGlue } from "./woodGlueTakeoff";
import { woodGlue } from "./woodGlueReference";

const areaLabel = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });
export const formatGlueArea = (area: number) => `${areaLabel.format(area)} sq in`;
export const glueFaceSequence = "Dry-fit the parts and arrange clamps before spreading glue. Coat the marked faces, bring the joint together promptly, and follow the product instructions for assembly and cure.";

type CoatingPatch = ReturnType<typeof touchingWoodPatches>[number];
export type GlueFace = {
  id: string;
  label: string;
  area: number;
  patches: CoatingPatch[];
};
export type GlueFaceMarker = {
  label: string;
  outlines: V3[][];
  center: V3;
};

function readableFace(vector: V3) {
  const index = vector.findIndex((value) => Math.abs(Math.abs(value) - 1) < 1e-6);
  return index >= 0 ? `Local ${vector[index] < 0 ? "-" : "+"}${"XYZ"[index]}` : "Angled face";
}

export function woodGlueFaces(first: Piece, second: Piece): GlueFace[] {
  const frame = inverseRotation(first.rotation);
  const groups = new Map<string, GlueFace>();
  for (const patch of touchingWoodPatches(first, second)) {
    const direction = rotate(patch.normal, frame);
    const relative = patch.outline[0].map((n, i) => n - first.position[i]);
    const plane = relative.reduce((sum, p, i) => sum + p * patch.normal[i], 0);
    const id = [...direction, plane].map((n) => Number(n.toFixed(6))).join("/");
    const entry = groups.get(id) ?? { id, label: `${readableFace(direction)} face · ${formatPreciseInches(plane)} from part center`, area: 0, patches: [] };
    entry.patches.push(patch);
    entry.area += patch.area;
    groups.set(id, entry);
  }
  return [...groups.values()].sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
}

export function glueFaceMarker(face: GlueFace, title: string): GlueFaceMarker {
  return {
    label: `${title} · ${formatGlueArea(face.area)} contact`,
    outlines: face.patches.map(({ outline }) => outline),
    center: face.patches[0].center,
  };
}

function partsForGlue(project: Project, entry: WoodJointDecisionEntry) {
  const first = project.pieces.find(({ id }) => id === entry.decision.firstId);
  const second = project.pieces.find(({ id }) => id === entry.decision.secondId);
  if (!first || !second || entry.status !== "current" || entry.decision.method !== "glue")
    throw Error("Review the current touching wood surfaces before saving a glue plan.");
  return { first, second };
}

export function reviewGlueSelection(project: Project, entry: WoodJointDecisionEntry, fields: GlueFacesInput) {
  const input = glueFacesInputSchema.parse(fields);
  const { first, second } = partsForGlue(project, entry);
  const faces = woodGlueFaces(first, second).filter(({ id }) => input.faceIds.includes(id));
  if (faces.length !== input.faceIds.length)
    throw Error("A selected glue face changed. Inspect the joint and choose its current surfaces.");
  const coatPieces = input.coat === "both" ? [first, second] : [input.coat === "first" ? first : second];
  const memberIds = new Set(entry.memberIds);
  const banding = new Map(project.edgeBanding?.filter(({ pieceId }) => memberIds.has(pieceId))
    .map((record) => [bandingKey(record), record.fingerprint]));
  if (banding.size) {
    const edges = edgeBandingEdges({ ...project, pieces: [first, second] }, new Set(banding.keys()), false);
    for (const edge of edges) {
      if (banding.get(bandingKey(edge)) !== edge.fingerprint) continue;
      const sign = edge.pieceId === first.id ? 1 : -1;
      const overlaps = faces.some(({ patches }) => patches.some(({ normal, outline }) => {
        const alignment = normal.reduce((sum, value, axis) => sum + value * edge.normal[axis], 0);
        const distance = edge.normal.reduce((sum, value, axis) => sum + value * (outline[0][axis] - edge.points[0][axis]), 0);
        return Math.abs(alignment - sign) < 1e-6 && Math.abs(distance) < 1e-6;
      }));
      if (overlaps) throw Error(`A selected glue face also has planned edge banding on ${edge.label}. Review which finish belongs in the joint.`);
    }
  }
  const area = faces.reduce((sum, face) => sum + face.area, 0) * coatPieces.length;
  const amount = area * (1 + input.extraPercent / 100);
  estimateWoodGlue(area, input.extraPercent);
  return { entry, input, faces, area, amount, coatPieces };
}

export function saveGlueFaces(project: Project, entryId: string, fields: GlueFacesInput | null) {
  const entries = woodJointDecisionEntries(project);
  const entry = entries.find(({ id }) => id === entryId);
  if (!entry || entry.decision.method !== "glue") throw Error("Save a glue joint detail first.");
  const { glueFaces: _previous, ...decision } = entry.decision;
  const next = fields
    ? woodJointDecisionSchema.parse({
      ...decision,
      glueFaces: { ...reviewGlueSelection(project, entry, fields).input, contactSignature: decision.contactSignature },
    })
    : decision;
  return { ...project, guideFingerprint: null, woodJointDecisions: project.woodJointDecisions!.map(
    (row) => row === entry.decision ? next : row,
  ) };
}

type ReviewedGlue = ReturnType<typeof reviewGlueSelection>;
type GlueRow = { entry: WoodJointDecisionEntry; detail?: ReviewedGlue; issue?: string };
type CoatedPatch = { row: GlueRow; surface: WoodFace };

export function modeledGluePlan(project: Project, entries?: WoodJointDecisionEntry[]) {
  if (!project.woodJointDecisions?.some(({ glueFaces }) => glueFaces)) return null;
  const results = (entries ?? woodJointDecisionEntries(project)).flatMap<GlueRow>((entry) => {
    const plan = entry.decision.glueFaces;
    if (!plan) return [];
    if (plan.contactSignature !== entry.decision.contactSignature || entry.status !== "current")
      return [{ entry, issue: "The joint fit changed. Review the parts and choose the current glue faces." }];
    const { contactSignature: _, ...fields } = plan;
    try {
      return [{ entry, detail: reviewGlueSelection(project, entry, fields) }];
    } catch (cause) {
      return [{ entry, issue: cause instanceof Error ? cause.message : "Review the selected glue faces." }];
    }
  });
  const coated = new Map<string, CoatedPatch[]>();
  const overlapping = new Set<GlueRow>();
  for (const row of results) {
    if (!row.detail) continue;
    for (const piece of row.detail.coatPieces) {
      const previous = coated.get(piece.id) ?? [];
      const sign = piece.id === row.entry.decision.firstId ? 1 : -1;
      for (const { patches } of row.detail.faces) for (const patch of patches) {
        const surface: WoodFace = { normal: patch.normal.map((n) => n * sign) as V3, points: patch.outline };
        const opposite: WoodFace = { ...surface, normal: surface.normal.map((n) => -n) as V3 };
        for (const other of previous) {
          if (other.row !== row && faceContactPatch(other.surface, opposite)) {
            overlapping.add(row);
            overlapping.add(other.row);
          }
        }
        previous.push({ row, surface });
      }
      coated.set(piece.id, previous);
    }
  }
  for (const row of overlapping) {
    delete row.detail;
    row.issue = "Two saved joints coat the same part surface. Check which mating parts share that space.";
  }
  const ready = results.flatMap(({ detail }) => detail ? [detail] : []);
  const area = ready.reduce((sum, row) => sum + row.area, 0);
  const allowanceArea = ready.reduce((sum, row) => sum + row.amount, 0);
  let required: number | null = null;
  let quantityIssue = results.some(({ issue }) => issue) ? "Review the flagged glue faces before counting bottles." : undefined;
  if (!quantityIssue && area) {
    try {
      required = estimateWoodGlue(allowanceArea, 0).bottles;
    } catch (cause) {
      quantityIssue = cause instanceof Error ? cause.message : "Check the total area before estimating bottles.";
    }
  }
  return { rows: results, ready, area, allowanceArea, required, quantityIssue };
}

export function modeledGlueLine(project: Project, detail: ReviewedGlue) {
  const members = detail.coatPieces.map(({ id }) => partLabel(project, id)).join(" and ");
  const reference = detail.entry.firstLabel ? `Faces mapped on ${detail.entry.firstLabel}. ` : "";
  const faces = detail.faces.map(({ label, area }) => `${label}, ${formatGlueArea(area)}`).join(". ");
  const scrap = detail.entry.trialScraps.length ? ` Matching scrap for a glue trial · ${detail.entry.trialScraps.join(", ")}.` : "";
  return `Coat ${members} · ${formatGlueArea(detail.area)}. ${reference}${faces}. Allowance ${detail.input.extraPercent}%.${scrap}`;
}

export function modeledGlueSummary(plan: NonNullable<ReturnType<typeof modeledGluePlan>>) {
  const quantity = plan.required === null ? plan.quantityIssue ?? "Choose current glue faces for a bottle total."
    : `${plan.required} ${plan.required === 1 ? "bottle" : "bottles"} at Titebond’s published minimum spread.`;
  return `${formatGlueArea(plan.area)} of selected faces · ${formatGlueArea(plan.allowanceArea)} with allowance. ${quantity}`;
}

export function modeledGlueGuideLines(project: Project, plan: NonNullable<ReturnType<typeof modeledGluePlan>>) {
  return [
    modeledGlueSummary(plan),
    ...plan.rows.map(({ entry, detail, issue }) => {
      const stage = entry.stage ? `Step ${entry.stage} · ` : "";
      return `${stage}${entry.title} · ${detail ? modeledGlueLine(project, detail) : issue}`;
    }),
  ];
}

export function modeledGlueMarkdown(project: Project) {
  const plan = modeledGluePlan(project);
  if (!plan) return "";
  return [
    "\n\n## Measured glue faces",
    "",
    woodGlue.scope,
    glueFaceSequence,
    "",
    ...modeledGlueGuideLines(project, plan).map((line) => "- " + line.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&")),
    "",
    `[Titebond application and coverage](${woodGlue.specification})`,
    "",
  ].join("\n");
}
