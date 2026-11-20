import { getHingeProduct, hingeProductId } from "./hingeProducts";
import {
  HINGE_STOCK_HISTORY_LIMIT,
  hingeStockCutSchema,
  hingeStockSnapshotSchema,
  hingeStockSourceSchema,
  type HingeStockCut,
  type HingeStockSnapshot,
  type HingeStockSource,
} from "./hingeStockSchema";

export type HingeStockState =
  "needs-measurements" | "conflict" | "geometry-reviewed";
export type HingeStockIssue = {
  code: string;
  severity: "error" | "review";
  message: string;
  cutIds?: string[];
};
export type HingeSegmentEnd = {
  kind: "source-start" | "source-end" | "cut-before" | "cut-after";
  cutId: string | null;
};
export type HingeStockSegment = {
  id: string;
  sourceId: string;
  start: number;
  length: number;
  startEnd: HingeSegmentEnd;
  endEnd: HingeSegmentEnd;
};
export type HingeStockReview = {
  source: HingeStockSource;
  state: HingeStockState;
  issues: HingeStockIssue[];
  segments: HingeStockSegment[];
};

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

/** Physical identity only; notes, observation times, purchase links and history do not move a cut. */
export function sourceFingerprint(source: HingeStockSource): string {
  const value = canonical({
    id: source.id,
    productId: source.productId,
    evidenceRevision: source.evidenceRevision,
    usableLength: source.usableLength,
    cuts: source.cuts
      .map(({ id, position, kerf }) => ({ id, position, kerf }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  let hash = 14695981039346656037n;
  for (const char of value)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(char.charCodeAt(0))) * 1099511628211n,
    );
  return `hinge-stock-v1-${hash.toString(16).padStart(16, "0")}`;
}

export function makeHingeStockSource(
  purchaseSelectionId: string | null = null,
): HingeStockSource {
  return hingeStockSourceSchema.parse({
    id: crypto.randomUUID(),
    productId: hingeProductId,
    evidenceRevision: getHingeProduct(hingeProductId)!.evidenceRevision,
    purchaseSelectionId,
    usableLength: null,
    basis: "",
    measuredAt: null,
    cuts: [],
    notes: "",
    referenceHistory: [],
  });
}
export function makeHingeStockCut(): HingeStockCut {
  return hingeStockCutSchema.parse({
    id: crypto.randomUUID(),
    position: null,
    kerf: null,
    basis: "",
    measuredAt: null,
  });
}

export function hingeSegmentId(
  sourceId: string,
  leftCutId: string | null,
  rightCutId: string | null,
): string {
  return `hinge-segment:${sourceId}:${leftCutId ?? "start"}:${rightCutId ?? "end"}`;
}

/** A feasible measured1D cut layout, not a manufactured profile or installed hinge assessment. */
export function reviewHingeStock(
  raw: HingeStockSource,
  now = Date.now(),
): HingeStockReview {
  const source = hingeStockSourceSchema.parse(raw),
    issues: HingeStockIssue[] = [],
    product = getHingeProduct(source.productId);
  const issue = (
    code: string,
    severity: HingeStockIssue["severity"],
    message: string,
    cutIds?: string[],
  ) => issues.push({ code, severity, message, ...(cutIds ? { cutIds } : {}) });
  const provenance = (
    basis: string,
    at: string | null,
    description: string,
    cutIds?: string[],
  ) => {
    if (
      !basis.trim() ||
      !at ||
      !Number.isFinite(Date.parse(at)) ||
      Date.parse(at) > now
    )
      issue(
        "measurement-provenance",
        "review",
        `${description}: record a nonfuture measurement date and basis for the actual proposed stock/cut dimensions.`,
        cutIds,
      );
  };
  if (!product || product.evidenceRevision !== source.evidenceRevision)
    issue(
      "product-evidence",
      "review",
      "The hinge product evidence differs from this source's captured revision. Review the exact supplied product before using the cut layout.",
    );
  if (source.usableLength === null)
    issue(
      "source-length",
      "review",
      "Measure the actual usable hinge length; nominal48in and the retailer48.03in field do not fill this value.",
    );
  else provenance(source.basis, source.measuredAt, "Hinge source");
  for (const cut of source.cuts) {
    if (cut.position === null || cut.kerf === null)
      issue(
        "cut-measurements",
        "review",
        "Enter the cut's source-local kerf start and actual proposed metal-cut kerf. No wood-cut kerf is assumed.",
        [cut.id],
      );
    else provenance(cut.basis, cut.measuredAt, "Hinge cut", [cut.id]);
  }
  const known = source.cuts
    .filter(
      (cut): cut is HingeStockCut & { position: number; kerf: number } =>
        cut.position !== null && cut.kerf !== null,
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  // Only numerical roundoff is tolerated; this is not a manufacturing allowance.
  const epsilon =
    Number.EPSILON *
    64 *
    Math.max(
      1,
      source.usableLength ?? 0,
      ...known.flatMap((cut) => [cut.position, cut.kerf]),
    );
  let previousEnd = 0,
    previousCutId: string | null = null;
  for (const cut of known) {
    const end = cut.position + cut.kerf;
    if (
      source.usableLength !== null &&
      (cut.position > source.usableLength + epsilon ||
        end > source.usableLength + epsilon)
    )
      issue(
        "cut-outside-source",
        "error",
        "A cut or its removed kerf extends beyond the measured usable source.",
        [cut.id],
      );
    if (cut.position < previousEnd - epsilon)
      issue(
        "overlapping-kerfs",
        "error",
        "Two removed kerf intervals overlap; revise their actual cut positions.",
        [...(previousCutId ? [previousCutId] : []), cut.id],
      );
    else if (cut.position - previousEnd <= epsilon)
      issue(
        "zero-retained-segment",
        "error",
        "A source end or neighboring kerfs leave no positive retained hinge segment.",
        [...(previousCutId ? [previousCutId] : []), cut.id],
      );
    previousEnd = Math.max(previousEnd, end);
    previousCutId = cut.id;
  }
  if (
    source.usableLength !== null &&
    known.length &&
    source.usableLength - previousEnd <= epsilon
  )
    issue(
      "zero-retained-segment",
      "error",
      "The final kerf leaves no positive retained end segment.",
      [known.at(-1)!.id],
    );
  const state: HingeStockState = issues.some(
    (entry) => entry.severity === "error",
  )
    ? "conflict"
    : issues.length
      ? "needs-measurements"
      : "geometry-reviewed";
  if (state !== "geometry-reviewed")
    return { source, state, issues, segments: [] };
  const segments: HingeStockSegment[] = [];
  let start = 0,
    leftCutId: string | null = null;
  for (const cut of known) {
    segments.push({
      id: hingeSegmentId(source.id, leftCutId, cut.id),
      sourceId: source.id,
      start,
      length: cut.position - start,
      startEnd: {
        kind: leftCutId ? "cut-after" : "source-start",
        cutId: leftCutId,
      },
      endEnd: { kind: "cut-before", cutId: cut.id },
    });
    start = cut.position + cut.kerf;
    leftCutId = cut.id;
  }
  segments.push({
    id: hingeSegmentId(source.id, leftCutId, null),
    sourceId: source.id,
    start,
    length: source.usableLength! - start,
    startEnd: {
      kind: leftCutId ? "cut-after" : "source-start",
      cutId: leftCutId,
    },
    endEnd: { kind: "source-end", cutId: null },
  });
  return { source, state, issues, segments };
}

export function hingeStockSnapshot(
  source: HingeStockSource,
): HingeStockSnapshot {
  const { id: _id, referenceHistory: _history, ...snapshot } = source;
  return hingeStockSnapshotSchema.parse(snapshot);
}
/** Explicit user edit only; even an old snapshot remains inspectable after later corrections. */
export function updateHingeStockSource(
  source: HingeStockSource,
  patch: Partial<HingeStockSnapshot>,
  basis: string,
  at = new Date().toISOString(),
): HingeStockSource {
  const previous = hingeStockSnapshot(source),
    next = hingeStockSnapshotSchema.parse({ ...previous, ...patch });
  if (canonical(previous) === canonical(next)) return source;
  if (source.referenceHistory.length >= HINGE_STOCK_HISTORY_LIMIT)
    throw Error(
      "Hinge stock history is full; export it before starting a new physical source. No earlier history was removed.",
    );
  return hingeStockSourceSchema.parse({
    ...next,
    id: source.id,
    referenceHistory: [
      ...source.referenceHistory,
      { id: crypto.randomUUID(), kind: "edit", at, basis, previous, next },
    ],
  });
}

/** Retained sources must preserve the exact saved history prefix; explicit removal is allowed. */
export function assertHingeStockHistoryPrefix(
  previous: readonly HingeStockSource[],
  next: readonly HingeStockSource[],
): void {
  const before = new Map(previous.map((source) => [source.id, source]));
  for (const source of next) {
    const old = before.get(source.id);
    if (
      old &&
      canonical(
        source.referenceHistory.slice(0, old.referenceHistory.length),
      ) !== canonical(old.referenceHistory)
    )
      throw Error(
        "Saved hinge stock history cannot be truncated or rewritten.",
      );
  }
}

/** Undo restores active values while preserving exact source edit receipts across branches. */
export function retainHingeStockHistory(
  target: readonly HingeStockSource[],
  current: readonly HingeStockSource[],
): HingeStockSource[] {
  const currentById = new Map(current.map((source) => [source.id, source]));
  return target.map((source) => {
    const old = currentById.get(source.id);
    if (!old) return hingeStockSourceSchema.parse(source);
    const rows = [...old.referenceHistory],
      byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of source.referenceHistory) {
      const existing = byId.get(row.id);
      if (existing && canonical(existing) !== canonical(row))
        throw Error(
          "Conflicting hinge stock history cannot be silently rewritten.",
        );
      if (!existing) {
        rows.push(row);
        byId.set(row.id, row);
      }
    }
    return hingeStockSourceSchema.parse({ ...source, referenceHistory: rows });
  });
}
