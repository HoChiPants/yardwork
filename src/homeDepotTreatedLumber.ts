export const treatedLumberReviewedAt = "2026-11-20T18:00:00.000Z";
export const weathershieldBoardUnits =
  "https://www.homedepot.com/b/WeatherShield/Pressure-Treated-Dimensional-Lumber-Stud/N-5yc1vZ4l6Z1z10nx5";
export const treatedTwoEightBoardUnits =
  "https://www.homedepot.com/b/Lumber-Composites-Decking/2-in-x-8-in/N-5yc1vZbqmgZ1z0n4w4";

export const homeDepotTreatedLumber = [
  {
    materialId: "hd-treated-2x4-8",
    family: "treated-2x4",
    internetNumber: "206967725",
    model: "253906",
    storeSku: "1001802203",
    name: "WeatherShield redwood-tone 2 × 4",
    size: [1.5, 3.5, 96],
    finish: "#1 Southern Yellow Pine · redwood-tone ground-contact pressure treatment",
    unitEvidence: "single-listing",
  },
  {
    materialId: "hd-treated-2x4-10",
    family: "treated-2x4",
    internetNumber: "206967803",
    model: "253920",
    storeSku: "1001753748",
    name: "WeatherShield 2 × 4",
    size: [1.5, 3.5, 120],
    finish: "#2 Prime Southern Yellow Pine as listed · ground-contact pressure treatment",
    unitEvidence: "quantity-discount",
  },
  {
    materialId: "hd-treated-2x4-12",
    family: "treated-2x4",
    internetNumber: "206967813",
    model: "253920",
    storeSku: "1001753827",
    name: "WeatherShield 2 × 4",
    size: [1.5, 3.5, 144],
    finish: "#2 Prime Southern Yellow Pine as listed · ground-contact pressure treatment",
    unitEvidence: "quantity-discount",
  },
  {
    materialId: "hd-treated-2x6-8",
    family: "treated-2x6",
    internetNumber: "206952301",
    model: "17464-08",
    storeSku: "1001765212",
    name: "Brown-stain Western Wood 2 × 6",
    size: [1.5, 5.5, 96],
    finish: "Western Wood · hem-fir per highlights · copper azole ground-contact treatment",
    unitEvidence: "single-listing",
  },
  {
    materialId: "hd-treated-2x6-10",
    family: "treated-2x6",
    internetNumber: "206967800",
    model: "253921",
    storeSku: "1001753906",
    name: "WeatherShield 2 × 6",
    size: [1.5, 5.5, 120],
    finish: "#2 Prime Southern Yellow Pine as listed · ground-contact pressure treatment",
    unitEvidence: "quantity-discount",
  },
  {
    materialId: "hd-treated-2x6-12",
    family: "treated-2x6",
    internetNumber: "206949899",
    model: "17464-12",
    storeSku: "1001765217",
    name: "Brown-stain Western Wood 2 × 6",
    size: [1.5, 5.5, 144],
    finish: "Western Wood · hem-fir per highlights · copper azole ground-contact treatment",
    unitEvidence: "single-listing",
  },
  {
    materialId: "hd-treated-2x8-8",
    family: "treated-2x8",
    internetNumber: "206937455",
    model: "107523",
    storeSku: "1001753990",
    name: "#2 Prime Southern Pine 2 × 8",
    size: [1.5, 7.5, 96],
    finish: "#2 Prime Southern Yellow Pine as listed · ground-contact pressure treatment",
    unitEvidence: "quantity-discount",
  },
  {
    materialId: "hd-treated-2x8-10",
    family: "treated-2x8",
    internetNumber: "206937440",
    model: "107523",
    storeSku: "1001753993",
    name: "#2 Prime Southern Pine 2 × 8",
    size: [1.5, 7.5, 120],
    finish: "#2 Prime Southern Yellow Pine as listed · ground-contact pressure treatment",
    unitEvidence: "quantity-discount",
  },
] as const;

export const treatedLumberProductId = (record: (typeof homeDepotTreatedLumber)[number]) =>
  `${record.materialId}-${record.internetNumber}`;

export const baseBoards = homeDepotTreatedLumber.filter(
  (record) => record.family === "treated-2x6" || record.family === "treated-2x8",
);
export const baseBoardIds = ["treated", ...baseBoards.map(({ materialId }) => materialId)] as const;
type BaseBoard = (typeof baseBoardIds)[number];
export type BaseBoardDepth = (typeof baseBoards)[number]["size"][1];

export const baseBoardDepth = (id?: BaseBoard): BaseBoardDepth =>
  baseBoards.find(({ materialId }) => materialId === id)?.size[1] ?? 5.5;

export const baseMembers = ["rim", "joist"] as const;
type BaseDimensions = { width: number; depth: number };

export const baseMemberLengths = ({ width, depth }: BaseDimensions) =>
  ({ rim: width, joist: depth - 3 });

export function floorBaseJoistCenters(width: number, spacing: number) {
  const xs = [-width / 2 + 0.75];
  for (let x = -width / 2 + spacing; x < width / 2 - 1.5; x += spacing)
    xs.push(x);
  xs.push(width / 2 - 0.75);
  return xs;
}

export const floorBaseRoles = {
  back: "floor-base-back-rim",
  front: "floor-base-front-rim",
  joist: "floor-base-joist",
} as const;

export function fittingBaseBoards(dimensions: BaseDimensions, depth: BaseBoardDepth = 5.5): Record<(typeof baseMembers)[number], BaseBoard> {
  const lengths = baseMemberLengths(dimensions);
  const choices = baseBoards.filter(({ size }) => size[1] === depth);
  const fallback = depth === 5.5 ? "treated" : choices.at(-1)!.materialId;
  const fitting = (length: number) => choices.find(({ size }) => size[2] >= length)?.materialId ?? fallback;
  return {
    rim: fitting(lengths.rim),
    joist: fitting(lengths.joist),
  };
}
