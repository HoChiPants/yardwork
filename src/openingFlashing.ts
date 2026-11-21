import { attachmentGeometryFingerprint } from "./attachments";
import { checkOpeningAirSeal, openingAirSealEdgeLine, openingAirSealSummary } from "./openingAirSeal";
import { openingFoam, openingSealMaterials } from "./openingAirSealReference";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { flexWrap, windowFlashingTape } from "./openingFlashingReference";
import {
  openingFlashingMeasurementsSchema,
  openingFlashingPlansSchema,
  openingMembersSchema,
  type OpeningFlashingMeasurements,
  type OpeningFlashingPlan,
  type OpeningMembers,
} from "./openingFlashingSchema";
import { ensurePartLabels } from "./partLabels";
import { sillPlateFootprint } from "./sillGaskets";
import { inverseRotation, rotate } from "./spatial";
import { purchaseCount } from "./purchaseUnits";
import { packRuns } from "./stockRunPacking";
import { pieceThroughOpenings } from "./throughOpenings";
import { generatedWindowMembers } from "./windowWall";

const epsilon = 0.001;
const axes = [0, 1, 2] as const;
const dot = (a: V3, b: V3) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const plus = (a: V3, b: V3) => a.map((value, i) => value + b[i]) as V3;
const scale = (a: V3, n: number) => a.map((value) => value * n) as V3;
const clean = (n: number) => Number(n.toFixed(6));

export function openingFramingStock(part: Piece) {
  const stock = material(part.material);
  return stock.wood && stock.stockKind === "linear" && !stock.shape
    && !part.offcut && !part.cutPlanes.length && !pieceThroughOpenings(part).length;
}

function openingBox(part: Piece, origin: V3, basis: [V3, V3, V3]) {
  if (!openingFramingStock(part)) return null;
  const directions = axes.map((axis) => rotate(axes.map((i) => Number(i === axis)) as V3, part.rotation));
  const center = plus(part.position, scale(origin, -1));
  const relative = basis.map((axis) => dot(center, axis)) as V3;
  const half: V3 = [0, 0, 0];
  for (const [axis, direction] of directions.entries()) {
    const aligned = basis.findIndex((candidate) => Math.abs(dot(direction, candidate)) > 1 - 1e-8);
    if (aligned < 0) return null;
    half[aligned] = part.size[axis] / 2;
  }
  return {
    min: relative.map((value, i) => clean(value - half[i])) as V3,
    max: relative.map((value, i) => clean(value + half[i])) as V3,
  };
}

export function roughOpeningFrame(project: Project, members: OpeningMembers) {
  const byId = new Map(project.pieces.map((part) => [part.id, part]));
  const sill = byId.get(members.sill);
  const footprint = sill && sillPlateFootprint(sill);
  if (!sill || !footprint || !openingFramingStock(sill)) throw Error("Choose a flat, square wood rough sill.");
  const along = footprint.along;
  const up: V3 = [0, 1, 0];
  const across: V3 = [-along[2], 0, along[0]];
  const basis: [V3, V3, V3] = [along, up, across];
  const parts = [sill, byId.get(members.jambA), byId.get(members.jambB), byId.get(members.head)];
  const boxes = parts.map((part) => part && openingBox(part, sill.position, basis));
  const [base, a, b, head] = boxes;
  if (!base || !a || !b || !head) throw Error("Use four active, aligned, square-edged wood members for the rough opening.");
  const [left, right] = a.min[0] < b.min[0] ? [a, b] : [b, a];
  const x0 = left.max[0], x1 = right.min[0], y0 = base.max[1], y1 = head.min[1];
  if (x1 - x0 <= epsilon || y1 - y0 <= epsilon)
    throw Error("The selected jambs, sill and head don't enclose a positive rectangular opening.");
  if (base.min[0] > x0 + epsilon || base.max[0] < x1 - epsilon ||
      head.min[0] > x0 + epsilon || head.max[0] < x1 - epsilon ||
      [left, right].some(({ min, max }) => min[1] > y0 + epsilon || max[1] < y1 - epsilon))
    throw Error("The sill and head must reach both jamb faces, with continuous jamb support between them.");
  const frame = [base, left, right, head];
  const z0 = Math.max(...frame.map(({ min }) => min[2]));
  const z1 = Math.min(...frame.map(({ max }) => max[2]));
  if (z1 - z0 <= epsilon) throw Error("The four members need shared wall depth behind the opening.");
  return {
    x0, x1, y0, y1, z0, z1,
    width: clean(x1 - x0), height: clean(y1 - y0), depth: clean(z1 - z0),
    exteriorPlanes: {
      positive: Math.max(...frame.map(({ max }) => max[2])) - z1 <= epsilon,
      negative: z0 - Math.min(...frame.map(({ min }) => min[2])) <= epsilon,
    },
    signature: JSON.stringify(parts.map((part, index) => [attachmentGeometryFingerprint(part!), boxes[index]])),
    at: (x: number, y: number, z: number) => plus(sill.position, plus(scale(along, x), plus(scale(up, y), scale(across, z)))),
  };
}

function checkWindowFlashingTape(frame: ReturnType<typeof roughOpeningFrame>, measured: OpeningFlashingMeasurements,
  exteriorFace: number, fromLeft: (offset: number) => number, drains: number[]) {
  const tape = measured.jambHead;
  if (!tape) return null;
  const { left, right, head, tapeWidth, pastApron, pastJambs } = tape;
  const issues: string[] = [];
  if (measured.unit !== "window")
    issues.push("Use this jamb and head cut layout with a rectangular flanged window.");
  const bodyWidth = frame.width - left.inset - right.inset;
  if (bodyWidth <= epsilon || head.inset >= frame.height - epsilon)
    issues.push("The entered frame offsets must leave room for the unit inside the rough opening.");
  const clearance = [
    ["Left jamb", left], ["Right jamb", right], ["Head", head],
  ] as const;
  for (const [label, edge] of clearance) {
    if (edge.flange <= edge.inset + epsilon)
      issues.push(`${label} flange does not reach backing outside the rough opening.`);
    if (tapeWidth <= edge.flange + epsilon)
      issues.push(`${label} tape must cover the flange and reach exposed backing.`);
  }
  const headStart = frame.y1 - head.inset;
  const jambTop = headStart + head.flange + windowFlashingTape.aboveHeadFlange;
  if (headStart + tapeWidth + epsilon < jambTop)
    issues.push("The head tape must cover the jamb tops, including their 1 in rise above the head flange.");
  if (drains.length && (drains[0] - flexWrap.minDrainageWidth / 2 < left.inset - epsilon ||
    drains.at(-1)! + flexWrap.minDrainageWidth / 2 > frame.width - right.inset + epsilon))
    issues.push("A jamb strip reaches into a planned sill drainage gap. Check its width from the exterior corner.");
  const jambBottom = frame.y0 - measured.faceLap - pastApron;
  const headLeft = left.inset - tapeWidth - pastJambs;
  const headRight = frame.width - right.inset + tapeWidth + pastJambs;
  const cuts = [
    { edge: "Left jamb", length: clean(jambTop - jambBottom) },
    { edge: "Right jamb", length: clean(jambTop - jambBottom) },
    { edge: "Head", length: clean(headRight - headLeft) },
  ];
  if (cuts.some(({ length }) => length > windowFlashingTape.rollLength + epsilon))
    issues.push("A continuous window flashing cut exceeds a 75 ft roll.");
  const rectangle = (x0: number, x1: number, y0: number, y1: number) =>
    ([[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]] as const)
      .map(([x, y]) => frame.at(fromLeft(x), y, exteriorFace));
  return {
    cuts, issues,
    outlines: [
      rectangle(left.inset - tapeWidth, left.inset, jambBottom, jambTop),
      rectangle(frame.width - right.inset, frame.width - right.inset + tapeWidth, jambBottom, jambTop),
      rectangle(headLeft, headRight, headStart, headStart + tapeWidth),
    ],
  };
}

export type OpeningFlashingPreview = {
  pan: V3[];
  apron: V3[];
  drainage: V3[][];
  interiorSeal: V3[];
  jambHead?: V3[][];
};

export function checkOpeningFlashing(project: Project, members: OpeningMembers, measured: OpeningFlashingMeasurements) {
  const frame = roughOpeningFrame(project, members);
  const { width, height, depth, x0, x1, y0, y1, at } = frame;
  const { tapeWidth, exterior, sheathing, frameDepth, jambReturn, faceLap, pan, drainage } = measured;
  const sign = exterior === "positive" ? 1 : -1;
  const outside = (sign > 0 ? frame.z1 : frame.z0) + sign * sheathing;
  const inside = (value: number) => outside - sign * value;
  const issues: string[] = [];
  if (!frame.exteriorPlanes[exterior])
    issues.push("The selected members don't share a flush exterior face on this side.");
  if (jambReturn > height + epsilon)
    issues.push("The jamb return extends past the modeled head.");
  const returnWidth = pan.kind === "back-dam" ? pan.rise : 0;
  const bed = clean(tapeWidth - faceLap - returnWidth);
  if (bed + epsilon < frameDepth + flexWrap.minInteriorAdhesion)
    issues.push("Allow at least 1 in of membrane beyond the inside edge of the unit after the face lap and any back dam.");
  if (bed > depth + sheathing + epsilon)
    issues.push("The planned sill bed extends past the shared backing. Check the width, face lap and back-dam detail.");
  if (frameDepth > depth + sheathing + epsilon)
    issues.push("The measured frame edge is beyond the modeled opening depth.");
  const length = clean(width + jambReturn * 2);
  if (length > flexWrap.rollLength)
    issues.push("This continuous cut exceeds a 75 ft roll. Review the chosen system detail.");

  const halfDrain = flexWrap.minDrainageWidth / 2;
  const centers = drainage.kind === "gaps" ? [...drainage.centers].sort((a, b) => a - b) : [];
  if (drainage.kind === "gaps") {
    if (centers[0] < halfDrain || centers.at(-1)! > width - halfDrain)
      issues.push("Each 2 in drainage opening must fit entirely along the sill.");
    if (centers[0] > flexWrap.maxCornerDistance || width - centers.at(-1)! > flexWrap.maxCornerDistance)
      issues.push("Place a drainage gap center within 4 in of each sill corner.");
    if (centers.some((value, i) => i > 0 && (
      value - centers[i - 1] < flexWrap.minDrainageSpacing - epsilon ||
      value - centers[i - 1] > flexWrap.maxDrainageSpacing + epsilon
    ))) issues.push("Space the drainage gap centers 6 to 12 in apart.");
  }
  const xAt = (offset: number) => sign > 0 ? x0 + offset : x1 - offset;
  const drainLine = (from: number, to: number) => [at(xAt(from), y0, outside), at(xAt(to), y0, outside)];
  const seal = inside(frameDepth);
  const airSeal = measured.airSeal ? checkOpeningAirSeal(frame, frameDepth, measured.airSeal) : null;
  if (airSeal) issues.push(...airSeal.issues);
  const airLeft = (measured.airSeal?.left ?? 0) / 2, airRight = width - (measured.airSeal?.right ?? 0) / 2;
  const airTop = y1 - (measured.airSeal?.head ?? 0) / 2, airBottom = y0 + (measured.airSeal?.sill ?? 0) / 2;
  const sealX = measured.airSeal ? xAt : (x: number) => x0 + x;
  const sealLine = [[airLeft, airBottom], [airLeft, airTop], [airRight, airTop], [airRight, airBottom], [airLeft, airBottom]]
    .map(([x, y]) => at(sealX(x), y, seal));
  const jambHead = checkWindowFlashingTape(frame, measured, outside, xAt, centers);
  if (jambHead) issues.push(...jambHead.issues);
  const preview: OpeningFlashingPreview = {
    pan: [at(x0, y0 + jambReturn, inside(bed)), at(x0, y0, inside(bed)),
      at(x1, y0, inside(bed)), at(x1, y0 + jambReturn, inside(bed))],
    apron: [at(x0, y0, outside), at(x0, y0 - faceLap, outside), at(x1, y0 - faceLap, outside), at(x1, y0, outside)],
    drainage: drainage.kind === "open" ? [drainLine(0, width)]
      : centers.map((center) => drainLine(center - halfDrain, center + halfDrain)),
    jambHead: jambHead?.outlines,
    interiorSeal: sealLine,
  };
  return { frame, length, bed, issues, preview, jambHead, airSeal };
}

export function saveOpeningFlashing(project: Project, members: OpeningMembers, proposed: OpeningFlashingMeasurements) {
  const actualMembers = openingMembersSchema.parse(members);
  const measurements = openingFlashingMeasurementsSchema.parse(proposed);
  const checked = checkOpeningFlashing(project, actualMembers, measurements);
  if (checked.issues.length) throw Error(checked.issues.join(" "));
  const saved: OpeningFlashingPlan = { members: actualMembers, measurements, signature: checked.frame.signature };
  return { ...project, guideFingerprint: null, openingFlashings: openingFlashingPlansSchema.parse([
    ...(project.openingFlashings ?? []).filter(({ members }) => members.sill !== actualMembers.sill),
    saved,
  ]) };
}

export function removeOpeningFlashing(project: Project, sillId: string) {
  return { ...project, guideFingerprint: null, openingFlashings: project.openingFlashings?.filter(({ members }) => members.sill !== sillId) };
}

export function openingDrainageNote(measured: OpeningFlashingMeasurements) {
  return measured.drainage.kind === "open"
    ? "Keep the exterior sill flange open for drainage."
    : `Leave 2 in drainage gaps centered at ${[...measured.drainage.centers].sort((a, b) => a - b)
      .map(formatPreciseInches).join(", ")} from the left exterior corner.`;
}

export function reviewOpeningFlashings(project: Project) {
  const plans = project.openingFlashings ?? [];
  if (!plans.length) return { rows: [], groups: [], tapeGroups: [], airSealBatches: [] };
  const labels = new Map(ensurePartLabels(project).partLabels.map(({ partId, label }) => [partId, label]));
  const pieces = new Map(project.pieces.map((part) => [part.id, part]));
  const rows = plans.map((plan) => {
    const sill = pieces.get(plan.members.sill);
    const title = `${labels.get(plan.members.sill) ?? "Missing part"} · ${sill?.name ?? "Rough sill"}`;
    const steps = Object.values(plan.members).map((id) => project.steps.findIndex(({ id: step }) => step === pieces.get(id)?.stepId) + 1);
    try {
      const result = checkOpeningFlashing(project, plan.members, plan.measurements);
      if (result.frame.signature !== plan.signature)
        result.issues.unshift("The rough framing changed. Check the field measurements and preview again.");
      return { plan, title, step: Math.max(...steps), result, issues: result.issues };
    } catch (cause) {
      return { plan, title, step: 0, result: null, issues: [(cause as Error).message] };
    }
  });
  const groups = flexWrap.widths.flatMap((width) => {
    const runs = rows.flatMap(({ plan, title, step, result, issues }) =>
      result && !issues.length && plan.measurements.tapeWidth === width
        ? [{ title, step, length: result.length }] : []);
    return runs.length ? [{ width, rolls: packRuns(runs, flexWrap.rollLength).bins }] : [];
  });
  const tapeGroups = windowFlashingTape.products.flatMap((product) => {
    const runs = rows.flatMap(({ plan, title, result, issues }) =>
      !issues.length && plan.measurements.jambHead?.tapeWidth === product.width && result?.jambHead
        ? result.jambHead.cuts.map(({ edge, length }) => ({ title: `${title} · ${edge}`, length })) : []);
    if (!runs.length) return [];
    const { bins: rolls } = packRuns(runs, windowFlashingTape.rollLength);
    return [{ product, rolls, boxes: purchaseCount(rolls.length, windowFlashingTape.rollsPerBox).quantity }];
  });
  const airSealBatches = openingSealMaterials.flatMap((material) => {
    const batches = new Map<string, { label: string; use: number }>();
    for (const { plan, result, issues } of rows) {
      if (issues.length || result?.airSeal?.material.id !== material.id) continue;
      const label = plan.measurements.airSeal?.batch ?? "Same work session";
      const key = label.toLowerCase();
      const past = batches.get(key);
      batches.set(key, { label: past?.label ?? label, use: (past?.use ?? 0) + result.airSeal.use });
    }
    return [...batches.values()].map(({ label, use }) => ({
      material, label, use, units: Math.max(1, Math.ceil(use - 1e-9)),
    }));
  });
  return { rows, groups, tapeGroups, airSealBatches };
}

export function openingFlashingRollLines({ groups, tapeGroups }: ReturnType<typeof reviewOpeningFlashings>) {
  const rollLine = ({ runs, left }: { runs: { title: string; length: number }[]; left: number }) =>
    `${runs.map(({ title, length }) => `Cut ${formatStockLength(length)} for ${title}`).join(" / ")} · ${left ? `Keep ${formatStockLength(left)} for matching cuts.` : "Full roll used."}`;
  return [
    ...groups.flatMap(({ width, rolls }) => rolls.map((roll, i) =>
      `${width} in FlexWrap · Roll ${i + 1} · ${rollLine(roll)}`)),
    ...tapeGroups.flatMap(({ product, rolls, boxes }) => [
      ...rolls.map((roll, i) => `${product.width} in DuPont Flashing Tape · Roll ${i + 1} · ${rollLine(roll)}`),
      `Home Depot ${product.model} · ${boxes} ${boxes === 1 ? "box" : "boxes"} of four 75 ft rolls · ${boxes * windowFlashingTape.rollsPerBox - rolls.length} unopened rolls left if purchased new.`,
    ]),
  ];
}

export function openingAirSealBatchLines({ airSealBatches }: ReturnType<typeof reviewOpeningFlashings>) {
  return airSealBatches.map(({ material, label, use, units }) => {
    const remainder = ((units - use) * 100).toFixed(1);
    const keep = material.id === openingFoam.id
      ? "If saving the opened can, follow the Smart Dispenser instructions for reuse within 30 days."
      : "Reseal the cartridge following the label if carrying it to another compatible joint.";
    return `${label} · ${units} ${material.unit}${units === 1 ? "" : "s"} of ${material.name} · Estimated ${remainder}% of one ${material.unit} left. ${keep}`;
  });
}

export function openingAirSealRodRuns(review: ReturnType<typeof reviewOpeningFlashings>) {
  return review.rows.flatMap(({ title, result, issues }) =>
    result?.airSeal && !issues.length ? result.airSeal.edges.flatMap(({ edge, rod, length }) => rod
      ? [{ productId: rod.id, title: `${title} · interior ${edge.toLowerCase()}`, length, start: 0, end: length }] : []) : []);
}

export function openingFlashingGuideLines(review: ReturnType<typeof reviewOpeningFlashings>) {
  return [
    ...review.rows.map(({ plan, title, step, result, issues }) => {
      if (issues.length || !result) return `${title} · Review required. ${issues.join(" ")}`;
      const measured = plan.measurements;
      const setting = `before setting the ${measured.unit}`;
      return [title, step ? `After framing in step ${step}, ${setting}` : setting,
        `Cut ${formatStockLength(result.length)} from ${measured.tapeWidth} in FlexWrap for the ${formatStockLength(result.frame.width)} opening. Turn ${formatPreciseInches(measured.jambReturn)} up each jamb and lap ${formatPreciseInches(measured.faceLap)} over the exterior drainage plane.`,
        measured.pan.kind === "back-dam"
          ? `Verify the measured ${formatPreciseInches(measured.pan.rise)} back dam on the interior side.`
          : "Verify the sill slopes toward the exterior.",
        "Apply compatible sealant at the head and jambs before setting the unit.",
        openingDrainageNote(measured),
        ...(result.jambHead ? [
          `After setting the window, cut ${result.jambHead.cuts.map(({ edge, length }) => `${edge.toLowerCase()} ${formatStockLength(length)}`).join(", ")} from ${measured.jambHead!.tapeWidth} in DuPont Flashing Tape.`,
          "Lap the jambs over the sill pan and onto the wall wrap below. Apply the head across both jamb strips and onto the exposed backing.",
          "Fold down the wall-wrap flap and seal its horizontal and diagonal seams. Check the flap trim and drip cap against the installation instructions.",
        ] : []),
        "After setting the unit, air-seal its entire interior perimeter before installing trim.",
        ...(result.airSeal ? [
          openingAirSealSummary(result.airSeal),
          ...result.airSeal.edges.map(openingAirSealEdgeLine),
          ...(result.airSeal.material.id === openingFoam.id
            ? ["Follow the foam label for ventilation and protection. Use the included dispenser and leave space for expansion."]
            : ["Dry-fit the closed-cell rod with a blunt tool. Use a cartridge gun and tool the sealant against the two joint faces."]),
        ] : []),
      ].join(" · ");
    }),
    ...openingFlashingRollLines(review),
    ...openingAirSealBatchLines(review),
  ];
}

export function reviewGeneratedWindowWalls(project: Project) {
  return project.sections.filter(({ generator }) => generator?.windowOpening).map((section) => {
    const planned = section.generator!.windowOpening!;
    const members = generatedWindowMembers(project, section);
    if (!members) return { section, members, detail: "Restore the actual sill, head and both jack studs before checking the rough dimensions.", ready: false };
    try {
      const frame = roughOpeningFrame(project, members);
      const middle = frame.at((frame.x0 + frame.x1) / 2, frame.y0, 0);
      const [offset, sill] = rotate(plus(middle, scale(section.origin, -1)), inverseRotation(section.rotation)).map(clean);
      const ready = Math.abs(frame.width - planned.width) <= epsilon &&
        Math.abs(frame.height - planned.height) <= epsilon && Math.abs(sill - planned.sill) <= epsilon &&
        Math.abs(offset - (planned.offset ?? 0)) <= epsilon;
      const detail = `Modeled opening ${formatPreciseInches(frame.width)} wide × ${formatPreciseInches(frame.height)} high, sill ${formatPreciseInches(sill)} above wall base.`;
      return { section, members, detail: ready ? detail : `${detail} Recheck the edited framing against the saved rough dimensions.`, ready };
    } catch (issue) {
      return { section, members, detail: (issue as Error).message, ready: false };
    }
  });
}
