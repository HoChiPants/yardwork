export const greenhouseDoorKits = {
  "everbilt-24417-gate-kit": {
    label: "Everbilt 24417 post latch gate set",
    brand: "Everbilt",
    model: "24417",
    retailer: "home-depot",
    retailerId: "327600104",
    storeSku: "1002316523",
    seller: "The Home Depot",
    listing: "https://www.homedepot.com/p/327600104",
    instructions:
      "https://images.thdstatic.com/catalog/pdfImages/db/db0eb916-759f-49ed-80b1-2012a94e2734.pdf",
    manufacturer: null,
    contents: [
      { name: "hinge", quantity: 2 },
      { name: "latch", quantity: 1 },
      { name: "keeper bar", quantity: 1 },
      { name: "handle", quantity: 1 },
    ],
  },
  "national-n109-025-gate-kit": {
    label: "National Hardware N109-025 T-hinge and latch kit",
    brand: "National Hardware",
    model: "N109-025",
    retailer: "lowes",
    retailerId: "50414118",
    storeSku: "674899",
    seller: "Lowe's",
    listing:
      "https://www.lowes.com/pd/national-hardware-8-13-16-in-gate-hardware-kit/50414118",
    instructions:
      "https://pdf.lowes.com/productdocuments/d1fc303b-3517-4b65-8c0a-ee42b8ebe789/43544971.pdf",
    manufacturer: "https://www.national-hardware.com/p/1299-gate-kit",
    contents: [
      { name: "T-hinge", quantity: 2 },
      { name: "latch with strike", quantity: 1 },
    ],
  },
} as const;

export type GreenhouseDoorKitId = keyof typeof greenhouseDoorKits;

export const cedarDoorStop = {
  materialId: "hd-cedar-1x2-8",
  productId: "home-depot-cedar-1x2-206460933",
  model: "C BP102K08",
  internetNumber: "206460933",
  storeSku: "161895",
  listing: "https://www.homedepot.com/p/206460933",
  reviewedAt: "2026-11-20T12:01:00.000Z",
  size: [0.75, 96, 1.5],
} as const;

export const greenhouseDoorStopRoles = {
  left: "greenhouse-door-stop-left",
  right: "greenhouse-door-stop-right",
  head: "greenhouse-door-stop-head",
} as const;
const stopRoles = new Set<string>(Object.values(greenhouseDoorStopRoles));
export const isGreenhouseDoorStop = (role: string | undefined) =>
  role !== undefined && stopRoles.has(role);
