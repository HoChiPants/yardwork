import { sdwsFramingPacks } from "./sdwsFramingReference";
import { sunliteFastener } from "./sunliteFastenerReference";
import { concreteAnchor } from "./concreteAnchorReference";
import { catalog, uid, type Project } from "./model";
import { accuride3732 } from "./drawerSlideReference";
import { everbiltRodBracket } from "./closetRodReference";
import { everbiltLidSupport, foldingLidStays, foldingLidStayScope } from "./lidStayReference";
import { dewaltJigsaw } from "./jigsawReference";
import { greenhouseDoorKits } from "./greenhouseDoorReference";
import { gafRoofShingle, shingleEdgeProducts } from "./shingleRoofReference";
import { gibraltarDripEdge, wissSnips } from "./dripEdgeReference";
import { harviaKit } from "./saunaHeaterReference";
import { edgeBandingProducts, edgeBandingScope, edgeTrimmer } from "./edgeBandingReference";
import { paslodeFinishNailer, paslodeFinishNails } from "./paslodeFinishReference";
import { trimSealant } from "./trimSealantReference";
import { woodGlue } from "./woodGlueReference";
import { everbiltAngleShelfPinIds, everbiltAngleShelfPins, shelfPinProducts } from "./shelfPinReference";
import {
  findRetailerProduct,
  referenceOffersForProduct,
  purchaseSpecForProduct,
  type RetailerProduct,
} from "./retailerCatalog";
import { retailerName, type Retailer } from "./retailers";
import { freshStoreCheck } from "./storeSnapshotTime";
import { floorHangerFasteners, floorHangerScope } from "./floorHangerReference";
import {
  supplyInventorySchema,
  supplyObservationKey,
  supplySelectionSchema,
  type SupplyInventory,
} from "./supplySchema";

export type SupplyContent = {
  name: string;
  quantity: number;
  unit?: "count" | "lb";
  qualifier?: "advertised";
};
export function formatSupplyContent(content: SupplyContent): string {
  if (content.unit === "lb")
    return `${content.quantity} lb${content.qualifier === "advertised" ? " advertised" : ""} · ${content.name} (exact piece count unknown)`;
  return `${content.quantity} × ${content.name}`;
}
type SupplyDefinition = {
  purchaseUnit: string;
  contents: SupplyContent[];
  requirements?: string[];
};
/** Purchase units are explicit: unlike screw packs these sets are not homogeneous. */
export const supplyDefinitions: Record<string, SupplyDefinition> = {
  "sunlite-96714": {
    purchaseUnit: "connector assembly",
    contents: [
      { name: "96 in base", quantity: 1 },
      { name: "96 in cap", quantity: 1 },
    ],
  },
  "sunlite-96715": {
    purchaseUnit: "edge profile",
    contents: [{ name: "96 in U-profile", quantity: 1 }],
  },
  "sunlite-92763": {
    purchaseUnit: "top/bottom tape kit",
    contents: [
      { name: "32 ft nonvented top tape roll", quantity: 1 },
      { name: "32 ft vented bottom tape roll", quantity: 1 },
    ],
  },
  "everbilt-eh-wsthdus-311v": {
    purchaseUnit: "socket pair",
    contents: [
      { name: "open-lip socket", quantity: 1 },
      { name: "closed-lip socket", quantity: 1 },
    ],
  },
  "project-source-23723phslg": {
    purchaseUnit: "flange pair",
    contents: [
      { name: "open flange", quantity: 1 },
      { name: "closed flange", quantity: 1 },
    ],
  },
  "everbilt-29256-continuous-hinge": {
    purchaseUnit: "hinge",
    contents: [{ name: "nominal 48 in continuous hinge", quantity: 1 }],
  },
  "national-n208-637-lid-support": {
    purchaseUnit: "support",
    contents: [{ name: "adjustable-friction lid support", quantity: 1 }],
  },
  "simpson-a21z": {
    purchaseUnit: "angle",
    contents: [{ name: "A21Z angle", quantity: 1 }],
  },
  "simpson-sd9112r100": {
    purchaseUnit: "100-screw box",
    contents: [
      {
        name: "Simpson SD9112 #9 × 1½ in connector screw · ¼ in hex",
        quantity: 100,
      },
    ],
    requirements: [
      "Use only the exact connector and fastener schedule supported by current manufacturer instructions. A generic construction/GRK screw, counted box or A21Z selection does not establish fitting holes, placement, members, coating/exposure, capacity or installation approval.",
      "Nominal length and reported head/shank dimensions do not supply measured seating depth, pilot requirements or a complete installed solid. Purchasing creates no part, hole or connection. Review the included driver rather than automatically buying another.",
    ],
  },
  "simpson-n10dhdg-r": {
    purchaseUnit: "120-nail box",
    contents: [
      { name: "Simpson N10DHDG-R .148 × 1½ in connector nail", quantity: 120 },
    ],
    requirements: [
      "One box contains 120 N10DHDG-R hot-dip galvanized connector nails. Select the exact connector-specific nail schedule; a bright common nail, generic screw or mixed SD/nail schedule is not substituted.",
      "An A21Z reference uses two nails per member, four total, only for its reviewed reference context. Actual wood-entry locations, seating, members, edge/end constraints, finish/exposure and access need separate review; no load, casework or heated-use approval is established.",
      "Purchasing alone creates no installed nails, holes or connection. A generic hammer documents a nail-driving function, not this connector's installation approval; no pneumatic collation or nailer compatibility is inferred.",
    ],
  },
  "grip-rite-16c5": {
    purchaseUnit: "5-lb box",
    contents: [
      {
        name: "Grip-Rite 16C5 bright common nails",
        quantity: 5,
        unit: "lb",
        qualifier: "advertised",
      },
    ],
    requirements: [
      "The advertised5-lb box has no verified exact nail count. Approximate235/around220 source fields must not set required boxes, coverage or exact spares; no count is inferred from mass.",
      "Bright nails are for interior wood use where corrosion is not a concern; manufacturer excludes treated wood. Exterior greenhouse, heated sauna, connector-specific substitutions, nail placement, pilot and load capacity remain unqualified.",
    ],
  },
  "grk-r4-103101": {
    purchaseUnit: "100-screw box",
    contents: [{ name: "GRK R4 #9 × 2½ in screw · T25 drive", quantity: 100 }],
    requirements: [
      "The 2½ in label is nominal. Drawing/report length and thread values and datums conflict; record actual surface-to-tip depth with a basis/date rather than filling it from the product name.",
      "Purchasing alone creates no installed screw, pilot hole, joint capacity or connector approval. A separate fastening plan must retain actual members, locations and unresolved substrate, drilling, edge/end and driver-access evidence.",
    ],
  },
  "grk-cabinet-113079": {
    purchaseUnit: "100-screw box",
    contents: [
      { name: "GRK #8 × 2½ in cabinet screw · T15 drive", quantity: 100 },
    ],
    requirements: [
      "One box contains 100 screws; this is not the white 120660 / 80-count product. Nominal 2½ in length starts beneath the washer head in the drawing and does not supply measured installation depth.",
      "Manufacturer drawing and sell sheet disagree on head/shank dimensions. Delivered profile, finish/exposure, tip geometry, pilot/clearance and edge/end/spacing requirements remain unresolved.",
      "Cabinet application references do not establish plywood-edge withdrawal, completed cabinet capacity or installation approval. Purchasing creates no screw mesh, drilling operation or joint; retain the separate fastening plan and its user-measurement provenance.",
    ],
  },
  "kreg-kma-5mpin": {
    purchaseUnit: "20-pin pack",
    contents: [{ name: "Kreg 5 mm shelf pin", quantity: 20 }],
    requirements: [
      "Pin insertion depth, bearing offset and exact installed geometry need a separately reviewed attachment plan. This purchase alone does not create supports, drilling operations or connections.",
      "Review actual panel thickness, matching nominal 5 mm bores, fit and shelf-support requirements before installation. A per-pin statement is not a whole-shelf load rating.",
      "The complete Kreg jig kit includes four pins, but a tool review does not confirm ownership or unallocated contents. Do not credit kit pins or buy a replacement bit automatically; verify supplied-pin identity and allocate any contents explicitly.",
    ],
  },
  "hillman-simple-mount-9976524": {
    purchaseUnit: "complete restraint kit",
    contents: [
      { name: "Furniture bracket", quantity: 1 },
      { name: "Wall bracket", quantity: 1 },
      { name: "Supplied 5/8 in screw", quantity: 2 },
      {
        name: "Supplied 1½ in screw · target assignment unverified",
        quantity: 2,
      },
      { name: "Clevis pin", quantity: 2 },
      { name: "Cotter/hairpin retainer", quantity: 2 },
      { name: "Cable with two eyes · actual length unverified", quantity: 1 },
    ],
    requirements: [
      "One purchase unit is one complete eleven-component kit; included fittings, screws, pins and cable are not additional purchases. The project restraint count must be explicitly chosen and reviewed.",
      "The exact reviewed kit method requires an actual connected solid-wood furniture receiver and a wood wall stud. A plywood back/panel or drywall anchor cannot stand in for either member.",
      "Exact current manual revision, fitting/cable/hole geometry, screw gauges, pilots and wall fastener assignment/engagement remain unresolved. Do not infer that the included 1½ in screws establish a universal wall schedule.",
      "Purchasing alone creates no installed restraint, capacity or code approval. A separate saved restraint plan retains user measurements and unresolved attachment-chain decisions.",
    ],
  },
  "simpson-csvz3r70": {
    purchaseUnit: "70-screw box",
    contents: [
      {
        name: "Simpson CSV #10 × 3 in interior wood screw · T25",
        quantity: 70,
      },
    ],
    requirements: [
      "One exact CSVZ3R70 box contains 70 screws. Nominal 3 in is not a measured surface-to-tip, pilot or countersink setting; purchasing creates no installed screws, holes or approved joint.",
      "Review the dry-interior wood application and actual member/grain/edge conditions. No exterior/treated-wood, A21Z connector, arbitrary plywood-edge withdrawal or heated-sauna suitability is inferred.",
      "Manufacturer reports an included T25 bit, but delivered contents, access and condition must be checked. The BIT25T-2 versus BIT25T-2-R2 reference discrepancy remains; no bit ownership or driver function is credited automatically.",
    ],
  },
  "simpson-dsvt3r70": {
    purchaseUnit: "70-screw box",
    contents: [
      {
        name: "Simpson DSV #10 × 3 in Tan Quik Guard wood screw · T25",
        quantity: 70,
      },
    ],
    requirements: [
      "One exact DSVT3R70 box contains 70 screws. Approximate 76-per-pound and package weight1.1lb do not set the count. Nominal length and .330 in head field do not provide measured seating, pilot or installed geometry.",
      "Review actual exterior/treated-wood exposure and current manufacturer application guidance. The framing-scope conflict and expired F-F-DSV20 remain unresolved; no automatic framing, A21Z, glazing or heated-sauna approval follows.",
      "Purchasing creates no installed screws or holes. Inspect the reported included T25 bit and its BIT25T-2/BIT25T-2-R2 reference; no owned accessory, driver function, capacity or project fastening schedule is inferred.",
    ],
  },
  "grk-cabinet-114069": {
    purchaseUnit: "100-screw box",
    contents: [
      { name: "GRK #8 × 1¼ in cabinet screw · T15 drive", quantity: 100 },
    ],
    requirements: [
      "One exact 114069 box contains 100 screws. It is not the 113079 2½ in/100, white 120680 1¼ in/80 or 100069 1¼ in/330 pack. Nominal under-washer length does not set installed surface-to-tip or pilot depths.",
      "Drawing and sell sheet disagree on nominal head/shank dimensions. Actual seating, tip/thread engagement, pilot/clearance, edge/end/spacing, wood and exposure require separate review; no cabinet or seat capacity is established.",
      "Purchasing creates no screw mesh, holes or joint. T15 does not imply owned bit or driver function; preserve the separate W plan and user-measurement provenance. No accessory ownership or approved installation is credited.",
    ],
  },
  "project-source-27587phllg": {
    purchaseUnit: "intermediate bracket",
    contents: [
      { name: "27587PHLLG bracket with snap-in rod clip", quantity: 1 },
    ],
    requirements: [
      "Fasteners are separate. Verify the delivered bracket's rod seat reach, actual backing, hole geometry and current instructions.",
    ],
  },
  [everbiltRodBracket.productId]: {
    purchaseUnit: "intermediate bracket",
    contents: [{ name: "Everbilt 14317 white shelf and closet rod bracket", quantity: 1 }],
    requirements: [everbiltRodBracket.scope],
  },
  "huum-steel60stuwg": {
    purchaseUnit: "heater package",
    contents: [
      {
        name: "STEEL60STUWG heater and WiFi Glass package listing",
        quantity: 1,
      },
    ],
    requirements: [
      "Bathing Brands marketplace reference. Confirm delivered STEEL 6 regional label, the quantity of stones, controls, sensors and floor-mount hardware with the seller.",
      "Use the current manufacturer manual and a qualified installer. The package does not establish site fit, floor capacity, ventilation, or electrical suitability.",
    ],
  },
  [harviaKit.productId]: {
    purchaseUnit: "heater package",
    contents: [{ name: "Harvia KIP 6 kW heater package with Xenio control, Wi-Fi and stones", quantity: 1 }],
    requirements: [harviaKit.installationReview],
  },
  [accuride3732.productId]: {
    purchaseUnit: "left/right slide pair",
    contents: [
      { name: "left T46322G22 slide", quantity: 1 },
      { name: "right T46322G22 slide", quantity: 1 },
    ],
    requirements: [
      "Verify the delivered slide marking, fasteners and the cabinet mounting method. The package is one pair per drawer; included screw quantities and installation details require field review.",
    ],
  },
  ...Object.fromEntries(
    Object.entries(greenhouseDoorKits).map(([id, kit]) => [
      id,
      {
        purchaseUnit: "door hardware kit",
        contents: kit.contents.map((part) => ({ ...part })),
        requirements: [
          "Mounting fasteners are included. Verify delivered sizes and backing. Confirm latch and door operation, weather exposure and hinge loads separately.",
        ],
      },
    ]),
  ),
  "everbilt-802404": {
    purchaseUnit: "48-pin pack",
    contents: [{ name: "Everbilt 802404 5 mm shelf support spoon", quantity: 48 }],
    requirements: [
      "Confirm the delivered pin, actual panel thickness and a same-stock test bore. Nominal 5 mm identifies the hole size but does not establish pin insertion, bearing reach or bearing height.",
      "A purchase alone creates no drilled holes, installed supports or shelf capacity. Jig-kit pins are counted separately.",
    ],
  },
  ...Object.fromEntries(everbiltAngleShelfPinIds.map((id) => {
    const { model, packCount } = shelfPinProducts[id];
    return [
      id,
      {
        purchaseUnit: `${packCount}-pin pack`,
        contents: [{ name: `Everbilt ${model} angled shelf support`, quantity: packCount }],
        requirements: [
          everbiltAngleShelfPins[id].fitNote,
          "Confirm the actual bearing surface, support contact and shelf capacity separately.",
        ],
      },
    ];
  })),
  ...Object.fromEntries(
    Object.entries(foldingLidStays).map(([id, product]) => [
      id,
      {
        purchaseUnit: "lid stay",
        contents: [{ name: `Everbilt ${product.model} ${product.hand.toLowerCase()} folding stay`, quantity: 1 }],
        requirements: [foldingLidStayScope],
      },
    ]),
  ),
  [everbiltLidSupport.productId]: {
    purchaseUnit: "lid support kit",
    contents: [{ name: "Everbilt 28987 listed kit", quantity: 1 }],
    requirements: [everbiltLidSupport.scope],
  },
  [concreteAnchor.productId]: {
    purchaseUnit: "single anchor",
    contents: [{ name: concreteAnchor.label, quantity: concreteAnchor.unitsPerPack }],
    requirements: ["Confirm site-specific anchorage, delivered head/fixture and embedment requirements, applicable concrete and exposure before installation."],
  },
  [sunliteFastener.productId]: {
    purchaseUnit: "250-screw bag",
    contents: [{ name: sunliteFastener.name, quantity: sunliteFastener.pack }],
    requirements: ["Match the delivered screw and effective gasket contact to the panel system. Verify hole layout, wood engagement, sealing, and site loads for the selected detail."],
  },
  [gafRoofShingle.id]: {
    purchaseUnit: "shingle bundle",
    contents: [{ name: `${gafRoofShingle.label} bundle`, quantity: 1 }],
    requirements: [gafRoofShingle.coverageNote, "Review starter, ridge, flashing, underlayment and attachment separately for the full roof assembly."],
  },
  ...Object.fromEntries(Object.values(shingleEdgeProducts).map((edge) => [
    edge.id,
    {
      purchaseUnit: edge.purchaseUnit,
      contents: [{ name: edge.label, quantity: 1 }],
      requirements: [edge.coverageNote, edge.cutNote],
    },
  ])),
  [gibraltarDripEdge.id]: {
    purchaseUnit: "10 ft drip edge stick",
    contents: [{ name: gibraltarDripEdge.label, quantity: 1 }],
    requirements: [gibraltarDripEdge.note, "Review the actual roof assembly, fasteners, overlap, corner flashing and corrosion compatibility."],
  },
  ...Object.fromEntries(
    sdwsFramingPacks.map((pack) => [pack.productId, {
      purchaseUnit: `${pack.packCount}-screw box`,
      contents: [{ name: `Simpson SDWS Framing ${pack.lengthLabel} · T25`, quantity: pack.packCount }],
      requirements: [
        "Check the delivered model, finish and applicable Simpson and ER-192 requirements for the actual wood, joint and site.",
        "Record the actual seating and any pilot setup with the screw plan. Purchasing creates a supply entry.",
      ],
    }] satisfies [string, SupplyDefinition]),
  ),
  ...Object.fromEntries(Object.entries(edgeBandingProducts).map(([id, stock]) => [
    id, {
      purchaseUnit: "roll",
      contents: [{ name: `${stock.width} in × ${stock.length / 12} ft white birch iron-on banding`, quantity: 1 }],
      requirements: [edgeBandingScope],
    },
  ])),
  [paslodeFinishNails.id]: {
    purchaseUnit: "2,000-nail box",
    contents: [{ name: paslodeFinishNails.name, quantity: paslodeFinishNails.packCount }],
    requirements: [paslodeFinishNails.requirement],
  },
  [trimSealant.id]: {
    purchaseUnit: "cartridge",
    contents: [{ name: "10.1 fl oz white sealant cartridge", quantity: 1 }],
    requirements: [
      trimSealant.scope,
      "Use a compatible caulk gun. Dry-fit the trim and test the finish on a matching scrap before filling the seam.",
    ],
  },
  [woodGlue.id]: {
    purchaseUnit: "bottle",
    contents: [{ name: "16 fl oz bottle of wood glue", quantity: 1 }],
    requirements: [
      woodGlue.scope,
      "Dry-fit the joint and check clamp access, surface preparation and assembly time against the product instructions.",
    ],
  },
  "simpson-lus26z": {
    purchaseUnit: "hanger",
    contents: [{ name: "LUS26Z face-mount hanger", quantity: 1 }],
    requirements: [floorHangerScope],
  },
  "simpson-lus28z": {
    purchaseUnit: "hanger",
    contents: [{ name: "LUS28Z face-mount hanger", quantity: 1 }],
    requirements: [floorHangerScope],
  },
  [floorHangerFasteners.joist.id]: {
    purchaseUnit: "100-screw box",
    contents: [{ name: "SD9212 #9 × 2½ in connector screw · ¼ in hex", quantity: 100 }],
    requirements: [floorHangerScope],
  },
};
const toolPurchaseDefinitions: Record<string, SupplyDefinition> = {
  [wissSnips.id]: {
    purchaseUnit: "aviation snip",
    contents: [{ name: wissSnips.label, quantity: 1 }],
    requirements: ["Verify the actual metal, single-layer thickness and access across formed bends before cutting."],
  },
  "dewalt-dpg82-11c": {
    purchaseUnit: "pair",
    contents: [
      { name: "DPG82-11C clear Concealer safety goggles", quantity: 1 },
    ],
    requirements: [
      "Verify delivered markings and fit for your operation. Review any separate face or respiratory protection requirements.",
    ],
  },
  "3m-90565-4dc-ps": {
    purchaseUnit: "earmuff",
    contents: [{ name: "90565-4DC-PS Pro-Grade earmuff", quantity: 1 }],
    requirements: [
      "Check fit and exposure for actual operations. The package rating describes the tested product. Individual attenuation depends on fit.",
    ],
  },
  "dewalt-dwht38125s": {
    purchaseUnit: "tape measure",
    contents: [{ name: "DWHT38125S 25 ft tape measure", quantity: 1 }],
  },
  "swanson-s0101-c": {
    purchaseUnit: "square",
    contents: [{ name: "S0101-C 7 in Speed Square", quantity: 1 }],
  },
  "bessey-gscc2-524": {
    purchaseUnit: "clamp",
    contents: [{ name: "GSCC2.524 24 in bar clamp", quantity: 1 }],
  },
  "dewalt-dwe575sb": {
    purchaseUnit: "saw",
    contents: [{ name: "DWE575SB corded circular saw", quantity: 1 }],
    requirements: [
      "Confirm the delivered blade and workholding setup for the actual wood operation.",
    ],
  },
  "bosch-gcm12sd": {
    purchaseUnit: "saw",
    contents: [{ name: "GCM12SD dual-bevel glide miter saw", quantity: 1 }],
    requirements: [
      "Check actual angles, clamping, blade and cut capacity before using it on a saved profile.",
    ],
  },
  "dewalt-dcd771c2": {
    purchaseUnit: "drill kit",
    contents: [
      { name: "DCD771 drill/driver", quantity: 1 },
      { name: "20V MAX 1.3 Ah battery", quantity: 2 },
      { name: "charger", quantity: 1 },
      { name: "tool bag", quantity: 1 },
    ],
    requirements: ["Choose bits to match the actual holes and fasteners."],
  },
  "kreg-kma3232": {
    purchaseUnit: "jig kit",
    contents: [
      { name: "KMA3232 shelf-pin jig", quantity: 1 },
      { name: "5 mm drill bit", quantity: 1 },
      { name: "depth stop collar", quantity: 1 },
    ],
    requirements: [
      "Verify kit contents and the actual bit and collar. Plan a separate drill and shelf-support purchases as needed.",
    ],
  },
  "crescent-cthack": {
    purchaseUnit: "hacksaw",
    contents: [
      { name: "CTHACK 12 in hacksaw", quantity: 1 },
      { name: "24 TPI bi-metal blade", quantity: 1 },
    ],
  },
  [dewaltJigsaw.productId]: {
    purchaseUnit: "jigsaw",
    contents: [
      { name: "DCS334B bare jigsaw", quantity: 1 },
      { name: "Included jigsaw blade", quantity: 1 },
    ],
    requirements: ["Provide a compatible battery and charger. Verify the supplied blade or select a blade for the opening."],
  },
  [edgeTrimmer.id]: {
    purchaseUnit: "trimmer",
    contents: [{ name: edgeTrimmer.name, quantity: 1 }],
    requirements: [edgeTrimmer.requirement],
  },
  [paslodeFinishNailer.id]: {
    purchaseUnit: "nailer",
    contents: [{ name: paslodeFinishNailer.name, quantity: 1 }],
    requirements: [paslodeFinishNailer.requirement],
  },
};

export function purchaseDefinition(productId: string) {
  return supplyDefinitions[productId] ?? toolPurchaseDefinitions[productId];
}

export function supplyProducts(
  retailer?: Retailer,
  kind: "supplies" | "tools" = "supplies",
): RetailerProduct[] {
  const ids = Object.keys(
    kind === "tools" ? toolPurchaseDefinitions : supplyDefinitions,
  );
  return ids.flatMap((id) => {
    const product = findRetailerProduct(id) ?? null;
    const offer =
      retailer || kind === "tools"
        ? supplyOffer(product, retailer ?? "home-depot")
        : product && referenceOffersForProduct(product)[0];
    return product?.status === "reviewed-specs" &&
      purchaseSpecForProduct(product) &&
      offer
      ? [product]
      : [];
  });
}
function supplyOffer(product: RetailerProduct | null, retailer: Retailer) {
  return product
    ? (referenceOffersForProduct(product).find(
        (o) =>
          o.retailer === retailer &&
          (product.category !== "tool" ||
            (retailer === "home-depot" && o.seller === "The Home Depot")),
      ) ?? null)
    : null;
}
function directStoreOffer(offer: ReturnType<typeof supplyOffer>) {
  return (
    !!offer &&
    offer.seller === (offer.retailer === "lowes" ? "Lowe's" : "The Home Depot")
  );
}
export function reviewSupplyObservation(input: unknown): SupplyInventory {
  const observation = supplyInventorySchema.parse(input),
    product = supplyProducts(
      observation.retailer,
      toolPurchaseDefinitions[observation.productId] ? "tools" : "supplies",
    ).find((p) => p.id === observation.productId),
    offer = supplyOffer(product ?? null, observation.retailer);
  if (!offer || offer.productId !== observation.retailerProductId)
    throw Error(
      "No current reviewed offer matches this exact supply and retailer product number.",
    );
  if (!directStoreOffer(offer))
    throw Error(
      "This marketplace reference has no reviewed direct-store offer. Store stock observations cannot be recorded for the third-party seller.",
    );
  return observation;
}
export function parseSupplyInventory(text: string): SupplyInventory[] {
  const observations = supplyInventorySchema
    .array()
    .max(100)
    .parse(JSON.parse(text));
  return observations.map(reviewSupplyObservation);
}
export function recordSupplyInventory(
  project: Project,
  input: unknown,
  now = Date.now(),
): Project {
  const observation = reviewSupplyObservation(input);
  const checkedAt = Date.parse(observation.checkedAt);
  const homeDepot = observation.retailer === "home-depot";
  if (homeDepot && checkedAt > now)
    throw Error("Use the time you checked the retailer. It cannot be in the future.");
  const identity = supplyObservationKey(observation);
  const retained = project.supplyInventory.filter((old) => {
    if (supplyObservationKey(old) !== identity) return true;
    const previous = Date.parse(old.checkedAt);
    if (homeDepot && previous <= now && previous > checkedAt)
      throw Error(`A newer check already exists for Home Depot product ${observation.retailerProductId} at this store.`);
    return false;
  });
  if (retained.length >= 100)
    throw Error(
      "Limit the project to 100 supply observations. Remove an old observation before adding another store/product.",
    );
  return {
    ...project,
    supplyInventory: [...retained, observation],
  };
}
export function addSupply(
  project: Project,
  productId: string,
  quantity: number,
  purpose = "",
  note = "",
): Project {
  if (
    !supplyProducts(
      project.retailer,
      toolPurchaseDefinitions[productId] ? "tools" : "supplies",
    ).some((p) => p.id === productId)
  )
    throw Error(
      "Choose a reviewed supply with an active reference offer at the selected retailer.",
    );
  if (project.supplies.length >= 200)
    throw Error("Limit the project to 200 supply records.");
  return {
    ...project,
    supplies: [
      ...project.supplies,
      supplySelectionSchema.parse({
        id: uid(),
        productId,
        quantity,
        purpose,
        note,
      }),
    ],
  };
}
export function supplyRows(project: Project, now = Date.now()) {
  return [...new Set(project.supplies.map((s) => s.productId))].map(
    (productId) => {
      const selections = project.supplies.filter(
          (s) => s.productId === productId,
        ),
        product = findRetailerProduct(productId) ?? null,
        definition = purchaseDefinition(productId),
        quantity = selections.reduce((sum, s) => sum + s.quantity, 0),
        purchaseSpec = product ? purchaseSpecForProduct(product) : null,
        eligible =
          !!definition &&
          product?.status === "reviewed-specs" &&
          !!purchaseSpec,
        offer = eligible ? supplyOffer(product, project.retailer) : null,
        storeSnapshotEligible = directStoreOffer(offer),
        observed = project.supplyInventory.filter(
          (s) =>
            s.productId === productId &&
            s.retailer === project.retailer &&
            s.store === project.store &&
            s.zip === project.zip &&
            s.retailerProductId === offer?.productId,
        ),
        inventory = storeSnapshotEligible
          ? (observed
              .filter((s) => freshStoreCheck(s.checkedAt, now) && supplyInventorySchema.safeParse(s).success)
              .sort(
                (a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt),
              )[0] ?? null)
          : null,
        modeledIds = new Set(
          catalog
            .filter((m) => m.productReference === productId)
            .map((m) => m.id),
        ),
        duplicate =
          project.pieces.some((p) => modeledIds.has(p.material)) ||
          project.joints.some((j) => j.material && modeledIds.has(j.material));
      const issues: string[] = [];
      if (!eligible)
        issues.push(
          "This saved supply identity or purchase pack is unresolved; quantities are excluded from the priced list.",
        );
      else if (!offer)
        issues.push(
          `No current reviewed ${retailerName(project.retailer)} offer for this exact supply. Keep the selection or choose another product; no substitute is counted.`,
        );
      if (duplicate)
        issues.push(
          "Possible duplicate: this exact product also appears as a placed part or connection. Both representations are counted; confirm they are additional items.",
        );
      if (offer && !storeSnapshotEligible)
        issues.push(
          `Marketplace seller: ${offer.seller}. Direct-store stock and pricing are unverified; this reference cannot use a store snapshot.`,
        );
      else if (offer && !inventory)
        issues.push(
          "Price and availability are unverified for the selected store/ZIP. Record a matching observation checked within 24 hours.",
        );
      if (inventory && inventory.available < quantity)
        issues.push(
          `Snapshot quantity short: ${inventory.available} purchase units reported; ${quantity} planned.`,
        );
      const requirements = [
        ...new Set([
          ...(definition?.requirements ?? []),
          ...(product?.roleQualifications.flatMap((q) => q.requirements) ?? []),
        ]),
      ];
      return {
        productId,
        product,
        isTool: product?.category === "tool",
        name: product?.name ?? `Unknown supply: ${productId}`,
        selections,
        quantity,
        purchaseUnit: definition?.purchaseUnit ?? "unresolved purchase pack",
        purchaseSpec,
        contents: definition?.contents ?? [],
        offer,
        inventory,
        storeSnapshotEligible,
        total: inventory ? quantity * inventory.price : null,
        requirements,
        issues,
        unresolved: !eligible || !offer,
      };
    },
  );
}
export function suppliesMarkdown(project: Project) {
  const rows = supplyRows(project);
  if (!rows.length) return "";
  const text = (value: string) =>
    value
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[\\`*_{}\[\]<>|]/g, "\\$&")
      .trim();
  const formatRows = (rows: ReturnType<typeof supplyRows>) =>
    rows
      .map((r) =>
        [
          `- ${r.quantity} × ${r.purchaseUnit}: ${text(r.name)}${r.total === null ? " — UNPRICED" : ` — $${r.total.toFixed(2)} observed estimate`}`,
          `  - ${r.isTool ? "Package highlights" : "Each purchase contains"}: ${r.contents.map((c) => text(formatSupplyContent(c))).join("; ") || "unresolved"}.`,
          ...(r.offer
            ? [
                `  - ${retailerName(project.retailer)} product ${r.offer.productId} · ${r.offer.seller}: ${r.offer.url}`,
              ]
            : []),
          ...(r.inventory
            ? [
                `  - User-recorded snapshot: $${r.inventory.price.toFixed(2)} per purchase pack; ${r.inventory.available} available at store ${text(r.inventory.store)}, ZIP ${r.inventory.zip}; checked ${r.inventory.checkedAt}. Confirm current stock.`,
              ]
            : []),
          ...r.selections.flatMap((s) =>
            [
              s.purpose && `  - Purpose: ${text(s.purpose)}`,
              s.note && `  - Note: ${text(s.note)}`,
            ].filter(Boolean),
          ),
          ...r.requirements.map(
            (requirement) => `  - Requirement: ${text(requirement)}`,
          ),
          ...(r.product?.sources.map(
            (source) => `  - Specification source: ${source.url}`,
          ) ?? []),
          ...r.issues.map((issue) => `  - Review: ${text(issue)}`),
        ].join("\n"),
      )
      .join("\n\n");
  const supplies = rows.filter((row) => !row.isTool);
  const tools = rows.filter((row) => row.isTool);
  return [
    supplies.length
      ? "\n\n## Hardware and supplies to purchase\n\nUser-chosen purchase quantities. These records do not place or install parts. Product-specific mounting, fit and quantities remain to be checked.\n\n" +
        formatRows(supplies)
      : "",
    tools.length
      ? "\n\n## Tools to buy\n\nUser-chosen tools. Tool purchases have a separate cost and capability review.\n\n" +
        formatRows(tools)
      : "",
  ].join("");
}
