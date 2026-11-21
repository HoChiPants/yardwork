import { blank, uid, type Project, type V3 } from "./model";
import { bounds } from "./engine";
import {
  ideaPlanSchema,
  type IdeaPlan,
  type PlanModule,
  type PlannerRequest,
} from "./planSchema";
export {
  ideaPlanSchema,
  moduleSchema,
  plannerRequestSchema,
  planningZoneSchema,
  isStock,
  type IdeaPlan,
  type PlanModule,
  type PlannerRequest,
  type PlanningZone,
} from "./planSchema";
import { applyNewIdea, candidateIdeaPreview } from "./ideaBindings";
import { recipeParts } from "./ideaGeometry";
export { recipeParts } from "./ideaGeometry";
import {
  appendIdeaPlan,
  editFurniturePlan,
  furnitureMeasurements,
  isAddition,
  referencedFamily,
  ambiguousShelfReference,
  editCaseworkShelfCount,
  mentionedFamily,
  namedMeasurement,
  normalizeIdeaText,
  retainWithQuestion,
  widthAppliesToEach,
} from "./ideaEdits";
import { localStructureIdea } from "./structureIdeas";
import { groundUnsupportedPlan } from "./unsupportedIntent";
import { carryPlacementQuestions, refinePlacement } from "./placementEdits";
import { localRelativeResizePlan } from "./relativeIdeaResize";

function placeLocalPlan(plan: IdeaPlan, request: PlannerRequest): IdeaPlan {
  if (!plan.modules.length || !request.existingSections?.length) return plan;
  const boxes = plan.modules
      .flatMap((m) => recipeParts(m, uid(), m.name))
      .map(bounds),
    min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))),
    max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))),
    occupied = request.existingSections;
  const overlaps = (offset: V3) =>
    occupied.some((b) =>
      [0, 1, 2].every(
        (i) =>
          Math.min(max[i] + offset[i], b.max[i]) -
            Math.max(min[i] + offset[i], b.min[i]) >
          0.001,
      ),
    );
  const fits = (offset: V3) =>
    !request.workZone ||
    (min[0] + offset[0] >= -request.workZone.width / 2 &&
      max[0] + offset[0] <= request.workZone.width / 2 &&
      min[2] + offset[2] >= -request.workZone.depth / 2 &&
      max[2] + offset[2] <= request.workZone.depth / 2 &&
      min[1] + offset[1] >= 0 &&
      max[1] + offset[1] <= request.workZone.height);
  if (!overlaps([0, 0, 0]) && fits([0, 0, 0])) return plan;
  const options: V3[] = [
    [Math.max(...occupied.map((b) => b.max[0])) + 2 - min[0], 0, 0],
    [Math.min(...occupied.map((b) => b.min[0])) - 2 - max[0], 0, 0],
    [0, 0, Math.max(...occupied.map((b) => b.max[2])) + 2 - min[2]],
    [0, 0, Math.min(...occupied.map((b) => b.min[2])) - 2 - max[2]],
  ];
  const offset = options.find((v) => !overlaps(v) && fits(v)) ?? options[0];
  return {
    ...plan,
    modules: plan.modules.map((m) => ({
      ...m,
      position: m.position.map((n, i) => n + offset[i]) as V3,
    })),
    assumptions: [
      ...plan.assumptions.slice(0, 11),
      "Placed beside the current occupied section bounds with a provisional 2 in layout gap; check work-zone fit and required access clearances.",
    ],
  };
}

export function localPlacementPlan(request: PlannerRequest): IdeaPlan | null {
  const proposed = refinePlacement(request, (revision) =>
    localRelativeResizePlan(revision) ?? localSupportedIdeaPlan(revision));
  if (!proposed) return null;
  return ideaPlanSchema.parse(
    carryPlacementQuestions(
      groundUnsupportedPlan(request, proposed) ?? proposed,
      request.previousPlan,
    ),
  );
}

/** Local presets are deliberately disclosed, not represented as language-model inference. */
export function localIdeaPlan(request: PlannerRequest): IdeaPlan {
  const boundary = groundUnsupportedPlan(request);
  if (boundary) return ideaPlanSchema.parse(boundary);
  const placement = localPlacementPlan(request);
  if (placement) return placement;
  const resize = localRelativeResizePlan(request);
  if (resize) return resize;
  const proposed = { ...localSupportedIdeaPlan(request) };
  delete proposed.placementChanges;
  return ideaPlanSchema.parse(
    carryPlacementQuestions(
      groundUnsupportedPlan(request, proposed) ?? proposed,
      request.previousPlan,
    ),
  );
}

function localSupportedIdeaPlan(request: PlannerRequest): IdeaPlan {
  const text = normalizeIdeaText(request.prompt),
    previous = request.previousPlan,
    family = referencedFamily(text, previous);
  const shelfAdjustment = editCaseworkShelfCount(previous, text);
  if (shelfAdjustment) return ideaPlanSchema.parse(shelfAdjustment);
  if (previous && ambiguousShelfReference(text, previous))
    return ideaPlanSchema.parse(
      retainWithQuestion(
        previous,
        "Do you mean the framed shelf module or the panel casework bookcase? Select the existing design before revising its dimensions.",
      ),
    );
  if (
    previous &&
    /\b(?:replace|instead of|turn.+into|convert.+to)\b/.test(text)
  )
    return ideaPlanSchema.parse(
      retainWithQuestion(
        previous,
        "Replacement needs an explicit selected target. Use Add for a separate item; your existing proposal is retained.",
      ),
    );
  const knownFamilies = previous
    ? new Set([
        ...previous.modules.map((m) => m.kind),
        ...previous.structures.map((s) => s.kind),
      ])
    : new Set<string>();
  const newFamily = !!previous && !!family && !knownFamilies.has(family),
    createDifferent =
      newFamily && /^\s*(?:a |an |build |create |make (?:a |an ))/.test(text);
  if (previous && (isAddition(text) || createDifferent)) {
    let occupied = request.existingSections ?? [];
    try {
      if (previous.modules.length || previous.structures.length) {
        const current = applyNewIdea(blank(), {
          ...previous,
          pendingPlacement: undefined,
        });
        occupied = [
          ...occupied,
          ...current.sections.map((section) => {
            const bs = current.pieces
              .filter((p) => section.pieceIds.includes(p.id))
              .map(bounds);
            return {
              name: section.name,
              min: [0, 1, 2].map((i) =>
                Math.min(...bs.map((b) => b.min[i])),
              ) as V3,
              max: [0, 1, 2].map((i) =>
                Math.max(...bs.map((b) => b.max[i])),
              ) as V3,
            };
          }),
        ];
      }
      const addition = localIdeaPlan({
        ...request,
        prompt:
          family === "casework-shelves" &&
          mentionedFamily(text) !== "casework-shelves"
            ? `Casework shelves. ${text}`
            : request.prompt,
        previousPlan: undefined,
        existingSections: occupied,
      });
      return ideaPlanSchema.parse(appendIdeaPlan(previous, addition));
    } catch (error) {
      return ideaPlanSchema.parse(
        retainWithQuestion(
          previous,
          error instanceof Error
            ? error.message
            : "The separate addition could not be generated; your previous proposal is retained.",
        ),
      );
    }
  }
  if (newFamily)
    return ideaPlanSchema.parse(
      retainWithQuestion(
        previous!,
        `There is no existing ${family} in this proposal. Use Add to create it, or name the existing item to revise.`,
      ),
    );
  const facts = furnitureMeasurements(text),
    specialFacts = [
      "door width",
      "door height",
      "tower width",
      "roof rise|rise",
      "return",
    ].map((labels) => namedMeasurement(text, labels));
  if (
    [...Object.values(facts), ...specialFacts].some(
      (f) => f && f.inches === null,
    )
  ) {
    const question =
      "Should the measurement be in inches or feet? Add its unit; existing dimensions are retained.";
    return ideaPlanSchema.parse(
      previous
        ? retainWithQuestion(previous, question)
        : {
            title: "Confirm the measurement units",
            summary: "Specify units before generating a dimensioned proposal.",
            assumptions: [],
            questions: [question],
            suggestions: [],
            modules: [],
            structures: [],
          },
    );
  }
  const mixedKinds = !!previous?.modules.length && !!previous.structures.length,
    furnitureTarget =
      !!previous &&
      (/\b(?:section|module|compartment)\s*#?\s*\d+\b/.test(text) ||
        previous.modules.filter((m) => text.includes(m.name.toLowerCase()))
          .length === 1);
  if (mixedKinds && !family && !furnitureTarget)
    return ideaPlanSchema.parse(
      retainWithQuestion(
        previous!,
        "Which existing furniture section or whole design should change? Select or name it; the mixed proposal is retained.",
      ),
    );
  const structure =
    mixedKinds && furnitureTarget && !family
      ? null
      : localStructureIdea({ ...request, prompt: text });
  if (structure) return ideaPlanSchema.parse(structure);
  const zone = request.workZone,
    kind: PlanModule["kind"] | undefined =
      family &&
      !["greenhouse", "sauna", "closet-insert", "casework-shelves"].includes(
        family,
      )
        ? (family as PlanModule["kind"])
        : previous?.modules[0]?.kind;
  if (!kind)
    return ideaPlanSchema.parse({
      title: "Let's shape your idea",
      summary:
        "Describe the object, its available space, and what it needs to do. Local planning presets cover banquettes, benches, workbenches, cabinets, shelves, and box frames.",
      assumptions: [],
      questions: [
        "What are you building, and what should it hold or support?",
        "What width, depth, and height are available? Set a work zone to check the layout.",
      ],
      suggestions: [
        "For example: an L-shaped kitchenette banquette, 6 ft along the back and a 4 ft return, with storage below.",
        "Connect a local AI model for broader interpretation; unsupported ideas are kept as questions rather than replaced with an unrelated wall.",
      ],
      modules: [],
    });
  const named = (labels: string) =>
    namedMeasurement(text, labels)?.inches ?? undefined;
  const pair = text.match(
    /(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|in|inches)?/,
  );
  if (pair && !pair[2] && !pair[4])
    return ideaPlanSchema.parse({
      title: "Confirm the measurement units",
      summary:
        "A dimension pair needs inches or feet before it can define stock geometry.",
      assumptions: [],
      questions: ["Are those measurements in inches or feet?"],
      suggestions: [],
      modules: [],
      structures: [],
    });
  const pairUnit = pair?.[4] ?? pair?.[2] ?? "ft";
  const pairW = pair
    ? Number(pair[1]) * (/^in/.test(pair[2] ?? pairUnit) ? 1 : 12)
    : undefined;
  const pairD = pair
    ? Number(pair[3]) * (/^in/.test(pairUnit) ? 1 : 12)
    : undefined;
  const lShape =
    kind === "bench" && /\b(l[ -]shap(?:e|ed)|corner|return)\b/.test(text);
  const suppliedW = named("wide|width|long|length|along the back") ?? pairW;
  const suppliedD =
    named("deep|depth|seat depth") ?? (!lShape ? pairD : undefined);
  const suppliedH = named("seat height|high|height|tall") ?? undefined;
  if (request.previousPlan?.modules.length)
    return ideaPlanSchema.parse(editFurniturePlan(request.previousPlan, text));
  const defaults = {
    width: kind === "cabinet" ? 36 : 72,
    depth: kind === "shelf" ? 16 : 24,
    height: kind === "bench" ? 18 : kind === "shelf" ? 60 : 36,
  };
  const width =
      suppliedW ?? Math.min(zone?.width ?? defaults.width, defaults.width),
    depth =
      suppliedD ?? Math.min(zone?.depth ?? defaults.depth, defaults.depth),
    height =
      suppliedH ?? Math.min(zone?.height ?? defaults.height, defaults.height);
  const assumptions: string[] = [
    "This is an editable layout concept. Joinery, load capacity, bracing, anchoring, and finished tolerances still need design.",
  ];
  if (suppliedW === undefined)
    assumptions.push(
      `Provisional width: ${width} in. Replace it with your measured space.`,
    );
  if (suppliedD === undefined)
    assumptions.push(
      `Provisional depth: ${depth} in. Confirm seating/cushion or storage requirements.`,
    );
  if (suppliedH === undefined)
    assumptions.push(
      `Provisional ${kind === "bench" ? "finished seat" : "overall"} height: ${height} in. Confirm before cutting.`,
    );
  const backHeight =
    kind === "bench" &&
    !/\b(backless|(?:no|without)(?: a)? back)\b|wall.{0,32}(?:as|be)(?: the| a)? back/.test(
      text,
    )
      ? 16
      : 0;
  if (backHeight)
    assumptions.push(
      "The optional back panel is a provisional 16 in above the seat, with no cushion or recline allowance.",
    );
  const openingLid =
    kind === "bench" &&
    /\b(?:openable|opening|hinged|lift[ -]?up)\s+(?:seat\s+)?lids?\b|\b(?:lids?|seats?|tops?)\b.{0,28}\bopen\b/.test(
      text,
    );
  const storage =
    kind === "bench" &&
    (openingLid || /\bstorage\b|closed off|space underneath/.test(text));
  const sectionMatch = text.match(
    /\b(\d{1,2})[ -]*(?:sections?|compartments?|modules?)\b/,
  );
  const sectionCount = sectionMatch ? Number(sectionMatch[1]) : 1;
  if (kind === "bench" && (sectionCount < 1 || sectionCount > 12))
    return ideaPlanSchema.parse({
      title: "Banquette section count",
      summary:
        "Choose between one and twelve seating sections for this layout.",
      assumptions,
      questions: [
        "How many independent seating/storage sections do you want (1–12)?",
      ],
      suggestions: [],
      modules: [],
    });
  if (storage)
    assumptions.push(
      "Storage is enclosed with a bottom, front/rear and side panels. Panel joints and fasteners are not specified.",
    );
  if (openingLid)
    assumptions.push(
      "Seat lids can be shown open for access review. The rear pivot is provisional; hinge selection, lid stays, pinch protection and wall clearance need design. Hinges and lid-support hardware are not specified or priced.",
    );
  if (sectionCount > 1 && !lShape)
    assumptions.push(
      `The ${sectionCount} sections are arranged side by side in one straight run; confirm whether you instead want an L or U layout.`,
    );
  const base: PlanModule = {
    kind,
    name:
      kind === "bench"
        ? "Banquette seat"
        : kind === "workbench"
          ? "Workbench"
          : kind === "cabinet"
            ? "Cabinet box"
            : kind === "shelf"
              ? "Shelving"
              : "Box frame",
    width,
    depth,
    height,
    position: [0, 0, 0],
    yaw: 0,
    frameMaterial: "stud",
    panelMaterial: "plywood",
    backHeight,
    levels: 3,
    storage,
    openingLid,
    lidOpen: false,
  };
  const modules = [base];
  if (lShape) {
    const measuredReturn = named("return") ?? pairD;
    const returnLength = measuredReturn ?? Math.min(zone?.depth ?? 48, 48);
    if (measuredReturn === undefined)
      assumptions.push(
        `Provisional overall return footprint: ${returnLength} in.`,
      );
    if (returnLength - depth < 8)
      return ideaPlanSchema.parse({
        title: "L-shaped banquette",
        summary:
          "The return is too short for the proposed seat depth without overlapping the corner.",
        assumptions,
        questions: [
          "Give an overall return length at least 8 in greater than the seat depth, or reduce the seat depth.",
        ],
        suggestions: [
          "The corner is counted once; the return starts at the main seat edge.",
        ],
        modules: [],
      });
    base.position = [0, 0, -returnLength / 2 + depth / 2];
    modules.push({
      ...base,
      name: "Banquette return",
      width: returnLength - depth,
      position: [-width / 2 + depth / 2, 0, depth / 2],
      yaw: 90,
    });
  }
  if (kind === "bench" && sectionCount > 1) {
    if (!lShape) {
      const each =
        widthAppliesToEach(text) && suppliedW !== undefined
          ? width
          : width / sectionCount;
      const overall = each * sectionCount;
      modules.splice(
        0,
        modules.length,
        ...Array.from({ length: sectionCount }, (_, i) => ({
          ...base,
          name: `Banquette section ${i + 1}`,
          width: each,
          position: [-overall / 2 + each * (i + 0.5), 0, 0] as V3,
        })),
      );
    } else if (sectionCount >= 3) {
      const main = modules[0],
        count = sectionCount - 1,
        each = main.width / count;
      modules.splice(
        0,
        1,
        ...Array.from({ length: count }, (_, i) => ({
          ...main,
          name: `Banquette section ${i + 1}`,
          width: each,
          position: [
            -main.width / 2 + each * (i + 0.5),
            main.position[1],
            main.position[2],
          ] as V3,
        })),
      );
      modules.at(-1)!.name = `Banquette section ${sectionCount}`;
    }
    if (modules.some((m) => Math.min(m.width, m.depth, m.height) < 8))
      return ideaPlanSchema.parse({
        title: "Banquette section sizing",
        summary:
          "The available width is too small for the requested section count and stock frame.",
        assumptions,
        questions: [
          "Increase the total width, reduce the section count, or specify a different construction system.",
        ],
        suggestions: [],
        modules: [],
      });
  }
  return placeLocalPlan(
    ideaPlanSchema.parse({
      title:
        sectionCount > 1
          ? `${sectionCount}-section ${storage ? "storage " : ""}banquette`
          : lShape
            ? "L-shaped banquette"
            : base.name,
      summary:
        sectionCount > 1
          ? `${modules.length} editable seating sections${storage ? " with enclosed storage" : ""}${openingLid ? " and individually opening seat lids" : ""}. ${backHeight === 0 ? "No above-seat back is added." : ""}`
          : lShape
            ? "Two editable seating modules share an L-shaped footprint; the corner is not duplicated."
            : `An editable ${base.name.toLowerCase()} made from catalog lumber and panels.`,
      assumptions,
      questions: [],
      suggestions:
        kind === "bench"
          ? [
              "Confirm table clearance, finished seat height/depth, cushion thickness, and access before building.",
              openingLid
                ? "Seat lids are modeled; hinges, stays, pinch protection, wall clearance and attachment details still need design."
                : "Storage lids, hinges, angled backs, and attachment details need to be added and checked.",
              "Long unsupported members and missing bracing/fasteners need review; this layout does not establish safe loads.",
            ]
          : [
              "Specify how shelves, panels, and frame members will be joined; no fastener connections are invented.",
              "Add bracing and confirm anchors, clearances, stock sizes, and intended loads before construction.",
            ],
      modules,
    }),
    request,
  );
}

export function applyIdeaPlan(project: Project, raw: IdeaPlan): Project {
  return applyNewIdea(project, raw);
}
export function previewIdeaPlan(project: Project, plan: IdeaPlan) {
  const candidate = applyNewIdea(project, {
      ...plan,
      pendingPlacement: undefined,
    }),
    oldIds = new Set(project.pieces.map((p) => p.id));
  return candidateIdeaPreview(
    candidate,
    new Set(candidate.pieces.filter((p) => !oldIds.has(p.id)).map((p) => p.id)),
  );
}
