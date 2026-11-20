export const springLidStay = {
  productId: "sugatsune-s-at02w",
  model: "S-AT02W",
  seller: "Sugatsune America",
  listing: "https://www.sugatsune.com/heavy-spring-loaded-lid-stay-s-at02w/",
  catalog: "https://www.sugatsune.com/content/site-assets/300_PDF/131.pdf",
  manual:
    "https://store-q829d8045u.mybigcommerce.com/content/site-assets/Instructions/S-AT02W%20Installation%20Instruction.pdf",
  maxAngle: 80,
  mounts: [
    { location: "Side mount", minNm: 17.6, maxNm: 21 },
    { location: "Back mount", minNm: 15, maxNm: 16.5 },
  ],
  reviewedAt: "2026-11-20T06:19:13.000Z",
} as const;

export const everbiltLidSupport = {
  productId: "everbilt-28987-lid-support",
  model: "28987",
  internetNumber: "314151479",
  storeSku: "1005694642",
  listing: "https://www.homedepot.com/p/314151479",
  manual:
    "https://images.thdstatic.com/catalog/pdfImages/74/748c84a1-6eeb-4a60-bdc4-0e101ab3a0e1.pdf",
  scope:
    "Torque range needs supplier confirmation. The listing gives conflicting descriptions of the included handing and links the separately sold 19844 drawing. Check the delivered kit and its instructions.",
  reviewedAt: "2026-11-20T06:19:13.000Z",
} as const;

const reviewDate = "2026-11-20T08:03:26.000Z";
export const foldingLidStays = {
  "everbilt-19834-lid-stay": {
    model: "19834",
    hand: "Left-hand",
    internetNumber: "204485795",
    storeSku: "1000020965",
    listing: "https://www.homedepot.com/p/204485795",
    manual:
      "https://images.thdstatic.com/catalog/pdfImages/ed/ed462be6-b1b6-4270-98f7-03390f006131.pdf",
    reviewedAt: reviewDate,
  },
  "everbilt-19844-lid-stay": {
    model: "19844",
    hand: "Right-hand",
    internetNumber: "204485796",
    storeSku: "1000020966",
    listing: "https://www.homedepot.com/p/204485796",
    manual:
      "https://images.thdstatic.com/catalog/pdfImages/74/748c84a1-6eeb-4a60-bdc4-0e101ab3a0e1.pdf",
    reviewedAt: reviewDate,
  },
} as const;
export type FoldingLidStayProductId = keyof typeof foldingLidStays;

export const foldingLidStayScope =
  "The listed setup illustrates 90°. Measure the delivered pivot centers and confirm the handed part, release access, pinch clearance, fasteners and lid loading before installation.";
