import {
  normalizeIdeaText, requestedDimensionEdits, retainWithQuestion, splitIdeaEdits,
  straightRun, trimPreservationClause,
} from "./ideaEdits";
import type { V3 } from "./model";
import { ideaPlanSchema, type IdeaPlan, type PlanModule, type PlannerRequest } from "./planSchema";
import { applyResizeRequests } from "./relativeIdeaResize";
import { localSeatFeaturePlan } from "./seatFeatureEdits";

const seating = "(?:(?:storage )?(?:banquette|bench|seating run)|layout)";
const subject = `(?:it|(?:the |my |this )?${seating})`;
const straighten = new RegExp(`^(?:straighten(?: out)? ${subject}|(?:make|change|turn|convert) ${subject} (?:(?:into|to) )?(?:a )?straight(?: ${seating})?|straight ${seating} instead)$`);
const corner = /(?:(?:the|a|its) )?(?:(?:left|right|side|corner|l[ -]shaped) )?return/;
const removeReturn = new RegExp(`^(?:remove|omit|drop|take out|without|no) ${corner.source}$`);
const noReturnSuffix = new RegExp(` (?:with no|without) ${corner.source}$`);
const tolerance = 1 / 32;
const directions = { wide: "width", deep: "depth", tall: "height", high: "height" } as const;
const describedSize = new RegExp(`^(?:make ${subject} )?(\\d[\\d./ ]*(?:feet|foot|ft|inches|inch|in|['′"″])(?:\\s*\\d[\\d./ ]*(?:inches|inch|in|["″]))?) (wide|deep|tall|high)$`);

function dot(first: V3, second: V3) {
  return first.reduce((sum, value, axis) => sum + value * second[axis], 0);
}

/** A return ends against the broad face of an end seat, with its depth inset from that end. */
function cornerReturn(seats: PlanModule[]) {
  const matches = seats.flatMap((branch) => {
    const main = seats.filter((seat) => seat !== branch);
    const run = straightRun(main);
    if (!run || Math.abs(branch.position[1] - run.center[1]) > tolerance) return [];
    if (Math.abs(Math.cos((branch.yaw - main[0].yaw) * Math.PI / 180)) > 1e-5) return [];
    const normal: V3 = [-run.axis[2], 0, run.axis[0]];
    const across = Math.abs(dot(branch.position, normal) - dot(run.center, normal));
    const along = dot(branch.position, run.axis);
    const ends = [
      { end: main[run.order[0]], side: -1 },
      { end: main[run.order.at(-1)!], side: 1 },
    ];
    return ends.flatMap(({ end, side }) => {
      const inset = side * (dot(end.position, run.axis) - along) + end.width / 2;
      return branch.depth <= end.width + tolerance && Math.abs(inset - branch.depth / 2) <= tolerance &&
        Math.abs(across - (end.depth + branch.width) / 2) <= tolerance
        ? [{ branch, end, side, axis: run.axis }]
        : [];
    });
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function localSeatLayoutPlan(request: PlannerRequest): IdeaPlan | null {
  const previous = request.previousPlan;
  if (!previous) return null;
  const prompt = trimPreservationClause(normalizeIdeaText(request.prompt).trim().replace(/^please\s+/, "").replace(/[.!?]+$/, ""));
  const [first = "", ...remaining] = splitIdeaEdits(prompt);
  const head = first.replace(noReturnSuffix, "");
  const removal = removeReturn.test(first) || (straighten.test(head) && noReturnSuffix.test(first)) || remaining.some((clause) => removeReturn.test(clause));
  if (!removeReturn.test(first) && !straighten.test(head)) return null;
  const seats = previous.modules.filter(({ kind }) => kind === "bench");
  if (!seats.length) return retainWithQuestion(previous, "Open a saved banquette or bench layout to edit its return.");
  const run = straightRun(seats);
  const junction = run ? undefined : cornerReturn(seats);
  if (!run && !junction)
    return retainWithQuestion(previous, "Select a single L-shaped banquette with one return that meets the end of its main run.");
  const returnSide = junction?.side === -1 ? "left" : "right";
  const namedSide = [first, ...remaining.filter((clause) => removeReturn.test(clause))]
    .join(" ").match(/\b(left|right) return\b/)?.[1];
  if (removal && junction && namedSide && namedSide !== returnSide)
    return retainWithQuestion(previous, `This layout has a ${returnSide} return. Confirm which seat to remove.`);

  let next = { ...structuredClone(previous), questions: [] as string[] };
  let summary = "The selected banquette is already straight.";
  if (junction) {
    const { branch, end, side, axis } = junction;
    const offset = side * (end.width + branch.width) / 2;
    const position = end.position.map((coordinate, index) => coordinate + axis[index] * offset) as V3;
    next.modules = previous.modules.flatMap((module) => module !== branch ? [module]
      : removal ? [] : [{ ...module, position, yaw: end.yaw }]);
    next.assumptions = next.assumptions.filter((note) => !/^Provisional overall return footprint:/.test(note));
    summary = removal ? `Removed ${branch.name} from this proposal and kept the main run in place.`
      : `Aligned ${branch.name} with the ${returnSide} end of the main run.`;
  }
  const followUp = remaining.filter((clause) => !removeReturn.test(clause)).map((clause) => {
    const size = describedSize.exec(clause);
    return size ? `set the banquette ${directions[size[2] as keyof typeof directions]} to ${size[1]}` : clause;
  }).join(", ");
  if (followUp) {
    const featureRevision = localSeatFeaturePlan({ ...request, prompt: followUp, previousPlan: next });
    if (featureRevision) {
      if (featureRevision.questions.length) return retainWithQuestion(previous, featureRevision.questions[0]);
      next = featureRevision;
    } else {
      const edits = requestedDimensionEdits(followUp);
      if (!edits || "question" in edits) return retainWithQuestion(previous,
        edits?.question ?? "Name the dimension to change with the straight layout, or explore the corner change by itself.");
      next = applyResizeRequests(next, edits.map((edit) => ({
        ...edit,
        scope: /^(?:it|this|the run|the overall width|overall width)$/.test(edit.scope) ? "the banquette" : edit.scope,
      })));
      if (next.questions.length) return retainWithQuestion(previous, next.questions[0]);
    }
  }
  const checked = ideaPlanSchema.safeParse({
    ...next, summary,
    placementChanges: junction ? [summary, ...(followUp ? ["Applied the additional changes to the straight layout."] : [])] : undefined,
  });
  return checked.success ? checked.data : retainWithQuestion(previous, checked.error.issues[0].message);
}
