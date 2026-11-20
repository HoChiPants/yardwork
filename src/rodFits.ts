import { Vector3 } from "three";
import { attachmentGeometryFingerprint } from "./attachments";
import { fittedStockFaces } from "./fittedStock";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { rotate, inverseRotation } from "./spatial";
import { addSupply } from "./supplies";
import { formatPreciseInches } from "./measurement";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";
import { rodEndCrossesCut } from "./rodMountGeometry";
import { rodSocketPlateGuideLines, rodPlateScope } from "./rodSocketPlates";
import { reviewRodBracketMount, rodBracketMountGuideLines } from "./rodBracketMounts";
import {
  rodMeasurementTolerance,
  rodFitMeasurementsSchema,
  rodFitSchema,
  type RodFitPlan,
} from "./rodFitSchema";

import {
  reviewRodSupports,
  rodBracketProductId,
  rodIntermediateReference,
  rodReferenceSpacing,
  rodSupportStateLabel,
} from "./rodSupports";

const epsilon = 0.0001;
export const rodFlangeProductId = "project-source-23723phslg";
export const rodFlangeInstructions =
  "https://pdf.lowes.com/productdocuments/fc7541a4-d4d8-46ae-8b7e-9497327c5b93/78274049.pdf";
export const rodProductListing =
  "https://www.lowes.com/pd/Project-Source-Closet-Rod-72-in-L-x-1-3125-in-H-White-Metal-Closet-Rod/1000442349";
export const rodFitScope =
  "Verify the delivered flanges, insertion clearance, backing, hole pattern, fasteners and expected load for your actual closet. The panel-face check measures fit and span.";

const vec = (point: V3) => new Vector3(...point);
const scale = (point: Vector3, t: number) => point.clone().multiplyScalar(t);
const inch = (value: number) => formatPreciseInches(value);
const supportStock = (p: Piece) =>
  material(p.material).wood && material(p.material).stockKind === "sheet";

export function closetRods(project: Project) {
  return project.pieces.filter(
    (p) =>
      !p.offcut &&
      (p.material === "closet-rod-72" ||
        p.material === everbiltClosetRod.materialId),
  );
}

type End = RodFitPlan["start"] & { t: number };
type EndCandidate = End & { blocked: boolean };

/** Find actual, perpendicular retained faces along the tube centerline. */
export function rodBay(project: Project, rodId: string) {
  const rod = closetRods(project).find((p) => p.id === rodId);
  if (!rod) throw Error("The selected closet rod is missing or is an offcut.");
  const [, stockLength] = material(rod.material).size;
  const expectedDiameter = material(rod.material).size[0];
  if (
    Math.abs(rod.size[0] - expectedDiameter) > epsilon ||
    Math.abs(rod.size[2] - expectedDiameter) > epsilon
  )
    throw Error("The rod needs its source diameter for this flange pair.");
  const axis = vec(rotate([0, 1, 0], rod.rotation));
  const origin = vec(rod.position);
  const entry = project.ideaBindings
    .flatMap((binding) => binding.entries)
    .find(
      (candidate) =>
        candidate.spec.type === "structure" &&
        candidate.spec.structure.kind === "closet-insert" &&
        project.sections.some(
          (s) =>
            s.pieceIds.includes(rodId) &&
            candidate.sections.some(
              (r) => r.role === "hanging-rods" && r.sectionId === s.id,
            ),
        ),
    );
  const owned =
    entry &&
    new Set(
      project.sections
        .filter((s) =>
          entry.sections.some(
            (r) => r.role === "casework-panels" && r.sectionId === s.id,
          ),
        )
        .flatMap((s) => s.pieceIds),
    );
  const candidates: { start: EndCandidate[]; end: EndCandidate[] } = { start: [], end: [] };
  for (const p of project.pieces) {
    if (p.offcut || !supportStock(p) || (owned && !owned.has(p.id))) continue;
    for (const face of fittedStockFaces(project, p.id)) {
      const normal = vec(face.normalWorld);
      const orientation = normal.dot(axis);
      if (Math.abs(orientation) < 1 - 1e-8) continue;
      const t = vec(face.centerWorld).sub(origin).dot(normal) / orientation;
      if (t * orientation >= -epsilon || Math.abs(t) > 240) continue;
      const position = origin.clone().addScaledVector(axis, t);
      const radius = expectedDiameter / 2;
      if (
        !face.verticesWorld.every((vertex, i) => {
          const edge = vec(
            face.verticesWorld[(i + 1) % face.verticesWorld.length],
          ).sub(vec(vertex));
          const insideDistance =
            edge
              .clone()
              .cross(position.clone().sub(vec(vertex)))
              .dot(normal) / edge.length();
          return insideDistance >= radius - epsilon;
        })
      )
        continue;
      const local = rotate(
        position.sub(vec(p.position)).toArray() as V3,
        inverseRotation(p.rotation),
      );
      const row = {
        pieceId: p.id,
        normalLocal: face.normalLocal,
        pointLocal: local,
        geometryFingerprint: attachmentGeometryFingerprint(p),
        t,
        blocked: rodEndCrossesCut(p, local, face.normalLocal, radius),
      };
      candidates[t < 0 ? "start" : "end"].push(row);
    }
  }
  const first = (ends: EndCandidate[]): End => {
    const [nearest, next] = ends.sort((a, b) => Math.abs(a.t) - Math.abs(b.t));
    if (!nearest || (next && Math.abs(nearest.t - next.t) < epsilon))
      throw Error(
        "The rod needs one clear facing panel at each end. Review its location and any overlapping panels.",
      );
    if (nearest.blocked)
      throw Error(`${partLabel(project, nearest.pieceId)} has a through-cut across the rod end. Move the rod to retained backing or change the panel.`);
    const { blocked: _blocked, ...end } = nearest;
    return end;
  };
  const start = first(candidates.start),
    end = first(candidates.end);
  const span = end.t - start.t;
  if (start.pieceId === end.pieceId || span > 240)
    throw Error(
      "The rod needs two distinct mounting faces within the modeled opening.",
    );
  return { rod, axis, start, end, span, stockLength };
}

const samePoint = (a: V3, b: V3) => vec(a).distanceTo(vec(b)) <= epsilon;
export function sameRodEnd(a: RodFitPlan["start"], b: RodFitPlan["start"]) {
  return (
    a.pieceId === b.pieceId &&
    a.geometryFingerprint === b.geometryFingerprint &&
    samePoint(a.pointLocal, b.pointLocal) &&
    samePoint(a.normalLocal, b.normalLocal)
  );
}
const cutLength = (m: RodFitPlan["measurements"]) =>
  m.measuredSpan - m.startSetback - m.endSetback - m.clearance;

export function saveRodFit(
  project: Project,
  rodId: string,
  input: unknown,
  now = Date.now(),
) {
  const bay = rodBay(project, rodId);
  const measurements = rodFitMeasurementsSchema.parse(input);
  const length = cutLength(measurements);
  if (Date.parse(measurements.measuredAt) > now)
    throw Error("Use the date you took the measurements.");
  if (length <= epsilon || length > bay.stockLength + epsilon)
    throw Error(
      `The measured cut must be positive and fit one ${bay.stockLength}-inch rod. Review the opening, allowances or material.`,
    );
  const { t: _start, ...start } = bay.start,
    { t: _end, ...end } = bay.end;
  const plans = project.rodFitPlans ?? [];
  const existing = plans.find((plan) => plan.rodId === rodId);
  const fit = rodFitSchema.parse({
    rodId,
    ...(bay.rod.material === everbiltClosetRod.materialId
      ? { rodMaterial: bay.rod.material }
      : {}),
    start,
    end,
    modeledSpan: bay.span,
    measurements,
    ...(existing?.socketPlates ? { socketPlates: existing.socketPlates } : {}),
    ...(existing?.intermediateSupports
      ? { intermediateSupports: existing.intermediateSupports }
      : {}),
  });
  if (plans.length >= 100 && !plans.some((plan) => plan.rodId === rodId))
    throw Error("This project has reached its 100-record rod fit limit.");
  return {
    ...project,
    rodFitPlans: [...plans.filter((plan) => plan.rodId !== rodId), fit],
  };
}

export function reviewRodFit(
  project: Project,
  rodId: string,
  now = Date.now(),
) {
  const plan = project.rodFitPlans?.find((p) => p.rodId === rodId);
  let bay: ReturnType<typeof rodBay>;
  try {
    bay = rodBay(project, rodId);
  } catch (error) {
    return {
      plan,
      state: plan ? ("stale" as const) : ("unmeasured" as const),
      bay: null,
      length: null,
      delta: null,
      intermediate: null,
      center: null,
      canApply: false,
      matchesModel: false,
      note:
        error instanceof Error
          ? error.message
          : "The actual mounting faces need review.",
    };
  }
  const m = plan?.measurements;
  const intermediate =
    bay.rod.material === everbiltClosetRod.materialId
      ? null
      : Math.max(
          0,
          Math.ceil(
            (Math.max(bay.span, m?.measuredSpan ?? 0) - epsilon) /
              rodReferenceSpacing,
          ) - 1,
        );
  const base = {
    plan,
    bay,
    intermediate,
    length: null,
    delta: null,
    center: null,
    canApply: false,
    matchesModel: false,
  };
  if (!plan || !m)
    return {
      ...base,
      state: "unmeasured" as const,
      note: "Measure the actual opening and end allowances to calculate a cut.",
    };
  if (
    (plan.rodMaterial ?? "closet-rod-72") !== bay.rod.material ||
    !sameRodEnd(plan.start, bay.start) ||
    !sameRodEnd(plan.end, bay.end) ||
    Math.abs(plan.modeledSpan - bay.span) > epsilon ||
    Date.parse(m.measuredAt) > now
  )
    return {
      ...base,
      state: "stale" as const,
      note: "The rod product, mounting geometry or measurement date changed. Recheck both faces before relying on this fit.",
    };
  const length = cutLength(m);
  if (length <= epsilon || length > bay.stockLength + epsilon)
    return {
      ...base,
      state: "stale" as const,
      note: `The saved dimensions do not fit one ${bay.stockLength}-inch stock rod.`,
    };
  const delta = m.measuredSpan - bay.span;
  const center = (bay.start.t + bay.end.t + m.startSetback - m.endSetback) / 2;
  const alreadyShown =
    Math.abs(length - bay.rod.size[1]) <= epsilon &&
    Math.abs(center) <= epsilon;
  const canApply =
    !alreadyShown &&
    Math.abs(delta) <= rodMeasurementTolerance &&
    !bay.rod.cutStock &&
    Math.abs(center) + length / 2 <= bay.rod.size[1] / 2 + epsilon;
  return {
    ...base,
    state: "measured" as const,
    length,
    center,
    delta,
    canApply,
    matchesModel: alreadyShown && Math.abs(delta) <= rodMeasurementTolerance,
    note:
      Math.abs(delta) > rodMeasurementTolerance
        ? "The measured opening differs from the modeled opening by more than 1/32 in. Align the model before resizing the rod."
        : alreadyShown
          ? "The model matches this fit."
          : canApply
            ? "You can update the rod model to this length."
            : "Review the original stock or recorded cut before changing this rod.",
  };
}

export function applyRodFit(project: Project, rodId: string) {
  const review = reviewRodFit(project, rodId);
  if (
    !review.canApply ||
    review.length == null ||
    review.center == null ||
    !review.bay
  )
    throw Error(
      "Resolve the measured fit and recorded stock before updating this rod.",
    );
  const { axis, rod } = review.bay;
  return {
    ...project,
    pieces: project.pieces.map((p) =>
      p.id === rodId
        ? {
            ...rod,
            size: [rod.size[0], review.length!, rod.size[2]] as V3,
            position: vec(rod.position)
              .add(scale(axis, review.center!))
              .toArray() as V3,
          }
        : p,
    ),
  };
}

export function rodFlangePurchases(project: Project) {
  const needed = (project.rodFitPlans ?? []).filter((plan) => {
    const fit = reviewRodFit(project, plan.rodId);
    return (
      fit.state === "measured" && fit.bay?.rod.material === "closet-rod-72"
    );
  }).length;
  const selected = project.supplies.reduce(
    (sum, s) => sum + (s.productId === rodFlangeProductId ? s.quantity : 0),
    0,
  );
  return { needed, selected, missing: Math.max(0, needed - selected) };
}

export function rodSocketPurchases(project: Project) {
  const needed = closetRods(project).filter(
    (rod) =>
      rod.material === everbiltClosetRod.materialId &&
      rod.size[1] <= everbiltClosetRod.stockSize[1] + epsilon &&
      reviewRodFit(project, rod.id).bay !== null,
  ).length;
  const selected = project.supplies.reduce(
    (sum, supply) =>
      sum +
      (supply.productId === everbiltClosetRod.socketProductId
        ? supply.quantity
        : 0),
    0,
  );
  return { needed, selected, missing: Math.max(0, needed - selected) };
}

export function addMissingRodSockets(project: Project) {
  const { missing } = rodSocketPurchases(project);
  return missing
    ? addSupply(
        project,
        everbiltClosetRod.socketProductId,
        missing,
        "Closet rod end sockets",
        "One open and one closed socket per pair. Dry-fit the delivered rod and review support, backing and attachment.",
      )
    : project;
}

export function addMissingRodFlanges(project: Project) {
  const { missing } = rodFlangePurchases(project);
  return missing
    ? addSupply(
        project,
        rodFlangeProductId,
        missing,
        "Measured closet rod end flanges",
        rodFitScope,
      )
    : project;
}

export function rodBracketPurchases(project: Project) {
  const needed = (project.rodFitPlans ?? []).reduce(
    (sum, plan) =>
      sum +
      (plan.rodMaterial
        ? 0
        : reviewRodSupports(reviewRodFit(project, plan.rodId)).rows.filter(
            ({ state }) => state === "pending" || state === "reach-reviewed",
          ).length),
    0,
  );
  const selected = project.supplies.reduce(
    (sum, supply) =>
      sum + (supply.productId === rodBracketProductId ? supply.quantity : 0),
    0,
  );
  return { needed, selected, missing: Math.max(0, needed - selected) };
}

export function addMissingRodBrackets(project: Project) {
  const { missing } = rodBracketPurchases(project);
  return missing
    ? addSupply(
        project,
        rodBracketProductId,
        missing,
        "Planned intermediate closet rod supports",
        "Verify delivered bracket reach, backing, hole pattern, fasteners and expected load. Fasteners are sold separately.",
      )
    : project;
}

export function everbiltRodBracketPurchases(project: Project) {
  let needed = 0;
  for (const plan of project.rodFitPlans ?? []) {
    if (!plan.intermediateSupports?.some(({ bracketProductId }) => bracketProductId === everbiltRodBracket.productId))
      continue;
    const fit = reviewRodFit(project, plan.rodId);
    if (fit.bay?.rod.material !== everbiltClosetRod.materialId) continue;
    needed += reviewRodSupports(fit).rows.filter(({ support, state }) =>
      support.bracketProductId === everbiltRodBracket.productId && state === "reach-reviewed" &&
      (!support.mounting || reviewRodBracketMount(project, fit, support)?.state === "checked"),
    ).length;
  }
  const selected = project.supplies.reduce(
    (sum, supply) => sum + (supply.productId === everbiltRodBracket.productId ? supply.quantity : 0),
    0,
  );
  return { needed, selected, missing: Math.max(0, needed - selected) };
}

export function addMissingEverbiltRodBrackets(project: Project) {
  const { missing } = everbiltRodBracketPurchases(project);
  return missing && project.retailer === "home-depot"
    ? addSupply(project, everbiltRodBracket.productId, missing, "Measured Everbilt closet rod supports", everbiltRodBracket.scope)
    : project;
}

export function rodFitGuideLines(project: Project) {
  const ids = [
    ...new Set([
      ...closetRods(project).map((p) => p.id),
      ...(project.rodFitPlans ?? []).map((plan) => plan.rodId),
    ]),
  ];
  if (!ids.length) return [];
  const lines = ids.flatMap((id) => {
    const fit = reviewRodFit(project, id);
    const { bay, plan, length, delta, state, note } = fit;
    const supports = reviewRodSupports(fit);
    const heading = partLabel(project, id);
    return [
      bay
        ? `${heading} · ${partLabel(project, bay.start.pieceId)} to ${partLabel(project, bay.end.pieceId)} · ${inch(bay.span)} modeled opening.`
        : heading,
      state === "measured" && plan && length !== null && delta !== null
        ? `Measured ${inch(plan.measurements.measuredSpan)} opening. ${inch(plan.measurements.startSetback)} start + ${inch(plan.measurements.endSetback)} end + ${inch(plan.measurements.clearance)} total clearance. Cut length ${inch(length)}. Closed flange at the rod ${plan.measurements.closedEnd}. Measured ${plan.measurements.measuredAt.slice(0, 10)} (${plan.measurements.basis.replace(/[\r\n]/g, " ")}).`
        : state === "stale"
          ? "Saved measurements need review."
          : "Awaiting actual measurements.",
      ...(supports.longest === null
        ? []
        : [
            supports.spacingReference === null
              ? `Longest planned support gap ${inch(supports.longest)}. Confirm bracket spacing and backing for the delivered Everbilt system.`
              : `Longest planned support gap ${inch(supports.longest)} · ${supports.exceedsReference ? "exceeds" : "within"} the ${supports.spacingReference} in spacing reference.`,
          ]),
      ...(bay?.rod.material === everbiltClosetRod.materialId
        ? [
            "Everbilt 320V cuts use the delivered rod measurements. The listing names a hacksaw or pole cutter. Check the resulting edge and dry-fit the sockets before mounting.",
          ]
        : []),
      ...supports.rows.map(({ support, state }) =>
        state === "stale"
          ? "Intermediate support · Recheck the saved position and take fresh site measurements."
          : `Intermediate support · ${inch(support.fromStart)} from start${support.bracketProductId === everbiltRodBracket.productId ? " · Everbilt 14317" : ""} · ${rodSupportStateLabel[state]} · wall to rod center ${support.wallToRod === null ? "pending" : inch(support.wallToRod)} · bracket seat reach ${support.bracketReach === null ? "pending" : inch(support.bracketReach)} · backing notes: ${support.backing.replace(/[\r\n]/g, " ")}.`,
      ),
      ...rodSocketPlateGuideLines(project, fit),
      ...rodBracketMountGuideLines(project, fit),
      note,
    ];
  });
  const { needed, selected } = rodFlangePurchases(project);
  const brackets = rodBracketPurchases(project);
  const everbiltBrackets = everbiltRodBracketPurchases(project);
  const sockets = rodSocketPurchases(project);
  return [
    ...lines,
    ...(project.rodFitPlans?.some((plan) => plan.socketPlates) ? [rodPlateScope] : []),
    ...(needed ||
    selected ||
    closetRods(project).some((rod) => rod.material === "closet-rod-72")
      ? [
          `23723PHSLG flange pairs · ${needed} from current measured rods · ${selected} selected. Each pair has one closed and one open flange.`,
        ]
      : []),
    ...(sockets.needed || sockets.selected
      ? [
          `Everbilt 311V socket pairs · ${sockets.needed} for modeled rods · ${sockets.selected} selected. Each pair has one open and one closed socket. Dry-fit the delivered pieces and confirm attachment and intermediate support.`,
        ]
      : []),
    ...(brackets.needed || brackets.selected
      ? [
          `27587PHLLG intermediate brackets · Planned positions ${brackets.needed} · Selected ${brackets.selected}. Verify backing and fasteners for each position; fasteners sold separately.`,
        ]
      : []),
    ...(everbiltBrackets.needed || everbiltBrackets.selected
      ? [`Everbilt 14317 intermediate brackets · Measured positions ${everbiltBrackets.needed} · Selected ${everbiltBrackets.selected}. ${everbiltRodBracket.scope}`]
      : []),
  ];
}

export function rodFitMarkdown(project: Project) {
  const lines = rodFitGuideLines(project);
  const rods = closetRods(project);
  return lines.length
    ? [
        "",
        "",
        "## Closet rod fits",
        "",
        rodFitScope,
        "",
        ...lines.map(
          (line) => "- " + line.replace(/[\\\x60*_{}\[\]<>|]/g, "\\$&"),
        ),
        "",
        ...(rods.some((rod) => rod.material === "closet-rod-72")
          ? [
              `[Rod spacing reference](${rodProductListing}) · [Flange-family instructions](${rodFlangeInstructions}) · [Candidate intermediate support](${rodIntermediateReference})`,
            ]
          : []),
        ...(rods.some((rod) => rod.material === everbiltClosetRod.materialId)
          ? [
              `[Everbilt rod listing](${everbiltClosetRod.listing}) · [Everbilt end sockets](${everbiltClosetRod.socketListing})`,
            ]
          : []),
        ...(project.rodFitPlans?.some((plan) => plan.intermediateSupports?.some(
          ({ bracketProductId }) => bracketProductId === everbiltRodBracket.productId,
        )) ? [`[Everbilt 14317 bracket listing](${everbiltRodBracket.listing})`] : []),
      ].join("\n")
    : "";
}
