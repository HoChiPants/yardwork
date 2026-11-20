import { greenhouseDoorChoices } from "./greenhouseDoors";
import { formatPreciseInches } from "./measurement";
import type { Project, V3 } from "./model";
import {
  greenhouseVentMotionSchema,
  type GreenhouseVentSetup,
  type MotionPlan,
  type MotionPlanInput,
} from "./motionPlanSchema";
import { prepareCollisionSolid } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

const add = (a: V3, b: V3) => a.map((value, i) => value + b[i]) as V3;
const subtract = (a: V3, b: V3) => a.map((value, i) => value - b[i]) as V3;
const epsilon = 1e-5;

export function greenhouseVentChoices(project: Project) {
  return greenhouseDoorChoices(project).filter(
    ({ entry }) =>
      entry.spec.type === "structure" &&
      entry.spec.structure.kind === "greenhouse" &&
      !!entry.spec.structure.parameters.roofVent,
  );
}

function ventGeometry(project: Project, entryId: string) {
  const choice = greenhouseVentChoices(project).find(
    ({ entry }) => entry.id === entryId,
  );
  if (!choice) throw Error("The saved greenhouse roof vent is missing.");
  const active = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  function members(role: string) {
    const id = choice!.entry.sections.find(
      (row) => row.role === role,
    )?.sectionId;
    const section = project.sections.find((row) => row.id === id);
    if (!section?.pieceIds.length)
      throw Error("Restore the actual vent opening and sash sections.");
    return section.pieceIds.map((pieceId) => {
      const piece = active.get(pieceId);
      if (!piece)
        throw Error("A vent member has been removed or is an offcut.");
      return piece;
    });
  }
  const fixed = members("roof-vent-opening"),
    moving = members("roof-vent-sash");
  const ids = moving.map((part) => part.id);
  if (
    fixed.length !== 2 ||
    ids.length > 32 ||
    fixed.some((part) => ids.includes(part.id))
  )
    throw Error(
      "The two fixed blocking members and the moving sash need distinct actual parts.",
    );

  const anchor = fixed[0];
  const inverse = inverseRotation(anchor.rotation);
  const vertices = moving.flatMap((piece) => {
    const normal = rotate(rotate([0, 0, 1], piece.rotation), inverse);
    const body = prepareCollisionSolid(piece);
    if (normal[2] < 1 - epsilon || !body)
      throw Error(
        "Align the sash panels with the roof vent opening in the closed position.",
      );
    return body.vertices.map((point) =>
      rotate(subtract(point, anchor.position), inverse),
    );
  });
  const min = (i: number) => Math.min(...vertices.map((p) => p[i]));
  const max = (i: number) => Math.max(...vertices.map((p) => p[i]));
  return {
    label: choice.label,
    ids,
    anchor,
    upperEdge: [(min(0) + max(0)) / 2, max(1), max(2)] as V3,
    width: max(0) - min(0),
    length: max(1) - min(1),
    glazing: moving.some((piece) => piece.material === "sunlite-8mm"),
  };
}

function ventMotion(
  geometry: ReturnType<typeof ventGeometry>,
  setup: GreenhouseVentSetup,
  travel: number,
) {
  const { anchor, upperEdge, ids } = geometry;
  const pivot = add(
    anchor.position,
    rotate(add(upperEdge, [0, 0, setup.outset]), anchor.rotation),
  );
  return {
    label: `${geometry.label.slice(0, 75)} · Roof vent`,
    memberIds: ids,
    mechanism: {
      kind: "hinge" as const,
      axis: rotate([1, 0, 0], anchor.rotation),
      pivot,
      travel,
      greenhouseVent: setup,
    },
  };
}

export function greenhouseVentMotionInput(
  project: Project,
  input: GreenhouseVentSetup,
  travel: number,
): MotionPlanInput {
  const setup = greenhouseVentMotionSchema.parse(input);
  return ventMotion(ventGeometry(project, setup.entryId), setup, travel);
}

export function greenhouseVentReview(project: Project, plan: MotionPlan) {
  const mechanism = plan.mechanism;
  if (mechanism.kind !== "hinge" || !mechanism.greenhouseVent) return null;
  try {
    const geometry = ventGeometry(project, mechanism.greenhouseVent.entryId);
    const expected = ventMotion(
      geometry,
      mechanism.greenhouseVent,
      mechanism.travel,
    ).mechanism;
    const anchor = project.pieces.find(
      (piece) => piece.id === plan.memberIds[0],
    );
    if (
      !anchor ||
      plan.memberIds.length !== geometry.ids.length ||
      geometry.ids.some((id) => !plan.memberIds.includes(id)) ||
      Math.hypot(
        ...subtract(
          add(anchor.position, rotate(mechanism.pivot, anchor.rotation)),
          expected.pivot,
        ),
      ) > epsilon ||
      Math.hypot(
        ...subtract(rotate(mechanism.axis, anchor.rotation), expected.axis),
      ) > epsilon
    )
      throw Error(
        "The vent members or hinge edge changed. Edit the roof vent setup to review the current sash.",
      );
    return {
      warning: null,
      lines: [
        `Top-hinged roof vent sash · ${formatPreciseInches(geometry.width)} across the bay × ${formatPreciseInches(geometry.length)} down the roof.`,
        geometry.glazing
          ? "The modeled SUNLITE vent panel moves with the wood sash."
          : "This movement uses the wood sash. Add the finished glazing geometry before checking the completed vent.",
        "Confirm the installed pivot and mounting. Flashing, seals, effective ventilation area and the hold-open hardware need separate selections.",
      ],
    };
  } catch (problem) {
    return {
      warning:
        problem instanceof Error
          ? problem.message
          : "Review the roof vent configuration.",
      lines: [],
    };
  }
}
