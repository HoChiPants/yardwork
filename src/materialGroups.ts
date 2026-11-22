import { catalog, type Material, type MaterialId } from "./model";
import { formatPreciseInches, formatStockLength } from "./measurement";
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
    id: "cedar-tongue-and-groove",
    name: "Tongue-and-groove cedar",
    ids: ["cedarbrook-cedar-tg-72"],
    preferred: "cedarbrook-cedar-tg-72",
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
  {
    id: "pex-b",
    name: "Straight PEX-B pipe",
    ids: ["hd-pex-u860w10", "hd-pex-u870w10"],
    preferred: "hd-pex-u860w10",
  },
  {
    id: "closet-rod",
    name: "Closet rod",
    ids: ["closet-rod-72", "hd-everbilt-closet-rod-96"],
    preferred: "hd-everbilt-closet-rod-96",
  },
  {
    id: "pedestal-sauna-bench",
    name: "Pedestal sauna bench",
    ids: ["cedarbrook-pedestal-48", "cedarbrook-pedestal-60"],
    preferred: "cedarbrook-pedestal-48",
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

const paletteSearch = (text: string) => text.toLowerCase().replace(/(\d)\s*[×x]\s*(?=\d)/g, "$1x");

/** Palette grouping only. Each exact stock/product ID and its physical/source facts remain distinct. */
export function groupedMaterials(
  category = "All",
  search = "",
): MaterialGroup[] {
  const result: MaterialGroup[] = [];
  const query = paletteSearch(search.trim());
  for (const item of catalog) {
    if (item.includedComponent) continue;
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
          paletteSearch(`${family?.name ?? ""} ${paletteStockName(m.name)} ${m.name} ${m.subtitle} ${m.search}`).includes(query)),
    );
    if (variants.length)
      result.push({
        id,
        name: family?.name ?? paletteStockName(item.name),
        variants,
        preferred: family?.preferred ?? item.id,
      });
  }
  const order=(group:MaterialGroup)=>Math.min(...group.variants.map((m)=>materialIds.indexOf(m.id)));
  return result.sort((a,b)=>order(a)-order(b));
}


function paletteStockName(name: string) {
  return name.replace(/^(?:The )?(?:Home Depot|Lowe[’']s)\s+/i, "")
    .replace(/\s*·\s*(?:The )?(?:Home Depot|Lowe[’']s)(?: reference)?(?=\s*·|\s*$)/gi, "")
    .replace(/\s*·\s*\d+(?:\.\d+)? ft\s*$/i, "")
    .replace(/\s*·\s*[^·]*\bactual\s*$/i, "")
    .replace(/^(.*)\s+·\s+(\S+) category$/, "$2 in $1")
    .trim();
}

export function materialPlacementOptions(group: MaterialGroup) {
  const ids = materialFamilyVariants(group.preferred);
  const all = catalog.filter((stock) => ids.includes(stock.id));
  const preferred = all.find(({ id }) => id === group.preferred)!;
  const dimension = (stock: Material) => group.id === "birch-plywood" ? Math.min(...stock.size) :
    group.id === "pex-b" ? stock.id === "hd-pex-u860w10" ? 0.5 : 0.75 : Math.max(...(stock.stockSize ?? stock.size));
  const label = (value: number) => group.id === "birch-plywood" || group.id === "pex-b"
    ? formatPreciseInches(value) : formatStockLength(value);
  const representatives = new Map([preferred, ...all.filter((stock) => stock.id !== preferred.id)]
    .reverse().map((stock) => [dimension(stock), stock]));
  return {
    preferred,
    canCutToLength: preferred.wood && preferred.cuttable && preferred.stockKind === "linear",
    label: group.id === "birch-plywood" ? "Panel thickness" : group.id === "pex-b" ? "Pipe size" : "Stock length",
    options: [...representatives].sort(([a], [b]) => a - b).map(([value, stock]) => ({ value, id: stock.id, label: label(value) })),
  };
}
