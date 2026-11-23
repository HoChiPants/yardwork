import { drywallInstallation, drywallStock } from "./drywallReference";
import { doorHardwareRole } from "./doorHardwareReference";
import { bounds } from "./engine";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches } from "./measurement";
import { framingStockDimensions, material, part, projectSchema, sectionParts, step, uid, type Piece, type Project, type Section, type V3 } from "./model";
import { pieceOverlap } from "./solidCollision";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import type { RectangularOpening } from "./throughOpeningSchema";
import { throughOpeningProblem } from "./throughOpenings";

type Side = "front" | "back";
type Extents = { left: number; right: number; bottom: number; top: number };
type Stock = (typeof drywallStock)[number]["id"];
const tolerance = 0.001;
const halfSheet = 0.25;
const across: V3 = [1, 0, 0], up: V3 = [0, 1, 0];
const axes: V3[] = [across, up, [0, 0, 1]];
const nearly = (a: number, b: number) => Math.abs(a - b) < tolerance;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const same = (a: V3, b: V3) => a.every((value, index) => nearly(value, b[index]));
const members = (project: Project, section: Section) => {
  const ids = new Set(section.pieceIds);
  return project.pieces.filter(({ id, offcut }) => ids.has(id) && !offcut);
};
const isDoorFinish = (piece: Piece) => piece.designRole === "interior-door-leaf" || piece.material === "interior-door-jamb" || doorHardwareRole(piece.designRole);

function localParts(wall: Section, pieces: Piece[]) {
  const inverse = inverseRotation(wall.rotation);
  return pieces.map((piece) => ({
    piece, position: rotate(sub(piece.position, wall.origin), inverse),
    axes: axes.map((axis) => rotate(rotate(axis, piece.rotation), inverse)),
  }));
}

function layoutKey(wall: Section, pieces: Piece[], finish: Piece[]) {
  const command = wall.generator;
  return bindingHash({
    wall: command && { width: command.width, height: command.height, stock: command.wallStock,
      door: command.doorOpening, window: command.windowOpening },
    parts: localParts(wall, [...pieces.filter((piece) => !isDoorFinish(piece)), ...finish])
      .sort((a, b) => a.piece.id.localeCompare(b.piece.id))
      .map(({ piece, position, axes }) => ({
        id: piece.id, material: piece.material, position, axes, size: piece.size,
        planes: piece.cutPlanes, rounds: piece.roundOpenings, rectangles: piece.rectangularOpenings,
      })),
  });
}

function coverage(intervals: [number, number][], bottom: number, top: number) {
  let reached = bottom;
  for (const [start, end] of intervals.sort(([a], [b]) => a - b)) {
    if (start > reached + tolerance) break;
    reached = Math.max(reached, end);
    if (reached >= top - tolerance) return true;
  }
  return false;
}

function sheetEnds(start: number, end: number, studs: number[], prior: number[], length: number) {
  const points = [start, ...studs.filter((x) => x > start + tolerance && x < end - tolerance), end];
  const best: ({ count: number; repeats: number; next: number } | undefined)[] = [];
  best[points.length - 1] = { count: 0, repeats: 0, next: points.length };
  for (let i = points.length - 2; i >= 0; i--) {
    for (let j = i + 1; j < points.length && points[j] - points[i] <= length + 1e-7; j++) {
      const tail = best[j];
      if (!tail) continue;
      const candidate = { count: tail.count + 1, repeats: tail.repeats + Number(j < points.length - 1 && prior.some((x) => nearly(x, points[j]))), next: j };
      const incumbent = best[i];
      if (!incumbent || candidate.count < incumbent.count ||
        (candidate.count === incumbent.count && candidate.repeats <= incumbent.repeats)) best[i] = candidate;
    }
  }
  if (!best[0]) throw Error("No sheet layout can land its vertical joints on modeled backing away from the openings. Choose longer sheets or add backing.");
  const ends = [];
  for (let i = 0; i < points.length - 1; i = best[i]!.next) ends.push(points[best[i]!.next]);
  return ends;
}

export function previewWallDrywall(project: Project, request: { wallId: string; side: Side; stockId: Stock; floorGap: number }) {
  const wall = project.sections.find(({ id }) => id === request.wallId);
  const command = wall?.generator;
  const stock = drywallStock.find(({ id }) => id === request.stockId);
  if (!wall || command?.type !== "wall" || !stock || !same(rotate(up, wall.rotation), up))
    throw Error("Choose an upright framed wall and a drywall sheet size.");
  if (!Number.isFinite(request.floorGap) || request.floorGap < 0 || request.floorGap > 2)
    throw Error("Enter a bottom gap from 0 to 2 in.");
  if (project.sections.some(({ wallDrywall }) => wallDrywall?.wallId === wall.id && wallDrywall.side === request.side))
    throw Error("This wall face already has a drywall section. Review or remove it before making another layout.");

  const depth = framingStockDimensions(command.windowOpening?.stock ?? command.wallStock ?? "stud").depth;
  const sign = request.side === "front" ? 1 : -1;
  const face = depth / 2;
  const frame = members(project, wall);
  const backing = localParts(wall, frame).flatMap(({ piece, position: [x, y, z], axes: orientation }) => {
    // Angled, bored or notched members need an independent backing review.
    if (!material(piece.material).wood || !orientation.every((axis, i) => same(axis, axes[i])) ||
        piece.cutPlanes.length || piece.rectangularOpenings?.length || piece.roundOpenings?.length ||
        !nearly(sign * z + piece.size[2] / 2, face)) return [];
    const [w, h] = piece.size;
    return [{ x, left: x - w / 2, right: x + w / 2, bottom: y - h / 2, top: y + h / 2, stud: h > w }];
  });
  if (!backing.some(({ stud }) => stud)) throw Error("No aligned wood studs reach the planned wall face. Check the wall framing first.");
  const openings: Extents[] = [];
  const { doorOpening: door, windowOpening: window } = command;
  if (door) openings.push({
    left: (door.offset ?? 0) - door.width / 2, right: (door.offset ?? 0) + door.width / 2, bottom: 0,
    top: (door.floor ?? 0) + door.height,
  });
  if (window) openings.push({
    left: (window.offset ?? 0) - window.width / 2, right: (window.offset ?? 0) + window.width / 2,
    bottom: window.sill, top: window.sill + window.height,
  });

  const stockHeight = material(stock.id).stockSize?.[2] ?? 48;
  const task = step("Hang drywall");
  const name = `Drywall · ${request.side} · ${wall.name}`.slice(0, 80);
  const rotation = composeRotation(wall.rotation, composeRotation([0, sign < 0 ? Math.PI : 0, 0], [Math.PI / 2, 0, 0]));
  const edges = [-command.width / 2, command.width / 2];
  let prior: number[] = [];
  const parts: Piece[] = [];
  for (let top = command.height, row = 1; top > request.floorGap + tolerance; top -= stockHeight, row++) {
    const bottom = Math.max(request.floorGap, top - stockHeight);
    const full = openings.filter((hole) => hole.bottom <= bottom + tolerance && hole.top >= top - tolerance)
      .sort((a, b) => a.left - b.left);
    const runs = [edges[0], ...full.flatMap(({ left, right }) => [left, right]), edges[1]];
    const studs = [...new Set(backing.filter(({ stud }) => stud).map(({ x }) => x))].sort((a, b) => a - b)
      .filter((x) => !openings.some(({ left, right }) => x >= left - tolerance && x <= right + tolerance))
      .filter((x) => coverage(backing.filter(({ left, right }) => left < x - tolerance && right > x + tolerance)
        .map(({ bottom, top }) => [bottom, top]), bottom, top));
    const seams = [];
    let panel = 0;
    for (let i = 0; i < runs.length; i += 2) {
      let left = runs[i];
      const end = runs[i + 1];
      for (const right of sheetEnds(left, end, studs, prior, stock.length)) {
        const x = (left + right) / 2, y = (bottom + top) / 2;
        const cuts = openings.flatMap<RectangularOpening>((hole) => {
          const a = Math.max(left, hole.left), b = Math.min(right, hole.right);
          const c = Math.max(bottom, hole.bottom), d = Math.min(top, hole.top);
          if (b - a < tolerance || d - c < tolerance) return [];
          if (b - a < 0.125 || d - c < 0.125) throw Error("An opening leaves a cut smaller than ⅛ in in this layout. Adjust the gap or review that opening.");
          return [{ axis: 1, center: [y - (c + d) / 2, sign * ((a + b) / 2 - x)], spans: [d - c, b - a] }];
        });
        const size: V3 = [right - left, 2 * halfSheet, top - bottom];
        const problem = throughOpeningProblem(size, cuts);
        if (problem) throw Error(problem);
        const position = add(rotate([x, y, sign * (face + halfSheet)], wall.rotation), wall.origin);
        const sheet = part(`Drywall row ${row} panel ${++panel}`, stock.id, size, position, task.id, name, rotation);
        sheet.stockLengthAxis = 0;
        if (cuts.length) sheet.rectangularOpenings = cuts;
        parts.push(sheet);
        if (!nearly(right, end)) seams.push(right);
        left = right;
      }
    }
    prior = seams;
  }

  for (const sheet of parts) {
    const zone = project.workZone;
    const box = bounds(sheet);
    if (zone && (box.min[0] < -zone.width / 2 - 0.01 || box.max[0] > zone.width / 2 + 0.01 ||
      box.min[1] < -0.01 || box.max[1] > zone.height + 0.01 ||
      box.min[2] < -zone.depth / 2 - 0.01 || box.max[2] > zone.depth / 2 + 0.01))
      throw Error("Drywall extends outside the work zone. Allow for the finished thickness on this wall face.");
    const conflict = project.pieces.find((other) => {
      if (other.offcut) return false;
      const otherBox = bounds(other);
      if (box.min.some((min, i) => box.max[i] <= otherBox.min[i] + 0.01 || otherBox.max[i] <= min + 0.01)) return false;
      return pieceOverlap(sheet, other) !== false;
    });
    if (conflict) throw Error(`${sheet.name} may intersect ${conflict.name}. Check the wall-face area and plan any service or jamb cuts before hanging this face.`);
  }
  const section: Section = {
    id: uid(), name, pieceIds: parts.map(({ id }) => id), origin: wall.origin, rotation: wall.rotation,
    generator: null, recipe: null,
    wallDrywall: { wallId: wall.id, side: request.side, layoutKey: layoutKey(wall, frame, parts) },
  };
  const candidate = projectSchema.parse({ ...project, steps: [...project.steps, task],
    pieces: [...project.pieces, ...parts], sections: [...project.sections, section] });
  return { project: candidate, section, parts, frame, wall };
}

export function drywallCutMarks(sheet: Piece) {
  return (sheet.rectangularOpenings ?? []).filter(({ axis }) => axis === 1)
    .map(({ center, spans }) =>
      `${sheet.name} has a ${formatPreciseInches(spans[1])} wide × ${formatPreciseInches(spans[0])} high through-cut, ${formatPreciseInches(sheet.size[0] / 2 + center[1] - spans[1] / 2)} from the panel’s local left and ${formatPreciseInches(sheet.size[2] / 2 - center[0] - spans[0] / 2)} up from its bottom. Check these marks on the installed face.`);
}

export function drywallFaceCutBounds(sheet: Piece): [[number, number], [number, number]][] {
  const [width, , height] = sheet.size;
  return (sheet.rectangularOpenings ?? []).filter(({ axis }) => axis === 1)
    .map(({ center: [z, x], spans: [h, w] }) => [
      [width / 2 + x - w / 2, width / 2 + x + w / 2],
      [height / 2 - z - h / 2, height / 2 - z + h / 2],
    ]);
}

export function drywallGuideNotes(project: Project, section: Section, parts: Piece[]) {
  const { current } = wallDrywallFit(project, section, parts);
  return [
    ...(current ? [] : ["The source wall or fitted sheets changed. Recheck the measured opening, depth, backing and panel positions before cutting."]),
    "Hang this drywall face after checking concealed services and any required rough-in review. Check perimeter backing, opening backing and sheet-edge support in the actual wall. Hang the upper row first and confirm fastener and joint placement against the assembly requirements.",
    ...parts.flatMap(drywallCutMarks),
    "Keep sound rectangular sheet trims for another panel. Opening waste stays out of the Cut pool unless measured and added separately.",
    "After fastening, review the flat joint tape marks before fitting casing. Check actual tapers, backing and any perimeter or corner treatment.",
    `Installation reference · ${drywallInstallation}`,
  ].join("\n");
}

export function wallDrywallFit(project: Project, section: Section, parts = members(project, section)) {
  const layout = section.wallDrywall;
  const wall = layout && project.sections.find(({ id }) => id === layout.wallId);
  const frame = wall ? members(project, wall).filter((piece) => !isDoorFinish(piece)) : [];
  const current = !!layout && wall?.generator?.type === "wall" && layoutKey(wall, frame, parts) === layout.layoutKey;
  return { current, parts, frame };
}

export function addDrywallWindowBacking(project: Project, wallId: string) {
  const wall = project.sections.find(({ id }) => id === wallId);
  const command = wall?.generator;
  const window = command?.windowOpening;
  if (!wall || command?.type !== "wall" || !window || window.upperBacking)
    throw Error("Choose a framed window without upper backing studs.");
  const existing = members(project, wall);
  if (!existing.length) throw Error("This window has no current framing.");
  const generator = { ...command, windowOpening: { ...window, upperBacking: true } };
  const backing = sectionParts(generator, existing[0].stepId, wall.name, wall.origin, wall.rotation)
    .filter(({ designRole }) => designRole?.startsWith("window-upper-stud-"));
  if (!backing.length) throw Error("The framing layout has no clear stud location above that opening.");
  for (const stud of backing) {
    const box = bounds(stud);
    const conflict = project.pieces.find((other) => {
      if (other.offcut) return false;
      const support = bounds(other);
      return !box.min.some((min, i) => box.max[i] <= support.min[i] + 0.01 || support.max[i] <= min + 0.01) &&
        pieceOverlap(stud, other) !== false;
    });
    if (conflict) throw Error(`Window backing would intersect ${conflict.name}. Review its location before adding backing.`);
  }
  const backed = { ...wall, generator, pieceIds: [...wall.pieceIds, ...backing.map(({ id }) => id)] };
  return projectSchema.parse({
    ...project, pieces: [...project.pieces, ...backing], guideFingerprint: null,
    sections: project.sections.map((section) => {
      if (section.id === wall.id) return backed;
      const lining = section.wallDrywall;
      if (lining?.wallId !== wall.id) return section;
      const fit = wallDrywallFit(project, section);
      return fit.current ? { ...section, wallDrywall: {
        ...lining, layoutKey: layoutKey(backed, [...fit.frame, ...backing], fit.parts),
      } } : section;
    }),
  });
}
