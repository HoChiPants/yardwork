import { suggestCenteredFastener, type MakeFastenerPlanOptions } from "./fastenings";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";

const tolerance = 1e-6;
type CenteredProposal = ReturnType<typeof suggestCenteredFastener>;
export type FastenerEntryOption = {
  headId: string;
  receiverId: string;
} & (
  | { issue: string; proposal?: never }
  | { issue?: never; proposal: CenteredProposal; enter: number; exit: number }
);

export function compareFastenerEntries(
  project: Project,
  first: string,
  second: string,
  options: MakeFastenerPlanOptions,
): FastenerEntryOption[] {
  return ([[first, second], [second, first]] as const).map(([headId, receiverId]) => {
    try {
      const proposal = suggestCenteredFastener(project, headId, receiverId, options);
      const location = proposal.review.locations[0];
      const { entranceWorld, driveWorld, receiverEnterDepth, receiverExitDepth } = location;
      if (entranceWorld && driveWorld && entranceWorld[1] <= tolerance && driveWorld[1] > tolerance)
        return { headId, receiverId, issue: "The modeled floor blocks this entrance in the current position." };
      if (receiverEnterDepth === null || receiverExitDepth === null)
        return { headId, receiverId, issue: "The centerline could not be traced through both members." };
      return { headId, receiverId, proposal, enter: receiverEnterDepth, exit: receiverExitDepth };
    } catch (error) {
      return {
        headId,
        receiverId,
        issue: error instanceof Error ? error.message : "The centered entry could not be reviewed.",
      };
    }
  });
}

export function trialFastenerDepth(depth: number, enter: number, exit: number) {
  if (!Number.isFinite(depth) || depth <= 0) return null;
  if (depth <= enter + tolerance) return "Stops at or before the receiver";
  if (depth >= exit - tolerance) return "Reaches or passes the far face";
  return `Inside receiver · ${formatPreciseInches(exit - depth)} to the far face`;
}

export function fastenerEntryComparisonNote(enter: number, exit: number) {
  return `Centered entry chosen after comparing both sides. At this review the receiving wood began at ${formatPreciseInches(enter)} and ended at ${formatPreciseInches(exit)} from the entry surface. Confirm the seated surface-to-tip depth on the actual hardware and review the joint before drilling.`;
}
