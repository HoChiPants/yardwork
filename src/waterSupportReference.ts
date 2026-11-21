import type { PexPipeId } from "./wallWaterReference";

export const waterSupportReference = {
  product: "https://www.holdrite.com/us/en/pipe-supports/copper-supports/inserts-clamps/plastic-through-stud-tube-isolator-insert",
  spec: "https://images.thdstatic.com/catalog/pdfImages/aa/aa3357c4-a220-4e9a-9b07-4f61f58c1e25.pdf",
  instructions: "https://www.holdrite.com/sites/default/files/files/holdrite-through-stud-series-161-162-163-installation-instructions.pdf",
  code: "https://codes.iccsafe.org/content/IRC2021V3.0/chapter-26-general-plumbing-requirements",
  reviewedAt: "2026-11-21T13:26:00.000Z",
  bore: 1.375,
  depth: 1,
  flangeHeight: 2.2,
  flangeWidth: 1.7,
  maximumSpan: 32,
  packCount: 15,
  nailsPerSupport: 2,
} as const;

export const waterSupportProducts = {
  "hd-holdrite-161j15": { pipe: "hd-pex-u860w10", nominal: "1/2", model: "161J15", internet: "308675097" },
  "hd-holdrite-162j15": { pipe: "hd-pex-u870w10", nominal: "3/4", model: "162J15", internet: "308675098" },
} as const satisfies Record<string, { pipe: PexPipeId; nominal: string; model: string; internet: string }>;

export type WaterSupportId = keyof typeof waterSupportProducts;
export const waterSupportIds = Object.keys(waterSupportProducts) as WaterSupportId[];
export const isWaterSupport = (id: string): id is WaterSupportId => Object.hasOwn(waterSupportProducts, id);
export const waterSupportForPipe = (pipe: PexPipeId) => waterSupportIds.find((id) => waterSupportProducts[id].pipe === pipe)!;
export const waterSupportName = (id: WaterSupportId) => `HoldRite ${waterSupportProducts[id].nominal} in through-stud isolator`;
