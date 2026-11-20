import assert from "node:assert/strict";
import test from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { blank, part, projectSchema } from "../src/model";
import { reviewProjectCode, saveProjectCode } from "../src/projectCode";
import { blankDryerExhaust } from "../src/dryerExhaustSchema";
import {
  blankProjectCode,
  type ProjectCodeContext,
} from "../src/projectCodeSchema";

const confirmed = () => ({
  ...blankProjectCode(),
  region: "utah" as const,
  projectDate: "2026-11-19",
  buildingAuthority: "Test building authority",
  authorityBasis: "Simulated confirmation for test case",
  codePath: "irc" as const,
  work: "existing" as const,
  trades: [
    "building",
    "plumbing",
    "electrical",
    "sprinklers",
    "irrigation",
  ] as const,
});
const vent = (
  projection: number | null,
  elbow: "down" | "other" | "unknown" = "down",
) => ({
  inScope: "yes" as const,
  projection,
  elbow,
});
const inputs = (): ProjectCodeContext => {
  const base = confirmed();
  return { ...base, trades: [...base.trades], wallVent: vent(12) };
};
const reviewRow = (review: ReturnType<typeof reviewProjectCode>, id: string) =>
  review.rows.find((row) => row.id === id);

test("shopping ZIP does not resolve the code jurisdiction and the reviewed versions have explicit dates", () => {
  const existing = blank();
  assert.equal(existing.zip, "84121");
  assert.equal(existing.projectCode, undefined);
  assert.equal(reviewProjectCode(blankProjectCode()).version, null);
  assert.equal(
    reviewProjectCode({ ...inputs(), region: "other" }).version,
    null,
  );

  for (const [projectDate, expected] of [
    ["2026-06-30", undefined],
    ["2026-07-01", "2026-07-01"],
    ["2026-12-31", "2026-07-01"],
    ["2027-01-01", "2027-01-01"],
  ] as const) {
    const review = reviewProjectCode({ ...inputs(), projectDate });
    assert.equal(review.version?.effectiveFrom, expected);
  }
  const future = reviewProjectCode({ ...inputs(), projectDate: "2027-01-01" });
  assert.match(reviewRow(future, "wildland-interface")!.detail, /2024/);
  assert.equal(reviewRow(future, "utah-wall-vent")!.state, "authority-review");
});

test("Utah vent comparison requires scope and compares both submitted measurements", () => {
  const check = (changes: Partial<ReturnType<typeof inputs>>) =>
    reviewRow(reviewProjectCode({ ...inputs(), ...changes }), "utah-wall-vent");
  assert.equal(check({ buildingAuthority: "" })?.state, "authority-review");
  assert.equal(check({ authorityBasis: "" })?.state, "authority-review");
  assert.equal(check({ codePath: "unknown" })?.state, "authority-review");
  assert.equal(check({ wallVent: { ...vent(0), inScope: "no" } }), undefined);
  assert.equal(check({ wallVent: vent(null) })?.state, "needs-input");
  assert.equal(check({ wallVent: vent(0, "unknown") })?.state, "discrepancy");

  const tooShort = check({ wallVent: vent(11.875, "other") })!;
  assert.equal(tooShort.state, "discrepancy");
  assert.match(tooShort.detail, /short of 12 in.*downward/);
  assert.match(tooShort.sources![0].title, /P3101\.4/);
  const exact = check({ codePath: "ibc", wallVent: vent(12) })!;
  assert.equal(exact.state, "measured-match");
  assert.match(exact.sources![0].title, /IPC 903\.7/);
  assert.equal(check({ wallVent: vent(11.999) })?.state, "discrepancy");
  const refs = reviewProjectCode(inputs());
  assert.match(reviewRow(refs, "trade-electrical")!.detail, /2021 IRC/);
  assert.ok(reviewRow(refs, "fire-authority"));
  assert.equal(reviewRow(refs, "trade-irrigation")!.state, "needs-input");
});

test("saved code facts flag concerns in checks and export without changing a migrated project's parts or shopping settings", () => {
  const base = blank();
  base.pieces = [
    part(
      "Panel",
      "plywood",
      [20, 0.75, 20],
      [0, 1, 0],
      base.steps[0].id,
      "Casework",
    ),
  ];
  const old = projectSchema.parse({
    ...generateBuildGuide(base),
    schemaVersion: 18,
  });
  assert.equal(old.projectCode, undefined);
  const context = {
    ...inputs(),
    siteReference: "Fixture [x]\nSecond line",
    wallVent: vent(11),
  };
  const saved = projectSchema.parse(
    JSON.parse(JSON.stringify(saveProjectCode(old, context))),
  );
  assert.equal(saved.zip, old.zip);
  assert.equal(saved.retailer, old.retailer);
  assert.deepEqual(saved.pieces, old.pieces);
  assert.deepEqual(saved.projectCode, context);
  assert.equal(guideIsCurrent(saved), false);
  assert.match(guideMarkdown(saved), /Fixture \\\[x\\\] Second line/);
  assert.match(guideMarkdown(saved), /le\.utah\.gov\/xcode\/Title15A/);
  assert.ok(
    validate(saved).some((item) => item.id === "project-code-utah-wall-vent"),
  );
  const corrected = saveProjectCode(saved, { ...context, wallVent: vent(12) });
  assert.ok(
    !validate(corrected).some(
      (item) => item.id === "project-code-utah-wall-vent",
    ),
  );
  assert.equal(
    projectSchema.safeParse({
      ...saved,
      projectCode: { ...context, approved: true },
    }).success,
    false,
  );
});

test("geometry is the single source for vent projection in every direction, while legacy manual facts stay distinct", () => {
  const cases = [
    ["+X", [14, 120, 3], 2],
    ["-X", [-14, 120, 3], -2],
    ["+Z", [3, 120, 14], 2],
    ["-Z", [3, 120, -14], -2],
  ] as const;
  for (const [exteriorSide, terminal, wallCoordinate] of cases) {
    const context: ProjectCodeContext = {
      ...inputs(),
      wallVent: {
        ...vent(1),
        layout: {
          exteriorSide,
          terminal: [...terminal],
          wallCoordinate,
          gradePoint: null,
          lotLine: null,
          openingProtected: "unknown",
          underVentedOverhang: "unknown",
        },
      },
    };
    const actual = reviewRow(reviewProjectCode(context), "utah-wall-vent")!;
    assert.equal(actual.state, "measured-match");
    assert.match(actual.detail, /Measured layout gives 1 ft/);
    const layout = context.wallVent.layout!;
    const wrongSide = {
      ...context,
      wallVent: {
        ...context.wallVent,
        layout: {
          ...layout,
          exteriorSide:
            (exteriorSide.startsWith("+") ? "-" : "+") + exteriorSide.slice(1),
        },
      },
    };
    const parsed = saveProjectCode(blank(), wrongSide);
    assert.match(
      reviewRow(reviewProjectCode(parsed.projectCode!), "utah-wall-vent")!
        .detail,
      /inside the exterior wall datum/,
    );
  }
});

const ipcLayout = (): NonNullable<
  ProjectCodeContext["wallVent"]["layout"]
> => ({
  exteriorSide: "+Z",
  wallCoordinate: 0,
  terminal: [2, 120, 12],
  // A nearest endpoint 120 in away: the supporting infinite line would be 0 in away.
  lotLine: [
    [122, 12],
    [140, 12],
  ],
  gradePoint: [122, 0, 12],
  openingProtected: "yes",
  underVentedOverhang: "no",
});
const ipcContext = (
  layout: ReturnType<typeof ipcLayout>,
): ProjectCodeContext => ({
  ...inputs(),
  codePath: "ibc",
  wallVent: { ...vent(null), layout },
});

test("IPC sidewall checks use finite lot segments and the entered highest grade only inside the review radius", () => {
  const layout = ipcLayout();
  const ready = reviewProjectCode(ipcContext(layout));
  assert.equal(reviewRow(ready, "ipc-sidewall-lot")?.state, "measured-match");
  assert.equal(reviewRow(ready, "ipc-sidewall-grade")?.state, "measured-match");
  assert.equal(
    reviewRow(ready, "ipc-sidewall-soffit")?.state,
    "recorded-condition",
  );
  assert.equal(
    reviewRow(ready, "ipc-sidewall-opening")?.state,
    "recorded-condition",
  );
  assert.match(reviewRow(ready, "ipc-sidewall-lot")!.detail, /10 ft measured/);
  const inside = reviewProjectCode(
    ipcContext({
      ...layout,
      terminal: [3, 119.999, 12],
      openingProtected: "no",
      underVentedOverhang: "yes",
    }),
  );
  for (const id of ["lot", "grade", "soffit", "opening"])
    assert.equal(reviewRow(inside, `ipc-sidewall-${id}`)?.state, "discrepancy");
  const out = reviewProjectCode(
    ipcContext({ ...layout, gradePoint: [122.001, 0, 12] }),
  );
  assert.match(
    reviewRow(out, "ipc-sidewall-grade")!.detail,
    /outside the 10 ft/,
  );
  assert.equal(reviewRow(out, "ipc-sidewall-grade")!.state, "needs-input");
  assert.throws(
    () =>
      saveProjectCode(
        blank(),
        ipcContext({
          ...layout,
          lotLine: [
            [0, 0],
            [0, 0],
          ],
        }),
      ),
    /different points/,
  );
});

test("geometry is retained through JSON and the guide while unknown, out-of-date and other jurisdictions avoid numerical code findings", () => {
  const layout = ipcLayout();
  const context = ipcContext({
    ...layout,
    terminal: [2, 108, 10],
    gradePoint: [120, 0, 10],
  });
  const saved = saveProjectCode(generateBuildGuide(blank()), context);
  const raw = JSON.stringify(saved);
  assert.deepEqual(projectSchema.parse(JSON.parse(raw)).projectCode, context);
  assert.equal(guideIsCurrent(saved), false);
  assert.match(guideMarkdown(saved), /Exterior wall datum · \+Z at 0 in/);
  assert.match(
    guideMarkdown(saved),
    /Sidewall vent above highest adjacent grade · Difference to review/,
  );
  assert.match(guideMarkdown(saved), /IPC2024V2\.0\/chapter-9-vents/);
  assert.ok(
    validate(saved).some((row) => row.id === "project-code-ipc-sidewall-grade"),
  );
  const classic = { ...context, wallVent: vent(12) };
  const legacy = projectSchema.parse({
    ...saved,
    schemaVersion: 44,
    projectCode: classic,
  });
  assert.deepEqual(legacy.projectCode, classic);
  const noDate = reviewProjectCode({ ...context, projectDate: null });
  const noAuthority = reviewProjectCode({ ...context, buildingAuthority: "" });
  const beyond = reviewProjectCode({ ...context, projectDate: "2027-01-01" });
  const otherRegion = reviewProjectCode({ ...context, region: "other" });
  assert.equal(reviewRow(noDate, "ipc-sidewall-grade"), undefined);
  assert.equal(reviewRow(otherRegion, "ipc-sidewall-grade"), undefined);
  assert.equal(
    reviewRow(noAuthority, "ipc-sidewall-scope")!.state,
    "authority-review",
  );
  assert.equal(
    reviewRow(beyond, "ipc-sidewall-scope")!.state,
    "authority-review",
  );
  assert.equal(
    reviewRow(
      reviewProjectCode({ ...context, codePath: "irc" }),
      "ipc-sidewall-grade",
    ),
    undefined,
  );
});

const dryerContext = (): ProjectCodeContext => ({
  ...inputs(),
  projectDate: "2026-11-20",
  trades: ["hvac"],
  dryerExhaust: {
    ...blankDryerExhaust(),
    appliance: "ducted",
    lengthMethod: "specified",
    runLength: 360,
    fittingCounts: { "mitered-4-90": 1 },
    fittingsAccountedFor: true,
    transitionLength: 96,
    transitionConcealed: "no",
  },
});

test("Utah IRC dryer exhaust counts fitting equivalent length and checks the separate connector", () => {
  const context = dryerContext(),
    plan = context.dryerExhaust!;
  const exact = reviewProjectCode(context);
  const length = reviewRow(exact, "dryer-exhaust-length")!;
  assert.equal(length.state, "measured-match");
  assert.match(
    length.detail,
    /35 ft \(30 ft run plus 5 ft for fittings\).*At the reference limit/,
  );
  assert.deepEqual(
    length.sources?.map(({ url }) => url),
    [
      "https://codes.iccsafe.org/content/IRC2021P3/chapter-15-exhaust-systems",
      "https://le.utah.gov/xcode/Title15A/Chapter3/C15A-3-S203_2026050620260701.pdf",
      "https://le.utah.gov/xcode/Title15A/Chapter4/C15A-4_1800010118000101.pdf",
    ],
  );
  assert.equal(
    reviewRow(exact, "dryer-transition-length")!.state,
    "measured-match",
  );
  assert.equal(
    reviewRow(exact, "dryer-transition-concealment")!.state,
    "recorded-condition",
  );

  const initial = generateBuildGuide(blank());
  const saved = saveProjectCode(initial, {
    ...context,
    dryerExhaust: {
      ...plan,
      runLength: 366,
      transitionLength: 97,
      transitionConcealed: "yes",
    },
  });
  const findings = validate(saved).filter(({ id }) =>
    id.startsWith("project-code-dryer-"),
  );
  assert.equal(findings.length, 3);
  assert.match(findings[0].detail, /6 in above the reference/);
  assert.match(
    guideMarkdown(saved),
    /Entered fittings · 1 × Mitered 90° · 4 in radius/,
  );
  assert.match(
    guideMarkdown(saved),
    /Dryer transition connector location · Difference to review/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(saved))).projectCode,
    saved.projectCode,
  );
  assert.deepEqual(saved.pieces, initial.pieces);
  assert.deepEqual(saved.inventory, initial.inventory);
  assert.equal(saved.zip, initial.zip);
  assert.equal(
    projectSchema.parse({ ...initial, schemaVersion: 51 }).projectCode,
    undefined,
  );
});

test("dryer scope withholds the table for unmatched dates, jurisdictions, and appliance methods", () => {
  const context = dryerContext(),
    plan = context.dryerExhaust!;
  for (const patch of [
    { projectDate: "2026-06-30" },
    { projectDate: "2026-11-21" },
    { projectDate: "2027-01-01" },
    { projectDate: null },
    { region: "other" },
    { authorityBasis: "" },
    { codePath: "ibc" },
    { trades: ["roofing"] },
  ] as Partial<ProjectCodeContext>[]) {
    const review = reviewProjectCode({ ...context, ...patch });
    assert.equal(reviewRow(review, "dryer-exhaust-length"), undefined);
    assert.equal(reviewRow(review, "dryer-transition-length"), undefined);
  }
  for (const lengthMethod of ["manufacturer", "power-ventilator"] as const) {
    const review = reviewProjectCode({
      ...context,
      dryerExhaust: { ...plan, lengthMethod },
    });
    assert.equal(
      reviewRow(review, "dryer-exhaust-length")!.state,
      "authority-review",
    );
    assert.doesNotMatch(
      reviewRow(review, "dryer-exhaust-length")!.detail,
      /35 ft/,
    );
  }
  const unknownFittings = reviewProjectCode({
    ...context,
    dryerExhaust: { ...plan, fittingsAccountedFor: false },
  });
  assert.equal(
    reviewRow(unknownFittings, "dryer-exhaust-length")!.state,
    "needs-input",
  );
  const ductless = reviewProjectCode({
    ...context,
    dryerExhaust: { ...plan, appliance: "ductless" },
  });
  assert.equal(
    reviewRow(ductless, "dryer-exhaust-scope")!.state,
    "authority-review",
  );
  assert.equal(reviewRow(ductless, "dryer-exhaust-length"), undefined);
  const noFittings = reviewProjectCode({
    ...context,
    dryerExhaust: { ...plan, runLength: 420, fittingCounts: {} },
  });
  assert.match(
    reviewRow(noFittings, "dryer-exhaust-length")!.detail,
    /35 ft run plus 0 in for fittings/,
  );
});
