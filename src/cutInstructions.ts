import { clipBox, solidBounds } from "./cutProfiles";
import { cutSourceRegion } from "./cutSourceAxes";
import { rotate } from "./spatial";
import type { Piece, V3 } from "./model";
import { stockAxes } from "./stockAxes";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { openingAxes } from "./throughOpenings";

export type StockAxis = "X" | "Y" | "Z";
export type ProfileFaceInstruction = {
  planeIndex: number;
  kind: "square-end" | "angled-end" | "side-profile" | "compound-profile";
  axis: StockAxis;
  side: "start" | "end";
  angleFromSquare: number;
  /** Signed projection angles after orienting the normal toward the positive end. */
  tilts: { axis: StockAxis; degrees: number }[];
  /** Actual clipped face extent, measured from the negative end of this blank axis. */
  faceRangeFromStart: [number, number];
  /** Every corner of the blank's width × thickness appears on this retained end face. */
  spansStockCrossSection: boolean;
  edgeMarks: {
    axis: StockAxis;
    negativeEdgeFromStart: number;
    positiveEdgeFromStart: number;
  } | null;
  cornerMarks?: { width: string; thickness: string; fromStart: number }[];
  localNormal: V3;
  worldNormal: V3;
  constant: number;
  retainedToward: string;
};
export type CutInstructionPlan = {
  partId: string;
  partName: string;
  units: "inches";
  /** Bounding blank before the recorded profiles, not an inferred purchase size. */
  blankSize: V3;
  stockAxes: { length: StockAxis; width: StockAxis; thickness: StockAxis };
  stockAxesBasis: "validated-source" | "bounding-blank" | "specified-axis";
  orientation: { localAxis: StockAxis; worldDirection: V3 }[];
  retainedBounds: { min: V3; max: V3 };
  centerline: {
    axis: StockAxis;
    fromStart: number;
    toStart: number;
    length: number;
  } | null;
  faces: ProfileFaceInstruction[];
  openingDatum?: "visible-foil-face";
  openings?: {
    boreAxis: StockAxis;
    diameter: number;
    marks: { axis: StockAxis; fromNegativeEdge: number }[];
    partial: boolean;
  }[];
  rectangularCuts?: {
    throughAxis: StockAxis;
    kind: "notch" | "opening";
    ranges: { axis: StockAxis; start: number; end: number }[];
  }[];
  inactivePlaneCount: number;
  source: {
    id: string;
    size: V3;
    offset: V3;
    regionEnd: V3;
    offcut: boolean;
    status: "validated" | "unverified";
    kerf: number | null;
    measuredTubeKerf?: number;
    measuredWoodKerf?: number;
  } | null;
};
const names = ["X", "Y", "Z"] as const;
const dot = (a: V3, b: V3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const degrees = (radians: number) => (radians * 180) / Math.PI;
const clean = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
const number = (v: number) => String(Math.round(clean(v) * 1000) / 1000);
const dimensions = (size: V3) =>
  size.map((v, i) => `${names[i]} ${number(v)} in`).join(" × ");

/** Describe saved geometry. These angles are not machine miter/bevel settings. */
export function cutInstructions(
  piece: Piece,
  options: { kerf?: number; lineageStatus?: "validated" | "unverified" } = {},
): CutInstructionPlan {
  if (
    options.kerf !== undefined &&
    (!Number.isFinite(options.kerf) || options.kerf < 0)
  )
    throw new Error(
      "A modeled kerf must be a finite, nonnegative inch measurement.",
    );
  const axisSize =
    options.lineageStatus === "validated" && piece.cutStock
      ? piece.cutStock.size
      : piece.size;
  const region = piece.cutStock ? cutSourceRegion(piece) : null;
  const oriented = stockAxes(piece, axisSize),
    axes = [oriented.length, oriented.width, oriented.thickness];
  const long = axes[0];
  const planes = piece.cutPlanes ?? [];
  const solid = clipBox(piece.size, planes);
  const tolerance = Math.max(...piece.size) * 1e-8;
  const inside = (point: V3) =>
    point.every((v, axis) => Math.abs(v) <= piece.size[axis] / 2 + tolerance) &&
    planes.every(
      (plane) => dot(plane.normal, point) <= plane.constant + tolerance,
    );
  const active = solid.faces.filter((face) => face.kind === "cut");
  const faces: ProfileFaceInstruction[] = active.map((face) => {
    const planeIndex = face.planeIndex!;
    const plane = planes[planeIndex];
    const normal = plane.normal;
    // Prefer the stock length for end faces, including steep geometric cuts.
    // A face parallel to the length is instead described as a side profile.
    const axis =
      Math.abs(normal[long]) > 1e-10
        ? long
        : axes.find(
            (i) => Math.abs(normal[i]) === Math.max(...normal.map(Math.abs)),
          )!;
    const sign = Math.sign(normal[axis]);
    const perpendicular = ([0, 1, 2] as const).filter(
      (i) => i !== axis && Math.abs(normal[i]) > 1e-10,
    );
    const tilts = perpendicular.map((i) => ({
      axis: names[i],
      degrees: clean(
        degrees(Math.atan2(normal[i] * sign, Math.abs(normal[axis]))),
      ),
    }));
    const positions = face.indices.map(
      (i) => solid.vertices[i][axis] + piece.size[axis] / 2,
    );
    const [, width, thickness] = axes;
    const spansStockCrossSection =
      axis === long &&
      [-1, 1].every((w) =>
        [-1, 1].every((t) =>
          face.indices.some((i) => {
            const vertex = solid.vertices[i];
            return (
              Math.abs(vertex[width] - (w * piece.size[width]) / 2) <=
                tolerance &&
              Math.abs(vertex[thickness] - (t * piece.size[thickness]) / 2) <=
                tolerance
            );
          }),
        ),
      );
    let edgeMarks: ProfileFaceInstruction["edgeMarks"] = null;
    if (perpendicular.length === 1) {
      const tilt = perpendicular[0];
      const points = [-1, 1].map((edge) => {
        const point: V3 = [0, 0, 0];
        point[tilt] = (edge * piece.size[tilt]) / 2;
        point[axis] =
          (plane.constant - normal[tilt] * point[tilt]) / normal[axis];
        return point;
      });
      if (points.every(inside))
        edgeMarks = {
          axis: names[tilt],
          negativeEdgeFromStart: clean(points[0][axis] + piece.size[axis] / 2),
          positiveEdgeFromStart: clean(points[1][axis] + piece.size[axis] / 2),
        };
    }
    const cornerMarks =
      perpendicular.length === 2 && spansStockCrossSection
        ? [-1, 1].flatMap((t) =>
            [-1, 1].map((w) => {
              const x = (w * piece.size[width]) / 2;
              const y = (t * piece.size[thickness]) / 2;
              const mark =
                (plane.constant - normal[width] * x - normal[thickness] * y) /
                normal[axis];
              return {
                width: `${w < 0 ? "−" : "+"}${names[width]}`,
                thickness: `${t < 0 ? "−" : "+"}${names[thickness]}`,
                fromStart: clean(mark + piece.size[axis] / 2),
              };
            }),
          )
        : null;
    return {
      planeIndex,
      kind:
        perpendicular.length > 1
          ? "compound-profile"
          : axis !== long
            ? "side-profile"
            : perpendicular.length
              ? "angled-end"
              : "square-end",
      axis: names[axis],
      side: sign > 0 ? "end" : "start",
      angleFromSquare: clean(
        degrees(Math.acos(Math.min(1, Math.abs(normal[axis])))),
      ),
      tilts,
      faceRangeFromStart: [
        clean(Math.min(...positions)),
        clean(Math.max(...positions)),
      ],
      spansStockCrossSection,
      edgeMarks,
      ...(cornerMarks ? { cornerMarks } : {}),
      localNormal: [...normal] as V3,
      worldNormal: rotate(normal, piece.rotation),
      constant: plane.constant,
      retainedToward: `${sign > 0 ? "−" : "+"}${names[axis]}`,
    };
  });
  let lower = -piece.size[long] / 2,
    upper = piece.size[long] / 2;
  for (const plane of planes) {
    const value = plane.normal[long];
    if (Math.abs(value) < 1e-10) {
      if (plane.constant < 0) {
        lower = Infinity;
        break;
      }
    } else if (value > 0) upper = Math.min(upper, plane.constant / value);
    else lower = Math.max(lower, plane.constant / value);
  }
  return {
    partId: piece.id,
    partName: piece.name,
    units: "inches",
    blankSize: [...piece.size] as V3,
    stockAxes: {
      length: names[long],
      width: names[axes[1]],
      thickness: names[axes[2]],
    },
    stockAxesBasis:
      piece.stockLengthAxis !== null && piece.stockLengthAxis !== undefined
        ? "specified-axis"
        : axisSize === piece.size
          ? "bounding-blank"
          : "validated-source",
    orientation: names.map((localAxis, i) => {
      const basis: V3 = [0, 0, 0];
      basis[i] = 1;
      return { localAxis, worldDirection: rotate(basis, piece.rotation) };
    }),
    retainedBounds: solidBounds(solid),
    centerline:
      upper > lower + tolerance
        ? {
            axis: names[long],
            fromStart: clean(lower + piece.size[long] / 2),
            toStart: clean(upper + piece.size[long] / 2),
            length: clean(upper - lower),
          }
        : null,
    faces,
    ...(piece.foilReturns &&
    (piece.roundOpenings?.length || piece.rectangularOpenings?.length)
      ? { openingDatum: "visible-foil-face" as const }
      : {}),
    ...(piece.roundOpenings?.length
      ? {
          openings: piece.roundOpenings.map((opening) => {
            const axes = openingAxes(opening.axis);
            return {
              boreAxis: names[opening.axis],
              diameter: opening.diameter,
              marks: axes.map((axis, i) => ({
                axis: names[axis],
                fromNegativeEdge: opening.center[i] + piece.size[axis] / 2,
              })),
              partial: axes.some(
                (axis, i) =>
                  Math.abs(opening.center[i]) + opening.diameter / 2 >
                  piece.size[axis] / 2 + tolerance,
              ),
            };
          }),
        }
      : {}),
    ...(piece.rectangularOpenings?.length
      ? {
          rectangularCuts: piece.rectangularOpenings.map((opening) => {
            const axes = openingAxes(opening.axis);
            const ranges = axes.map((axis, i) => {
              const start =
                opening.center[i] + (piece.size[axis] - opening.spans[i]) / 2;
              return {
                axis: names[axis],
                start: Math.max(0, start),
                end: Math.min(piece.size[axis], start + opening.spans[i]),
              };
            });
            const notch = axes.some(
              (axis, i) =>
                ranges[i].start <= tolerance ||
                ranges[i].end >= piece.size[axis] - tolerance,
            );
            return {
              throughAxis: names[opening.axis],
              kind: notch ? ("notch" as const) : ("opening" as const),
              ranges,
            };
          }),
        }
      : {}),
    inactivePlaneCount: planes.length - faces.length,
    source:
      piece.cutStock && region
        ? {
            id: piece.cutStock.id,
            size: region.sourceSize,
            offset: region.offset,
            regionEnd: region.offset.map((v, i) => v + region.size[i]) as V3,
            offcut: piece.offcut,
            status: options.lineageStatus ?? "unverified",
            kerf: options.kerf ?? null,
            ...(piece.cutStock.woodKerf === undefined
              ? {}
              : { measuredWoodKerf: piece.cutStock.woodKerf }),
            ...(piece.cutStock.tubeKerf === undefined
              ? {}
              : { measuredTubeKerf: piece.cutStock.tubeKerf }),
          }
        : null,
  };
}

/** Plain text is suitable for the guide and documentary cut-table exports. */
export function cutInstructionsText(plan: CutInstructionPlan): string {
  const lines = [
    `${plan.openingDatum ? "Modeled foil panel face" : "Blank before profiles"}: ${dimensions(plan.blankSize)}; local length ${plan.stockAxes.length}, width ${plan.stockAxes.width}, thickness ${plan.stockAxes.thickness} (${plan.stockAxesBasis === "specified-axis" ? "specified stock length / grain / flute direction" : plan.stockAxesBasis === "validated-source" ? "original source stock axes" : "axes inferred from bounding blank dimensions"}). Displayed dimensions and angles round to 0.001 in and 0.001°, respectively.`,
  ];
  for (const face of plan.faces) {
    const end = `${face.side === "start" ? "−" : "+"}${face.axis}`;
    const tilt = face.tilts
      .map(
        (t) =>
          `${t.degrees >= 0 ? "+" : ""}${number(t.degrees)}° toward local +${t.axis}`,
      )
      .join(", ");
    lines.push(
      `${face.kind === "compound-profile" ? "Compound profile face" : face.kind === "side-profile" ? "Side profile face" : face.kind === "square-end" ? "Square end face" : "Angled end face"} at ${end}: ${number(face.angleFromSquare)}° from square to local ${face.axis}${tilt ? `; signed plane projection tilt ${tilt}` : ""}. Keep material toward ${face.retainedToward} along local ${face.axis}, holding other local coordinates fixed. Face spans ${face.faceRangeFromStart.map(number).join(" to ")} in from the −${face.axis} blank end.`,
    );
    if (face.edgeMarks) {
      const marks = face.edgeMarks;
      lines.push(
        `Face marks: at local −${marks.axis} edge, ${number(marks.negativeEdgeFromStart)} in; at +${marks.axis} edge, ${number(marks.positiveEdgeFromStart)} in; both measured from the −${face.axis} blank end with the remaining coordinate centered.`,
      );
    }
    if (face.cornerMarks) {
      lines.push(
        `Retained face corner marks from the −${face.axis} blank end: ${face.cornerMarks.map((mark) => `${mark.width}/${mark.thickness} ${number(mark.fromStart)} in`).join(", ")}.`,
      );
    }
  }
  if (
    !plan.faces.length &&
    !plan.openings?.length &&
    !plan.rectangularCuts?.length
  )
    lines.push(
      "No active profiled faces recorded; the modeled blank is rectangular.",
    );
  for (const opening of plan.openings ?? []) {
    lines.push(
      `${opening.partial ? "Round edge cut" : "Round through opening"} · ${formatStockLength(opening.diameter)} diameter through local ${opening.boreAxis} · center ${opening.marks.map(({ axis, fromNegativeEdge }) => `${formatStockLength(fromNegativeEdge)} from local −${axis} edge`).join(", ")}.`,
    );
  }
  for (const cut of plan.rectangularCuts ?? []) {
    lines.push(
      `${cut.kind === "notch" ? "Rectangular edge notch" : "Rectangular through-opening"} · through local ${cut.throughAxis} · ${cut.ranges.map(({ axis, start, end }) => `${formatStockLength(start)} to ${formatStockLength(end)} from local −${axis} edge`).join(", ")}.`,
    );
  }
  if (plan.openingDatum)
    lines.push(
      "Use the visible foil face edges for these marks. Check fold returns and overlaps on the fitted panel.",
    );
  if (plan.faces.length) {
    if (plan.centerline)
      lines.push(
        `Retained ${plan.centerline.axis} centerline: ${number(plan.centerline.length)} in, from ${number(plan.centerline.fromStart)} to ${number(plan.centerline.toStart)} in measured from the negative blank end.`,
      );
    else
      lines.push(
        "The blank length centerline does not cross the retained solid; use the saved profile geometry for layout.",
      );
    lines.push(
      `Placed orientation: ${plan.orientation.map(({ localAxis, worldDirection }) => `local +${localAxis} points in world (${worldDirection.map(number).join(", ")})`).join("; ")}. These direction vectors are not dimensions.`,
    );
    lines.push(
      "Geometric plane angles only. Machine miter/bevel settings, holding method, blade clearance, capacity and cut sequence require a separate tool-specific setup review; no safe or certified blade setup is established.",
    );
  }
  if (plan.source) {
    const source = plan.source;
    const loss =
      source.measuredWoodKerf !== undefined
        ? ` Recorded blade kerf: ${formatPreciseInches(source.measuredWoodKerf)} per cut.`
        : source.measuredTubeKerf !== undefined
          ? ` Recorded tube cutting loss: ${formatPreciseInches(source.measuredTubeKerf)} per cut.`
          : source.kerf === null
            ? " No kerf value supplied."
            : ` Modeled straight-trim kerf: ${number(source.kerf)} in; profile-face saw kerf is not reconstructed.`;
    lines.push(
      `Cut source ${source.id}: original blank ${dimensions(source.size)}. ${source.offcut ? "Reusable offcut" : "Retained part"} source-local region ${names.map((axis, i) => `${axis} ${number(source.offset[i])} to ${number(source.regionEnd[i])} in`).join(", ")}. ${source.status === "validated" ? "Source regions passed modeled size/overlap/kerf checks; this does not reconstruct the cut sequence." : "Source lineage is unverified; validate it before relying on reuse or purchase quantities."}${loss}`,
    );
  }
  return lines.join("\n");
}
