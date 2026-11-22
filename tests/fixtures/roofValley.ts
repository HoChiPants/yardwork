import { blank, part, uid, type V3 } from "../../src/model";
import { saveProjectCode } from "../../src/projectCode";
import { blankProjectCode } from "../../src/projectCodeSchema";
import type { RoofValleyInput } from "../../src/roofValleySchema";
import { weatherWatch } from "../../src/roofValleyReference";
import { gafRoofShingle } from "../../src/shingleRoofReference";
import { composeRotation, rotate } from "../../src/spatial";

export function valleyFixture({ sections = 4, ridge = false, horizontal = false, gap = 0 } = {}) {
  const project = { ...blank("Kitchen addition roof valley"), store: "4409" };
  const slope: V3 = [horizontal ? 0 : -Math.atan(3 / 12), 0, 0];
  for (let row = 0; row < sections; row++) {
    const station = rotate([0, 0, (row - (sections - 1) / 2) * 78 + (row > 0 ? gap : 0)], slope);
    for (const side of [-1, 1]) {
      const rotation = composeRotation(slope, [0, 0, (ridge ? -side : side) * Math.atan(6 / 12)]);
      const offset = rotate([side * 24, -0.375, 0], rotation);
      const position: V3 = [offset[0] + station[0], offset[1] + station[1] + 100, offset[2] + station[2]];
      project.pieces.push(part(`Deck ${row + 1} ${side < 0 ? "left" : "right"}`, "plywood",
        [48, 0.75, 78], position, project.steps[0].id, "Roof", rotation));
    }
  }
  const roof = saveProjectCode(project, {
    ...blankProjectCode(),
    region: "utah", projectDate: "2026-11-21", codePath: "irc", work: "new",
    trades: ["roofing"], buildingAuthority: "Test jurisdiction", authorityBasis: "Synthetic roof geometry for testing",
    shingleRoof: {
      productId: gafRoofShingle.id, coveragePerBundle: null, wastePercent: null, coverageBasis: "",
      planes: project.pieces.map(({ id, name }) => ({
        id: uid(), label: name, underlayment: "membrane" as const, basis: { kind: "panel" as const, pieceId: id },
      })),
    },
  });
  const input: RoofValleyInput = {
    panels: roof.pieces.map(({ id }) => id).sort(), label: "Kitchen addition valley",
    length: sections * 78, peakExtra: 18, lap: 6, fieldConfirmed: true,
    offcut: { label: "Leftover A", width: weatherWatch.width, length: 180 },
  };
  return { roof, input };
}
