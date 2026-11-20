import { formatStockLength } from "./measurement";
import { dryerDuctLayoutRows } from "./dryerDuctLayout";
import {
  shingleRoofCodeRows,
  shingleRoofGuideLines,
  utahShingleReviewDate,
} from "./shingleRoof";
import {
  dryerExhaustGuideLines,
  dryerExhaustRows,
  utahDryerReviewDate,
} from "./dryerExhaust";
import {
  IPC_SIDEWALL_DISTANCE,
  ventLayoutGuideLines,
  ventLayoutMeasurements,
} from "./plumbingVentLayout";
import type { Project } from "./model";
import {
  projectCodeSchema,
  tradeNames,
  type ProjectCodeContext,
  type ProjectCodeTrade,
} from "./projectCodeSchema";
import {
  utahAdoptionVersions,
  utahSources,
  utahSourceReviewDate,
  type CodeSource,
} from "./utahCodeSources";

export type CodeReviewRow = {
  id: string;
  label: string;
  state:
    | "reference"
    | "needs-input"
    | "authority-review"
    | "measured-match"
    | "recorded-condition"
    | "discrepancy";
  detail: string;
  sources?: readonly CodeSource[];
};

/** Repeated references apply to adjacent checks in the same source group. */
export function codeRowSourcesForDisplay(
  rows: readonly CodeReviewRow[],
  index: number,
) {
  const links = rows[index]?.sources ?? [];
  const previous = rows[index - 1]?.sources;
  return previous?.length === links.length &&
    links.every(
      (link, i) =>
        link.title === previous[i].title && link.url === previous[i].url,
    )
    ? []
    : links;
}

export const codeRowLabels: Record<CodeReviewRow["state"], string> = {
  reference: "Reference",
  "needs-input": "Input needed",
  "authority-review": "Confirm with authority",
  "measured-match": "Entered measurement matches this check",
  "recorded-condition": "Recorded condition matches this check",
  discrepancy: "Difference to review",
};

export function saveProjectCode(project: Project, input: unknown): Project {
  return { ...project, projectCode: projectCodeSchema.parse(input) };
}

function versionAt(date: string) {
  return utahAdoptionVersions.find(
    (entry) =>
      date >= entry.effectiveFrom &&
      (!entry.effectiveUntil || date < entry.effectiveUntil),
  );
}

function rowsForTrade(
  trade: ProjectCodeTrade,
  context: ProjectCodeContext,
): CodeReviewRow[] {
  const s = utahSources;
  const path = context.codePath;
  const building =
    path === "irc"
      ? "2021 IRC"
      : path === "ibc"
        ? "2024 IBC"
        : "2021 IRC / 2024 IBC";
  const amendments =
    path === "irc" ? [s.irc] : path === "ibc" ? [s.ibc] : [s.irc, s.ibc];
  const row = (
    detail: string,
    sources: CodeSource[],
    state: CodeReviewRow["state"] = "reference",
  ): CodeReviewRow => ({
    id: `trade-${trade}`,
    label: tradeNames[trade],
    state,
    detail,
    sources,
  });
  switch (trade) {
    case "building":
      return [
        row(
          `${building}. ${context.work === "existing" ? "The 2024 IEBC is also listed. Confirm the selected repair or alteration path." : "Confirm scope, local amendments and the actual permit requirements."}`,
          [...amendments, s.local],
        ),
      ];
    case "roofing":
      return [
        row(
          `${building}. Verify local design loads, roof assembly and site conditions for the intended use.`,
          [...amendments, s.local],
        ),
      ];
    case "plumbing":
      return [
        row(
          path === "irc"
            ? "2021 IRC plumbing provisions and Utah amendments. The state also lists the 2024 IPC."
            : "2024 IPC. Confirm any residential scope under the 2021 IRC.",
          path === "irc" ? [s.irc, s.ipc] : [s.ipc, s.irc],
        ),
      ];
    case "electrical":
      return [
        row(
          path === "irc"
            ? "Review the 2021 IRC residential electrical provisions for installations under the IRC."
            : path === "ibc"
              ? "Review the 2023 NEC and Utah amendments for installations outside the IRC path."
              : "Confirm the installation path with the building authority. Utah distinguishes IRC residential installations from installations under the adopted NEC.",
          path === "irc" ? [s.electricalScope, s.irc] : [s.electricalScope],
          path === "unknown" ? "authority-review" : "reference",
        ),
      ];
    case "hvac":
      return [
        row(
          "2024 IMC and 2024 IFGC are listed. Confirm residential applicability and selected equipment documentation.",
          [s.hvac, s.fuelGas, s.irc],
        ),
      ];
    case "irrigation":
      return [
        row(
          context.irrigationSupply === "dual"
            ? "Potable water backup for a secondary irrigation system calls for a cross-connection and backflow review with the water authority."
            : context.irrigationSupply === "graywater"
              ? "Confirm the subsurface graywater pathway with the water and health authorities."
              : "Confirm the water source and the applicable backflow protection with the water authority.",
          [s.irc, s.ipc],
          context.irrigationSupply === "unknown"
            ? "needs-input"
            : "authority-review",
        ),
      ];
    case "sprinklers":
      return [
        row(
          context.fireSystem === "unknown"
            ? "2024 IFC excluding appendices. The state sprinkler amendment cites 2022 NFPA 13, 13D, and 13R. Confirm the applicable system with the fire authority."
            : `2024 IFC excluding appendices. Review the 2022 ${context.fireSystem.replace("-", " ").toUpperCase()} reference and Utah amendments with the fire authority.`,
          [s.fire, s.fireAmendments, s.sprinklers],
          "authority-review",
        ),
      ];
    case "pool":
      return [
        row(
          "The 2024 ISPSC residential provisions are listed. Confirm barrier, site and project scope with the local authority.",
          [s.local],
          "authority-review",
        ),
      ];
  }
}

function wallVentCheck(
  context: ProjectCodeContext,
  usableScope: boolean,
): CodeReviewRow | null {
  if (!context.trades.includes("plumbing") || context.wallVent.inScope === "no")
    return null;
  const { inScope, layout, elbow } = context.wallVent;
  const measured = layout ? ventLayoutMeasurements(layout) : null;
  const projection = measured?.projection ?? context.wallVent.projection;
  const sources =
    context.codePath === "irc"
      ? [utahSources.wallVentIrc]
      : context.codePath === "ibc"
        ? [utahSources.wallVentIpc]
        : [utahSources.wallVentIrc, utahSources.wallVentIpc];
  const base = {
    id: "utah-wall-vent",
    label: "Through-wall plumbing vent termination",
    sources,
  };
  if (!usableScope)
    return {
      ...base,
      state: "authority-review",
      detail:
        "Confirm the code path, authority and a date covered by the reviewed sources before comparing the termination.",
    };
  if (inScope === "unknown")
    return {
      ...base,
      state: "needs-input",
      detail:
        "Record whether the plumbing scope includes a vent that terminates through a wall.",
    };
  const differences = [
    ...(projection !== null && projection <= 0 && measured
      ? ["The recorded terminal is on or inside the exterior wall datum."]
      : projection !== null && projection < 12
        ? [
            `The entered ${formatStockLength(projection)} is short of 12 in from the wall.`,
          ]
        : []),
    ...(elbow === "other"
      ? ["The entered elbow direction is not downward."]
      : []),
  ];
  if (differences.length)
    return {
      ...base,
      state: "discrepancy",
      detail:
        differences.join(" ") +
        " Confirm the termination and other separations with the authority.",
    };
  if (projection === null || elbow === "unknown")
    return {
      ...base,
      state: "needs-input",
      detail:
        "Enter the distance from the exterior wall and the direction of the termination elbow.",
    };
  return {
    ...base,
    state: "measured-match",
    detail: `${measured ? "Measured layout gives" : "Entered"} ${formatStockLength(projection)} from the wall. This distance and the recorded downward elbow match these two amendment values. Confirm other termination separations with the authority.`,
  };
}

function ipcSidewallRows(
  context: ProjectCodeContext,
  usableScope: boolean,
): CodeReviewRow[] {
  const { layout, inScope } = context.wallVent;
  if (
    !layout ||
    inScope !== "yes" ||
    context.codePath !== "ibc" ||
    !context.trades.includes("plumbing")
  )
    return [];
  const sources = [utahSources.ipcSidewall, utahSources.ipc];
  const row = (
    id: string,
    label: string,
    state: CodeReviewRow["state"],
    detail: string,
  ): CodeReviewRow => ({
    id: `ipc-sidewall-${id}`,
    label,
    state,
    detail,
    sources,
  });
  const geometry = ventLayoutMeasurements(layout);
  if (!usableScope || geometry.projection <= 0)
    return [
      row(
        "scope",
        "IPC sidewall site checks",
        "authority-review",
        usableScope
          ? "Place the terminal outside the exterior wall datum before comparing the sidewall site conditions."
          : "Confirm the applicable edition, authority and work scope before comparing the site conditions.",
      ),
    ];
  function distance(
    id: string,
    label: string,
    value: number | null,
    pending: string,
  ) {
    if (value === null) return row(id, label, "needs-input", pending);
    const short = value + 1e-7 < IPC_SIDEWALL_DISTANCE;
    return row(
      id,
      label,
      short ? "discrepancy" : "measured-match",
      `${formatStockLength(value)} measured. ${short ? "Short of" : "Meets"} the 10 ft minimum for this recorded comparison.`,
    );
  }
  function condition(
    id: string,
    label: string,
    value: "unknown" | "yes" | "no",
    passes: "yes" | "no",
    pending: string,
    match: string,
    conflict: string,
  ) {
    if (value === "unknown") return row(id, label, "needs-input", pending);
    return row(
      id,
      label,
      value === passes ? "recorded-condition" : "discrepancy",
      value === passes ? match : conflict,
    );
  }
  return [
    distance(
      "lot",
      "Sidewall vent to measured lot line",
      geometry.lotDistance,
      "Enter the two plan points of the nearest surveyed lot-line segment.",
    ),
    distance(
      "grade",
      "Sidewall vent above highest adjacent grade",
      geometry.gradeRise,
      layout.gradePoint
        ? "The recorded grade point is outside the 10 ft horizontal search area. Record the highest adjacent grade within that area."
        : "Record the highest adjacent grade within 10 ft horizontally of the terminal.",
    ),
    condition(
      "soffit",
      "Overhang with soffit vents",
      layout.underVentedOverhang,
      "no",
      "Confirm whether the termination lies under an overhang with soffit vents.",
      "The recorded terminal is clear of an overhang with soffit vents.",
      "The recorded terminal is under an overhang with soffit vents. Review its location.",
    ),
    condition(
      "opening",
      "Terminal opening protection",
      layout.openingProtected,
      "yes",
      "Confirm the terminal is protected from birds and rodents entering or blocking the opening.",
      "Opening protection from birds and rodents is recorded. Confirm the actual detail.",
      "Terminal opening protection from birds and rodents is missing.",
    ),
  ];
}

export function reviewProjectCode(
  context: ProjectCodeContext,
  project: Pick<Project, "pieces" | "supplies"> & Partial<Pick<Project, "partLabels">> = { pieces: [], supplies: [] },
) {
  const rows: CodeReviewRow[] = [];
  if (context.trades.includes("hvac") && context.dryerExhaust?.appliance === "ducted" && context.dryerExhaust.layout)
    rows.push(...dryerDuctLayoutRows(project, context.dryerExhaust.layout));
  const ask = (
    id: string,
    label: string,
    detail: string,
    state: CodeReviewRow["state"] = "needs-input",
  ) => rows.push({ id, label, state, detail });
  if (context.region !== "utah") {
    ask(
      "region",
      "Project jurisdiction",
      context.region === "other"
        ? "Use sources from the actual jurisdiction. The reviewed reference pack currently covers Utah."
        : "Select the build jurisdiction separately from the shopping ZIP.",
    );
    return { version: null, rows };
  }
  if (!context.projectDate)
    ask(
      "date",
      "Project or permit date",
      "Enter the date used for the local review.",
    );
  if (!context.buildingAuthority || !context.authorityBasis)
    ask(
      "authority",
      "Building authority",
      "Record the building authority and how you confirmed it for the site.",
    );
  if (!context.fireAuthority && context.trades.includes("sprinklers"))
    ask(
      "fire-authority",
      "Fire authority",
      "Confirm the responsible fire authority for the sprinkler scope.",
    );
  if (context.codePath === "unknown")
    ask(
      "path",
      "Applicable building code",
      "Confirm the IRC or IBC path with the building authority.",
    );
  if (context.work === "unknown" || !context.trades.length)
    ask(
      "scope",
      "Work scope",
      "Record whether the work is new or existing and select the affected work areas.",
    );
  if (!context.permitNotes)
    ask(
      "permit",
      "Permit or exemption",
      "Record the local permit determination and conditions.",
      "authority-review",
    );
  if (!context.projectDate) return { version: null, rows };
  const version = versionAt(context.projectDate);
  if (!version) {
    ask(
      "unreviewed-date",
      "Adoption date outside reviewed sources",
      "Obtain the statutory version for this earlier project date.",
      "authority-review",
    );
    return { version: null, rows };
  }
  const beyondReview = context.projectDate > utahSourceReviewDate;
  rows.push({
    id: "utah-adoption",
    label: "Utah construction adoption",
    state: beyondReview ? "authority-review" : "reference",
    detail: `Statutory version effective ${version.effectiveFrom}${version.effectiveUntil ? ` through the day before ${version.effectiveUntil}` : ""}. ${
      beyondReview
        ? `The general source review was ${utahSourceReviewDate}. Check the review period for each comparison and confirm intervening changes.`
        : "Confirm the local amendments and applicability for the site."
    }`,
    sources: [version.source, utahSources.local],
  });
  if (
    context.trades.some((trade) => trade === "building" || trade === "roofing")
  )
    rows.push({
      id: "wildland-interface",
      label: "Wildland interface reference",
      state: "authority-review",
      detail: `${version.wildland}. Confirm site applicability.`,
      sources: [version.source],
    });
  rows.push(...context.trades.flatMap((trade) => rowsForTrade(trade, context)));
  const confirmed = !!(
    context.buildingAuthority &&
    context.authorityBasis &&
    context.codePath !== "unknown" &&
    context.work !== "unknown"
  );
  const scope = confirmed && !beyondReview;
  const vent = wallVentCheck(context, scope);
  if (vent) rows.push(vent);
  rows.push(...ipcSidewallRows(context, scope));
  if (context.trades.includes("hvac") && context.dryerExhaust)
    rows.push(
      ...dryerExhaustRows(
        context.dryerExhaust,
        confirmed &&
          context.codePath === "irc" &&
          version.id === "utah-construction-2026-07-01" &&
          context.projectDate <= utahDryerReviewDate,
      ),
    );
  if (context.trades.includes("roofing") && context.shingleRoof)
    rows.push(
      ...shingleRoofCodeRows(
        project,
        context.shingleRoof,
        confirmed &&
          context.codePath === "irc" &&
          version.id === "utah-construction-2026-07-01" &&
          context.projectDate <= utahShingleReviewDate,
      ),
    );
  return { version, rows };
}

export function projectCodeMarkdown(project: Project) {
  const context = project.projectCode;
  if (!context) return "";
  const review = reviewProjectCode(context, project);
  const clean = (value: string) =>
    value.replace(/[\r\n]/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
  const evidence = [
    ...(context.projectDate
      ? [`Project or permit date · ${context.projectDate}`]
      : []),
    ...(context.siteReference
      ? [`Site reference · ${context.siteReference}`]
      : []),
    ...(context.buildingAuthority
      ? [`Recorded building authority · ${context.buildingAuthority}`]
      : []),
    ...(context.fireAuthority
      ? [`Recorded fire authority · ${context.fireAuthority}`]
      : []),
    ...(context.authorityBasis
      ? [`Authority notes · ${context.authorityBasis}`]
      : []),
    ...(context.permitNotes ? [`Permit notes · ${context.permitNotes}`] : []),
    ...(context.trades.includes("plumbing") &&
    context.wallVent.inScope === "yes" &&
    context.wallVent.layout
      ? ventLayoutGuideLines(context.wallVent.layout)
      : []),
    ...(context.trades.includes("hvac") && context.dryerExhaust
      ? dryerExhaustGuideLines(context.dryerExhaust)
      : []),
    ...shingleRoofGuideLines(project),
  ];
  return [
    "",
    "",
    "## Project code references",
    "",
    "Verify applicable rules and measurements with the local authority and relevant trades.",
    "",
    ...evidence.map((line) => `- ${clean(line)}`),
    ...review.rows.flatMap((row, index) => [
      `- ${clean(row.label)} · ${codeRowLabels[row.state]} · ${clean(row.detail)}`,
      ...codeRowSourcesForDisplay(review.rows, index).map(
        (item) => `  - [${clean(item.title)}](${item.url})`,
      ),
    ]),
  ].join("\n");
}
