import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { inspectCutStock } from "../src/cutStock";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { saveMotionPlan } from "../src/mechanismMotion";
import { part, projectSchema, type Project, type V3 } from "../src/model";
import { rotate } from "../src/spatial";
import { subfloorBlockingLines, subfloorReviews, trackSubfloorPanel } from "../src/subfloor";
import { reviewSubfloorAdhesive, saveSubfloorAdhesive, subfloorAdhesiveTakeoff } from "../src/subfloorAdhesive";
import { previewSubfloorBlocking } from "../src/subfloorBlocking";
import { reviewSubfloorFastening, saveSubfloorFastening, subfloorCommonNailTakeoff } from "../src/subfloorFastening";
import { reviewSubfloorJoists, saveSubfloorJoists, subfloorJoistReviews } from "../src/subfloorJoists";
import { subfloorAdhesive, subfloorNails } from "../src/subfloorReference";
import { addSupply } from "../src/supplies";
import { toolChecklist } from "../src/tools";

function fixture() {
  const project = projectSchema.parse(JSON.parse(readFileSync(new URL(
    "../public/examples/flooring/subfloor.yardwork.json", import.meta.url,
  ), "utf8")));
  const panel = project.pieces.find(({ id }) => id === project.subfloorChecks?.[0])!;
  const scrap = project.pieces.find(({ name }) => name === "Offcut · Joist 1")!;
  const repaired = { ...project, pieces: project.pieces.map((piece) => piece.id === scrap.id ? { ...piece, offcut: false } : piece) };
  return { project, panel, scrap, repaired };
}

function jointPractice() {
  const project = projectSchema.parse(JSON.parse(readFileSync(new URL(
    "../public/examples/flooring/subfloor-end-spacing.yardwork.json", import.meta.url,
  ), "utf8")));
  const [first, second] = project.subfloorChecks!.map((id) => project.pieces.find((piece) => piece.id === id)!);
  return { project, first, second };
}

test("measure square ends and retain the planned sheet and offcut quantities after shifting a panel", () => {
  const { project, first } = jointPractice();
  const before = subfloorReviews(project)[0].layout!;
  assert.deepEqual(before.issues, []);
  assert.deepEqual(before.joints.map(({ gap, length, status, retainedLength }) => ({ gap, length, status, retainedLength })),
    [{ gap: 0, length: 32, status: "tight", retainedLength: 39.875 }]);
  assert.equal(validate(project).filter(({ id }) => id.startsWith("subfloor-joint-")).length, 1);
  const guide = guideMarkdown(project);
  assert.match(guide, /P014 far end to P015 start end · 0 in modeled gap along 32 in/);
  assert.equal(guide, readFileSync(new URL("../public/examples/flooring/subfloor-end-spacing-guide.md", import.meta.url), "utf8"));
  assert.ok(guideIsCurrent(project));

  const floorStage = first.stepId;
  const framingStage = project.pieces.find(({ id }) => id === before.supportIds[0])!.stepId;
  const stages = project.steps.map(({ id }) => id);
  assert.ok(stages.indexOf(framingStage) < stages.indexOf(floorStage));
  const outOfOrder = { ...project, steps: [
    project.steps.find(({ id }) => id === floorStage)!,
    ...project.steps.filter(({ id }) => id !== floorStage),
  ] };
  assert.ok(reviewAssemblyOrder(outOfOrder).some(({ current, prerequisites }) =>
    current.step.id === floorStage && prerequisites.some(({ step }) => step.id === framingStage)));

  first.position[2] = 19.875;
  const after = subfloorReviews(project)[0].layout!;
  assert.deepEqual(after.issues, []);
  assert.equal(after.joints[0].gap, 0.125);
  assert.equal(after.joints[0].status, "spaced");
  assert.match(guideMarkdown(project), /0\.125 in modeled gap along 32 in/);
  assert.ok(!validate(project).some(({ id }) => id.startsWith("subfloor-joint-")));
  assert.ok(inspectCutStock(project).valid.has(first.cutStock!.id));
  const stock = homeDepotShoppingList(project).items.find(({ productId }) => productId === "203169027");
  assert.equal(stock?.quantity, 1);
  assert.equal(project.pieces.filter(({ offcut }) => offcut).length, 3);
});

test("an OSB joint stays measured after rotation and separates end spacing from a profile review", () => {
  const { project, second } = jointPractice();
  const yaw: V3 = [0, 0.377, 0];
  const rotated = { ...project, pieces: project.pieces.map((piece) => ({
    ...piece, position: rotate(piece.position, yaw),
    rotation: [piece.rotation[0], piece.rotation[1] + yaw[1], piece.rotation[2]] as V3,
  })) };
  const joint = subfloorReviews(rotated)[0].layout!.joints[0];
  assert.equal(joint.gap, 0);
  assert.ok(Math.abs(joint.length - 32) < 1e-5);

  second.position = [32, 7.6015, 20];
  const long = subfloorReviews(project)[0].layout!.joints[0];
  assert.equal(long.status, "profile");
  assert.equal(long.gap, 0);
  assert.equal(long.retainedLength, undefined);
  second.position[0] = 31.875;
  const profiledOverlap = subfloorReviews(project)[0].layout!.joints[0];
  assert.equal(profiledOverlap.gap, -0.125);
  assert.equal(profiledOverlap.status, "profile");
  assert.ok(!validate(project).some(({ id }) => id.startsWith("subfloor-joint-")));
  second.position = [0, 7.75, 60];
  assert.equal(subfloorReviews(project)[0].layout!.joints.length, 0);
  second.position = [0, 7.6015, 60];
  second.rotation[1] = 0.001;
  assert.equal(subfloorReviews(project)[0].layout!.joints.length, 0);
});

test("detect a missing bay, suggest the matching recorded scrap, and update the guide after reuse", () => {
  const { project, panel, scrap, repaired } = fixture();
  const before = subfloorReviews(project)[0].layout!;
  assert.equal(before.joistCount, 4);
  assert.equal(before.widest, 24);
  assert.deepEqual(before.issues, ["Long side B lacks ½ in bearing along 22.5 in."]);
  assert.equal(before.nails.length, 0);
  assert.match(subfloorBlockingLines(project, before.blocking)[0], /P002 and P003.+22\.5 in.+O003/);
  assert.ok(validate(project).some(({ id }) => id === `subfloor-${panel.id}`));
  assert.ok(guideIsCurrent(project));
  assert.equal(guideMarkdown(project), readFileSync(new URL("../public/examples/flooring/subfloor-guide.md", import.meta.url), "utf8"));
  assert.deepEqual(buildQuestion("Does my subfloor need blocking?"), { kind: "subfloor-support" });

  assert.ok(inspectCutStock(repaired).valid.has(scrap.cutStock!.id));
  const after = subfloorReviews(repaired)[0].layout!;
  assert.deepEqual(after.issues, []);
  assert.equal(after.nails.length, 48);
  assert.equal(new Set(after.nails.map((mark) => mark.join(","))).size, 48);
  for (const x of [-15.625, 15.625]) {
    const edge = after.nails.filter(([at]) => Math.abs(at - x) < 1e-5).map(([, , z]) => z).sort((a, b) => a - b);
    assert.equal(edge[0], -35.625);
    assert.equal(edge.at(-1), 35.625);
    assert.ok(edge.every((z, i) => !i || z - edge[i - 1] <= 6));
  }
  for (const z of [-12, 12]) {
    const row = after.nails.filter(([, , at]) => at === z).map(([x]) => x).sort((a, b) => a - b);
    assert.equal(row.length, 4);
    assert.ok(row.every((x, i) => !i || x - row[i - 1] <= 12));
  }
  assert.ok(!guideIsCurrent(repaired));
  const fresh = generateBuildGuide(repaired);
  assert.match(guideMarkdown(fresh), /48 estimated panel nailing locations/);
  const install = fresh.steps.find(({ id }) => id === fresh.pieces.find(({ id }) => id === panel.id)!.stepId)!;
  const check = fresh.steps.find(({ generated }) => generated?.kind === "subfloor-support-review")!;
  assert.ok(fresh.steps.indexOf(install) < fresh.steps.indexOf(check));
  assert.ok(reviewAssemblyOrder({ ...fresh, steps: [check, ...fresh.steps.filter(({ id }) => id !== check.id)] })
    .some(({ current, prerequisites }) => current.step.id === check.id && prerequisites.some(({ step }) => step.id === install.id)));
  assert.ok(toolChecklist(fresh).requirements.some(({ capability }) => capability === "drive-nail"));
  const withNails = addSupply(fresh, subfloorNails.id, 1, "Reviewed interior fastener option");
  const offer = homeDepotShoppingList(withNails).items.find(({ productId }) => productId === subfloorNails.internet);
  assert.equal(offer?.quantity, 1);
  assert.equal(offer?.snapshot, null);
});

test("review rotated panels, over-spaced joists, overlap, and removed panels without losing saved scope", () => {
  const { repaired, panel } = fixture();
  const yaw: V3 = [0, Math.PI / 5, 0];
  const rotated: Project = { ...repaired, pieces: repaired.pieces.map((piece) => ({
    ...piece, position: rotate(piece.position, yaw), rotation: [0, piece.rotation[1] + yaw[1], 0],
  })) };
  const result = subfloorReviews(rotated)[0].layout!;
  assert.deepEqual(result.issues, []);
  assert.equal(result.nails.length, 48);

  const moved: Project = { ...repaired, pieces: repaired.pieces.map((piece) => piece.name === "Joist 3"
    ? { ...piece, position: [piece.position[0], piece.position[1], 15] } : piece) };
  const wider = subfloorReviews(moved)[0].layout!;
  assert.deepEqual(wider.spans.map(({ problem }) => problem), [false, true, false]);
  assert.match(wider.issues.join(" "), /27 in on center/);
  assert.equal(wider.nails.length, 0);

  const narrow: Project = { ...repaired, pieces: repaired.pieces.map((piece) => piece.id === panel.id
    ? { ...piece, size: [23.75, piece.size[1], piece.size[2]] } : piece) };
  assert.match(subfloorReviews(narrow)[0].layout!.issues.join(" "), /at least 24 in wide/);
  assert.equal(subfloorReviews(narrow)[0].layout!.nails.length, 0);
  const clash: Project = { ...repaired, pieces: repaired.pieces.map((piece) => piece.name === "Joist 3"
    ? { ...piece, position: [piece.position[0], piece.position[1] + 0.25, piece.position[2]] } : piece) };
  assert.match(subfloorReviews(clash)[0].layout!.issues.join(" "), /overlaps the panel/);
  const absent = { ...repaired, pieces: repaired.pieces.filter(({ id }) => id !== panel.id) };
  assert.match(subfloorReviews(absent)[0].problem!, /missing/);
  assert.deepEqual(trackSubfloorPanel(absent, panel.id, false).subfloorChecks, []);
});


test("fit and record the blocking from a distant offcut or a new board with its measured kerf", () => {
  const { project, panel, scrap } = fixture();
  const bay = subfloorReviews(project)[0].layout!.blocking[0];
  const question = buildQuestion("Fit blocking under P10");
  assert.deepEqual(question, { kind: "subfloor-support", panelLabel: "P010" });
  const answer = answerBuildQuestion({ ...project, subfloorChecks: [] }, question!, []);
  assert.deepEqual(answer.link?.action, { kind: "subfloor-support", panelId: panel.id });
  assert.match(answer.rows![0].detail, /22.5 in/);
  const yaw: V3 = [0, Math.PI / 5, 0];
  const rotated: Project = { ...project, pieces: project.pieces.map((piece) => ({ ...piece,
    position: piece.id === scrap.id ? [120, 0, 120] : rotate(piece.position, yaw),
    rotation: [0, piece.rotation[1] + yaw[1], 0],
  })) };
  const reuse = previewSubfloorBlocking(rotated, panel.id, bay.id, "under-sheet", "prefer-offcut");
  assert.equal(reuse.source?.id, scrap.id);
  assert.ok(reuse.sourceOnHand);
  assert.equal(reuse.sourceLength, 22.5);
  assert.deepEqual(reuse.operations, []);
  assert.ok(Math.hypot(...reuse.block.position) < 25);
  assert.equal(reuse.block.cutStock?.id, scrap.cutStock?.id);
  assert.equal(reuse.project.history.at(-1)?.offcutCut?.inputId, scrap.id);
  assert.equal(rotated.pieces.length, project.pieces.length);
  assert.equal(rotated.pieces.find(({ id }) => id === scrap.id)?.offcut, true);
  assert.equal(subfloorReviews(reuse.project)[0].layout?.nails.length, 48);
  assert.throws(() => previewSubfloorBlocking(reuse.project, panel.id, bay.id, "under-sheet", "prefer-offcut"), /bay changed/);

  const configured = { ...project, woodKerfs: { "two-eight": 0.0625 } };
  const fresh = previewSubfloorBlocking(configured, panel.id, bay.id, "centered", "new-board");
  assert.equal(fresh.source, null);
  assert.equal(fresh.sourceLength, 96);
  assert.equal(fresh.kerfLoss, 0.0625);
  assert.equal(fresh.block.position[0], 16);
  assert.equal(fresh.block.cutStock?.woodKerf, 0.0625);
  assert.deepEqual(fresh.operations, ["Crosscut to 22.5 in"]);
  assert.deepEqual(fresh.offcuts[0].size, [1.5, 73.4375, 7.25]);
  assert.ok(inspectCutStock(fresh.project).valid.has(fresh.block.cutStock!.id));
  assert.equal(fresh.project.history.at(-1)?.offcutCut?.cuts[0].kind, "crosscut");
  assert.equal(fresh.project.pieces.find(({ id }) => id === scrap.id)?.offcut, true);
  const purchase = homeDepotShoppingList(fresh.project).items.find(({ productId }) => productId === "100049292");
  assert.equal(purchase?.snapshot, undefined);
  assert.equal(purchase?.quantity, 4);
  assert.equal(homeDepotShoppingList(reuse.project).items.find(({ productId }) => productId === "100049292")?.quantity, 3);
});

test("reject real blocking interference while preserving the original build and cut pool", () => {
  const { project, panel, scrap } = fixture();
  const bay = subfloorReviews(project)[0].layout!.blocking[0];
  const obstruction = { ...scrap, id: crypto.randomUUID(), name: "Existing pipe chase", size: [2, 2, 8] as V3,
    position: [15.25, 3, 0] as V3, offcut: false, cutStock: null };
  const blocked = { ...project, pieces: [...project.pieces, obstruction] };
  assert.throws(() => previewSubfloorBlocking(blocked, panel.id, bay.id, "under-sheet", "prefer-offcut"), /Existing pipe chase obstructs/);
  assert.ok(blocked.pieces.find(({ id }) => id === scrap.id)?.offcut);
  assert.equal(blocked.history.length, project.history.length);
});


test("preview flags blocking that stops a recorded slide between its open and closed positions", () => {
  const { project, panel } = fixture();
  const slide = part("Service drawer", "plywood", [2, 1, 2], [8, 1, 0], project.steps[0].id, "Access opening");
  const { project: withMotion } = saveMotionPlan({ ...project, pieces: [...project.pieces, slide] }, {
    label: "Service drawer", memberIds: [slide.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const bay = subfloorReviews(withMotion)[0].layout!.blocking[0];
  const drafted = previewSubfloorBlocking(withMotion, panel.id, bay.id, "under-sheet", "prefer-offcut");
  assert.deepEqual(drafted.motionConflicts, ["Service drawer"]);
  assert.ok(!withMotion.pieces.some(({ id }) => id === drafted.block.id));
});

test("save the adhesive takeoff with the sheet installation and review it again when contact changes", () => {
  const { project, repaired, panel } = fixture();
  const review = (source: Project) => reviewSubfloorAdhesive(source, subfloorReviews(source, [panel.id])[0]);
  assert.match(review(project).problem!, /support and spacing/);
  const initial = review(repaired);
  assert.equal(initial.saved, false);
  const layout = initial.layout!;
  assert.equal(layout.runs.length, 10);
  assert.ok(layout.runs.every(({ points }) => points.every(([, y]) => Math.abs(y - 7.25) < 1e-5)));
  assert.ok(layout.inches > 260 && layout.inches < 262);
  const saved = saveSubfloorAdhesive(repaired, panel.id, layout.signature);
  assert.equal(review(projectSchema.parse(JSON.parse(JSON.stringify(saved)))).planCurrent, true);
  assert.deepEqual(subfloorAdhesiveTakeoff(saved), { inches: layout.inches, required: 1 });
  assert.equal(homeDepotPurchaseNeeds(saved).find(({ id }) => id === subfloorAdhesive.id)?.canAdd, true);
  const withSupply = addHomeDepotPurchaseNeed(saved, subfloorAdhesive.id);
  const item = homeDepotShoppingList(withSupply).items.find(({ productId }) => productId === subfloorAdhesive.internet);
  assert.equal(item?.quantity, 1);
  assert.equal(item?.snapshot, null);
  assert.ok(toolChecklist(saved).requirements.some(({ capability }) => capability === "apply-quart-sealant"));
  const guide = generateBuildGuide(saved);
  assert.match(guide.steps.find(({ id }) => id === guide.pieces.find(({ id }) => id === panel.id)!.stepId)!.notes,
    /Install and check the joists and blocking first.*seat and fasten/);
  assert.match(guideMarkdown(guide), /Subfloor adhesive[\s\S]*1 × 28 fl oz LNP-902 cartridge/);
  assert.deepEqual(buildQuestion("Plan subfloor adhesive under P10"), { kind: "subfloor-support", panelLabel: "P010" });
  const moved: Project = { ...saved, pieces: saved.pieces.map((piece) => ({
    ...piece, position: [piece.position[0] + 3, piece.position[1], piece.position[2]],
  })) };
  assert.match(review(moved).problem!, /bearing strips changed/);
  assert.throws(() => saveSubfloorAdhesive(moved, panel.id, layout.signature), /bearing strips changed/);
  assert.equal(subfloorAdhesiveTakeoff(moved).required, null);
  assert.equal(homeDepotPurchaseNeeds(moved).find(({ id }) => id === subfloorAdhesive.id)?.canAdd, false);
  assert.ok(validate(moved).some(({ id }) => id === `subfloor-adhesive-${panel.id}`));
  assert.deepEqual(saveSubfloorAdhesive(moved, panel.id, null).subfloorAdhesivePlans, []);
});

test("neighboring sheets get separate bead paths on their shared joist and share the cartridge budget", () => {
  const { project } = fixture();
  const stepId = project.steps[0].id;
  const rows = [-39.3125, -20.0625, 0, 20.0625, 39.3125];
  const joists = rows.map((z) => ({
    ...part("Joist", "two-eight", [1.5, 7.25, 32], [0, 3.625, z], stepId, "Floor"),
    rotation: [0, Math.PI / 2, 0] as V3,
  }));
  const blocks = rows.slice(1).flatMap((end, i) => [-15.25, 15.25].map((x) =>
    part("Blocking", "two-eight", [1.5, 7.25, end - rows[i] - 1.5],
      [x, 3.625, (end + rows[i]) / 2], stepId, "Floor")));
  const sheets = [-20.0625, 20.0625].map((z) => part("Deck", "hd-osb-subfloor-486701",
    [32, 0.703, 40], [0, 7.6015, z], stepId, "Floor"));
  let assembly: Project = { ...project, pieces: [...joists, ...blocks, ...sheets], subfloorChecks: [] };
  const layouts = subfloorReviews(assembly, sheets.map(({ id }) => id)).map((review) => {
    const adhesive = reviewSubfloorAdhesive(assembly, review);
    assert.equal(adhesive.problem, undefined);
    return adhesive.layout!;
  });
  assert.ok(layouts[0].runs.find(({ supportId }) => supportId === joists[2].id)!.points.every(([, , z]) => z < -0.0625));
  assert.ok(layouts[1].runs.find(({ supportId }) => supportId === joists[2].id)!.points.every(([, , z]) => z > 0.0625));
  for (const [index, panel] of sheets.entries()) assembly = saveSubfloorAdhesive(assembly, panel.id, layouts[index].signature);
  assert.deepEqual(subfloorAdhesiveTakeoff(assembly), { required: 1, inches: layouts[0].inches + layouts[1].inches });
});

test("record nails by receiver, reject a path through a retained opening, and remove stale purchase quantities", () => {
  const { repaired, panel, scrap } = fixture();
  const standard = (source: Project) => reviewSubfloorFastening(source, subfloorReviews(source, [panel.id])[0], "deformed-6d");
  const common = (source: Project) => reviewSubfloorFastening(source, subfloorReviews(source, [panel.id])[0], "common-8d");
  assert.equal(standard(repaired).marks, 48);
  const layout = common(repaired);
  assert.equal(layout.ready, true);
  assert.equal(layout.groups.length, 10);
  assert.equal(layout.groups.reduce((sum, { count }) => sum + count, 0), 48);
  assert.equal(layout.groups.find(({ id }) => id === scrap.id)?.count, 3);
  const fastened = saveSubfloorFastening(repaired, panel.id, { schedule: "common-8d", signature: layout.signature });
  assert.equal(common(projectSchema.parse(JSON.parse(JSON.stringify(fastened)))).current, true);
  assert.deepEqual(subfloorCommonNailTakeoff(fastened), { marks: 48, required: 1 });
  const shopping = homeDepotShoppingList(addHomeDepotPurchaseNeed(fastened, subfloorNails.id));
  const supply = shopping.items.find(({ productId }) => productId === subfloorNails.internet);
  assert.equal(supply?.quantity, 1);
  assert.equal(supply?.snapshot, null);
  assert.ok(toolChecklist(fastened).requirements.some(({ capability, necessity }) =>
    capability === "drive-nail" && necessity === "required"));
  const guide = generateBuildGuide(fastened);
  assert.match(guideMarkdown(guide), /Subfloor fasteners[\s\S]+48 nails total · estimated 1 × 1-lb box/);
  assert.match(guide.steps.find(({ id }) => id === guide.pieces.find(({ id }) => id === panel.id)!.stepId)!.notes,
    /48 reviewed Grip-Rite 8C1/);

  const cut: Project = { ...fastened, pieces: fastened.pieces.map((piece) => piece.id === scrap.id ? {
    ...piece, cutStock: null, rectangularOpenings: [{ axis: 0, center: [1.96, 0], spans: [0.2, 3] }],
  } : piece) };
  assert.equal(subfloorReviews(cut)[0].layout!.nails.length, 48);
  assert.equal(standard(cut).ready, true);
  assert.match(common(cut).problem!, /1 of 48 marks need one unbroken wood path/);
  assert.equal(common(cut).problemMarks.length, 1);
  assert.equal(homeDepotPurchaseNeeds(cut).find(({ id }) => id === subfloorNails.id)?.canAdd, false);
  assert.ok(validate(cut).some(({ id }) => id === `subfloor-fasteners-${panel.id}`));
  assert.throws(() => saveSubfloorFastening(cut, panel.id, { schedule: "common-8d", signature: layout.signature }), /paths changed/);
  const revised = saveSubfloorFastening(cut, panel.id, { schedule: "deformed-6d", signature: standard(cut).signature });
  assert.equal(subfloorCommonNailTakeoff(revised), null);
  assert.match(guideMarkdown(revised), /48 × 6d ring- or screw-shank/);
});

test("pool common-nail counts across sheets, pause changed plans, and flag treated wood", () => {
  const { repaired, panel, scrap } = fixture();
  const sheets: string[] = [];
  const pieces = [0, 200, 400].flatMap((offset) => repaired.pieces.filter(({ offcut }) => !offcut)
    .map((piece) => {
      const id = crypto.randomUUID();
      if (piece.id === panel.id) sheets.push(id);
      return { ...piece, id, cutStock: null, position: [piece.position[0], piece.position[1], piece.position[2] + offset] as V3 };
    }));
  let assembly: Project = { ...repaired, pieces, subfloorChecks: sheets };
  for (const review of subfloorReviews(assembly)) {
    const preview = reviewSubfloorFastening(assembly, review, "common-8d");
    assert.ok(preview.ready);
    assembly = saveSubfloorFastening(assembly, review.panelId, { schedule: "common-8d", signature: preview.signature });
  }
  assert.deepEqual(subfloorCommonNailTakeoff(assembly), { marks: 144, required: 2 });
  const shifted: Project = { ...assembly, pieces: assembly.pieces.map((piece) => piece.position[2] < 100 ? {
    ...piece, position: [piece.position[0] + 1, piece.position[1], piece.position[2]],
  } : piece) };
  assert.deepEqual(subfloorCommonNailTakeoff(shifted), { marks: null, required: null });
  const treated: Project = { ...repaired, pieces: repaired.pieces.map((piece) => piece.id === scrap.id ?
    { ...piece, material: "treated", cutStock: null } : piece) };
  assert.match(reviewSubfloorFastening(treated, subfloorReviews(treated)[0], "common-8d").problem!, /treated framing/);
  assert.deepEqual(buildQuestion("How many nails for P10?"), { kind: "subfloor-support", panelLabel: "P010" });
});

function supportedFloor(length: number, startWidth = 1.5) {
  const { repaired, panel } = fixture();
  const step = repaired.steps[0].id;
  const pieces = repaired.pieces.map((piece) => ({
    ...piece, position: [piece.position[0], piece.position[1] + 7.25, piece.position[2]] as V3,
    ...(piece.name.startsWith("Joist ") ? { size: [1.5, 7.25, length] as V3, cutStock: null } : {}),
  }));
  const first = part("Start support", "two-eight", [startWidth, 7.25, 74], [(startWidth - length) / 2, 3.625, 0], step, "Bearing");
  const last = part("Far support", "two-eight", [1.5, 7.25, 74], [(length - 1.5) / 2, 3.625, 0], step, "Bearing");
  const center = part("Middle support", "two-eight", [1.5, 7.25, 74], [0, 3.625, 0], step, "Bearing");
  return { project: { ...repaired, pieces: [...pieces, first, last] }, panel, first, last, center };
}

test("follow actual wood seats, show an end shortage and flag a modeled overhang", () => {
  const { project, panel, first, last } = supportedFloor(36, 0.75);
  const view = (p: Project) => reviewSubfloorJoists(p, subfloorReviews(p)[0]);
  const rows = view(project).rows;
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.ends[0].inches, 0.75);
    assert.equal(row.ends[0].supportId, first.id);
    assert.match(row.ends[0].issue!, /0\.75 in more wood seat/);
    assert.equal(row.ends[1].inches, 1.5);
    assert.equal(row.ends[1].supportId, last.id);
    assert.deepEqual(row.clear, []);
    assert.ok(row.marks[0].problem);
  }
  const shifted: Project = { ...project, pieces: project.pieces.map((piece) => piece.id === first.id
    ? { ...piece, position: [piece.position[0] + 2, piece.position[1], piece.position[2]] } : piece) };
  assert.match(view(shifted).rows[0].ends[0].issue!, /2 in inboard/);
  const saved = saveSubfloorJoists(project, panel.id, { reference: null });
  assert.ok(validate(saved).some(({ title, detail }) => title === "Review joist P001" && detail.includes("0.75 in more")));
  assert.match(guideMarkdown(generateBuildGuide(saved)), /Joist bearing and span[\s\S]*0.75 in more wood seat/);
  assert.deepEqual(buildQuestion("Check joist bearing under P10"), { kind: "subfloor-support", panelLabel: "P010" });
});

test("compare clear spans to the confirmed table row and recalculate after an interior support", () => {
  const { project, panel, center } = supportedFloor(121);
  assert.throws(() => saveSubfloorJoists(project, panel.id, { reference: { species: "syp", spacing: 16 } }), /actual maximum spacing/);
  const saved = saveSubfloorJoists(project, panel.id, { reference: { species: "syp", spacing: 24 } });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const [inspection] = subfloorJoistReviews(reopened);
  assert.equal(inspection.referenceProblem, undefined);
  assert.ok(inspection.rows.every(({ clear, limit, issue }) => clear[0] === 118 && limit === 106 && issue?.includes("1 ft")));
  assert.match(guideMarkdown(generateBuildGuide(saved)), /Clear span 118 in · reference limit 106 in/);
  const added = { ...saved, pieces: [...saved.pieces, center] };
  const [withCenter] = subfloorJoistReviews(added);
  for (const row of withCenter.rows) {
    assert.equal(row.clear.length, 2);
    assert.ok(row.clear.every((span) => Math.abs(span - 58.25) < 1e-5));
    assert.equal(row.issue, undefined);
    assert.ok(row.supportIds.includes(center.id));
    assert.ok(row.marks.every(({ problem }) => !problem));
  }
  const yaw: V3 = [0, Math.PI / 7, 0];
  const rotated: Project = { ...added, pieces: added.pieces.map((piece) => ({
    ...piece, position: rotate(piece.position, yaw), rotation: [0, piece.rotation[1] + yaw[1], 0],
  })) };
  assert.ok(subfloorJoistReviews(rotated)[0].rows.every(({ clear, issue }) =>
    clear.length === 2 && clear.every((span) => Math.abs(span - 58.25) < 1e-5) && !issue));
  const changed: Project = { ...added, pieces: added.pieces.map((piece) => piece.name === "Joist 1"
    ? { ...piece, material: "treated" } : piece) };
  assert.match(subfloorJoistReviews(changed)[0].referenceProblem!, /Confirm the species and grade stamps again/);
  assert.ok(subfloorJoistReviews(changed)[0].rows.every(({ limit }) => limit === null));
});
