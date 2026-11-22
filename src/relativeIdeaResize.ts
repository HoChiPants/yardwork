import {
  ambiguousShelfReference,
  referencedFamily,
  reflow,
  requestedRelativeResize,
  retainWithQuestion,
  straightRun,
  type RelativeResize,
} from "./ideaEdits";
import { carryPlacementQuestions } from "./placementEdits";
import {
  ideaPlanSchema,
  type IdeaPlan,
  type PlannerRequest,
} from "./planSchema";
import type { StructureIdea } from "./recipeSchemas";
import { groundUnsupportedPlan } from "./unsupportedIntent";
import { material } from "./model";
import { closetBayLayout } from "./closetBayLayout";

function structureDimension(
  structure: StructureIdea,
  { field, scope }: RelativeResize,
) {
  if (
    /\b(?:window|vent|rafter|joist|stud|trim|glazing|post)s?\b|\b(?:side|back|door|roof|bookcase) panels?\b/.test(
      scope,
    )
  )
    return null;
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
  "the of it its this overall outside inside clear finished eave whole entire thing run layout design proposal section sections module modules each every width height depth roof rise door tower back".split(
    " ",
  ),
);

function resizeIdea(previous: IdeaPlan, resize: RelativeResize): IdeaPlan {
  const { scope, field, delta } = resize;
  if (ambiguousShelfReference(scope, previous))
    return retainWithQuestion(previous, targetQuestion);
  const sectionNumber = scope.match(
    /\b(?:section|compartment|module)\s*#?\s*(\d+)\b/,
  );
  const names = previous.modules.flatMap(({ name }, i) =>
    ` ${scope} `.includes(` ${name.toLowerCase()} `) ? [i] : [],
  );
  const explicitModule =
    names[0] ?? (sectionNumber ? Number(sectionNumber[1]) - 1 : undefined);
  if (
    names.length > 1 ||
    (explicitModule !== undefined && !previous.modules[explicitModule])
  )
    return retainWithQuestion(previous, targetQuestion);
  if (
    explicitModule === undefined &&
    /\b(?:left|right|middle|first|second|third|last)\s+(?:section|seat|bench|cabinet|module)\b/.test(
      scope,
    )
  )
    return retainWithQuestion(previous, targetQuestion);

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
      parameters[key] = current + delta;
      const problem = closetBayLayout(p, t).problem;
      if (problem) return retainWithQuestion(previous, problem);
      const rod = structure.selections.closetRod?.materialId;
      const radius = rod ? Math.min(...material(rod).size) / 2 : 0;
      if (p.rodHeight !== undefined && p.rodHeight + radius >= p.height - t)
        return retainWithQuestion(previous, "Set the rod lower so it clears the inside face of the top panel.");
    } else {
      if (typeof current !== "number") return retainWithQuestion(previous, dimensionQuestion);
      parameters[key] = current + delta;
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
    const back = /\bback\b/.test(scope);
    if (
      back &&
      (field !== "height" ||
        parts.some((part) => part.kind !== "bench" || !part.backHeight))
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
          "Select a straight run or a specific section before resizing its width.",
        );
      const total = parts.reduce((sum, part) => sum + part.width, 0);
      const each = /\b(?:each|every)\b/.test(scope);
      for (const part of parts)
        part.width += each ? delta : delta * (part.width / total);
      reflow(parts, run).forEach(
        (part, i) => (next.modules[modules[i]] = part),
      );
    } else {
      const key = back ? "backHeight" : field;
      for (const part of parts) part[key] += delta;
      if (field === "width" && explicitModule !== undefined) {
        const siblings = previous.modules.flatMap(({ kind }, i) =>
          kind === previous.modules[explicitModule].kind ? [i] : [],
        );
        const run = straightRun(siblings.map((i) => previous.modules[i]));
        if (run)
          reflow(
            siblings.map((i) => next.modules[i]),
            run,
          ).forEach((part, i) => (next.modules[siblings[i]] = part));
      }
    }
  }
  next.summary = "Resized the selected design from its current dimensions.";
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

/** Shared by the hosted workshop and self-hosted routes, even with an AI provider configured. */
export function localRelativeResizePlan(
  request: PlannerRequest,
): IdeaPlan | null {
  const resize = requestedRelativeResize(request.prompt);
  if (!resize) return null;
  const boundary = groundUnsupportedPlan(request);
  if (boundary) return ideaPlanSchema.parse(boundary);
  const previous = request.previousPlan;
  const hasDesign =
    previous && (previous.modules.length || previous.structures.length);
  const plan = hasDesign
    ? "question" in resize
      ? retainWithQuestion(previous, resize.question)
      : resizeIdea(previous, resize)
    : ideaPlanSchema.parse({
        title: "Choose a design to resize",
        summary: "A relative change needs an existing design.",
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
