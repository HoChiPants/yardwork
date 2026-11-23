import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, uid } from "../src/model";
import { bom, connect, cutPiece, recordChanges } from "../src/engine";
import { resizeByCuts } from "../src/cutPlan";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { toolChecklist, type SelectedTool } from "../src/tools";
import { selectedToolsForProject } from "../src/toolGuide";
function frame() {
  const p = blank();
  p.pieces = [
    part("Rail A", "stud", [1.5, 36, 3.5], [0, 18, 0], p.steps[0].id, "Frame"),
    part(
      "Rail B",
      "stud",
      [1.5, 36, 3.5],
      [1.5, 18, 0],
      p.steps[0].id,
      "Frame",
    ),
  ];
  return p;
}

test("empty space has no invented tool or material requirements; a work zone needs measuring", () => {
  const p = blank();
  assert.equal(toolChecklist(p).requirements.length, 0);
  p.workZone = { width: 96, depth: 48, height: 96 };
  assert.deepEqual(
    toolChecklist(p).requirements.map((r) => r.capability),
    ["measure"],
  );
  assert.equal(toolChecklist(p).requirements[0].status, "unknown");
});

test("actual two-axis sheet cuts trace crosscut/rip processes to cut parts without pricing tools", () => {
  const p = blank();
  p.pieces = [
    part(
      "Sheet",
      "plywood",
      [48, 0.75, 96],
      [0, 0.375, 0],
      p.steps[0].id,
      "Sheet",
    ),
  ];
  const cut = resizeByCuts(p, p.pieces[0].id, 60, 24),
    before = JSON.stringify(cut),
    shopping = bom(cut);
  const result = toolChecklist(cut),
    required = result.requirements.filter((r) => r.necessity === "required");
  for (const cap of [
    "wood-crosscut",
    "wood-rip",
    "measure",
    "clamp",
    "ppe-eye",
  ])
    assert.ok(
      required.some((r) => r.capability === cap),
      cap,
    );
  assert.ok(
    result.requirements
      .find((r) => r.capability === "wood-rip")!
      .sources.some((s) => s.id === p.pieces[0].id),
  );
  assert.equal(
    result.requirements.find((r) => r.capability === "ppe-hearing")?.necessity,
    "conditional",
  );
  assert.equal(
    result.requirements.find((r) => r.capability === "ppe-dust")?.necessity,
    "conditional",
  );
  assert.ok(result.requirements.every((r) => r.status === "unknown"));
  assert.deepEqual(bom(cut), shopping);
  assert.equal(JSON.stringify(cut), before);
});

test("a known length-only wood cut does not invent a required ripping operation", () => {
  const p = frame();
  p.pieces = p.pieces.slice(0, 1);
  p.pieces[0].size = [1.5, 96, 3.5];
  const cut = recordChanges(p, cutPiece(p, p.pieces[0].id, 48, 1));
  const result = toolChecklist(cut);
  assert.equal(
    result.requirements.find((r) => r.capability === "wood-crosscut")
      ?.necessity,
    "required",
  );
  assert.ok(!result.requirements.some((r) => r.capability === "wood-rip"));
});

test("screw, nail and connector processes remain distinct and pre-drilling stays conditional", () => {
  let p = frame();
  p = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 2, 3);
  let result = toolChecklist(p);
  assert.equal(
    result.requirements.find((r) => r.capability === "drive-screw")?.necessity,
    "required",
  );
  assert.equal(
    result.requirements.find((r) => r.capability === "drill-pilot")?.necessity,
    "conditional",
  );
  assert.ok(!result.requirements.some((r) => r.capability === "drive-nail"));
  p.joints = [];
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    2,
    3,
    "nail",
    "nail",
  );
  result = toolChecklist(p);
  assert.ok(
    result.requirements.some(
      (r) => r.capability === "drive-nail" && r.status === "unknown",
    ),
  );
  assert.ok(
    !result.requirements.some(
      (r) => r.capability === "drive-screw" || r.capability === "drill-pilot",
    ),
  );
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    1,
    3,
    "bracket",
    "bracket",
  );
  const connector = toolChecklist(p).requirements.find(
    (r) => r.capability === "connector-install",
  )!;
  assert.equal(connector.necessity, "required");
  assert.ok(
    connector.referenceUrls.some((url) => url.includes("strongtie.com")),
  );
  assert.ok(connector.sources.some((source) => source.kind === "joint"));
});

test("only exact SD connector screws trigger the matching nut driver review", () => {
  const p = frame();
  const step = p.steps[0].id;
  const generic = part("Generic connector screw", "connector-screw", [0.35, 1.5, 0.35], [0, 1, 0], step, "Frame");
  const nail = part("Connector nail", "n10dhdg-r", [0.3, 1.5, 0.3], [1, 1, 0], step, "Frame");
  p.pieces.push(generic, nail);
  const withJoint = connect(p, p.pieces[0].id, p.pieces[1].id, step, 2, 2.5, "screw", "sd9212r100-r");
  const legacy = { ...withJoint.joints[0], material: undefined };
  p.joints = [legacy];
  assert.equal(toolChecklist(p).requirements.find((row) => row.capability === "drive-quarter-hex"), undefined);

  const short = part("Short #9 screw", "sd9112r100", [0.37, 1.5, 0.37], [2, 1, 0], step, "Frame");
  const thick = part("Short #10 screw", "sd10112r100", [0.37, 1.5, 0.37], [3, 1, 0], step, "Frame");
  const project = { ...withJoint, pieces: [...withJoint.pieces, short, thick] };
  const findReview = (tools: SelectedTool[] = [], now = Date.now()) =>
    toolChecklist(project, tools, now).requirements.find((row) => row.capability === "drive-quarter-hex");
  const review = findReview();
  assert.equal(review?.status, "unknown");
  assert.equal(review?.necessity, "conditional");
  assert.deepEqual(review?.sources.map(({ id }) => id), [project.joints[0].id, short.id, thick.id]);
  for (const model of ["SD9212R100", "SD9112R100", "SD10112R100"])
    assert.ok(review?.sources.some(({ reason }) => reason.includes(model)), model);

  const checkedAt = "2026-11-23T06:00:00.000Z";
  const now = Date.parse(checkedAt);
  const selected = selectedToolsForProject({
    ...project, toolSelections: [{ productId: "milwaukee-49-66-4502", checkedAt }],
  }, now);
  assert.equal(findReview(selected.tools, now)?.status, "supported");
  assert.equal(toolChecklist(project, selected.tools, now).requirements.find((row) => row.capability === "drive-screw")?.status, "unknown");
});

test("selected names, unchecked tools and undocumented capability claims never establish support", () => {
  const p = frame();
  p.joints = [
    {
      id: uid(),
      a: p.pieces[0].id,
      b: p.pieces[1].id,
      stepId: p.steps[0].id,
      kind: "screw",
      length: 3,
      quantity: 2,
    },
  ];
  const now = Date.parse("2026-11-16T12:00:00Z");
  const tool: SelectedTool = {
    id: "owned-driver",
    name: "A real drill/driver",
    checked: true,
    capabilities: ["drive-screw", "drill-pilot"],
    evidence: [],
  };
  assert.equal(
    toolChecklist(p, [tool], now).requirements.find(
      (r) => r.capability === "drive-screw",
    )?.status,
    "unknown",
  );
  tool.evidence = [
    {
      url: "https://www.dewalt.com/en-us/product/dcd771c2/20v-max-compact-drilldriver-kit",
      reviewedAt: "2026-11-16T10:00:00Z",
      note: "Reviewed manufacturer's drill/driver functions; exact bit/setup still need checking.",
      capabilities: ["drive-screw"],
    },
  ];
  let result = toolChecklist(p, [tool], now);
  assert.equal(
    result.requirements.find((r) => r.capability === "drive-screw")?.status,
    "supported",
  );
  assert.equal(
    result.requirements.find((r) => r.capability === "drill-pilot")?.status,
    "unknown",
  );
  tool.checked = false;
  assert.equal(
    toolChecklist(p, [tool], now).requirements.find(
      (r) => r.capability === "drive-screw",
    )?.status,
    "unknown",
  );
  tool.checked = true;
  tool.evidence[0].reviewedAt = "2026-11-17T10:00:00Z";
  assert.equal(
    toolChecklist(p, [tool], now).requirements.find(
      (r) => r.capability === "drive-screw",
    )?.status,
    "unknown",
  );
});

test("legacy cuts with unknown axes remain review questions even alongside a separate known cut", () => {
  const p = frame();
  const cut = cutPiece(p, p.pieces[0].id, 12, 1);
  cut.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: p.steps[0].id,
    message: "Cut an older panel to fit",
  });
  const result = toolChecklist(cut),
    rip = result.requirements.find((r) => r.capability === "wood-rip")!;
  assert.equal(rip.necessity, "conditional");
  assert.ok(rip.sources.some((s) => s.kind === "history"));
});

test("five generated build kinds expose process coverage as reviewable data without fabricated matched tools", () => {
  for (const prompt of [
    "a 6 foot banquette with storage and opening lids, no back",
    "a 5 foot workbench",
    "a 4 foot cabinet",
    "a 3 foot bookcase",
    "a 4 foot box frame",
  ]) {
    const p = applyIdeaPlan(blank(), localIdeaPlan({ prompt }));
    const result = toolChecklist(p);
    assert.ok(
      result.requirements.some((r) => r.capability === "measure"),
      prompt,
    );
    assert.ok(
      result.requirements.some((r) => r.capability === "square"),
      prompt,
    );
    assert.ok(
      result.requirements.some((r) => r.capability === "wood-crosscut"),
      prompt,
    );
    assert.ok(result.coverage.unknownRequired > 0, prompt);
    assert.equal(result.coverage.supportedRequired, 0, prompt);
    assert.ok(
      result.requirements.every((r) => r.supportedBy.length === 0),
      prompt,
    );
    assert.ok(!("price" in result));
  }
});
