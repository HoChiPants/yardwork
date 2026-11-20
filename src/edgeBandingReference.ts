export const edgeBandingProducts = {
  "edgemate-5032270": {
    brand: "EDGEMATE",
    model: "5032270",
    name: "EDGEMATE white birch edge banding · 13/16 in × 25 ft",
    width: 13 / 16,
    length: 300,
    internetNumber: "314095455",
    listing: "https://www.homedepot.com/p/314095455",
  },
  "pureedge-902028": {
    brand: "PureEdge",
    model: "902028",
    name: "PureEdge white birch edge banding · 2 in × 8 ft",
    width: 2,
    length: 96,
    internetNumber: "323974629",
    listing: "https://www.homedepot.com/p/323974629",
  },
} as const;

export type EdgeBandingProductId = keyof typeof edgeBandingProducts;
export const edgeBandingProductIds = Object.keys(
  edgeBandingProducts,
) as EdgeBandingProductId[];
export const edgeBandingMaxLength = Math.max(
  ...Object.values(edgeBandingProducts).map(({ length }) => length),
);
export const edgeBandingReviewedAt = "2026-11-20T00:00:00.000Z";
export const edgeTrimmer = {
  id: "pureedge-902738",
  name: "PureEdge 902738 edge trimmer",
  model: "902738",
  internetNumber: "313359487",
  listing: "https://www.homedepot.com/p/313359487",
  instructions: "https://images.thdstatic.com/catalog/pdfImages/5a/5a30ab43-15af-4693-9297-f33fbc527090.pdf",
  requirement: "Check delivered veneer thickness and test the trimmer on a firmly bonded, cooled edge on matching scrap.",
} as const;
export const edgeBandingScope =
  "Check delivered veneer width and length and test adhesion on matching scrap. Allow room for the finished banding and trim access before assembly. Use these rolls for dry interior finishing.";
