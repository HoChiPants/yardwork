import { invalidCutSources } from "./cutStock";
import { reviewConnectionContact } from "./connectionContacts";
import { pickFastenerSurface } from "./fastenerPicking";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { attachmentGeometryFingerprint } from "./attachments";
import { getWoodFastenerProduct } from "./fastenerProducts";
import {
  fastenerPlanSchema,
  emptyFastenerMeasurements,
  type FastenerPlan,
  type FastenerLocation,
} from "./fasteningSchema";
import {
  appendFastenerReferenceHistory,
  canonicalFastenerValue,
  captureFastenerReference,
  fastenerReferenceSnapshot,
  fastenerSourceCurrent,
  assertFastenerHistoryPrefix,
} from "./fastenerReferences";
export type FastenerState =
  "stale" | "conflict" | "needs-measurements" | "path-reviewed";
export type FastenerIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  locationId?: string;
  pieceIds?: string[];
};
export type ReviewedFastenerLocation = {
  location: FastenerLocation;
  state: FastenerState;
  includedInDemand: boolean;
  issues: FastenerIssue[];
  entranceWorld: V3 | null;
  driveWorld: V3 | null;
  headExitWorld: V3 | null;
  receiverEnterWorld: V3 | null;
  receiverExitWorld: V3 | null;
  tipWorld: V3 | null;
  headExitDepth: number | null;
  receiverEnterDepth: number | null;
  receiverExitDepth: number | null;
  gap: number | null;
  penetration: number | null;
  availableReceiverDepth: number | null;
};
export type FastenerReview = {
  plan: FastenerPlan;
  state: FastenerState;
  issues: FastenerIssue[];
  locations: ReviewedFastenerLocation[];
  activePointCount: number;
};
export type MakeFastenerPlanOptions = Partial<
  Pick<
    FastenerPlan,
    "id" | "name" | "productId" | "createdAt" | "measurements" | "notes"
  >
>;
const EPS = 1e-6;
const add = (a: V3, b: V3): V3 => a.map((v, i) => v + b[i]) as V3;
const subtract = (a: V3, b: V3): V3 => a.map((v, i) => v - b[i]) as V3;
const scale = (a: V3, s: number): V3 => a.map((v) => v * s) as V3;
const dot = (a: V3, b: V3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const inverse = (v: V3, rotation: V3): V3 => {
  // Transpose of the exact forward transform, valid for full Euler rotations.
  const basis = ([0, 1, 2] as const).map((axis) => {
    const vector: V3 = [0, 0, 0];
    vector[axis] = 1;
    return rotate(vector, rotation);
  });
  return basis.map((axis) => dot(v, axis)) as V3;
};
const world = (point: V3, piece: Piece) =>
  add(rotate(point, piece.rotation), piece.position);
type Pose = Pick<Piece, "position" | "rotation">;
export const fastenerGeometryFingerprint = attachmentGeometryFingerprint;
export function normalizedFastenerDrive(direction: V3): V3 {
  const norm = Math.hypot(...direction);
  if (!Number.isFinite(norm) || norm < EPS)
    throw Error("Enter a nonzero finite drive direction.");
  return scale(direction, 1 / norm);
}
function actual(project: Project, id: string) {
  const p = project.pieces.find((piece) => piece.id === id && !piece.offcut);
  if (!p)
    throw Error(
      "Choose an existing active part; missing parts and offcuts cannot be rebound.",
    );
  return p;
}
export function makeFastenerPlan(
  project: Project,
  headId: string,
  receiverId: string,
  config: MakeFastenerPlanOptions = {},
): FastenerPlan {
  const now = new Date().toISOString();
  const productId = config.productId ?? "grk-r4-103101",
    product = getWoodFastenerProduct(productId);
  if (!product) throw Error("Choose a supported reviewed wood-screw product.");
  const id = config.id ?? uid(),
    reserved = [
      ...project.fastenerPlanLabels,
      ...project.fastenerPlans.map((p) => ({ planId: p.id, label: p.label })),
    ],
    existing = reserved.find((row) => row.planId === id),
    nextNumber =
      1 + Math.max(0, ...reserved.map((row) => Number(row.label.slice(1))));
  if (!existing && nextNumber > 999999)
    throw Error("This project has exhausted its fastening plan labels.");
  return fastenerPlanSchema.parse({
    id,
    label: existing?.label ?? `W${String(nextNumber).padStart(3, "0")}`,
    kind: "wood-screw",
    productId,
    productEvidenceRevision: product.evidenceRevision,
    name: config.name ?? "Planned wood screws",
    createdAt: config.createdAt ?? now,
    updatedAt: now,
    head: captureFastenerReference(project, actual(project, headId), now),
    receiver: captureFastenerReference(
      project,
      actual(project, receiverId),
      now,
    ),
    nextLocationNumber: 1,
    locations: [],
    measurements: config.measurements ?? emptyFastenerMeasurements(),
    referenceHistory: [],
    notes: config.notes ?? "",
  });
}
export function addFastenerLocation(plan: FastenerPlan): FastenerPlan {
  if (plan.nextLocationNumber >= 1000000)
    throw Error("This plan has exhausted its location label numbers.");
  return fastenerPlanSchema.parse({
    ...plan,
    updatedAt: new Date().toISOString(),
    nextLocationNumber: plan.nextLocationNumber + 1,
    locations: [
      ...plan.locations,
      {
        id: uid(),
        label: `F${String(plan.nextLocationNumber).padStart(3, "0")}`,
        name: `Location ${plan.nextLocationNumber}`,
        entranceLocal: null,
        driveLocal: null,
      },
    ],
  });
}
export function refreshFastenerPlan(
  project: Project,
  plan: FastenerPlan,
): FastenerPlan {
  const product = getWoodFastenerProduct(plan.productId);
  if (!product)
    throw Error(
      "The saved wood-screw product has no current evidence revision.",
    );
  const previous =
    project.fastenerPlans.find((saved) => saved.id === plan.id) ?? plan;
  if (
    previous.head.pieceId !== plan.head.pieceId ||
    previous.receiver.pieceId !== plan.receiver.pieceId
  )
    throw Error(
      "Replacement member IDs require the explicit mapping preview; reference refresh keeps the same IDs.",
    );
  const head = actual(project, plan.head.pieceId),
    receiver = actual(project, plan.receiver.pieceId);
  if (
    previous.productId === plan.productId &&
    previous.productEvidenceRevision === plan.productEvidenceRevision &&
    plan.productEvidenceRevision === product.evidenceRevision &&
    plan.head.geometryFingerprint === fastenerGeometryFingerprint(head) &&
    plan.receiver.geometryFingerprint ===
      fastenerGeometryFingerprint(receiver) &&
    sameRelativePose(head, receiver, plan) &&
    fastenerSourceCurrent(head, plan.head) &&
    fastenerSourceCurrent(receiver, plan.receiver)
  )
    return plan;
  const at = new Date().toISOString();
  const next = fastenerPlanSchema.parse({
    ...plan,
    updatedAt: at,
    productEvidenceRevision: product.evidenceRevision,
    head: captureFastenerReference(project, head, at),
    receiver: captureFastenerReference(project, receiver, at),
    measurements: emptyFastenerMeasurements(),
  });
  return fastenerPlanSchema.parse(
    appendFastenerReferenceHistory(
      next,
      previous,
      "refresh",
      "Explicit same-ID reference refresh after geometry, relative pose or product evidence changed. Historical measurements do not apply to the refreshed references.",
      "retain-local",
      at,
    ),
  );
}
/** An explicit product-reference edit; stale or missing members are never rebound here. */
export function changeFastenerProduct(
  project: Project,
  draft: FastenerPlan,
  productId: FastenerPlan["productId"],
): FastenerPlan {
  const saved = project.fastenerPlans.find((plan) => plan.id === draft.id),
    product = getWoodFastenerProduct(productId);
  if (!saved)
    throw Error(
      "Save the initial fastening plan before changing its recorded product.",
    );
  if (!product) throw Error("Choose a supported reviewed wood-screw product.");
  if (
    canonicalFastenerValue(draft.referenceHistory) !==
    canonicalFastenerValue(saved.referenceHistory)
  )
    throw Error(
      "Save or discard the pending reference-history change before choosing another product.",
    );
  if (
    canonicalFastenerValue([draft.head, draft.receiver]) !==
    canonicalFastenerValue([saved.head, saved.receiver])
  )
    throw Error(
      "Save or discard the pending member-reference change before choosing another product.",
    );
  if (
    draft.productId === productId &&
    draft.productEvidenceRevision === product.evidenceRevision
  )
    return draft;
  const at = new Date().toISOString(),
    next = fastenerPlanSchema.parse({
      ...draft,
      productId,
      productEvidenceRevision: product.evidenceRevision,
      measurements: emptyFastenerMeasurements(),
      updatedAt: at,
    });
  return fastenerPlanSchema.parse(
    appendFastenerReferenceHistory(
      next,
      saved,
      "refresh",
      "Explicit product reference change. Previous product evidence and user measurements are historical; member references and raw local locations were retained without revalidation.",
      "retain-local",
      at,
    ),
  );
}
const plans = (project: Project): FastenerPlan[] =>
  (project as Project & { fastenerPlans?: FastenerPlan[] }).fastenerPlans ?? [];
export function saveFastenerPlan(project: Project, raw: FastenerPlan): Project {
  const plan = fastenerPlanSchema.parse(raw);
  const previous = plans(project).find((p) => p.id === plan.id);
  if (previous) {
    assertFastenerHistoryPrefix([previous], [plan]);
    const refsChanged =
      canonicalFastenerValue({
        head: previous.head,
        receiver: previous.receiver,
        productId: previous.productId,
        productEvidenceRevision: previous.productEvidenceRevision,
      }) !==
      canonicalFastenerValue({
        head: plan.head,
        receiver: plan.receiver,
        productId: plan.productId,
        productEvidenceRevision: plan.productEvidenceRevision,
      });
    if (refsChanged) {
      const added = plan.referenceHistory.slice(
          previous.referenceHistory.length,
        ),
        row = added[0];
      if (
        added.length !== 1 ||
        (row.kind === "refresh" &&
          (plan.head.pieceId !== previous.head.pieceId ||
            plan.receiver.pieceId !== previous.receiver.pieceId)) ||
        (row.kind === "remap" &&
          plan.head.pieceId === previous.head.pieceId &&
          plan.receiver.pieceId === previous.receiver.pieceId) ||
        canonicalFastenerValue(row.previous) !==
          canonicalFastenerValue(fastenerReferenceSnapshot(previous)) ||
        canonicalFastenerValue(row.next) !==
          canonicalFastenerValue({
            head: plan.head,
            receiver: plan.receiver,
            productId: plan.productId,
            productEvidenceRevision: plan.productEvidenceRevision,
          }) ||
        canonicalFastenerValue(plan.measurements) !==
          canonicalFastenerValue(emptyFastenerMeasurements())
      )
        throw Error(
          "Reference changes require an explicit reviewed remap or refresh and cleared current measurements.",
        );
    }
  }
  const reserved = project.fastenerPlanLabels.find(
    (row) => row.planId === plan.id,
  );
  if (
    (previous && previous.label !== plan.label) ||
    (reserved && reserved.label !== plan.label)
  )
    throw Error("Existing fastening plans keep their durable plan labels.");
  if (
    project.fastenerPlanLabels.some(
      (row) => row.label === plan.label && row.planId !== plan.id,
    )
  )
    throw Error(
      "This fastening plan label is already reserved. Create the plan from the current project.",
    );
  if (previous && plan.nextLocationNumber < previous.nextLocationNumber)
    throw Error("Fastener location label reservations cannot move backwards.");
  if (
    previous &&
    plan.locations.some((location) => {
      const old = previous.locations.find((p) => p.id === location.id);
      return old && old.label !== location.label;
    })
  )
    throw Error("Existing fastener locations keep their durable labels.");
  return projectSchema.parse({
    ...project,
    fastenerPlanLabels: reserved
      ? project.fastenerPlanLabels
      : [...project.fastenerPlanLabels, { planId: plan.id, label: plan.label }],
    fastenerPlans: previous
      ? plans(project).map((p) =>
          p.id === plan.id
            ? { ...plan, updatedAt: new Date().toISOString() }
            : p,
        )
      : [...plans(project), { ...plan, updatedAt: new Date().toISOString() }],
  });
}
/** Preserve reservations across undo/redo without moving, renaming or allocating any point. */
export function retainFastenerLabelHistory(
  next: Project,
  current: Project,
): Project {
  if (next.id !== current.id) return next;
  const ledger = new Map(
    next.fastenerPlanLabels.map((row) => [row.planId, row]),
  );
  for (const row of current.fastenerPlanLabels) {
    const old = ledger.get(row.planId);
    if (
      (old && old.label !== row.label) ||
      [...ledger.values()].some(
        (other) => other.planId !== row.planId && other.label === row.label,
      )
    )
      throw Error(
        "Conflicting fastening plan label reservations cannot be silently reassigned.",
      );
    ledger.set(row.planId, row);
  }
  const counters = new Map(
    plans(current).map((plan) => [plan.id, plan.nextLocationNumber]),
  );
  const histories = new Map(
    plans(current).map((plan) => [plan.id, plan.referenceHistory]),
  );
  return {
    ...next,
    fastenerPlanLabels: [...ledger.values()],
    fastenerPlans: plans(next).map((plan) => {
      const rows = [...(histories.get(plan.id) ?? [])],
        byId = new Map(rows.map((row) => [row.id, row]));
      for (const row of plan.referenceHistory) {
        const existing = byId.get(row.id);
        if (
          existing &&
          canonicalFastenerValue(existing) !== canonicalFastenerValue(row)
        )
          throw Error(
            "Conflicting reference history cannot be silently rewritten.",
          );
        if (!existing) {
          rows.push(row);
          byId.set(row.id, row);
        }
      }
      return fastenerPlanSchema.parse({
        ...plan,
        referenceHistory: rows,
        nextLocationNumber: Math.max(
          plan.nextLocationNumber,
          counters.get(plan.id) ?? 1,
        ),
      });
    }),
  };
}
export function qualifiedFastenerLabel(
  plan: FastenerPlan,
  location: FastenerLocation,
): string {
  return `${plan.label}/${location.label}`;
}
export function removeFastenerPlan(project: Project, id: string): Project {
  return projectSchema.parse({
    ...project,
    fastenerPlans: plans(project).filter((plan) => plan.id !== id),
  });
}
function planes(piece: Piece) {
  return [
    ...([0, 1, 2] as const).flatMap((axis) =>
      ([-1, 1] as const).map((sign) => {
        const normal: V3 = [0, 0, 0];
        normal[axis] = sign;
        return { normal, constant: piece.size[axis] / 2 };
      }),
    ),
    ...piece.cutPlanes,
  ];
}
/** Exact line intersection of the retained convex halfspaces, in inches along a unit ray. */
function interval(
  piece: Piece,
  origin: V3,
  direction: V3,
  retained = planes(piece),
) {
  let enter = -Infinity,
    exit = Infinity;
  for (const plane of retained) {
    const denominator = dot(plane.normal, direction),
      margin = plane.constant - dot(plane.normal, origin);
    if (Math.abs(denominator) < EPS) {
      if (margin < -EPS) return null;
      continue;
    }
    const t = margin / denominator;
    if (denominator < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
  }
  return exit - enter > EPS ? { enter, exit } : null;
}
type Solid = {
  piece: Piece;
  retained: ReturnType<typeof planes>;
  basis: V3[];
  min: V3;
  max: V3;
};
type PathGeometry = {
  byId: Map<string, Solid>;
  sorted: Solid[];
  obstructionCache: Map<string, Piece | null>;
};
function pathGeometry(project: Project): PathGeometry {
  const sorted = project.pieces
    .filter((piece) => !piece.offcut)
    .map((piece): Solid => {
      const basis = ([0, 1, 2] as const).map((axis) => {
        const vector: V3 = [0, 0, 0];
        vector[axis] = 1;
        return rotate(vector, piece.rotation);
      });
      // Blank bounds are a conservative broad phase; retained planes decide intersections.
      const extent = ([0, 1, 2] as const).map((axis) =>
        basis.reduce(
          (sum, vector, i) =>
            sum + (Math.abs(vector[axis]) * piece.size[i]) / 2,
          0,
        ),
      );
      return {
        piece,
        basis,
        retained: planes(piece),
        min: piece.position.map((v, i) => v - extent[i]) as V3,
        max: piece.position.map((v, i) => v + extent[i]) as V3,
      };
    })
    .sort((a, b) => a.min[0] - b.min[0]);
  return {
    sorted,
    byId: new Map(sorted.map((solid) => [solid.piece.id, solid])),
    obstructionCache: new Map(),
  };
}
const localVector = (solid: Solid, vector: V3): V3 =>
  solid.basis.map((axis) => dot(vector, axis)) as V3;
function obstruction(
  geometry: PathGeometry,
  headId: string,
  receiverId: string,
  origin: V3,
  drive: V3,
  end: number,
): Piece | null {
  if (end <= EPS) return null;
  const key = JSON.stringify([headId, receiverId, origin, drive, end]);
  if (geometry.obstructionCache.has(key))
    return geometry.obstructionCache.get(key)!;
  const tip = add(origin, scale(drive, end)),
    min = origin.map((v, i) => Math.min(v, tip[i])),
    max = origin.map((v, i) => Math.max(v, tip[i]));
  let found: Piece | null = null;
  for (const solid of geometry.sorted) {
    if (solid.min[0] > max[0] + EPS) break;
    if (
      solid.piece.id === headId ||
      solid.piece.id === receiverId ||
      solid.max.some((v, i) => v < min[i] - EPS) ||
      solid.min.some((v, i) => v > max[i] + EPS)
    )
      continue;
    const hit = interval(
      solid.piece,
      localVector(solid, subtract(origin, solid.piece.position)),
      localVector(solid, drive),
      solid.retained,
    );
    if (hit && Math.min(hit.exit, end) - Math.max(hit.enter, 0) > EPS) {
      found = solid.piece;
      break;
    }
  }
  geometry.obstructionCache.set(key, found);
  return found;
}
function distinctFaces(faces: ReturnType<typeof planes>) {
  return faces.filter(
    (plane, index) =>
      !faces
        .slice(0, index)
        .some(
          (old) =>
            Math.hypot(...subtract(old.normal, plane.normal)) <= EPS &&
            Math.abs(old.constant - plane.constant) <= EPS,
        ),
  );
}

/** Test a conservative cylindrical pilot envelope against the receiver's retained faces. */
function receiverPilotCrossesEdge(
  retained: ReturnType<typeof planes>,
  origin: V3,
  drive: V3,
  entryDepth: number,
  tipDepth: number,
  radius: number,
) {
  if (tipDepth <= entryDepth + EPS) return false;
  const entry = add(origin, scale(drive, entryDepth));
  const tip = add(origin, scale(drive, tipDepth));
  const entranceFaces = distinctFaces(
    retained.filter(
      ({ normal, constant }) =>
        Math.abs(constant - dot(normal, entry)) <= EPS &&
        dot(normal, drive) < -EPS,
    ),
  );
  return retained.some(({ normal, constant }) => {
    const cosine = dot(normal, drive);
    if (
      entranceFaces.length === 1 &&
      cosine < -EPS &&
      Math.abs(constant - dot(normal, entry)) <= EPS
    ) return false;
    const reach = radius * Math.sqrt(Math.max(0, dot(normal, normal) - cosine ** 2));
    if (reach <= EPS) return false;
    return Math.min(constant - dot(normal, entry), constant - dot(normal, tip)) <= reach + EPS;
  });
}

/** Transfer a point on a touching interface to the exposed opposite wood face. */
export function fastenerEntryThroughContact(
  project: Project,
  head: Piece,
  receiver: Piece,
  point: V3,
  direction: V3,
) {
  const driveLocal = normalizedFastenerDrive(inverse(direction, head.rotation));
  const centerLocal = inverse(subtract(point, head.position), head.rotation);
  const hit = interval(head, centerLocal, driveLocal);
  if (!hit || hit.enter >= -EPS || Math.abs(hit.exit) > EPS)
    throw Error("The centerline does not cross this retained entry-side part.");

  let surface: ReturnType<typeof pickFastenerSurface>;
  try {
    surface = pickFastenerSurface(head, add(centerLocal, scale(driveLocal, hit.enter)), driveLocal);
    if (Math.hypot(...subtract(surface.driveLocal, driveLocal)) > EPS)
      throw Error("The exterior face does not match the centered direction.");
  } catch {
    throw Error("The centerline needs an opposite entry face. Swap the members or choose the entry manually.");
  }
  const entrance = world(surface.entranceLocal, head);
  if (fastenerEntranceCovered(project, head, receiver, entrance, direction))
    throw Error("Another modeled part covers the centered entry face. Choose an exposed entry.");
  return { surface, entrance };
}

export function fastenerEntranceCovered(
  project: Project,
  head: Piece,
  receiver: Piece,
  entrance: V3,
  direction: V3,
) {
  return project.pieces.some((piece) => {
    if (piece.offcut || piece.id === head.id || piece.id === receiver.id) return false;
    const cover = interval(
      piece,
      inverse(subtract(entrance, piece.position), piece.rotation),
      inverse(direction, piece.rotation),
    );
    return cover && cover.enter < -EPS && cover.exit >= -EPS;
  });
}

/** Seed one direction at the centroid of the actual contact patch. */
export function suggestCenteredFastener(
  project: Project,
  headId: string,
  receiverId: string,
  options: MakeFastenerPlanOptions = {},
): { plan: FastenerPlan; review: FastenerReview } {
  const head = actual(project, headId), receiver = actual(project, receiverId);
  const contact = reviewConnectionContact(head, receiver, 0);
  if (contact.state !== "face-contact" || !contact.center || !contact.normal)
    throw Error("A centered entry needs two retained wood faces in direct contact.");
  const { surface } = fastenerEntryThroughContact(
    project, head, receiver, contact.center, contact.normal,
  );

  const base = makeFastenerPlan(project, headId, receiverId, {
    ...options,
    measurements: emptyFastenerMeasurements(),
  });
  const seeded = addFastenerLocation(base);
  const plan = {
    ...seeded,
    locations: [{ ...seeded.locations[0], name: "Centered entry", ...surface }],
  };
  const review = fastenerReviews({
    ...project,
    fastenerPlans: [...plans(project), plan],
  }).find((entry) => entry.plan.id === plan.id);
  if (!review || review.state !== "needs-measurements" || review.locations[0]?.gap !== 0)
    throw Error(review?.issues.find(({ severity }) => severity === "error")?.message ??
      "The centered path could not be reviewed. Choose an entry manually.");
  return { plan, review };
}
export function sameFastenerPairPose(baseline: Pose, target: Pose, head: Pose, receiver: Pose) {
  const before = inverse(
      subtract(target.position, baseline.position),
      baseline.rotation,
    ),
    after = inverse(subtract(receiver.position, head.position), head.rotation);
  if (Math.hypot(...subtract(before, after)) > EPS) return false;
  return ([0, 1, 2] as const).every((axis) => {
    const vector: V3 = [0, 0, 0];
    vector[axis] = 1;
    return (
      Math.hypot(
        ...subtract(
          inverse(rotate(vector, target.rotation), baseline.rotation),
          inverse(rotate(vector, receiver.rotation), head.rotation),
        ),
      ) <= EPS
    );
  });
}
function sameRelativePose(head: Piece, receiver: Piece, plan: FastenerPlan) {
  return sameFastenerPairPose(plan.head.baselinePose, plan.receiver.baselinePose, head, receiver);
}
function stockIssues(piece: Piece, sourceIssues: ReadonlyMap<string, string>): string[] {
  const m = material(piece.material);
  if (!m.wood || !["linear", "sheet"].includes(m.stockKind))
    return [
      "Wood-screw path review requires actual wood lumber or wood sheet parts; no other substrate is inferred.",
    ];
  const axes = stockAxes(piece, piece.cutStock?.size ?? piece.size),
    stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b),
    oriented = (size: V3) => [
      size[axes.thickness],
      size[axes.width],
      size[axes.length],
    ],
    issues: string[] = [];
  if (piece.roundOpenings?.length || piece.rectangularOpenings?.length)
    issues.push("Review this screw path against the part’s through-cuts before relying on its wood engagement.");
  if (oriented(piece.size).some((v, i) => v > stock[i] + EPS))
    issues.push(
      "The actual member exceeds the catalog source thickness, width or length. Scaling cannot create larger stock.",
    );
  if (piece.cutStock) {
    const issue = sourceIssues.get(piece.cutStock.id);
    if (issue) issues.push(issue);
  }
  return issues;
}
function reviewPlan(
  project: Project,
  plan: FastenerPlan,
  now: number,
  geometry: PathGeometry,
  sourceIssues: ReadonlyMap<string, string>,
): FastenerReview {
  const issues: FastenerIssue[] = [],
    head = project.pieces.find((p) => p.id === plan.head.pieceId && !p.offcut),
    receiver = project.pieces.find(
      (p) => p.id === plan.receiver.pieceId && !p.offcut,
    ),
    product = getWoodFastenerProduct(plan.productId);
  let stale = false;
  const issue = (
    code: string,
    severity: FastenerIssue["severity"],
    message: string,
    locationId?: string,
    pieceIds = [plan.head.pieceId, plan.receiver.pieceId],
  ) => {
    const entry = {
      code,
      severity,
      message,
      ...(locationId ? { locationId } : {}),
      pieceIds,
    };
    issues.push(entry);
    return entry;
  };
  for (const [ref, piece] of [
    [plan.head, head],
    [plan.receiver, receiver],
  ] as const)
    if (
      !piece ||
      fastenerGeometryFingerprint(piece) !== ref.geometryFingerprint
    ) {
      stale = true;
      issue(
        "stale-part",
        "review",
        "A referenced part is missing, an offcut or physically changed. Review and explicitly refresh the same part IDs; no replacement is inferred.",
      );
    } else if (!fastenerSourceCurrent(piece, ref)) {
      stale = true;
      issue(
        "stale-source",
        "review",
        "The catalog stock size or source identity differs from the captured member baseline. Review and explicitly refresh; historical source facts are not silently replaced.",
      );
    }
  if (head && receiver && !sameRelativePose(head, receiver, plan)) {
    stale = true;
    issue(
      "relative-motion",
      "review",
      "The two parts moved relative to each other. The saved local locations require explicit review and refresh.",
    );
  }
  if (!product || plan.productEvidenceRevision !== product.evidenceRevision) {
    stale = true;
    issue(
      "product-evidence",
      "review",
      "The saved product evidence revision changed or is unavailable. Explicit refresh is required.",
    );
  }
  if (head && receiver)
    for (const piece of [head, receiver])
      for (const message of stockIssues(piece, sourceIssues))
        issue("invalid-source", "error", message);
  const measured = plan.measurements,
    measuredDate = measured.measuredAt && Date.parse(measured.measuredAt),
    dateValid =
      measuredDate !== null &&
      measuredDate !== "" &&
      Number.isFinite(measuredDate) &&
      Number(measuredDate) <= now,
    hasMeasurements = [
      measured.surfaceToTipDepth,
      measured.pilotDiameter,
      measured.pilotDepth,
    ].some((v) => v !== null),
    measuredUsable =
      !hasMeasurements || (!!dateValid && !!measured.basis.trim());
  if (!measuredUsable)
    issue(
      "measurement-basis",
      "review",
      "User dimensions need a nonfuture measurement date and a stated basis before candidate depths can be used.",
    );
  for (const conflict of product?.conflicts ?? [])
    issue("source-conflict", "review", conflict);
  for (const unresolved of product?.unknowns ?? [])
    issue("product-unresolved", "review", unresolved);
  issue(
    "path-only",
    "review",
    "This reviews a user-proposed centerline only. Head seating/length datum, thread engagement, pilot procedure, grain, end/edge spacing, tool/clamp access and load/capacity/installation remain separate reviews.",
  );
  if (measured.pilotDiameter === null || measured.pilotDepth === null)
    issue(
      "pilot-pending",
      "review",
      "Pilot diameter and deepest pilot-drill tip depth remain unknown where blank; no head diameter, drill-tip geometry or nominal screw length supplies them.",
    );
  if (
    project.joints.some(
      (j) =>
        (j.a === plan.head.pieceId && j.b === plan.receiver.pieceId) ||
        (j.b === plan.head.pieceId && j.a === plan.receiver.pieceId),
    )
  )
    issue(
      "legacy-pairwise-record",
      "review",
      "A pairwise joint also represents this part pair without location coordinates. Review duplicate demand and spatial conflicts; its quantity is not converted into these locations.",
    );
  const globalErrors = issues.filter((i) => i.severity === "error"),
    locations: ReviewedFastenerLocation[] = [];
  for (const location of plan.locations) {
    const own: FastenerIssue[] = [],
      localIssue = (
        code: string,
        severity: FastenerIssue["severity"],
        message: string,
        pieceIds?: string[],
      ) => own.push(issue(code, severity, message, location.id, pieceIds)),
      pose = head ?? { ...plan.head.baselinePose };
    const reviewed: ReviewedFastenerLocation = {
      location,
      state: "needs-measurements",
      includedInDemand: false,
      issues: own,
      entranceWorld: location.entranceLocal
        ? world(location.entranceLocal, pose as Piece)
        : null,
      driveWorld: location.driveLocal
        ? rotate(location.driveLocal, pose.rotation)
        : null,
      headExitWorld: null,
      receiverEnterWorld: null,
      receiverExitWorld: null,
      tipWorld: null,
      headExitDepth: null,
      receiverEnterDepth: null,
      receiverExitDepth: null,
      gap: null,
      penetration: null,
      availableReceiverDepth: null,
    };
    if (stale) {
      reviewed.state = "stale";
      reviewed.issues.push(...issues.filter((i) => !i.locationId));
      locations.push(reviewed);
      continue;
    }
    if (globalErrors.length) {
      reviewed.state = "conflict";
      reviewed.issues.push(...globalErrors);
      locations.push(reviewed);
      continue;
    }
    if (!head || !receiver)
      throw Error("Missing parts must retain a stale review.");
    const headSolid = geometry.byId.get(head.id)!,
      receiverSolid = geometry.byId.get(receiver.id)!;
    if (!location.entranceLocal || !location.driveLocal) {
      const margins = location.entranceLocal
        ? headSolid.retained.map(
            (plane) =>
              plane.constant - dot(plane.normal, location.entranceLocal!),
          )
        : null;
      if (
        margins &&
        (margins.some((margin) => margin < -EPS) ||
          !margins.some((margin) => Math.abs(margin) <= EPS) ||
          distinctFaces(
            headSolid.retained.filter((_, i) => Math.abs(margins[i]) <= EPS),
          ).length !== 1)
      ) {
        localIssue(
          "head-entrance",
          "error",
          "The provided entrance is not on an actual retained wood surface, even while its drive direction is pending.",
        );
        reviewed.state = "conflict";
        locations.push(reviewed);
        continue;
      }
      localIssue(
        "location-pending",
        "review",
        "Choose an explicit wood entrance point and inward normalized drive direction; no location or pattern is inferred.",
      );
      reviewed.includedInDemand = true;
      locations.push(reviewed);
      continue;
    }
    const origin = location.entranceLocal,
      direction = location.driveLocal,
      h = interval(head, origin, direction, headSolid.retained),
      activeFaces = distinctFaces(
        headSolid.retained.filter(
          (plane) =>
            Math.abs(plane.constant - dot(plane.normal, origin)) <= EPS,
        ),
      );
    if (
      !h ||
      Math.abs(h.enter) > EPS ||
      h.exit <= EPS ||
      activeFaces.length !== 1 ||
      activeFaces.some((plane) => dot(plane.normal, direction) >= -EPS)
    )
      localIssue(
        "head-entrance",
        "error",
        "The entrance must lie on an actual retained wood face and drive strictly inward, away from its edges. A blank bounding box or removed cut corner is not a face.",
      );
    else {
      const entrance = reviewed.entranceWorld!,
        drive = reviewed.driveWorld!,
        rOrigin = localVector(
          receiverSolid,
          subtract(entrance, receiver.position),
        ),
        rDrive = localVector(receiverSolid, drive),
        r = interval(receiver, rOrigin, rDrive, receiverSolid.retained);
      reviewed.headExitDepth = h.exit;
      reviewed.headExitWorld = add(entrance, scale(drive, h.exit));
      if (!r || r.exit <= EPS)
        localIssue(
          "missed-receiver",
          "error",
          "This inward ray misses the actual retained receiving solid in the forward direction.",
        );
      else {
        reviewed.receiverEnterDepth = r.enter;
        reviewed.receiverExitDepth = r.exit;
        reviewed.receiverEnterWorld = add(entrance, scale(drive, r.enter));
        reviewed.receiverExitWorld = add(entrance, scale(drive, r.exit));
        reviewed.gap = Math.abs(r.enter - h.exit) < EPS ? 0 : r.enter - h.exit;
        reviewed.availableReceiverDepth = r.exit - r.enter;
        if (r.enter < h.exit - EPS)
          localIssue(
            "member-overlap",
            "error",
            "The receiving solid overlaps the head-side member along this path; resolve the actual geometry.",
          );
        const depth = measuredUsable ? measured.surfaceToTipDepth : null;
        if (depth === null)
          localIssue(
            "depth-pending",
            "review",
            "Enter the proposed wood-surface-to-tip depth after seating with a user basis/date. Nominal product length is not this datum.",
          );
        else {
          reviewed.tipWorld = add(entrance, scale(drive, depth));
          reviewed.penetration = Math.max(0, depth - r.enter);
          if (depth <= r.enter + EPS)
            localIssue(
              "no-penetration",
              "error",
              "The proposed tip does not enter the receiving solid; the head-side thickness and actual gap consume this reach.",
            );
          if (depth >= r.exit - EPS)
            localIssue(
              "tip-breakthrough",
              "error",
              "The proposed tip reaches or breaks through the actual receiving exit face; a boundary tip has no geometric clearance.",
            );
        }
        if (
          measuredUsable &&
          measured.pilotDepth !== null &&
          measured.pilotDepth >= r.exit - EPS
        )
          localIssue(
            "pilot-breakthrough",
            "error",
            "The entered deepest pilot-drill tip depth reaches or passes the receiving exit face. It is not a full-diameter bore or a machine setting.",
          );
        const surfaceDepth = measuredUsable ? measured.surfaceToTipDepth : null,
          pilotDepth = measuredUsable ? measured.pilotDepth : null,
          end = Math.max(surfaceDepth ?? Math.max(0, r.enter), pilotDepth ?? 0),
          blocked = obstruction(
            geometry,
            head.id,
            receiver.id,
            entrance,
            drive,
            end,
          );
        if (blocked)
          localIssue(
            "unselected-layer",
            "error",
            "An unselected active member or modeled envelope occupies the traversed path. Resolve the additional layer; no material-drilling or multi-member fastening detail is inferred.",
            [blocked.id],
          );
        if (
          pilotDepth !== null &&
          measured.pilotDiameter !== null &&
          r.enter >= h.exit - EPS &&
          pilotDepth < r.exit - EPS &&
          receiverPilotCrossesEdge(
            receiverSolid.retained,
            rOrigin,
            rDrive,
            r.enter,
            pilotDepth,
            measured.pilotDiameter / 2,
          )
        )
          localIssue(
            "pilot-receiver-edge",
            "error",
            "The entered pilot envelope reaches a retained edge of the receiving wood. Review the pilot diameter, depth and placement.",
          );
      }
      if (measuredUsable && measured.pilotDiameter !== null) {
        const radius = measured.pilotDiameter / 2;
        if (
          headSolid.retained.some((plane) => {
            if (Math.abs(plane.constant - dot(plane.normal, origin)) <= EPS)
              return false;
            const radial = Math.sqrt(
              Math.max(
                0,
                dot(plane.normal, plane.normal) -
                  dot(plane.normal, direction) ** 2,
              ),
            );
            return (
              plane.constant - dot(plane.normal, origin) < radius * radial - EPS
            );
          })
        )
          localIssue(
            "pilot-entry-edge",
            "error",
            "The entered pilot diameter's entrance cross-section intersects another retained boundary. Manufacturer edge/end spacing and full drill-tip geometry are still separate unknowns.",
          );
      }
    }
    reviewed.state = own.some((i) => i.severity === "error")
      ? "conflict"
      : own.some((i) =>
            ["depth-pending", "location-pending"].includes(i.code),
          ) || !measuredUsable
        ? "needs-measurements"
        : "path-reviewed";
    reviewed.includedInDemand = reviewed.state !== "conflict";
    locations.push(reviewed);
  }
  return {
    plan,
    state: stale
      ? "stale"
      : globalErrors.length || locations.some((l) => l.state === "conflict")
        ? "conflict"
        : !locations.length ||
            locations.some((l) => l.state === "needs-measurements")
          ? "needs-measurements"
          : "path-reviewed",
    issues,
    locations,
    activePointCount: locations.filter((l) => l.includedInDemand).length,
  };
}
export function fastenerReviews(
  project: Project,
  now = Date.now(),
): FastenerReview[] {
  if (!plans(project).length) return [];
  const geometry = pathGeometry(project),
    sourceIssues = invalidCutSources(project),
    reviews = plans(project).map((plan) =>
      reviewPlan(project, plan, now, geometry, sourceIssues),
    );
  // Explicit coincident paths are duplicates, including across plans. Unknown legacy joints have no coordinates.
  const locations = reviews.flatMap((review) =>
    review.locations.map((location) => ({
      review,
      location,
      eligible: location.includedInDemand,
    })),
  );
  const candidates = locations.filter(
      (item) =>
        item.eligible &&
        item.location.entranceWorld &&
        item.location.driveWorld,
    ),
    coordinates = candidates.map((item) => [
      ...item.location.entranceWorld!,
      ...item.location.driveWorld!,
    ]);
  type Node = { index: number; axis: number; left?: Node; right?: Node };
  function tree(indices: number[]): Node | undefined {
    if (!indices.length) return;
    let axis = 0,
      largest = -1;
    for (let k = 0; k < 6; k++) {
      let min = Infinity,
        max = -Infinity;
      for (const i of indices) {
        min = Math.min(min, coordinates[i][k]);
        max = Math.max(max, coordinates[i][k]);
      }
      if (max - min > largest) {
        largest = max - min;
        axis = k;
      }
    }
    indices.sort((a, b) => coordinates[a][axis] - coordinates[b][axis]);
    const middle = Math.floor(indices.length / 2);
    return {
      index: indices[middle],
      axis,
      left: tree(indices.slice(0, middle)),
      right: tree(indices.slice(middle + 1)),
    };
  }
  const root = tree(candidates.map((_, index) => index)),
    duplicate = new Set<number>();
  function neighbor(node: Node | undefined, query: number): number | undefined {
    if (!node) return;
    const a = coordinates[query],
      b = coordinates[node.index];
    if (
      node.index !== query &&
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= EPS &&
      Math.hypot(a[3] - b[3], a[4] - b[4], a[5] - b[5]) <= EPS
    )
      return node.index;
    const difference = a[node.axis] - b[node.axis],
      near = difference < 0 ? node.left : node.right,
      far = difference < 0 ? node.right : node.left;
    const found = neighbor(near, query);
    return (
      found ?? (Math.abs(difference) <= EPS ? neighbor(far, query) : undefined)
    );
  }
  // Each query needs only one witness. Already-marked points remain searchable witnesses,
  // so approximate A-B-C chains are preserved without quadratic issue allocation.
  for (let i = 0; i < candidates.length; i++) {
    if (duplicate.has(i)) continue;
    const found = neighbor(root, i);
    if (found === undefined) continue;
    for (const index of [i, found]) {
      if (!duplicate.has(index)) {
        const { review, location } = candidates[index];
        const issue: FastenerIssue = {
          code: "duplicate-location",
          severity: "error",
          message:
            "Two explicit locations occupy the same entrance and drive path. Resolve the duplicate before counting or using either.",
          locationId: location.location.id,
        };
        location.issues.push(issue);
        review.issues.push(issue);
        location.state = "conflict";
        location.includedInDemand = false;
        review.state = "conflict";
        duplicate.add(index);
      }
    }
  }
  for (const review of reviews)
    review.activePointCount = review.locations.filter(
      (location) => location.includedInDemand,
    ).length;
  return reviews;
}
