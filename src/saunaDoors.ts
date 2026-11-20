import { formatPreciseInches } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { openingJambs } from "./openingJambs";
import {
  saunaDoorSetupSchema,
  type MotionPlan,
  type MotionPlanInput,
  type SaunaDoorSetup,
} from "./motionPlanSchema";
import { cedarbrookDoor as door } from "./saunaDoorReference";
import { prepareCollisionSolid } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

const add = (a: V3, b: V3) => a.map((n, i) => n + b[i]) as V3;
const subtract = (a: V3, b: V3) => a.map((n, i) => n - b[i]) as V3;
const axes = [0, 1, 2] as const;
const epsilon = 0.00001;
const near = (a: number, b: number) => Math.abs(a - b) <= epsilon;

export function saunaDoorChoices(project: Project) {
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) => {
      if (
        entry.spec.type !== "structure" ||
        entry.spec.structure.kind !== "sauna"
      )
        return [];
      const selection = entry.spec.structure.selections.saunaDoor;
      return selection?.materialId === door.materialId &&
        selection.productRegistryRef === door.productId
        ? [{ entry, label: binding.title }]
        : [];
    }),
  );
}

export function saunaDoorPlanEntry(plan: MotionPlan) {
  return plan.mechanism.kind === "hinge"
    ? plan.mechanism.saunaDoor?.entryId
    : undefined;
}

function doorGeometry(project: Project, entryId: string) {
  const choice = saunaDoorChoices(project).find(
    ({ entry }) => entry.id === entryId,
  );
  if (!choice) throw Error("Choose a sauna with the sourced prehung door.");
  const section = (role: string) => {
    const id = choice.entry.sections.find(
      (link) => link.role === role,
    )?.sectionId;
    return project.sections.find((row) => row.id === id);
  };
  const opening = section("door-opening-framing");
  const leafSection = section("sauna-door-leaf");
  if (!opening || leafSection?.pieceIds.length !== 1)
    throw Error("Restore the sauna door leaf and rough-opening sections.");
  const parts = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const leaf = parts.get(leafSection.pieceIds[0]);
  if (leaf?.material !== door.materialId || opening.pieceIds.includes(leaf.id))
    throw Error("Restore the documented door leaf in its own section.");
  const { origin, rotation } = opening;
  const inverse = inverseRotation(rotation);
  for (const axis of axes) {
    const unit = [0, 0, 0] as V3;
    unit[axis] = 1;
    if (
      Math.hypot(
        ...subtract(rotate(rotate(unit, leaf.rotation), inverse), unit),
      ) > epsilon
    )
      throw Error(
        "Align the sauna door with its rough opening in the closed position.",
      );
  }

  function localBounds(piece: Piece) {
    const solid = prepareCollisionSolid(piece);
    if (
      !solid ||
      solid.faceNormals.some((normal) => {
        const local = rotate(normal, inverse);
        return !near(Math.max(...local.map(Math.abs)), 1);
      })
    )
      return null;
    const vertices = solid.vertices.map((point) =>
      rotate(subtract(point, origin), inverse),
    );
    return {
      min: axes.map((i) =>
        Math.min(...vertices.map((point) => point[i])),
      ) as V3,
      max: axes.map((i) =>
        Math.max(...vertices.map((point) => point[i])),
      ) as V3,
    };
  }

  const fixed = opening.pieceIds
    .map((id) => {
      const member = parts.get(id);
      if (!member) throw Error("Restore the fixed sauna opening members.");
      return localBounds(member);
    })
    .filter((box) => box !== null);
  const halfWidth = door.roughWidth / 2;
  const { left, right } = openingJambs(fixed, 0, door.roughHeight, epsilon);
  const header = fixed.find(
    ({ min, max }) =>
      min[0] <= -halfWidth + epsilon &&
      max[0] >= halfWidth - epsilon &&
      near(min[1], door.roughHeight),
  );
  if (
    !left ||
    !right ||
    !near(left.max[0], -halfWidth) ||
    !near(right.min[0], halfWidth) ||
    !header ||
    !near(left.min[2], right.min[2]) ||
    !near(left.max[2], right.max[2]) ||
    header.max[2] <= left.min[2] + epsilon ||
    header.min[2] >= left.max[2] - epsilon
  )
    throw Error(
      "The modeled sauna rough opening has changed. Restore the 24 × 76 in framing before testing the door.",
    );

  const bounds = localBounds(leaf);
  if (
    !bounds ||
    bounds.min[0] < -halfWidth - epsilon ||
    bounds.max[0] > halfWidth + epsilon ||
    bounds.min[1] < -epsilon ||
    bounds.max[1] > door.roughHeight + epsilon ||
    bounds.max[2] <= left.min[2] + epsilon ||
    bounds.min[2] >= left.max[2] - epsilon
  )
    throw Error(
      "Place the closed leaf within the sauna rough opening before testing travel.",
    );
  return {
    label: choice.label,
    leaf,
    opening,
    bounds,
    frameDepth: left.max[2] - left.min[2],
  };
}

function motionInput(
  shape: ReturnType<typeof doorGeometry>,
  setup: SaunaDoorSetup,
  travel: number,
): MotionPlanInput {
  const { bounds, opening } = shape;
  const right = setup.side === "right";
  const pivot: V3 = [
    right ? bounds.max[0] + setup.sideOffset : bounds.min[0] - setup.sideOffset,
    (bounds.max[1] + bounds.min[1]) / 2,
    bounds.max[2] + setup.outset,
  ];
  return {
    label: `${shape.label.slice(0, 78)} · Door swing`,
    memberIds: [shape.leaf.id],
    mechanism: {
      kind: "hinge",
      axis: rotate([0, right ? -1 : 1, 0], opening.rotation),
      pivot: add(opening.origin, rotate(pivot, opening.rotation)),
      travel,
      saunaDoor: setup,
    },
  };
}

export function saunaDoorMotionInput(
  project: Project,
  input: SaunaDoorSetup,
  travel: number,
) {
  const setup = saunaDoorSetupSchema.parse(input);
  return motionInput(doorGeometry(project, setup.entryId), setup, travel);
}

function jambOrderNote(framing: number, finished: number | undefined) {
  const framingDepth = `Modeled framing depth ${formatPreciseInches(framing)}.`;
  if (finished === undefined)
    return `${framingDepth} Measure the complete finished wall before specifying the jamb.`;
  if (finished < framing - epsilon)
    return `${framingDepth} The entered finished depth ${formatPreciseInches(finished)} is smaller than the framing. Recheck before ordering the jamb.`;
  const width = Math.ceil(finished * 8) / 8;
  return `Measured finished wall ${formatPreciseInches(finished)}. Request a ${formatPreciseInches(width)} jamb width, rounded up to an eighth inch.${
    width > 7.5 ? " Ask Cedarbrook about the jamb extension." : ""
  }`;
}

export function saunaDoorReview(project: Project, plan: MotionPlan) {
  const mechanism = plan.mechanism;
  if (mechanism.kind !== "hinge" || !mechanism.saunaDoor) return null;
  const setup = mechanism.saunaDoor;
  try {
    const shape = doorGeometry(project, setup.entryId);
    const expected = motionInput(shape, setup, mechanism.travel).mechanism;
    const leaf = shape.leaf;
    if (
      plan.memberIds.length !== 1 ||
      plan.memberIds[0] !== leaf.id ||
      expected.kind !== "hinge" ||
      Math.hypot(
        ...subtract(
          add(leaf.position, rotate(mechanism.pivot, leaf.rotation)),
          expected.pivot,
        ),
      ) > epsilon ||
      Math.hypot(
        ...subtract(rotate(mechanism.axis, leaf.rotation), expected.axis),
      ) > epsilon
    )
      throw Error(
        "The sauna door leaf or hinge datum changed. Edit the setup to review the current swing.",
      );
    return {
      warning: null,
      lines: [
        `${door.productCode} · ${setup.side === "left" ? "Left" : "Right"} outward swing viewed from outside. The 22 × 74½ × 2⅝ in leaf sits within the 24 × 76 in framed opening.`,
        jambOrderNote(shape.frameDepth, setup.finishedWallDepth),
        "Confirm leaf placement, stop, trim and handle clearances with the delivered kit.",
        "One kit includes a self-closing hinge, two standard hinges and a handle. Verify the mounted axis, hardware action, clear exit and release from inside on site.",
      ],
    };
  } catch (problem) {
    return {
      warning:
        problem instanceof Error
          ? problem.message
          : "Review the sauna door setup.",
      lines: [],
    };
  }
}
