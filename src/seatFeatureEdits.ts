import {
  normalizeIdeaText, requestedDimensionEdits, requestedModule, retainWithQuestion,
  splitIdeaEdits, trimPreservationClause,
} from "./ideaEdits";
import { ideaPlanSchema, type IdeaPlan, type PlannerRequest } from "./planSchema";
import { applyResizeRequests } from "./relativeIdeaResize";
import { groundUnsupportedPlan } from "./unsupportedIntent";

type SeatFeature = "fixed-top" | "opening-lid" | "open-lid" | "close-lid" | "add-storage" | "remove-storage" | "backless";
type FeatureEdit = { feature: SeatFeature; target?: string; keepStorage?: boolean };

const lid = /(?:(?:opening|openable|hinged|lift[ -]up|seat)\s+)*lids?/;
const storage = /(?:(?:closed|enclosed|under[ -]seat)\s+)?storage/;
const addable = "(" + lid.source + "|" + storage.source + ")";
const removable = "(" + lid.source + "|" + storage.source + "|(?:seat )?(?:backs?|backrests?))";
const remove = new RegExp(/^remove\s+(?:(the|its)\s+)?/.source + removable + /(?:\s+from\s+(.+))?$/.source);
const removePossessive = new RegExp(/^remove\s+(.+?)['’]s\s+/.source + removable + "$");
const add = new RegExp(/^add\s+(?:(?:an?|the)\s+)?/.source + addable + /\s+to\s+(.+)$/.source);
const give = new RegExp(/^give\s+(.+?)\s+(?:an?\s+)?/.source + "(fixed (?:top|seat)|" + lid.source + "|" + storage.source + ")$");
const pose = /^(?:preview\s+)?(open|close)\s+(.+)$/;
const lidTarget = /^(?:the\s+)?(?:(.+?)\s+)?lids?(?:\s+(?:on|of|for)\s+(.+))?$/;
const allLids = /^(?:all|each|every)\s+(?:of\s+)?(?:the\s+)?(?:seat\s+)?lids?$/;
const preserveStorage = /\s+while (?:keeping|retaining|preserving)\s+(?:the |its )?(?:enclosed )?storage$/;
const allSeats = /^(?:all|each|every)\s+(?:of\s+)?(?:the\s+)?(?:sections?|seats?|benches|compartments?|modules?)$|^(?:the\s+)?(?:whole|entire)\s+(?:banquette|bench run|seating run)$/;
const pronoun = /^(?:it|its|this)(?:\s+(?:seat|section|module))?$/;
const genericSeat = /^(?:the\s+)?(?:banquette|bench|seat|seating|storage bench|section)$/;

function seatFeatureEdit(clause: string): FeatureEdit | null {
  const keepStorage = preserveStorage.test(clause);
  const text = clause.replace(preserveStorage, "").replace(/^please\s+/, "");
  const movement = pose.exec(text);
  if (movement) {
    const subject = movement[2],
      feature = movement[1] === "open" ? "open-lid" : "close-lid";
    if (allLids.test(subject)) return { feature, target: "all lids" };
    const match = lidTarget.exec(subject);
    const owner = match?.[1] === "seat" ? undefined : match?.[1]?.replace(/['’]s$/, "");
    if (match && !(owner && match[2])) {
      const target = match[2] ?? owner;
      if (target && /^(?:left|right|middle|cent(?:er|re))$/.test(target))
        return { feature, target: `${target} seat` };
      return { feature, target };
    }
  }
  const removal = remove.exec(text), possessive = removePossessive.exec(text);
  if (removal || possessive) {
    const name = removal?.[2] ?? possessive![2];
    return {
      feature: /lids?$/.test(name) ? "fixed-top" : name.endsWith("storage") ? "remove-storage" : "backless",
      target: removal?.[3] ?? (removal?.[1] === "its" ? "it" : possessive?.[1]),
      keepStorage,
    };
  }
  const addition = add.exec(text), gift = give.exec(text);
  if (addition || gift) {
    const name = addition?.[1] ?? gift![2];
    return {
      feature: name.startsWith("fixed") ? "fixed-top" : name.endsWith("storage") ? "add-storage" : "opening-lid",
      target: addition?.[2] ?? gift![1],
      keepStorage,
    };
  }
  const backless = /^(?:make|leave)\s+(.+?)\s+backless$/.exec(text);
  return backless ? { feature: "backless", target: backless[1] } : null;
}

function seatTargets(plan: IdeaPlan, target: string | undefined, priorIndex: number | undefined) {
  const seats = plan.modules.flatMap(({ kind }, index) => kind === "bench" ? [index] : []);
  if (target && allSeats.test(target)) return seats;
  // An unqualified feature in the next clause belongs to the last uniquely named seat.
  if ((!target || pronoun.test(target)) && priorIndex !== undefined) {
    return plan.modules[priorIndex].kind === "bench" ? [priorIndex] : [];
  }
  const index = target ? requestedModule(plan, target) : undefined;
  if (index !== undefined) return index !== "ambiguous" && plan.modules[index].kind === "bench" ? [index] : [];
  if (seats.length !== 1) return [];
  if (target && genericSeat.test(target)) return seats;
  return (!target || pronoun.test(target)) && plan.modules.length === 1 && !plan.structures.length ? seats : [];
}

/** Keep mixed size and feature edits transactional, using the same dimension rules as size-only requests. */
export function localSeatFeaturePlan(request: PlannerRequest): IdeaPlan | null {
  const previous = request.previousPlan;
  if (!previous?.modules.some(({ kind }) => kind === "bench")) return null;
  const clauses = splitIdeaEdits(trimPreservationClause(normalizeIdeaText(request.prompt).trim().replace(/[.!?]+$/, "")));
  const actions = clauses.map(seatFeatureEdit);
  if (!actions.some(Boolean)) return null;
  const boundary = groundUnsupportedPlan(request);
  if (boundary) return ideaPlanSchema.parse(boundary);

  const retain = (question: string) => retainWithQuestion(previous, question);
  const changedFeatures = new Map<number, Set<SeatFeature | "keep-storage">>();
  let candidate = structuredClone(previous);
  let priorIndex: number | undefined;
  let resized = false;
  let fixedEdge = false;
  for (let i = 0; i < clauses.length; i++) {
    const action = actions[i];
    if (action) {
      const targets = action.target === "all lids"
        ? candidate.modules.flatMap(({ kind, openingLid }, index) => kind === "bench" && openingLid ? [index] : [])
        : seatTargets(candidate, action.target, priorIndex);
      if (!targets.length)
        return retain(action.target === "all lids"
          ? "This proposal has no opening seat lids to preview."
          : "Which seat should change? Name or number one section, or say “all seats.”");
      for (const index of targets) {
        const seat = candidate.modules[index];
        const assigned = changedFeatures.get(index) ?? new Set<SeatFeature | "keep-storage">();
        assigned.add(action.feature);
        if (action.keepStorage) assigned.add("keep-storage");
        changedFeatures.set(index, assigned);
        if (assigned.has("open-lid") && assigned.has("close-lid"))
          return retain(`Should the lid on ${seat.name} be open or closed in this preview?`);
        if ((assigned.has("open-lid") || assigned.has("close-lid")) &&
          (assigned.has("fixed-top") || assigned.has("remove-storage")))
          return retain(`Choose whether to move or remove the lid on ${seat.name}.`);
        if ((assigned.has("fixed-top") && assigned.has("opening-lid")) ||
          (assigned.has("remove-storage") &&
            (assigned.has("add-storage") || assigned.has("opening-lid") || assigned.has("keep-storage"))))
          return retain("Choose compatible changes for " + seat.name + ". A seat can have a fixed top or an opening lid, and an opening lid requires an enclosure.");
        if (action.keepStorage && !seat.storage)
          return retain("Should " + seat.name + " have enclosed storage? Confirm how the storage should change with the seat.");
        switch (action.feature) {
          case "opening-lid":
            seat.openingLid = true;
            seat.storage = true;
            break;
          case "open-lid":
          case "close-lid":
            if (!seat.openingLid)
              return retain(`${seat.name} has a fixed top. Ask to add an opening lid first.`);
            seat.lidOpen = action.feature === "open-lid";
            break;
          case "remove-storage":
            seat.storage = false;
            seat.openingLid = false;
            seat.lidOpen = false;
            break;
          case "fixed-top":
            seat.openingLid = false;
            seat.lidOpen = false;
            break;
          case "add-storage":
            seat.storage = true;
            break;
          case "backless":
            seat.backHeight = 0;
            break;
        }
      }
      priorIndex = targets.length === 1 ? targets[0] : undefined;
      continue;
    }

    const start = i;
    while (i + 1 < clauses.length && !actions[i + 1]) i++;
    const edits = requestedDimensionEdits(clauses.slice(start, i + 1).join(", "));
    if (!edits) return retain("Describe each change separately, such as “make section 2 two inches taller” and “remove its lid.”");
    if ("question" in edits) return retain(edits.question);
    const scoped = edits.map((edit) => {
      const scope = priorIndex !== undefined && pronoun.test(edit.scope)
        ? "section " + (priorIndex + 1)
        : edit.scope;
      return { ...edit, scope };
    });
    candidate = applyResizeRequests(candidate, scoped);
    if (candidate.questions.length) return retain(candidate.questions[0]);
    const lastTarget = requestedModule(candidate, scoped[scoped.length - 1].scope);
    priorIndex = typeof lastTarget === "number" ? lastTarget : undefined;
    resized = true;
    fixedEdge ||= scoped.some((edit) => !!edit.fixedEdge);
  }

  candidate.assumptions = candidate.assumptions.filter((note) =>
    (!/^The optional back panel/.test(note) || candidate.modules.some(({ backHeight }) => backHeight > 0)) &&
    (!/^Storage is enclosed/.test(note) || candidate.modules.some(({ storage }) => storage)) &&
    (!/^(?:Seat lids can be shown|Opening lids have a provisional rear pivot)/.test(note) ||
      candidate.modules.some(({ openingLid }) => openingLid)),
  );
  if (candidate.modules.some(({ openingLid }) => openingLid) &&
    !candidate.assumptions.some((note) => /hinge.*(?:unpriced|not specified)/i.test(note))) {
    candidate.assumptions = [
      ...candidate.assumptions.slice(0, 11),
      "Opening lids have a provisional rear pivot. Choose hinges and lid stays and check pinch points and wall clearance.",
    ];
  }
  return ideaPlanSchema.parse({
    ...candidate, questions: [],
    summary: fixedEdge ? "Updated the requested seat features and dimensions while holding the selected edges in place."
      : resized ? "Updated the requested seat features and dimensions together."
      : actions.every((action) => action?.feature === "open-lid" || action?.feature === "close-lid")
        ? "Updated the preview position of the requested lids."
      : "Updated the requested seat features.",
  });
}
