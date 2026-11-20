import { invalidCutSources } from "./cutStock";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { rotate } from "./spatial";
import { clipBox } from "./cutProfiles";
import { stockAxes } from "./stockAxes";
import { attachmentGeometryFingerprint } from "./attachments";
import {
  captureFastenerReference,
  fastenerSourceCurrent,
  canonicalFastenerValue as canonical,
} from "./fastenerReferences";
import { getConnectorProduct, getConnectorSchedule } from "./connectorProducts";
import { fastenerReviews } from "./fastenings";
import { closedHingeMovingPiece, lidHingeReviews } from "./hinges";
import {
  connectorPlanSchema,
  connectorIntentSnapshot,
  emptyConnectorMeasurements,
  assertConnectorHistoryPrefix,
  CONNECTOR_REFERENCE_HISTORY_LIMIT,
  type ConnectorPlan,
  type ConnectorEntry,
  type ConnectorIntent,
} from "./connectorSchema";
export type ConnectorState =
  "stale" | "conflict" | "needs-measurements" | "paths-reviewed";
export type ConnectorIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  entryId?: string;
  pieceIds?: string[];
};
export type ReviewedConnectorEntry = {
  entry: ConnectorEntry;
  memberId: string;
  state: "stale" | "conflict" | "needs-measurements" | "path-reviewed";
  includedInDemand: boolean;
  /** Current user numeric provenance only; never manufacturer or installation approval. */
  measurementsCurrent: boolean;
  issues: ConnectorIssue[];
  entranceWorld: V3 | null;
  driveWorld: V3 | null;
  tipWorld: V3 | null;
  pilotTipWorld: V3 | null;
  exitWorld: V3 | null;
  availableWoodDepth: number | null;
};
export type ConnectorReview = {
  plan: ConnectorPlan;
  state: ConnectorState;
  issues: ConnectorIssue[];
  entries: ReviewedConnectorEntry[];
  activeEntryCount: number;
  activeConnectorCount: 0 | 1;
  scheduledFastenerCount: 0 | 4;
  sourceCurrent: boolean;
};
export type MakeConnectorPlanOptions = Partial<
  Pick<ConnectorPlan, "id" | "name" | "scheduleId" | "notes" | "createdAt">
>;
const EPS = 1e-6;
const add = (a: V3, b: V3): V3 => a.map((n, i) => n + b[i]) as V3;
const sub = (a: V3, b: V3): V3 => a.map((n, i) => n - b[i]) as V3;
const scale = (a: V3, n: number): V3 => a.map((v) => v * n) as V3;
const dot = (a: V3, b: V3) => a.reduce((n, v, i) => n + v * b[i], 0);
const basis = (piece: Pick<Piece, "rotation">) =>
  ([0, 1, 2] as const).map((i) => {
    const v: V3 = [0, 0, 0];
    v[i] = 1;
    return rotate(v, piece.rotation);
  });
const inverse = (v: V3, piece: Pick<Piece, "rotation">): V3 =>
  basis(piece).map((axis) => dot(v, axis)) as V3;
const world = (point: V3, piece: Piece) =>
  add(rotate(point, piece.rotation), piece.position);
const actual = (project: Project, id: string) =>
  project.pieces.find((piece) => piece.id === id && !piece.offcut);
const supported = (piece: Piece) =>
  material(piece.material).wood &&
  material(piece.material).stockKind === "linear";
const source = (
  plan: Pick<
    ConnectorIntent,
    "base" | "post" | "productId" | "evidenceRevision" | "scheduleId"
  >,
) => ({
  base: plan.base,
  post: plan.post,
  productId: plan.productId,
  evidenceRevision: plan.evidenceRevision,
  scheduleId: plan.scheduleId,
});
const clear = (entries: readonly ConnectorEntry[]) =>
  entries.map((entry) => ({
    ...structuredClone(entry),
    entranceLocal: null,
    driveLocal: null,
    measurements: emptyConnectorMeasurements(),
  }));
function sameRelativePose(base: Piece, post: Piece, plan: ConnectorPlan) {
  const before = inverse(
      sub(plan.post.baselinePose.position, plan.base.baselinePose.position),
      plan.base.baselinePose,
    ),
    after = inverse(sub(post.position, base.position), base);
  if (Math.hypot(...sub(before, after)) > EPS) return false;
  const oldAxes = basis(plan.post.baselinePose).map((axis) =>
      inverse(axis, plan.base.baselinePose),
    ),
    axes = basis(post).map((axis) => inverse(axis, base));
  return oldAxes.every((axis, i) => Math.hypot(...sub(axis, axes[i])) <= EPS);
}
function referencesCurrent(project: Project, plan: ConnectorPlan) {
  const base = actual(project, plan.base.pieceId),
    post = actual(project, plan.post.pieceId),
    product = getConnectorProduct(plan.productId);
  return (
    !!base &&
    !!post &&
    !!product &&
    !!plan.base.baseline &&
    !!plan.post.baseline &&
    baselineShapeCurrent(base, plan.base) &&
    baselineShapeCurrent(post, plan.post) &&
    product.evidenceRevision === plan.evidenceRevision &&
    attachmentGeometryFingerprint(base) === plan.base.geometryFingerprint &&
    attachmentGeometryFingerprint(post) === plan.post.geometryFingerprint &&
    fastenerSourceCurrent(base, plan.base) &&
    fastenerSourceCurrent(post, plan.post) &&
    sameRelativePose(base, post, plan)
  );
}
/** Captured source facts must agree with the referenced shape, not only its imported digest. */
function baselineShapeCurrent(
  piece: Piece,
  ref: ConnectorPlan["base"],
): boolean {
  const b = ref.baseline;
  return (
    !!b &&
    canonical({
      material: piece.material,
      size: piece.size,
      cutPlanes: piece.cutPlanes,
      cutStock: piece.cutStock,
      stockLengthAxis: piece.stockLengthAxis ?? null,
    }) ===
      canonical({
        material: b.material,
        size: b.size,
        cutPlanes: b.cutPlanes,
        cutStock: b.cutStock,
        stockLengthAxis: b.stockLengthAxis,
      })
  );
}
export function makeConnectorPlan(
  project: Project,
  baseId: string,
  postId: string,
  options: MakeConnectorPlanOptions = {},
): ConnectorPlan {
  const base = actual(project, baseId),
    post = actual(project, postId);
  if (
    !base ||
    !post ||
    baseId === postId ||
    !supported(base) ||
    !supported(post)
  )
    throw Error(
      "Choose two distinct actual active linear wood members. Sheets, missing members and offcuts cannot create an A21Z plan.",
    );
  const product = getConnectorProduct("simpson-a21z")!;
  const id = options.id ?? uid(),
    reserved = [
      ...project.connectorPlanLabels,
      ...project.connectorPlans.map((plan) => ({
        planId: plan.id,
        label: plan.label,
      })),
    ],
    old = reserved.find((row) => row.planId === id),
    number =
      1 + Math.max(0, ...reserved.map((row) => Number(row.label.slice(1))));
  if (!old && number > 999999)
    throw Error("This project has exhausted connector plan labels.");
  const at = new Date().toISOString();
  return connectorPlanSchema.parse({
    id,
    label: old?.label ?? `C${String(number).padStart(3, "0")}`,
    kind: "wood-angle",
    name: options.name ?? "Planned A21Z corner connector",
    createdAt: options.createdAt ?? at,
    updatedAt: at,
    productId: product.productId,
    evidenceRevision: product.evidenceRevision,
    scheduleId: options.scheduleId ?? "sd9112",
    base: captureFastenerReference(project, base, at),
    post: captureFastenerReference(project, post, at),
    entries: [0, 1, 2, 3].map((i) => ({
      id: uid(),
      label: `E00${i + 1}`,
      name: `${i < 2 ? "Base" : "Post"} wood entry ${(i % 2) + 1}`,
      role: i < 2 ? "base" : "post",
      entranceLocal: null,
      driveLocal: null,
      measurements: emptyConnectorMeasurements(),
    })),
    referenceHistory: [],
    notes: options.notes ?? "",
  });
}
function archive(
  previous: ConnectorPlan,
  next: ConnectorPlan,
  kind: "refresh" | "schedule",
  basisText: string,
): ConnectorPlan {
  if (previous.referenceHistory.length >= CONNECTOR_REFERENCE_HISTORY_LIMIT)
    throw Error(
      "Connector reference history is full; export the complete record before creating another plan. Nothing was removed.",
    );
  return connectorPlanSchema.parse({
    ...next,
    updatedAt: new Date().toISOString(),
    referenceHistory: [
      ...previous.referenceHistory,
      {
        id: uid(),
        kind,
        at: new Date().toISOString(),
        basis: basisText,
        previous: connectorIntentSnapshot(previous),
        next: connectorIntentSnapshot(next),
      },
    ],
  });
}
export function refreshConnectorPlan(
  project: Project,
  raw: ConnectorPlan,
): ConnectorPlan {
  const plan = connectorPlanSchema.parse(raw),
    saved = project.connectorPlans.find((p) => p.id === plan.id);
  if (
    saved &&
    (saved.base.pieceId !== plan.base.pieceId ||
      saved.post.pieceId !== plan.post.pieceId)
  )
    throw Error(
      "Reference refresh keeps the same actual member IDs; create an explicit new plan for replacement members.",
    );
  if (referencesCurrent(project, plan)) return plan;
  const base = actual(project, plan.base.pieceId),
    post = actual(project, plan.post.pieceId),
    product = getConnectorProduct(plan.productId);
  if (
    !base ||
    !post ||
    !supported(base) ||
    !supported(post) ||
    base.id === post.id ||
    !product
  )
    throw Error(
      "Both same-ID linear wood members must be present for explicit refresh. No replacement is inferred.",
    );
  const at = new Date().toISOString(),
    next = {
      ...plan,
      base: captureFastenerReference(project, base, at),
      post: captureFastenerReference(project, post, at),
      evidenceRevision: product.evidenceRevision,
      entries: clear(plan.entries),
    };
  return archive(
    plan,
    next,
    "refresh",
    "Explicit same-member/source reference review. Earlier raw references, entries and user measurements remain historical; current entries/directions/measurements were cleared. Connector leaf/hole fit is still unresolved.",
  );
}
export function changeConnectorSchedule(
  _project: Project,
  raw: ConnectorPlan,
  scheduleId: ConnectorPlan["scheduleId"],
): ConnectorPlan {
  const plan = connectorPlanSchema.parse(raw),
    schedule = getConnectorSchedule(scheduleId),
    product = getConnectorProduct(plan.productId);
  if (!schedule || !product)
    throw Error("Choose one complete reviewed A21Z reference schedule.");
  if (plan.scheduleId === schedule.id) return plan;
  return archive(
    plan,
    {
      ...plan,
      scheduleId: schedule.id,
      evidenceRevision: product.evidenceRevision,
      entries: clear(plan.entries),
    },
    "schedule",
    "Explicit complete A21Z fastener reference-schedule change. Prior working entries/measurements are historical; all current wood-entry inputs were cleared. No screw/nail mixture, hole pattern or fit was inferred.",
  );
}
export function saveConnectorPlan(
  project: Project,
  raw: ConnectorPlan,
): Project {
  const plan = connectorPlanSchema.parse(raw),
    previous = project.connectorPlans.find((p) => p.id === plan.id),
    reserved = project.connectorPlanLabels.find(
      (row) => row.planId === plan.id,
    );
  if (
    (previous && previous.label !== plan.label) ||
    (reserved && reserved.label !== plan.label) ||
    project.connectorPlanLabels.some(
      (row) => row.label === plan.label && row.planId !== plan.id,
    )
  )
    throw Error(
      "Connector plan labels are durable reserved identities; create from the current project.",
    );
  if (previous) {
    assertConnectorHistoryPrefix([previous], [plan]);
    if (
      canonical(
        previous.entries.map(({ id, label, role }) => ({ id, label, role })),
      ) !==
      canonical(
        plan.entries.map(({ id, label, role }) => ({ id, label, role })),
      )
    )
      throw Error(
        "Existing connector reference slots keep their actual IDs, labels and member roles.",
      );
    const added = plan.referenceHistory.slice(previous.referenceHistory.length);
    let expected = source(previous);
    for (const event of added) {
      if (canonical(source(event.previous)) !== canonical(expected))
        throw Error(
          "A connector reference review must begin from the current actual source/member references.",
        );
      if (
        event.previous.base.pieceId !== event.next.base.pieceId ||
        event.previous.post.pieceId !== event.next.post.pieceId
      )
        throw Error(
          "Reference refresh/schedule review cannot silently replace member IDs.",
        );
      if (
        event.kind === "schedule" &&
        (canonical(event.previous.base) !== canonical(event.next.base) ||
          canonical(event.previous.post) !== canonical(event.next.post))
      )
        throw Error(
          "A schedule change retains the raw actual-member references.",
        );
      if (
        event.kind === "refresh" &&
        event.previous.scheduleId !== event.next.scheduleId
      )
        throw Error(
          "Reference refresh cannot silently change the selected schedule.",
        );
      expected = source(event.next);
    }
    if (canonical(expected) !== canonical(source(plan)))
      throw Error(
        "Source/member/schedule changes require an explicit archived refresh or schedule review.",
      );
  }
  return projectSchema.parse({
    ...project,
    connectorPlans: previous
      ? project.connectorPlans.map((p) =>
          p.id === plan.id
            ? { ...plan, updatedAt: new Date().toISOString() }
            : p,
        )
      : [
          ...project.connectorPlans,
          { ...plan, updatedAt: new Date().toISOString() },
        ],
    connectorPlanLabels: reserved
      ? project.connectorPlanLabels
      : [
          ...project.connectorPlanLabels,
          { planId: plan.id, label: plan.label },
        ],
  });
}
export function removeConnectorPlan(project: Project, id: string): Project {
  return projectSchema.parse({
    ...project,
    connectorPlans: project.connectorPlans.filter((plan) => plan.id !== id),
  });
}
export function retainConnectorLabelHistory(
  target: Project,
  current: Project,
): Project {
  if (target.id !== current.id) return target;
  const ledger = [...current.connectorPlanLabels];
  for (const row of target.connectorPlanLabels) {
    const old = ledger.find((p) => p.planId === row.planId);
    if (
      (old && old.label !== row.label) ||
      ledger.some((p) => p.label === row.label && p.planId !== row.planId)
    )
      throw Error("Connector label reservations cannot be reassigned.");
    if (!old) ledger.push(row);
  }
  return projectSchema.parse({
    ...target,
    connectorPlanLabels: ledger,
    connectorPlans: target.connectorPlans.map((plan) => {
      const rows = structuredClone(
        current.connectorPlans.find((p) => p.id === plan.id)
          ?.referenceHistory ?? [],
      );
      for (const row of plan.referenceHistory) {
        const old = rows.find((p) => p.id === row.id);
        if (old && canonical(old) !== canonical(row))
          throw Error(
            "Connector reference history cannot be rewritten by Undo.",
          );
        if (!old) rows.push(structuredClone(row));
      }
      return { ...plan, referenceHistory: rows };
    }),
  });
}
export const qualifiedConnectorLabel = (
  plan: ConnectorPlan,
  entry: ConnectorEntry,
) => `${plan.label}/${entry.label}`;
type Plane = { normal: V3; constant: number };
type Solid = { piece: Piece; planes: Plane[]; axes: V3[]; min: V3; max: V3 };
const planes = (piece: Piece): Plane[] => [
  ...([0, 1, 2] as const).flatMap((axis) =>
    ([-1, 1] as const).map((sign) => {
      const normal: V3 = [0, 0, 0];
      normal[axis] = sign;
      return { normal, constant: piece.size[axis] / 2 };
    }),
  ),
  ...piece.cutPlanes,
];
function interval(origin: V3, direction: V3, retained: readonly Plane[]) {
  let enter = -Infinity,
    exit = Infinity;
  for (const face of retained) {
    const den = dot(face.normal, direction),
      margin = face.constant - dot(face.normal, origin);
    if (Math.abs(den) < EPS) {
      if (margin < -EPS) return null;
      continue;
    }
    const t = margin / den;
    if (den < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
  }
  return exit - enter > EPS ? { enter, exit } : null;
}
function geometry(project: Project) {
  return project.pieces
    .filter((piece) => !piece.offcut)
    .map((piece): Solid => {
      const axes = basis(piece),
        extent = ([0, 1, 2] as const).map((axis) =>
          axes.reduce(
            (n, v, i) => n + (Math.abs(v[axis]) * piece.size[i]) / 2,
            0,
          ),
        );
      return {
        piece,
        axes,
        planes: planes(piece),
        min: piece.position.map((n, i) => n - extent[i]) as V3,
        max: piece.position.map((n, i) => n + extent[i]) as V3,
      };
    })
    .sort((a, b) => a.min[0] - b.min[0]);
}
const local = (solid: Solid, v: V3): V3 =>
  solid.axes.map((axis) => dot(v, axis)) as V3;
function obstruction(
  solids: readonly Solid[],
  memberId: string,
  origin: V3,
  direction: V3,
  end: number,
) {
  if (end <= EPS) return null;
  const tip = add(origin, scale(direction, end)),
    min = origin.map((n, i) => Math.min(n, tip[i])),
    max = origin.map((n, i) => Math.max(n, tip[i]));
  for (const solid of solids) {
    if (solid.min[0] > max[0] + EPS) break;
    if (
      solid.piece.id === memberId ||
      solid.max.some((n, i) => n < min[i] - EPS) ||
      solid.min.some((n, i) => n > max[i] + EPS)
    )
      continue;
    const hit = interval(
      local(solid, sub(origin, solid.piece.position)),
      local(solid, direction),
      solid.planes,
    );
    if (hit && Math.min(hit.exit, end) - Math.max(hit.enter, 0) > EPS)
      return solid.piece;
  }
  return null;
}
function stockIssues(piece: Piece, sourceIssues: ReadonlyMap<string, string>): string[] {
  if (!supported(piece))
    return [
      "A21Z member-entry planning supports actual linear wood only; panels and other substrates require another design.",
    ];
  const m = material(piece.material),
    axes = stockAxes(piece, piece.cutStock?.size ?? piece.size),
    stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b),
    oriented = (size: V3) => [
      size[axes.thickness],
      size[axes.width],
      size[axes.length],
    ],
    issues: string[] = [];
  if (oriented(piece.size).some((n, i) => n > stock[i] + EPS))
    issues.push(
      "The member exceeds its selected stock dimensions; scaling cannot create physical stock.",
    );
  if (piece.cutStock) {
    const issue = sourceIssues.get(piece.cutStock.id);
    if (issue) issues.push(issue);
  }
  return issues;
}
function reviewPlan(
  project: Project,
  plan: ConnectorPlan,
  now: number,
  solids: readonly Solid[],
  sourceIssues: ReadonlyMap<string, string>,
): ConnectorReview {
  const issues: ConnectorIssue[] = [],
    base = actual(project, plan.base.pieceId),
    post = actual(project, plan.post.pieceId),
    product = getConnectorProduct(plan.productId),
    schedule = getConnectorSchedule(plan.scheduleId);
  const issue = (
    code: string,
    severity: ConnectorIssue["severity"],
    message: string,
    pieceIds?: string[],
  ) =>
    issues.push({ code, severity, message, ...(pieceIds ? { pieceIds } : {}) });
  const current = referencesCurrent(project, plan),
    stale = !current;
  if (stale)
    issue(
      "stale-reference",
      "error",
      "A member/source/product reference or relative pose changed or is missing. Earlier raw inputs remain saved; explicitly review the same IDs before using new numerical paths.",
    );
  if (!product || !schedule)
    issue(
      "unsupported-product",
      "error",
      "The complete current connector/product schedule is unavailable.",
    );
  if (base?.id === post?.id)
    issue(
      "same-member",
      "error",
      "Choose two distinct actual linear wood members.",
    );
  for (const piece of [base, post])
    if (piece) {
      for (const message of stockIssues(piece, sourceIssues))
        issue("invalid-member-source", "error", message, [piece.id]);
      try {
        clipBox(piece.size, piece.cutPlanes);
      } catch {
        issue(
          "invalid-solid",
          "error",
          "The actual retained wood solid is invalid; no path can be released.",
          [piece.id],
        );
      }
    }
  if (
    plan.entries.length !== 4 ||
    plan.entries.filter((entry) => entry.role === "base").length !== 2 ||
    plan.entries.filter((entry) => entry.role === "post").length !== 2
  )
    issue(
      "invalid-reference-slots",
      "error",
      "This reference schedule requires four planning slots: two assigned to each actual member. Slots are quantity references, not manufactured holes.",
    );
  issue(
    "wood-path-only",
    "review",
    "Only user-entered paths inside assigned wood members are reviewed. Four reviewed centerlines do not establish connector leaf/bend/hole fit, seating, corrosion suitability, grain, capacity, installation or code compliance.",
  );
  for (const message of product?.conflicts ?? [])
    issue("source-conflict", "review", message);
  for (const message of product?.unknowns ?? [])
    issue("product-unresolved", "review", message);
  if (
    project.joints.some(
      (j) =>
        [plan.base.pieceId, plan.post.pieceId].includes(j.a) ||
        [plan.base.pieceId, plan.post.pieceId].includes(j.b),
    ) ||
    project.fastenerPlans.some(
      (p) =>
        [plan.base.pieceId, plan.post.pieceId].includes(p.head.pieceId) ||
        [plan.base.pieceId, plan.post.pieceId].includes(p.receiver.pieceId),
    )
  )
    issue(
      "other-fastening-intent",
      "review",
      "Other pairwise/W records refer to these members. They remain separate intent and quantities; no connector fastener is substituted or automatically offset.",
    );
  const globalErrors = issues.filter((i) => i.severity === "error"),
    entries: ReviewedConnectorEntry[] = [];
  for (const entry of plan.entries) {
    const member = entry.role === "base" ? base : post,
      memberId = entry.role === "base" ? plan.base.pieceId : plan.post.pieceId,
      own: ConnectorIssue[] = [];
    const point: ReviewedConnectorEntry = {
      entry,
      memberId,
      state: "needs-measurements",
      includedInDemand: false,
      measurementsCurrent: false,
      issues: own,
      entranceWorld: null,
      driveWorld: null,
      tipWorld: null,
      pilotTipWorld: null,
      exitWorld: null,
      availableWoodDepth: null,
    };
    const localIssue = (
      code: string,
      severity: ConnectorIssue["severity"],
      message: string,
      pieceIds?: string[],
    ) => {
      const row = {
        code,
        severity,
        message,
        entryId: entry.id,
        ...(pieceIds ? { pieceIds } : {}),
      };
      own.push(row);
      issues.push(row);
    };
    if (stale) {
      point.state = "stale";
      own.push(...globalErrors);
      entries.push(point);
      continue;
    }
    if (globalErrors.length || !member) {
      point.state = "conflict";
      own.push(...globalErrors);
      entries.push(point);
      continue;
    }
    const solid = solids.find((s) => s.piece.id === member.id)!;
    if (entry.entranceLocal)
      point.entranceWorld = world(entry.entranceLocal, member);
    if (entry.driveLocal)
      point.driveWorld = rotate(entry.driveLocal, member.rotation);
    if (!entry.entranceLocal) {
      localIssue(
        "entry-pending",
        "review",
        "Enter an explicit actual wood-entry point. The reference count supplies no connector hole location.",
      );
      entries.push(point);
      continue;
    }
    const origin = entry.entranceLocal,
      margins = solid.planes.map((p) => p.constant - dot(p.normal, origin)),
      incident = solid.planes.filter((_, i) => Math.abs(margins[i]) <= EPS),
      distinct = incident.filter(
        (p, i) =>
          !incident
            .slice(0, i)
            .some(
              (q) =>
                Math.hypot(...sub(p.normal, q.normal)) <= EPS &&
                Math.abs(p.constant - q.constant) <= EPS,
            ),
      );
    if (margins.some((m) => m < -EPS) || distinct.length !== 1) {
      localIssue(
        "wood-entrance",
        "error",
        "The entry must lie inside one actual retained wood face, away from sharp edges or removed cut regions.",
      );
      point.state = "conflict";
      entries.push(point);
      continue;
    }
    if (!entry.driveLocal) {
      localIssue(
        "drive-pending",
        "review",
        "Choose an explicit normalized inward direction from the entered wood face.",
      );
      entries.push(point);
      continue;
    }
    const drive = entry.driveLocal,
      hit = interval(origin, drive, solid.planes);
    if (
      !hit ||
      Math.abs(hit.enter) > EPS ||
      hit.exit <= EPS ||
      dot(distinct[0].normal, drive) >= -EPS
    ) {
      localIssue(
        "wood-drive",
        "error",
        "The normalized direction must drive strictly inward through the assigned retained wood solid.",
      );
      point.state = "conflict";
      entries.push(point);
      continue;
    }
    point.availableWoodDepth = hit.exit;
    point.exitWorld = add(
      point.entranceWorld!,
      scale(point.driveWorld!, hit.exit),
    );
    const m = entry.measurements,
      has = [m.woodEntryToTipDepth, m.pilotDiameter, m.pilotDepth].some(
        (n) => n !== null,
      ),
      valid =
        !has ||
        (!!m.basis.trim() && !!m.measuredAt && Date.parse(m.measuredAt) <= now);
    point.measurementsCurrent = has && valid;
    if (!valid)
      localIssue(
        "measurement-provenance",
        "review",
        "Entered dimensions need a nonfuture user basis/date before numerical tips can be used.",
      );
    const depth = valid ? m.woodEntryToTipDepth : null,
      pilot = valid ? m.pilotDepth : null;
    if (depth === null)
      localIssue(
        "depth-pending",
        "review",
        "Enter a separately measured proposed wood-entry-to-tip depth. Nominal 1.5 in fastener length, metal gauge and named flange dimensions are not this datum.",
      );
    else {
      point.tipWorld = add(
        point.entranceWorld!,
        scale(point.driveWorld!, depth),
      );
      if (depth >= hit.exit - EPS)
        localIssue(
          "tip-breakthrough",
          "error",
          "The proposed tip reaches or breaks through the actual assigned wood exit face.",
        );
    }
    if (pilot !== null) {
      point.pilotTipWorld = add(
        point.entranceWorld!,
        scale(point.driveWorld!, pilot),
      );
      if (pilot >= hit.exit - EPS)
        localIssue(
          "pilot-breakthrough",
          "error",
          "The deepest entered pilot-drill tip reaches or crosses the actual wood exit face; this is not full-bore depth or a machine setting.",
        );
    }
    if (valid && m.pilotDiameter !== null) {
      const radius = m.pilotDiameter / 2;
      if (
        solid.planes.some(
          (p) =>
            Math.abs(p.constant - dot(p.normal, origin)) > EPS &&
            p.constant - dot(p.normal, origin) <
              radius *
                Math.sqrt(
                  Math.max(
                    0,
                    dot(p.normal, p.normal) - dot(p.normal, drive) ** 2,
                  ),
                ) -
                EPS,
        )
      )
        localIssue(
          "pilot-entry-edge",
          "error",
          "The entered pilot diameter intersects another retained boundary at the wood entrance; manufacturer spacing and drill-tip geometry remain separate.",
        );
    }
    if (m.pilotDiameter === null || m.pilotDepth === null)
      localIssue(
        "pilot-pending",
        "review",
        "Pilot size/process or deepest tip remains unknown. No pilot rule, drill-bit geometry or machine setting is inferred.",
      );
    const blocked = obstruction(
      solids,
      member.id,
      point.entranceWorld!,
      point.driveWorld!,
      Math.max(depth ?? 0, pilot ?? 0),
    );
    if (blocked)
      localIssue(
        "unselected-layer",
        "error",
        "Another active modeled member/envelope occupies the traversed wood path. Resolve the additional layer; a connector entry does not describe drilling through multiple members.",
        [blocked.id],
      );
    point.state = own.some((i) => i.severity === "error")
      ? "conflict"
      : depth === null || !valid
        ? "needs-measurements"
        : "path-reviewed";
    point.includedInDemand = point.state !== "conflict";
    if (point.state === "conflict") point.measurementsCurrent = false;
    entries.push(point);
  }
  const conflict = issues.some((i) => i.severity === "error"),
    state: ConnectorState = stale
      ? "stale"
      : conflict
        ? "conflict"
        : entries.some((e) => e.state === "needs-measurements")
          ? "needs-measurements"
          : "paths-reviewed";
  return {
    plan,
    state,
    issues,
    entries,
    activeEntryCount: entries.filter((e) => e.includedInDemand).length,
    activeConnectorCount: stale || conflict ? 0 : 1,
    scheduledFastenerCount: stale || conflict ? 0 : 4,
    sourceCurrent: current,
  };
}
/** One witness is enough; marked rays remain searchable for approximate chains. */
function raySearch(coordinates: readonly number[][]) {
  type Node = { i: number; axis: number; left?: Node; right?: Node };
  const tree = (ids: number[]): Node | undefined => {
    if (!ids.length) return;
    let axis = 0,
      span = -1;
    for (let k = 0; k < 6; k++) {
      const values = ids.map((i) => coordinates[i][k]),
        range = Math.max(...values) - Math.min(...values);
      if (range > span) {
        axis = k;
        span = range;
      }
    }
    ids.sort((a, b) => coordinates[a][axis] - coordinates[b][axis]);
    const mid = Math.floor(ids.length / 2);
    return {
      i: ids[mid],
      axis,
      left: tree(ids.slice(0, mid)),
      right: tree(ids.slice(mid + 1)),
    };
  };
  const root = tree(coordinates.map((_, i) => i));
  const neighbor = (
    node: Node | undefined,
    a: readonly number[],
    excluded: number,
  ): number | undefined => {
    if (!node) return;
    const b = coordinates[node.i];
    if (
      excluded !== node.i &&
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= EPS &&
      Math.hypot(a[3] - b[3], a[4] - b[4], a[5] - b[5]) <= EPS
    )
      return node.i;
    const delta = a[node.axis] - b[node.axis],
      found = neighbor(delta < 0 ? node.left : node.right, a, excluded);
    return (
      found ??
      (Math.abs(delta) <= EPS
        ? neighbor(delta < 0 ? node.right : node.left, a, excluded)
        : undefined)
    );
  };
  return (coordinates: readonly number[], excluded = -1) =>
    neighbor(root, coordinates, excluded);
}
type CompetingEntry = { label: string; memberId: string; coords: number[] };
/** Peer reviews are authoritative and computed at most once, only for entered C rays. */
function competingEntries(project: Project, now: number): CompetingEntry[] {
  const entries: CompetingEntry[] = [];
  if (project.fastenerPlans.length)
    for (const review of fastenerReviews(project, now)) {
      if (review.state === "stale") continue;
      for (const location of review.locations)
        if (
          location.includedInDemand &&
          location.entranceWorld &&
          location.driveWorld
        )
          entries.push({
            label: `${review.plan.label}/${location.location.label}`,
            memberId: review.plan.head.pieceId,
            coords: [...location.entranceWorld, ...location.driveWorld],
          });
    }
  if (project.lidHingePlans.length)
    for (const review of lidHingeReviews(project)) {
      if (review.state === "stale" || review.state === "conflict") continue;
      for (const location of review.locations) {
        if (
          location.state === "stale" ||
          location.state === "conflict" ||
          !location.entranceWorld ||
          !location.location.driveLocal
        )
          continue;
        const host =
          location.location.leaf === "moving"
            ? closedHingeMovingPiece(project, review.plan)
            : actual(project, review.plan.fixed.pieceId);
        if (!host) continue;
        entries.push({
          label: `${review.plan.label}/${location.location.label}`,
          memberId: host.id,
          coords: [
            ...location.entranceWorld,
            ...rotate(location.location.driveLocal, host.rotation),
          ],
        });
      }
    }
  return entries;
}
export function connectorReviews(
  project: Project,
  now = Date.now(),
): ConnectorReview[] {
  if (!project.connectorPlans.length) return [];
  const solids = geometry(project),
    sourceIssues = invalidCutSources(project),
    reviews = project.connectorPlans.map((plan) =>
      reviewPlan(project, plan, now, solids, sourceIssues),
    );
  const points = reviews.flatMap((review) =>
    review.entries
      .filter(
        (entry) =>
          entry.includedInDemand && entry.entranceWorld && entry.driveWorld,
      )
      .map((entry) => ({
        review,
        entry,
        coords: [...entry.entranceWorld!, ...entry.driveWorld!],
      })),
  );
  const search = raySearch(points.map((point) => point.coords)),
    duplicate = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    if (duplicate.has(i)) continue;
    const found = search(points[i].coords, i);
    if (found === undefined) continue;
    for (const at of [i, found]) {
      if (duplicate.has(at)) continue;
      duplicate.add(at);
      const { review, entry } = points[at],
        issue: ConnectorIssue = {
          code: "duplicate-entry",
          severity: "error",
          entryId: entry.entry.id,
          message:
            "Two connector reference entries share the same explicit wood entrance and drive path. No complete connector schedule can be credited until the duplicate is resolved.",
        };
      entry.issues.push(issue);
      review.issues.push(issue);
      entry.state = "conflict";
      entry.includedInDemand = false;
      entry.measurementsCurrent = false;
    }
  }
  const current = points.filter((point) => point.entry.includedInDemand);
  if (current.length) {
    const competing = competingEntries(project, now),
      search = raySearch(competing.map((entry) => entry.coords));
    for (const { review, entry, coords } of current) {
      const index = search(coords);
      if (index === undefined) continue;
      const other = competing[index],
        issue: ConnectorIssue = {
          code: "competing-entry",
          severity: "error",
          entryId: entry.entry.id,
          pieceIds: [other.memberId],
          message: `This connector entry shares its current wood entrance and inward direction with ${other.label} on actual member ${other.memberId}. Review the competing fastening intentions; the complete connector schedule is excluded, and the existing W/H intent is unchanged.`,
        };
      entry.issues.push(issue);
      review.issues.push(issue);
      entry.state = "conflict";
      entry.includedInDemand = false;
      entry.measurementsCurrent = false;
    }
  }
  for (const review of reviews) {
    review.activeEntryCount = review.entries.filter(
      (entry) => entry.includedInDemand,
    ).length;
    if (review.entries.some((entry) => entry.state === "conflict")) {
      if (review.state !== "stale") review.state = "conflict";
      review.activeConnectorCount = 0;
      review.scheduledFastenerCount = 0;
    }
  }
  return reviews;
}
