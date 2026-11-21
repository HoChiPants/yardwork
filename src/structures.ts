import { Euler, Matrix4, Vector3 } from "three";
import { cedarbrookLining } from "./saunaLiningReference";
import { cedarbrookDoor } from "./saunaDoorReference";
import { cedarbrookBenchInstructions, saunaPedestalRole } from "./saunaBenchReference";
import { cedarbrookFoil } from "./saunaFoilReference";
import { saunaCeilingBatt, saunaCeilingBattRole } from "./saunaCeilingReference";
import { saunaFramingEnvelope } from "./saunaCeilingCoverage";
import { foilBlankSize, saunaCeilingFoilRole, saunaFoilLayout, saunaWallFoilRole } from "./saunaFoil";
import {
  greenhouseParamsSchema,
  saunaParamsSchema,
  closetParamsSchema,
  caseworkShelvesParamsSchema,
  type GreenhouseParams,
  type SaunaCabinParams,
  type ClosetInsertParams,
  type CaseworkShelvesParams,
} from "./recipeSchemas";
export {
  greenhouseParamsSchema,
  saunaParamsSchema,
  closetParamsSchema,
  caseworkShelvesParamsSchema,
  type GreenhouseParams,
  type SaunaCabinParams,
  type ClosetInsertParams,
  type CaseworkShelvesParams,
} from "./recipeSchemas";
import {
  material,
  catalog,
  materialIds,
  maxPartDimension,
  part,
  projectSchema,
  step,
  uid,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { bounds, bom } from "./engine";
import { clipBox, endCutPlane, type CutPlane } from "./cutProfiles";
import { composeRotation, rotate } from "./spatial";
import { checkProductBinding, findRetailerProduct } from "./retailerCatalog";
import { everbiltClosetRod } from "./closetRodReference";
import { greenhouseBaseRailRoles as baseRoles } from "./greenhouseBaseReference";
import { wallCavities, type WallRectangle } from "./wallCavities";

export type StructureRole =
  | "frameLumber"
  | "ridgeLumber"
  | "greenhouseBase"
  | "caseworkPanels"
  | "greenhouseGlazing"
  | "saunaInterior"
  | "saunaBenchFrame"
  | "saunaBench"
  | "saunaInsulation"
  | "saunaCeilingJoists"
  | "saunaCeilingInsulation"
  | "saunaVaporBarrier"
  | "saunaDoor"
  | "closetRod"
  | "closetRodSupport";
export type StructureMaterials = Partial<
  Record<StructureRole, { materialId: MaterialId; productRegistryRef: string }>
>;
export type StructureIssue = {
  id: string;
  reason: string;
  sourceRefs: string[];
};
export type StructureResult = {
  project: Project;
  addedSectionIds: string[];
  geometryRoles: Record<string, string[]>;
  cutRequirements: {
    partId: string;
    materialId: MaterialId;
    blankSize: V3;
    cutPlanes: CutPlane[];
    operation: "dimensioned-cut" | "profile-cut";
  }[];
  missingMaterials: StructureIssue[];
  unresolved: StructureIssue[];
  referenceVolumes: { role: string; min: V3; max: V3; meaning: string }[];
  dimensions: Record<string, number>;
  qualifiedForConstruction: false;
};
const sourceRefs = {
  greenhouse: [
    "https://www.palram.com/us/product/suntuf-diy-polycarbonate-corrugated-sheets/",
  ],
  sauna: [
    "https://cdn.shopify.com/s/files/1/0555/6355/0889/files/Kip_USA_CN_ENFR_Y05-0623_02052023.pdf?v=1683043679",
  ],
  closet: [
    "https://www.homebyames.com/on/demandware.static/-/Sites-root_b2c_closetmaid_catalog/default/dwb1847f29/installationPDFs/3217500_inst.pdf",
  ],
};
const specialRoles = new Set<StructureRole>([
  "caseworkPanels",
  "greenhouseGlazing",
  "greenhouseBase",
  "saunaInterior",
  "saunaBenchFrame",
  "saunaBench",
  "saunaInsulation",
  "saunaCeilingJoists",
  "saunaCeilingInsulation",
  "saunaVaporBarrier",
  "saunaDoor",
  "closetRod",
  "closetRodSupport",
]);
/** Read suitability from a trusted registry record only. Caller-supplied verifiedRole flags are never consumed. */
export function resolveStructureMaterial(
  role: StructureRole,
  selections: StructureMaterials,
  missing: StructureIssue[],
  expected: { wood?: boolean; kind?: string },
  fallback?: MaterialId,
  constraints?: StructureIssue[],
): MaterialId | null {
  const selected = selections[role];
  if (!selected) {
    missing.push({
      id: `material.${role}`,
      reason: fallback
        ? `Using generic ${material(fallback).name} dimensions for geometry only. Exact product, grade/species, exposure and installation suitability are unresolved.`
        : `No source-qualified ${role} material/product has been selected; no substitute part is generated.`,
      sourceRefs: [],
    });
    return fallback ?? null;
  }
  if (!materialIds.includes(selected.materialId))
    throw Error(`Unknown material selected for ${role}.`);
  const m = material(selected.materialId);
  if (role === "greenhouseBase" && m.productReference !== selected.productRegistryRef)
    throw Error("Choose the exact catalog timber for the greenhouse base.");
  if (m.placementOnly)
    throw Error(
      "This stock is available for individual placement, with no reviewed application in generated structures. Choose another frame material for this build.",
    );
  const reference = m.productReference && findRetailerProduct(m.productReference);
  if (
    reference && reference.limitToQualifiedRoles &&
    !reference.roleQualifications.some((qualification) => qualification.role === role)
  )
    throw Error(`The reviewed scope for ${m.name} does not cover ${role}.`);
  if (
    (expected.wood !== undefined && m.wood !== expected.wood) ||
    (expected.kind && m.stockKind !== expected.kind)
  )
    throw Error(
      `${role} needs ${expected.wood ? "wood" : "non-wood"} ${expected.kind ?? "stock"}; incompatible material is not substituted.`,
    );
  const product = findRetailerProduct(selected.productRegistryRef);
  if (!product) {
    missing.push({
      id: `material.${role}`,
      reason: "The selected product registry reference does not exist.",
      sourceRefs: [],
    });
    return specialRoles.has(role) ? null : selected.materialId;
  }
  const binding = checkProductBinding(m, product);
  if (!binding.compatible) {
    missing.push({
      id: `material.${role}`,
      reason: `Product binding is unqualified: ${binding.issues.join(" ")}`,
      sourceRefs: product.sources.map((s) => s.url),
    });
    return specialRoles.has(role) ? null : selected.materialId;
  }
  if (specialRoles.has(role)) {
    const proof = product.roleQualifications.find(
      (q) =>
        q.role === role &&
        q.sourceRefs.length > 0 &&
        q.sourceRefs.every((url) =>
          product.sources.some((source) => source.url === url),
        ),
    );
    if (!proof) {
      missing.push({
        id: `material.${role}`,
        reason:
          "Matching dimensions and product identity do not establish the required material chemistry, heat-environment or system suitability. The trusted registry has no reviewed role qualification.",
        sourceRefs: product.sources.map((s) => s.url),
      });
      return null;
    }
  }
  const qualification = product.roleQualifications.find((q) => q.role === role);
  if (qualification && constraints)
    constraints.push({
      id: `material.${role}.installation`,
      reason: `${qualification.scope} ${qualification.requirements.join(" ")}`,
      sourceRefs: qualification.sourceRefs,
    });
  return selected.materialId;
}
export function structureMaterialChoices(role: StructureRole) {
  const expected =
    role === "caseworkPanels"
      ? { wood: true, kind: "sheet" }
      : role === "greenhouseGlazing" || role === "saunaInsulation" || role === "saunaCeilingInsulation"
        ? { wood: false, kind: "sheet" }
        : role === "closetRod"
          ? { wood: false, kind: "linear" }
          : role === "closetRodSupport"
            ? { wood: false, kind: "connector" }
            : role === "saunaVaporBarrier"
              ? { wood: false, kind: "roll" }
            : role === "saunaDoor" || role === "saunaBench"
              ? { wood: false, kind: "equipment" }
              : { wood: true, kind: "linear" };
  return catalog.flatMap((m) => {
    if (
      !m.productReference ||
      m.placementOnly ||
      m.wood !== expected.wood ||
      m.stockKind !== expected.kind
    )
      return [];
    const product = findRetailerProduct(m.productReference);
    if (!product || !checkProductBinding(m, product).compatible) return [];
    const qualification = product.roleQualifications.find(
      (q) =>
        q.role === role &&
        q.sourceRefs.length > 0 &&
        q.sourceRefs.every((url) =>
          product.sources.some((source) => source.url === url),
        ),
    );
    if ((specialRoles.has(role) || product.limitToQualifiedRoles) && !qualification) return [];
    return [
      {
        materialId: m.id,
        productRegistryRef: product.id,
        label: product.name,
        scope:
          qualification?.scope ??
          "Source-exact identity and dimensions only; structural and environmental suitability remain unqualified.",
        requirements: qualification?.requirements ?? [],
        sourceUrls:
          qualification?.sourceRefs ?? product.sources.map((s) => s.url),
      },
    ];
  });
}
function stockCross(id: MaterialId) {
  const sizes = [...material(id).size].sort((a, b) => a - b);
  return { a: sizes[0], b: sizes[1] };
}
function positions(length: number, spacing: number, edge: number) {
  const values = [-length / 2 + edge];
  for (
    let x = -length / 2 + spacing;
    x < length / 2 - edge - 0.01;
    x += spacing
  )
    values.push(x);
  const end = length / 2 - edge;
  if (values.at(-1)! < end - 0.001) {
    // The regular grid and final member can otherwise occupy the same wood.
    // Keep the end/member sizes and move only a colliding last grid center.
    const last = values.length - 1, minimumSeparation = 2 * edge;
    if (last > 0 && end - values[last] < minimumSeparation - 1e-9) {
      const adjusted = end - minimumSeparation;
      if (adjusted - values[last - 1] < minimumSeparation - 1e-9)
        values.pop();
      else values[last] = adjusted;
    }
    values.push(end);
  }
  return values;
}
function orientation(x: V3, y: V3, z: V3): V3 {
  const matrix = new Matrix4().makeBasis(
      new Vector3(...x),
      new Vector3(...y),
      new Vector3(...z),
    ),
    e = new Euler().setFromRotationMatrix(matrix);
  return [e.x, e.y, e.z];
}
function builder(project: Project, title: string, origin: V3, yaw: number) {
  const next = structuredClone(project),
    addedSectionIds: string[] = [],
    geometryRoles: Record<string, string[]> = {},
    cutRequirements: StructureResult["cutRequirements"] = [],
    baseRotation: V3 = [0, (yaw * Math.PI) / 180, 0];
  function group(name: string, role: string) {
    const phase = step(
        `Assemble ${name}`.slice(0, 120),
        "Dimensional design study. Resolve material qualification, all intended attachments, support and installation details before building.",
      ),
      members: Piece[] = [];
    next.steps.push(phase);
    function add(
      label: string,
      id: MaterialId,
      size: V3,
      position: V3,
      rotation: V3 = [0, 0, 0],
      cutPlanes: CutPlane[] = [],
      foilReturns?: Piece["foilReturns"],
    ) {
      if (size.some((v) => !Number.isFinite(v) || v <= 0))
        throw Error(`${label}: no positive stock remains at these dimensions.`);
      if (size.some((v) => v > maxPartDimension))
        throw Error(`${name} · ${label} exceeds the ${maxPartDimension} in workspace part limit. Reduce the study dimensions.`);
      if (cutPlanes.length) clipBox(size, cutPlanes);
      const p: Piece = {
        ...part(
          `${name} · ${label}`,
          id,
          size,
          rotate(position, baseRotation).map((v, i) => v + origin[i]) as V3,
          phase.id,
          name,
          composeRotation(baseRotation, rotation),
        ),
        cutPlanes,
        ...(foilReturns ? { foilReturns } : {}),
        stockLengthAxis: material(id).orderRollWidth ? 0 : ["glazing-envelope", "tube-envelope", "insulation-batt"].includes(
          material(id).shape ?? "",
        )
          ? (1 as const)
          : null,
      };
      members.push(p);
      next.pieces.push(p);
      geometryRoles[role] = [...(geometryRoles[role] ?? []), p.id];
      if (material(id).cuttable || material(id).orderRollWidth)
        cutRequirements.push({
          partId: p.id,
          materialId: id,
          blankSize: material(id).orderRollWidth ? foilBlankSize(p) : [...size],
          cutPlanes,
          operation: cutPlanes.length ? "profile-cut" : "dimensioned-cut",
        });
      return p;
    }
    function finish() {
      if (!members.length) {
        next.steps = next.steps.filter((s) => s.id !== phase.id);
        return;
      }
      const id = uid();
      addedSectionIds.push(id);
      next.sections.push({
        id,
        name,
        pieceIds: members.map((p) => p.id),
        origin,
        rotation: baseRotation,
        generator: null,
        recipe: null,
      });
    }
    return { add, finish, phase };
  }
  function finish(
    missingMaterials: StructureIssue[],
    unresolved: StructureIssue[],
    dimensions: Record<string, number>,
    referenceVolumes: StructureResult["referenceVolumes"] = [],
  ): StructureResult {
    next.guideFingerprint = null;
    const parsed = projectSchema.parse(next);
    for (const requirement of cutRequirements.filter((c) => c.cutPlanes.length))
      if (
        !parsed.pieces.find((p) => p.id === requirement.partId)?.cutPlanes
          ?.length
      )
        throw Error(
          "This project schema cannot retain required profile cuts; update the cut-profile schema before applying the structure.",
        );
    const ids = new Set(
        addedSectionIds.flatMap(
          (id) => parsed.sections.find((s) => s.id === id)!.pieceIds,
        ),
      ),
      newParts = parsed.pieces.filter((p) => ids.has(p.id));
    const oversized = bom(parsed)
      .flatMap((r) => r.oversizedParts)
      .filter((p) => ids.has(p.id));
    if (oversized.length)
      unresolved.push({
        id: "stock-fit",
        reason: `${oversized.length} new part(s) exceed the selected stock. Choose longer/larger verified stock or revise the geometry.`,
        sourceRefs: [],
      });
    if (
      parsed.workZone &&
      newParts.some((p) => {
        const b = bounds(p),
          z = parsed.workZone!;
        return (
          b.min[0] < -z.width / 2 - 0.001 ||
          b.max[0] > z.width / 2 + 0.001 ||
          b.min[2] < -z.depth / 2 - 0.001 ||
          b.max[2] > z.depth / 2 + 0.001 ||
          b.min[1] < -0.001 ||
          b.max[1] > z.height + 0.001
        );
      })
    )
      unresolved.push({
        id: "work-zone-fit",
        reason:
          "Actual generated extents exceed the current work zone, including any opening mechanism. Review placement/space before use.",
        sourceRefs: [],
      });
    const notes = [
      `${title} — PARTIAL DIMENSIONAL STUDY`,
      ...missingMaterials.map((i) => `Missing material: ${i.id}: ${i.reason}`),
      ...unresolved.map((i) => `Unresolved: ${i.id}: ${i.reason}`),
    ].join("\n");
    if (parsed.notes.length + notes.length + 2 > 10000)
      throw Error(
        "Project notes cannot retain this structure's unresolved decisions. Shorten existing notes before adding it.",
      );
    parsed.notes = [parsed.notes, notes].filter(Boolean).join("\n\n");
    return {
      project: parsed,
      addedSectionIds,
      geometryRoles,
      cutRequirements,
      missingMaterials,
      unresolved,
      referenceVolumes,
      dimensions,
      qualifiedForConstruction: false,
    };
  }
  return { group, finish };
}
function addWall(
  add: ReturnType<ReturnType<typeof builder>["group"]>["add"],
  id: MaterialId,
  width: number,
  height: number,
  x: number,
  z: number,
  rotation: V3 = [0, 0, 0],
  baseY = 0,
) {
  const { a, b } = stockCross(id);
  if (width <= 2 * a || height <= 2 * a)
    throw Error("Wall dimensions are too small for the selected stock.");
  const local = (p: V3) =>
    rotate(p, rotation).map((v, i) => v + [x, baseY, z][i]) as V3;
  add("bottom plate", id, [width, a, b], local([0, a / 2, 0]), rotation);
  const top = add("top plate", id, [width, a, b], local([0, height - a / 2, 0]), rotation);
  for (const q of positions(width, 16, a / 2))
    add(
      "stud",
      id,
      [a, height - 2 * a, b],
      local([q, height / 2, 0]),
      rotation,
    );
  return top;
}
function frontWithDoor(
  add: ReturnType<ReturnType<typeof builder>["group"]>["add"],
  id: MaterialId,
  width: number,
  wallTop: number,
  baseY: number,
  z: number,
  doorWidth: number,
  doorHeight: number,
) {
  const { a, b } = stockCross(id),
    headerBottom = baseY + doorHeight,
    headerTop = headerBottom + b;
  if (doorWidth + 4 * a >= width - 2 * a || headerTop > wallTop - a + 0.001)
    throw Error(
      "The requested door does not fit its jamb framing, header and plates. Increase the wall width or height, or revise the opening.",
    );
  const top = add("top plate", id, [width, a, b], [0, wallTop - a / 2, z]);
  const run = (width - doorWidth) / 2;
  const plateTop = baseY + a;
  for (const sign of [-1, 1]) {
    const x = sign * (doorWidth / 2 + run / 2);
    add("bottom plate beside opening", id, [run, a, b], [x, baseY + a / 2, z]);
    add(
      "king stud beside opening",
      id,
      [a, wallTop - a - plateTop, b],
      [sign * (doorWidth / 2 + 1.5 * a), (plateTop + wallTop - a) / 2, z],
    );
    add(
      "jack stud under header",
      id,
      [a, headerBottom - plateTop, b],
      [sign * (doorWidth / 2 + a / 2), (plateTop + headerBottom) / 2, z],
    );
  }
  for (const x of positions(width, 16, a / 2))
    if (Math.abs(x) >= doorWidth / 2 + 2.5 * a)
      add(
        "stud beside opening",
        id,
        [a, wallTop - baseY - 2 * a, b],
        [x, (baseY + wallTop) / 2, z],
      );
  add("door header", id, [doorWidth + 2 * a, b, a], [0, headerBottom + b / 2, z]);
  const cripple = wallTop - a - headerTop;
  if (cripple > 0.001)
    for (const x of positions(doorWidth, 16, a / 2))
      add(
        "stud above header",
        id,
        [a, cripple, b],
        [x, headerTop + cripple / 2, z],
      );
  return top;
}

/** Outside eave/ridge roof-line dimensions; the wall plate is lower by the actual rafter depth/cos(pitch). */
function greenhouseWallTop(eaveHeight: number, pitch: number, rafterDepth: number, glazingThickness: number) {
  return eaveHeight - (rafterDepth + glazingThickness) / Math.cos(pitch);
}

/** Geometric fit for a fresh study using the default unglazed frame and base stock. */
export function greenhouseStudyDoorHeight(p: Pick<GreenhouseParams, "width" | "eaveHeight" | "roofRise">) {
  const { a, b } = stockCross("stud");
  const pitch = Math.atan(p.roofRise / (p.width / 2));
  const available = greenhouseWallTop(p.eaveHeight, pitch, b, 0);
  return Math.floor(available - a - b - b);
}

export function buildGreenhouse(
  project: Project,
  raw: GreenhouseParams,
  selections: StructureMaterials = {},
): StructureResult {
  const p = greenhouseParamsSchema.parse(raw),
    missing: StructureIssue[] = [],
    unresolved: StructureIssue[] = [
      {
        id: "greenhouse-loads",
        reason:
          "Site wind/snow loads, framing grade/species, spans, bracing and foundation/anchors are not qualified.",
        sourceRefs: sourceRefs.greenhouse,
      },
      {
        id: "roof-bearing",
        reason:
          "Rafters have real plumb-cut geometry, but birdsmouths, rafter hangers/bearings, tie-downs and their installation schedules are not generated or approved.",
        sourceRefs: [],
      },
      {
        id: "greenhouse-glazing-system",
        reason:
          "Glazing panels, gable cut shapes, closures/flashings, expansion holes, washered fasteners and drainage details require a selected qualified glazing system.",
        sourceRefs: sourceRefs.greenhouse,
      },
      {
        id: "greenhouse-ventilation",
        reason:
          "An opening roof vent, its framed opening, hardware, vent sizing/control and condensation plan remain unrepresented.",
        sourceRefs: sourceRefs.greenhouse,
      },
      {
        id: "door-hardware",
        reason:
          "The closed/open door frame is a dimensional pivot preview. Actual hinges, latch, stops, glazing and mounting hardware are unspecified and unpriced.",
        sourceRefs: [],
      },
    ];
  const frame = resolveStructureMaterial(
      "frameLumber",
      selections,
      missing,
      { wood: true, kind: "linear" },
      "stud",
    )!,
    ridge = resolveStructureMaterial(
      "ridgeLumber",
      selections,
      missing,
      { wood: true, kind: "linear" },
      "two-six",
    )!,
    { a, b } = stockCross(frame),
    ridgeCross = stockCross(ridge),
    baseStock = selections.greenhouseBase
      ? resolveStructureMaterial("greenhouseBase", selections, missing, { wood: true, kind: "linear" }, undefined, unresolved)
      : frame,
    pitch = Math.atan(p.roofRise / (p.width / 2)),
    run = (p.width - ridgeCross.a) / 2,
    glazing = resolveStructureMaterial(
      "greenhouseGlazing",
      selections,
      missing,
      { wood: false, kind: "sheet" },
      undefined,
      unresolved,
    ),
    glazingT = glazing ? Math.min(...material(glazing).size) : 0,
    frameW = p.width - 2 * glazingT,
    frameD = p.depth - 2 * glazingT,
    wallTop = greenhouseWallTop(p.eaveHeight, pitch, b, glazingT),
    build = builder(project, "Greenhouse", p.origin, p.yaw);
  if (!baseStock) throw Error("The selected greenhouse base has no reviewed stock match.");
  const { a: baseWidth, b: baseY } = stockCross(baseStock);
  if (p.width <= 2 * b || p.depth <= 2 * b || wallTop <= baseY + 2 * a)
    throw Error("The frame does not fit its selected stock and roof geometry.");
  if (frameW <= 2 * baseWidth || frameD <= 2 * baseWidth)
    throw Error("The greenhouse footprint is too small for the selected perimeter rails.");
  const base = build.group("Greenhouse base", "base-framing");
  for (const [role, sign] of [["back", -1], ["front", 1]] as const) {
    const z = sign * (frameD - baseWidth) / 2;
    base.add("perimeter rail", baseStock, [frameW, baseY, baseWidth], [0, baseY / 2, z]).designRole = baseRoles[role];
  }
  for (const [role, sign] of [["left", -1], ["right", 1]] as const) {
    const x = sign * (frameW - baseWidth) / 2;
    base.add("perimeter rail", baseStock, [baseWidth, baseY, frameD - 2 * baseWidth], [x, baseY / 2, 0]).designRole = baseRoles[role];
  }
  base.finish();
  const walls = build.group("Greenhouse walls", "wall-framing");
  addWall(
    walls.add,
    frame,
    frameW,
    wallTop - baseY,
    0,
    -frameD / 2 + b / 2,
    [0, 0, 0],
    baseY,
  ).designRole = "greenhouse-end-plate";
  for (const sign of [-1, 1])
    addWall(
      walls.add,
      frame,
      frameD - 2 * b,
      wallTop - baseY,
      sign * (frameW / 2 - b / 2),
      0,
      [0, Math.PI / 2, 0],
      baseY,
    ).designRole = "greenhouse-eave-plate";
  walls.finish();
  const front = build.group("Greenhouse door opening", "door-opening-framing");
  frontWithDoor(
    front.add,
    frame,
    frameW,
    wallTop,
    baseY,
    frameD / 2 - b / 2,
    p.doorWidth,
    p.doorHeight,
  ).designRole = "greenhouse-end-plate";
  front.finish();
  const door = build.group("Greenhouse door frame", "door-leaf");
  const gap = 0.125,
    leafW = p.doorWidth - 2 * gap,
    leafH = p.doorHeight - 2 * gap,
    hinge: V3 = [-leafW / 2, baseY + gap, frameD / 2],
    doorRotation: V3 = [0, (-p.doorSwing * Math.PI) / 180, 0];
  const doorAdd = (label: string, size: V3, position: V3) =>
    door.add(
      label,
      frame,
      size,
      rotate(position, doorRotation).map((v, i) => v + hinge[i]) as V3,
      doorRotation,
    );
  for (const x of [b / 2, leafW - b / 2])
    doorAdd("stile", [b, leafH, a], [x, leafH / 2, -a / 2]);
  for (const y of [b / 2, leafH - b / 2])
    doorAdd("rail", [leafW - 2 * b, b, a], [leafW / 2, y, -a / 2]);
  door.finish();
  const rafterCenters = positions(frameD, p.rafterSpacing, a / 2),
    slopeLength = p.width / (2 * Math.cos(pitch)),
    roofVent = p.roofVent;
  const roofFrame = (side: number) =>
    orientation(
      [0, 0, -side],
      [-side * Math.cos(pitch), Math.sin(pitch), 0],
      [side * Math.sin(pitch), Math.cos(pitch), 0],
    );
  const roofPoint = (
    side: number,
    alongDepth: number,
    downslope: number,
    outward: number,
  ): V3 => [
    side * (downslope * Math.cos(pitch) + outward * Math.sin(pitch)),
    p.eaveHeight +
      p.roofRise -
      downslope * Math.sin(pitch) +
      outward * Math.cos(pitch),
    alongDepth,
  ];
  let vent: {
    side: number;
    back: number;
    front: number;
    upper: number;
    lower: number;
  } | null = null;
  if (roofVent) {
    const back = rafterCenters[roofVent.bay - 1] + a / 2,
      front = rafterCenters[roofVent.bay] - a / 2,
      upper = roofVent.ridgeOffset,
      lower = upper + roofVent.length;
    if (
      !Number.isFinite(back) ||
      !Number.isFinite(front) ||
      front - back <= 2 * b + 0.25
    )
      throw Error(
        "Choose a rafter bay wide enough for the vent frame. Bays are numbered from the greenhouse back.",
      );
    // Keep the supported cross-members away from the sloped end cuts and ridge.
    const firstFullRafterDepth =
      (ridgeCross.a / 2 + (b + glazingT) * Math.sin(pitch)) / Math.cos(pitch);
    if (upper - a < firstFullRafterDepth || lower + a > slopeLength)
      throw Error(
        "The vent and its blocking must fit within the full-depth rafters. Adjust the ridge setback or shorten the opening.",
      );
    if (roofVent.length <= 2 * b + 0.25)
      throw Error("Increase the vent length to fit both sash rails.");
    if (
      glazing &&
      front - back - 0.25 >
        [...(material(glazing).stockSize ?? material(glazing).size)].sort(
          (x, y) => x - y,
        )[1] +
          1e-7
    )
      throw Error(
        "The selected glazing is too narrow for a single sash panel. Choose a narrower bay or reduce the rafter spacing.",
      );
    vent = {
      side: roofVent.side === "right" ? 1 : -1,
      back,
      front,
      upper,
      lower,
    };
  }
  const roof = build.group("Greenhouse roof", "roof-framing"),
    woodRidgeTop =
      p.eaveHeight +
      p.roofRise -
      (glazing
        ? glazingT / Math.cos(pitch) + (ridgeCross.a / 2) * Math.tan(pitch)
        : 0),
    ridgeY = woodRidgeTop - ridgeCross.b / 2;
  roof.add(
    "ridge",
    ridge,
    [ridgeCross.a, ridgeCross.b, frameD],
    [0, ridgeY, 0],
  ).designRole = "greenhouse-ridge";
  const blankLength = (run + b * Math.sin(pitch)) / Math.cos(pitch),
    eaveCenterY = p.eaveHeight - (b / 2 + glazingT) / Math.cos(pitch),
    riseToRidgeFace = run * Math.tan(pitch),
    midY = eaveCenterY + riseToRidgeFace / 2;
  for (const z of rafterCenters)
    for (const side of [-1, 1]) {
      const rotation = roofFrame(side),
        size: V3 = [a, blankLength, b];
      roof.add(
        "plumb-cut rafter",
        frame,
        size,
        [(side * (p.width / 2 + ridgeCross.a / 2)) / 2, midY, z],
        rotation,
        [
          endCutPlane(size, 1, false, (-pitch * 180) / Math.PI, 2),
          endCutPlane(size, 1, true, (-pitch * 180) / Math.PI, 2),
        ],
      ).designRole = "greenhouse-rafter";
    }
  roof.finish();
  if (vent) {
    const rotation = roofFrame(vent.side),
      centered = (vent.back + vent.front) / 2,
      wide = vent.front - vent.back,
      hingeGap = 0.125,
      sashWidth = wide - 2 * hingeGap,
      sashLength = vent.lower - vent.upper - 2 * hingeGap,
      mid = (vent.lower + vent.upper) / 2;
    const fixed = build.group(
      "Greenhouse roof vent opening",
      "roof-vent-opening",
    );
    for (const [label, q] of [
      ["ridge-side blocking", vent.upper - a / 2],
      ["eave-side blocking", vent.lower + a / 2],
    ] as const)
      fixed.add(
        label,
        frame,
        [wide, a, b],
        roofPoint(vent.side, centered, q, -glazingT - b / 2),
        rotation,
      );
    fixed.finish();

    const sash = build.group("Greenhouse roof vent sash", "roof-vent-sash");
    for (const z of [
      centered - (sashWidth - b) / 2,
      centered + (sashWidth - b) / 2,
    ])
      sash.add(
        "sash side",
        frame,
        [b, sashLength, a],
        roofPoint(vent.side, z, mid, -glazingT - a / 2),
        rotation,
      );
    for (const [label, q] of [
      ["hinge rail", vent.upper + hingeGap + b / 2],
      ["lower rail", vent.lower - hingeGap - b / 2],
    ] as const)
      sash.add(
        label,
        frame,
        [sashWidth - 2 * b, b, a],
        roofPoint(vent.side, centered, q, -glazingT - a / 2),
        rotation,
      );
    if (glazing)
      sash.add(
        "vent panel · downslope flutes",
        glazing,
        [sashWidth, sashLength, glazingT],
        roofPoint(vent.side, centered, mid, -glazingT / 2),
        rotation,
      );
    sash.finish();

    const ventilation = unresolved.find(
      (row) => row.id === "greenhouse-ventilation",
    )!;
    ventilation.reason =
      "The single-bay framed opening and top-hinged sash are represented. Review net ventilation area, draft and weather protection, hinge and fastening layout, stop or opener hardware, support, and roof flashing for the actual site.";
    ventilation.sourceRefs = ["https://www.palram.com/us/product/sunlite/"];
  }

  const gables = build.group("Greenhouse gable framing", "gable-framing"),
    ridgeBottom = woodRidgeTop - ridgeCross.b;
  for (const z of [-frameD / 2 + b / 2, frameD / 2 - b / 2]) {
    if (ridgeBottom > wallTop + 0.001)
      gables.add(
        "ridge support stud",
        frame,
        [a, ridgeBottom - wallTop, b],
        [0, (wallTop + ridgeBottom) / 2, z],
      );
    for (const x of positions(frameW, 16, a / 2).filter(
      (x) => Math.abs(x) > a && Math.abs(x) < p.width / 2 - a,
    )) {
      const centerHeight = p.roofRise - Math.abs(x) * Math.tan(pitch),
        height = centerHeight + (a / 2) * Math.tan(pitch);
      if (height <= 0.01) continue;
      const size: V3 = [a, height, b];
      gables.add(
        "sloped-top gable stud",
        frame,
        size,
        [x, wallTop + height / 2, z],
        [0, 0, 0],
        [endCutPlane(size, 1, true, (Math.sign(x) * pitch * 180) / Math.PI, 0)],
      );
    }
  }
  gables.finish();
  if (glazing) {
    const sheet = material(glazing),
      stock = [...(sheet.stockSize ?? sheet.size)].sort((x, y) => x - y),
      maxWidth = stock[1],
      t = glazingT,
      c = Math.cos(pitch),
      sn = Math.sin(pitch),
      tan = Math.tan(pitch);
    const strips = (start: number, end: number, balance = false) => {
      const result: { center: number; width: number }[] = [];
      const span = end - start;
      const stripWidth = balance && span > 0
        ? span / Math.ceil(span / maxWidth)
        : maxWidth;
      for (let low = start; low < end - 0.001;) {
        const width = Math.min(stripWidth, end - low);
        result.push({ center: low + width / 2, width });
        low += width;
      }
      return result;
    };
    const cladding = build.group(
      "Greenhouse wall glazing",
      "glazing-wall-panels",
    );
    const wallH = wallTop - baseY;
    for (const strip of strips(-p.width / 2, p.width / 2))
      cladding.add(
        "back panel · vertical flutes",
        glazing,
        [strip.width, wallH, t],
        [strip.center, baseY + wallH / 2, -p.depth / 2 + t / 2],
      );
    for (const side of [-1, 1]) {
      const start = side < 0 ? -p.width / 2 : p.doorWidth / 2,
        end = side < 0 ? -p.doorWidth / 2 : p.width / 2;
      for (const strip of strips(start, end))
        cladding.add(
          "front panel beside opening · vertical flutes",
          glazing,
          [strip.width, wallH, t],
          [strip.center, baseY + wallH / 2, p.depth / 2 - t / 2],
        );
    }
    const aboveH = wallTop - (baseY + p.doorHeight);
    for (const strip of strips(-p.doorWidth / 2, p.doorWidth / 2))
      cladding.add(
        "front panel above opening · vertical flutes",
        glazing,
        [strip.width, aboveH, t],
        [strip.center, baseY + p.doorHeight + aboveH / 2, p.depth / 2 - t / 2],
      );
    const sideH = wallTop + t * tan - baseY;
    for (const side of [-1, 1])
      for (const strip of strips(-frameD / 2, frameD / 2)) {
        const size: V3 = [t, sideH, strip.width],
          center: V3 = [
            side * (p.width / 2 - t / 2),
            baseY + sideH / 2,
            strip.center,
          ],
          normal: V3 = [side * sn, c, 0],
          constant =
            c * (p.eaveHeight + p.roofRise) -
            (b + t) -
            normal.reduce((sum, n, i) => sum + n * center[i], 0);
        cladding.add(
          "side panel · vertical flutes",
          glazing,
          size,
          center,
          [0, 0, 0],
          [{ normal, constant }],
        );
      }
    cladding.finish();
    const gablePanels = build.group(
        "Greenhouse gable glazing",
        "glazing-gable-panels",
      ),
      gableH = p.roofRise + b / c;
    for (const z of [-p.depth / 2 + t / 2, p.depth / 2 - t / 2])
      for (const strip of strips(-p.width / 2, p.width / 2)) {
        const center: V3 = [strip.center, wallTop + gableH / 2, z],
          size: V3 = [strip.width, gableH, t],
          planes = ([-1, 1] as const).map((side) => {
            const normal: V3 = [side * sn, c, 0];
            return {
              normal,
              constant:
                c * (p.eaveHeight + p.roofRise) -
                t -
                normal.reduce((sum, n, i) => sum + n * center[i], 0),
            };
          });
        gablePanels.add(
          "clipped gable panel · vertical flutes",
          glazing,
          size,
          center,
          [0, 0, 0],
          planes,
        );
      }
    gablePanels.finish();
    const roofGlazing = glazing;
    const roofPanels = build.group(
        "Greenhouse roof glazing",
        "glazing-roof-panels",
      ),
      blank = (p.width / 2 + t * sn) / c;
    const addFullRoofPanel = (
      side: number,
      strip: { center: number; width: number },
    ) => {
      const size: V3 = [strip.width, blank, t];
      roofPanels.add(
        "plumb-cut roof panel · downslope flutes",
        roofGlazing,
        size,
        [
          (side * p.width) / 4,
          p.eaveHeight + p.roofRise / 2 - t / (2 * c),
          strip.center,
        ],
        roofFrame(side),
        [
          endCutPlane(size, 1, false, (-pitch * 180) / Math.PI, 2),
          endCutPlane(size, 1, true, (-pitch * 180) / Math.PI, 2),
        ],
      );
    };
    if (!vent) {
      for (const strip of strips(-p.depth / 2, p.depth / 2))
        for (const side of [-1, 1]) addFullRoofPanel(side, strip);
    } else {
      const { side, back, front, upper, lower } = vent;
      for (const strip of strips(-p.depth / 2, p.depth / 2))
        addFullRoofPanel(-side, strip);
      for (const strip of [
        ...strips(-p.depth / 2, back, true),
        ...strips(front, p.depth / 2, true),
      ])
        addFullRoofPanel(side, strip);
      // Separate upslope and downslope blanks keep material out of the
      // rough opening. Square vent edges preserve the downslope flute axis.
      const cuts = [
        { name: "roof panel above vent", from: 0, to: upper, ridge: true },
        {
          name: "roof panel below vent",
          from: lower,
          to: slopeLength + t * tan,
          ridge: false,
        },
      ];
      for (const { name, from, to, ridge } of cuts) {
        const q = (from + to) / 2;
        const plane: CutPlane = ridge
          ? { normal: [0, c, -sn], constant: q * c - (t * sn) / 2 }
          : {
              normal: [0, -c, sn],
              constant: p.width / 2 - q * c + (t * sn) / 2,
            };
        for (const strip of strips(back, front))
          roofPanels.add(
            `${name} · downslope flutes`,
            roofGlazing,
            [strip.width, to - from, t],
            roofPoint(side, strip.center, q, -t / 2),
            roofFrame(side),
            [plane],
          );
      }
    }
    roofPanels.finish();
    const leafPanels = build.group(
      "Greenhouse door glazing",
      "glazing-door-panels",
    );
    for (const strip of strips(0, leafW))
      leafPanels.add(
        "door panel · vertical flutes",
        glazing,
        [strip.width, leafH, t],
        rotate([strip.center, leafH / 2, t / 2], doorRotation).map(
          (v, i) => v + hinge[i],
        ) as V3,
        doorRotation,
      );
    leafPanels.finish();
    if (Math.tan(pitch) < 0.1)
      unresolved.push({
        id: "sunlite-roof-slope",
        reason:
          "This roof falls below Palram’s published 10% minimum slope for SUNLITE. Revise the roof slope and check drainage before choosing an installation.",
        sourceRefs: [
          "https://www.palram.com/product/sunlite-diy-polycarbonate-multi-wall/",
        ],
      });
    const system = unresolved.find(
      (issue) => issue.id === "greenhouse-glazing-system",
    )!;
    system.reason =
      "Source-matched SUNLITE multiwall sheet envelopes and real gable/roof cuts are represented, with flutes along vertical or roof-slope lengths. Thermal gaps, edge/profile engagement, horizontal eave/gable seams, UV-side marking, tapes, drainage, expansion drilling and actual fastening/support schedules are unresolved; shown cut blanks have no system allowance deductions.";
    unresolved.push({
      id: "greenhouse-envelope-profile",
      reason:
        "Sheets are represented as physical 8 mm outer envelopes, not internal cell ribs. No end-to-end flute splice, panel load capacity or weather-tight installation is approved. Oversized downslope blanks require different stock/geometry, not an invented H-profile end joint.",
      sourceRefs: sourceRefs.greenhouse,
    });
  }
  return build.finish(
    missing,
    unresolved,
    {
      width: p.width,
      depth: p.depth,
      outsideEaveHeight: p.eaveHeight,
      ridgeHeight: p.eaveHeight + p.roofRise,
      wallPlateHeight: wallTop,
      pitchDegrees: (pitch * 180) / Math.PI,
      rafterBlankLength: blankLength,
      doorClearWidth: p.doorWidth,
      doorClearHeight: p.doorHeight,
      actualGlazingThickness: glazingT,
      ...(selections.greenhouseBase ? { perimeterRailWidth: baseWidth, perimeterRailHeight: baseY } : {}),
      outsideWallFrameWidth: frameW,
      outsideWallFrameDepth: frameD,
      ...(vent
        ? {
            roofVentOpeningWidth: vent.front - vent.back,
            roofVentOpeningLength: vent.lower - vent.upper,
          }
        : {}),
    },
    [
      {
        role: "door-clear-opening",
        min: [-p.doorWidth / 2, baseY, p.depth / 2 - b],
        max: [p.doorWidth / 2, baseY + p.doorHeight, p.depth / 2],
        meaning:
          "Local closed-door opening before family origin/yaw; leaf occupies it when closed.",
      },
    ],
  );
}

function addSaunaLining(
  build: ReturnType<typeof builder>,
  p: ReturnType<typeof saunaParamsSchema.parse>,
  stock: MaterialId,
) {
  const { length, reveal, thickness } = cedarbrookLining;
  if (p.interiorLayerAllowance < thickness)
    throw Error("The interior layer allowance must fit the 11/16 in cedar lining. Increase it without reducing the requested clear room.");
  if (p.doorWidth > p.clearWidth || p.doorHeight > p.clearHeight)
    throw Error("The sauna rough opening must fit the lined room’s clear width and height.");

  const halfWidth = p.clearWidth / 2;
  const halfDepth = p.clearDepth / 2;
  const halfOpening = p.doorWidth / 2;
  const walls = build.group("Sauna wall lining", "wall-lining");

  function run(
    group: ReturnType<typeof build.group>,
    name: string,
    start: number,
    end: number,
    cover: number,
    place: (center: number) => V3,
    rotation: V3 = [0, 0, 0],
  ) {
    if (end - start < 0.000001 || cover < 0.000001) return;
    const count = Math.ceil((end - start) / length);
    const cutLength = (end - start) / count;
    for (let i = 0; i < count; i++) {
      const member = group.add(name, stock, [cutLength, cover, thickness], place(start + (i + 0.5) * cutLength), rotation);
      member.stockLengthAxis = 0;
    }
  }

  for (let low = 0, row = 1; low < p.clearHeight - 0.000001; low += reveal, row++) {
    const high = Math.min(low + reveal, p.clearHeight);
    const cover = high - low;
    const y = (high + low) / 2;
    const rear = -halfDepth - thickness / 2;
    const front = halfDepth + thickness / 2;
    run(walls, `rear course ${row}`, -halfWidth, halfWidth, cover, (x) => [x, y, rear]);

    for (const sign of [-1, 1]) {
      const side = sign < 0 ? "left" : "right";
      const x = sign * (halfWidth + thickness / 2);
      run(walls, `${side} course ${row}`, -halfDepth, halfDepth, cover, (z) => [x, y, z], [0, Math.PI / 2, 0]);
    }
    if (low >= p.doorHeight) {
      run(walls, `front course ${row}`, -halfWidth, halfWidth, cover, (x) => [x, y, front]);
    } else {
      run(walls, `front left course ${row}`, -halfWidth, -halfOpening, cover, (x) => [x, y, front]);
      run(walls, `front right course ${row}`, halfOpening, halfWidth, cover, (x) => [x, y, front]);
      if (high > p.doorHeight)
        run(walls, `front header strip ${row}`, -halfOpening, halfOpening, high - p.doorHeight, (x) => [x, (p.doorHeight + high) / 2, front]);
    }
  }
  walls.finish();

  const ceiling = build.group("Sauna ceiling lining", "ceiling-lining");
  const ceilingRotation = composeRotation([0, Math.PI / 2, 0], [Math.PI / 2, 0, 0]);
  for (let left = -halfWidth, row = 1; left < halfWidth - 0.000001; left += reveal, row++) {
    const cover = Math.min(reveal, halfWidth - left);
    const x = left + cover / 2;
    run(ceiling, `ceiling course ${row}`, -halfDepth, halfDepth, cover, (z) => [x, p.clearHeight + thickness / 2, z], ceilingRotation);
  }
  ceiling.finish();
}

export function buildSaunaCabin(
  project: Project,
  raw: SaunaCabinParams,
  selections: StructureMaterials = {},
): StructureResult {
  const p = saunaParamsSchema.parse(raw),
    missing: StructureIssue[] = [],
    unresolved: StructureIssue[] = [
      {
        id: "sauna-equipment",
        reason:
          "No heater, guard, sensor, equipment clearance, supply circuit or wiring is inferred. Exact regional equipment/manual identity and qualified trade review are required.",
        sourceRefs: sourceRefs.sauna,
      },
      {
        id: "sauna-envelope",
        reason:
          "Reserved layer space is not installed insulation, foil, furring or lining. Heat/moisture suitability and complete wall/ceiling/floor assemblies remain unresolved.",
        sourceRefs: sourceRefs.sauna,
      },
      {
        id: "sauna-ventilation",
        reason:
          "Vent openings/ducts, sensor interaction, drying strategy and ventilation performance are unrepresented.",
        sourceRefs: sourceRefs.sauna,
      },
      {
        id: "sauna-supports",
        reason:
          "Framing, ceiling/bench loads, bracing, anchors, all attachment schedules and bench support details remain unqualified.",
        sourceRefs: sourceRefs.sauna,
      },
    ];
  const frame = resolveStructureMaterial(
      "frameLumber",
      selections,
      missing,
      { wood: true, kind: "linear" },
      "stud",
    )!,
    { b } = stockCross(frame),
    { outsideW, outsideD, wallTop } = saunaFramingEnvelope(p, b),
    build = builder(project, "Sauna cabin", p.origin, p.yaw);
  const wallInsulation = resolveStructureMaterial(
    "saunaInsulation", selections, missing, { wood: false, kind: "sheet" }, undefined, unresolved,
  );
  const ceilingFrame = selections.saunaCeilingJoists
    ? resolveStructureMaterial("saunaCeilingJoists", selections, missing, { wood: true, kind: "linear" }, undefined, unresolved)
    : null;
  const ceilingInsulation = selections.saunaCeilingInsulation
    ? resolveStructureMaterial("saunaCeilingInsulation", selections, missing, { wood: false, kind: "sheet" }, undefined, unresolved)
    : null;
  const lining = resolveStructureMaterial(
    "saunaInterior", selections, missing, { wood: true, kind: "linear" }, undefined, unresolved,
  );
  const saunaDoor = resolveStructureMaterial(
    "saunaDoor", selections, missing, { wood: false, kind: "equipment" }, undefined, unresolved,
  );
  const saunaBench = resolveStructureMaterial(
    "saunaBench", selections, missing, { wood: false, kind: "equipment" }, undefined, unresolved,
  );
  const foil = resolveStructureMaterial(
    "saunaVaporBarrier", selections, missing, { wood: false, kind: "roll" }, undefined, unresolved,
  );
  if (saunaDoor && (p.doorWidth !== cedarbrookDoor.roughWidth || p.doorHeight !== cedarbrookDoor.roughHeight))
    throw Error("The selected Cedarbrook door needs a 24 × 76 in rough opening. Use those dimensions or choose a different door.");
  const cavityStock = wallInsulation
    ? [...material(wallInsulation).size].sort((a, b) => a - b)
    : null;
  const fillsCavity = cavityStock !== null && Math.abs(cavityStock[0] - b) < 0.001;
  const joistStock = ceilingFrame ?? frame;
  const { a: joistWidth, b: joistDepth } = stockCross(joistStock);
  const ceilingBattStock = ceilingInsulation
    ? [...material(ceilingInsulation).size].sort((a, b) => a - b)
    : null;
  const fitsCeiling = ceilingBattStock !== null && ceilingBattStock[0] <= joistDepth + 0.0001;
  resolveStructureMaterial("saunaBenchFrame", selections, missing, { wood: true, kind: "linear" });
  type WallAdd = ReturnType<typeof build.group>["add"];
  const battWalls: { label: string; x: number; z: number; turned: boolean; width: number; blocked: WallRectangle[] }[] = [];
  function recordWall(add: WallAdd, label: string, width: number, x: number, z: number, turned = false, blocked: WallRectangle[] = []): WallAdd {
    if (!fillsCavity) return add;
    battWalls.push({ label, x, z, turned, width, blocked });
    return (name, stock, size, position, rotation, cuts) => {
      const member = add(name, stock, size, position, rotation, cuts);
      const along = turned ? -position[2] : position[0];
      blocked.push({
        left: along - size[0] / 2, right: along + size[0] / 2,
        low: position[1] - size[1] / 2, high: position[1] + size[1] / 2,
      });
      return member;
    };
  }
  const walls = build.group("Sauna exterior framing", "wall-framing");
  const rearZ = -outsideD / 2 + b / 2;
  addWall(recordWall(walls.add, "rear wall", outsideW, 0, rearZ), frame, outsideW, wallTop, 0, rearZ);
  for (const side of [-1, 1]) {
    const x = side * (outsideW / 2 - b / 2), width = outsideD - 2 * b;
    const add = recordWall(walls.add, side < 0 ? "left wall" : "right wall", width, x, 0, true);
    addWall(add, frame, width, wallTop, x, 0, [0, Math.PI / 2, 0]);
  }
  walls.finish();
  const front = build.group("Sauna door rough opening", "door-opening-framing");
  const frontZ = outsideD / 2 - b / 2;
  frontWithDoor(
    recordWall(front.add, "front wall", outsideW, 0, frontZ, false, [{
      left: -p.doorWidth / 2, right: p.doorWidth / 2, low: 0, high: p.doorHeight,
    }]),
    frame,
    outsideW,
    wallTop,
    0,
    frontZ,
    p.doorWidth,
    p.doorHeight,
  );
  front.finish();
  if (saunaDoor) {
    const leaf = build.group("Sauna prehung door", "sauna-door-leaf");
    const size = material(saunaDoor).size;
    // Provisional closed placement centered in the opening and flush with
    // exterior framing. The delivered jamb and hardware set the field datum.
    leaf.add("closed leaf", saunaDoor, [...size], [0, p.doorHeight / 2, outsideD / 2 - size[2] / 2]);
    leaf.finish();
  }
  const ceiling = build.group("Sauna ceiling framing", "ceiling-framing");
  const rimInset = ceilingFrame || fitsCeiling ? joistWidth : 0;
  const joistSpan = outsideW - 2 * rimInset;
  const joistCenters = positions(outsideD, 16, joistWidth / 2);
  for (const z of joistCenters)
    ceiling.add(
      "ceiling joist",
      joistStock,
      [joistSpan, joistDepth, joistWidth],
      [0, wallTop + joistDepth / 2, z],
    );
  if (rimInset) {
    for (const side of [-1, 1])
      ceiling.add(
        "ceiling rim",
        joistStock,
        [joistWidth, joistDepth, outsideD],
        [side * (outsideW / 2 - joistWidth / 2), wallTop + joistDepth / 2, 0],
      );
  }
  ceiling.finish();
  if (ceilingInsulation && ceilingBattStock && fitsCeiling) {
    const batts = build.group("Sauna ceiling insulation", saunaCeilingBattRole);
    const [thickness, stockWidth, stockLength] = ceilingBattStock;
    const rotation = orientation([0, 0, 1], [1, 0, 0], [0, 1, 0]);
    for (let i = 1; i < joistCenters.length; i++) {
      const rear = joistCenters[i - 1] + joistWidth / 2;
      const front = joistCenters[i] - joistWidth / 2;
      for (let z = rear; z < front - 0.0001; z += stockWidth) {
        const width = Math.min(stockWidth, front - z);
        for (let x = -joistSpan / 2; x < joistSpan / 2 - 0.0001; x += stockLength) {
          const length = Math.min(stockLength, joistSpan / 2 - x);
          batts.add(
            `bay ${i} batt`, ceilingInsulation, [width, length, thickness],
            [x + length / 2, wallTop + thickness / 2, z + width / 2],
            rotation,
          );
        }
      }
    }
    batts.finish();
    unresolved.push({
      id: "sauna-ceiling-batt-fit",
      reason: "Batt blanks are sized to the generated joist bays. Use Checks to review the saved layout after edits. Verify actual bay widths, end joints, insulation support, perimeter continuity, the space above the batts, moisture control and service clearances.",
      sourceRefs: [saunaCeilingBatt.spec, saunaCeilingBatt.saunaContext],
    });
  } else if (ceilingBattStock) {
    missing.push({
      id: "material.saunaCeilingInsulation",
      reason: `The ${ceilingBattStock[0]} in batt exceeds the ${joistDepth} in modeled ceiling cavity. Choose deeper ceiling framing to fit the batt at full thickness.`,
      sourceRefs: [saunaCeilingBatt.spec],
    });
  }
  if (wallInsulation && cavityStock && fillsCavity) {
    const batts = build.group("Sauna wall insulation", "wall-insulation");
    const [, stockWidth, stockLength] = cavityStock;
    let splitBays = 0;
    for (const wall of battWalls) {
      const bays = wallCavities({ left: -wall.width / 2, right: wall.width / 2, low: 0, high: wallTop }, wall.blocked);
      for (const bay of bays) {
        if (bay.right - bay.left > stockWidth + 0.0001 || bay.high - bay.low > stockLength + 0.0001) splitBays++;
        for (let left = bay.left; left < bay.right - 0.0001; left += stockWidth) {
          const width = Math.min(stockWidth, bay.right - left);
          for (let low = bay.low; low < bay.high - 0.0001; low += stockLength) {
            const length = Math.min(stockLength, bay.high - low);
            const along = left + width / 2, y = low + length / 2;
            batts.add(
              `${wall.label} cavity batt`, wallInsulation, [width, length, b],
              wall.turned ? [wall.x, y, -along] : [along, y, wall.z],
              [0, wall.turned ? Math.PI / 2 : 0, 0],
            );
          }
        }
      }
    }
    batts.finish();
    const envelope = unresolved.find((issue) => issue.id === "sauna-envelope")!;
    envelope.reason = `Wall batts are sized for the generated cavities. Use Checks after making edits. Verify fit on site, particularly at corners, the header and services. ${fitsCeiling ? "Ceiling batts fill the plan between framing members." : "Ceiling insulation remains unbuilt."} Review foil, furring, lining and the complete moisture/heat assembly.`;
    if (splitBays)
      unresolved.push({
        id: "sauna-batt-seams",
        reason: `${splitBays} wall bays use more than one batt piece. Verify the actual cavity and continuity at each joint before cutting.`,
        sourceRefs: [],
      });
  } else if (wallInsulation) {
    missing.push({
      id: "material.saunaInsulation",
      reason: "The selected batt thickness does not match the modeled wall cavity. Review stock and cavity depth before adding insulation.",
      sourceRefs: [],
    });
  }
  if (foil) {
    const layout = saunaFoilLayout(p);
    for (const [role, title] of [[saunaCeilingFoilRole, "Sauna ceiling foil"], [saunaWallFoilRole, "Sauna wall foil"]] as const) {
      const section = build.group(title, role);
      for (const panel of layout.filter((row) => row.role === role))
        section.add(panel.name, foil, panel.size, panel.position, panel.rotation, [], panel.returns);
      section.finish();
    }
    unresolved.push({
      id: "sauna-foil-connections",
      reason: "The cut plan allows 4 in field seams and 3 in ceiling returns. Check corner backing, opening and floor edges, penetrations and continuity for the chosen system before ordering. The drawing uses a visible sheet thickness.",
      sourceRefs: [cedarbrookFoil.url, cedarbrookFoil.instructions],
    });
  }
  if (lining) {
    addSaunaLining(build, p, lining);
    const envelope = unresolved.find((issue) => issue.id === "sauna-envelope")!;
    envelope.reason = [
      "Editable cedar courses use 3 in of installed coverage and keep the requested clear room and rough opening.",
      fillsCavity ? "Wall batts are sized for the generated cavities. Use Checks after making edits." : "Wall insulation remains unbuilt.",
      foil
        ? "Foil covers the walls and ceiling in the layout. Review foil terminations, remaining layer thickness, backing and fasteners, corners, expansion and penetrations."
        : "Review vapor control, remaining layer thickness, backing and fasteners, corners, expansion, penetrations and the complete heated enclosure.",
      fitsCeiling ? "Ceiling batts fit between modeled framing members." : "Plan ceiling insulation for the chosen assembly.",
    ].join(" ");
    envelope.sourceRefs = [cedarbrookLining.url, ...envelope.sourceRefs];
  }
  else if (foil) {
    const envelope = unresolved.find((issue) => issue.id === "sauna-envelope")!;
    envelope.reason = `${fillsCavity ? "Wall batts are sized for the generated cavities. Use Checks after making edits." : "Wall insulation remains unbuilt."} ${fitsCeiling ? "Ceiling batts fit between modeled framing members." : "Ceiling insulation remains unbuilt."} The foil layout covers walls and ceiling. Review lining, backing, foil terminations and penetrations.`;
    envelope.sourceRefs = [cedarbrookFoil.url, ...envelope.sourceRefs];
  }
  else if (fitsCeiling && !fillsCavity) {
    const envelope = unresolved.find((issue) => issue.id === "sauna-envelope")!;
    envelope.reason = "Ceiling batts fit between modeled framing members. Review wall insulation, foil, backing, furring, lining and the full heated enclosure.";
  }
  const benchSize = saunaBench ? material(saunaBench).size : null;
  const benchX = p.benchOffsetX ?? 0;
  const benchRearGap = p.benchRearGap ?? 0;
  if (saunaBench && benchSize) {
    const [length, height, depth] = benchSize;
    if (Math.abs(benchX) + length / 2 > p.clearWidth / 2 + 0.000001 ||
      benchRearGap + depth > p.clearDepth + 0.000001 || height > p.clearHeight)
      throw Error("The selected pedestal bench extends outside the clear sauna. Adjust its offsets, choose a shorter bench, or increase the room dimensions.");
    const bench = build.group("Sauna pedestal bench", saunaPedestalRole);
    bench.add("assembled kit", saunaBench, [...benchSize], [benchX, height / 2, -p.clearDepth / 2 + benchRearGap + depth / 2]);
    bench.finish();
  }
  unresolved.push(
    {
      id: "sauna-bench-geometry",
      reason: saunaBench
        ? "The freestanding lower bench uses the documented outer dimensions. Verify the delivered top, legs and bracing on the finished floor, and review heater clearance and the exit path."
        : "The requested bench is reserved as an access volume only; no ordinary plywood or treated stock is substituted for sourced sauna seating/slats.",
      sourceRefs: saunaBench ? [cedarbrookBenchInstructions] : sourceRefs.sauna,
    },
    {
      id: "sauna-door",
      reason: saunaDoor
        ? "The prehung kit contributes one closed leaf and the required rough opening. Confirm the finished floor, jamb and stop profile, hinge axis, trim, handle clearance and release from inside. Use Test movement to review the outward swing."
        : "An actual heat-compatible outward-opening door and its hardware remain missing; only its framed rough opening is built.",
      sourceRefs: saunaDoor ? [cedarbrookDoor.url] : sourceRefs.sauna,
    },
  );
  if (!saunaBench && (
    p.benchWidth > p.clearWidth ||
    p.benchDepth > p.clearDepth ||
    p.benchHeight >= p.clearHeight
  ))
    throw Error(
      "The requested bench reservation does not fit the clear sauna interior.",
    );
  return build.finish(
    missing,
    unresolved,
    {
      clearWidth: p.clearWidth,
      clearDepth: p.clearDepth,
      clearHeight: p.clearHeight,
      outsideFramingWidth: outsideW,
      outsideFramingDepth: outsideD,
      outsideFramingHeight: wallTop + joistDepth,
      ...(ceilingFrame || ceilingBattStock ? { ceilingCavityDepth: joistDepth } : {}),
      ...(fitsCeiling && ceilingBattStock ? {
        ceilingBattThickness: ceilingBattStock[0],
        ceilingCavityRemaining: joistDepth - ceilingBattStock[0],
      } : {}),
      reservedInteriorLayer: p.interiorLayerAllowance,
      ...(lining ? {
        liningThickness: cedarbrookLining.thickness,
        remainingInteriorLayer: p.interiorLayerAllowance - cedarbrookLining.thickness,
      } : {}),
      ...(saunaDoor ? {
        doorRoughWidth: cedarbrookDoor.roughWidth,
        doorRoughHeight: cedarbrookDoor.roughHeight,
        doorLeafWidth: cedarbrookDoor.leafWidth,
        doorLeafHeight: cedarbrookDoor.leafHeight,
        doorLeafDepth: cedarbrookDoor.leafDepth,
      } : {}),
      ...(benchSize ? {
        benchLength: benchSize[0],
        benchHeight: benchSize[1],
        benchDepth: benchSize[2],
      } : {}),
    },
    [
      {
        role: "clear-interior",
        min: [-p.clearWidth / 2, 0, -p.clearDepth / 2],
        max: [p.clearWidth / 2, p.clearHeight, p.clearDepth / 2],
        meaning:
          "Reserved clear room volume in family-local inches, before origin/yaw.",
      },
      ...(!saunaBench ? [{
        role: "bench-reservation",
        min: [-p.benchWidth / 2, 0, -p.clearDepth / 2] as V3,
        max: [
          p.benchWidth / 2,
          p.benchHeight,
          -p.clearDepth / 2 + p.benchDepth,
        ] as V3,
        meaning:
          "Unbuilt bench/access reservation; not materialized or qualified as heated seating.",
      }] : []),
    ],
  );
}

export function buildClosetInsert(
  project: Project,
  raw: ClosetInsertParams,
  selections: StructureMaterials = {},
): StructureResult {
  const p = closetParamsSchema.parse(raw),
    missing: StructureIssue[] = [],
    unresolved: StructureIssue[] = [
      {
        id: "closet-supports",
        reason:
          "Review shelf-support fit and drilling, carcass joints, rod sockets/supports, anti-tip anchors and substrate-dependent fastening.",
        sourceRefs: sourceRefs.closet,
      },
      {
        id: "closet-obstacles",
        reason:
          "Baseboards, trim, door swings, wall/stud locations and access clearances need measured obstacle geometry.",
        sourceRefs: sourceRefs.closet,
      },
      {
        id: "closet-loads",
        reason:
          "Shelf/rod spans, panel grade, loads and anchoring are not qualified by this casework geometry.",
        sourceRefs: sourceRefs.closet,
      },
    ];
  const panels = resolveStructureMaterial(
      "caseworkPanels",
      selections,
      missing,
      { wood: true, kind: "sheet" },
      "plywood",
      unresolved,
    )!,
    t = panels ? Math.min(...material(panels).size) : 0,
    sideClear = (p.width - 4 * t - p.towerWidth) / 2,
    build = builder(project, "Closet insert", p.origin, p.yaw);
  if (!panels)
    throw Error(
      "The selected casework panel has no qualified physical product match; no substitute material is used.",
    );
  const rod = resolveStructureMaterial(
    "closetRod",
    selections,
    missing,
    { wood: false, kind: "linear" },
    undefined,
    unresolved,
  );
  if (rod === everbiltClosetRod.materialId && !selections.closetRodSupport)
    unresolved.push({
      id: "material.closetRodSupport.installation",
      reason: "Review Everbilt 311V end sockets for the delivered rod and confirm backing, fasteners and any intermediate supports before installation.",
      sourceRefs: [everbiltClosetRod.socketListing],
    });
  else
    resolveStructureMaterial("closetRodSupport", selections, missing, {
      wood: false,
      kind: "connector",
    });
  if (sideClear <= 1 || p.height <= 2 * t)
    throw Error(
      "The requested tower and actual panel thickness leave no valid hanging bays.",
    );
  const carcass = build.group("Closet casework", "casework-panels");
  for (const [role, y] of [
    ["bottom", t / 2],
    ["top", p.height - t / 2],
  ] as const)
    carcass.add(
      "top or bottom",
      panels,
      [p.width, t, p.depth],
      [0, y, 0],
    ).designRole = role;
  for (const [role, x] of [
    ["side-left", -p.width / 2 + t / 2],
    ["tower-left", -p.towerWidth / 2 - t / 2],
    ["tower-right", p.towerWidth / 2 + t / 2],
    ["side-right", p.width / 2 - t / 2],
  ] as const)
    carcass.add(
      "vertical",
      panels,
      [t, p.height - 2 * t, p.depth],
      [x, p.height / 2, 0],
    ).designRole = role;
  for (let i = 1; i <= p.shelfCount; i++)
    carcass.add(
      "tower shelf",
      panels,
      [p.towerWidth, t, p.depth - 0.5],
      [0, t + ((p.height - 2 * t) * i) / (p.shelfCount + 1), 0.25],
    ).designRole = `tower-shelf-${i}`;
  carcass.finish();
  if (rod) {
    if (material(rod).shape !== "tube-envelope")
      throw Error(
        "The selected rod lacks a supported, source-sized tube envelope; no guessed profile is substituted.",
      );
    const diameter = Math.min(...material(rod).size),
      height = p.rodHeight ?? Math.min(64, p.height - 6);
    if (height <= diameter / 2 || height + diameter / 2 >= p.height - t)
      throw Error(
        "The requested rod height does not fit below the actual top panel.",
      );
    const rods = build.group("Closet hanging rods", "hanging-rods"),
      center = p.towerWidth / 2 + t + sideClear / 2;
    for (const side of [-1, 1])
      rods.add(
        "cut tube rod",
        rod,
        [diameter, sideClear, diameter],
        [side * center, height, 0],
        [0, 0, -Math.PI / 2],
      );
    rods.finish();
    unresolved.push({
      id: "closet-rod-end-allowances",
      reason: rod === everbiltClosetRod.materialId
        ? "The modeled clear openings are provisional lengths. Use the measured opening, socket setbacks and insertion clearance to calculate each cut. Confirm mounting, height, access and intermediate supports."
        : "Two source-sized tube envelopes use the current clear bay widths as provisional cut lengths. Socket engagement/end deductions, center support if required, mounting, height/access clearance, tube wall gauge and cutting method remain unresolved; do not cut from this geometric length without that detail.",
      sourceRefs: rod === everbiltClosetRod.materialId ? [everbiltClosetRod.listing, everbiltClosetRod.socketListing] : sourceRefs.closet,
    });
  } else
    unresolved.push({
      id: "closet-rod-geometry",
      reason:
        "Actual cylindrical/tubular rods and matched sockets/supports require sourced profile geometry; no rectangular wood/metal stand-in is generated.",
      sourceRefs: sourceRefs.closet,
    });
  return build.finish(missing, unresolved, {
    width: p.width,
    depth: p.depth,
    height: p.height,
    actualPanelThickness: t,
    towerClearWidth: p.towerWidth,
    leftClearBay: sideClear,
    rightClearBay: sideClear,
  });
}

/** Backed casework geometry with fixed source thickness. Hole patterns and attachment design are not inferred. */
export function buildCaseworkShelves(
  project: Project,
  raw: CaseworkShelvesParams,
  selections: StructureMaterials = {},
): StructureResult {
  const p = caseworkShelvesParamsSchema.parse(raw),
    missing: StructureIssue[] = [
      {
        id: "hardware.shelf-pins",
        reason:
          "Check the support plan for the selected pin, purchase quantities and measurements needed for installation.",
        sourceRefs: [],
      },
      {
        id: "hardware.anti-tip",
        reason:
          "Substrate-compatible anti-tip hardware and its attachment details have not been selected or priced.",
        sourceRefs: [],
      },
      {
        id: "hardware.assembly-fasteners",
        reason:
          "Carcass/back-panel fastening hardware and purchase quantities have not been selected or priced.",
        sourceRefs: [],
      },
    ],
    unresolved: StructureIssue[] = [
      {
        id: "casework-shelf-supports",
        reason:
          "Review the selected supports, row spacing, edge distances, engagement and drilling setup on the actual side panels.",
        sourceRefs: [],
      },
      {
        id: "casework-joinery",
        reason:
          "Carcass joints, rear-panel fixing, fastener quantities, edge treatment, backing/racking resistance and wall/anti-tip anchoring require design. No hardware is inferred as installed.",
        sourceRefs: [],
      },
      {
        id: "casework-fit-loads",
        reason:
          "Panel grade, shelf spans, intended loads and measured wall/baseboard/door obstructions remain unresolved. Shelf front setback is a provisional layout dimension, and zero lateral clearance is nominal geometry, not a fitted joinery or capacity approval.",
        sourceRefs: [],
      },
    ],
    panels = resolveStructureMaterial(
      "caseworkPanels",
      selections,
      missing,
      { wood: true, kind: "sheet" },
      "plywood",
      unresolved,
    );
  if (!panels)
    throw Error(
      "The selected casework panel has no qualified physical product match; no substitute material is used.",
    );
  const t = Math.min(...material(panels).size),
    innerWidth = p.width - 2 * t,
    bodyDepth = p.depth - t,
    shelfDepth = bodyDepth - p.shelfClearance,
    clearOpening = (p.height - (p.shelfCount + 2) * t) / (p.shelfCount + 1);
  if (
    innerWidth <= 0 ||
    bodyDepth <= 0 ||
    shelfDepth <= 0 ||
    p.height <= 2 * t ||
    clearOpening <= 0
  )
    throw Error(
      "The requested casework envelope and shelf count leave no positive panel spans or clear shelf openings at the selected stock thickness.",
    );
  const build = builder(project, "Casework shelves", p.origin, p.yaw);
  const addPanel = (name: string, role: string, size: V3, position: V3) => {
    const panel = build.group(name, role);
    panel.add("panel", panels, size, position);
    panel.finish();
  };
  addPanel(
    "Left side",
    "side-left",
    [t, p.height, bodyDepth],
    [-p.width / 2 + t / 2, p.height / 2, t / 2],
  );
  addPanel(
    "Right side",
    "side-right",
    [t, p.height, bodyDepth],
    [p.width / 2 - t / 2, p.height / 2, t / 2],
  );
  addPanel(
    "Back",
    "back",
    [p.width, p.height, t],
    [0, p.height / 2, -p.depth / 2 + t / 2],
  );
  addPanel(
    "Top",
    "top",
    [innerWidth, t, bodyDepth],
    [0, p.height - t / 2, t / 2],
  );
  addPanel("Bottom", "bottom", [innerWidth, t, bodyDepth], [0, t / 2, t / 2]);
  for (let i = 1; i <= p.shelfCount; i++)
    addPanel(
      `Adjustable shelf ${i}`,
      `shelf-${i}`,
      [innerWidth, t, shelfDepth],
      [
        0,
        t + i * clearOpening + (i - 1) * t + t / 2,
        (t - p.shelfClearance) / 2,
      ],
    );
  return build.finish(missing, unresolved, {
    width: p.width,
    depth: p.depth,
    height: p.height,
    actualPanelThickness: t,
    clearInsideWidth: innerWidth,
    clearInsideHeight: p.height - 2 * t,
    shelfDepth,
    shelfFrontSetback: p.shelfClearance,
    shelfCount: p.shelfCount,
    clearShelfOpeningHeight: clearOpening,
  });
}
