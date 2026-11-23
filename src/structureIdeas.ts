import type { V3 } from "./model";
import { greenhouseParamsSchema, structureIdeaSchema, type StructureIdea } from "./recipeSchemas";
export { structureIdeaSchema, type StructureIdea } from "./recipeSchemas";
import {
  buildGreenhouse,
  greenhouseStudyDoorHeight,
  buildSaunaCabin,
  buildClosetInsert,
  buildCaseworkShelves,
} from "./structures";
import { material, type Project } from "./model";
import { closetBayLayout } from "./closetBayLayout";
import type { IdeaPlan } from "./planning";
import {
  referencedFamily,
  closetMeasurements,
  doorMeasurements,
  namedMeasurement,
  normalizeIdeaText,
  requestedShelfCount,
  retainWithQuestion,
} from "./ideaEdits";
export function updateStructureParameter(
  idea: StructureIdea,
  key: string,
  value: number,
): StructureIdea {
  const next = structuredClone(idea),
    parameters = next.parameters as unknown as Record<string, unknown>;
  if (typeof parameters[key] !== "number")
    throw Error("Unknown dimensional parameter.");
  parameters[key] = value;
  if (idea.kind === "closet-insert") {
    if (key === "leftBayWidth") delete parameters.rightBayWidth;
    if (key === "rightBayWidth") delete parameters.leftBayWidth;
  }
  return next;
}

export function applyStructureIdea(project: Project, idea: StructureIdea) {
  if (idea.kind === "greenhouse")
    return buildGreenhouse(project, idea.parameters, idea.selections).project;
  if (idea.kind === "sauna")
    return buildSaunaCabin(project, idea.parameters, idea.selections).project;
  if (idea.kind === "casework-shelves")
    return buildCaseworkShelves(project, idea.parameters, idea.selections)
      .project;
  return buildClosetInsert(project, idea.parameters, idea.selections).project;
}

/** A disclosed local family parser. It interprets dimensions, never installation rules or loads. */
export function localStructureIdea(request: {
  prompt: string;
  previousPlan?: IdeaPlan;
  existingSections?: { min: number[]; max: number[] }[];
}) {
  const text = normalizeIdeaText(request.prompt),
    family = referencedFamily(text, request.previousPlan),
    namedKind =
      family &&
      ["greenhouse", "sauna", "closet-insert", "casework-shelves"].includes(
        family,
      )
        ? (family as StructureIdea["kind"])
        : null,
    matching =
      request.previousPlan?.structures.filter(
        (s) => !namedKind || s.kind === namedKind,
      ) ?? [],
    previous = matching[0];
  if (family && !namedKind) return null;
  if (!namedKind && !previous) return null;
  if (matching.length > 1)
    return {
      ...request.previousPlan!,
      summary:
        "Your proposal is retained; select which structure should change.",
      questions: [
        "Which existing structure should change? Name or select that specific structure before revising dimensions.",
      ],
    };
  const kind = namedKind ?? previous!.kind;
  const closet = kind === "closet-insert" ? closetMeasurements(text) : null;
  const opening = kind === "greenhouse" || kind === "sauna" ? doorMeasurements(text) : null;
  const envelope = closet?.envelope ?? opening?.envelope ?? text;
  const unitValue = (n: string, unit: string | undefined, extra?: string) =>
    Number(n) * (/^(in|[″"])/.test(unit ?? "") ? 1 : 12) + Number(extra ?? 0);
  const dimension = (labels: string, overall = false) =>
    namedMeasurement(
      overall ? envelope : text,
      labels,
      overall
        ? kind === "casework-shelves"
          ? /(?:door|roof|bench|seat)\s*$/
          : /(?:door|roof|tower|bench|shelf|seat)\s*$/
        : undefined,
    )?.inches ?? undefined;
  const pair = envelope.match(
      /(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?/,
    ),
    pairUnit = pair?.[4] ?? pair?.[2] ?? "ft";
  const clarify = (question: string) =>
    request.previousPlan
      ? retainWithQuestion(request.previousPlan, question)
      : {
          title: "Clarify the design dimensions",
          summary: question,
          assumptions: [],
          questions: [question],
          suggestions: [],
          modules: [],
          structures: [],
        };
  if (pair && !pair[2] && !pair[4])
    return clarify(
      "Are those measurements in inches or feet? Specify units before generating geometry.",
    );
  if (
    [
      "wide|width",
      "deep|depth|long|length",
      "high|height|tall|eave height",
    ].some((labels) => namedMeasurement(envelope, labels)?.inches === null) ||
    Object.values(closet?.facts ?? opening?.facts ?? {}).some((fact) => fact?.inches === null)
  )
    return clarify(
      "Should the measurement be in inches or feet? Existing dimensions are retained.",
    );
  const w =
      dimension("wide|width", true) ??
      (pair ? unitValue(pair[1], pair[2] ?? pairUnit) : undefined),
    d =
      dimension("deep|depth|long|length", true) ??
      (pair ? unitValue(pair[3], pairUnit) : undefined),
    h = dimension("high|height|tall|eave height", true);
  const prior = previous?.kind === kind ? previous : null;
  let parameters: Record<string, unknown> = prior
    ? structuredClone(prior.parameters)
    : kind === "greenhouse"
      ? {
          width: 72,
          depth: 96,
          eaveHeight: 84,
          roofRise: 24,
          doorWidth: 30,
          doorHeight: 68,
        }
      : kind === "sauna"
        ? {
            clearWidth: 72,
            clearDepth: 72,
            clearHeight: 84,
            doorWidth: 28,
            doorHeight: 72,
          }
        : kind === "casework-shelves"
          ? {
              width: 36,
              depth: 16,
              height: 72,
              shelfCount: 3,
              shelfClearance: 0.25,
            }
          : { width: 72, depth: 24, height: 84, towerWidth: 25, shelfCount: 4 };
  const widthKey = kind === "sauna" ? "clearWidth" : "width",
    depthKey = kind === "sauna" ? "clearDepth" : "depth",
    heightKey =
      kind === "greenhouse"
        ? "eaveHeight"
        : kind === "sauna"
          ? "clearHeight"
          : "height";
  if (w !== undefined) parameters[widthKey] = w;
  if (d !== undefined) parameters[depthKey] = d;
  if (h !== undefined) parameters[heightKey] = h;
  for (const [key, fact] of Object.entries(opening?.facts ?? {})) {
    if (fact?.inches != null) parameters[key] = fact.inches;
  }
  const rise = dimension("roof rise|rise");
  if (kind === "greenhouse" && rise !== undefined) parameters.roofRise = rise;
  let doorAssumption: string | undefined;
  if (kind === "greenhouse" && !prior && opening?.facts.doorHeight == null) {
    const dimensions = greenhouseParamsSchema.parse(parameters);
    const doorHeight = greenhouseStudyDoorHeight(dimensions);
    if (doorHeight < dimensions.doorHeight) {
      if (!greenhouseParamsSchema.shape.doorHeight.safeParse(doorHeight).success)
        return clarify("Raise the eave or reduce the roof rise so the front wall can fit a door opening.");
      parameters.doorHeight = doorHeight;
      doorAssumption = `Provisional greenhouse door opening: ${doorHeight} in high to fit below the modeled roof, header and top plate. Confirm the headroom you need.`;
    }
  }
  const shelves = requestedShelfCount(text);
  if (
    ["closet-insert", "casework-shelves"].includes(kind) &&
    shelves !== undefined
  ) {
    if (shelves < 1 || shelves > 6)
      return clarify(
        "Choose one to six adjustable shelves for this casework recipe.",
      );
    parameters.shelfCount = shelves;
  }
  if (!prior && request.existingSections?.length)
    parameters.origin = [
      Math.max(...request.existingSections.map((s) => s.max[0])) +
        Number(parameters[widthKey]) / 2 +
        12,
      0,
      0,
    ] as V3;
  if (closet) {
    const { leftBayWidth, rightBayWidth } = closet.facts;
    if (leftBayWidth && !rightBayWidth) delete parameters.rightBayWidth;
    if (rightBayWidth && !leftBayWidth) delete parameters.leftBayWidth;
    for (const [key, fact] of Object.entries(closet.facts)) {
      if (fact?.inches !== undefined && fact.inches !== null) parameters[key] = fact.inches;
    }
  }
  if (kind === "sauna") {
    for (const [key, labels] of [
      ["benchWidth", "bench width"],
      ["benchDepth", "bench depth"],
      ["benchHeight", "bench height"],
    ]) {
      const value = dimension(labels);
      if (value !== undefined) parameters[key] = value;
    }
    // Only a fresh provisional reservation is bounded to its clear room. Never shrink a previous or explicitly requested bench.
    if (!prior && parameters.benchWidth === undefined)
      parameters.benchWidth = Math.min(60, Number(parameters.clearWidth));
    if (!prior && parameters.benchDepth === undefined)
      parameters.benchDepth = Math.min(24, Number(parameters.clearDepth));
  }
  const candidate = structureIdeaSchema.safeParse({
    entryId: prior?.entryId,
    kind,
    parameters,
    selections: prior?.selections ?? {},
  });
  if (!candidate.success) {
    if (closet) return clarify("Check the cabinet size, clear bay widths and rod height against the supported measurements.");
    throw candidate.error;
  }
  const structure = candidate.data;
  if (structure.kind === "closet-insert") {
    const p = structure.parameters;
    const thickness = Math.min(...material(structure.selections.caseworkPanels?.materialId ?? "plywood").size);
    const { problem } = closetBayLayout(p, thickness);
    if (problem) return clarify(problem);
    const rod = structure.selections.closetRod?.materialId;
    const radius = rod ? Math.min(...material(rod).size) / 2 : 0;
    if (p.rodHeight !== undefined && p.rodHeight + radius >= p.height - thickness)
      return clarify("Set the rod lower so it clears the inside face of the top panel.");
  }
  if (prior && request.previousPlan) {
    const target = request.previousPlan.structures.indexOf(previous!),
      next = structuredClone(request.previousPlan);
    next.structures[target] = structure;
    next.summary =
      "Updated the requested structure measurements. Unspecified parameters, product selections, furniture and unrelated structures are retained.";
    return next;
  }
  const scope =
    kind === "greenhouse"
      ? "Wall and door framing, pitched roof and saved rafter/gable profiles. Glazing, ventilation, weather detailing and anchorage need selection/review."
      : kind === "sauna"
        ? "Exterior frame around a reserved clear interior. Heat-compatible lining, bench materials, door and heater systems need separate selection; no electrical work is generated."
        : kind === "casework-shelves"
          ? "One panel casework assembly: sides, back, top, bottom and adjustable shelves use the selected actual sheet thickness. Joinery, shelf supports, stability and anchorage need review."
          : "Separate shelf tower and hanging bays with actual panel thickness. Rods, sockets, shelf supports and anchors need selection/review.";
  return {
    title:
      kind === "greenhouse"
        ? "Greenhouse design study"
        : kind === "sauna"
          ? "Sauna design study"
          : kind === "casework-shelves"
            ? "Panel casework bookcase study"
            : "Closet insert design study",
    summary: scope,
    assumptions: [
      `${prior ? "Preserved unspecified dimensions from the previous proposal." : "Missing dimensions use provisional defaults shown below; edit them before applying."}`,
      kind === "sauna"
        ? "Dimensions are CLEAR INSIDE measurements; framing and reserved interior layers increase the outside footprint."
        : kind === "greenhouse"
          ? "Height is OUTSIDE EAVE height, with roof rise added above it. Framing and door clearances are derived from the selected stock."
          : "Width, depth and height describe the outside casework envelope.",
      ...(doorAssumption ? [doorAssumption] : []),
    ],
    questions: [
      kind === "sauna"
        ? "Which actual heater/manual, room materials, ventilation and door system will this room use?"
        : "Which exact stock products, attachments, loads and measured site constraints apply?",
    ],
    suggestions: [
      "Review the generated missing-material and installation decisions. Geometry, source identity and contact checks do not establish code compliance or structural capacity.",
    ],
    modules: [],
    structures: [structure],
  };
}
