import { bottomPlateSealReviews, plateSealTakeoff } from "./bottomPlateSeal";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { inspectCutStock } from "./cutStock";
import { isDrywall } from "./drywallReference";
import { formatPreciseInches as inches, formatStockLength as span } from "./measurement";
import { type Project, uid } from "./model";
import { partLabel } from "./partLabels";
import { topPlateLayout } from "./topPlateSealGeometry";
import { topPlateInputSchema, topPlateSealsSchema, type TopPlateSeal } from "./topPlateSealSchema";

export const topPlateSealFieldGuide = "https://basc.pnnl.gov/resource-guides/air-sealing-drywall-top-plate";
export const topPlateSealScope = "Plan a bead on the exposed wall face of a top plate before hanging drywall. Verify clean, dry wood and paper facing, the actual joint gap and the adjoining air barrier before covering the seam.";

export function previewTopPlateSeal(project: Project, fields: unknown, editingId?: string) {
  const input = topPlateInputSchema.parse(fields);
  const saved = project.topPlateSeals?.find(({ id }) => id === editingId);
  if (editingId && !saved) throw Error("This top plate seal plan has been removed.");
  if (project.topPlateSeals?.some(({ id, plateId, side }) =>
    id !== editingId && plateId === input.plateId && side === input.side))
    throw Error("This side already has an air-seal plan. Open the saved plan to edit it.");
  const bead = bottomPlateSealant.size[input.bead];
  if (input.gap > bead || input.depth > bead)
    throw Error("Choose a bead that covers the measured gap and fill depth, or review a different joint detail.");
  const layout = topPlateLayout(project, input);
  if (!layout.runs.some(({ panelId }) => panelId))
    throw Error("Align the modeled drywall back face with the selected side of the top plate and cover the full bead height.");
  const record = { ...input, id: saved?.id ?? uid(), signature: layout.signature };
  const topPlateSeals = topPlateSealsSchema.parse([
    ...(project.topPlateSeals ?? []).filter(({ id }) => id !== record.id), record,
  ]);
  return { record, layout, project: { ...project, topPlateSeals, guideFingerprint: null } };
}

export function topPlateSealTitle(project: Project, record: TopPlateSeal) {
  const plate = project.pieces.find(({ id }) => id === record.plateId);
  return `${plate?.name ?? "Missing top plate"} · Side ${record.side.toUpperCase()}`;
}

export function reviewTopPlateSeal(project: Project, record: TopPlateSeal) {
  try {
    const layout = topPlateLayout(project, record);
    const outdated = record.signature !== layout.signature;
    const bead = bottomPlateSealant.size[record.bead];
    const problem = outdated ? "The modeled drywall backing, gap or access changed. Review the seam again." :
      record.gap > bead || record.depth > bead ? "Choose a bead that covers the measured gap and fill depth." :
      layout.runs.some((run) => !!run.problem) ? "Resolve every interruption before ordering sealant for this side." : "";
    return { layout, outdated, problem };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : "Review the top plate seam." };
  }
}

export function topPlateSealReviews(project: Project) {
  return (project.topPlateSeals ?? []).map((record) => ({
    record, title: topPlateSealTitle(project, record), ...reviewTopPlateSeal(project, record),
  }));
}

export function topPlateSealGuide(project: Project) {
  const rows = topPlateSealReviews(project);
  if (!rows.length) return [];
  const valid = inspectCutStock(project).valid;
  const { batches } = wallPlateSealTakeoff(project, rows);
  return [topPlateSealScope, ...rows.flatMap(({ title, record, layout, outdated, problem }) => {
    const panelMaterials = new Set(layout?.runs.flatMap(({ panelId }) => {
      const material = project.pieces.find(({ id }) => id === panelId)?.material;
      return material && isDrywall(material) ? [material] : [];
    }));
    const scrap = project.pieces.find((piece) => piece.offcut && panelMaterials.has(piece.material) &&
      (!piece.cutStock || valid.has(piece.cutStock.id)) && Math.max(...piece.size) >= 2);
    return [
      `${title} · ${record.bead} in bead, measured gap ${inches(record.gap)}, fill depth ${inches(record.depth)} · ${record.session}.`,
      ...(problem ? [problem] : []),
      ...(!outdated ? layout?.runs.map(({ start, end, length, panelId, problem: issue }) =>
        `${inches(start)} to ${inches(end)} from the marked start · ${issue || `${span(length)} of modeled bead path against ${partLabel(project, panelId!)}.`}`) ?? [] : []),
      ...(!problem && scrap ? [`Try the bead against matching drywall scrap ${partLabel(project, scrap.id)} · ${scrap.name}.`] : []),
    ];
  }), ...batches.map(({ name, cartridges }) =>
    `${name} · ${cartridges} ${cartridges === 1 ? "cartridge" : "cartridges"} of OSI SC175 for current top and bottom plate runs in this session.`)];
}

/** A cartridge can serve both plate details when the work-session names match. */
export function wallPlateSealTakeoff(project: Project, top = topPlateSealReviews(project)) {
  const rows = [...bottomPlateSealReviews(project), ...top];
  const runs = rows.flatMap(({ record, layout, problem }) =>
    !problem && layout?.clearLength ? [{ session: record.session, bead: record.bead, length: layout.clearLength }] : [],
  );
  return { ...plateSealTakeoff(runs), needsReview: rows.some(({ problem, layout }) =>
    !!problem || !!layout?.runs.some((run) => !!run.problem)) };
}
