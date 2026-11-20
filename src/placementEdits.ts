import {
  ambiguousShelfReference,
  namedMeasurement,
  normalizeIdeaText,
  referencedFamily,
} from "./ideaEdits";
import type { V3 } from "./model";
import {
  ideaPlanSchema,
  type IdeaPlan,
  type PlannerRequest,
} from "./planSchema";

type Target = { index: number; type: "module" | "structure" };
type Placement =
  | { target: string; translation: V3 }
  | { target: string; angle: number; pivot: "workspace origin" | "its origin" };

const moveStart =
  /^(?:please\s+)?(?:move|shift|translate|slide|raise|lower|rotate)\b/i;
const clearanceRequest =
  /\b(?:leave|keep|allow|maintain)\b.*\b(?:gap|behind|away|room|space|clearance)\b|\b\d+(?:\.\d+)?\s*(?:inches?|in|ft|feet|foot)\b.*\b(?:clearance|skirting(?: board)?|baseboards?|(?:from|off) (?:the |a )?wall)\b/i;
const mechanismRequest =
  /\b(?:add|install|use|fit)\b.*\b(?:soft[ -]close|lid stays?|gas struts?)\b/i;
const axisLetter = ["X", "Y", "Z"] as const;

function parsePlacement(clause: string): Placement | null {
  const text = normalizeIdeaText(clause)
    .replaceAll("−", "-")
    .replace(/^please\s+/, "");
  const rotation = text.match(
    /^rotate\s+(.+?)\s+(?:by\s+)?([+-]?\d+(?:\.\d+)?)\s*(?:degrees?|°)\s+(?:around|about)\s+(?:the\s+)?(workspace origin|its origin)$/i,
  );
  if (rotation) {
    const angle = Number(rotation[2]);
    if (!Number.isFinite(angle) || Math.abs(angle) >= 360 || angle === 0)
      return null;
    return {
      target: rotation[1],
      angle,
      pivot: rotation[3] as "workspace origin" | "its origin",
    };
  }
  const move = text.match(
    /^(move|shift|translate|slide|raise|lower)\s+(.+?)\s+(?:(up|down)\s+)?(?:by\s+)?(\d[\d./\s]*(?:feet|foot|ft|inches|inch|in|[′'″"])(?:\s*(?:and\s+)?\d[\d./\s]*(?:inches|inch|in|[″"]))?)\s*(?:(?:toward(?:s)?|along|on)\s+)?(?:workspace\s+)?(?:(\+|-)([xyz])|(up|down))?$/i,
  );
  if (!move) return null;
  const [
    ,
    verb,
    target,
    leadingVertical,
    length,
    sign,
    axis,
    trailingVertical,
  ] = move;
  const vertical =
    leadingVertical ??
    trailingVertical ??
    (verb === "raise" ? "up" : verb === "lower" ? "down" : undefined);
  if ((leadingVertical && trailingVertical) || (vertical && axis)) return null;
  if (!vertical && !axis) return null;
  const distance = namedMeasurement(`${length} distance`, "distance")?.inches;
  if (distance == null || distance <= 0 || distance > 1200) return null;
  const translation: V3 = [0, 0, 0];
  translation[
    vertical
      ? 1
      : axisLetter.indexOf(axis.toUpperCase() as (typeof axisLetter)[number])
  ] = distance * (vertical === "down" || sign === "-" ? -1 : 1);
  return { target, translation };
}

function targetsFor(plan: IdeaPlan, raw: string): Target[] {
  const target = raw.trim().replace(/^the\s+/, "");
  const numbered = target.match(
    /^(?:section|module|compartment)\s*#?\s*(\d+)$/,
  );
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    return plan.modules[index] ? [{ index, type: "module" }] : [];
  }
  const entries: { target: Target; name: string; family: string }[] = [
    ...plan.modules.map((module, index) => ({
      target: { index, type: "module" as const },
      name: normalizeIdeaText(module.name),
      family: module.kind,
    })),
    ...plan.structures.map((structure, index) => ({
      target: { index, type: "structure" as const },
      name: structure.kind.replaceAll("-", " "),
      family: structure.kind,
    })),
  ];
  const exact = entries.filter((entry) => entry.name === target);
  if (exact.length === 1) return [exact[0].target];
  const whole = /^whole\s+/.test(target);
  if (whole && /^whole (?:proposal|design|selection)$/.test(target))
    return entries.map((entry) => entry.target);
  if (/^(?:it|this|the selection)$/.test(target))
    return entries.length === 1 ? [entries[0].target] : [];
  const familyName = target
    .replace(/^whole\s+/, "")
    .replace(/^kitchenette\s+/, "");
  if (
    !/^(?:banquettes?|benches|bench|seating|workbench(?:es)?|cabinets?|greenhouses?|saunas?|closets?(?: inserts?)?|(?:storage |framed |panel |casework )?(?:shelves|shelf|shelving|bookcases?)|casework|frame|panel)$/.test(
      familyName,
    )
  )
    return [];
  if (ambiguousShelfReference(familyName, plan)) return [];
  const family =
    familyName === "panel" ? "panel" : referencedFamily(familyName, plan);
  const matching = entries.filter((entry) => entry.family === family);
  return matching.length === 1 || whole
    ? matching.map((entry) => entry.target)
    : [];
}

type Pending = NonNullable<IdeaPlan["pendingPlacement"]>[number];

export function carryPlacementQuestions(
  plan: IdeaPlan,
  previous?: IdeaPlan,
): IdeaPlan {
  const pending = new Map<string, Pending>();
  for (const item of [
    ...(previous?.pendingPlacement ?? []),
    ...(plan.pendingPlacement ?? []),
  ])
    pending.set(item.request.toLowerCase(), item);
  return pending.size
    ? { ...plan, pendingPlacement: [...pending.values()] }
    : plan;
}

export function refinePlacement(
  request: PlannerRequest,
  revise: (request: PlannerRequest) => IdeaPlan,
): IdeaPlan | null {
  const clauses = request.prompt
    .trim()
    .split(
      /\s*(?:[;\n]+|[.!?](?=\s|$)|,(?=\s+(?:then\s+)?(?:move|shift|translate|slide|raise|lower|rotate|leave|keep|allow|maintain|add|install|use|fit)\b)|\s+with\s+(?=\d+(?:\.\d+)?\s*(?:inches?|in|ft|feet|foot)\b[^.!?;]*\b(?:clearance|gap)\b)|\s+(?:and\s+(?:then\s+)?|then\s+)(?=(?:move|shift|translate|slide|raise|lower|rotate|leave|keep|allow|maintain|add|install|use|fit)\b))\s*/i,
    )
    .filter(Boolean);
  const placements: string[] = [],
    remaining: string[] = [],
    pending: Pending[] = [];
  for (const clause of clauses) {
    if (clearanceRequest.test(clause)) {
      pending.push({
        request: clause,
        question:
          "Record the measured face and minimum gap under Sections → Measured site clearances after applying the layout.",
      });
    } else if (mechanismRequest.test(clause)) {
      pending.push({
        request: clause,
        question:
          "Choose the actual lid and hardware in the connection tools. Set this request aside to apply the layout first.",
      });
    } else if (moveStart.test(clause)) {
      placements.push(clause);
    } else {
      remaining.push(clause);
    }
  }
  if (!placements.length && !pending.length) return null;

  const previous = request.previousPlan;
  const candidate = remaining.length
    ? revise({ ...request, prompt: remaining.join(". ") })
    : (previous ?? {
        title: "Choose a design",
        summary: "Describe or open the design you want to position.",
        assumptions: [],
        questions: [],
        suggestions: [],
        modules: [],
        structures: [],
      });
  if (remaining.length && previous) {
    const geometry = ({ modules, structures }: IdeaPlan) =>
      JSON.stringify([modules, structures]);
    const question = candidate.questions.find(
      (item) => !previous.questions.includes(item),
    );
    if (question && geometry(candidate) === geometry(previous)) {
      pending.push({ request: remaining.join(". "), question });
    }
  }
  let next = candidate;
  const changes: string[] = [];
  for (const clause of placements) {
    let action: Placement | null;
    try {
      action = parsePlacement(clause);
    } catch {
      action = null;
    }
    if (!action) {
      pending.push({
        request: clause,
        question:
          "Enter a distance with units and a signed workspace axis (+X, +Y, or +Z), or a rotation in degrees around an explicit origin.",
      });
      continue;
    }
    const targets = targetsFor(next, action.target);
    if (
      !targets.length ||
      ("pivot" in action &&
        action.pivot === "its origin" &&
        targets.length !== 1)
    ) {
      pending.push({
        request: clause,
        question:
          "Name one existing section, or name the whole design to move. For a group rotation, specify the workspace origin.",
      });
      continue;
    }
    const updated = structuredClone(next);
    for (const { index, type } of targets) {
      const module = type === "module" ? updated.modules[index] : undefined;
      const structure =
        type === "structure" ? updated.structures[index] : undefined;
      const origin = module?.position ?? structure!.parameters.origin;
      const yaw = module?.yaw ?? structure!.parameters.yaw;
      let position: V3,
        rotation = yaw;
      if ("translation" in action) {
        position = origin.map(
          (coordinate, i) => coordinate + action.translation[i],
        ) as V3;
      } else {
        const radians = (action.angle * Math.PI) / 180;
        const c = Math.cos(radians),
          s = Math.sin(radians);
        position =
          action.pivot === "its origin"
            ? origin
            : [
                origin[0] * c + origin[2] * s,
                origin[1],
                -origin[0] * s + origin[2] * c,
              ];
        rotation = ((((yaw + action.angle + 180) % 360) + 360) % 360) - 180;
      }
      if (module) Object.assign(module, { position, yaw: rotation });
      else
        Object.assign(structure!.parameters, {
          origin: position,
          yaw: rotation,
        });
    }
    if (
      !ideaPlanSchema.safeParse(updated).success ||
      [
        ...updated.modules.map((m) => m.position),
        ...updated.structures.map((s) => s.parameters.origin),
      ].some(
        ([x, y, z]) =>
          Math.abs(x) > 1200 || y < 0 || y > 1200 || Math.abs(z) > 1200,
      )
    ) {
      pending.push({
        request: clause,
        question:
          "This placement exceeds the supported workspace coordinates. Choose a smaller move or a different pivot.",
      });
      continue;
    }
    next = updated;
    changes.push(
      `${clause.replace(/^./, (first) => first.toUpperCase())} · ${targets.length} ${targets.length === 1 ? "assembly" : "assemblies"}`,
    );
  }
  return carryPlacementQuestions(
    {
      ...next,
      placementChanges: changes.length ? changes : undefined,
      pendingPlacement: pending,
    },
    previous,
  );
}
