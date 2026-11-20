import { everbiltClosetRod } from "./closetRodReference";
import { formatPreciseInches } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import {
  rodFitSchema,
  rodMeasurementTolerance,
  socketHoleLayoutInputSchema,
  socketPlateInputSchema,
  type RodSocketPlate,
} from "./rodFitSchema";
import { reviewRodFit, sameRodEnd } from "./rodFits";
import {
  reviewSocketPlateFace,
  reviewWoodMountHoles,
  socketFaceAxes,
} from "./rodMountGeometry";
import { rotate } from "./spatial";

type Fit = ReturnType<typeof reviewRodFit>;
export type RodEndSide = "start" | "end";
export const rodEndSides: readonly RodEndSide[] = ["start", "end"];

export const rodSocketSourceNote =
  "The Everbilt pair has an open and a closed socket. Measure the backplates on the delivered pieces; the listing has no usable mounting drawing.";

export const rodPlateScope =
  "The backplate and mounting paths are checked against the modeled panel. Verify the delivered screws, actual backing, tool access, insertion clearance and loads on site.";

function measuredFit(fit: Fit) {
  return fit.state === "measured" &&
    fit.plan &&
    fit.bay &&
    fit.bay.rod.material === everbiltClosetRod.materialId &&
    fit.delta !== null &&
    Math.abs(fit.delta) <= rodMeasurementTolerance
    ? { plan: fit.plan, bay: fit.bay }
    : null;
}

function replaceFit(project: Project, fit: NonNullable<Fit["plan"]>) {
  return {
    ...project,
    rodFitPlans: (project.rodFitPlans ?? []).map((plan) =>
      plan.rodId === fit.rodId ? rodFitSchema.parse(fit) : plan,
    ),
  };
}

export function saveRodSocketPlate(
  project: Project,
  rodId: string,
  side: RodEndSide,
  input: unknown,
) {
  const current = measuredFit(reviewRodFit(project, rodId));
  if (!current)
    throw Error(
      "Save field measurements for an Everbilt rod that agree with the modeled opening.",
    );
  const face = current.plan[side];
  if (!socketFaceAxes(face.normalLocal))
    throw Error(
      "The backplate needs a flat, square mounting face on the cabinet panel.",
    );
  const plate = socketPlateInputSchema.parse(input);
  const priorLayout = current.plan.socketPlates?.[side]?.holeLayout;
  return replaceFit(project, {
    ...current.plan,
    socketPlates: {
      ...current.plan.socketPlates,
      [side]: {
        ...plate,
        face,
        ...(priorLayout ? { holeLayout: priorLayout } : {}),
        socket:
          current.plan.measurements.closedEnd === side ? "closed" : "open",
      },
    },
  });
}

export function saveRodSocketHoles(
  project: Project,
  rodId: string,
  side: RodEndSide,
  input: unknown,
) {
  const current = measuredFit(reviewRodFit(project, rodId));
  const plate = current?.plan.socketPlates?.[side];
  if (
    !current ||
    !plate ||
    !socketFaceAxes(current.bay[side].normalLocal) ||
    !sameRodEnd(plate.face, current.bay[side]) ||
    plate.socket !==
      (current.plan.measurements.closedEnd === side ? "closed" : "open")
  )
    throw Error(
      "Save the current backplate before transferring its mounting holes.",
    );
  const layout = socketHoleLayoutInputSchema.parse(input);
  return replaceFit(project, {
    ...current.plan,
    socketPlates: {
      ...current.plan.socketPlates,
      [side]: {
        ...plate,
        holeLayout: { ...layout, face: plate.face, socket: plate.socket },
      },
    },
  });
}

export function removeRodSocketHoles(
  project: Project,
  rodId: string,
  side: RodEndSide,
) {
  const fit = project.rodFitPlans?.find((plan) => plan.rodId === rodId);
  const plate = fit?.socketPlates?.[side];
  if (!fit || !plate?.holeLayout) return project;
  const { holeLayout: _removed, ...backplate } = plate;
  return replaceFit(project, {
    ...fit,
    socketPlates: { ...fit.socketPlates, [side]: backplate },
  });
}

const staleHoles = {
  state: "stale" as const,
  marks: [],
  detail:
    "The mounting face or socket changed. Recheck the transferred hole positions and depth measurements.",
};
function reviewHoleLayout(
  piece: Piece,
  plate: RodSocketPlate,
  backed: boolean,
) {
  const layout = plate.holeLayout;
  if (!layout) return null;
  const { face } = plate;
  const frame = socketFaceAxes(face.normalLocal);
  if (
    !frame ||
    !sameRodEnd(layout.face, face) ||
    layout.socket !== plate.socket
  )
    return staleHoles;
  return reviewWoodMountHoles(piece, face, plate.extents, layout, backed);
}

export function removeRodSocketPlate(
  project: Project,
  rodId: string,
  side: RodEndSide,
) {
  const fit = project.rodFitPlans?.find((row) => row.rodId === rodId);
  if (!fit?.socketPlates?.[side]) return project;
  const { socketPlates, ...rest } = fit;
  const kept = { ...socketPlates };
  delete kept[side];
  return replaceFit(
    project,
    kept.start || kept.end ? { ...rest, socketPlates: kept } : rest,
  );
}

export function reviewRodSocketPlates(project: Project, fit: Fit) {
  const current = measuredFit(fit);
  return rodEndSides.map((side) => {
    const plate = fit.plan?.socketPlates?.[side];
    const candidate = fit.bay?.[side];
    const pieceId = candidate?.pieceId ?? plate?.face.pieceId ?? null;
    const frame = candidate ? socketFaceAxes(candidate.normalLocal) : null;
    const piece = project.pieces.find((row) => row.id === pieceId);
    const socket = current
      ? current.plan.measurements.closedEnd === side
        ? "closed"
        : "open"
      : null;
    const base = {
      side,
      pieceId,
      plate,
      socket,
      axes: frame?.across,
      localCenter: candidate?.pointLocal ?? plate?.face.pointLocal,
      center: null,
      outline: null,
      holes: plate?.holeLayout ? staleHoles : null,
    };
    if (
      plate &&
      (!current ||
        !candidate ||
        !frame ||
        !piece ||
        !sameRodEnd(plate.face, candidate) ||
        socket !== plate.socket)
    )
      return {
        ...base,
        state: "stale" as const,
        detail:
          "The rod fit, mounting face or socket assignment changed. Confirm the backplate again.",
      };
    const ready = !!current && !!frame && !!piece;
    if (!plate || !candidate || !piece)
      return {
        ...base,
        state: "pending" as const,
        detail: ready
          ? "Enter the delivered backplate’s reach from the rod center in all four directions."
          : "Save matching rod measurements and use a square panel face to review this backplate.",
      };
    const geometry = reviewSocketPlateFace(
      piece,
      candidate.pointLocal,
      candidate.normalLocal,
      plate.extents,
    );
    if (!geometry)
      return {
        ...base,
        state: "stale" as const,
        detail: "Choose a square mounting face for the backplate.",
      };
    const toWorld = (local: V3) =>
      rotate(local, piece.rotation).map((n, i) => n + piece.position[i]) as V3;
    const detail = [
      geometry.crossesEdge
        ? "The backplate envelope crosses a retained panel edge."
        : "",
      geometry.crossesVoid
        ? "The backplate envelope crosses a through-cut."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ...base,
      center: toWorld(candidate.pointLocal),
      outline: geometry.corners.map(toWorld),
      holes: reviewHoleLayout(piece, plate, !detail),
      state: detail ? ("conflict" as const) : ("backed" as const),
      detail:
        detail ||
        "The recorded backplate envelope fits on retained panel material.",
    };
  });
}

export function rodSocketPlateGuideLines(project: Project, fit: Fit) {
  return reviewRodSocketPlates(project, fit).flatMap((row) => {
    if (!row.plate) return [];
    const frame = socketFaceAxes(row.plate.face.normalLocal);
    if (!frame)
      return [
        `${partLabel(project, row.plate.face.pieceId)} · Confirm the saved backplate axes before using these marks.`,
      ];
    const [u, v] = frame.across;
    const axes = ["X", "Y", "Z"];
    const [negU, posU, negV, posV] = row.plate.extents.map(formatPreciseInches);
    const layout = row.plate.holeLayout;
    const holes = row.holes;
    return [
      `${row.side === "start" ? "Start" : "End"} socket backplate · ${partLabel(project, row.plate.face.pieceId)} · recorded ${row.plate.socket}-lip socket. ${row.detail}`,
      `Local rod center (X, Y, Z) · ${row.plate.face.pointLocal.map(formatPreciseInches).join(", ")}. Backplate reaches ${negU} toward −${axes[u]}, ${posU} toward +${axes[u]}, ${negV} toward −${axes[v]} and ${posV} toward +${axes[v]}. Notes: ${row.plate.basis.replace(/[\r\n]/g, " ")}.`,
      ...(layout && holes
        ? [
            `Transferred socket mounting holes · ${holes.detail}`,
            ...(holes.state !== "stale"
              ? [
                  `Entered pilot diameter ${formatPreciseInches(layout.pilotDiameter)} and deepest depth ${formatPreciseInches(layout.pilotDepth)}. Seated screw diameter ${formatPreciseInches(layout.screwDiameter)} and depth past the wood face ${formatPreciseInches(layout.screwDepth)}. Measurement notes · ${layout.basis.replace(/[\r\n]/g, " ")}`,
                  ...holes.marks.map((mark) =>
                    holes.state === "checked"
                      ? `Hole ${mark.index} · local X/Y/Z from the panel blank center · ${mark.local.map(formatPreciseInches).join(", ")}.`
                      : `Hole ${mark.index} · ${mark.issues.join(" ") || "Hold until the socket conflicts are resolved."}`,
                  ),
                ]
              : []),
          ]
        : []),
    ];
  });
}
