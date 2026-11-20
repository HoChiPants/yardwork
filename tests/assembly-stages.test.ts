import test from "node:test";
import assert from "node:assert/strict";
import { assemblyStages, type AssemblyStage } from "../src/assemblyStages";
import {
  blank,
  part,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../src/model";
import { createBuildStudy, type BuildFixtureId } from "../src/buildFixtures";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { cutPiece } from "../src/engine";
import { composeRotation, rotate } from "../src/spatial";

function coverage(project: Project, stages = assemblyStages(project)) {
  const actual = stages.flatMap((stage) => stage.memberIds),
    expected = project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => piece.id);
  assert.equal(
    actual.length,
    new Set(actual).size,
    "Each active piece has one stage.",
  );
  assert.deepEqual([...actual].sort(), expected.sort());
  assert.deepEqual(
    stages.map((s) => s.order),
    stages.map((_, i) => i),
  );
  assert.equal(
    new Set(stages.map((s) => `${s.ownerId}:${s.key}`)).size,
    stages.length,
    "Stable stage keys are unique within their owner.",
  );
  for (const stage of stages) {
    assert.ok(stage.memberIds.length);
    assert.ok(stage.key.length <= 100);
    assert.ok(stage.title.length <= 120);
    assert.ok(stage.notes.length <= 4500);
  }
  return stages;
}
const stageShape = (stages: AssemblyStage[]) =>
  stages.map(({ ownerId, key, memberIds, order }) => ({
    ownerId,
    key,
    memberIds,
    order,
  }));
const study = (id: BuildFixtureId) => createBuildStudy(id).project;

test("all five studies have complete disjoint ownership and typed physical stage order", () => {
  const expected: Record<BuildFixtureId, string[]> = {
    shelves: ["carcass", "shelves"],
    "closet-insert": ["carcass", "tower-shelves"],
    "storage-banquette": [
      "bottom-frame",
      "shell",
      "seat-lid-back",
      "bottom-frame",
      "shell",
      "seat-lid-back",
      "bottom-frame",
      "shell",
      "seat-lid-back",
    ],
    greenhouse: ["base", "walls", "opening", "roof"],
    sauna: ["walls", "opening", "ceiling"],
  };
  for (const id of Object.keys(expected) as BuildFixtureId[]) {
    const project = study(id),
      before = structuredClone(project);
    assert.deepEqual(
      coverage(project).map((s) => s.key),
      expected[id],
      id,
    );
    assert.deepEqual(
      project,
      before,
      "Planning stages must not mutate the design.",
    );
  }
});

test("source-exact bookcase groups five carcass panels and three shelves without changing thickness or profiles", () => {
  const p = createBuildStudy("shelves", undefined, undefined, {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    }).project,
    stages = coverage(p),
    before = JSON.stringify(p.pieces);
  assert.deepEqual(
    stages.map((s) => s.memberIds.length),
    [5, 3],
  );
  assert.ok(p.pieces.every((piece) => Math.min(...piece.size) === 0.703));
  assert.match(stages[0].notes, /clamp.*square/i);
  assert.match(stages[1].notes, /explicitly planned holes/);
  assert.equal(JSON.stringify(p.pieces), before);
});

test("new storage roles split each real module into bottom/frame, four shell panels and lid", () => {
  const p = study("storage-banquette"),
    stages = coverage(p);
  assert.equal(p.pieces.length, 42);
  assert.ok(p.pieces.every((piece) => piece.designRole));
  for (const entry of p.ideaBindings[0].entries) {
    const own = stages.filter((stage) => stage.ownerId === entry.id);
    assert.deepEqual(
      own.map((s) => s.memberIds.length),
      [9, 4, 1],
    );
    const frameParts = p.pieces.filter((piece) =>
      own[0].memberIds.includes(piece.id),
    );
    assert.equal(
      frameParts.filter((piece) => piece.designRole === "storage-bottom")
        .length,
      1,
    );
    assert.equal(
      frameParts.filter((piece) => piece.designRole === "leg").length,
      4,
    );
    assert.match(own[0].notes, /on it/);
    assert.match(own[2].notes, /hinge, lid stay\/hold-open/);
    assert.match(own[2].notes, /provisional/);
  }
  assert.ok(
    !p.pieces.some((piece) => ["screw", "bracket"].includes(piece.material)),
  );
});

test("greenhouse includes actual selected glazing after clipped roof and preserves source directions", () => {
  const p = createBuildStudy("greenhouse", undefined, undefined, {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    }).project,
    stages = coverage(p),
    before = structuredClone(p.pieces);
  assert.deepEqual(
    stages.map((s) => s.key),
    ["base", "walls", "opening", "roof", "glazing"],
  );
  const roof = p.pieces.filter((piece) =>
      stages[3].memberIds.includes(piece.id),
    ),
    glazing = p.pieces.filter((piece) =>
      stages[4].memberIds.includes(piece.id),
    );
  assert.ok(roof.some((piece) => piece.cutPlanes.length === 2));
  assert.ok(glazing.length > 4);
  assert.ok(
    glazing.every(
      (piece) =>
        piece.material === "sunlite-8mm" && piece.stockLengthAxis === 1,
    ),
  );
  assert.ok(glazing.some((piece) => piece.cutPlanes.length > 0));
  assert.match(stages[4].notes, /thermal allowances/);
  assert.deepEqual(p.pieces, before);
});

test("closet groups actual annotated dividers/shelves and actual selected rods while supports remain review", () => {
  const p = createBuildStudy("closet-insert", undefined, undefined, {
      closetRod: {
        materialId: "closet-rod-72",
        productRegistryRef: "project-source-27773pholg",
      },
    }).project,
    stages = coverage(p);
  assert.deepEqual(
    stages.map((s) => s.key),
    ["carcass", "tower-shelves", "rods"],
  );
  assert.deepEqual(
    stages.map((s) => s.memberIds.length),
    [6, 4, 2],
  );
  assert.match(stages[2].notes, /sockets.*center support/);
  const noRods = coverage(study("closet-insert"));
  assert.match(noRods.at(-1)!.notes, /Hanging rods.*unbuilt/);
});

test("sauna stages describe real exterior framing and explicitly reserve all unbuilt heated systems", () => {
  const p = study("sauna"),
    stages = coverage(p),
    notes = stages.map((s) => s.notes).join("\n");
  assert.deepEqual(
    stages.map((s) => s.key),
    ["walls", "opening", "ceiling"],
  );
  assert.match(
    notes,
    /Unbuilt systems: foundation, actual door, insulation\/foil\/furring\/lining, heated benches, heater\/electrical and ventilation/,
  );
  assert.match(notes, /reservations, not installed or heat-qualified/);
  assert.ok(!stages.some((s) => /install.*heater/i.test(s.title)));
});

test("full Euler poses do not reorder construction stages by world elevation", () => {
  const p = study("greenhouse"),
    before = stageShape(coverage(p)),
    rotation: V3 = [Math.PI, 0.7, 0.2],
    origin: V3 = [150, 120, -40];
  p.pieces = p.pieces.map((piece) => ({
    ...piece,
    rotation: composeRotation(rotation, piece.rotation),
    position: rotate(piece.position, rotation).map(
      (n, i) => n + origin[i],
    ) as V3,
  }));
  for (const binding of p.ideaBindings)
    for (const entry of binding.entries) entry.pose = { origin, rotation };
  assert.deepEqual(stageShape(coverage(p)), before);
});

test("typed roles survive misleading names and member/section array reorder", () => {
  for (const id of [
    "shelves",
    "closet-insert",
    "storage-banquette",
    "greenhouse",
    "sauna",
  ] as const) {
    const p = study(id),
      expected = stageShape(coverage(p));
    p.pieces.reverse().forEach((piece) => {
      piece.name = "Install sauna heater roof shelf left side";
      piece.assembly = "Wrong family";
    });
    p.sections.reverse().forEach((section) => {
      section.name = "Roof back seat";
      section.pieceIds.reverse();
    });
    for (const binding of p.ideaBindings)
      for (const entry of binding.entries) entry.sections.reverse();
    assert.deepEqual(stageShape(coverage(p)), expected, id);
  }
});

test("old furniture without explicit roles remains one complete module and is never retro-annotated", () => {
  const p = study("storage-banquette");
  for (const piece of p.pieces) delete piece.designRole;
  const before = structuredClone(p),
    stages = coverage(p);
  assert.deepEqual(
    stages.map((s) => s.key),
    ["module", "module", "module"],
  );
  assert.deepEqual(
    stages.map((s) => s.memberIds.length),
    [14, 14, 14],
  );
  assert.ok(stages.every((s) => /no recognized stage roles/.test(s.notes)));
  assert.deepEqual(p, before);
});

test("legacy closet explicit shelf mapping splits only declared roles and never guesses unnamed panels", () => {
  const p = study("closet-insert");
  for (const piece of p.pieces)
    if (
      !["tower-left", "tower-right"].includes(piece.designRole ?? "") &&
      !piece.designRole?.startsWith("tower-shelf-")
    )
      delete piece.designRole;
  const stages = coverage(p);
  assert.deepEqual(
    stages.map((s) => s.key),
    ["carcass", "tower-shelves", "review-modified-parts"],
  );
  assert.deepEqual(
    stages.map((s) => s.memberIds.length),
    [2, 4, 4],
  );
  assert.match(stages[2].notes, /No part identity/);
});

test("manual cuts retain actual role ownership, offcuts stay separate and unrecognized additions are reviewed once", () => {
  let p = study("storage-banquette");
  const lid = p.pieces.find((piece) => piece.designRole === "seat-lid")!,
    section = p.sections.find((s) => s.pieceIds.includes(lid.id))!;
  p = cutPiece(p, lid.id, 12, 0);
  const extra = part(
    "seat lid",
    "plywood",
    [8, 0.75, 8],
    [0, 30, 0],
    p.steps[0].id,
    "Storage",
  );
  extra.designRole = "hand-made-custom-block";
  p.pieces.push(extra);
  p.sections.find((s) => s.id === section.id)!.pieceIds.push(extra.id);
  const stages = coverage(p),
    review = stages.find((s) => s.key === "review-modified-parts")!;
  assert.deepEqual(review.memberIds, [extra.id]);
  assert.equal(stages.filter((s) => s.memberIds.includes(lid.id)).length, 1);
  assert.ok(p.pieces.some((piece) => piece.offcut && piece.cutStock));
  for (const offcut of p.pieces.filter((piece) => piece.offcut))
    assert.ok(!stages.some((s) => s.memberIds.includes(offcut.id)));
});

test("missing actual sections and members never regenerate expected parts or leave surviving parts unassigned", () => {
  const p = study("shelves"),
    entry = p.ideaBindings[0].entries[0],
    removed = entry.sections.find((m) => m.role === "top")!.sectionId,
    removedIds = new Set(p.sections.find((s) => s.id === removed)!.pieceIds);
  p.sections = p.sections.filter((s) => s.id !== removed);
  p.pieces = p.pieces.filter((piece) => !removedIds.has(piece.id));
  const removedShelf = entry.sections.find(
    (mapping) => mapping.role === "shelf-2",
  )!.sectionId;
  p.pieces.splice(
    p.pieces.findIndex((piece) =>
      p.sections
        .find((s) => s.id === removedShelf)
        ?.pieceIds.includes(piece.id),
    ),
    1,
  );
  const before = structuredClone(p),
    stages = coverage(p);
  assert.deepEqual(
    stages.map((s) => s.memberIds.length),
    [4, 2],
  );
  assert.deepEqual(p, before);
});

test("unbound declared sections and explicit assembly metadata have stable conservative fallback", () => {
  const p = blank(),
    a = part(
      "roof",
      "plywood",
      [10, 0.75, 10],
      [0, 0, 0],
      p.steps[0].id,
      "Seat",
    ),
    b = part("wall", "stud", [1.5, 12, 3.5], [0, 10, 0], p.steps[0].id, "Base"),
    c = part("heater", "stud", [1.5, 12, 3.5], [20, 10, 0], p.steps[0].id, ""),
    sectionId = uid();
  p.pieces = [a, b, c];
  p.sections = [
    {
      id: sectionId,
      name: "Custom section",
      pieceIds: [a.id],
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      recipe: null,
      generator: null,
    },
  ];
  const expected = stageShape(coverage(p));
  assert.equal(expected[0].ownerId, sectionId);
  assert.deepEqual(
    expected.map((s) => s.key),
    ["section", "loose-parts", "assembly:Base"],
  );
  p.pieces.reverse();
  assert.deepEqual(stageShape(coverage(p)), expected);
});

test("mixed saved entries plus loose work preserve every actual ID and source after roundtrip", () => {
  let p = applyIdeaPlan(
    blank(),
    localIdeaPlan({
      prompt:
        "A storage banquette 48 inches wide, 24 inches deep, 18 inches seat height, no back and an opening lid",
    }),
  );
  p = applyIdeaPlan(
    p,
    localIdeaPlan({
      prompt:
        "A plywood bookcase 36 inches wide, 12 inches deep, 72 inches high with three shelves",
    }),
  );
  p.pieces.push(
    part(
      "Unbound jig",
      "one-four",
      [0.75, 12, 3.5],
      [60, 5, 0],
      p.steps[0].id,
      "Jig",
    ),
  );
  const stages = coverage(p),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.ok(stages.some((s) => s.key === "bottom-frame"));
  assert.ok(stages.some((s) => s.key === "carcass"));
  assert.ok(stages.some((s) => s.key === "assembly:Jig"));
  assert.deepEqual(assemblyStages(reopened), stages);
});

test("new framed shelf metadata covers only generated physical roles and leaves frame/top dimensions unchanged", () => {
  const p = applyIdeaPlan(
      blank(),
      localIdeaPlan({
        prompt:
          "A shelf 36 inches wide, 16 inches deep, 48 inches tall with three levels",
      }),
    ),
    stages = coverage(p);
  assert.deepEqual(
    stages.map((s) => s.key),
    ["frame", "infill-shelves", "top-seat-back"],
  );
  assert.ok(p.pieces.some((piece) => piece.designRole === "shelf-1"));
  assert.ok(
    p.pieces.some(
      (piece) => piece.designRole === "top" && piece.size[0] === 36,
    ),
  );
});
