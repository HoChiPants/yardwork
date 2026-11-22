import type { IdeaPlan, PlanModule } from "./planning";
import type { V3 } from "./model";

export type BuildFamily =
  PlanModule["kind"] | IdeaPlan["structures"][number]["kind"];
const familyPattern =
  /\b((?:all[- ]plywood|plywood|panel(?:[- ](?:built|based))?|casework)[ -]+(?:bookcases?|bookshelves|bookshelf|shelves|shelf|shelving)|(?:bookcases?|bookshelves|bookshelf|shelves|shelf|shelving)\s+(?:built|made|constructed)\s+(?:entirely\s+)?(?:of|from|with)\s+(?:plywood|panels?)|panel[ -]casework|casework(?:-shelves)?|workbenches|workbench|worktables?|banquettes?|benches|bench|seating|seats?|cabinetry|cabinets?|cupboards?|bookshelves|bookshelf|shelves|shelf|shelving|bookcases?|frames?|boxes|box|green\s?houses?|saunas?|closets?)\b/g;
export function normalizeIdeaText(input: string) {
  const ones: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
    },
    tens: Record<string, number> = {
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
    };
  return input
    .toLowerCase()
    .replace(
      /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b/g,
      (_, a: string, b: string) => String(tens[a] + (ones[b] ?? 0)),
    )
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g,
      (w) => String(ones[w]),
    )
    .replace(/(\d)-(foot|feet|inch|inches)\b/g, "$1 $2");
}
export function requestsBanquetteReturn(input: string) {
  const text = input.toLowerCase().replace(
    /\b(?:no|without|omit|remove|exclude)\s+(?:(?:an?|the|any|existing)\s+)?(?:(?:l[ -]?shaped|corner|side)\s+)?(?:return|corner|l[ -]?shaped layout)\b/g,
    "",
  );
  return /\b(?:l[ -]?shap(?:e|ed)|corner|return)\b/.test(text);
}
export function mentionedFamily(input: string): BuildFamily | undefined {
  const text = input.toLowerCase();
  let word: string | undefined,
    previousEnd = 0,
    previousNegated = false;
  for (const match of text.matchAll(familyPattern)) {
    const before = text.slice(0, match.index),
      between = text.slice(previousEnd, match.index),
      directlyNegated =
        /\b(?:no|not|without|exclude|excluding|never|do not (?:want|use)|don't (?:want|use))\s+(?:(?:a|an|any|another)\s+)?$/.test(
          before,
        ),
      coordinatedNegation: boolean =
        previousNegated &&
        /^\s*(?:(?:,|or|and|nor)\s*)+(?:(?:a|an|any)\s+)?$/.test(between);
    previousNegated = directlyNegated || coordinatedNegation;
    previousEnd = match.index + match[0].length;
    if (!previousNegated) {
      word = match[1];
      break;
    }
  }
  if (!word) return undefined;
  if (/plywood|panel|casework/.test(word)) return "casework-shelves";
  if (/work/.test(word)) return "workbench";
  if (/banquette|bench|seating|seat/.test(word)) return "bench";
  if (/cabinet|cupboard/.test(word)) return "cabinet";
  if (/shel|bookcase/.test(word)) return "shelf";
  if (/green/.test(word)) return "greenhouse";
  if (/^sauna/.test(word)) return "sauna";
  if (/^closet/.test(word)) return "closet-insert";
  return "frame";
}
/** A saved casework family stays casework when a follow-up simply calls it shelves. */
export function referencedFamily(
  input: string,
  previous?: IdeaPlan,
): BuildFamily | undefined {
  const family = mentionedFamily(input);
  if (family !== "shelf") return family;
  const casework = previous?.structures.some(
    (s) => s.kind === "casework-shelves",
  );
  if (casework && /\bbookcases?\b/.test(input.toLowerCase()))
    return "casework-shelves";
  if (isAddition(input)) return family;
  return casework && !previous?.modules.some((m) => m.kind === "shelf")
    ? "casework-shelves"
    : family;
}
export function ambiguousShelfReference(input: string, previous?: IdeaPlan) {
  return (
    mentionedFamily(input) === "shelf" &&
    !isAddition(input) &&
    !/\b(?:framed|stud[ -]framed)\s+(?:shelf|shelves|shelving|bookcase)\b/.test(
      input.toLowerCase(),
    ) &&
    !!previous?.structures.some((s) => s.kind === "casework-shelves") &&
    previous.modules.some((m) => m.kind === "shelf")
  );
}
export function requestedShelfCount(input: string): number | undefined {
  const text = normalizeIdeaText(input),
    match =
      text.match(/\b(\d+)\s+(?:adjustable\s+)?shel(?:f|ves)\b/) ??
      text.match(
        /\b(?:shelf\s*count|number\s+of\s+shelves)\s*(?:to|is|of|:|=)?\s*(\d+)\b/,
      );
  return match ? Number(match[1]) : undefined;
}
/** Shelf additions inside a saved bookcase are relative count edits, not new furniture. */
export function editCaseworkShelfCount(
  previous: IdeaPlan | undefined,
  input: string,
): IdeaPlan | null {
  if (!previous) return null;
  const text = normalizeIdeaText(input);
  if (
    /\b(?:freestanding|free[ -]standing|standalone|separate)\b|\b(?:shelf|shelves|shelving)\s+(?:unit|module)s?\b|\b(?:add|create|build)\s+(?:(?:a|an|another|new|additional)\s+)*bookcase\b/.test(
      text,
    )
  )
    return null;
  const changes = [
    ...text.matchAll(
      /\b(add|insert|include|remove|delete|take out)\s+(?:(all|[+-]?\d+|a|an|another)\s+)?(?:(?:more|extra|additional|adjustable)\s+)*(shelf|shelves)\b/g,
    ),
  ];
  if (!changes.length) return null;
  const targets = previous.structures
    .map((s, i) => (s.kind === "casework-shelves" ? i : -1))
    .filter((i) => i >= 0);
  if (!targets.length) return null;
  if (changes.length !== 1 || targets.length !== 1)
    return retainWithQuestion(
      previous,
      "Select one saved bookcase and specify one shelf-count change before adding or removing shelves.",
    );
  const explicit = /\bbookcases?\b|\bcasework\b/.test(text);
  if (previous.modules.length + previous.structures.length > 1 && !explicit)
    return retainWithQuestion(
      previous,
      "Should the shelf go inside the bookcase or be a separate item? Select the design or name the bookcase.",
    );
  const change = changes[0],
    target = previous.structures[targets[0]];
  if (target.kind !== "casework-shelves") return null;
  const removing = /^(remove|delete|take out)$/.test(change[1]);
  const quantity =
    change[2] === "all"
      ? removing
        ? target.parameters.shelfCount
        : NaN
      : change[2] && /^[+-]?\d+$/.test(change[2])
        ? Number(change[2])
        : change[2] || change[3] === "shelf"
          ? 1
          : NaN;
  if (!Number.isInteger(quantity) || quantity < 1)
    return retainWithQuestion(
      previous,
      "How many shelves should be added or removed? Give a positive whole number; the current bookcase is retained.",
    );
  const count =
    target.parameters.shelfCount + (removing ? -quantity : quantity);
  if (count < 1 || count > 6)
    return retainWithQuestion(
      previous,
      "This recipe supports one to six adjustable shelves. Choose a count in that range; the current bookcase is retained.",
    );
  const dimensions: Partial<Record<"width" | "depth" | "height", number>> = {};
  for (const [key, labels] of [
    ["width", "wide|width"],
    ["depth", "deep|depth"],
    ["height", "high|height|tall"],
  ] as const) {
    const fact = namedMeasurement(
      text,
      labels,
      /(?:door|roof|back|tower|seat|bench)\s*$/,
    );
    if (!fact) continue;
    if (fact.inches === null)
      return retainWithQuestion(
        previous,
        "Should that dimension be in inches or feet? The shelf count and existing dimensions are retained until its units are clear.",
      );
    if (
      fact.inches < 8 ||
      fact.inches > 240 ||
      /[-−]\s*$/.test(text.slice(0, text.indexOf(fact.raw)))
    )
      return retainWithQuestion(
        previous,
        "Use outside casework dimensions between 8 and 240 inches. The shelf count and dimensions are retained until the combined edit is valid.",
      );
    dimensions[key] = fact.inches;
  }
  const next = structuredClone(previous),
    updated = next.structures[targets[0]];
  if (updated.kind !== "casework-shelves") return null;
  Object.assign(updated.parameters, dimensions, { shelfCount: count });
  next.summary = `Updated the selected bookcase to ${count} shelves with the requested outside dimensions; unspecified measurements, source choices, pose and other entries are retained.`;
  return next;
}
export function isAddition(input: string) {
  const text = normalizeIdeaText(input);
  // Feature additions operate on the selected design, not a new furniture item.
  if (
    /\badd\s+(?:(?:closed|under[ -]seat)\s+)?(?:storage|(?:opening|openable|hinged)\s+lids?|lids?|(?:a\s+)?back)\b/.test(
      text,
    )
  )
    return false;
  return (
    /\b(?:add|another|additional|new)\b/.test(text) &&
    mentionedFamily(text) !== undefined
  );
}
export type MeasurementFact = {
  inches: number | null;
  raw: string;
  unitExplicit: boolean;
};
const numeric = "(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?)",
  units = "(?:feet|foot|ft|inches|inch|in|[′'″\"])",
  measure = `(${numeric})\\s*(?:(${units})(?:\\s*(?:and\\s+)?(${numeric})\\s*(inches|inch|in|[″\"]))?)?`;
function numberValue(raw: string) {
  const bits = raw.trim().split(/\s+/);
  return bits.reduce((sum, bit) => {
    if (!bit.includes("/")) return sum + Number(bit);
    const [a, b] = bit.split("/").map(Number);
    return sum + a / b;
  }, 0);
}

function measuredInches(match: RegExpMatchArray, offset = 1) {
  const value = numberValue(match[offset]), unit = match[offset + 1];
  const extra = match[offset + 2] ? numberValue(match[offset + 2]) : 0;
  const inches = unit
    ? value * (/^(feet|foot|ft|[′'])$/.test(unit) ? 12 : 1) + extra
    : null;
  if (inches !== null && !Number.isFinite(inches))
    throw Error("Enter a finite measurement with a nonzero fraction denominator.");
  return inches;
}
/** A single shared inch conversion. A bare measurement has no invented unit. */
export function namedMeasurement(
  input: string,
  labels: string,
  excludePrefix?: RegExp,
): MeasurementFact | undefined {
  const text = normalizeIdeaText(input),
    matches = [
      ...text.matchAll(
        new RegExp(
          `${measure}\\s*(?:(?:overall|outside|inside|clear|finished|eave)\\s+)*(?:${labels})\\b`,
          "g",
        ),
      ),
      ...text.matchAll(
        new RegExp(
          `\\b(?:${labels})\\s*(?:should be|of|is|:|=|at|to)?\\s*${measure}`,
          "g",
        ),
      ),
    ]
      .filter((m) => !excludePrefix?.test(text.slice(0, m.index)))
      // In “section 2 width 36 inches”, 2 is an identity, not a bare width.
      .filter(
        (m) =>
          m[2] ||
          !/\b(?:section|compartment|module)\s*#?\s*$/.test(
            text.slice(0, m.index),
          ),
      )
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const match = matches[0];
  if (!match) return undefined;
  return { inches: measuredInches(match), raw: match[0], unitExplicit: !!match[2] };
}

export function closetMeasurements(input: string) {
  const text = normalizeIdeaText(input);
  const bay = (side: "left" | "right") => {
    const name = `${side} (?:hanging |rod )?bay`;
    return namedMeasurement(text, `(?:wide )?(?:for (?:the )?)?${name}(?: clear)?(?: width| wide)?`);
  };
  const facts = {
    towerWidth: namedMeasurement(text, "tower (?:clear )?width|clear (?:shelf )?tower width"),
    leftBayWidth: bay("left"),
    rightBayWidth: bay("right"),
    rodHeight: namedMeasurement(text, "rod (?:(?:center|centerline) )?height|(?:hanging )?rods? (?:centered )?at"),
  };
  let envelope = text;
  for (const fact of Object.values(facts)) {
    if (fact) envelope = envelope.replace(fact.raw, " ");
  }
  return { facts, envelope };
}

const comparisons = {
  wider: ["width", 1], narrower: ["width", -1],
  deeper: ["depth", 1], shallower: ["depth", -1],
  taller: ["height", 1], shorter: ["height", -1],
} as const;
const comparison = Object.keys(comparisons).join("|");
const dimensionWords = "width|depth|height|roof rise";
const amountPattern = new RegExp(`^${measure}$`);
const comparisonPattern = new RegExp(`^(?:(.*?)\\s+)?${measure}\\s+(${comparison})$`);
const comparisonByPattern = new RegExp(`^(?:(.*?)\\s+)?(${comparison})\\s+by\\s+(.+)$`);
const adjustmentPattern = new RegExp(`^(increase|decrease|reduce)\\s+(.+?)\\s+by\\s+(.+)$`);

type ResizeField = "width" | "depth" | "height" | "roof rise";
export type RelativeResize = { scope: string; field: ResizeField; delta: number };
/** Keep relative requests distinct from absolute dimensions and from model guesses. */
export function requestedRelativeResize(input: string): RelativeResize | { question: string } | null {
  const text = normalizeIdeaText(input)
    .trim()
    .replace(/^please\s+/, "")
    .replace(/[.!?]+$/, "")
    .replace(/,?\s+(?:(?:and|but)\s+keep\s+everything\s+else\s+the\s+same|without\s+changing\s+anything\s+else)$/, "");
  const sizeText = text.replace(/^make\s+/, "");
  const comparative = sizeText.match(comparisonPattern);
  const comparativeBy = sizeText.match(comparisonByPattern);
  const adjustment = text.match(adjustmentPattern);
  const fieldMatch = adjustment?.[2].match(new RegExp(`\\b(${dimensionWords})\\b`));
  const match = comparative ?? comparativeBy;
  if (!match && !fieldMatch) {
    if (/^make\b/.test(text) &&
        new RegExp(`(?:${numeric}\\s*(?:${units})?\\s+(?:${comparison})\\b|\\b(?:${comparison})$)`).test(text))
      return { question: "Give one amount, with inches or feet, and name the dimension or section to resize." };
    return null;
  }
  const scope = match?.[1] ?? adjustment?.[2] ?? "";
  const adjective = (comparative?.at(-1) ?? comparativeBy?.[2]) as keyof typeof comparisons | undefined;
  const [field, sign] = adjective ? comparisons[adjective] :
    [fieldMatch![1] as ResizeField, adjustment![1] === "increase" ? 1 : -1] as const;
  const amount = comparative ?? (comparativeBy?.[3] ?? adjustment?.[3])?.match(amountPattern);
  const question = "Give one positive resize amount, with inches or feet, such as “make section 2 two inches taller.”";
  if (!amount) return { question };
  // A separate edit needs its own preview. Scope here names the existing design.
  if (/[,;]|\b(?:and|then|but|or)\b/.test(scope)) return { question };
  try {
    const inches = measuredInches(amount, comparative ? 2 : 1);
    return inches && inches > 0 ? { scope, field, delta: sign * inches } : { question };
  } catch (error) {
    return { question: (error as Error).message };
  }
}
/** Scope words must qualify the width measurement, not an unrelated sentence about each seat. */
export function widthAppliesToEach(input: string) {
  const text = normalizeIdeaText(input),
    fact = namedMeasurement(text, "wide|width|long|length|along the back");
  if (!fact) return false;
  const at = text.indexOf(fact.raw),
    before = text.slice(Math.max(0, at - 80), at),
    after = text.slice(at + fact.raw.length);
  return (
    /\b(?:each|every)\s+(?:(?:seating|bench)\s+)?(?:section|compartment|module|seat|bench)(?:\s+(?:should be|is|at|of))?\s*$/.test(
      before,
    ) ||
    /^\s*(?:each|per\s+(?:section|compartment|module|seat|bench))\b/.test(after)
  );
}
export function furnitureMeasurements(input: string) {
  const exclude = /(?:door|roof|back|tower|shelf)\s*$/;
  return {
    width: namedMeasurement(
      input,
      "wide|width|long|length|along the back",
      exclude,
    ),
    depth: namedMeasurement(input, "deep|depth|seat depth", exclude),
    height: namedMeasurement(input, "seat height|high|height|tall", exclude),
    backHeight: namedMeasurement(input, "back height"),
  };
}
export function retainWithQuestion(plan: IdeaPlan, question: string): IdeaPlan {
  return {
    ...structuredClone(plan),
    summary:
      "Your previous proposal is retained. Resolve the scope or measurement below before changing its geometry.",
    questions: [question],
  };
}
function coordinate(position: V3, axis: V3) {
  return position.reduce((sum, v, i) => sum + v * axis[i], 0);
}
function yawDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}
type Run = { order: number[]; center: V3; axis: V3; gaps: number[] };
/** Infer only an already adjacent, collinear run; an arbitrary matching yaw is insufficient. */
export function straightRun(modules: PlanModule[]): Run | null {
  if (!modules.length) return null;
  const yaw = (modules[0].yaw * Math.PI) / 180,
    axis: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)],
    perp: V3 = [Math.sin(yaw), 0, Math.cos(yaw)],
    first = modules[0];
  if (
    modules.some(
      (m) =>
        yawDifference(m.yaw, first.yaw) > 0.001 ||
        Math.abs(m.position[1] - first.position[1]) > 0.001 ||
        Math.abs(
          coordinate(m.position, perp) - coordinate(first.position, perp),
        ) > 0.001,
    )
  )
    return null;
  const order = modules
      .map((_, i) => i)
      .sort(
        (a, b) =>
          coordinate(modules[a].position, axis) -
          coordinate(modules[b].position, axis),
      ),
    gaps: number[] = [];
  for (let i = 1; i < order.length; i++) {
    const a = modules[order[i - 1]],
      b = modules[order[i]],
      gap =
        coordinate(b.position, axis) -
        b.width / 2 -
        coordinate(a.position, axis) -
        a.width / 2;
    if (gap < -0.001 || gap > 2.001) return null;
    gaps.push(Math.max(0, gap));
  }
  const left = modules[order[0]],
    right = modules[order.at(-1)!],
    centerX =
      (coordinate(left.position, axis) -
        left.width / 2 +
        coordinate(right.position, axis) +
        right.width / 2) /
      2,
    shift = centerX - coordinate(first.position, axis),
    center = first.position.map((n, i) => n + axis[i] * shift) as V3;
  return { order, center, axis, gaps };
}
export function reflow(modules: PlanModule[], run: Run): PlanModule[] {
  const total =
    modules.reduce((n, m) => n + m.width, 0) +
    run.gaps.reduce((a, b) => a + b, 0);
  let cursor = -total / 2;
  const next = modules.map((m) => ({ ...m }));
  for (const [i, index] of run.order.entries()) {
    const m = next[index];
    m.position = run.center.map(
      (n, j) => n + run.axis[j] * (cursor + m.width / 2),
    ) as V3;
    cursor += m.width + (run.gaps[i] ?? 0);
  }
  return next;
}
function sameSectionConfiguration(modules: PlanModule[]) {
  const value = (m: PlanModule) =>
    JSON.stringify([
      m.kind,
      m.depth,
      m.height,
      m.frameMaterial,
      m.panelMaterial,
      m.backHeight,
      m.levels,
      m.storage,
      m.openingLid,
      m.lidOpen,
    ]);
  return modules.every((m) => value(m) === value(modules[0]));
}
/** Pure, scoped furniture edits. Unrelated furniture and every structure survive. */
export function editFurniturePlan(previous: IdeaPlan, input: string): IdeaPlan {
  const text = normalizeIdeaText(input),
    facts = furnitureMeasurements(text),
    family = mentionedFamily(text),
    numbered = text.match(
      /\b(?:section|compartment|module)\s*#?\s*(\d{1,2})\b(?!\s*(?:feet|foot|ft|inches|inch|in|[′'″"]))/,
    ),
    exact = previous.modules.findIndex((m) =>
      text.includes(m.name.toLowerCase()),
    ),
    targetIndex = numbered
      ? Number(numbered[1]) - 1
      : exact >= 0
        ? exact
        : undefined;
  if (Object.values(facts).some((f) => f && f.inches === null))
    return retainWithQuestion(
      previous,
      "Should the measurement be in inches or feet? Add the unit; the previous dimensions are retained.",
    );
  if (
    targetIndex !== undefined &&
    (targetIndex < 0 || targetIndex >= previous.modules.length)
  )
    return retainWithQuestion(
      previous,
      "Which existing section should change? The requested section number is not in this proposal.",
    );
  let indices =
    targetIndex !== undefined
      ? [targetIndex]
      : previous.modules
          .map((m, i) => (!family || m.kind === family ? i : -1))
          .filter((i) => i >= 0);
  if (!indices.length)
    return retainWithQuestion(
      previous,
      "Which existing section should change? Select it or use Add to create a separate item.",
    );
  const kinds = new Set(indices.map((i) => previous.modules[i].kind));
  if (targetIndex === undefined && !family && kinds.size > 1)
    return retainWithQuestion(
      previous,
      "Should this change affect the benches, cabinets or another named section? The mixed proposal is retained.",
    );
  const count = text.match(
      /\b(\d{1,2})[ -]*(?:sections?|compartments?|modules?)\b/,
    ),
    noBack =
      /\b(backless|(?:no|without)(?: a)? back)\b|wall.{0,32}(?:as|be)(?: the| a)? back/.test(
        text,
      ),
    wantsLid =
      /\b(?:openable|opening|hinged|lift[ -]?up)\s+(?:seat\s+)?lids?\b|\b(?:lids?|seats?|tops?)\b.{0,28}\bopen\b/.test(
        text,
      ),
    wantsStorage = /\bstorage\b|closed off|space underneath/.test(text),
    noStorage = /\b(?:no|without) storage\b/.test(text),
    removeLid = /\b(?:no|without|remove) (?:opening )?lid/.test(text);
  const changed =
    Object.values(facts).some(Boolean) ||
    noBack ||
    wantsLid ||
    wantsStorage ||
    noStorage ||
    removeLid ||
    !!count;
  if (!changed)
    return retainWithQuestion(
      previous,
      "Specify a dimension, section count or feature to change, or use Add to create another item.",
    );
  const next = structuredClone(previous),
    original = indices.map((i) => previous.modules[i]),
    run = straightRun(original);
  if (facts.width && indices.length > 1 && !run)
    return retainWithQuestion(
      previous,
      "Which straight run should change: the back run or the return? A whole width cannot be applied independently to perpendicular or separate sections.",
    );
  if (count) {
    const total = Number(count[1]);
    if (total < 1 || total > 12)
      return retainWithQuestion(
        previous,
        "Choose between one and twelve seating sections.",
      );
    if (targetIndex !== undefined || original.some((m) => m.kind !== "bench"))
      return retainWithQuestion(
        previous,
        "Select the seating run to divide into compartments.",
      );
    if (total !== original.length) {
      const knownCorner =
        !run &&
        original.length === 2 &&
        /return/i.test(original[1].name) &&
        total >= 2;
      if (knownCorner) {
        const main = original[0],
          mainRun = straightRun([main])!,
          n = total - 1;
        if (main.width / n < 8)
          return retainWithQuestion(
            previous,
            "The back run is too small for that many seating sections.",
          );
        const members = [
          ...Array.from({ length: n }, (_, i) => ({
            ...main,
            entryId: i === 0 ? main.entryId : undefined,
            name: `Banquette section ${i + 1}`,
            width: main.width / n,
            position: mainRun.center.map(
              (v, j) =>
                v +
                mainRun.axis[j] *
                  (-main.width / 2 + (main.width / n) * (i + 0.5)),
            ) as V3,
          })),
          { ...original[1], name: `Banquette section ${total}` },
        ];
        const firstIndex = Math.min(...indices);
        next.modules = next.modules.flatMap((m, i) =>
          i === firstIndex ? members : indices.includes(i) ? [] : [m],
        );
        indices = members.map((_, i) => firstIndex + i);
      } else {
        if (
          !run ||
          !sameSectionConfiguration(original) ||
          run.gaps.some((g) => g > 0.001)
        )
          return retainWithQuestion(
            previous,
            "These sections have different materials/features or separate poses. Which run and product/feature assignments should the new compartments retain?",
          );
        const first = original[0],
          overall = original.reduce((n, m) => n + m.width, 0),
          width = facts.width?.inches ?? overall;
        if (width / total < 8)
          return retainWithQuestion(
            previous,
            "The requested total width leaves less than eight inches per framed section. Increase width or reduce section count.",
          );
        const members = Array.from({ length: total }, (_, i) => ({
          ...first,
          entryId: original[i]?.entryId,
          name: `Banquette section ${i + 1}`,
          width: width / total,
          position: run.center.map(
            (n, j) =>
              n + run.axis[j] * (-width / 2 + (width / total) * (i + 0.5)),
          ) as V3,
        }));
        const firstIndex = Math.min(...indices);
        next.modules = next.modules.flatMap((m, i) =>
          i === firstIndex ? members : indices.includes(i) ? [] : [m],
        );
        indices = members.map((_, i) => firstIndex + i);
      }
    }
  }
  const active = indices.map((i) => next.modules[i]),
    currentRun = straightRun(active);
  if (facts.width && indices.length > 1 && currentRun) {
    const each = widthAppliesToEach(text),
      usable = facts.width.inches! - currentRun.gaps.reduce((a, b) => a + b, 0),
      sum = active.reduce((n, m) => n + m.width, 0),
      members = active.map((m) => ({
        ...m,
        width: each ? facts.width!.inches! : (usable * m.width) / sum,
      }));
    if (members.some((m) => m.width < 8 || m.width > 240))
      return retainWithQuestion(
        previous,
        "That width does not leave a supported eight-to-240-inch framed section. Revise the total, count or construction system.",
      );
    reflow(members, currentRun).forEach(
      (m, i) => (next.modules[indices[i]] = m),
    );
  }
  for (const index of indices) {
    const m = next.modules[index];
    if (facts.width && indices.length === 1) m.width = facts.width.inches!;
    if (facts.depth) m.depth = facts.depth.inches!;
    if (facts.height) m.height = facts.height.inches!;
    if (m.kind === "bench") {
      if (noBack) m.backHeight = 0;
      if (facts.backHeight) m.backHeight = facts.backHeight.inches!;
      if (wantsStorage || wantsLid) m.storage = true;
      if (wantsLid) m.openingLid = true;
      if (removeLid) {
        m.openingLid = false;
        m.lidOpen = false;
      }
      if (noStorage) {
        m.storage = false;
        m.openingLid = false;
        m.lidOpen = false;
      }
    }
  }
  // A named compartment may move dependent poses in its one recognized run, never resize its neighbors.
  if (targetIndex !== undefined && facts.width) {
    const siblings = previous.modules
        .map((m, i) => (m.kind === previous.modules[targetIndex].kind ? i : -1))
        .filter((i) => i >= 0),
      oldRun = straightRun(siblings.map((i) => previous.modules[i]));
    if (oldRun)
      reflow(
        siblings.map((i) => next.modules[i]),
        oldRun,
      ).forEach((m, i) => (next.modules[siblings[i]] = m));
  }
  next.summary =
    "Updated only the requested sections and fields. Recognized straight runs reflow around their existing center; unrelated dimensions, product choices, features and structures are retained.";
  next.questions = [];
  next.assumptions = next.assumptions.filter(
    (a) =>
      !(facts.width && /^Provisional width:/.test(a)) &&
      !(facts.depth && /^Provisional depth:/.test(a)) &&
      !(
        facts.height && /^Provisional (?:finished seat|overall) height:/.test(a)
      ) &&
      !(noBack && /^The optional back panel/.test(a)) &&
      !(noStorage && /^Storage is enclosed/.test(a)),
  );
  if (count)
    next.title = `${indices.length}-section ${active.some((m) => m.storage) ? "storage " : ""}banquette`;
  if (
    wantsLid &&
    !next.assumptions.some((a) => /hinge.*unpriced/i.test(a)) &&
    next.assumptions.length < 12
  )
    next.assumptions.push(
      "Opening lids have a provisional rear pivot; hinges, lid stays, pinch protection, wall clearance and their unpriced hardware remain unresolved.",
    );
  return next;
}
/** Append, never turn an Add request into a replacement of existing proposal entries. */
export function appendIdeaPlan(
  previous: IdeaPlan,
  addition: IdeaPlan,
): IdeaPlan {
  if (!addition.modules.length && !addition.structures.length)
    return retainWithQuestion(
      previous,
      addition.questions[0] ??
        "Describe the separate item to add and its measurements.",
    );
  if (
    previous.modules.length + addition.modules.length > 12 ||
    previous.structures.length + addition.structures.length > 4
  )
    return retainWithQuestion(
      previous,
      "This proposal exceeds the supported item count. Apply the current proposal before starting a separate addition.",
    );
  const assumptions = [
    ...new Set([...previous.assumptions, ...addition.assumptions]),
  ];
  if (assumptions.length > 12)
    return retainWithQuestion(
      previous,
      "The combined proposal has too many unresolved assumptions. Apply the current proposal or resolve measurements before adding another item.",
    );
  return {
    ...structuredClone(previous),
    summary:
      "Added a separate item to the proposal. Existing furniture, structures, product selections and measurements are retained.",
    modules: [
      ...structuredClone(previous.modules),
      ...structuredClone(addition.modules),
    ],
    structures: [
      ...structuredClone(previous.structures),
      ...structuredClone(addition.structures),
    ],
    assumptions,
    questions: [
      ...new Set([...previous.questions, ...addition.questions]),
    ].slice(0, 8),
    suggestions: [
      ...new Set([...previous.suggestions, ...addition.suggestions]),
    ].slice(0, 12),
  };
}
