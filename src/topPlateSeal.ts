import { bottomPlateSealReviews, plateSealTakeoff } from "./bottomPlateSeal";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { inspectCutStock } from "./cutStock";
import { isDrywall } from "./drywallReference";
import { formatPreciseInches as inches, formatStockLength as span } from "./measurement";
import { type Project, uid } from "./model";
import { partLabel } from "./partLabels";
import { topPlateLayout } from "./topPlateSealGeometry";
import { topPlateInputSchema, topPlateSealsSchema, type DrywallPlateFace, type TopPlateSeal } from "./topPlateSealSchema";

export const topPlateSealFieldGuide = "https://basc.pnnl.gov/resource-guides/air-sealing-drywall-top-plate";
export const topPlateSealScope = "Plan a bead on the exposed wall face of a top plate before hanging drywall. Verify clean, dry wood and paper facing, the actual joint gap and the adjoining air barrier before covering the seam.";

export const drywallPlateDetails = {
  top: { key: "topPlateSeals", fieldGuide: topPlateSealFieldGuide, scope: topPlateSealScope },
  bottom: {
    key: "drywallBottomPlateSeals",
    fieldGuide: "https://buildingscience.com/documents/information-sheets/air-barriers-airtight-drywall-approach",
    scope: "Plan a bead on the exposed bottom plate face before hanging drywall in a dry, unrated interior detail. Confirm the installed drywall edge, floor clearance, clean contact faces and continuous air barrier at the floor. Apply OSI SC175 above 40°F and seat the drywall within the manufacturer's working time.",
  },
} as const;

export function previewTopPlateSeal(project: Project, fields: unknown, editingId?: string, face: DrywallPlateFace = "top") {
  const { key } = drywallPlateDetails[face];
  const input = topPlateInputSchema.parse(fields);
  const saved = project[key]?.find(({ id }) => id === editingId);
  if (editingId && !saved) throw Error(`This drywall-to-${face}-plate seal has been removed.`);
  if ([...(project.topPlateSeals ?? []), ...(project.drywallBottomPlateSeals ?? [])].some(({ id, plateId, side }) =>
    id !== editingId && plateId === input.plateId && side === input.side))
    throw Error("This side already has an air-seal plan. Open the saved plan to edit it.");
  const bead = bottomPlateSealant.size[input.bead];
  if (input.gap > bead || input.depth > bead)
    throw Error("Choose a bead that covers the measured gap and fill depth, or review a different joint detail.");
  const layout = topPlateLayout(project, input, face);
  if (!layout.runs.some(({ panelId }) => panelId))
    throw Error(face === "bottom"
      ? "Align the drywall back face with the bottom plate. Keep the drywall's lower edge within the plate face and cover the full bead band."
      : "Align the modeled drywall back face with the selected side of the top plate and cover the full bead height.");
  const record = { ...input, id: saved?.id ?? uid(), signature: layout.signature };
  const seals = topPlateSealsSchema.parse([
    ...(project[key] ?? []).filter(({ id }) => id !== record.id), record,
  ]);
  return { record, layout, project: { ...project, [key]: seals, guideFingerprint: null } };
}

export function topPlateSealTitle(project: Project, record: TopPlateSeal, face: DrywallPlateFace = "top") {
  const plate = project.pieces.find(({ id }) => id === record.plateId);
  return `${plate?.name ?? `Missing ${face} plate`} · Side ${record.side.toUpperCase()}`;
}

export function reviewTopPlateSeal(project: Project, record: TopPlateSeal, face: DrywallPlateFace = "top") {
  try {
    const layout = topPlateLayout(project, record, face);
    const outdated = record.signature !== layout.signature;
    const bead = bottomPlateSealant.size[record.bead];
    const problem = outdated ? "The modeled drywall backing, gap or access changed. Review the seam again." :
      record.gap > bead || record.depth > bead ? "Choose a bead that covers the measured gap and fill depth." :
      layout.runs.some(({ woodMissing }) => woodMissing) ? "Review the plate cutout seal before ordering sealant for this side." :
      layout.runs.some((run) => !!run.problem) ? "Resolve every interruption before ordering sealant for this side." : "";
    return { layout, outdated, problem };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : `Review the ${face} plate seam.` };
  }
}

export function topPlateSealReviews(project: Project, face: DrywallPlateFace = "top") {
  return (project[drywallPlateDetails[face].key] ?? []).map((record) => ({
    record, face, title: topPlateSealTitle(project, record, face), ...reviewTopPlateSeal(project, record, face),
  }));
}

export function drywallPlateSealReviews(project: Project) {
  return [...topPlateSealReviews(project), ...topPlateSealReviews(project, "bottom")];
}

export function drywallPlateGuidePanels(
  project: Project,
  reviews = drywallPlateSealReviews(project),
) {
  const sealed = new Set(reviews.flatMap(({ layout }) =>
    layout?.runs.flatMap(({ panelId }) => panelId ? [panelId] : []) ?? [],
  ));
  const linings = project.sections.filter(({ wallDrywall, pieceIds }) =>
    wallDrywall && pieceIds.some((id) => sealed.has(id)),
  );
  for (const lining of linings)
    for (const id of lining.pieceIds) sealed.delete(id);
  return {
    linings,
    standalone: sealed,
    stageKey: project.topPlateSeals?.length
      ? "drywall-after-top-plate-sealing"
      : "drywall-after-bottom-plate-sealing",
  };
}

export function topPlateSealGuide(project: Project, face: DrywallPlateFace = "top") {
  const rows = topPlateSealReviews(project, face);
  if (!rows.length) return [];
  const valid = inspectCutStock(project).valid;
  const { batches } = wallPlateSealTakeoff(project);
  return [drywallPlateDetails[face].scope, ...rows.flatMap(({ title, record, layout, outdated, problem }) => {
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
  }), ...(face === "top" || !project.topPlateSeals?.length ? batches : []).map(({ name, cartridges }) =>
    `${name} · ${cartridges} ${cartridges === 1 ? "cartridge" : "cartridges"} of OSI SC175 for current top and bottom plate runs in this session.`)];
}

/** A cartridge can serve both plate details when the work-session names match. */
export function wallPlateSealTakeoff(project: Project) {
  const rows = [...bottomPlateSealReviews(project), ...drywallPlateSealReviews(project)];
  const runs = rows.flatMap(({ record, layout, problem }) =>
    !problem && layout?.clearLength ? [{ session: record.session, bead: record.bead, length: layout.clearLength }] : [],
  );
  return { ...plateSealTakeoff(runs), needsReview: rows.some(({ problem, layout }) =>
    !!problem || !!layout?.runs.some((run) => !!run.problem)) };
}
