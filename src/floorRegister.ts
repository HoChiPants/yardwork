import { floorRegisterMeasurementsSchema, type FloorRegisterMeasurements } from "./floorRegisterSchema";
import { floorRegisterBoot } from "./floorRegisterReference";
import { formatStockLength } from "./measurement";
import { addMeasuredOffcut } from "./measuredOffcuts";
import { material, pieceSchema, projectSchema, uid, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { editThroughOpening, type RectangularOpeningMarks } from "./throughOpeningCuts";

const epsilon = 1e-6;
const bladeBelowPanel = 0.125;
export const floorRegisterCutoutUse = "Keep an intact cutout for a tool test or as scrap backing for a future cut.";
type Envelope = Pick<Piece, "size" | "position" | "rotation">;
type Plan = NonNullable<Project["floorRegisterPlans"]>[number];

export const isFloorRegisterPanel = (piece: Piece) => {
  const stock = material(piece.material);
  return !piece.offcut && stock.wood && stock.cuttable && stock.stockKind === "sheet" &&
    !piece.cutPlanes.length && piece.size[1] < Math.min(piece.size[0], piece.size[2]) &&
    rotate([0, 1, 0], piece.rotation)[1] >= 1 - 1e-10;
};

function world(panel: Piece, local: V3): V3 {
  return rotate(local, panel.rotation).map((value, axis) => value + panel.position[axis]) as V3;
}

export type FloorRegisterPreview = {
  panel: Piece;
  opening: V3[];
  throat: V3[];
  envelope: Envelope;
  nominalGap: [number, number];
  sealRun: number;
  blockers: Piece[];
  issue?: string;
  openingProject?: Project;
};

export function previewFloorRegister(
  project: Project,
  input: FloorRegisterMeasurements,
  prior?: Plan,
): { issue?: string; layout?: FloorRegisterPreview } {
  const parsed = floorRegisterMeasurementsSchema.safeParse(input);
  if (!parsed.success) return { issue: "Enter the opening marks and measured boot dimensions." };
  const panel = project.pieces.find(({ id }) => id === input.panelId);
  if (!panel || !isFloorRegisterPanel(panel)) return { issue: "Choose a horizontal wood subfloor panel." };
  const height = panel.size[1];
  const { fromLeft, fromFront, openingLength, openingWidth, throatLength, throatWidth, bodyLength,
    bodyWidth, depth, bodyOffsetX, bodyOffsetZ } = input;
  const nominalGap: [number, number] = [(openingLength - throatLength) / 2, (openingWidth - throatWidth) / 2];
  const x = fromLeft + (openingLength - panel.size[0]) / 2;
  const z = fromFront + (openingWidth - panel.size[2]) / 2;
  const rectangle = (length: number, width: number): V3[] =>
    [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) =>
      world(panel, [x + a * length / 2, height / 2 + 0.05, z + b * width / 2]));
  const envelope: Envelope = {
    size: [bodyLength, depth, bodyWidth],
    position: world(panel, [x + bodyOffsetX, -(height + depth) / 2, z + bodyOffsetZ]),
    rotation: panel.rotation,
  };
  const layout: FloorRegisterPreview = {
    panel, opening: rectangle(openingLength, openingWidth), throat: rectangle(throatLength, throatWidth),
    envelope, nominalGap, sealRun: openingLength + openingWidth + throatLength + throatWidth, blockers: [],
  };
  let issue: string | undefined;
  if (fromLeft <= epsilon || fromFront <= epsilon || fromLeft + openingLength >= panel.size[0] - epsilon ||
      fromFront + openingWidth >= panel.size[2] - epsilon)
    issue = "Keep the register opening inside the sheet edges.";
  if (nominalGap.some((gap) => gap < -epsilon)) issue ??= "The measured throat is wider or longer than the opening.";
  if (bodyLength / 2 + epsilon < throatLength / 2 + Math.abs(bodyOffsetX) ||
      bodyWidth / 2 + epsilon < throatWidth / 2 + Math.abs(bodyOffsetZ))
    issue ??= "The body envelope must include the throat footprint. Check the body dimensions and center offset.";
  const marks: RectangularOpeningMarks = { axis: 1, fromEdges: [fromFront, fromLeft], spans: [openingWidth, openingLength] };
  try {
    const stripped = prior ? withoutFloorRegisterOpening(project, prior) : project;
    layout.openingProject = editThroughOpening(stripped, panel.id, "rectangularOpenings", null, marks);
  } catch (problem) {
    issue ??= problem instanceof Error ? problem.message : "Review the opening inside the retained panel.";
  }

  const body = prepareCollisionBox(envelope.size, envelope.position, envelope.rotation);
  const throat = prepareCollisionBox([openingLength, height + bladeBelowPanel, openingWidth],
    world(panel, [x, -bladeBelowPanel / 2, z]), panel.rotation);
  layout.blockers = project.pieces.filter((other) => {
    if (other.id === panel.id || other.offcut) return false;
    const solid = prepareCollisionSolid(other) ?? prepareCollisionBox(other.size, other.position, other.rotation);
    return solidOverlap(body, solid, epsilon) || solidOverlap(throat, solid, epsilon);
  });
  if (layout.blockers.length) issue ??= "The opening or boot envelope crosses a modeled part. Move the opening before cutting.";
  return { issue, layout: { ...layout, issue } };
}

function withoutFloorRegisterOpening(project: Project, plan: Plan): Project {
  return { ...project, pieces: project.pieces.map((piece) => {
    const openings = piece.rectangularOpenings;
    if (piece.id !== plan.input.panelId || !openings?.some(({ source }) => source?.floorRegisterId === plan.id)) return piece;
    const remaining = openings.filter(({ source }) => source?.floorRegisterId !== plan.id);
    const { rectangularOpenings: _old, ...rest } = piece;
    return remaining.length ? { ...rest, rectangularOpenings: remaining } : rest;
  }) };
}

export function saveFloorRegister(project: Project, input: FloorRegisterMeasurements, planId?: string): Project {
  const prior = project.floorRegisterPlans?.find(({ id }) => id === planId);
  if (planId && !prior) throw Error("This register plan changed. Open it again.");
  const { layout, issue } = previewFloorRegister(project, input, prior);
  if (issue || !layout?.openingProject) throw Error(issue ?? "Preview a clear floor register opening.");
  const id = planId ?? uid();
  const pieces = layout.openingProject.pieces.map((piece) => {
    if (piece.id !== input.panelId) return piece;
    const openings = [...piece.rectangularOpenings!];
    openings[openings.length - 1] = { ...openings[openings.length - 1], source: { floorRegisterId: id } };
    return pieceSchema.parse({ ...piece, rectangularOpenings: openings });
  });
  return projectSchema.parse({
    ...layout.openingProject, pieces,
    floorRegisterPlans: [...(project.floorRegisterPlans ?? []).filter((plan) => plan.id !== id), { ...prior, id, input }],
    guideFingerprint: null,
  });
}

export function recordFloorRegisterCutout(project: Project, id: string, stepId: string, dimensions: V3): Project {
  const review = floorRegisterReviews(project).find(({ plan }) => plan.id === id);
  if (!review) throw Error("Choose a saved floor register opening.");
  if (review.plan.recoveredCutout) throw Error("This register cutout was already recorded.");
  if (review.issue || !review.layout) throw Error(review.issue ?? "Review the opening before recording its cutout.");
  const { panel } = review.layout;
  const { openingLength, openingWidth } = review.plan.input;
  const limits = [openingLength, openingWidth, panel.size[1]];
  if (dimensions.some((value, axis) => !Number.isFinite(value) || value <= 0 || value > limits[axis]))
    throw Error("Enter the usable rectangle within the saved opening and panel thickness.");
  const [x, z, thickness] = dimensions;
  const oriented: V3 = stockAxes(panel).length === 2 ? [z, x, thickness] : [x, z, thickness];
  const next = addMeasuredOffcut(project, stepId, panel.material, oriented, `Floor register cutout from ${partLabel(project, panel.id)}`);
  const recoveredCutout = { sourceId: next.pieces.at(-1)!.cutStock!.id, dimensions };
  return projectSchema.parse({
    ...next,
    floorRegisterPlans: project.floorRegisterPlans!.map((plan) => plan.id === id ? { ...plan, recoveredCutout } : plan),
    guideFingerprint: null,
  });
}

export function floorRegisterCutoutLabel(project: Project, plan: Plan) {
  if (!plan.recoveredCutout) return "";
  const { dimensions, sourceId } = plan.recoveredCutout;
  const onHand = project.pieces.filter((piece) => piece.offcut && piece.cutStock?.id === sourceId);
  return `Recorded cutout · ${dimensions.map(formatStockLength).join(" × ")}. ${onHand.length
    ? `See ${onHand.map(({ id }) => partLabel(project, id)).join(", ")} in the Cut pool.`
    : "Its recorded source has no remaining offcut in the Cut pool."}`;
}

export function removeFloorRegister(project: Project, id: string): Project {
  const prior = project.floorRegisterPlans?.find((plan) => plan.id === id);
  if (!prior) return project;
  const { floorRegisterPlans: _plans, ...rest } = withoutFloorRegisterOpening(project, prior);
  const remaining = project.floorRegisterPlans!.filter((plan) => plan.id !== id);
  return { ...rest, ...(remaining.length ? { floorRegisterPlans: remaining } : {}), guideFingerprint: null };
}

export function floorRegisterReviews(project: Project) {
  return (project.floorRegisterPlans ?? []).map((plan) => {
    const panel = project.pieces.find(({ id }) => id === plan.input.panelId);
    const current = panel?.rectangularOpenings?.find(({ source }) => source?.floorRegisterId === plan.id);
    if (!current) return { plan, issue: "The saved floor register opening is missing. Review the cut again." };
    const check = previewFloorRegister(project, plan.input, plan);
    const expected = check.layout?.openingProject?.pieces.find(({ id }) => id === plan.input.panelId)?.rectangularOpenings?.at(-1);
    if (!check.issue && (!expected || expected.spans.some((value, axis) =>
      Math.abs(value - current.spans[axis]) > epsilon || Math.abs(expected.center[axis] - current.center[axis]) > epsilon) ||
      current.axis !== 1)) return { plan, issue: "The panel or opening changed. Review the cut marks again." };
    return { plan, issue: check.issue, layout: check.layout };
  });
}

export function floorRegisterSealMethod(layout: FloorRegisterPreview) {
  return Math.max(...layout.nominalGap) < floorRegisterBoot.beadGapLimit
    ? "Review a compatible bead of sealant or mastic along all four sides."
    : "Review fiberglass mesh tape and mastic for the wider gap.";
}

export function floorRegisterGuideLines(project: Project) {
  return floorRegisterReviews(project).flatMap(({ plan, issue, layout }) => {
    const label = partLabel(project, plan.input.panelId);
    const cutout = floorRegisterCutoutLabel(project, plan);
    if (issue || !layout) return [`${label} · Review floor register fit. ${issue ?? "The modeled opening is unavailable."}`, ...(cutout ? [cutout] : [])];
    const dimensions = [plan.input.openingLength, plan.input.openingWidth].map(formatStockLength).join(" × ");
    return [
      `${label} · ${dimensions} opening. Start ${formatStockLength(plan.input.fromLeft)} from the low X edge and ${formatStockLength(plan.input.fromFront)} from the low Z edge.`,
      `Dry-fit the measured boot and secure it to framing. Then seal the ${formatStockLength(layout.sealRun)} modeled perimeter. ${floorRegisterSealMethod(layout)}`,
      cutout || `${floorRegisterCutoutUse} Measure the usable rectangle after cutting, then record it in the Cut pool.`,
    ];
  });
}
