export const steel6 = {
  productId: "huum-steel60stuwg",
  packageModel: "STEEL60STUWG",
  title: "HUUM STEEL 6 · U.S. floor-mounted heater",
  manualRevision: "H1006L03-v9-US",
  manual:
    "https://huumsauna.com/wp-content/uploads/2025/11/H1006L03_v9_STEEL_User_Manual_USA_PRINT.pdf",
  manufacturer: "https://huumsauna.com/product/steel-electric-sauna-heater/",
  listing:
    "https://www.lowes.com/pd/HUUM-STEEL-6-STU-Pkg-STEEL-Series-6kW-Sauna-Heater-PackageWiFi-Glass/105999158",
  retailerProductId: "105999158",
  // Body dimensions from Table 3. North American clearances use the larger printed
  // imperial values where the two unit columns round differently.
  width: 320 / 25.4,
  depth: 320 / 25.4,
  height: 975 / 25.4,
  lateral: 2,
  overhead: 47.3,
  minimumRoomHeight: 2200 / 25.4,
  addedVolumePerSquareFoot: 3.3,
  range: { "208": [142, 248], "240": [177, 318] },
} as const;

export const harviaKit = {
  productId: "aleko-kitjh60-hd",
  packageModel: "KITJH60-HD",
  title: "ALEKO Harvia KIP 6 kW · Xenio package",
  revision: "ALEKO-KITJH60-package-2026-11",
  listing: "https://www.homedepot.com/p/324830605",
  retailerProductId: "324830605",
  retailerItemNumber: "1009456454",
  supplier:
    "https://alekoproducts.com/harvia-kip-ul-certified-electric-sauna-heater---digital-xenio-control-panel-with-wifi-remote-control---6kw/kitjh60-ap/",
  width: 16,
  depth: 11,
  height: 24,
  volume: [170, 300],
  verifiedAt: "2026-11-20T11:40:00.000Z",
  installationReview:
    "Confirm the delivered heater and Xenio nameplates and installation manuals. Have the installer verify clearances, wall backing and installed load with stones, guard and exit path, ventilation and electrical supply before ordering or mounting.",
} as const;
export const saunaHeaterProducts = [harviaKit, steel6] as const;
export type SaunaHeaterProductId = (typeof saunaHeaterProducts)[number]["productId"];
