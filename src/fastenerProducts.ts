import {
  sdwsFramingName,
  sdwsFramingPacks,
  sdwsFramingReview,
  sdwsFramingSources,
  type SdwsFramingPack,
} from "./sdwsFramingReference";

/** Author-reviewed product evidence. Project input cannot add or override these facts. */
export type WoodFastenerProductId =
  | "grk-r4-103101"
  | "grk-cabinet-113079"
  | "simpson-csvz3r70"
  | "simpson-dsvt3r70"
  | "grk-cabinet-114069"
  | SdwsFramingPack["productId"];
export type WoodFastenerSource = Readonly<{
  url: string;
  revision: string;
  reviewedAt: string;
  scope: string;
  note: string;
}>;
export type WoodFastenerDatum = Readonly<{
  id: "head-top" | "head-bearing";
  label: string;
  note: string;
}>;
export type WoodFastenerProduct = Readonly<{
  productId: WoodFastenerProductId;
  name: string;
  packCount: number;
  drive: "T25" | "T15";
  /** Purchase label only. Never use this as measured surface-to-tip depth. */
  nominalLength: number;
  evidenceRevision: string;
  sources: readonly WoodFastenerSource[];
  datums: readonly WoodFastenerDatum[];
  conflicts: readonly string[];
  unknowns: readonly string[];
  /** Neither a labeled nominal length nor a drawing resolves actual installation depth. */
  surfaceToTipDepth: null;
  tipLength: null;
}>;

const reviewedAt = "2026-11-17T03:55:01.000Z";
function source(
  url: string,
  revision: string,
  scope: string,
  note: string,
  sourceReviewedAt = reviewedAt,
): WoodFastenerSource {
  return Object.freeze({
    url,
    revision,
    reviewedAt: sourceReviewedAt,
    scope,
    note,
  });
}
function product(value: WoodFastenerProduct): WoodFastenerProduct {
  if (
    !Number.isInteger(value.packCount) ||
    value.packCount < 1 ||
    !Number.isFinite(value.nominalLength) ||
    value.nominalLength <= 0
  )
    throw Error(
      "Trusted wood-screw facts require a positive whole pack count and positive nominal length.",
    );
  return Object.freeze({
    ...value,
    sources: Object.freeze([...value.sources]),
    datums: Object.freeze(value.datums.map((datum) => Object.freeze(datum))),
    conflicts: Object.freeze([...value.conflicts]),
    unknowns: Object.freeze([...value.unknowns]),
  });
}

export const woodFastenerProducts: readonly WoodFastenerProduct[] =
  Object.freeze([
    product({
      productId: "grk-r4-103101",
      name: "GRK R4 #9 × 2½ in · 100-screw box",
      packCount: 100,
      drive: "T25",
      nominalLength: 2.5,
      evidenceRevision: "grk-r4-103101-2026-11-17-v1",
      sources: [
        source(
          "https://www.grkfasteners.com/grk-products/structural-framing-screws/r4-multi-purpose-screw",
          "Current manufacturer pack table",
          "Product identity, nominal size, purchase pack and drive",
          "Part 103101 is the #9 × 2½ in handy pack of 100 with T25 drive. Wood-to-wood application references do not supply a project fastening schedule or connector equivalence.",
        ),
        source(
          "https://www.grkfasteners.com/getmedia/32d47272-9f9b-4f68-b663-60c09bcbd7bc/GRK-R4-Customer-Drawing-(1)_2.pdf?ext=.pdf",
          "Drawing dated 11/01/2023, sheet 1, #9 × 2½ row",
          "Nominal drawing dimensions without manufacturing tolerances",
          "Drawing L is 2.50 in from the head-top plane; thread length is 1.57 in. Head diameter .329, shank .128, outside thread .173 and root .112 in are separate dimensions, not pilot sizes.",
        ),
        source(
          "https://icc-es.org/wp-content/uploads/report-directory/ESR-3201.pdf",
          "ESR-3201 reissued July 2026; Table 1A, pages 1/5",
          "Conditional evaluation reference; no project capacity or installation approval",
          "Table 1A instead lists L 2⅜ in and thread length 1⅝ in. Page 1 notation and the table footnote describe different length datums. Material, grain/loading and drilling conditions matter; no numeric load, edge or pilot rules are applied here.",
        ),
        source(
          "https://www.homedepot.com/p/203525228",
          "Retailer model 103101 / SKU 723205",
          "Exact public purchase reference only",
          "100-screw pack; no selected-store price or availability was imported.",
        ),
        source(
          "https://www.lowes.com/pd/GRK-100-Count-9-x-2-5-in-Countersinking-Head-Coated-Self-Tapping-Star-Drive-Interior-Exterior-Wood-Screw/50303209",
          "Retailer model 103101.0 / item 580238",
          "Exact public purchase reference only",
          "100-screw pack. The reviewed .0 suffix is preserved; it is not a rule for matching other model numbers.",
        ),
      ],
      datums: [
        {
          id: "head-top",
          label: "Top-of-head plane",
          note: "The US drawing uses this plane, while the evaluation table gives a different L. No surface-to-tip default follows from either label.",
        },
        {
          id: "head-bearing",
          label: "Under-head bearing plane",
          note: "The evaluation report notation mentions this datum but conflicts with its table footnote. Measure from the actual prepared member surface and record the basis.",
        },
      ],
      conflicts: [
        "The live-linked drawing gives L 2.50/thread 1.57 in; the July 2026 evaluation table gives L 2⅜/thread 1⅝ in.",
        "The evaluation report's bottom-head length notation differs from its top-head table footnote; a delivered revision and datum must be resolved.",
      ],
      unknowns: [
        "Actual surface-to-tip depth, tip length, thread position and seating/countersink depth of the delivered screw remain unmeasured.",
        "Pilot/clearance diameters and depths, edge/end/spacing requirements, driver access and substrate/exposure suitability require their own evidence.",
        "No plywood-edge withdrawal, joint capacity, code, installation or Simpson-connector approval is established.",
      ],
      surfaceToTipDepth: null,
      tipLength: null,
    }),
    product({
      productId: "grk-cabinet-113079",
      name: "GRK #8 × 2½ in cabinet screw · 100-screw box",
      packCount: 100,
      drive: "T15",
      nominalLength: 2.5,
      evidenceRevision: "grk-cabinet-113079-2026-11-17-v1",
      sources: [
        source(
          "https://www.grkfasteners.com/grk-products/finish/low-profile-cabinet-screw",
          "Current manufacturer pack table",
          "Product identity, nominal size, purchase pack and drive",
          "Part 113079 is #8 × 2½ in, 100 screws, T15. Cabinet construction/installation scope is not proof of a particular carcass joint or plywood-edge strength.",
        ),
        source(
          "https://www.grkfasteners.com/getmedia/fb0fbb28-29c0-477c-8349-2c2364caa94d/GRK-Cabinet-Customer-Drawing_1.pdf?ext=.pdf",
          "Drawing dated 11/01/2023, sheet 1, #8 × 2½ row",
          "Nominal drawing dimensions without manufacturing tolerances",
          "L 2.50 in starts beneath the washer head; thread length 1.57, head diameter .423 and shank .114 in. The drawing's malformed numeric drive column is not used; the pack table identifies T15.",
        ),
        source(
          "https://www.grkfasteners.com/getmedia/d4fe6346-bb1a-4160-9fbc-09cbfa6a65ea/GRK-Sellsheet2025-Cabinet.pdf?ext=.pdf",
          "Sell sheet 50137, 11/25, page 2",
          "Conflicting nominal profile; limited tested material configurations",
          "The sell sheet gives head diameter .393 and shank .110 in rather than the drawing's .423/.114. Its reference configurations do not qualify arbitrary plywood/MDF edge fastening or a completed cabinet.",
        ),
        source(
          "https://www.homedepot.com/p/203525221",
          "Retailer model 113079 / SKU 726538",
          "Exact public purchase reference only",
          "100-screw pack. Retailer finish/exposure descriptions need delivered-product review; no stock or price was imported.",
        ),
        source(
          "https://www.lowes.com/pd/GRK-8-x-2-1-2-in-Yellow-Polymer-Round-Washer-Interior-Exterior-Wood-Screws-100-Count/50303173",
          "Retailer model 113079.0 / item 580211",
          "Exact public purchase reference only",
          "100-screw pack. This is not the white 120660 / 80-count sell variant.",
        ),
      ],
      datums: [
        {
          id: "head-bearing",
          label: "Under-washer bearing plane",
          note: "The drawing's nominal L excludes the head height. Actual surface-to-tip depth still needs user measurement and the actual seating condition.",
        },
      ],
      conflicts: [
        "Drawing head/shank diameters .423/.114 in conflict with the 11/25 sell sheet's .393/.110 in; no exact installed mesh is selected.",
        "Retailer interior/exterior and coating fields differ from their marketing descriptions; verify the delivered finish and intended exposure.",
      ],
      unknowns: [
        "Actual tip geometry, surface-to-tip depth, head seating and delivered profile/tolerances remain unverified.",
        "A complete cabinet-specific pilot, clearance, edge/end/spacing and driver-access schedule is unresolved.",
        "The reviewed identity establishes no plywood-edge withdrawal, cabinet capacity, code or installation approval.",
      ],
      surfaceToTipDepth: null,
      tipLength: null,
    }),
    product({
      productId: "simpson-csvz3r70",
      name: "Simpson Strong-Drive CSV #10 × 3 in · 70-screw box",
      packCount: 70,
      drive: "T25",
      nominalLength: 3,
      evidenceRevision: "simpson-csvz3r70-2026-11-17-v1",
      sources: [
        source(
          "https://www.strongtie.com/resources/literature/fastening-systems-catalog",
          "C-F-2025 current catalog; expires December 31, 2026",
          "Catalog identity and source validity boundary",
          "The current catalog replaces C-F-2023. Purchase facts do not provide a project fastening schedule or permission to apply expired technical instructions.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://ssttoolbox.widen.net/content/07il60awb7/original/C-F-2025.pdf?download=true",
          "C-F-2025 printed/physical page 96, CSVZ3R70 row",
          "Exact retail pack, nominal size, drive and dry-interior product scope",
          "CSVZ3R70 is #10 × 3 in, T25, yellow zinc, 70 screws per retail box. Master-carton quantity 6 is not a retail pack multiplier. Dry-interior sawn/engineered-wood scope does not qualify a particular joint or plywood-edge withdrawal.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://www.homedepot.com/p/321563361",
          "Retailer model CSVZ3R70 / SKU 1008711183",
          "Exact public 70-count purchase reference only",
          "The #10 × 3 in yellow-zinc flat-head screw is the 70-count model. The retailer lists replacement BIT25T-2 while the manufacturer catalog and Lowe’s list BIT25T-2-R2; exact accessory fit remains separate. No store price, stock or delivered seating datum was observed.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://www.lowes.com/pd/Simpson-Strong-Tie-Strong-Drive-174-CSV-Construction-Screw-8212-10-x-3-in-T-25-Flat-Head-Yellow-Zinc-70-Qty/1002623380",
          "Retailer model CSVZ3R70 / item 2132121",
          "Exact public 70-count purchase reference only",
          "The same manufacturer model is a 70-screw interior box. The ACQ-approved field is No; no treated-wood/exterior or project-joint approval is inferred.",
          "2026-11-17T15:35:26.215Z",
        ),
      ],
      datums: [],
      conflicts: [
        "Home Depot lists replacement bit BIT25T-2 while the current manufacturer catalog and Lowe’s list BIT25T-2-R2. Verify the delivered drive accessory; neither listing establishes ownership or exact fit.",
      ],
      unknowns: [
        "Delivered surface-to-tip depth, head-top/bearing length datum, seating/countersink, tip/thread profile and manufacturing tolerances remain unknown. Nominal 3 in is not an entered installation depth.",
        "Actual pilot/clearance diameters and depths, edge/end spacing, wood/grain, driver access and joint capacity require separate review; no universal schedule is supplied.",
        "Dry-interior product scope does not approve arbitrary plywood-edge withdrawal, heated sauna use, wall anchorage, installed strength or code compliance.",
        "An included T25 bit is a package reference, not verified ownership, bit condition, exact fit, accessible drive or a powered driver selection.",
        "This screw is not an SD9112 or N10DHDG substitute in the A21Z connector schedule and is not a hinge or glazing fixing detail.",
      ],
      surfaceToTipDepth: null,
      tipLength: null,
    }),
    product({
      productId: "simpson-dsvt3r70",
      name: "Simpson Deck-Drive DSV #10 × 3 in · 70-screw box",
      packCount: 70,
      drive: "T25",
      nominalLength: 3,
      evidenceRevision: "simpson-dsvt3r70-2026-11-17-v1",
      sources: [
        source(
          "https://www.strongtie.com/resources/literature/fastening-systems-catalog",
          "C-F-2025 current catalog; expires December 31, 2026",
          "Catalog identity and source validity boundary",
          "The current catalog replaces C-F-2023. Current purchase facts do not renew an expired retailer-linked installation flier.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://ssttoolbox.widen.net/content/07il60awb7/original/C-F-2025.pdf?download=true",
          "C-F-2025 printed/physical page 77, DSVT3R70 row",
          "Exact retail pack, nominal size, drive and conditional decking/trim scope",
          "DSVT3R70 is #10 × 3 in, T25, Tan Quik Guard, 70 screws per retail box. Nominal head diameter .330 in is not a shank/pilot diameter or a complete seated profile. Approximate 76 per pound does not replace the exact counted pack.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://www.homedepot.com/p/321563400",
          "Retailer model DSVT3R70 / SKU 1008711179; manufacturer response October 2026",
          "Exact public purchase identity and unresolved application/coating discrepancy",
          "This is the 70-count Tan Quik Guard box; 1.1 lb is a weight field. A manufacturer-branded answer directs structural-framing selection to SDWS rather than approving DSV for that project. The generic plating field differs from the branded finish, and the retailer replacement label BIT25T-2 differs from the manufacturer catalog’s BIT25T-2-R2.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://www.lowes.com/pd/Simpson-Strong-Tie-Deck-Drive-8482-DSV-WOOD-Screw-8212-10-x-3-in-T-25-Flat-Head-Quik-Guard-174-Tan-70-Qty/1002623434",
          "Retailer model DSVT3R70 / item 2132130",
          "Exact public 70-count purchase reference only",
          "The same manufacturer model is #10 × 3 in, T25, Tan Quik Guard, 70 per box. Its ACQ-approved field does not qualify every preservative, exposure, moisture condition or metal contact.",
          "2026-11-17T15:35:26.215Z",
        ),
        source(
          "https://images.thdstatic.com/catalog/pdfImages/e9/e94e6a40-f22a-4e2a-bdaf-885a266b6831.pdf",
          "F-F-DSV20, expired December 31, 2022",
          "Historical conflicting application wording only; no current numeric installation rules",
          "This older retailer-linked flier uses broader framing language. Its explicit expiry and the narrower 2026 manufacturer answer prevent treating it as a current framing schedule, load, spacing or capacity rule.",
          "2026-11-17T15:35:26.215Z",
        ),
      ],
      datums: [],
      conflicts: [
        "Retailer replacement-bit wording BIT25T-2 differs from the current manufacturer catalog’s BIT25T-2-R2. Verify the delivered accessory without inferring ownership, compatibility or driver function.",
        "The expired F-F-DSV20 flier's broader framing language and catalog application wording differ from the October 2026 manufacturer answer directing structural framing to SDWS; project selection remains unresolved.",
        "The retailer's generic electrogalvanized-zinc plating field differs from product-specific Tan Quik Guard coating evidence; verify the delivered finish and actual exposure/treatment conditions.",
      ],
      unknowns: [
        "Delivered surface-to-tip depth, head-top/bearing length datum, seating/countersink, tip/thread profile and manufacturing tolerances remain unknown. Nominal 3 in does not place a tip.",
        "No universal pilot/clearance diameter or depth, edge/end spacing, driver-access or joint/load schedule is established; the .330 in nominal head diameter is not a drill size.",
        "Exterior/certain treated-wood decking, fascia and trim are conditional selection contexts, not automatic framing, greenhouse, sauna, arbitrary plywood-edge or structural approval.",
        "Included T25-bit marketing does not establish ownership, condition, actual bit quantity or a driver motor. No store inventory or price was imported.",
        "This screw is not an SD9112 or N10DHDG substitute in the A21Z connector schedule and supplies no hinge, glazing or wall-anchor installation detail.",
      ],
      surfaceToTipDepth: null,
      tipLength: null,
    }),
    product({
      productId: "grk-cabinet-114069",
      name: "GRK #8 × 1¼ in cabinet screw · 100-screw box",
      packCount: 100,
      drive: "T15",
      nominalLength: 1.25,
      evidenceRevision: "grk-cabinet-114069-2026-11-19-v1",
      sources: [
        source(
          "https://www.grkfasteners.com/grk-products/finish/low-profile-cabinet-screw",
          "Current manufacturer handy-pack table; reviewed November 19, 2026 UTC",
          "Exact product identity, nominal size, counted pack and drive",
          "Part 114069 is #8 × 1¼ in, T15, 100 screws. It is distinct from 113079 2½ in/100, white 120680 1¼ in/80 and 100069 1¼ in/330. Cabinet-use references do not supply a project fastening schedule.",
          "2026-11-19T03:45:28.802Z",
        ),
        source(
          "https://www.grkfasteners.com/getmedia/fb0fbb28-29c0-477c-8349-2c2364caa94d/GRK-Cabinet-Customer-Drawing_1.pdf?ext=.pdf",
          "Drawing dated 11/01/2023, sheet 1, #8 × 1¼ row",
          "Nominal under-washer length datum; no manufacturing tolerances",
          "The 1¼ in row gives L 1.25 in beneath the washer head and thread length 1.00 in. Family head/shank diameters are .423/.114 in. The malformed numeric drive column is not used; the current pack table establishes T15. These references do not fill measured installation depth.",
          "2026-11-19T03:45:28.802Z",
        ),
        source(
          "https://www.grkfasteners.com/getmedia/d4fe6346-bb1a-4160-9fbc-09cbfa6a65ea/GRK-Sellsheet2025-Cabinet.pdf?ext=.pdf",
          "Sell sheet 50137, 11/25, pages 1–2",
          "Counted identity, conflicting nominal profile and conditional reference configurations",
          "The sheet repeats 114069/100 but gives family head/shank diameters .393/.110 in instead of .423/.114. Reference embedment rows start at .75 in and require specified material/configuration conditions. No load is extrapolated for a shorter entered path, and predrilling marketing does not set pilot inputs.",
          "2026-11-19T03:45:28.802Z",
        ),
        source(
          "https://www.homedepot.com/p/GRK-Fasteners-8-x-1-1-4-in-Star-Drive-Low-Profile-Washer-Head-Drive-Style-Cabinet-Wood-Screw-100-Pack-114069/203556408",
          "Retailer model 114069 / SKU 205890; full exact product path",
          "Exact public 100-count purchase reference and unresolved exposure fields",
          "The page identifies #8 × 1¼ in and 100 screws. Finish/interior-exterior fields differ from marketing descriptions; verify the delivered coating and application. Manufacturer-branded Q&A does not assign cabinet screws structural approval values. No store price, stock or observed measurements were imported.",
          "2026-11-19T03:45:28.802Z",
        ),
        source(
          "https://www.lowes.com/pd/GRK-8-x-1-1-4-in-Round-Washer-Head-Interior-Exterior-Wood-Screws-100-Count/50303177",
          "Retailer model 114069.0 / item 580213",
          "Exact public 100-count purchase reference only",
          "The same reviewed 100-screw pack lists #8 × 1¼ in and T15. Preserve this exact .0 model suffix rather than normalizing other product identities. No selected-store price, availability or accessory ownership was observed.",
          "2026-11-19T03:45:28.802Z",
        ),
      ],
      datums: [
        {
          id: "head-bearing",
          label: "Under-washer bearing plane",
          note: "The drawing's nominal L excludes the head height. Measure actual member-surface-to-tip depth after the proposed seating; a 1¼ in purchase label is not that measurement.",
        },
      ],
      conflicts: [
        "Drawing head/shank diameters .423/.114 in conflict with the 11/25 sell sheet's .393/.110 in; delivered profile and exact seating remain unresolved.",
        "Retailer finish/exposure fields differ from family marketing descriptions; no universal indoor/outdoor or treatment suitability is selected.",
      ],
      unknowns: [
        "Actual surface-to-tip depth, tip/thread geometry, head seating, tolerances, pilot/clearance diameters and deepest drill-tip depths remain unmeasured. Predrilling marketing does not fill zeroes or approve a procedure.",
        "A synthetic .703 in panel plus entered 1.25 in depth leaves .547 in tip-path penetration, below the reference tables' first .75 in embedment row. No load is extrapolated, and tip-path penetration is not verified thread engagement.",
        "Plywood-edge withdrawal, grain, edge/end/spacing, clamps, driver access, joint capacity, seating capacity and installation approval remain unresolved. This is not an A21Z, hinge, wall-anchor or heated-sauna fastening schedule.",
        "T15 identifies the required recess accessory only; no owned bit, powered/manual driver function or delivered accessory fit is credited.",
      ],
      surfaceToTipDepth: null,
      tipLength: null,
    }),
    ...sdwsFramingPacks.map((pack) =>
      product({
        productId: pack.productId,
        name: sdwsFramingName(pack),
        packCount: pack.packCount,
        drive: sdwsFramingReview.drive,
        nominalLength: pack.length,
        evidenceRevision: `${pack.productId}-2026-11-20-v1`,
        sources: sdwsFramingSources(pack),
        datums: [
          {
            id: "head-bearing",
            label: "Underside of the head",
            note: `ER-192 Table 1 describes a ${pack.underHeadLength} in under-head length. Measure the proposed wood-surface-to-tip depth on the delivered part and joint.`,
          },
        ],
        conflicts: [
          `The box uses the nominal ${pack.lengthLabel} label. The report uses a distinct under-head dimension. Keep both separate from installed depth.`,
        ],
        unknowns: [
          "Review current model-specific instructions, wood and treatment, load direction, edge distances, spacing and applicable code edition for each connection.",
          "Record the actual seating and any pilot or clearance bore used. The dimensioned screw representation and penetration stay unverified until reviewed against the actual joint.",
          "Use the connector manufacturer's exact schedule for metal connectors. This purchase reference does not transfer to connector screws, glazing or sauna environments.",
        ],
        surfaceToTipDepth: null,
        tipLength: null,
      }),
    ),
  ]);

export function getWoodFastenerProduct(
  id: string,
): WoodFastenerProduct | undefined {
  return woodFastenerProducts.find((entry) => entry.productId === id);
}
