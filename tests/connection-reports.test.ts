import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { blank, part, projectSchema } from "../src/model";
import { connectionCoverage } from "../src/connectionCoverage";
import {
  connectionCoverageMarkdown,
  connectionStageMarkdown,
  CONNECTION_REVIEW_SCOPE,
} from "../src/connectionGuide";
import { connectionCoverageCsv } from "../src/connectionCsv";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { connect } from "../src/engine";
import { designFingerprint } from "../src/guide";
import { createBuildStudy } from "../src/buildFixtures";
import { makeShelfPinPlan, saveShelfPinPlan } from "../src/attachments";
import {
  makeRestraintPlan,
  selectRestraintReceiver,
  addRestraintLocation,
  saveRestraintPlan,
} from "../src/restraints";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(value);
      value = "";
    } else if (c === "\n") {
      row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  assert.equal(quoted, false);
  assert.ok(rows.every((row) => row.length === rows[0].length));
  return rows
    .slice(1)
    .map((row) =>
      Object.fromEntries(rows[0].map((header, index) => [header, row[index]])),
    );
}
function pending() {
  let p = blank("Report fixture");
  p.pieces = [
    part(
      "Panel A",
      "plywood",
      [8, 8, 0.75],
      [0, 4, 0],
      p.steps[0].id,
      "Actual assembly",
    ),
    part(
      "Panel B",
      "plywood",
      [8, 8, 0.75],
      [0, 4, -0.75],
      p.steps[0].id,
      "Actual assembly",
    ),
  ];
  p = saveFastenerPlan(
    p,
    addFastenerLocation(makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id)),
  );
  return p;
}
async function actual() {
  return projectSchema.parse(JSON.parse(
    await readFile(
      new URL(
        "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ));
}

test("empty or hardware-only reports add no fabricated stages but CSV still states its review scope", () => {
  const p = blank();
  assert.equal(connectionCoverageMarkdown(p), "");
  assert.equal(connectionStageMarkdown(p, p.steps[0].id), "");
  const rows = parseCsv(connectionCoverageCsv(p));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Record type"], "summary");
  assert.equal(rows[0].Scope, CONNECTION_REVIEW_SCOPE);
  assert.match(rows[0]["Issues or review"], /^0 actual parts/);
  p.pieces = [
    part(
      "Loose screw",
      "screw",
      [0.18, 3, 0.18],
      [0, 2, 0],
      p.steps[0].id,
      "Hardware",
    ),
  ];
  assert.equal(connectionStageMarkdown(p, p.steps[0].id), "");
});

test("actual synthetic demo reports one grouped H001 plan and preserves both location labels, started H2/H3 and pending W1", async () => {
  const p = await actual(),
    coverage = connectionCoverage(p),
    md = connectionCoverageMarkdown(p, coverage),
    rows = parseCsv(connectionCoverageCsv(p, coverage));
  assert.equal(
    md.split("\n").filter((line) => line.startsWith("| H001 ·")).length,
    1,
  );
  assert.match(md, /2 geometry reviewed/);
  assert.ok(md.includes("H001/L001") && md.includes("H001/L002"));
  assert.match(md, /H002/);
  assert.match(md, /H003/);
  assert.match(md, /started \/ setup incomplete/);
  assert.ok(md.includes("W001/F001"));
  assert.match(md, /pending details/);
  assert.match(md, /39 have no current internal task intent/);
  const intents = rows.filter((row) => row["Record type"] === "intent");
  assert.equal(intents.length, 5);
  assert.equal(
    intents.filter((row) => row["Plan ID"] === p.lidHingePlans[0].id).length,
    2,
  );
  assert.equal(intents.filter((row) => row.State === "started").length, 2);
  assert.equal(
    intents.filter((row) => row.State === "geometry-reviewed").length,
    2,
  );
  assert.equal(intents.filter((row) => row.State === "pending").length, 1);
  assert.ok(intents.every((row) => row.Scope === CONNECTION_REVIEW_SCOPE));
  assert.deepEqual(
    new Set(intents.map((row) => row["Intent IDs"])),
    new Set(coverage.intents.map((row) => row.id)),
  );
});

test("a fixed hinge panel stays context across shell/lid stages rather than gaining carcass joinery credit", async () => {
  const p = await actual(),
    coverage = connectionCoverage(p),
    hinge = p.lidHingePlans[0],
    shell = coverage.stages.find((stage) =>
      stage.memberIds.includes(hinge.fixed.pieceId),
    )!,
    lid = coverage.stages.find((stage) =>
      stage.memberIds.includes(hinge.moving.pieceId),
    )!;
  assert.ok(shell.stepId && lid.stepId);
  const shellMd = connectionStageMarkdown(p, shell.stepId, coverage),
    lidMd = connectionStageMarkdown(p, lid.stepId, coverage);
  assert.ok(shellMd.includes("fixed P002 is context, not carcass joinery"));
  assert.ok(shellMd.includes("members outside this stage: P006, P014"));
  assert.ok(lidMd.includes("members outside this stage: P002"));
  assert.ok(shellMd.includes("3 have no current internal task intent"));
  assert.ok(lidMd.includes("0 have no current internal task intent"));
  assert.equal(
    connectionStageMarkdown(
      p,
      "00000000-0000-4000-8000-000000000000",
      coverage,
    ),
    "",
  );
  const preparation = p.steps.find(
    (step) =>
      step.generated?.kind === "lid-hinge-preparation" &&
      step.generated.planId === hinge.id,
  )!;
  assert.ok(
    connectionStageMarkdown(p, preparation.id, coverage).includes("H001/L002"),
  );
});

test("pin mounts remain contextual while all five carcass panels retain their own connection gaps", () => {
  let p = createBuildStudy("shelves").project;
  const entry = p.ideaBindings[0].entries[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.id, {
      shelfRoles: ["shelf-1", "shelf-2", "shelf-3"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  const coverage = connectionCoverage(p),
    md = connectionCoverageMarkdown(p, coverage),
    rows = parseCsv(connectionCoverageCsv(p, coverage));
  assert.match(md, /5 have no current internal task intent/);
  assert.match(md, /side mounts are context, not carcass joinery/);
  const pins = rows.filter((row) => row["Intent kind"] === "shelf-pin");
  assert.equal(pins.length, 12);
  assert.ok(
    pins.every(
      (row) =>
        row["Task part IDs"].split(" | ").length === 1 &&
        row["Context part IDs"].split(" | ").length === 1,
    ),
  );
  assert.equal(new Set(pins.map((row) => row["Context part IDs"])).size, 2);
  assert.equal(new Set(pins.map((row) => row["Task part IDs"])).size, 3);
});

test("legacy quantities and typed point records remain separate sources instead of becoming a physical purchase total", () => {
  let p = pending();
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    7,
    1.25,
    "screw",
    "screw-short",
  );
  const md = connectionCoverageMarkdown(p),
    rows = parseCsv(connectionCoverageCsv(p)),
    intents = rows.filter((row) => row["Record type"] === "intent"),
    legacy = intents.find((row) => row["Intent kind"] === "legacy-joint")!,
    wood = intents.find((row) => row["Intent kind"] === "wood-fastener")!;
  assert.equal(legacy["Explicit-location records"], "0");
  assert.equal(legacy["Legacy recorded quantity (unlocated)"], "7");
  assert.equal(legacy["Legacy record kind"], "screw");
  assert.equal(wood["Explicit-location records"], "1");
  assert.equal(wood["Legacy recorded quantity (unlocated)"], "");
  assert.ok(md.includes("separate legacy quantity 7 screw (unlocated)"));
  assert.match(md, /do not prove physical duplicates/);
  assert.deepEqual(p.supplies, []);
});

test("same named plans and shared products are not merged, while multiple rows of one plan are grouped once", () => {
  let p = pending(),
    first = addFastenerLocation(p.fastenerPlans[0]);
  first.name = "Same user plan";
  p = saveFastenerPlan(p, first);
  p = saveFastenerPlan(p, {
    ...makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id),
    name: "Same user plan",
  });
  const md = connectionCoverageMarkdown(p),
    rows = parseCsv(connectionCoverageCsv(p)).filter(
      (row) => row["Record type"] === "intent",
    );
  assert.equal(
    md.split("\n").filter((line) => line.startsWith("| W001 ·")).length,
    1,
  );
  assert.equal(
    md.split("\n").filter((line) => line.startsWith("| W002 ·")).length,
    1,
  );
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => row["Plan ID"])).size, 2);
  assert.equal(
    rows.reduce(
      (sum, row) => sum + Number(row["Explicit-location records"]),
      0,
    ),
    2,
  );
  assert.match(md, /2 pending details/);
});

test("mixed geometry-reviewed and conflicting W records retain individual states and exact source IDs", () => {
  let p = pending(),
    plan = addFastenerLocation(p.fastenerPlans[0]);
  plan.locations[0].entranceLocal = [0, 0, 0.375];
  plan.locations[0].driveLocal = [0, 0, -1];
  plan.locations[1].entranceLocal = [100, 0, 0.375];
  plan.locations[1].driveLocal = [0, 0, -1];
  plan.measurements = {
    surfaceToTipDepth: 1.1,
    pilotDiameter: 0.1,
    pilotDepth: 1.2,
    basis: "SYNTHETIC review fixture",
    measuredAt: "2026-11-16T18:00:00Z",
  };
  p = saveFastenerPlan(p, plan);
  const coverage = connectionCoverage(p),
    md = connectionCoverageMarkdown(p, coverage),
    rows = parseCsv(connectionCoverageCsv(p, coverage)).filter(
      (row) => row["Record type"] === "intent",
    );
  assert.match(md, /1 conflict, excluded; 1 geometry reviewed/);
  assert.equal(
    rows.find((row) => row["Location ID"] === plan.locations[0].id)?.[
      "Current internal intent"
    ],
    "yes (intent only)",
  );
  assert.equal(
    rows.find((row) => row["Location ID"] === plan.locations[1].id)?.[
      "Current internal intent"
    ],
    "no",
  );
  assert.ok(
    rows.every(
      (row) =>
        row["Plan ID"] === plan.id &&
        row["Actual part IDs"].includes(p.pieces[0].id) &&
        row["Actual part IDs"].includes(p.pieces[1].id),
    ),
  );
  assert.ok(
    !Object.keys(rows[0]).some((key) =>
      /entrance|pilot|tip|depth|axis|coordinate/i.test(key),
    ),
  );
});

test("stale missing members remain traceable and excluded instead of disappearing or using a same-name substitute", () => {
  const original = pending(),
    old = original.pieces[0],
    replacement = { ...old, id: crypto.randomUUID() },
    p = { ...original, pieces: [replacement, original.pieces[1]] },
    coverage = connectionCoverage(p),
    rows = parseCsv(connectionCoverageCsv(p, coverage)),
    intent = rows.find((row) => row["Record type"] === "intent")!;
  assert.equal(intent.State, "stale");
  assert.equal(intent["Current internal intent"], "no");
  assert.ok(intent["Actual part IDs"].includes(old.id));
  assert.ok(!intent["Actual part IDs"].includes(replacement.id));
  assert.match(intent["Actual part labels"], /missing\/offcut/);
  assert.ok(
    connectionCoverageMarkdown(p, coverage).includes("stale, excluded"),
  );
  assert.ok(
    rows.some(
      (row) => row["Record type"] === "gap" && row.State === "excluded-intent",
    ),
  );
});

test("external wall associations do not invent wall part IDs or export wall coordinates into this review ledger", () => {
  let p = pending();
  p.pieces[0] = { ...p.pieces[0], material: "one-four", size: [8, 3.5, 0.75] };
  let plan = addRestraintLocation(
    selectRestraintReceiver(p, makeRestraintPlan(p), p.pieces[0].id),
  );
  plan.locations[0].wallEyeWorld = [91.123456, 92.234567, 93.345678];
  p = saveRestraintPlan(p, plan);
  const coverage = connectionCoverage(p),
    md = connectionCoverageMarkdown(p, coverage),
    rows = parseCsv(connectionCoverageCsv(p, coverage)),
    external = rows.find((row) => row["Intent kind"] === "restraint")!;
  assert.match(md, /wall datum; no internal assembly credit/);
  assert.equal(
    external["Current internal intent"],
    "external association only",
  );
  assert.equal(external["Wall datum recorded"], "yes");
  assert.equal(external["External location ID"], plan.locations[0].id);
  assert.ok(external["Actual part IDs"].includes(p.pieces[0].id));
  assert.ok(!external["Actual part IDs"].includes("wall"));
  assert.ok(!JSON.stringify(rows).includes("91.123456"));
  assert.equal(
    rows
      .filter((row) => row["Record type"] === "intent-group")
      .flatMap((row) => row["Actual part IDs"].split(" | ")).length,
    2,
  );
});

test("CSV quotes multiline/formula text safely and Markdown escapes embedded table/HTML/link control text", () => {
  for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
    const p = pending();
    p.fastenerPlans[0].name = `${prefix}SUM(1,2)\n| [x](javascript:alert(1)) <script>"`;
    const csv = connectionCoverageCsv(p),
      row = parseCsv(csv).find((row) => row["Record type"] === "intent")!;
    assert.equal(row["Plan name"], `'${p.fastenerPlans[0].name}`);
    const md = connectionCoverageMarkdown(p);
    assert.ok(md.includes("\\| \\[x\\]"));
    assert.ok(md.includes("\\<script\\>"));
    assert.ok(!md.includes("| [x](javascript:"));
    assert.ok(csv.endsWith("\r\n"));
  }
});

test("precomputed review reports do not recalculate source plan reviews", () => {
  const p = pending(),
    coverage = connectionCoverage(p),
    proxy = new Proxy(p, {
      get(target, key, receiver) {
        if (
          [
            "fastenerPlans",
            "lidHingePlans",
            "attachmentPlans",
            "restraintPlans",
          ].includes(String(key))
        )
          throw Error("Report recomputed source reviews");
        return Reflect.get(target, key, receiver);
      },
    });
  assert.doesNotThrow(() => connectionCoverageMarkdown(proxy, coverage));
  assert.doesNotThrow(() =>
    connectionStageMarkdown(proxy, p.steps[0].id, coverage),
  );
  assert.doesNotThrow(() => connectionCoverageCsv(proxy, coverage));
});

test("actual oldformat6 fields, geometry, purchases, histories and physical guide fingerprint are unchanged by every report", async () => {
  const bytes = await readFile(
      new URL(
        "./fixtures/format6-remapped-storage.yardwork.json",
        import.meta.url,
      ),
    ),
    p = projectSchema.parse(JSON.parse(bytes.toString())),
    before = JSON.stringify(p),
    physical = designFingerprint(p),
    coverage = connectionCoverage(p);
  assert.ok(p.fastenerPlans.some((plan) => plan.referenceHistory.length));
  connectionCoverageMarkdown(p, coverage);
  connectionCoverageCsv(p, coverage);
  for (const step of p.steps) connectionStageMarkdown(p, step.id, coverage);
  assert.equal(JSON.stringify(p), before);
  assert.equal(designFingerprint(p), physical);
  assert.deepEqual(
    await readFile(
      new URL(
        "./fixtures/format6-remapped-storage.yardwork.json",
        import.meta.url,
      ),
    ),
    bytes,
  );
});

test("allfive actual public build reports retain actual stage/P-member gaps, rectangular CSV and intent-only group terminology", async () => {
  for (const name of [
    "storage-banquette",
    "shelves",
    "closet-insert",
    "greenhouse",
    "sauna",
  ]) {
    const p = projectSchema.parse(JSON.parse(
        await readFile(
          new URL(
            `../public/examples/builds/${name}.yardwork.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      )),
      before = JSON.stringify(p),
      coverage = connectionCoverage(p),
      md = connectionCoverageMarkdown(p, coverage),
      rows = parseCsv(connectionCoverageCsv(p, coverage));
    assert.match(md, /Reviews by assembly stage/);
    assert.match(md, /Intent groups/);
    assert.ok(md.includes("P001"));
    assert.ok(md.includes(`${p.pieces.length} actual part(s)`));
    assert.ok(rows.some((row) => row["Record type"] === "gap"));
    assert.ok(rows.every((row) => row.Scope === CONNECTION_REVIEW_SCOPE));
    assert.equal(JSON.stringify(p), before);
  }
});

test("shared pre-generation step IDs report every live semantic stage, while explicit owner/key metadata selects only its stage", () => {
  const p = createBuildStudy("storage-banquette").project,
    coverage = connectionCoverage(p),
    first = coverage.stages[0],
    shared = coverage.stages.filter((stage) => stage.stepId === first.stepId);
  assert.equal(shared.length, 3);
  assert.equal(
    shared.reduce((sum, stage) => sum + stage.memberIds.length, 0),
    14,
  );
  assert.ok(first.stepId);
  const report = connectionStageMarkdown(p, first.stepId, coverage);
  for (const stage of shared) {
    assert.ok(report.includes(stage.title));
    for (const id of stage.memberIds)
      assert.ok(
        report.includes(
          coverage.parts.find((part) => part.pieceId === id)!.label,
        ),
      );
  }
  assert.ok(
    report.includes("9 actual part(s)") &&
      report.includes("4 actual part(s)") &&
      report.includes("1 actual part(s)"),
  );
  const shell = shared.find((stage) => stage.key === "shell")!,
    step = p.steps.find((step) => step.id === first.stepId)!;
  step.generated = {
    kind: "assembly-stage",
    planId: shell.ownerId,
    stageKey: shell.key,
    memberIds: shell.memberIds,
    title: shell.title,
    notes: "SYNTHETIC explicit metadata",
    fingerprint: "synthetic-phase",
  };
  const specific = connectionStageMarkdown(p, step.id, coverage);
  assert.ok(specific.includes("4 actual part(s)"));
  assert.ok(!specific.includes("9 actual part(s)"));
  assert.ok(!specific.includes("1 actual part(s)"));
});

test("CSV retains every cross-stage association and chooses the actual task target as its primary stage", async () => {
  const p = await actual(),
    coverage = connectionCoverage(p),
    rows = parseCsv(connectionCoverageCsv(p, coverage)).filter(
      (row) => row["Record type"] === "intent",
    ),
    wood = rows.find((row) => row["Intent kind"] === "wood-fastener")!,
    hinge = rows.find((row) => row["Plan or location label"] === "H001/L001")!;
  assert.equal(wood["Stage key"], "shell");
  assert.ok(
    wood["Associated stage scopes"].includes("/shell") &&
      wood["Associated stage scopes"].includes("/bottom-frame"),
  );
  assert.equal(hinge["Stage key"], "seat-lid-back");
  assert.ok(
    hinge["Associated stage scopes"].includes("/shell") &&
      hinge["Associated stage scopes"].includes("/seat-lid-back"),
  );
  assert.equal(hinge["Task part IDs"], p.lidHingePlans[0].moving.pieceId);
  assert.equal(hinge["Context part IDs"], p.lidHingePlans[0].fixed.pieceId);
});
