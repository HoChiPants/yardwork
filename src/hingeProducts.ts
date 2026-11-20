/** Author-reviewed purchase/reference evidence; user measurements cannot override it. */
export const hingeProductId = "everbilt-29256-continuous-hinge" as const;
export type HingeProductId = typeof hingeProductId;
export type HingeProductSource = Readonly<{
  url: string;
  revision: string;
  reviewedAt: string;
  scope: string;
  note: string;
}>;
export type HingeProduct = Readonly<{
  productId: HingeProductId;
  name: string;
  manufacturer: string;
  manufacturerPartNumber: "29256";
  packCount: 1;
  nominalLength: 48;
  referenceWidth: 1.5;
  /** A linked instruction reference, never an automatic measured operation value. */
  referencePilotDiameter: 0.0625;
  evidenceRevision: string;
  sources: readonly HingeProductSource[];
  conflicts: readonly string[];
  unknowns: readonly string[];
  actualUsableLength: null;
  cutKerf: null;
  axisOffset: null;
  leafThickness: null;
  knuckleDiameter: null;
  holePattern: null;
  suppliedScrewCount: null;
  suppliedScrewIdentity: null;
}>;

const reviewedAt = "2026-11-17T07:20:58.089Z";
export const hingeProducts: readonly HingeProduct[] = Object.freeze([
  Object.freeze({
    productId: hingeProductId,
    name: "Everbilt 29256 nominal 48 in continuous hinge",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: "29256" as const,
    packCount: 1 as const,
    nominalLength: 48 as const,
    referenceWidth: 1.5 as const,
    referencePilotDiameter: 0.0625 as const,
    evidenceRevision: "everbilt-29256-2026-11-17-v1",
    sources: Object.freeze([
      Object.freeze({
        url: "https://www.homedepot.com/p/314150989",
        revision: "Model29256 / SKU1005659023, public retailer reference",
        reviewedAt,
        scope: "Purchase identity and nominal size; no store availability",
        note: "One cuttable bright-nickel steel continuous hinge. Nominal48-inch title and48.03-inch generic height field differ; neither supplies the actual measured usable length or hinge axis.",
      }),
      Object.freeze({
        url: "https://images.thdstatic.com/catalog/pdfImages/43/43ad05ea-dd8a-438f-b10c-33d2ccdf1c95.pdf",
        revision:
          "Retailer-linked continuous-hinge instructions, page1; production revision unspecified",
        reviewedAt,
        scope: "Transfer actual holes; linked1/16-inch pilot reference",
        note: "Position actual hinge, transfer its holes, drill1/16-inch pilots and install screws. The instruction does not resolve pilot depth, supplied screw identity/count, complete moving geometry or installation capacity.",
      }),
    ]),
    conflicts: Object.freeze([
      "Nominal48-inch length and the generic48.03-inch retailer height field must not become a measured stock length.",
      "National V570 and the Everbilt19844 support card describe different products and cannot supply this hinge's hole pattern or installation geometry.",
    ]),
    unknowns: Object.freeze([
      "Actual usable stock length, metal-cut kerf and retained physical end identities require recorded user evidence.",
      "Axis offset, leaf/knuckle envelope, hole centers, supplied screw identity/count and actual seated depths remain unknown until recorded.",
      "Pilot depth, substrate/edge suitability, head/leaf fit, driver access, lid mass/CG, hold-open/pinch protection and closed-seat support remain separate reviews.",
      "A purchase reference, measured interval or centerline review establishes no installed mechanism, load capacity, soft-close or code approval.",
    ]),
    actualUsableLength: null,
    cutKerf: null,
    axisOffset: null,
    leafThickness: null,
    knuckleDiameter: null,
    holePattern: null,
    suppliedScrewCount: null,
    suppliedScrewIdentity: null,
  }),
]);

export function getHingeProduct(id: string): HingeProduct | undefined {
  return hingeProducts.find((product) => product.productId === id);
}
