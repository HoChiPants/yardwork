import { projectSchema, uid, type Project } from "./model";
import { reviewWaterRun } from "./wallWater";
import { pexPipes, pexInstallation } from "./wallWaterReference";
import { fittingLabel, reviewWaterFitting, waterPortKey } from "./waterFittings";
import { waterFittingPorts } from "./waterFittingSchema";
import { waterFittingProducts } from "./waterFittingReference";
import { waterPressureInput, type WaterPressureInput, type WaterPressureTest } from "./waterPressureSchema";
import { utahAdoptionVersions } from "./utahCodeSources";
import type { CodeReviewRow } from "./projectCode";

export const waterTestManufacturer = { title: "RWC Piping Systems Installation Guide · Testing", url: pexInstallation };
const pexTemperature = {
  title: "SharkBite white PEX-B · working pressure and temperature",
  url: "https://www.sharkbite.com/us/en/pex-pipe-connectors/potable-pex-b/white-pex-b-pipe-straight-lengths",
};
const utahWaterTestReviewedThrough = "2026-11-21";
const ircSources = [
  utahAdoptionVersions[0].source,
  { title: "2021 IRC P2503.7 and P2503.9 · ICC chapter text", url: "https://codes.iccsafe.org/content/LAIRC2021P1/chapter-25-plumbing-administration" },
  { title: "Utah Code §15A-3-204 · IRC amendments", url: "https://le.utah.gov/xcode/Title15A/Chapter3/C15A-3-S204_2026050620260701.html" },
];
const ipcSources = [
  utahAdoptionVersions[0].source,
  { title: "2024 IPC §312.6 · base text in ICC’s 2024 code hearings", url: "https://www.iccsafe.org/wp-content/uploads/IPC-2024.pdf" },
  { title: "Utah H.B. 65 · IPC §312.6 amendment", url: "https://le.utah.gov/Session/2026/bills/enrolled/HB0065.pdf" },
];

/** Reach every connected run through all sockets, including the third port of a tee. */
export function waterPressureScope(project: Project, rootRunId: string) {
  const runs = project.waterRuns ?? [];
  if (!runs.some(({ id }) => id === rootRunId)) return { problem: "Choose a current wall water line." };
  const connected = new Set([rootRunId]);
  const remaining = (project.waterFittings ?? []).map((fitting) => ({ fitting, ports: waterFittingPorts(fitting) }));
  const fittings: typeof remaining = [];
  let added = true;
  while (added) {
    added = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const edge = remaining[i];
      if (!edge.ports.some(({ runId }) => connected.has(runId))) continue;
      for (const { runId } of edge.ports) connected.add(runId);
      fittings.push(edge);
      remaining.splice(i, 1);
      added = true;
    }
  }
  const group = runs.filter(({ id }) => connected.has(id)).sort((a, b) => a.id.localeCompare(b.id));
  fittings.sort((a, b) => a.fitting.id.localeCompare(b.fitting.id));
  if (group.length !== connected.size) return { problem: "A fitting refers to a missing line. Resolve the connection before recording this scope." };
  for (const { fitting } of fittings) {
    const checked = reviewWaterFitting(project, fitting);
    if (!checked.layout) return { problem: `${fittingLabel(fitting.materialId)} · ${checked.problem}` };
  }
  const occupied = new Set(fittings.flatMap(({ ports }) => ports.map(waterPortKey)));
  for (const run of group) {
    if (occupied.has(waterPortKey({ runId: run.id, end: "start" })) ||
        occupied.has(waterPortKey({ runId: run.id, end: "end" }))) continue;
    const checked = reviewWaterRun(project, run);
    if (!checked.measured) return { problem: `${run.name} · ${checked.problem}` };
  }
  const pose = (pieceId: string) => {
    const part = project.pieces.find(({ id }) => id === pieceId)!;
    return [part.position, part.rotation, part.size];
  };
  const scope: WaterPressureTest["scope"] = {
    geometry: JSON.stringify([
      group.map(({ id, pipeId, materialId, isolators }) => [
        id, pipeId, materialId, pose(pipeId),
        ...(isolators?.length ? [isolators.map(({ id: partId, studId }) => [partId, studId, pose(partId)])] : []),
      ]),
      fittings.map(({ fitting, ports }) => [fitting.id, fitting.pieceId, fitting.materialId, ports.map(waterPortKey),
        fitting.reach, fitting.branch?.reach ?? null, pose(fitting.pieceId)]),
    ]),
    runs: group.map(({ id, pipeId, name, materialId }) => ({ id, pipeId, name, model: pexPipes[materialId].model })),
    fittings: fittings.map(({ fitting }) => ({ id: fitting.id, model: waterFittingProducts[fitting.materialId].model })),
    openEnds: group.flatMap(({ id }) => (["start", "end"] as const).map((end) => ({ runId: id, end })))
      .filter((port) => !occupied.has(waterPortKey(port))),
  };
  return { scope };
}

export function saveWaterPressureTest(project: Project, data: unknown, existingId?: string) {
  const draft = waterPressureInput.parse(data);
  const records = project.waterPressureTests ?? [];
  const existing = records.find(({ id }) => id === existingId);
  if (existingId && !existing) throw Error("This water test record is no longer in the project.");
  if (!existing && records.length >= 16) throw Error("This project already contains 16 water test records.");
  if (existing && existing.rootRunId !== draft.rootRunId) throw Error("Start a new record for a different test section.");
  const current = waterPressureScope(project, draft.rootRunId);
  const scope = existing?.scope ?? current.scope;
  if (!scope) throw Error(current.problem);
  if (existing && !sameWaterScope(current.scope, scope))
    throw Error("The recorded layout changed. Start a new water test record for the current scope.");
  const record = { ...draft, id: existing?.id ?? uid(), scope };
  return projectSchema.parse({
    ...project,
    waterPressureTests: existing ? records.map((row) => row.id === existing.id ? record : row) : [...records, record],
    guideFingerprint: null,
  });
}

function sameWaterScope(current: WaterPressureTest["scope"] | undefined, saved: WaterPressureTest["scope"]) {
  if (!current || current.geometry !== saved.geometry) return false;
  const ids = (scope: WaterPressureTest["scope"]) => [
    scope.runs.map(({ id, pipeId, model }) => [id, pipeId, model]),
    scope.fittings.map(({ id, model }) => [id, model]),
    scope.openEnds.map(waterPortKey),
  ];
  return JSON.stringify(ids(current)) === JSON.stringify(ids(saved));
}

const psi = (value: number | null) => value === null ? "—" : `${value} psi`;
const minutes = (value: number | null) => value === null ? "—" : `${value} min`;
export const waterTestPhaseFields = [
  { id: "firstHold", label: "Initial high hold", psi: 150, minutes: 30 },
  { id: "reducedHold", label: "Reduced hold", psi: 30, minutes: 10 },
  { id: "secondHold", label: "Second high hold", psi: 150, minutes: 30 },
] as const;

function pressureRows(project: Project, data: WaterPressureInput, scope: WaterPressureTest["scope"]): CodeReviewRow[] {
  const rows: CodeReviewRow[] = [];
  const add = (id: string, label: string, state: CodeReviewRow["state"], detail: string, sources?: CodeReviewRow["sources"]) =>
    rows.push({ id, label, state, detail, sources });
  const { startPsi, lowestPsi, endPsi, minutes: hold } = data.finalHold;
  const readings = [startPsi, lowestPsi, endPsi, data.secondHoldEndPsi, ...waterTestPhaseFields.map(({ id }) => data[id].psi)]
    .filter((value): value is number => value !== null);
  const peak = data.peakPsi;
  const cap = data.setupLimitPsi;
  const gauge = data.gaugeLimitPsi;
  const temperature = data.temperatureF;
  const inRatedBand = temperature !== null && temperature >= 33 && temperature <= 70;
  const limits = [
    { label: "weakest component", value: cap }, { label: "gauge working limit", value: gauge },
    { label: "gauge scale limit", value: data.gaugeScalePsi }, { label: "ambient PEX-B rating", value: inRatedBand ? 160 : null },
  ];
  const exceeded = limits.filter(({ value }) => peak !== null && value !== null && peak > value);
  const inconsistent = (lowestPsi !== null && [startPsi, endPsi].some((value) => value !== null && lowestPsi > value)) ||
    (peak !== null && readings.some((value) => value > peak));
  const setupReady = peak !== null && cap !== null && gauge !== null && data.gaugeScalePsi !== null && data.gaugeIncrementPsi !== null &&
    !!data.gaugeReference && inRatedBand && !exceeded.length && !inconsistent;
  const fieldReady = !!data.testedOn && data.waterSource === "potable" &&
    data.boundaryConfirmed === "yes" && !!data.boundaryNotes && data.addedWater === "no" && data.leakage === "no";
  const fieldIssues = [
    ...(data.waterSource === "other" ? ["Water source is recorded as other than potable."] : []),
    ...(data.boundaryConfirmed === "no" ? ["The test section was not isolated as recorded."] : []),
    ...(data.addedWater === "yes" ? ["Water was added during the final hold."] : []),
    ...(data.leakage === "yes" ? ["Visible leakage was recorded."] : []),
  ];
  const fieldConflict = fieldIssues.length > 0;
  add("field", "Field evidence", fieldConflict ? "discrepancy" : fieldReady ? "recorded-condition" : "needs-input",
    fieldConflict ? fieldIssues.join(" ")
      : fieldReady ? "A dated observation records potable water, an isolated section, no water added during the final hold and no visible leak."
        : "Record the test date, potable water, field isolation, whether water was added and whether joints showed leakage.");
  add("limits", "Pressure and equipment limits",
    exceeded.length || inconsistent ? "discrepancy" : setupReady ? "measured-match" :
      temperature !== null && !inRatedBand ? "authority-review" : "needs-input",
    exceeded.length ? `Peak ${psi(peak)} exceeds ${exceeded.map(({ label, value }) => `${label} (${psi(value)})`).join(", ")}.`
      : inconsistent ? "Check the reading order. The overall peak must cover every reading and the final low cannot exceed either endpoint."
        : setupReady ? `Peak ${psi(peak)} is within the entered assembly and gauge limits and the documented 33–70 °F PEX-B rating.`
          : temperature !== null && !inRatedBand ? `The recorded ${temperature} °F is outside the reviewed 33–70 °F band. Confirm component ratings at the actual temperature.`
            : "Record the temperature, highest pressure, weakest component limit and the gauge’s range, working limit, increment and reference. The published 160 psi comparison covers 33–70 °F.",
    [pexTemperature]);
  const context = project.projectCode;
  const dated = context?.region === "utah" && !!context.projectDate && context.projectDate >= utahAdoptionVersions[0].effectiveFrom &&
    context.projectDate <= utahWaterTestReviewedThrough && context.codePath !== "unknown" && context.work !== "unknown" &&
    context.trades.includes("plumbing") && !!context.buildingAuthority && !!context.authorityBasis;
  const irc = context?.codePath === "irc";
  const codeName = irc ? "2021 IRC P2503.7" : "2024 IPC §312.6";
  const codeSources = irc ? ircSources : ipcSources;
  const finalComplete = startPsi !== null && lowestPsi !== null && endPsi !== null && hold !== null;
  const drop = finalComplete && (lowestPsi < startPsi || endPsi < startPsi);
  if (!dated) {
    add("code", "Local water supply review", "authority-review",
      context?.region === "other" ? "Compare the recorded hold with the requirements of the actual jurisdiction."
        : `Set the build authority, plumbing scope, code path and project or permit date for the reviewed Utah period (July 1 through ${utahWaterTestReviewedThrough}).`);
  } else {
    const working = data.workingPsi;
    const short = (hold !== null && hold < 15) || (lowestPsi !== null && working !== null && lowestPsi < working);
    const increment = data.gaugeIncrementPsi;
    const allowedIncrement = startPsi === null ? null : startPsi <= 10 ? 0.1 : startPsi <= 100 ? 1 : 2;
    const coarse = irc && increment !== null && allowedIncrement !== null && increment > allowedIncrement;
    if (short || coarse || fieldConflict || drop) add("code", codeName, "discrepancy",
      coarse ? `The entered final test pressure calls for gauge increments of ${psi(allowedIncrement)} or finer under P2503.9.`
        : short ? "The recorded final hold falls below the entered working pressure or the 15-minute minimum."
          : "The recorded hold has a pressure-loss or field-evidence issue. Review it with the installer and authority.", codeSources);
    else if (fieldReady && setupReady && finalComplete && working !== null) add("code", codeName, "measured-match",
      `Recorded final hold · ${minutes(hold)} at or above ${psi(lowestPsi)}. The entered working pressure is ${psi(working)}. Confirm inspection with the authority.`, codeSources);
    else add("code", codeName, "needs-input", "Complete the field evidence, equipment review, working pressure and final hold observations.", codeSources);
  }
  const listedFittings = scope.fittings.length > 0;
  const phasesComplete = data.secondHoldEndPsi !== null && waterTestPhaseFields.every(({ id }) =>
    data[id].psi !== null && data[id].minutes !== null);
  const wrongPhase = waterTestPhaseFields.find(({ id, psi: target, minutes: minimum }) =>
    (data[id].psi !== null && data[id].psi !== target) || (data[id].minutes !== null && data[id].minutes < minimum));
  const disconnectedReadings = data.secondHoldEndPsi !== null && startPsi !== null && data.secondHoldEndPsi !== startPsi;
  const belowWorking = lowestPsi !== null && data.workingPsi !== null && lowestPsi < data.workingPsi;
  if (!listedFittings) add("manufacturer", "RWC push-to-connect sequence", "authority-review",
    "The modeled section has no connected fitting to identify the applicable fitting procedure.", [waterTestManufacturer]);
  else if (wrongPhase || (hold !== null && hold < 60) || drop || disconnectedReadings || belowWorking || exceeded.length || fieldConflict)
    add("manufacturer", "RWC push-to-connect sequence", "discrepancy",
      drop ? "A decrease was recorded in the final hold. Keep the original readings and record the manufacturer's follow-up with the installer."
        : disconnectedReadings ? "The end of the second high hold and the start of the final observation differ. Review the recorded sequence."
          : wrongPhase ? `${wrongPhase.label} differs from the published target or duration.`
          : "Review the final observation time, equipment limits and field conditions against the manufacturer’s procedure.",
      [waterTestManufacturer]);
  else if (fieldReady && setupReady && phasesComplete && finalComplete && data.workingPsi !== null)
    add("manufacturer", "RWC push-to-connect sequence", "measured-match",
      "The entered phase readings and durations match the published sequence. No decrease was recorded during the final observation.",
      [waterTestManufacturer]);
  else add("manufacturer", "RWC push-to-connect sequence", "needs-input",
    "Enter the three conditioning observations and the final hold from one installer-performed water test.", [waterTestManufacturer]);
  return rows;
}

export function reviewWaterPressure(project: Project, record: WaterPressureTest) {
  const current = waterPressureScope(project, record.rootRunId);
  if (!sameWaterScope(current.scope, record.scope)) return {
    stale: true,
    rows: [{
      id: "model", label: "Recorded test section", state: "discrepancy",
      detail: current.problem
        ? `The saved readings describe an earlier layout. ${current.problem}`
        : "The connected routes, sockets or pipe geometry changed. Keep these readings and start a new record for the current layout.",
    }] satisfies CodeReviewRow[],
  };
  return { stale: false, rows: pressureRows(project, record, record.scope) };
}

export function previewWaterPressure(project: Project, data: WaterPressureInput, scope: WaterPressureTest["scope"]) {
  const valid = waterPressureInput.safeParse(data);
  if (!valid.success) return [{
    id: "inputs", label: "Review entries", state: "needs-input",
    detail: "Give the record a name and check the entered dates, pressures, temperatures and times.",
  }] satisfies CodeReviewRow[];
  return pressureRows(project, valid.data, scope);
}

export function waterPressureObservations({ scope, ...test }: WaterPressureTest) {
  const { finalHold: hold } = test;
  const status = { yes: "Yes", no: "No", unknown: "Unrecorded" };
  return [
    `Test date · ${test.testedOn ?? "Unrecorded"} · Water source · ${test.waterSource === "unknown" ? "Unrecorded" : test.waterSource}`,
    `Saved section · ${scope.runs.map(({ name, model }) => `${name} (${model})`).join(", ")}${scope.fittings.length ? ` · Fittings · ${scope.fittings.map(({ model }) => model).join(", ")}` : ""}`,
    `Field isolation confirmed · ${status[test.boundaryConfirmed]}${test.boundaryNotes ? ` · ${test.boundaryNotes}` : ""}`,
    `Working pressure · ${psi(test.workingPsi)} · Peak · ${psi(test.peakPsi)} · Weakest setup rating · ${psi(test.setupLimitPsi)} · Water temperature · ${test.temperatureF === null ? "—" : `${test.temperatureF} °F`}`,
    `Gauge · ${test.gaugeReference || "Unrecorded"} · Scale limit ${psi(test.gaugeScalePsi)} · Working limit ${psi(test.gaugeLimitPsi)} · Increment ${psi(test.gaugeIncrementPsi)}`,
    ...waterTestPhaseFields.map(({ id, label }) => `${label} · ${psi(test[id].psi)} · ${minutes(test[id].minutes)}`),
    `End of second high hold · ${psi(test.secondHoldEndPsi)}`,
    `Final hold · Start ${psi(hold.startPsi)} · Low ${psi(hold.lowestPsi)} · End ${psi(hold.endPsi)} · ${minutes(hold.minutes)}`,
    `Added water during final hold · ${status[test.addedWater]} · Visible leakage · ${status[test.leakage]}`,
    ...(test.notes ? [test.notes] : []),
  ];
}

export const waterPressureGuideStep = "Record the field water test for the installed section and review the dated results before concealing the lines. Confirm inspection and release with the authority responsible for the work.";
