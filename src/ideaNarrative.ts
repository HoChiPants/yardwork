import type { IdeaPlan, PlanModule } from "./planSchema";

const n = (value: number) => String(Number(value.toFixed(3)));
const unique = (values: number[]) => [...new Set(values.map(n))].join(", ");
const labels: Record<PlanModule["kind"], string> = {
  bench: "seating section",
  workbench: "workbench",
  cabinet: "cabinet",
  shelf: "shelf",
  frame: "frame",
  panel: "panel",
};
function countLabel(count: number, label: string) {
  const plural = label === "shelf" ? "shelves" : `${label}s`;
  return `${count} ${count === 1 ? label : plural}`;
}
function footprint(modules: PlanModule[]) {
  if (!modules.length) return null;
  const boxes = modules.map((m) => {
    const angle = (m.yaw * Math.PI) / 180,
      x =
        (Math.abs(Math.cos(angle)) * m.width +
          Math.abs(Math.sin(angle)) * m.depth) /
        2,
      z =
        (Math.abs(Math.sin(angle)) * m.width +
          Math.abs(Math.cos(angle)) * m.depth) /
        2;
    return {
      minX: m.position[0] - x,
      maxX: m.position[0] + x,
      minZ: m.position[2] - z,
      maxZ: m.position[2] + z,
    };
  });
  return {
    width:
      Math.max(...boxes.map((b) => b.maxX)) -
      Math.min(...boxes.map((b) => b.minX)),
    depth:
      Math.max(...boxes.map((b) => b.maxZ)) -
      Math.min(...boxes.map((b) => b.minZ)),
  };
}
function straightSeating(modules: PlanModule[]) {
  if (!modules.length) return false;
  const first = modules[0],
    yaw = (first.yaw * Math.PI) / 180,
    perp = (m: PlanModule) =>
      Math.sin(yaw) * m.position[0] + Math.cos(yaw) * m.position[2];
  return modules.every(
    (m) =>
      Math.abs(Math.sin(((m.yaw - first.yaw) * Math.PI) / 180)) < 0.00001 &&
      Math.cos(((m.yaw - first.yaw) * Math.PI) / 180) > 0 &&
      Math.abs(perp(m) - perp(first)) < 0.001,
  );
}
function narrativeLine(note: string, benches: PlanModule[]): string | null {
  const storage = benches.filter((m) => m.storage).length,
    lids = benches.filter((m) => m.openingLid).length,
    backs = benches.filter((m) => m.backHeight > 0),
    heights = [...new Set(backs.map((m) => m.backHeight))];
  if (
    !storage &&
    /^Storage is enclosed with a bottom, front\/rear and side panels\./.test(
      note,
    )
  )
    return (
      note.replace(
        /^Storage is enclosed with a bottom, front\/rear and side panels\.\s*/,
        "",
      ) || null
    );
  if (!lids) {
    const obsolete: [string, string][] = [
      [
        "Seat lids can be shown open for access review. The rear pivot is provisional; hinge selection, lid stays, pinch protection and wall clearance need design. Hinges and lid-support hardware are not specified or priced.",
        "",
      ],
      [
        "Seat lids are modeled; hinges, stays, pinch protection, wall clearance and attachment details still need design.",
        "Attachment details still need design.",
      ],
      [
        "Opening lids use a provisional rear pivot; hinges, stays, pinch protection and wall clearance need design. Hinge and lid-support hardware remain unspecified and unpriced.",
        "",
      ],
      [
        "Opening lids have a provisional rear pivot; hinges, lid stays, pinch protection, wall clearance and their unpriced hardware remain unresolved.",
        "",
      ],
      [
        "Storage lids, hinges, angled backs, and attachment details need to be added and checked.",
        "Attachment details need to be checked.",
      ],
    ];
    for (const [old, replacement] of obsolete)
      if (note === old || note.startsWith(old + " "))
        return (
          [replacement, note.slice(old.length).trim()]
            .filter(Boolean)
            .join(" ") || null
        );
  }
  const back = note.match(
    /^(?:Provisional back height:|The optional back panel is a provisional)\s*(\d+(?:\.\d+)?)\s*in\b/,
  );
  if (back) {
    const known = [
      `Provisional back height: ${back[1]} in above the seat. Verify before cutting.`,
      `The optional back panel is a provisional ${back[1]} in above the seat, with no cushion or recline allowance.`,
    ].find((prefix) => note === prefix || note.startsWith(prefix + " "));
    if (!known) return note;
    const suffix = note.slice(known.length).trim();
    if (!backs.length) return suffix || null;
    if (heights.length === 1 && Math.abs(Number(back[1]) - heights[0]) < 0.001)
      return note;
    return [
      `Back heights above the seat: ${unique(heights)} in. Verify before cutting.`,
      suffix,
    ]
      .filter(Boolean)
      .join(" ");
  }
  const run = note.match(
    /^The (\d+) sections are arranged side by side in one straight run;/,
  );
  if (run && (Number(run[1]) !== benches.length || !straightSeating(benches))) {
    const known = `The ${run[1]} sections are arranged side by side in one straight run; confirm whether you instead want an L or U layout.`;
    if (note === known || note.startsWith(known + " "))
      return note.slice(known.length).trim() || null;
  }
  return note;
}
/** Metadata only: final typed state supplies the claims; unknown review/manufacturer text stays verbatim. */
export function reconcileNarrative(plan: IdeaPlan): IdeaPlan {
  const benches = plan.modules.filter((m) => m.kind === "bench"),
    storage = benches.filter((m) => m.storage).length,
    lids = benches.filter((m) => m.openingLid).length,
    backs = benches.filter((m) => m.backHeight > 0).length,
    mixed = plan.modules.length > 0 && plan.structures.length > 0,
    kinds = [...new Set(plan.modules.map((m) => m.kind))],
    extent = footprint(plan.modules);
  let title: string;
  if (mixed) title = "Mixed project design";
  else if (plan.structures.length === 1)
    title =
      plan.structures[0].kind === "greenhouse"
        ? "Greenhouse design study"
        : plan.structures[0].kind === "sauna"
          ? "Sauna design study"
          : plan.structures[0].kind === "casework-shelves"
            ? "Panel casework bookcase study"
            : "Closet insert design study";
  else if (plan.structures.length > 1)
    title = `${plan.structures.length}-structure design study`;
  else if (benches.length === plan.modules.length && benches.length)
    title =
      benches.length === 1
        ? `${storage ? "Storage b" : "B"}ench design`
        : `${benches.length}-section ${storage === benches.length ? "storage " : ""}banquette`;
  else if (plan.modules.length === 1)
    title = `${labels[plan.modules[0].kind][0].toUpperCase() + labels[plan.modules[0].kind].slice(1)} design`;
  else if (plan.modules.length)
    title = `${plan.modules.length}-module furniture design`;
  else title = "Clarify the project";
  const sentences: string[] = [];
  if (plan.modules.length) {
    const counts = kinds.map((kind) =>
      countLabel(
        plan.modules.filter((m) => m.kind === kind).length,
        labels[kind],
      ),
    );
    sentences.push(`${counts.join(", ")}.`);
    if (benches.length)
      sentences.push(
        `Seating: ${storage} enclosed for storage, ${lids} opening ${lids === 1 ? "lid" : "lids"}, ${backs} with backs. Seat ${benches.every((m) => m.height === benches[0].height) ? "height" : "heights"}: ${unique(benches.map((m) => m.height))} in; depth${benches.every((m) => m.depth === benches[0].depth) ? "" : "s"}: ${unique(benches.map((m) => m.depth))} in.`,
      );
    if (backs)
      sentences.push(
        `Back height${new Set(benches.filter((m) => m.backHeight > 0).map((m) => m.backHeight)).size === 1 ? "" : "s"} above the seat: ${unique(benches.filter((m) => m.backHeight > 0).map((m) => m.backHeight))} in.`,
      );
    if (extent)
      sentences.push(
        `Closed body footprint in workspace X × Z: ${n(extent.width)} × ${n(extent.depth)} in.`,
      );
  }
  for (const structure of plan.structures) {
    const p = structure.parameters;
    if (structure.kind === "greenhouse" && "eaveHeight" in p) {
      sentences.push(
        `Greenhouse study: outside ${n(p.width)} × ${n(p.depth)} in; eave ${n(p.eaveHeight)} in, roof rise ${n(p.roofRise)} in, ridge ${n(p.eaveHeight + p.roofRise)} in.`,
      );
      if (p.roofVent) sentences.push(
        `Roof vent on the ${p.roofVent.side} slope, rafter bay ${p.roofVent.bay}, ${n(p.roofVent.length)} in along the slope at ${n(p.roofVent.ridgeOffset)} in below the ridge.`,
      );
    } else if (structure.kind === "sauna" && "clearWidth" in p)
      sentences.push(
        `Sauna study: clear inside ${n(p.clearWidth)} × ${n(p.clearDepth)} × ${n(p.clearHeight)} in.`,
      );
    else if (structure.kind === "closet-insert" && "towerWidth" in p)
      sentences.push(
        `Closet insert study: outside ${n(p.width)} × ${n(p.depth)} × ${n(p.height)} in; clear shelf tower ${n(p.towerWidth)} in, ${p.shelfCount} shelves.`,
      );
    else if (structure.kind === "casework-shelves" && "shelfClearance" in p)
      sentences.push(
        `Panel casework study: outside ${n(p.width)} × ${n(p.depth)} × ${n(p.height)} in; ${p.shelfCount} adjustable shelves, ${n(p.shelfClearance)} in front setback.`,
      );
  }
  if (!sentences.length)
    sentences.push(
      "Answer the planning questions before build geometry can be proposed.",
    );
  else if (
    plan.questions.length &&
    /retained.+clarif|retained while|while.+clarif/.test(
      plan.summary.toLowerCase(),
    )
  )
    sentences.unshift("The proposal is retained while the edit is clarified.");
  // Counts are bounded by the typed schema; omit optional detail sentences rather than cut a numerical fact mid-sentence.
  let summary = "";
  for (const sentence of sentences)
    if (summary.length + sentence.length + 1 <= 1000)
      summary += (summary ? " " : "") + sentence;
  const clean = (notes: string[]) =>
    notes
      .map((note) => narrativeLine(note, benches))
      .filter((note): note is string => note !== null);
  return {
    ...plan,
    title,
    summary,
    assumptions: clean(plan.assumptions),
    suggestions: clean(plan.suggestions),
  };
}
