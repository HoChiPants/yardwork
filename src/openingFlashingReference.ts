export const flexWrap = {
  id: "dupont-flexwrap-9-75",
  name: "DuPont FlexWrap 9 in × 75 ft",
  model: "HHDXXTYVK8",
  internetNumber: "205187045",
  storeSku: "1002214155",
  listing: "https://www.homedepot.com/p/205187045",
  packReference: "https://www.homedepot.com/p/questions/DuPont-9-in-x-75-ft-FlexWrap-HHDXXTYVK8/205187045/1",
  instructions: "https://www.dupont.com/content/dam/dupont/amer/us/en/performance-building-solutions/public/documents/en/install-guide-single-family-wrb-and-flashing-after-wrb-43-d101048-enus.pdf",
  specification: "https://www.dupont.com/content/dam/dupont/amer/us/en/performance-building-solutions/public/documents/en/dupont-flexwrap-nf.pdf",
  reviewedAt: "2026-11-20T00:00:00.000Z",
  widths: [6, 9],
  retailWidth: 9,
  rollLength: 75 * 12,
  minJambReturn: 6,
  minInteriorAdhesion: 1,
  minFaceLap: 2,
  maxFaceLap: 3,
  minDrainageWidth: 2,
  maxCornerDistance: 4,
  minDrainageSpacing: 6,
  maxDrainageSpacing: 12,
} as const;

export const panFlashingGuide = "https://buildingscience.com/documents/information-sheets/pan-flashing-for-exterior-wall-openings";
export { openingAirSealGuide } from "./openingAirSealReference";
export const openingFlashingScope =
  "For a drained integral-flanged unit installed after DuPont Tyvek. Check the delivered unit instructions, substrate, folds and drainage. Plan the continuous interior air seal after setting the unit.";

export const windowFlashingTape = {
  specification: "https://www.dupont.com/products/dupont-flashing-tape.html",
  reviewedAt: "2026-11-21T00:00:00.000Z",
  rollLength: 75 * 12,
  rollsPerBox: 4,
  aboveHeadFlange: 1,
  products: [
    { width: 4, id: "dupont-flashing-tape-4-75", model: "HDXXTYVK7", internetNumber: "205187035", listing: "https://www.homedepot.com/p/205187035" },
    { width: 6, id: "dupont-flashing-tape-6-75", model: "HDXXTYVK6", internetNumber: "205187028", listing: "https://www.homedepot.com/p/205187028" },
  ],
} as const;

export const windowFlashingSequence = "https://www.dupont.com/content/dam/dupont/amer/us/en/performance-building-solutions/public/documents/en/Integral-Flanged-Window-After-WRB-Installation-Sequence.pdf";
export const windowFlashingTapeScope =
  "For a rectangular integral-flanged window over installed Tyvek. Verify substrate, flange position, adhesion area and any drip cap in the unit instructions before cutting.";

export const flashingKnife = {
  id: "stanley-10-099-utility-knife",
  model: "10-099",
  name: "Stanley Classic 99 utility knife",
  internetNumber: "100000053",
  storeSku: "184861",
  listing: "https://www.homedepot.com/p/100000053",
  specification: "https://www.stanleytools.com/product/10-099/stanley-99e-classic-retractable-blade-utility-knife",
} as const;
