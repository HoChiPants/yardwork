export const concreteAnchor = {
  productId: "simpson-thd50600hmgf1",
  model: "THD50600HMGF1",
  manufacturerModel: "THD50600HMG",
  label: "Simpson Strong-Tie Titen HD ½ × 6 in mechanically galvanized anchor",
  internetNumber: "300690853",
  sku: "1002236987",
  listing: "https://www.homedepot.com/p/300690853",
  instructions:
    "https://www.strongtie.com/screwanchors_mechanicalanchoringproducts/thd-mg_anchor/p/titen-hd-mechanically-galvanized",
  evaluation:
    "https://icc-es.org/wp-content/uploads/report-directory/ESR-2713.pdf",
  verifiedAt: "2026-11-20T08:55:00.000Z",
  bitDiameter: 0.5,
  wrenchSize: 0.75,
  overdrill: 0.5,
  unitsPerPack: 1,
} as const;

export const concreteAnchorScope =
  "Compare the drill layout with the project’s specified anchor details. Verify concrete condition, reinforcement, embedment design, fixture and washer, corrosion exposure, tool access and loads at the site.";

// ESR-2713, Table 1A, ½ in column for solid concrete.
export const concreteAnchorLayoutReference = {
  nominalEmbedments: [
    { length: 3.25, minimumSlab: 5 },
    { length: 4, minimumSlab: 6.25 },
  ],
  spacingAlternatives: [
    { edge: 1.75, spacing: 3 },
    { edge: 3, spacing: 2 },
  ],
} as const;
