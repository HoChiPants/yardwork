import { browserWorkshopRequest } from "./browserWorkshop";

export const browserWorkshop = import.meta.env?.MODE === "pages";
export function workshopRequest(url: string, options?: RequestInit) {
  return browserWorkshop ? browserWorkshopRequest(url, options) : fetch(url, options);
}

export function workshopAsset(path: string) {
  return `${import.meta.env?.BASE_URL ?? "/"}${path.replace(/^\//, "")}`;
}
