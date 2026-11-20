import { catalog, type Material, type MaterialId } from "./model";
import { materialIds } from "./materialIds";
import { homeDepotTreatedLumber } from "./homeDepotTreatedLumber";
const families: {
  id: string;
  name: string;
  ids: MaterialId[];
  preferred: MaterialId;
}[] = [
  {
    id: "framing-2x4",
    name: "2 × 4 framing lumber",
    ids: ["stud", "stud-10", "stud-12", "lowes-syp-2x4-8", "hd-kdht-2x4-8", "hd-spf-2x4-10", "hd-spf-2x4-12"],
    preferred: "stud",
  },
  {
    id: "framing-2x6",
    name: "2 × 6 framing lumber",
    ids: ["two-six", "lowes-syp-2x6", "hd-spf-2x6-8", "hd-spf-2x6-12"],
    preferred: "two-six",
  },
  {
    id: "framing-2x12",
    name: "2 × 12 framing lumber",
    ids: ["hd-fir-2x12-8", "lowes-fir-2x12-8"],
    preferred: "hd-fir-2x12-8",
  },
  {
    id: "treated-2x4",
    name: "Ground-contact 2 × 4",
    ids: homeDepotTreatedLumber.filter(({ family }) => family === "treated-2x4").map(({ materialId }) => materialId),
    preferred: "hd-treated-2x4-8",
  },
  {
    id: "treated-2x6",
    name: "Ground-contact 2 × 6",
    ids: ["treated", ...homeDepotTreatedLumber.filter(({ family }) => family === "treated-2x6").map(({ materialId }) => materialId)],
    preferred: "hd-treated-2x6-8",
  },
  {
    id: "treated-2x8",
    name: "Ground-contact 2 × 8",
    ids: homeDepotTreatedLumber.filter(({ family }) => family === "treated-2x8").map(({ materialId }) => materialId),
    preferred: "hd-treated-2x8-8",
  },
  {
    id: "treated-4x4",
    name: "4 × 4 treated post",
    ids: ["post", "lowes-treated-post-4x4-8", "hd-treated-4x4-8", "hd-treated-4x4-12"],
    preferred: "post",
  },
  {
    id: "board-1x4",
    name: "1 × 4 board",
    ids: ["one-four", "hd-pine-1x4", "lowes-pine-1x4"],
    preferred: "one-four",
  },
  {
    id: "board-1x6",
    name: "1 × 6 board",
    ids: ["one-six", "lowes-whitewood-1x6"],
    preferred: "one-six",
  },
  {
    id: "birch-plywood",
    name: "Birch plywood",
    ids: ["hd-purebond-birch-188", "hd-purebond-birch-453", "hd-purebond-birch-703"],
    preferred: "hd-purebond-birch-453",
  },
  {
    id: "wood-screws",
    name: "Wood screws",
    ids: ["screw", "screw-short"],
    preferred: "screw",
  },
];
export type MaterialGroup = {
  id: string;
  name: string;
  variants: Material[];
  preferred: MaterialId;
};
export function materialFamilyVariants(id: MaterialId): readonly MaterialId[] {
  return families.find(({ ids }) => ids.includes(id))?.ids ?? [id];
}
/** Palette grouping only. Each exact stock/product ID and its physical/source facts remain distinct. */
export function groupedMaterials(
  category = "All",
  search = "",
): MaterialGroup[] {
  const result: MaterialGroup[] = [];
  const query = search.trim().toLowerCase();
  for (const item of catalog) {
    const family = families.find((f) => f.ids.includes(item.id));
    const id = family?.id ?? item.id;
    if (result.some((row) => row.id === id)) continue;
    const all = family
      ? catalog.filter((m) => family.ids.includes(m.id))
      : [item];
    const variants = all.filter(
      (m) =>
        (category === "All" || m.category === category) &&
        (!query ||
          `${family?.name ?? ""} ${m.name} ${m.subtitle} ${m.search}`
            .toLowerCase()
            .includes(query)),
    );
    if (variants.length)
      result.push({
        id,
        name: family?.name ?? item.name,
        variants,
        preferred: variants.some((m) => m.id === family?.preferred)
          ? family!.preferred
          : variants[0].id,
      });
  }
  const order=(group:MaterialGroup)=>Math.min(...group.variants.map((m)=>materialIds.indexOf(m.id)));
  return result.sort((a,b)=>order(a)-order(b));
}
