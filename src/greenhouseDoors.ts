import {
  greenhouseDoorKits,
  isGreenhouseDoorStop,
  type GreenhouseDoorKitId,
} from "./greenhouseDoorReference";
import { formatPreciseInches } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { openingJambs } from "./openingJambs";
import {
  greenhouseDoorSetupSchema,
  type GreenhouseDoorSetup,
  type MotionPlan,
  type MotionPlanInput,
} from "./motionPlanSchema";
import { prepareCollisionSolid } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";
import { addSupply } from "./supplies";

const add = (a: V3, b: V3) => a.map((x, i) => x + b[i]) as V3;
const subtract = (a: V3, b: V3) => a.map((x, i) => x - b[i]) as V3;

export function greenhouseDoorChoices(project: Project) {
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) =>
      entry.spec.type === "structure" &&
      entry.spec.structure.kind === "greenhouse"
        ? [{ entry, label: binding.title }]
        : [],
    ),
  );
}

export function greenhouseDoorGeometry(project: Project, entryId: string) {
  const item = greenhouseDoorChoices(project).find(
    ({ entry }) => entry.id === entryId,
  );
  if (
    !item ||
    item.entry.spec.type !== "structure" ||
    item.entry.spec.structure.kind !== "greenhouse"
  )
    throw Error(
      "The greenhouse design is missing. Choose a current greenhouse.",
    );
  if (item.entry.spec.structure.parameters.doorSwing > 0)
    throw Error(
      "Set the greenhouse design’s door angle to 0° before setting up door travel.",
    );

  function section(role: string, optional = false) {
    const link = item!.entry.sections.find((mapping) => mapping.role === role);
    if (!link && optional) return undefined;
    const current = project.sections.find((row) => row.id === link?.sectionId);
    if (!current?.pieceIds.length)
      throw Error("The greenhouse door or opening section is missing.");
    return current;
  }

  const opening = section("door-opening-framing")!;
  const leaf = section("door-leaf")!;
  const glazing = section("glazing-door-panels", true);
  const parts = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const inverse = inverseRotation(opening.rotation);
  const localVertices = (body: Piece, moving = true) => {
    const normal = rotate(rotate([0, 0, 1], body.rotation), inverse);
    if (moving && normal[2] < 1 - 1e-7)
      throw Error(
        "Align the door and its panels with the opening in the closed position.",
      );
    const solid = prepareCollisionSolid(body);
    if (!solid)
      throw Error(
        "The door contains a member without supported preview geometry.",
      );
    return solid.vertices.map((p) =>
      rotate(subtract(p, opening.origin), inverse),
    );
  };
  const ids = [...leaf.pieceIds, ...(glazing?.pieceIds ?? [])];
  if (ids.length > 32 || new Set(ids).size !== ids.length)
    throw Error("Choose a door with up to 32 distinct moving parts.");
  if (opening.pieceIds.some((id) => !parts.has(id) || ids.includes(id)))
    throw Error(
      "Restore the fixed opening frame before setting up door travel.",
    );

  const vertices = ids.flatMap((id) => {
    const piece = parts.get(id);
    if (!piece) throw Error("A door member is missing or is now an offcut.");
    return localVertices(piece);
  });
  const extent = (axis: number) => vertices.map((point) => point[axis]);
  const width = extent(0);
  const height = extent(1);
  const front = Math.max(...extent(2));
  const frameFront = Math.max(
    ...leaf.pieceIds.flatMap((id) =>
      localVertices(parts.get(id)!).map((point) => point[2]),
    ),
  );
  const left = Math.min(...width);
  const right = Math.max(...width);
  const sill = Math.min(...height);
  const top = Math.max(...height);
  // The nearest continuous flanking faces define the modeled jambs.
  const localBounds = (piece: Piece) => {
    const points = localVertices(piece, false);
    return {
      min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))) as V3,
      max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))) as V3,
    };
  };
  const fixed = opening.pieceIds
    .map((id) => parts.get(id)!)
    .filter((piece) => !isGreenhouseDoorStop(piece.designRole));
  const openingMembers = fixed.map(localBounds);
  const jambs = openingJambs(openingMembers, sill, top, 1e-7);
  const gaps = jambs.left && jambs.right
    ? { left: left - jambs.left.max[0], right: jambs.right.min[0] - right }
    : null;
  return {
    label: item.label,
    entry: item.entry,
    ids,
    opening,
    left,
    right,
    gaps,
    jambs,
    fixed,
    openingMembers,
    leafMembers: leaf.pieceIds.map((id) => parts.get(id)!),
    localBounds,
    top,
    midHeight: (Math.min(...height) + Math.max(...height)) / 2,
    front,
    glazingOutset: Math.max(0, front - frameFront),
    glazingCount: glazing?.pieceIds.length ?? 0,
  };
}

export function greenhouseDoorMotionInput(
  project: Project,
  input: GreenhouseDoorSetup,
  travel: number,
): MotionPlanInput {
  const setup = greenhouseDoorSetupSchema.parse(input);
  const shape = greenhouseDoorGeometry(project, setup.entryId);
  return doorMotion(shape, setup, travel);
}

function doorMotion(
  shape: ReturnType<typeof greenhouseDoorGeometry>,
  setup: GreenhouseDoorSetup,
  travel: number,
): MotionPlanInput {
  const right = setup.side === "right";
  const pivot: V3 = [
    right ? shape.right + setup.sideOffset : shape.left - setup.sideOffset,
    shape.midHeight,
    shape.front + setup.outset,
  ];
  return {
    label: `${shape.label.slice(0, 78)} · Door swing`,
    memberIds: shape.ids,
    mechanism: {
      kind: "hinge",
      axis: rotate([0, right ? -1 : 1, 0], shape.opening.rotation),
      pivot: add(shape.opening.origin, rotate(pivot, shape.opening.rotation)),
      travel,
      greenhouseDoor: setup,
    },
  };
}

export function greenhouseDoorReview(project: Project, plan: MotionPlan) {
  const mechanism = plan.mechanism;
  if (mechanism.kind !== "hinge" || !mechanism.greenhouseDoor) return null;
  const setup = mechanism.greenhouseDoor;
  const kit = setup.kitId ? greenhouseDoorKits[setup.kitId] : null;
  try {
    const shape = greenhouseDoorGeometry(project, setup.entryId);
    const expected = doorMotion(shape, setup, mechanism.travel).mechanism;
    const anchor = project.pieces.find(
      (piece) => piece.id === plan.memberIds[0],
    );
    const sameMembers =
      shape.ids.length === plan.memberIds.length &&
      shape.ids.every((id) => plan.memberIds.includes(id));
    const sameDatum =
      anchor &&
      expected.kind === "hinge" &&
      Math.hypot(
        ...subtract(
          add(anchor.position, rotate(mechanism.pivot, anchor.rotation)),
          expected.pivot,
        ),
      ) < 1e-5 &&
      Math.hypot(
        ...subtract(rotate(mechanism.axis, anchor.rotation), expected.axis),
      ) < 1e-5;
    if (!sameMembers || !sameDatum)
      throw Error(
        "The door members or hinge datum changed. Reopen the greenhouse door setup to review the current geometry.",
      );
    return {
      kit,
      warning: null,
      lines: [
        `${setup.side === "left" ? "Left" : "Right"} outward swing as viewed from outside. ${shape.glazingCount} moving glazing ${shape.glazingCount === 1 ? "panel" : "panels"}.`,
        `Pivot offsets · Exterior ${formatPreciseInches(setup.outset)} · Toward jamb ${formatPreciseInches(setup.sideOffset)}. Measure the delivered hinge axis on the closed assembly.`,
        shape.gaps
          ? `Modeled closed side gaps · Left ${formatPreciseInches(shape.gaps.left)} · Right ${formatPreciseInches(shape.gaps.right)}. Verify clearances along both mounting faces.`
          : "Verify both jamb gaps on the closed assembly. The surrounding frame is missing continuous faces along the opening.",
        ...(shape.glazingOutset > 1e-5
          ? [
              `The glazing projects ${formatPreciseInches(shape.glazingOutset)} beyond the front of the wood leaf. Verify hinge and latch access to solid backing without relying on glazing for support.`,
            ]
          : []),
        ...(kit
          ? [
              `Selected hardware reference: ${kit.label}. Verify mounting clearance and fastener backing, and provide a usable release from inside.`,
            ]
          : []),
      ],
    };
  } catch (problem) {
    return {
      kit,
      warning:
        problem instanceof Error
          ? problem.message
          : "Review the door geometry.",
      lines: [],
    };
  }
}

export function doorKitDemand(project: Project, kitId: GreenhouseDoorKitId) {
  const kits = new Map<string, Set<GreenhouseDoorKitId>>();
  for (const plan of project.motionPlans ?? []) {
    if (plan.mechanism.kind !== "hinge") continue;
    const setup = plan.mechanism.greenhouseDoor;
    if (!setup?.kitId || greenhouseDoorReview(project, plan)?.warning) continue;
    const selected = kits.get(setup.entryId) ?? new Set<GreenhouseDoorKitId>();
    selected.add(setup.kitId);
    kits.set(setup.entryId, selected);
  }
  const needed = [...kits.values()].filter(
    (ids) => ids.size === 1 && ids.has(kitId),
  ).length;
  const selected = project.supplies
    .filter((row) => row.productId === kitId)
    .reduce((sum, row) => sum + row.quantity, 0);
  return { needed, selected, missing: Math.max(0, needed - selected) };
}

export function addMissingDoorKits(
  project: Project,
  kitId: GreenhouseDoorKitId,
) {
  const { missing } = doorKitDemand(project, kitId);
  return missing
    ? addSupply(
        project,
        kitId,
        missing,
        "Greenhouse door hardware",
        "Confirm installed hinge axis, frame backing and usable release from inside.",
      )
    : project;
}
