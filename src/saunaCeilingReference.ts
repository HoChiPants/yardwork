export const saunaCeilingReviewedAt = "2026-11-19T23:23:00.000Z";
export const saunaCeilingBattRole = "ceiling-insulation";

export const saunaCeilingBatt = {
  materialId: "owens-corning-c84a-batt",
  productId: "owens-corning-c84a",
  model: "C84A",
  thickness: 9.5,
  width: 16,
  length: 48,
  packCount: 10,
  spec: "https://www.owenscorning.com/dms/10025109",
  instructions:
    "https://www.owenscorning.com/en-us/insulation/products/png-fiberglas-insulation",
  saunaContext:
    "https://cedarbrooksauna.com/what-insulation-should-be-used-in-a-home-sauna/",
  homeDepotId: "100320350",
  homeDepotSku: "1000204119",
  lowesId: "3363024",
  lowesItem: "131584",
  lowesPath:
    "Owens-Corning-R-30-53-33-sq-ft-Unfaced-Fiberglass-Batt-Insulation-with-Sound-Barrier-16-in-W-x-48-in-L",
} as const;

export const saunaCeilingJoistSize = [1.5, 96, 11.25] as const;
export const saunaCeilingJoists = [
  {
    materialId: "hd-fir-2x12-8",
    productId: "hd-fir-2x12-8-707195",
    name: "Home Depot premium fir 2 × 12 · 8 ft",
    listing: "204667928",
    model: "707195",
    item: "707195",
    path: "2-in-x-12-in-x-8-ft-2-Premium-Grade-Fir-Dimensional-Lumber-707195",
    retailer: "home-depot",
    specification:
      "Premium fir, kiln-dried, untreated; species can vary regionally.",
  },
  {
    materialId: "lowes-fir-2x12-8",
    productId: "lowes-fir-2x12-8-130768",
    name: "Lowe’s #2 Douglas fir 2 × 12 · 8 ft",
    listing: "1000615609",
    model: "721904-8",
    item: "130768",
    path: "2-in-x-12-in-x-8-ft-Douglas-Fir-S4S-Kiln-dried-Lumber",
    retailer: "lowes",
    specification:
      "#2 Douglas fir, kiln-dried, S4S; verify the delivered grade and treatment marks.",
  },
] as const;
