import type { Project } from "./model";
import {
  findRetailerProduct,
  type CatalogToolCapabilityEvidence,
} from "./retailerCatalog";
import { toolChecklist, type SelectedTool } from "./tools";
import { toolCapabilities, type ToolCapability } from "./toolCapabilities";
export type ToolSelectionRecord = { productId: string; checkedAt: string };
export type ToolProject = Project & { toolSelections?: ToolSelectionRecord[] };
export const toolEvidenceTypeLabels: Record<
  CatalogToolCapabilityEvidence["evidenceType"],
  string
> = {
  "manufacturer-manual": "Manufacturer instructions",
  "manufacturer-use-instructions": "Manufacturer use instructions",
  "manufacturer-product-specification": "Manufacturer product specification",
  "retailer-hosted-manufacturer-document":
    "Manufacturer document hosted by retailer",
};
export type ReviewedToolEvidence = Omit<
  CatalogToolCapabilityEvidence,
  "sourceRefs"
> & {
  sources: { url: string; verifiedAt: string; note: string }[];
};
export type ToolSelectionReview = {
  productId: string;
  name: string;
  checkedAt: string;
  status: "reviewed-capabilities" | "unknown";
  issues: string[];
  manufacturerUrls: string[];
  /** Compatibility alias: these are source notes, which can be specifications or use instructions. */
  manualNotes: string[];
  evidence: ReviewedToolEvidence[];
};
/** Persisted review is not ownership, readiness, operating capacity, or live retailer stock. */
export function selectedToolsForProject(
  project: ToolProject,
  now = Date.now(),
) {
  const tools: SelectedTool[] = [],
    selections: ToolSelectionReview[] = [],
    warnings: string[] = [];
  const seen = new Set<string>();
  for (const selection of project.toolSelections ?? []) {
    const product = findRetailerProduct(selection.productId),
      issues: string[] = [],
      evidence: ReviewedToolEvidence[] = [];
    const reviewed = Date.parse(selection.checkedAt);
    if (seen.has(selection.productId))
      issues.push(
        "Duplicate tool selection; only its first record can support capabilities.",
      );
    const duplicate = seen.has(selection.productId);
    seen.add(selection.productId);
    if (!Number.isFinite(reviewed) || reviewed > now)
      issues.push("The review timestamp is invalid or in the future.");
    if (!product)
      issues.push(
        "The selected product is not in the reviewed registry. Its capabilities remain unknown.",
      );
    else if (product.category !== "tool")
      issues.push("This product is not registered as a reusable tool.");
    else if (product.status !== "reviewed-specs")
      issues.push(
        "This tool is a candidate; its exact product capabilities have not been reviewed.",
      );
    if (product?.category === "tool") {
      const productReview = Date.parse(product.verifiedAt);
      if (!Number.isFinite(productReview) || productReview > now)
        issues.push(
          "The product review timestamp is invalid or in the future.",
        );
      for (const proof of product.toolCapabilityEvidence) {
        const sources = proof.sourceRefs.map((ref) =>
          product.sources.find((s) => s.url === ref),
        );
        if (
          !proof.scope.trim() ||
          !proof.requirements.length ||
          !proof.capabilities.length ||
          proof.capabilities.some(
            (cap) =>
              !toolCapabilities.includes(cap) ||
              !product.capabilities.includes(cap),
          ) ||
          !sources.length ||
          sources.some(
            (source) =>
              !source ||
              !Number.isFinite(Date.parse(source.verifiedAt)) ||
              Date.parse(source.verifiedAt) > now,
          )
        ) {
          issues.push(
            "A capability evidence entry has missing, unrelated or future-dated reviewed sources.",
          );
          continue;
        }
        const { sourceRefs: _refs, ...details } = proof;
        evidence.push({
          ...details,
          sources: sources.filter((s): s is NonNullable<typeof s> => !!s),
        });
      }
      if (!evidence.length)
        issues.push(
          "No explicit reviewed manufacturer capability evidence supports this selection.",
        );
    }
    const capabilities: ToolCapability[] = [
      ...new Set(evidence.flatMap((proof) => proof.capabilities)),
    ];
    if (product?.category === "tool" && !capabilities.length)
      issues.push(
        "No documented tool capabilities are registered for this product.",
      );
    const supported = !issues.length && !duplicate;
    const tool: SelectedTool = {
      id: selection.productId,
      name: product?.name ?? selection.productId,
      checked: supported,
      capabilities: supported ? capabilities : [],
      evidence: supported
        ? evidence.flatMap((proof) =>
            proof.sources.map((source) => ({
              url: source.url,
              reviewedAt: source.verifiedAt,
              note: `${proof.scope} ${proof.requirements.join(" ")} ${source.note}`,
              capabilities: [...proof.capabilities],
            })),
          )
        : [],
    };
    tools.push(tool);
    const review: ToolSelectionReview = {
      productId: selection.productId,
      name: tool.name,
      checkedAt: selection.checkedAt,
      status: supported ? "reviewed-capabilities" : "unknown",
      issues,
      manufacturerUrls: [
        ...new Set(
          evidence.flatMap((proof) => proof.sources.map((s) => s.url)),
        ),
      ],
      manualNotes: [
        ...new Set(
          evidence.flatMap((proof) => proof.sources.map((s) => s.note)),
        ),
      ],
      evidence,
    };
    selections.push(review);
    for (const issue of issues) warnings.push(`${review.name}: ${issue}`);
    if (product?.category === "tool") {
      const unsupported = product.capabilities.filter(
        (cap) => !capabilities.includes(cap),
      );
      if (unsupported.length)
        warnings.push(
          `${product.name}: No usable scoped evidence supports declared capabilities: ${unsupported.join(", ")}.`,
        );
    }
    if (supported && product)
      for (const discrepancy of product.discrepancies)
        warnings.push(`${product.name}: ${discrepancy}`);
  }
  return { tools, selections, warnings: [...new Set(warnings)] };
}
const text = (value: string) =>
  value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\`*_{}\[\]<>|]/g, "\\$&")
    .trim();
export function toolGuideMarkdown(project: ToolProject, now = Date.now()) {
  const selected = selectedToolsForProject(project, now),
    checklist = toolChecklist(project, selected.tools, now);
  const lines = [
    "\n\n## Tools and operation review",
    "",
    "Selections record your review of documented functions. They do not establish ownership, working condition, current availability, operating capacity, or a safe cutting/installation setup. Check the actual tool type and manual revision, blade/bit, material and operation. Tools are separate from the material bill and have no prices here.",
    "",
    "### Selected models",
  ];
  if (!selected.selections.length)
    lines.push(
      "No tool models have been reviewed for this project; required capabilities remain unknown.",
    );
  for (const selection of selected.selections) {
    lines.push(
      `- ${text(selection.name)} — ${selection.status === "reviewed-capabilities" ? "documented functions reviewed" : "UNKNOWN"}; selection recorded ${text(selection.checkedAt)}.`,
    );
    for (const proof of selection.evidence) {
      for (const source of proof.sources)
        lines.push(
          `  - ${toolEvidenceTypeLabels[proof.evidenceType]}: ${source.url}`,
        );
      lines.push(
        `  - Evidence scope: ${text(proof.scope)} Functions: ${proof.capabilities.join(", ")}.`,
      );
      for (const requirement of proof.requirements)
        lines.push(`  - Review requirement: ${text(requirement)}`);
    }
    for (const issue of selection.issues)
      lines.push(`  - Review issue: ${text(issue)}`);
  }
  lines.push("", "### Derived process checklist");
  if (!checklist.requirements.length)
    lines.push(
      "No build operations have been derived from this empty project.",
    );
  for (const row of checklist.requirements) {
    lines.push(
      `- ${text(row.name)} — ${row.necessity.toUpperCase()} — ${row.status === "supported" ? "documented capability supported" : "UNKNOWN"}.`,
    );
    if (row.condition) lines.push(`  - Condition: ${text(row.condition)}`);
    for (const source of row.sources)
      lines.push(
        `  - Why: ${text(source.reason)} (${source.kind}${source.kind === "hinge-plan" || source.kind === "hinge-stock" || source.kind === "connector-plan" ? "" : ` ${source.id}`}).`,
      );
    for (const tool of row.supportedBy)
      lines.push(
        `  - Selected model: ${text(tool.toolName)}. Manufacturer evidence: ${tool.evidenceUrls.join(", ")}`,
      );
    lines.push(`  - Operation check: ${text(row.review)}`);
    for (const url of row.referenceUrls) lines.push(`  - Reference: ${url}`);
  }
  const warnings = [...new Set([...selected.warnings, ...checklist.warnings])];
  if (warnings.length) {
    lines.push("", "### Unresolved tool questions");
    for (const warning of warnings) lines.push(`- ${text(warning)}`);
  }
  return lines.join("\n");
}
