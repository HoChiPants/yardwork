import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { buildQuestion } from "../src/buildQuestions";
import { inspectCutStock } from "../src/cutStock";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { projectSchema, type Project, type V3 } from "../src/model";
import { rotate } from "../src/spatial";
import { subfloorBlockingLines, subfloorReviews, trackSubfloorPanel } from "../src/subfloor";
import { subfloorNails } from "../src/subfloorReference";
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
