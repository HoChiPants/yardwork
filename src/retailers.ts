import { z } from "zod";
export const retailerSchema = z.enum(["home-depot", "lowes"]);
export type Retailer = z.infer<typeof retailerSchema>;
export function retailerName(retailer: Retailer = "home-depot") {
  return retailer === "lowes" ? "Lowe's" : "Home Depot";
}
export function retailerFromUrl(value: string): Retailer | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    if (["homedepot.com", "www.homedepot.com"].includes(u.hostname))
      return "home-depot";
    if (["lowes.com", "www.lowes.com"].includes(u.hostname)) return "lowes";
  } catch {}
  return null;
}
export function retailerSearch(retailer: Retailer, query: string) {
  return retailer === "lowes"
    ? `https://www.lowes.com/search?searchTerm=${encodeURIComponent(query)}`
    : `https://www.homedepot.com/s/${encodeURIComponent(query)}`;
}
