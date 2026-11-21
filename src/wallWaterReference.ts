export const pexSpec = "https://www.sharkbite.com/sites/default/files/files/sharkbite-pex-b-white-tubing-spec-sheet-01-feb-2022.pdf";
export const pexInstallation = "https://www.sharkbite.com/sites/default/files/resources/RWC-Piping-Systems-Installation-Guide-PSIG.pdf";
export const wallWaterReviewedAt = "2026-11-21T11:08:00.000Z";
export const pexStockLength = 120;
export const pexPipes = {
  "hd-pex-u860w10": { nominal: "1/2", model: "U860W10", outside: 0.625, tolerance: 0.004, internet: "202033036", sku: "556900" },
  "hd-pex-u870w10": { nominal: "3/4", model: "U870W10", outside: 0.875, tolerance: 0.004, internet: "202033032", sku: "556823" },
} as const;
export type PexPipeId = keyof typeof pexPipes;
export const isPexPipe = (id: string): id is PexPipeId => Object.hasOwn(pexPipes, id);

export const nailShield = {
  id: "hd-nail-shield-ns1",
  productId: "hd-simpson-ns1",
  model: "NS1",
  internet: "100375167",
  sku: "630585",
  width: 1.5,
  length: 3,
  // The manufacturer lists this minimum steel thickness. The workspace shows the face envelope.
  thickness: 0.0625,
  listing: "https://www.homedepot.com/p/100375167",
  manufacturer: "https://www.strongtie.com/protectandrepair_miscellaneousconnectors/ns_stop/p/ns",
} as const;

export const studBoreSource = "https://codes.iccsafe.org/content/IRC2024P2/chapter-6-wall-construction";
export const pipeProtectionSource = "https://codes.iccsafe.org/content/IRC2021V3.0/chapter-26-general-plumbing-requirements";
export const studBoreRatio = 0.6;
export const studBoreFace = 0.625;
export const pipeProtectionBaseline = 1.25;
export const pipePlanningCover = 1.5;
export const pexCutter = {
  model: "U701A", internet: "202685929", sku: "1000094196",
  listing: "https://www.homedepot.com/p/202685929",
  product: "https://www.sharkbite.com/us/en/pex-pipe-connectors/pex-cutters-accessories/scissor-pipe-cutter",
} as const;
