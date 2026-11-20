import { z } from "zod";
import { material, type Project, type V3 } from "./model";
import {
  fastenerPlanSchema,
  emptyFastenerMeasurements,
  type FastenerPartRef,
} from "./fasteningSchema";
import {
  fastenerReviews,
  saveFastenerPlan,
  type FastenerReview,
} from "./fastenings";
import {
  appendFastenerReferenceHistory,
  canonicalFastenerValue,
  captureFastenerReference,
} from "./fastenerReferences";
import { getWoodFastenerProduct } from "./fastenerProducts";

const choiceSchema = z.strictObject({
  headPieceId: z.string().uuid(),
  receiverPieceId: z.string().uuid(),
  locationMode: z.enum(["clear", "retain-local"]),
  basis: z.string().trim().min(1).max(1000),
});
export type FastenerRemapChoice = z.infer<typeof choiceSchema>;
export type FastenerRemapPreview = {
  token: string;
  plan: Project["fastenerPlans"][number];
  review: FastenerReview;
  comparison: {
    previousHead: FastenerPartRef;
    previousReceiver: FastenerPartRef;
    selectedHead: FastenerPartRef;
    selectedReceiver: FastenerPartRef;
    locationMode: FastenerRemapChoice["locationMode"];
    clearedLocationCount: number;
    retainedLocationCount: number;
    measurementsReset: true;
  };
};
function tokenHash(value: unknown) {
  let hash = 14695981039346656037n;
  for (const char of canonicalFastenerValue(value))
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(char.charCodeAt(0))) * 1099511628211n,
    );
  return `fastener-remap-v1-${hash.toString(16).padStart(16, "0")}`;
}
function physical(piece: Project["pieces"][number] | undefined) {
  if (!piece) return null;
  const m = material(piece.material);
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
    stockSize: m.stockSize ?? m.size,
    productRegistryRef: m.productReference ?? null,
    wood: m.wood,
    stockKind: m.stockKind,
  };
}
const near = (a: V3, b: V3) => Math.hypot(...a.map((v, i) => v - b[i])) <= 1e-6;
const refIntent = ({ baseline: _baseline, ...reference }: FastenerPartRef) =>
  reference;
function reviewInput(review: FastenerReview) {
  const issue = (entry: FastenerReview["issues"][number]) => ({
    code: entry.code,
    severity: entry.severity,
    locationId: entry.locationId ?? null,
    pieceIds: [...(entry.pieceIds ?? [])].sort(),
  });
  return {
    state: review.state,
    activePointCount: review.activePointCount,
    issues: review.issues.map(issue),
    locations: review.locations.map((entry) => ({
      id: entry.location.id,
      state: entry.state,
      includedInDemand: entry.includedInDemand,
      issues: entry.issues.map(issue),
    })),
  };
}
export function previewFastenerRemap(
  project: Project,
  planId: string,
  raw: FastenerRemapChoice,
): FastenerRemapPreview {
  const choice = choiceSchema.parse(raw),
    saved = project.fastenerPlans.find((plan) => plan.id === planId);
  if (!saved) throw Error("This saved fastening plan is no longer present.");
  if (choice.headPieceId === choice.receiverPieceId)
    throw Error("Choose two distinct replacement members.");
  if (
    choice.headPieceId === saved.head.pieceId &&
    choice.receiverPieceId === saved.receiver.pieceId
  )
    throw Error(
      "Choose at least one different actual member. Same-ID changes use reference refresh.",
    );
  const selected = [choice.headPieceId, choice.receiverPieceId].map((id) => {
    const piece = project.pieces.find((p) => p.id === id && !p.offcut);
    if (
      !piece ||
      !material(piece.material).wood ||
      !["linear", "sheet"].includes(material(piece.material).stockKind)
    )
      throw Error(
        "Choose current active wood members in this project; missing parts, offcuts and other substrates cannot be mapped.",
      );
    return piece;
  });
  const at = new Date().toISOString(),
    head = captureFastenerReference(project, selected[0], at),
    receiver = captureFastenerReference(project, selected[1], at);
  const product = getWoodFastenerProduct(saved.productId);
  if (!product)
    throw Error(
      "The selected screw product has no current reviewed source evidence.",
    );
  let plan = fastenerPlanSchema.parse({
    ...saved,
    updatedAt: at,
    head,
    receiver,
    productEvidenceRevision: product.evidenceRevision,
    measurements: emptyFastenerMeasurements(),
    locations: saved.locations.map((location) =>
      choice.locationMode === "clear"
        ? { ...location, entranceLocal: null, driveLocal: null }
        : structuredClone(location),
    ),
  });
  plan = fastenerPlanSchema.parse(
    appendFastenerReferenceHistory(
      plan,
      saved,
      "remap",
      choice.basis,
      choice.locationMode,
      at,
    ),
  );
  const candidate = {
      ...project,
      fastenerPlans: project.fastenerPlans.map((p) =>
        p.id === plan.id ? plan : p,
      ),
    },
    reviews = fastenerReviews(candidate),
    review = reviews.find((r) => r.plan.id === plan.id)!;
  const related = reviews.filter(
    (other) =>
      other.plan.id !== plan.id &&
      other.locations.some(
        (point) =>
          point.state !== "stale" &&
          point.entranceWorld &&
          point.driveWorld &&
          review.locations.some(
            (current) =>
              current.entranceWorld &&
              current.driveWorld &&
              near(point.entranceWorld!, current.entranceWorld) &&
              near(point.driveWorld!, current.driveWorld),
          ),
      ),
  );
  const contextIds = new Set([
    saved.head.pieceId,
    saved.receiver.pieceId,
    head.pieceId,
    receiver.pieceId,
  ]);
  for (const entry of [review, ...related]) {
    contextIds.add(entry.plan.head.pieceId);
    contextIds.add(entry.plan.receiver.pieceId);
    for (const issue of [
      ...entry.issues,
      ...entry.locations.flatMap((location) => location.issues),
    ])
      for (const id of issue.pieceIds ?? []) contextIds.add(id);
  }
  const {
    updatedAt: _updated,
    createdAt: _created,
    nextLocationNumber: _counter,
    ...savedIntent
  } = saved;
  const token = tokenHash({
    projectId: project.id,
    savedIntent,
    choice,
    members: [...contextIds].sort().map((id) => ({
      id,
      actual: physical(project.pieces.find((p) => p.id === id)),
    })),
    review: reviewInput(review),
    otherPaths: related.map((other) => ({
      id: other.plan.id,
      head: refIntent(other.plan.head),
      receiver: refIntent(other.plan.receiver),
      productId: other.plan.productId,
      productEvidenceRevision: other.plan.productEvidenceRevision,
      locations: other.plan.locations,
      measurements: other.plan.measurements,
      review: reviewInput(other),
    })),
  });
  return {
    token,
    plan,
    review,
    comparison: {
      previousHead: structuredClone(saved.head),
      previousReceiver: structuredClone(saved.receiver),
      selectedHead: head,
      selectedReceiver: receiver,
      locationMode: choice.locationMode,
      clearedLocationCount:
        choice.locationMode === "clear" ? saved.locations.length : 0,
      retainedLocationCount:
        choice.locationMode === "retain-local" ? saved.locations.length : 0,
      measurementsReset: true,
    },
  };
}
export function applyFastenerRemap(
  project: Project,
  planId: string,
  choice: FastenerRemapChoice,
  token: string,
): Project {
  const current = project.fastenerPlans.find((p) => p.id === planId);
  if (
    current &&
    current.head.pieceId === choice.headPieceId &&
    current.receiver.pieceId === choice.receiverPieceId
  )
    throw Error(
      "This mapping is already current or changed. Create a new preview before applying again.",
    );
  const preview = previewFastenerRemap(project, planId, choice);
  if (preview.token !== token)
    throw Error(
      "The saved plan, selected members or path context changed. Preview the mapping again before applying.",
    );
  return saveFastenerPlan(project, preview.plan);
}
