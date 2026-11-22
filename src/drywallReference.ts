export const drywallReviewedAt = "2026-11-22T02:15:00.000Z";
export const drywallSpecification = "https://www.usg.com/content/dam/USG/pdpmovedocuments/sheetrock-ultralight-panels-submittal-en-wb2501.pdf";
export const drywallInstallation = "https://www.usg.com/content/dam/USG/pdpmovedocuments/sheetrock-gypsum-panels-installation-guide-en-J371.pdf";

export const drywallStock = [
  { id: "hd-usg-drywall-half-8", length: 96, model: "14113411708", internet: "202530243", sku: "630204" },
  { id: "hd-usg-drywall-half-12", length: 144, model: "14113411712", internet: "202530306", sku: "897148" },
] as const;

export const isDrywall = (id: string) => drywallStock.some((stock) => stock.id === id);
