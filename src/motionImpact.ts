import { motionReviewDistance, motionTestFindings, runMotionTest, type MotionPreview, type MotionTestFinding } from "./mechanismMotion";
import { reviewDrawerSlide } from "./drawerSlides";
import type { Piece, Project } from "./model";
import { motionGapPairKey, type MotionPlan, type MotionTestSetup } from "./motionPlanSchema";
import { ensurePartLabels } from "./partLabels";

type MotionImpact = {
  id: string;
  label: string;
  detail: string;
  show?: () => MotionPreview;
};

const geometry = (piece: Piece) => JSON.stringify([
  piece.material, piece.size, piece.position, piece.rotation, piece.cutPlanes,
  piece.roundOpenings, piece.rectangularOpenings,
]);

function motionCases(plan: MotionPlan) {
  const tests: { id: string; label: string; setup?: MotionTestSetup }[] = [{ id: "baseline", label: plan.label }];
  if (plan.testSetup) tests.push({ id: "saved", label: `${plan.label} · Saved test`, setup: plan.testSetup });
  for (const { id, name, setup } of plan.testScenarios ?? []) {
    tests.push({ id, label: `${plan.label} · ${name}`, setup });
  }
  return tests;
}

function shortfalls(result: ReturnType<typeof runMotionTest>) {
  return new Map(result.review?.clearances?.flatMap(({ requirement, result }) =>
    result.status === "short" ? [[`pair-clearance/${motionGapPairKey(requirement)}`, result.gap]] : []));
}

/** Compare saved motion tests in the existing project and an unsaved layout. */
export function proposalMotionChanges(before: Project, after: Project): MotionImpact[] {
  if (!before.motionPlans?.length) return [];
  const oldParts = new Map(before.pieces.filter((piece) => !piece.offcut).map((piece) => [piece.id, piece]));
  const nextParts = new Map(after.pieces.filter((piece) => !piece.offcut).map((piece) => [piece.id, piece]));
  const activePlans = new Map(after.motionPlans?.map((plan) => [plan.id, plan]));
  if (oldParts.size === nextParts.size &&
      [...nextParts].every(([id, part]) => oldParts.has(id) && geometry(part) === geometry(oldParts.get(id)!)) &&
      JSON.stringify(before.motionPlans) === JSON.stringify(after.motionPlans) &&
      JSON.stringify(before.workZone) === JSON.stringify(after.workZone) &&
      JSON.stringify(before.edgeBanding) === JSON.stringify(after.edgeBanding) &&
      JSON.stringify(before.siteClearances) === JSON.stringify(after.siteClearances)) return [];

  const labels = new Map(ensurePartLabels(after).partLabels.map(({ partId, label }) => [partId, label]));
  const describePart = (_project: Project, id: string) => {
    const name = nextParts.get(id)?.name;
    return name ? `${labels.get(id) ?? "Part"} · ${name}` : labels.get(id) ?? "Removed part";
  };
  const rows: MotionImpact[] = [];
  for (const oldPlan of before.motionPlans) {
    const newPlan = activePlans.get(oldPlan.id);
    if (!newPlan) {
      rows.push({ id: oldPlan.id, label: oldPlan.label, detail: "The saved movement is missing in this proposal." });
      continue;
    }
    const priorSlide = reviewDrawerSlide(before, oldPlan);
    const nextSlide = priorSlide?.ready ? reviewDrawerSlide(after, newPlan) : undefined;
    if (priorSlide?.ready && !nextSlide?.ready) {
      const issues = nextSlide?.rows.filter(({ matches }) => !matches).map(({ detail }) => detail);
      rows.push({
        id: `${oldPlan.id}/mounting`,
        label: oldPlan.label,
        detail: `Drawer slide fit needs review. ${issues?.join(" ") || "Choose and check the current mounting faces."}`,
      });
    }
    const oldCases = new Map(motionCases(oldPlan).map((test) => [test.id, test]));
    for (const test of motionCases(newPlan)) {
      const oldCase = oldCases.get(test.id);
      if (!oldCase) continue;
      const next = runMotionTest(after, newPlan, test.setup);
      const nextFindings = motionTestFindings(after, next, false, describePart)
        .filter(({ gapStatus }) => gapStatus !== "met");
      if (!nextFindings.length) continue;
      const previous = runMotionTest(before, oldPlan, oldCase.setup);
      if (!previous.review) continue;
      const priorUnresolved = new Set(previous.review.unresolvedIds);
      const oldFindings = new Map(motionTestFindings(before, previous).map((finding) => [finding.id, finding]));
      const oldGaps = shortfalls(previous), newGaps = shortfalls(next);
      const closingWorsened = (issue: MotionTestFinding) => {
        const old = oldFindings.get(issue.id)?.closingTravel;
        return old !== undefined && issue.closingTravel !== undefined && issue.closingTravel > old + 0.01;
      };
      const worse = (issue: MotionTestFinding) => {
        const old = oldFindings.get(issue.id);
        if (!old || old.gapStatus === "met") return true;
        if (issue.id === "geometry") return next.review?.unresolvedIds.some((id) => !priorUnresolved.has(id));
        const previousGap = oldGaps.get(issue.id), nextGap = newGaps.get(issue.id);
        if (previousGap !== undefined && nextGap !== undefined && nextGap < previousGap - 0.001) return true;
        if (old.gapStatus && issue.gapStatus === "needs-review" && old.gapStatus !== "needs-review") return true;
        return closingWorsened(issue) ||
          (issue.travel !== undefined && old.travel !== undefined && issue.travel < old.travel - 0.01);
      };
      for (const issue of nextFindings.filter(worse)) {
        const review = next.review;
        const closing = closingWorsened(issue) ? issue.closingTravel : undefined;
        const travel = closing ?? issue.travel;
        rows.push({
          id: `${oldPlan.id}/${test.id}/${issue.id}`,
          label: test.label,
          detail: review && closing !== undefined
            ? `${issue.detail} Closing contact now starts near ${motionReviewDistance(review, closing, issue.phase)}.`
            : issue.detail,
          show: review && travel !== undefined
            ? () => review.preview(travel, travel, issue.siteFaceId, issue.phase)
            : undefined,
        });
      }
    }
  }
  return rows;
}
