import { z } from "zod";
import { ollamaTimeoutMs } from "./ollamaTimeout";
import { material, materialIds } from "../src/model";
import { prepareIntentEdits, applyIntentEdits } from "./intentEdits";
import { reconcileNarrative } from "./intentNarrative";
import { toOllamaSchema } from "./ollamaSchema";
import { assessUnsupportedIntent } from "./unsupportedIntent";
import {
  completedOllamaJson,
  ollamaTimingReceipt,
  OllamaResponseError,
  type OllamaOutcome,
  type OllamaTimingObserver,
} from "./ollamaResponse";
import {
  referencedFamily,
  namedMeasurement,
  editCaseworkShelfCount,
  normalizeIdeaText,
  requestsBanquetteReturn,
} from "../src/ideaEdits";
import {
  ideaPlanSchema,
  localIdeaPlan,
  type IdeaPlan,
  type PlannerRequest,
} from "../src/planning";

function reviewedPlan(plan: IdeaPlan) {
  return ideaPlanSchema.parse(reconcileNarrative(plan));
}

function withInterfaceNote(plan: IdeaPlan, note: string | undefined): IdeaPlan {
  if (
    !note ||
    [...plan.assumptions, ...plan.questions, ...plan.suggestions].some((item) =>
      item.includes(note),
    )
  )
    return plan;
  // Preserve every existing requirement rather than truncating an array to add a warning.
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
  return plan;
}

const dimension = z.number().finite().positive().max(240).optional();
/** Sparse measurements keep model work small. Missing fields preserve the prior proposal/default disclosure. */
export const modelIntentSchema = z.strictObject({
  family: z.enum([
    "banquette",
    "bench",
    "workbench",
    "cabinet",
    "shelves",
    "frame",
    "greenhouse",
    "sauna",
    "closet-insert",
    "casework-shelves",
    "clarify",
  ]),
  operation: z
    .enum(["create", "revise", "append", "clarify"])
    .default("create"),
  width: dimension,
  depth: dimension,
  height: dimension,
  shape: z.enum(["straight", "l"]).optional(),
  returnLength: dimension,
  sectionCount: z.number().int().min(1).max(12).optional(),
  targetSection: z.number().int().min(1).max(12).optional(),
  storage: z.boolean().optional(),
  openingLid: z.boolean().optional(),
  backHeight: z.number().finite().min(0).max(48).optional(),
  shelfCount: z.number().int().min(1).max(6).optional(),
  roofRise: dimension,
  doorWidth: dimension,
  doorHeight: dimension,
  frameMaterial: z.enum(materialIds).optional(),
  panelMaterial: z.enum(materialIds).optional(),
  summary: z.string().max(400).default(""),
  questions: z.array(z.string().min(1).max(300)).max(3).default([]),
  suggestions: z.array(z.string().min(1).max(300)).max(3).default([]),
});
export type ModelIntent = z.infer<typeof modelIntentSchema>;

/** The model-facing wire omits narrative; internal/replay intents remain compatible. */
const designWireSchema = modelIntentSchema
  .omit({ summary: true, questions: true, suggestions: true })
  .extend({
    family: modelIntentSchema.shape.family.exclude(["clarify"]),
    operation: z.enum(["create", "revise", "append"]),
  });
const clarifyWireSchema = z.strictObject({
  family: z.literal("clarify"),
  operation: z.literal("clarify"),
  question: z.string().trim().min(1).max(240),
});
export const intentWireSchema = z.discriminatedUnion("family", [
  designWireSchema,
  clarifyWireSchema,
]);
export type IntentWire = z.infer<typeof intentWireSchema>;
export function wireIntentToPlan(
  request: PlannerRequest,
  raw: unknown,
): IdeaPlan {
  let input = raw;
  if (raw && typeof raw === "object" && "family" in raw && raw.family !== "clarify") {
    const design = { ...raw } as Record<string, unknown>;
    // A zero in an optional feature slot indicates an omitted provider value.
    // Primary dimensions and user-supplied facts still need their own validation.
    for (const key of ["returnLength", "sectionCount", "targetSection", "shelfCount", "roofRise", "doorWidth", "doorHeight"])
      if (design[key] === 0) delete design[key];
    input = design;
  }
  const wire = intentWireSchema.parse(input);
  if (wire.family === "clarify")
    return intentToPlan(request, {
      family: "clarify",
      operation: "clarify",
      questions: [wire.question],
    });
  if (!request.previousPlan) delete wire.targetSection;
  const prompt = normalizeIdeaText(request.prompt);
  const explicitlyNamed = (id: (typeof materialIds)[number]) =>
    prompt.includes(id) || prompt.includes(normalizeIdeaText(material(id).name));
  const namesFramingStock =
    /\b(?:use|frame|build)\b[^.,;\n]{0,90}\b(?:pressure[- ]treated|lumber|studs?|boards?|cedar|pine|fir|2\s*x\s*4)\b/.test(prompt);
  const namesPanelStock =
    /\b(?:plywood|plytanium|purebond|mdf|osb|melamine|sheet stock)\b/.test(prompt);
  if (wire.frameMaterial && !explicitlyNamed(wire.frameMaterial) && !namesFramingStock)
    delete wire.frameMaterial;
  if (wire.panelMaterial && !explicitlyNamed(wire.panelMaterial) && !namesPanelStock)
    delete wire.panelMaterial;
  return intentToPlan(request, wire);
}

/** Small local models sometimes fill unused optional slots with zero/null.
 * These denote no intent, never a zero-sized physical part. Raw user facts and
 * the resulting plan still pass their independent dimension/scope validation. */
export function normalizeIntentPlaceholders(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const next = { ...input } as Record<string, unknown>;
  const positive = [
    "width",
    "depth",
    "height",
    "returnLength",
    "sectionCount",
    "targetSection",
    "shelfCount",
    "roofRise",
    "doorWidth",
    "doorHeight",
  ];
  const optional = [
    ...positive,
    "operation",
    "shape",
    "storage",
    "openingLid",
    "backHeight",
    "frameMaterial",
    "panelMaterial",
    "summary",
    "questions",
    "suggestions",
  ];
  for (const key of optional)
    if (next[key] === null || (positive.includes(key) && next[key] === 0))
      delete next[key];
  return next;
}

export function intentToPlan(request: PlannerRequest, raw: unknown): IdeaPlan {
  let intent = modelIntentSchema.parse(normalizeIntentPlaceholders(raw));
  const boundary = assessUnsupportedIntent(request.prompt),
    finalize = (plan: IdeaPlan) =>
      reviewedPlan(
        withInterfaceNote(
          plan,
          boundary && !boundary.primary ? boundary.note : undefined,
        ),
      );
  if (boundary?.primary) {
    const questions = [
      ...new Set([
        boundary.question,
        ...(intent.family === "clarify" || intent.operation === "clarify"
          ? intent.questions
          : []),
      ]),
    ].slice(0, 8);
    if (request.previousPlan)
      return reviewedPlan({
        ...structuredClone(request.previousPlan),
        summary:
          "The existing proposal is retained while the unsupported system request is clarified.",
        questions,
      });
    return reviewedPlan({
      title: "Clarify the system scope",
      summary: boundary.note,
      assumptions: [boundary.note],
      questions,
      suggestions: [],
      modules: [],
      structures: [],
    });
  }
  const shelfAdjustment = editCaseworkShelfCount(
    request.previousPlan,
    request.prompt,
  );
  if (shelfAdjustment) return finalize(shelfAdjustment);
  if (
    (intent.family === "clarify" || intent.operation === "clarify") &&
    request.previousPlan
  )
    return finalize({
      ...structuredClone(request.previousPlan),
      summary:
        "Your previous proposal is retained while the requested change is clarified.",
      questions: intent.questions.length
        ? intent.questions
        : ["Which part of the previous proposal should change?"],
      suggestions: [
        ...new Set([
          ...request.previousPlan.suggestions,
          ...intent.suggestions,
        ]),
      ].slice(0, 12),
    });
  if (intent.family === "clarify" || intent.operation === "clarify")
    return finalize({
      title: "Let's clarify the design",
      summary:
        intent.summary ||
        "More information is needed before proposing geometry.",
      assumptions: [],
      questions: intent.questions.length
        ? intent.questions
        : [
            "What are you building, and what dimensions and features should it have?",
          ],
      suggestions: intent.suggestions,
      modules: [],
      structures: [],
    });
  const requestedFamily = referencedFamily(
      request.prompt,
      request.previousPlan,
    ),
    modelFamily =
      intent.family === "banquette"
        ? "bench"
        : intent.family === "shelves"
          ? "shelf"
          : intent.family;
  if (requestedFamily && requestedFamily !== modelFamily) {
    // A recognized user request has priority over a conflicting inferred type.
    intent = modelIntentSchema.parse({
      family: requestedFamily === "shelf" ? "shelves" : requestedFamily,
      operation: intent.operation,
    });
  }
  if (intent.family === "banquette" || intent.family === "bench") {
    // A return changes the layout, so the requested footprint must support it.
    if (!requestsBanquetteReturn(request.prompt)) {
      delete intent.shape;
      delete intent.returnLength;
    }
    const normalized = normalizeIdeaText(request.prompt);
    // Use the editable seating defaults when the request includes features but no measurements.
    if (!/\b\d+(?:\.\d+)?\s*(?:feet|foot|ft|inches|inch|in)\b|\d\s*[′'″"]|\b(?:counter|bar)[ -]height\b/.test(normalized)) {
      delete intent.width;
      delete intent.depth;
      delete intent.height;
      delete intent.returnLength;
    }
  }
  const text = request.prompt.toLowerCase(),
    noStorage = /\b(?:no|without|remove)\s+(?:the\s+)?storage\b/.test(text),
    noLid =
      /\b(?:no|without|remove)\s+(?:an?\s+)?(?:opening\s+|openable\s+)?(?:seat\s+)?lids?\b/.test(
        text,
      );
  const wantsStorage =
      !noStorage && /\bstorage\b|closed off|space underneath/.test(text),
    wantsLid =
      !noLid &&
      /\b(?:openable|opening|hinged|lift[ -]?up)\s+(?:seat\s+)?lids?\b|\bseats?\b.{0,25}\bopen\b/.test(
        text,
      );
  if (noStorage && wantsLid)
    return intentToPlan(request, {
      family: "clarify",
      operation: "clarify",
      questions: [
        "Should the opening lid cover enclosed storage, or are you planning a different hinged top?",
      ],
    });
  if (noStorage) intent.storage = false;
  else if (wantsStorage) intent.storage = true;
  if (noLid) intent.openingLid = false;
  else if (wantsLid) {
    intent.openingLid = true;
    intent.storage = true;
  }
  if (/\b(?:no|without)\s+(?:a\s+)?back\b|\bbackless\b/.test(text))
    intent.backHeight = 0;
  else {
    const back = namedMeasurement(
      request.prompt,
      "back height|backrest height",
    );
    if (back?.inches !== null && back?.inches !== undefined)
      intent.backHeight = back.inches;
    else if (
      intent.backHeight === 0 &&
      /\b(?:wood(?:en)?|with(?: a)?|add(?: a)?)\s+back\b/.test(text)
    )
      delete intent.backHeight;
  }
  const prepared = prepareIntentEdits(request, intent);
  intent = prepared.intent;
  if (prepared.mode === "clarify") return intentToPlan(request, intent);
  const reducerPrompt =
    prepared.mode === "revise" ? prepared.prompt : request.prompt;
  const family =
    intent.family === "closet-insert" ? "closet insert" : intent.family;
  const additions: string[] = [];
  for (const [key, label] of [
    ["width", "width"],
    ["depth", "depth"],
    ["height", "height"],
    ["returnLength", "return"],
    ["roofRise", "roof rise"],
    ["doorWidth", "door width"],
    ["doorHeight", "door height"],
  ] as const)
    if (intent[key] !== undefined)
      additions.push(`${intent[key]} inches ${label}`);
  if (intent.shape === "l") additions.push("L-shaped");
  if (intent.sectionCount !== undefined)
    additions.push(`${intent.sectionCount} sections`);
  if (
    intent.targetSection !== undefined &&
    !/\bsection\s+\d+\b/i.test(request.prompt)
  )
    additions.unshift(`section ${intent.targetSection}`);
  if (intent.storage === true) additions.push("storage");
  if (intent.storage === false) additions.push("no storage");
  if (intent.openingLid === true) additions.push("opening lids");
  if (intent.openingLid === false) additions.push("no opening lids");
  if (intent.backHeight === 0) additions.push("no back");
  else if (prepared.mode === "revise" && intent.backHeight !== undefined)
    additions.push(`${intent.backHeight} inches back height`);
  if (intent.shelfCount !== undefined)
    additions.push(`${intent.shelfCount} shelves`);
  const lead =
    intent.operation === "append"
      ? requestedFamily
        ? "Add "
        : `Add a ${family}. `
      : intent.operation === "create"
        ? requestedFamily
          ? ""
          : `${family}. `
        : "";
  let plan = localIdeaPlan({
    ...request,
    prompt: [lead + reducerPrompt, ...additions].join(". "),
  });
  plan = applyIntentEdits(plan, prepared, request);
  if (intent.summary)
    plan.summary = [intent.summary, plan.summary].join(" ").slice(0, 1000);
  const assumptions =
    intent.backHeight === undefined
      ? plan.assumptions
      : plan.assumptions.filter(
          (note) => !/^The optional back panel is a provisional/.test(note),
        );
  if (
    intent.backHeight !== undefined &&
    plan.modules.some((m) => m.kind === "bench" && m.backHeight > 0)
  )
    assumptions.push(
      `Provisional back height: ${intent.backHeight} in above the seat. Verify before cutting.`,
    );
  plan.assumptions = [
    ...new Set([
      ...assumptions,
      "AI-interpreted measurements and features are provisional; review the visible geometry and exact stock before applying.",
    ]),
  ].slice(0, 12);
  plan.questions = [...new Set([...plan.questions, ...intent.questions])].slice(
    0,
    8,
  );
  plan.suggestions = [
    ...new Set([...plan.suggestions, ...intent.suggestions]),
  ].slice(0, 12);
  return finalize(plan);
}

export function intentMessages(request: PlannerRequest) {
  const previous = request.previousPlan
    ? {
        modules: request.previousPlan.modules.map(
          ({
            kind,
            name,
            width,
            depth,
            height,
            storage,
            openingLid,
            backHeight,
            levels,
            frameMaterial,
            panelMaterial,
          }) => ({
            kind,
            name,
            width,
            depth,
            height,
            storage,
            openingLid,
            backHeight,
            levels,
            frameMaterial,
            panelMaterial,
          }),
        ),
        structures: request.previousPlan.structures.map(
          ({ kind, parameters }) => ({ kind, parameters }),
        ),
      }
    : null;
  return [
    {
      role: "system",
      content: [
        "Extract DIY design intent. Return compact JSON only; never code or individual parts. Geometry is built separately. Allowed family: banquette, bench, workbench, cabinet, shelves, frame, greenhouse, sauna, closet-insert, casework-shelves, clarify. Use casework-shelves for panel casework or plywood bookcases; shelves is a framed lumber shelf module. Preserve the previous typed family on follow-up dimensions or shelf-count edits.",
        "Design fields: family, operation(create/revise/append), width, depth, height, shape(straight/l), returnLength, sectionCount, targetSection(1-based), storage, openingLid, backHeight, shelfCount, roofRise, doorWidth, doorHeight, frameMaterial, panelMaterial. Only family and operation are required. Omit unspecified measurements/features. All measurements are INCHES: convert feet and number words. Width is the OVERALL run, depth is seat depth for benches, height is finished seat height. L returnLength is its overall footprint; count the corner once. Sauna dimensions are clear inside. Greenhouse height is eave height, with roofRise above. No back means backHeight is0.",
        "Use revise for a follow-up, append for adding another item; preserve unspecified settings and selected sources. Include targetSection only for a named/numbered section edit. Choose material IDs only when explicitly requested; do not invent product IDs. Unsupported trades or unclear intent return exactly family:clarify, operation:clarify and question:one concise useful question (at most240 characters). Never claim load capacity, code compliance or safe construction.",
        "Return no summary, suggestions, questions array, narrative, code or individual parts. The application derives all design explanations from validated geometry. Omit unrequested defaults and do not ask to reconfirm measurements already stated.",
        `Context: ${JSON.stringify({ workZone: request.workZone ?? null, previousProposal: previous })}`,
      ].join("\n"),
    },
    { role: "user", content: request.prompt },
  ];
}

export async function generateIntentPlan(
  request: PlannerRequest,
  parentSignal?: AbortSignal,
  observer?: OllamaTimingObserver,
) {
  const started = performance.now(),
    timeout = AbortSignal.timeout(ollamaTimeoutMs()),
    signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  let outcome: OllamaOutcome = "transport-error",
    status: number | null = null,
    body: unknown = null,
    phase: "transport" | "response" | "intent" = "transport";
  try {
    signal.throwIfAborted();
    const response = await fetch(new URL("/api/chat", process.env.OLLAMA_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
        stream: false,
        format: toOllamaSchema(intentWireSchema.toJSONSchema()),
        options: { temperature: 0, seed: 0, num_ctx: 4096, num_predict: 512 },
        messages: intentMessages(request),
      }),
    });
    status = response.status;
    signal.throwIfAborted();
    if (!response.ok) {
      outcome = "http-error";
      throw Error(
        "The AI planner could not complete the request. Your workspace has not changed.",
      );
    }
    phase = "response";
    try {
      body = await response.json();
    } catch {
      signal.throwIfAborted();
      throw new OllamaResponseError(
        "invalid-response",
        "The AI planner returned unreadable response JSON.",
      );
    }
    signal.throwIfAborted();
    const raw = completedOllamaJson(body);
    phase = "intent";
    const plan = wireIntentToPlan(request, raw);
    signal.throwIfAborted();
    outcome = "success";
    return plan;
  } catch (error) {
    if (signal.aborted) {
      // AbortSignal.any retains the first cause, even if a slow transport only
      // rejects after the other signal has subsequently fired as well.
      outcome =
        signal.reason instanceof Error && signal.reason.name === "TimeoutError"
          ? "timeout"
          : "cancelled";
      throw signal.reason;
    }
    if (error instanceof OllamaResponseError) {
      outcome = error.outcome;
      throw error;
    }
    if (phase === "intent") {
      outcome = "invalid-intent";
      throw Error(
        "The AI planner returned unsupported fields, sources or design dimensions. Your workspace has not changed.",
      );
    }
    if (outcome === "http-error") throw error;
    outcome = phase === "response" ? "invalid-response" : "transport-error";
    throw Error(
      "The AI planner could not return a completed proposal. Your workspace has not changed.",
    );
  } finally {
    if (observer) {
      const receipt = ollamaTimingReceipt(
        outcome,
        performance.now() - started,
        status,
        body,
      );
      try {
        observer(receipt);
      } catch {
        /* Optional diagnostics cannot replace a planning result or failure. */
      }
    }
  }
}
