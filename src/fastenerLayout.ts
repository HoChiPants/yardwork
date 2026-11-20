import { z } from "zod";
import { material, projectSchema, type Project, type V3 } from "./model";
import { clipBox } from "./cutProfiles";
import { rotate } from "./spatial";
import {
  fastenerPlanSchema,
  type FastenerLocation,
  type FastenerPlan,
} from "./fasteningSchema";
import {
  addFastenerLocation,
  fastenerReviews,
  type FastenerIssue,
  type FastenerReview,
  type ReviewedFastenerLocation,
} from "./fastenings";
import { canonicalFastenerValue } from "./fastenerReferences";
import { woodFastenerProducts } from "./fastenerProducts";

const EPS = 1e-6;
const direction = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const fastenerLayoutSpecSchema = z
  .strictObject({
    seedLocationId: z.string().uuid(),
    uLocal: direction.refine(
      (value) => Math.abs(Math.hypot(...value) - 1) <= 1e-10,
      "Choose an explicit unit row direction.",
    ),
    countU: z.number().int().min(2).max(100),
    spacingU: z.number().finite().positive().max(12000),
    countV: z.number().int().min(1).max(100),
    spacingV: z.number().finite().positive().max(12000).nullable(),
    reverseV: z.boolean().default(false),
    minimumFaceMargin: z
      .number()
      .finite()
      .min(0)
      .max(12000)
      .nullable()
      .default(null),
    basis: z.string().trim().min(1).max(500),
  })
  .superRefine((spec, ctx) => {
    if (spec.countV > 1 && spec.spacingV === null)
      ctx.addIssue({
        code: "custom",
        message: "Enter the second-axis grid spacing.",
      });
    if (spec.countU * spec.countV > 100)
      ctx.addIssue({
        code: "custom",
        message:
          "A layout cannot exceed100 total positions including its seed.",
      });
  });
export type FastenerLayoutSpec = z.input<typeof fastenerLayoutSpecSchema>;
export type ResolvedFastenerLayoutSpec = z.output<
  typeof fastenerLayoutSpecSchema
>;
export type FastenerLayoutFace = {
  headId: string;
  receiverId: string;
  seed: FastenerLocation;
  seedReview: ReviewedFastenerLocation;
  originLocal: V3;
  normalLocal: V3;
  polygonLocal: V3[];
  originWorld: V3;
  normalWorld: V3;
  polygonWorld: V3[];
  kind: "stock" | "cut";
  planeIndex: number | null;
};
export type FastenerLayoutCandidate = {
  id: string;
  index: number;
  /** Zero-based grid cell. The existing seed at0/0 is never duplicated. */
  row: number;
  column: number;
  location: FastenerLocation;
  review: ReviewedFastenerLocation;
  eligible: boolean;
  issues: FastenerIssue[];
  /** Signed distance to the retained seed-face polygon's closest edge, in inches. */
  faceMargin: number | null;
};
export type FastenerLayoutPreview = {
  token: string;
  draftToken: string;
  projectId: string;
  planId: string;
  spec: ResolvedFastenerLayoutSpec;
  face: FastenerLayoutFace;
  uLocal: V3;
  vLocal: V3;
  candidates: FastenerLayoutCandidate[];
  candidateIds: string[];
  /** Full transient review, including every unchanged old point and the seed. */
  review: FastenerReview;
  eligibleCount: number;
  pendingCount: number;
  excludedCount: number;
  existingEligibilityChanges: string[];
  /** All generated cells only; use fastenerLayoutReceipt for an accepted subset. */
  softwareNote: string;
  noteFits: boolean;
};
export type FastenerLayoutReceipt = {
  /** The exact additive software receipt for the explicit selection. */
  note: string;
  /** Original draft notes plus the additive receipt, with no truncation. */
  notes: string;
  noteFits: boolean;
};

const add = (a: V3, b: V3): V3 => a.map((value, i) => value + b[i]) as V3;
const sub = (a: V3, b: V3): V3 => a.map((value, i) => value - b[i]) as V3;
const scale = (a: V3, n: number): V3 => a.map((value) => value * n) as V3;
const dot = (a: V3, b: V3) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (value: V3): V3 => {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length) || length <= 1e-10)
    throw Error("Choose a nonparallel, nonzero direction in this face.");
  return scale(value, 1 / length);
};
function token(value: unknown): string {
  let hash = 14695981039346656037n;
  for (const character of canonicalFastenerValue(value))
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n,
    );
  return `fastener-layout-v1-${hash.toString(16).padStart(16, "0")}`;
}
function reviewProject(project: Project, raw: FastenerPlan): Project {
  const draft = fastenerPlanSchema.parse(raw);
  const saved = project.fastenerPlans.some((plan) => plan.id === draft.id);
  return projectSchema.parse({
    ...project,
    fastenerPlans: saved
      ? project.fastenerPlans.map((plan) =>
          plan.id === draft.id ? draft : plan,
        )
      : [...project.fastenerPlans, draft],
    fastenerPlanLabels: project.fastenerPlanLabels.some(
      (row) => row.planId === draft.id,
    )
      ? project.fastenerPlanLabels
      : [
          ...project.fastenerPlanLabels,
          { planId: draft.id, label: draft.label },
        ],
  });
}
function currentReview(project: Project, draft: FastenerPlan) {
  const next = reviewProject(project, draft),
    reviews = fastenerReviews(next);
  return {
    project: next,
    reviews,
    review: reviews.find((review) => review.plan.id === draft.id)!,
  };
}

/** A current, complete draft seed is sufficient; no additional Save or reference refresh occurs. */
export function fastenerLayoutFace(
  project: Project,
  raw: FastenerPlan,
  seedId: string,
): FastenerLayoutFace {
  const draft = fastenerPlanSchema.parse(raw),
    seed = draft.locations.find((point) => point.id === seedId);
  if (!seed?.entranceLocal || !seed.driveLocal)
    throw Error(
      "Pick or enter a complete seed entrance and drive direction first.",
    );
  const { review } = currentReview(project, draft),
    seedReview = review.locations.find(
      (point) => point.location.id === seedId,
    )!;
  if (
    review.state === "stale" ||
    !seedReview.includedInDemand ||
    seedReview.state === "conflict" ||
    seedReview.state === "stale"
  )
    throw Error(
      "Review the actual seed path and current member references before repeating it; no implicit refresh is performed.",
    );
  const head = project.pieces.find(
    (piece) => piece.id === draft.head.pieceId && !piece.offcut,
  );
  if (
    !head ||
    !material(head.material).wood ||
    !["linear", "sheet"].includes(material(head.material).stockKind)
  )
    throw Error("Choose a current supported wood head-side member.");
  const solid = clipBox(head.size, head.cutPlanes),
    point = seed.entranceLocal;
  const faces = solid.faces.filter(
    (face) =>
      Math.abs(
        dot(face.normal, point) -
          dot(face.normal, solid.vertices[face.indices[0]]),
      ) <= EPS,
  );
  const distinct = faces.filter(
    (face, index) =>
      !faces
        .slice(0, index)
        .some(
          (old) =>
            Math.hypot(...sub(old.normal, face.normal)) <= EPS &&
            Math.abs(
              dot(old.normal, solid.vertices[old.indices[0]]) -
                dot(face.normal, solid.vertices[face.indices[0]]),
            ) <= EPS,
        ),
  );
  if (
    distinct.length !== 1 ||
    solid.faces.some(
      (face) =>
        dot(face.normal, point) >
        dot(face.normal, solid.vertices[face.indices[0]]) + EPS,
    )
  )
    throw Error(
      "The seed must be inside one unique retained face, away from sharp edges and removed regions.",
    );
  const face = distinct[0],
    polygonLocal = face.indices.map(
      (index) => [...solid.vertices[index]] as V3,
    );
  return {
    headId: head.id,
    receiverId: draft.receiver.pieceId,
    seed: structuredClone(seed),
    seedReview: structuredClone(seedReview),
    originLocal: [...point],
    normalLocal: [...face.normal],
    polygonLocal,
    originWorld: add(rotate(point, head.rotation), head.position),
    normalWorld: rotate(face.normal, head.rotation),
    polygonWorld: polygonLocal.map((point) =>
      add(rotate(point, head.rotation), head.position),
    ),
    kind: face.kind,
    planeIndex: face.planeIndex ?? null,
  };
}

/** Explicit UI operation: project the chosen part axis into this face, then show the resolved unit direction. */
export function fastenerLayoutDirection(
  face: FastenerLayoutFace,
  axis: 0 | 1 | 2,
  reverse = false,
): V3 {
  if (![0, 1, 2].includes(axis) || typeof reverse !== "boolean")
    throw Error("Choose an actual part axis and explicit direction.");
  const chosen: V3 = [0, 0, 0];
  chosen[axis] = reverse ? -1 : 1;
  return unit(
    sub(chosen, scale(face.normalLocal, dot(chosen, face.normalLocal))),
  );
}
function contextToken(project: Project, draft: FastenerPlan) {
  return token({
    id: project.id,
    draft,
    saved: project.fastenerPlans.find((plan) => plan.id === draft.id) ?? null,
    reservations: project.fastenerPlanLabels,
    pieces: project.pieces
      .map((piece) => {
        const stock = material(piece.material);
        return {
          id: piece.id,
          material: piece.material,
          size: piece.size,
          position: piece.position,
          rotation: piece.rotation,
          offcut: piece.offcut,
          cutPlanes: piece.cutPlanes,
          cutStock: piece.cutStock,
          stockLengthAxis: piece.stockLengthAxis,
          stockSize: stock.stockSize ?? stock.size,
          productReference: stock.productReference ?? null,
          wood: stock.wood,
          stockKind: stock.stockKind,
          shape: stock.shape ?? null,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    competing: project.fastenerPlans
      .filter((plan) => plan.id !== draft.id)
      .map((plan) => ({
        id: plan.id,
        head: plan.head,
        receiver: plan.receiver,
        productId: plan.productId,
        productEvidenceRevision: plan.productEvidenceRevision,
        locations: plan.locations,
        measurements: plan.measurements,
      })),
    evidence: woodFastenerProducts,
  });
}
function margin(face: FastenerLayoutFace, point: V3): number {
  return Math.min(
    ...face.polygonLocal.map((a, index) => {
      const edge = sub(
        face.polygonLocal[(index + 1) % face.polygonLocal.length],
        a,
      );
      return (
        dot(cross(edge, sub(point, a)), face.normalLocal) / Math.hypot(...edge)
      );
    }),
  );
}
function note(
  draft: FastenerPlan,
  spec: ResolvedFastenerLayoutSpec,
  face: FastenerLayoutFace,
  cells: readonly Pick<FastenerLayoutCandidate, "row" | "column">[],
): string {
  const v = scale(
    unit(cross(face.normalLocal, spec.uLocal)),
    spec.reverseV ? -1 : 1,
  );
  return `Software layout only; not physical measurements or a manufacturer schedule. Seed ${draft.label}/${face.seed.label}; local origin [${face.originLocal.join(",")}], U [${spec.uLocal.join(",")}], V [${v.join(",")}]; ${spec.countU}×${spec.countV} positions including seed, spacing U ${spec.spacingU} in${spec.countV > 1 ? `, V ${spec.spacingV} in` : ""}; user face margin ${spec.minimumFaceMargin === null ? "unknown" : `${spec.minimumFaceMargin} in`}; appended cells ${cells.map((cell) => `${cell.row + 1}/${cell.column + 1}`).join(",")}. Basis: ${spec.basis}`;
}
const withNote = (notes: string, appended: string) =>
  notes + (notes ? "\n\n" : "") + appended;
function selectedCandidates(
  preview: FastenerLayoutPreview,
  acceptedIds: readonly string[],
): FastenerLayoutCandidate[] {
  if (!acceptedIds.length || new Set(acceptedIds).size !== acceptedIds.length)
    throw Error(
      "Explicitly select one or more distinct eligible layout candidates.",
    );
  const selected = preview.candidates.filter((candidate) =>
    acceptedIds.includes(candidate.id),
  );
  if (
    selected.length !== acceptedIds.length ||
    selected.some((candidate) => !candidate.eligible)
  )
    throw Error(
      "Only explicitly selected current eligible layout candidates can be appended.",
    );
  return selected;
}
/** Presentation only. Append separately verifies current project/draft context and geometry. */
export function fastenerLayoutReceipt(
  raw: FastenerPlan,
  preview: FastenerLayoutPreview,
  acceptedIds: readonly string[],
): FastenerLayoutReceipt {
  const draft = fastenerPlanSchema.parse(raw);
  if (draft.id !== preview.planId)
    throw Error(
      "Choose the working draft associated with this layout preview.",
    );
  const selected = selectedCandidates(preview, acceptedIds),
    softwareNote = note(draft, preview.spec, preview.face, selected),
    notes = withNote(draft.notes, softwareNote);
  return { note: softwareNote, notes, noteFits: notes.length <= 3000 };
}
function eligibleChanges(
  before: readonly FastenerReview[],
  after: readonly FastenerReview[],
): string[] {
  const current = new Map(
    after.flatMap((review) =>
      review.locations.map((point) => [
        point.location.id,
        point.includedInDemand,
      ]),
    ),
  );
  return before.flatMap((review) =>
    review.locations
      .filter(
        (point) => point.includedInDemand && !current.get(point.location.id),
      )
      .map((point) => point.location.id),
  );
}
function build(
  project: Project,
  raw: FastenerPlan,
  input: FastenerLayoutSpec,
  ids?: readonly string[],
): FastenerLayoutPreview {
  const draft = fastenerPlanSchema.parse(raw),
    spec = fastenerLayoutSpecSchema.parse(input),
    face = fastenerLayoutFace(project, draft, spec.seedLocationId);
  if (Math.abs(dot(spec.uLocal, face.normalLocal)) > 1e-10)
    throw Error(
      "The explicit unit row direction must already be tangent to the retained face. Choose the axis-to-face helper explicitly.",
    );
  const count = spec.countU * spec.countV - 1;
  if (draft.locations.length + count > 100)
    throw Error(
      "This layout would exceed the plan's100-location limit, including existing points.",
    );
  if (draft.nextLocationNumber + count > 1000000)
    throw Error(
      "This layout would exhaust the durable fastener location labels.",
    );
  if (ids && ids.length !== count)
    throw Error("The layout preview candidate set changed.");
  const uLocal = [...spec.uLocal] as V3,
    vLocal = scale(
      unit(cross(face.normalLocal, uLocal)),
      spec.reverseV ? -1 : 1,
    );
  let transient = draft;
  const cells: { row: number; column: number; location: FastenerLocation }[] =
    [];
  for (let row = 0; row < spec.countV; row++)
    for (let column = 0; column < spec.countU; column++) {
      if (!row && !column) continue;
      transient = addFastenerLocation(transient);
      const last = transient.locations.length - 1,
        index = cells.length;
      const location: FastenerLocation = {
        ...transient.locations[last],
        ...(ids ? { id: ids[index] } : {}),
        name: `Layout from ${face.seed.label} · row ${row + 1} column ${column + 1}`,
        entranceLocal: add(
          add(face.originLocal, scale(uLocal, column * spec.spacingU)),
          scale(vLocal, row * (spec.spacingV ?? 0)),
        ),
        driveLocal: [...face.seed.driveLocal!],
      };
      transient = {
        ...transient,
        locations: transient.locations.map((old, i) =>
          i === last ? location : old,
        ),
      };
      cells.push({ row, column, location });
    }
  const before = currentReview(project, draft),
    after = currentReview(project, transient),
    review = structuredClone(after.review);
  const candidates: FastenerLayoutCandidate[] = cells.map((cell, index) => {
    const reviewed = review.locations.find(
      (point) => point.location.id === cell.location.id,
    )!;
    const faceMargin = margin(face, cell.location.entranceLocal!);
    const issues = [...reviewed.issues];
    if (
      spec.minimumFaceMargin !== null &&
      faceMargin < spec.minimumFaceMargin - EPS
    )
      issues.push({
        code: "layout-face-margin",
        severity: "error",
        locationId: cell.location.id,
        message:
          "This point fails the user's entered geometric margin from the actual retained face perimeter. This is not a manufacturer edge/end rule.",
      });
    const candidateReview = structuredClone(reviewed);
    if (issues.some((issue) => issue.severity === "error")) {
      candidateReview.state = "conflict";
      candidateReview.includedInDemand = false;
      candidateReview.issues = structuredClone(issues);
    }
    return {
      id: cell.location.id,
      index,
      row: cell.row,
      column: cell.column,
      location: structuredClone(cell.location),
      review: candidateReview,
      eligible:
        reviewed.includedInDemand &&
        reviewed.state !== "conflict" &&
        reviewed.state !== "stale" &&
        !issues.some((issue) => issue.severity === "error"),
      issues,
      faceMargin,
    };
  });
  for (const candidate of candidates) {
    const index = review.locations.findIndex(
      (point) => point.location.id === candidate.id,
    );
    review.locations[index] = candidate.review;
    for (const issue of candidate.issues.filter(
      (issue) => issue.code === "layout-face-margin",
    ))
      review.issues.push(issue);
  }
  review.activePointCount = review.locations.filter(
    (point) => point.includedInDemand,
  ).length;
  if (review.locations.some((point) => point.state === "conflict"))
    review.state = "conflict";
  const draftToken = contextToken(project, draft),
    softwareNote = note(draft, spec, face, candidates);
  return {
    token: token({
      draftToken,
      spec,
      locations: candidates.map((candidate) => candidate.location),
    }),
    draftToken,
    projectId: project.id,
    planId: draft.id,
    spec,
    face,
    uLocal,
    vLocal,
    candidates,
    candidateIds: candidates.map((candidate) => candidate.id),
    review,
    eligibleCount: candidates.filter((candidate) => candidate.eligible).length,
    pendingCount: candidates.filter(
      (candidate) =>
        candidate.eligible && candidate.review.state === "needs-measurements",
    ).length,
    excludedCount: candidates.filter((candidate) => !candidate.eligible).length,
    existingEligibilityChanges: eligibleChanges(before.reviews, after.reviews),
    softwareNote,
    noteFits: withNote(draft.notes, softwareNote).length <= 3000,
  };
}

/** Immutable preview. Provisional ordinary IDs/labels reserve nothing in the saved project. */
export function previewFastenerLayout(
  project: Project,
  draft: FastenerPlan,
  spec: FastenerLayoutSpec,
): FastenerLayoutPreview {
  return build(project, draft, spec);
}

/** Append explicitly accepted cells to the working draft only; ordinary Save is a separate action. */
export function appendFastenerLayout(
  project: Project,
  raw: FastenerPlan,
  preview: FastenerLayoutPreview,
  acceptedIds: readonly string[],
): FastenerPlan {
  const draft = fastenerPlanSchema.parse(raw);
  if (
    preview.projectId !== project.id ||
    preview.planId !== draft.id ||
    preview.draftToken !== contextToken(project, draft)
  )
    throw Error(
      "This layout preview is stale. Review the current draft and actual project again.",
    );
  const fresh = build(
    project,
    draft,
    preview.spec,
    preview.candidates.map((candidate) => candidate.id),
  );
  if (
    fresh.token !== preview.token ||
    canonicalFastenerValue(fresh.candidateIds) !==
      canonicalFastenerValue(preview.candidateIds) ||
    canonicalFastenerValue(
      fresh.candidates.map(({ id, index, row, column, location }) => ({
        id,
        index,
        row,
        column,
        location,
      })),
    ) !==
      canonicalFastenerValue(
        preview.candidates.map(({ id, index, row, column, location }) => ({
          id,
          index,
          row,
          column,
          location,
        })),
      )
  )
    throw Error(
      "This layout preview changed. Generate a fresh preview before appending.",
    );
  const selected = selectedCandidates(fresh, acceptedIds),
    receipt = fastenerLayoutReceipt(draft, fresh, acceptedIds);
  if (!receipt.noteFits)
    throw Error(
      "The software layout receipt would exceed the plan's3000-character notes limit. Shorten the new basis or preserve your old notes elsewhere explicitly; nothing has been truncated.",
    );
  const appended = fastenerPlanSchema.parse({
    ...draft,
    updatedAt: new Date().toISOString(),
    notes: receipt.notes,
    locations: [
      ...draft.locations,
      ...selected.map((candidate) => candidate.location),
    ],
    nextLocationNumber: draft.nextLocationNumber + fresh.candidates.length,
  });
  const before = currentReview(project, draft),
    after = currentReview(project, appended);
  if (eligibleChanges(before.reviews, after.reviews).length)
    throw Error(
      "This layout would exclude an existing valid location. Resolve the duplicate or conflicting paths before appending.",
    );
  if (
    selected.some(
      (candidate) =>
        !after.review.locations.find(
          (location) => location.location.id === candidate.id,
        )?.includedInDemand,
    )
  )
    throw Error(
      "A selected path is no longer eligible. Review a fresh layout before appending.",
    );
  return appended;
}
