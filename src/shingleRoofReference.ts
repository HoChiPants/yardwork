export const gafRoofShingle = {
  id: "gaf-0489180-charcoal",
  model: "0489180",
  internetNumber: "314168668",
  sku: "1005067402",
  label: "GAF Timberline HDZ Charcoal",
  reviewedAt: "2026-11-20T08:00:00.000Z",
  listing: "https://www.homedepot.com/p/314168668",
  instructions:
    "https://www.gaf.com/en-us/document-library/documents/productdocuments/residentialroofingdocuments/shinglesdocuments/timberlineroofingshinglesdocuments/architecturalshinglesdocuments/timberlinehdzdocuments/Installation_Instructions__Timberline_HDZ_High_Definition_Lifetime_Shingles_.pdf",
  evaluation:
    "https://documents.gaf.com/codes/timberline-evaluation-report-ul-er21-01.pdf",
  coverageNote:
    "Published coverage figures use different bundle descriptions. Read usable coverage from the delivered packaging or the supplier’s confirmed bundle specification.",
} as const;

export const shingleEdgeProducts = {
  starter: {
    id: "gaf-1126000-pro-start",
    model: "1126000",
    internetNumber: "202052408",
    sku: "919062",
    label: "GAF Pro-Start",
    finish: null,
    reviewedAt: gafRoofShingle.reviewedAt,
    listing: "https://www.homedepot.com/p/202052408",
    specification:
      "https://www.gaf.com/en-us/roofing-materials/residential-roofing-materials/starter-strip-shingles/pro-start-starter-strip-shingles",
    instructions:
      "https://www.gaf.com/en-us/document-library/documents/installation-instructions-%26-guides/pro-start-installation-instructions-resgn853-%2811-22%29.pdf",
    coverageFeet: 120,
    purchaseUnit: "starter bundle",
    coverageNote:
      "Estimate uses the 120 linear ft Home Depot bundle designation, rounded down from GAF’s approximate 120.33 ft for split strips. Confirm delivered coverage. Published piece counts do not agree.",
    cutNote:
      "Separate the strips at the perforation and allow for the offset start, cuts and ends in the GAF instructions.",
  },
  cap: {
    id: "gaf-0850180-seal-a-ridge-charcoal",
    model: "0850180",
    internetNumber: "206593176",
    sku: "1002079388",
    label: "GAF Seal-A-Ridge Charcoal",
    finish: "Charcoal",
    reviewedAt: gafRoofShingle.reviewedAt,
    listing: "https://www.homedepot.com/p/206593176",
    specification:
      "https://documents.gaf.com/data-sheets/seal-a-ridge-ridge-cap-shingles-sell-sheet-reshr112.pdf",
    instructions:
      "https://www.gaf.com/en-us/document-library/documents/installation-instructions-%26-guides/seal-a-ridge-ridge-cap-shingles-installation-instructions-trilingual-reshr126.pdf",
    coverageFeet: 25,
    capExposure: 20 / 3,
    capsPerBundle: 45,
    purchaseUnit: "cap bundle",
    coverageNote:
      "Coverage is approximately 25 linear ft per bundle at the manufacturer’s specified 6⅔ in exposure.",
    cutNote:
      "Separate the cap shingles at the perforations. One cap per run is reserved for the starter cut. Allow for finish cuts and intersections.",
  },
} as const;
