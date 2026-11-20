/** Author-reviewed US connector references. Project input cannot override these facts. */
export const connectorProductId = "simpson-a21z" as const;
export type ConnectorProductId = typeof connectorProductId;
export type ConnectorScheduleId = "sd9112" | "n10dhdg";
export type ConnectorSource = Readonly<{
  url: string;
  revision: string;
  reviewedAt: string;
  scope: string;
  note: string;
}>;
export type ConnectorSchedule = Readonly<{
  id: ConnectorScheduleId;
  name: string;
  fastenerProductId: "simpson-sd9112r100" | "simpson-n10dhdg-r";
  fastenerName: string;
  baseCount: 2;
  postCount: 2;
  totalPerConnector: 4;
  packCount: 100 | 120;
  drive: "quarter-hex" | "hammer";
  /** Reference size only; not a measured depth inside wood. */
  nominalLength: 1.5;
  sources: readonly ConnectorSource[];
}>;
export type ConnectorProduct = Readonly<{
  productId: ConnectorProductId;
  name: string;
  manufacturerPartNumber: "A21Z";
  packCount: 1;
  evidenceRevision: string;
  namedDimensions: Readonly<{ W1: 2; W2: 1.5; L: 1.375; unit: "in" }>;
  gauge: 18;
  finish: "ZMAX";
  sources: readonly ConnectorSource[];
  schedules: readonly ConnectorSchedule[];
  conflicts: readonly string[];
  unknowns: readonly string[];
  leafThickness: null;
  holeCenters: null;
  bendRadius: null;
}>;

const reviewedAt = "2026-11-17T12:40:48.239Z";
const source = (
  url: string,
  revision: string,
  scope: string,
  note: string,
): ConnectorSource => Object.freeze({ url, revision, reviewedAt, scope, note });
const angleTable = source(
  "https://www.strongtie.com/framinganglesandplates_anglesandplates/a_angle/p/a",
  "US A-angle product table, reviewed 2026-11-17",
  "A21Z identity, named nominal flanges and A21 reference schedule",
  "A21Z is 18 gauge/ZMAX, W1=2, W2=1½, L=1⅜ in and one connector. The A21 screw row lists two SD9112 to the base and two to the post. Named flange dimensions are not a verified outer envelope; manufacturer drawing geometry is approximate.",
);
const sdTable = source(
  "https://www.strongtie.com/products/fastening-systems/technical-notes/sd-connector-screw-approved-connectors",
  "Current US approved-connector table, A21 row",
  "Alternative complete A21 SD9 × 1½ in reference schedule",
  "A21 lists four screws in the SD9 × 1½ in column; other size columns are not selected. Some connector holes can fit tightly. This table does not provide project-specific placement, fit or capacity approval.",
);
const nailTable = source(
  "https://ssttoolbox.widen.net/content/llqi0appt0/original/C-C-2026-p314.pdf?download=true",
  "C-C-2026 p314, A21 row; 2026–2027 catalog",
  "Alternative complete A21 .148 × 1½ in nail reference schedule",
  "The A21 post/base row specifies two .148 × 1½ in nails per member, four total. It supplies no exact US hole-center/bend/leaf geometry. Load values are not adopted or transferred to arbitrary joints.",
);
const notes = source(
  "https://ssttoolbox.widen.net/content/s9lk6yrvfj/original/C-C-2026-p020-023.pdf?download=true",
  "C-C-2026 pp20–23, general installation notes",
  "Specified fasteners, seating and installation constraints",
  "Use the specified fastener types/counts and required holes, review proper seating and only bend products designed for bending. A generic wood screw, GRK product or unrelated connector schedule is not a substitute.",
);
const sdProduct = source(
  "https://www.strongtie.com/strongdrive_exteriorwoodscrews/sd_screw/p/strong-drive-sd-connector-screw",
  "SD9112R100 exact purchase row",
  "100-screw purchase reference and ¼ in hex drive",
  "SD9112R100 is #9 × 1½ in, 100 screws, Class55 finish and ¼ in hex drive. A retailer-listed included driver is not reviewed ownership, tool condition, access, hole fit or an automatic tool selection. Nominal length is not measured wood-entry-to-tip depth.",
);
const nailProduct = source(
  "https://www.lowes.com/pd/Simpson-Strong-Tie-1-1-2-in-Hot-Dipped-Galvanized-Steel-120-Count/1002681308",
  "N10DHDG-R / item1915198 exact purchase reference",
  "120 nails, .148 in shank × 1½ in, HDG ClassD",
  "This reviewed exact 120-nail box matches the reference shank/length. No pneumatic collation, hole layout, driver/nailer fit, corrosion exposure or installation capacity is established. No local price/stock was imported.",
);
const schedules: readonly ConnectorSchedule[] = Object.freeze([
  Object.freeze({
    id: "sd9112" as const,
    name: "SD9112 screw reference · 2 base + 2 post",
    fastenerProductId: "simpson-sd9112r100" as const,
    fastenerName: "Simpson SD9112 #9 × 1½ in connector screw",
    baseCount: 2 as const,
    postCount: 2 as const,
    totalPerConnector: 4 as const,
    packCount: 100 as const,
    drive: "quarter-hex" as const,
    nominalLength: 1.5 as const,
    sources: Object.freeze([angleTable, sdTable, sdProduct, notes]),
  }),
  Object.freeze({
    id: "n10dhdg" as const,
    name: "N10DHDG-R nail reference · 2 base + 2 post",
    fastenerProductId: "simpson-n10dhdg-r" as const,
    fastenerName: "Simpson N10DHDG-R .148 × 1½ in connector nail",
    baseCount: 2 as const,
    postCount: 2 as const,
    totalPerConnector: 4 as const,
    packCount: 120 as const,
    drive: "hammer" as const,
    nominalLength: 1.5 as const,
    sources: Object.freeze([nailTable, nailProduct, notes]),
  }),
]);

export const connectorProducts: readonly ConnectorProduct[] = Object.freeze([
  Object.freeze({
    productId: connectorProductId,
    name: "Simpson A21Z ZMAX angle",
    manufacturerPartNumber: "A21Z" as const,
    packCount: 1 as const,
    evidenceRevision: "simpson-a21z-2026-11-17-v1",
    namedDimensions: Object.freeze({
      W1: 2 as const,
      W2: 1.5 as const,
      L: 1.375 as const,
      unit: "in" as const,
    }),
    gauge: 18 as const,
    finish: "ZMAX" as const,
    sources: Object.freeze([
      angleTable,
      sdTable,
      nailTable,
      notes,
      source(
        "https://www.homedepot.com/p/100375047",
        "A21Z / SKU296044",
        "One exact US connector purchase reference",
        "One angle; no included fastener count is credited. Other retailer IDs are not normalized into this reference; no price/stock imported.",
      ),
      source(
        "https://www.lowes.com/pd/simpson-strong-tie-a21z-angle-z-max/1114951",
        "A21Z / item96871",
        "One connector, four holes, no mounting hardware included",
        "Retailer dimensions1.548/1.375/2.048 in differ from named manufacturer flanges. They are not a thickness/bend datum or exact installed envelope; no price/stock imported.",
      ),
    ]),
    schedules,
    conflicts: Object.freeze([
      "Manufacturer W1/W2/L name flanges/length; retailer1.548/1.375/2.048 in fields are a different convention, not an exact solid envelope.",
      "18 gauge does not supply an exact measured leaf thickness; the drawing's approximate geometry does not establish manufactured hole centers or tolerances.",
      "UK A21 dimensions/4.3 mm holes/box200 and sibling-retailer Q&A are not verified US A21Z geometry or purchase units.",
    ]),
    unknowns: Object.freeze([
      "Actual leaf contact/offset, bend datum, hole centers/diameters, delivered fastener fit and head seating remain unmeasured. Four slots are schedule quantity only, never a manufactured pattern.",
      "User wood-entry-to-tip/pilot-tip depths, member grain/edge/end constraints, access, clamping and delivered instruction revision need separate evidence.",
      "ZMAX and exact fastener finishes require review against actual treated-wood chemistry, moisture/salt exposure and corrosion instructions.",
      "The source post/base sawn-wood frame context does not qualify sheet/casework edges, heated sauna use, a seat load, frame racking, code or installed capacity.",
      "A connector fastener enters one assigned wood member through a metal leaf; it is not a GRK wood-to-wood W ray. Choose one complete schedule without generic substitutions or mixing.",
    ]),
    leafThickness: null,
    holeCenters: null,
    bendRadius: null,
  }),
]);

export function getConnectorProduct(id: string): ConnectorProduct | undefined {
  return connectorProducts.find((product) => product.productId === id);
}
export function getConnectorSchedule(
  id: string,
): ConnectorSchedule | undefined {
  return schedules.find((schedule) => schedule.id === id);
}
