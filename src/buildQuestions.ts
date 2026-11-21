import type { BuildPreparationAction } from "./buildPreparation";
import type { Finding } from "./engine";
import { drawerBoxOpening } from "./drawerBoxes";
import { formatPreciseInches } from "./measurement";
import { inspectLidTravel } from "./lidTravelFindings";
import {
  motionDistance,
  motionTestFindings,
  resolveMotionTestSetup,
  reviewMotionTests,
} from "./mechanismMotion";
import type { Project } from "./model";
import type { MotionPlan } from "./motionPlanSchema";
import { planOffcutReuse, type OffcutReusePlan } from "./offcutReusePlan";
import { ensurePartLabels } from "./partLabels";
import { fieldTreatmentScope, fieldTreatmentTitle, treatedWoodCuts } from "./treatedWood";

export type BuildQuestion =
  | { kind: "checks" }
  | { kind: "motion"; subject: string }
  | { kind: "treated-wood" }
  | { kind: "drawer-box"; labels: [string, string] }
  | { kind: "offcuts"; label?: string };

export type BuildQuestionAction =
  | { kind: "finding"; id: string }
  | { kind: "checks" }
  | { kind: "cut-pool" }
  | { kind: "motion-setup" }
  | { kind: "drawer-box"; panelIds: [string, string] }
  | { kind: "treated-wood" }
  | { kind: "offcut-reuse"; plan: OffcutReusePlan }
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
const drawerQuestion = /^(?:plan|fit|size|design|add) (?:a |the )?(?:cabinet )?drawer(?: box)? between (p\d{1,6}) and (p\d{1,6})$/i;
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
  if (offcutQuestion.test(text)) return { kind: "offcuts" };
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
    case "motion":
      return answerMotion(project, question.subject);
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
