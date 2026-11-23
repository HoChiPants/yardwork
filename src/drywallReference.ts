export const drywallReviewedAt = "2026-11-22T02:15:00.000Z";
export const drywallSpecification = "https://www.usg.com/content/dam/USG/pdpmovedocuments/sheetrock-ultralight-panels-submittal-en-wb2501.pdf";
export const drywallInstallation = "https://www.usg.com/content/dam/USG/pdpmovedocuments/sheetrock-gypsum-panels-installation-guide-en-J371.pdf";

export const drywallStock = [
  { id: "hd-usg-drywall-half-8", length: 96, model: "14113411708", internet: "202530243", sku: "630204" },
  { id: "hd-usg-drywall-half-12", length: 144, model: "14113411712", internet: "202530306", sku: "897148" },
] as const;

export const isDrywall = (id: string) => drywallStock.some((stock) => stock.id === id);

export const drywallScrews = {
  id: "grip-rite-114cdws1",
  name: "Grip-Rite #6 × 1¼ in coarse-thread drywall screws",
  model: "114CDWS1",
  internet: "100152392",
  sku: "479652",
  listing: "https://www.homedepot.com/p/100152392",
  specification: "https://grip-rite.com/product/fasteners/hand-drive/screws/drywall-screws/coarse-thread-screw/",
  reviewedAt: "2026-11-22T15:30:00.000Z",
  length: 1.25,
  edge: 0.375,
  spacing: 16,
  framingSpacing: 24,
  estimatedBoxCount: 238,
  manufacturerBoxCount: 258,
} as const;

export const drywallScrewTool = "#2 Phillips drywall screw gun or drill with depth control";
export const drywallScrewScope = "For single-layer ½ in UltraLight drywall on dry, untreated wood. Locate services and shields before driving. Confirm the actual backing, sheet layout and fastener schedule. Set the screw heads just below the paper surface without tearing it.";

export const drywallJointTape = {
  id: "usg-382175-paper-joint-tape",
  name: "USG Sheetrock 250 ft paper joint tape",
  model: "382175",
  internet: "100321613",
  sku: "258423",
  listing: "https://www.homedepot.com/p/100321613",
  specification: "https://www.usg.com/content/dam/USG_Marketing_Communications/united_states/product_promotional_materials/finished_assets/sheetrock-paper-joint-tape-submittal-J1736.pdf",
  reviewedAt: "2026-11-23T03:44:03.000Z",
  length: 3000,
} as const;

export const drywallJointTapeScope = "Net flat joints on the modeled wall faces. Allow additional tape for overlaps, corners, repairs and waste. Confirm backing and factory tapers. Embed paper tape in compatible joint compound after fastening, and let coats dry as directed.";
