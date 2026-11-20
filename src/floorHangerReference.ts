export const floorHangerReport = "https://icc-es.org/wp-content/uploads/report-directory/ESR-3096.pdf";
export const floorHangerInstallation = "https://www.strongtie.com/resources/product-installers-guide/lus-installation";
export const floorHangerReviewedAt = "2026-11-20T19:34:41.000Z";

export const floorHangerProductIds = ["simpson-lus26z", "simpson-lus28z"] as const;
export const floorHangers = {
  "simpson-lus26z": {
    model: "LUS26Z", internetNumber: "100375105", sku: "865827", nominal: "2 × 6",
    depths: [5.5], namedSize: [1.5625, 4.75, 1.75], rimScrews: 4, joistScrews: 4,
    url: "https://www.homedepot.com/p/Simpson-Strong-Tie-LUS-ZMAX-Galvanized-Face-Mount-Joist-Hanger-for-2x6-Nominal-Lumber-LUS26Z/100375105",
  },
  "simpson-lus28z": {
    model: "LUS28Z", internetNumber: "100374921", sku: "865858", nominal: "2 × 8",
    depths: [7.25, 7.5], namedSize: [1.5625, 6.625, 1.75], rimScrews: 6, joistScrews: 4,
    url: "https://www.homedepot.com/p/Simpson-Strong-Tie-LUS-ZMAX-Galvanized-Face-Mount-Joist-Hanger-for-2x8-Nominal-Lumber-LUS28Z/100374921",
  },
} as const;
export const floorHangerFasteners = {
  rim: { id: "simpson-sd9112r100", model: "SD9112", internetNumber: "202071152", pack: 100 },
  joist: {
    id: "simpson-sd9212r100-r", model: "SD9212", merchantModel: "SD9212R100-R", internetNumber: "206101818", sku: "478811", pack: 100,
    url: "https://www.homedepot.com/p/206101818",
    specification: "https://icc-es.org/wp-content/uploads/report-directory/ESR-3046.pdf",
  },
} as const;
export const floorHangerScope =
  "Planning quantities use the short-rim / long-joist screw row of ESR-3096 Table 20. Confirm the delivered hanger, flange backing, fastener paths, wood grade, treatment, exposure and required supporting-member thickness before use. Loads and installation remain separate reviews.";
