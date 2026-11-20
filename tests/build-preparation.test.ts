import assert from "node:assert/strict";
import test from "node:test";
import { buildFixtureIds, createBuildStudy } from "../src/buildFixtures";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { buildPreparation } from "../src/buildPreparation";
import { makeShelfPinPlan, saveShelfPinPlan, shelfSupportEntries } from "../src/attachments";
import { makeConnectorPlan, saveConnectorPlan } from "../src/connectors";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { makeRestraintPlan, saveRestraintPlan, selectRestraintReceiver } from "../src/restraints";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { bom, guideMarkdown, validate } from "../src/engine";
import { connectionCoverage } from "../src/connectionCoverage";
import { homeDepotShoppingList } from "../src/handoff";
import { stockCutSequences } from "../src/stockCutSequence";
import { blank, part, uid } from "../src/model";
import { motionTestFindings, projectMotionReviews, saveMotionPlan, saveMotionTestSetup } from "../src/mechanismMotion";
import { lidTravelPose, projectLidTravelChecks } from "../src/lidTravelFindings";
import { lidPreview } from "../src/lidMotion";
import { supplyRows } from "../src/supplies";
import type { Project } from "../src/model";

function preparation(project: Project) {
  const stock = bom(project),
    supplies = supplyRows(project);
  return buildPreparation(project, {
    stock,
    supplies,
    connections: connectionCoverage(project),
    sequences: stockCutSequences(project, stock),
    findings: validate(project),
    motions: projectMotionReviews(project),
    lids: projectLidTravelChecks(project),
    handoff: homeDepotShoppingList(project, stock, supplies),
  });
}

test("the five example families expose actual stage, tool and shopping decisions in their guide", () => {
  for (const id of buildFixtureIds) {
    const { project } = createBuildStudy(id);
    const before = JSON.stringify(project);
    const groups = preparation(project);
    assert.deepEqual(reviewAssemblyOrder(generateBuildGuide(project)), [], id);
    const connection = groups.find(({ id }) => id === "connections")!;
    const shopping = groups.find(({ id }) => id === "shopping")!;
    const tools = groups.find(({ id }) => id === "tools")!;
    assert.ok(connection.items.length > 0, id);
    for (const row of connection.items) {
      assert.equal(row.action.kind, "connections");
      if (row.action.kind === "connections")
        assert.ok(
          row.action.scope.memberIds.every((member) =>
            project.pieces.some(({ id }) => id === member),
          ),
        );
    }
    assert.ok(shopping.items.length > 0 && tools.items.length > 0, id);
    assert.match(
      guideMarkdown(project),
      /## Build preparation[\s\S]*### Assembly connections[\s\S]*### Shopping and availability[\s\S]*### Tools and accessories/,
    );
    assert.equal(JSON.stringify(project), before);
  }
  assert.deepEqual(preparation(blank()), []);
});

test("the five build families flag reversed prerequisite stages and preserve the saved order through regeneration", () => {
  const pairs = {
    greenhouse: ["roof", "walls"],
    sauna: ["ceiling", "walls"],
    "storage-banquette": ["shell", "bottom-frame"],
    shelves: ["shelves", "carcass"],
    "closet-insert": ["tower-shelves", "carcass"],
  } as const;
  for (const id of buildFixtureIds) {
    const project = generateBuildGuide(createBuildStudy(id).project);
    const [laterKey, earlierKey] = pairs[id];
    const later = project.steps.find(({ generated }) =>
      generated?.kind === "assembly-stage" && generated.stageKey === laterKey,
    );
    assert.ok(later, `${id} has an assembly stage for ${laterKey}`);
    const earlier = project.steps.find(({ generated }) =>
      generated?.kind === "assembly-stage" &&
      generated.stageKey === earlierKey &&
      generated.planId === later.generated?.planId,
    );
    assert.ok(earlier, `${id} has a prerequisite stage for ${earlierKey}`);
    const steps = project.steps.filter(({ id }) => id !== later.id);
    steps.splice(steps.indexOf(earlier), 0, later);
    const reversed = { ...project, steps };
    const warnings = reviewAssemblyOrder(reversed);
    const finding = warnings.find(({ current }) => current.step.id === later.id)!;
    assert.equal(finding.current.number, steps.indexOf(later) + 1, id);
    assert.ok(finding.prerequisites.some(({ step }) => step.id === earlier.id), id);
    assert.ok(finding.prerequisites.every(({ step }) => step.generated?.planId === later.generated?.planId), id);
    const regenerated = generateBuildGuide(reversed);
    assert.ok(guideIsCurrent(regenerated), id);
    assert.deepEqual(regenerated.steps.map(({ id }) => id), steps.map(({ id }) => id), id);
    assert.deepEqual(reversed.pieces, project.pieces, id);
    assert.equal(reviewAssemblyOrder({ ...regenerated, steps: project.steps }).length, 0, id);

    // Old stage metadata cannot flag a prerequisite that has no active member in that step.
    const removed = {
      ...reversed,
      pieces: reversed.pieces.filter(({ stepId }) => stepId !== earlier.id),
    };
    assert.ok(!reviewAssemblyOrder(removed).some(({ prerequisites }) =>
      prerequisites.some(({ step }) => step.id === earlier.id)), id);
  }
});

test("planned hardware reviews follow actual members and appear in the guide when scheduled too late", () => {
  let bench = createBuildStudy("storage-banquette").project;
  const section = bench.sections.find(({ recipe }) => recipe?.openingLid)!;
  const member = (role: string) =>
    bench.pieces.find(({ id, designRole }) => section.pieceIds.includes(id) && designRole === role)!;
  const post = member("leg"), rear = member("storage-rear"), rail = member("top-rail");
  const screw = makeFastenerPlan(bench, rear.id, post.id);
  bench = saveFastenerPlan(bench, screw);
  const angle = makeConnectorPlan(bench, rail.id, post.id);
  bench = saveConnectorPlan(bench, angle);
  const hinge = bench.lidHingePlans.find(({ sectionId }) => sectionId === section.id)!;
  bench = generateBuildGuide(bench);
  assert.deepEqual(reviewAssemblyOrder(bench), []);

  const bookcase = createBuildStudy("shelves").project;
  const entry = shelfSupportEntries(bookcase)[0];
  const pins = makeShelfPinPlan(bookcase, entry.entryId, {
    shelfRoles: [entry.shelves[0].role],
    layout: { system: "custom", frontInset: 2, rearInset: 2, datumHeight: null },
  });
  const shelves = generateBuildGuide(saveShelfPinPlan(bookcase, pins));
  assert.deepEqual(reviewAssemblyOrder(shelves), []);
  const cabinet = blank("Frame with wall-receiver plan");
  const receiver = part("Receiver", "stud", [1.5, 36, 3.5], [0, 18, 0], cabinet.steps[0].id, "Frame");
  cabinet.pieces = [receiver];
  const restraint = selectRestraintReceiver(cabinet, makeRestraintPlan(cabinet), receiver.id);
  const restrained = generateBuildGuide(saveRestraintPlan(cabinet, restraint));
  assert.deepEqual(reviewAssemblyOrder(restrained), []);

  const stageFor = (project: Project, memberId: string) => {
    const id = project.pieces.find((member) => member.id === memberId)?.stepId;
    return project.steps.find((step) => step.id === id)!;
  };
  const reviewFor = (project: Project, planId: string) =>
    project.steps.find(({ generated }) => generated?.planId === planId)!;
  const hingeReview = reviewFor(bench, hinge.id);
  const cases = [
    { project: bench, first: reviewFor(bench, screw.id), then: stageFor(bench, rear.id), memberId: post.id },
    { project: bench, first: reviewFor(bench, angle.id), then: stageFor(bench, post.id), memberId: rail.id },
    { project: bench, first: hingeReview, then: stageFor(bench, hinge.moving.pieceId), memberId: hinge.fixed.pieceId },
    { project: bench, first: stageFor(bench, hinge.fixed.pieceId), then: hingeReview, memberId: hinge.moving.pieceId },
    { project: shelves, first: reviewFor(shelves, pins.id), then: stageFor(shelves, pins.points[0].shelf.pieceId), memberId: pins.points[0].shelf.pieceId },
    { project: restrained, first: reviewFor(restrained, restraint.id), then: restrained.steps.find(({ generated }) => generated?.kind === "project-finish")!, memberId: receiver.id },
  ];
  for (const { project, first, then, memberId } of cases) {
    assert.ok(project.steps.indexOf(first) < project.steps.indexOf(then), first.title);
    const steps = project.steps.filter(({ id }) => id !== first.id);
    steps.splice(steps.indexOf(then) + 1, 0, first);
    const reordered = { ...project, steps };
    const hasWarning = (current: Project) => reviewAssemblyOrder(current).some(
      ({ current, prerequisites }) => current.step.id === then.id &&
        prerequisites.some(({ step }) => step.id === first.id),
    );
    assert.ok(hasWarning(reordered), first.title);
    assert.ok(hasWarning(generateBuildGuide(reordered)), first.title);
    const withoutEndpoint = { ...reordered, pieces: project.pieces.filter(({ id }) => id !== memberId) };
    assert.ok(!hasWarning(withoutEndpoint), first.title);
    assert.ok(!hasWarning(project), first.title);
  }
});

test("an oversized cut opens the exact part and clears from preparation when stock length fits", () => {
  const project = blank();
  const piece = part(
    "Long shelf rail",
    "stud",
    [1.5, 3.5, 101],
    [0, 2, 0],
    project.steps[0].id,
    "Shelves",
  );
  project.pieces = [piece];
  const groups = preparation(project);
  const cuts = groups.find(({ id }) => id === "cuts")!;
  assert.equal(cuts.items.length, 1);
  assert.deepEqual(cuts.items[0].action, { kind: "part", id: piece.id });
  assert.match(cuts.items[0].detail, /Exceeds the modeled/);
  assert.ok(
    groups
      .find(({ id }) => id === "shopping")!
      .items.every(({ detail }) => detail !== "Exceeds stock dimensions"),
  );
  piece.size[2] = 92;
  assert.equal(
    preparation(project).find(({ id }) => id === "cuts")!.items.length,
    0,
  );
});

test("shopping preparation follows selected-store snapshot quantities while keeping stock measurements unchanged", () => {
  const project = blank();
  project.store = "4401";
  project.pieces = [
    part(
      "Glazing panel",
      "sunlite-8mm",
      [24, 48, 8 / 25.4],
      [0, 24, 0],
      project.steps[0].id,
      "Glazing",
    ),
  ];
  project.pieces[0].stockLengthAxis = 1;
  const shopping = () =>
    preparation(project).find(({ id }) => id === "shopping")!.items;
  assert.ok(
    shopping().some(
      ({ id, detail }) =>
        id === "stock-202091947" &&
        detail.includes("Record a current Home Depot snapshot"),
    ),
  );
  project.inventory = [
    {
      material: "sunlite-8mm",
      retailer: "home-depot",
      internetNumber: "202091947",
      name: "Verified test store sheet",
      url: "https://www.homedepot.com/p/202091947",
      zip: "84121",
      store: "4401",
      price: 50,
      available: 0,
      checkedAt: new Date().toISOString(),
    },
  ];
  assert.ok(
    shopping().some(
      ({ id, detail }) =>
        id === "stock-202091947" && detail.includes("0 available"),
    ),
  );
  project.inventory[0].available = 1;
  assert.ok(shopping().every(({ id }) => id !== "stock-202091947"));
  project.store = "auxiliary";
  assert.ok(
    shopping().some(
      ({ id, detail }) =>
        id === "stock-202091947" && detail.includes("store auxiliary"),
    ),
  );
});

test("preparation opens the saved motion that collides and flags a removed companion", () => {
  const project = blank("Cabinet clearances");
  const step = project.steps[0].id;
  const drawer = part("Drawer", "plywood", [2, 2, 2], [-6, 10, 0], step, "Cabinet");
  const tray = part("Tray", "plywood", [2, 2, 2], [0, 10, -10], step, "Cabinet");
  project.pieces = [drawer, tray];
  const slide = saveMotionPlan(project, {
    label: "Drawer",
    memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const crossing = saveMotionPlan(slide.project, {
    label: "Tray",
    memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const clearanceItems = (current: Project) =>
    preparation(current).find(({ id }) => id === "motion")!.items;
  assert.deepEqual(clearanceItems(crossing.project), []);
  const saved = saveMotionTestSetup(crossing.project, slide.plan.id, {
    linkedId: crossing.plan.id,
    held: [],
  });
  const before = JSON.stringify(saved);
  const [row] = clearanceItems(saved);
  assert.equal(clearanceItems(saved).length, 1);
  assert.deepEqual(row.action, {
    kind: "motion",
    planId: slide.plan.id,
    variant: "saved",
    findingId: `contact/${drawer.id}/${tray.id}`,
  });
  const [review] = projectMotionReviews(saved);
  const [finding] = motionTestFindings(saved, review.saved!);
  assert.deepEqual(review.saved!.review!.preview(finding.travel!).interferenceIds, [drawer.id, tray.id]);
  assert.match(guideMarkdown(saved), /### Motion and clearance\n\n- Drawer · Saved test · Modeled interference/);
  assert.equal(JSON.stringify(saved), before);
  const missing = { ...saved, motionPlans: [saved.motionPlans![0]] };
  const [stale] = clearanceItems(missing);
  assert.equal(stale.action.kind, "motion");
  assert.match(stale.detail, /was removed/);
  assert.doesNotMatch(stale.detail, /Modeled interference/);
});

test("each storage lid links to its own obstruction and exact measured face", () => {
  const { project } = createBuildStudy("storage-banquette");
  const [section, other] = project.sections;
  const mid = lidPreview(project, section.id, 35);
  const obstacle = part("Upper trim", "stud", [1.5, 1.5, 1.5], mid.piece.position, project.steps[0].id, "Obstacles");
  project.pieces.push(obstacle);
  const faces = ["Room face", "Cabinet face"].map((label, index) => ({
    id: uid(),
    bindingId: null,
    side: "+Z" as const,
    coordinate: -100 + index,
    label,
    top: null,
    minimum: 1,
  }));
  project.siteClearances = faces;
  const before = structuredClone(project);
  const checks = projectLidTravelChecks(project);
  const firstLid = checks.find((entry) => entry.section.id === section.id)!;
  const secondLid = checks.find((entry) => entry.section.id === other.id)!;
  const hit = firstLid.findings.find(({ id }) => id === `contact/${obstacle.id}`)!;
  assert.ok(hit.angle && hit.angle < 75);
  assert.ok(firstLid.review!.preview(hit.angle).interferenceIds?.includes(obstacle.id));
  assert.ok(!secondLid.findings.some(({ id }) => id === hit.id));
  const site = firstLid.findings.find(({ faceId }) => faceId === faces[1].id)!;
  const pose = lidTravelPose(firstLid.review!.preview(site.angle!), [], site.faceId);
  assert.equal(pose.shownSiteFaceId, faces[1].id);
  assert.deepEqual(pose.siteFaceHits, faces.map(({ id }) => id));
  const rows = preparation(project).find(({ id }) => id === "motion")!.items;
  assert.ok(rows.some(({ action }) => action.kind === "lid" && action.sectionId === section.id && action.findingId === hit.id));
  assert.match(guideMarkdown(project), /Lid travel · Lid interference · P\d+ Upper trim/);
  assert.deepEqual(project, before);
});
