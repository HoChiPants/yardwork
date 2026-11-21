import { isSubfloorPanel, subfloorReviews } from "./subfloor";
import { bottomPlateSealReviews } from "./bottomPlateSeal";
import { openingAirSealSummary } from "./openingAirSeal";
import type { BuildPreparationAction } from "./buildPreparation";
import { inspectCutStock, type Finding } from "./engine";
import { drawerBoxOpening } from "./drawerBoxes";
import { checkGreenhouseDoorSeal, reviewGreenhouseDoorSeal } from "./greenhouseDoorSeal";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { inspectLidTravel } from "./lidTravelFindings";
import {
  motionDistance,
  motionTestFindings,
  resolveMotionTestSetup,
  reviewMotionTests,
} from "./mechanismMotion";
import { parsePrompt, type Command, type Project } from "./model";
import { windowWallScope } from "./windowWall";
import { reviewWaterRun } from "./wallWater";
import { fittingLabel, reviewWaterFitting } from "./waterFittings";
import { reviewWaterPressure } from "./waterPressure";
import { reviewWaterStop } from "./waterStops";
import { reviewSinkDrain } from "./sinkDrain";
import { longSupportSpan, waterSupportNetwork, waterSupportSpanLine } from "./waterSupportNetwork";
import type { MotionPlan } from "./motionPlanSchema";
import { planOffcutReuse, type OffcutReusePlan } from "./offcutReusePlan";
import { ensurePartLabels, partLabel } from "./partLabels";
import { openingDrainageNote, reviewOpeningFlashings } from "./openingFlashing";
import { openingFlashingScope } from "./openingFlashingReference";
import { fieldTreatmentScope, fieldTreatmentTitle, treatedWoodCuts } from "./treatedWood";
import { groupedMaterials, materialFamilyVariants } from "./materialGroups";
import { fittingBoardOffcut } from "./offcutAssignment";
import { normalizeIdeaText } from "./ideaEdits";

export type BuildQuestion =
  | { kind: "checks" }
  | { kind: "motion"; subject: string }
  | { kind: "greenhouse-weatherseal" }
  | { kind: "opening-flashing"; sillLabel?: string }
  | { kind: "window-wall"; prompt: string }
  | { kind: "wall-water"; subject?: string }
  | { kind: "water-fitting"; tee?: boolean }
  | { kind: "water-pressure" }
  | { kind: "water-stop" }
  | { kind: "sink-drain" }
  | { kind: "subfloor-support"; panelLabel?: string }
  | { kind: "bottom-plate-seal" }
  | { kind: "water-support" }
  | { kind: "treated-wood" }
  | { kind: "drawer-box"; labels: [string, string] }
  | { kind: "board-offcut"; length: number; nominal: string; treated: boolean }
  | { kind: "offcuts"; label?: string };

export type BuildQuestionAction =
  | { kind: "finding"; id: string }
  | { kind: "checks" }
  | { kind: "cut-pool" }
  | { kind: "motion-setup" }
  | { kind: "greenhouse-weatherseal"; motionId: string }
  | { kind: "opening-flashing"; sillId?: string }
  | { kind: "window-wall"; command?: Command }
  | { kind: "wall-water"; runId?: string }
  | { kind: "water-fitting"; fittingId?: string; tee?: boolean }
  | { kind: "water-pressure"; recordId?: string }
  | { kind: "water-stop"; stopId?: string }
  | { kind: "sink-drain"; drainId?: string }
  | { kind: "subfloor-support"; panelId?: string }
  | { kind: "bottom-plate-seal"; planId?: string }
  | { kind: "water-support" }
  | { kind: "drawer-box"; panelIds: [string, string] }
  | { kind: "treated-wood" }
  | { kind: "offcut-reuse"; plan: OffcutReusePlan }
  | { kind: "board-placement"; groupId: string; length: number }
  | Extract<BuildPreparationAction, { kind: "motion" | "lid" | "part" | "offcut" }>;

type ReviewLink = { label: string; action: BuildQuestionAction };
type ReviewRow = {
  id: string;
  title: string;
  detail: string;
  link?: ReviewLink;
};
export type BuildQuestionAnswer = {
  title: string;
  detail: string;
  rows?: ReviewRow[];
  link?: ReviewLink;
  scope?: string;
};

const clean = (text: string) =>
  text
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[.!?]+$/, "")
    .trim();
const searchName = (text: string) =>
  clean(text)
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/^(?:the|my|our)\s+/, "");
const partNumber = /^([op])(\d{1,6})$/i;
const labelKey = (value: string) => {
  const match = partNumber.exec(value);
  return match ? match[1].toUpperCase() + match[2].padStart(3, "0") : value;
};
const weaknessQuestion =
  /^(?:what (?:looks|is|seems) weak(?: (?:here|in (?:this|my|the) (?:build|design|plan|project)))?|(?:where|what) are (?:the |my )?weak (?:spots|points)(?: in .+)?|what should i (?:fix|check|review) before (?:i )?build(?:ing)?|(?:review|check|show) (?:the )?(?:weak spots|weak points|structural checks)(?: in .+)?)$/i;
const treatmentQuestion =
  /^(?:which (?:cuts|parts|holes|cut ends) (?:need|require) (?:field )?treatment|(?:which|what) (?:treated|pressure[- ]treated) (?:wood|lumber) (?:cuts|parts|holes|cut ends) (?:need|require) (?:field )?treatment|(?:do|should) i (?:need to )?treat (?:the |my )?(?:cut ends|drilled holes)|(?:show|review|check) (?:the )?(?:field treatment|pressure[- ]treated wood cuts))$/i;
const scrapQuestion =
  /^(?:what (?:could|can|should) i (?:use|reuse) ([op]\d{1,6}) for|(?:show|find|suggest) (?:uses|reuse options) for (?:offcut |scrap )?([op]\d{1,6})|(?:can|could) i reuse (?:offcut |scrap )?([op]\d{1,6}))$/i;
const offcutQuestion =
  /^(?:(?:what|which) (?:offcuts|scraps|leftovers) (?:could|can|should) i (?:use|reuse)|(?:can|could) i reuse (?:any |my |the )?(?:offcuts|scraps|leftovers)|(?:review|show|plan|find) (?:the )?(?:offcut reuse|scrap reuse|uses for (?:my |the )?(?:scraps|offcuts)))$/i;
const boardOffcutQuestion =
  /^(?:(?:can|could) i (?:make|cut|get) (?:a |one )?(.+) from (?:an? |my |the |any )?(?:offcuts?|scraps?|leftovers?|cut pool)|do i have (?:any |an? )?(?:offcuts?|scraps?|leftovers?) for (?:a |one )?(.+))$/i;
const boardOffcutSize =
  /^(.+?)\s+(?:(pressure[- ]treated|treated)\s+)?(\d{1,2})\s*(?:[x×]|by)\s*(\d{1,2})(?:\s+(?:board|post|framing lumber))?$/i;
const boardFeet = /^(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|['′])(?:\s*(\d+(?:\.\d+)?)\s*(?:inches|inch|in|["″]))?$/i;
const boardInches = /^(\d+(?:\.\d+)?)\s*(?:inches|inch|in|["″])$/i;
const drawerQuestion = /^(?:plan|fit|size|design|add) (?:a |the )?(?:cabinet )?drawer(?: box)? between (p\d{1,6}) and (p\d{1,6})$/i;
const doorSealQuestion =
  /^(?:how (?:can|do|should) i (?:weatherstrip|weatherseal|seal) (?:the |my )?greenhouse door|(?:check|review|plan|show) (?:the )?(?:weatherstrip|weatherseal|weatherstripping) (?:for|on) (?:the |my )?greenhouse door)$/i;
const openingFlashingQuestion = /^(?:how (?:can|do|should) i (?:flash|air[ -]seal) (?:the |my )?(?:window|door) opening|(?:plan|review|check|show) (?:(?:(?:sill|opening|window|door|jamb and head) )?flashing|(?:the )?interior air[ -]seal))(?: (?:at|on|for) (p\d{1,6}))?$/i;
const windowWallQuestion = /^(?:(?:(?:build|frame|design|plan|make|create|add)\s+(?:(?:a|an|the)\s+)?)?(?:window wall|(?:(?:nonbearing|framed)\s+)?wall\b.*\bwindows?\b))/i;
const wallWaterQuestion = /^(?:(?:plan|route|add|lay out) (?:a |the )?(?:pex|water(?: supply)?) (?:line|pipe)(?: through (?:the |a )?(?:wall|studs))?|(?:review|check) (?:the |my )?water line(?: (.+))?|how (?:do|can|should) i run (?:a )?(?:pex|water) (?:line|pipe) through (?:the |a )?(?:wall|studs))$/i;
const fittingQuestion = /^(?:(?:how (?:do|can|should) i )?(?:connect|join) (?:two |my |these |the )?(?:pex|water) (?:runs|lines|pipes)(?: (?:at|around) (?:a |the )?corner)?|(?:review|check|plan) (?:the |my |a )?pex (?:fittings?|connections?))$/i;
const teeQuestion = /^(?:(?:how (?:do|can|should) i )?(?:branch|tee off) (?:the |a |my )?(?:pex|water) (?:main|line|pipe)|(?:add|plan) (?:a |the )?tee (?:in|into|on|to) (?:the |a |my )?(?:pex|water) (?:main|line|pipe)(?: for .+)?)$/i;
const pressureQuestion = /^(?:(?:how (?:do|can|should) i )?pressure[- ]test (?:the |my |a )?(?:pex|water(?: supply)?) (?:main|runs?|lines?|pipes?|system)|(?:log|record|review|check|show) (?:a |the |my )?(?:pex |water )?pressure tests?)$/i;
const namedSubfloorQuestion = /^(?:(?:plan|fit|add|preview|check|show) (?:(?:subfloor )?blocking|subfloor adhesive|subfloor fasteners|(?:floor )?joist (?:bearing|span))|(?:count|how many) (?:subfloor )?nails) (?:under|at|for) (p\d{1,6})$/i;
const subfloorQuestion = /^(?:(?:check|review|show|plan) (?:the |my )?(?:subfloor(?: support| blocking| joist spacing| adhesive| fasteners)?|(?:floor )?joist (?:spacing|bearing|span))|does (?:the |my )?subfloor need (?:more )?blocking|(?:count|how many) subfloor nails|how far do (?:my |the )?(?:floor )?joists span)$/i;
const bottomPlateQuestion = /^(?:(?:how (?:do|can|should) i )?(?:air[ -]seal|seal|caulk) (?:the |a |my )?(?:wall )?(?:bottom|sole) plates?(?: to (?:the )?(?:wood )?subfloor)?|(?:plan|review|check|show) (?:the |a )?(?:bottom|sole) plate (?:air[ -]seals?|seals?))$/i;
const sinkDrainQuestion = /^(?:plan|fit|add|review|check|show|size) (?:a |the |my )?(?:(?:kitchen |kitchenette |cabinet )?sink (?:drain|trap)|(?:sink |kitchen )?p[ -]?trap|trap arm)(?: (?:at|under|for|in) .+)?$/i;
const waterStopQuestion = /^(?:plan|fit|add|review|check|show) (?:a |the |my )?(?:(?:pex |fixture |sink |kitchen |kitchenette )?(?:shut[ -]?offs?|angle stops?)(?: (?:for|at|under|on) .+)?|(?:a )?(?:shutoff |stop )valves?(?: (?:at|for|under) .+)?)$/i;
const waterSupportQuestion = /^(?:(?:how (?:do|can|should) i )support (?:the |my )?(?:pex|water) (?:runs?|lines?|pipes?)|(?:check|review|show|plan) (?:the |my )?(?:pex |water line )(?:supports?|support spacing))$/i;
const motionQuestion =
  /^(?:(?:can|will|does) (.+?) (?:open|close|slide|swing|extend|clear)(?: fully| freely| all the way| without (?:hitting|touching)(?: anything)?)?|(?:can|could) i (?:open|close|extend) (.+?)|(?:will|does) (.+?) (?:hit|touch|bump)(?: anything)?|(?:check|review|test) (?:the )?(?:motion|travel|clearance) (?:of|for) (.+))$/i;

export function buildQuestion(prompt: string): BuildQuestion | null {
  const text = clean(prompt).replace(
    /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,
    "",
  );
  if (weaknessQuestion.test(text)) return { kind: "checks" };
  if (treatmentQuestion.test(text)) return { kind: "treated-wood" };
  const drawer = drawerQuestion.exec(text);
  if (drawer) return { kind: "drawer-box", labels: [labelKey(drawer[1]), labelKey(drawer[2])] };
  const scrap = scrapQuestion.exec(text);
  if (scrap)
    return { kind: "offcuts", label: labelKey(scrap.slice(1).find(Boolean)!) };
  const stock = boardOffcutQuestion.exec(text);
  const size = stock && boardOffcutSize.exec(normalizeIdeaText(stock[1] ?? stock[2]));
  if (size) {
    const feet = boardFeet.exec(size[1]), inches = boardInches.exec(size[1]);
    const length = feet ? Number(feet[1]) * 12 + Number(feet[2] ?? 0) : Number(inches?.[1]);
    if (Number.isFinite(length) && length > 0)
      return { kind: "board-offcut", length, nominal: `${Number(size[3])} × ${Number(size[4])}`, treated: !!size[2] };
  }
  if (offcutQuestion.test(text)) return { kind: "offcuts" };
  if (doorSealQuestion.test(text)) return { kind: "greenhouse-weatherseal" };
  const flashing = openingFlashingQuestion.exec(text);
  if (flashing) return { kind: "opening-flashing", ...(flashing[1] && { sillLabel: labelKey(flashing[1]) }) };
  const water = wallWaterQuestion.exec(text);
  if (water) return { kind: "wall-water", ...(water[1] && { subject: water[1] }) };
  if (fittingQuestion.test(text)) return { kind: "water-fitting" };
  if (teeQuestion.test(text)) return { kind: "water-fitting", tee: true };
  if (pressureQuestion.test(text)) return { kind: "water-pressure" };
  if (waterStopQuestion.test(text)) return { kind: "water-stop" };
  const namedSubfloor = namedSubfloorQuestion.exec(text);
  if (namedSubfloor) return { kind: "subfloor-support", panelLabel: labelKey(namedSubfloor[1]) };
  if (subfloorQuestion.test(text)) return { kind: "subfloor-support" };
  if (bottomPlateQuestion.test(text)) return { kind: "bottom-plate-seal" };
  if (sinkDrainQuestion.test(text)) return { kind: "sink-drain" };
  if (waterSupportQuestion.test(text)) return { kind: "water-support" };
  if (windowWallQuestion.test(text)) return { kind: "window-wall", prompt: text };
  const motion = motionQuestion.exec(text);
  return motion
    ? { kind: "motion", subject: motion.slice(1).find(Boolean)! }
    : null;
}

const supportScope =
  "These checks describe the modeled parts and connections. Verify the intended loads, bracing, fasteners and anchorage for the actual build.";
const motionScope =
  "The result covers modeled parts and recorded site measurements. Verify concealed hinge travel and account for any trim or handles still to be modeled.";

function supportOrder(finding: Finding) {
  const { id, area, severity } = finding;
  if (severity !== "info") {
    if (area?.kind === "panel-floor-bearing") return 0;
    if (id === "collision") return 1;
    if (
      area?.kind === "panel-bearing" ||
      area?.kind === "seat-span" ||
      area?.kind === "shelf-span" ||
      area?.kind === "rafter-eave" ||
      area?.kind === "rafter-ridge"
    )
      return 2;
    if (id === "floating") return 3;
    if (id.startsWith("furniture-frame-")) return 4;
    if (
      id === "unconnected" ||
      id === "connections" ||
      id === "connection-details" ||
      finding.restraintPlanId ||
      id.startsWith("wood-fasteners-") ||
      id.startsWith("casework-tip-up-")
    )
      return 5;
  }
  return id.startsWith("racking-") ? 6 : Infinity;
}

function answerChecks(
  project: Project,
  findings: readonly Finding[],
): BuildQuestionAnswer {
  const concerns = findings
    .filter((finding) => Number.isFinite(supportOrder(finding)))
    .sort((a, b) => supportOrder(a) - supportOrder(b));
  return {
    title: "Support and connection review",
    detail: concerns.length
      ? `Showing ${Math.min(5, concerns.length)} of ${concerns.length} modeled concerns to review before assembly.`
      : project.pieces.some(({ offcut }) => !offcut)
        ? "The current geometry checks found no listed support or connection concerns."
        : "Add or open a build to review its supports and connections.",
    rows: concerns.slice(0, 5).map(({ id, title, detail }) => ({
      id,
      title,
      detail,
      link: { label: "Inspect this check", action: { kind: "finding", id } },
    })),
    link: { label: "Open all checks", action: { kind: "checks" } },
    scope: supportScope,
  };
}

function answerOffcuts(project: Project, label?: string): BuildQuestionAnswer {
  const title = "Offcut matches";
  const cutPool: ReviewLink = {
    label: "Open Cut pool",
    action: { kind: "cut-pool" },
  };
  const labeled = ensurePartLabels(project);
  const id = labeled.partLabels.find((row) => row.label === label)?.partId;
  if (label && !project.pieces.some((part) => part.offcut && part.id === id))
    return {
      title,
      detail: `${label} is missing from the current Cut pool. Check its label or add the measured scrap.`,
      link: cutPool,
    };
  if (!project.pieces.some(({ offcut }) => offcut))
    return {
      title,
      detail:
        "The Cut pool is empty. Add a measured offcut or cut a part to record stock you can reuse.",
      link: cutPool,
    };
  const plan = planOffcutReuse(project, id ? [id] : undefined);
  if (!plan.assignments.length)
    return {
      title,
      detail:
        "No current unassigned part fits the selected stock. Matching considers material, thickness, grain direction and space for the saw cut.",
      link: cutPool,
    };
  return {
    title,
    detail: `${plan.assignments.length} planned ${plan.assignments.length === 1 ? "part fits" : "parts fit"} ${label ? `stock from ${label}` : "stock in the Cut pool"}. Review the cut order before applying.`,
    rows: plan.assignments
      .slice(0, 3)
      .map(({ partId, target, from, operations }) => ({
        id: partId,
        title: target,
        detail: `From ${from}. ${operations.join(" · ") || "Fits as measured."}`,
      })),
    link: {
      label: "Review cuts and stock to buy",
      action: { kind: "offcut-reuse", plan },
    },
  };
}

function answerBoardOffcut(
  project: Project,
  question: Extract<BuildQuestion, { kind: "board-offcut" }>,
): BuildQuestionAnswer {
  const { nominal, treated, length } = question;
  const title = "Offcut for a finished board";
  const group = groupedMaterials("Lumber").find(({ name, id }) =>
    treated ? name.includes(nominal) && id.startsWith("treated-") :
      name.startsWith(`${nominal} `) && !id.startsWith("treated-"));
  if (!group) return {
    title,
    detail: `No ${treated ? "treated " : ""}${nominal} board matches the material shelf. Check the nominal size and treatment.`,
    link: { label: "Open Cut pool", action: { kind: "cut-pool" } },
  };
  const remnant = fittingBoardOffcut(project, materialFamilyVariants(group.preferred), length, inspectCutStock(project));
  const needed = `${formatStockLength(length)} of ${group.name}`;
  return {
    title,
    detail: remnant
      ? `${partLabel(project, remnant.piece.id)} fits ${needed}.`
      : `No recorded offcut fits ${needed}. Review new stock lengths for this board.`,
    rows: remnant ? [{
      id: remnant.piece.id,
      title: `${partLabel(project, remnant.piece.id)} · ${formatStockLength(remnant.available[2])}`,
      detail: [remnant.sourceCutPending && "Complete the source stock cut order first.",
        remnant.operations.length ? remnant.operations.map(({ text }) => text).join(" · ") : "Fits as measured."].filter(Boolean).join(" "),
    }] : undefined,
    link: { label: "Review board placement", action: { kind: "board-placement", groupId: group.id, length } },
  };
}

function motionRows(project: Project, plan: MotionPlan): ReviewRow[] {
  const { baseline, saved, scenarios } = reviewMotionTests(project, plan);
  const tests = [
    {
      id: "baseline",
      variant: "baseline" as const,
      title: "Motion alone",
      result: baseline,
      setup: undefined,
      scenarioId: undefined,
    },
    ...(saved
      ? [
          {
            id: "saved",
            variant: "saved" as const,
            title: "Saved setup",
            result: saved,
            setup: plan.testSetup,
            scenarioId: undefined,
          },
        ]
      : []),
    ...scenarios.map(({ id, name, result, setup }) => ({
      id,
      variant: "saved" as const,
      title: name,
      result,
      setup,
      scenarioId: id,
    })),
  ];
  return tests.map(({ id, variant, title, result, setup, scenarioId }) => {
    const findings = motionTestFindings(project, result, true);
    const first = findings[0];
    const { review } = result;
    const travel =
      review?.sequence
        ?.map(
          ({ plan: member, travel }) =>
            `${member.label} at ${motionDistance(travel, member.mechanism.kind)}`,
        )
        .join(", then ") ??
      [plan, review?.linked]
        .flatMap((member) =>
          member
            ? [
                `${member.label} ${motionDistance(member.mechanism.travel, member.mechanism.kind)}`,
              ]
            : [],
        )
        .join(" with ");
    const held = review
      ? resolveMotionTestSetup(project, setup).held.map(
          ({ plan: member, travel }) =>
            `${member.label} held at ${motionDistance(travel, member.mechanism.kind)}`,
        )
      : [];
    const obstruction =
      review?.hits[0] &&
      project.pieces.find(({ id }) => id === review.hits[0].obstacleId);
    return {
      id,
      title,
      detail: [
        first.detail,
        ...(obstruction ? [`Obstruction · ${obstruction.name}.`] : []),
        ...(review
          ? [`Travel tested · ${[travel, ...held].join(" · ")}.`]
          : []),
        ...(findings.length > 1
          ? [`${findings.length - 1} more test details.`]
          : []),
      ].join(" "),
      link: {
        label: "Inspect this motion",
        action: {
          kind: "motion",
          planId: plan.id,
          variant,
          findingId: first.id,
          scenarioId,
        },
      },
    };
  });
}

function answerMotion(project: Project, subject: string): BuildQuestionAnswer {
  const title = "Modeled motion review";
  const name = searchName(subject);
  const labeled = ensurePartLabels(project);
  const pieces = new Map(
    labeled.pieces
      .filter(({ offcut }) => !offcut)
      .map((part) => [part.id, part.name]),
  );
  const labels = new Map(
    labeled.partLabels.map(({ partId, label }) => [partId, label]),
  );
  const partNames = (ids: string[]) =>
    ids.flatMap((id) =>
      pieces.has(id) ? [pieces.get(id)!, labels.get(id)!] : [],
    );
  const candidates = [
    ...(project.motionPlans ?? []).map((plan) => ({
      name: plan.label,
      names: [plan.label, ...partNames(plan.memberIds)],
      rows: () => motionRows(project, plan),
    })),
    ...project.sections
      .filter((section) => section.recipe?.openingLid)
      .map((section) => ({
        name: `${section.name} lid`,
        names: [
          section.name,
          `${section.name} lid`,
          ...partNames(
            section.pieceIds.filter((id) =>
              /\blid\b/i.test(pieces.get(id) ?? ""),
            ),
          ),
        ],
        rows: (): ReviewRow[] => {
          const { review, findings } = inspectLidTravel(project, section.id);
          const first = findings[0];
          return [
            {
              id: section.id,
              title: `${section.name} lid`,
              detail: first
                ? `${first.detail}${findings.length > 1 ? ` ${findings.length - 1} more test details.` : ""}`
                : `No modeled lid travel findings through ${motionDistance(review!.travel, "hinge")}.`,
              link: {
                label: "Inspect lid travel",
                action: {
                  kind: "lid",
                  sectionId: section.id,
                  findingId: first?.id ?? "clear",
                },
              },
            },
          ];
        },
      })),
  ];
  const exact = candidates.filter(({ names }) =>
    names.some(
      (value) => searchName(value) === name || value === labelKey(name),
    ),
  );
  const words = name.split(/\s+/);
  const matches = exact.length
    ? exact
    : candidates.filter(({ names }) =>
        words.every((word) =>
          names.some((candidate) =>
            searchName(candidate)
              .split(/[\s·–-]+/)
              .includes(word),
          ),
        ),
      );
  if (matches.length === 1)
    return {
      title,
      detail: matches[0].name,
      rows: matches[0].rows(),
      scope: motionScope,
    };
  if (matches.length > 1)
    return {
      title,
      detail: `Several motions match “${subject}”. Use the exact name or part label. ${matches.map(({ name }) => name).join(", ")}.`,
    };
  return {
    title,
    detail: `There is no matching motion for “${subject}”. Use a saved motion's name or set up the moving parts first.`,
    link: { label: "Open movement setup", action: { kind: "motion-setup" } },
  };
}

export function answerBuildQuestion(
  project: Project,
  question: BuildQuestion,
  findings: readonly Finding[],
): BuildQuestionAnswer {
  switch (question.kind) {
    case "checks":
      return answerChecks(project, findings);
    case "board-offcut":
      return answerBoardOffcut(project, question);
    case "motion":
      return answerMotion(project, question.subject);
    case "greenhouse-weatherseal": {
      const title = "Greenhouse door weatherseal review";
      const motions = new Map<string, MotionPlan>();
      for (const motion of project.motionPlans ?? []) {
        const entryId = motion.mechanism.kind === "hinge" ? motion.mechanism.greenhouseDoor?.entryId : undefined;
        if (!entryId) continue;
        const isSavedSeal = project.greenhouseDoorSeals?.some(({ motionId }) => motionId === motion.id);
        if (!motions.has(entryId) || isSavedSeal) motions.set(entryId, motion);
      }
      if (!motions.size) return {
        title,
        detail: "Set up the greenhouse door swing and fit its stops before checking the weatherseal.",
        link: { label: "Open movement setup", action: { kind: "motion-setup" } },
      };
      return {
        title,
        detail: "Closed gaps and travel are checked against the modeled door and its stops.",
        rows: [...motions.values()].slice(0, 5).map((motion) => {
          const saved = project.greenhouseDoorSeals?.find(({ motionId }) => motionId === motion.id);
          const result = saved ? reviewGreenhouseDoorSeal(project, saved) : checkGreenhouseDoorSeal(project, motion);
          return {
            id: motion.id,
            title: motion.label,
            detail: [result.detail, ...result.rows.flatMap(({ name, issues }) => issues.map((issue) => `${name} · ${issue}`))].join(" "),
            link: { label: "Open door movement", action: { kind: "greenhouse-weatherseal", motionId: motion.id } },
          };
        }),
      };
    }
    case "water-fitting":
      return {
        title: question.tee ? "Branch a PEX main" : "Connect measured PEX runs",
        detail: question.tee
          ? "Choose a continuous main and an existing perpendicular branch run. Enter the delivered tee measurements to preview the three pipe cuts, fitting clearance and insertion marks."
          : "Pick the pipe ends and measure the fitting. Yardwork checks the centerlines and the space around the fitting, then shows the adjusted pipe cuts and insertion marks.",
        rows: (project.waterFittings ?? []).map((fitting) => ({
          id: fitting.id, title: fittingLabel(fitting.materialId),
          detail: reviewWaterFitting(project, fitting).problem ?? "The saved pipe ends match the fitting layout.",
          link: { label: "Review this connection", action: { kind: "water-fitting", fittingId: fitting.id } },
        })),
        link: question.tee
          ? { label: "Branch a PEX main", action: { kind: "water-fitting", tee: true } }
          : { label: "Connect PEX runs", action: { kind: "water-fitting" } },
      };
    case "subfloor-support": {
      const target = question.panelLabel
        ? ensurePartLabels(project).partLabels.find(({ label }) => label === question.panelLabel)?.partId : undefined;
      const selected = target && project.pieces.find((piece) => piece.id === target && isSubfloorPanel(piece));
      const rows = selected ? subfloorReviews(project, [selected.id]) : subfloorReviews(project);
      return {
        title: "Check subfloor support",
        detail: question.panelLabel && !selected
          ? `No supported subfloor sheet matches ${question.panelLabel}. Select an actual horizontal sheet to check joist spacing and blocking.`
          : "Choose a sheet to check its joist bearing, span and perimeter backing. Fit blocking from recorded stock, preview adhesive routes and count fasteners.",
        rows: rows.map(({ panelId, layout, problem }) => ({
          id: panelId, title: layout?.piece.name ?? "Saved subfloor check",
          detail: problem || layout?.issues.join(" ") || `${layout?.joistCount} continuous joist lines. ${layout?.nails.length} estimated panel nailing locations.`,
          link: { label: "Review this subfloor sheet", action: { kind: "subfloor-support", panelId } },
        })),
        link: { label: "Open subfloor support", action: { kind: "subfloor-support", ...(selected && { panelId: selected.id }) } },
      };
    }
    case "bottom-plate-seal":
      return {
        title: "Seal a bottom plate",
        detail: "Choose a modeled wood plate on subfloor. The planner checks the exposed bead path and estimates cartridge use from the clear sections.",
        rows: bottomPlateSealReviews(project).map(({ record, title, layout, problem }) => ({
          id: record.id, title,
          detail: problem || `${formatStockLength(layout!.clearLength)} of bead path. ${layout!.runs.some(({ problem }) => problem) ? "Review the marked interruptions." : "Backing and bead space are clear in the model."}`,
          link: { label: "Review this bottom plate seam", action: { kind: "bottom-plate-seal", planId: record.id } },
        })),
        link: { label: "Open bottom plate air seal", action: { kind: "bottom-plate-seal" } },
      };
    case "sink-drain":
      return {
        title: "Fit a sink drain",
        detail: "Mark the tailpiece and wall socket. The planner uses your dry-fit dimensions to check the trap, measure the straight tube cut and review the path to the vent.",
        rows: (project.sinkDrains ?? []).map((record) => ({
          id: record.id, title: record.name,
          detail: reviewSinkDrain(project, record).problem ?? "The saved trap and cut tube match their fit measurements.",
          link: { label: "Review this sink drain", action: { kind: "sink-drain", drainId: record.id } },
        })),
        link: { label: "Open sink drains", action: { kind: "sink-drain" } },
      };
    case "water-stop":
      return {
        title: "Fit a fixture shutoff",
        detail: "Choose an open ½ in PEX stub-out. Enter its exposed length, outlet direction and service clearances to preview the angle stop and pipe cut.",
        rows: (project.waterStops ?? []).map((stop) => ({
          id: stop.id, title: stop.name,
          detail: reviewWaterStop(project, stop).problem ?? "The saved valve and its entered access spaces fit the current model.",
          link: { label: "Review this shutoff", action: { kind: "water-stop", stopId: stop.id } },
        })),
        link: { label: "Open fixture shutoffs", action: { kind: "water-stop" } },
      };
    case "water-pressure":
      return {
        title: "Record a water pressure test",
        detail: "Choose a connected section and enter the installer’s water test observations. Yardwork compares the saved readings with the supported code and fitting references.",
        rows: (project.waterPressureTests ?? []).map((test) => {
          const review = reviewWaterPressure(project, test);
          return {
            id: test.id, title: test.name,
            detail: review.rows.map(({ detail }) => detail).join(" "),
            link: { label: "Open test record", action: { kind: "water-pressure", recordId: test.id } },
          };
        }),
        link: { label: "Open water pressure tests", action: { kind: "water-pressure" } },
      };
    case "water-support": {
      const spacing = waterSupportNetwork(project);
      return {
        title: "Check the PEX supports",
        detail: `${spacing.count} modeled isolators. Review centerline reaches over 32 in and confirm support at open ends.`,
        rows: spacing.spans.filter(longSupportSpan).slice(0, 6).map((span, index) => ({
          id: `${span.from.key}/${index}`,
          title: "Review a long reach",
          detail: waterSupportSpanLine(span),
          link: { label: "Inspect PEX support spacing", action: { kind: "water-support" } },
        })),
        link: { label: "Open PEX support spacing", action: { kind: "water-support" } },
      };
    }
    case "wall-water": {
      const runs = (project.waterRuns ?? []).filter(({ name }) => !question.subject || searchName(name) === searchName(question.subject));
      return {
        title: "Plan a straight water line",
        detail: "Choose a generated nonbearing wall, then enter the actual endpoints, center height, depth and bore. The preview uses the retained studs and checks the pipe route and face protection.",
        scope: "Confirm the wall type, concealed services, fittings, support and local requirements before drilling.",
        rows: runs.map((run) => {
          const review = reviewWaterRun(project, run);
          return {
            id: run.id,
            title: run.name,
            detail: review.problem ?? `${review.measured?.studs.length ?? 0} modeled stud bores and ${run.shields.length} shield plates.`,
            link: { label: "Open water-line layout", action: { kind: "wall-water", runId: run.id } },
          };
        }),
        link: { label: "Plan a wall water line", action: { kind: "wall-water" } },
      };
    }
    case "opening-flashing": {
      const title = "Opening flashing review";
      const sillId = question.sillLabel
        ? ensurePartLabels(project).partLabels.find(({ label }) => label === question.sillLabel)?.partId
        : undefined;
      if (question.sillLabel && (!sillId || !project.pieces.some(({ id, offcut }) => id === sillId && !offcut)))
        return { title, detail: "Use the part label of an active rough sill in the model." };
      const { rows } = reviewOpeningFlashings(project);
      const relevant = sillId ? rows.filter(({ plan }) => plan.members.sill === sillId) : rows;
      return {
        title,
        detail: relevant.length
          ? "The recorded flashing cuts and drainage details follow the four framing members."
          : "Choose the modeled sill, two jambs and head. Keep the exterior sill outlets clear, then seal the interior perimeter after setting the unit.",
        scope: openingFlashingScope,
        rows: relevant.slice(0, 6).map(({ plan, title, issues, result }) => ({
          id: plan.members.sill,
          title,
          detail: !result || issues.length ? issues.join(" ") :
            `Cut one ${formatStockLength(result.length)} piece of ${plan.measurements.tapeWidth} in FlexWrap. ${openingDrainageNote(plan.measurements)}${result.jambHead ? ` Window tape cuts are ${result.jambHead.cuts.map(({ edge, length }) => `${edge.toLowerCase()} ${formatStockLength(length)}`).join(", ")}.` : ""}${result.airSeal ? ` ${openingAirSealSummary(result.airSeal)}.` : ""}`,
          link: { label: "Open flashing plan", action: { kind: "opening-flashing", sillId: plan.members.sill } },
        })),
        link: { label: "Plan opening flashing", action: { kind: "opening-flashing", sillId } },
      };
    }
    case "window-wall": {
      const title = "Window wall layout";
      let command: Command | undefined;
      try {
        const parsed = parsePrompt(question.prompt);
        if (parsed.type === "wall" && parsed.windowOpening) command = parsed;
      } catch (issue) {
        return {
          title, detail: issue instanceof Error ? issue.message : "Enter the wall and rough opening dimensions.",
          scope: windowWallScope, link: { label: "Choose dimensions", action: { kind: "window-wall" } },
        };
      }
      return {
        title,
        detail: command?.windowOpening
          ? `${formatStockLength(command.width)} wide by ${formatStockLength(command.height)} high with a ${formatPreciseInches(command.windowOpening.width)} by ${formatPreciseInches(command.windowOpening.height)} rough window opening.`
          : "Set the wall size, rough opening and sill elevation.",
        scope: windowWallScope,
        link: {
          label: command ? "Preview the window wall" : "Choose dimensions",
          action: { kind: "window-wall", command },
        },
      };
    }
    case "drawer-box": {
      const title = "Drawer opening";
      const { partLabels } = ensurePartLabels(project);
      const [first, second] = question.labels.map((label) => partLabels.find((row) => row.label === label)?.partId);
      if (!first || !second)
        return { title, detail: "Use the part labels of the two fixed cabinet sides." };
      const panelIds: [string, string] = [first, second];
      try {
        const opening = drawerBoxOpening(project, panelIds);
        return {
          title,
          detail: `${question.labels.join(" and ")} give a ${formatPreciseInches(opening.width)} wide opening with ${formatPreciseInches(opening.front - opening.back)} of common depth.`,
          link: { label: "Open drawer setup", action: { kind: "drawer-box", panelIds } },
        };
      } catch (issue) {
        return { title, detail: issue instanceof Error ? issue.message : "Review both cabinet sides." };
      }
    }
    case "treated-wood": {
      const cuts = treatedWoodCuts(project);
      const labels = new Map(ensurePartLabels(project).partLabels.map(({ partId, label }) => [partId, label]));
      return {
        title: fieldTreatmentTitle,
        detail: cuts.length
          ? `Showing ${Math.min(6, cuts.length)} of ${cuts.length} labeled pieces with cuts or holes to review.`
          : "The model has no listed cuts or holes in pressure-treated wood.",
        scope: fieldTreatmentScope,
        rows: cuts.slice(0, 6).map(({ piece, detail }) => ({
          id: piece.id,
          title: `${labels.get(piece.id)} · ${piece.name}`,
          detail,
          link: {
            label: piece.offcut ? "Inspect offcut" : "Inspect part",
            action: { kind: piece.offcut ? "offcut" : "part", id: piece.id },
          },
        })),
        ...(cuts.length && {
          link: { label: "Open build preparation", action: { kind: "treated-wood" } },
        }),
      };
    }
    case "offcuts":
      return answerOffcuts(project, question.label);
  }
}
