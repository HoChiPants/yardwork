import { isBatt, material, type Piece, type Project } from "./model";
import { assemblyStages } from "./assemblyStages";
import { fastenerReviews } from "./fastenings";
import { lidHingeReviews } from "./hinges";
import { attachmentReviews } from "./attachments";
import { restraintReviews } from "./restraints";
import { ensurePartLabels } from "./partLabels";
import { hardwareForJoint } from "./jointHardware";
import { clipBox } from "./cutProfiles";
import { rotate } from "./spatial";
import type { AssemblyStage } from "./assemblyStages";
import type { FastenerReview } from "./fastenings";
import type { HingeReview } from "./hinges";
import type { AttachmentReview } from "./attachments";
import type { RestraintReview } from "./restraints";
import { connectorReviews, type ConnectorReview } from "./connectors";

/** Evidence about saved intent only. No state represents installed or load-approved work. */
export type ConnectionIntentKind =
  "legacy-joint" | "wood-fastener" | "lid-hinge" | "shelf-pin" | "restraint" | "angle-connector";
export type ConnectionPurpose =
  "assembly" | "lid-mounting" | "shelf-support" | "external-restraint";
export type ConnectionIntentState =
  | "started"
  | "pending"
  | "geometry-reviewed"
  | "legacy-record"
  | "stale"
  | "conflict";
export type ConnectionCoverageIssue = {
  code: string;
  message: string;
  pieceIds: string[];
};
export type ConnectionIntent = {
  id: string;
  kind: ConnectionIntentKind;
  purpose: ConnectionPurpose;
  planId: string;
  locationId: string | null;
  label: string;
  name: string;
  /** Saved actual endpoints, including missing historical IDs. Never substituted by names. */
  pieceIds: string[];
  /** Parts whose task this intent addresses; context mounts do not acquire carcass-joinery credit. */
  coveragePieceIds: string[];
  activePieceIds: string[];
  state: ConnectionIntentState;
  sourceState: string;
  current: boolean;
  explicitLocationCount: number;
  issues: ConnectionCoverageIssue[];
  stepId: string | null;
  external: null | {
    kind: "wall";
    locationId: string;
    wallEyeWorld: [number, number, number] | null;
    substrate: string;
  };
};
export type ConnectionCoveragePart = {
  pieceId: string;
  label: string;
  name: string;
  ownerId: string;
  stageKey: string;
  intentIds: string[];
  currentIntentIds: string[];
  startedIntentIds: string[];
  excludedIntentIds: string[];
  contextIntentIds: string[];
  externalIntentIds: string[];
  state: "missing" | ConnectionIntentState;
};
export type ConnectionStageCoverage = {
  ownerId: string;
  key: string;
  title: string;
  memberIds: string[];
  stepId: string | null;
  intentIds: string[];
  noIntentPartIds: string[];
  noCurrentIntentPartIds: string[];
  startedPartIds: string[];
  pendingPartIds: string[];
  reviewedPartIds: string[];
  legacyPartIds: string[];
  excludedPartIds: string[];
  externalIntentIds: string[];
};
export type ConnectionCoverageGap = {
  id: string;
  kind:
    | "missing-intent"
    | "started-intent"
    | "pending-intent"
    | "legacy-unlocated"
    | "excluded-intent";
  ownerId: string;
  stageKey: string;
  pieceIds: string[];
  intentIds: string[];
  title: string;
};
export type ConnectionIntentComponent = {
  id: string;
  pieceIds: string[];
  intentIds: string[];
};
export type ConnectionCoverage = {
  parts: ConnectionCoveragePart[];
  intents: ConnectionIntent[];
  stages: ConnectionStageCoverage[];
  gaps: ConnectionCoverageGap[];
  /** Internal current-intent groups, not physical support or strength components. */
  components: ConnectionIntentComponent[];
  summary: {
    activeParts: number;
    noIntentParts: number;
    noCurrentIntentParts: number;
    startedIntents: number;
    pendingIntents: number;
    geometryReviewedIntents: number;
    legacyRecords: number;
    excludedIntents: number;
    externalRestraintIntents: number;
  };
  scope: string;
};
export type ConnectionCoverageCache = {
  stages?: readonly AssemblyStage[];
  fasteners?: readonly FastenerReview[];
  hinges?: readonly HingeReview[];
  attachments?: readonly AttachmentReview[];
  restraints?: readonly RestraintReview[];
  connectors?: readonly ConnectorReview[];
  now?: number;
};
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const excluded = (state: ConnectionIntentState) =>
  state === "stale" || state === "conflict";
const sourceState = (state: string): ConnectionIntentState =>
  state === "stale" || state === "conflict"
    ? state
    : ["path-reviewed", "geometry-reviewed", "geometry-checked"].includes(state)
      ? "geometry-reviewed"
      : "pending";
function issues(
  values: readonly {
    code: string;
    message: string;
    pieceIds?: readonly string[];
  }[],
): ConnectionCoverageIssue[] {
  const rows = values.map((value) => ({
    code: value.code,
    message: value.message,
    pieceIds: unique(value.pieceIds ?? []),
  }));
  return [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];
}
/** A failed derived review remains visibly excluded, never promoted to an unreviewed candidate. */
function derive<T>(
  cached: readonly T[] | undefined,
  compute: () => T[],
): readonly T[] {
  if (cached) return cached;
  try {
    return compute();
  } catch {
    return [];
  }
}
function rectangularCorners(piece: Piece) {
  const points: [number, number, number][] = [];
  for (const x of [-piece.size[0] / 2, piece.size[0] / 2])
    for (const y of [-piece.size[1] / 2, piece.size[1] / 2])
      for (const z of [-piece.size[2] / 2, piece.size[2] / 2])
        points.push([x, y, z]);
  return points;
}
/** Conservative separation check for the old half-inch pair-record rule; never a contact/fit assertion. */
function legacyBounds(piece: Piece) {
  let vertices = rectangularCorners(piece);
  try {
    vertices = clipBox(piece.size, piece.cutPlanes).vertices;
  } catch {
    /* The outer blank still gives a conservative separation lower bound. */
  }
  const points = vertices.map((point) =>
    rotate(point, piece.rotation).map(
      (value, axis) => value + piece.position[axis],
    ),
  );
  return {
    min: [0, 1, 2].map((axis) =>
      Math.min(...points.map((point) => point[axis])),
    ),
    max: [0, 1, 2].map((axis) =>
      Math.max(...points.map((point) => point[axis])),
    ),
  };
}

/** Pure saved-intent accounting. Contacts, purchases and checklist marks never create connection evidence. */
export function connectionCoverage(
  project: Project,
  cache: ConnectionCoverageCache = {},
): ConnectionCoverage {
  const active = project.pieces.filter(
    (piece) =>
      !piece.offcut &&
      !isBatt(piece.material) &&
      !material(piece.material).orderRollWidth &&
      !["fastener", "connector"].includes(material(piece.material).stockKind),
  );
  const byPart = new Map(active.map((piece) => [piece.id, piece])),
    intents: ConnectionIntent[] = [];
  const stepIds = new Set(project.steps.map((step) => step.id));
  let labels = new Map(
    project.partLabels.map((row) => [row.partId, row.label]),
  );
  try {
    labels = new Map(
      ensurePartLabels(project).partLabels.map((row) => [
        row.partId,
        row.label,
      ]),
    );
  } catch {
    /* Keep actual IDs usable even when a legacy label ledger is full. */
  }
  const unavailable: ConnectionCoverageIssue = {
    code: "review-unavailable",
    message:
      "The current derived review is unavailable. Open this retained plan; no current connection evidence is credited.",
    pieceIds: [],
  };
  const preparationStep = (kind: string, id: string, primary?: string) =>
    project.steps.find(
      (step) => step.generated?.kind === kind && step.generated.planId === id,
    )?.id ??
    (primary && byPart.has(primary) && stepIds.has(byPart.get(primary)!.stepId)
      ? byPart.get(primary)!.stepId
      : null);
  const append = (row: ConnectionIntent) => {
    row.pieceIds = unique(row.pieceIds);
    row.coveragePieceIds = unique(row.coveragePieceIds);
    row.activePieceIds = row.pieceIds.filter((id) => byPart.has(id));
    if (
      row.pieceIds.some((id) => !byPart.has(id)) &&
      row.kind !== "restraint"
    ) {
      row.state = "stale";
      row.issues = issues([
        ...row.issues,
        {
          code: "missing-member",
          message:
            "A saved endpoint is missing, an offcut or hardware. Historical IDs are retained; current parts are not rebound by names.",
          pieceIds: row.pieceIds.filter((id) => !byPart.has(id)),
        },
      ]);
    }
    if (
      !row.coveragePieceIds.some((id) => byPart.has(id)) &&
      !excluded(row.state)
    )
      row.state = "started";
    row.current =
      row.coveragePieceIds.some((id) => byPart.has(id)) &&
      !excluded(row.state) &&
      row.state !== "started" &&
      (row.explicitLocationCount > 0 || row.kind === "legacy-joint");
    intents.push(row);
  };
  const base = (
    kind: ConnectionIntentKind,
    purpose: ConnectionPurpose,
    planId: string,
    locationId: string | null,
    label: string,
    name: string,
    pieceIds: string[],
    coveragePieceIds = pieceIds,
  ) => ({
    id: `${kind}:${planId}:${locationId ?? "plan"}`,
    kind,
    purpose,
    planId,
    locationId,
    label,
    name,
    pieceIds,
    coveragePieceIds,
    activePieceIds: [],
    state: "pending" as ConnectionIntentState,
    sourceState: "needs-review",
    current: false,
    explicitLocationCount: locationId ? 1 : 0,
    issues: [] as ConnectionCoverageIssue[],
    stepId: null as string | null,
    external: null as ConnectionIntent["external"],
  });
  const bounds = new Map<string, ReturnType<typeof legacyBounds>>();
  const partBounds = (piece: Piece) => {
    if (!bounds.has(piece.id)) bounds.set(piece.id, legacyBounds(piece));
    return bounds.get(piece.id)!;
  };
  for (const joint of project.joints) {
    const row = base(
      "legacy-joint",
      "assembly",
      joint.id,
      null,
      "Pair record",
      `${joint.kind} pair record`,
      [joint.a, joint.b],
    );
    row.state = "legacy-record";
    row.sourceState = "unlocated pair record";
    row.stepId = joint.stepId;
    row.issues = [
      {
        code: "legacy-unlocated",
        message:
          "A pairwise quantity record does not locate holes, drive direction, engagement or an installed connection.",
        pieceIds: row.pieceIds,
      },
    ];
    if (!hardwareForJoint(joint)) {
      row.state = "conflict";
      row.issues.push({
        code: "legacy-hardware",
        message: "This pair record has no matching catalog hardware size/type.",
        pieceIds: row.pieceIds,
      });
    }
    const a = byPart.get(joint.a),
      b = byPart.get(joint.b);
    if (a && b) {
      const aa = partBounds(a),
        bb = partBounds(b),
        gap = Math.hypot(
          ...[0, 1, 2].map((axis) =>
            Math.max(
              0,
              aa.min[axis] - bb.max[axis],
              bb.min[axis] - aa.max[axis],
            ),
          ),
        );
      if (gap > 0.5) {
        row.state = "conflict";
        row.issues.push({
          code: "legacy-separated",
          message:
            "The actual members exceed the legacy half-inch pair-record separation rule. This is a placement review, not a fit allowance.",
          pieceIds: row.pieceIds,
        });
      }
    }
    append(row);
  }
  const fasteners = new Map(
    derive(cache.fasteners, () => fastenerReviews(project, cache.now)).map(
      (review) => [review.plan.id, review],
    ),
  );
  for (const plan of project.fastenerPlans) {
    const review = fasteners.get(plan.id),
      members = [plan.head.pieceId, plan.receiver.pieceId];
    for (const location of plan.locations.length ? plan.locations : [null]) {
      const point = location
        ? review?.locations.find((point) => point.location.id === location.id)
        : null;
      const row = base(
        "wood-fastener",
        "assembly",
        plan.id,
        location?.id ?? null,
        location ? `${plan.label}/${location.label}` : plan.label,
        plan.name,
        members,
      );
      row.sourceState = point?.state ?? review?.state ?? "review-unavailable";
      row.state = !review
        ? "conflict"
        : review.state === "stale"
          ? "stale"
          : location
            ? !point || !point.includedInDemand
              ? "conflict"
              : sourceState(point.state)
            : excluded(sourceState(review.state))
              ? sourceState(review.state)
              : "started";
      row.issues = review
        ? issues([...review.issues, ...(point?.issues ?? [])])
        : [unavailable];
      row.stepId = preparationStep(
        "wood-fastener-preparation",
        plan.id,
        plan.head.pieceId,
      );
      append(row);
    }
  }
  const connectors = new Map(derive(cache.connectors, () => connectorReviews(project, cache.now)).map((review) => [review.plan.id, review]));
  for (const plan of project.connectorPlans) {
    const review = connectors.get(plan.id), members = [plan.base.pieceId, plan.post.pieceId];
    for (const entry of plan.entries.length ? plan.entries : [null]) {
      const point = entry ? review?.entries.find((row) => row.entry.id === entry.id) : null;
      const assigned = entry ? plan[entry.role].pieceId : null;
      const row = base("angle-connector", "assembly", plan.id, entry?.id ?? null,
        entry ? `${plan.label}/${entry.label}` : plan.label, plan.name, members, assigned ? [assigned] : []);
      const entered = !!entry?.entranceLocal && !!entry?.driveLocal;
      row.explicitLocationCount = entered ? 1 : 0;
      row.sourceState = point?.state ?? review?.state ?? "review-unavailable";
      row.state = !review ? "conflict" : review.state === "stale" ? "stale"
        : review.state === "conflict" || review.activeConnectorCount === 0 ? "conflict"
        : entered && point?.includedInDemand ? "pending" : "started";
      // Reviewed wood centerlines never imply manufactured leaf/hole fit or installed joinery.
      row.issues = review ? issues([...review.issues, ...(point?.issues ?? []), {
        code: "connector-fit-pending", message: "A21Z reference schedule and entered wood paths do not establish leaf/bend/hole fit, complete joinery, installation or capacity.", pieceIds: members,
      }]) : [unavailable];
      row.stepId = preparationStep("connector-preparation", plan.id, assigned ?? plan.base.pieceId);
      append(row);
    }
  }
  const hinges = new Map(
    derive(cache.hinges, () => lidHingeReviews(project)).map((review) => [
      review.plan.id,
      review,
    ]),
  );
  for (const plan of project.lidHingePlans) {
    const review = hinges.get(plan.id),
      members = [plan.moving.pieceId, plan.fixed.pieceId];
    for (const location of plan.locations.length ? plan.locations : [null]) {
      const point = location
        ? review?.locations.find((point) => point.location.id === location.id)
        : null;
      const row = base(
        "lid-hinge",
        "lid-mounting",
        plan.id,
        location?.id ?? null,
        location ? `${plan.label}/${location.label}` : plan.label,
        plan.name,
        members,
        [plan.moving.pieceId],
      );
      row.sourceState = point?.state ?? review?.state ?? "review-unavailable";
      row.state = !review
        ? "conflict"
        : excluded(sourceState(review.state))
          ? sourceState(review.state)
          : location
            ? !point
              ? "conflict"
              : review.state === "needs-measurements"
                ? "pending"
                : sourceState(point.state)
            : "started";
      row.issues = review
        ? issues([...review.issues, ...(point?.issues ?? [])])
        : [unavailable];
      row.stepId = preparationStep(
        "lid-hinge-preparation",
        plan.id,
        plan.moving.pieceId,
      );
      append(row);
    }
  }
  const supports = new Map(
    derive(cache.attachments, () => attachmentReviews(project)).map(
      (review) => [review.plan.id, review],
    ),
  );
  for (const plan of project.attachmentPlans) {
    const review = supports.get(plan.id);
    for (const point of plan.points) {
      const row = base(
        "shelf-pin",
        "shelf-support",
        plan.id,
        point.id,
        "Shelf support point",
        plan.name,
        [point.shelf.pieceId, point.mount.pieceId],
        [point.shelf.pieceId],
      );
      row.sourceState = review?.state ?? "review-unavailable";
      row.state = review ? sourceState(review.state) : "conflict";
      row.issues = review
        ? issues(
            review.issues.filter(
              (issue) =>
                !issue.pointIds.length || issue.pointIds.includes(point.id),
            ),
          )
        : [unavailable];
      row.stepId = preparationStep(
        "shelf-pin-preparation",
        plan.id,
        point.shelf.pieceId,
      );
      append(row);
    }
  }
  const restraints = new Map(
    derive(cache.restraints, () => restraintReviews(project, cache.now, [...fasteners.values()])).map(
      (review) => [review.plan.id, review],
    ),
  );
  for (const plan of project.restraintPlans) {
    const review = restraints.get(plan.id),
      receiver = plan.receiver?.pieceId,
      members = unique([
        ...(receiver ? [receiver] : []),
        ...plan.receiverJointIds.flatMap((id) => {
          const joint = project.joints.find((joint) => joint.id === id);
          return joint ? [joint.a, joint.b] : [];
        }),
        ...(review?.screwLinks.flatMap(({ pieceIds }) => pieceIds) ?? []),
      ]);
    for (const location of plan.locations.length ? plan.locations : [null]) {
      const row = base(
        "restraint",
        "external-restraint",
        plan.id,
        location?.id ?? null,
        location?.name ?? "Restraint plan",
        plan.name,
        members,
        receiver ? [receiver] : [],
      );
      row.sourceState = review?.state ?? "review-unavailable";
      row.state = !review
        ? "conflict"
        : excluded(sourceState(review.state))
          ? sourceState(review.state)
          : location
            ? "pending"
            : "started";
      if (receiver && !byPart.has(receiver)) row.state = "stale";
      row.issues = review ? issues(review.issues) : [unavailable];
      row.stepId = preparationStep("restraint-preparation", plan.id, receiver);
      row.external = location
        ? {
            kind: "wall",
            locationId: location.id,
            wallEyeWorld: location.wallEyeWorld,
            substrate: location.wallSubstrate,
          }
        : null;
      append(row);
    }
  }
  const byIntent = new Map(intents.map((intent) => [intent.id, intent]));
  const claimed = new Set<string>();
  const stageRows = (cache.stages ?? assemblyStages(project))
    .map((stage) => ({
      ...stage,
      memberIds: stage.memberIds.filter((id) => {
        if (!byPart.has(id) || claimed.has(id)) return false;
        claimed.add(id);
        return true;
      }),
    }))
    .filter((stage) => stage.memberIds.length);
  const owned = new Set(stageRows.flatMap((stage) => stage.memberIds)),
    unassigned = active
      .filter((piece) => !owned.has(piece.id))
      .map((piece) => piece.id);
  if (unassigned.length)
    stageRows.push({
      ownerId: project.id,
      key: "unassigned-parts",
      title: "Review actual unassigned parts",
      memberIds: unassigned,
      notes: "",
      order: stageRows.length,
    });
  const stageByPart = new Map(
    stageRows.flatMap((stage) =>
      stage.memberIds.map((id) => [id, stage] as const),
    ),
  );
  const targetIndex = new Map<string, string[]>(),
    contextIndex = new Map<string, string[]>(),
    externalIndex = new Map<string, string[]>();
  const index = (map: Map<string, string[]>, id: string, intentId: string) => {
    if (!byPart.has(id)) return;
    const list = map.get(id) ?? [];
    list.push(intentId);
    map.set(id, list);
  };
  for (const intent of intents) {
    if (intent.purpose === "external-restraint") {
      for (const id of intent.pieceIds) index(externalIndex, id, intent.id);
      continue;
    }
    for (const id of intent.coveragePieceIds) index(targetIndex, id, intent.id);
    for (const id of intent.pieceIds)
      if (!intent.coveragePieceIds.includes(id))
        index(contextIndex, id, intent.id);
  }
  const parts: ConnectionCoveragePart[] = active.map((piece) => {
    const ids = unique(targetIndex.get(piece.id) ?? []),
      current = ids.filter((id) => byIntent.get(id)!.current),
      started = ids.filter((id) => byIntent.get(id)!.state === "started"),
      bad = ids.filter((id) => excluded(byIntent.get(id)!.state));
    const state = current.some((id) => byIntent.get(id)!.state === "pending")
      ? "pending"
      : current.some((id) => byIntent.get(id)!.state === "geometry-reviewed")
        ? "geometry-reviewed"
        : current.length
          ? "legacy-record"
          : started.length
            ? "started"
            : bad.some((id) => byIntent.get(id)!.state === "conflict")
              ? "conflict"
              : bad.length
                ? "stale"
                : "missing";
    const stage = stageByPart.get(piece.id)!;
    return {
      pieceId: piece.id,
      label: labels.get(piece.id) ?? "Unlabeled part",
      name: piece.name,
      ownerId: stage.ownerId,
      stageKey: stage.key,
      intentIds: ids,
      currentIntentIds: current,
      startedIntentIds: started,
      excludedIntentIds: bad,
      contextIntentIds: unique(contextIndex.get(piece.id) ?? []),
      externalIntentIds: unique(externalIndex.get(piece.id) ?? []),
      state,
    };
  });
  const coverageByPart = new Map(parts.map((part) => [part.pieceId, part]));
  const touchingIndex = new Map<string, string[]>();
  for (const intent of intents)
    for (const id of intent.activePieceIds) index(touchingIndex, id, intent.id);
  const stages: ConnectionStageCoverage[] = stageRows.map((stage) => {
    const members = stage.memberIds.map((id) => coverageByPart.get(id)!);
    const intentIds = unique(
      stage.memberIds.flatMap((id) => touchingIndex.get(id) ?? []),
    );
    const generated = project.steps.find(
      (step) =>
        step.generated?.kind === "assembly-stage" &&
        step.generated.planId === stage.ownerId &&
        step.generated.stageKey === stage.key,
    );
    const actualSteps = unique(
      stage.memberIds.map((id) => byPart.get(id)!.stepId),
    );
    return {
      ownerId: stage.ownerId,
      key: stage.key,
      title: stage.title,
      memberIds: stage.memberIds,
      stepId:
        generated?.id ??
        (actualSteps.length === 1 && stepIds.has(actualSteps[0])
          ? actualSteps[0]
          : null),
      intentIds,
      noIntentPartIds: members
        .filter((part) => !part.intentIds.length)
        .map((part) => part.pieceId),
      noCurrentIntentPartIds: members
        .filter((part) => !part.currentIntentIds.length)
        .map((part) => part.pieceId),
      startedPartIds: members
        .filter((part) => part.startedIntentIds.length)
        .map((part) => part.pieceId),
      pendingPartIds: members
        .filter((part) =>
          part.currentIntentIds.some(
            (id) => byIntent.get(id)!.state === "pending",
          ),
        )
        .map((part) => part.pieceId),
      reviewedPartIds: members
        .filter((part) =>
          part.currentIntentIds.some(
            (id) => byIntent.get(id)!.state === "geometry-reviewed",
          ),
        )
        .map((part) => part.pieceId),
      legacyPartIds: members
        .filter((part) =>
          part.currentIntentIds.some(
            (id) => byIntent.get(id)!.state === "legacy-record",
          ),
        )
        .map((part) => part.pieceId),
      excludedPartIds: members
        .filter((part) => part.excludedIntentIds.length)
        .map((part) => part.pieceId),
      externalIntentIds: intentIds.filter(
        (id) => byIntent.get(id)!.purpose === "external-restraint",
      ),
    };
  });
  const gaps: ConnectionCoverageGap[] = [];
  for (const stage of stages) {
    const addGap = (
      kind: ConnectionCoverageGap["kind"],
      pieceIds: string[],
      ids: string[],
      title: string,
    ) => {
      if (pieceIds.length || ids.length)
        gaps.push({
          id: `coverage:${stage.ownerId}:${stage.key}:${kind}`,
          kind,
          ownerId: stage.ownerId,
          stageKey: stage.key,
          pieceIds,
          intentIds: unique(ids),
          title,
        });
    };
    addGap(
      "missing-intent",
      stage.noIntentPartIds,
      [],
      `${stage.noIntentPartIds.length} part(s) have no internal connection intent`,
    );
    addGap(
      "started-intent",
      stage.startedPartIds,
      stage.startedPartIds.flatMap(
        (id) => coverageByPart.get(id)!.startedIntentIds,
      ),
      "Selected members still need explicit connection locations",
    );
    addGap(
      "pending-intent",
      stage.pendingPartIds,
      stage.pendingPartIds.flatMap((id) =>
        coverageByPart
          .get(id)!
          .currentIntentIds.filter(
            (id) => byIntent.get(id)!.state === "pending",
          ),
      ),
      "Entered connection intent still needs measurements/review",
    );
    addGap(
      "legacy-unlocated",
      stage.legacyPartIds,
      stage.legacyPartIds.flatMap((id) =>
        coverageByPart
          .get(id)!
          .currentIntentIds.filter(
            (id) => byIntent.get(id)!.state === "legacy-record",
          ),
      ),
      "Pair records retain quantities without located installation paths",
    );
    addGap(
      "excluded-intent",
      stage.excludedPartIds,
      stage.excludedPartIds.flatMap(
        (id) => coverageByPart.get(id)!.excludedIntentIds,
      ),
      "Retained stale/conflicting intent is excluded from current connection evidence",
    );
  }
  const orphanGroups = new Map<
    ConnectionCoverageGap["kind"],
    ConnectionIntent[]
  >();
  for (const intent of intents) {
    if (intent.coveragePieceIds.some((id) => byPart.has(id))) continue;
    const kind: ConnectionCoverageGap["kind"] = excluded(intent.state)
      ? "excluded-intent"
      : intent.state === "started"
        ? "started-intent"
        : "pending-intent";
    const rows = orphanGroups.get(kind) ?? [];
    rows.push(intent);
    orphanGroups.set(kind, rows);
  }
  for (const [kind, orphan] of orphanGroups)
    gaps.push({
      id: `coverage:${project.id}:unassigned-intents:${kind}`,
      kind,
      ownerId: project.id,
      stageKey: "unassigned-intents",
      pieceIds: unique(orphan.flatMap((intent) => intent.activePieceIds)),
      intentIds: orphan.map((intent) => intent.id),
      title:
        "Retained connection intent has no current task member; review actual IDs explicitly",
    });
  const parent = new Map(active.map((piece) => [piece.id, piece.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (id !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  for (const intent of intents)
    if (intent.current && intent.purpose !== "external-restraint")
      for (const id of intent.activePieceIds.slice(1)) {
        const a = find(intent.activePieceIds[0]),
          b = find(id);
        if (a !== b) parent.set(a, b);
      }
  const groups = new Map<string, string[]>();
  for (const piece of active) {
    const root = find(piece.id),
      ids = groups.get(root) ?? [];
    ids.push(piece.id);
    groups.set(root, ids);
  }
  const components: ConnectionIntentComponent[] = [...groups.values()].map(
    (ids) => {
      ids.sort();
      const memberSet = new Set(ids);
      return {
        id: `intent-group:${ids[0]}`,
        pieceIds: ids,
        intentIds: intents
          .filter(
            (intent) =>
              intent.current &&
              intent.purpose !== "external-restraint" &&
              intent.activePieceIds.some((id) => memberSet.has(id)),
          )
          .map((intent) => intent.id),
      };
    },
  );
  components.sort((a, b) => a.id.localeCompare(b.id));
  return {
    parts,
    intents,
    stages,
    gaps,
    components,
    summary: {
      activeParts: parts.length,
      noIntentParts: parts.filter((part) => !part.intentIds.length).length,
      noCurrentIntentParts: parts.filter(
        (part) => !part.currentIntentIds.length,
      ).length,
      startedIntents: intents.filter((intent) => intent.state === "started")
        .length,
      pendingIntents: intents.filter((intent) => intent.state === "pending")
        .length,
      geometryReviewedIntents: intents.filter(
        (intent) => intent.state === "geometry-reviewed",
      ).length,
      legacyRecords: intents.filter(
        (intent) => intent.state === "legacy-record",
      ).length,
      excludedIntents: intents.filter((intent) => excluded(intent.state))
        .length,
      externalRestraintIntents: intents.filter(
        (intent) => intent.purpose === "external-restraint",
      ).length,
    },
    scope:
      "Saved connection intent and current geometry reviews only. Physical contact, one referenced edge, purchased hardware and checked guide steps do not establish complete joinery, installed hardware, structural strength or code approval.",
  };
}
