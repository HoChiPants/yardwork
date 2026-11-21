import type { PexPipeId } from "./wallWaterReference";

export const maxFittingSpec = "https://www.sharkbite.com/sites/default/files/resources/SharkBite-Max-Fittings-Spec-Sheet.pdf";
export const maxFittingInstructions = "https://www.sharkbite.com/sites/default/files/files/sharkbite-max-install-instructions-2024-07.pdf";
export const maxInsertionChart = "https://www.sharkbite.com/us/en/resources/pipe-insertion-depth-chart";
export const waterFittingsReviewedAt = "2026-11-21T11:39:00.000Z";
export const maxFittingServiceGap = 1;

export const waterFittingProducts = {
  "hd-sharkbite-ur008a": { kind: "coupling", pipe: "hd-pex-u860w10", model: "UR008A", internet: "323667924", sku: "283602", body: 2.1, diameter: 1, insertion: 1 },
  "hd-sharkbite-ur016a": { kind: "coupling", pipe: "hd-pex-u870w10", model: "UR016A", internet: "325997233", sku: "284228", body: 2.6, diameter: 1.3, insertion: 1.25 },
  "hd-sharkbite-ur248a": { kind: "elbow", pipe: "hd-pex-u860w10", model: "UR248A", internet: "323676174", sku: "291222", body: 1.9, diameter: 1, insertion: 1 },
  "hd-sharkbite-ur256a": { kind: "elbow", pipe: "hd-pex-u870w10", model: "UR256A", internet: "325997298", sku: "294425", body: 2.5, diameter: 1.3, insertion: 1.25 },
} as const satisfies Record<string, {
  kind: "coupling" | "elbow"; pipe: PexPipeId; model: string; internet: string; sku: string;
  body: number; diameter: number; insertion: number;
}>;
export type WaterFittingId = keyof typeof waterFittingProducts;
export const waterFittingIds = Object.keys(waterFittingProducts) as WaterFittingId[];
export const isWaterFitting = (id: string): id is WaterFittingId => Object.hasOwn(waterFittingProducts, id);

export function waterFittingDimensions(id: WaterFittingId): [number, number, number] {
  const { kind, body, diameter } = waterFittingProducts[id];
  return [body, kind === "elbow" ? body : diameter, diameter];
}

export function nominalSocketReach(id: WaterFittingId) {
  const { kind, body, diameter } = waterFittingProducts[id];
  return kind === "elbow" ? body - diameter / 2 : body / 2;
}
