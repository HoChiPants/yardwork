import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clipBox } from "../src/cutProfiles";
import { inspectCutStock } from "../src/cutStock";
import { flatCasing } from "../src/doorCasingReference";
import { bom, guideMarkdown, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { projectSchema } from "../src/model";
import { proposalMotionChanges } from "../src/motionImpact";
import { previewProposalStock } from "../src/proposalStock";
import { planStockCutLayouts } from "../src/recordStockCutLayout";
import { previewScribeFiller, scribeFillerReviews } from "../src/scribeFiller";

const example = new URL("../public/examples/wood-stock/cabinet-scribe-filler.yardwork.json", import.meta.url);
const openExample = () => projectSchema.parse(JSON.parse(readFileSync(example, "utf8")));

test("scribed filler geometry intervenes in actual motion and can be set back using the measured wall marks", () => {
  const project = openExample();
  const [panel] = project.pieces;
  const input = {
    panelId: panel.id, side: "right", front: "front", stock: flatCasing.id, start: 0, height: 30,
    bottom: 2, middle: 1.75, top: 1.5, wallGap: 0.125, setback: 0,
  } as const;
  assert.throws(() => previewScribeFiller(project, { ...input, middle: 1.5 }, true), /Trace the actual wall contour/);
  const flush = previewScribeFiller(project, input, true);
  assert.match(proposalMotionChanges(project, flush.project)[0].detail, /Adjacent sliding door against P003 · Cabinet wall filler/);
  const inset = previewScribeFiller(project, { ...input, setback: 0.875 }, true);
  assert.deepEqual(proposalMotionChanges(project, inset.project), []);
  const vertices = clipBox(inset.filler.size, inset.filler.cutPlanes).vertices;
  const widthAt = (y: number) => Math.max(...vertices.filter((v) => Math.abs(v[1] - y) < 1e-6).map((v) => v[0])) + 2.25 / 2;
  assert.ok(Math.abs(widthAt(-15) - 1.875) < 1e-6);
  assert.ok(Math.abs(widthAt(15) - 1.375) < 1e-6);
  assert.equal(bom(inset.project).find(({ id }) => id === flatCasing.id)?.quantity, 0);
  assert.ok(inspectCutStock(inset.project).valid.has(inset.match!.piece.cutStock!.id));
  assert.equal(project.scribeFillers, undefined);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(inset.project)));
  assert.equal(scribeFillerReviews(reopened)[0].issue, undefined);
  assert.match(guideMarkdown(reopened), /Mark 1.875 in at the bottom and 1.375 in at the top/);
  const moved = { ...reopened, pieces: reopened.pieces.map((piece) =>
    piece.id === panel.id ? { ...piece, position: [0.5, 15, 0] as [number, number, number] } : piece) };
  assert.match(validate(moved).find(({ id }) => id === `scribe-filler-${inset.filler.id}`)?.detail ?? "", /Recheck all three wall gaps/);
});

test("a new filler preserves its profiled blank and expected remainder on an exact pine board order", () => {
  const project = openExample();
  const draft = previewScribeFiller(project, {
    panelId: project.pieces[0].id, side: "right", front: "front", stock: flatCasing.id, start: 0, height: 30,
    bottom: 2, middle: 1.75, top: 1.5, wallGap: 0.125, setback: 0.875,
  }, false);
  const { recordable } = previewProposalStock(project, draft.project, null);
  const ordered = planStockCutLayouts(draft.project, recordable.map(({ layout }) => layout)).project;
  assert.equal(homeDepotShoppingList(ordered).items.find(({ productId }) => productId === flatCasing.internet)?.quantity, 1);
  assert.equal(scribeFillerReviews(ordered)[0].issue, undefined);
  assert.equal(ordered.plannedCutSources?.length, 1);
  assert.equal(inspectCutStock(ordered).invalid.length, 0);
});
