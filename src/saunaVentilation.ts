import { formatPreciseInches } from "./measurement";
import { material, pieceSchema, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import type { RoundOpening } from "./throughOpeningSchema";
import { openingAxes, openingIntersectsBlank } from "./throughOpenings";
import { saunaFramingEnvelope } from "./saunaCeilingCoverage";
import { saunaWallFoilRole } from "./saunaFoil";
import { steel6 } from "./saunaHeaterReference";
import { saunaRooms } from "./saunaHeaters";
import {
  saunaVentilationInputSchema,
  saunaVentilationPlanSchema,
  type SaunaVentOpening,
  type SaunaVentilationPlan,
} from "./saunaVentilationSchema";
import {
  prepareCollisionSolid,
  solidOverlap,
  type CollisionSolid,
} from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

export const saunaVentReference = {
  revision: steel6.manualRevision,
  url: `${steel6.manual}#page=10`,
  intakeDiameter: [50 / 25.4, 100 / 25.4],
  exhaustDiameter: [100 / 25.4, 200 / 25.4],
  intakeHeight: 400 / 25.4,
  exhaustHeight: 600 / 25.4,
  gravityRise: 200 / 25.4,
  airChanges: 6,
} as const;
export const saunaVentScope =
  "Verify the intake serves the heater. Review the duct and grille, route and termination, sensor separation, sealing and installed airflow with the installer. The saved layout provides wall marks and a framing check.";

export type SaunaVentKind = "intake" | "exhaust" | "drying";
export const saunaVentNames = {
  intake: "Supply air",
  exhaust: "Exhaust air",
  drying: "Drying opening",
} as const;
export const saunaVentWallNames = {
  front: "Front",
  right: "Right",
  back: "Back",
  left: "Left",
} as const;
const opposite = {
  front: "back",
  right: "left",
  back: "front",
  left: "right",
} as const;
const layerRoles = ["wall-lining", "wall-insulation", saunaWallFoilRole];
const comparisonTolerance = 1e-7;
const circleSteps = 24;
const dimensions = [0, 1, 2] as const;
const inches = (value: number) => formatPreciseInches(Number(value.toFixed(3)));

export function saveSaunaVentilation(
  project: Project,
  roomId: string,
  input: unknown,
) {
  if (!saunaRooms(project).some(({ entry }) => entry.id === roomId))
    throw Error("Choose a saved sauna room.");
  const plan = saunaVentilationPlanSchema.parse({
    ...saunaVentilationInputSchema.parse(input),
    roomId,
    reference: saunaVentReference.revision,
  });
  const other = (project.saunaVentilationPlans ?? []).filter(
    (row) => row.roomId !== roomId,
  );
  if (other.length >= 50)
    throw Error("This project can store up to 50 sauna ventilation layouts.");
  return { ...project, saunaVentilationPlans: [...other, plan] };
}

export function removeSaunaVentilation(project: Project, roomId: string) {
  const { saunaVentilationPlans, ...rest } = removeSaunaVentOpenings(
    project,
    roomId,
  );
  const remaining = saunaVentilationPlans?.filter(
    (row) => row.roomId !== roomId,
  );
  return {
    ...rest,
    ...(remaining?.length ? { saunaVentilationPlans: remaining } : {}),
  };
}

type Room = ReturnType<typeof saunaRooms>[number];
function openingGeometry(room: Room, opening: SaunaVentOpening) {
  const {
    parameters,
    entry: { pose },
  } = room;
  const alongX = opening.wall === "front" || opening.wall === "back";
  const sign = opening.wall === "front" || opening.wall === "right" ? 1 : -1;
  const halfSpan = (alongX ? parameters.clearWidth : parameters.clearDepth) / 2;
  const wallFace =
    (sign * (alongX ? parameters.clearDepth : parameters.clearWidth)) / 2;
  const radius = opening.bore / 2;
  const local = (angle: number, depth: number, r: number): V3 => {
    const along = opening.offset + Math.cos(angle) * r;
    const height = opening.height + Math.sin(angle) * r;
    const outward = wallFace + sign * depth;
    return alongX ? [along, height, outward] : [outward, height, along];
  };
  const world = (point: V3) =>
    rotate(point, pose.rotation).map((n, i) => n + pose.origin[i]) as V3;
  const ring = (depth: number, r: number) =>
    Array.from({ length: circleSteps }, (_, i) =>
      world(local((i * 2 * Math.PI) / circleSteps, depth, r)),
    );
  // The collision polygon encloses the round mark. A borderline overlap is
  // flagged for field review instead of missing an intersection at a corner.
  const checkRadius = radius / Math.cos(Math.PI / circleSteps);
  const first = ring(0, checkRadius);
  const second = ring(opening.depth, checkRadius);
  const vertices = [...first, ...second];
  const direction = (a: V3, b: V3): V3 => {
    const delta = b.map((n, i) => n - a[i]) as V3;
    const length = Math.hypot(...delta);
    return delta.map((v) => v / length) as V3;
  };
  const lengthAxis = rotate(alongX ? [0, 0, 1] : [1, 0, 0], pose.rotation);
  const sides = first
    .slice(0, circleSteps / 2)
    .map((point, i) => direction(point, first[i + 1]));
  const faceNormals = sides.map(([a, b, c]) => {
    const [x, y, z] = lengthAxis;
    return [b * z - c * y, c * x - a * z, a * y - b * x] as V3;
  });
  const checkSolid: CollisionSolid = {
    vertices,
    bounds: {
      min: dimensions.map((i) => Math.min(...vertices.map((v) => v[i]))) as V3,
      max: dimensions.map((i) => Math.max(...vertices.map((v) => v[i]))) as V3,
    },
    edgeDirections: [lengthAxis, ...sides],
    faceNormals: [lengthAxis, ...faceNormals],
    kind: "envelope",
  };
  return {
    halfSpan,
    checkSolid,
    inside: ring(0, radius),
    outside: ring(opening.depth, radius),
    centerLine: [world(local(0, 0, 0)), world(local(0, opening.depth, 0))] as [
      V3,
      V3,
    ],
  };
}

export function saunaVentilationReview(
  project: Project,
  plan: SaunaVentilationPlan,
) {
  const room = saunaRooms(project).find(
    ({ entry }) => entry.id === plan.roomId,
  );
  const issues: string[] = [];
  const empty = { plan, room, issues, openings: [], airflowCfm: null };
  if (!room) {
    issues.push("The saved sauna room is missing.");
    return empty;
  }
  if (plan.reference !== saunaVentReference.revision) {
    issues.push("Review the current U.S. manual and resave the layout.");
    return empty;
  }
  const { parameters: p, entry } = room;
  const { intake, exhaust, mode, drying } = plan;
  const source = saunaVentReference;
  const heater = project.saunaHeaterPlans?.find(
    ({ roomId }) => roomId === plan.roomId,
  );
  if (heater && heater.productId !== steel6.productId) {
    issues.push("Use the delivered Harvia and control manuals for ventilation. The STEEL 6 positions and airflow review cannot be applied to this heater.");
    return empty;
  }
  if (!heater || heater.reference !== source.revision)
    issues.push("Save the STEEL 6 heater position to review the intake wall.");
  else {
    const walls = {
      right: p.clearWidth / 2 - heater.x,
      left: p.clearWidth / 2 + heater.x,
      front: p.clearDepth / 2 - heater.z,
      back: p.clearDepth / 2 + heater.z,
    };
    if (Object.values(walls).some((gap) => gap < 0))
      issues.push("The saved heater center is outside the room.");
    else if (
      walls[intake.wall] >
      Math.min(...Object.values(walls)) + comparisonTolerance
    )
      issues.push(
        "Confirm the intake position relative to the heater. Its wall is farther from the modeled heater than another wall.",
      );
  }
  if (exhaust.wall !== opposite[intake.wall])
    issues.push(
      "Check the exhaust wall. This layout expects it across the room from the heater and intake wall.",
    );
  if (
    mode === "mechanical" &&
    intake.height + comparisonTolerance < source.intakeHeight
  )
    issues.push(
      "Supply air is below the manual’s 400 mm mechanical-ventilation threshold.",
    );
  if (
    mode === "gravity" &&
    intake.height > source.intakeHeight + comparisonTolerance
  )
    issues.push(
      "Supply air is above the manual’s 400 mm gravity-ventilation limit.",
    );
  if (
    mode === "gravity" &&
    exhaust.height - intake.height + comparisonTolerance < source.gravityRise
  )
    issues.push(
      "Gravity exhaust needs at least 200 mm of rise above the intake.",
    );
  if (exhaust.height > source.exhaustHeight + comparisonTolerance)
    issues.push("Exhaust air is above the manual’s 600 mm floor-height limit.");
  for (const [kind, opening, [min, max]] of [
    ["intake", intake, source.intakeDiameter],
    ["exhaust", exhaust, source.exhaustDiameter],
  ] as const) {
    const label = saunaVentNames[kind];
    if (
      opening.duct < min - comparisonTolerance ||
      opening.duct > max + comparisonTolerance
    )
      issues.push(
        `${label} duct diameter is outside the manual’s ${Math.round(min * 25.4)}–${Math.round(max * 25.4)} mm range.`,
      );
    if (opening.bore <= opening.duct + comparisonTolerance)
      issues.push(
        `${label} rough opening needs to clear the specified inside duct diameter. Verify the actual outside and sleeve dimensions.`,
      );
  }
  if (Math.abs(exhaust.duct - 2 * intake.duct) > comparisonTolerance)
    issues.push(
      "Check the duct sizes. The manual calls for an exhaust diameter twice the intake diameter.",
    );
  if (drying === null)
    issues.push(
      "Choose a drying opening or record the after-use door strategy.",
    );
  else if (drying !== "door" && drying.wall !== opposite[intake.wall])
    issues.push(
      "The manual places a dedicated drying opening on the opposite wall below the ceiling.",
    );

  const structure =
    entry.spec.type === "structure" ? entry.spec.structure : null;
  const frameSize = material(
    structure?.selections.frameLumber?.materialId ?? "stud",
  ).size;
  const { outsideW, outsideD } = saunaFramingEnvelope(
    p,
    [...frameSize].sort((a, b) => a - b)[1],
  );
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  const layerIds = new Set(
    entry.sections
      .filter(({ role }) => layerRoles.includes(role))
      .flatMap(({ sectionId }) => sections.get(sectionId)?.pieceIds ?? []),
  );
  const checked = project.pieces.flatMap((piece) => {
    if (piece.offcut) return [];
    try {
      // Mark against the wall blank so an already-applied cut keeps its part and
      // datum in the saved layout. Other assemblies use their retained shape.
      const target =
        layerIds.has(piece.id) && piece.roundOpenings?.length
          ? { ...piece, roundOpenings: undefined }
          : piece;
      const solid =
        prepareCollisionSolid(target) ??
        prepareCollisionSolid({ ...target, material: "plywood" });
      return solid ? [{ piece, solid }] : [];
    } catch {
      issues.push(
        `Could not check ${partLabel(project, piece.id)} for a wall opening.`,
      );
      return [];
    }
  });
  const plans: [SaunaVentKind, SaunaVentOpening][] = [
    ["intake", intake],
    ["exhaust", exhaust],
  ];
  if (drying && drying !== "door") plans.push(["drying", drying]);
  const openings = plans.map(([kind, opening]) => {
    const label = saunaVentNames[kind];
    const { checkSolid, halfSpan, ...drawing } = openingGeometry(room, opening);
    const r = opening.bore / 2;
    const onEndWall = opening.wall === "front" || opening.wall === "back";
    const modeledDepth =
      ((onEndWall ? outsideD : outsideW) -
        (onEndWall ? p.clearDepth : p.clearWidth)) /
      2;
    if (opening.depth < modeledDepth - comparisonTolerance)
      issues.push(
        `${label} depth stops in the modeled wall. At least ${inches(modeledDepth)} reaches the outside of framing.`,
      );
    if (
      Math.abs(opening.offset) + r > halfSpan + comparisonTolerance ||
      opening.height - r < -comparisonTolerance ||
      opening.height + r > p.clearHeight + comparisonTolerance
    )
      issues.push(`${label} extends beyond the interior wall face.`);
    if (
      opening.wall === "front" &&
      Math.hypot(
        Math.max(0, Math.abs(opening.offset) - p.doorWidth / 2),
        Math.max(0, opening.height - p.doorHeight),
      ) <
        r - comparisonTolerance
    )
      issues.push(`${label} crosses the reserved doorway.`);
    const hits = checked.filter(({ solid }) =>
      solidOverlap(checkSolid, solid, 0.001),
    );
    const layers = hits
      .filter(({ piece }) => layerIds.has(piece.id))
      .map(({ piece }) => piece.id);
    const obstructions = hits
      .filter(({ piece }) => !layerIds.has(piece.id))
      .map(({ piece }) => piece.id);
    if (obstructions.length)
      issues.push(
        `${label} bore envelope crosses ${obstructions.map((id) => partLabel(project, id)).join(", ")}. Move the opening to a clear bay.`,
      );
    return { kind, opening, ...drawing, layers, obstructions };
  });
  for (const [index, [aKind, a]] of plans.entries())
    for (const [bKind, b] of plans.slice(index + 1))
      if (
        a.wall === b.wall &&
        Math.hypot(a.offset - b.offset, a.height - b.height) <
          (a.bore + b.bore) / 2 - comparisonTolerance
      )
        issues.push(
          `${saunaVentNames[aKind]} and ${saunaVentNames[bKind].toLowerCase()} overlap.`,
        );
  const airflowCfm =
    (((p.clearWidth * p.clearDepth * p.clearHeight) / 1728) *
      source.airChanges) /
    60;
  return { plan, room, issues, openings, airflowCfm };
}

export type SaunaVentilationReview = ReturnType<typeof saunaVentilationReview>;

export function saunaVentOpeningsReview(
  project: Project,
  review: SaunaVentilationReview,
) {
  const roomId = review.plan.roomId;
  const owned = (opening: RoundOpening) => opening.source && "roomId" in opening.source && opening.source.roomId === roomId;
  const applied = project.pieces.filter((piece) =>
    piece.roundOpenings?.some(owned),
  );
  const proposed = new Map<string, RoundOpening[]>();
  if (review.issues.length) {
    return {
      applied: applied.length,
      proposed,
      current: false,
      issue: "Resolve the layout findings before applying openings.",
    };
  }
  const active = new Map(project.pieces.map((piece) => [piece.id, piece]));
  for (const { centerLine, layers, kind, opening } of review.openings) {
    for (const id of layers) {
      const piece = active.get(id)!;
      const inverse = inverseRotation(piece.rotation);
      const [start, end] = centerLine.map((point) =>
        rotate(point.map((v, i) => v - piece.position[i]) as V3, inverse),
      );
      const delta = end.map((v, i) => v - start[i]) as V3;
      const axis = dimensions.find((i) =>
        dimensions.every((j) =>
          j === i
            ? Math.abs(delta[j]) >= opening.depth - comparisonTolerance
            : Math.abs(delta[j]) <= comparisonTolerance,
        ),
      );
      const label = partLabel(project, id);
      if (axis === undefined || piece.cutPlanes.length)
        return {
          applied: applied.length,
          proposed,
          current: false,
          issue: `Review ${label}. Its profile or angle needs a separate cut layout.`,
        };
      const [u, v] = openingAxes(axis);
      const clean = (value: number) => Number(value.toFixed(6));
      const bore: RoundOpening = {
        axis,
        center: [clean(start[u]), clean(start[v])],
        diameter: opening.bore,
        source: { roomId, kind },
      };
      if (!openingIntersectsBlank(piece.size, bore)) continue;
      if (
        Math.min(start[axis], end[axis]) >
          -piece.size[axis] / 2 + comparisonTolerance ||
        Math.max(start[axis], end[axis]) <
          piece.size[axis] / 2 - comparisonTolerance
      )
        return {
          applied: applied.length,
          proposed,
          current: false,
          issue: `Enter the full wall depth through ${label} before applying openings.`,
        };
      const existing =
        proposed.get(id) ??
        piece.roundOpenings?.filter((row) => !owned(row)) ??
        [];
      proposed.set(id, [...existing, bore]);
    }
  }
  if (!proposed.size)
    return {
      applied: applied.length,
      proposed,
      current: false,
      issue: "Add modeled wall lining, foil or insulation at the openings.",
    };
  for (const [id, roundOpenings] of proposed) {
    const result = pieceSchema.safeParse({ ...active.get(id), roundOpenings });
    if (!result.success) {
      return {
        applied: applied.length,
        proposed,
        current: false,
        issue: `${partLabel(project, id)} · ${result.error.issues[0].message}`,
      };
    }
  }
  const current =
    applied.length === proposed.size &&
    applied.every(
      (piece) =>
        JSON.stringify(piece.roundOpenings?.filter(owned)) ===
        JSON.stringify(proposed.get(piece.id)?.filter(owned)),
    );
  return { applied: applied.length, proposed, current, issue: "" };
}

export function removeSaunaVentOpenings(project: Project, roomId: string) {
  return {
    ...project,
    pieces: project.pieces.map((piece) => {
      if (
        !piece.roundOpenings?.some(
          (opening) => opening.source && "roomId" in opening.source && opening.source.roomId === roomId,
        )
      )
        return piece;
      const { roundOpenings, ...blank } = piece;
      const kept = roundOpenings.filter(
        (opening) => !opening.source || !("roomId" in opening.source) || opening.source.roomId !== roomId,
      );
      return { ...blank, ...(kept.length ? { roundOpenings: kept } : {}) };
    }),
  };
}

export function applySaunaVentOpenings(
  project: Project,
  plan: SaunaVentilationPlan,
) {
  const result = saunaVentOpeningsReview(
    project,
    saunaVentilationReview(project, plan),
  );
  if (result.issue) throw Error(result.issue);
  if (result.current) return project;
  const cleared = removeSaunaVentOpenings(project, plan.roomId);
  return {
    ...cleared,
    pieces: cleared.pieces.map((piece) => {
      const roundOpenings = result.proposed.get(piece.id);
      return roundOpenings ? { ...piece, roundOpenings } : piece;
    }),
  };
}

export function saunaVentilationGuideLines(project: Project) {
  return (project.saunaVentilationPlans ?? []).flatMap((plan) => {
    const review = saunaVentilationReview(project, plan);
    const cuts = saunaVentOpeningsReview(project, review);
    return [
      `${review.room?.title ?? "Saved sauna"} · ${plan.mode === "gravity" ? "Gravity" : "Mechanical"} · HUUM STEEL 6 U.S. manual ${plan.reference}.`,
      ...review.openings.map(({ kind, opening, layers }) => {
        const axis =
          opening.wall === "front" || opening.wall === "back" ? "X" : "Z";
        return `${saunaVentNames[kind]} · ${saunaVentWallNames[opening.wall]} wall · ${axis} ${inches(opening.offset)} from center · ${inches(opening.height)} above finished floor · ${inches(opening.bore)} rough diameter · ${inches(opening.depth)} depth${layers.length ? ` · Affected layers ${layers.map((id) => partLabel(project, id)).join(", ")}` : ""}.`;
      }),
      ...(review.openings.length
        ? [
            `Inside duct diameters · supply ${inches(plan.intake.duct)} · exhaust ${inches(plan.exhaust.duct)}.`,
            plan.drying === "door"
              ? "Drying · open the door after use."
              : plan.drying
                ? "Drying · confirm placement below the ceiling and operate per the manual."
                : "Drying · strategy to be selected.",
          ]
        : []),
      ...(review.airflowCfm === null
        ? []
        : [
            `Six air changes per hour corresponds to ${Number(review.airflowCfm.toFixed(1))} CFM for the modeled room volume. Check delivered airflow after installation.`,
          ]),
      ...review.issues.map((issue) => `Review · ${issue}`),
      ...(cuts.current
        ? [
            `Modeled round openings · ${cuts.applied} affected parts. Use the part cut instructions for individual marks.`,
          ]
        : cuts.applied
          ? [
              `Review · Applied openings differ from this layout. ${cuts.issue}`.trim(),
            ]
          : []),
    ];
  });
}

export function saunaVentilationMarkdown(project: Project) {
  const lines = saunaVentilationGuideLines(project);
  return lines.length
    ? `## Sauna ventilation layout\n\n${saunaVentScope} [U.S. STEEL manual, pp. 10–11](${saunaVentReference.url})\n\n${lines.map((line) => `- ${line.replace(/[\r\n]+/g, " ")}`).join("\n")}\n\n`
    : "";
}
