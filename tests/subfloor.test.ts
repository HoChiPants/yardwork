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
