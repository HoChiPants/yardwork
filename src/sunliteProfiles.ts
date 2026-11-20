import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "./retailerCatalog";
import {
  sunliteCutInputSchema,
  sunliteProfileCutSchema,
  sunliteProfileId,
  sunliteProfilePlanSchema,
  sunliteProfileSetupSchema,
  type SunliteProfileCut,
  type SunliteProfileId,
  type SunliteProfileSetup,
} from "./sunliteProfileSchema";
import { sunliteTakeoff, type SunliteProfileRun } from "./sunliteTakeoff";
import { addSupply } from "./supplies";

export const profileNames = {
  "sunlite-96714": "96714 snap-cap base and cap",
  "sunlite-96715": "96715 U-channel",
} satisfies Record<SunliteProfileId, string>;

export const profileScope =
  "Use delivered profile dimensions and dry-fit the opening. Verify engagement, expansion, drainage, transitions, backing and fastener requirements before cutting or installing.";
const epsilon = 1e-7;
const emptyPlan = () => ({ setups: {}, cuts: [] });
type CutState = "unmeasured" | "setup-needed" | "ready" | "oversize" | "stale";

function savePlan(project: Project, candidate: unknown): Project {
  return {
    ...project,
    sunliteProfilePlan: sunliteProfilePlanSchema.parse(candidate),
  };
}

export function saveSunliteSetup(
  project: Project,
  id: SunliteProfileId,
  input: unknown,
) {
  const setup = sunliteProfileSetupSchema.parse(input);
  const current = project.sunliteProfilePlan ?? emptyPlan();
  return savePlan(project, {
    ...current,
    setups: { ...current.setups, [sunliteProfileId.parse(id)]: setup },
  });
}

export function saveSunliteCut(
  project: Project,
  runId: string,
  input: unknown,
) {
  const run = sunliteTakeoff(project)?.profileRuns.find(
    (row) => row.id === runId,
  );
  if (!run) throw Error("The modeled profile run is no longer available.");
  const measurement = sunliteCutInputSchema.parse(input);
  const cut = sunliteProfileCutSchema.parse({
    ...measurement,
    runId: run.id,
    fingerprint: run.fingerprint,
    label: run.label,
    productId: run.productId,
  });
  const current = project.sunliteProfilePlan ?? emptyPlan();
  return savePlan(project, {
    ...current,
    cuts: [...current.cuts.filter((item) => item.runId !== runId), cut],
  });
}

export function removeSunliteCut(project: Project, runId: string) {
  const plan = project.sunliteProfilePlan;
  if (!plan?.cuts.some((cut) => cut.runId === runId)) return project;
  return savePlan(project, {
    ...plan,
    cuts: plan.cuts.filter((cut) => cut.runId !== runId),
  });
}

function lossFor(length: number, available: number, kerf: number) {
  if (Math.abs(available - length) <= epsilon) return 0;
  if (available >= length + kerf - epsilon) return kerf;
  return null;
}

type Stock = {
  remaining: number;
  cuts: {
    run: SunliteProfileRun;
    measurement: SunliteProfileCut;
    kerf: number;
  }[];
};

function allocate(
  rows: { run: SunliteProfileRun; measurement: SunliteProfileCut }[],
  setup: SunliteProfileSetup,
) {
  const sticks: Stock[] = [];
  const sorted = [...rows].sort(
    (a, b) =>
      b.measurement.length - a.measurement.length ||
      a.run.label.localeCompare(b.run.label) ||
      a.run.id.localeCompare(b.run.id),
  );
  for (const row of sorted) {
    const { length } = row.measurement;
    let stick = sticks.find(
      (stock) => lossFor(length, stock.remaining, setup.kerf) !== null,
    );
    if (!stick) {
      stick = { remaining: setup.usableLength, cuts: [] };
      sticks.push(stick);
    }
    const kerf = lossFor(length, stick.remaining, setup.kerf);
    if (kerf === null)
      throw Error("A measured profile run cannot fit this stock.");
    stick.cuts.push({ ...row, kerf });
    stick.remaining = Math.max(0, stick.remaining - length - kerf);
  }
  return sticks;
}

export function reviewSunliteProfiles(
  project: Project,
  estimate = sunliteTakeoff(project),
) {
  const plan = project.sunliteProfilePlan;
  if (!estimate && !plan) return null;
  const saved = new Map(plan?.cuts.map((cut) => [cut.runId, cut]));
  const runs = estimate?.profileRuns ?? [];
  const currentIds = new Set(runs.map((run) => run.id));
  const groups = sunliteProfileId.options.map((id) => {
    const setup = plan?.setups[id];
    const rows = runs
      .filter((run) => run.productId === id)
      .map((run) => {
        const measurement = saved.get(run.id);
        let state: CutState = "unmeasured";
        if (measurement) {
          if (
            measurement.productId !== id ||
            measurement.fingerprint !== run.fingerprint
          )
            state = "stale";
          else if (!setup) state = "setup-needed";
          else if (
            lossFor(measurement.length, setup.usableLength, setup.kerf) === null
          )
            state = "oversize";
          else state = "ready";
        }
        return { run, measurement, state };
      });
    const removed = [...saved.values()].filter(
      (cut) => cut.productId === id && !currentIds.has(cut.runId),
    );
    const sticks = setup
      ? allocate(
          rows.flatMap(({ state, run, measurement }) =>
            state === "ready" && measurement ? [{ run, measurement }] : [],
          ),
          setup,
        )
      : [];
    const selected = project.supplies.reduce(
      (sum, row) => sum + (row.productId === id ? row.quantity : 0),
      0,
    );
    const offer = referenceOffersForProduct(findRetailerProduct(id)!).find(
      (row) => row.retailer === project.retailer,
    );
    return {
      id,
      setup,
      rows,
      removed,
      sticks,
      offer,
      selected,
      missing: Math.max(0, sticks.length - selected),
      ready: rows.filter((row) => row.state === "ready").length,
    };
  });
  return { groups };
}
export type SunliteProfileReview = NonNullable<
  ReturnType<typeof reviewSunliteProfiles>
>;

export function addMeasuredSunlitePurchases(project: Project) {
  let next = project;
  for (const row of reviewSunliteProfiles(project)?.groups ?? []) {
    if (!row.offer || !row.missing) continue;
    next = addSupply(
      next,
      row.id,
      row.missing,
      "Measured greenhouse profile cuts",
      profileScope,
    );
  }
  return next;
}

const clean = (value: string) => value.replace(/[\r\n]/g, " ");
export const profileCutStates = {
  unmeasured: "Measure on site",
  "setup-needed": "Record stock length and saw kerf",
  ready: "Included in measured cut list",
  oversize: "Too long for this stock length and saw kerf",
  stale: "Geometry changed. Measure again.",
} satisfies Record<CutState, string>;

export function sunliteProfileLines(review: SunliteProfileReview) {
  return review.groups
    .filter(
      (group) =>
        group.setup ||
        group.removed.length ||
        group.rows.some((row) => row.measurement),
    )
    .map((group) => {
      const heading = profileNames[group.id];
      const summary = [
        `${group.ready} of ${group.rows.length} current runs in the measured cut list · ${group.sticks.length} stock units needed for those runs · ${group.selected} selected.`,
        ...(group.setup
          ? [
              `Usable stock length ${formatStockLength(group.setup.usableLength)} · saw kerf ${formatStockLength(group.setup.kerf)} · ${group.setup.measuredAt.slice(0, 10)} (${clean(group.setup.basis)}).`,
            ]
          : []),
        ...group.rows.flatMap(({ run, state }) =>
          state !== "ready" && state !== "unmeasured"
            ? [`${run.label} · ${profileCutStates[state]}`]
            : [],
        ),
        ...group.removed.map(
          (cut) => `${cut.label} · Saved run no longer matches a modeled edge.`,
        ),
      ];
      return {
        heading,
        summary,
        sticks: group.sticks.map((stock, index) => ({
          heading: `Stock ${index + 1} · remainder ${formatStockLength(stock.remaining)}`,
          cuts: stock.cuts.map(
            ({ run, measurement, kerf }) =>
              `${run.label} · ${formatStockLength(measurement.length)} finished · ${kerf ? `${formatStockLength(kerf)} saw loss` : "use remainder at its current length"} · ${measurement.measuredAt.slice(0, 10)} (${clean(measurement.basis)})`,
          ),
        })),
      };
    });
}

export function sunliteProfileMarkdown(project: Project) {
  if (!project.sunliteProfilePlan) return "";
  const review = reviewSunliteProfiles(project);
  const lines = review ? sunliteProfileLines(review) : [];
  if (!lines.length) return "";
  const escape = (value: string) => value.replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
  return [
    "",
    "",
    "## Measured greenhouse profile cuts",
    "",
    profileScope,
    "",
    ...lines.flatMap((group) => [
      `### ${group.heading}`,
      "",
      ...group.summary.map((line) => `- ${escape(line)}`),
      ...group.sticks.flatMap((stock) => [
        `- ${stock.heading}`,
        ...stock.cuts.map((cut) => `  - ${escape(cut)}`),
      ]),
      "",
    ]),
  ].join("\n");
}
