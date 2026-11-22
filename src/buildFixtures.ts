import type { GreenhouseRoofVent } from "./recipeSchemas";
/** Digital acceptance fixtures. A baseline study is not a completed building or an engineering approval. */
import { z } from "zod";
import { rotate } from "./spatial";
import { clipBox, type CutPlane } from "./cutProfiles";
import { orientedStockSize } from "./stockAxes";
import {
  buildClosetInsert,
  buildCaseworkShelves,
  buildGreenhouse,
  buildSaunaCabin,
  resolveStructureMaterial,
  type StructureMaterials,
  type StructureIssue,
  type StructureResult,
} from "./structures";
import {
  blank,
  material,
  projectSchema,
  type MaterialId,
  type Project,
  type V3,
} from "./model";
import { bom, bounds, inspectCutStock, cutKerf, pieceCutKerf } from "./engine";
import { stockSplitState } from "./packing";
import {
  cutInstructions,
  cutInstructionsText,
  type CutInstructionPlan,
} from "./cutInstructions";
import { applyIdeaPlan, localIdeaPlan } from "./planning";
import { bindStructureStudy } from "./ideaBindings";
import { structureIdeaSchema } from "./recipeSchemas";
import { recipeModified, setSectionLidOpen } from "./sections";
import {
  makeLidHingePlan,
  saveLidHingePlan,
  saveHingeStockSource,
} from "./hinges";
import { makeHingeStockSource } from "./hingeStock";

export const buildFixtureIds = [
  "storage-banquette",
  "shelves",
  "closet-insert",
  "greenhouse",
  "sauna",
] as const;
export type BuildFixtureId = (typeof buildFixtureIds)[number];
export type FixtureRequirement = {
  id: string;
  title: string;
  sourceRefs: string[];
  requiredUnits?: number | null;
  materialIds?: MaterialId[];
  claims?: string[];
};
export type BuildFixtureDefinition = {
  id: BuildFixtureId;
  version: 1;
  title: string;
  baselineScope: string;
  dimensions: { width: number; depth: number; height: number };
  geometry: FixtureRequirement[];
  operations: FixtureRequirement[];
  products: FixtureRequirement[];
  tools: FixtureRequirement[];
  decisions: FixtureRequirement[];
};
export const fixtureSources: Record<string, { title: string; url: string }> = {
  "yardwork-storage-recipe": {
    title: "Yardwork versioned storage geometry and acceptance research",
    url: "https://github.com/HoChiPants/yardwork/blob/main/docs/build-acceptance-research.md",
  },
  "palram-suntuf": {
    title: "Palram SUNTUF manufacturer product/manual downloads",
    url: "https://www.palram.com/us/product/suntuf-diy-polycarbonate-corrugated-sheets/",
  },
  "palram-accessories": {
    title: "Palram compatible corrugated system accessories",
    url: "https://www.palram.com/us/palram-corrugated-system-accessories/",
  },
  "harvia-kip-manual": {
    title: "Harvia KIP North American manufacturer manual Y05-0623",
    url: "https://cdn.shopify.com/s/files/1/0555/6355/0889/files/Kip_USA_CN_ENFR_Y05-0623_02052023.pdf?v=1683043679",
  },
  "sauna-custom-cut": {
    title: "Almost Heaven/Harvia custom-cut installation manual",
    url: "https://cdn.shopify.com/s/files/1/0555/6355/0889/files/Custom__Cut_Installation_Manual-HarviaNA.pdf?v=1765397563",
  },
  "closetmaid-32175": {
    title: "ClosetMaid 32175 manufacturer instructions (system-specific)",
    url: "https://www.homebyames.com/on/demandware.static/-/Sites-root_b2c_closetmaid_catalog/default/dwb1847f29/installationPDFs/3217500_inst.pdf",
  },
  "sugatsune-lids": {
    title: "Sugatsune lid-support selection literature",
    url: "https://www.sugatsune.com/content/page-files/product-literature/catalog-201c-313-382-lid-supports.pdf",
  },
};
const req = (
  id: string,
  title: string,
  sourceRefs: string[] = [],
  extra: Partial<FixtureRequirement> = {},
): FixtureRequirement => ({ id, title, sourceRefs, ...extra });
const wood = req(
  "material.framing.2x4",
  "Source actual 1½ × 3½ in framing stock",
  [],
  { materialIds: ["stud"] },
);
const ply = req(
  "material.panel.plywood.0.75",
  "Source matching ¾ in plywood stock",
  [],
  { materialIds: ["plywood"] },
);
const layout = req(
  "tool.layout.measure-square-level",
  "Measure, mark, square and level the layout",
);
const woodSaw = req(
  "tool.saw.wood.crosscut",
  "Crosscut the selected lumber with its applicable blade/kerf",
);
const panelSaw = req(
  "tool.saw.panel.rip-crosscut",
  "Rip and crosscut sheets with supported edges and the applicable blade/kerf",
);
const drill = req(
  "tool.drill.pilot",
  "Drill the selected pilot/attachment holes with matching bits",
);
const drive = req(
  "tool.driver.compatible",
  "Drive selected fasteners with the correct bit and permitted drive method",
);
const commonDecisions = [
  req(
    "design.load-and-joinery",
    "Resolve intended loads, joinery and attachment details",
  ),
  req(
    "design.site-and-anchor",
    "Resolve site/wall substrate, support and anchoring",
  ),
];
const fixtures: BuildFixtureDefinition[] = [
  {
    id: "storage-banquette",
    version: 1,
    title: "Three-section storage banquette",
    baselineScope:
      "Enclosed three-compartment geometry with three pending lid-to-rear-panel hinge plans and provisional lid motion; measured axes, stock allocations, mounting, lid supports and fastening remain unresolved.",
    dimensions: { width: 72, depth: 24, height: 18 },
    geometry: [
      req(
        "geometry.storage-shell",
        "Three real closed compartments with bottom and four sides",
      ),
      req(
        "geometry.storage-lids",
        "Three independent lids with reversible rear-pivot access preview",
      ),
      req(
        "geometry.fixture-envelope",
        "Closed layout matches the requested outside dimensions",
      ),
    ],
    operations: [
      req("operation.cut-schedule", "Record the actual panel and lumber cuts"),
      req(
        "operation.assembly-connections",
        "Specify the actual attachment schedule and connection records",
      ),
      req(
        "operation.lid-installation",
        "Specify hinge/stay holes, pivots and installation details",
        ["sugatsune-lids"],
      ),
    ],
    products: [
      wood,
      ply,
      req(
        "hardware.seat-hinges",
        "Select compatible seat hinges and determine quantities",
        ["sugatsune-lids"],
        { requiredUnits: null },
      ),
      req(
        "hardware.lid-support",
        "Select compatible lid supports and determine quantities",
        ["sugatsune-lids"],
        { requiredUnits: null },
      ),
      req(
        "hardware.assembly-fasteners",
        "Select actual assembly fasteners and determine quantities",
        [],
        { requiredUnits: null },
      ),
    ],
    tools: [layout, woodSaw, panelSaw, drill, drive],
    decisions: [
      ...commonDecisions,
      req(
        "design.lid-safety",
        "Resolve lid mass, support/hold-open action, pinch points and wall clearance",
        ["sugatsune-lids"],
      ),
    ],
  },
  {
    id: "shelves",
    version: 1,
    title: "Freestanding adjustable shelf carcass",
    baselineScope:
      "Eight real carcass/shelf panels; support holes, pins, joints and anti-tip anchoring are not represented.",
    dimensions: { width: 36, depth: 16, height: 72 },
    geometry: [
      req(
        "geometry.shelf-carcass",
        "Backed carcass and three inset adjustable shelves",
      ),
      req(
        "geometry.shelf-supports",
        "Represent the selected shelf support and hole system",
      ),
      req(
        "geometry.fixture-envelope",
        "Carcass matches the requested outside dimensions",
      ),
    ],
    operations: [
      req("operation.cut-schedule", "Record panel cuts and grain/orientation"),
      req("operation.shelf-holes", "Record the selected shelf-hole pattern"),
      req(
        "operation.assembly-connections",
        "Specify carcass joints and anti-tip attachments",
      ),
    ],
    products: [
      ply,
      req(
        "hardware.shelf-pins",
        "Select compatible supports for the three adjustable shelves",
        [],
        { requiredUnits: 12 },
      ),
      req(
        "hardware.anti-tip",
        "Select substrate-compatible anti-tip hardware",
        [],
        { requiredUnits: null },
      ),
      req(
        "hardware.assembly-fasteners",
        "Select carcass fasteners and their quantities",
        [],
        { requiredUnits: null },
      ),
    ],
    tools: [
      layout,
      panelSaw,
      drill,
      drive,
      req(
        "tool.jig.shelf-holes",
        "Lay out and drill the actual shelf-support pattern",
      ),
    ],
    decisions: commonDecisions,
  },
  {
    id: "closet-insert",
    version: 1,
    title: "Built-in closet bay study",
    baselineScope:
      "Ten real casework panels in three bays; rods, rod supports, door/baseboard obstructions and anchors remain unrepresented.",
    dimensions: { width: 80, depth: 24, height: 84 },
    geometry: [
      req(
        "geometry.closet-bays",
        "Four verticals, a top/bottom and four center-bay shelves",
      ),
      req(
        "geometry.closet-rods",
        "Represent the selected rod diameters and support components",
      ),
      req(
        "geometry.closet-clearance",
        "Represent measured trim, baseboard and door/access obstructions",
      ),
      req(
        "geometry.fixture-envelope",
        "Casework matches the measured opening dimensions",
      ),
    ],
    operations: [
      req(
        "operation.cut-schedule",
        "Record panel cuts and selected rod cuts/adjustments",
      ),
      req("operation.shelf-holes", "Record shelf-support holes"),
      req(
        "operation.assembly-connections",
        "Specify substrate-dependent mounting and support attachments",
      ),
    ],
    products: [
      ply,
      req(
        "hardware.closet-rods",
        "Select rods for the two hanging bays",
        ["closetmaid-32175"],
        { requiredUnits: 2 },
      ),
      req(
        "hardware.rod-end-supports",
        "Select matching rod end supports",
        ["closetmaid-32175"],
        { requiredUnits: 4 },
      ),
      req(
        "hardware.shelf-pins",
        "Select supports for four adjustable shelves",
        [],
        { requiredUnits: 16 },
      ),
      req(
        "hardware.anti-tip",
        "Select substrate-compatible anchors and quantities",
        [],
        { requiredUnits: null },
      ),
    ],
    tools: [
      layout,
      panelSaw,
      drill,
      drive,
      req(
        "tool.cut.rod",
        "Cut or adjust the selected rod system using its allowed method",
        ["closetmaid-32175"],
      ),
    ],
    decisions: [
      ...commonDecisions,
      req(
        "design.closet-measurements",
        "Resolve bay dimensions, substrate, stud map and door/baseboard encroachment",
      ),
    ],
  },
  {
    id: "greenhouse",
    version: 1,
    title: "Gabled greenhouse framing study",
    baselineScope:
      "Actual base, wall/door frames and plumb-cut pitched roof; glazing, ventilation, qualified bearings and anchoring remain incomplete.",
    dimensions: { width: 72, depth: 96, height: 108 },
    geometry: [
      req(
        "geometry.greenhouse-wall-frames",
        "Real back and side framing sections",
      ),
      req(
        "geometry.greenhouse-roof",
        "Represent rafters, ridge, plumb end cuts and sloped gable framing",
      ),
      req(
        "geometry.greenhouse-openings",
        "Represent an actual door and opening roof vent",
      ),
      req(
        "geometry.greenhouse-glazing",
        "Represent a complete selected glazing system with orientation and treatments",
      ),
    ],
    operations: [
      req(
        "operation.cut-schedule",
        "Record lumber end cuts and actual glazing cut shapes",
      ),
      req(
        "operation.glazing-drill-fastening",
        "Record the selected system's drilling, washer, profile and fastening schedule",
        ["palram-suntuf", "palram-accessories"],
      ),
      req(
        "operation.assembly-connections",
        "Specify structural, door/vent and anchor attachments",
      ),
    ],
    products: [
      wood,
      req(
        "material.glazing-system",
        "Select the exact glazing product/system",
        ["palram-suntuf"],
        { requiredUnits: null, claims: ["glazing-system-match"] },
      ),
      req(
        "hardware.glazing-accessories",
        "Select matching fasteners, closures/profiles and flashings",
        ["palram-accessories"],
        { requiredUnits: null },
      ),
      req(
        "hardware.door-vent",
        "Select door/vent hardware and quantities",
        [],
        { requiredUnits: null },
      ),
      req(
        "hardware.foundation-anchors",
        "Select substrate-compatible anchoring",
        [],
        { requiredUnits: null },
      ),
    ],
    tools: [
      layout,
      woodSaw,
      drill,
      req(
        "tool.cut.glazing",
        "Cut the selected glazing system using its permitted method",
        ["palram-suntuf"],
      ),
      req(
        "tool.driver.glazing-torque",
        "Use the selected glazing system's permitted torque/drive method",
        ["palram-suntuf"],
      ),
    ],
    decisions: [
      req(
        "design.greenhouse-loads",
        "Resolve site-specific snow/wind, foundation and anchoring",
      ),
      req(
        "design.greenhouse-glazing",
        "Resolve panel system, thickness, support/pitch/expansion details",
        ["palram-suntuf"],
      ),
      req(
        "design.greenhouse-ventilation",
        "Resolve ventilation/condensation and vent sizing/control",
        ["palram-suntuf"],
      ),
    ],
  },
  {
    id: "sauna",
    version: 1,
    title: "Sauna interior envelope study",
    baselineScope:
      "Actual exterior wall/door/ceiling framing reserves the clear interior. Heated layers, seating, door, equipment and trades remain incomplete.",
    dimensions: { width: 72, depth: 72, height: 84 },
    geometry: [
      req(
        "geometry.sauna-framing",
        "Actual exterior framing preserves the clear interior",
      ),
      req(
        "geometry.sauna-envelope",
        "Represent a layered wall/ceiling assembly preserving clear interior size",
      ),
      req(
        "geometry.sauna-bench",
        "Represent heat-compatible slatted seating, supports and attachment details",
      ),
      req(
        "geometry.sauna-equipment",
        "Represent the exact regional heater/guard/sensor and sourced clearance envelopes",
      ),
      req(
        "geometry.sauna-door-vents",
        "Represent an outward door and the selected ventilation layout",
      ),
    ],
    operations: [
      req(
        "operation.cut-schedule",
        "Record the actual envelope, bench, trim and opening cuts",
      ),
      req(
        "operation.sauna-assembly",
        "Specify source-backed bench/envelope/door installation operations",
        ["sauna-custom-cut"],
      ),
      req(
        "operation.equipment-installation",
        "Record selected equipment installation and trade handoff requirements",
        ["harvia-kip-manual"],
      ),
    ],
    products: [
      req(
        "material.sauna-interior",
        "Select heat-environment-compatible interior/bench stock",
        ["harvia-kip-manual"],
        { requiredUnits: null, claims: ["sauna-interior-suitability"] },
      ),
      req(
        "material.sauna-envelope",
        "Select the complete insulation/vapor/furring/layer system",
        ["harvia-kip-manual"],
        { requiredUnits: null },
      ),
      req(
        "equipment.sauna-heater",
        "Select and reconcile the exact regional heater, supplied parts and manual",
        ["harvia-kip-manual"],
        { requiredUnits: 1, claims: ["regional-equipment-manual-match"] },
      ),
      req(
        "hardware.sauna-door-vents",
        "Select door, vent and mounting components",
        [],
        { requiredUnits: null },
      ),
      req(
        "hardware.sauna-fasteners",
        "Select environment-compatible fasteners and attachment quantities",
        ["sauna-custom-cut"],
        { requiredUnits: null },
      ),
    ],
    tools: [layout, woodSaw, panelSaw, drill, drive],
    decisions: [
      req(
        "design.sauna-equipment-identity",
        "Resolve model/manual identity, source conflicts, sizing and sensor/guard clearances",
        ["harvia-kip-manual"],
      ),
      req(
        "design.sauna-envelope",
        "Resolve heated material suitability, room layers, ventilation and floor/drainage",
        ["harvia-kip-manual"],
      ),
      req(
        "design.sauna-trades",
        "Resolve electrical supply/installation and required qualified review",
        ["harvia-kip-manual"],
      ),
    ],
  },
];
export function listBuildFixtures() {
  return structuredClone(fixtures);
}
export function getBuildFixture(id: BuildFixtureId) {
  const fixture = fixtures.find((f) => f.id === id);
  if (!fixture) throw Error("Unknown acceptance fixture");
  return structuredClone(fixture);
}
export type BuildFixtureBaseline = {
  fixtureId: BuildFixtureId;
  version: 1;
  baselineScope: string;
  project: Project;
};
export type BuildStudyParameters = {
  width: number;
  depth: number;
  height: number;
  roofRise: number;
  doorWidth: number;
  doorHeight: number;
  towerWidth: number;
  leftBayWidth?: number;
  shelfCount: number;
  rodHeight: number;
  roofVent?: GreenhouseRoofVent;
  rafterSpacing?: number;
  interiorLayerAllowance: number;
  benchOffsetX: number;
  benchRearGap: number;
};
export function defaultBuildStudyParameters(
  id: BuildFixtureId,
): BuildStudyParameters {
  const d = getBuildFixture(id).dimensions;
  return {
    width: d.width,
    depth: d.depth,
    height: id === "greenhouse" ? 84 : d.height,
    roofRise: 24,
    doorWidth: id === "sauna" ? 28 : 30,
    doorHeight: id === "sauna" ? 72 : 68,
    towerWidth: 25,
    shelfCount: id === "shelves" ? 3 : 4,
    rodHeight: 64,
    interiorLayerAllowance: 1.5,
    benchOffsetX: 0,
    benchRearGap: 0,
  };
}
export type BuildStudy = BuildFixtureBaseline & {
  missingMaterials: StructureIssue[];
  unresolved: StructureIssue[];
  structure: StructureResult | null;
  parameters: BuildStudyParameters;
};

/** The one-piece back spans the full outside width of this study. */
export function shelfBackStockFit(study: BuildStudy) {
  if (study.fixtureId !== "shelves") return null;
  const backId = study.structure?.geometryRoles.back?.[0];
  const back = study.project.pieces.find((piece) => piece.id === backId);
  if (!back) return null;
  const [, backWidth] = orientedStockSize(back);
  if (backWidth !== study.parameters.width) return null;
  const panel = material(back.material);
  const [, sheetWidth] = [...(panel.stockSize ?? panel.size)].sort(
    (a, b) => a - b,
  );
  const kerf = cutKerf(panel.id);
  const state = stockSplitState(sheetWidth, backWidth, kerf);
  if (state === "whole" || state === "cut") return null;

  // Round down to an eighth so the requested rip has at least a full kerf.
  const suggestedWidth = Math.floor((sheetWidth - kerf) * 8) / 8;
  return { state, backWidth, sheetWidth, kerf, suggestedWidth };
}
/** Adds pending plans only from explicit storage-part roles; existing mechanisms/sources are never rebound. */
export function addPendingStorageHinges(project: Project): Project {
  let next = project;
  const sections = project.sections.filter(
    (section) => section.recipe?.storage && section.recipe.openingLid,
  );
  for (const section of sections) {
    if (next.lidHingePlans.some((plan) => plan.sectionId === section.id))
      continue;
    const members = next.pieces.filter(
      (piece) => !piece.offcut && section.pieceIds.includes(piece.id),
    );
    const moving = members.filter((piece) => piece.designRole === "seat-lid");
    const fixed = members.filter(
      (piece) => piece.designRole === "storage-rear",
    );
    if (moving.length !== 1 || fixed.length !== 1)
      throw Error(
        "Pending storage hinge plans require one explicitly identified active lid and rear panel in each section; existing parts are not guessed by name or order.",
      );
    const pending = makeLidHingePlan(
      next,
      section.id,
      moving[0].id,
      fixed[0].id,
    );
    next = saveLidHingePlan(next, {
      ...pending,
      name: `${section.name} pending hinge`,
      notes:
        "Pending actual lid-to-rear-panel connection. Measure the delivered hinge and its closed mounting geometry before entering axis points, allocating physical stock or transferring holes. No mounting, stay, hold-open action, seat support or load approval is supplied by this plan.",
    });
  }
  if (sections.length && next.hingeStockSources.length === 0)
    next = saveHingeStockSource(next, {
      ...makeHingeStockSource(),
      notes:
        "Unmeasured planning source only: no physical purchase, delivered usable length, metal-cut kerf, cuts or segment allocation has been recorded. One source is not evidence that all three lids can be supplied. Record actual stock and any additional sources explicitly.",
    });
  return next;
}
/** Starts a separate project. Source context is copied only for explicitly matching retailer/store/ZIP observations. */
export function createBuildStudy(
  id: BuildFixtureId,
  parameters: BuildStudyParameters = defaultBuildStudyParameters(id),
  context?: Project,
  selections: StructureMaterials = {},
): BuildStudy {
  const definition = getBuildFixture(id),
    p = parameters;
  if (
    [p.width, p.depth, p.height].some(
      (n) => !Number.isFinite(n) || n <= 0 || n > 240,
    )
  )
    throw Error("Enter positive study dimensions up to 240 inches.");
  let project = blank(definition.title),
    structure: StructureResult | null = null;
  if (context)
    project = {
      ...project,
      retailer: context.retailer,
      zip: context.zip,
      store: context.store,
      toolSelections: structuredClone(context.toolSelections),
      workZone: context.workZone ? structuredClone(context.workZone) : null,
      inventory: structuredClone(
        context.inventory.filter(
          (i) =>
            (i.retailer ?? "home-depot") === context.retailer &&
            i.zip === context.zip &&
            i.store === context.store,
        ),
      ),
      supplyInventory: structuredClone(
        context.supplyInventory.filter(
          (i) =>
            i.retailer === context.retailer &&
            i.zip === context.zip &&
            i.store === context.store,
        ),
      ),
    };
  const selectedMissing: StructureIssue[] = [],
    selectedConstraints: StructureIssue[] = [];
  let panelId: MaterialId = "plywood",
    frameId: MaterialId = "stud";
  if (id === "storage-banquette") {
    const resolved = resolveStructureMaterial(
      "caseworkPanels",
      selections,
      selectedMissing,
      { wood: true, kind: "sheet" },
      "plywood",
      selectedConstraints,
    );
    if (!resolved)
      throw Error(
        "The selected casework panel has no source-qualified product match; no substitute is used.",
      );
    panelId = resolved;
    if (id === "storage-banquette")
      frameId = resolveStructureMaterial(
        "frameLumber",
        selections,
        selectedMissing,
        { wood: true, kind: "linear" },
        "stud",
        selectedConstraints,
      )!;
  }
  if (id === "storage-banquette") {
    const plan = localIdeaPlan({
      prompt: `A storage banquette ${p.width} inches wide, ${p.depth} inches deep, ${p.height} inches seat height, three sections, no back and opening lids`,
    });
    plan.modules = plan.modules.map((module) => ({
      ...module,
      panelMaterial: panelId,
      frameMaterial: frameId,
    }));
    plan.assumptions.push(
      "Casework and frame geometry use the selected actual stock thicknesses. Product identity and dimensions do not qualify seat loads, joinery, hinge/lid-support selection or current store inventory.",
    );
    project = applyIdeaPlan(project, plan);
    project = addPendingStorageHinges(project);
  }
  if (id === "shelves")
    structure = buildCaseworkShelves(
      project,
      {
        width: p.width,
        depth: p.depth,
        height: p.height,
        shelfCount: p.shelfCount,
      },
      selections,
    );
  if (id === "closet-insert")
    structure = buildClosetInsert(
      project,
      {
        width: p.width,
        depth: p.depth,
        height: p.height,
        towerWidth: p.towerWidth,
        ...(p.leftBayWidth !== undefined ? { leftBayWidth: p.leftBayWidth } : {}),
        shelfCount: p.shelfCount,
        rodHeight: p.rodHeight,
      },
      selections,
    );
  if (id === "greenhouse")
    structure = buildGreenhouse(
      project,
      {
        width: p.width,
        depth: p.depth,
        eaveHeight: p.height,
        roofRise: p.roofRise,
        ...(p.roofVent ? { roofVent: p.roofVent } : {}),
        rafterSpacing: p.rafterSpacing,
        doorWidth: p.doorWidth,
        doorHeight: p.doorHeight,
      },
      selections,
    );
  if (id === "sauna")
    structure = buildSaunaCabin(
      project,
      {
        clearWidth: p.width,
        clearDepth: p.depth,
        clearHeight: p.height,
        interiorLayerAllowance: p.interiorLayerAllowance,
        doorWidth: p.doorWidth,
        doorHeight: p.doorHeight,
        benchWidth: Math.min(60, p.width),
        benchDepth: Math.min(24, p.depth),
        ...(selections.saunaBench ? { benchOffsetX: p.benchOffsetX, benchRearGap: p.benchRearGap } : {}),
      },
      selections,
    );
  const closetScope = id === "closet-insert" && structure?.geometryRoles["hanging-rods"]?.length
    ? "Actual three-bay casework and two source-sized cut rod envelopes; socket engagement, supports, shelf holes, anchors and measured obstructions remain incomplete."
    : null;
  if (structure) {
    const parameters =
      id === "shelves"
        ? {
            width: p.width,
            depth: p.depth,
            height: p.height,
            shelfCount: p.shelfCount,
          }
        : id === "greenhouse"
          ? {
              width: p.width,
              depth: p.depth,
              eaveHeight: p.height,
              roofRise: p.roofRise,
              ...(p.roofVent ? { roofVent: p.roofVent } : {}),
              rafterSpacing: p.rafterSpacing,
              doorWidth: p.doorWidth,
              doorHeight: p.doorHeight,
            }
          : id === "sauna"
            ? {
                clearWidth: p.width,
                clearDepth: p.depth,
                clearHeight: p.height,
                interiorLayerAllowance: p.interiorLayerAllowance,
                doorWidth: p.doorWidth,
                doorHeight: p.doorHeight,
                benchWidth: Math.min(60, p.width),
                benchDepth: Math.min(24, p.depth),
                ...(selections.saunaBench ? { benchOffsetX: p.benchOffsetX, benchRearGap: p.benchRearGap } : {}),
              }
            : {
                width: p.width,
                depth: p.depth,
                height: p.height,
                towerWidth: p.towerWidth,
                ...(p.leftBayWidth !== undefined ? { leftBayWidth: p.leftBayWidth } : {}),
                shelfCount: p.shelfCount,
                rodHeight: p.rodHeight,
              };
    project = bindStructureStudy(
      structure.project,
      structureIdeaSchema.parse({
        kind: id === "shelves" ? "casework-shelves" : id,
        parameters,
        selections,
      }),
      structure,
      definition.title,
      closetScope ?? definition.baselineScope,
    );
  }
  if (id === "greenhouse" || id === "sauna") {
    const points: V3[] = [
      [-p.width / 2, 0, -p.depth / 2],
      [p.width / 2, 0, -p.depth / 2],
      [p.width / 2, 0, p.depth / 2],
      [-p.width / 2, 0, p.depth / 2],
    ];
    project.planLines = points.map((a, i) => ({ a, b: points[(i + 1) % 4] }));
  }
  const requirements = [...definition.operations, ...definition.decisions];
  const unresolved = structure?.unresolved ?? [
    ...selectedConstraints,
    ...requirements.map((r) => ({
      id: r.id,
      reason:
        r.title +
        " remains a design/installation requirement; this geometry is not a ready-to-build kit.",
      sourceRefs: r.sourceRefs
        .map((ref) => fixtureSources[ref]?.url)
        .filter(Boolean),
    })),
  ];
  const missingMaterials = structure?.missingMaterials ?? [
    ...selectedMissing,
    ...definition.products
      .filter((r) => r.id !== ply.id && r.id !== wood.id)
      .map((r) => ({
        id: r.id,
        reason:
          r.title +
          " has not been matched and qualified for this study. Generic starter stock is dimensional geometry only.",
        sourceRefs: r.sourceRefs
          .map((ref) => fixtureSources[ref]?.url)
          .filter(Boolean),
      })),
  ];
  if (
    project.workZone &&
    !unresolved.some((i) => i.id === "work-zone-fit") &&
    project.pieces.some((piece) => {
      const b = bounds(piece),
        zone = project.workZone!;
      return (
        b.min[0] < -zone.width / 2 - 0.001 ||
        b.max[0] > zone.width / 2 + 0.001 ||
        b.min[2] < -zone.depth / 2 - 0.001 ||
        b.max[2] > zone.depth / 2 + 0.001 ||
        b.min[1] < -0.001 ||
        b.max[1] > zone.height + 0.001
      );
    })
  )
    unresolved.push({
      id: "work-zone-fit",
      reason:
        "The generated parts extend beyond the inherited work zone. Revise the dimensions or available space; this study does not establish a fit.",
      sourceRefs: [],
    });
  if (!structure)
    project.notes +=
      "\n\nStudy requirements to resolve:\n" +
      [...missingMaterials, ...unresolved]
        .map((i) => `${i.id}: ${i.reason}`)
        .join("\n");
  const baselineScope =
    id === "greenhouse" &&
    structure?.geometryRoles["glazing-roof-panels"]?.length
      ? p.roofVent
        ? "Actual glazed framing, door, and one roof vent with an opening, sash and separate cut blanks. Ventilation performance, flashing, connections and anchoring remain incomplete."
        : "Actual framing, door and source-sized wall/gable/roof glazing envelopes with angled cuts; glazing accessories/allowances, ventilation, load-bearing connections and anchoring remain incomplete."
      : closetScope ?? definition.baselineScope;
  project.notes = [
    `ACCEPTANCE BASELINE STUDY — ${baselineScope}`,
    project.notes,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (project.notes.length > 10000)
    throw Error(
      "The study's unresolved decisions exceed the project notes limit.",
    );
  return {
    fixtureId: id,
    version: 1,
    baselineScope,
    project: projectSchema.parse(project),
    missingMaterials,
    unresolved,
    structure,
    parameters: { ...p },
  };
}
export function createBuildFixture(id: BuildFixtureId): BuildFixtureBaseline {
  return createBuildStudy(id);
}
export type FixtureCutRow = {
  materialId: MaterialId;
  dimensions: V3;
  quantity: number;
  partIds: string[];
  stockDimensions: V3;
  stockFits: boolean;
  cutPlanes: CutPlane[];
  perPartCutInstructions: Record<
    string,
    { geometry: CutInstructionPlan; text: string }
  >;
};
export function fixtureCutTable(project: Project): FixtureCutRow[] {
  const rows = new Map<string, FixtureCutRow>();
  const lineage = inspectCutStock(project);
  for (const p of project.pieces.filter((p) => !p.offcut)) {
    const m = material(p.material);
    if (!m.cuttable || !["linear", "sheet"].includes(m.stockKind)) continue;
    const key = JSON.stringify([
      p.material,
      p.size,
      p.cutPlanes,
      p.stockLengthAxis,
    ]);
    const stock = m.stockSize ?? m.size,
      a = orientedStockSize(p),
      b = [...stock].sort((x, y) => x - y);
    const row = rows.get(key) ?? {
      materialId: p.material,
      dimensions: [...p.size] as V3,
      quantity: 0,
      partIds: [],
      stockDimensions: [...stock] as V3,
      stockFits: a.every((v, i) => v <= b[i] + 0.001),
      cutPlanes: p.cutPlanes,
      perPartCutInstructions: {},
    };
    row.quantity++;
    row.partIds.push(p.id);
    const instructions = cutInstructions(p, {
      kerf: pieceCutKerf(p),
      lineageStatus:
        p.cutStock && lineage.valid.has(p.cutStock.id)
          ? "validated"
          : "unverified",
    });
    row.perPartCutInstructions[p.id] = {
      geometry: instructions,
      text: cutInstructionsText(instructions),
    };
    rows.set(key, row);
  }
  return [...rows.values()];
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
function outsideDimensions(project: Project): V3 | null {
  const boxes = project.pieces.filter((p) => !p.offcut).map(bounds);
  if (!boxes.length) return null;
  return [0, 1, 2].map(
    (i) =>
      Math.max(...boxes.map((b) => b.max[i])) -
      Math.min(...boxes.map((b) => b.min[i])),
  ) as V3;
}
function containsActualGeometry(project: Project, expected: Project) {
  const remaining = project.pieces.filter((p) => !p.offcut);
  return expected.pieces
    .filter((p) => !p.offcut)
    .every((p) => {
      const index = remaining.findIndex(
        (q) =>
          q.material === p.material &&
          JSON.stringify(q.cutPlanes) === JSON.stringify(p.cutPlanes) &&
          q.size.every((v, i) => near(v, p.size[i])) &&
          q.position.every((v, i) => near(v, p.position[i])) &&
          rotate([1, 0, 0], q.rotation).every((v, i) =>
            near(v, rotate([1, 0, 0], p.rotation)[i]),
          ) &&
          rotate([0, 1, 0], q.rotation).every((v, i) =>
            near(v, rotate([0, 1, 0], p.rotation)[i]),
          ),
      );
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
}
function actualGeometry(baseline: BuildFixtureBaseline) {
  const p = baseline.project,
    results = new Map<string, string | null>();
  const dims = outsideDimensions(p),
    d = getBuildFixture(baseline.fixtureId).dimensions;
  if (baseline.fixtureId === "storage-banquette") {
    const sections = p.sections.filter(
      (s) =>
        s.recipe?.kind === "bench" &&
        s.recipe.storage &&
        s.recipe.openingLid &&
        s.recipe.backHeight === 0,
    );
    const shells =
      sections.length === 3 &&
      sections.every(
        (s) =>
          near(s.recipe!.width, 24) &&
          near(s.recipe!.height, 18) &&
          near(s.recipe!.depth, 24) &&
          !recipeModified(p, s),
      ) &&
      sections.every((s) =>
        [
          "storage bottom",
          "storage front",
          "storage rear",
          "storage left",
          "storage right",
          "seat lid",
        ].every((label) =>
          p.pieces.some(
            (x) => s.pieceIds.includes(x.id) && x.name.endsWith(label),
          ),
        ),
      );
    results.set(
      "geometry.storage-shell",
      shells
        ? null
        : "Three actual closed storage shells and lids are required; names/recipe flags alone are insufficient.",
    );
    let motion = shells;
    try {
      for (const s of sections) {
        const original = p.pieces.find(
          (x) => s.pieceIds.includes(x.id) && x.name.endsWith("seat lid"),
        )!;
        const closed = setSectionLidOpen(p, s.id, false),
          open = setSectionLidOpen(closed, s.id, true),
          again = setSectionLidOpen(open, s.id, false);
        const a = closed.pieces.find((x) => x.id === original.id)!,
          b = again.pieces.find((x) => x.id === original.id)!;
        const o = open.pieces.find((x) => x.id === a.id)!;
        const corner: V3 = [0, -a.size[1] / 2, -a.size[2] / 2],
          rearClosed = rotate(corner, a.rotation).map(
            (v, i) => v + a.position[i],
          ),
          rearOpen = rotate(corner, o.rotation).map(
            (v, i) => v + o.position[i],
          );
        if (
          !a.position.every((v, i) => near(v, b.position[i])) ||
          !a.rotation.every((v, i) => near(v, b.rotation[i])) ||
          !rearClosed.every((v, i) => near(v, rearOpen[i])) ||
          o.rotation.every((v, i) => near(v, a.rotation[i])) ||
          bounds(o).max[1] <= bounds(a).max[1] + 1 ||
          open.sections.find((x) => x.id === s.id)?.recipe?.lidOpen !== true
        )
          motion = false;
      }
    } catch {
      motion = false;
    }
    results.set(
      "geometry.storage-lids",
      motion
        ? null
        : "Independent lid motion/saveable recipe geometry is missing.",
    );
  }
  if (baseline.fixtureId === "shelves") {
    const parts = p.pieces.filter((x) => !x.offcut),
      shelves = parts.filter((x) => x.assembly.startsWith("Adjustable shelf"));
    const actual =
      containsActualGeometry(p, createBuildFixture("shelves").project) &&
      parts.length === 8 &&
      shelves.length === 3 &&
      shelves.every(
        (x) =>
          near(x.size[0], 34.5) && near(x.size[1], 0.75) && near(x.size[2], 15),
      );
    results.set(
      "geometry.shelf-carcass",
      actual
        ? null
        : "The backed carcass and three correctly sized inset shelves are missing.",
    );
    results.set(
      "geometry.shelf-supports",
      "Shelf-pin/support geometry and its hole pattern are not yet represented by the baseline.",
    );
  }
  if (baseline.fixtureId === "closet-insert") {
    results.set(
      "geometry.closet-bays",
      containsActualGeometry(p, createBuildFixture("closet-insert").project) &&
        p.pieces.length === 10 &&
        p.pieces.filter((x) => x.name.endsWith("vertical")).length === 4 &&
        p.pieces.filter((x) => x.name.endsWith("tower shelf")).length === 4
        ? null
        : "Actual three-bay casework panels are missing.",
    );
    results.set(
      "geometry.closet-rods",
      "Actual sourced rod profiles/diameters and compatible support geometry are not yet represented.",
    );
    results.set(
      "geometry.closet-clearance",
      "Measured door, trim, baseboard and access obstruction volumes are not yet represented.",
    );
  }
  if (baseline.fixtureId === "greenhouse") {
    results.set(
      "geometry.greenhouse-wall-frames",
      containsActualGeometry(p, createBuildFixture("greenhouse").project) &&
        p.sections.length >= 3 &&
        p.pieces.filter((x) => x.material === "stud").length >= 20
        ? null
        : "The actual back and two side framing sections are missing.",
    );
    results.set(
      "geometry.greenhouse-roof",
      containsActualGeometry(p, createBuildFixture("greenhouse").project) &&
        p.pieces
          .filter(
            (x) =>
              x.name.endsWith("plumb-cut rafter") && x.cutPlanes.length === 2,
          )
          .every((piece) => {
            const faces = clipBox(piece.size, piece.cutPlanes).faces.filter(
              (f) => f.kind === "cut",
            );
            return (
              faces.length === 2 &&
              faces.every((face) => {
                const n = rotate(face.normal, piece.rotation);
                return (
                  near(Math.abs(n[0]), 1) && near(n[1], 0) && near(n[2], 0)
                );
              })
            );
          })
        ? null
        : "Actual pitched rafters, persistent plumb end-cuts, ridge and sloped gable framing are missing or modified.",
    );
    const openingRoles = ["door-opening-framing", "door-leaf", "roof-vent-opening", "roof-vent-sash"];
    const hasOpening = p.ideaBindings.some((binding) => binding.entries.some((entry) => {
      if (entry.spec.type !== "structure" || entry.spec.structure.kind !== "greenhouse" ||
        !entry.spec.structure.parameters.roofVent) return false;
      let expected: StructureResult;
      try {
        expected = buildGreenhouse(blank(), entry.spec.structure.parameters, entry.spec.structure.selections);
      } catch {
        return false;
      }
      return openingRoles.every((role) => {
        const expectedIds = expected.geometryRoles[role] ?? [];
        const actualId = entry.sections.find((section) => section.role === role)?.sectionId;
        const actualIds = new Set(p.sections.find((section) => section.id === actualId)?.pieceIds ?? []);
        return expectedIds.length > 0 && containsActualGeometry(
          { ...p, pieces: p.pieces.filter((piece) => actualIds.has(piece.id)) },
          { ...expected.project, pieces: expected.project.pieces.filter((piece) => expectedIds.includes(piece.id)) },
        );
      });
    }));
    results.set(
      "geometry.greenhouse-openings",
      hasOpening ? null : "A verified door leaf and between-rafter vent opening with its matching sash are required for this geometry review.",
    );
    results.set(
      "geometry.greenhouse-glazing",
      "Selected glazing system panels, orientation, edge treatments and support details are not represented.",
    );
  }
  if (baseline.fixtureId === "sauna") {
    const clear = { min: [-36, 0, -36], max: [36, 84, 36] };
    const outsideClear = p.pieces.every((piece) => {
      const b = bounds(piece);
      return [0, 1, 2].some(
        (i) =>
          Math.min(b.max[i], clear.max[i]) - Math.max(b.min[i], clear.min[i]) <=
          0.001,
      );
    });
    results.set(
      "geometry.sauna-framing",
      containsActualGeometry(p, createBuildFixture("sauna").project) &&
        outsideClear
        ? null
        : "Exterior framing and its complete reserved clear interior are missing or modified.",
    );
    results.set(
      "geometry.sauna-envelope",
      "Wall and ceiling batts, cedar lining and foil can be modeled. Review backing, fastening, insulation support, and transitions and penetrations in the selected heated-room assembly.",
    );
    results.set(
      "geometry.sauna-bench",
      "A sourced freestanding lower bench can be placed. Verify the delivered supports and hardware and design any additional seating.",
    );
    results.set(
      "geometry.sauna-equipment",
      "Exact regional equipment, guards, sensors and source-qualified clearance envelopes are missing.",
    );
    results.set(
      "geometry.sauna-door-vents",
      "A selected prehung leaf can be tested with an outward swing. Confirm the delivered jamb and hardware and resolve the vent/sensor layout.",
    );
  }
  if (dims)
    results.set(
      "geometry.fixture-envelope",
      near(dims[0], d.width) &&
        near(dims[1], d.height) &&
        near(dims[2], d.depth)
        ? null
        : "Actual closed part bounds differ from the fixture's required outside dimensions.",
    );
  return results;
}
/** Evidence is an explicit external attestation/ledger reference, not invented by the fixture. Registry integration must resolve these refs before supplying verified records. */
export type FixtureEvidence = {
  products?: {
    requirementId: string;
    productId: string;
    registryRef: string;
    sourceUrl: string;
    qualification: "verified" | "candidate";
    claims?: string[];
    matchedMaterialIds?: MaterialId[];
    stockDimensions?: V3;
    requiredUnits: number;
    quantityRecordRefs?: string[];
    unitsPerPackage: number;
    packages: number;
    availability?: {
      storeId: string;
      zip: string;
      observedAt: string;
      availablePackages: number;
    };
  }[];
  tools?: {
    requirementId: string;
    choice: "owned" | "buy" | "rent";
    capabilityRef: string;
    productRegistryRef?: string;
  }[];
  operations?: {
    requirementId: string;
    recordRefs: string[];
    partIds: string[];
    sourceRefs: string[];
  }[];
  decisions?: {
    requirementId: string;
    resolution: string;
    reviewRef: string;
    sourceRefs: string[];
  }[];
  storeTargets?: { storeId: string; zip: string }[];
};
export type FixtureMissing = {
  id: string;
  title: string;
  reason: string;
  sourceRefs: string[];
};
const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const httpsSource = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};
export function evaluateBuildFixture(
  baseline: BuildFixtureBaseline,
  evidence: FixtureEvidence = {},
  now = Date.now(),
) {
  const definition = getBuildFixture(baseline.fixtureId),
    project = projectSchema.parse(baseline.project),
    geometry = actualGeometry({ ...baseline, project }),
    cutRows = fixtureCutTable(project),
    purchaseRows = bom(project),
    partIds = new Set(project.pieces.map((p) => p.id));
  const missing = (r: FixtureRequirement, reason: string): FixtureMissing => ({
    id: r.id,
    title: r.title,
    reason,
    sourceRefs: r.sourceRefs,
  });
  const missingGeometry = definition.geometry.flatMap((r) => {
    const reason = geometry.get(r.id);
    return reason === null
      ? []
      : [
          missing(
            r,
            reason ??
              "No geometry verifier implements this required fixture feature.",
          ),
        ];
  });
  const missingOperations = definition.operations.flatMap((r) => {
    const row = evidence.operations?.find((e) => e.requirementId === r.id);
    const valid =
      row &&
      row.recordRefs.length > 0 &&
      row.recordRefs.every(hasText) &&
      row.partIds.length > 0 &&
      row.partIds.every((id) => partIds.has(id)) &&
      row.sourceRefs.length > 0 &&
      row.sourceRefs.every(hasText);
    return valid
      ? []
      : [
          missing(
            r,
            "A real operation ledger record with existing part references and its design/manufacturer source is required.",
          ),
        ];
  });
  if (cutRows.some((r) => !r.stockFits))
    missingOperations.push({
      id: "operation.stock-fit",
      title: "Resolve oversized cuts",
      reason:
        "Some actual cut boxes exceed their selected stock; no complete purchase estimate can be accepted.",
      sourceRefs: [],
    });
  const missingProducts: FixtureMissing[] = [],
    missingAvailability: FixtureMissing[] = [];
  const traceableProducts: {
    requirementId: string;
    productId: string;
    registryRef: string;
    sourceUrl: string;
    requiredUnits: number;
    packages: number;
  }[] = [];
  const matched = new Set<MaterialId>();
  for (const r of definition.products) {
    const row = evidence.products?.find((e) => e.requirementId === r.id);
    let reason =
      "A qualified exact product/variant and registry/source reference have not been supplied.";
    let valid =
      !!row &&
      row.qualification === "verified" &&
      hasText(row.productId) &&
      hasText(row.registryRef) &&
      httpsSource(row.sourceUrl);
    if (valid && row) {
      if (
        r.requiredUnits === null &&
        (!row.quantityRecordRefs?.length ||
          row.quantityRecordRefs.some(
            (ref) =>
              !evidence.operations?.some(
                (op) =>
                  op.recordRefs.includes(ref) &&
                  op.sourceRefs.length > 0 &&
                  op.partIds.length > 0 &&
                  op.partIds.every((id) => partIds.has(id)),
              ),
          ))
      ) {
        valid = false;
        reason =
          "Required installed quantity remains unresolved; a product match alone cannot invent the attachment schedule.";
      }
      const actualRequired = r.materialIds
        ? purchaseRows
            .filter((b) => r.materialIds!.includes(b.id))
            .reduce((n, b) => n + b.quantity, 0)
        : r.requiredUnits;
      if (
        actualRequired !== undefined &&
        actualRequired !== null &&
        !near(row.requiredUnits, actualRequired)
      ) {
        valid = false;
        reason =
          "The product quantity does not match the actual stock takeoff or required fixture component count.";
      }
      if (
        !Number.isFinite(row.requiredUnits) ||
        row.requiredUnits < 0 ||
        !Number.isInteger(row.unitsPerPackage) ||
        row.unitsPerPackage <= 0 ||
        !Number.isInteger(row.packages) ||
        row.packages !== Math.ceil(row.requiredUnits / row.unitsPerPackage)
      ) {
        valid = false;
        reason =
          "A valid installed-unit to purchase-package conversion is required.";
      }
      if (r.claims?.some((claim) => !row.claims?.includes(claim))) {
        valid = false;
        reason =
          "A required environment/system/equipment compatibility claim lacks registry qualification.";
      }
      if (r.materialIds?.some((id) => !row.matchedMaterialIds?.includes(id))) {
        valid = false;
        reason =
          "The exact physical stock variant has not been matched to each required material ID.";
      }
      if (
        r.materialIds &&
        (!row.stockDimensions ||
          r.materialIds.some((id) =>
            [...(material(id).stockSize ?? material(id).size)]
              .sort((a, b) => a - b)
              .some(
                (n, i) =>
                  !near(n, [...row.stockDimensions!].sort((a, b) => a - b)[i]),
              ),
          ))
      ) {
        valid = false;
        reason =
          "Physical stock dimensions differ or are missing; nominal title matching is insufficient.";
      }
    }
    if (!valid || !row) {
      missingProducts.push(missing(r, reason));
      continue;
    }
    r.materialIds?.forEach((id) => matched.add(id));
    traceableProducts.push({
      requirementId: r.id,
      productId: row.productId,
      registryRef: row.registryRef,
      sourceUrl: row.sourceUrl,
      requiredUnits: row.requiredUnits,
      packages: row.packages,
    });
    const inventory = row.availability,
      age = inventory ? now - Date.parse(inventory.observedAt) : NaN;
    if (
      !inventory ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 86400000 ||
      inventory.zip !== project.zip ||
      !evidence.storeTargets?.some(
        (t) => t.storeId === inventory.storeId && t.zip === inventory.zip,
      ) ||
      !Number.isInteger(inventory.availablePackages) ||
      inventory.availablePackages < row.packages
    )
      missingAvailability.push(
        missing(
          r,
          "A fresh matching selected-store/ZIP observation with sufficient purchasable packages is required; a manufacturer page is not live stock evidence.",
        ),
      );
  }
  for (const id of new Set(
    project.pieces.filter((p) => !p.offcut).map((p) => p.material),
  ))
    if (
      !matched.has(id) &&
      !missingProducts.some((r) =>
        definition.products
          .find((d) => d.id === r.id)
          ?.materialIds?.includes(id),
      )
    )
      missingProducts.push({
        id: `material.unmatched.${id}`,
        title: `Trace actual ${material(id).name}`,
        reason:
          "This actual baseline material has no qualified requirement/product mapping. Geometry placeholders are not purchase recommendations.",
        sourceRefs: [],
      });
  const missingTools = definition.tools.flatMap((r) => {
    const row = evidence.tools?.find((t) => t.requirementId === r.id);
    return row &&
      hasText(row.capabilityRef) &&
      (row.choice === "owned" || hasText(row.productRegistryRef))
      ? []
      : [
          missing(
            r,
            "Choose owned, buy or rent with an actual capability record; purchases/rentals also need a product/provider record.",
          ),
        ];
  });
  const missingDecisions = definition.decisions.flatMap((r) => {
    const row = evidence.decisions?.find((d) => d.requirementId === r.id);
    return row &&
      hasText(row.resolution) &&
      hasText(row.reviewRef) &&
      row.sourceRefs.length > 0 &&
      row.sourceRefs.every(hasText)
      ? []
      : [
          missing(
            r,
            "This design/site/equipment decision requires an explicit resolution, review reference and supporting source.",
          ),
        ];
  });
  const digitalReady = ![
      missingGeometry,
      missingOperations,
      missingProducts,
      missingTools,
    ].some((a) => a.length),
    buildReady =
      digitalReady && !missingDecisions.length && !missingAvailability.length;
  return {
    fixtureId: baseline.fixtureId,
    version: baseline.version,
    baselineScope: definition.baselineScope,
    digitalReady,
    buildReady,
    cutRows,
    purchaseRows,
    traceableProducts,
    missingGeometry,
    missingOperations,
    missingProducts,
    missingTools,
    missingDecisions,
    missingAvailability,
    notice:
      "Fixture evidence completeness is not structural engineering, trade installation approval, code certification, or proof that a source attestation is authentic.",
  };
}
export function exportBuildFixture(
  baseline: BuildFixtureBaseline,
  evidence: FixtureEvidence = {},
) {
  return JSON.stringify(
    {
      format: "yardwork-build-acceptance",
      formatVersion: 1,
      fixture: getBuildFixture(baseline.fixtureId),
      baseline: { ...baseline, project: projectSchema.parse(baseline.project) },
      evidence,
      assessment: evaluateBuildFixture(baseline, evidence),
    },
    null,
    2,
  );
}
export function importBuildFixture(json: string): {
  baseline: BuildFixtureBaseline;
  evidence: FixtureEvidence;
} {
  const raw = z
    .object({
      format: z.literal("yardwork-build-acceptance"),
      formatVersion: z.literal(1),
      baseline: z.object({
        fixtureId: z.enum(buildFixtureIds),
        version: z.literal(1),
        baselineScope: z.string(),
        project: projectSchema,
      }),
      evidence: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(JSON.parse(json));
  // Only the plan and fixture identity are trusted on import. Documentary evidence requires registry re-resolution.
  return {
    baseline: {
      ...raw.baseline,
      baselineScope: getBuildFixture(raw.baseline.fixtureId).baselineScope,
    },
    evidence: {},
  };
}
