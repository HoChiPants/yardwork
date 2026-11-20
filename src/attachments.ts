import { openingAxes, openingHalfSpans, pieceThroughOpenings } from "./throughOpenings";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import {
  attachmentPlanSchema,
  shelfPinLayoutSchema,
  shelfPinMeasurementsSchema,
  emptyShelfPinMeasurements,
  shelfPinProductId,
  nominalShelfPinBore,
  kregShelfPinPitch,
  type AttachmentPlan,
  type AttachmentPartRef,
  type ShelfPinPoint,
  type ShelfPinLayout,
  type ShelfPinMeasurements,
} from "./attachmentSchema";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { findRetailerProduct } from "./retailerCatalog";
import { reconcileIdeaBindings } from "./ideaBindingState";
import { angleShelfPinReference, shelfPinProducts, type ShelfPinProductId } from "./shelfPinReference";
export type AttachmentState =
  "stale" | "conflict" | "needs-measurements" | "geometry-checked";
export type AttachmentIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  pointIds: string[];
  pieceIds: string[];
};
export type ReviewedSupportPoint = {
  point: ShelfPinPoint;
  bearingTargetWorld: V3;
  shelfAnchorWorld: V3;
  holeCenterWorld: V3 | null;
  holeCenterLocal: V3 | null;
  drillDirectionWorld: V3;
  rowIndex: number | null;
  state: AttachmentState;
};
export type AttachmentReview = {
  plan: AttachmentPlan;
  state: AttachmentState;
  stale: boolean;
  issues: AttachmentIssue[];
  points: ReviewedSupportPoint[];
  activePinCount: number;
};
export type ShelfSupportEntry = {
  entryId: string;
  bindingId: string;
  title: string;
  kind: "casework-shelves" | "closet-insert";
  requiresRoleMapping: boolean;
  shelves: { role: string; sectionId: string; pieceId: string; name: string }[];
};
export type ShelfPinPlanConfig = {
  name?: string;
  productId?: ShelfPinProductId;
  shelfRoles: string[];
  layout: ShelfPinLayout;
  measurements?: ShelfPinMeasurements;
  id?: string;
  createdAt?: string;
};
const EPS = 1e-6,
  RADIUS = nominalShelfPinBore / 2;
const add = (a: V3, b: V3): V3 => a.map((v, i) => v + b[i]) as V3;
const subtract = (a: V3, b: V3): V3 => a.map((v, i) => v - b[i]) as V3;
const scale = (a: V3, s: number): V3 => a.map((v) => v * s) as V3;
const dot = (a: V3, b: V3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const distance = (a: V3, b: V3) => Math.hypot(...subtract(a, b));
type Pose = { position: V3; rotation: V3 };
const world = (p: V3, pose: Pose): V3 =>
  add(rotate(p, pose.rotation), pose.position);
const local = (p: V3, pose: Pose): V3 =>
  rotate(subtract(p, pose.position), inverseRotation(pose.rotation));
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : typeof item === "number"
        ? Number(item.toFixed(8))
        : item,
  );
}
function knownDepth(measurements: ShelfPinMeasurements) {
  const values = [
    measurements.deepestDrillTipDepth,
    measurements.fullDiameterBoreDepth,
    measurements.pinInsertionDepth,
  ].filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}
function geometryFingerprint(piece: Piece) {
  let hash = 14695981039346656037n;
  for (const c of canonical({
    size: piece.size,
    material: piece.material,
    cutPlanes: piece.cutPlanes,
    ...(pieceThroughOpenings(piece).length ? { throughCuts: pieceThroughOpenings(piece) } : {}),
    cutStock: piece.cutStock,
    stockLengthAxis: piece.stockLengthAxis,
  })) {
    hash ^= BigInt(c.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `attachment-geometry-v1-${hash.toString(16)}`;
}
/** Physical shape/provenance guard; poses and semantic annotations do not change this fingerprint. */
export function attachmentGeometryFingerprint(piece: Piece) {
  return geometryFingerprint(piece);
}
function entryOwner(project: Project, entryId: string) {
  for (const binding of project.ideaBindings) {
    const entry = binding.entries.find((e) => e.id === entryId);
    if (entry) return { binding, entry };
  }
  return null;
}
function ownedParts(project: Project, entryId: string) {
  const entry = entryOwner(project, entryId)?.entry;
  return (entry?.sections ?? []).flatMap((mapping) => {
    const section = project.sections.find((s) => s.id === mapping.sectionId);
    return section
      ? section.pieceIds.flatMap((id) => {
          const piece = project.pieces.find((p) => p.id === id && !p.offcut);
          return piece ? [{ piece, section }] : [];
        })
      : [];
  });
}
function closetRoles(project: Project, entryId: string) {
  const entry = entryOwner(project, entryId)?.entry;
  return entry?.spec.type === "structure" &&
    entry.spec.structure.kind === "closet-insert"
    ? [
        "tower-left",
        "tower-right",
        ...Array.from(
          { length: entry.spec.structure.parameters.shelfCount },
          (_, i) => `tower-shelf-${i + 1}`,
        ),
      ]
    : [];
}
function supportKind(project: Project, entryId: string) {
  const spec = entryOwner(project, entryId)?.entry.spec;
  return spec?.type === "structure" &&
    (spec.structure.kind === "casework-shelves" ||
      spec.structure.kind === "closet-insert")
    ? spec.structure.kind
    : null;
}
function rolePart(project: Project, entryId: string, role: string) {
  if (supportKind(project, entryId) === "closet-insert") {
    if (!closetRoles(project, entryId).includes(role)) return null;
    const found = ownedParts(project, entryId).filter(
      ({ piece }) => piece.designRole === role,
    );
    return found.length === 1 ? found[0] : null;
  }
  const owner = entryOwner(project, entryId),
    mapping = owner?.entry.sections.find((m) => m.role === role),
    section = project.sections.find((s) => s.id === mapping?.sectionId),
    pieces =
      section?.pieceIds
        .map((id) => project.pieces.find((p) => p.id === id))
        .filter((p): p is Piece => !!p && !p.offcut) ?? [];
  return section && pieces.length === 1 ? { piece: pieces[0], section } : null;
}
export type ClosetSupportRoleOption = {
  role: string;
  label: string;
  assignedPieceId: string | null;
  suggestedPieceId: string | null;
};
export function closetSupportRoleOptions(
  project: Project,
  entryId: string,
): ClosetSupportRoleOption[] {
  const owner = entryOwner(project, entryId),
    spec = owner?.entry.spec;
  if (spec?.type !== "structure" || spec.structure.kind !== "closet-insert")
    return [];
  const params = spec.structure.parameters,
    stockId = spec.structure.selections.caseworkPanels?.materialId ?? "plywood",
    stock = material(stockId),
    t = Math.min(...stock.size),
    pose = {
      position: owner!.entry.pose.origin,
      rotation: owner!.entry.pose.rotation,
    },
    candidates = ownedParts(project, entryId);
  return closetRoles(project, entryId).map((role) => {
    const index = Number(role.match(/tower-shelf-(\d+)/)?.[1] ?? 0),
      size: V3 = index
        ? [params.towerWidth, t, params.depth - 0.5]
        : [t, params.height - 2 * t, params.depth],
      position: V3 = index
        ? [
            0,
            t + ((params.height - 2 * t) * index) / (params.shelfCount + 1),
            0.25,
          ]
        : [
            role === "tower-left"
              ? -params.towerWidth / 2 - t / 2
              : params.towerWidth / 2 + t / 2,
            params.height / 2,
            0,
          ],
      expected = world(position, pose);
    const matches =
      stock.wood && stock.stockKind === "sheet"
        ? candidates.filter(
            ({ piece }) =>
              piece.material === stockId &&
              piece.cutPlanes.length === 0 &&
              pieceThroughOpenings(piece).length === 0 &&
              piece.cutStock === null &&
              piece.stockLengthAxis === null &&
              piece.size.every((v, i) => Math.abs(v - size[i]) <= EPS) &&
              distance(piece.position, expected) <= EPS &&
              ([0, 1, 2] as const).every((axis) => {
                const v: V3 = [0, 0, 0];
                v[axis] = 1;
                return (
                  distance(
                    rotate(v, piece.rotation),
                    rotate(v, pose.rotation),
                  ) <= EPS
                );
              }),
          )
        : [];
    return {
      role,
      label: index
        ? `Tower shelf ${index}`
        : role === "tower-left"
          ? "Left tower divider"
          : "Right tower divider",
      assignedPieceId: rolePart(project, entryId, role)?.piece.id ?? null,
      suggestedPieceId: matches.length === 1 ? matches[0].piece.id : null,
    };
  });
}
export function assignClosetSupportRoles(
  project: Project,
  entryId: string,
  assignments: Record<string, string>,
): Project {
  if (supportKind(project, entryId) !== "closet-insert")
    throw Error(
      "Select a saved closet insert before assigning its support roles.",
    );
  const required = closetRoles(project, entryId),
    owned = ownedParts(project, entryId),
    chosen = new Map<string, string>();
  if (Object.keys(assignments).some((role) => !required.includes(role)))
    throw Error(
      "Assign only the current tower dividers and tower shelf roles.",
    );
  for (const role of required) {
    const id = Object.prototype.hasOwnProperty.call(assignments, role)
      ? assignments[role]
      : rolePart(project, entryId, role)?.piece.id;
    if (!id)
      throw Error(
        `Choose an actual panel for ${role}; every current tower support role needs explicit assignment.`,
      );
    const found = owned.find(({ piece }) => piece.id === id);
    if (!found)
      throw Error(
        "Role assignments must use current, active parts owned by this closet entry.",
      );
    const stock = material(found.piece.material);
    if (!stock.wood || stock.stockKind !== "sheet")
      throw Error(
        "Closet support roles require actual wood sheet panels; no substitute is inferred.",
      );
    chosen.set(role, id);
  }
  if (new Set(chosen.values()).size !== chosen.size)
    throw Error("Use a different actual panel for every closet support role.");
  const ownedIds = new Set(owned.map(({ piece }) => piece.id)),
    reverse = new Map([...chosen].map(([role, id]) => [id, role]));
  const pieces = project.pieces.map((piece) => {
    if (!ownedIds.has(piece.id)) return piece;
    const role = reverse.get(piece.id);
    if (role) return { ...piece, designRole: role };
    if (piece.designRole && required.includes(piece.designRole)) {
      const { designRole: _old, ...rest } = piece;
      return rest;
    }
    return piece;
  });
  return projectSchema.parse(
    reconcileIdeaBindings({ ...project, pieces, guideFingerprint: null }),
  );
}
function reference(
  piece: Piece,
  sectionId: string,
  role: string,
): AttachmentPartRef {
  return {
    pieceId: piece.id,
    sectionId,
    role,
    name: piece.name,
    geometryFingerprint: geometryFingerprint(piece),
    baselinePose: {
      position: [...piece.position],
      rotation: [...piece.rotation],
    },
  };
}
export function shelfSupportEntries(project: Project): ShelfSupportEntry[] {
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry, index) => {
      const kind = supportKind(project, entry.id);
      if (!kind) return [];
      const required =
        kind === "closet-insert"
          ? closetRoles(project, entry.id)
          : entry.sections
              .filter((m) => /^shelf-[1-6]$/.test(m.role))
              .map((m) => m.role);
      return [
        {
          entryId: entry.id,
          bindingId: binding.id,
          title: `${binding.title}${binding.entries.length > 1 ? ` · ${kind === "closet-insert" ? "closet" : "bookcase"} ${index + 1}` : ""}`,
          kind,
          requiresRoleMapping:
            kind === "closet-insert" &&
            required.some((role) => !rolePart(project, entry.id, role)),
          shelves: required
            .filter((role) => /^(?:tower-)?shelf-[1-6]$/.test(role))
            .flatMap((role) => {
              const found = rolePart(project, entry.id, role);
              return found
                ? [
                    {
                      role,
                      sectionId: found.section.id,
                      pieceId: found.piece.id,
                      name: found.piece.name,
                    },
                  ]
                : [];
            }),
        },
      ];
    }),
  );
}
export function makeShelfPinPlan(
  project: Project,
  entryId: string,
  config: ShelfPinPlanConfig,
): AttachmentPlan {
  const kind = supportKind(project, entryId);
  if (!kind)
    throw Error(
      "Select an existing whole casework bookcase or closet insert to plan shelf pins.",
    );
  if (
    kind === "closet-insert" &&
    closetRoles(project, entryId).some(
      (role) => !rolePart(project, entryId, role),
    )
  )
    throw Error(
      "Review and explicitly assign every current closet tower support role before planning pins.",
    );
  const layout = shelfPinLayoutSchema.parse(config.layout),
    roles = [...config.shelfRoles];
  if (
    !roles.length ||
    roles.length > 6 ||
    new Set(roles).size !== roles.length ||
    roles.some(
      (r) =>
        !(
          kind === "closet-insert" ? /^tower-shelf-[1-6]$/ : /^shelf-[1-6]$/
        ).test(r),
    )
  )
    throw Error("Select one to six distinct existing adjustable shelf roles.");
  const mounts = {
    left: rolePart(
      project,
      entryId,
      kind === "closet-insert" ? "tower-left" : "side-left",
    ),
    right: rolePart(
      project,
      entryId,
      kind === "closet-insert" ? "tower-right" : "side-right",
    ),
  };
  if (!mounts.left || !mounts.right)
    throw Error(
      "Both actual side panels must exist before creating or refreshing this support plan.",
    );
  const old = config.id
    ? project.attachmentPlans.find((p) => p.id === config.id)
    : undefined;
  if (old && old.entryId !== entryId)
    throw Error(
      "Refresh the existing support plan on its original bookcase, or create a separate plan.",
    );
  const productId = config.productId ?? old?.productId ?? shelfPinProductId;
  const measurements = shelfPinMeasurementsSchema.parse(
    old && old.productId !== productId
      ? emptyShelfPinMeasurements()
      : config.measurements ?? emptyShelfPinMeasurements(),
  );
  const points: ShelfPinPoint[] = [];
  for (const role of roles) {
    const found = rolePart(project, entryId, role);
    if (!found)
      throw Error(
        `The actual ${role} panel is missing or no longer has a single panel identity.`,
      );
    for (const side of ["left", "right"] as const) {
      const mount = mounts[side]!,
        sign = side === "left" ? 1 : -1;
      for (const row of ["front", "rear"] as const) {
        const z =
            row === "front"
              ? mount.piece.size[2] / 2 - layout.frontInset
              : -mount.piece.size[2] / 2 + layout.rearInset,
          rowWorld = world(
            [(sign * mount.piece.size[0]) / 2, 0, z],
            mount.piece,
          ),
          shelfZ = local(rowWorld, found.piece)[2],
          anchor: V3 = [
            side === "left"
              ? -found.piece.size[0] / 2
              : found.piece.size[0] / 2,
            -found.piece.size[1] / 2,
            shelfZ,
          ],
          target = local(world(anchor, found.piece), mount.piece);
        target[0] = (sign * mount.piece.size[0]) / 2;
        target[2] = z;
        points.push({
          id:
            old?.points.find(
              (p) => p.shelf.role === role && p.side === side && p.row === row,
            )?.id ?? uid(),
          shelf: reference(found.piece, found.section.id, role),
          mount: reference(
            mount.piece,
            mount.section.id,
            `${kind === "closet-insert" ? "tower" : "side"}-${side}`,
          ),
          side,
          row,
          mountFace: { axis: 0, sign },
          bearingTargetLocal: target,
          shelfAnchorLocal: anchor,
        });
      }
    }
  }
  const at = new Date().toISOString();
  return attachmentPlanSchema.parse({
    id: config.id ?? uid(),
    kind: "shelf-pins",
    name: config.name?.trim() || "Planned shelf-pin supports",
    entryId,
    productId,
    createdAt: config.createdAt ?? old?.createdAt ?? at,
    updatedAt: at,
    shelfRoles: roles,
    layout,
    measurements,
    points,
  });
}
export function saveShelfPinPlan(
  project: Project,
  raw: AttachmentPlan,
): Project {
  let plan = attachmentPlanSchema.parse(raw);
  const existing = project.attachmentPlans.find((p) => p.id === plan.id);
  if (existing && existing.entryId !== plan.entryId)
    throw Error(
      "An existing support plan cannot be reassigned silently to another bookcase.",
    );
  if (existing && existing.productId !== plan.productId)
    plan = { ...plan, measurements: emptyShelfPinMeasurements() };
  const plans = existing
    ? project.attachmentPlans.map((p) => (p.id === plan.id ? plan : p))
    : [...project.attachmentPlans, plan];
  return projectSchema.parse({
    ...project,
    attachmentPlans: plans,
    guideFingerprint: null,
  });
}
export function removeAttachmentPlan(
  project: Project,
  planId: string,
): Project {
  if (!project.attachmentPlans.some((p) => p.id === planId)) return project;
  return projectSchema.parse({
    ...project,
    attachmentPlans: project.attachmentPlans.filter((p) => p.id !== planId),
    guideFingerprint: null,
  });
}
function inside(point: V3, piece: Piece) {
  return (
    point.every((v, i) => Math.abs(v) <= piece.size[i] / 2 + EPS) &&
    piece.cutPlanes.every(
      (plane) => dot(plane.normal, point) <= plane.constant + EPS,
    ) &&
    !pieceThroughOpenings(piece).some((opening) => {
      const [u, v] = openingAxes(opening.axis);
      const x = point[u] - opening.center[0];
      const y = point[v] - opening.center[1];
      if ("diameter" in opening) return Math.hypot(x, y) < opening.diameter / 2 - EPS;
      const [w, h] = openingHalfSpans(opening);
      return Math.abs(x) < w - EPS && Math.abs(y) < h - EPS;
    })
  );
}
function sameRelativePose(point: ShelfPinPoint, shelf: Piece, mount: Piece) {
  const delta = composeRotation(
      mount.rotation,
      inverseRotation(point.mount.baselinePose.rotation),
    ),
    expected = add(
      rotate(
        subtract(
          point.shelf.baselinePose.position,
          point.mount.baselinePose.position,
        ),
        delta,
      ),
      mount.position,
    ),
    expectedRotation = composeRotation(
      delta,
      point.shelf.baselinePose.rotation,
    );
  return (
    distance(expected, shelf.position) <= EPS &&
    ([0, 1, 2] as const).every((axis) => {
      const direction: V3 = [0, 0, 0];
      direction[axis] = 1;
      return (
        distance(
          rotate(direction, expectedRotation),
          rotate(direction, shelf.rotation),
        ) <= EPS
      );
    })
  );
}
function issuesForPlan(
  project: Project,
  plan: AttachmentPlan,
): AttachmentReview {
  const issues: AttachmentIssue[] = [],
    points: ReviewedSupportPoint[] = [];
  let stale = false;
  const issue = (
    code: string,
    severity: "error" | "review",
    message: string,
    pointIds: string[] = [],
    pieceIds: string[] = [],
  ) => {
    const key = `${code}:${pointIds.join()}:${pieceIds.join()}`;
    if (
      !issues.some(
        (i) => `${i.code}:${i.pointIds.join()}:${i.pieceIds.join()}` === key,
      )
    )
      issues.push({ code, severity, message, pointIds, pieceIds });
  };
  const kind = supportKind(project, plan.entryId);
  if (!kind) {
    stale = true;
    issue(
      "stale-entry",
      "error",
      "The original whole casework entry is missing or changed. Refresh explicitly on the intended actual panels.",
    );
  }
  const product = findRetailerProduct(plan.productId);
  if (
    product?.status !== "reviewed-specs" ||
    product.manufacturerPartNumber !== shelfPinProducts[plan.productId].model
  )
    issue(
      "product-unreviewed",
      "error",
      "The planned nominal 5 mm support product no longer has the expected reviewed source identity.",
    );
  if (
    new Set(plan.shelfRoles).size !== plan.shelfRoles.length ||
    plan.points.length !== plan.shelfRoles.length * 4
  )
    issue(
      "point-schedule",
      "error",
      "Each selected shelf needs exactly four distinct left/right front/rear bearing intentions.",
    );
  for (const role of plan.shelfRoles) {
    const members = plan.points.filter((p) => p.shelf.role === role),
      keys = new Set(members.map((p) => `${p.side}:${p.row}`));
    if (members.length !== 4 || keys.size !== 4)
      issue(
        "point-schedule",
        "error",
        `${role} must contain one left/right, front/rear support point.`,
        members.map((p) => p.id),
      );
  }
  const measure = plan.measurements;
  const angleReference = angleShelfPinReference(plan.productId);
  const needsFitTest = angleReference && !measure.fitTestConfirmed;
  if (needsFitTest)
    issue("pin-test-bore", "review", angleReference.fitNote);
  for (const key of [
    "pinInsertionDepth",
    "bearingReach",
    "bearingOffset",
    "fullDiameterBoreDepth",
    "deepestDrillTipDepth",
  ] as const)
    if (measure[key] === null)
      issue(
        `measurement-${key}`,
        "review",
        `Record the actual ${key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)}; no value is inferred from the selected product or tool.`,
      );
  if (
    Object.values(measure).some((v) => typeof v === "number") &&
    (!measure.basis.trim() || !measure.measuredAt)
  )
    issue(
      "measurement-basis",
      "review",
      "Recorded dimensions need a user measurement basis and date.",
    );
  if (measure.measuredAt && Date.parse(measure.measuredAt) > Date.now())
    issue(
      "measurement-date",
      "review",
      "The measurement date is in the future; check its provenance before using these dimensions.",
    );
  if (
    measure.pinInsertionDepth !== null &&
    measure.fullDiameterBoreDepth !== null &&
    measure.fullDiameterBoreDepth + EPS < measure.pinInsertionDepth
  )
    issue(
      "insertion-depth",
      "error",
      "Full-diameter bore depth is less than the measured pin insertion depth.",
    );
  if (
    measure.fullDiameterBoreDepth !== null &&
    measure.deepestDrillTipDepth !== null &&
    measure.deepestDrillTipDepth + EPS < measure.fullDiameterBoreDepth
  )
    issue(
      "drill-tip-depth",
      "error",
      "Deepest drill-tip penetration cannot be less than the full-diameter bore depth.",
    );
  if (plan.layout.system === "kreg-32mm" && plan.layout.datumHeight === null)
    issue(
      "row-datum",
      "review",
      "Record the first hole-center datum from the side-panel bottom edge before checking the nominal 32 mm rows.",
    );
  for (const point of plan.points) {
    const shelf = project.pieces.find(
        (p) => p.id === point.shelf.pieceId && !p.offcut,
      ),
      mount = project.pieces.find(
        (p) => p.id === point.mount.pieceId && !p.offcut,
      ),
      shelfPose = shelf ?? point.shelf.baselinePose,
      mountPose = mount ?? point.mount.baselinePose,
      worldTarget = world(point.bearingTargetLocal, mountPose),
      worldAnchor = world(point.shelfAnchorLocal, shelfPose),
      faceNormal: V3 = [0, 0, 0];
    faceNormal[point.mountFace.axis] = point.mountFace.sign;
    const normal = rotate(faceNormal, mountPose.rotation),
      hole =
        measure.bearingOffset === null || needsFitTest
          ? null
          : subtract(point.bearingTargetLocal, [0, measure.bearingOffset, 0]),
      reviewed: ReviewedSupportPoint = {
        point,
        bearingTargetWorld: worldTarget,
        shelfAnchorWorld: worldAnchor,
        holeCenterLocal: hole,
        holeCenterWorld: hole ? world(hole, mountPose) : null,
        drillDirectionWorld: scale(normal, -1),
        rowIndex: null,
        state: "needs-measurements",
      };
    points.push(reviewed);
    for (const [ref, actual] of [
      [point.shelf, shelf],
      [point.mount, mount],
    ] as const) {
      const resolved = rolePart(project, plan.entryId, ref.role),
        section = project.sections.find((s) => s.id === ref.sectionId);
      if (
        !actual ||
        resolved?.section.id !== ref.sectionId ||
        resolved?.piece.id !== ref.pieceId ||
        !section?.pieceIds.includes(ref.pieceId)
      ) {
        stale = true;
        issue(
          "stale-reference",
          "error",
          `${ref.name} is missing, replaced, detached or no longer belongs to its original role. No replacement is inferred.`,
          [point.id],
          [ref.pieceId],
        );
      } else if (geometryFingerprint(actual) !== ref.geometryFingerprint) {
        stale = true;
        issue(
          "stale-geometry",
          "error",
          `${ref.name} dimensions, material, cuts, cut-source lineage or stock direction changed. Refresh this plan explicitly.`,
          [point.id],
          [ref.pieceId],
        );
      }
    }
    if (!shelf || !mount) continue;
    for (const [piece, thicknessAxis, label] of [
      [mount, 0, "side mounting panel"],
      [shelf, 1, "shelf panel"],
    ] as const) {
      const stock = material(piece.material),
        sourceThickness = Math.min(...stock.size);
      if (!stock.wood || stock.stockKind !== "sheet")
        issue(
          "unsupported-panel-material",
          "error",
          `The actual ${label} is not wood sheet stock. This shelf-pin plan does not qualify a wood-jig bore or bearing geometry in metal, other materials or linear stock.`,
          [],
          [piece.id],
        );
      if (Math.abs(piece.size[thicknessAxis] - sourceThickness) > EPS)
        issue(
          "panel-source-thickness",
          "error",
          `The actual ${label}'s local ${["X", "Y", "Z"][thicknessAxis]} thickness differs from its selected source model. Select matching stock geometry or record a supported physical variant; numerical equality is not a manufacturing-tolerance or load approval.`,
          [],
          [piece.id],
        );
      if (piece.stockLengthAxis === thicknessAxis)
        issue(
          "panel-thickness-axis",
          "error",
          `The actual ${label} labels its thickness axis as the stock length. Review the source orientation before planning these holes.`,
          [],
          [piece.id],
        );
    }
    if (!sameRelativePose(point, shelf, mount)) {
      stale = true;
      issue(
        "stale-relative-pose",
        "error",
        "The shelf or side panel moved independently of the saved support layout. Refresh after checking the actual relative positions.",
        [point.id],
        [shelf.id, mount.id],
      );
    }
    if (
      !plan.shelfRoles.includes(point.shelf.role) ||
      point.mount.role !==
        `${kind === "closet-insert" ? "tower" : "side"}-${point.side}` ||
      point.mountFace.axis !== 0 ||
      point.mountFace.sign !== (point.side === "left" ? 1 : -1)
    )
      issue(
        "mount-face",
        "error",
        "The support is not assigned to the intended side panel's inward local X face.",
        [point.id],
        [mount.id],
      );
    const expectedFace =
      (point.mountFace.sign * mount.size[point.mountFace.axis]) / 2;
    if (
      Math.abs(point.bearingTargetLocal[point.mountFace.axis] - expectedFace) >
      EPS
    )
      issue(
        "mount-face-position",
        "error",
        "The bearing intent is not on the actual selected mounting face.",
        [point.id],
        [mount.id],
      );
    if (!inside(point.bearingTargetLocal, mount))
      issue(
        "mount-profile",
        "error",
        "The bearing intent lies outside the side panel or within a removed cut/profile region.",
        [point.id],
        [mount.id],
      );
    const anchor = point.shelfAnchorLocal;
    if (
      Math.abs(
        anchor[0] -
          (point.side === "left" ? -shelf.size[0] / 2 : shelf.size[0] / 2),
      ) > EPS ||
      Math.abs(anchor[1] + shelf.size[1] / 2) > EPS ||
      Math.abs(anchor[2]) > shelf.size[2] / 2 + EPS ||
      !inside(anchor, shelf)
    )
      issue(
        "shelf-footprint",
        "error",
        "The planned bearing anchor is not on the retained shelf underside at the intended side/row location.",
        [point.id],
        [shelf.id],
      );
    if (plan.layout.frontInset + plan.layout.rearInset >= mount.size[2] - EPS)
      issue(
        "row-order",
        "error",
        "Front and rear offsets leave no ordered pair of distinct support rows within the side-panel depth.",
        [point.id],
        [mount.id],
      );
    const desiredZ =
      point.row === "front"
        ? mount.size[2] / 2 - plan.layout.frontInset
        : -mount.size[2] / 2 + plan.layout.rearInset;
    if (Math.abs(desiredZ - point.bearingTargetLocal[2]) > EPS)
      issue(
        "row-inset",
        "error",
        "The stored point does not match its explicit side-panel front/rear offset.",
        [point.id],
        [mount.id],
      );
    const shelfUp = rotate([0, 1, 0], shelf.rotation),
      mountUp = rotate([0, 1, 0], mount.rotation),
      expectedInward = rotate(
        [point.side === "left" ? 1 : -1, 0, 0],
        shelf.rotation,
      );
    if (
      dot(shelfUp, mountUp) < 1 - EPS ||
      dot(expectedInward, normal) < 1 - EPS
    )
      issue(
        "support-axis",
        "error",
        "Side-face and shelf underside directions are not aligned for this pin-bearing layout.",
        [point.id],
        [shelf.id, mount.id],
      );
    const delta = subtract(worldAnchor, worldTarget),
      gap = dot(delta, normal),
      tangent = subtract(delta, scale(normal, gap));
    if (Math.hypot(...tangent) > EPS)
      issue(
        "support-height",
        "error",
        "The side-panel bearing point and shelf underside do not share the intended height and row.",
        [point.id],
        [shelf.id, mount.id],
      );
    if (gap < -EPS)
      issue(
        "shelf-penetration",
        "error",
        "The shelf extends into the selected side panel at this bearing point.",
        [point.id],
        [shelf.id, mount.id],
      );
    if (measure.bearingReach !== null) {
      if (measure.bearingReach <= gap + EPS)
        issue(
          "bearing-reach",
          "error",
          "Measured bearing reach does not extend beyond the actual shelf-to-panel gap into the shelf footprint.",
          [point.id],
          [shelf.id, mount.id],
        );
      else {
        const tip = local(
          add(worldTarget, scale(normal, measure.bearingReach)),
          shelf,
        );
        if (!inside(tip, shelf) || Math.abs(tip[1] + shelf.size[1] / 2) > EPS)
          issue(
            "bearing-profile",
            "error",
            "The measured bearing reach extends outside the retained shelf underside or into a removed profile region.",
            [point.id],
            [shelf.id],
          );
      }
    }
    const depth = knownDepth(measure);
    if (depth !== null && depth >= mount.size[point.mountFace.axis] - EPS)
      issue(
        "panel-breakthrough",
        "error",
        "The measured insertion/drilling envelope reaches or passes through the actual side-panel thickness.",
        [point.id],
        [mount.id],
      );
    if (hole) {
      for (const axis of [0, 1, 2])
        if (
          axis !== point.mountFace.axis &&
          Math.abs(hole[axis]) + RADIUS >= mount.size[axis] / 2 - EPS
        )
          issue(
            "hole-edge",
            "error",
            "The nominal 5 mm bore envelope reaches a stock edge; revise the row/datum or measured offset.",
            [point.id],
            [mount.id],
          );
      const axisLocal = scale(faceNormal, -1),
        end = add(hole, scale(axisLocal, depth ?? 0));
      for (const plane of mount.cutPlanes) {
        const radial =
          RADIUS *
          Math.sqrt(Math.max(0, 1 - dot(plane.normal, axisLocal) ** 2));
        if (
          Math.max(dot(plane.normal, hole), dot(plane.normal, end)) + radial >
          plane.constant + EPS
        )
          issue(
            "hole-profile",
            "error",
            "The bore/drill envelope intersects a removed profile region in the actual mounting panel.",
            [point.id],
            [mount.id],
          );
      }
      if (mount.rectangularOpenings?.some((cut) => {
        const half = openingHalfSpans(cut);
        return openingAxes(cut.axis).every((axis, i) => {
          const radius = RADIUS * Math.sqrt(Math.max(0, 1 - axisLocal[axis] ** 2));
          return Math.max(hole[axis], end[axis]) + radius >= cut.center[i] - half[i] - EPS &&
            Math.min(hole[axis], end[axis]) - radius <= cut.center[i] + half[i] + EPS;
        });
      }))
        issue(
          "hole-profile",
          "error",
          "The bore or drill envelope reaches a rectangular cutout in the mounting panel.",
          [point.id],
          [mount.id],
        );
      if (
        plan.layout.system === "kreg-32mm" &&
        plan.layout.datumHeight !== null
      ) {
        const raw =
            (hole[1] + mount.size[1] / 2 - plan.layout.datumHeight) /
            kregShelfPinPitch,
          index = Math.round(raw);
        if (index < 0 || Math.abs(raw - index) > EPS)
          issue(
            "row-pitch",
            "error",
            "The derived hole center is not on a nonnegative 32 mm row measured from the explicit bottom-edge datum.",
            [point.id],
            [mount.id],
          );
        else reviewed.rowIndex = index;
      }
    }
  }
  const used = new Set(
    plan.points.flatMap((p) => [p.shelf.pieceId, p.mount.pieceId]),
  );
  for (const joint of project.joints)
    if (used.has(joint.a) || used.has(joint.b))
      issue(
        "fastener-locations-unresolved",
        "review",
        "A recorded screw/nail/bracket connection touches a referenced panel, but it has no hole coordinates. Its conflict with this support schedule cannot be established.",
        [],
        [joint.a, joint.b],
      );
  return {
    plan,
    state: "needs-measurements",
    stale,
    issues,
    points,
    activePinCount: 0,
  };
}
function addCrossIssue(
  review: AttachmentReview,
  code: string,
  message: string,
  a: ReviewedSupportPoint,
  b: ReviewedSupportPoint,
) {
  if (
    !review.issues.some(
      (i) =>
        i.code === code &&
        i.pointIds.includes(a.point.id) &&
        i.pointIds.includes(b.point.id),
    )
  )
    review.issues.push({
      code,
      severity: "error",
      message,
      pointIds: [a.point.id, b.point.id],
      pieceIds: [...new Set([a.point.mount.pieceId, b.point.mount.pieceId])],
    });
}
export function attachmentReviews(project: Project): AttachmentReview[] {
  const reviews = (project.attachmentPlans ?? []).map((plan) =>
      issuesForPlan(project, plan),
    ),
    groups = new Map<
      string,
      { review: AttachmentReview; point: ReviewedSupportPoint }[]
    >();
  for (const review of reviews)
    for (const point of review.points) {
      const list = groups.get(point.point.mount.pieceId) ?? [];
      list.push({ review, point });
      groups.set(point.point.mount.pieceId, list);
    }
  for (const list of groups.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i],
          b = list[j],
          pa = a.point.point,
          pb = b.point.point;
        if (pa.id === pb.id) continue;
        const ah = a.point.holeCenterLocal,
          bh = b.point.holeCenterLocal;
        let code = "",
          message = "";
        if (
          pa.mountFace.axis === pb.mountFace.axis &&
          pa.mountFace.sign === pb.mountFace.sign &&
          distance(pa.bearingTargetLocal, pb.bearingTargetLocal) < EPS
        ) {
          code = "duplicate-bearing";
          message =
            "Two explicitly planned pins occupy the same bearing-intent location on this panel; remove or revise the duplicate.";
        }
        if (
          a.review === b.review &&
          pa.mountFace.axis === pb.mountFace.axis &&
          pa.mountFace.sign === pb.mountFace.sign
        ) {
          const axis = pa.mountFace.axis,
            radialIntent = Math.hypot(
              ...subtract(pa.bearingTargetLocal, pb.bearingTargetLocal).filter(
                (_, k) => k !== axis,
              ),
            );
          // One plan shares one signed offset, so it cancels from this separation even while unknown.
          if (radialIntent <= nominalShelfPinBore + EPS) {
            code = "duplicate-hole";
            message =
              "The planned nominal 5 mm rows overlap or touch for every value of this plan's shared bearing offset.";
          }
        }
        if (ah && bh && pa.mountFace.axis === pb.mountFace.axis) {
          const axis = pa.mountFace.axis,
            radial = Math.hypot(
              ...subtract(ah, bh).filter((_, k) => k !== axis),
            );
          if (radial <= nominalShelfPinBore + EPS) {
            if (pa.mountFace.sign === pb.mountFace.sign) {
              code = "duplicate-hole";
              message =
                "Two derived nominal 5 mm hole envelopes overlap or touch on the same panel face.";
            } else {
              const ad = knownDepth(a.review.plan.measurements),
                bd = knownDepth(b.review.plan.measurements);
              if (
                ad !== null &&
                bd !== null &&
                ad + bd >= Math.abs(ah[axis] - bh[axis]) - EPS
              ) {
                code = "opposing-holes";
                message =
                  "Opposing measured drilling envelopes overlap or meet through this panel.";
              }
            }
          }
        }
        if (code) {
          addCrossIssue(a.review, code, message, a.point, b.point);
          if (a.review !== b.review)
            addCrossIssue(b.review, code, message, a.point, b.point);
        }
      }
  for (const review of reviews) {
    review.state = review.stale
      ? "stale"
      : review.issues.some((i) => i.severity === "error")
        ? "conflict"
        : review.issues.length
          ? "needs-measurements"
          : "geometry-checked";
    review.activePinCount =
      review.state === "stale" || review.state === "conflict"
        ? 0
        : review.points.length;
    for (const point of review.points) point.state = review.state;
  }
  return reviews;
}
