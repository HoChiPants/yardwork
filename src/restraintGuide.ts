import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { restraintReviews } from "./restraints";
import { restraintPurchaseSummary } from "./restraintPurchases";

const references = [
  "https://www.homedepot.com/p/1-Pack-Furniture-Anti-Tip-Kit-9976524/314365593",
  "https://www.lowes.com/pd/Hillman-Simple-Mount-Anti-Tip-Kit-for-Furniture/5015754703",
  "https://mobileimages.lowes.com/productimages/f0bf562b-029d-473b-8f20-32cd9903d470/75748178.jpeg?size=pdhism",
  "https://mobileimages.lowes.com/productimages/69368cf0-011b-4887-9d92-0567d5d7c97c/75748202.jpeg?size=pdhism",
];
const sequence = [
  "Review the delivered exact 9976524 kit and instructions. Confirm one complete kit at each explicitly selected location; the eleven included parts are not eleven restraints. No universal kit count is prescribed.",
  "Select an actual solid-wood receiver and design its connection into the furniture. Plywood panels/backs are not this kit's fixing member. A loose rail or nearby panel does not complete the attachment chain.",
  "Locate and record the actual wood wall stud, finish thickness, baseboard standoff, service hazards and tool access. Unknown walls stay unresolved; do not substitute drywall anchors, masonry or steel-stud methods.",
  "Transfer the actual fitting holes and measure its footprint, cable eyes, receiver mounting surface and inward screw-tip path. Keep the deepest furniture tip inside the retained stock. The single modeled mount point does not resolve both fitting screws or their pilots.",
  "Confirm the exact supplied fasteners against the delivered instructions and actual materials. The furniture graphic specifies 5/8 in screws in solid wood. The included 1½ in screws do not establish a released wall assignment, pilot size or minimum stud engagement.",
  "Fit the furniture and wall brackets and their cable eyes with the specified retained clevis pins/cotters. Check actual cable routing, reach/slack and access. Straight-line span is only a necessary geometric check, not proof of usable routing or restraint performance.",
  "Review the complete receiver-to-carcass-to-wall chain and perform the delivered manufacturer's checks. A checked step, purchase, measured fit or catalog rating does not establish installed anchorage, furniture capacity or code approval.",
];
const plain = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
const markdown = (value: string) =>
  plain(value).replace(/[\\`*_{}\[\]<>|!]/g, "\\$&");
const inches = (value: number | null) =>
  value === null ? "Pending" : `${Number(value.toFixed(6))} in`;
function render(project: Project, asMarkdown: boolean) {
  const reviews = restraintReviews(project);
  if (!reviews.length) return "";
  const text = asMarkdown ? markdown : plain,
    heading = (level: number, value: string) =>
      asMarkdown ? `${"#".repeat(level)} ${value}` : value.toUpperCase(),
    summary = restraintPurchaseSummary(project),
    lines = [
      "",
      "",
      heading(2, "Furniture restraint review"),
      "",
      "Planning and user-reported measurements only. Every plan remains under review; there is no approved/installed or load-capacity state. Exact coordinates and source-part identifiers remain in the editable project JSON.",
      `Provisional kits for active explicit locations: ${summary.plannedKits}; selected whole-kit purchase records: ${summary.selectedKits}; missing kits: ${summary.shortfallKits}. Existing supply records alone form the purchase list. Included eleven-part kit contents are not charged again.`,
      `Selected kits beyond included intent: ${summary.spareKits}. This is a purchase-record comparison, not verified on-hand inventory.`,
    ];
  for (const review of reviews) {
    const plan = review.plan,
      usable = review.state === "needs-review",
      receiver = plan.receiver
        ? `${partLabel(project, plan.receiver.pieceId)} · ${plan.receiver.name}`
        : "Pending selection";
    lines.push(
      "",
      heading(3, text(plan.name)),
      `State: ${review.state}. ${usable ? "Provisional planning intent only." : "Excluded from kit demand; resolve stale references or geometric conflicts."}`,
      `Furniture receiver: ${text(receiver)}. Selected connection records: ${plan.receiverJointIds.length + review.screwLinks.length}; their recorded presence is not a capacity assessment.`,
      `User solid-wood inspection/source basis: ${text(plan.receiverSolidWoodBasis) || "Pending"}; recorded ${plan.receiverMeasuredAt ?? "Pending"}.`,
      `User instruction basis: ${text(plan.instructionBasis) || "Pending"}; revision/identifier ${text(plan.instructionRevision) || "Pending"}; reviewed ${plan.instructionReviewedAt ?? "Pending"}. These user records do not verify a manufacturer manual revision.`,
      "Connection chain to review: connected solid-wood member → furniture fitting → retained clevis/cable eye → cable → retained wall clevis/fitting → actual wood wall stud.",
      `User measurements: cable eye-to-eye length ${inches(plan.measurements.cableEyeToEyeLength)}; deepest furniture tip from wood surface ${inches(plan.measurements.deepestFurnitureTipDepth)}; wall fastener length ${inches(plan.measurements.wallFastenerLength)}; stud engagement ${inches(plan.measurements.studEngagement)}.`,
      `User measurement basis: ${text(plan.measurements.basis) || "Pending"}; measured ${plan.measurements.measuredAt ?? "Pending"}. Manufacturer fitting/screw/pilot geometry remains separately unresolved.`,
    );
    for (const link of review.screwLinks) {
      const parts = link.pieceIds.map((id) => partLabel(project, id)).join(" ↔ ");
      lines.push(`- ${text(link.label)}${parts ? ` · ${text(parts)}` : ""} · ${text(link.detail)}`);
    }
    if (plan.notes) lines.push(`User notes: ${text(plan.notes)}`);
    if (asMarkdown && review.locations.length)
      lines.push(
        "",
        "| Chosen location | Mount / eye inputs | Wall substrate | Candidate straight span | Retained receiver depth |",
        "|---|---|---|---|---|",
      );
    for (const item of review.locations) {
      const location = item.location,
        inputs = `${location.receiverMountLocal ? "Mount recorded" : "Mount pending"}; ${location.furnitureEyeLocal && location.wallEyeWorld ? "eyes recorded" : "eyes pending"}`,
        values = [
          location.name,
          inputs,
          location.wallSubstrate,
          usable ? inches(item.span) : "Excluded",
          usable ? inches(item.availableReceiverDepth) : "Excluded",
        ];
      if (asMarkdown) lines.push(`| ${values.map(text).join(" | ")} |`);
      else
        lines.push(
          `- ${text(location.name)}: ${inputs}; wall ${location.wallSubstrate}; candidate straight span ${values[3]}; retained receiver depth ${values[4]}.`,
        );
    }
    for (const { location } of review.locations)
      lines.push(
        `- Wall evidence for ${text(location.name)}: ${text(location.wallBasis) || "Pending"}; reviewed ${location.wallReviewedAt ?? "Pending"}.`,
      );
    if (!review.locations.length)
      lines.push("No locations chosen; no kit quantity is inferred.");
    lines.push("", "Open review questions:");
    for (const issue of review.issues) lines.push(`- ${text(issue.message)}`);
  }
  lines.push(
    "",
    heading(3, "Conditional preparation and installation review"),
    ...sequence.map((step, index) => `${index + 1}. ${step}`),
    "",
    heading(3, "Exact kit reference evidence"),
    "Retailer listings and limited product instruction graphics establish identity/contents and the reviewed method. A revisioned complete current manufacturer manual and exact fitting geometry remain unverified; references establish no store availability or current price.",
    ...references.map((url) => `- ${url}`),
  );
  return lines.join("\n");
}
export function restraintGuideMarkdown(project: Project) {
  return render(project, true);
}
export function restraintGuideText(project: Project, includeTitle = true) {
  const text = render(project, false).trim();
  return includeTitle
    ? text
    : text.replace(/^FURNITURE RESTRAINT REVIEW\n+/, "");
}
export function restraintPreparationNotes(
  project: Project,
  planId: string,
): string {
  const review = restraintReviews(project).find(
    (review) => review.plan.id === planId,
  );
  if (!review)
    return "UNRESOLVED: the saved restraint plan is missing. Restore or revise it before using an old mounting schedule. No receiver, wall target, kit count or installation approval is inferred.";
  const lines = [
    `${plain(review.plan.name)} — ${review.state}. ${review.state === "needs-review" ? "Planning intent only; instructions, measured fit and the complete attachment chain remain under review." : "Excluded from kit demand; resolve changed references or conflicts before proceeding."}`,
    `Explicit locations: ${review.plan.locations.length}; provisional included kits: ${review.activeKitCount}. No universal kit count is prescribed. See the detailed furniture restraint review and editable JSON for the saved evidence and measurements.`,
    ...(review.screwLinks.length ? [
      `Receiver screws selected for review · ${review.screwLinks.map(({ label, state }) => `${label} ${state}`).join(", ")}.`,
    ] : []),
    ...review.issues
      .slice()
      .sort(
        (a, b) =>
          (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1),
      )
      .slice(0, 5)
      .map(
        (issue) =>
          `- ${issue.severity.toUpperCase()}: ${plain(issue.message).slice(0, 150)}${issue.message.length > 150 ? "…" : ""}`,
      ),
    "",
    "Use the conditional preparation sequence in Furniture restraint review: delivered exact instructions, connected solid-wood receiver, actual wood wall stud and service checks, fitting/fastener/pilot measurements, retained clevis/cable routing and the complete attachment chain. No step or kit count establishes installed capacity.",
    "",
    "Exact kit evidence and remaining manufacturer-data gaps are listed in that review. Full machine references remain in editable JSON.",
  ];
  return lines.join("\n");
}
