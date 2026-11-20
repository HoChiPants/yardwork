import test from "node:test";
import assert from "node:assert/strict";
import { recipeParts, type PlanModule } from "../src/planning";
import { bounds } from "../src/engine";
import { uid } from "../src/model";

function recipe(
  kind: "shelf" | "cabinet",
  panelMaterial: "plywood" | "plytanium-703",
  height: number,
): PlanModule {
  return {
    kind,
    name: "Framed shelf clearance",
    width: 36,
    depth: 16,
    height,
    position: [0, 0, 0],
    yaw: 0,
    frameMaterial: "stud",
    panelMaterial,
    backHeight: 0,
    levels: 6,
    storage: false,
    openingLid: false,
    lidOpen: false,
  };
}
test("short framed shelves reject physically overlapping interior panels at both stock thicknesses", () => {
  for (const kind of ["shelf", "cabinet"] as const)
    for (const panel of ["plywood", "plytanium-703"] as const)
      assert.throws(
        () => recipeParts(recipe(kind, panel, 8), uid(), "Short frame"),
        /no clear spacing between interior shelves/,
      );
});
test("one interior shelf must also clear the underside of the top framing", () => {
  for (const kind of ["shelf", "cabinet"] as const)
    for (const panel of ["plywood", "plytanium-703"] as const) {
      const low = {
        ...recipe(kind, panel, 9),
        depth: 24,
        frameMaterial: "two-eight" as const,
        levels: 2,
      };
      assert.throws(
        () => recipeParts(low, uid(), "Low framed shelf"),
        /beneath the top framing/,
      );
      const tall = recipeParts(
        { ...low, height: 12 },
        uid(),
        "Separated shelf",
      );
      const shelf = tall.find((p) => / · shelf 1$/.test(p.name))!;
      const rail = tall.find((p) => / · top cross rail$/.test(p.name))!;
      assert.ok(bounds(rail).min[1] > bounds(shelf).max[1]);
    }
});
test("ordinary framed shelving retains separated interior shelves with its selected source thickness", () => {
  for (const kind of ["shelf", "cabinet"] as const)
    for (const panel of ["plywood", "plytanium-703"] as const) {
      const pieces = recipeParts(recipe(kind, panel, 48), uid(), "Tall frame"),
        shelves = pieces
          .filter((p) => / · shelf \d+$/.test(p.name))
          .sort((a, b) => a.position[1] - b.position[1]);
      assert.equal(shelves.length, 5);
      for (let i = 1; i < shelves.length; i++)
        assert.ok(bounds(shelves[i]).min[1] > bounds(shelves[i - 1]).max[1]);
      assert.ok(
        shelves.every(
          (p) =>
            Math.abs(p.size[1] - (panel === "plytanium-703" ? 0.703 : 0.75)) <
            1e-8,
        ),
      );
    }
});
