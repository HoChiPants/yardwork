export const sillGasketInstructions = "https://images.thdstatic.com/catalog/pdfImages/dc/dc7a5b42-7c0c-4e72-9b9b-5e655782ecdc.pdf";
export const sillGasketBuildingGuide = "https://basc.pnnl.gov/resource-guides/air-sealing-sill-plates";
export const sillGasketReviewedAt = "2026-11-21T00:41:08.000Z";
export const sillGasketRollLength = 600;
export const sillGasketPiercingNote = "Use the marked sill end as Start and measure across from the highlighted long gasket edge. Transfer the actual anchor locations on site, then pierce the gasket at those marks. The listed diameters describe the wood bores.";
export const sillGasketCuttingTools = "Use scissors or a utility knife to cut the strip. Overlap end joints and corners before setting the plate.";
export const sillGasketScope =
  "Plan the gasket beneath a new wood sill on concrete or masonry. Confirm site fit, overlap at joints, penetrations, anchor details and drainage before covering the joint.";

export const sillGaskets = [
  { id: "owens-corning-comfortseal-1fs", model: "1FS", internetNumber: "202084452", storeSku: "150247", width: 3.5 },
  { id: "owens-corning-comfortseal-2fs", model: "2FS", internetNumber: "202080947", storeSku: "409989", width: 5.5 },
  { id: "owens-corning-comfortseal-3fs", model: "3FS", internetNumber: "202274536", storeSku: "815423", width: 7.5 },
] as const;

export function sillGasketListing(internetNumber: string) {
  return `https://www.homedepot.com/p/${internetNumber}`;
}
