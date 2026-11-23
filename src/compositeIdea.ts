import { bounds } from "./engine";
import { applyNewIdea } from "./ideaBindings";
import { appendIdeaPlan, mentionedFamily, namedMeasurement, normalizeIdeaText } from "./ideaEdits";
import { blank, type V3 } from "./model";
import { ideaPlanSchema, type IdeaPlan, type PlannerRequest } from "./planSchema";

const maxComponents = 4;
const defaultGap = 2;
const margin = 0.001;
const buildLead = /^(?:please\s+)?(?:build|create|make|design|add)\s+/i;
const separators = /(?:[.;!?]\s+|[\n\r;]+\s*|,\s+(?:and\s+)?|\s+(?:and\s+(?:then\s+)?|then\s+))(?=(?:please\s+)?(?:build|create|make|design|add|a|an|another)\b)/gi;
const feature = /^(?:(?:an?|the|some|another)\s+)?(?:(?:\d+|one|two|three|four)\s+)?(?:(?:opening|lift[- ]up|closet|door|seat|soft[- ]close)\s+)*(?:lids?|handles?|back(?:s|rests)?|drawers?|doors?|hinges?|screws?|brackets?|fasteners?|storage|a return)\b/i;
const direction = /\b(?:to\s+(?:(its|their)\s+(left|right)|the\s+(left|right)\s+of)|(?:on|at)\s+(its|their)\s+(left|right)|in front of|behind|next to|beside)\b/;
type Side = "right" | "left" | "front" | "back";
type Layout = { side?: Side; target?: string; gap: number; issue?: string };
type Component = { text: string; prompt: string; layout?: Layout };
type Box = { min: V3; max: V3 };
type Placed = { box: Box; name: string; family?: ReturnType<typeof mentionedFamily> };
type Compound = { components: Component[]; revisesFirst: boolean; limit?: string };

function separateItem(clause: string) {
  const object = clause.replace(buildLead, "").trim();
  if (feature.test(object) ||
      /^(?:please\s+)?make\s+(?:it|them|the|this|that|existing|current)\b/i.test(clause.trim()) ||
      /^make\s+.+\s+backless$/i.test(clause.trim().replace(/[.!?]+$/, "")) ||
      /^(?:the|existing|current)\s+(?:seats?|lids?)\s+(?:open|lift|hinge)\b/i.test(object) ||
      /\b(?:as part of|built into|inside|within) (?:the |this |my |an? )?/i.test(object)) return false;
  const head = object.split(/\s+(?:with|for|to|within|inside|into|on top of|next to|beside|behind)\b/i)[0];
  // A measurement clause can mention a seat, bench or shelf without asking for a second item.
  if (/\b(?:height|width|depth|length|thickness|clearance|spacing|gap)\s*$/i.test(head.split(/\s+(?:of|is|at)\s+|[,;:]/i)[0]))
    return false;
  if (/\bshel(?:f|ves)\b/i.test(head) && /\b(?:inside|within|into|to (?:the|this|my))\b/i.test(object) && !direction.test(object.toLowerCase()))
    return false;
  return !!mentionedFamily(head);
}

function component(text: string, first: boolean): Component {
  const clause = text.trim().replace(/[.!?;]+$/, "");
  if (first) return { text: clause, prompt: clause };
  const normalized = normalizeIdeaText(clause);
  const location = direction.exec(normalized);
  const match = location?.[0] ?? "";
  const side = (location?.[2] ?? location?.[3] ?? location?.[5] ??
    (match === "behind" ? "back" : match === "in front of" ? "front" : undefined)) as Side | undefined;
  const before = normalized.slice(0, location?.index ?? normalized.length);
  const tail = location ? normalized.slice(location.index + match.length) : "";
  const target = tail.split(/[,.;]|\s+(?:with|leave|leaving|allow|keeping|by|and)\b/)[0].trim().replace(/^(?:the|a|an)\s+/, "");
  const targetName = /^(?:it|them|that|this|one)\b/.test(target) ? undefined : target || undefined;
  try {
    const by = /^\s*by\s+(.+)$/.exec(tail)?.[1];
    const fact = namedMeasurement(by ? `gap of ${by}` : location ? tail : normalized, "gap|spacing|clearance|away");
    const exact = fact?.inches;
    const measurementIssue = fact && (exact == null || exact < 0 || exact > 240)
      ? "Specify a gap from 0 to 240 inches, with units." : undefined;
    const gapTail = !location && fact
      ? /,?\s+(?:leav(?:e|ing)|with)\s+(?:an?\s+)?[^,.;]*\b(?:gap|spacing)\b[^,.;]*$/.exec(before)
      : null;
    const design = (gapTail ? before.slice(0, gapTail.index) : before).replace(/[,;\s]+$/, "");
    return {
      text: clause,
      prompt: design,
      layout: { side, target: targetName, gap: exact ?? defaultGap, issue: measurementIssue },
    };
  } catch (cause) {
    return { text: clause, prompt: before.trim(), layout: {
      side, target: targetName, gap: defaultGap,
      issue: cause instanceof Error ? cause.message : "Confirm the gap with inches or feet.",
    } };
  }
}

export function compoundIdeaRequest(request: PlannerRequest): Compound | null {
  const clauses = request.prompt.split(separators);
  if (clauses.length < 2) return null;
  const entries: string[] = [clauses[0]];
  for (const clause of clauses.slice(1)) {
    if (separateItem(clause)) entries.push(clause);
    else entries[entries.length - 1] += `. ${clause}`;
  }
  if (entries.length < 2) return null;
  const revisesFirst = !!request.previousPlan && !/^(?:please\s+)?(?:add |build (?:an?|another) |create (?:an?|another) )/i.test(entries[0]);
  if (!revisesFirst && !separateItem(entries[0])) return null;
  const keepPreviousPose = !!request.previousPlan;
  return {
    components: entries.slice(0, maxComponents).map((value, index) => component(value, index === 0 && (!keepPreviousPose || revisesFirst))),
    revisesFirst,
    ...(entries.length > maxComponents && {
      limit: `Add the remaining ${entries.length - maxComponents} item(s) in a follow-up. This review covers the first ${maxComponents} requests.`,
    }),
  };
}

export function componentRequest(request: PlannerRequest, compound: Compound, index: number): PlannerRequest {
  return {
    prompt: compound.components[index].prompt,
    workZone: request.workZone,
    ...(compound.revisesFirst && index === 0 && { previousPlan: request.previousPlan, existingSections: request.existingSections }),
  };
}

function emptyPlan(): IdeaPlan {
  return { title: "Project layout", summary: "Review the requested sections.",
    modules: [], structures: [], assumptions: [], questions: [], suggestions: [] };
}
function hasParts(plan: IdeaPlan) {
  return !!(plan.modules.length || plan.structures.length);
}
function pending(plan: IdeaPlan, request: string, question: string): IdeaPlan {
  const current = plan.pendingPlacement ?? [];
  return { ...plan, pendingPlacement: [...current, { request, question }].slice(0, 24) };
}
function mergeBoxes(boxes: Box[]): Box {
  return {
    min: [0, 1, 2].map((axis) => Math.min(...boxes.map(({ min }) => min[axis]))) as V3,
    max: [0, 1, 2].map((axis) => Math.max(...boxes.map(({ max }) => max[axis]))) as V3,
  };
}
function planBox(plan: IdeaPlan): Box {
  return mergeBoxes(applyNewIdea(blank(), { ...plan, pendingPlacement: undefined }).pieces
    .filter(({ offcut }) => !offcut).map(bounds));
}
function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function shiftBox(box: Box, offset: V3): Box {
  return { min: add(box.min, offset), max: add(box.max, offset) };
}
function shiftPlan(plan: IdeaPlan, offset: V3): IdeaPlan {
  if (offset.every((n) => Math.abs(n) < margin)) return plan;
  return {
    ...plan,
    modules: plan.modules.map((module) => ({ ...module, position: add(module.position, offset) })),
    structures: plan.structures.map((structure) => ({
      ...structure, parameters: { ...structure.parameters, origin: add(structure.parameters.origin, offset) },
    }) as typeof structure),
  };
}
function overlaps(a: Box, b: Box) {
  return a.min.every((min, axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(min, b.min[axis]) > margin);
}
function roomRange(box: Box, zone: PlannerRequest["workZone"]): [V3, V3] {
  if (!zone) return [[-1200, 0, -1200], [1200, 0, 1200]];
  return [
    [-zone.width / 2 - box.min[0], 0, -zone.depth / 2 - box.min[2]],
    [zone.width / 2 - box.max[0], 0, zone.depth / 2 - box.max[2]],
  ];
}
function findRoomShift(boxes: Box[], request: PlannerRequest, fixed: boolean): V3 | undefined {
  if (!boxes.length) return [0, 0, 0];
  const box = mergeBoxes(boxes), zone = request.workZone;
  if (zone && (box.min[1] < -margin || box.max[1] > zone.height + margin)) return;
  const [min, max] = roomRange(box, zone);
  if (min.some((value, axis) => value > max[axis] + margin)) return;
  const occupied = request.existingSections ?? [];
  const valid = (offset: V3) =>
    offset.every((value, axis) => value >= min[axis] - margin && value <= max[axis] + margin) &&
    boxes.every((item) => !occupied.some((obstacle) => overlaps(shiftBox(item, offset), obstacle)));
  if (fixed) return valid([0, 0, 0]) ? [0, 0, 0] : undefined;
  const clamp = (value: number, axis: number) => Math.min(max[axis], Math.max(min[axis], value));
  const base: V3 = [clamp(0, 0), 0, clamp(0, 2)];
  if (valid(base)) return base;
  const choices: V3[] = [[min[0], 0, base[2]], [max[0], 0, base[2]], [base[0], 0, min[2]], [base[0], 0, max[2]]];
  for (const obstruction of occupied) {
    if (!overlaps(shiftBox(box, base), obstruction)) continue;
    choices.push(
      [clamp(obstruction.max[0] - box.min[0] + defaultGap, 0), 0, base[2]],
      [clamp(obstruction.min[0] - box.max[0] - defaultGap, 0), 0, base[2]],
      [base[0], 0, clamp(obstruction.max[2] - box.min[2] + defaultGap, 2)],
      [base[0], 0, clamp(obstruction.min[2] - box.max[2] - defaultGap, 2)],
    );
  }
  return choices.sort((a, b) => Math.hypot(...a) - Math.hypot(...b)).find(valid);
}

function beside(box: Box, anchor: Box, side: Side, gap: number): V3 {
  const axis = side === "left" || side === "right" ? 0 : 2;
  const along = axis === 0 ? 2 : 0;
  const positive = side === "right" || side === "front";
  const offset: V3 = [0, 0, 0];
  offset[axis] = positive ? anchor.max[axis] - box.min[axis] + gap : anchor.min[axis] - box.max[axis] - gap;
  offset[along] = anchor.min[along] - box.min[along];
  return offset;
}

export function assembleCompoundIdea(request: PlannerRequest, compound: Compound, plans: IdeaPlan[]): IdeaPlan {
  let combined = request.previousPlan ?? emptyPlan();
  const retained = hasParts(combined) && !compound.revisesFirst;
  const groups: Placed[] = retained ? [{
    name: combined.title, box: planBox(combined),
    family: combined.modules.length && combined.structures.length ? undefined : mentionedFamily(combined.title),
  }] : [];
  const notes: string[] = [];
  for (const [index, clause] of compound.components.entries()) {
    const addition = plans[index];
    const text = normalizeIdeaText(clause.prompt).replace(/\b(?:no|without)\s+(?:any\s+)?(?:drawers?|doors?)\b/g, "");
    if (!(compound.revisesFirst && index === 0) && mentionedFamily(text) === "cabinet" &&
      /\b(?:drawer|drawers|hinged doors?|cabinet doors?|doors? that open)\b/.test(text)) {
      combined = pending(combined, clause.text,
        "Use the dedicated drawer or cabinet-door planner for this moving cabinet assembly. This preview retains the other requested pieces.");
      continue;
    }
    if (!hasParts(addition)) {
      combined = pending(combined, clause.text, addition.questions[0] ?? "This item needs more information before it can be added.");
      continue;
    }
    if (compound.revisesFirst && index === 0) {
      combined = addition;
      groups.push({ name: addition.title, family: mentionedFamily(clause.prompt), box: planBox(addition) });
      continue;
    }
    const box = planBox(addition);
    const layout = clause.layout;
    let offset: V3 = [0, 0, 0], issue = layout?.issue;
    if (layout && groups.length && !issue) {
      const matches = layout.target ? groups.filter((group) =>
        group.name.toLowerCase() === layout.target || group.family && group.family === mentionedFamily(layout.target!)) : [];
      const occupied = layout.target ? request.existingSections?.filter(({ name }) =>
        normalizeIdeaText(name) === layout.target) ?? [] : [];
      const explicit = [...matches.map(({ box }) => box), ...occupied];
      const anchor = layout.target ? explicit.length === 1 ? explicit[0] : undefined : groups.at(-1)?.box;
      if (!anchor) {
        issue = "Name one preceding item or an exact existing section for this placement.";
      } else {
        const sides = layout.side ? [layout.side] : ["right", "left", "front", "back"] as const;
        const options = sides.map((side) => ({ side, offset: beside(box, anchor, side, layout.gap) }));
        const collisionFree = options.filter(({ offset }) => !groups.some(({ box: prior }) => overlaps(prior, shiftBox(box, offset))));
        const fitting = collisionFree.find(({ offset }) => findRoomShift(
          [...groups.map(({ box }) => box), shiftBox(box, offset)], request, !!request.previousPlan || !!occupied.length));
        const choice = fitting ?? collisionFree[0] ?? options[0];
        offset = choice.offset;
        if (collisionFree.length === 0) issue = "That placement overlaps another proposed item. Move the items or give another side.";
        else notes.push(`Placed ${addition.title} ${choice.side === "front" ? "in front" : choice.side === "back" ? "behind" : `to the ${choice.side}`} with a ${Number(layout.gap.toFixed(5))} in gap.`);
      }
    } else if (layout?.target || layout?.side) {
      issue ??= "Provide the existing section or first item that this placement refers to.";
    }
    const shifted = { ...shiftPlan(addition, offset) };
    const names = new Set(combined.modules.map(({ name }) => name.toLowerCase()));
    shifted.modules = shifted.modules.map((module) => {
      let name = module.name, suffix = 2;
      while (names.has(name.toLowerCase())) name = `${module.name.slice(0, 70)} ${suffix++}`;
      names.add(name.toLowerCase());
      return { ...module, name };
    });
    const joined = hasParts(combined) ? appendIdeaPlan(combined, shifted) : { ...shifted,
      pendingPlacement: combined.pendingPlacement };
    if (hasParts(combined) && joined.modules.length === combined.modules.length && joined.structures.length === combined.structures.length) {
      combined = pending(combined, clause.text, joined.questions[0] ?? "This item exceeds the proposal limits.");
      continue;
    }
    combined = joined;
    if (issue) combined = pending(combined, clause.text, issue);
    for (const row of addition.pendingPlacement ?? [])
      combined = pending(combined, row.request, row.question);
    groups.push({ name: addition.title, family: mentionedFamily(clause.prompt), box: shiftBox(box, offset) });
  }
  if (compound.limit) combined = pending(combined, request.prompt, compound.limit);
  const keepPose = !!request.previousPlan || compound.components.some(({ layout }) =>
    layout?.target && request.existingSections?.some(({ name }) => normalizeIdeaText(name) === layout.target));
  const offset = findRoomShift(groups.map(({ box }) => box), request, keepPose);
  if (!offset && groups.length) combined = pending(combined, request.prompt,
    "The combined layout needs more room or a different placement. The requested dimensions have been kept.");
  if (offset && !keepPose) combined = shiftPlan(combined, offset);
  return ideaPlanSchema.parse({
    ...combined,
    title: request.previousPlan?.title ?? "Combined project layout",
    summary: notes.length ? notes.join(" ").slice(0, 1000)
      : "Review the requested parts together in the workspace.",
    ...(notes.length && { placementChanges: [...new Set([...(combined.placementChanges ?? []), ...notes])].slice(0, 24) }),
  });
}
