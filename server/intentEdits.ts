import { material } from "../src/model";
import {
  isAddition,
  referencedFamily,
  ambiguousShelfReference,
  closetMeasurements,
  requestedShelfCount,
  namedMeasurement,
  normalizeIdeaText,
  type BuildFamily,
} from "../src/ideaEdits";
import type { IdeaPlan, PlannerRequest } from "../src/planning";
import type { ModelIntent } from "./intentPlanner";

export type PreparedIntentEdits = {
  intent: ModelIntent;
  mode: "create" | "append" | "revise" | "clarify";
  /** Previous module indices, or new tail entries for creation/addition. */
  targets: number[] | "new";
  /** These edits are supported here even when the local language reducer asks what to change. */
  postOnly: boolean;
  /** Raw requested edits, with preservation clauses excluded before deterministic expansion. */
  prompt: string;
};
const modelFamily = (family: BuildFamily): ModelIntent["family"] =>
  family === "shelf" ? "shelves" : family === "panel" ? "clarify" : family;
const canonicalFamily = (family: ModelIntent["family"]) =>
  family === "banquette" ? "bench" : family === "shelves" ? "shelf" : family;
function clarify(intent: ModelIntent, question: string): PreparedIntentEdits {
  return {
    intent: {
      family: "clarify",
      operation: "clarify",
      summary:
        "Your previous proposal is retained while this edit is clarified.",
      questions: [question],
      suggestions: intent.suggestions,
    },
    mode: "clarify",
    targets: [],
    postOnly: false,
    prompt: "",
  };
}
function changeText(prompt: string) {
  return normalizeIdeaText(prompt)
    .split(/[.;\n]/)
    .map((clause) =>
      clause.replace(
        /^\s*(?:keep|preserve|retain|leave)\b[\s\S]*?\b(?:and|but)\s+(?=(?:increase|decrease|make|set|change|remove|add)\b)/,
        "",
      ),
    )
    .filter((clause) => !/^\s*(?:keep|preserve|retain|leave)\b/.test(clause))
    .join(". ");
}
const dimensionLabels = {
  width: "wide|width|long|length|along the back",
  depth: "deep|depth|seat depth",
  height: "seat height|high|height|tall|eave height|clear height",
  returnLength: "return length|return",
  roofRise: "roof rise|rise",
  doorWidth: "door width",
  doorHeight: "door height",
} as const;
/** Model inference can initialize an idea. A revision has only fields actually requested in raw text. */
export function prepareIntentEdits(
  request: PlannerRequest,
  source: ModelIntent,
): PreparedIntentEdits {
  const previous = request.previousPlan;
  if (source.family === "clarify" || source.operation === "clarify")
    return {
      intent: structuredClone(source),
      mode: "clarify",
      targets: [],
      postOnly: false,
      prompt: request.prompt,
    };
  if (!previous || (!previous.modules.length && !previous.structures.length))
    return {
      intent: structuredClone(source),
      mode: "create",
      targets: "new",
      postOnly: false,
      prompt: request.prompt,
    };
  const raw = normalizeIdeaText(request.prompt),
    text = changeText(request.prompt),
    rawFamily = referencedFamily(raw, previous),
    knownFamilies = new Set([
      ...previous.modules.map((m) => m.kind),
      ...previous.structures.map((s) => s.kind),
    ]),
    explicitNew =
      !!rawFamily &&
      !knownFamilies.has(rawFamily) &&
      /^\s*(?:a |an |build |create |make (?:a |an ))/.test(raw);
  if (ambiguousShelfReference(raw, previous))
    return clarify(
      source,
      "Do you mean the framed shelf module or the panel casework bookcase? Select the existing design before changing it.",
    );
  if (isAddition(raw) || explicitNew)
    return {
      intent: {
        ...structuredClone(source),
        operation: "append",
        targetSection: undefined,
      },
      mode: "append",
      targets: "new",
      postOnly: false,
      prompt: request.prompt,
    };
  const numbered = raw.match(
      /\b(?:section|compartment|module)\s*#?\s*(\d{1,2})\b(?!\s*(?:feet|foot|ft|inches|inch|in|[′'″"]))/,
    ),
    names = previous.modules
      .map((m, i) => (raw.includes(m.name.toLowerCase()) ? i : -1))
      .filter((i) => i >= 0);
  let targets: number[];
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (index < 0 || index >= previous.modules.length)
      return clarify(
        source,
        "That section is not in the previous proposal. Select or name an existing section.",
      );
    targets = [index];
  } else if (names.length === 1) targets = names;
  else if (names.length > 1)
    return clarify(
      source,
      "Several section names match. Select the specific section to change.",
    );
  else if (rawFamily) {
    targets = previous.modules
      .map((m, i) => (m.kind === rawFamily ? i : -1))
      .filter((i) => i >= 0);
    if (
      !targets.length &&
      !previous.structures.some((s) => s.kind === rawFamily)
    )
      return clarify(
        source,
        "That item is not in the previous proposal. Use Add to create a separate item.",
      );
  } else if (knownFamilies.size === 1)
    targets = previous.modules.map((_, i) => i);
  else
    return clarify(
      source,
      "Which existing section or family should change? The mixed proposal is retained.",
    );
  if (
    !numbered &&
    !names.length &&
    /\b(?:left|right|middle|first|second|third|last)\s+(?:section|seat|bench|cabinet|module)\b/.test(
      raw,
    )
  )
    return clarify(
      source,
      "Select the section by name or number so this localized edit does not change other items.",
    );
  const family =
      rawFamily ??
      (targets.length
        ? previous.modules[targets[0]].kind
        : previous.structures[0]?.kind),
    mismatch = family && family !== canonicalFamily(source.family),
    intent: ModelIntent = mismatch
      ? {
          family: modelFamily(family),
          operation: "revise",
          summary: "",
          questions: [],
          suggestions: [],
        }
      : structuredClone(source);
  intent.operation = "revise";
  // Start sparse: omit inferred defaults and a model target that raw text did not identify.
  for (const key of [
    ...Object.keys(dimensionLabels),
    "sectionCount",
    "targetSection",
    "storage",
    "openingLid",
    "backHeight",
    "towerWidth",
    "leftBayWidth",
    "rightBayWidth",
    "rodHeight",
    "shelfCount",
    "frameMaterial",
    "panelMaterial",
  ] as const)
    delete (intent as unknown as Record<string, unknown>)[key];
  if (targets.length === 1) intent.targetSection = targets[0] + 1;
  let reducerFields = false;
  const closet = family === "closet-insert" ? closetMeasurements(text) : null;
  if (closet) {
    for (const [key, fact] of Object.entries(closet.facts) as [keyof typeof closet.facts, ReturnType<typeof namedMeasurement>][]) {
      if (!fact) continue;
      if (fact.inches === null)
        return clarify(source, "Give the closet opening or rod-center measurement in inches or feet.");
      if (fact.inches <= 0 || fact.inches > 240)
        return clarify(source, "Give a positive closet opening or rod-center measurement up to 240 inches.");
      intent[key] = fact.inches;
      reducerFields = true;
    }
  }
  for (const [key, labels] of Object.entries(dimensionLabels) as [
    keyof typeof dimensionLabels,
    string,
  ][]) {
    const fact = namedMeasurement(
      closet?.envelope ?? text,
      labels,
      ["width", "depth", "height"].includes(key)
        ? /(?:door|roof|back|tower|shelf|bench)\s*$/
        : undefined,
    );
    if (!fact) continue;
    if (fact.inches === null)
      return clarify(
        source,
        "Should that measurement be in inches or feet? Existing dimensions are retained.",
      );
    if (fact.inches <= 0 || fact.inches > 240)
      return clarify(
        source,
        "Use an explicit positive dimension up to240 inches, or start a separate larger design.",
      );
    intent[key] = fact.inches;
    reducerFields = true;
  }
  const count = text.match(
    /\b(\d{1,2})[ -]*(?:sections?|compartments?|modules?)\b/,
  );
  if (count) {
    const n = Number(count[1]);
    if (n < 1 || n > 12)
      return clarify(source, "Choose one to twelve seating sections.");
    intent.sectionCount = n;
    reducerFields = true;
  }
  const noStorage = /\b(?:no|without|remove)\s+(?:the\s+)?storage\b/.test(text),
    hasStorage = /\bstorage\b|closed off|space underneath/.test(text),
    noLid =
      /\b(?:no|without|remove)\s+(?:an?\s+)?(?:opening\s+|openable\s+)?(?:seat\s+)?lids?\b/.test(
        text,
      ),
    hasLid =
      /\b(?:openable|opening|hinged|lift[ -]?up)\s+(?:seat\s+)?lids?\b|\bseats?\b.{0,25}\bopen\b/.test(
        text,
      );
  if (hasStorage) {
    intent.storage = !noStorage;
    reducerFields = true;
  }
  if (noLid || hasLid) {
    intent.openingLid = !noLid;
    reducerFields = true;
  }
  const back = namedMeasurement(text, "back height|backrest height"),
    noBack = /\b(?:no|without|remove)\s+(?:a\s+)?back\b|\bbackless\b/.test(
      text,
    ),
    addBack = /\b(?:wood(?:en)?|with(?: a)?|add(?: a)?)\s+back\b/.test(text);
  if (back) {
    if (back.inches === null)
      return clarify(source, "Specify the back height in inches or feet.");
    if (back.inches < 0 || back.inches > 48)
      return clarify(
        source,
        "Specify an above-seat back height between0 and48 inches.",
      );
    intent.backHeight = back.inches;
    reducerFields = true;
  } else if (noBack) {
    intent.backHeight = 0;
    reducerFields = true;
  } else if (addBack && source.backHeight !== undefined && !mismatch)
    intent.backHeight = source.backHeight;
  const shelves = requestedShelfCount(text);
  if (shelves !== undefined) {
    const n = shelves;
    if (n < 1 || n > 6)
      return clarify(source, "Choose one to six shelves for this recipe.");
    intent.shelfCount = n;
    if (family === "casework-shelves" || family === "closet-insert")
      reducerFields = true;
  }
  // A stock change is opt-in on revision; “same/existing stock” is preservation, not authorization.
  const stockText = text.replace(
    /\b(?:same|existing|current)\s+(?:stock|plywood|panels?|sheets?|lumber|boards?)\b/g,
    "",
  );
  if (
    !mismatch &&
    /\b(?:use|switch|change|replace|choose|select|set)\b[^.;\n]{0,120}\b(?:plywood|panels?|sheets?|plytanium)\b/.test(
      stockText,
    ) &&
    source.panelMaterial
  )
    intent.panelMaterial = source.panelMaterial;
  if (
    !mismatch &&
    /\b(?:use|switch|change|replace|choose|select|set)\b[^.;\n]{0,120}\b(?:lumber|studs?|framing|boards?|pine|cedar)\b/.test(
      stockText,
    ) &&
    source.frameMaterial
  )
    intent.frameMaterial = source.frameMaterial;
  const postOnly =
    !reducerFields &&
    (intent.panelMaterial !== undefined ||
      intent.frameMaterial !== undefined ||
      intent.shelfCount !== undefined ||
      intent.backHeight !== undefined);
  return {
    intent,
    mode: "revise",
    targets,
    postOnly,
    prompt: `${family ?? ""}. ${targets.length === 1 ? `section ${targets[0] + 1}. ` : ""}${text}`,
  };
}
function changedQuestions(candidate: IdeaPlan, previous: IdeaPlan) {
  return candidate.questions.some((q) => !previous.questions.includes(q));
}
/** Applies only scoped, requested post fields. It never broadens a local clarification into an edit. */
export function applyIntentEdits(
  candidate: IdeaPlan,
  prepared: PreparedIntentEdits,
  request: PlannerRequest,
): IdeaPlan {
  const previous = request.previousPlan,
    { intent, mode } = prepared;
  if (mode === "clarify")
    return previous
      ? {
          ...structuredClone(previous),
          summary:
            "Your previous proposal is retained while this edit is clarified.",
          questions: intent.questions.length
            ? intent.questions
            : ["Which existing part should change?"],
        }
      : structuredClone(candidate);
  if (
    mode === "revise" &&
    previous &&
    changedQuestions(candidate, previous) &&
    !prepared.postOnly
  )
    return structuredClone(candidate);
  const plan = structuredClone(
      mode === "revise" && prepared.postOnly && previous ? previous : candidate,
    ),
    previousCount = previous?.modules.length ?? 0,
    targets = new Set(
      prepared.targets === "new"
        ? plan.modules
            .map((_, i) => i)
            .filter((i) => (mode === "append" ? i >= previousCount : true))
        : prepared.targets,
    );
  let changed = false;
  plan.modules = plan.modules.map((module, index) => {
    if (!targets.has(index)) return module;
    const next = { ...module };
    if (mode === "revise" && previous?.modules.length === plan.modules.length) {
      const old = previous.modules[index];
      // The reducer may infer dependent geometry; it cannot reset unrelated choices on an edit.
      if (intent.storage === undefined && intent.openingLid !== true)
        next.storage = old.storage;
      if (intent.openingLid === undefined && intent.storage !== false)
        next.openingLid = old.openingLid;
      if (intent.openingLid !== false && intent.storage !== false)
        next.lidOpen = old.lidOpen;
      if (intent.backHeight === undefined) next.backHeight = old.backHeight;
      if (intent.shelfCount === undefined) next.levels = old.levels;
      if (intent.frameMaterial === undefined)
        next.frameMaterial = old.frameMaterial;
      if (intent.panelMaterial === undefined)
        next.panelMaterial = old.panelMaterial;
    }
    if (intent.frameMaterial) {
      const stock = material(intent.frameMaterial);
      if (!stock.wood || stock.stockKind !== "linear")
        throw Error("AI frame selection must be catalog wood lumber.");
      next.frameMaterial = intent.frameMaterial;
    }
    if (intent.panelMaterial) {
      const stock = material(intent.panelMaterial);
      if (!stock.wood || stock.stockKind !== "sheet")
        throw Error(
          "AI furniture panel selection must be catalog wood sheet stock.",
        );
      next.panelMaterial = intent.panelMaterial;
    }
    if (next.kind === "bench") {
      if (intent.storage === false) {
        next.storage = false;
        next.openingLid = false;
        next.lidOpen = false;
      }
      if (intent.openingLid === false) {
        next.openingLid = false;
        next.lidOpen = false;
      }
      if (intent.backHeight !== undefined) next.backHeight = intent.backHeight;
    }
    if (
      intent.shelfCount !== undefined &&
      ["shelf", "cabinet"].includes(next.kind)
    )
      next.levels = intent.shelfCount;
    changed ||= JSON.stringify(next) !== JSON.stringify(module);
    return next;
  });
  if (intent.family === "casework-shelves") {
    const matching =
      previous?.structures.filter((s) => s.kind === "casework-shelves") ?? [];
    if (
      mode === "revise" &&
      matching.length > 1 &&
      changedQuestions(candidate, previous!)
    )
      return structuredClone(candidate);
    plan.structures = plan.structures.map((structure, index) => {
      if (
        structure.kind !== "casework-shelves" ||
        (mode === "append" && index < (previous?.structures.length ?? 0))
      )
        return structure;
      if (mode === "revise" && matching.length !== 1) return structure;
      const next = structuredClone(structure);
      if (intent.shelfCount !== undefined)
        next.parameters.shelfCount = intent.shelfCount;
      if (intent.panelMaterial) {
        const stock = material(intent.panelMaterial);
        if (!stock.wood || stock.stockKind !== "sheet")
          throw Error(
            "AI casework panel selection must be catalog wood sheet stock.",
          );
        if (stock.productReference)
          next.selections.caseworkPanels = {
            materialId: stock.id,
            productRegistryRef: stock.productReference,
          };
        else if (stock.id === "plywood") delete next.selections.caseworkPanels;
        else
          throw Error(
            "Choose an exact reviewed casework panel source before changing the material.",
          );
      }
      changed ||= JSON.stringify(next) !== JSON.stringify(structure);
      return next;
    });
  }
  if (mode === "revise" && prepared.postOnly && !changed && previous)
    return {
      ...structuredClone(previous),
      summary:
        "Your previous proposal is retained; the selected recipe does not support that requested field.",
      questions: candidate.questions.length
        ? candidate.questions
        : ["Which supported section or field should change?"],
    };
  if (mode === "revise" && prepared.postOnly && changed) {
    plan.summary =
      "Updated only the requested fields on the identified sections; unrelated geometry, features and product selections are retained.";
    plan.questions = [...(previous?.questions ?? [])];
  }
  return plan;
}
