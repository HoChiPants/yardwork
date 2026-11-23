import { bandingKey, edgeBandingEdges, finishedPanel, measuredBandingByPanel, saveEdgeBanding } from "./edgeBanding";
import { cabinetDoorsInputSchema, type CabinetDoorsInput } from "./cabinetDoorsSchema";
import { libertyFlushHinge } from "./cabinetDoorsReference";
import { libertyBarPull } from "./cabinetPullReference";
import { part, projectSchema, material, step, uid, type Piece, type Project, type Section, type V3 } from "./model";
import { bounds } from "./engine";
import { formatPreciseInches } from "./measurement";
import { motionReviewTravel, motionSetup, runMotionTest, saveMotionPlan, saveMotionTestScenario } from "./mechanismMotion";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";
import { pieceOverlap } from "./solidCollision";
import { composeRotation, rotate } from "./spatial";

const tolerance = 0.01;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const base: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const close = (a: V3, b: V3) => a.every((value, i) => Math.abs(value - b[i]) < tolerance);

export function cabinetDoorFrameParts(project: Project) {
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  return project.pieces.filter((piece) => {
    const stock = material(piece.material);
    return !piece.offcut && stock.wood && (stock.stockKind === "linear" || stock.stockKind === "sheet") &&
      !piece.cutPlanes.length && !piece.roundOpenings?.length && !piece.rectangularOpenings?.length &&
      !moving.has(piece.id);
  });
}

export function cabinetDoorOpening(project: Project, ids: CabinetDoorsInput["frameIds"]) {
  const choices = cabinetDoorFrameParts(project);
  const parts = ids.map((id) => choices.find((part) => part.id === id));
  const [left, right, bottom, top] = parts;
  if (!left || !right || !bottom || !top || new Set(ids).size !== 4)
    throw Error("Choose distinct left and right stiles and bottom and top rails.");
  const dx = right.position[0] - left.position[0], dz = right.position[2] - left.position[2];
  const width = Math.hypot(dx, dz);
  if (width <= tolerance) throw Error("Choose two vertical stiles on opposite sides of the opening.");
  const x: V3 = [dx / width, 0, dz / width];
  const y: V3 = [0, 1, 0];
  const z: V3 = [-x[2], 0, x[0]];
  const axes = [x, y, z];
  function onFrame(piece: Piece) {
    const world = base.map((axis) => rotate(axis, piece.rotation));
    if (!world.every((axis) => axes.some((direction) => Math.abs(dot(axis, direction)) > 1 - 1e-7)))
      throw Error("Use square face-frame members aligned with the opening.");
    return axes.map((direction) => {
      const center = dot(piece.position, direction);
      const half = world.reduce((total, axis, i) => total + Math.abs(dot(axis, direction)) * piece.size[i] / 2, 0);
      return { min: center - half, max: center + half };
    });
  }
  const a = onFrame(left), b = onFrame(right), c = onFrame(bottom), d = onFrame(top);
  const l = a[0].max, r = b[0].min, low = c[1].max, high = d[1].min;
  if (r - l < 1 || high - low < 1)
    throw Error("Check the left/right and bottom/top order. The frame needs a clear opening.");
  if ([a, b].some((stile) => stile[1].min > low + tolerance || stile[1].max < high - tolerance) ||
      [c, d].some((rail) => rail[0].min > l + tolerance || rail[0].max < r - tolerance))
    throw Error("The selected rails and stiles must cover all four edges of the opening.");
  const face = a[2].max;
  if ([b, c, d].some((member) => Math.abs(member[2].max - face) > 1 / 32))
    throw Error("The four front faces must be within 1/32 in of the same plane for these flush doors.");
  const world = (across: number, height: number, depth: number): V3 =>
    [across * x[0] + depth * z[0], height, across * x[2] + depth * z[2]];
  return { l, r, low, high, face, world, rotation: [0, Math.atan2(z[0], z[2]), 0] as V3,
    stiles: [a[0].max - a[0].min, b[0].max - b[0].min] };
}

function doorLayout(project: Project, input: CabinetDoorsInput) {
  const opening = cabinetDoorOpening(project, input.frameIds);
  const width = opening.r - opening.l, height = opening.high - opening.low - 2 * input.outerGap;
  const thickness = Math.min(...material(input.stock).size);
  const widthEach = input.leaves === "pair" ? (width - 2 * input.outerGap - input.centerGap) / 2 : width - 2 * input.outerGap;
  const allowance = 2 * (input.banding?.thickness ?? 0);
  const cutWidth = widthEach - allowance;
  const cutHeight = height - allowance;
  if (cutHeight < 2 || cutWidth < 2) throw Error("The reveals and banding leave too little room for a door panel.");
  if (height <= 2 * input.hingeEnd + 1)
    throw Error("Move the outer hinge centers closer to the panel ends or choose a taller opening.");
  if (input.pinTowardFrame > input.outerGap + 0.25)
    throw Error("Measure the pin near the reveal between the door edge and stile.");
  const [, stockWidth, stockLength] = [...material(input.stock).size].sort((a, b) => a - b);
  if (cutWidth > stockWidth || cutHeight > stockLength) throw Error("The panel does not fit the selected stock with grain running vertically.");
  const y = (opening.low + opening.high) / 2;
  const pull = input.pull;
  const [barLength, barWidth, projection] = libertyBarPull.size;
  const pullRotation = composeRotation(opening.rotation, [0, 0, Math.PI / 2]);
  const centerFromBottom = pull && (pull.datum === "bottom" ? pull.height : height - pull.height);
  if (pull && centerFromBottom !== undefined) {
    if (pull.inset - barWidth / 2 < allowance / 2 || pull.inset + barWidth / 2 > widthEach - allowance / 2)
      throw Error("Move the pull center farther onto the door face from the free edge.");
    if (centerFromBottom < barLength / 2 + allowance / 2 ||
        centerFromBottom > height - barLength / 2 - allowance / 2)
      throw Error("Move the pull toward the middle of the door to clear the finished top and bottom edges.");
  }
  const sides = input.leaves === "pair" ? ["left", "right"] as const : [input.leaves];
  const geometry = sides.map((side) => {
    const leftHinged = side === "left";
    const sign = leftHinged ? 1 : -1;
    const edge = (leftHinged ? opening.l : opening.r) + sign * input.outerGap;
    const axis: V3 = [0, sign, 0];
    const position = opening.world(edge + sign * widthEach / 2, y, opening.face - thickness / 2);
    const handle = pull && centerFromBottom !== undefined ? {
      position: opening.world(edge + sign * (widthEach - pull.inset),
        y + centerFromBottom - height / 2, opening.face + projection / 2),
      rotation: pullRotation,
      role: `cabinet-inset-pull-${side}`,
    } : undefined;
    return { side, axis, size: [cutWidth, cutHeight, thickness] as V3,
      finishedSize: [widthEach, height, thickness] as V3, rotation: opening.rotation, handle, position,
      pivot: opening.world(edge - sign * input.pinTowardFrame, y, opening.face + input.pinForward) };
  });
  const marks = Array.from({ length: input.hingesPerLeaf }, (_, i) =>
    input.hingeEnd + (height - 2 * input.hingeEnd) * i / (input.hingesPerLeaf - 1));
  return { opening, geometry, marks };
}

function closedDoorBlockers(project: Project, pieces: Piece[]) {
  const obstruction = [];
  const measured = measuredBandingByPanel(project);
  const fixed = project.pieces.map((piece) => finishedPanel(piece, measured));
  for (const raw of pieces) {
    const piece = finishedPanel(raw, measured);
    const box = bounds(piece);
    const zone = project.workZone;
    if (zone && (box.min[0] < -zone.width / 2 - tolerance || box.max[0] > zone.width / 2 + tolerance ||
        box.min[1] < -tolerance || box.max[1] > zone.height + tolerance ||
        box.min[2] < -zone.depth / 2 - tolerance || box.max[2] > zone.depth / 2 + tolerance))
      obstruction.push(`${piece.name} extends outside the work zone when closed.`);
    for (const other of fixed) {
      if (other.offcut || other.id === piece.id) continue;
      const b = bounds(other);
      if (box.min.some((min, axis) => box.max[axis] <= b.min[axis] + tolerance || b.max[axis] <= min + tolerance)) continue;
      if (pieceOverlap(piece, other, tolerance) !== false)
        obstruction.push(`${piece.name} overlaps ${other.name} in the closed position.`);
    }
  }
  return obstruction;
}

function cabinetPullPiece(leaf: Piece, side: string, handle: NonNullable<ReturnType<typeof doorLayout>["geometry"][number]["handle"]>, existing?: Piece): Piece {
  const pull = existing ?? part(`Cabinet pull · ${side}`, libertyBarPull.id,
    [...libertyBarPull.size], handle.position, leaf.stepId, leaf.assembly, handle.rotation);
  return { ...pull, position: handle.position, rotation: handle.rotation, designRole: handle.role };
}

function cabinetDoorTests(project: Project, plans: MotionPlan[]) {
  return [
    ...plans.map((plan) => ({ name: `${plan.label} alone`, result: runMotionTest(project, plan) })),
    ...plans.flatMap((plan) => [
      ...(plan.testSetup ? [{ name: `${plan.label} · Saved test`, result: runMotionTest(project, plan, plan.testSetup) }] : []),
      ...(plan.testScenarios ?? []).map(({ name, setup }) => ({ name, result: runMotionTest(project, plan, setup) })),
    ]),
  ];
}

export function previewCabinetDoors(project: Project, fields: CabinetDoorsInput) {
  const input = cabinetDoorsInputSchema.parse(fields);
  if (project.sections.some(({ cabinetDoors }) => cabinetDoors && input.frameIds.every((id) => cabinetDoors.frameIds.includes(id))))
    throw Error("This opening already has fitted doors. Remove their section before fitting a new set.");
  const layout = doorLayout(project, input);
  const label = input.leaves === "pair" ? "Inset cabinet doors" : "Inset cabinet door";
  const task = step(`Fit ${label.toLowerCase()}`);
  const leaves: Piece[] = layout.geometry.map(({ side, position, rotation, size }) => ({
    ...part(`Cabinet door · ${side}`, input.stock, size, position, task.id, label, rotation),
    designRole: `cabinet-inset-door-${side}`,
    stockLengthAxis: 1 as const,
  }));
  const pulls = layout.geometry.flatMap(({ side, handle }, index) =>
    handle ? [cabinetPullPiece(leaves[index], side, handle)] : []);
  const pieces = [...leaves, ...pulls];
  let next: Project = { ...project, pieces: [...project.pieces, ...pieces], steps: [...project.steps, task], guideFingerprint: null };
  if (input.banding) {
    const keys = new Set(leaves.flatMap(({ id }) => (["-X", "+X", "-Y", "+Y"] as const)
      .map((face) => bandingKey({ pieceId: id, face }))));
    const available = edgeBandingEdges(next, keys);
    if (available.length !== keys.size) throw Error("All four cut edges must be available for cabinet door banding.");
    const { productId, trim, thickness } = input.banding;
    next = saveEdgeBanding(next, keys, productId, trim, thickness);
  }
  const issue = closedDoorBlockers(next, pieces)[0];
  const plans = layout.geometry.map(({ pivot, axis }, i) => {
    const leaf = leaves[i];
    const memberIds = pulls[i] ? [leaf.id, pulls[i].id] : [leaf.id];
    const saved = saveMotionPlan(next, { label: leaf.name, memberIds,
      mechanism: { kind: "hinge", axis, pivot, travel: input.angle } });
    next = saved.project;
    return saved.plan;
  });
  const pairScenarios = plans.length < 2 ? [] : [
    { name: "Both cabinet doors together", setup: { linkedId: plans[1].id, held: [] } },
    { name: "Left cabinet door first", setup: { linkedId: plans[1].id, openingOrder: "selected-first", held: [] } },
    { name: "Right cabinet door first", setup: { linkedId: plans[1].id, openingOrder: "companion-first", held: [] } },
  ] satisfies { name: string; setup: MotionTestSetup }[];
  for (const { name, setup } of pairScenarios)
    next = saveMotionTestScenario(next, plans[0].id, name, setup).project;
  const section: Section = { id: uid(), name: label, pieceIds: pieces.map(({ id }) => id),
    origin: layout.opening.world((layout.opening.l + layout.opening.r) / 2, layout.opening.low, layout.opening.face),
    rotation: layout.opening.rotation, generator: null, recipe: null, cabinetDoors: input };
  next = projectSchema.parse({ ...next, sections: [...next.sections, section] });
  const savedPlans = plans.map((plan) => next.motionPlans!.find(({ id }) => id === plan.id)!);
  return { project: next, section, layout, issue, leaves, pulls, plans: savedPlans, tests: cabinetDoorTests(next, savedPlans) };
}

export function cabinetDoorTestSummary(test: ReturnType<typeof runMotionTest>) {
  if (!test.review) return { detail: test.error ?? "The modeled swing needs review.", review: true };
  const review = test.review;
  const target = motionReviewTravel(review);
  const first = review.playbackLimit(0, target);
  const last = review.playbackLimit(target, 0);
  if (first.inspectAt === undefined && last.inspectAt === undefined && !review.unresolvedIds.length)
    return { detail: "The modeled opening and closing paths clear.", review: false };
  const opening = first.inspectAt !== undefined;
  const limit = opening ? first : last;
  const pose = review.preview(limit.travel, limit.inspectAt, limit.siteFaceId);
  const result = [...pose.obstacleNames, ...pose.siteFaceNames, ...pose.outsideZoneFaces];
  return { review: true, detail: result.length
    ? `${opening ? "Opening" : "Closing"} ${pose.envelopeOnly ? "has possible contact" : "needs clearance"} at ${result.join(", ")}.`
    : "Review the modeled travel and any incomplete obstruction checks." };
}

function cabinetFit(project: Project, section: Section, overrides?: CabinetDoorsInput) {
  const input = overrides ?? section.cabinetDoors;
  if (!input) throw Error("Cabinet door measurements are missing.");
  const layout = doorLayout(project, input);
  const member = (role: string) => project.pieces.find(({ id, designRole }) =>
    section.pieceIds.includes(id) && designRole === role);
  const banding = measuredBandingByPanel(project);
  const leaves = layout.geometry.map((expected) => {
    const piece = member(`cabinet-inset-door-${expected.side}`);
    if (!piece || piece.offcut || piece.material !== input.stock || !close(piece.size, expected.size) ||
      !close(piece.position, expected.position) ||
      !base.every((axis) => close(rotate(axis, piece.rotation), rotate(axis, expected.rotation))) ||
      piece.cutPlanes.length || piece.roundOpenings?.length || piece.rectangularOpenings?.length)
      throw Error("The face frame or fitted panels changed. Recheck the reveals, cut dimensions and hinge line.");
    const finished = finishedPanel(piece, banding);
    if (finished.size.some((n, axis) => Math.abs(n - expected.finishedSize[axis]) > 1e-6) ||
        finished.position.some((n, axis) => Math.abs(n - expected.position[axis]) > 1e-6))
      throw Error("The edge finish changes the saved door reveals. Review the finished dimensions and hinge settings.");
    return piece;
  });
  return { layout, leaves, member };
}

/** Change the modeled pulls without regenerating cut panels or replacing saved motion IDs. */
export function previewCabinetPullRevision(project: Project, sectionId: string, pull: NonNullable<CabinetDoorsInput["pull"]>) {
  const current = project.sections.find(({ id }) => id === sectionId);
  if (!current?.cabinetDoors) throw Error("Choose a fitted cabinet door section.");
  const input = cabinetDoorsInputSchema.parse({ ...current.cabinetDoors, pull });
  const { layout, leaves, member } = cabinetFit(project, current, input);
  const previous = layout.geometry.map(({ handle }) => member(handle!.role));
  if (leaves.length + previous.filter(Boolean).length !== current.pieceIds.length ||
    previous.some((piece) => piece && (piece.material !== libertyBarPull.id || piece.offcut ||
      piece.cutStock || piece.cutPlanes.length || piece.roundOpenings?.length || piece.rectangularOpenings?.length)))
    throw Error("The fitted section contains changed members. Check its doors and pull hardware first.");

  const pulls = layout.geometry.map(({ side, handle }, index) =>
    cabinetPullPiece(leaves[index], side, handle!, previous[index]));
  const replacement = new Map(pulls.map((piece) => [piece.id, piece]));
  const newPulls = pulls.filter((_, index) => !previous[index]);
  const pullForDoor = new Map(leaves.map(({ id }, index) => [id, pulls[index].id]));
  const plans = leaves.map(({ id }) => {
    const plan = project.motionPlans?.find(({ memberIds }) => memberIds[0] === id);
    if (!plan || plan.mechanism.kind !== "hinge")
      throw Error("Open Test movement and restore the fitted hinge for each door.");
    return plan;
  });
  const motionPlans = project.motionPlans?.map((plan) => {
    const additions = plan.memberIds.flatMap((id) => {
      const pullId = pullForDoor.get(id);
      return pullId && !plan.memberIds.includes(pullId) ? [pullId] : [];
    });
    return additions.length ? { ...plan, memberIds: [...plan.memberIds, ...additions] } : plan;
  });
  const section = { ...current, cabinetDoors: input, pieceIds: [...current.pieceIds, ...newPulls.map(({ id }) => id)] };
  const next = projectSchema.parse({
    ...project,
    pieces: [...project.pieces.map((piece) => replacement.get(piece.id) ?? piece), ...newPulls],
    sections: project.sections.map((row) => row.id === sectionId ? section : row),
    motionPlans,
    guideFingerprint: null,
  });
  const doorPlans = plans.map((plan) => next.motionPlans!.find(({ id }) => id === plan.id)!);
  const issue = closedDoorBlockers(next, [...leaves, ...pulls])[0];
  return { project: next, section, layout, issue, leaves, pulls, plans: doorPlans, tests: cabinetDoorTests(next, doorPlans) };
}

export function reviewCabinetDoors(project: Project, section: Section) {
  const input = section.cabinetDoors;
  if (!input) return { issue: "Cabinet door measurements are missing." };
  try {
    const { layout, leaves, member } = cabinetFit(project, section);
    const pullPieces = layout.geometry.flatMap(({ handle }) => handle ? [{ piece: member(handle.role), handle }] : []);
    if (leaves.length + pullPieces.length !== section.pieceIds.length || pullPieces.some(({ piece, handle }) =>
      !piece || piece.offcut || piece.material !== libertyBarPull.id || !close(piece.size, [...libertyBarPull.size]) ||
      !close(piece.position, handle.position) || !base.every((axis) => close(rotate(axis, piece.rotation), rotate(axis, handle.rotation))) ||
      piece.cutStock || piece.cutPlanes.length || piece.roundOpenings?.length || piece.rectangularOpenings?.length))
      return { issue: "The cabinet pulls or their positions changed. Recheck the mounting marks and the paths of both doors." };
    const pulls = pullPieces.map(({ piece }) => piece!);
    const obstruction = closedDoorBlockers(project, [...leaves, ...pulls])[0];
    if (obstruction) return { issue: obstruction };
    if (leaves.some(({ id }, i) => {
      const expected = layout.geometry[i];
      const plan = project.motionPlans?.find(({ memberIds }) => memberIds[0] === id);
      if (!plan || (pulls[i] && !plan.memberIds.includes(pulls[i].id))) return true;
      const { mechanism } = motionSetup(project, plan);
      return mechanism.kind !== "hinge" || !!mechanism.hingePath || !close(mechanism.pivot, expected.pivot) ||
        !close(mechanism.axis, expected.axis) || Math.abs(mechanism.travel - input.angle) > tolerance;
    })) return { issue: "The hinge motion changed. Confirm the actual pin position and swing limits." };
    return { issue: undefined, ...layout, leaves, pulls };
  } catch (cause) {
    return { issue: cause instanceof Error ? cause.message : "Review the fitted cabinet doors." };
  }
}

export function cabinetDoorGuide(project: Project, section: Section) {
  const layout = reviewCabinetDoors(project, section);
  if (layout.issue || !("marks" in layout)) return `Review the cabinet door fit before cutting or drilling. ${layout.issue ?? ""}`.trim();
  const input = section.cabinetDoors!;
  const inch = formatPreciseInches;
  const marks = layout.marks.map((mark) => inch(Math.round(mark * 32) / 32)).join(", ");
  return [
    `Use the modeled panel cut sizes with the face grain running vertically. Dry-fit the actual opening with ${inch(input.outerGap)} spacers at the frame${input.leaves === "pair" ? ` and a ${inch(input.centerGap)} center reveal` : ""}.`,
    ...(input.banding ? [
      `The panel cut size allows ${inch(input.banding.thickness)} of measured veneer on each edge. Finish at ${inch(layout.geometry[0].finishedSize[0])} wide × ${inch(layout.geometry[0].finishedSize[1])} high. Apply the left and right edges before the top and bottom. Dry-fit the completed doors before transferring the hinge marks.`,
    ] : []),
    `Lay out ${input.hingesPerLeaf} hinge pin centers per door about ${marks} down from the finished top, with the pin ${inch(input.pinTowardFrame)} toward the stile from the hinge-side door edge and ${inch(input.pinForward)} ahead of the closed front.`,
    "Confirm the face frame is square and both front faces are flush. Support the doors temporarily and transfer the screw marks from the delivered hinges. Verify leaf footprint, screw reach, hinge count and installed opening before drilling.",
    ...(input.pull ? [
      `Vertical ${libertyBarPull.mountingSpacingMm} mm Liberty pull on each door · mark the midpoint ${inch(input.pull.inset)} from the finished free edge and ${inch(input.pull.height)} from the finished ${input.pull.datum}.${input.leaves === "pair" ? " Mirror the layout across the center gap." : ""}`,
      `Transfer the two holes with the delivered pull or drilling template. Confirm the 3/16 in through-hole and included ${inch(libertyBarPull.includedScrewLength)} 8-32 screws with the actual hardware. Check grip room and recheck the sweep with the pulls and trim installed. ${libertyBarPull.installation}`,
    ] : ["Recheck the sweep with the actual pulls and trim installed."]),
    ...(input.hinge === libertyFlushHinge.id ? [
      `Flush H hinge selection · ${libertyFlushHinge.listing}`,
      `Liberty flush door mounting reference · ${libertyFlushHinge.manufacturerGuide}`,
    ] : []),
  ].join("\n");
}

export function cabinetDoorHingeTakeoff(project: Project) {
  let hinges = 0, review = 0;
  for (const section of project.sections) {
    const input = section.cabinetDoors;
    if (input?.hinge !== libertyFlushHinge.id) continue;
    if (reviewCabinetDoors(project, section).issue) review++;
    else hinges += (input.leaves === "pair" ? 2 : 1) * input.hingesPerLeaf;
  }
  return { hinges, required: Math.ceil(hinges / libertyFlushHinge.packCount), review };
}
