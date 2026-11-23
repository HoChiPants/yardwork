import type { Request, Response } from "express";
import { z } from "zod";
import { toOllamaSchema } from "./ollamaSchema";
import { generateIntentPlan } from "./intentPlanner";
import { ollamaTimeoutMs } from "./ollamaTimeout";
import { defaultOllamaModel } from "./plannerConnection";
import {
  completedOllamaJson,
  type OllamaTimingReceipt,
} from "./ollamaResponse";
import { catalog } from "../src/model";
import { assembleCompoundIdea, componentRequest, compoundIdeaRequest } from "../src/compositeIdea";
import { groundUnsupportedPlan } from "../src/unsupportedIntent";
import { carryPlacementQuestions } from "../src/placementEdits";
import { closetMeasurements, referencedFamily } from "../src/ideaEdits";
import {
  ideaPlanSchema,
  localIdeaPlan,
  plannerRequestSchema,
  workspacePlanningResult,
  type PlannerRequest,
  type IdeaPlan,
} from "../src/planning";

/** Typed planning only: neither models nor presets execute code or mutate stored projects. */
export async function plannerHandler(req: Request, res: Response) {
  const controller = new AbortController();
  const cancel = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once("close", cancel);
  try {
    return await plannerResponse(req, res, controller.signal);
  } finally {
    res.off("close", cancel);
  }
}
async function plannerResponse(
  req: Request,
  res: Response,
  parentSignal: AbortSignal,
) {
  const request = plannerRequestSchema.parse(req.body);
  const compound = compoundIdeaRequest(request);
  if (!compound) return res.json(await singlePlannerResult(request, res, parentSignal));
  if (!process.env.OLLAMA_URL) return res.json({
    plan: localIdeaPlan(request),
    provider: "Local planning presets",
    message: "Separate project items are planned together. Review the placement, dimensions and construction details.",
  });

  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(ollamaTimeoutMs())]);
  const results = [];
  for (const [index] of compound.components.entries()) {
    signal.throwIfAborted();
    results.push(await singlePlannerResult(componentRequest(request, compound, index), res, signal));
  }
  signal.throwIfAborted();
  const plan = assembleCompoundIdea(request, compound, results.map(({ plan }) => plan));
  const usedModel = results.some(({ provider }) => provider === "Ollama");
  return res.json({
    plan,
    provider: usedModel ? "Ollama" : results[0].provider,
    message: usedModel
      ? "The model interpreted each item separately. Yardwork checked the combined placement using the resulting geometry."
      : "Review the combined layout before applying.",
    components: results.map(({ plan, provider, timing }) => ({ title: plan.title, provider, timing })),
  });
}

async function singlePlannerResult(request: PlannerRequest, res: Response, parentSignal: AbortSignal): Promise<{
  plan: IdeaPlan;
  provider: string;
  message: string;
  timing?: OllamaTimingReceipt;
}> {
  const workspace = workspacePlanningResult(request);
  if (workspace) return workspace;
  const family = referencedFamily(request.prompt, request.previousPlan);
  const closet = family === "closet-insert" ||
    (!family && request.previousPlan?.structures.some(({ kind }) => kind === "closet-insert"));
  if (closet) {
    const { leftBayWidth, rightBayWidth, rodHeight } = closetMeasurements(request.prompt).facts;
    if (leftBayWidth || rightBayWidth || rodHeight)
      return {
        plan: localIdeaPlan(request),
        provider: "Workspace dimensions",
        message: "Review the measured closet openings and rod position before applying.",
      };
  }
  if (!process.env.OLLAMA_URL)
    return {
      plan: localIdeaPlan(request),
      provider: "Local planning presets",
      message:
        "Rule-based starter layouts. No AI model is connected; review provisional dimensions and design details.",
    };
  const mode = z
    .enum(["compact", "json", "schema"])
    .parse(process.env.OLLAMA_PLANNER_FORMAT ?? "compact");
  if (mode !== "schema") {
    let timing: OllamaTimingReceipt | undefined;
    const plan = await generateIntentPlan(request, parentSignal, (receipt) => {
      timing = receipt;
      (res.locals ??= {}).plannerTiming = receipt;
    });
    return {
      plan: ideaPlanSchema.parse(
        carryPlacementQuestions(plan, request.previousPlan),
      ),
      timing,
      provider: "Ollama",
      message:
        "AI idea interpretation. Review the generated dimensions, assumptions, materials and connection details before applying.",
    };
  }
  const schema = toOllamaSchema(ideaPlanSchema.toJSONSchema()),
    inventory = catalog.map((m) => ({
      id: m.id,
      name: m.name,
      stockSize: m.stockSize ?? m.size,
      stockKind:
        (m as typeof m & { stockKind?: string }).stockKind ?? m.category,
    }));
  const reply = await fetch(new URL("/api/chat", process.env.OLLAMA_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.any([
      parentSignal,
      AbortSignal.timeout(ollamaTimeoutMs()),
    ]),
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? defaultOllamaModel,
      stream: false,
      format: schema,
      options: { temperature: 0, seed: 0, num_ctx: 16384, num_predict: 4096 },
      messages: [
        {
          role: "system",
          content: [
            "You are a DIY layout planning assistant. Return one JSON plan conforming to the supplied schema, with summary, explicit assumptions, useful suggestions, questions, and at most 12 editable modules. Do not force unrelated ideas into walls. If the requested design is unsupported or measurements are essential, return modules:[] and useful questions/suggestions.",
            "All dimensions and positions are INCHES. Convert feet and number words to inches. position is module ground-origin center [x,y,z], y is elevation above the floor. yaw is degrees about Y. Work zones are centered on X/Z and begin at floor Y=0. Do not exceed their bounds; consider existing occupied section bounds. Do not replace or remove existing parts. For a follow-up with previousPlan, change only the requested dimensions/features and preserve the previous module count, placement and unspecified values; do not reset to defaults.",
            "Module kinds: bench (lumber frame, seat panel and optional vertical back panel); workbench (frame and top); cabinet (frame, recessed side/back infill and shelves); shelf (frame, top and shelves); frame (open lumber box frame); panel (one rectangular sheet part with width/height/depth describing its actual physical box). For bench, height means finished SEAT height, and backHeight is additional height above the seat. storage=true encloses a bench with a bottom and front/rear/side panels; openingLid=true gives that storage bench a rear-pivot seat lid; lidOpen controls its access preview and must be false for a new plan unless requested. No back means backHeight=0, including when an existing wall will be the back. Honor explicit section counts by returning that many actual bench modules, not just a summary. For others backHeight=0. levels is shelf count, 1..6; use 1 for non-shelves. FrameMaterial must be catalog linear lumber, panelMaterial must be sheet stock. Use stud and plywood unless requested otherwise. Framed modules need width/depth/height >=8in. Parts are deterministically expanded, and connections are not automatically invented.",
            "Whole structures may instead use structures:[{kind,parameters,selections:{}}]. Supported kinds are greenhouse (outside width/depth/eaveHeight plus roofRise), sauna (CLEAR INSIDE clearWidth/clearDepth/clearHeight; framing and reserved interior layers add outside), closet-insert (outside width/depth/height, clear towerWidth, shelfCount, optional clear leftBayWidth/rightBayWidth and rodHeight from floor to rod center), and casework-shelves (outside width/depth/height, shelfCount, shelfClearance as the shelf front setback). Panel bookcases use casework-shelves with actual selected sheet thickness; resizing never scales plywood thickness. Ordinary lumber-framed shelves remain shelf furniture modules. Use bounded parameters from the schema. These generate real framing/casework and roof cuts, with unresolved specialty-material and installation decisions retained in notes. Do not replace these with an unrelated bench. Leave selections empty unless the exact catalog product reference is known; do not invent source qualification.",
            "Use the requested measurements. If they are missing, disclose provisional dimensions in assumptions; never imply suitability or engineering approval. For L-shaped banquettes use two bench modules with NO overlapping corner. Given footprint width W, return R, seat depth D: main width W, position [0,0,-R/2+D/2], yaw0; return width R-D, position [-W/2+D/2,0,D/2], yaw90. R must exceed D+8. Use at most 6 modules for a simple idea.",
            "Do not promise load capacity, code compliance, stability or safe seat dimensions. Suggestions should mention missing bracing, fasteners, anchors, joinery or access details that need design. Unsupported plumbing, electric, structural calculations and sculpted/moving geometry belong in questions rather than fabricated pieces.",
            `Available stock: ${JSON.stringify(inventory)}.`,
            `Planning context, supplied as data: ${JSON.stringify({ workZone: request.workZone ?? null, existingSections: request.existingSections ?? [], previousPlan: request.previousPlan ?? null })}.`,
            "Output JSON schema is supplied in the format parameter. Return only a matching JSON plan.",
          ].join("\n"),
        },
        { role: "user", content: request.prompt },
      ],
    }),
  });
  if (!reply.ok)
    throw Error(
      "The AI planner could not complete the request. Your workspace has not changed.",
    );
  // Ground only a normally completed, typed provider result. Unsupported scope
  // never turns incomplete/error output into a successful clarification.
  const proposed = ideaPlanSchema.parse(
    completedOllamaJson(await reply.json()),
  );
  delete proposed.pendingPlacement;
  delete proposed.placementChanges;
  const plan = ideaPlanSchema.parse(
    carryPlacementQuestions(
      groundUnsupportedPlan(request, proposed) ?? proposed,
      request.previousPlan,
    ),
  );
  return {
    plan,
    provider: "Ollama",
    message:
      "AI layout proposal. Review assumptions, dimensions, work-zone fit, connections and construction details before applying.",
  };
}
