export const doorHardwareMaterial = "door-hardware-clearance";
export const doorHardwareRoles = ["door-hardware-front", "door-hardware-back"] as const;
export const doorHardwareRole = (role?: string) => doorHardwareRoles.some((value) => value === role);

export const georgianPassage = {
  id: "schlage-f10-v-geo-619",
  name: "Schlage Georgian satin nickel passage knob set",
  model: "F10 V GEO 619",
  internet: "100062093",
  sku: "779786",
  listing: "https://www.homedepot.com/p/100062093",
  specification: "https://assets.schlage.com/content/dam/us-res-mktg/PDF-thumbnails/PDF-low/MR-2072-GEO.pdf",
  preparation: "https://www.schlage.com/content/dam/sch-us/documents/pdf/installation-manuals/RF103.pdf",
  reviewedAt: "2026-11-22T22:25:00.000Z",
  backsets: [2.375, 2.75] as const,
  thickness: [1.375, 1.75] as const,
  bore: 2.125,
} as const;
