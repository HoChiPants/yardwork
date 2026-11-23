import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectCutStock } from "../src/cutStock";
import { bom, guideMarkdown, validate } from "../src/engine";
import { furnitureBraceReviews, previewFurnitureBrace } from "../src/furnitureBrace";
import { homeDepotShoppingList } from "../src/handoff";
import { applyCommand, blank, projectSchema, type V3 } from "../src/model";
import { previewProposalStock } from "../src/proposalStock";
import { planStockCutLayouts } from "../src/recordStockCutLayout";
import { transformSection } from "../src/sections";

const fixture = new URL("../public/examples/wood-stock/workbench-diagonal-brace.yardwork.json", import.meta.url);

test("fits a square-ended brace to both posts, keeps its scrap and rechecks the measured contact", () => {
  const project = projectSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));
  const [first, second] = project.pieces;
  const input = {
    firstId: first.id, secondId: second.id, face: "-Z", firstHeight: 3.5,
    secondHeight: 30.5, extension: 1.5, stock: "hd-pine-1x4",
  } as const;
  const fit = previewFurnitureBrace(project, input, true);
  assert.equal(fit.geometry.length, 48);
  assert.ok(fit.contacts.every((area) => area > 12 && area < 13));
  assert.ok(fit.project.sections[0].pieceIds.includes(fit.brace.id));
  assert.equal(bom(fit.project).find(({ id }) => id === input.stock)?.quantity, 0);
  assert.equal(inspectCutStock(fit.project).invalid.length, 0);
  assert.ok(!project.furnitureBraces);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(fit.project)));
  const [section] = reopened.sections;
  const turned = transformSection(reopened, section.id, [12, section.origin[1], -12], [0, Math.PI / 3, 0]);
  assert.ok(furnitureBraceReviews(turned)[0].contacts);
  assert.match(guideMarkdown(turned), /Square-cut the board to 48 in/);
  assert.match(validate(turned).find(({ id }) => id.startsWith("furniture-frame-"))?.detail ?? "", /modeled contact at both posts/);
  const displaced = (basis: typeof turned) => ({
    ...basis, pieces: basis.pieces.map((piece) => piece.id === first.id
      ? { ...piece, position: piece.position.map((value, axis) => value + (axis === 2 ? 0.25 : 0)) as V3 } : piece),
  });
  assert.throws(() => previewFurnitureBrace(displaced(project), input, true), /share one plane/);
  assert.match(furnitureBraceReviews(displaced(reopened))[0].issue ?? "", /share one plane/);

  const fresh = previewFurnitureBrace(project, input, false);
  const { recordable } = previewProposalStock(project, fresh.project, null);
  const allocated = planStockCutLayouts(fresh.project, recordable.map(({ layout }) => layout)).project;
  assert.equal(homeDepotShoppingList(allocated).items.find(({ productId }) => productId === "301993221")?.quantity, 1);
  assert.equal(allocated.plannedCutSources?.length, 1);
});

test("rotating an open framed wall around vertical leaves its sideways bracing review visible", () => {
  const project = applyCommand(blank(), { type: "wall", width: 96, height: 96, depth: 48, spacing: 16 });
  const [wall] = project.sections;
  const rotated = transformSection(project, wall.id, wall.origin, [0, Math.PI / 4, 0]);
  assert.ok(validate(rotated).some(({ id }) => id === `racking-${wall.id}`));
});
