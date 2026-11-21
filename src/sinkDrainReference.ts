export const sinkTrap = {
  id: "hd-oatey-hdc9704b",
  tube: "oatey-trap-straight-tube",
  name: "Oatey 1½ in tubular sink P-trap",
  model: "HDC9704B",
  internet: "316622155",
  sku: "1000050138",
  // The drawing gives overall reach, total drop and tube OD, rather than socket engagement.
  nominal: [12, 4.95, 1.5] as [number, number, number],
  diameter: 1.5,
  listing: "https://www.homedepot.com/p/316622155",
  product: "https://www.oatey.com/products/p_038753005768/oatey-112-in-ptraps?upc=038753005362",
  drawing: "https://images.thdstatic.com/catalog/pdfImages/48/48334fc0-d89f-42bb-a50f-68353e8740b8.pdf",
  installation: "https://www.oatey.com/resources/project-guides/how-install-p-trap",
  reviewedAt: "2026-11-21T15:01:00.000Z",
} as const;

export const sinkDrainReferences = {
  ircVent: {
    title: "2021 IRC P3105 · fixture vents",
    url: "https://codes.iccsafe.org/content/VARC2021P1/chapter-31-vents",
  },
  ircSlope: {
    title: "2021 IRC P3005.3 · horizontal drainage slope",
    url: "https://codes.iccsafe.org/content/NHRC2021P1/chapter-30-sanitary-drainage",
  },
  ipcVent: {
    title: "2024 IPC §909 · fixture vents",
    url: "https://codes.iccsafe.org/content/IPC2024V2.0/chapter-9-vents",
  },
  ipcSlope: {
    title: "2024 IPC Table 704.1 · horizontal drainage slope",
    url: "https://codes.iccsafe.org/content/IPCSP2024P1/capitulo-7-drenaje-sanitario",
  },
} as const;

export const sinkTrapSlope = 0.25;
export const sinkTrapVentReach = 72;
