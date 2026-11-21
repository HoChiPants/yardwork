import { sdwsFramingName, sdwsFramingPacks, sdwsFramingReview, sdwsFramingSources } from "./sdwsFramingReference";
import { pureBondCasework } from "./homeDepotCaseworkReference";
import { framingStockReviewedAt, homeDepotFraming } from "./homeDepotFramingReference";
import { homeDepotTreatedLumber, treatedLumberProductId, treatedLumberReviewedAt, treatedTwoEightBoardUnits, weathershieldBoardUnits } from "./homeDepotTreatedLumber";
import { floorHangerFasteners, floorHangerInstallation, floorHangerProductIds, floorHangerReport, floorHangerReviewedAt, floorHangers } from "./floorHangerReference";
import { sunliteFastener } from "./sunliteFastenerReference";
import { concreteAnchor } from "./concreteAnchorReference";
import { z } from "zod";
import type { Material } from "./model";
import { drawerRailScrew } from "./drawerRailScrewReference";
import { accuride3732, otherAccurideSlides } from "./drawerSlideReference";
import { cedarDoorStop, greenhouseDoorKits } from "./greenhouseDoorReference";
import { harviaKit, steel6 } from "./saunaHeaterReference";
import { cedarbrookLining } from "./saunaLiningReference";
import { cedarbrookDoor } from "./saunaDoorReference";
import { cedarbrookFoil } from "./saunaFoilReference";
import { saunaCeilingBatt, saunaCeilingJoists, saunaCeilingJoistSize, saunaCeilingReviewedAt } from "./saunaCeilingReference";
import { owensCorningWallBatt as wallBatt } from "./saunaWallReference";
import { cedarbrookBenches, cedarbrookBenchInstructions, cedarbrookBenchReviewedAt, cedarbrookBenchSize } from "./saunaBenchReference";
import { toolCapabilities, type ToolCapability } from "./toolCapabilities";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";
import { greenhouseBaseTimber as timber, greenhouseBaseTimber12 as timber12 } from "./greenhouseBaseReference";
import {
  everbiltAngleShelfPinIds,
  everbiltAngleShelfPins,
  everbiltAngleShelfPinsReviewedAt,
  everbiltShelfPin,
  shelfPinProducts,
} from "./shelfPinReference";
import { everbiltLidSupport, foldingLidStays, foldingLidStayScope, springLidStay } from "./lidStayReference";
import { dewaltJigsaw } from "./jigsawReference";
import { gafRoofShingle, shingleEdgeProducts } from "./shingleRoofReference";
import { gibraltarDripEdge, wissSnips } from "./dripEdgeReference";
import { edgeBandingProductIds, edgeBandingProducts, edgeBandingReviewedAt, edgeTrimmer } from "./edgeBandingReference";
import { paslodeFinishNailer, paslodeFinishNails, paslodeFinishReviewedAt } from "./paslodeFinishReference";
import { trimSealant } from "./trimSealantReference";
import { flexWrap } from "./openingFlashingReference";
import { trimBackerRodInstructions, trimBackerRodReviewedAt, trimBackerRodSpecification, trimBackerRods } from "./trimBackerRodReference";
import { doorSeal } from "./greenhouseDoorSealReference";
import { woodGlue } from "./woodGlueReference";
import { sillGasketInstructions, sillGasketListing, sillGasketReviewedAt, sillGaskets } from "./sillGasketReference";

export const retailerSchema = z.enum(["home-depot", "lowes"]);
export type Retailer = z.infer<typeof retailerSchema>;
const sourceHosts = new Set([
  "www.frostking.com",
  "www.dupont.com",
  "hdsupplysolutions.com",
  "homedepot.com",
  "www.homedepot.com",
  "lowes.com",
  "www.lowes.com",
  "strongtie.com",
  "www.strongtie.com",
  "ssttoolbox.widen.net",
  "buildgp.com",
  "www.buildgp.com",
  "grkfasteners.com",
  "www.grkfasteners.com",
  "dewalt.com",
  "www.dewalt.com",
  "images.thdstatic.com",
  "pdf.lowes.com",
  "www.palram.com",
  "tuftex-ondura.com",
  "www.national-hardware.com",
  "www.sugatsune.com",
  "store-q829d8045u.mybigcommerce.com",
  "www.swansontoolco.com",
  "www.estwing.com",
  "besseytools.com",
  "www.3mcanada.ca",
  "www.kregtool.com",
  "mobileimages.lowes.com",
  "icc-es.org",
  "forms.iapmo.org",
  "grip-rite.com",
  "www.crescenttool.com",
  "www.gearwrench.com",
  "www.milwaukeetool.com",
  "www.boschtools.com",
  "www.jm.com",
  "www.finnleo.com",
  "huumsauna.com",
  "alekoproducts.com",
  "www.accuride.com",
  "cedarbrooksauna.com",
  "www.owenscorning.com",
  "www.radians.com",
  "www.gaf.com",
  "documents.gaf.com",
  "www.paslode.com",
  "images.dap.com",
  "titebond.com",
]);
export const catalogSourceSchema = z.strictObject({
  url: z.url().refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      sourceHosts.has(url.hostname)
    );
  }, "Use an approved retailer or manufacturer HTTPS source"),
  verifiedAt: z.iso.datetime(),
  note: z.string().min(1).max(1600),
});
export const roleQualificationSchema = z.strictObject({
  role: z.enum([
    "frameLumber",
    "ridgeLumber",
    "greenhouseBase",
    "caseworkPanels",
    "greenhouseGlazing",
    "greenhousePanelConnector",
    "greenhousePanelEdge",
    "greenhousePanelSeal",
    "saunaInterior",
    "saunaBenchFrame",
    "saunaBench",
    "saunaInsulation",
    "saunaCeilingInsulation",
    "saunaCeilingJoists",
    "saunaVaporBarrier",
    "saunaDoor",
    "closetRod",
    "closetRodSupport",
    "storageLidHinge",
    "storageLidSupport",
  ]),
  scope: z.string().min(1).max(1600),
  sourceRefs: z.array(catalogSourceSchema.shape.url).min(1).max(20),
  requirements: z.array(z.string().min(1).max(1000)).min(1).max(20),
});
/** Application-owned evidence. Project selections never provide or override these claims. */
export const toolCapabilityEvidenceSchema = z.strictObject({
  capabilities: z.array(z.enum(toolCapabilities)).min(1).max(15),
  evidenceType: z.enum([
    "manufacturer-manual",
    "manufacturer-use-instructions",
    "manufacturer-product-specification",
    "retailer-hosted-manufacturer-document",
  ]),
  sourceRefs: z.array(catalogSourceSchema.shape.url).min(1).max(20),
  scope: z.string().trim().min(1).max(1600),
  requirements: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
});
export type CatalogToolCapabilityEvidence = z.infer<
  typeof toolCapabilityEvidenceSchema
>;
export const retailerOfferSchema = z
  .strictObject({
    retailer: retailerSchema,
    productId: z.string().regex(/^\d{6,14}$/),
    retailerItemNumber: z.string().max(80).nullable(),
    retailerModel: z.string().max(100).nullable(),
    seller: z.string().min(1).max(120),
    listingStatus: z.enum(["reference", "retired", "marketplace-retired"]),
    url: z.url(),
  })
  .superRefine((offer, ctx) => {
    let url: URL;
    try {
      url = new URL(offer.url);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid product URL" });
      return;
    }
    const hosts =
      offer.retailer === "home-depot"
        ? ["homedepot.com", "www.homedepot.com"]
        : ["lowes.com", "www.lowes.com"];
    const prefix = offer.retailer === "home-depot" ? "/p/" : "/pd/";
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !hosts.includes(url.hostname) ||
      !url.pathname.startsWith(prefix) ||
      url.pathname.replace(/\/$/, "").split("/").at(-1) !== offer.productId
    )
      ctx.addIssue({
        code: "custom",
        message: "Product URL must match its retailer and exact product ID",
      });
  });
const stockSize = z.tuple([
  z.number().positive().max(12000),
  z.number().positive().max(12000),
  z.number().positive().max(12000),
]);
/** Author-reviewed purchase evidence; project selections cannot override it. */
export const purchaseSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("counted"),
    count: z.number().int().positive().max(100000),
    sourceRefs: z.array(catalogSourceSchema.shape.url).min(1).max(20),
  }),
  z.strictObject({
    kind: z.literal("mass"),
    amount: z.number().finite().positive().max(100000),
    unit: z.literal("lb"),
    qualifier: z.literal("advertised"),
    exactCount: z.null(),
    sourceRefs: z.array(catalogSourceSchema.shape.url).min(1).max(20),
  }),
]);
export type PurchaseSpec = z.infer<typeof purchaseSpecSchema>;
export const retailerProductSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,100}$/),
    name: z.string().min(1).max(200),
    manufacturer: z.string().min(1).max(120),
    manufacturerPartNumber: z.string().min(1).max(100).nullable(),
    identityBasis: z
      .enum(["manufacturer-part", "retailer-specification"])
      .default("manufacturer-part"),
    category: z.enum([
      "lumber",
      "rod",
      "panel",
      "fastener",
      "connector",
      "equipment",
      "consumable",
      "tool",
    ]),
    status: z.enum(["reviewed-specs", "candidate"]),
    verifiedAt: z.iso.datetime(),
    purchaseSpec: purchaseSpecSchema.nullable().default(null),
    profile: z.strictObject({
      wood: z.boolean(),
      stockKind: z.enum([
        "linear",
        "sheet",
        "roll",
        "fastener",
        "connector",
        "equipment",
        "consumable",
        "tool",
      ]),
      stockSize: stockSize.nullable(),
      dimensionMeaning: z.enum([
        "actual-stock",
        "fastener-head-envelope",
        "nominal-flanges",
        "roll-width-only",
        "unverified",
      ]),
      rollWidth: z.number().positive().max(240).optional(),
      packCount: z.number().int().positive().max(100000).nullable(),
      fastenerLength: z.number().positive().max(120).nullable(),
      shankDiameter: z.number().positive().max(12).nullable(),
      headDiameter: z.number().positive().max(12).nullable(),
      finish: z.string().max(160).nullable(),
      drive: z.string().max(80).nullable(),
      materialFamily: z.string().min(1).max(120).nullable().default(null),
    }),
    offers: z.array(retailerOfferSchema).max(20),
    supplier: z.strictObject({
      seller: z.string().trim().min(1).max(120),
      productCode: z.string().trim().min(1).max(120),
      url: catalogSourceSchema.shape.url,
    }).optional(),
    sources: z.array(catalogSourceSchema).min(1).max(20),
    discrepancies: z.array(z.string().min(1).max(1000)).max(20),
    roleQualifications: z.array(roleQualificationSchema).max(20).default([]),
    limitToQualifiedRoles: z.literal(true).optional(),
    capabilities: z.array(z.enum(toolCapabilities)).max(15),
    toolCapabilityEvidence: z
      .array(toolCapabilityEvidenceSchema)
      .max(20)
      .default([]),
  })
  .superRefine((product, ctx) => {
    const supplier = product.supplier;
    if (!product.offers.length && !supplier)
      ctx.addIssue({
        code: "custom",
        path: ["offers"],
        message: "Provide a reviewed retailer or direct supplier reference.",
      });
    if (supplier && (
      product.status !== "reviewed-specs" ||
      product.identityBasis !== "manufacturer-part" ||
      product.manufacturerPartNumber !== supplier.productCode ||
      !product.sources.some((source) => source.url === supplier.url)
    ))
      ctx.addIssue({
        code: "custom",
        path: ["supplier"],
        message: "A supplier listing must document the exact reviewed manufacturer variant.",
      });
    const widthOnly = product.profile.dimensionMeaning === "roll-width-only";
    if (
      widthOnly !== (product.profile.rollWidth !== undefined) ||
      (widthOnly && (!supplier || product.offers.length ||
        product.profile.stockKind !== "roll" || product.profile.stockSize !== null ||
        product.profile.packCount !== null || product.purchaseSpec))
    )
      ctx.addIssue({
        code: "custom",
        path: ["profile"],
        message: "A width-only roll needs a direct supplier with a quote-specific length.",
      });
    if (product.limitToQualifiedRoles && !product.roleQualifications.length)
      ctx.addIssue({
        code: "custom",
        path: ["roleQualifications"],
        message: "Provide the reviewed roles for restricted material.",
      });
    if (product.purchaseSpec) {
      const spec = product.purchaseSpec;
      if (product.status !== "reviewed-specs")
        ctx.addIssue({
          code: "custom",
          message:
            "Purchase evidence requires an author-reviewed product identity",
        });
      if (
        new Set(spec.sourceRefs).size !== spec.sourceRefs.length ||
        spec.sourceRefs.some(
          (url) => !product.sources.some((source) => source.url === url),
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Purchase evidence must reference distinct reviewed product sources",
        });
      if (spec.kind === "counted" && product.profile.packCount !== spec.count)
        ctx.addIssue({
          code: "custom",
          message:
            "Counted purchase evidence must match the exact profile pack count",
        });
      if (spec.kind === "mass" && product.profile.packCount !== null)
        ctx.addIssue({
          code: "custom",
          message: "A mass purchase must retain an unknown exact piece count",
        });
    }
    if (
      product.status === "reviewed-specs" &&
      product.identityBasis === "manufacturer-part" &&
      !product.manufacturerPartNumber
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Reviewed manufactured variants need a manufacturer part identity",
      });
    if (
      product.status === "reviewed-specs" &&
      product.identityBasis === "retailer-specification"
    ) {
      if (
        !product.profile.wood ||
        !["lumber", "panel"].includes(product.category) ||
        product.profile.dimensionMeaning !== "actual-stock" ||
        !product.profile.stockSize ||
        product.profile.packCount === null
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Reviewed retailer-specification identity requires wood stock with verified actual geometry and purchase pack",
        });
      if (
        !product.offers.every((offer) =>
          product.sources.some((entry) => {
            try {
              const url = new URL(entry.url);
              return (
                url.hostname.endsWith(
                  offer.retailer === "home-depot"
                    ? "homedepot.com"
                    : "lowes.com",
                ) &&
                url.pathname.replace(/\/$/, "").split("/").at(-1) ===
                  offer.productId
              );
            } catch {
              return false;
            }
          }),
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Reviewed retailer-specification identity requires a source for every exact retailer offer",
        });
    }
    const kinds = {
      lumber: ["linear"],
      rod: ["linear"],
      panel: ["sheet", "roll"],
      fastener: ["fastener"],
      connector: ["connector"],
      equipment: ["equipment"],
      consumable: ["consumable"],
      tool: ["tool"],
    };
    if (!kinds[product.category].includes(product.profile.stockKind))
      ctx.addIssue({
        code: "custom",
        message: "Product category and stock kind differ",
      });
    if (product.category !== "tool" && product.capabilities.length)
      ctx.addIssue({
        code: "custom",
        message: "Only reusable tool records declare tool capabilities",
      });
    if (
      product.roleQualifications.length &&
      product.status !== "reviewed-specs"
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Candidate products cannot declare reviewed role qualifications",
      });
    for (const qualification of product.roleQualifications) {
      if (
        qualification.sourceRefs.some(
          (url) => !product.sources.some((s) => s.url === url),
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Role qualification references must be reviewed product sources",
        });
    }
    if (
      product.toolCapabilityEvidence.length &&
      (product.category !== "tool" || product.status !== "reviewed-specs")
    )
      ctx.addIssue({
        code: "custom",
        message: "Only reviewed reusable tools may declare capability evidence",
      });
    for (const evidence of product.toolCapabilityEvidence) {
      if (
        evidence.capabilities.some(
          (capability) => !product.capabilities.includes(capability),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Evidence cannot introduce an undeclared tool capability",
        });
      if (
        evidence.sourceRefs.some(
          (url) => !product.sources.some((source) => source.url === url),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Tool evidence references must be reviewed product sources",
        });
      if (
        new Set(evidence.sourceRefs).size !== evidence.sourceRefs.length ||
        new Set(evidence.capabilities).size !== evidence.capabilities.length
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Tool evidence source and capability references must be unique",
        });
      for (const ref of evidence.sourceRefs) {
        let host: string;
        try {
          host = new URL(ref).hostname;
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "Invalid tool evidence URL",
          });
          continue;
        }
        const retailerDocument = [
            "images.thdstatic.com",
            "pdf.lowes.com",
          ].includes(host),
          retailerPage = [
            "homedepot.com",
            "www.homedepot.com",
            "lowes.com",
            "www.lowes.com",
          ].includes(host);
        if (
          (evidence.evidenceType ===
            "retailer-hosted-manufacturer-document") !==
            retailerDocument ||
          retailerPage
        )
          ctx.addIssue({
            code: "custom",
            message:
              "Tool evidence type must match its primary manufacturer source or hosted document",
          });
      }
    }
    if (
      ["actual-stock", "fastener-head-envelope"].includes(
        product.profile.dimensionMeaning,
      ) &&
      !product.profile.stockSize
    )
      ctx.addIssue({
        code: "custom",
        message: "Verified geometry must include physical dimensions",
      });
    if (
      (product.category === "tool") !==
      (product.profile.stockKind === "tool")
    )
      ctx.addIssue({
        code: "custom",
        message: "Tools must use a separate tool profile",
      });
    if (
      new Set(product.offers.map((o) => `${o.retailer}:${o.productId}`))
        .size !== product.offers.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate retailer offer" });
  });
export type RetailerProduct = z.infer<typeof retailerProductSchema>;
export const retailerCatalogSchema = z
  .array(retailerProductSchema)
  .max(10000)
  .superRefine((products, ctx) => {
    if (new Set(products.map((p) => p.id)).size !== products.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate physical product identity",
      });
  });
const simpson70Reviewed = "2026-11-17T15:35:26.215Z";
const simpson70CatalogLanding =
  "https://www.strongtie.com/resources/literature/fastening-systems-catalog";
const simpson70CatalogPdf =
  "https://ssttoolbox.widen.net/content/07il60awb7/original/C-F-2025.pdf?download=true";
const simpson70Source = (url: string, note: string) => ({
  url,
  verifiedAt: simpson70Reviewed,
  note,
});
const grkShortCabinetReviewed = "2026-11-19T03:45:28.802Z";
const grkShortCabinetSource = (url: string, note: string) => ({
  url,
  verifiedAt: grkShortCabinetReviewed,
  note,
});
const reviewed = "2026-11-16T17:49:02.000Z";
const commonFastenerReviewed = "2026-11-17T06:40:20.000Z";
const commonFastenerSource = (url: string, note: string) => ({
  url,
  note,
  verifiedAt: commonFastenerReviewed,
});
const sdManufacturerUrl =
  "https://www.strongtie.com/strongdrive_exteriorwoodscrews/sd_screw/p/strong-drive-sd-connector-screw";
const commonNailManufacturerUrl =
  "https://grip-rite.com/product/fasteners/hand-drive/nails/exterior-nails/common-nail/";
const source = (url: string, note: string) => ({
  url,
  verifiedAt: reviewed,
  note,
});
const hd = (productId: string, model: string, item: string | null = null) => ({
  retailer: "home-depot" as const,
  productId,
  retailerItemNumber: item,
  retailerModel: model,
  seller: "The Home Depot",
  listingStatus: "reference" as const,
  url: `https://www.homedepot.com/p/${productId}`,
});
const lowes = (
  productId: string,
  path: string,
  model: string,
  item: string,
) => ({
  retailer: "lowes" as const,
  productId,
  retailerItemNumber: item,
  retailerModel: model,
  seller: "Lowe's",
  listingStatus: "reference" as const,
  url: `https://www.lowes.com/pd/${path}/${productId}`,
});
const profile = (
  stockKind: RetailerProduct["profile"]["stockKind"],
  stockSize: [number, number, number] | null,
  packCount: number | null,
  extra: Partial<RetailerProduct["profile"]> = {},
): RetailerProduct["profile"] => ({
  stockKind,
  stockSize,
  packCount,
  wood: false,
  dimensionMeaning: stockSize ? "actual-stock" : "unverified",
  fastenerLength: null,
  shankDiameter: null,
  headDiameter: null,
  finish: null,
  drive: null,
  materialFamily: null,
  ...extra,
});
const sawManual =
  "https://www.dewalt.com/GLOBALBOM/QU/DWE575SB/1/Instruction_Manual/EN/NA477368_DWE574_DWE575_DWE575SB_T1__NA.pdf";
const drillManual =
  "https://www.dewalt.com/GLOBALBOM/QU/DCD771C2/1/Instruction_Manual/EN/N851094_DCD771_T1_NA.pdf";
const specialReviewed = "2026-11-16T18:20:02.000Z";
const specialSource = (url: string, note: string) => ({
  url,
  verifiedAt: specialReviewed,
  note,
});
const commonStockReviewed = "2026-11-16T21:33:00.000Z";
const commonStockSource = (url: string, note: string) => ({
  url,
  verifiedAt: commonStockReviewed,
  note,
});
const nextBoardReviewed = "2026-11-17T02:23:08.000Z";
const nextBoardSource = (url: string, note: string) => ({
  url,
  verifiedAt: nextBoardReviewed,
  note,
});
const woodFastenerReviewed = "2026-11-17T03:55:01.000Z";
const woodFastenerSource = (url: string, note: string) => ({
  url,
  verifiedAt: woodFastenerReviewed,
  note,
});
const sunliteFamily = "sunlite-8mm-multiwall";
const sunliteGuide =
  "https://images.thdstatic.com/catalog/pdfImages/a0/a03f682e-0dd7-4594-a1e2-2cd0c9e01918.pdf";
const sunlitePanel =
  "https://www.homedepot.com/p/Sunlite-24-in-x-8-ft-Multiwall-Polycarbonate-Panel-in-Clear-132506/202091947";
const sunliteProduct = "https://www.palram.com/us/product/sunlite/";
const hProfile = "https://www.homedepot.com/p/202091948";
const uProfile = "https://www.homedepot.com/p/202091949";
const sunliteTape =
  "https://www.homedepot.com/p/Sunlite-8-mm-Anti-Dust-Tape-Combo-Pack-92763/205713443";
const hdRod = "https://www.homedepot.com/p/300262527";
const hdSockets = "https://www.homedepot.com/p/334188235";
const lowesRod =
  "https://www.lowes.com/pd/Blue-Hawk-72-in-L-x-1-3125-in-H-x-1-3125-in-W-Wood-Closet-Rod/1000442349";
const lowesSockets =
  "https://www.lowes.com/pd/Blue-Hawk-2-72-in-Shelf-Bracket/50005274";

const toolReviewed = "2026-11-16T19:21:02.000Z";
const paslodeFinishSource = (url: string, note: string) => ({
  url,
  verifiedAt: paslodeFinishReviewedAt,
  note,
});
const toolSource = (url: string, note: string) => ({
  url,
  verifiedAt: toolReviewed,
  note,
});
const toolEvidence = (
  capabilities: ToolCapability[],
  evidenceType: CatalogToolCapabilityEvidence["evidenceType"],
  sourceRefs: string[],
  scope: string,
  requirements: string[],
): CatalogToolCapabilityEvidence => ({
  capabilities,
  evidenceType,
  sourceRefs,
  scope,
  requirements,
});
const toolReference = (record: {
  id: string;
  name: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  verifiedAt?: string;
  offers: z.infer<typeof retailerOfferSchema>[];
  sources: z.infer<typeof catalogSourceSchema>[];
  toolCapabilityEvidence: CatalogToolCapabilityEvidence[];
  discrepancies?: string[];
}) => ({
  ...record,
  category: "tool" as const,
  status: "reviewed-specs" as const,
  verifiedAt: record.verifiedAt ?? toolReviewed,
  profile: profile("tool", null, 1),
  capabilities: [
    ...new Set(record.toolCapabilityEvidence.flatMap((e) => e.capabilities)),
  ],
  discrepancies: record.discrepancies ?? [],
});
const tapeProduct =
  "https://www.dewalt.com/en-us/product/dwht38125s/25-ft-compact-tape-measure";
const squareProduct =
  "https://www.swansontoolco.com/shop/speed-square-7in-s0101";
const squareInstructions = "https://www.swansontoolco.com/resources/blue-book";
const clampCatalog =
  "https://besseytools.com/getmedia/6accf9ec-a9a1-4eb6-bc3d-9d3fa720322e/BESSEY_Clutch-Style-bar-clamps_EN";
const clampInstructions =
  "https://besseytools.com/en-us/bessey-tools-north-america/support/cautions-warnings";
const hammerProduct = "https://www.estwing.com/product/rip-hammer/";
const hammerInstructions =
  "https://www.estwing.com/resources/safety-and-product-care/";
const hammerPrintable =
  "https://www.estwing.com/wp-content/uploads/2026/03/Estwing-Safety-Usage-Tips.pdf";
const hearingProduct = "https://www.3mcanada.ca/3M/en_CA/p/d/v000271977/";
const hearingDocument =
  "https://images.thdstatic.com/catalog/pdfImages/ca/ca8fa917-ec2b-4a14-b903-9dffccddb39c.pdf";
const eyeProtectionReviewed = "2026-11-20T02:09:53.000Z";
const concealerFamily = "https://www.radians.com/products/composite-dewalt-dpg82-concealer-safety-goggle";
const concealerCatalog = "https://www.radians.com/hubfs/1_Website%20Core%20Documents/HubDB%20Catalog%20Files/5082_Hardware%20Catalog.pdf?hsLang=en";
const shelfReviewed = "2026-11-16T22:41:00.000Z";
const shelfSource = (url: string, note: string) => ({
  url,
  verifiedAt: shelfReviewed,
  note,
});
const shelfPinsProduct =
  "https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pins-5mm/KMA-5MPIN.html";
const shelfPinsLowes =
  "https://www.lowes.com/pd/Kreg-0-75-in-L-x-0-332-in-W-x-0-19-in-D-Shelf-pins-20-Pack/5006037921";
const shelfJigProduct =
  "https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pin-jig-5-mm/KMA3232.html";
const shelfJigManual =
  "https://www.kregtool.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dw31eb0d3c/manuals/KMA3232_Global.pdf";
const shelfBitProduct =
  "https://www.kregtool.com/shop/cabinet-solutions/cabinet-drawer-shelf-jigs/shelf-pin-jig-drill-bit-5mm/KMA3215.html";
/** Exact hand-tool packages. Partial dimensions stay in source notes; no body envelopes or live stock are inferred. */
const commonToolProducts = [
  toolReference({
    id: "dewalt-dwht38125s",
    name: "DEWALT DWHT38125S 25 ft compact tape measure",
    manufacturer: "DEWALT",
    manufacturerPartNumber: "DWHT38125S",
    offers: [
      hd("317266301", "DWHT38125S", "1007530074"),
      {
        ...lowes(
          "5019101837",
          "DEWALT-Atomic-Compact-Series-25-ft-Tape-Measure-DWHT38125S",
          "DWHT38125S",
          "9038311",
        ),
        seller: "Hearthshire",
        listingStatus: "marketplace-retired" as const,
      },
    ],
    sources: [
      toolSource(
        tapeProduct,
        "Manufacturer exact DWHT38125S individual steel tape; one included, 25 ft total blade length. This is specification evidence, not a model-specific operating manual or body-envelope measurement.",
      ),
      toolSource(
        "https://www.homedepot.com/p/DEWALT-25-ft-x-1-1-8-in-Tape-Measure-with-Finger-Brake-DWHT38125S/317266301",
        "Exact HD model/product reference. Product specifications are not current store availability or price.",
      ),
      toolSource(
        "https://www.lowes.com/pd/DEWALT-Atomic-Compact-Series-25-ft-Tape-Measure-DWHT38125S/5019101837",
        "Exact model, item9038311, sold by Hearthshire; explicitly no longer sold on Lowes.com. Retained as a historical reference only.",
      ),
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["measure"],
        "manufacturer-product-specification",
        [tapeProduct],
        "The manufacturer documents measuring with this 25 ft tape; body dimensions and measurement accuracy are not established by a model selection.",
        [
          "Confirm the actual tape's markings, hook condition and measured clearances. Reach is not blade length, precision or body geometry.",
        ],
      ),
    ],
  }),
  toolReference({
    id: "swanson-s0101",
    name: "Swanson S0101 7 in Speed Square with Blue Book",
    manufacturer: "Swanson Tool Co.",
    manufacturerPartNumber: "S0101",
    offers: [
      lowes("3048693", "Swanson-Tool-Company-Speed-Square", "S0101", "99943"),
    ],
    sources: [
      toolSource(
        squareProduct,
        "Manufacturer specifically identifies S0101 as the carded square with Blue Book and documents 45/90-degree layout. Measuring size7 in; master carton50 is not the retail pack count.",
      ),
      toolSource(
        squareInstructions,
        "Manufacturer instruction index identifies the 7 in square's Blue Book. PDF link verified, but its image-only text was not extracted during this review; capability evidence here comes from the product page.",
      ),
      toolSource(
        "https://www.lowes.com/pd/Swanson-Tool-Company-Speed-Square/3048693",
        "Exact S0101, item99943, package quantity1; measuring range7 in. Title/width8.5 in is a different field, not the measuring range or a complete body envelope.",
      ),
    ],
    discrepancies: [
      "Lowe's title/width field says8.5 in; its measuring range and manufacturer product size are7 in. No body envelope is derived.",
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["square"],
        "manufacturer-product-specification",
        [squareProduct],
        "The S0101 square provides 45/90-degree marking and square layout. This is the carded package with Blue Book, not the clip/bulk/combo variant.",
        [
          "Check the actual tool and dry-fit angles. Square layout does not establish a saw-guide setup or structural design approval.",
        ],
      ),
    ],
  }),
  toolReference({
    id: "swanson-s0101-c",
    name: "Swanson S0101-C 7 in Speed Square with Blue Book and Speed Clip",
    manufacturer: "Swanson Tool Co.",
    manufacturerPartNumber: "S0101-C",
    offers: [hd("312986101", "S0101-C")],
    sources: [
      toolSource(
        squareProduct,
        "Manufacturer variant table specifically identifies S0101-C as the 7 in square with Blue Book and Speed Clip; distinct from S0101, bulk, T0101 and combo packages. Product page documents45/90-degree layout.",
      ),
      toolSource(
        squareInstructions,
        "Manufacturer identifies the 7 in square instruction family. No unextracted PDF text is used as capability evidence.",
      ),
      toolSource(
        "https://www.homedepot.com/p/Swanson-7-in-Speed-Square-Rafter-Carpenter-Square-Layout-Tool-with-Black-Gradations-and-Speed-Clip-S0101-C/312986101",
        "Exact S0101-C offer; package quantity1. Manufacturer S0101 Home Depot dealer link resolves to this different clip package, so it cannot be attached to the S0101 identity.",
      ),
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["square"],
        "manufacturer-product-specification",
        [squareProduct],
        "The S0101-C package supplies the documented 7 in square for 45/90-degree marking and layout, plus the Speed Clip.",
        [
          "Keep the clip package distinct from S0101. Check actual angles and tool condition; layout function does not approve a saw setup.",
        ],
      ),
    ],
  }),
  toolReference({
    id: "bessey-gscc2-524",
    name: "BESSEY GSCC2.524 24 in clutch-style bar clamp",
    manufacturer: "BESSEY",
    manufacturerPartNumber: "GSCC2.524",
    offers: [hd("204986197", "GSCC2.524", "1000039422")],
    sources: [
      toolSource(
        clampCatalog,
        "Manufacturer GSCC2.524 row: 24 in opening,2.5 in throat, wooden handle; temporary clamping function. Opening/throat and catalog force are not complete geometry or an assembly holding/lifting capacity.",
      ),
      toolSource(
        clampInstructions,
        "Manufacturer clamping instructions require intended use and hand tightening; exclude lifting, pulling, leaning, cargo restraint and permanent installation.",
      ),
      toolSource(
        "https://www.homedepot.com/p/BESSEY-Clutch-Style-24-in-Capacity-Bar-Clamp-with-Wood-Handle-and-2-1-2-in-Throat-Depth-GSCC2-524/204986197",
        "Exact GSCC2.524, individual, pack1. No exact Lowe's counterpart verified.",
      ),
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["clamp"],
        "manufacturer-use-instructions",
        [clampCatalog, clampInstructions],
        "The documented clutch clamp provides temporary workpiece clamping. No tool count, access fit or assembly load capacity is established.",
        [
          "Check opening, throat, pads, end stop and actual setup; tighten only by hand without extensions.",
          "Do not use this clamp for lifting, transport restraint or permanent installation.",
        ],
      ),
    ],
  }),
  toolReference({
    id: "estwing-e3-16s",
    name: "Estwing E3-16S 16 oz smooth-face rip claw hammer",
    manufacturer: "Estwing",
    manufacturerPartNumber: "E3-16S",
    offers: [
      hd("100351734", "E3-16S", "362263"),
      lowes("1111955", "Estwing-16-oz-Steel-Head-Steel", "E3-16S", "90519"),
    ],
    sources: [
      toolSource(
        hammerProduct,
        "Manufacturer exact E3-16S option, smooth face,16 oz head and13 in overall length. Head weight is not total tool mass; no full body envelope is established.",
      ),
      toolSource(
        hammerInstructions,
        "Manufacturer nail-hammer instructions specify common-nail driving and withdrawal, suitable tool size/weight, inspection and eye protection. They exclude striking hardened tools/objects with a nail hammer.",
      ),
      toolSource(
        hammerPrintable,
        "Manufacturer printable safety/use instructions for appropriate hammer functions and condition checks.",
      ),
      toolSource(
        "https://www.homedepot.com/p/Estwing-16-oz-Straight-Claw-Hammer-with-Shock-Reduction-Grip-E3-16S/100351734",
        "Exact E3-16S/SKU362263 individual hammer reference. Handle-length16 in field conflicts with manufacturer overall13 in; body geometry is omitted.",
      ),
      toolSource(
        "https://www.lowes.com/pd/Estwing-16-oz-Steel-Head-Steel/1111955",
        "Exact direct E3-16S, item90519. Do not merge retired marketplace8809055/modelE3-16S0 into this identity.",
      ),
    ],
    discrepancies: [
      "HD handle-length field16 in conflicts with manufacturer13 in overall length; no body envelope is modeled. Capability evidence is independently scoped to common-nail use.",
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["drive-nail"],
        "manufacturer-use-instructions",
        [hammerProduct, hammerInstructions, hammerPrintable],
        "This nail hammer documents driving and withdrawing common nails only. It does not establish hardened-nail, nail-set or arbitrary connector-installation approval.",
        [
          "Use a suitable hammer size/weight, inspect its face/claw/handle, and follow manufacturer eye-protection and striking restrictions.",
          "Connector fastener types, holes, installation procedure and capacity require separate source review.",
        ],
      ),
    ],
  }),
  toolReference({
    id: "3m-90565-4dc-ps",
    name: "3M 90565-4DC-PS Pro-Grade earmuff",
    manufacturer: "3M",
    manufacturerPartNumber: "90565-4DC-PS",
    offers: [hd("301277013", "90565-4DC-PS")],
    sources: [
      toolSource(
        hearingProduct,
        "Manufacturer3M ID7100107419/UPC00076308873356, one earmuff per retail pack and four packs per case; stated30 dB NRR. The case count is not retail pack4.",
      ),
      toolSource(
        hearingDocument,
        "3M manufacturer product sheet hosted by HD documents hearing-protection function and30 dB NRR, with fit variation and fit-testing recommendation. It is not a personal attenuation measurement.",
      ),
      toolSource(
        "https://www.homedepot.com/p/3M-Pro-Grade-Earmuff-90565-4DC-PS/301277013",
        "Exact90565-4DC-PS reference. No exact Lowe's counterpart or live stock/price verified.",
      ),
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["ppe-hearing"],
        "retailer-hosted-manufacturer-document",
        [hearingDocument],
        "This is a documented hearing-protector function. Stated NRR is not actual attenuation for a person or proof of adequate protection for a modeled operation.",
        [
          "Review actual exposure, the delivered product instructions, fit and fit testing; individual protection can be lower than the stated NRR.",
          "Do not subtract the rating from invented operation-noise values or treat a checked selection as a safe exposure assessment.",
        ],
      ),
    ],
  }),
];

const measuredToolReviewed = "2026-11-17T10:18:39.000Z";
const measuredToolSource = (url: string, note: string) => ({
  url,
  verifiedAt: measuredToolReviewed,
  note,
});
const hacksawProduct =
  "https://www.crescenttool.com/all-tools/cutting-material-removal/cutting/saws-sawblades/cthack-12-fast-tension-hacksaw-dual-material-handle";
const miniFilesProduct =
  "https://www.gearwrench.com/all-tools/hand-tools/cutting-tools/82821h-6-piece-4-mini-file-set";
const smallBitProduct =
  "https://www.milwaukeetool.com/products/details/1-16-shockwave-impact-duty-red-helix-titanium-drill-bit/48-89-4601";
const smallBitFamily =
  "https://www.milwaukeetool.com/products/details/shockwave-red-helix-titanium-drill-bits/shockwave-red-helix-impact-drill-bits";
const boschMiterProduct = "https://www.boschtools.com/us/en/products/gcm12sd-060166501C";
const boschMiterManual = "https://www.boschtools.com/us/en/ocsmedia/2610051827_GCM12SD_0918.pdf";
const boschMiterReviewed = "2026-11-19T04:51:12.000Z";
const boschMiterOffers = [
  hd("202568455", "GCM12SD", "1000054082"),
  lowes(
    "3502512",
    "Bosch-Glide-12-in-15-Amp-Dual-Bevel-Bevel-Sliding-Compound-Miter-Saw",
    "GCM12SD",
    "337709",
  ),
];
/** Reviewed tool packages only. Their functions do not establish an actual operation's fit or capacity. */
const measuredMetalToolProducts = [
  toolReference({
    id: "crescent-cthack",
    name: "Crescent CTHACK 12 in fast-tension hacksaw",
    manufacturer: "Crescent",
    manufacturerPartNumber: "CTHACK",
    verifiedAt: measuredToolReviewed,
    offers: [
      hd("329735947", "CTHACK"),
      lowes("5015029165", "Crescent-12-in-Extra-Fine-Cut-Hack-Saw", "CTHACK", "5705723"),
    ],
    sources: [
      measuredToolSource(hacksawProduct,
        "Exact CTHACK manufacturer page documents metal/PVC cutting, a 12 in 24 TPI bi-metal blade and 45-degree blade positioning. Manufacturer dimensions are not used as a modeled tool envelope or access approval."),
      measuredToolSource("https://www.homedepot.com/p/Crescent-12-in-Fast-Tension-Hacksaw-with-Dual-Material-Handle-CTHACK/329735947",
        "Exact CTHACK listing: one saw package with one 12 in blade. Storage for up to five replacement blades is capacity, not included blade quantity. No price or store-stock observation imported."),
      measuredToolSource("https://www.lowes.com/pd/Crescent-12-in-Extra-Fine-Cut-Hack-Saw/5015029165",
        "Exact CTHACK, item 5705723, package quantity one, 12 in/24 TPI bi-metal blade. Retailer lists use on metal and no use on wood; no location-specific availability verified."),
    ],
    toolCapabilityEvidence: [toolEvidence(
      ["metal-cut"], "manufacturer-product-specification", [hacksawProduct],
      "Documented manual metal-cutting function of the exact hacksaw. This does not establish that its blade is suited to the actual stainless hinge, plated rod, wall/leaf thickness or access path.",
      [
        "Check the actual metal/finish, blade specification and condition, tooth engagement, work support and clamping before the cut.",
        "Measure the actual kerf and retained ends; no tool selection supplies a kerf default, deburring method or installed capacity.",
      ],
    )],
    discrepancies: ["Five-blade onboard storage is not an included five-blade package. Full body geometry and operation-specific blade/material fit remain unmodeled."],
  }),
  toolReference({
    id: "gearwrench-82821h",
    name: "GEARWRENCH 82821H six-piece mini-file set",
    manufacturer: "GEARWRENCH",
    manufacturerPartNumber: "82821H",
    verifiedAt: measuredToolReviewed,
    offers: [hd("315994439", "82821H")],
    sources: [
      measuredToolSource(miniFilesProduct,
        "Exact 82821H manufacturer specification/FAQ documents deburring and fine filing of metal; six handled profiles are flat, half-round, round, knife, square and triangle, with a pouch. The six different files are one reviewed set."),
      measuredToolSource("https://www.homedepot.com/p/GEARWRENCH-4-in-Mini-Bastard-File-Variety-Set-with-Handles-6-Piece-82821H/315994439",
        "Exact 82821H six-piece set reference for deburring, rounding and removing material. No exact current Lowe's offer, local stock or price verified."),
    ],
    toolCapabilityEvidence: [toolEvidence(
      ["metal-deburr"], "manufacturer-product-specification", [miniFilesProduct],
      "Manufacturer documents deburring and smoothing metal with the mini-file set. A documented filing function is not proof of fit for every hinge grade, coating or hollow-rod inside edge.",
      [
        "Select the actual file face/profile for the metal, finish and accessible cut edge; secure the work and inspect the resulting edges.",
        "Confirm the delivered handled files and their instructions. Filing does not supply metal-cutting capability or confirm hinge operating clearance.",
      ],
    )],
    discrepancies: [
      "Manufacturer gives 4 in nominal files, 3 in working blades and 7-3/8 in overall in features, while specifications also list 8 in length and a set-sized 6.25 by 1 in profile. These values do not establish per-file or package body geometry.",
      "No exact current Lowe's counterpart verified; no substituted Nicholson suffix or unrelated file product is treated as this set.",
    ],
  }),
  {
    ...toolReference({
      id: "milwaukee-48-89-4601",
      name: "Milwaukee 48-89-4601 1/16 in titanium bits · two-pack",
      manufacturer: "Milwaukee",
      manufacturerPartNumber: "48-89-4601",
      verifiedAt: measuredToolReviewed,
      offers: [hd("205878986", "48-89-4601", "1001294842")],
      sources: [
        measuredToolSource(smallBitProduct,
          "Exact manufacturer page identifies 1/16 in bit 48-89-4601 and describes wood, plastic and metal applications. No usable flute, collar or deepest-tip setting is established."),
        measuredToolSource(smallBitFamily,
          "Manufacturer family size table identifies 48-89-4601 as 1/16 in with a 1/4 in hex shank. Its small-size row does not mark the QUAD EDGE or variable-helix features advertised broadly in family prose; those features are not inferred."),
        measuredToolSource("https://www.homedepot.com/p/Milwaukee-SHOCKWAVE-1-16-in-Titanium-Twist-Drill-Bit-48-89-4601/205878986",
          "Exact 48-89-4601 package includes two identical 1/16 in bits, with a 1/4 in hex shank. The retailer's 2.75 in overall length is not usable drilling depth or a validated body envelope. No price or stock imported."),
      ],
      toolCapabilityEvidence: [toolEvidence(
        ["pilot-bit-1-16"], "manufacturer-product-specification", [smallBitProduct],
        "The exact accessory has a documented 1/16 in diameter and wood-drilling application. It supplies a bit reference only, not a powered drill or a required screw pilot diameter/depth.",
        [
          "Use this narrow checklist reference only for a current user-entered 1/16 in pilot datum; verify the actual screw, wood/grain and instructions independently.",
          "Review the delivered bit, compatible chuck, usable flute length, deepest drill-tip setting, clamps and access. No collar, depth or installed hole is inferred.",
        ],
      )],
      discrepancies: [
        "Family prose advertises QUAD EDGE, variable helix and differing 3X/5X life claims; the manufacturer size table does not mark those features for the 1/16 in member. No such performance or tip geometry is assigned to this bit.",
        "No exact current Lowe's counterpart verified. Two bits are an exact package fact, not ownership, remaining usable bits or an automatic purchase quantity.",
      ],
    }),
    profile: profile("tool", null, 2),
  },
];

const interiorStockReviewed = "2026-11-17T11:32:24.940Z";
const interiorStockSource = (url: string, note: string) => ({
  url,
  verifiedAt: interiorStockReviewed,
  note,
});
const grkBitsProduct =
  "https://www.grkfasteners.com/grk-products/specialty-fasteners-and-accessories/star-drive-bits";
const pureBondFamilyDocument =
  "https://images.thdstatic.com/catalog/pdfImages/7e/7efe6b2d-96e8-4f82-ace6-0c5077e36629.pdf";
/** Individual interior sheets and exact drive accessories; no automatic structure roles or tool body meshes. */
const commonInteriorProducts = [
  {
    ...toolReference({
      id: "grk-187443-t25-bits",
      name: "GRK 187443 T25 2 in star-drive bits · two-bit card",
      manufacturer: "GRK Fasteners / ITW",
      manufacturerPartNumber: "187443",
      verifiedAt: interiorStockReviewed,
      offers: [
        hd("202349118", "772691874436", "730762"),
        lowes(
          "50303273",
          "GRK-0-x-2-in-Green-Polymer-Trim-Interior-Exterior-Wood-Screws-2-Count",
          "187443.0",
          "597605",
        ),
      ],
      sources: [
        interiorStockSource(
          grkBitsProduct,
          "Current manufacturer carded table: T25, 2 in, part 187443, two bits. Its embedded retailer links identify Lowe’s 50303273. Driver-tip function only; no powered driver, seating, pilot or access approval.",
        ),
        interiorStockSource(
          "https://www.homedepot.com/p/GRK-Fasteners-T-25-2-in-Steel-Star-Bits-2-per-Pack-772691874436/202349118",
          "Exact two-bit package: model 772691874436 / SKU 730762, T25, 2 in, steel/hex, for the listed GRK drive recesses including R4 #9. This UPC-like retail model is separate from manufacturer187443. No price/stock imported.",
        ),
        interiorStockSource(
          "https://www.lowes.com/pd/GRK-0-x-2-in-Green-Polymer-Trim-Interior-Exterior-Wood-Screws-2-Count/50303273",
          "Exact model 187443.0 / item 597605, two 2-in T25 bits, 1/4-in hex shank, compatible GRK applications. Preserve the reviewed .0 suffix, not a global normalization rule. No price/stock imported.",
        ),
      ],
      toolCapabilityEvidence: [
        toolEvidence(
          ["drive-t25"],
          "manufacturer-product-specification",
          [grkBitsProduct],
          "The exact carded 187443 package supplies T25 star-drive accessories for matching GRK recesses. This is drive-tip evidence only, separate from the powered/manual driver function and actual installation setup.",
          [
            "Match the actual delivered screw recess and bit; inspect the tip and review the selected driver/chuck or holder instructions.",
            "Check exposed usable reach and access after insertion, head seating, material and actual workholding. Overall 2-in length is not a guaranteed usable reach, operating capacity or installation approval.",
          ],
        ),
      ],
      discrepancies: [
        "HD Shank Diameter says T25, a drive-size label rather than a physical diameter. Lowe states 1/4-in hex shank. Full body/working-reach envelope is unknown; no tool mesh is invented.",
        "Manufacturer 187443, HD retail model 772691874436 and Lowe 187443.0 are explicitly reviewed identities, not a general alias or suffix-stripping rule. Two bits are package contents, not ownership or an automatic purchase.",
      ],
    }),
    profile: profile("tool", null, 2, { drive: "T25" }),
  },
  {
    ...toolReference({
      id: "grk-187427-t15-bits",
      name: "GRK 187427 T15 2 in star-drive bits · two-bit card",
      manufacturer: "GRK Fasteners / ITW",
      manufacturerPartNumber: "187427",
      verifiedAt: interiorStockReviewed,
      offers: [
        hd("202349116", "772691874276", "730564"),
        lowes(
          "50303267",
          "GRK-0-x-2-in-Red-Polymer-Trim-Interior-Exterior-Wood-Screws-2-Count",
          "187427.0",
          "597602",
        ),
      ],
      sources: [
        interiorStockSource(
          grkBitsProduct,
          "Current manufacturer carded table: T15, 2 in, part 187427, two bits. Its embedded retailer links identify Lowe’s 50303267. Driver-tip function only; no powered driver, seating, pilot or access approval.",
        ),
        interiorStockSource(
          "https://www.homedepot.com/p/GRK-Fasteners-T-15-2-in-Steel-Star-Bits-2-Pack-772691874276/202349116",
          "Exact two-bit package: model 772691874276 / SKU 730564, T15, 2 in, steel/hex; listed GRK applications include cabinet#8. This UPC-like retail model is separate from manufacturer187427. No price/stock imported.",
        ),
        interiorStockSource(
          "https://www.lowes.com/pd/GRK-0-x-2-in-Red-Polymer-Trim-Interior-Exterior-Wood-Screws-2-Count/50303267",
          "Exact model 187427.0 / item 597602, two 2-in T15 bits, 1/4-in hex shank; listed GRK cabinet applications. Preserve the reviewed .0 suffix. No price/stock imported.",
        ),
      ],
      toolCapabilityEvidence: [
        toolEvidence(
          ["drive-t15"],
          "manufacturer-product-specification",
          [grkBitsProduct],
          "The exact carded 187427 package supplies T15 star-drive accessories for matching GRK recesses. This is drive-tip evidence only, separate from the powered/manual driver function and actual installation setup.",
          [
            "Match the actual delivered screw recess and bit; inspect the tip and review the selected driver/chuck or holder instructions.",
            "Check exposed usable reach and access after insertion, head seating, material and actual workholding. Overall 2-in length is not a guaranteed usable reach, operating capacity or installation approval.",
          ],
        ),
      ],
      discrepancies: [
        "HD Shank Diameter says T15, a drive-size label rather than a physical diameter. Lowe states 1/4-in hex shank. Full body/working-reach envelope is unknown; no tool mesh is invented.",
        "Manufacturer 187427, HD retail model 772691874276 and Lowe 187427.0 are reviewed separately. Do not merge with 3-in 87429 or a bulk pack. Two bits are not ownership or automatic purchases.",
      ],
    }),
    profile: profile("tool", null, 2, { drive: "T15" }),
  },
  {
    id: "hd-purebond-birch-188-165891",
    name: "PureBond birch interior plywood · .188 × 48 × 96 in · HD165891",
    manufacturer: "Columbia Forest Products · retailer-defined SKU",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification" as const,
    category: "panel" as const,
    status: "reviewed-specs" as const,
    verifiedAt: interiorStockReviewed,
    profile: profile("sheet", [48, 0.188, 96], 1, {
      wood: true,
      finish: "Unfinished birch veneer · interior · 3-ply/C4 per retailer",
      materialFamily: "purebond-interior-birch-165891",
    }),
    offers: [hd("100092485", "165891", "165891")],
    sources: [
      interiorStockSource(
        "https://www.homedepot.com/p/Columbia-Forest-Products-1-4-in-x-4-ft-x-8-ft-PureBond-Birch-Plywood-actual-0-188-in-x-48-in-x-96-in-165891/100092485",
        "Retailer model / SKU 165891 lists actual .188 × 48 × 96 in, 3-ply C4 interior birch-veneer sheet, grain along 96-in length. Individual sheet/per-panel selling wording establishes one sheet per selected unit; no explicit package-quantity field is claimed. Delivered thickness needs measurement; no price/stock imported. Nominal 1/4 in differs from actual .188 in; do not substitute .25 or another panel silently. Measure the purchased sheet before joinery; tolerances and delivered core/face condition are unverified.",
      ),
      interiorStockSource(
        pureBondFamilyDocument,
        "Columbia-produced family PDF dated 11/13 supports the PureBond family identity, not this SKU's exact dimensions, sell pack, current stock or a heated-use/emission/load approval. Actual dimensions and individual-sheet unit rely on the separately reviewed retailer listing. Manufacturer family PDF is dated 11/13; no independent manufacturer SKU dimensional/pack table was retrieved. The one-sheet selling unit uses retailer per-panel wording, not an invented package-quantity field or manufacturer MPN. Manual interior stock only; no automatic seat, carcass, structural, greenhouse or sauna qualification. A thin backing is not an anti-tip receiver or proof of lateral bracing. No exact Lowe counterpart verified.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "hd-purebond-birch-453-833185",
    name: "PureBond birch interior plywood · .453 × 48 × 96 in · HD833185",
    manufacturer: "Columbia Forest Products · retailer-defined SKU",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification" as const,
    category: "panel" as const,
    status: "reviewed-specs" as const,
    verifiedAt: interiorStockReviewed,
    profile: profile("sheet", [48, 0.453, 96], 1, {
      wood: true,
      finish: "Unfinished birch veneer · interior · 5-ply/C3 per retailer",
      materialFamily: "purebond-interior-birch-833185",
    }),
    offers: [hd("100020218", "833185", "833185")],
    sources: [
      interiorStockSource(
        "https://www.homedepot.com/p/Columbia-Forest-Products-1-2-in-x-4-ft-x-8-ft-PureBond-Birch-Plywood-833185/100020218",
        "Retailer model / SKU 833185 lists actual .453 × 48 × 96 in, 5-ply C3 interior birch-veneer sheet, grain along 96-in length. Individual sheet/per-panel selling wording establishes one sheet per selected unit; no explicit package-quantity field is claimed. Delivered thickness needs measurement; no price/stock imported. Nominal 1/2 in differs from actual .453 in and generic 15/32 = .46875 in. Preserve this exact profile; purchased thickness/tolerances and delivered core/face condition still need review.",
      ),
      interiorStockSource(
        pureBondFamilyDocument,
        "Columbia-produced family PDF dated 11/13 supports the PureBond family identity, not this SKU's exact dimensions, sell pack, current stock or a heated-use/emission/load approval. Actual dimensions and individual-sheet unit rely on the separately reviewed retailer listing. Manufacturer family PDF is dated 11/13; no independent manufacturer SKU dimensional/pack table was retrieved. The one-sheet selling unit uses retailer per-panel wording, not an invented package-quantity field or manufacturer MPN. Manual interior stock only; no automatic seat, carcass, structural, greenhouse or sauna qualification. Thickness alone establishes no joint, bracing, anti-tip or load approval. No exact Lowe counterpart verified.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
];

/** Curated references/specifications ONLY. No seeded price or current inventory. */
export const retailerCatalog: RetailerProduct[] = retailerCatalogSchema.parse([
  {
    id: "sunlite-132506",
    name: "SUNLITE 8 mm clear multiwall polycarbonate · 24 × 96 in",
    manufacturer: "Palram Americas / SUNLITE",
    manufacturerPartNumber: "132506",
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("sheet", [24, 8 / 25.4, 96], 1, {
      materialFamily: sunliteFamily,
      finish:
        "Clear multiwall polycarbonate; UV-protected face orientation matters",
    }),
    offers: [hd("202091947", "132506", "598163")],
    sources: [
      specialSource(
        sunlitePanel,
        "Exact 132506 panel, one per purchase, 24 × 96 inches. Manufacturer identifies 8 mm thickness; retailer 0.313-inch field is rounded. Greenhouse use is listed.",
      ),
      specialSource(
        sunliteProduct,
        "Manufacturer identifies SUNLITE multiwall polycarbonate applications including greenhouse/glazing. This does not qualify arbitrary spans, loading or attachment schedules.",
      ),
      specialSource(
        sunliteGuide,
        "Panel installation instructions govern flute/drainage direction, UV-facing side, expansion allowance and compatible edge/connection details. Retailer generic adhesive field is not used as an installation specification.",
      ),
    ],
    discrepancies: [],
    roleQualifications: [
      {
        role: "greenhouseGlazing",
        scope:
          "132506 8 mm SUNLITE multiwall greenhouse glazing only; source-listed material application, not approval of a generated roof or enclosure.",
        sourceRefs: [sunlitePanel, sunliteProduct, sunliteGuide],
        requirements: [
          "Use the SUNLITE 8 mm multiwall accessory family; do not substitute corrugated sheets, metal roofing or PVC glazing by matching overall dimensions.",
          "Resolve support spacing, site loads, roof slope, thermal movement and fastening from the selected panel installation instructions.",
          "Orient the UV-protected face and flutes correctly; provide appropriate top/bottom tapes, U/H profiles, drainage and ridge/edge details.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "sunlite-96714",
    name: "SUNLITE 8 mm H-profile base/cap connector · 96 in",
    manufacturer: "Palram Americas / SUNLITE",
    manufacturerPartNumber: "96714",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("connector", null, 1, {
      materialFamily: sunliteFamily,
      finish: "Clear polycarbonate",
    }),
    offers: [hd("202091948", "96714", "603811")],
    sources: [
      specialSource(
        hProfile,
        "Exact 96714: one 96-inch connector set comprising a base and cap, forming an H-profile for 8 mm SUNLITE panels. Generic 1-inch length/.313 thickness/opaque fields conflict with the specific description; cross-section is not inferred.",
      ),
      specialSource(
        sunliteGuide,
        "Use the matching multiwall panel installation details; connector fit does not establish stud spacing, capacity or weatherproofing by itself.",
      ),
    ],
    discrepancies: [
      "Full connector cross-section is unverified; generic retailer dimension fields cannot define physical placement geometry.",
    ],
    roleQualifications: [
      {
        role: "greenhousePanelConnector",
        scope:
          "Joins 8 mm SUNLITE multiwall panels; one purchase is one base-plus-cap connector assembly.",
        sourceRefs: [hProfile, sunliteGuide],
        requirements: [
          "Keep SUNLITE 8 mm family compatibility; do not use as a TUFTEX corrugated or other-thickness connector.",
          "Resolve connector drawing, attachment and expansion details before placing or purchasing a complete assembly.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "sunlite-96715",
    name: "SUNLITE 8 mm U-profile panel edge · 96 in",
    manufacturer: "Palram Americas / SUNLITE",
    manufacturerPartNumber: "96715",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("connector", null, 1, {
      materialFamily: sunliteFamily,
      finish: "Clear polycarbonate",
    }),
    offers: [hd("202091949", "96715", "610445")],
    sources: [
      specialSource(
        uProfile,
        "Exact 96715: one 96-inch U-profile for 8 mm SUNLITE/twinwall panel edges. Specific description identifies clear polycarbonate; generic 1-inch length and opaque/white fields are not used. Full cross-section unverified.",
      ),
      specialSource(
        sunliteGuide,
        "Edge closure must preserve the panel system's drainage, tape and orientation requirements.",
      ),
    ],
    discrepancies: [
      "Full U-profile cross-section is unverified; generic retailer dimension/color fields conflict with the product-specific description.",
    ],
    roleQualifications: [
      {
        role: "greenhousePanelEdge",
        scope: "Edge cap for 8 mm SUNLITE multiwall panels only.",
        sourceRefs: [uProfile, sunliteGuide],
        requirements: [
          "Preserve the correct top/bottom sealing, profile orientation and drainage arrangement from the panel instructions.",
          "Verify the physical profile drawing before generating edge geometry; this is not a corrugated-panel closure.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "sunlite-92763",
    name: "SUNLITE 8 mm top/bottom anti-dust tape combo",
    manufacturer: "Palram Americas / SUNLITE",
    manufacturerPartNumber: "92763",
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("roll", null, 2, { materialFamily: sunliteFamily }),
    offers: [hd("205713443", "92763")],
    sources: [
      specialSource(
        sunliteTape,
        "Exact combo contains two different rolls: one 32-foot nonvented top tape and one 32-foot vented bottom tape for 8 mm panels. Pack count 2 records distinct rolls, not two interchangeable supplies. Tape width/thickness are unverified.",
      ),
      specialSource(
        sunliteGuide,
        "Top and bottom edge treatment and drainage are system-specific; source rolls cannot be pooled as 64 feet of generic tape.",
      ),
    ],
    discrepancies: [
      "Mixed two-roll kit needs separate top/bottom footage accounting; no single interchangeable-roll geometry is established.",
    ],
    roleQualifications: [
      {
        role: "greenhousePanelSeal",
        scope:
          "SUNLITE 8 mm multiwall nonvented top and ventilating bottom edge-tape kit, not a generic waterproof seam tape.",
        sourceRefs: [sunliteTape, sunliteGuide],
        requirements: [
          "Track upper and lower edge footage separately; each kit supplies 32 feet of each role.",
          "Follow the selected panel's tape placement, ventilation and U-profile details; do not apply flute-tape rules to corrugated glazing.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "tuftex-1418a",
    name: "TUFTEX PolyCarb clear corrugated panel · 26 × 96 in candidate",
    manufacturer: "Palram Americas / TUFTEX",
    manufacturerPartNumber: "1418A",
    category: "panel",
    status: "candidate",
    verifiedAt: specialReviewed,
    profile: profile("sheet", null, null, {
      materialFamily: "tuftex-polycarb-corrugated",
      finish: "Clear corrugated polycarbonate",
    }),
    offers: [
      lowes(
        "3043439",
        "Tuftex-PolyCarb-2-17-ft-x-8-ft-Corrugated-PolyCarbonate-Plastic-Roof-Panel",
        "1418A",
        "73140",
      ),
    ],
    sources: [
      specialSource(
        "https://www.lowes.com/pd/Tuftex-PolyCarb-2-17-ft-x-8-ft-Corrugated-PolyCarbonate-Plastic-Roof-Panel/3043439",
        "Exact retailer model 1418A, 26 × 96-inch overall clear corrugated polycarbonate. Retail purchase pack and physical plastic thickness have not been verified.",
      ),
      specialSource(
        "https://tuftex-ondura.com/wp-content/uploads/2024/04/product-handbook-tuftex-polycarb_0.pdf",
        "Manufacturer handbook identifies greenhouse use and distinguishes 26-inch overall width from 24-inch installed cover. Corrugation envelope is not solid plastic thickness.",
      ),
      specialSource(
        "https://pdf.lowes.com/productdocuments/b31ccb87-a98c-4cb7-80e0-69cefad2d569/82471074.pdf",
        "Current Palram Americas TUFTEX brochure distinguishes PolyCarb corrugated glazing and matching square closures from multiwall H/U/tape accessories.",
      ),
    ],
    discrepancies: [
      "Exact plastic thickness, profile geometry and retail sell-unit count remain unverified; do not bind cuboid stock or substitute SUNLITE 8 mm accessories.",
    ],
    capabilities: [],
  },
  {
    id: "everbilt-eh-wsthdus-319",
    name: "Everbilt white tubular steel closet rod · 72 in",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: "EH-WSTHDUS-319",
    category: "rod",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("linear", [1.3125, 72, 1.3125], null, {
      materialFamily: "everbilt-heavy-duty-1-5-16",
      finish: "White",
    }),
    offers: [hd("300262527", "EH-WSTHDUS-319", "866035")],
    sources: [
      specialSource(
        hdRod,
        "Exact rod model: 72 inches long, 1-5/16-inch outside diameter, cut-to-fit, tubular steel. Specific diameter takes precedence over rounded 1.31-inch fields. Wall thickness, inside diameter and explicit sell-unit count remain unverified; no solid-steel section or load capacity is inferred.",
      ),
    ],
    discrepancies: [
      "Explicit purchase pack count is unverified; tube wall thickness and internal profile are unknown.",
    ],
    roleQualifications: [
      {
        role: "closetRod",
        scope:
          "Hanging-clothes closet rod in the Everbilt heavy-duty 1-5/16-inch family; outer envelope only.",
        sourceRefs: [hdRod],
        requirements: [
          "Confirm sell unit and matching end sockets, intermediate supports, substrate and attachment instructions.",
          "Do not infer span/load capacity from the outside diameter or treat this tube as a solid structural steel bar.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "everbilt-eh-wsthdus-311v",
    name: "Everbilt white 1-5/16 in closet end sockets · pair",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: "EH-WSTHDUS-311V",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("connector", null, 2, {
      materialFamily: "everbilt-heavy-duty-1-5-16",
      finish: "White powder-coated zinc alloy",
    }),
    offers: [hd("334188235", "EH-WSTHDUS-311V", "869203")],
    sources: [
      specialSource(
        hdSockets,
        "Exact 311V model, two cast-zinc end sockets (one open-lip and one closed-lip), fits 1-5/16-inch poles. Description includes mounting screws but generic included-components field conflicts. Body dimensions and included screw identity/count are unverified.",
      ),
    ],
    discrepancies: [
      "Socket envelope and included mounting screw identity/count are unverified; generic accessory field conflicts with the description.",
    ],
    roleQualifications: [
      {
        role: "closetRodSupport",
        scope:
          "End-wall socket pair for Everbilt 1-5/16-inch heavy-duty closet poles; not an intermediate support bracket.",
        sourceRefs: [hdSockets],
        requirements: [
          "Resolve mounting substrate and attachment instructions; hardware inclusion is not a verified fastener BOM.",
          "Provide any separately required center supports; no span or hanging-load capacity is established here.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "project-source-27773pholg",
    name: "Project Source white steel closet rod · 72 in",
    manufacturer: "Project Source (private label; OEM unverified)",
    manufacturerPartNumber: "27773PHOLG",
    category: "rod",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("linear", [1.3125, 72, 1.3125], 1, {
      materialFamily: "project-source-heavy-duty-1-5-16",
      finish: "White",
    }),
    offers: [
      lowes(
        "1000442349",
        "Blue-Hawk-72-in-L-x-1-3125-in-H-x-1-3125-in-W-Wood-Closet-Rod",
        "27773PHOLG",
        "1045155",
      ),
    ],
    sources: [
      specialSource(
        lowesRod,
        "Exact 27773PHOLG: one 72-inch white heavy-duty steel closet rod, 1.3125-inch outside diameter; cut-to-fit listed. Page recommends compatible brackets no more than 32 inches apart. URL's wood label is stale; current model/title/material say steel. Wall thickness/ID and rated load are not established.",
      ),
    ],
    discrepancies: [],
    roleQualifications: [
      {
        role: "closetRod",
        scope:
          "Project Source 27773PHOLG hanging-clothes rod with compatible heavy-duty 1-5/16-inch sockets/supports; outside envelope only.",
        sourceRefs: [lowesRod],
        requirements: [
          "Use matching heavy-duty sockets and intermediate supports; the source recommends support brackets at a maximum of 32 inches apart for this exact rod.",
          "Resolve bracket and wall attachment instructions and expected loads. Do not infer capacity or steel wall thickness from its external geometry.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "project-source-23723phslg",
    name: "Project Source white heavy-duty closet end flanges · pair",
    manufacturer: "Project Source (private label; OEM unverified)",
    manufacturerPartNumber: "23723PHSLG",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("connector", null, 2, {
      materialFamily: "project-source-heavy-duty-1-5-16",
      finish: "White powder-coated zinc alloy",
    }),
    offers: [
      lowes(
        "50005274",
        "Blue-Hawk-2-72-in-Shelf-Bracket",
        "23723PHSLG",
        "474251",
      ),
    ],
    sources: [
      specialSource(
        lowesSockets,
        "Exact 23723PHSLG: two heavy-duty flanges, one open and one closed, for rods up to 1-5/16-inch diameter; mounting hardware included, identity/count unverified. Title .75-inch width conflicts with .87-inch details. Manufacturer recommends stud attachment; a zero weight-capacity field is not a tested rating.",
      ),
    ],
    discrepancies: [
      "Body dimension fields conflict; included fastener identity/count is unknown. Do not use placeholder capacity fields.",
    ],
    roleQualifications: [
      {
        role: "closetRodSupport",
        scope:
          "End-wall flange pair for Project Source heavy-duty rods up to 1-5/16 inch; not a center bracket.",
        sourceRefs: [lowesSockets],
        requirements: [
          "Resolve stud/substrate mounting and included fastener details from the installation instructions.",
          "Add compatible intermediate supports according to the selected rod's instructions; fitting an end socket does not establish the complete system capacity.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "cedar-pattern-906909-candidate",
    name: "Cedar T&G pattern stock · sauna application unverified",
    manufacturer: "Regional supplier; identity not established",
    manufacturerPartNumber: "906909",
    category: "lumber",
    status: "candidate",
    verifiedAt: specialReviewed,
    profile: profile("linear", [0.625, 144, 5.37], null, {
      wood: true,
      materialFamily: "generic-cedar-pattern-stock",
    }),
    offers: [hd("100071949", "906909")],
    sources: [
      specialSource(
        "https://www.homedepot.com/p/Pattern-Stock-Cedar-Tongue-and-Groove-Board-Common-1-in-x-6-in-x-12-ft-Actual-0-625-in-x-5-37-in-x-144-in-906909/100071949",
        "Generic cedar pattern stock lists .625 × 5.37 × 144-inch actual size. Exact manufacturer/species, grade, treatment/finish, sell unit and sauna application are not qualified.",
      ),
    ],
    discrepancies: [
      "Generic cedar wall stock is not source-qualified sauna lining or a sauna bench material.",
    ],
    capabilities: [],
  },
  {
    id: "reliabilt-cd10608tg-candidate",
    name: "RELIABILT unfinished cedar T&G · sauna application unverified",
    manufacturer: "RELIABILT (private label; OEM unverified)",
    manufacturerPartNumber: "CD10608TG",
    category: "lumber",
    status: "candidate",
    verifiedAt: specialReviewed,
    profile: profile("linear", [11 / 16, 96, 5 + 3 / 8], null, {
      wood: true,
      materialFamily: "generic-cedar-wall-plank",
      finish: "Unfinished per retailer",
    }),
    offers: [
      lowes(
        "1000456701",
        "RELIABILT-5-375-in-x-8-ft-Unfinished-Cedar-Tongue-and-Groove-Wall-Plank-Covers-3-58-sq-ft",
        "CD10608TG",
        "803697",
      ),
    ],
    sources: [
      specialSource(
        "https://www.lowes.com/pd/RELIABILT-5-375-in-x-8-ft-Unfinished-Cedar-Tongue-and-Groove-Wall-Plank-Covers-3-58-sq-ft/1000456701",
        "CD10608TG unfinished cedar wall plank lists 11/16 × 5-3/8 × 96 inches. General interior wall use does not establish exact species/grade, purchase pack, sauna heat-environment suitability or suitability for skin-contact benches.",
      ),
    ],
    discrepancies: [
      "Unfinished cedar description is not a source qualification for sauna interior or bench roles.",
    ],
    capabilities: [],
  },
  {
    id: "simpson-a21z",
    name: "Simpson A21Z ZMAX angle",
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: "A21Z",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: reviewed,
    profile: profile("connector", [2, 1.5, 1.375], 1, {
      dimensionMeaning: "nominal-flanges",
      finish: "ZMAX galvanized; 18 gauge",
    }),
    offers: [
      hd("100375047", "A21Z", "296044"),
      lowes("1114951", "simpson-strong-tie-a21z-angle-z-max", "A21Z", "96871"),
    ],
    sources: [
      source(
        "https://www.strongtie.com/framinganglesandplates_anglesandplates/a_angle/p/a",
        "Manufacturer W1=2, W2=1.5, L=1.375 inches, 18 gauge, ZMAX, packaging quantity 1. These are flange dimensions; drawings have their own terms and approximate geometry caveat.",
      ),
      source(
        "https://www.lowes.com/pd/simpson-strong-tie-a21z-angle-z-max/1114951",
        "Retailer identifies A21Z, item 96871, but uses 1.548/1.375/2.048-inch dimension fields; convention conflicts with manufacturer flange dimensions.",
      ),
    ],
    discrepancies: [
      "Flange dimensions are not a verified outer solid envelope. Resolve retailer/manufacturer dimension conventions before binding geometry.",
    ],
    capabilities: [],
  },
  {
    id: "simpson-sd9112r100",
    name: "Simpson SD #9 × 1½ in connector screws · 100",
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: "SD9112R100",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: commonFastenerReviewed,
    purchaseSpec: {
      kind: "counted",
      count: 100,
      sourceRefs: [sdManufacturerUrl, "https://www.homedepot.com/p/202071152"],
    },
    profile: profile("fastener", [0.37, 1.5, 0.37], 100, {
      dimensionMeaning: "fastener-head-envelope",
      fastenerLength: 1.5,
      headDiameter: 0.37,
      shankDiameter: 0.13,
      finish: "Mechanically galvanized, Class 55",
      drive: "1/4 in hex",
    }),
    offers: [
      hd("202071152", "SD9112R100", "477314"),
      lowes(
        "3242494",
        "Simpson-Strong-Tie-100-Count-9-x-1-1-2-Galvanized-Wood-Screws",
        "SD9112R100",
        "130014",
      ),
    ],
    sources: [
      commonFastenerSource(
        "https://www.strongtie.com/strongdrive_exteriorwoodscrews/sd_screw/p/strong-drive-sd-connector-screw",
        "Exact SD9112R100 row: length 1.5, head .370, shank .130 inches, Class 55 finish, 1/4-inch hex, 100 screws. Nominal length/thread label and head envelope do not supply measured surface-to-tip depth, tolerances or a complete installed screw. Connector approval remains product/installation specific.",
      ),
      commonFastenerSource(
        "https://www.homedepot.com/p/202071152",
        "Current exact SD9112R100/store SKU477314, 100-count box, hex driver included. Generic plating says uncoated but highlights/manufacturer specify Class55. Previous reference306373352 failed direct retrieval; it remains a source-history note, not a proved retired product or a current substitute. No price/stock imported.",
      ),
      commonFastenerSource(
        "https://www.lowes.com/pd/Simpson-Strong-Tie-100-Count-9-x-1-1-2-Galvanized-Wood-Screws/3242494",
        "Retail offer model SD9112R100/item 130014, 100-count box; displayed non-local shipping counts are not imported.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "grip-rite-16c5",
    name: "Grip-Rite 16C5 common nails · advertised 5-lb box",
    manufacturer: "Grip-Rite",
    manufacturerPartNumber: "16C5",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: commonFastenerReviewed,
    purchaseSpec: {
      kind: "mass",
      amount: 5,
      unit: "lb",
      qualifier: "advertised",
      exactCount: null,
      sourceRefs: [
        commonNailManufacturerUrl,
        "https://www.homedepot.com/p/202308546",
      ],
    },
    profile: profile("fastener", null, null, {
      fastenerLength: 3.5,
      finish: "Bright, uncoated steel",
    }),
    offers: [
      hd("202308546", "16C5", "196290"),
      {
        ...lowes(
          "3334512",
          "Grip-Rite-3-1-2-in-8-Gauge-Bright-Steel-Common-Nails-5-lbs",
          "16C5",
          "69245",
        ),
        listingStatus: "retired",
      },
    ],
    sources: [
      commonFastenerSource(
        commonNailManufacturerUrl,
        "Exact16C5 row: advertised5-lb box, steel bright16d common nails, nominal3.5in,8gauge,smooth shank,flat head,diamond point and11/32in head-size field. Count235 is explicitly approximate. Exact decimal shank diameter, tolerances, net/gross mass convention and surface datum are unverified. Bright nails exclude treated wood and corrosion exposure; no greenhouse/sauna/load approval.",
      ),
      commonFastenerSource(
        "https://www.homedepot.com/p/202308546",
        "Exact16C5/SKU196290, advertised5-lb box. Narrative says around220 nails while specifications say235. These are not an exact guaranteed count. No store selection, price or availability imported.",
      ),
      commonFastenerSource(
        "https://www.lowes.com/pd/Grip-Rite-3-1-2-in-8-Gauge-Bright-Steel-Common-Nails-5-lbs/3334512",
        "Historical item69245/model16C5 page explicitly says no longer sold. Retired Grip-Rite/smooth/approximately220 rendering conflicts with search rendering Fas-n-Tite/ring/223 for the same retailer ID. No current counterpart or substituted brand/shank/count is inferred.",
      ),
    ],
    discrepancies: [
      "Exact nail count is unknown: manufacturer approximate235 versus retailer around220/spec235. Never divide demand by pounds or235, or calculate exact nail spares.",
      "Only8gauge and11/32in head-size fields are reviewed; no exact decimal shank/tip/profile mesh or installed geometry.",
      "Lowe's3334512 is retired/conflicting and is excluded from current shopping references.",
    ],
    capabilities: [],
  },
  {
    id: "simpson-n10dhdg-r",
    name: "Simpson N10DHDG-R connector nails · 120",
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: "N10DHDG-R",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: reviewed,
    profile: profile("fastener", [0.31, 1.5, 0.31], 120, {
      dimensionMeaning: "fastener-head-envelope",
      fastenerLength: 1.5,
      headDiameter: 0.31,
      shankDiameter: 0.148,
      finish: "Hot-dip galvanized, Class D",
    }),
    offers: [
      hd("206101770", "N10DHDG-R"),
      lowes(
        "1002681308",
        "Simpson-Strong-Tie-1-1-2-in-Hot-Dipped-Galvanized-Steel-120-Count",
        "N10DHDG-R",
        "1915198",
      ),
    ],
    sources: [
      source(
        "https://www.homedepot.com/p/206101770",
        "Exact N10DHDG-R offer, 1.5-inch length, .148-inch shank, 120-count pack.",
      ),
      source(
        "https://www.lowes.com/pd/Simpson-Strong-Tie-1-1-2-in-Hot-Dipped-Galvanized-Steel-120-Count/1002681308",
        "Exact N10DHDG-R offer: length 1.5, shank .148, head .31 inches, HDG Class D, quantity 120.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "grk-r4-103101",
    name: "GRK R4 #9 × 2½ in screws · 100",
    manufacturer: "GRK Fasteners",
    manufacturerPartNumber: "103101",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: woodFastenerReviewed,
    profile: profile("fastener", null, 100, {
      fastenerLength: 2.5,
      finish: "Climatek coating",
      drive: "T25",
    }),
    offers: [
      hd("203525228", "103101", "723205"),
      lowes(
        "50303209",
        "GRK-100-Count-9-x-2-5-in-Countersinking-Head-Coated-Self-Tapping-Star-Drive-Interior-Exterior-Wood-Screw",
        "103101.0",
        "580238",
      ),
    ],
    sources: [
      woodFastenerSource(
        "https://www.grkfasteners.com/grk-products/structural-framing-screws/r4-multi-purpose-screw",
        "Manufacturer handy-pack row 103101: nominal #9 × 2.5 inches, 100 screws, T25. The purchase label does not establish measured surface-to-tip depth. No exact installed body envelope is selected.",
      ),
      woodFastenerSource(
        "https://www.homedepot.com/p/203525228",
        "Retailer model 103101, 100-count.",
      ),
      woodFastenerSource(
        "https://www.lowes.com/pd/GRK-100-Count-9-x-2-5-in-Countersinking-Head-Coated-Self-Tapping-Star-Drive-Interior-Exterior-Wood-Screw/50303209",
        "Retailer displays model 103101.0; preserve this reviewed discrepancy rather than globally stripping numeric suffixes.",
      ),
      woodFastenerSource(
        "https://www.grkfasteners.com/getmedia/32d47272-9f9b-4f68-b663-60c09bcbd7bc/GRK-R4-Customer-Drawing-(1)_2.pdf?ext=.pdf",
        "Nominal drawing dated 11/01/2023, sheet 1, #9 × 2½ row gives L 2.50/thread 1.57 inches without tolerances. The cited evaluation table instead gives L 2⅜/thread 1⅝ inches. Resolve delivered revision and length datum; do not infer measured depth or a complete physical screw from the nominal label.",
      ),
      woodFastenerSource(
        "https://icc-es.org/wp-content/uploads/report-directory/ESR-3201.pdf",
        "Current report reissued July 2026, Table 1A/page 5. Its L/thread values differ from the live-linked drawing; notation and table footnote also describe different length datums. This conditional evaluation reference does not supply a universal pilot/edge schedule, plywood-edge strength or project capacity/installation approval. The older manufacturer-hosted 2023 copy is not used as the current report.",
      ),
    ],
    discrepancies: [
      "Manufacturer and retailer model strings differ by .0; preserve the exact reviewed offers.",
      "Drawing and evaluation report length/thread values and datums conflict; no exact installed envelope or measured surface-to-tip depth is selected.",
    ],
    capabilities: [],
  },
  {
    id: "grk-cabinet-113079",
    name: "GRK #8 × 2½ in cabinet screws · 100",
    manufacturer: "GRK Fasteners",
    manufacturerPartNumber: "113079",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: woodFastenerReviewed,
    profile: profile("fastener", null, 100, {
      fastenerLength: 2.5,
      finish: "Climatek family; delivered finish/exposure requires review",
      drive: "T15",
    }),
    offers: [
      hd("203525221", "113079", "726538"),
      lowes(
        "50303173",
        "GRK-8-x-2-1-2-in-Yellow-Polymer-Round-Washer-Interior-Exterior-Wood-Screws-100-Count",
        "113079.0",
        "580211",
      ),
    ],
    sources: [
      woodFastenerSource(
        "https://www.grkfasteners.com/grk-products/finish/low-profile-cabinet-screw",
        "Manufacturer handy-pack table identifies part 113079, nominal #8 × 2½ inches, quantity 100 and T15 drive. Cabinet construction/installation scope is not proof of a particular carcass joint, plywood-edge withdrawal or load capacity. This is distinct from white 120660 / 80-count packaging.",
      ),
      woodFastenerSource(
        "https://www.grkfasteners.com/getmedia/fb0fbb28-29c0-477c-8349-2c2364caa94d/GRK-Cabinet-Customer-Drawing_1.pdf?ext=.pdf",
        "Nominal drawing dated 11/01/2023, sheet 1: L 2.50 inches starts beneath the washer head, thread length 1.57, head diameter .423 and shank .114 inches; manufacturing tolerances are not supplied. The malformed numeric drive column is not used; the pack table establishes T15. Actual surface-to-tip depth remains unmeasured.",
      ),
      woodFastenerSource(
        "https://www.grkfasteners.com/getmedia/d4fe6346-bb1a-4160-9fbc-09cbfa6a65ea/GRK-Sellsheet2025-Cabinet.pdf?ext=.pdf",
        "Sell sheet 50137 / 11/25, page 2, instead lists head diameter .393 and shank .110 inches. Keep both source values unresolved; no exact installed mesh is selected. Reference test configurations are not approval of arbitrary plywood/MDF edges or a completed cabinet.",
      ),
      woodFastenerSource(
        "https://www.homedepot.com/p/203525221",
        "Exact model 113079 / SKU 726538, 100-screw pack. Retailer finish and interior/exterior fields differ from marketing descriptions; delivered-product exposure needs review. No store observation or price imported.",
      ),
      woodFastenerSource(
        "https://www.lowes.com/pd/GRK-8-x-2-1-2-in-Yellow-Polymer-Round-Washer-Interior-Exterior-Wood-Screws-100-Count/50303173",
        "Exact retailer model 113079.0 / item 580211, 100-screw pack. The numeric suffix is retained as reviewed; product 1000075987 / 120660 is a separate white 80-count variant, not an interchangeable offer.",
      ),
    ],
    discrepancies: [
      "Nominal head/shank diameters conflict: drawing .423/.114 inches versus sell sheet .393/.110 inches; exact installed geometry is unresolved.",
      "Drawing length starts beneath the washer head; nominal 2½ inches is not a measured surface-to-tip depth.",
      "Retailer finish/exposure descriptions require delivered-product confirmation; no universal cabinet pilot, edge-distance or capacity schedule is established.",
    ],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: "hd-common-pine-1x4x96-301993221",
    name: "Home Depot common pine board · actual ¾ × 3½ × 96 in",
    manufacturer: "Regional supplier; mill identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("linear", [0.75, 96, 3.5], 1, {
      wood: true,
      materialFamily: "hd-common-pine-1x4",
      finish: "Unfinished",
    }),
    offers: [hd("301993221", "810822900000000", "914681")],
    sources: [
      specialSource(
        "https://www.homedepot.com/p/301993221",
        "Retailer SKU 914681/model 810822900000000 specifies common pine square-edge unfinished board, actual .75 × 3.5 × 96 inches, one board per pack. Retailer specification identity only; mill and lot may vary by store. This is not a manufacturer MPN or a structural grade/capacity claim.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "lowes-reliabilt-lbr-940-1x4x96",
    name: "RELIABILT whitewood common board · actual ¾ × 3½ × 96 in",
    manufacturer: "RELIABILT; regional mill identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("linear", [0.75, 96, 3.5], 1, {
      wood: true,
      materialFamily: "reliabilt-whitewood-common-1x4",
      finish: "Unfinished; kiln-dried",
    }),
    offers: [
      lowes(
        "1000555115",
        "RELIABILT-1-in-x-4-in-x-8-ft-Unfinished-Whitewood-Board",
        "LBR-940",
        "940",
      ),
    ],
    sources: [
      specialSource(
        "https://www.lowes.com/pd/RELIABILT-1-in-x-4-in-x-8-ft-Unfinished-Whitewood-Board/1000555115",
        "Retailer model LBR-940/item940: unfinished #2-and-better whitewood common board, actual .75 × 3.5 × 96 inches, package quantity1, square edge and kiln-dried. Regional retailer specification, not proof of the same OEM/species/grade as Home Depot's common pine board. No store availability imported.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "lowes-reliabilt-one-six-8-951",
    name: "RELIABILT #2 whitewood 1 × 6 · actual ¾ × 5½ × 96 in",
    manufacturer: "Regional mill/OEM identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: nextBoardReviewed,
    profile: profile("linear", [0.75, 96, 5.5], 1, {
      wood: true,
      materialFamily: "lowes-reliabilt-whitewood-1x6-951",
      finish: "Unfinished; untreated; #2 whitewood; kiln-dried; S4S",
    }),
    offers: [
      lowes(
        "1001067086",
        "RELIABILT-1-in-x-6-in-x-8-ft-Unfinished-Pine-Board",
        "L51344628",
        "951",
      ),
    ],
    sources: [
      nextBoardSource(
        "https://www.lowes.com/pd/RELIABILT-1-in-x-6-in-x-8-ft-Unfinished-Pine-Board/1001067086",
        "Retailer item 951/model L51344628: actual .75 × 5.5 × 96 inches, package quantity 1, #2 whitewood, kiln-dried, S4S and unfinished. Pressure Treated is No. RELIABILT is the retailer brand; mill/OEM is unknown. The species field says whitewood and overview permits spruce/pine/fir supply. Shelving and furniture/cabinets are listed; framing and exterior trim are explicitly No. Moisture/exterior exposure requires the stated exterior-grade finish. No seat-span, joint, sauna/heat, load or selected-store stock approval.",
      ),
    ],
    discrepancies: [],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: "lowes-syp-two-six-8-73600",
    name: "Lowe’s #2 Prime SYP 2 × 6 · actual 1½ × 5½ × 96 in",
    manufacturer: "Regional mill/OEM identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: nextBoardReviewed,
    profile: profile("linear", [1.5, 96, 5.5], 1, {
      wood: true,
      materialFamily: "lowes-kd-syp-2x6-73600",
      finish:
        "#2 Prime SYP; kiln-dried; S4S; preservative treatment not declared",
    }),
    offers: [
      lowes(
        "1000028789",
        "Top-Choice-2-in-x-6-in-x-8-ft-Southern-Yellow-Pine-Lumber-Common-1-5-in-x-5-5-in-x-8-ft-Actual",
        "37015",
        "73600",
      ),
    ],
    sources: [
      nextBoardSource(
        "https://www.lowes.com/pd/Top-Choice-2-in-x-6-in-x-8-ft-Southern-Yellow-Pine-Lumber-Common-1-5-in-x-5-5-in-x-8-ft-Actual/1000028789",
        "Retailer item 73600/model 37015: actual 1.5 × 5.5 × 96 inches, package quantity 1, #2 Prime Southern yellow pine, kiln-dried and S4S. Above-ground contact is stated. Framing, shelving and furniture/cabinets are listed; decking, fencing and landscaping are No. No preservative-treatment declaration was retrieved; Meets AWPA No is not proof of untreated chemistry. The historical Top Choice URL does not establish a current manufacturer or MPN. Inspect the purchased grade/treatment stamp. No structural, exterior-exposure, sauna/heat or selected-store stock approval.",
      ),
    ],
    discrepancies: [],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: "lowes-syp-2x4x96-5140",
    name: "Top Choice #2 SYP 2 × 4 · actual 1½ × 3½ × 96 in",
    manufacturer: "Top Choice; regional mill identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: commonStockReviewed,
    profile: profile("linear", [1.5, 96, 3.5], 1, {
      wood: true,
      materialFamily: "lowes-kd-syp-2x4-5140",
      finish: "Kiln-dried; S4S; no reviewed preservative treatment",
    }),
    offers: [
      lowes(
        "5014110787",
        "Top-Choice-2-in-x-4-in-x-8-ft-Southern-Yellow-Pine-Kiln-dried-Lumber",
        "020408#2 SYP",
        "5140",
      ),
    ],
    sources: [
      commonStockSource(
        "https://www.lowes.com/pd/Top-Choice-2-in-x-4-in-x-8-ft-Southern-Yellow-Pine-Kiln-dried-Lumber/5014110787",
        "Retailer model 020408#2 SYP/item 5140 specifies Southern yellow pine, actual 1.5 × 3.5 × 96 inches, kiln-dried, S4S and package quantity 1. The title and specifications say #2; the overview says #2 Prime. Retain conservative #2 and inspect the purchased grade stamp. Retailer specification identity only, with no verified mill/MPN, treatment qualification, capacity or selected-store inventory. This current reference is distinct from retired product 1000069139 even though both list item 5140.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "lowes-syp-treated-post-4x4x96-552328",
    name: "Severe Weather #2 treated SYP post · actual 3½ × 3½ × 96 in",
    manufacturer: "Severe Weather; regional mill identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: commonStockReviewed,
    profile: profile("linear", [3.5, 96, 3.5], 1, {
      wood: true,
      materialFamily: "lowes-mca-treated-syp-post-552328",
      finish: "MCA pressure-treated; ground-contact listing; #2 SYP",
    }),
    offers: [
      lowes(
        "50121083",
        "severe-weather-common-4-in-x-4-in-x-8-ft-actual-3-5-in-x-3-5-in-x-8-ft-2-treated-lumber",
        "Y2L40408-GC",
        "552328",
      ),
    ],
    sources: [
      commonStockSource(
        "https://www.lowes.com/pd/severe-weather-common-4-in-x-4-in-x-8-ft-actual-3-5-in-x-3-5-in-x-8-ft-2-treated-lumber/50121083",
        "Retailer model Y2L40408-GC/item 552328 specifies #2 Southern yellow pine, actual 3.5 × 3.5 × 96 inches and package quantity 1. Description identifies MCA pressure treatment and ground-contact use; specifications list kiln-dried. A highlight drops the decimal points to 35 inches, while the detailed actual-dimension fields and description agree on 3.5 inches. Specific treatment retention and AWPA use-category number are not verified. Inspect actual grade/treatment tags and compatible fastener requirements; physical geometry is not a capacity, sauna/heat suitability or store-stock claim.",
      ),
    ],
    discrepancies: [],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: "lowes-douglas-fir-2x4x96-330568-candidate",
    name: "Lowe’s #2 KD Douglas fir 2 × 4 · sell unit unverified",
    manufacturer: "Regional supplier; mill identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "candidate",
    verifiedAt: specialReviewed,
    profile: profile("linear", [1.5, 96, 3.5], null, {
      wood: true,
      materialFamily: "lowes-kd-douglas-fir-2x4",
      finish: "Kiln-dried; S4S",
    }),
    offers: [
      lowes(
        "5003667531",
        "Unbranded-2-4-8-KD-DF-SELECT-STUD",
        "20496 KDDFL",
        "330568",
      ),
    ],
    sources: [
      specialSource(
        "https://www.lowes.com/pd/Unbranded-2-4-8-KD-DF-SELECT-STUD/5003667531",
        "Current reference for model20496 KDDFL/item330568, #2 kiln-dried Douglas fir, actual1.5 × 3.5 × 96 inches, S4S. Exact sell-unit count is not stated in the reviewed page; no wholesale bundle field from another product is imported.",
      ),
    ],
    discrepancies: [
      "Purchase unit must be confirmed from the selected store snapshot; geometry alone cannot resolve per-board versus bundle inventory.",
    ],
    capabilities: [],
  },
  {
    id: "lowes-syp-2x4x96-1365777-retired",
    name: "Lowe’s SYP 2 × 4 × 96 in · retired reference",
    manufacturer: "Regional supplier; mill identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("linear", [1.5, 96, 3.5], 1, {
      wood: true,
      materialFamily: "lowes-kd-syp-2x4",
      finish: "Kiln-dried; S4S",
    }),
    offers: [
      {
        ...lowes(
          "1000069139",
          "2-in-x-4-in-x-8-ft-Southern-Yellow-Pine-Lumber-Common-1-5-in-x-3-5-in-x-8-ft-Actual",
          "1365777",
          "5140",
        ),
        listingStatus: "retired",
      },
    ],
    sources: [
      specialSource(
        "https://www.lowes.com/pd/2-in-x-4-in-x-8-ft-Southern-Yellow-Pine-Lumber-Common-1-5-in-x-3-5-in-x-8-ft-Actual/1000069139",
        "Model1365777/item5140 specifies1.5 × 3.5 × 96 inches, package1, #2 Southern yellow pine, kiln-dried/S4S. The full page explicitly says no longer sold despite active-looking search snippets. Historical dimensions remain useful; this is not a purchase-ready offer.",
      ),
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "everbilt-29256-continuous-hinge",
    name: "Everbilt 48 in continuous lid hinge · placement unresolved",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: "29256",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("connector", null, 1, {
      materialFamily: "everbilt-continuous-hinge-29256",
      finish: "Bright nickel-plated steel",
    }),
    offers: [hd("314150989", "29256", "1005659023")],
    sources: [
      specialSource(
        "https://www.homedepot.com/p/314150989",
        "Model29256, single cut-to-length continuous steel hinge for interior cabinets/chests/lids. Nominal48-inch length versus48.03-inch height field;1.5-inch width convention does not describe the complete moving/knuckle envelope. Screws included but exact count/identity not established from primary product documents; AI answers are not used.",
      ),
      specialSource(
        "https://images.thdstatic.com/catalog/pdfImages/43/43ad05ea-dd8a-438f-b10c-33d2ccdf1c95.pdf",
        "Retailer-linked continuous hinge instructions. A hinge is separate from the lid stay; mounting/substrate/clearance and lid load requirements still need review.",
      ),
    ],
    discrepancies: [
      "Full moving geometry, attachment details and lid-specific loading are unresolved; do not claim a storage-seat capacity or a lid hold-open/soft-close function.",
    ],
    roleQualifications: [
      {
        role: "storageLidHinge",
        scope:
          "Interior cabinet/chest lid pivot candidate; does not hold a lid open or establish seating capacity.",
        sourceRefs: [
          "https://www.homedepot.com/p/314150989",
          "https://images.thdstatic.com/catalog/pdfImages/43/43ad05ea-dd8a-438f-b10c-33d2ccdf1c95.pdf",
        ],
        requirements: [
          "Verify hinge length, knuckle/pivot placement, opening clearance, fasteners and substrate for the actual lid.",
          "Select a separate appropriate lid support/stay and resolve lid mass/center of gravity and access/pinch constraints; no generic soft-close or hold-open claim.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "national-n208-637-lid-support",
    name: "National N208-637 adjustable friction lid support",
    manufacturer: "National Hardware",
    manufacturerPartNumber: "N208-637",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: specialReviewed,
    profile: profile("connector", null, 1, {
      materialFamily: "national-n208-637-friction-lid-support",
      finish: "Brass finish over steel",
    }),
    offers: [
      {
        ...lowes(
          "105225082",
          "National-Hardware-Brass-Plated-Steel-Friction-Lid-Support-6-in-1-pk",
          "N208-637",
          "105225082",
        ),
        seller: "Max Warehouse (Lowe’s marketplace)",
      },
    ],
    sources: [
      specialSource(
        "https://www.national-hardware.com/p/1891-friction-lid-supports?model=N208-637",
        "Manufacturer N208-637, quantity1, steel adjustable-friction lid support; left/right mounting, screws included, for chests3-1/4 inches or deeper. Complete physical geometry and rated lid torque are not established here.",
      ),
      specialSource(
        "https://www.lowes.com/pd/National-Hardware-Brass-Plated-Steel-Friction-Lid-Support-6-in-1-pk/105225082",
        "Exact MPN offer sold by Max Warehouse, not Lowe’s direct stock. Retailer8.5 × 2.75-inch fields may describe packaging and are not imported as installation geometry. No marketplace price, stock or generalized soft-close claims imported.",
      ),
    ],
    discrepancies: [
      "Mounting geometry, torque range, fastener details and lid-specific fit remain unresolved; friction adjustment is not documented soft-close damping or seating capacity.",
    ],
    roleQualifications: [
      {
        role: "storageLidSupport",
        scope:
          "Manufacturer-listed adjustable-friction support for cabinet/chest lids; product family reference, not an approved support selection for a generated seat lid.",
        sourceRefs: [
          "https://www.national-hardware.com/p/1891-friction-lid-supports?model=N208-637",
        ],
        requirements: [
          "Check the actual lid mass/center of gravity, motion, mounting dimensions and documented support torque or manufacturer selection advice before selecting quantity.",
          "Preserve the manufacturer minimum chest-depth and mounting instructions. Friction adjustment does not establish damping, pinch protection or lid seating-load support.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "regional-stud-2x4x96",
    name: "Regional untreated 2 × 4 × 96 in stud references",
    manufacturer: "Regional supplier; identity not established",
    manufacturerPartNumber: null,
    category: "lumber",
    status: "candidate",
    verifiedAt: reviewed,
    profile: profile("linear", [1.5, 96, 3.5], null, { wood: true }),
    offers: [
      hd("312528776", "058449", "161640"),
      lowes(
        "5001997955",
        "2-in-x-4-in-x-8-ft-KD-WW-Select-Stud-1",
        "6005",
        "6005",
      ),
    ],
    sources: [
      source(
        "https://www.homedepot.com/p/312528776",
        "Actual 1.5 × 3.5 × 96 inches; product may vary by region/store.",
      ),
      source(
        "https://www.lowes.com/pd/2-in-x-4-in-x-8-ft-KD-WW-Select-Stud-1/5001997955",
        "Actual 1.5 × 3.5 × 96 inches; Package Quantity field is 294, requiring sell-unit confirmation.",
      ),
    ],
    discrepancies: [
      "Same dimensional family does not prove same manufacturer/species/grade performance.",
      "Lowe's 294 package field must not become per-board inventory or an assumed purchase pack.",
    ],
    capabilities: [],
  },
  {
    id: "plytanium-bc-201428",
    name: "Plytanium BC sanded panel · 23/32 category",
    manufacturer: "Georgia-Pacific",
    manufacturerPartNumber: "201428",
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: reviewed,
    profile: profile("sheet", [47.938, 0.703, 95.938], 1, {
      wood: true,
      materialFamily: "plytanium-bc-sanded-23-32",
    }),
    offers: [
      hd("100061386", "201428", "166057"),
      {
        ...lowes(
          "3602858",
          "23-32-CAT-PS1-09-Pine-Sanded-Plywood-Application-as-4-x-8",
          "NA",
          "12229",
        ),
        listingStatus: "retired",
      },
    ],
    sources: [
      source(
        "https://www.homedepot.com/p/Plytanium-23-32-in-x-4-ft-x-8-ft-BC-Sanded-Pine-Plywood-201428/100061386",
        "Retailer201428 is a single BC sanded panel with listed actual47.938 × .703 × 95.938 inches. Product can vary by store; inspect the actual panel and stamp. Interior exposure field differs from broader exterior-family descriptions; only dry interior casework is scoped here.",
      ),
      source(
        "https://www.buildgp.com/product/plytanium-plywood-sanded-panels",
        "Manufacturer 23/32 category is .703-inch thickness; minimum width/length and tolerances also specified.",
      ),
      source(
        "https://www.lowes.com/pd/23-32-CAT-PS1-09-Pine-Sanded-Plywood-Application-as-4-x-8/3602858",
        "Historical Lowe's item 12229/model NA is no longer sold; not a currently purchasable counterpart.",
      ),
    ],
    discrepancies: [],
    roleQualifications: [
      {
        role: "caseworkPanels",
        scope:
          "Dry interior cabinets, shelving and furniture using the selected BC sanded panel; nominal23/32 category uses reviewed .703-inch actual design thickness.",
        sourceRefs: [
          "https://www.homedepot.com/p/Plytanium-23-32-in-x-4-ft-x-8-ft-BC-Sanded-Pine-Plywood-201428/100061386",
          "https://www.buildgp.com/product/plytanium-plywood-sanded-panels",
        ],
        requirements: [
          "Measure the purchased sheet and confirm panel stamp/grade before precision joinery; .703 inches is not .75 inches and manufacturer size tolerances still apply.",
          "This qualification is restricted to dry interior casework. Conflicting exposure descriptions do not establish wet-location, exterior, sauna or structural-seat suitability.",
          "The historical Lowe’s offer is retired; do not present it as a purchasable counterpart or import inventory for it.",
        ],
      },
    ],
    capabilities: [],
  },
  {
    id: "dewalt-dwe575sb",
    name: "DEWALT DWE575SB circular saw",
    manufacturer: "DEWALT",
    manufacturerPartNumber: "DWE575SB",
    category: "tool",
    status: "reviewed-specs",
    verifiedAt: reviewed,
    profile: profile("tool", null, 1),
    offers: [
      hd("203740647", "DWE575SB", "1005222652"),
      lowes(
        "3711470",
        "DEWALT-7-1-4-in-Corded-Circular-Saw-with-Brake-Aluminum-Shoe-and-Soft-Case",
        "DWE575SB",
        "401153",
      ),
    ],
    sources: [
      source(
        "https://www.dewalt.com/en-us/product/dwe575sb/7-14-lightweight-circular-saw-contractor-bag-tool-only",
        "Manufacturer model, 120V/15A corded, 7.25-inch blade and 2-9/16-inch stated depth capacity; no body envelope established.",
      ),
      source(
        sawManual,
        "Manufacturer Type 1 manual documents wood rip/crosscut operations; confirm the actual tool type and manual revision; material/blade/depth/support requirements must be checked per operation. It excludes metal/plastic/concrete/masonry/fiber-cement cutting.",
      ),
    ],
    discrepancies: [],
    capabilities: ["wood-crosscut", "wood-rip"],
    toolCapabilityEvidence: [
      toolEvidence(
        ["wood-crosscut", "wood-rip"],
        "manufacturer-manual",
        [sawManual],
        "Manufacturer Type 1 manual documents wood rip/crosscut operations. The actual tool type/manual revision and operating capacity remain to be checked.",
        [
          "Confirm the actual tool, blade, material, depth, support and access for every operation.",
          "This evidence excludes metal, plastic, concrete, masonry and fiber-cement cutting; it does not support profile/compound cuts.",
        ],
      ),
    ],
  },
  {
    id: "dewalt-dcd771c2",
    name: "DEWALT DCD771C2 drill/driver kit",
    manufacturer: "DEWALT",
    manufacturerPartNumber: "DCD771C2",
    category: "tool",
    status: "reviewed-specs",
    verifiedAt: reviewed,
    profile: profile("tool", null, 1),
    offers: [
      hd("204279858", "DCD771C2"),
      lowes(
        "50040962",
        "DEWALT-20-volt-max-1-2-in-Keyless-Cordless-Drill-2-Batteries-Included-Soft-Bag-Included",
        "DCD771C2",
        "506283",
      ),
    ],
    sources: [
      source(
        "https://www.dewalt.com/en-us/product/dcd771c2/20v-max-compact-drilldriver-kit",
        "Manufacturer 1/2-inch drill/driver kit includes two battery packs, charger and bag; no verified body envelope or motor-type binding.",
      ),
      source(
        drillManual,
        "Manufacturer Type 1 manual documents drilling and screwdriving; confirm the actual tool type/manual revision. Bit size/type, battery/charger readiness and fastener/operation compatibility remain per-operation checks.",
      ),
    ],
    discrepancies: [
      "Some retailer/manufacturer feature fields conflict; motor type and exact body envelope are deliberately not populated.",
    ],
    capabilities: ["drill-pilot", "drive-screw"],
    toolCapabilityEvidence: [
      toolEvidence(
        ["drill-pilot", "drive-screw"],
        "manufacturer-manual",
        [drillManual],
        "Manufacturer Type 1 manual documents drilling and screwdriving. Actual tool type/revision, bit, fastener and operation fit remain unverified.",
        [
          "Verify pilot-hole instructions, bit diameter/depth, driver bit and exact fastener; no hole or torque schedule is generated.",
          "Review the actual tool, battery/charger condition and working setup.",
        ],
      ),
    ],
  },
  {
    id: "kreg-kma-5mpin",
    name: "Kreg KMA-5MPIN 5 mm shelf pins · 20-pin pack",
    manufacturer: "Kreg",
    manufacturerPartNumber: "KMA-5MPIN",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: shelfReviewed,
    profile: profile("connector", null, 20, {
      materialFamily: "kreg-5mm-shelf-pin-support",
      finish: "Zinc finish",
    }),
    offers: [
      lowes(
        "5006037921",
        "Kreg-0-75-in-L-x-0-332-in-W-x-0-19-in-D-Shelf-pins-20-Pack",
        "KMA-5MPIN",
        "4897499",
      ),
    ],
    sources: [
      shelfSource(
        shelfPinsProduct,
        "Manufacturer exact KMA-5MPIN: 20 shelf pins per pack, nominal 5 mm mating size, zinc finish and compatibility with the Kreg 5 mm jig/bit. Pin insertion length, shoulder and bearing-face geometry/tolerances are not published here. The per-pin capacity statement does not establish a shelf assembly rating or permit multiplying it by support count.",
      ),
      shelfSource(
        shelfPinsLowes,
        "Exact Lowe’s item 4897499/model KMA-5MPIN, package quantity 20. Overall .75 × .332 × .19 inch fields are not a dimensioned insertion/bearing profile; .19 inches is not exact 5 mm. No Home Depot counterpart, store stock or price inferred.",
      ),
    ],
    discrepancies: [
      "Installed pin insertion depth, bearing offset, full body geometry and hole-fit tolerances remain unknown; this purchase reference creates no support geometry or drilling operation.",
    ],
    capabilities: [],
  },
  toolReference({
    id: "kreg-kma3232",
    name: "Kreg KMA3232 5 mm shelf-pin jig · bit included",
    manufacturer: "Kreg",
    manufacturerPartNumber: "KMA3232",
    verifiedAt: shelfReviewed,
    offers: [
      hd("319450681", "KMA3232", "1007456246"),
      lowes(
        "5006041513",
        "Kreg-Shelf-Pin-Jig-5mm-Create-Perfectly-Spaced-Holes-at-1-1-4-Inch-32mm-Increments",
        "KMA3232",
        "4897498",
      ),
    ],
    sources: [
      shelfSource(
        shelfJigProduct,
        "One KMA3232 jig kit includes fence, 5 mm bit, collar/set screw, indexing pin, extension, hex wrench and four 5 mm pins. Included pins have no separately verified KMA-5MPIN identity or installed geometry. A checked tool review is not ownership, a new purchase, remaining kit contents or inventory.",
      ),
      shelfSource(
        shelfJigManual,
        "Current manufacturer-linked manual 105707 V1 (printed 1/2021), cover explicitly includes KMA3232. Pages 3–4 list parts and collar setup using the molded gauge; pages 5–8 cover reference-end alignment, clamping and drilling/indexing. Page 9 identifies nominal 32 mm pitch and 37 mm from jig sides. These are process references, not a project-specific hole schedule or measured tip-depth envelope.",
      ),
      shelfSource(
        "https://www.homedepot.com/p/319450681",
        "Exact HD KMA3232/SKU 1007456246 reference; sell unit is one jig kit. Generic seven-piece field is not seven jigs or proof of kit contents currently owned.",
      ),
      shelfSource(
        "https://www.lowes.com/pd/Kreg-Shelf-Pin-Jig-5mm-Create-Perfectly-Spaced-Holes-at-1-1-4-Inch-32mm-Increments/5006041513",
        "Exact Lowe’s KMA3232/item 4897498 reference, one jig kit. Generic nine-piece field differs from HD and does not define a different pin quantity or purchase pack. No price/stock imported.",
      ),
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["shelf-pin-layout"],
        "manufacturer-manual",
        [shelfJigManual],
        "Fixture-guided positioning and indexing for the specified Kreg shelf-pin system, with six hardened drill guides. This is not a generic measuring tool, powered drill or approved installed support.",
        [
          "Only if you choose 5 mm pin rows: review the actual panel datum, opposite-side alignment, hole depth and clearances. No hole centers, cuts or joints are generated.",
          "Use the manual’s collar gauge, correct bit and separate drill/clamp setup. The extension/indexing hole is not a drilling guide.",
          "A checked model records a function review, not ownership, purchase quantities or current kit contents. Do not credit the kit’s four pins automatically.",
        ],
      ),
      toolEvidence(
        ["shelf-pin-bit"],
        "manufacturer-product-specification",
        [shelfJigProduct],
        "A complete KMA3232 kit includes its 5 mm brad-point bit and stop collar. Review their actual presence and condition; no powered-drill capability is supplied.",
        [
          "Replacement KMA3215 is optional; do not purchase it again merely because the complete jig is reviewed.",
          "Check the matched bit/collar, panel thickness and actual deepest-tip depth. Pin insertion/bearing geometry remains unresolved and no drilling operation is created.",
        ],
      ),
    ],
  }),
  toolReference({
    id: "kreg-kma3215",
    name: "Kreg KMA3215 5 mm shelf-pin bit · optional replacement",
    manufacturer: "Kreg",
    manufacturerPartNumber: "KMA3215",
    verifiedAt: shelfReviewed,
    offers: [
      lowes("50022250", "Kreg-Shelf-Pin-Jig-Drill-Bit", "KMA3215", "518048"),
    ],
    sources: [
      shelfSource(
        shelfBitProduct,
        "Manufacturer KMA3215: one replacement 5 mm HSS brad-point bit, ¼ inch hex shank; published capacity 5 mm holes/7 mm deep. Actual brad-point penetration and fit tolerances are not specified. Current contents list the bit alone, not a spare collar/wrench; a complete jig already includes its bit/collar.",
      ),
      shelfSource(
        "https://www.lowes.com/pd/Kreg-Shelf-Pin-Jig-Drill-Bit/50022250",
        "Exact Lowe’s KMA3215/item 518048, package 1. Generic 3/16-inch diameter differs from manufacturer 5 mm and must not replace it; ¼ inch hex is not exact 6 mm. Wood-drilling accessory, not a powered drill, generic pilot bit or fixture. No stock/price inferred.",
      ),
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["shelf-pin-bit"],
        "manufacturer-product-specification",
        [shelfBitProduct],
        "Matched 5 mm shelf-pin brad-point bit accessory; published 7 mm hole-depth capacity is not a calibrated project cutting envelope or powered-drill function.",
        [
          "Optional replacement only: the complete KMA3232 jig already includes a bit and collar. Tool review creates no purchase quantity.",
          "Use the correct jig and separately verified collar/wrench; the current replacement contents list only one bit. Review the actual drill, clamping, panel thickness and deepest-tip clearance.",
          "No hole locations, pin supports, joints, load approval or installation geometry are generated.",
        ],
      ),
    ],
  }),
  {
    id: "hillman-simple-mount-9976524",
    name: "SIMPLE MOUNT / Hillman 9976524 furniture anti-tip kit",
    manufacturer: "Hillman",
    manufacturerPartNumber: "9976524",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: "2026-11-17T01:25:05.000Z",
    profile: profile("connector", null, 1, {
      materialFamily: "simple-mount-9976524-furniture-restraint",
    }),
    offers: [
      hd("314365593", "9976524", "1005701795"),
      lowes(
        "5015754703",
        "Hillman-Simple-Mount-Anti-Tip-Kit-for-Furniture",
        "9976524",
        "6602870",
      ),
    ],
    sources: [
      {
        url: "https://www.homedepot.com/p/1-Pack-Furniture-Anti-Tip-Kit-9976524/314365593",
        verifiedAt: "2026-11-17T01:25:05.000Z",
        note: "Exact model9976524/SKU1005701795, one complete kit per sell unit. Direct plywood attachment is excluded. Generic1x1x1-inch/1-pound fields are not fitting geometry. Published rating does not qualify a generated furniture assembly, restraint count or wall method; no price/stock imported.",
      },
      {
        url: "https://www.lowes.com/pd/Hillman-Simple-Mount-Anti-Tip-Kit-for-Furniture/5015754703",
        verifiedAt: "2026-11-17T01:25:05.000Z",
        note: "Exact model9976524/item6602870, Hillman listing; one kit contains two brackets, two5/8-inch screws, two1.5-inch screws, two clevis pins, two cotter retainers and one cable. Eleven components are not eleven kits. Wall assignment of the long screws is not a separately labeled current installation schedule.",
      },
      {
        url: "https://mobileimages.lowes.com/productimages/883af106-1787-43df-8238-ac2554934c34/74814604.jpeg?size=pdhism",
        verifiedAt: "2026-11-17T01:25:05.000Z",
        note: "Exact retailer product gallery front card visibly prints SIMPLE MOUNT and9976524. This supports the two retailers' shared model identity, not an assumed alias to TK400L,121192,847-841 or122386.",
      },
      {
        url: "https://mobileimages.lowes.com/productimages/a9ca768c-6439-4860-ae9e-1754ee7269d1/75747905.jpeg?size=pdhism",
        verifiedAt: "2026-11-17T01:25:05.000Z",
        note: "Exact-product contents graphic identifies all eleven components and short/long screw lengths. No bracket envelope, cable eye-to-eye length, screw gauge, pilot or hole pattern is dimensioned.",
      },
      {
        url: "https://mobileimages.lowes.com/productimages/f0bf562b-029d-473b-8f20-32cd9903d470/75748178.jpeg?size=pdhism",
        verifiedAt: "2026-11-17T01:25:05.000Z",
        note: "Retained clevis/cable-eye topology and two screw positions per fitting are depicted. Furniture screws are labeled5/8-inch into solid wood; plywood back is not an attachment member. The other bracket is identified for a wall stud. This graphic is not a revisioned complete manufacturer manual.",
      },
      {
        url: "https://mobileimages.lowes.com/productimages/69368cf0-011b-4887-9d92-0567d5d7c97c/75748202.jpeg?size=pdhism",
        verifiedAt: "2026-11-17T01:25:05.000Z",
        note: "Suggested under-top route can pass the cable through a plywood back to a solid-wood member. Stud fixing is required; do not rely on drywall anchors. Exact hole/eye offsets, cable reach, receiver joinery and current delivered instructions remain unresolved.",
      },
    ],
    discrepancies: [
      "Actual fitting/eye/hole geometry and cable eye-to-eye length are unverified; no placed mesh or installation fit is supplied.",
      "No current exact revisioned manufacturer manual is verified. Retailer-hosted product graphics provide limited process evidence only.",
      "The two1.5-inch screws are known kit contents, but their wall assignment, screw gauges, pilots and required engagement must be checked against delivered exact instructions.",
      "Solid-wood receiver and wood-stud fixing required by the reviewed method; a plywood panel/back, drywall anchor, masonry or steel-stud substitute is not qualified.",
      "Kit rating is not an assembled-furniture capacity, a restraint quantity rule or code approval.",
    ],
    capabilities: [],
  },
  ...commonToolProducts,
  ...measuredMetalToolProducts,
  ...commonInteriorProducts,
  {
    id: "simpson-csvz3r70",
    name: "Simpson CSV #10 × 3 in interior wood screws · 70",
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: "CSVZ3R70",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: simpson70Reviewed,
    purchaseSpec: {
      kind: "counted",
      count: 70,
      sourceRefs: [
        simpson70CatalogPdf,
        "https://www.homedepot.com/p/321563361",
        "https://www.lowes.com/pd/Simpson-Strong-Tie-Strong-Drive-174-CSV-Construction-Screw-8212-10-x-3-in-T-25-Flat-Head-Yellow-Zinc-70-Qty/1002623380",
      ],
    },
    profile: profile("fastener", null, 70, {
      fastenerLength: 3,
      finish: "Yellow zinc; dry interior wood applications",
      drive: "T25",
    }),
    offers: [
      hd("321563361", "CSVZ3R70", "1008711183"),
      lowes(
        "1002623380",
        "Simpson-Strong-Tie-Strong-Drive-174-CSV-Construction-Screw-8212-10-x-3-in-T-25-Flat-Head-Yellow-Zinc-70-Qty",
        "CSVZ3R70",
        "2132121",
      ),
    ],
    sources: [
      simpson70Source(
        simpson70CatalogLanding,
        "Current manufacturer C-F-2025 catalog replaces C-F-2023 and expires December 31, 2026. Recheck after expiry; purchase identity does not supply project installation or load approval.",
      ),
      simpson70Source(
        simpson70CatalogPdf,
        "C-F-2025 printed/physical page 96: CSVZ3R70 is the retail pack of 70 #10 × 3 in T25 yellow-zinc screws. Master carton 6 is separate from this box. Interior sawn/engineered wood scope; nominal length is not measured seating depth. T25 bit included, replacement BIT25T-2-R2; no automatic ownership or complete body geometry.",
      ),
      simpson70Source(
        "https://www.strongtie.com/strongdrive_interiorwoodscrews/csvz_screw/p/strong-drive-csv-construction-screw",
        "Manufacturer CSV product-family reference. Exact purchase facts are reviewed against C-F-2025; this reference does not resolve actual tip shape, seating datum, pilot or project fastening schedule.",
      ),
      simpson70Source(
        "https://www.homedepot.com/p/321563361",
        "Exact CSVZ3R70 / SKU1008711183: #10 × 3 in, 70-count box, T25, carbon steel, yellow zinc and interior fields. Retailer replacement-bit label BIT25T-2 differs from current manufacturer BIT25T-2-R2. No selected-store price or availability imported.",
      ),
      simpson70Source(
        "https://www.lowes.com/pd/Simpson-Strong-Tie-Strong-Drive-174-CSV-Construction-Screw-8212-10-x-3-in-T-25-Flat-Head-Yellow-Zinc-70-Qty/1002623380",
        "Exact CSVZ3R70 / item2132121: 70 pieces per box, #10 × 3 in, interior wood-to-wood. ACQ Approved is No. Included T25 replacement is BIT25T-2-R2; neither a bit nor driver is automatically selected as owned.",
      ),
    ],
    discrepancies: [
      "Nominal 3 in is a purchase label, not user-measured surface-to-tip, pilot or countersink depth. Head/shank/tip profile and manufacturing tolerances remain unresolved; no installed mesh is modeled.",
      "Interior source scope supplies no exterior/treated-wood, connector-specific, heated-sauna, plywood-edge withdrawal or completed-joint approval.",
      "Home Depot replacement bit BIT25T-2 differs from manufacturer/Lowe’s BIT25T-2-R2. Included-bit wording is not ownership, access or driver-function evidence.",
    ],
    capabilities: [],
  },
  {
    id: "simpson-dsvt3r70",
    name: "Simpson DSV #10 × 3 in Tan Quik Guard screws · 70",
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: "DSVT3R70",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: simpson70Reviewed,
    purchaseSpec: {
      kind: "counted",
      count: 70,
      sourceRefs: [
        simpson70CatalogPdf,
        "https://www.homedepot.com/p/321563400",
        "https://www.lowes.com/pd/Simpson-Strong-Tie-Deck-Drive-8482-DSV-WOOD-Screw-8212-10-x-3-in-T-25-Flat-Head-Quik-Guard-174-Tan-70-Qty/1002623434",
      ],
    },
    profile: profile("fastener", null, 70, {
      fastenerLength: 3,
      headDiameter: 0.33,
      finish: "Tan Quik Guard; exterior and certain treated-wood applications",
      drive: "T25",
    }),
    offers: [
      hd("321563400", "DSVT3R70", "1008711179"),
      lowes(
        "1002623434",
        "Simpson-Strong-Tie-Deck-Drive-8482-DSV-WOOD-Screw-8212-10-x-3-in-T-25-Flat-Head-Quik-Guard-174-Tan-70-Qty",
        "DSVT3R70",
        "2132130",
      ),
    ],
    sources: [
      simpson70Source(
        simpson70CatalogLanding,
        "Current manufacturer C-F-2025 catalog replaces C-F-2023 and expires December 31, 2026. Recheck after expiry; technical installation/load decisions require separate current evidence.",
      ),
      simpson70Source(
        simpson70CatalogPdf,
        "C-F-2025 printed/physical page 77: DSVT3R70 is the retail Tan Quik Guard pack of 70 #10 × 3 in T25 screws, nominal head diameter .330 in. Approximate 76-per-pound refers to separate mass packs. Exterior/certain preservative-treated decking, fascia and trim scope is conditional; no full installed profile or project schedule follows. T25 bit included, replacement BIT25T-2-R2.",
      ),
      simpson70Source(
        "https://www.strongtie.com/deckdrive_exteriorwoodscrews/dsv_screw/p/deck-drive-dsv-wood-screw",
        "Manufacturer DSV product-family reference. Actual wood treatment, exposure, substrate, grain, seating, edge/end/spacing, pilot and driver access still require project review.",
      ),
      simpson70Source(
        "https://www.homedepot.com/p/321563400",
        "Exact DSVT3R70 / SKU1008711179: #10 × 3 in, 70-count box, T25, Tan Quik Guard. Generic plating says electrogalvanized zinc; weight1.1lb is not a count conversion. An October2026 manufacturer response directs structural-framing selection to SDWS, narrower than broader catalog/old-flier wording. No price/stock imported.",
      ),
      simpson70Source(
        "https://www.lowes.com/pd/Simpson-Strong-Tie-Deck-Drive-8482-DSV-WOOD-Screw-8212-10-x-3-in-T-25-Flat-Head-Quik-Guard-174-Tan-70-Qty/1002623434",
        "Exact DSVT3R70 / item2132130: 70 per box, #10 × 3 in, Tan, exterior wood-to-wood. ACQ Approved Yes is a retailer field, not universal treatment/exposure approval. Retail replacement BIT25T-2 differs from current manufacturer BIT25T-2-R2.",
      ),
      simpson70Source(
        "https://images.thdstatic.com/catalog/pdfImages/e9/e94e6a40-f22a-4e2a-bdaf-885a266b6831.pdf",
        "Conflict-only evidence: retailer-linked F-F-DSV20 expressly expired December 31, 2022. Its broader framing language and old numeric tables are not current installation rules. Current project use must resolve the manufacturer-source scope conflict; this expired document is not purchase-count evidence.",
      ),
    ],
    discrepancies: [
      "Quik Guard is the reviewed branded coating; the Home Depot generic electrogalvanized field and Lowe’s ACQ field do not establish universal corrosion/treatment compatibility.",
      "Current manufacturer catalog scope is broader than the October2026 manufacturer retailer response directing framing users to SDWS; the linked 2020 flier expired in 2022. No automatic framing, connector, greenhouse or heated-sauna qualification is granted.",
      "Nominal 3 in and reported .330 in head diameter do not establish actual seated surface-to-tip depth, pilot, tolerances, shank/tip geometry, load or a complete installed solid.",
      "70 is the exact retail pack; approximate76-per-pound and1.1lb are not counts. Included T25 wording and BIT25T-2/BIT25T-2-R2 naming do not establish ownership, access or driver function.",
    ],
    capabilities: [],
  },
  {
    id: "grk-cabinet-114069",
    name: "GRK #8 × 1¼ in cabinet screws · 100",
    manufacturer: "GRK Fasteners",
    manufacturerPartNumber: "114069",
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: grkShortCabinetReviewed,
    purchaseSpec: {
      kind: "counted",
      count: 100,
      sourceRefs: [
        "https://www.grkfasteners.com/grk-products/finish/low-profile-cabinet-screw",
        "https://www.grkfasteners.com/getmedia/d4fe6346-bb1a-4160-9fbc-09cbfa6a65ea/GRK-Sellsheet2025-Cabinet.pdf?ext=.pdf",
      ],
    },
    profile: profile("fastener", null, 100, {
      fastenerLength: 1.25,
      finish: "Climatek family; delivered finish/exposure requires review",
      drive: "T15",
    }),
    offers: [
      hd("203556408", "114069", "205890"),
      lowes(
        "50303177",
        "GRK-8-x-1-1-4-in-Round-Washer-Head-Interior-Exterior-Wood-Screws-100-Count",
        "114069.0",
        "580213",
      ),
    ],
    sources: [
      grkShortCabinetSource(
        "https://www.grkfasteners.com/grk-products/finish/low-profile-cabinet-screw",
        "The current handy-pack table identifies 114069 as #8 × 1¼ in, T15, 100 screws. Distinct from 113079 2½ in/100, white 120680 1¼ in/80, 100069 1¼ in/330 and bulk 10069. Cabinet application text does not qualify an actual project joint or load.",
      ),
      grkShortCabinetSource(
        "https://www.grkfasteners.com/getmedia/fb0fbb28-29c0-477c-8349-2c2364caa94d/GRK-Cabinet-Customer-Drawing_1.pdf?ext=.pdf",
        "Nominal drawing dated 11/01/2023, sheet 1, 1¼ in row: L 1.25 in beneath the washer head, thread length 1.00 in, family head/shank .423/.114 in. No manufacturing tolerances. The malformed numeric drive column is not used; the manufacturer table identifies T15. These dimensions do not fill actual seating/pilot inputs or a physical mesh.",
      ),
      grkShortCabinetSource(
        "https://www.grkfasteners.com/getmedia/d4fe6346-bb1a-4160-9fbc-09cbfa6a65ea/GRK-Sellsheet2025-Cabinet.pdf?ext=.pdf",
        "Sell sheet 50137 / 11/25 repeats 114069/100 but lists family head/shank .393/.110 in, conflicting with .423/.114. Reference embedment rows start at .75 in with conditional material/configuration requirements; no shorter-path load or arbitrary plywood-edge/cabinet capacity is inferred. Predrilling marketing supplies no numeric pilot setting.",
      ),
      grkShortCabinetSource(
        "https://www.homedepot.com/p/GRK-Fasteners-8-x-1-1-4-in-Star-Drive-Low-Profile-Washer-Head-Drive-Style-Cabinet-Wood-Screw-100-Pack-114069/203556408",
        "Exact full product path loaded: model 114069 / SKU 205890, #8 × 1¼ in, 100 screws. Interior/exterior and finish fields differ from marketing text; confirm delivered coating and application. Manufacturer-branded Q&A does not assign cabinet screws structural approval values. No store price, stock or measured depth imported.",
      ),
      grkShortCabinetSource(
        "https://www.lowes.com/pd/GRK-8-x-1-1-4-in-Round-Washer-Head-Interior-Exterior-Wood-Screws-100-Count/50303177",
        "Exact model 114069.0 / item 580213, #8 × 1¼ in, 100-count and T15. Preserve the reviewed suffix; it is not a global matching rule. No selected-store price/availability, driver ownership or complete drilling/installation schedule imported.",
      ),
    ],
    discrepancies: [
      "Drawing head/shank diameters .423/.114 in differ from sell sheet .393/.110 in; exact delivered profile, seating and tolerances remain unresolved.",
      "Nominal under-washer 1¼ in length is not a user-entered member-surface-to-tip or pilot depth. A synthetic .547 in tip path does not satisfy or extrapolate the reference tables' first .75 in embedment row.",
      "Retailer finish/exposure descriptions and manufacturer marketing differ; no universal substrate, treated-wood, sauna, joint-capacity or installation qualification is selected.",
    ],
    roleQualifications: [],
    capabilities: [],
  },
  toolReference({
    id: "bosch-gcm12sd",
    name: "Bosch GCM12SD 12 in dual-bevel miter saw",
    manufacturer: "Bosch",
    manufacturerPartNumber: "GCM12SD",
    verifiedAt: boschMiterReviewed,
    offers: boschMiterOffers,
    sources: [
      {
        url: boschMiterProduct,
        verifiedAt: boschMiterReviewed,
        note: "Exact US GCM12SD reference with one saw, a 12 in 60-tooth blade and angle-specific stock capacities.",
      },
      {
        url: boschMiterManual,
        verifiedAt: boschMiterReviewed,
        note: "Manual 2610051827, saw operations section. Documents wood miter, bevel and compound crosscuts, setting combinations to avoid, and fixture clearance checks.",
      },
      ...boschMiterOffers.map((offer) => ({
        url: offer.url,
        verifiedAt: boschMiterReviewed,
        note: `Exact GCM12SD listing from ${offer.seller}, item ${offer.retailerItemNumber}. Price and store availability require separate evidence.`,
      })),
    ],
    toolCapabilityEvidence: [toolEvidence(
      ["wood-angle-crosscut"],
      "manufacturer-manual",
      [boschMiterManual],
      "Documented miter, bevel and compound crosscuts in suitable lumber. The review applies to the tool function. Each part still needs a verified setup.",
      [
        "Compare the actual blank, orientation and proposed settings to the manual's angle-specific stock capacities and combination limits.",
        "Confirm the actual blade, clamping, support, and guard/fence clearance for each cut.",
      ],
    )],
  }),
  {
    id: "johns-manville-u1330",
    name: "Johns Manville U1330 R-13 unfaced wall batt · 11-batt bag",
    manufacturer: "Johns Manville",
    manufacturerPartNumber: "U1330",
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: "2026-11-19T05:06:00.000Z",
    profile: profile("sheet", [15, 3.5, 93], 11, {
      materialFamily: "unfaced-fiberglass-wall-batt",
    }),
    offers: [
      hd("100317868", "U1330", "1001404749"),
      lowes("3013301", "Johns-Manville-R-13-Fiberglass-Batt-Insulation-with-Sound-Barrier-15-in-W-x-93-in-L", "U1330", "13988"),
    ],
    sources: [
      {
        url: "https://www.jm.com/content/dam/jm/global/en/building-insulation/Files/BI%20Toolbox/JM%20Fiberglass%20Manufacturers%20Fact%20Sheet.pdf",
        verifiedAt: "2026-11-19T05:06:00.000Z",
        note: "U1330 row identifies one 11-batt package of 15 × 93 × 3½ in unfaced R-13 batts.",
      },
      {
        url: "https://www.homedepot.com/p/100317868",
        verifiedAt: "2026-11-19T05:06:00.000Z",
        note: "Exact U1330 listing uses one bag as the sale unit. Bag dimensions are shipping dimensions.",
      },
      {
        url: "https://www.lowes.com/pd/Johns-Manville-R-13-Fiberglass-Batt-Insulation-with-Sound-Barrier-15-in-W-x-93-in-L/3013301",
        verifiedAt: "2026-11-19T05:06:00.000Z",
        note: "Exact U1330, item 13988, one 11-batt package.",
      },
      {
        url: "https://www.finnleo.com/hubfs/Finnleo%20Downloads/710-0101%20Custom%20Cut%20Instruction%2012-18-2018.pdf",
        verifiedAt: "2026-11-19T05:06:00.000Z",
        note: "Custom-cut installation manual section 10 gives a material-class reference for unfaced fiberglass in framed sauna walls.",
      },
    ],
    roleQualifications: [{
      role: "saunaInsulation",
      scope: "Conditional material-class match for planning 3½ in wall cavities only.",
      sourceRefs: [
        "https://www.jm.com/content/dam/jm/global/en/building-insulation/Files/BI%20Toolbox/JM%20Fiberglass%20Manufacturers%20Fact%20Sheet.pdf",
        "https://www.finnleo.com/hubfs/Finnleo%20Downloads/710-0101%20Custom%20Cut%20Instruction%2012-18-2018.pdf",
      ],
      requirements: [
        "Verify the chosen sauna system's full wall assembly and the delivered unfaced product. Review cavity fit, services, air/vapor control, finish and clearances separately.",
        "Use the product rating as a stock specification. Installed wall performance and ceiling insulation require separate review.",
      ],
    }],
    discrepancies: [],
    capabilities: [],
  },
  toolReference({
    id: "milwaukee-48-22-1921",
    name: "Milwaukee 48-22-1921 smooth insulation knife",
    manufacturer: "Milwaukee",
    manufacturerPartNumber: "48-22-1921",
    verifiedAt: "2026-11-19T05:09:00.000Z",
    offers: [hd("205935391", "48-22-1921", "1001411650")],
    sources: [
      {
        url: "https://www.milwaukeetool.com/products/details/smooth-blade-insulation-knife/48-22-1921",
        verifiedAt: "2026-11-19T05:09:00.000Z",
        note: "Exact smooth blade knife with a cover. The manufacturer describes insulation cutting applications.",
      },
      {
        url: "https://www.homedepot.com/p/205935391",
        verifiedAt: "2026-11-19T05:09:00.000Z",
        note: "Exact Home Depot listing, one knife. No store observation or price is included.",
      },
    ],
    toolCapabilityEvidence: [
      toolEvidence(
        ["cut-insulation"],
        "manufacturer-product-specification",
        ["https://www.milwaukeetool.com/products/details/smooth-blade-insulation-knife/48-22-1921"],
        "Hand knife for reviewing general insulation trim.",
        ["Verify the tool, thickness, work support and site setup with the insulation maker's instructions."],
      ),
    ],
  }),
  {
    id: "project-source-27587phllg",
    name: "Project Source white intermediate closet rod bracket",
    manufacturer: "Project Source (private label; OEM unverified)",
    manufacturerPartNumber: "27587PHLLG",
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: "2026-11-19T05:30:00.000Z",
    profile: profile("connector", null, 1, {
      materialFamily: "project-source-heavy-duty-1-5-16",
      finish: "White",
    }),
    offers: [
      lowes("50376150", "Project-Source-12-84-in-L-x-1-06-in-W-x-12-84-in-D-Heavy-Duty-White-Shelf-Bracket", "27587PHLLG", "670686"),
    ],
    sources: [{
      url: "https://www.lowes.com/pd/Project-Source-12-84-in-L-x-1-06-in-W-x-12-84-in-D-Heavy-Duty-White-Shelf-Bracket/50376150",
      verifiedAt: "2026-11-19T05:30:00.000Z",
      note: "Model 27587PHLLG, item 670686. One shelf-and-rod bracket with snap-in rod clip for 1-1/4 in and 1-5/16 in rods. Hardware is separate. Envelope fields do not establish the actual cradle center, hole geometry or installation method.",
    }],
    discrepancies: [
      "Verify bracket reach, backing, fasteners and current installation instructions for the delivered part. No project load rating.",
    ],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: steel6.productId,
    name: "HUUM STEEL 6 WiFi Glass heater package",
    manufacturer: "HUUM",
    manufacturerPartNumber: steel6.packageModel,
    category: "equipment",
    status: "reviewed-specs",
    verifiedAt: "2026-11-19T20:55:00.000Z",
    profile: profile("equipment", null, 1, { materialFamily: "huum-steel-floor-mounted-heater-package" }),
    offers: [{
      retailer: "lowes",
      retailerModel: steel6.packageModel,
      retailerItemNumber: steel6.retailerProductId,
      productId: steel6.retailerProductId,
      seller: "Bathing Brands (Lowe’s marketplace)",
      url: steel6.listing,
      listingStatus: "reference",
    }],
    sources: [
      {
        url: steel6.manual,
        verifiedAt: "2026-11-19T20:55:00.000Z",
        note: "U.S. manual H1006L03 v9, printed pages 4–6: STEEL 6 is floor-mounted. Use the current STEEL 6 body, air clearances and voltage-specific room-volume rows. The manual describes heater components, separately from marketplace package contents.",
      },
      {
        url: steel6.manufacturer,
        verifiedAt: "2026-11-19T20:55:00.000Z",
        note: "Manufacturer links the U.S. manual for STEEL. The installed load also includes the required stones. Exact SKU package contents, mounting substrate, electrical work and field fit still require confirmation.",
      },
      {
        url: steel6.listing,
        verifiedAt: "2026-11-19T20:55:00.000Z",
        note: "One listed heater package with WiFi Glass controls. Marketplace seller Bathing Brands. Generic quantity 12, 16/42/16 dimensions and bracket wording do not set the heater count, body dimensions or floor attachment contents. Stone quantity and fulfillment remain unverified.",
      },
    ],
    discrepancies: ["Confirm delivered regional nameplate, floor fasteners/brackets and full stone order with the seller."],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: harviaKit.productId,
    name: harviaKit.title,
    manufacturer: "ALEKO / Harvia",
    manufacturerPartNumber: harviaKit.packageModel,
    category: "equipment",
    status: "reviewed-specs",
    verifiedAt: harviaKit.verifiedAt,
    profile: profile("equipment", null, 1, { materialFamily: "aleko-harvia-kip-bundle" }),
    offers: [hd(harviaKit.retailerProductId, harviaKit.packageModel, harviaKit.retailerItemNumber)],
    sources: [
      {
        url: harviaKit.listing,
        verifiedAt: harviaKit.verifiedAt,
        note: "Model KITJH60-HD, Internet #324830605, store SKU #1009456454. The listing describes one 6 kW package with Xenio controls, Wi-Fi and sauna stones. The listed body dimensions are 16 × 24 × 11 in (W × H × D).",
      },
      {
        url: harviaKit.supplier,
        verifiedAt: harviaKit.verifiedAt,
        note: "ALEKO lists the corresponding base bundle MPN KITJH60 on its -AP page: 6 kW, 220–240 V and 170–300 ft³. These are screening specs for the bundle, not the delivered model’s installation instructions.",
      },
    ],
    discrepancies: [harviaKit.installationReview],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: accuride3732.productId,
    name: accuride3732.name,
    manufacturer: "Accuride",
    manufacturerPartNumber: accuride3732.orderModel,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: "2026-11-19T21:20:00.000Z",
    purchaseSpec: {
      kind: "counted",
      count: 2,
      sourceRefs: [accuride3732.homeDepot, accuride3732.lowes],
    },
    profile: profile("connector", null, 2, {
      materialFamily: "accuride-3732-side-mount-pair",
      finish: "Zinc",
    }),
    offers: [
      {
        retailer: "home-depot",
        retailerModel: accuride3732.orderModel,
        retailerItemNumber: "1000783470",
        productId: "202214919",
        seller: "The Home Depot",
        url: accuride3732.homeDepot,
        listingStatus: "reference",
      },
      {
        retailer: "lowes",
        retailerModel: accuride3732.orderModel,
        retailerItemNumber: "1313977",
        productId: "1000770534",
        seller: "Lowe's",
        url: accuride3732.lowes,
        listingStatus: "reference",
      },
    ],
    sources: [
      {
        url: accuride3732.homeDepot,
        verifiedAt: "2026-11-19T21:20:00.000Z",
        note: "The listing identifies T46322G22 and one left/right pair for a frameless installation. Store SKU 1000783470. No observed store inventory or price.",
      },
      {
        url: accuride3732.lowes,
        verifiedAt: "2026-11-19T21:20:00.000Z",
        note: "Item 1313977 lists model T46322G22 as one pair, reports 550 mm closed length and includes screws of unspecified count/size. The older Lowe's listing 3076573 is retired.",
      },
      {
        url: accuride3732.manual,
        verifiedAt: "2026-11-19T21:20:00.000Z",
        note: "3732-22 manufacturer row documents 21.65 in closed length and 22 in travel. The side gap specification is 0.500 to 0.531 in per side and the profile height is 1.46 in.",
      },
      {
        url: accuride3732.manufacturerCatalog,
        verifiedAt: "2026-11-19T21:20:00.000Z",
        note: "3732 side-mount family lists a maximum 16 in drawer width. The reference fit covers square frameless cabinet geometry. Confirm the delivered 3732-22 marking and instructions for the retail pair.",
      },
    ],
    discrepancies: [
      "Advertised load figures differ by retailer and manufacturer tests use specific assemblies. No project load or fastener schedule is inferred.",
    ],
    roleQualifications: [],
    capabilities: [],
  },
  ...otherAccurideSlides.map((slide) => ({
    id: slide.productId,
    name: slide.name,
    manufacturer: "Accuride",
    manufacturerPartNumber: slide.orderModel,
    category: "connector" as const,
    status: "reviewed-specs" as const,
    verifiedAt: slide.reviewedAt,
    purchaseSpec: { kind: "counted" as const, count: 2, sourceRefs: [slide.homeDepot] },
    profile: profile("connector", null, 2, {
      materialFamily: "accuride-3732-side-mount-pair",
      finish: "Zinc",
    }),
    offers: [hd(slide.homeDepotId, slide.orderModel)],
    sources: [
      {
        url: slide.homeDepot,
        verifiedAt: slide.reviewedAt,
        note: `Internet #${slide.homeDepotId}, model ${slide.orderModel}, one left/right pair for frameless side mounting. Use a store snapshot for price and quantity.`,
      },
      {
        url: slide.assembly,
        verifiedAt: slide.reviewedAt,
        note: "The linked Accuride installation sheet identifies the 3732 family with size-specific dimensions and conventional or 32 mm mounting instructions.",
      },
      {
        url: slide.manual,
        verifiedAt: slide.reviewedAt,
        note: `The ${slide.technicalModel} row lists ${slide.closedLength} in closed length and ${slide.travel} in travel. Side space is 0.500 to 0.531 in per side and the rail height is 1.46 in.`,
      },
      {
        url: slide.manufacturerCatalog,
        verifiedAt: slide.reviewedAt,
        note: "The 3732 family page lists drawers up to 16 in wide. Confirm the delivered slide marking, mounting hardware and instructions.",
      },
    ],
    discrepancies: [
      "Retail load figures differ from the manufacturer's tested assembly. Drawer fit uses the technical dimensions and leaves load and mounting verification for the actual cabinet.",
    ],
    roleQualifications: [],
    capabilities: [],
  })),
  {
    id: drawerRailScrew.id,
    name: drawerRailScrew.name,
    manufacturer: "Everbilt",
    manufacturerPartNumber: drawerRailScrew.model,
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: drawerRailScrew.reviewedAt,
    purchaseSpec: { kind: "counted", count: drawerRailScrew.count, sourceRefs: [drawerRailScrew.url] },
    profile: profile("fastener", null, drawerRailScrew.count, {
      fastenerLength: drawerRailScrew.nominalLength,
      finish: "Zinc plated",
      drive: "Phillips",
    }),
    offers: [hd(drawerRailScrew.internetNumber, drawerRailScrew.model, drawerRailScrew.storeSku)],
    sources: [
      {
        url: drawerRailScrew.url,
        verifiedAt: drawerRailScrew.reviewedAt,
        note: "Exact #8 × ½ in Phillips pan-head sheet-metal screw, 100 screws. The listing includes wood among the substrates. Consult a store snapshot for location, price and stock.",
      },
      {
        url: accuride3732.manual,
        verifiedAt: drawerRailScrew.reviewedAt,
        note: "The 3732 hardware drawing lists the #8 pan-head screw form. The guide calls for final round-hole fasteners. Confirm the actual slot, fastener seating, engagement in the installed panels and running clearance for this SKU.",
      },
    ],
    discrepancies: [],
    roleQualifications: [],
    capabilities: [],
  },
  ...Object.entries(greenhouseDoorKits).map(([id, kit]) => ({
    id,
    name: kit.label,
    manufacturer: kit.brand,
    manufacturerPartNumber: kit.model,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: "2026-11-19T21:32:00.000Z",
    profile: profile("connector", null, 1, { materialFamily: id, finish: "Black" }),
    offers: [{
      retailer: kit.retailer,
      retailerModel: kit.model,
      retailerItemNumber: kit.storeSku,
      productId: kit.retailerId,
      seller: kit.seller,
      url: kit.listing,
      listingStatus: "reference",
    }],
    sources: [
      { url: kit.listing, verifiedAt: "2026-11-19T21:32:00.000Z", note: "Reviewed kit identity and sell pack. No store-specific price or inventory is inferred." },
      { url: kit.instructions, verifiedAt: "2026-11-19T21:32:00.000Z", note: "Manufacturer instructions or nominal component drawing for this kit. Confirm the delivered fasteners and mount and measure the installed axis." },
      ...(kit.manufacturer ? [{ url: kit.manufacturer, verifiedAt: "2026-11-19T21:32:00.000Z", note: "Manufacturer identifies two hinges, latch with strike and mounting fasteners in one sell pack." }] : []),
    ],
    discrepancies: ["Verify the current kit contents, fastener seating, mount and load requirements. The listed hardware rating does not qualify the greenhouse door or its wind loads."],
    roleQualifications: [],
    capabilities: [],
  })),
  {
    id: cedarbrookLining.productId,
    name: "Cedarbrook 6 ft tongue-and-groove cedar · six-board bundle",
    manufacturer: cedarbrookLining.seller,
    manufacturerPartNumber: cedarbrookLining.productCode,
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: cedarbrookLining.reviewedAt,
    profile: profile(
      "linear",
      [cedarbrookLining.thickness, cedarbrookLining.fullWidth, cedarbrookLining.length],
      cedarbrookLining.packCount,
      { wood: true, finish: "Raw, untreated clear cedar" },
    ),
    purchaseSpec: {
      kind: "counted",
      count: cedarbrookLining.packCount,
      sourceRefs: [cedarbrookLining.url],
    },
    offers: [],
    supplier: {
      seller: cedarbrookLining.seller,
      productCode: cedarbrookLining.productCode,
      url: cedarbrookLining.url,
    },
    sources: [{
      url: cedarbrookLining.url,
      verifiedAt: cedarbrookLining.reviewedAt,
      note: "Exact 6-1X4-TNG listing for sauna walls and ceilings. Six 72 in boards per bundle, 3⅜ in full width, 3 in installed reveal, 11/16 in thick. The listed 9 sq ft uses installed coverage before cuts.",
    }],
    roleQualifications: [{
      role: "saunaInterior",
      scope: "Raw, untreated cedar lining for sauna walls and ceilings.",
      sourceRefs: [cedarbrookLining.url],
      requirements: [
        "Confirm delivered stock and field layout. Resolve corner details, expansion gaps, backing at joints, fastening and the complete moisture and heat assembly.",
      ],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  {
    id: cedarbrookDoor.productId,
    name: `${cedarbrookDoor.label} · 24 × 76 in rough opening`,
    manufacturer: cedarbrookDoor.seller,
    manufacturerPartNumber: cedarbrookDoor.productCode,
    category: "equipment",
    status: "reviewed-specs",
    verifiedAt: cedarbrookDoor.reviewedAt,
    profile: profile(
      "equipment",
      [cedarbrookDoor.leafWidth, cedarbrookDoor.leafHeight, cedarbrookDoor.leafDepth],
      1,
    ),
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [cedarbrookDoor.url] },
    offers: [],
    supplier: {
      seller: cedarbrookDoor.seller,
      productCode: cedarbrookDoor.productCode,
      url: cedarbrookDoor.url,
    },
    sources: [{
      url: cedarbrookDoor.url,
      verifiedAt: cedarbrookDoor.reviewedAt,
      note: "Prehung insulated cedar-clad door SKU CLAD-24X76-NW. The 22 × 74½ × 2⅝ in leaf fits the listed 24 × 76 in rough opening. No window or threshold. Includes one self-closing hinge, two standard hinges and one handle. The finished wall thickness sets the order’s jamb width.",
    }],
    roleQualifications: [{
      role: "saunaDoor",
      scope: "Prehung sauna door ordered with an outward swing. Selecting it sets the study’s rough opening to 24 × 76 in.",
      sourceRefs: [cedarbrookDoor.url],
      requirements: [
        "Specify the jamb using the measured finished wall and verify the actual leaf position, mounted hinge axes, handle, trim and release from inside with the supplier.",
      ],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  ...cedarbrookBenches.map((bench) => ({
    id: bench.productId,
    name: `Cedarbrook ${bench.length / 12} ft freestanding pedestal sauna bench`,
    manufacturer: "Cedarbrook",
    manufacturerPartNumber: bench.productCode,
    category: "equipment",
    status: "reviewed-specs",
    verifiedAt: cedarbrookBenchReviewedAt,
    profile: profile("equipment", [bench.length, cedarbrookBenchSize.height, cedarbrookBenchSize.depth], 1, {
      finish: "Western red cedar, verify delivered surface",
    }),
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [bench.url] },
    offers: [],
    supplier: { seller: "Cedarbrook", productCode: bench.productCode, url: bench.url },
    sources: [
      {
        url: bench.url,
        verifiedAt: cedarbrookBenchReviewedAt,
        note: `Exact ${bench.productCode} listing for sauna use. Assembled extent ${bench.length} in long × 18 in deep × 18 in high. Prebuilt top and leg sections. Shipping dimensions are separate.`,
      },
      {
        url: cedarbrookBenchInstructions,
        verifiedAt: cedarbrookBenchReviewedAt,
        note: "Manufacturer's pedestal assembly uses prebuilt legs, angle supports and a cross-brace. Published instructions do not specify verified as-built support dimensions or load.",
      },
    ],
    roleQualifications: [{
      role: "saunaBench",
      scope: "Freestanding lower cedar seat for sauna layout, with prebuilt top and legs.",
      sourceRefs: [bench.url, cedarbrookBenchInstructions],
      requirements: ["Match the delivered kit and assembly instructions. Verify floor, clearance, support, intended use and capacity before use."],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  })),
  {
    id: cedarbrookFoil.productId,
    name: "Cedarbrook 54 in sauna foil vapor barrier",
    manufacturer: "Cedarbrook",
    manufacturerPartNumber: cedarbrookFoil.productCode,
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: cedarbrookFoil.reviewedAt,
    profile: profile("roll", null, null, {
      dimensionMeaning: "roll-width-only",
      rollWidth: cedarbrookFoil.rollWidth,
    }),
    offers: [],
    supplier: { seller: "Cedarbrook", productCode: cedarbrookFoil.productCode, url: cedarbrookFoil.url },
    sources: [
      {
        url: cedarbrookFoil.url,
        verifiedAt: cedarbrookFoil.reviewedAt,
        note: "Exact FOIL-VAPOR. The supplied roll is 54 in wide, while the room calculator uses a separate 48 in pricing basis. Length depends on the order. No fixed pack length or foil gauge is documented.",
      },
      {
        url: cedarbrookFoil.instructions,
        verifiedAt: cedarbrookFoil.reviewedAt,
        note: "Manufacturer describes ceiling first, walls afterward, with a 3 in ceiling turn-down at the wall junction. It does not show floor foil.",
      },
    ],
    roleQualifications: [{
      role: "saunaVaporBarrier",
      scope: "Sauna foil for the wall and ceiling vapor layer.",
      sourceRefs: [cedarbrookFoil.url, cedarbrookFoil.instructions],
      requirements: ["Confirm the requested roll length, measured substrate, seam support, floor and opening terminations, and treatment of penetrations with the chosen room system."],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  {
    id: saunaCeilingBatt.productId,
    name: "Owens Corning C84A R-30 unfaced batt · 10-batt bag",
    manufacturer: "Owens Corning",
    manufacturerPartNumber: saunaCeilingBatt.model,
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: saunaCeilingReviewedAt,
    profile: profile("sheet", [saunaCeilingBatt.width, saunaCeilingBatt.thickness, saunaCeilingBatt.length], saunaCeilingBatt.packCount, {
      materialFamily: "unfaced-fiberglass-ceiling-batt",
    }),
    offers: [
      hd(saunaCeilingBatt.homeDepotId, saunaCeilingBatt.model, saunaCeilingBatt.homeDepotSku),
      lowes(saunaCeilingBatt.lowesId, saunaCeilingBatt.lowesPath, saunaCeilingBatt.model, saunaCeilingBatt.lowesItem),
    ],
    sources: [
      {
        url: saunaCeilingBatt.spec,
        verifiedAt: saunaCeilingReviewedAt,
        note: "May 2026 sheet 10025109-B lists 16 × 48 × 9½ in unfaced R-30 batts, ten per bag, covering 53.33 sq ft. Older editions give a different thickness; use the current sheet and verify the delivered package.",
      },
      {
        url: `https://www.homedepot.com/p/${saunaCeilingBatt.homeDepotId}`,
        verifiedAt: saunaCeilingReviewedAt,
        note: "C84A, SKU 1000204119, 16 × 48 × 9½ in per batt, sold as one 53.33 sq ft bag.",
      },
      {
        url: `https://www.lowes.com/pd/${saunaCeilingBatt.lowesPath}/${saunaCeilingBatt.lowesId}`,
        verifiedAt: saunaCeilingReviewedAt,
        note: "C84A, item 131584, 16 × 48 × 9½ in. Individual sale unit contains ten batts.",
      },
      {
        url: saunaCeilingBatt.saunaContext,
        verifiedAt: saunaCeilingReviewedAt,
        note: "Cedarbrook home sauna guidance describes R-26 or greater at the ceiling and a sauna foil layer. This is manufacturer context for the assembly, independent of the Owens Corning product rating.",
      },
    ],
    roleQualifications: [{
      role: "saunaCeilingInsulation",
      scope: "Unfaced fiberglass for a dimensional sauna ceiling cavity study.",
      sourceRefs: [saunaCeilingBatt.spec, saunaCeilingBatt.saunaContext],
      requirements: [
        "Verify the delivered batt thickness and chosen system's ceiling assembly. Fit without thickness compression. Confirm support, layer order, penetrations, and equipment clearances.",
      ],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  ...saunaCeilingJoists.map((joist) => {
    const offer = joist.retailer === "home-depot"
      ? { ...hd(joist.listing, joist.model, joist.item), url: `https://www.homedepot.com/p/${joist.path}/${joist.listing}` }
      : lowes(joist.listing, joist.path, joist.model, joist.item);
    return {
      id: joist.productId,
      name: joist.name,
      manufacturer: "Regional mill/OEM identity not established",
      manufacturerPartNumber: null,
      identityBasis: "retailer-specification" as const,
      category: "lumber" as const,
      status: "reviewed-specs" as const,
      verifiedAt: saunaCeilingReviewedAt,
      profile: profile("linear", [...saunaCeilingJoistSize], 1, {
        wood: true,
        materialFamily: joist.productId,
        finish: joist.specification,
      }),
      offers: [offer],
      sources: [{
        url: offer.url,
        verifiedAt: saunaCeilingReviewedAt,
        note: `Model ${joist.model}, item ${joist.item}. Actual 1½ × 11¼ × 96 in, one board. ${joist.specification}`,
      }],
      roleQualifications: [{
        role: "saunaCeilingJoists" as const,
        scope: "Dimensional reference for ceiling framing and cavity fit.",
        sourceRefs: [offer.url],
        requirements: ["Verify actual stock, spans, loads, bearings and connections before choosing an installed ceiling assembly."],
      }],
      limitToQualifiedRoles: true as const,
      discrepancies: [],
      capabilities: [],
    };
  }),
  {
    id: "home-depot-kd-ht-2x4x96-338861827",
    name: "Home Depot #2 KD-HT framing stud · actual 1½ × 3½ × 96 in",
    manufacturer: "Regional mill/OEM identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: "2026-11-20T01:17:13.000Z",
    profile: profile("linear", [1.5, 96, 3.5], 1, {
      wood: true,
      materialFamily: "home-depot-kd-ht-2x4x96-338861827",
      finish:
        "#2 as listed; kiln-dried and heat-treated; regionally variable species",
    }),
    offers: [hd("338861827", "769887254790", "161640")],
    sources: [
      {
        url: "https://www.homedepot.com/p/338861827",
        verifiedAt: "2026-11-20T01:17:13.000Z",
        note: "Single full-length 96 in stud listing, with actual 1.5 × 3.5 × 96 in dimensions. Model 769887254790 and store SKU 161640. The page says species and product can vary by region and store. Confirm the delivered grade stamp, species and treatment; this listing establishes neither store stock nor design suitability.",
      },
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: "home-depot-spf-2x6x96-100083274",
    name: "Home Depot premium SPF dimensional lumber · actual 1½ × 5½ × 96 in",
    manufacturer: "Regional mill/OEM identity not established",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: "2026-11-20T01:17:13.000Z",
    profile: profile("linear", [1.5, 96, 5.5], 1, {
      wood: true,
      materialFamily: "home-depot-spf-2x6x96-100083274",
      finish:
        "Untreated dimensional lumber; premium SPF as listed; regionally variable species",
    }),
    offers: [hd("100083274", "161713", "161713")],
    sources: [
      {
        url: "https://www.homedepot.com/p/100083274",
        verifiedAt: "2026-11-20T01:17:13.000Z",
        note: "Single untreated board listing, with actual 1.5 × 5.5 × 96 in dimensions. Model and store SKU 161713. The page says species and product can vary by region and store. Confirm actual grade, species and treatment. A dimension match does not verify application, span, weather exposure or store availability.",
      },
    ],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: everbiltClosetRod.productId,
    name: "Everbilt 96 in white heavy-duty closet rod · one rod",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: everbiltClosetRod.model,
    category: "rod",
    status: "reviewed-specs",
    verifiedAt: "2026-11-20T01:24:41.000Z",
    profile: profile("linear", [...everbiltClosetRod.stockSize], 1, {
      materialFamily: "everbilt-heavy-duty-1-5-16",
      finish: "White powder-coated steel",
    }),
    offers: [hd("334188606", everbiltClosetRod.model, "866134")],
    sources: [{
      url: everbiltClosetRod.listing,
      verifiedAt: "2026-11-20T01:24:41.000Z",
      note: "Model EH-WSTHDUS-320V. One 96-inch steel rod with a listed 1.31-inch outside diameter and a cut-to-fit description. The listing describes tubular steel and thick walls. Internal geometry and exact wall gauge are unknown, so the model uses only the listed outer envelope.",
    }],
    roleQualifications: [{
      role: "closetRod",
      scope: "Hanging-clothes rod envelope. One 96-inch stock unit; measure before cutting.",
      sourceRefs: [everbiltClosetRod.listing],
      requirements: ["Dry-fit the delivered rod and sockets, measure both setbacks and insertion clearance, and confirm intermediate support, backing, fasteners and hanging load for your installation."],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  toolReference({
    id: "dewalt-dpg82-11c",
    name: "DEWALT DPG82-11C Concealer clear safety goggles",
    manufacturer: "Radians / DEWALT",
    manufacturerPartNumber: "DPG82-11C",
    verifiedAt: eyeProtectionReviewed,
    offers: [hd("202220499", "DPG82-11C", "1000802966")],
    sources: [
      {
        url: concealerFamily,
        verifiedAt: eyeProtectionReviewed,
        note: "Radians documents impact protection for the DPG82 family, a clear polycarbonate option, a rubber seal, and ventilation. The general model page does not establish splash or fine-dust ratings for this retail SKU.",
      },
      {
        url: concealerCatalog,
        verifiedAt: eyeProtectionReviewed,
        note: "Radians identifies the exact DPG82-11C retail clamshell with clear anti-fog lens. Other DPG82 suffixes and other goggles are distinct products.",
      },
      {
        url: "https://www.homedepot.com/p/202220499",
        verifiedAt: eyeProtectionReviewed,
        note: "Home Depot Internet #202220499, model DPG82-11C, store SKU 1000802966. One clear goggle per retail package. The listing describes the lens as meeting ANSI Z87.1+ impact requirements; verify delivered markings.",
      },
    ],
    toolCapabilityEvidence: [
      {
        capabilities: ["ppe-eye"],
        evidenceType: "manufacturer-product-specification",
        sourceRefs: [concealerFamily, concealerCatalog],
        scope:
          "A documented impact eye-protection option. Review the actual operation, hazards and fit before use.",
        requirements: [
          "Verify the delivered goggles' impact markings, visibility, fit, and compatibility with any other required protection.",
          "Review splash, fine-dust, face and respiratory protection separately when the operation calls for them.",
        ],
      },
    ],
  }),
  {
    id: cedarDoorStop.productId,
    name: "Select tight-knot kiln-dried cedar 1 × 2 · Home Depot",
    manufacturer: "Unbranded retailer listing",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: cedarDoorStop.reviewedAt,
    profile: profile("linear", [...cedarDoorStop.size], 1, {
      wood: true,
      materialFamily: cedarDoorStop.productId,
      finish: "Kiln-dried cedar · unfinished as listed",
    }),
    offers: [hd(cedarDoorStop.internetNumber, cedarDoorStop.model, cedarDoorStop.storeSku)],
    sources: [{
      url: cedarDoorStop.listing,
      verifiedAt: cedarDoorStop.reviewedAt,
      note: "Home Depot Internet #206460933, model C BP102K08, store SKU 161895. The listing specifies one board per pack with actual dimensions ¾ × 1½ × 96 in and identifies the wood as cedar. Mill identity and structural grade are unspecified.",
    }],
    roleQualifications: [],
    discrepancies: [],
    capabilities: [],
  },
  {
    id: timber.productId,
    name: "#2 MCA-treated SYP 4 × 4 · Home Depot",
    manufacturer: "Unbranded retailer listing",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: timber.reviewedAt,
    profile: profile("linear", [...timber.size], 1, {
      wood: true,
      materialFamily: timber.productId,
      finish: "#2 Southern Yellow Pine · ground-contact MCA pressure treatment as listed",
    }),
    offers: [hd(timber.internetNumber, timber.model, timber.storeSku)],
    sources: [
      { url: timber.listing, verifiedAt: timber.reviewedAt, note: "Home Depot lists model 194354 as a single #2 MCA-treated Southern Yellow Pine member, actual 3½ × 3½ × 96 in. Check the end tag of delivered stock. Store SKU 256276 can appear on other listings." },
      { url: timber.specification, verifiedAt: timber.reviewedAt, note: "Retailer-linked ProWood guide explains MCA use categories, end tags, fastener compatibility and safe handling. Its example tags do not establish the delivered treatment retention." },
    ],
    roleQualifications: [{
      role: "greenhouseBase",
      sourceRefs: [timber.listing, timber.specification],
      scope: "Actual stock dimensions for exterior greenhouse perimeter rails. The listing identifies ground-contact treatment.",
      requirements: [
        "Verify the delivered end tag and choose anchors, bearing and compatible corrosion-resistant hardware for the site. Review cut-end treatment and keep this stock away from food contact.",
        "Review the foundation and load path independently of the modeled timber outline.",
      ],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  {
    id: timber12.productId,
    name: "12 ft cedar-tone ground-contact 4 × 4 · Home Depot",
    manufacturer: "Unbranded retailer listing",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "lumber",
    status: "reviewed-specs",
    verifiedAt: timber12.reviewedAt,
    profile: profile("linear", [...timber12.size], 1, {
      wood: true,
      materialFamily: timber12.productId,
      finish: "#2 Southern Yellow Pine · cedar-tone ground-contact MCA as listed",
    }),
    offers: [hd(timber12.internetNumber, timber12.model, timber12.storeSku)],
    sources: [{
      url: timber12.listing,
      verifiedAt: timber12.reviewedAt,
      note: "Retailer net dimensions are 3½ × 3½ × 144 in. The listing describes cedar-tone ground-contact Southern Yellow Pine. The supplier identifies MCA in the product questions. The single length-specific retail configuration is modeled as one timber. The model number alone also identifies other lengths, so match the exact Internet number.",
    }],
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [timber12.listing] },
    roleQualifications: [{
      role: "greenhouseBase",
      scope: "Listed dimensions for an exterior greenhouse perimeter rail.",
      sourceRefs: [timber12.listing],
      requirements: [
        "Check the delivered ground-contact end tag, actual dimensions, treatment of cut ends and hardware compatibility.",
        "Review site bearing and anchorage independently. Keep treated stock away from food contact.",
      ],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  {
    id: everbiltShelfPin.productId,
    name: shelfPinProducts[everbiltShelfPin.productId].name,
    manufacturer: "Everbilt",
    manufacturerPartNumber: shelfPinProducts[everbiltShelfPin.productId].model,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: everbiltShelfPin.reviewedAt,
    profile: profile("connector", null, shelfPinProducts[everbiltShelfPin.productId].packCount, {
      materialFamily: "everbilt-5mm-steel-shelf-support-spoon",
    }),
    offers: [
      hd(everbiltShelfPin.internetNumber, shelfPinProducts[everbiltShelfPin.productId].model, everbiltShelfPin.storeSku),
    ],
    sources: [{
      url: everbiltShelfPin.url,
      verifiedAt: everbiltShelfPin.reviewedAt,
      note: "Exact Model 802404 and Store SKU 608518. The listing specifies steel spoon supports, a nominal 5 mm hole and 48 pins per sell pack.",
    }],
    discrepancies: [
      "The listing title and detail disagree on the plating. Insertion depth, bearing reach and bearing height are unverified; overall dimensions do not establish these values. Confirm the delivered hardware and a same-stock test bore before using a drilling schedule. The listing load field does not rate a shelf assembly.",
    ],
    capabilities: [],
  },
  {
    id: wallBatt.productId,
    name: "Owens Corning ME22 R-15 unfaced wall batt · 8-batt bag",
    manufacturer: "Owens Corning",
    manufacturerPartNumber: wallBatt.model,
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: wallBatt.reviewedAt,
    profile: profile("sheet", [...wallBatt.size], wallBatt.packCount, {
      materialFamily: "unfaced-fiberglass-wall-batt",
    }),
    offers: [hd(wallBatt.homeDepotId, wallBatt.model, wallBatt.homeDepotSku)],
    sources: [
      {
        url: wallBatt.listing,
        verifiedAt: wallBatt.reviewedAt,
        note: "Exact ME22 single-bag offer. Owens Corning confirms 8 batts per bag and 77.5 sq ft of nominal coverage in the product Q&A.",
      },
      {
        url: wallBatt.specification,
        verifiedAt: wallBatt.reviewedAt,
        note: "Owens Corning lists a 15 × 93 × 3½ in R-15 batt for wood framing. Product thickness should match cavity depth.",
      },
      {
        url: wallBatt.saunaContext,
        verifiedAt: wallBatt.reviewedAt,
        note: "Finnleo custom-cut manual section 10 documents unfaced fiberglass as a wall-insulation material class for that system.",
      },
    ],
    roleQualifications: [{
      role: "saunaInsulation",
      scope: "Dimensional stock for a 3½ in sauna wall cavity study.",
      sourceRefs: [wallBatt.listing, wallBatt.specification, wallBatt.saunaContext],
      requirements: [
        "Verify the delivered unfaced batt and confirm the complete wall assembly, services, vapor control, finish and clearances with the chosen sauna system.",
        "Use R-15 as the stock rating. Review whole-wall performance and ceiling insulation separately.",
      ],
    }],
    limitToQualifiedRoles: true,
    discrepancies: [],
    capabilities: [],
  },
  {
    id: everbiltRodBracket.productId,
    name: "Everbilt 14317 white shelf and closet rod bracket",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: everbiltRodBracket.model,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: everbiltRodBracket.reviewedAt,
    profile: profile("connector", null, 1, {
      materialFamily: "everbilt-14317-shelf-and-rod-bracket",
      finish: "White steel",
    }),
    offers: [hd(everbiltRodBracket.internetNumber, everbiltRodBracket.model, everbiltRodBracket.storeSku)],
    sources: [{
      url: everbiltRodBracket.listing,
      verifiedAt: everbiltRodBracket.reviewedAt,
      note: "The Home Depot listing identifies one steel bracket and separately purchased screws. The supplier Q&A lists the 1-5/16 in rod size. Confirm delivered fit with the 320V rod before mounting.",
    }, {
      url: everbiltClosetRod.listing,
      verifiedAt: everbiltRodBracket.reviewedAt,
      note: "The exact 320V listing gives a nominal 1.31 in outside diameter. The two listings establish a candidate diameter match for a physical dry fit.",
    }],
    roleQualifications: [{
      role: "closetRodSupport",
      scope: "Candidate intermediate support for the nominal 1-5/16 in Everbilt rod.",
      sourceRefs: [everbiltRodBracket.listing, everbiltClosetRod.listing],
      requirements: [everbiltRodBracket.scope],
    }],
    discrepancies: [
      "Published overall dimensions and seller Q&A do not establish the installed wall-to-seat dimension, hole pattern, clearance, spacing or assembly capacity. Use field measurements for the actual bracket.",
    ],
    capabilities: [],
  },
  {
    id: springLidStay.productId,
    name: "Sugatsune S-AT02W spring-assist lid stay",
    manufacturer: "Sugatsune",
    manufacturerPartNumber: springLidStay.model,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: springLidStay.reviewedAt,
    profile: profile("connector", null, 1, { materialFamily: springLidStay.productId }),
    offers: [],
    supplier: { seller: springLidStay.seller, productCode: springLidStay.model, url: springLidStay.listing },
    sources: [
      { url: springLidStay.listing, verifiedAt: springLidStay.reviewedAt, note: "Exact S-AT02W sold as each. Spring lift assist. Installation fasteners are separate." },
      { url: springLidStay.catalog, verifiedAt: springLidStay.reviewedAt, note: "Page 131 separates side and back mounting. The retail min/max fields combine the outer limits of the two mounting options." },
      { url: springLidStay.manual, verifiedAt: springLidStay.reviewedAt, note: "Manual for side or back installation with an 80° drawing. Use its separate 17.6–21 N·m and 15–16.5 N·m lid torque ranges and hinge constraints." },
    ],
    roleQualifications: [{
      role: "storageLidSupport",
      scope: "Manufacturer torque comparison for one S-AT02W at its documented mounting position.",
      sourceRefs: [springLidStay.manual, springLidStay.catalog],
      requirements: ["Check hinge type and center, delivered mechanism and mounting geometry through the full 80° travel. Review mounting, fasteners, hold-open behavior and pinch points on the actual assembly."],
    }],
    discrepancies: [
      "U.S. listing gives an aggregate minimum and maximum. Yardwork uses the installation manual’s mounting-specific limits in N·m.",
    ],
    capabilities: [],
  },
  {
    id: everbiltLidSupport.productId,
    name: "Everbilt 28987 satin-brass lid support kit",
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: everbiltLidSupport.model,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: everbiltLidSupport.reviewedAt,
    profile: profile("connector", null, 1, { materialFamily: everbiltLidSupport.productId }),
    offers: [hd(everbiltLidSupport.internetNumber, everbiltLidSupport.model, everbiltLidSupport.storeSku)],
    sources: [
      { url: everbiltLidSupport.listing, verifiedAt: everbiltLidSupport.reviewedAt, note: "Exact model and sell unit. The summary describes a pair and the product details describe a right-hand support and recommend a left-hand counterpart." },
      { url: everbiltLidSupport.manual, verifiedAt: everbiltLidSupport.reviewedAt, note: "Retailer-linked drawing identifies the separately sold right-hand 19844. Its 90° illustration does not establish the contents or torque range of kit 28987." },
    ],
    discrepancies: [everbiltLidSupport.scope],
    capabilities: [],
  },
  {
    id: dewaltJigsaw.productId,
    name: dewaltJigsaw.name,
    manufacturer: "DEWALT",
    manufacturerPartNumber: dewaltJigsaw.model,
    category: "tool",
    status: "reviewed-specs",
    verifiedAt: dewaltJigsaw.reviewedAt,
    profile: profile("tool", null, 1),
    offers: [hd(dewaltJigsaw.internetNumber, dewaltJigsaw.model, dewaltJigsaw.storeSku)],
    sources: [
      { url: dewaltJigsaw.listing, verifiedAt: dewaltJigsaw.reviewedAt, note: "Exact tool-only Internet number and store SKU. Requires a separate battery and charger." },
      { url: dewaltJigsaw.manufacturer, verifiedAt: dewaltJigsaw.reviewedAt, note: "Manufacturer lists the jigsaw and one blade in the bare-tool package." },
      { url: dewaltJigsaw.manual, verifiedAt: dewaltJigsaw.reviewedAt, note: "Type 1 manual documents T-shank compatibility and internal wood cutting. Check the delivered tool type." },
    ],
    discrepancies: [
      "Retailer title, model and specifications identify a jigsaw. Some promotional copy names other saw types. Use manufacturer documentation for the function and package.",
    ],
    capabilities: ["wood-pocket-cut"],
    toolCapabilityEvidence: [{
      evidenceType: "manufacturer-manual",
      capabilities: ["wood-pocket-cut"],
      sourceRefs: [dewaltJigsaw.manual],
      scope: "Internal cut function in wood as documented for the applicable DCS334 Type 1 saw.",
      requirements: ["Choose a blade for the actual curve and depth. Review supported stock, access, holding and the delivered instructions."],
    }],
  },
  ...Object.entries(foldingLidStays).map(([id, source]) => ({
    id,
    name: `Everbilt ${source.model} ${source.hand.toLowerCase()} folding lid stay`,
    manufacturer: "Everbilt (private label; OEM unverified)",
    manufacturerPartNumber: source.model,
    category: "connector" as const,
    status: "reviewed-specs" as const,
    verifiedAt: source.reviewedAt,
    profile: profile("connector", null, 1, { materialFamily: id, finish: "Bright brass plated steel" }),
    offers: [hd(source.internetNumber, source.model, source.storeSku)],
    sources: [
      { url: source.listing, verifiedAt: source.reviewedAt, note: "Exact handed model, one stay per listed package. Fasteners included; confirmed pack count does not establish screw dimensions." },
      { url: source.manual, verifiedAt: source.reviewedAt, note: "Exact model drawing illustrates a 90° setup. No measured pivot-to-pivot arm lengths or lid torque rating are supplied by this record." },
    ],
    roleQualifications: [{
      role: "storageLidSupport" as const,
      scope: "One handed folding support for a dimensioned fit review.",
      sourceRefs: [source.listing, source.manual],
      requirements: [foldingLidStayScope],
    }],
    discrepancies: [],
    capabilities: [],
  })),
  {
    id: concreteAnchor.productId,
    name: concreteAnchor.label,
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: concreteAnchor.manufacturerModel,
    category: "connector",
    status: "reviewed-specs",
    verifiedAt: concreteAnchor.verifiedAt,
    profile: profile("connector", null, concreteAnchor.unitsPerPack, { materialFamily: concreteAnchor.productId, finish: "Mechanically galvanized" }),
    offers: [hd(concreteAnchor.internetNumber, concreteAnchor.model, concreteAnchor.sku)],
    sources: [
      { url: concreteAnchor.listing, verifiedAt: concreteAnchor.verifiedAt, note: "Single retail anchor, exact suffix and Internet item number. No local stock is inferred." },
      { url: concreteAnchor.instructions, verifiedAt: concreteAnchor.verifiedAt, note: "Manufacturer’s mechanically galvanized product family table gives the drill diameter, wrench size and hole overdrill for the nominal half-inch anchor." },
      { url: concreteAnchor.evaluation, verifiedAt: concreteAnchor.verifiedAt, note: "ESR-2713 Table 1A supports the scoped solid-concrete layout comparisons. Refer to the full report for applicable substrate and design conditions." },
    ],
    discrepancies: ["The retail nominal length does not establish effective embedment, coating suitability, fixture thickness limits for the installation, or project load rating."],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: sunliteFastener.productId,
    name: sunliteFastener.name,
    manufacturer: "Palram Americas / ProTite",
    manufacturerPartNumber: sunliteFastener.model,
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: sunliteFastener.checkedAt,
    profile: profile("fastener", null, sunliteFastener.pack, { materialFamily: sunliteFastener.productId, finish: "Steel and EPDM umbrella washer" }),
    offers: [hd(sunliteFastener.internetNumber, sunliteFastener.model, sunliteFastener.storeSku)],
    sources: [
      { url: sunliteFastener.listing, verifiedAt: sunliteFastener.checkedAt, note: "Exact model, 250 per bag, nominal 2 in wood screw, 19 mm EPDM washer and 5/16 in hex drive. Retailer lists SUNLITE-to-wood use." },
      { url: sunliteFastener.installation, verifiedAt: sunliteFastener.checkedAt, note: "Palram guide describes predrilling for movement and using compatible EPDM-washered hardware. Its general bit example does not set the hole diameter for a measured 93035 screw and project detail." },
    ],
    discrepancies: ["A listed washer diameter describes the outside envelope. Measure the delivered shank and usable gasket contact, and resolve the installation schedule separately."],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: gafRoofShingle.id,
    name: `${gafRoofShingle.label} · shingle bundle`,
    manufacturer: "GAF",
    manufacturerPartNumber: gafRoofShingle.model,
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: gafRoofShingle.reviewedAt,
    profile: profile("sheet", null, 1, { finish: "Charcoal" }),
    offers: [hd(gafRoofShingle.internetNumber, gafRoofShingle.model, gafRoofShingle.sku)],
    sources: [
      { url: gafRoofShingle.listing, verifiedAt: gafRoofShingle.reviewedAt, note: "Exact Charcoal model and Internet number sold by the bundle. Verify the delivered bundle's coverage." },
      { url: gafRoofShingle.instructions, verifiedAt: gafRoofShingle.reviewedAt, note: "GAF specifies a 2:12 minimum and provides separate underlayment details for low slopes." },
      { url: gafRoofShingle.evaluation, verifiedAt: gafRoofShingle.reviewedAt, note: "UL ER21-01 documents the evaluated assembly and scope under multiple IRC editions." },
    ],
    discrepancies: [gafRoofShingle.coverageNote],
    roleQualifications: [],
    capabilities: [],
  },
  ...Object.values(shingleEdgeProducts).map((edge) => ({
    id: edge.id,
    name: `${edge.label} · ${edge.purchaseUnit}`,
    manufacturer: "GAF",
    manufacturerPartNumber: edge.model,
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: edge.reviewedAt,
    profile: profile("sheet", null, 1, edge.finish ? { finish: edge.finish } : {}),
    offers: [hd(edge.internetNumber, edge.model, edge.sku)],
    sources: [
      { url: edge.listing, verifiedAt: edge.reviewedAt, note: "Exact model and single retail bundle. No selected-store price or quantity inferred." },
      { url: edge.specification, verifiedAt: edge.reviewedAt, note: edge.coverageNote },
      { url: edge.instructions, verifiedAt: edge.reviewedAt, note: edge.cutNote },
    ],
    discrepancies: [edge.coverageNote],
    roleQualifications: [],
    capabilities: [],
  })),
  {
    id: gibraltarDripEdge.id,
    name: gibraltarDripEdge.label,
    manufacturer: "Gibraltar Building Products",
    manufacturerPartNumber: gibraltarDripEdge.model,
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: gibraltarDripEdge.reviewedAt,
    profile: profile("sheet", null, 1, { finish: "Galvanized steel" }),
    offers: [hd(gibraltarDripEdge.internetNumber, gibraltarDripEdge.model, gibraltarDripEdge.sku)],
    sources: [
      { url: gibraltarDripEdge.listing, verifiedAt: gibraltarDripEdge.reviewedAt, note: "Exact 15553 sold as a 120 in stick, with 3:12 or steeper recommended." },
      { url: gibraltarDripEdge.specification, verifiedAt: gibraltarDripEdge.reviewedAt, note: "Exact profile drawing identifies nominal 2¾ in and 3 in legs, the unhemmed kick and the stock length." },
      { url: gibraltarDripEdge.instructions, verifiedAt: gibraltarDripEdge.reviewedAt, note: "Manufacturer’s general galvanized roof edge guide specifies 2–3 in laps with separate eave and rake sequences." },
    ],
    discrepancies: [gibraltarDripEdge.note],
    roleQualifications: [],
    capabilities: [],
  },
  {
    id: wissSnips.id,
    name: wissSnips.label,
    manufacturer: "Crescent Wiss",
    manufacturerPartNumber: wissSnips.model,
    category: "tool",
    status: "reviewed-specs",
    verifiedAt: gibraltarDripEdge.reviewedAt,
    profile: profile("tool", null, 1),
    offers: [hd(wissSnips.internetNumber, wissSnips.model, wissSnips.sku)],
    sources: [
      { url: wissSnips.listing, verifiedAt: gibraltarDripEdge.reviewedAt, note: "Exact M3R, one aviation snip per sell unit." },
      { url: wissSnips.specification, verifiedAt: gibraltarDripEdge.reviewedAt, note: "Crescent documents straight and slight curve cuts in low-carbon rolled steel up to 18 gauge." },
    ],
    discrepancies: ["Flat sheet ratings do not establish access at a formed bend, hem or stacked lap."],
    roleQualifications: [],
    capabilities: ["cut-flashing"],
    toolCapabilityEvidence: [{
      evidenceType: "manufacturer-product-specification",
      capabilities: ["cut-flashing"],
      sourceRefs: [wissSnips.specification],
      scope: "Straight and slight curve cuts in low-carbon rolled sheet steel up to 18 gauge.",
      requirements: ["Verify delivered steel, a single layer within the rating, and blade access around the formed profile."],
    }],
  },
  {
    id: pureBondCasework.registryId,
    name: pureBondCasework.name,
    manufacturer: "Columbia Forest Products · retailer-defined SKU",
    manufacturerPartNumber: null,
    identityBasis: "retailer-specification",
    category: "panel",
    status: "reviewed-specs",
    verifiedAt: pureBondCasework.reviewedAt,
    profile: profile("sheet", [...pureBondCasework.stockSize], 1, {
      wood: true,
      finish: "Unfinished birch veneer · interior · C3",
      materialFamily: pureBondCasework.registryId,
    }),
    offers: [hd(pureBondCasework.internetNumber, pureBondCasework.model, pureBondCasework.storeSku)],
    sources: [{
      url: pureBondCasework.listing,
      verifiedAt: pureBondCasework.reviewedAt,
      note: "The exact retailer listing identifies 0.703 × 48 × 96 in actual dimensions, lengthwise grain, C3 veneer and interior exposure. One sheet is inferred from the individual retail product configuration and per-panel description.",
    }],
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [pureBondCasework.listing] },
    limitToQualifiedRoles: true,
    roleQualifications: [{
      role: "caseworkPanels",
      scope: "Unfinished birch plywood sized for editable dry indoor casework.",
      sourceRefs: [pureBondCasework.listing],
      requirements: [
        "Measure the delivered thickness and check usable sheet edges before sizing joinery.",
        "Review actual shelf or seat loads, joinery and anchorage separately.",
      ],
    }],
    discrepancies: [],
    capabilities: [],
  },
  ...Object.values(homeDepotFraming).map((record) => {
    const verifiedAt = "reviewedAt" in record ? record.reviewedAt : framingStockReviewedAt;
    const sameSource = record.listing === record.unitSource;
    return {

      id: record.registryId,
      name: `${record.name} · ${record.stockSize[1] / 12} ft`,
      manufacturer: "Regional mill/OEM identity not established",
      manufacturerPartNumber: null,
      identityBasis: "retailer-specification",
      category: "lumber",
      status: "reviewed-specs",
      verifiedAt,
      profile: profile("linear", [...record.stockSize], 1, {
        wood: true,
        materialFamily: record.registryId,
        finish: record.finish,
      }),
      offers: [hd(record.internetNumber, record.model, record.storeSku)],
      sources: [
        { url: record.listing, verifiedAt, note: sameSource ? `${record.sourceNote} ${record.unitNote}` : record.sourceNote },
        ...(sameSource ? [] : [{ url: record.unitSource, verifiedAt, note: record.unitNote }]),
      ],
      purchaseSpec: { kind: "counted", count: 1, sourceRefs: [...new Set([record.listing, record.unitSource])] },
      limitToQualifiedRoles: true,
      roleQualifications: [{
        role: record.role,
        scope: "Listed stock dimensions for the editable framing study.",
        sourceRefs: [record.listing],
        requirements: [
          "Measure delivered stock and confirm its grade stamp, species and treatment at your store.",
          "Review member sizes, spans, bearings, fasteners, loads and exposure for your actual build.",
        ],
      }],
      discrepancies: [],
      capabilities: [],
    };
  }),
  ...sdwsFramingPacks.map((pack) => ({
    id: pack.productId,
    name: sdwsFramingName(pack),
    manufacturer: "Simpson Strong-Tie",
    manufacturerPartNumber: pack.model,
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: sdwsFramingReview.reviewedAt,
    profile: profile("fastener", null, pack.packCount, {
      fastenerLength: pack.length,
      drive: sdwsFramingReview.drive,
      finish: "Tan Quik Guard coating",
    }),
    offers: [hd(pack.internetNumber, pack.model, pack.storeSku)],
    sources: sdwsFramingSources(pack).map(({ url, reviewedAt, note }) => ({
      url, verifiedAt: reviewedAt, note,
    })),
    purchaseSpec: { kind: "counted", count: pack.packCount, sourceRefs: [pack.listing] },
    discrepancies: [
      `The retail label gives ${pack.lengthLabel} nominal. The evaluation report specifies ${pack.underHeadLength} in under the head. Installed depth and any pilot measurements remain separate.`,
    ],
    capabilities: [],
  })),
  ...everbiltAngleShelfPinIds.map((id) => {
    const product = shelfPinProducts[id];
    const source = everbiltAngleShelfPins[id];
    const verifiedAt = everbiltAngleShelfPinsReviewedAt;
    return {
      id,
      name: product.name,
      manufacturer: "Everbilt",
      manufacturerPartNumber: product.model,
      category: "connector",
      status: "reviewed-specs",
      verifiedAt,
      profile: profile("connector", null, product.packCount, {
        materialFamily: id,
        finish: "Nickel-plated steel",
      }),
      offers: [hd(source.internetNumber, product.model, source.storeSku)],
      sources: [
        {
          url: source.url,
          verifiedAt,
          note: `Exact model ${product.model}. The listing specifies an angled nickel-plated steel shelf support, a nominal 5 mm hole and ${product.packCount} supports per pack.`,
        },
        ...(source.instructions ? [{
          url: source.instructions,
          verifiedAt,
          note: "The linked Everbilt package back gives a 3/16 in bore. The listing specifies 5 mm. Confirm the instructions on the delivered package.",
        }] : []),
      ],
      purchaseSpec: { kind: "counted", count: product.packCount, sourceRefs: [source.url] },
      discrepancies: [
        source.fitNote,
        "Overall dimensions and the listed load field establish neither the installed bearing profile nor shelf assembly capacity.",
      ],
      capabilities: [],
    };
  }),
  ...edgeBandingProductIds.map((id) => {
    const stock = edgeBandingProducts[id];
    return {
      id,
      name: stock.name,
      manufacturer: stock.brand,
      manufacturerPartNumber: stock.model,
      category: "panel",
      status: "reviewed-specs",
      verifiedAt: edgeBandingReviewedAt,
      profile: profile("roll", null, 1, {
        materialFamily: "birch-veneer-edge-banding",
        finish: "Unfinished white birch with hot-melt backing",
      }),
      offers: [hd(stock.internetNumber, stock.model)],
      sources: [{
        url: stock.listing,
        verifiedAt: edgeBandingReviewedAt,
        note: `Exact ${stock.model} listing gives ${stock.width} in width, ${stock.length / 12} ft length and hot-melt backing. The individual listing is modeled as one listed length per purchase.`,
      }],
      purchaseSpec: { kind: "counted", count: 1, sourceRefs: [stock.listing] },
      discrepancies: ["Measure the actual installed thickness for finished dimensions and clearances."],
      capabilities: [],
    };
  }),
  {
    id: doorSeal.id,
    name: doorSeal.name,
    manufacturer: "Frost King",
    manufacturerPartNumber: doorSeal.model,
    category: "consumable",
    status: "reviewed-specs",
    verifiedAt: doorSeal.reviewedAt,
    profile: profile("consumable", null, doorSeal.stripCount, {
      materialFamily: "EPDM weatherseal",
      finish: "Gray",
    }),
    offers: [hd(doorSeal.internetNumber, doorSeal.model, doorSeal.storeSku)],
    sources: [
      { url: doorSeal.listing, verifiedAt: doorSeal.reviewedAt, note: "Exact V25GA gray EPDM D-profile pack, listed for ⅛–¼ in gaps." },
      { url: doorSeal.specification, verifiedAt: doorSeal.reviewedAt, note: "The manufacturer lists a 5/16 in wide and ¼ in thick section, 17 ft total." },
      { url: doorSeal.packReference, verifiedAt: doorSeal.reviewedAt, note: "The exact V25GA pack contains two 8.5 ft strips." },
      { url: doorSeal.instructions, verifiedAt: doorSeal.reviewedAt, note: "Dry, clean mounting surfaces. Mount along the head and hinge stop and inside the door along the latch side." },
    ],
    purchaseSpec: { kind: "counted", count: doorSeal.stripCount, sourceRefs: [doorSeal.listing, doorSeal.packReference] },
    discrepancies: [],
    capabilities: [],
  },
  {
    id: trimSealant.id,
    name: trimSealant.name,
    manufacturer: "DAP",
    manufacturerPartNumber: trimSealant.model,
    category: "consumable",
    status: "reviewed-specs",
    verifiedAt: trimSealant.reviewedAt,
    profile: profile("consumable", null, 1, {
      materialFamily: "elastomeric-latex-sealant",
      finish: "White",
    }),
    offers: [hd(trimSealant.internetNumber, trimSealant.model, trimSealant.storeSku)],
    sources: [
      { url: trimSealant.listing, verifiedAt: trimSealant.reviewedAt, note: "Single 10.1 fl oz white cartridge, exact Home Depot listing and model." },
      { url: trimSealant.specification, verifiedAt: trimSealant.reviewedAt, note: "DAP publishes 55 linear ft at a 3/16 in bead for the 10.1 fl oz cartridge." },
    ],
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [trimSealant.listing, trimSealant.specification] },
    discrepancies: ["Home Depot lists both 1 in and 2 in maximum widths. Yardwork screens at 1 in. Check the delivered label and gap preparation."],
    capabilities: [],
  },
  {
    id: flexWrap.id,
    name: flexWrap.name,
    manufacturer: "DuPont",
    manufacturerPartNumber: flexWrap.model,
    category: "consumable",
    status: "reviewed-specs",
    verifiedAt: flexWrap.reviewedAt,
    profile: profile("consumable", null, 1, { materialFamily: "formable butyl flashing membrane" }),
    offers: [hd(flexWrap.internetNumber, flexWrap.model, flexWrap.storeSku)],
    sources: [
      { url: flexWrap.listing, verifiedAt: flexWrap.reviewedAt, note: "Exact HHDXXTYVK8 9 in by 75 ft FlexWrap listing." },
      { url: flexWrap.packReference, verifiedAt: flexWrap.reviewedAt, note: "DuPont confirms one roll per Home Depot purchase." },
      { url: flexWrap.specification, verifiedAt: flexWrap.reviewedAt, note: "The manufacturer lists both 6 and 9 in widths at 75 ft." },
      { url: flexWrap.instructions, verifiedAt: flexWrap.reviewedAt, note: "Single-family installation guide specifies the sill length, jamb returns and exterior face lap." },
    ],
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [flexWrap.listing, flexWrap.packReference] },
    discrepancies: [],
    capabilities: [],
  },
  ...trimBackerRods.map((rod): z.input<typeof retailerProductSchema> => ({
    id: rod.id,
    name: rod.name,
    manufacturer: "Frost King",
    manufacturerPartNumber: rod.model,
    category: "consumable",
    status: "reviewed-specs",
    verifiedAt: trimBackerRodReviewedAt,
    profile: profile("consumable", null, 1, { materialFamily: "poly foam backer rod" }),
    offers: [hd(rod.internetNumber, rod.model, rod.storeSku)],
    sources: [
      { url: rod.listing, verifiedAt: trimBackerRodReviewedAt, note: `One 20 ft roll of ${rod.model}.` },
      { url: trimBackerRodSpecification, verifiedAt: trimBackerRodReviewedAt, note: "Frost King identifies the diameters and roll lengths by model." },
      { url: trimBackerRodInstructions, verifiedAt: trimBackerRodReviewedAt, note: "Dry-fit a rod slightly wider than the joint. Leave at least 1/4 in above the rod for the sealant." },
    ],
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [rod.listing, trimBackerRodSpecification] },
    discrepancies: [],
    capabilities: [],
  })),
  {
    id: woodGlue.id,
    name: woodGlue.name,
    manufacturer: "Franklin International",
    manufacturerPartNumber: woodGlue.model,
    category: "consumable",
    status: "reviewed-specs",
    verifiedAt: woodGlue.reviewedAt,
    profile: profile("consumable", null, 1, { materialFamily: "wood-adhesive" }),
    offers: [hd(woodGlue.internetNumber, woodGlue.model, woodGlue.storeSku)],
    sources: [
      { url: woodGlue.listing, verifiedAt: woodGlue.reviewedAt, note: "Single 16 oz bottle, exact Home Depot listing for model 1414." },
      { url: woodGlue.specification, verifiedAt: woodGlue.reviewedAt, note: "Franklin's minimum spread equates to approximately 250 sq ft per gallon. Model 1414 is the 16 oz bottle." },
    ],
    purchaseSpec: { kind: "counted", count: 1, sourceRefs: [woodGlue.listing, woodGlue.specification] },
    discrepancies: [],
    capabilities: [],
  },
  ...sillGaskets.map((gasket): z.input<typeof retailerProductSchema> => {
    const listing = sillGasketListing(gasket.internetNumber);
    return {
      id: gasket.id,
      name: `Owens Corning ComfortSeal ${gasket.width} in × 50 ft sill gasket`,
      manufacturer: "Owens Corning",
      manufacturerPartNumber: gasket.model,
      category: "consumable",
      status: "reviewed-specs",
      verifiedAt: sillGasketReviewedAt,
      profile: profile("consumable", null, 1, { materialFamily: "polyethylene-foam-gasket" }),
      offers: [hd(gasket.internetNumber, gasket.model, gasket.storeSku)],
      sources: [
        { url: listing, verifiedAt: sillGasketReviewedAt, note: `The ${gasket.model} listing identifies one ${gasket.width} in × 50 ft roll.` },
        { url: sillGasketInstructions, verifiedAt: sillGasketReviewedAt, note: "The manufacturer documents the roll widths and overlap at both end and perpendicular joints." },
      ],
      purchaseSpec: { kind: "counted", count: 1, sourceRefs: [listing, sillGasketInstructions] },
      discrepancies: ["Use the exact listing title and the ComfortSeal technical sheet for width. Some retailer copy still names FoamSealR and has a generic width summary."],
      capabilities: [],
    };
  }),
  toolReference({
    id: edgeTrimmer.id,
    name: edgeTrimmer.name,
    manufacturer: "The Cloverdale Company",
    manufacturerPartNumber: edgeTrimmer.model,
    verifiedAt: edgeBandingReviewedAt,
    offers: [hd(edgeTrimmer.internetNumber, edgeTrimmer.model)],
    sources: [
      { url: edgeTrimmer.listing, verifiedAt: edgeBandingReviewedAt, note: "Exact 902738 listing for a single-sided edge trimmer. The listing gives up to 3 mm edging thickness." },
      { url: edgeTrimmer.instructions, verifiedAt: edgeBandingReviewedAt, note: "PureEdge package back identifies The Cloverdale Company and describes flush-trimming bonded, cooled edging." },
    ],
    toolCapabilityEvidence: [toolEvidence(
      ["trim-edge-banding"],
      "retailer-hosted-manufacturer-document",
      [edgeTrimmer.instructions],
      "Manual flush trimming of cooled, firmly adhered edging.",
      [edgeTrimmer.requirement],
    )],
  }),
  {
    id: paslodeFinishNails.id,
    name: paslodeFinishNails.name,
    manufacturer: "Paslode",
    manufacturerPartNumber: paslodeFinishNails.model,
    category: "fastener",
    status: "reviewed-specs",
    verifiedAt: paslodeFinishReviewedAt,
    profile: profile("fastener", null, paslodeFinishNails.packCount, {
      fastenerLength: paslodeFinishNails.length,
      finish: "Galvanized",
      drive: "16-ga straight collation",
    }),
    offers: [hd(paslodeFinishNails.internetNumber, paslodeFinishNails.model, paslodeFinishNails.storeSku)],
    sources: [
      paslodeFinishSource(paslodeFinishNails.specification, "Exact 650282 is a 1¼ in galvanized straight 16-ga finish nail, 2,000 per box. Paslode lists the 515500 tool for this fastener family."),
      paslodeFinishSource(paslodeFinishNails.listing, "Home Depot Internet #100122414, store SKU 152071, exact model 650282 and 2,000-count box."),
    ],
    purchaseSpec: {
      kind: "counted",
      count: paslodeFinishNails.packCount,
      sourceRefs: [paslodeFinishNails.specification, paslodeFinishNails.listing],
    },
    discrepancies: [paslodeFinishNails.requirement],
    capabilities: [],
  },
  toolReference({
    id: paslodeFinishNailer.id,
    name: paslodeFinishNailer.name,
    manufacturer: "Paslode",
    manufacturerPartNumber: paslodeFinishNailer.model,
    verifiedAt: paslodeFinishReviewedAt,
    offers: [hd(paslodeFinishNailer.internetNumber, paslodeFinishNailer.model, paslodeFinishNailer.storeSku)],
    sources: [
      paslodeFinishSource(paslodeFinishNailer.specification, "Paslode identifies model 515500 as a pneumatic straight 16-ga finish nailer."),
      paslodeFinishSource(paslodeFinishNailer.manual, "T250S-F16P part 515500 manual lists 1–2½ in fasteners and 80–120 psi operating pressure."),
      paslodeFinishSource(paslodeFinishNailer.listing, "Home Depot Internet #303137850, store SKU 1002804122, exact model 515500."),
    ],
    toolCapabilityEvidence: [toolEvidence(
      ["drive-16ga-straight-finish-nail"],
      "manufacturer-manual",
      [paslodeFinishNailer.manual],
      "Pneumatic driving of straight 16-ga finish nails from 1 to 2½ in. Paslode lists the 1¼ in 650282 fastener for the 515500.",
      [paslodeFinishNailer.requirement],
    )],
  }),
  ...homeDepotTreatedLumber.map((record) => {
    const url = `https://www.homedepot.com/p/${record.internetNumber}`;
    const verifiedAt = treatedLumberReviewedAt;
    const singleListing = record.unitEvidence === "single-listing";
    const unitSource = record.family === "treated-2x8" ? treatedTwoEightBoardUnits : weathershieldBoardUnits;
    const dimensions = `The selected listing gives actual dimensions of ${record.size.join(" × ")} in, retailer model ${record.model}, store SKU ${record.storeSku}, and an exterior ground-contact description.`;
    const delivered = "Verify dimensions, grade, treatment and hardware compatibility for the delivered board.";
    return {
      id: treatedLumberProductId(record),
      name: `${record.name} · ${record.size[2] / 12} ft`,
      manufacturer: "Retailer specification",
      manufacturerPartNumber: null,
      identityBasis: "retailer-specification",
      category: "lumber",
      status: "reviewed-specs",
      verifiedAt,
      profile: profile("linear", [...record.size], 1, {
        wood: true,
        materialFamily: treatedLumberProductId(record),
        finish: record.finish,
      }),
      offers: [hd(record.internetNumber, record.model, record.storeSku)],
      sources: [{
        url,
        verifiedAt,
        note: singleListing
          ? `${dimensions} One board per purchase unit is inferred from the individual length-specific listing. ${delivered}`
          : `${dimensions} ${delivered}`,
      }, ...(singleListing ? [] : [{
        url: unitSource,
        verifiedAt,
        note: "The retailer category shows this length and model with an individual unit and a separate volume discount. One board is the modeled selling unit.",
      }])],
      purchaseSpec: {
        kind: "counted",
        count: 1,
        sourceRefs: singleListing ? [url] : [url, unitSource],
      },
      discrepancies: [],
      capabilities: [],
    };
  }),
  ...floorHangerProductIds.map((id) => {
    const hanger = floorHangers[id];
    return {
      id, name: `Simpson ${hanger.model} ZMAX joist hanger`, manufacturer: "Simpson Strong-Tie",
      manufacturerPartNumber: hanger.model, category: "connector", status: "reviewed-specs", verifiedAt: floorHangerReviewedAt,
      profile: profile("connector", [...hanger.namedSize], 1, { dimensionMeaning: "nominal-flanges", finish: "ZMAX galvanized; 18 gauge" }),
      offers: [hd(hanger.internetNumber, hanger.model, hanger.sku)],
      purchaseSpec: { kind: "counted", count: 1, sourceRefs: [hanger.url] },
      sources: [
        { url: hanger.url, verifiedAt: floorHangerReviewedAt, note: "One exact Home Depot hanger, with a separate volume discount. No fasteners or local stock are credited." },
        { url: floorHangerReport, verifiedAt: floorHangerReviewedAt, note: "Table 20 and Figure 20 give named W/H/B and the short-header, long-joist SD reference row. Named dimensions leave installed flange envelope and hole coordinates unresolved." },
        { url: floorHangerInstallation, verifiedAt: floorHangerReviewedAt, note: "Installation context for a face-mount double-shear hanger. Check the actual installation detail and supporting wood." },
      ],
      discrepancies: ["Retailer overall size fields and report W/H/B describe different features. Measure the delivered flange reach."],
      capabilities: [],
    };
  }),
  {
    id: floorHangerFasteners.joist.id,
    name: "Simpson SD #9 × 2½ in connector screws · 100",
    manufacturer: "Simpson Strong-Tie", manufacturerPartNumber: "SD9212R100",
    category: "fastener", status: "reviewed-specs", verifiedAt: floorHangerReviewedAt,
    profile: profile("fastener", [0.37, 2.5, 0.37], 100, {
      dimensionMeaning: "fastener-head-envelope", fastenerLength: 2.5, headDiameter: 0.37,
      finish: "Mechanically galvanized, Class 55", drive: "1/4 in hex",
    }),
    offers: [hd(floorHangerFasteners.joist.internetNumber, floorHangerFasteners.joist.merchantModel, floorHangerFasteners.joist.sku)],
    purchaseSpec: { kind: "counted", count: 100, sourceRefs: [floorHangerFasteners.joist.url] },
    sources: [
      { url: floorHangerFasteners.joist.url, verifiedAt: floorHangerReviewedAt, note: "Retail model SD9212R100-R identifies the 100-count #9 × 2½ in pack with ¼ in hex drive." },
      { url: floorHangerFasteners.joist.specification, verifiedAt: floorHangerReviewedAt, note: "SD9212 fastener identification and dimensions. The source does not locate holes or give a measured installed tip position for this build." },
    ],
    discrepancies: [], capabilities: [],
  },
]);

export const findRetailerProduct = (id: string) =>
  retailerCatalog.find((p) => p.id === id);

export function generatedStockAllows(stock: Material, role: z.infer<typeof roleQualificationSchema>["role"]) {
  if (stock.placementOnly) return false;
  const product = stock.productReference ? findRetailerProduct(stock.productReference) : undefined;
  return !product?.limitToQualifiedRoles || product.roleQualifications.some((row) => row.role === role);
}

/** Public listing references only; historical/retired offers remain available in the registry audit data. */
export const referenceOffersForProduct = (product: RetailerProduct) =>
  product.offers.filter((offer) => offer.listingStatus === "reference");

/** Legacy reviewed profiles retain their counted stock unit; set contents stay separate. */
export function purchaseSpecForProduct(
  product: RetailerProduct,
): PurchaseSpec | null {
  if (product.status !== "reviewed-specs") return null;
  if (product.purchaseSpec) return product.purchaseSpec;
  return product.profile.packCount === null
    ? null
    : {
        kind: "counted",
        count: product.profile.packCount,
        sourceRefs: product.sources.map((source) => source.url),
      };
}

/** Eligibility checks only: geometry compatibility never proves structural/suitability approval. */
export function checkProductBinding(
  material: Material,
  product: RetailerProduct,
) {
  const issues: string[] = [];
  if (product.category === "tool")
    issues.push(
      "Reusable tools are separate from consumable material bindings.",
    );
  if (product.status !== "reviewed-specs")
    issues.push(
      "Candidate identity is not reviewed as an exact product variant.",
    );
  if (product.discrepancies.length) issues.push(...product.discrepancies);
  if (material.wood !== product.profile.wood)
    issues.push("Wood/non-wood material types differ.");
  if (material.stockKind !== product.profile.stockKind)
    issues.push("Stock kinds differ.");
  if (material.orderRollWidth !== undefined || product.profile.dimensionMeaning === "roll-width-only") {
    if (product.profile.dimensionMeaning !== "roll-width-only" || !product.supplier ||
      material.orderRollWidth === undefined || product.profile.rollWidth === undefined ||
      Math.abs(material.orderRollWidth - product.profile.rollWidth) > 0.001)
      issues.push("A quote-specific roll requires a matching verified width and supplier.");
  } else {
    if (!["actual-stock", "fastener-head-envelope"].includes(product.profile.dimensionMeaning))
      issues.push("Actual stock/body-envelope dimensions are not verified.");
    if (product.profile.packCount === null || material.packCount !== product.profile.packCount)
      issues.push("Purchase pack count is unknown or differs.");
    const expected = [...(material.stockSize ?? material.size)].sort((a, b) => a - b);
    const actual = product.profile.stockSize && [...product.profile.stockSize].sort((a, b) => a - b);
    if (!actual || expected.some((v, i) => Math.abs(v - actual[i]) > 0.001))
      issues.push(
        "Actual stock dimensions differ or are unverified; existing geometry must not be resized silently.",
    );
  }
  if (
    material.fastenerLength !== undefined &&
    (product.profile.fastenerLength === null ||
      Math.abs(material.fastenerLength - product.profile.fastenerLength) >
        0.001)
  )
    issues.push("Fastener length differs or is unknown.");
  return {
    compatible: issues.length === 0,
    requiresConfirmation: true as const,
    issues,
    note: "Confirm grade, species, finish, intended use and installation requirements before binding. This result does not assert availability or structural capacity.",
  };
}

/** An exact reviewed reference is a product link, never a stock/price assertion. */
export function reviewedOfferForMaterial(
  material: Material,
  retailer: Retailer,
) {
  const product = material.productReference
    ? findRetailerProduct(material.productReference)
    : undefined;
  if (!product || !checkProductBinding(material, product).compatible)
    return null;
  return (
    referenceOffersForProduct(product).find(
      (offer) => offer.retailer === retailer,
    ) ?? null
  );
}

const homeDepotFramingReferences: Partial<Record<Material["id"], string>> = {
  stud: "home-depot-kd-ht-2x4x96-338861827",
  "two-six": "home-depot-spf-2x6x96-100083274",
};

/** A regional listing can help shop for generic stock without restricting user-recorded matches. */
export function shoppingOfferForMaterial(stock: Material, retailer: Retailer) {
  const exact = reviewedOfferForMaterial(stock, retailer);
  if (exact) return { offer: exact, suggested: false };
  if (stock.productReference || retailer !== "home-depot") return null;
  const id = homeDepotFramingReferences[stock.id];
  const product = id && findRetailerProduct(id);
  if (!product || !checkProductBinding(stock, product).compatible) return null;
  const offer = referenceOffersForProduct(product).find(
    (offer) => offer.retailer === retailer,
  );
  return offer ? { offer, suggested: true } : null;
}

export function reviewedSupplierForMaterial(material: Material) {
  const product = material.productReference
    ? findRetailerProduct(material.productReference)
    : undefined;
  return product?.supplier && checkProductBinding(material, product).compatible
    ? product.supplier
    : null;
}
