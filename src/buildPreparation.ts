import type { ConnectionCoverage } from "./connectionCoverage";
import { describeAssemblyOrder, reviewAssemblyOrder } from "./assemblyOrder";
import { inspectCutStock } from "./cutStock";
import type { BomRow, Finding } from "./engine";
import type { ConnectionReviewScope } from "./GuideConnections";
import type { homeDepotShoppingList } from "./handoff";
import type { ProjectLidTravelChecks } from "./lidTravelFindings";
import { material, type MaterialId, type Project } from "./model";
import { modeledWoodContactDetail, modeledWoodContactScope, type ModeledWoodContactReview } from "./modeledWoodContacts";
import { motionTestFindings, type MotionTestVariant, type ProjectMotionReviews } from "./mechanismMotion";
import { offcutCutRows } from "./offcutCutGuide";
import { ensurePartLabels } from "./partLabels";
import { retailerName } from "./retailers";
import type { StockCutSequence } from "./stockCutSequence";
import type { supplyRows } from "./supplies";
import { sunliteTapeProductId } from "./sunliteTapeSchema";
import { edgeBandingProductIds } from "./edgeBandingReference";
import { selectedToolsForProject } from "./toolGuide";
import { toolChecklist } from "./tools";
import { fieldTreatmentReference, fieldTreatmentScope, fieldTreatmentTitle, isPressureTreated, treatedWoodCuts } from "./treatedWood";

export type BuildPreparationAction =
  | { kind: "part"; id: string }
  | { kind: "offcut"; id: string }
  | { kind: "guide-step"; id: string }
  | { kind: "connections"; scope: ConnectionReviewScope }
  | { kind: "stock"; id: MaterialId }
  | { kind: "offcut-cut"; id: string }
  | { kind: "motion"; planId: string; variant: MotionTestVariant; findingId: string; scenarioId?: string }
  | { kind: "lid"; sectionId: string; findingId: string }
  | { kind: "checks" | "list" | "handoff" | "tools" | "glazing-tape" | "edge-banding" };

export type BuildPreparationItem = {
  id: string;
  title: string;
  detail: string;
  action: BuildPreparationAction;
};

export type BuildPreparationGroup = {
  id: "order" | "cuts" | "treated-wood" | "connections" | "wood-contacts" | "motion" | "shopping" | "tools" | "checks";
  title: string;
  empty: string;
  intro?: string;
  reference?: { label: string; url: string };
  reviewCount?: number;
  items: BuildPreparationItem[];
};

type PreparationInputs = {
  stock: readonly BomRow[];
  supplies: ReturnType<typeof supplyRows>;
  sequences: ReadonlyMap<string, readonly StockCutSequence[]>;
  connections: ConnectionCoverage;
  findings: readonly Finding[];
  motions: ProjectMotionReviews;
  lids: ProjectLidTravelChecks;
  woodContacts?: ModeledWoodContactReview;
  handoff?: ReturnType<typeof homeDepotShoppingList>;
};

export const buildPreparationScope =
  "Review the saved plan, actual stock and tools before cutting or assembly. Resolve site and installation requirements for the build.";

export function assemblyOrderPreparation(
  findings: ReturnType<typeof reviewAssemblyOrder>,
): BuildPreparationGroup[] {
  if (!findings.length) return [];
  return [{
    id: "order",
    title: "Assembly order",
    empty: "The modeled stages have no listed order conflicts.",
    items: findings.map((finding) => ({
      id: finding.current.step.id,
      title: `Step ${finding.current.number} · ${finding.current.step.title}`,
      detail: describeAssemblyOrder(finding),
      action: { kind: "guide-step", id: finding.current.step.id },
    })),
  }];
}

const count = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

export function connectionPreparationItems(coverage: Pick<ConnectionCoverage, "stages" | "gaps">) {
  const pending: BuildPreparationItem[] = coverage.stages.flatMap((stage) => {
    const gaps = [
      [
        stage.noIntentPartIds.length,
        "part without a connection plan",
        "parts without connection plans",
      ],
      [
        stage.startedPartIds.length,
        "part with setup started",
        "parts with setup started",
      ],
      [
        stage.pendingPartIds.length,
        "part with details pending",
        "parts with details pending",
      ],
      [
        stage.legacyPartIds.length,
        "part with a quantity-only record",
        "parts with quantity-only records",
      ],
      [
        stage.excludedPartIds.length,
        "part with a changed or conflicting reference",
        "parts with changed or conflicting references",
      ],
    ] as const;
    const detail = gaps
      .filter(([n]) => n)
      .map(([n, singular, plural]) => count(n, singular, plural));
    if (!detail.length) return [];
    return [
      {
        id: `${stage.ownerId}/${stage.key}`,
        title: stage.title,
        detail: `${detail.join(" · ")}.`,
        action: {
          kind: "connections",
          scope: {
            title: stage.title,
            memberIds: stage.memberIds,
            ownerId: stage.ownerId,
            stageKey: stage.key,
            stepId: stage.stepId ?? undefined,
          },
        },
      },
    ];
  });
  // Plans whose references all disappeared have a review scope even without an active assembly.
  for (const gap of coverage.gaps.filter(
    ({ stageKey }) => stageKey === "unassigned-intents",
  )) {
    pending.push({
      id: gap.id,
      title: gap.title,
      detail: "Review saved connection references without a current assembly.",
      action: {
        kind: "connections",
        scope: {
          title: gap.title,
          memberIds: gap.pieceIds,
          ownerId: gap.ownerId,
          stageKey: gap.stageKey,
          intentIds: gap.intentIds,
        },
      },
    });
  }
  return pending;
}

function woodContactPreparation(project: Project, input: PreparationInputs): BuildPreparationGroup[] {
  const review = input.woodContacts;
  if (!review || (!review.pairs.length && !review.limited)) return [];
  const shown = review.needsReview.slice(0, 12);
  const items: BuildPreparationItem[] = shown.map((row) => ({
    id: row.id,
    title: row.title,
    detail: modeledWoodContactDetail(row),
    action: {
      kind: "connections",
      scope: { title: row.title, memberIds: row.memberIds, focusPair: row.memberIds },
    },
  }));
  if (review.needsReview.length > shown.length || review.limited) {
    items.push({
      id: "all-modeled-wood-contacts",
      title: "Open scanned wood contacts",
      detail: `${count(review.needsReview.length, "found pair")} to review. ${review.limited ? "This scan reached its search limit. " : ""}Focus on individual members for a closer search.`,
      action: {
        kind: "connections",
        scope: {
          title: "Modeled wood contacts",
          memberIds: input.connections.parts.map(({ pieceId }) => pieceId),
          ownerId: project.id,
          stageKey: "all-connections",
          modeledContactList: true,
        },
      },
    });
  }
  return [{
    id: "wood-contacts",
    title: "Modeled wood contacts",
    intro: `${count(review.touchingCount, "touching pair")} found. ${modeledWoodContactScope}`,
    reviewCount: review.needsReview.length,
    empty: "The scanned contacts have a recorded joint detail, reviewed location or removable bearing decision.",
    items,
  }];
}

export function buildPreparation(
  project: Project,
  input: PreparationInputs,
): BuildPreparationGroup[] {
  const hasMotion = input.motions.length > 0 || input.lids.length > 0;
  const hasBuild = project.pieces.some(({ offcut }) => !offcut) ||
    project.supplies.length > 0 || hasMotion || !!project.woodJointDecisions?.length;
  if (!hasBuild && !project.pieces.some(({ material: id }) => isPressureTreated(id)))
    return [];
  const labels = new Map(
    ensurePartLabels(project).partLabels.map(({ partId, label }) => [
      partId,
      label,
    ]),
  );
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const cuts: BuildPreparationItem[] = [];
  for (const row of input.stock)
    for (const part of row.oversizedParts)
      cuts.push({
        id: `oversize-${part.id}`,
        title: `${labels.get(part.id) ?? ""} · ${part.name}`,
        detail: `Exceeds the modeled ${material(row.id).name} stock. Change the cut dimensions or select another blank.`,
        action: { kind: "part", id: part.id },
      });
  const inspection = inspectCutStock(project);
  const treated = treatedWoodCuts(project, inspection);
  const treatment: BuildPreparationGroup[] = treated.length ? [{
    id: "treated-wood",
    title: fieldTreatmentTitle,
    intro: fieldTreatmentScope,
    reference: fieldTreatmentReference,
    empty: "No modeled field cuts or holes.",
    items: treated.map(({ piece, detail }) => ({
      id: piece.id,
      title: `${labels.get(piece.id)} · ${piece.name}`,
      detail,
      action: { kind: piece.offcut ? "offcut" : "part", id: piece.id },
    })),
  }] : [];
  if (!hasBuild) return treatment;
  const invalidSources = inspection.invalid;
  for (const row of offcutCutRows(project, inspection)) {
    if (!row.issues.length) continue;
    cuts.push({
      id: `offcut-${row.id}`,
      title: row.title,
      detail: row.issues.join(" "),
      action: row.retainedPartId && pieces.has(row.retainedPartId)
        ? { kind: "part", id: row.retainedPartId }
        : row.retainedPartId ? { kind: "list" } : { kind: "offcut-cut", id: row.id },
    });
  }
  for (const source of invalidSources) {
    const part = pieces.get(source.pieceId);
    cuts.push({
      id: `source-${source.sourceId}`,
      title: part?.name ?? "Recorded cut source",
      detail: source.detail,
      action:
        part && !part.offcut ? { kind: "part", id: part.id } : { kind: "list" },
    });
  }
  for (const [stock, sequences] of input.sequences)
    for (const sequence of sequences) {
      if (!sequence.review) continue;
      cuts.push({
        id: `layout-${stock}-${sequence.title}`,
        title: `${material(sequence.layout.materialId).name} · ${sequence.title}`,
        detail: sequence.review,
        action: { kind: "stock", id: sequence.layout.materialId },
      });
    }

  const shopping: BuildPreparationItem[] = [];
  const handoff = input.handoff;
  const retailer = retailerName(project.retailer);
  if (handoff) {
    for (const need of handoff.plannedNeeds)
      shopping.push({
        id: `planned-${need.id}`,
        title: need.name,
        detail: [
          need.basis,
          need.missing === null ? null : `${need.quantityText} to select`,
          need.issue,
        ]
          .filter(Boolean)
          .join(" · "),
        action: {
          kind: edgeBandingProductIds.some((id) => id === need.id)
            ? "edge-banding"
            : need.id === sunliteTapeProductId && project.sunliteTapeCuts?.length
              ? "glazing-tape" : "handoff",
        },
      });
    const sourceProblems = new Set(invalidSources.map(({ detail }) => detail));
    for (const [index, review] of handoff.reviews.entries()) {
      if (
        review.reason === "Exceeds stock dimensions" ||
        sourceProblems.has(review.reason)
      )
        continue;
      shopping.push({
        id: `match-${index}`,
        title: review.name,
        detail: review.reason,
        action: { kind: "list" },
      });
    }
    for (const item of handoff.items) {
      if (item.snapshot && item.snapshot.available >= item.quantity) continue;
      const detail = item.snapshot
        ? `Store snapshot reports ${item.snapshot.available} available for ${item.quantity} planned purchase units.`
        : project.store
          ? `Record a current ${retailer} snapshot at store ${project.store}, ZIP ${project.zip}.`
          : `Choose a ${retailer} store for ZIP ${project.zip} and record a current snapshot.`;
      shopping.push({
        id: `stock-${item.productId}`,
        title: item.name,
        detail,
        action: { kind: "list" },
      });
    }
  } else {
    for (const row of input.stock) {
      if (
        row.quantity <= 0 ||
        (row.inventory && row.inventory.available >= row.quantity)
      )
        continue;
      shopping.push({
        id: `stock-${row.id}`,
        title: material(row.id).name,
        detail: row.inventory
          ? `Store snapshot reports ${row.inventory.available} available for ${row.quantity} planned purchase units.`
          : row.supplier
            ? `Confirm the order with ${row.supplier.seller}.`
            : `Review the product and store snapshot in List.`,
        action: { kind: "list" },
      });
    }
    for (const row of input.supplies)
      if (row.issues.length)
        shopping.push({
          id: `supply-${row.productId}`,
          title: row.name,
          detail: row.issues[0],
          action: { kind: "list" },
        });
  }

  const toolReview = toolChecklist(
    project,
    selectedToolsForProject(project).tools,
  );
  const tools = toolReview.requirements
    .filter(({ status }) => status === "unknown")
    .map((row): BuildPreparationItem => ({
      id: row.capability,
      title: row.name,
      detail:
        row.necessity === "conditional" && row.condition
          ? row.condition
          : "Review a tool and accessory for this required operation.",
      action: { kind: "tools" },
    }));
  const warn = input.findings.filter(({ severity }) => severity !== "info");
  const checks: BuildPreparationItem[] = warn.length
    ? [
        {
          id: "model-review",
          title: count(warn.length, "model finding"),
          detail:
            "Open Checks for geometry, installation and purchasing findings.",
          action: { kind: "checks" },
        },
      ]
    : [];
  const motions: BuildPreparationItem[] = input.motions.flatMap(({ plan, baseline, saved, scenarios }) => {
    const variants = [
      { variant: "baseline" as const, result: baseline, context: saved || scenarios.length ? " · Motion alone" : "", scenarioId: undefined },
      { variant: "saved" as const, result: saved, context: " · Saved test", scenarioId: undefined },
      ...scenarios.map(({ id, name, result }) => ({ variant: "saved" as const, result, context: ` · ${name}`, scenarioId: id })),
    ];
    return variants.flatMap(({ variant, result, context, scenarioId }) => {
      if (!result) return [];
      return motionTestFindings(project, result, !!scenarioId).map((finding): BuildPreparationItem => ({
        id: `${plan.id}/${scenarioId ?? variant}/${finding.id}`,
        title: `${plan.label}${context}`,
        detail: finding.detail,
        action: { kind: "motion", planId: plan.id, variant, findingId: finding.id, ...(scenarioId && { scenarioId }) },
      }));
    });
  });
  const lids = input.lids.flatMap(({ section, findings }) =>
    findings.map((finding): BuildPreparationItem => ({
      id: `${section.id}/lid/${finding.id}`,
      title: `${section.name} · Lid travel`,
      detail: finding.detail,
      action: { kind: "lid", sectionId: section.id, findingId: finding.id },
    })),
  );
  const motionGroup: BuildPreparationGroup = {
    id: "motion",
    title: "Motion and clearance",
    empty: "The current motion tests have no listed clearance findings.",
    items: [...lids, ...motions],
  };
  return [
    ...assemblyOrderPreparation(reviewAssemblyOrder(project)),
    {
      id: "cuts",
      title: "Stock and cuts",
      empty: "The current layouts have no listed stock conflicts.",
      items: cuts,
    },
    ...treatment,
    {
      id: "connections",
      title: "Assembly connections",
      empty: "The current assembly rows have no listed plan gaps.",
      items: connectionPreparationItems(input.connections),
    },
    ...woodContactPreparation(project, input),
    ...(hasMotion ? [motionGroup] : []),
    {
      id: "shopping",
      title: "Shopping and availability",
      empty:
        "The current shopping rows have no listed quantity or snapshot issues.",
      items: shopping,
    },
    {
      id: "tools",
      title: "Tools and accessories",
      empty: "The current operations have documented tool selections.",
      items: tools,
    },
    {
      id: "checks",
      title: "Design checks",
      empty: "Checks has no current warnings for the saved model.",
      items: checks,
    },
  ];
}

const md = (value: string) =>
  value.replace(/[\r\n\t]+/g, " ").replace(/[\\`*_{}\[\]<>|!#]/g, "\\$&");

export function buildPreparationMarkdown(
  groups: readonly BuildPreparationGroup[],
) {
  if (!groups.length) return "";
  return [
    "## Build preparation",
    "",
    buildPreparationScope,
    "",
    ...groups.flatMap(({ title, empty, intro, reference, items }) => [
      `### ${title}`,
      "",
      ...(intro ? [intro, ""] : []),
      ...(reference ? [`[${md(reference.label)}](${reference.url})`, ""] : []),
      ...(items.length
        ? items.map((item) => `- ${md(item.title)} · ${md(item.detail)}`)
        : [empty]),
      "",
    ]),
    "",
  ].join("\n");
}
