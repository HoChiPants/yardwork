import type { Project } from "./model";
import { reviewLidSiteClearances } from "./lidMotion";
import { lidSiteFaces, lidSiteMotionText } from "./lidSiteClearance";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";

export function lidSiteGuideRows(project: Project) {
  if (!project.siteClearances?.length) return [];
  return project.sections.flatMap((section) => {
    if (!section.recipe?.openingLid) return [];
    const faces = lidSiteFaces(project, section.id);
    if (!faces.length) return [];
    try {
      return reviewLidSiteClearances(project, section.id).map((result) => ({
        id: `${section.id}/${result.plane.id}`,
        label: `${section.name} · ${result.plane.label}`,
        text: `0–${LID_OPEN_ANGLE_DEGREES}° modeled swing. ${result.status === "short" ? "Clearance shortfall. " : ""}${lidSiteMotionText(result)}`,
      }));
    } catch (error) {
      return [
        {
          id: section.id,
          label: section.name,
          text:
            error instanceof Error
              ? error.message
              : "Lid travel needs geometry review.",
        },
      ];
    }
  });
}

export function lidSiteGuideMarkdown(project: Project) {
  const rows = lidSiteGuideRows(project);
  if (!rows.length) return "";
  const singleLine = (value: string) =>
    value.replace(/[\r\n]+/g, " ").replace(/[\x5c`*_\[\]<>]/g, "\\$&");
  return (
    "## Lid swing at measured site faces\n\n" +
    rows
      .map(({ label, text }) => `- ${singleLine(label)} · ${singleLine(text)}`)
      .join("\n") +
    "\n\n"
  );
}
