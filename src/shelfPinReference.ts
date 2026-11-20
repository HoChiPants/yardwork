export const shelfPinProducts = {
  "kreg-kma-5mpin": {
    model: "KMA-5MPIN",
    name: "Kreg KMA-5MPIN · 20-pin pack",
    packCount: 20,
  },
  "everbilt-802404": {
    model: "802404",
    name: "Everbilt 802404 · 48-pin pack",
    packCount: 48,
  },
  "everbilt-802064": {
    model: "802064",
    name: "Everbilt 802064 angled · 8-pin pack",
    packCount: 8,
  },
  "everbilt-802424": {
    model: "802424",
    name: "Everbilt 802424 angled · 24-pin pack",
    packCount: 24,
  },
} as const;

export type ShelfPinProductId = keyof typeof shelfPinProducts;

export const everbiltShelfPin = {
  productId: "everbilt-802404",
  internetNumber: "204273819",
  storeSku: "608518",
  url: "https://www.homedepot.com/p/204273819",
  reviewedAt: "2026-11-20T04:33:00.000Z",
} as const;

const angleInstructions =
  "https://images.thdstatic.com/catalog/pdfImages/99/9941d57a-35e7-4740-9e3b-357f2de83067.pdf";

export const everbiltAngleShelfPins = {
  "everbilt-802064": {
    internetNumber: "204273378",
    storeSku: "610073",
    url: "https://www.homedepot.com/p/204273378",
    instructions: angleInstructions,
    fitNote:
      "The listing specifies a 5 mm hole and the linked instructions specify 3/16 in. Check the delivered 802064 instructions and test the actual pin in the modeled 5 mm bore before using this plan.",
  },
  "everbilt-802424": {
    internetNumber: "204273814",
    storeSku: "608515",
    url: "https://www.homedepot.com/p/204273814",
    instructions: null,
    fitNote:
      "The listing gives 5 mm × 3/8 in, while Supplier Quality describes an approximately 1/2 in pin. Measure the delivered 802424 pin and verify the actual fit and bore depth on scrap from the same panel stock.",
  },
} as const;

export type EverbiltAngleShelfPinId = keyof typeof everbiltAngleShelfPins;
export const everbiltAngleShelfPinIds = Object.keys(
  everbiltAngleShelfPins,
) as EverbiltAngleShelfPinId[];
export const everbiltAngleShelfPinsReviewedAt = "2026-11-20T00:00:00.000Z";

export function angleShelfPinReference(id: ShelfPinProductId) {
  const key = everbiltAngleShelfPinIds.find((productId) => productId === id);
  return key ? everbiltAngleShelfPins[key] : undefined;
}

export const homeDepotShelfPinIds = [
  everbiltShelfPin.productId,
  ...everbiltAngleShelfPinIds,
] as const;
export type HomeDepotShelfPinId = (typeof homeDepotShelfPinIds)[number];
