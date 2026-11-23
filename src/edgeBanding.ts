import { clipBox } from "./cutProfiles";
import {
  edgeBandingProducts,
  edgeBandingProductIds,
  edgeBandingScope,
  type EdgeBandingProductId,
} from "./edgeBandingReference";
import {
  edgeBandingSchema,
  measuredBandingThickness,
  type EdgeBandingEntry,
  type EdgeBandingFace,
} from "./edgeBandingSchema";
import { bindingHash } from "./ideaBindingState";
import { formatStockLength } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import {
  prepareCollisionBox,
  prepareCollisionSolid,
  solidOverlap,
} from "./solidCollision";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { packRuns } from "./stockRunPacking";
import { addSupply } from "./supplies";
import {
  openingAxes,
  openingHalfSpans,
  pieceThroughOpenings,
} from "./throughOpenings";

export const edgeBandingTitle = "Panel edge banding";
export const edgeBandingPending =
  "Review changed or covered panel edges in List before adding rolls from the plan.";
const axes = [0, 1, 2] as const;
const eps = 1e-6;
const neighborProbe = 0.002;

export function isBandingPanel(piece: Piece) {
  const stock = material(piece.material);
  return (
    !piece.offcut && stock.wood && stock.cuttable && stock.stockKind === "sheet"
  );
}

export const bandingKey = ({
  pieceId,
  face,
}: Pick<EdgeBandingEntry, "pieceId" | "face">) => `${pieceId}/${face}`;
const world = (value: V3, piece: Piece) =>
  rotate(value, piece.rotation).map((n, i) => n + piece.position[i]) as V3;

export type BandingEdge = {
  pieceId: string;
  face: EdgeBandingFace;
  label: string;
  fingerprint: string;
  length: number;
  thickness: number;
  normal: V3;
  points: [V3, V3];
  coveredBy?: string;
};

export function edgeBandingEdges(
  project: Project,
  keys?: ReadonlySet<string>,
  checkCoverage = true,
): BandingEdge[] {
  const panels = project.pieces.filter(isBandingPanel);
  if (!panels.length) return [];
  const solids = checkCoverage ? project.pieces.flatMap((piece) => {
    if (piece.offcut || !material(piece.material).wood) return [];
    const solid = prepareCollisionSolid(piece);
    return solid ? [{ piece, solid }] : [];
  }) : [];
  const labels = new Map(
    ensurePartLabels(project).partLabels.map(({ partId, label }) => [
      partId,
      label,
    ]),
  );
  return panels.flatMap((piece) => {
    const { thickness: t } = stockAxes(piece, piece.cutStock?.size);
    const solid = clipBox(piece.size, piece.cutPlanes);
    const openings = pieceThroughOpenings(piece);
    return solid.faces.flatMap(({ normal, indices }) => {
      const side = axes.find((a) => a !== t && Math.abs(normal[a]) >= 1 - eps);
      if (
        side === undefined ||
        normal.some((value, a) => a !== side && Math.abs(value) > eps)
      )
        return [];
      const sign = Math.sign(normal[side]);
      const face = `${sign < 0 ? "-" : "+"}${"XYZ"[side]}` as EdgeBandingFace;
      const key = bandingKey({ pieceId: piece.id, face });
      if (keys && !keys.has(key)) return [];
      const along = axes.find((a) => a !== side && a !== t)!;
      const ring = indices.map((index) => solid.vertices[index]);
      const low = axes.map((a) => Math.min(...ring.map((p) => p[a]))) as V3;
      const high = axes.map((a) => Math.max(...ring.map((p) => p[a]))) as V3;
      const length = high[along] - low[along],
        thickness = high[t] - low[t];
      // A usable edge is a full rectangle through the panel thickness.
      if (
        length <= eps ||
        Math.abs(thickness - piece.size[t]) > eps ||
        ![low[t], high[t]].every((y) =>
          [low[along], high[along]].every((x) =>
            ring.some(
              (p) => Math.abs(p[t] - y) <= eps && Math.abs(p[along] - x) <= eps,
            ),
          ),
        )
      )
        return [];
      if (
        openings.some((opening) => {
          const half = openingHalfSpans(opening);
          return openingAxes(opening.axis).every(
            (axis, i) =>
              high[axis] >= opening.center[i] - half[i] - eps &&
              low[axis] <= opening.center[i] + half[i] + eps,
          );
        })
      )
        return [];
      const center = low.map((n, i) => (n + high[i]) / 2) as V3;
      const ends: [V3, V3] = [[...center], [...center]];
      ends[0][along] = low[along];
      ends[1][along] = high[along];

      // Sample a thin rectangle just outside the face. Shrink its ends to
      // distinguish neighbor contact with this edge from a shared corner.
      const probeSize = high.map((n, i) =>
        Math.max(eps, n - low[i] - 2 * eps),
      ) as V3;
      probeSize[side] = neighborProbe;
      const probeCenter = [...center] as V3;
      probeCenter[side] += (sign * neighborProbe) / 2;
      const probe = checkCoverage ? prepareCollisionBox(probeSize, world(probeCenter, piece), piece.rotation) : undefined;
      const covering = probe && solids.find(({ piece: neighbor, solid }) =>
        neighbor.id !== piece.id && solidOverlap(probe, solid, eps));
      return [
        {
          pieceId: piece.id,
          face,
          label: `${labels.get(piece.id)} · ${piece.name} · local ${face}`,
          fingerprint: bindingHash({
            material: piece.material,
            face,
            low,
            high,
          }),
          length,
          thickness,
          normal: rotate(normal, piece.rotation),
          points: [world(ends[0], piece), world(ends[1], piece)],
          coveredBy: covering?.piece.name,
        },
      ];
    });
  });
}

export function canModelBanding(piece: Piece) {
  return isBandingPanel(piece) && !piece.cutPlanes.length && !pieceThroughOpenings(piece).length;
}

type PanelBuildUp = { low: V3; high: V3 };
export function measuredBandingByPanel(project: Project, edges?: BandingEdge[]) {
  const buildup = new Map<string, PanelBuildUp>();
  const measured = project.edgeBanding?.filter(({ installedThickness }) => installedThickness !== undefined) ?? [];
  if (!measured.length) return buildup;
  const panels = new Map(project.pieces.filter(canModelBanding).map((piece) => [piece.id, piece]));
  const measuredKeys = new Set(measured.map(bandingKey));
  const current = new Map((edges ?? edgeBandingEdges(project, measuredKeys, false)).map((edge) => [bandingKey(edge), edge]));
  for (const entry of measured) {
    const edge = current.get(bandingKey(entry));
    if (!edge || edge.fingerprint !== entry.fingerprint || !panels.has(entry.pieceId)) continue;
    const profile = buildup.get(entry.pieceId) ?? { low: [0, 0, 0], high: [0, 0, 0] };
    const axis = "XYZ".indexOf(entry.face[1]);
    (entry.face[0] === "+" ? profile.high : profile.low)[axis] = entry.installedThickness!;
    buildup.set(entry.pieceId, profile);
  }
  return buildup;
}

export function finishedPanel(piece: Piece, profiles: ReadonlyMap<string, PanelBuildUp>): Piece {
  const profile = profiles.get(piece.id);
  if (!profile) return piece;
  const shift = rotate(profile.high.map((n, i) => (n - profile.low[i]) / 2) as V3, piece.rotation);
  return { ...piece,
    size: piece.size.map((n, i) => n + profile.high[i] + profile.low[i]) as V3,
    position: piece.position.map((n, i) => n + shift[i]) as V3,
  };
}

/** Band the lower local axis first, then let the final edges cover those ends. */
function cornerAllowance(edge: BandingEdge, measured: ReadonlyMap<string, PanelBuildUp>) {
  const panel = measured.get(edge.pieceId);
  if (!panel) return 0;
  const axis = "XYZ".indexOf(edge.face[1]);
  const adjacent = axes.find((i) => i < axis && panel.high[i] + panel.low[i] > 0);
  return adjacent === undefined ? 0 : panel.high[adjacent] + panel.low[adjacent];
}

export function finishedPanelFit(project: Project) {
  const measured = measuredBandingByPanel(project);
  if (!measured.size) return [];
  const panels = project.pieces.flatMap((piece) => {
    if (piece.offcut) return [];
    const model = finishedPanel(piece, measured);
    const solid = prepareCollisionSolid(model);
    return solid ? [{ piece, model, solid }] : [];
  });
  return panels.filter(({ piece }) => measured.has(piece.id)).map(({ piece, model, solid }) => ({
    piece, model,
    contacts: panels.filter((other) => other.piece.id !== piece.id && solidOverlap(solid, other.solid, 0.01))
      .map(({ piece }) => piece.name),
  }));
}

export const edgeBandingFinding = {
  ready: "Ready",
  missing: "Edge missing or no longer straight",
  changed: "Edge dimensions changed",
  covered: "Another wood part covers this edge",
  narrow: "Banding is narrower than the panel edge",
  long: "Strip exceeds one continuous roll",
  profile: "Recheck measured thickness on the changed panel profile",
};

export function bandingStatus(
  edge: BandingEdge,
  productId: EdgeBandingProductId,
  trim: number,
) {
  const stock = edgeBandingProducts[productId];
  if (edge.coveredBy) return "covered";
  if (edge.thickness > stock.width + eps) return "narrow";
  if (edge.length + trim > stock.length + eps) return "long";
  return "ready";
}

export function reviewEdgeBanding(project: Project, edges?: BandingEdge[]) {
  const entries = project.edgeBanding ?? [];
  if (!entries.length) return [];
  const current = new Map(
    (edges ?? edgeBandingEdges(project, new Set(entries.map(bandingKey)))).map(
      (edge) => [bandingKey(edge), edge],
    ),
  );
  const measured = measuredBandingByPanel(project, [...current.values()]);
  const panels = new Map(project.pieces.map((piece) => [piece.id, piece]));
  return edgeBandingProductIds.flatMap((productId) => {
    const saved = entries.filter((entry) => entry.productId === productId);
    if (!saved.length) return [];
    const rows = saved.map((entry) => {
      const edge = current.get(bandingKey(entry));
      const corner = edge && entry.installedThickness !== undefined ? cornerAllowance(edge, measured) : 0;
      const panel = panels.get(entry.pieceId);
      const state: keyof typeof edgeBandingFinding = !edge
        ? "missing"
        : edge.fingerprint !== entry.fingerprint
          ? "changed"
          : entry.installedThickness !== undefined && (!panel || !canModelBanding(panel))
            ? "profile"
            : bandingStatus(edge, productId, entry.trim + corner);
      return { entry, edge, corner, state, label: edge?.label ?? entry.label };
    });
    const rolls = packRuns(
      rows.flatMap(({ entry, edge, corner, state }) =>
        state === "ready" && edge
          ? [{ edge, length: edge.length + entry.trim + corner, trim: entry.trim, corner, installedThickness: entry.installedThickness }]
          : [],
      ),
      edgeBandingProducts[productId].length,
    ).bins;
    const required = rows.every(({ state }) => state === "ready")
      ? rolls.length
      : null;
    const selected = project.supplies
      .filter(({ productId: id }) => id === productId)
      .reduce((sum, row) => sum + row.quantity, 0);
    return {
      productId,
      rows,
      rolls,
      required,
      selected,
      missing: required === null ? null : Math.max(0, required - selected),
    };
  });
}

export type EdgeBandingReview = ReturnType<typeof reviewEdgeBanding>;

export function saveEdgeBanding(
  project: Project,
  keys: ReadonlySet<string>,
  productId: EdgeBandingProductId,
  trim: number,
  installedThickness?: number,
) {
  if (installedThickness !== undefined) measuredBandingThickness.parse(installedThickness);
  if (!keys.size) return project;
  const current = edgeBandingEdges(project, keys);
  if (current.length !== keys.size)
    throw Error("An edge changed. Review the current selection.");
  const panels = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const entries = current.map((edge): EdgeBandingEntry => {
    const panel = panels.get(edge.pieceId);
    if (installedThickness !== undefined && (!panel || !canModelBanding(panel)))
      throw Error(`${edge.label} needs a rectangular panel without through-cuts for the measured fit preview.`);
    const state = bandingStatus(edge, productId, trim);
    if (state !== "ready")
      throw Error(`${edge.label} · ${edgeBandingFinding[state]}.`);
    const { pieceId, face, fingerprint, label } = edge;
    return { pieceId, face, fingerprint, label, productId, trim,
      ...(installedThickness !== undefined && { installedThickness }) };
  });
  const next = {
    ...project,
    guideFingerprint: null,
    edgeBanding: edgeBandingSchema.parse([
      ...(project.edgeBanding ?? []).filter((item) => !keys.has(bandingKey(item))),
      ...entries,
    ]),
  };
  if (installedThickness !== undefined) {
    const measured = measuredBandingByPanel(next);
    for (const edge of current) {
      if (bandingStatus(edge, productId, trim + cornerAllowance(edge, measured)) !== "ready")
        throw Error(`${edge.label} exceeds the roll after allowing for its finished corner.`);
    }
  }
  return next;
}

export function removeEdgeBanding(project: Project, key: string): Project {
  const { edgeBanding, ...rest } = project;
  const next = edgeBanding?.filter((entry) => bandingKey(entry) !== key);
  if (next?.length === edgeBanding?.length) return project;
  return next?.length ? { ...rest, guideFingerprint: null, edgeBanding: next } : { ...rest, guideFingerprint: null };
}

export function addMissingEdgeBanding(
  project: Project,
  productId: EdgeBandingProductId,
) {
  const group = reviewEdgeBanding(project).find(
    (row) => row.productId === productId,
  );
  if (!group || group.missing === 0) return project;
  if (group.missing === null) throw Error(edgeBandingPending);
  return addSupply(project, productId, group.missing, edgeBandingTitle);
}

export function edgeBandingLines(group: EdgeBandingReview[number]) {
  return {
    review:
      group.required === null
        ? edgeBandingPending
        : `${group.required} ${group.required === 1 ? "roll" : "rolls"} needed · ${group.selected} selected.`,
    issues: group.rows.flatMap(({ label, state, edge }) =>
      state === "ready"
        ? []
        : [
            `${label} · ${edgeBandingFinding[state]}${edge?.coveredBy ? ` · ${edge.coveredBy}` : ""}.`,
          ],
    ),
    rolls: group.rolls.map(({ left, runs }, index) => ({
      label: `Roll ${index + 1} · ${formatStockLength(left)} left`,
      strips: runs.map(
        ({ edge, length, trim, corner, installedThickness }) =>
          `${edge.label} · Cut ${formatStockLength(length)} · ${formatStockLength(edge.length)} edge${corner ? ` + ${formatStockLength(corner)} to cover the banded ends` : ""} + ${formatStockLength(trim)} trim.${installedThickness === undefined ? "" : ` Installed thickness ${formatStockLength(installedThickness)}.`}`,
      ),
    })),
  };
}

export const edgeBandingSequence =
  "Label and dry-fit the cut panels first. Cut the marked strips, apply and press them with the tools specified for the delivered veneer, then let them cool before trimming flush. Check fit again before fastening.";

export const measuredBandingSequence =
  "For corners with measured thickness, apply the strips on the lower local axis first. For example, cover local X edges before local Y edges. The second pair covers the finished ends of the first pair.";

export function finishedPanelFitLine({ piece, model, contacts }: ReturnType<typeof finishedPanelFit>[number]) {
  const size = (part: Piece) => part.size.map(formatStockLength).join(" × ");
  return `${piece.name} · Cut ${size(piece)} · Finished ${size(model)}.${contacts.length ? ` Current pose overlaps ${contacts.join(", ")}.` : ""}`;
}

export function edgeBandingMarkdown(project: Project) {
  const groups = reviewEdgeBanding(project);
  if (!groups.length) return "";
  const escape = (line: string) =>
    line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]+/g, " ");
  return [
    "",
    "",
    `## ${edgeBandingTitle}`,
    "",
    edgeBandingScope,
    "",
    edgeBandingSequence,
    ...(project.edgeBanding?.some(({ installedThickness }) => installedThickness !== undefined) ? [
      "",
      measuredBandingSequence,
      ...finishedPanelFit(project).map((panel) => `- ${escape(finishedPanelFitLine(panel))}`),
    ] : []),
    ...groups.flatMap((group) => {
      const stock = edgeBandingProducts[group.productId];
      const { review, issues, rolls } = edgeBandingLines(group);
      return [
        "",
        `### ${stock.name}`,
        "",
        `[Exact roll listing](${stock.listing})`,
        "",
        review,
        ...issues.map((issue) => `- ${escape(issue)}`),
        ...rolls.flatMap(({ label, strips }) => [
          `- ${label}`,
          ...strips.map((strip) => `  - ${escape(strip)}`),
        ]),
      ];
    }),
    "",
  ].join("\n");
}
