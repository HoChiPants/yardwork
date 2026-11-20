import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { attachmentReviews } from "./attachments";
import { attachmentPurchaseSummaries } from "./attachmentPurchases";
import { shelfPinProductId } from "./attachmentSchema";
import { angleShelfPinReference } from "./shelfPinReference";

const sources = [
  "https://www.kregtool.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dw31eb0d3c/manuals/KMA3232_Global.pdf",
  "https://www.anchorit.gov/how-to-anchor/how-to-install-a-kit/",
];
const process = [
  "Confirm the actual shelf and side-panel dimensions, fit clearance and one consistent reference end. Review every saved front/rear row datum and opposite-side height before marking stock.",
  "Review the chosen 5 mm layout jig, matched bit and collar, powered drill, clamps and operation-appropriate protection. When using the Kreg KMA3232 jig, use its included bit and collar.",
  "Set and secure the collar using the actual jig's gauge as instructed. Clamp a test piece of the same actual stock and check the setup before drilling the planned panels.",
  "Measure the test hole's full-diameter bore and deepest brad-point penetration separately, plus actual panel thickness. Record user measurements and their date/source. Nominal bit depth does not establish deepest-tip clearance.",
  "Test the actual pin's insertion/engagement, bearing projection and bearing height with a dry-fit shelf. Resolve pending fit dimensions and conflicts before releasing a hole schedule. Measured fit is not manufacturer or load qualification.",
  "Follow the chosen jig and bit instructions after resolving the planned dimensions and conflicts. When using the Kreg jig, follow the collar and indexing instructions and keep drills out of the indexing hole.",
  "Recheck support heights and actual shelf contact after pin placement. Keep carcass joinery, shelf loads and the separate wall/anti-tip attachment chain under review; neither pin count nor fit establishes assembled capacity.",
];
const plain = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
const markdown = (value: string) =>
  plain(value).replace(/[\\`*_{}\[\]<>|!]/g, "\\$&");
const number = (value: number) => Number(value.toFixed(6)).toString();
const dimension = (value: number | null) =>
  value === null ? "PENDING" : `${number(value)} in`;

function renderAttachmentGuide(project: Project, asMarkdown: boolean) {
  const reviews = attachmentReviews(project);
  if (!reviews.length) return "";
  const summaries = attachmentPurchaseSummaries(project, reviews),
    text = asMarkdown ? markdown : plain,
    heading = (level: number, value: string) =>
      asMarkdown ? `${"#".repeat(level)} ${value}` : value.toUpperCase(),
    lines = [
      "",
      "",
      heading(2, "Planned shelf attachments"),
      "",
      "Saved intent and geometric review only. Coordinates, user measurements and selected purchase packs do not prove installation, shelf load capacity, anchorage adequacy or code/engineering approval.",
      "",
      heading(3, "Pin purchase comparison"),
      "",
      "Existing supply rows form the purchase list. Kit pins and owned-tool contents stay outside these counts.",
    ];
  for (const summary of summaries) {
    lines.push(
      "",
      text(summary.productName),
      `Included planned pins: ${summary.plannedPins}; required ${summary.pinsPerPack}-pin packs: ${summary.requiredPacks}; manually selected packs: ${summary.selectedPacks}; missing packs: ${summary.shortfallPacks}.`,
      `Pins beyond planned demand in selected packs: ${summary.sparePins}. This is calculated pack surplus, not verified on-hand stock.`,
    );
    if (!summary.retailerSupported)
      lines.push("This exact pin pack has no reviewed offer at the selected retailer.");
    for (const offer of summary.referenceOffers)
      lines.push(
        `- Reviewed pin purchase reference (${offer.retailer}; specifications only, not price or store stock): ${offer.url}`,
      );
  }
  for (const review of reviews) {
    lines.push(
      "",
      heading(3, text(review.plan.name)),
      `Review state: ${text(review.state)}; included planned pins: ${review.activePinCount}.`,
      `Product: ${review.plan.productId}; saved ${review.plan.updatedAt}. Planned connections are separate from purchase packs and installed joints.`,
      `Layout system: ${review.plan.layout.system}; front inset ${dimension(review.plan.layout.frontInset)}; rear inset ${dimension(review.plan.layout.rearInset)}; first-hole datum above side-panel bottom ${dimension(review.plan.layout.datumHeight)}. Insets reference side-panel edges; these values are explicit design choices, not an inferred jig setup.`,
      "",
      "User measurements (separate from manufacturer specifications):",
      `- Pin insertion depth: ${dimension(review.plan.measurements.pinInsertionDepth)}; bearing reach: ${dimension(review.plan.measurements.bearingReach)}; signed bearing surface height above hole axis: ${dimension(review.plan.measurements.bearingOffset)}.`,
      `- Full-diameter bore depth: ${dimension(review.plan.measurements.fullDiameterBoreDepth)}; deepest drill-tip depth: ${dimension(review.plan.measurements.deepestDrillTipDepth)}.`,
      `- User measurement basis: ${text(review.plan.measurements.basis) || "PENDING"}; measured at: ${review.plan.measurements.measuredAt ?? "PENDING"}. These inputs do not become author-reviewed manufacturer geometry.`,
    );
    if (angleShelfPinReference(review.plan.productId))
      lines.push(
        `- Delivered pin fit in a 5 mm test bore: ${review.plan.measurements.fitTestConfirmed ? "Confirmed by the project author" : "PENDING"}.`,
      );
    for (const issue of review.issues) lines.push(`- ${text(issue.message)}`);
    lines.push(
      "",
      "Four intended bearing points per shelf. Measure height from each side/divider's rectangular blank bottom datum (local −Y) and row inset from its named blank front/rear edge. Establish and transfer these datums before profile cuts; a removed edge is not a new reference. Drill inward from the inner face. Numerical candidates remain conditional on the plan's review state.",
    );
    for (const shelfId of [
      ...new Set(review.plan.points.map((point) => point.shelf.pieceId)),
    ]) {
      const intended = review.plan.points.filter(
          (point) => point.shelf.pieceId === shelfId,
        ),
        shelf = intended[0].shelf;
      lines.push(
        "",
        `${partLabel(project, shelf.pieceId)} · ${text(shelf.name)} — ${text(shelf.role.replace(/^(tower-)?shelf-/, "Shelf "))}.`,
      );
      if (asMarkdown)
        lines.push(
          "| Side / row | Mount panel | Hole above blank bottom | Inset from named edge | Status |",
          "|---|---|---|---|---|",
        );
      for (const point of intended) {
        const resolved = review.points.find(
            (item) => item.point.id === point.id,
          ),
          usable = review.activePinCount > 0 && !!resolved,
          mount = project.pieces.find(
            (part) => part.id === point.mount.pieceId && !part.offcut,
          ),
          hole = usable ? resolved.holeCenterLocal : null,
          height = hole && mount ? hole[1] + mount.size[1] / 2 : null,
          inset =
            hole && mount
              ? point.row === "front"
                ? mount.size[2] / 2 - hole[2]
                : hole[2] + mount.size[2] / 2
              : null,
          status = !usable
            ? "PENDING — plan excluded"
            : !hole
              ? "PENDING bearing offset"
              : review.state === "needs-measurements"
                ? "Candidate / pending"
                : "Geometry reviewed only",
          values = [
            `${point.side} / ${point.row}`,
            `${partLabel(project, point.mount.pieceId)} · ${point.mount.name}`,
            dimension(height),
            dimension(inset),
            status,
          ];
        if (asMarkdown) lines.push(`| ${values.map(text).join(" | ")} |`);
        else lines.push(`- ${values.map(plain).join(" · ")}`);
      }
    }
  }
  lines.push("", heading(3, "Conditional build sequence"), "");
  process.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  lines.push(
    "",
    heading(3, "Separate anti-tip attachment review"),
    "",
    "UNRESOLVED: select the exact restraint kit/manual, actual wall substrate and location evidence, strong connected carcass member, baseboard standoff, fittings and specified fasteners. Review the chain from carcass member through both fittings and restraint to the wall substrate. A thin back panel, selected strap or completed pin plan does not complete this chain. No universal strap count, screw length or penetration is inferred.",
    "",
    heading(3, "Reviewed process references"),
    ...sources.map((url) => `- ${url}`),
  );
  if (reviews.some(({ plan }) => plan.productId === shelfPinProductId))
    lines.push("- https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pins-5mm/KMA-5MPIN.html");
  return lines.join("\n");
}

export function attachmentGuideMarkdown(project: Project) {
  return renderAttachmentGuide(project, true);
}
export function attachmentGuideText(project: Project, includeTitle = true) {
  const text = renderAttachmentGuide(project, false).trim();
  return includeTitle
    ? text
    : text.replace(/^PLANNED SHELF ATTACHMENTS\n+/, "");
}

/** Compact notes for a generated preparation/review step, never an installation approval. */
export function attachmentPreparationNotes(
  project: Project,
  planId: string,
): string {
  const review = attachmentReviews(project).find(
    (item) => item.plan.id === planId,
  );
  if (!review)
    return `UNRESOLVED: attachment plan ${plain(planId).slice(0, 100)} is missing. Do not use an old drilling schedule. Restore or revise the plan and see the detailed coordinate schedule before proceeding. Shelf capacity, carcass joints and anti-tip attachments remain separate reviews.`;
  const labels = {
    pinInsertionDepth: "pin insertion depth",
    bearingReach: "bearing reach",
    bearingOffset: "bearing height above hole axis",
    fullDiameterBoreDepth: "full-diameter bore depth",
    deepestDrillTipDepth: "deepest drill-tip depth",
  } as const;
  const pending = (Object.keys(labels) as (keyof typeof labels)[])
      .filter((key) => review.plan.measurements[key] === null)
      .map((key) => labels[key]),
    knownHoles =
      review.activePinCount > 0
        ? review.points.filter(
            (point) =>
              point.holeCenterLocal !== null && point.holeCenterWorld !== null,
          ).length
        : 0,
    issues = [...review.issues].sort(
      (a, b) =>
        (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1),
    ),
    stateNote =
      review.state === "stale" || review.state === "conflict"
        ? "UNRESOLVED: stale references or geometric conflicts exclude this plan from the pin estimate. Do not use its former hole coordinates for drilling."
        : review.state === "needs-measurements"
          ? "PENDING: measurement/setup questions remain. This is preparation intent, not a released drilling schedule."
          : "Geometric checks are recorded; verify actual measurements, fit and the working setup. This state does not establish installation or capacity.",
    lines = [
      `${plain(review.plan.name)} — review state: ${review.state}.`,
      stateNote,
      `Pending user-measured mechanics: ${pending.join(", ") || "none recorded as missing"}. User inputs remain distinct from manufacturer specifications.`,
      `Derived hole centers currently known for ${knownHoles}/${review.plan.points.length} recorded points. Use the labeled panel/edge schedule in Planned shelf attachments. The separate CSV and editable JSON retain exact machine references. Never substitute values for PENDING fields.`,
    ];
  for (const issue of issues.slice(0, 6))
    lines.push(
      `- ${issue.severity.toUpperCase()}: ${plain(issue.message).slice(0, 150)}${plain(issue.message).length > 150 ? "…" : ""}`,
    );
  if (issues.length > 6)
    lines.push(
      `- ${issues.length - 6} additional issue(s): review the detailed coordinate schedule.`,
    );
  lines.push(
    "",
    "Before drilling, follow the conditional setup sequence in Planned shelf attachments: same-stock test bore, separate full-bore and deepest-tip measurements, collar/indexing checks, actual pin/shelf dry fit, and clamped consistent edge registration. Load capacity, carcass joints and wall restraint remain separate reviews.",
  );
  return lines.join("\n");
}
