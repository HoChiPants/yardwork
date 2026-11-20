import { reviewConnectionContact } from "./connectionContacts";
import { hingePoseAroundAxis } from "./hinges";
import {
  motionDistance,
  reviewMotionPath,
  type MotionPreview,
} from "./mechanismMotion";
import { formatPreciseInches as inches } from "./measurement";
import { part, type Piece, type Project, type V3 } from "./model";
import { prepareCollisionSolid } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";
import {
  caseworkTipUpInputSchema,
  caseworkTipUpSchema,
  type CaseworkTipUpPlan,
} from "./caseworkTipUpSchema";

const epsilon = 1e-6;
const plus = (a: V3, b: V3) => a.map((value, i) => value + b[i]) as V3;
const minus = (a: V3, b: V3) => a.map((value, i) => value - b[i]) as V3;
const scale = (a: V3, factor: number) => a.map((value) => value * factor) as V3;
const baseRoles = ["bottom", "top", "side-left", "side-right"] as const;
const closetRoles = [...baseRoles, "tower-left", "tower-right"] as const;
const bookcaseRoles = [...baseRoles, "back"] as const;
export const caseworkTipUpScope =
  "The review assumes a rigid, braced carcass. This checks a straight quarter-turn around a floor edge and an optional straight slide. The modeled carcass panels move together. Other parts in the route are checked as fixed obstructions. Verify carrying space, temporary bracing, safe handling and anchorage on site.";

export function caseworkTipUpChoices(project: Project) {
  return project.ideaBindings.flatMap(({ entries, title }) =>
    entries.flatMap((entry) => {
      const spec = entry.spec;
      if (spec.type !== "structure") return [];
      const kind = spec.structure.kind;
      return kind === "closet-insert" || kind === "casework-shelves"
        ? [{ entry, title, kind }]
        : [];
    }),
  );
}

function casework(project: Project, entryId: string) {
  const choice = caseworkTipUpChoices(project).find(
    ({ entry }) => entry.id === entryId,
  );
  if (!choice) throw Error("Choose a current closet insert or bookcase.");
  const parts = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const owned = choice.entry.sections.flatMap(({ role, sectionId }) =>
    (
      project.sections.find((row) => row.id === sectionId)?.pieceIds ?? []
    ).flatMap((id) => {
      const piece = parts.get(id);
      return piece
        ? [
            {
              role:
                choice.kind === "closet-insert" && role === "casework-panels"
                  ? piece.designRole
                  : role,
              piece,
            },
          ]
        : [];
    }),
  );
  const required =
    choice.kind === "closet-insert" ? closetRoles : bookcaseRoles;
  const body = required.map((role) => {
    const members = owned.filter((row) => row.role === role);
    if (members.length !== 1)
      throw Error("Restore the carcass panels before testing this tip-up.");
    return members[0].piece;
  });
  const loose = owned.filter(
    ({ role }) =>
      role !== undefined &&
      (/^(tower-)?shelf-\d+$/.test(role) || role === "hanging-rods"),
  );
  const shelves = loose.filter(({ role }) => role !== "hanging-rods").length;
  const rods = loose.length - shelves;
  const installedLater = [
    ...(shelves ? [`${shelves} ${shelves === 1 ? "shelf" : "shelves"}`] : []),
    ...(rods ? [`${rods} ${rods === 1 ? "rod" : "rods"}`] : []),
  ];
  return {
    ...choice,
    body,
    hiddenPieceIds: loose.map(({ piece }) => piece.id),
    deferred: installedLater.length
      ? `Fit the modeled ${installedLater.join(" and ")} after raising the carcass.`
      : "",
  };
}

function checkCarcassContacts(body: readonly Piece[]) {
  const contact = new Map(body.map((part) => [part.id, new Set<string>()]));
  for (const [index, part] of body.entries()) {
    for (const other of body.slice(index + 1)) {
      const review = reviewConnectionContact(part, other, 0);
      if (review.state === "interference")
        throw Error(
          "The carcass panels overlap. Resolve the fit before testing the tip-up.",
        );
      if (review.state === "face-contact") {
        contact.get(part.id)!.add(other.id);
        contact.get(other.id)!.add(part.id);
      }
    }
  }
  const seen = new Set([body[0].id]);
  for (const id of seen)
    for (const neighbor of contact.get(id) ?? []) seen.add(neighbor);
  if (seen.size !== body.length)
    throw Error(
      "Some carcass panels are separated. Restore the intended assembly before testing the tip-up.",
    );
}

export function saveCaseworkTipUp(
  project: Project,
  entryId: string,
  input: unknown,
): Project {
  casework(project, entryId);
  const plan = caseworkTipUpSchema.parse({
    ...caseworkTipUpInputSchema.parse(input),
    entryId,
  });
  const rest = (project.caseworkTipUpPlans ?? []).filter(
    (row) => row.entryId !== entryId,
  );
  if (rest.length >= 50)
    throw Error("This project has 50 saved casework tip-up checks.");
  return { ...project, caseworkTipUpPlans: [...rest, plan] };
}

type Path = ReturnType<typeof reviewMotionPath>;
type Mechanism = Parameters<typeof reviewMotionPath>[2];
type Leg = {
  title: string;
  path: Path;
  limit: ReturnType<Path["playbackLimit"]>;
  mechanism: Mechanism;
};
type TipUpReport = {
  name: string;
  state: "clear" | "blocked" | "needs-review";
  detail: string;
  peakHeight?: number;
  uprightHeight?: number;
  hiddenPieceIds: string[];
  deferred?: string;
  ceilingHeight: number;
  legs: Leg[];
};

export function reviewCaseworkTipUp(
  project: Project,
  plan: CaseworkTipUpPlan,
): TipUpReport {
  const result: TipUpReport = {
    name: "Casework tip-up",
    state: "needs-review",
    detail: "",
    ceilingHeight: plan.ceilingHeight,
    legs: [],
    hiddenPieceIds: [],
  };
  try {
    const { title, entry, body, hiddenPieceIds, deferred } = casework(
      project,
      plan.entryId,
    );
    result.name = title;
    result.hiddenPieceIds = hiddenPieceIds;
    result.deferred = deferred;
    const { origin, rotation } = entry.pose;
    if (Math.hypot(...minus(rotate([0, 1, 0], rotation), [0, 1, 0])) > epsilon)
      throw Error(
        "Set the saved casework upright and level before testing the install route.",
      );
    checkCarcassContacts(body);
    const inverse = inverseRotation(rotation);
    const vertices = body.flatMap((piece) => {
      const solid = prepareCollisionSolid(piece);
      if (!solid || solid.kind !== "solid")
        throw Error(
          "The carcass needs modeled solid panels for the tip-up check.",
        );
      return solid.vertices.map((point) =>
        rotate(minus(point, origin), inverse),
      );
    });
    const values = (axis: number) => vertices.map((point) => point[axis]);
    const min = [0, 1, 2].map((axis) => Math.min(...values(axis))) as V3;
    const max = [0, 1, 2].map((axis) => Math.max(...values(axis))) as V3;
    if (Math.abs(origin[1] + min[1]) > epsilon)
      throw Error(
        "Set the bottom of the planned carcass on the modeled floor before testing the tip-up.",
      );
    const front = plan.restingFace === "front";
    const pivotZ = front ? max[2] : min[2];
    const edge = vertices.filter(
      (point) =>
        Math.abs(point[1] - min[1]) <= epsilon &&
        Math.abs(point[2] - pivotZ) <= epsilon,
    );
    if (
      !edge.some((p) => Math.abs(p[0] - min[0]) < epsilon) ||
      !edge.some((p) => Math.abs(p[0] - max[0]) < epsilon)
    )
      throw Error(
        "The selected lower edge needs support across the modeled width. Review the panel positions or choose the other resting face.",
      );

    const peakHeight = Math.max(
      ...vertices.map(([, y, z]) => Math.hypot(y - min[1], z - pivotZ)),
    );
    result.peakHeight = peakHeight;
    result.uprightHeight = max[1] - min[1];
    const forward = rotate([0, 0, 1], rotation);
    const offset = scale(forward, plan.stagingOffset);
    const pivot = plus(
      plus(origin, rotate([(min[0] + max[0]) / 2, min[1], pivotZ], rotation)),
      offset,
    );
    const axis = rotate([front ? 1 : -1, 0, 0], rotation);
    const upright = body.map((piece) => ({
      ...piece,
      position: plus(piece.position, offset),
    }));
    const starting = upright.map((piece) =>
      hingePoseAroundAxis(piece, pivot, axis, -90),
    );
    // Axis-aligned slab covers the widest horizontal sweep and optional translation.
    const span = 2 * (peakHeight + max[0] - min[0] + plan.stagingOffset) + 4;
    const ceiling: { size: V3; center: V3 } = {
      size: [span, 1, span],
      center: [pivot[0], plan.ceilingHeight + 0.5, pivot[2]],
    };
    const ceilingPiece = part(
      "Measured ceiling",
      "plywood",
      ceiling.size,
      ceiling.center,
      body[0].stepId,
      "Tip-up clearance",
    );
    const ignored = new Set(hiddenPieceIds);
    const scope = {
      ...project,
      pieces: [
        ...project.pieces.filter((piece) => !ignored.has(piece.id)),
        ceilingPiece,
      ],
    };

    function addLeg(
      title: string,
      moving: readonly Piece[],
      mechanism: Mechanism,
    ) {
      const path = reviewMotionPath(scope, moving, mechanism, {
        measuredSite: true,
      });
      const limit = path.playbackLimit(0, mechanism.travel);
      const leg = { title, path, limit, mechanism };
      result.legs.push(leg);
      if (limit.inspectAt !== undefined) {
        const at = path.preview(
          limit.travel,
          limit.inspectAt,
          limit.siteFaceId,
        );
        const obstacle =
          at.obstacleNames[0] ??
          at.siteFaceNames[0] ??
          at.outsideZoneFaces[0] ??
          "clearance needs inspection";
        result.state = "blocked";
        result.detail = `${title} stops at ${motionDistance(limit.travel, mechanism.kind)} · ${obstacle}. ${
          at.obstacleNames.includes(ceilingPiece.name)
            ? "Consider assembling upright in place or reviewing a shallower or shorter carcass."
            : "Review the staging distance, surrounding objects and the installation order."
        }`;
        return false;
      }
      if (path.unresolvedIds.length) {
        result.state = "needs-review";
        result.detail =
          "Some modeled parts have unavailable collision geometry. Review those obstructions before using this route.";
        return false;
      }
      return true;
    }
    if (
      !addLeg("Tip the carcass upright", starting, {
        kind: "hinge",
        axis,
        pivot,
        travel: 90,
      })
    )
      return result;
    if (
      plan.stagingOffset > epsilon &&
      !addLeg("Slide the upright carcass into place", upright, {
        kind: "slide",
        axis: scale(forward, -1),
        travel: plan.stagingOffset,
      })
    )
      return result;
    result.state = "clear";
    result.detail =
      "The carcass clears this modeled tip-up and placement route.";
  } catch (problem) {
    result.detail =
      problem instanceof Error
        ? problem.message
        : "Review the casework and site measurements.";
  }
  return result;
}

export function caseworkTipUpPreview(
  report: TipUpReport,
  leg: Leg,
  position: number,
  stopped = false,
): MotionPreview {
  const preview = leg.path.preview(
    position,
    stopped ? leg.limit.inspectAt : undefined,
    stopped ? leg.limit.siteFaceId : undefined,
  );
  const { min, max } = preview.bounds;
  return {
    ...preview,
    label: leg.title,
    uncertainLimit: stopped && leg.limit.uncertain,
    hiddenPieceIds: report.hiddenPieceIds,
    clearanceCeiling: {
      center: [
        (min[0] + max[0]) / 2,
        report.ceilingHeight,
        (min[2] + max[2]) / 2,
      ],
      size: [max[0] - min[0] + 4, 0.1, max[2] - min[2] + 4],
    },
  };
}

export function caseworkTipUpGuideLines(project: Project) {
  return (project.caseworkTipUpPlans ?? []).flatMap((plan) => {
    const report = reviewCaseworkTipUp(project, plan);
    return [
      `${report.name} · Start ${plan.restingFace}-face down · staging offset ${inches(plan.stagingOffset)} · ceiling ${inches(plan.ceilingHeight)}.`,
      ...(report.peakHeight === undefined
        ? []
        : [
            `Upright height ${inches(report.uprightHeight!)} · peak height ${inches(report.peakHeight)} during tip-up · ceiling margin ${inches(plan.ceilingHeight - report.peakHeight)}.`,
          ]),
      report.detail,
      ...(report.deferred ? [report.deferred] : []),
      caseworkTipUpScope,
    ];
  });
}
