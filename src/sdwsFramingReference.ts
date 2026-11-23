export const sdwsFramingReview = {
  reviewedAt: "2026-11-20T14:23:00.000Z",
  manufacturer:
    "https://www.strongtie.com/strongdrive_exteriorwoodscrews/sdws-q_screw/p/strong-drive-sdws-framing-screw",
  report: "https://forms.iapmo.org/ues_reports/reports/er_0192.pdf",
  reportRevision:
    "IAPMO UES ER-192 revised February 10, 2026 · valid through February 28, 2027",
  historical:
    "https://images.thdstatic.com/catalog/pdfImages/a2/a23015d2-a2a5-4319-84f1-2668f6f6ee54.pdf",
  drive: "T25",
} as const;

export const sdwsFramingPacks = [
  {
    productId: "simpson-sdws16212qr50",
    model: "SDWS16212QR50",
    length: 2.5,
    lengthLabel: "2½ in",
    packCount: 50,
    evaluatedModel: "SDWS16212",
    underHeadLength: "2.40",
    internetNumber: "321563388",
    storeSku: "1009519784",
    listing: "https://www.homedepot.com/p/321563388",
    identityPage:
      "https://www.homedepot.com/p/questions/Simpson-Strong-Tie-0-160-in-x-2-1-2-in-6-Lobe-T25-Low-Profile-Head-Strong-Drive-SDWS-Framing-Wood-Screw-Quik-Guard-Tan-50-Pack-SDWS16212QR50/321563388/1",
  },
  {
    productId: "simpson-sdws16300qr150",
    model: "SDWS16300QR150",
    length: 3,
    lengthLabel: "3 in",
    packCount: 150,
    evaluatedModel: "SDWS16300",
    underHeadLength: "2.90",
    internetNumber: "321563399",
    storeSku: "1008794555",
    listing: "https://www.homedepot.com/p/321563399",
    identityPage:
      "https://www.homedepot.com/p/questions/Simpson-Strong-Tie-0-160-in-x-3-in-T25-Low-Profile-Head-Strong-Drive-SDWS-Framing-Screw-Quik-Guard-Tan-150-Pack-SDWS16300QR150/321563399/1",
  },
] as const;

export type SdwsFramingPack = (typeof sdwsFramingPacks)[number];

/** IAPMO UES ER-192, Tables 26 and 39. These are separate load cases. */
export function sdwsReceiverDistanceCases(productId: string) {
  const pack = sdwsFramingPacks.find((item) => item.productId === productId);
  if (!pack) return [];
  const short = pack.evaluatedModel === "SDWS16212";
  return [
    { label: "Load parallel to grain", edge: short ? 0.5 : 1, end: short ? 2 : 3 },
    { label: "Load perpendicular to grain", edge: 1, end: short ? 3.5 : 4 },
    { label: "Withdrawal only", edge: 0.875, end: 2.25 },
  ];
}

export function sdwsFramingName(pack: SdwsFramingPack) {
  return `Simpson SDWS Framing · ${pack.lengthLabel} · ${pack.packCount}-screw box`;
}

export function sdwsFramingSources(pack: SdwsFramingPack) {
  const { reviewedAt, manufacturer, report, reportRevision, historical } =
    sdwsFramingReview;
  return [
    {
      url: pack.listing,
      revision: `Home Depot Internet #${pack.internetNumber}`,
      scope: "Exact listed sell pack",
      note: `Model ${pack.model}, ${pack.lengthLabel} nominal, T25, Tan Quik Guard and ${pack.packCount} screws per selling unit.`,
    },
    {
      url: pack.identityPage,
      revision: `Home Depot product header for ${pack.model}`,
      scope: "Store SKU identity",
      note: `The retailer product header pairs SKU ${pack.storeSku} with Internet #${pack.internetNumber}. Store price and quantity require a matching observation.`,
    },
    {
      url: manufacturer,
      revision: "Simpson Strong-Tie SDWS Framing product page",
      scope: "Fastener family, drive and application reference",
      note: "The SDWS Framing family uses a T25 six-lobe recess and Quik Guard coating. Consult the current report and manufacturer instructions for the intended wood framing connection.",
    },
    {
      url: report,
      revision: reportRevision,
      scope: "Dated evaluation and under-head length datum",
      note: `ER-192 Table 1 lists ${pack.underHeadLength} in under the head to the point for ${pack.evaluatedModel}. The report depends on the actual assembly, wood, exposure, load case and adopted edition. The listed length does not set installed depth or a pilot setting.`,
    },
    {
      url: historical,
      revision: "Simpson F-F-SDWSFRMNG21 · expired June 30, 2023",
      scope: "Historical pack cross-reference",
      note: `The archived table corroborates ${pack.model} with ${pack.packCount} screws. Use the current product instructions and evaluation for installation review.`,
    },
  ].map((source) => ({ ...source, reviewedAt }));
}
