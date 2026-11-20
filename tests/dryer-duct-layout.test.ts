import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema, type Project } from "../src/model";
import { reviewDryerDuctLayout } from "../src/dryerDuctLayout";
import {
  blankDryerExhaust,
  dryerDuctLayoutSchema,
} from "../src/dryerExhaustSchema";
import {
  projectCodeMarkdown,
  reviewProjectCode,
  saveProjectCode,
} from "../src/projectCode";
import { blankProjectCode } from "../src/projectCodeSchema";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";

const layout = dryerDuctLayoutSchema.parse({
  envelopeWidth: 4,
  runs: [
    { start: [0, 12, 0], end: [0, 12, 36] },
    { start: [12, 12, 36], end: [12, 15, 40] },
  ],
});

test("duct envelopes check retained solids and openings in the actual workspace", () => {
  const project = blank();
  const wall = part(
    "Utility chase wall",
    "plywood",
    [16, 16, 0.75],
    [0, 12, 18],
    project.steps[0].id,
    "Utility",
  );
  const blocked = { ...project, pieces: [wall] };
  const first = reviewDryerDuctLayout(blocked, layout);
  assert.deepEqual(
    first.map(({ length }) => length),
    [36, 5],
  );
  assert.deepEqual(
    first[0].hits.map(({ id }) => id),
    [wall.id],
  );
  assert.equal(first[1].hits.length, 0);
  const opened: Project = {
    ...project,
    pieces: [
      {
        ...wall,
        rectangularOpenings: [{ axis: 2, center: [0, 0], spans: [6, 6] }],
      },
    ],
  };
  assert.equal(reviewDryerDuctLayout(opened, layout)[0].hits.length, 0);
  assert.equal(
    reviewDryerDuctLayout(opened, { ...layout, envelopeWidth: 8 })[0].hits
      .length,
    1,
  );
  assert.equal(
    reviewDryerDuctLayout(
      { ...project, pieces: [{ ...wall, offcut: true }] },
      layout,
    )[0].hits.length,
    0,
  );
  assert.equal(
    dryerDuctLayoutSchema.safeParse({
      ...layout,
      runs: [{ start: [0, 0, 0], end: [0, 0, 0] }],
    }).success,
    false,
  );
});

test("the saved layout feeds the guide and leaves the versioned code length input independent", () => {
  const base = blank();
  const context = {
    ...blankProjectCode(),
    region: "utah" as const,
    projectDate: "2026-11-20",
    codePath: "irc" as const,
    work: "existing" as const,
    buildingAuthority: "Synthetic building authority",
    authorityBasis: "Synthetic project-code QA",
    trades: ["hvac" as const],
    dryerExhaust: {
      ...blankDryerExhaust(),
      appliance: "ducted" as const,
      lengthMethod: "specified" as const,
      runLength: 420,
      fittingsAccountedFor: true,
      layout,
    },
  };
  const project = saveProjectCode(base, context);
  const review = reviewProjectCode(context, project);
  assert.match(
    review.rows.find((row) => row.id === "dryer-duct-layout")!.detail,
    /41 in modeled/,
  );
  assert.match(
    review.rows.find((row) => row.id === "dryer-exhaust-length")!.detail,
    /35 ft run.*At the reference limit/,
  );
  assert.match(projectCodeMarkdown(project), /Dryer duct run 1.*3 ft/);
  const other = reviewProjectCode({ ...context, region: "other" }, project);
  assert.ok(other.rows.some((row) => row.id === "dryer-duct-run-1"));
  assert.ok(!other.rows.some((row) => row.id === "dryer-exhaust-length"));
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(project))),
    project,
  );
  const legacy = projectSchema.parse({
    ...base,
    schemaVersion: 75,
    projectCode: {
      ...context,
      dryerExhaust: { ...context.dryerExhaust, layout: undefined },
    },
  });
  assert.equal(legacy.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(legacy.projectCode?.dryerExhaust?.layout, undefined);
});
