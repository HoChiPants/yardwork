import type { IdeaPlan, PlannerRequest } from "./planSchema";

export type UnsupportedDomain =
  | "pool"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "sprinkler"
  | "drainage"
  | "excavation";
export type UnsupportedIntentAssessment = {
  primary: boolean;
  domains: UnsupportedDomain[];
  question: string;
  note: string;
};

const systems: { domain: UnsupportedDomain; terms: RegExp }[] = [
  {
    domain: "pool",
    terms:
      /\b(?:swimming\s+)?pools?\b(?!\s+(?:tables?|cues?|companies|company)\b)/g,
  },
  {
    domain: "plumbing",
    terms:
      /\b(?:plumb(?:ing)?|pipework|pipe\s+(?:layout|routing)|water\s+(?:supply\s+)?lines?)\b/g,
  },
  {
    domain: "electrical",
    terms:
      /\b(?:electric(?:al|ity)?|wir(?:e|ing)|rewir(?:e|ing)|circuits?|outlets?|conduits?)\b/g,
  },
  {
    domain: "hvac",
    terms:
      /\b(?:hvac|duct(?:work|\s+work|s)?|air\s+conditioning|(?:heating|ventilation)\s+(?:systems?|layouts?))\b/g,
  },
  { domain: "sprinkler", terms: /\b(?:sprinklers?|irrigation)\b/g },
  { domain: "drainage", terms: /\b(?:drains?|drainage|sewers?|septic)\b/g },
  {
    domain: "excavation",
    terms: /\b(?:excavat(?:e|ion|ing)|dig(?:ging)?|trenches?|trenching)\b/g,
  },
];
const physicalObject =
  /\b(?:banquettes?|benches|bench|seating|seats?|armchairs?|cabinets?|cabinetry|cupboards?|vanit(?:y|ies)|enclosures?|housings?|casings?|covers?|shel(?:f|ves|ving)|racks?|box(?:es)?|frames?|workbenches?|saunas?|greenhouses?)\b/;
const enclosure =
  /\b(?:cabinets?|cabinetry|cupboards?|vanit(?:y|ies)|enclosures?|housings?|casings?|covers?|casework|shel(?:f|ves|ving)|racks?|box(?:es)?)\b/;
const immediateObject =
  /^\s+(?:(?:panel|equipment|service|unit|pipe|utility|meter|system|valve|pump|filter|heater)\s+){0,2}(?:cabinets?|enclosures?|housings?|casings?|covers?|casework|shel(?:f|ves|ving)|racks?|box(?:es)?)\b/;
const directNegation =
  /\b(?:no|not|without|exclude|excluding|never|do not(?:\s+(?:want|add|move|change|design|plan|install|route|run))?|don't(?:\s+(?:want|add|move|change|design|plan|install|route|run))?|without\s+(?:moving|changing|designing|installing))\s+(?:(?:a|an|any|the|new|existing)\s+)*$/;
const requestAction =
  /\b(?:design|plan|create|build|construct|draw|lay\s+out|layout|specify|install|add|route|run|move|reroute|connect|replace|rewire|size|calculate|locate|position|place|relocate|excavate|dig|need|want|change|revise)\b/;
const omittedSelection =
  /\b(?:do not|don't|never)\s+(?:invent|assume|choose|select)\b([^.!?;]{0,120})$/;
const directedAction =
  /\b(?:design|plan|create|build|construct|draw|lay\s+out|specify|install|add|route|run|move|reroute|connect|replace|rewire|size|calculate|locate|position|place|relocate|excavate|dig)\s+(?:(?:a|an|the|any|new|existing|bathroom|kitchen|water|electrical)\s+){0,4}$/;
const locative =
  /\b(?:near|beside|next\s+to|adjacent\s+to|around|under|over|above|below|in\s+front\s+of|behind|alongside|by|clear\s+of)\s+(?:(?:a|an|the|existing|current|fixed|old|bathroom|kitchen|service|utility)\s+){0,4}$/;
const enclosureFor =
  /\b(?:for|around|covering|concealing|hiding|enclosing)\s+(?:(?:a|an|the|existing|current|fixed|old|bathroom|kitchen|service|utility)\s+){0,4}$/;
const labels: Record<UnsupportedDomain, string> = {
  pool: "pool systems",
  plumbing: "plumbing",
  electrical: "electrical systems",
  hvac: "HVAC",
  sprinkler: "sprinkler/irrigation systems",
  drainage: "drains/drainage",
  excavation: "excavation",
};

/**
 * Raw-request boundary, not a complete natural-language classifier. Match known
 * unimplemented systems only; unfamiliar furniture paraphrases remain available
 * to the model. Explicit system work wins over a nearby furniture noun, while
 * locative/enclosure/background mentions do not turn into a keyword prohibition.
 */
export function assessUnsupportedIntent(
  prompt: string,
): UnsupportedIntentAssessment | null {
  const text = prompt.toLowerCase().replace(/[’]/g, "'"),
    hasObject = physicalObject.test(text);
  const contexts = new Set<UnsupportedDomain>(),
    primary = new Set<UnsupportedDomain>();
  for (const clause of text.split(/[;!?\n]|\.(?!\d)/)) {
    const hits = systems.flatMap(({ domain, terms }) =>
      [...clause.matchAll(terms)].map((match) => ({
        domain,
        index: match.index,
        end: match.index + match[0].length,
      })),
    );
    hits.sort((a, b) => a.index - b.index || b.end - a.end);
    let previousEnd = 0,
      previousNegated = false,
      previousContext = false;
    for (const hit of hits) {
      const before = clause.slice(0, hit.index),
        after = clause.slice(hit.end),
        between = clause.slice(previousEnd, hit.index),
        excludedProducts = before.match(omittedSelection)?.[1],
        negated: boolean =
          directNegation.test(before) ||
          (excludedProducts !== undefined &&
            !requestAction.test(excludedProducts) &&
            !/\b(?:but|then|also|include)\b/.test(excludedProducts)) ||
          (previousNegated &&
            /^\s*(?:(?:,|or|and|nor|a|an|any|the|new|existing|current|panel|equipment|systems?|work)\s*)*$/.test(
              between,
            ));
      // "Wire" can name sheet/fence material rather than an electrical task.
      // Skip only that lexical occurrence; a later "wire it" still requires clarification.
      if (
        hit.domain === "electrical" &&
        clause.slice(hit.index, hit.end) === "wire" &&
        (/^\s+(?:mesh|cloth|fenc(?:e|ing)|netting)\b/.test(after) ||
          /\b(?:chicken|poultry)\s+$/.test(before))
      )
        continue;
      previousEnd = hit.end;
      previousNegated = negated;
      if (negated) {
        previousContext = false;
        continue;
      }
      const furnitureModifier = immediateObject.test(after),
        action = directedAction.test(before),
        adjacent = locative.test(before),
        surroundingObject =
          enclosure.test(clause) &&
          (enclosureFor.test(before) ||
            /\b(?:clearance|clearances|access|reserve|reserved)\b/.test(after)),
        background =
          hasObject &&
          !requestAction.test(clause) &&
          /\b(?:is|are|exists?|existing|already|stays?|remains?)\b/.test(
            clause,
          ),
        poolArea =
          hit.domain === "pool" &&
          hasObject &&
          /\bfor\s+(?:(?:a|an|the)\s+)?$/.test(before) &&
          /^\s+(?:deck|area|patio)\b/.test(after),
        coordinatedContext: boolean =
          previousContext &&
          /^\s*(?:(?:and|or|with|,|the|existing|current|fixed|panel|panels|unit|systems?|lines?)\s*)*$/.test(
            between,
          );
      const isExcavationAction =
        hit.domain === "excavation" &&
        /^(?:dig|digging|excavate|excavating)$/.test(
          clause.slice(hit.index, hit.end),
        ) &&
        !adjacent;
      previousContext =
        !isExcavationAction &&
        (furnitureModifier ||
          (!action &&
            (adjacent ||
              surroundingObject ||
              background ||
              poolArea ||
              coordinatedContext)));
      if (previousContext) contexts.add(hit.domain);
      else primary.add(hit.domain);
    }
  }
  const domains = [...new Set([...primary, ...contexts])];
  if (!domains.length) return null;
  const names = domains.map((domain) => labels[domain]).join(", ");
  return {
    primary: primary.size > 0,
    domains,
    question: `This builder does not model ${names}. Are you asking for surrounding furniture/casework only, or for the system work itself?`,
    note: "Surrounding pool/utility systems and their interfaces are not modeled. Confirm actual site clearances and keep system layout, installation and excavation separate from the furniture geometry.",
  };
}

/** Preserve requirements while adding one bounded context note to a supported proposal. */
function withInterfaceNote(plan: IdeaPlan, note: string): IdeaPlan {
  if (
    [
      plan.summary,
      ...plan.assumptions,
      ...plan.questions,
      ...plan.suggestions,
    ].some((item) => item.includes(note))
  )
    return plan;
  if (plan.assumptions.length < 12)
    return { ...plan, assumptions: [...plan.assumptions, note] };
  if (plan.suggestions.length < 12)
    return { ...plan, suggestions: [...plan.suggestions, note] };
  if (plan.questions.length < 8)
    return { ...plan, questions: [...plan.questions, note] };
  const index = plan.assumptions.findIndex(
    (item) => item.length + note.length + 1 <= 400,
  );
  if (index >= 0)
    return {
      ...plan,
      assumptions: plan.assumptions.map((item, i) =>
        i === index ? `${item} ${note}` : item,
      ),
    };
  // Match the compatible intent mapper: never drop existing requirements or
  // truncate source prose merely to make room for another interface note.
  return plan;
}

/**
 * Raw-request scope grounding shared by local and validated provider plans.
 * With no proposed plan, only unsupported primary work produces a result.
 * Provider callers must validate normal completion and typed content FIRST;
 * this helper never repairs a provider failure or calls a model.
 */
export function groundUnsupportedPlan(
  request: PlannerRequest,
  proposed?: IdeaPlan,
): IdeaPlan | null {
  const boundary = assessUnsupportedIntent(request.prompt);
  if (!boundary) return proposed ?? null;
  if (!boundary.primary)
    return proposed ? withInterfaceNote(proposed, boundary.note) : null;
  const genuineQuestions =
    proposed && !proposed.modules.length && !proposed.structures.length
      ? proposed.questions
      : [];
  const questions = [
    ...new Set([
      boundary.question,
      ...genuineQuestions,
      ...(request.previousPlan?.questions ?? []),
    ]),
  ].slice(0, 8);
  if (request.previousPlan)
    return {
      ...structuredClone(request.previousPlan),
      summary:
        "The existing proposal is retained while the unsupported system request is clarified.",
      questions,
    };
  return {
    title: "Clarify the system scope",
    summary: boundary.note,
    assumptions: [boundary.note],
    questions,
    suggestions: [],
    modules: [],
    structures: [],
  };
}
