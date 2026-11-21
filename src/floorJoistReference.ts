export const floorJoistReference = {
  code: "https://seattle.gov/documents/Departments/SDCI/Codes/SeattleResidentialCode/2021SRCChapter5.pdf",
  spanGuide: "https://awc.org/resource-hub/span-table-tutorial/",
  woodSeat: 1.5,
  spacing: [12, 16, 19.2, 24],
  depths: [5.5, 7.25, 9.25, 11.25],
} as const;

export const floorJoistSpecies = {
  spf: "Spruce-pine-fir",
  dfir: "Douglas fir-larch",
  hemfir: "Hem-fir",
  syp: "Southern pine",
} as const;

// 2021 IRC Table R502.3.1(2), 40 psf live / 20 psf dead, L/360, No. 2.
// Rows are 12, 16, 19.2 and 24 in on center. Columns are nominal 2×6–2×12.
export const floorJoistSpanInches = {
  spf: [[123, 159, 195, 226], [109, 138, 169, 195], [99, 126, 154, 178], [89, 113, 138, 160]],
  dfir: [[128, 162, 197, 229], [111, 140, 171, 198], [101, 128, 156, 181], [90, 114, 140, 162]],
  hemfir: [[120, 157, 192, 222], [107, 136, 166, 193], [98, 124, 152, 176], [88, 111, 136, 157]],
  syp: [[118, 150, 177, 209], [102, 130, 154, 181], [93, 118, 140, 165], [84, 106, 125, 148]],
} as const;

export const floorJoistBearingScope =
  "This review follows the continuous joists under the sheet. It measures wood seats beneath each joist. The reference minimum for direct wood bearing is 1½ in along the joist. Confirm the supports, their load path and connections in the build. Review hangers, other support materials and any cantilever separately.";

export const floorJoistSpanScope =
  "Compare the clear distance between bearing faces to the 2021 IRC residential living-area table for No. 2 lumber, 40 psf live load, up to 20 psf dead load and L/360. Confirm the grade stamps, actual spacing, loads, service conditions and local requirements before applying the table.";
