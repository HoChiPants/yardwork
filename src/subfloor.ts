import { Vector3 } from "three";
import { subfloorPanel } from "./bottomPlateSealReference";
import { woodBearingSurfaces } from "./connectionContacts";
import { inspectCutStock, pieceCutKerf } from "./cutStock";
import { formatPreciseInches as dim } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { pieceThroughOpenings } from "./throughOpenings";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { orientedStockSize, stockAxes } from "./stockAxes";
import { subfloorNailing, subfloorReference as ref, subfloorScope } from "./subfloorReference";
import { subfloorChecksSchema } from "./subfloorSchema";

const tolerance = 0.00001;
const span = (from: number, to: number) => to - from;
type Surface = ReturnType<typeof woodBearingSurfaces>[number];
type Interval = [number, number];
type Edge = { name: string; points: [V3, V3]; problem: boolean };
type Contact = { piece: Piece; length: Interval; width: Interval; across: boolean; center: number };

function stockDirection(piece: Piece, axis: number) {
  const basis: V3 = [0, 0, 0];
  basis[axis] = 1;
  return new Vector3(...rotate(basis, piece.rotation));
}

export function isSubfloorPanel(piece: Piece) {
  if (piece.offcut || piece.material !== subfloorPanel.id || piece.cutPlanes.length || pieceThroughOpenings(piece).length) return false;
  const { thickness, length, width } = stockAxes(piece);
  return Math.abs(piece.size[thickness] - subfloorPanel.size[1]) < tolerance &&
    piece.size[length] <= subfloorPanel.size[2] + tolerance && piece.size[width] <= subfloorPanel.size[0] + tolerance &&
    Math.abs(stockDirection(piece, thickness).y) > 1 - tolerance;
}

function uncovered(length: number, intervals: Interval[]) {
  const breaks: Interval[] = [];
  let covered = 0;
  for (const [start, end] of intervals.sort(([a], [b]) => a - b)) {
    if (start > covered + tolerance) breaks.push([covered, start]);
    covered = Math.max(covered, end);
  }
  if (length > covered + tolerance) breaks.push([covered, length]);
  return breaks;
}

function nailPositions(length: number, spacing: number, required: number[] = []) {
  const anchors = [ref.edgeInset, ...required, length - ref.edgeInset];
  return [anchors[0], ...anchors.slice(1).flatMap((end, i) => {
    const start = anchors[i];
    const sections = Math.ceil((end - start) / spacing);
    return Array.from({ length: sections }, (_, n) => start + (end - start) * (n + 1) / sections);
  })];
}

function reviewSurface(surface: Surface, pieces: Map<string, Piece>) {
  const { piece } = surface;
  const axes = stockAxes(piece);
  const width = piece.size[axes.width], length = piece.size[axes.length];
  const u = stockDirection(piece, axes.length), v = stockDirection(piece, axes.width);
  const start = new Vector3(...piece.position).addScaledVector(u, -length / 2).addScaledVector(v, -width / 2);
  const toWorld = (x: number, z: number): V3 => start.clone().addScaledVector(u, x).addScaledVector(v, z)
    .setY(piece.position[1] + piece.size[axes.thickness] / 2 + 0.015).toArray();
  const contacts = surface.contacts.flatMap(({ pieceId, area, outline }): Contact[] => {
    const support = pieces.get(pieceId)!;
    if (material(support.material).stockKind !== "linear") return [];
    const direction = stockDirection(support, stockAxes(support).length);
    const across = Math.abs(direction.dot(v)) > 1 - tolerance;
    if (!across && Math.abs(direction.dot(u)) <= 1 - tolerance) return [];
    const offsets = outline.map((point) => new Vector3(...point).sub(start));
    const x = offsets.map((offset) => offset.dot(u)), z = offsets.map((offset) => offset.dot(v));
    const along: Interval = [Math.max(0, Math.min(...x)), Math.min(length, Math.max(...x))];
    const cross: Interval = [Math.max(0, Math.min(...z)), Math.min(width, Math.max(...z))];
    if (Math.abs(area - span(...along) * span(...cross)) > tolerance) return [];
    return [{ piece: support, length: along, width: cross, across,
      center: new Vector3(...support.position).sub(start).dot(u) }];
  });
  const joists = contacts.filter(({ across, length, width: [from, to] }) =>
    across && span(...length) >= ref.minimumBearing - tolerance && from <= tolerance && to >= width - tolerance)
    .sort((a, b) => a.center - b.center);
  const gaps: { left: Contact; right: Contact; spacing: number }[] = [];
  for (const [index, right] of joists.entries()) {
    const left = joists[index - 1];
    if (left) gaps.push({ left, right, spacing: right.center - left.center });
  }
  const widest = gaps.reduce((largest, gap) => Math.max(largest, gap.spacing), 0);
  const issues: string[] = [];
  const panelSolid = prepareCollisionSolid(piece);
  if (panelSolid) {
    const hits = [...pieces.values()].some((other) => {
      if (other.id === piece.id || other.offcut || !material(other.material).wood) return false;
      const otherSolid = prepareCollisionSolid(other);
      return otherSolid && solidOverlap(panelSolid, otherSolid);
    });
    if (hits) issues.push("A wood part overlaps the panel. Clear the interference before reviewing fastener locations.");
  }
  if (joists.length < 3) issues.push("Need three continuous joist lines across the panel width to check two spans. Set the panel strength axis across the joists.");
  if (widest > ref.maxSpacing + tolerance)
    issues.push(`Widest spacing is ${dim(widest)} on center. The panel reference limit is ${dim(ref.maxSpacing)}.`);
  const edges: Edge[] = [], blocking: { edge: string; length: number; first: Piece; second: Piece }[] = [];
  const details = ([
    { name: "Start end", short: true, high: false }, { name: "Far end", short: true, high: true },
    { name: "Long side A", short: false, high: false }, { name: "Long side B", short: false, high: true },
  ]).map(({ name, short, high }) => {
    const full = short ? width : length, other = short ? length : width;
    const edge = high ? other : 0;
    const at = (value: number) => short ? toWorld(edge, value) : toWorld(value, edge);
    const coverage = contacts.flatMap((contact) => {
      const [from, to] = short ? contact.length : contact.width;
      if (high ? to < edge - tolerance || from > edge - ref.minimumBearing + tolerance
        : from > tolerance || to < ref.minimumBearing - tolerance) return [];
      return [short ? contact.width : contact.length];
    });
    const missing = uncovered(full, coverage);
    edges.push({ name, points: [at(0), at(full)], problem: false });
    for (const [from, to] of missing) {
      edges.push({ name, points: [at(from), at(to)], problem: true });
      if (short) continue;
      for (const { left, right } of gaps) {
        const a = left.length[1], b = right.length[0];
        if (b > a + tolerance && a >= from - tolerance && b <= to + tolerance)
          blocking.push({ edge: name, length: b - a, first: left.piece, second: right.piece });
      }
    }
    if (missing.length) issues.push(`${name} lacks ½ in bearing along ${dim(missing.reduce((total, gap) => total + span(...gap), 0))}.`);
    return { name, missing };
  });
  if (width < ref.minimumPanelWidth - tolerance || length < 2 * ref.minimumBearing)
    issues.push("The floor span table covers panels at least 24 in wide. Review this narrow blank separately.");
  const spans = gaps.map(({ left, right, spacing }) => ({
    points: [toWorld(Math.max(0, left.center), width / 2), toWorld(Math.min(length, right.center), width / 2)] as [V3, V3],
    problem: spacing > ref.maxSpacing + tolerance,
  }));
  const points = new Map<string, V3>();
  if (!issues.length) {
    const add = (x: number, z: number) => points.set(`${x.toFixed(5)}/${z.toFixed(5)}`, toWorld(x, z));
    const centerlines = joists.flatMap(({ center, length: [from, to] }) =>
      center > ref.edgeInset + tolerance && center < length - ref.edgeInset - tolerance &&
      center > from + tolerance && center < to - tolerance ? [center] : []);
    for (const x of nailPositions(length, ref.edgeSpacing, centerlines)) {
      add(x, ref.edgeInset);
      add(x, width - ref.edgeInset);
    }
    for (const z of nailPositions(width, ref.edgeSpacing)) {
      add(ref.edgeInset, z);
      add(length - ref.edgeInset, z);
    }
    for (const center of centerlines)
      for (const z of nailPositions(width, ref.fieldSpacing).slice(1, -1)) add(center, z);
  }
  return { piece, supportIds: [...new Set(contacts.map(({ piece }) => piece.id))], joistCount: joists.length, widest, issues, edges, spans, details, blocking, nails: [...points.values()],
    center: toWorld(length / 2, width / 2) };
}

type Layout = ReturnType<typeof reviewSurface>;
export type SubfloorReview = { panelId: string; layout?: Layout; problem?: string };

export function subfloorReviews(project: Project, ids = project.subfloorChecks ?? []): SubfloorReview[] {
  if (!ids.length) return [];
  const wanted = new Set(ids);
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const eligible = new Set(project.pieces.filter((piece) => wanted.has(piece.id) && isSubfloorPanel(piece)).map(({ id }) => id));
  const surfaces = new Map(woodBearingSurfaces(project, eligible).map((surface) => [surface.piece.id, surface]));
  return ids.map((panelId) => {
    const surface = surfaces.get(panelId);
    if (surface) return { panelId, layout: reviewSurface(surface, pieces) };
    return { panelId, problem: pieces.has(panelId)
      ? "Choose a horizontal, rectangular 23/32 in T&G OSB panel with its thickness intact. Through openings and profile cuts need a separate review."
      : "The tracked subfloor panel is missing. Remove this check or restore the panel." };
  });
}

export function trackSubfloorPanel(project: Project, panelId: string, enabled: boolean): Project {
  const checks = (project.subfloorChecks ?? []).filter((id) => id !== panelId);
  if (enabled) {
    if (!project.pieces.some((piece) => piece.id === panelId && isSubfloorPanel(piece)))
      throw Error("Choose a supported subfloor panel to keep the check with the project.");
    checks.push(panelId);
  }
  return { ...project, subfloorChecks: subfloorChecksSchema.parse(checks), guideFingerprint: null };
}

export function subfloorBlockingLines(project: Project, rows: NonNullable<SubfloorReview["layout"]>["blocking"]) {
  if (!rows.length) return [];
  const valid = inspectCutStock(project).valid;
  const scraps = project.pieces.filter((piece) => piece.offcut && !piece.cutPlanes.length &&
    !pieceThroughOpenings(piece).length && (!piece.cutStock || valid.has(piece.cutStock.id)));
  const suggested = new Set<string>();
  return rows.map(({ edge, length, first, second }) => {
    const [thickness, width] = orientedStockSize(first);
    const scrap = scraps.find((piece) => {
      if (suggested.has(piece.id) || piece.material !== first.material) return false;
      const [t, w, l] = orientedStockSize(piece);
      return Math.abs(t - thickness) <= tolerance && Math.abs(w - width) <= tolerance &&
        (Math.abs(l - length) <= tolerance || l >= length + pieceCutKerf(piece) - tolerance);
    });
    if (scrap) suggested.add(scrap.id);
    return `${edge} · measure between ${partLabel(project, first.id)} and ${partLabel(project, second.id)} · estimated blocking cut ${dim(length)}.${scrap ? ` Check matching Cut pool piece ${partLabel(project, scrap.id)} (${scrap.name}).` : ""} Verify stock, fit and how it attaches before cutting.`;
  });
}

export function subfloorReport(project: Project) {
  const rows = subfloorReviews(project);
  if (!rows.length) return [];
  return [subfloorScope, ...rows.flatMap(({ panelId, problem, layout }) => {
    const label = layout?.piece.name ?? project.pieces.find(({ id }) => id === panelId)?.name ?? "Missing subfloor panel";
    return [`${partLabel(project, panelId)} · ${label}`, ...(problem ? [problem] : []), ...(layout ? [
      `${layout.joistCount} continuous joist lines${layout.widest ? ` · widest spacing ${dim(layout.widest)} on center` : ""}.`,
      ...layout.issues, ...subfloorBlockingLines(project, layout.blocking),
      ...(layout.nails.length ? [`${layout.nails.length} estimated panel nailing locations. ${subfloorNailing}`] : []),
    ] : [])];
  })];
}
