import { bom } from "./engine";
import { baseBoards, baseMemberLengths, type BaseBoardDepth } from "./homeDepotTreatedLumber";
import { blank, commandSchema, sectionParts, type Command, type SectionCommand } from "./model";
import { stockCutSequences } from "./stockCutSequence";

export type FloorBaseStockOption = {
  stock: NonNullable<SectionCommand["baseStock"]>;
  boards: number;
  purchasedLength: number;
  remnantLength: number;
};

/** Compare one stocked length for each member type using the normal cutting estimates. */
export function compareFloorBaseStock(command: Command, memberDepth: BaseBoardDepth = 5.5) {
  const options: FloorBaseStockOption[] = [];
  const parsed = commandSchema.safeParse(command);
  if (parsed.success && parsed.data.type === "foundation") {
    const dimensions = parsed.data;
    const lengths = baseMemberLengths(dimensions);
    const project = blank("Floor base estimate");
    const boards = baseBoards.filter(({ size }) => size[1] === memberDepth);
    for (const rim of boards.filter(({ size }) => size[2] >= lengths.rim)) {
      for (const joist of boards.filter(({ size }) => size[2] >= lengths.joist)) {
        const stock = { rim: rim.materialId, joist: joist.materialId };
        const pieces = sectionParts({ ...dimensions, baseStock: stock }, project.steps[0].id, "Floor base", [0, 0, 0], [0, 0, 0]);
        const candidate = { ...project, pieces };
        const rows = bom(candidate);
        if (rows.some(({ oversize }) => oversize > 0)) continue;
        const cuts = [...stockCutSequences(candidate, rows).values()].flat();
        const coveredParts = cuts.reduce((total, { layout }) => total + layout.kept.length, 0);
        if (coveredParts !== pieces.length || cuts.some(({ review }) => review)) continue;
        options.push({
          stock,
          boards: cuts.length,
          purchasedLength: cuts.reduce((total, { layout }) => total + layout.length, 0),
          remnantLength: cuts.reduce((total, { layout }) =>
            total + layout.leftovers.reduce((length, remnant) => length + remnant.length, 0), 0),
        });
      }
    }
  }
  const leastLumber = [...options].sort((a, b) => a.purchasedLength - b.purchasedLength || a.boards - b.boards)[0];
  const fewestBoards = [...options].sort((a, b) => a.boards - b.boards || a.purchasedLength - b.purchasedLength)[0];
  return { options, leastLumber, fewestBoards };
}
