import { pexPipes, type PexPipeId } from "./wallWaterReference";

export const maxFittingSpec = "https://www.sharkbite.com/sites/default/files/resources/SharkBite-Max-Fittings-Spec-Sheet.pdf";
export const maxFittingInstructions = "https://www.sharkbite.com/sites/default/files/files/sharkbite-max-install-instructions-2024-07.pdf";
export const maxInsertionChart = "https://www.sharkbite.com/us/en/resources/pipe-insertion-depth-chart";
export const waterFittingsReviewedAt = "2026-11-21T11:39:00.000Z";
export const waterTeesReviewedAt = "2026-11-21T12:20:00.000Z";
export const maxFittingServiceGap = 1;
export const waterDepthGauge = {
  id: "hd-sharkbite-ur702a", model: "UR702A", internet: "329736096", sku: "887801",
  listing: "https://www.homedepot.com/p/329736096",
  product: "https://www.sharkbite.com/us/en/resources/videos/how-to-use-sharkbite-max-depth-and-deburr-tool",
} as const;

type FittingProduct = {
  kind: "coupling" | "elbow" | "tee"; pipe: PexPipeId; model: string; internet: string; sku: string;
  body: number; diameter: number; insertion: number;
  branch?: { pipe: PexPipeId; body: number; insertion: number };
};

export const waterFittingProducts = {
  "hd-sharkbite-ur008a": { kind: "coupling", pipe: "hd-pex-u860w10", model: "UR008A", internet: "323667924", sku: "283602", body: 2.1, diameter: 1, insertion: 1 },
  "hd-sharkbite-ur016a": { kind: "coupling", pipe: "hd-pex-u870w10", model: "UR016A", internet: "325997233", sku: "284228", body: 2.6, diameter: 1.3, insertion: 1.25 },
  "hd-sharkbite-ur248a": { kind: "elbow", pipe: "hd-pex-u860w10", model: "UR248A", internet: "323676174", sku: "291222", body: 1.9, diameter: 1, insertion: 1 },
  "hd-sharkbite-ur256a": { kind: "elbow", pipe: "hd-pex-u870w10", model: "UR256A", internet: "325997298", sku: "294425", body: 2.5, diameter: 1.3, insertion: 1.25 },
  "hd-sharkbite-ur362a": { kind: "tee", pipe: "hd-pex-u860w10", model: "UR362A", internet: "325997400", sku: "296070", body: 2.9, diameter: 1, insertion: 1,
    branch: { pipe: "hd-pex-u860w10", body: 1.9, insertion: 1 } },
  "hd-sharkbite-ur370a": { kind: "tee", pipe: "hd-pex-u870w10", model: "UR370A", internet: "325997331", sku: "298955", body: 3.7, diameter: 1.3, insertion: 1.25,
    branch: { pipe: "hd-pex-u870w10", body: 2.5, insertion: 1.25 } },
  "hd-sharkbite-ur412a": { kind: "tee", pipe: "hd-pex-u870w10", model: "UR412A", internet: "325997410", sku: "300753", body: 3.5, diameter: 1.3, insertion: 1.25,
    branch: { pipe: "hd-pex-u860w10", body: 2.3, insertion: 1 } },
} satisfies Record<string, FittingProduct>;
export type WaterFittingId = keyof typeof waterFittingProducts;
export const waterFittingIds = Object.keys(waterFittingProducts) as WaterFittingId[];
export const isWaterFitting = (id: string): id is WaterFittingId => Object.hasOwn(waterFittingProducts, id);

export function waterFittingProduct(id: WaterFittingId): FittingProduct {
  return waterFittingProducts[id];
}

export function waterFittingKindLabel(id: WaterFittingId) {
  const { kind, pipe, branch } = waterFittingProduct(id);
  return kind === "elbow" ? "90° elbow" : kind === "coupling" ? "straight coupling" :
    branch?.pipe === pipe ? "tee" : "reducing tee";
}

export function waterFittingName(id: WaterFittingId) {
  const { pipe, branch } = waterFittingProduct(id);
  const nominal = pexPipes[pipe].nominal;
  const size = branch && pipe !== branch.pipe
    ? `${nominal} × ${nominal} × ${pexPipes[branch.pipe].nominal} in` : `${nominal} in`;
  return `SharkBite Max ${size} ${waterFittingKindLabel(id)}`;
}

export function waterFittingDimensions(id: WaterFittingId): [number, number, number] {
  const { kind, body, diameter, branch } = waterFittingProduct(id);
  return [body, branch?.body ?? (kind === "elbow" ? body : diameter), diameter];
}

export function nominalSocketReach(id: WaterFittingId) {
  const { kind, body, diameter } = waterFittingProduct(id);
  return kind === "elbow" ? body - diameter / 2 : body / 2;
}
