import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Box3, Euler, Matrix4, Vector3 } from "three";
import {
  applyCommand,
  blank,
  coop,
  part,
  parsePrompt,
  projectSchema,
} from "../src/model";
import {
  bom,
  bounds,
  connect,
  cutPiece,
  guideMarkdown,
  parseDxf,
  parseInventory,
  recordChanges,
  shoppingCsv,
  usableInventory,
  validate,
} from "../src/engine";
import { ConflictError, ProjectStore } from "../server/storage";
function withBoard() {
  const p = blank();
  p.pieces.push(
    part(
      "Test board",
      "stud",
      [1.5, 96, 3.5],
      [0, 48, 0],
      p.steps[0].id,
      "Test",
    ),
  );
  return p;
}
test("templates round-trip with valid part and step references", () => {
  for (const p of [
    coop(),
    applyCommand(blank(), {
      type: "wall",
      width: 96,
      height: 72,
      depth: 48,
      spacing: 16,
    }),
    applyCommand(blank(), {
      type: "foundation",
      width: 72,
      height: 48,
      depth: 48,
      spacing: 16,
    }),
  ])
    assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))), p);
});
test("wall includes two plates, edge studs, and exact requested overall dimensions", () => {
  const p = applyCommand(blank(), {
    type: "wall",
    width: 96,
    height: 72,
    depth: 48,
    spacing: 16,
  });
  assert.equal(p.pieces.length, 9);
  const b = p.pieces.map(bounds);
  assert.equal(Math.min(...b.map((x) => x.min[0])), -48);
  assert.equal(Math.max(...b.map((x) => x.max[0])), 48);
  assert.equal(Math.min(...b.map((x) => x.min[1])), 0);
  assert.equal(Math.max(...b.map((x) => x.max[1])), 72);
  assert.equal(
    p.pieces.filter((x) => x.name.includes("stud"))[1].position[0],
    -32,
  );
});
test("local commands handle explicit units, dimensions, and spacing without invented AI", () => {
  assert.deepEqual(
    parsePrompt("wall 8 ft wide and 6 ft tall, 24 inches on center"),
    { type: "wall", width: 96, height: 72, depth: 48, spacing: 24 },
  );
  assert.equal(parsePrompt("wall 96 inches wide, 72 inches tall").width, 96);
  assert.equal(parsePrompt("base 6 by 4 ft").depth, 48);
  assert.equal(parsePrompt("wall 96 x 72 inches").height, 72);
  assert.equal(parsePrompt("a chicken coop").type, "coop");
  assert.throws(() => parsePrompt("wall"), /Include dimensions/);
  assert.throws(() => parsePrompt("a castle"), /Try/);
  assert.throws(() => parsePrompt("wall 200 ft wide, 9 ft tall"));
});
test("cut conserves length minus kerf, retains position, and reuses a single stock board", () => {
  const p = withBoard(),
    original = structuredClone(p);
  const next = cutPiece(p, p.pieces[0].id, 48);
  assert.deepEqual(p, original);
  assert.equal(next.pieces.length, 2);
  assert.equal(next.pieces[0].size[1], 48);
  assert.equal(next.pieces[1].size[1], 47.875);
  assert.equal(next.pieces[0].position[1], 24);
  assert.equal(next.pieces[1].position[1], 72.0625);
  assert.equal(next.pieces[1].offcut, true);
  assert.equal(bom(next)[0].quantity, 1);
  assert.throws(() => cutPiece(p, p.pieces[0].id, 96));
  assert.throws(() => cutPiece(p, p.pieces[0].id, -1));
  assert.throws(() => cutPiece(p, p.pieces[0].id, NaN));
});
test("rotated cuts preserve local-axis alignment", () => {
  const p = withBoard();
  p.pieces[0].rotation = [0, 0, Math.PI / 2];
  const next = cutPiece(p, p.pieces[0].id, 48);
  assert.ok(Math.abs(next.pieces[0].position[0] - 24) < 1e-9);
  assert.ok(Math.abs(next.pieces[1].position[0] + 24.0625) < 1e-9);
});
test("bounds match Three.js XYZ rotations on all axes", () => {
  const p = withBoard().pieces[0];
  p.rotation = [0.3, 0.8, 1.2];
  const b = bounds(p);
  const expected = new Box3(
    new Vector3(...p.size.map((v) => -v / 2)),
    new Vector3(...p.size.map((v) => v / 2)),
  )
    .applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...p.rotation)))
    .translate(new Vector3(...p.position));
  [0, 1, 2].forEach((i) => {
    assert.ok(Math.abs(b.min[i] - expected.min.getComponent(i)) < 1e-8);
    assert.ok(Math.abs(b.max[i] - expected.max.getComponent(i)) < 1e-8);
  });
});
test("BOM accounts for kerf and flags oversized pieces rather than underquoting", () => {
  const p = withBoard();
  p.pieces[0].size[1] = 48;
  p.pieces.push({ ...structuredClone(p.pieces[0]), id: crypto.randomUUID() });
  assert.equal(bom(p)[0].quantity, 2);
  p.pieces[1].size[1] = 47.875;
  assert.equal(bom(p)[0].quantity, 1);
  p.pieces[1].size[1] = 120;
  assert.equal(bom(p)[0].oversize, 1);
  assert.ok(validate(p).some((x) => x.id === "stock-stud"));
});
test("connections require real nearby parts and stale connections are detected", () => {
  const p = withBoard();
  const b = part(
    "Plate",
    "stud",
    [12, 1.5, 3.5],
    [0, 96.75, 0],
    p.steps[0].id,
    "Test",
  );
  p.pieces.push(b);
  const next = connect(p, p.pieces[0].id, b.id, p.steps[0].id, 4, 3);
  assert.equal(next.joints.length, 1);
  assert.equal(bom(next).find((r) => r.id === "screw")?.quantity, 1);
  assert.throws(() => connect(p, b.id, b.id, p.steps[0].id));
  next.pieces[1].position[0] = 300;
  assert.ok(validate(next).some((x) => x.id === next.joints[0].id));
  assert.throws(() => connect(next, next.pieces[0].id, b.id, p.steps[0].id));
});
test("support and collision checks distinguish missing support from overlapping solids", () => {
  const p = withBoard();
  assert.ok(!validate(p).some((f) => f.id === "floating"));
  p.pieces[0].position[1] += 12;
  assert.ok(validate(p).some((f) => f.id === "floating"));
  p.pieces.push({ ...structuredClone(p.pieces[0]), id: crypto.randomUUID() });
  assert.ok(validate(p).some((f) => f.id === "collision"));
});
test("inventory is scoped to exact store, ZIP, and freshness, and shortfalls are reported", () => {
  const p = withBoard();
  p.store = "4409";
  p.inventory = parseInventory(
    JSON.stringify([
      {
        material: "stud",
        internetNumber: "123456789",
        name: "User verified snapshot",
        price: 5,
        available: 0,
        store: "4409",
        zip: "84121",
        checkedAt: new Date().toISOString(),
        url: "https://www.homedepot.com/p/example/123456789",
      },
    ]),
  );
  assert.equal(usableInventory(p, "stud")?.price, 5);
  assert.ok(validate(p).some((f) => f.id === "short-stud"));
  assert.equal(bom(p)[0].price, 5);
  p.zip = "84101";
  assert.equal(usableInventory(p, "stud"), undefined);
  p.zip = "84121";
  p.store = "";
  assert.equal(usableInventory(p, "stud"), undefined);
  p.store = "4409";
  p.inventory[0].checkedAt = "2020-01-01T00:00:00.000Z";
  assert.equal(usableInventory(p, "stud"), undefined);
  p.inventory[0].checkedAt = "2099-01-01T00:00:00.000Z";
  assert.equal(usableInventory(p, "stud"), undefined);
  assert.throws(() =>
    parseInventory(
      JSON.stringify([{ ...p.inventory[0], url: "https://attacker.example" }]),
    ),
  );
});
test("JSON validation rejects orphaned parts and duplicated IDs", () => {
  const p = withBoard();
  p.pieces[0].stepId = crypto.randomUUID();
  assert.throws(() => projectSchema.parse(p));
  p.pieces = [];
  p.steps.push(p.steps[0]);
  assert.throws(() => projectSchema.parse(p));
});
test("DXF import reads LINE geometry, respects units, rejects unsupported and invalid drawings", () => {
  const dxf =
    "0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n6\n21\n4\n0\nENDSEC\n0\nEOF\n";
  const [line] = parseDxf(dxf, 12);
  assert.deepEqual(line.b, [72, 0.1, 48]);
  assert.throws(() => parseDxf("0\nCIRCLE\n", 1));
  assert.throws(() => parseDxf(dxf, 0));
  assert.throws(() => parseDxf("0\nLINE\n10\nNaN\n20\n0\n11\n3\n21\n3\n", 1));
});
test("exports retain quantities and ordered manual instructions", () => {
  const p = withBoard();
  p.name = 'Test, "coop"';
  p.steps[0].notes = "Check square before fastening.";
  assert.match(guideMarkdown(p), /Check square before fastening/);
  assert.match(shoppingCsv(p), /UNVERIFIED/);
  assert.match(shoppingCsv(p), /Stock units to buy/);
  assert.match(guideMarkdown(p), /P001 · Test board: 1.5 in × 96 in × 3.5 in/);
});
test("project storage persists atomically, rejects path traversal, and prevents lost updates", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yardwork-test-"));
  try {
    const store = new ProjectStore(dir),
      p = withBoard();
    const saved = await store.save(p, 0);
    assert.equal(saved.revision, 1);
    const reopened = new ProjectStore(dir);
    assert.equal((await reopened.get(p.id))?.project.pieces.length, 1);
    assert.equal((await reopened.list()).length, 1);
    const outcomes = await Promise.allSettled([
      store.save({ ...p, name: "A" }, 1),
      store.save({ ...p, name: "B" }, 1),
    ]);
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      outcomes.filter(
        (x) => x.status === "rejected" && x.reason instanceof ConflictError,
      ).length,
      1,
    );
    await assert.rejects(store.get("../../etc/passwd"));
    assert.equal((await reopened.get(p.id))?.revision, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("operation history survives exports and coop generation preserves the saved project ID", () => {
  const p = withBoard();
  const cut = recordChanges(p, cutPiece(p, p.pieces[0].id, 24));
  assert.ok(cut.history.some((h) => h.message.includes("Cut Test board")));
  assert.match(guideMarkdown(cut), /Operation: Cut Test board/);
  const generated = applyCommand(cut, {
    type: "coop",
    width: 72,
    height: 48,
    depth: 48,
    spacing: 16,
  });
  assert.equal(generated.id, p.id);
  assert.deepEqual(generated.history, cut.history);
  assert.equal(bom(coop()).find((r) => r.id === "roof")?.oversize, 0);
});
