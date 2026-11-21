import { subfloorReference } from "./subfloorReference";

export const bottomPlateSealant = {
  id: "osi-sc175-1496542",
  name: "OSI SC175 draft sealant",
  model: "1496542",
  internet: "202768254",
  sku: "668344",
  listing: "https://www.homedepot.com/p/202768254",
  specification: "https://datasheets.tdx.henkel.com/OSI-SC175-en_US.pdf",
  fieldGuide: "https://basc.pnnl.gov/diy-guides/air-seal-bottom-plates",
  reviewedAt: "2026-11-21T15:57:00.000Z",
  coverageFeet: { "1/4": 86, "3/8": 38 },
  size: { "1/4": 0.25, "3/8": 0.375 },
  maxWidth: 0.625,
  maxDepth: 0.5,
} as const;

export const bottomPlateScope =
  "Plan an exposed interior bead along a dry wood bottom plate on wood subfloor. Confirm clean, dry, sound substrates, a suitable bead and working temperatures above 40°F. Check the adjoining air barrier before covering the seam.";

export const quartCartridgeGun = "https://www.homedepot.com/p/325094068";

export const subfloorPanel = {
  id: "hd-osb-subfloor-486701",
  name: "23/32 in T&G OSB subfloor",
  model: "486701",
  internet: "203169027",
  sku: "486701",
  size: [47.875, 0.703, 95.875] as [number, number, number],
  listing: "https://www.homedepot.com/p/203169027",
  floorGuide: subfloorReference.guide,
} as const;
