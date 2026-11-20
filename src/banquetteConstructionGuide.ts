import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import {
  banquetteConstruction,
  type BanquetteConstructionReport,
} from "./banquetteConstruction";

const md = (text: string) =>
  text.replace(/[\r\n\t]+/g, " ").replace(/[\\`*_{}\[\]<>|!#]/g, "\\$&");
const member = (project: Project, id: string) => {
  const actual = project.pieces.find(
    (piece) => piece.id === id && !piece.offcut,
  );
  return actual
    ? partLabel(project, id)
    : `${project.partLabels.find((row) => row.partId === id)?.label ?? id} (missing/offcut)`;
};
/** Live derived observations; no guide phase, checklist, source or project is rewritten. */
export function banquetteConstructionMarkdown(
  project: Project,
  reports: readonly BanquetteConstructionReport[] = banquetteConstruction(
    project,
  ),
): string {
  if (!reports.length) return "";
  const out = [
    "",
    "## Banquette construction review",
    "",
    "Current retained geometry and exact saved member-pair intent. Contacts and entered paths do not establish complete joinery, installed hardware or seating capacity. Candidate contacts are not a required fastening schedule.",
    "",
  ];
  for (const report of reports) {
    out.push(`### ${md(report.name)}`, "");
    for (const seat of report.seats) {
      out.push(
        `- Seat ${seat.pieceId ? md(member(project, seat.pieceId)) : "unresolved"}: ${seat.state}.`,
      );
      if (
        ["contacts-found", "no-bearing-contact", "interference"].includes(
          seat.state,
        )
      )
        out.push(
          `- Current underside contacts: ${seat.supportIds.length ? seat.supportIds.map((id) => md(member(project, id))).join(", ") : "none found"}. See Shelf and seat bearing for any measured spans. Bearing adequacy and seating capacity remain unresolved.`,
        );
      else
        out.push(
          "- Closed-seat contacts are not established in this state; no closed pose was generated for this review.",
        );
      for (const row of seat.contacts.filter((row) => !row.actualContact))
        out.push(
          `- ${md(member(project, row.memberId))}: modeled underside gap ${row.contact.gap === null ? "unknown" : formatPreciseInches(row.contact.gap)}; proximity is not bearing contact.`,
        );
    }
    const frames = report.pairs.filter((pair) => pair.kind === "frame"),
      shells = report.pairs.filter((pair) => pair.kind === "shell"),
      authored = report.pairs.filter((pair) => pair.kind === "existing-only");
    out.push(
      "",
      `${frames.length} frame contact candidates; ${shells.length} other shell contact candidates; ${authored.length} other authored pairs. A plan on one pair does not join its neighboring members.`,
      "",
      "| Actual pair | Modeled geometry | Exact-pair intent |",
      "|---|---|---|",
    );
    for (const pair of report.pairs.filter((pair) => pair.kind !== "shell")) {
      const geometry = pair.contact
        ? `${pair.contact.state}${pair.contact.gap === null ? "" : `; gap ${formatPreciseInches(pair.contact.gap)}`}`
        : "Endpoint unavailable";
      const intent = `${pair.state}${pair.intents.length ? `; ${pair.intents.map((row) => `${row.label}: ${row.state}`).join(", ")}` : ""}`;
      out.push(
        `| ${md(pair.pieceIds.map((id) => member(project, id)).join(" ↔ "))} | ${md(geometry)} | ${md(intent)} |`,
      );
    }
    out.push(
      "",
      ...report.findings.map(
        (finding) =>
          `- ${md(finding.message)}${finding.pieceIds.length ? ` (${md(finding.pieceIds.map((id) => member(project, id)).join(", "))})` : ""}`,
      ),
    );
    if (!report.enumeration.complete)
      out.push(
        `- Incomplete review: ${report.enumeration.checkedPairs}/${report.enumeration.possiblePairs} possible checks attempted; ${report.enumeration.omittedPairs} skipped. ${report.enumeration.omittedPairs ? "Remaining pairs need review." : "Some retained surfaces were unavailable; see findings above."}`,
      );
    out.push("");
  }
  return out.join("\n") + "\n";
}
