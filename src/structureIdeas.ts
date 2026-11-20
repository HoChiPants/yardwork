import type { V3 } from "./model";
import { structureIdeaSchema, type StructureIdea } from "./recipeSchemas";
export { structureIdeaSchema, type StructureIdea } from "./recipeSchemas";
import {
  buildGreenhouse,
  buildSaunaCabin,
  buildClosetInsert,
  buildCaseworkShelves,
} from "./structures";
import type { Project } from "./model";
import type { IdeaPlan } from "./planning";
import {
  referencedFamily,
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
  const unitValue = (n: string, unit: string | undefined, extra?: string) =>
    Number(n) * (/^(in|[″"])/.test(unit ?? "") ? 1 : 12) + Number(extra ?? 0);
  const dimension = (labels: string, overall = false) =>
    namedMeasurement(
      text,
      labels,
      overall
        ? kind === "casework-shelves"
          ? /(?:door|roof|bench|seat)\s*$/
          : /(?:door|roof|tower|bench|shelf|seat)\s*$/
        : undefined,
    )?.inches ?? undefined;
  const pair = text.match(
      /(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?/,
    ),
    pairUnit = pair?.[4] ?? pair?.[2] ?? "ft";
  const clarify = (question: string) =>
    request.previousPlan
      ? retainWithQuestion(request.previousPlan, question)
      : {
          title: "Clarify the casework dimensions",
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
    ].some((labels) => namedMeasurement(text, labels)?.inches === null)
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
  for (const [key, labels] of [
    ["doorWidth", "door width"],
    ["doorHeight", "door height"],
    ["towerWidth", "tower width"],
  ]) {
    const value = dimension(labels);
    if (
      value !== undefined &&
      kind !== "casework-shelves" &&
      (key !== "towerWidth" || kind === "closet-insert")
    )
      parameters[key] = value;
  }
  const rise = dimension("roof rise|rise");
  if (kind === "greenhouse" && rise !== undefined) parameters.roofRise = rise;
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
  const structure = structureIdeaSchema.parse({
    entryId: prior?.entryId,
    kind,
    parameters,
    selections: prior?.selections ?? {},
  });
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
