import {
  ambiguousShelfReference,
  referencedFamily,
  reflow,
  requestedDimensionEdits,
  requestedModule,
  retainWithQuestion,
  straightRun,
  straightRunWidth,
  type DimensionEdit,
  type ResizeEdge,
} from "./ideaEdits";
import { carryPlacementQuestions } from "./placementEdits";
import {
  ideaPlanSchema,
  type IdeaPlan,
  type PlannerRequest,
} from "./planSchema";
import type { StructureIdea } from "./recipeSchemas";
import { groundUnsupportedPlan } from "./unsupportedIntent";
import { material, type V3 } from "./model";
import type { PlanModule } from "./planSchema";
import { closetBayLayout } from "./closetBayLayout";

function structureDimension(
  structure: StructureIdea,
  { field, scope }: DimensionEdit,
) {
  if (
    /\b(?:window|vent|rafter|joist|stud|trim|glazing|post)s?\b|\b(?:side|back|door|roof|bookcase) panels?\b/.test(
      scope,
    )
  )
    return null;
  if (/\bseat\b/.test(scope) && !(structure.kind === "sauna" && /\bbench\b/.test(scope))) return null;
  if (structure.kind === "closet-insert") {
    const bay = /\b(left|right) (?:hanging |rod )?bay\b/.exec(scope);
    if (bay) return field === "width" ? bay[1] === "left" ? "leftBayWidth" : "rightBayWidth" : null;
    if (/\brod(?: (?:center|centerline))?\b/.test(scope))
      return field === "height" ? "rodHeight" : null;
  }
  if (field === "roof rise")
    return structure.kind === "greenhouse" ? "roofRise" : null;
  if (/\bdoor\b/.test(scope)) {
    if (structure.kind !== "greenhouse" && structure.kind !== "sauna")
      return null;
    return field === "width"
      ? "doorWidth"
      : field === "height"
        ? "doorHeight"
        : null;
  }
  if (
    /\b(?:roof|ridge|shelf|rod)\b/.test(scope) &&
    !/\b(?:shelves|shelf)\s+(?:unit|module)\b/.test(scope)
  )
    return null;
  if (structure.kind === "sauna") {
    if (/\bbench\b/.test(scope))
      return {
        width: "benchWidth",
        depth: "benchDepth",
        height: "benchHeight",
      }[field];
    return { width: "clearWidth", depth: "clearDepth", height: "clearHeight" }[
      field
    ];
  }
  if (/\btower\b/.test(scope))
    return structure.kind === "closet-insert" && field === "width"
      ? "towerWidth"
      : null;
  if (structure.kind === "greenhouse" && field === "height")
    return "eaveHeight";
  return field;
}

const targetQuestion =
  "Which existing design should change? Select it or name one section or whole design.";
const dimensionQuestion =
  "Name a supported dimension of the selected design, such as overall width, seat height, or greenhouse roof rise.";
const genericTargetWords = new Set(
  "the of it its this overall total outside inside clear finished eave whole entire thing run layout design proposal section sections module modules each every width height depth roof rise door tower back backrest".split(
    " ",
  ),
);

function along(position: V3, axis: V3, offset: number): V3 {
  return position.map((value, index) => value + axis[index] * offset) as V3;
}

function reflowFromEdge(parts: PlanModule[], original: PlanModule[], run: NonNullable<ReturnType<typeof straightRun>>, fixedEdge?: ResizeEdge) {
  if (!fixedEdge) return reflow(parts, run);
  const direction = fixedEdge === "left" ? 1 : -1;
  const shift = direction * (straightRunWidth(parts, run) - straightRunWidth(original, run)) / 2;
  return reflow(parts, { ...run, center: along(run.center, run.axis, shift) });
}

function holdModuleEdge(part: PlanModule, original: PlanModule, field: "width" | "depth", fixedEdge: ResizeEdge) {
  const yaw = part.yaw * Math.PI / 180;
  const axis: V3 = field === "width" ? [Math.cos(yaw), 0, -Math.sin(yaw)] : [Math.sin(yaw), 0, Math.cos(yaw)];
  const direction = fixedEdge === "left" || fixedEdge === "back" || fixedEdge === "rear" ? 1 : -1;
  part.position = along(original.position, axis, direction * (part[field] - original[field]) / 2);
}

function resizeIdea(previous: IdeaPlan, resize: DimensionEdit): IdeaPlan {
  const { scope, field, fixedEdge } = resize;
  const newSize = (current: number) => "target" in resize ? resize.target : current + resize.delta;
  if (ambiguousShelfReference(scope, previous))
    return retainWithQuestion(previous, targetQuestion);
  const explicitModule = requestedModule(previous, scope);
  if (explicitModule === "ambiguous")
    return retainWithQuestion(previous, `${targetQuestion} Left, right and middle refer to a single straight run.`);

  const closetScope = /\b(?:left|right) (?:hanging |rod )?bay\b|\brod (?:center |centerline )?height\b|\b(?:the |hanging )rods?\b/.test(scope);
  const family = referencedFamily(scope, previous) ??
    (closetScope && previous.structures.some(({ kind }) => kind === "closet-insert") ? "closet-insert" : null);
  if (
    explicitModule !== undefined &&
    family &&
    previous.modules[explicitModule].kind !== family
  )
    return retainWithQuestion(previous, targetQuestion);
  const generic =
    !scope || scope.split(/\s+/).every((word) => genericTargetWords.has(word));
  if (explicitModule === undefined && !family && !generic)
    return retainWithQuestion(previous, targetQuestion);
  const modules = previous.modules.flatMap(({ kind }, i) =>
    (
      explicitModule !== undefined
        ? explicitModule === i
        : !family || kind === family
    )
      ? [i]
      : [],
  );
  const structures = previous.structures.flatMap(({ kind }, i) =>
    explicitModule === undefined && (!family || family === kind) ? [i] : [],
  );
  if (
    structures.length > 1 ||
    (structures.length && modules.length) ||
    (!structures.length && !modules.length) ||
    new Set(modules.map((i) => previous.modules[i].kind)).size > 1
  )
    return retainWithQuestion(previous, targetQuestion);

  const next = structuredClone(previous);
  if (structures.length) {
    if (fixedEdge)
      return retainWithQuestion(previous, "Fixed-edge resizing is available for furniture. For this structure, set the size and review its placement before applying.");
    const structure = next.structures[structures[0]],
      key = structureDimension(structure, resize);
    if (!key) return retainWithQuestion(previous, dimensionQuestion);
    const parameters = structure.parameters as unknown as Record<
      string,
      unknown
    >;
    let current = parameters[key];
    if (structure.kind === "closet-insert") {
      const p = structure.parameters;
      const t = Math.min(...material(structure.selections.caseworkPanels?.materialId ?? "plywood").size);
      const bays = closetBayLayout(p, t);
      if (key === "leftBayWidth" || key === "rightBayWidth") {
        current = key === "leftBayWidth" ? bays.left : bays.right;
        delete p[key === "leftBayWidth" ? "rightBayWidth" : "leftBayWidth"];
      }
      if (key === "rodHeight") current = p.rodHeight ?? Math.min(64, p.height - 6);
      if (typeof current !== "number") return retainWithQuestion(previous, dimensionQuestion);
      parameters[key] = newSize(current);
      const problem = closetBayLayout(p, t).problem;
      if (problem) return retainWithQuestion(previous, problem);
      const rod = structure.selections.closetRod?.materialId;
      const radius = rod ? Math.min(...material(rod).size) / 2 : 0;
      if (p.rodHeight !== undefined && p.rodHeight + radius >= p.height - t)
        return retainWithQuestion(previous, "Set the rod lower so it clears the inside face of the top panel.");
    } else {
      if (typeof current !== "number") return retainWithQuestion(previous, dimensionQuestion);
      parameters[key] = newSize(current);
    }
  } else {
    if (
      field === "roof rise" ||
      /\b(?:drawer|door|lid|leg|roof|rod|tower|return|top|panel)s?\b/.test(
        scope,
      )
    )
      return retainWithQuestion(previous, dimensionQuestion);
    const parts = modules.map((i) => next.modules[i]);
    const back = /\b(?:back|backrest)\b/.test(scope);
    if (
      back &&
      (field !== "height" ||
        parts.some((part) => part.kind !== "bench" || ("delta" in resize && !part.backHeight)))
    )
      return retainWithQuestion(
        previous,
        "The selected design needs an existing seat back before changing its height.",
      );
    if (field === "width" && modules.length > 1) {
      const run = straightRun(parts);
      if (!run)
        return retainWithQuestion(
          previous,
          "Which straight run should change: the back run or the return? Select a straight run or a specific section before resizing its width.",
        );
      const originals = modules.map((i) => previous.modules[i]);
      const memberWidth = originals.reduce((sum, part) => sum + part.width, 0);
      const total = straightRunWidth(originals, run);
      const usable = newSize(total) - (total - memberWidth);
      const each = /\b(?:each|every)\b/.test(scope);
      for (const part of parts)
        part.width = each ? newSize(part.width) : usable * (part.width / memberWidth);
      reflowFromEdge(parts, originals, run, fixedEdge).forEach(
        (part, i) => (next.modules[modules[i]] = part),
      );
    } else {
      const key = back ? "backHeight" : field;
      for (const part of parts) part[key] = newSize(part[key]);
      if (field === "width" && explicitModule !== undefined) {
        const siblings = previous.modules.flatMap(({ kind }, i) =>
          kind === previous.modules[explicitModule].kind ? [i] : [],
        );
        const originals = siblings.map((i) => previous.modules[i]);
        const run = straightRun(originals);
        if (run)
          reflowFromEdge(siblings.map((i) => next.modules[i]), originals, run, fixedEdge)
            .forEach((part, i) => (next.modules[siblings[i]] = part));
        else if (fixedEdge) holdModuleEdge(parts[0], previous.modules[explicitModule], field, fixedEdge);
      } else if (fixedEdge && (field === "width" || field === "depth")) {
        for (const index of modules)
          holdModuleEdge(next.modules[index], previous.modules[index], field, fixedEdge);
      }
    }
  }
  next.summary = fixedEdge
    ? `Resized the selected furniture and held its local ${fixedEdge} edge in place.`
    : "Resized the selected design from its current dimensions.";
  next.questions = [];
  const provisional = new RegExp(
    `^Provisional ((?:(?:finished seat|overall) )?${field}): [^;]+? in\\.\\s*`,
  );
  next.assumptions = next.assumptions.map((note) =>
    note.replace(
      provisional,
      (_, dimension) => `The starting ${dimension} was provisional. `,
    ),
  );
  const checked = ideaPlanSchema.safeParse(next);
  return checked.success
    ? checked.data
    : retainWithQuestion(
        previous,
        `The requested change falls outside the design's supported dimensions. ${checked.error.issues[0].message}`,
      );
}

export function applyResizeRequests(previous: IdeaPlan, edits: readonly DimensionEdit[]): IdeaPlan {
  let candidate = previous;
  for (const edit of edits) {
    candidate = resizeIdea(candidate, edit);
    if (candidate.questions.length) return retainWithQuestion(previous, candidate.questions[0]);
  }
  return edits.length === 1 ? candidate : {
    ...candidate,
    summary: edits.some(({ fixedEdge }) => fixedEdge)
      ? "Resized the requested dimensions together and held the selected local edges in place."
      : "Resized the requested dimensions together using the current design.",
  };
}

/** Shared by the hosted workshop and self-hosted routes, even with an AI provider configured. */
export function localDimensionEditPlan(
  request: PlannerRequest,
): IdeaPlan | null {
  const resize = requestedDimensionEdits(request.prompt);
  if (!resize) return null;
  const boundary = groundUnsupportedPlan(request);
  if (boundary) return ideaPlanSchema.parse(boundary);
  const previous = request.previousPlan;
  const hasDesign =
    previous && (previous.modules.length || previous.structures.length);
  const plan = hasDesign
    ? "question" in resize
      ? retainWithQuestion(previous, resize.question)
      : applyResizeRequests(previous, resize)
    : ideaPlanSchema.parse({
        title: "Choose a design to resize",
        summary: "A resize needs an existing design.",
        questions: [
          "Select a saved design or give the starting dimensions before adjusting its size.",
        ],
        modules: [],
        assumptions: [],
        suggestions: [],
      });
  return ideaPlanSchema.parse(
    carryPlacementQuestions(
      groundUnsupportedPlan(request, plan) ?? plan,
      previous,
    ),
  );
}
