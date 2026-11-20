import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import { addSupply } from "./supplies";
import {
  sunliteTapeAllowanceInput,
  sunliteTapeCutsSchema,
  sunliteTapeLengthInput,
  sunliteTapeProductId,
  sunliteTapeRollLength,
  sunliteTapeSide,
  type SunliteTapeCut,
  type SunliteTapeSide,
} from "./sunliteTapeSchema";
import { sunliteTakeoff } from "./sunliteTakeoff";
import { packRuns } from "./stockRunPacking";

export const tapePlanTitle = "Glazing tape cut plan";
export const tapeNames = {
  upper: "Upper nonvented tape",
  lower: "Lower vented tape",
} satisfies Record<SunliteTapeSide, string>;
export const tapePlanNotes =
  "Measure the retained edge, check the delivered roll and include the trim you need. Keep one strip per edge and keep lower vents clear. Confirm the profile and drainage detail at transitions.";
export const tapeCutStates = {
  unmeasured: "Length needed",
  stale: "Edge changed · measure again",
  date: "Check measurement date",
  short: "Too short for this edge",
  oversize: "Exceeds one 32 ft roll",
  ready: "Ready",
} as const;

function tapeRuns(estimate: ReturnType<typeof sunliteTakeoff>) {
  return sunliteTapeSide.options.flatMap((side) =>
    (estimate?.panels ?? []).flatMap((panel) =>
      panel[side].map((run) => ({ ...run, side })),
    ),
  );
}

function saveCuts(project: Project, cuts: SunliteTapeCut[]): Project {
  if (!cuts.length) {
    const { sunliteTapeCuts: _previous, ...rest } = project;
    return rest;
  }
  return { ...project, sunliteTapeCuts: sunliteTapeCutsSchema.parse(cuts) };
}

function record(
  run: ReturnType<typeof tapeRuns>[number],
  measurement: Pick<SunliteTapeCut, "length" | "basis" | "measuredAt">,
  source: SunliteTapeCut["source"],
): SunliteTapeCut {
  return {
    ...measurement,
    runId: run.id,
    fingerprint: run.fingerprint,
    label: run.label,
    side: run.side,
    source,
  };
}

export function saveSunliteTapeCut(
  project: Project,
  runId: string,
  input: unknown,
) {
  const run = tapeRuns(sunliteTakeoff(project)).find(({ id }) => id === runId);
  if (!run) throw Error("This panel edge is no longer available.");
  const measurement = sunliteTapeLengthInput.parse(input);
  return saveCuts(project, [
    ...(project.sunliteTapeCuts ?? []).filter((cut) => cut.runId !== runId),
    record(run, measurement, "entered-length"),
  ]);
}

export function fillSunliteTapeAllowances(project: Project, input: unknown) {
  const { upper, lower, basis, measuredAt } =
    sunliteTapeAllowanceInput.parse(input);
  const extras = { upper, lower };
  const existing = project.sunliteTapeCuts ?? [];
  const alreadyPlanned = new Set(existing.map(({ runId }) => runId));
  const cuts = tapeRuns(sunliteTakeoff(project))
    .filter(({ id }) => !alreadyPlanned.has(id))
    .map((run) =>
      record(
        run,
        {
          length: run.length + extras[run.side],
          basis,
          measuredAt,
        },
        "layout-allowance",
      ),
    );
  return cuts.length ? saveCuts(project, [...existing, ...cuts]) : project;
}

export function removeSunliteTapeCut(project: Project, runId: string) {
  const cuts = project.sunliteTapeCuts?.filter((cut) => cut.runId !== runId);
  return cuts && cuts.length !== project.sunliteTapeCuts?.length
    ? saveCuts(project, cuts)
    : project;
}

export function reviewSunliteTape(
  project: Project,
  estimate = sunliteTakeoff(project),
) {
  const saved = project.sunliteTapeCuts;
  if (!estimate && !saved) return null;
  const byId = new Map(saved?.map((cut) => [cut.runId, cut]));
  const runs = tapeRuns(estimate);
  const current = new Set(runs.map(({ id }) => id));
  const removed = (saved ?? []).filter(({ runId }) => !current.has(runId));
  const panelIssues =
    estimate?.panels.flatMap(({ label, issue }) =>
      issue ? [`${label} · ${issue}`] : [],
    ) ?? [];
  const now = Date.now();
  const rows = runs.map((run) => {
    const measurement = byId.get(run.id);
    let state: keyof typeof tapeCutStates = "unmeasured";
    if (measurement) {
      if (
        measurement.fingerprint !== run.fingerprint ||
        measurement.side !== run.side
      )
        state = "stale";
      else if (Date.parse(measurement.measuredAt) > now) state = "date";
      else if (measurement.length > sunliteTapeRollLength) state = "oversize";
      else if (measurement.length < run.length - 0.001) state = "short";
      else state = "ready";
    }
    return { run, measurement, state };
  });
  const groups = sunliteTapeSide.options.map((side) => ({
    side,
    rolls: packRuns(
      rows.flatMap(({ run, measurement, state }) =>
        run.side === side && state === "ready" && measurement
          ? [{ ...measurement, label: run.label }]
          : [],
      ),
      sunliteTapeRollLength,
    ).bins,
  }));
  const readyCount = rows.filter(({ state }) => state === "ready").length;
  const complete =
    readyCount > 0 &&
    readyCount === rows.length &&
    !removed.length &&
    !panelIssues.length;
  const required = complete
    ? Math.max(...groups.map(({ rolls }) => rolls.length))
    : null;
  const selected = project.supplies
    .filter(({ productId }) => productId === sunliteTapeProductId)
    .reduce((total, row) => total + row.quantity, 0);
  const offer = referenceOffersForProduct(
    findRetailerProduct(sunliteTapeProductId)!,
  ).find(({ retailer }) => retailer === project.retailer);
  return {
    rows,
    removed,
    groups,
    readyCount,
    panelIssues,
    required,
    selected,
    offer,
    started: !!saved?.length,
    missing: required === null ? null : Math.max(0, required - selected),
  };
}

export type SunliteTapeReview = NonNullable<
  ReturnType<typeof reviewSunliteTape>
>;

export const tapePurchasePending =
  "Resolve the unmeasured or changed edges in List before adding tape kits from the plan.";

export function addSunliteTapeKits(project: Project) {
  const review = reviewSunliteTape(project);
  if (!review || review.missing === 0) return project;
  if (review.missing === null) throw Error(tapePurchasePending);
  if (!review.offer)
    throw Error(
      "This tape kit has no reviewed listing for the selected retailer.",
    );
  return addSupply(
    project,
    sunliteTapeProductId,
    review.missing,
    tapePlanTitle,
    tapePlanNotes,
  );
}

export function tapePlanLines(review: SunliteTapeReview) {
  const purchase =
    review.required === null
      ? tapePurchasePending
      : `${review.required} paired tape ${review.required === 1 ? "kit" : "kits"} needed · ${review.selected} selected. Each kit supplies one upper roll and one lower roll.`;
  const status = [
    `${review.readyCount} of ${review.rows.length} edges ready. ${purchase}`,
    ...review.panelIssues,
    ...review.rows.flatMap(({ run, state }) =>
      state === "ready" ? [] : [`${run.label} · ${tapeCutStates[state]}.`],
    ),
    ...review.removed.map(
      ({ label }) =>
        `${label} · Edge no longer in the layout. Review or remove its old measurement.`,
    ),
  ];
  const groups = review.groups.map(({ side, rolls }) => ({
    name: tapeNames[side],
    rolls: rolls.map(({ runs, left }, index) => ({
      label: `Roll ${index + 1} · ${formatStockLength(left)} left`,
      strips: runs.map(
        (run) =>
          `${run.label} · ${formatStockLength(run.length)} · ${run.source === "layout-allowance" ? "layout plus trim" : "entered length"}.`,
      ),
    })),
  }));
  const evidence = [
    ...new Set(
      review.groups.flatMap(({ rolls }) =>
        rolls.flatMap(({ runs }) =>
          runs.map(
            ({ measuredAt, basis }) =>
              `${measuredAt.slice(0, 10)} · ${basis.replace(/\s+/g, " ")}`,
          ),
        ),
      ),
    ),
  ];
  return { status, groups, evidence };
}

export function sunliteTapeMarkdown(project: Project) {
  const review = reviewSunliteTape(project);
  if (!review?.started) return "";
  const lines = tapePlanLines(review);
  const escape = (line: string) => line.replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
  return [
    "",
    "",
    `## ${tapePlanTitle}`,
    "",
    tapePlanNotes,
    "",
    ...lines.status.map((line) => `- ${escape(line)}`),
    ...(review.offer
      ? [`- [SUNLITE 92763 paired rolls](${review.offer.url})`]
      : []),
    ...lines.groups.flatMap(({ name, rolls }) =>
      rolls.length
        ? [
            "",
            `### ${name}`,
            "",
            ...rolls.flatMap(({ label, strips }) => [
              `- ${label}`,
              ...strips.map((strip) => `  - ${escape(strip)}`),
            ]),
          ]
        : [],
    ),
    ...(lines.evidence.length
      ? [
          "",
          "Measurement notes",
          ...lines.evidence.map((line) => `- ${escape(line)}`),
        ]
      : []),
    "",
  ].join("\n");
}
