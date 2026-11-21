export const openingAirSealGuide = "https://basc.pnnl.gov/resource-guides/air-sealing-window-and-door-rough-openings";

export const openingFoam = {
  id: "great-stuff-99108862-window-door",
  name: "Great Stuff Window & Door foam with Smart Dispenser",
  brand: "GREAT STUFF",
  model: "99108862",
  internetNumber: "312450331",
  storeSku: "1005587025",
  listing: "https://www.homedepot.com/p/312450331",
  specification: "https://www.greatstuff.dupont.com/content/dam/dupont/amer/us/en/Greatstuff/public/documents/43-D100016-enNA.pdf",
  instructions: "https://www.greatstuff.dupont.com/how-to/air-seal-around-windows-and-doors.html",
  coverage: 4 * (36 + 60) * 2 * (3 / 8) * 1,
  maxWidth: 1,
  estimateDepth: 1,
  unit: "can",
} as const;

export const openingSilicone = {
  id: "dap-08791-silicone-max",
  name: "DAP Silicone Max clear 10.1 fl oz",
  brand: "DAP",
  model: "08791",
  internetNumber: "206046715",
  storeSku: "1001392668",
  listing: "https://www.homedepot.com/p/206046715",
  specification: "https://images.dap.com/DAP%20Silicone%20Max%20All%20Purpose%20Silicone_TDS.pdf",
  instructions: "https://www.dap.com/products/caulks-sealants/silicone-max-premium-all-purpose-sealant",
  coverage: 55 * 12 * Math.PI * (3 / 32) ** 2,
  maxDepth: 1 / 2,
  maxWidth: 1 / 2,
  unit: "cartridge",
} as const;

export const openingAirSealReviewedAt = "2026-11-21T00:00:00.000Z";
export const openingSealMaterials = [openingFoam, openingSilicone] as const;
