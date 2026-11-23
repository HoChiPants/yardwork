import { bottomPlateLayout } from "./bottomPlateSealGeometry";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { bottomPlateInputSchema, bottomPlateSealsSchema, type BottomPlateSeal } from "./bottomPlateSealSchema";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import { inspectCutStock } from "./cutStock";
import { ensurePartLabels, partLabel } from "./partLabels";
import { type Project, uid } from "./model";

export function previewBottomPlateSeal(project: Project, draft: unknown, editingId?: string) {
  const input = bottomPlateInputSchema.parse(draft);
  const saved = (project.bottomPlateSeals ?? []).find(({ id }) => id === editingId);
  if (editingId && !saved) throw Error("This bottom plate air-seal plan has been removed.");
  if (project.bottomPlateSeals?.some(({ id, plateId, side }) =>
      id !== editingId && plateId === input.plateId && side === input.side))
    throw Error("This plate side already has an air-seal plan. Open the saved plan to revise it.");
  const bead = bottomPlateSealant.size[input.bead];
  if (input.gap > bead || input.depth > bead)
    throw Error("Choose a bead that covers the measured gap and fill depth. Larger gaps need a reviewed joint detail.");
  const layout = bottomPlateLayout(project, input);
  const record = { ...input, id: saved?.id ?? uid(), signature: layout.signature };
  const plans = bottomPlateSealsSchema.parse([
    ...(project.bottomPlateSeals ?? []).filter(({ id }) => id !== record.id), record,
  ]);
  return {
    record, layout,
    project: { ...project, bottomPlateSeals: plans, guideFingerprint: null },
  };
}

export function reviewBottomPlateSeal(project: Project, record: BottomPlateSeal) {
  try {
    const layout = bottomPlateLayout(project, record);
    const outdated = layout.signature !== record.signature;
    const problem = outdated ? "The modeled backing or access changed. Reopen the plan and review the seam." :
      layout.runs.some(({ woodMissing }) => woodMissing) ? "Review the plate cutout seal before ordering sealant for this side." :
      !layout.clearLength ? "Check the subfloor, gap and access before ordering sealant for this side." : "";
    return { layout, problem, outdated };
  } catch (issue) {
    return { problem: issue instanceof Error ? issue.message : "Review the bottom plate seam." };
  }
}

export function removeBottomPlateSeal(project: Project, id: string): Project {
  return { ...project, bottomPlateSeals: project.bottomPlateSeals?.filter((record) => record.id !== id), guideFingerprint: null };
}

export function bottomPlateSealTitle(project: Project, record: BottomPlateSeal) {
  const name = project.pieces.find(({ id }) => id === record.plateId)?.name ?? "Missing bottom plate";
  return `${name} · Side ${record.side.toUpperCase()}`;
}

export function bottomPlateSealReviews(project: Project) {
  return (project.bottomPlateSeals ?? []).map((record) => ({
    record, title: bottomPlateSealTitle(project, record), ...reviewBottomPlateSeal(project, record),
  }));
}

export function bottomPlateSealTakeoff(project: Project, rows = bottomPlateSealReviews(project)) {
  return plateSealTakeoff(rows.flatMap(({ record, layout, problem }) =>
    !problem && layout?.clearLength ? [{ session: record.session, bead: record.bead, length: layout.clearLength }] : [],
  ));
}

export function plateSealTakeoff(runs: readonly {
  session: string;
  bead: "1/4" | "3/8";
  length: number;
}[]) {
  const sessions = new Map<string, { name: string; use: number }>();
  for (const run of runs) {
    const key = run.session.toLowerCase();
    const session = sessions.get(key) ?? { name: run.session, use: 0 };
    session.use += run.length / (12 * bottomPlateSealant.coverageFeet[run.bead]);
    sessions.set(key, session);
  }
  const batches = [...sessions.values()].map((row) => ({
    ...row, cartridges: Math.ceil(row.use - 1e-10),
  }));
  return { batches, required: batches.reduce((sum, batch) => sum + batch.cartridges, 0) };
}

export function bottomPlateDisplayRuns(layout: ReturnType<typeof bottomPlateLayout>) {
  const grouped: { start: number; end: number; length: number; problem: string }[] = [];
  for (const run of layout.runs) {
    const last = grouped.at(-1);
    if (last && last.problem === run.problem && Math.abs(last.end - run.start) <= 0.001) {
      last.end = run.end;
      last.length += run.length;
    } else grouped.push({ start: run.start, end: run.end, length: run.length, problem: run.problem });
  }
  return grouped;
}

export function bottomPlateSealGuide(project: Project, rows = bottomPlateSealReviews(project)) {
  if (!rows.length) return [];
  const { batches } = bottomPlateSealTakeoff(project, rows);
  const materials = new Set(rows.flatMap(({ layout, problem }) => !problem && layout
    ? [layout.plate.material, ...layout.runs.flatMap((run) => !run.problem && run.panelMaterial ? [run.panelMaterial] : [])]
    : []));
  const stock = inspectCutStock(project).valid;
  const labeled = ensurePartLabels(project);
  const scraps = [...materials].flatMap((material) => {
    const scrap = project.pieces.find((piece) => piece.offcut && piece.material === material &&
      (!piece.cutStock || stock.has(piece.cutStock.id)) && Math.max(...piece.size) >= 2);
    return scrap ? [`${partLabel(labeled, scrap.id)} · ${scrap.name}`] : [];
  });
  return [
    "Check the marked wood-to-wood seam after framing and before finishes cover it. Prepare clean, dry, sound substrates. Test the bead on matching scrap and confirm the adjoining air barrier and access in the field.",
    ...(scraps.length ? [`Try the bead on matching Cut pool pieces ${scraps.join(", ")}. Confirm they have the same surface condition as the installed stock.`] : []),
    ...rows.flatMap(({ title, record, layout, problem, outdated }) => {
      const line = `${title} · ${record.bead} in bead, measured gap ${dim(record.gap)}, fill depth ${dim(record.depth)} · ${record.session}.`;
      return [line, ...(problem ? [problem] : []), ...(!outdated && layout
        ? bottomPlateDisplayRuns(layout).map((run) =>
          `${dim(run.start)} to ${dim(run.end)} from the marked start · ${run.problem || `${formatStockLength(run.length)} of modeled bead path.`}`)
        : [])];
    }),
    ...batches.map(({ name, use, cartridges }) =>
      `${name} · ${cartridges} ${cartridges === 1 ? "cartridge" : "cartridges"} of OSI SC175 · estimated ${Math.max(0, 100 * (cartridges - use)).toFixed(1)}% of one cartridge left. Check the label and actual usable coverage.`),
  ];
}
