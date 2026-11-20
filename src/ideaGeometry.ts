import {
  material,
  part,
  step,
  uid,
  type Piece,
  type V3,
  type Project,
  type MaterialId,
} from "./model";
import { isStock, type PlanModule } from "./planSchema";
import { generatedStockAllows } from "./retailerCatalog";
import { composeRotation, rotate } from "./spatial";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";
import type { BoundSpec, IdeaEntry } from "./ideaBindingSchema";
import {
  buildGreenhouse,
  buildSaunaCabin,
  buildClosetInsert,
  buildCaseworkShelves,
  type StructureResult,
} from "./structures";
export function recipeParts(
  m: PlanModule,
  stepId: string,
  name: string,
  origin: V3 = m.position,
  sectionRotation: V3 = [0, (m.yaw * Math.PI) / 180, 0],
): Piece[] {
  if (m.kind !== "panel" && Math.min(m.width, m.depth, m.height) < 8)
    throw Error("Framed modules need at least 8 inches in each dimension.");
  if (m.openingLid && (m.kind !== "bench" || !m.storage))
    throw Error("An opening seat lid requires a storage bench module.");
  if (m.lidOpen && !m.openingLid)
    throw Error("Only an opening lid can be shown open.");
  if (m.kind !== "panel" && !generatedStockAllows(material(m.frameMaterial), "frameLumber"))
    throw Error(
      "This stock is available for manual placement and cuts, with no reviewed application in generated framing. Choose another frame material or build with individual boards.",
    );
  if (m.kind !== "panel" && !generatedStockAllows(material(m.panelMaterial), "caseworkPanels"))
    throw Error(
      "This sheet is available for manual placement and cuts, with no reviewed application in generated seats or casework. Choose another panel material or add a standalone panel.",
    );
  if (
    m.kind !== "panel" &&
    (!isStock(m.frameMaterial, "linear") || !isStock(m.panelMaterial, "sheet"))
  )
    throw Error("Recipe stock must use catalog lumber and sheet materials.");
  const pieces: Piece[] = [],
    frame = [...material(m.frameMaterial).size].sort((a, b) => a - b),
    panel = [...material(m.panelMaterial).size].sort((a, b) => a - b);
  const a = frame[0],
    b = frame[1],
    t = panel[0],
    w = m.width,
    d = m.depth;
  const add = (
    label: string,
    stock: MaterialId,
    size: V3,
    position: V3,
    rotation: V3 = [0, 0, 0],
  ) => {
    // These labels are controlled generator inputs, never imported part names.
    const piece = part(
      `${name} · ${label}`,
      stock,
      size,
      position,
      stepId,
      name,
      rotation,
    );
    piece.designRole = label.replace(/\s+/g, "-");
    pieces.push(piece);
  };
  if (m.kind === "panel")
    add("panel", m.panelMaterial, [w, m.height, d], [0, m.height / 2, 0]);
  else if (m.kind === "bench" && m.storage) {
    const innerW = w - 2 * t,
      innerD = d - 2 * t,
      wallH = m.height - 2 * t,
      legH = wallH - b;
    if (innerW <= 2 * a || innerD <= 2 * b || legH <= 0)
      throw Error(
        `${name}: dimensions are too small for its storage shell and selected stock.`,
      );
    add("storage bottom", m.panelMaterial, [w, t, d], [0, t / 2, 0]);
    for (const z of [-d / 2 + t / 2, d / 2 - t / 2])
      add(
        z < 0 ? "storage rear" : "storage front",
        m.panelMaterial,
        [w, wallH, t],
        [0, t + wallH / 2, z],
      );
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2])
      add(
        x < 0 ? "storage left" : "storage right",
        m.panelMaterial,
        [t, wallH, innerD],
        [x, t + wallH / 2, 0],
      );
    const legXs = [-innerW / 2 + a / 2, innerW / 2 - a / 2];
    for (let x = -innerW / 2 + 24; x < innerW / 2 - 6; x += 24) legXs.push(x);
    for (const x of legXs)
      for (const z of [-innerD / 2 + b / 2, innerD / 2 - b / 2])
        add("leg", m.frameMaterial, [a, legH, b], [x, t + legH / 2, z]);
    const top = m.height - t;
    for (const z of [-innerD / 2 + a / 2, innerD / 2 - a / 2])
      add("top rail", m.frameMaterial, [innerW, b, a], [0, top - b / 2, z]);
    for (const x of legXs)
      add(
        "top cross rail",
        m.frameMaterial,
        [a, b, innerD - 2 * a],
        [x, top - b / 2, 0],
      );
    const angle =
      m.openingLid && m.lidOpen ? (-LID_OPEN_ANGLE_DEGREES * Math.PI) / 180 : 0;
    const pivot: V3 = [0, top, -d / 2],
      offset = rotate([0, t / 2, d / 2], [angle, 0, 0]);
    add(
      m.openingLid ? "seat lid" : "seat",
      m.panelMaterial,
      [w, t, d],
      offset.map((v, i) => v + pivot[i]) as V3,
      [angle, 0, 0],
    );
    if (m.backHeight)
      add(
        "back panel",
        m.panelMaterial,
        [w, m.backHeight, t],
        [0, m.height + m.backHeight / 2, -d / 2 + t / 2],
      );
  } else {
    const covered = m.kind !== "frame",
      h = m.height - (covered ? t : 0);
    if (h <= b || w <= 2 * a || d <= 2 * b)
      throw Error(
        `${name}: dimensions are too small for the selected lumber cross-section.`,
      );
    // Legs terminate under the top rails. Rails touch at faces rather than crossing through one another.
    const legXs = [-w / 2 + a / 2, w / 2 - a / 2];
    for (let x = -w / 2 + 24; x < w / 2 - 6; x += 24) legXs.push(x);
    for (const x of legXs)
      for (const z of [-d / 2 + b / 2, d / 2 - b / 2])
        add("leg", m.frameMaterial, [a, h - b, b], [x, (h - b) / 2, z]);
    for (const z of [-d / 2 + a / 2, d / 2 - a / 2])
      add("top rail", m.frameMaterial, [w, b, a], [0, h - b / 2, z]);
    for (const x of legXs)
      add(
        "top cross rail",
        m.frameMaterial,
        [a, b, d - 2 * a],
        [x, h - b / 2, 0],
      );
    if (covered)
      add(
        m.kind === "bench" ? "seat" : "top",
        m.panelMaterial,
        [w, t, d],
        [0, h + t / 2, 0],
      );
    if (m.kind === "bench" && m.backHeight)
      add(
        "back panel",
        m.panelMaterial,
        [w, m.backHeight, t],
        [0, m.height + m.backHeight / 2, -d / 2 + t / 2],
      );
    if (m.kind === "cabinet") {
      const insideHeight = h - b;
      add(
        "left infill",
        m.panelMaterial,
        [t, insideHeight, d - 2 * b],
        [-w / 2 + a + t / 2, insideHeight / 2, 0],
      );
      add(
        "right infill",
        m.panelMaterial,
        [t, insideHeight, d - 2 * b],
        [w / 2 - a - t / 2, insideHeight / 2, 0],
      );
      add(
        "back infill",
        m.panelMaterial,
        [w - 2 * a - 2 * t, insideHeight, t],
        [0, insideHeight / 2, -d / 2 + b + t / 2],
      );
    }
    if (m.kind === "shelf" || m.kind === "cabinet") {
      if (m.levels > 1 && (h - b) / m.levels <= t)
        throw Error(
          `${name}: the dimensions, shelf count and panel thickness leave no clear spacing between interior shelves or beneath the top framing. Increase the height or reduce the shelf count.`,
        );
      for (let i = 1; i < m.levels; i++) {
        const y = ((h - b) * i) / m.levels;
        add(
          `shelf ${i}`,
          m.panelMaterial,
          [
            w - 2 * a - (m.kind === "cabinet" ? 2 * t : 0),
            t,
            d - 2 * b - (m.kind === "cabinet" ? t : 0),
          ],
          [0, y + t / 2, m.kind === "cabinet" ? t / 2 : 0],
        );
      }
    }
  }
  const rotation = sectionRotation;
  return pieces.map((p) => ({
    ...p,
    rotation: composeRotation(rotation, p.rotation),
    position: rotate(p.position, rotation).map((n, i) => n + origin[i]) as V3,
  }));
}

export type GeneratedEntry = {
  project: Project;
  sections: IdeaEntry["sections"];
  notes: string;
};
export function generateIdeaEntry(
  project: Project,
  spec: BoundSpec,
  pose: IdeaEntry["pose"],
): GeneratedEntry {
  if (spec.type === "furniture") {
    const recipe = spec.recipe,
      name = recipe.name,
      s = step(`Assemble ${name}`),
      pieces = recipeParts(recipe, s.id, name, pose.origin, pose.rotation),
      sectionId = uid();
    return {
      project: {
        ...project,
        steps: [...project.steps, s],
        pieces: [...project.pieces, ...pieces],
        sections: [
          ...project.sections,
          {
            id: sectionId,
            name,
            pieceIds: pieces.map((p) => p.id),
            origin: [...pose.origin],
            rotation: [...pose.rotation],
            generator: null,
            recipe: {
              ...recipe,
              position: [...pose.origin],
              yaw:
                (((((pose.rotation[1] * 180) / Math.PI + 180) % 360) + 360) %
                  360) -
                180,
            },
          },
        ],
      },
      sections: [{ role: "body", sectionId }],
      notes: "",
    };
  }
  const idea = spec.structure,
    parameters = { ...idea.parameters, origin: [0, 0, 0] as V3, yaw: 0 };
  let result: StructureResult;
  if (idea.kind === "greenhouse")
    result = buildGreenhouse(
      project,
      { ...parameters } as Parameters<typeof buildGreenhouse>[1],
      idea.selections,
    );
  else if (idea.kind === "sauna")
    result = buildSaunaCabin(
      project,
      { ...parameters } as Parameters<typeof buildSaunaCabin>[1],
      idea.selections,
    );
  else if (idea.kind === "casework-shelves")
    result = buildCaseworkShelves(
      project,
      { ...parameters } as Parameters<typeof buildCaseworkShelves>[1],
      idea.selections,
    );
  else
    result = buildClosetInsert(
      project,
      { ...parameters } as Parameters<typeof buildClosetInsert>[1],
      idea.selections,
    );
  const sectionIds = new Set(result.addedSectionIds),
    ids = new Set(
      result.project.sections
        .filter((s) => sectionIds.has(s.id))
        .flatMap((s) => s.pieceIds),
    );
  const next = {
    ...result.project,
    pieces: result.project.pieces.map((p) =>
      ids.has(p.id)
        ? {
            ...p,
            position: rotate(p.position, pose.rotation).map(
              (n, i) => n + pose.origin[i],
            ) as V3,
            rotation: composeRotation(pose.rotation, p.rotation),
          }
        : p,
    ),
    sections: result.project.sections.map((s) =>
      sectionIds.has(s.id)
        ? {
            ...s,
            origin: [...pose.origin] as V3,
            rotation: [...pose.rotation] as V3,
          }
        : s,
    ),
  };
  const sections = result.addedSectionIds.map((sectionId) => {
    const s = next.sections.find((s) => s.id === sectionId)!;
    return {
      role:
        Object.entries(result.geometryRoles).find(([, partIds]) =>
          s.pieceIds.every((id) => partIds.includes(id)),
        )?.[0] ?? s.name,
      sectionId,
    };
  });
  return {
    project: next,
    sections,
    notes: result.project.notes.startsWith(project.notes)
      ? result.project.notes.slice(project.notes.length).trim()
      : result.project.notes,
  };
}
