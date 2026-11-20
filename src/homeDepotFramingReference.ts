export const framingStudsCategory =
  "https://www.homedepot.com/b/Lumber-Composites-Dimensional-Lumber-Framing-Studs/N-5yc1vZc562";
export const spfBoardUnitSource =
  "https://www.homedepot.com/p/questions/2-in-x-6-in-x-12-ft-Premium-SPF-Dimensional-Lumber-058445/312528843/2";

export const homeDepotFraming = {
  stud: {
    materialId: "hd-kdht-2x4-8",
    registryId: "hd-kdht-2x4x96-312528776",
    internetNumber: "312528776",
    model: "058449",
    storeSku: "161640",
    listing: "https://www.homedepot.com/p/312528776",
    stockSize: [1.5, 96, 3.5],
    name: "#2 KD-HT 2 × 4 · Home Depot",
    subtitle: "1½ × 3½ in actual · 8 ft · full-length stud",
    finish:
      "#2 as listed; kiln-dried, heat-treated and untreated as listed. Species may vary.",
    role: "frameLumber",
    sourceNote:
      "The listing names a full 96 in stud, 1.5 × 3.5 × 96 in actual, with retailer model 058449 and store SKU 161640. Catalog grade and delivered species or stamp may vary by region.",
    unitSource: framingStudsCategory,
    unitNote:
      "The retailer category shows model 058449 as an individually purchasable stud with a separate quantity discount. One board is the modeled selling unit.",
  },
  stud10: {
    materialId: "hd-spf-2x4-10",
    registryId: "hd-spf-2x4x120-100077951",
    reviewedAt: "2026-11-20T13:49:00.000Z",
    internetNumber: "100077951",
    model: "161659",
    storeSku: "161659",
    listing: "https://www.homedepot.com/p/100077951",
    stockSize: [1.5, 120, 3.5],
    name: "SPF 2 × 4 · Home Depot",
    subtitle: "1½ × 3½ in actual · 10 ft · framing",
    finish: "Premium SPF as listed. Verify delivered grade and treatment.",
    role: "frameLumber",
    sourceNote:
      "The exact listing identifies actual 1.5 × 3.5 × 120 in, model 161659, store SKU 161659. The listing notes regional species variation.",
    unitSource: "https://www.homedepot.com/p/100077951",
    unitNote:
      "The retailer shows a per-board price with a separate quantity discount for 35 or more. The modeled selling unit is one board.",
  },
  stud12: {
    materialId: "hd-spf-2x4-12",
    registryId: "hd-spf-2x4x144-312528815",
    reviewedAt: "2026-11-20T13:49:00.000Z",
    internetNumber: "312528815",
    model: "058440",
    storeSku: "161667",
    listing: "https://www.homedepot.com/p/312528815",
    stockSize: [1.5, 144, 3.5],
    name: "SPF 2 × 4 · Home Depot",
    subtitle: "1½ × 3½ in actual · 12 ft · untreated",
    finish: "Premium SPF; supplier identifies this listing as untreated.",
    role: "frameLumber",
    sourceNote:
      "The exact listing identifies actual 1.5 × 3.5 × 144 in, model 058440, store SKU 161667. The supplier confirms SPF and untreated wood in the product questions.",
    unitSource:
      "https://www.homedepot.com/p/questions/2-in-x-4-in-x-12-ft-Premium-SPF-Dimensional-Lumber-058440/312528815/2",
    unitNote:
      "The retailer associate confirms an individual-board selling unit. The supplier shipping bundle is separate.",
  },
  ridge8: {
    materialId: "hd-spf-2x6-8",
    registryId: "hd-spf-2x6x96-334216730",
    internetNumber: "334216730",
    model: "96032",
    storeSku: "161713",
    listing: "https://www.homedepot.com/p/334216730",
    stockSize: [1.5, 96, 5.5],
    name: "SPF 2 × 6 · Home Depot",
    subtitle: "1½ × 5½ in actual · 8 ft · untreated",
    finish: "Untreated premium SPF as listed. Species may vary.",
    role: "ridgeLumber",
    sourceNote:
      "The listing identifies one 8 ft board configuration, actual 1.5 × 5.5 × 96 in, model 96032, store SKU 161713. The listing and UFPI product response identify untreated SPF.",
    unitSource: spfBoardUnitSource,
    unitNote:
      "One board is inferred from the individual 8 ft configuration linked from the 12 ft product page and the retailer associate’s distinction between a single-piece price and a shipping bundle on the related 12 ft listing.",
  },
  ridge12: {
    materialId: "hd-spf-2x6-12",
    registryId: "hd-spf-2x6x144-312528843",
    internetNumber: "312528843",
    model: "058445",
    storeSku: "161756",
    listing: "https://www.homedepot.com/p/312528843",
    stockSize: [1.5, 144, 5.5],
    name: "SPF 2 × 6 · Home Depot",
    subtitle: "1½ × 5½ in actual · 12 ft · untreated",
    finish: "Untreated premium SPF as listed. Species may vary.",
    role: "ridgeLumber",
    sourceNote:
      "The listing identifies actual 1.5 × 5.5 × 144 in, untreated premium SPF, retailer model 058445 and store SKU 161756.",
    unitSource: spfBoardUnitSource,
    unitNote:
      "The retailer associate confirms an individual-board selling unit for this listing. The supplier’s wholesale bundle count is separate.",
  },
} as const;

export const framingStockReviewedAt = "2026-11-20T13:25:13.000Z";
