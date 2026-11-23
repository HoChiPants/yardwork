import { floorHangerFasteners } from "./floorHangerReference";

export const simpsonConnectorReviewedAt = "2026-11-23T05:35:00.000Z";
export const sdConnectorScrews = [
  { id: "sd10112r100", registryId: "simpson-sd10112r100", model: "SD10112R100", internet: "202071154",
    sku: "479710", label: "#10 × 1½ in", length: 1.5, shank: 0.16 },
  { id: "sd9212r100-r", registryId: floorHangerFasteners.joist.id,
    model: floorHangerFasteners.joist.merchantModel, internet: floorHangerFasteners.joist.internetNumber,
    sku: floorHangerFasteners.joist.sku, label: "#9 × 2½ in", length: 2.5, shank: 0.13 },
] as const;

export const simpsonFramingAnglesSource = "https://www.strongtie.com/framinganglesandplates_anglesandplates/a_angle/p/a";
export const simpsonFramingAngles = [
  { id: "simpson-a23z", model: "A23Z", internet: "100375310", sku: "208105",
    size: [2, 1.5, 2.75], finish: "ZMAX galvanized; 18 gauge", label: "2 × 1½ × 2¾ in" },
  { id: "simpson-a33", model: "A33", internet: "100374962", sku: "461458",
    size: [3, 3, 1.5], finish: "G90 galvanized; 12 gauge", label: "3 × 3 × 1½ in" },
] as const;
