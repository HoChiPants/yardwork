import { catalog, material, type Material, type MaterialId } from "./model";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { materialIds } from "./materialIds";
import { homeDepotTreatedLumber } from "./homeDepotTreatedLumber";
import { drywallStock } from "./drywallReference";
import { isPexPipe, pexPipes, type PexPipeId } from "./wallWaterReference";
import { isWaterFitting, waterFittingProduct } from "./waterFittingReference";
import { isWaterSupport, waterSupportProducts } from "./waterSupportReference";
const families: {
  id: string;
  name: string;
  ids: MaterialId[];
  preferred: MaterialId;
}[] = [
  {
    id: "half-inch-drywall",
    name: "½ in drywall",
    ids: drywallStock.map(({ id }) => id),
    preferred: drywallStock[0].id,
  },
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
    preferred: "hd-treated-4x4-8",
  },
  {
    id: "board-1x4",
    name: "1 × 4 board",
    ids: ["one-four", "hd-pine-1x4", "lowes-pine-1x4"],
    preferred: "hd-pine-1x4",
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
    id: "push-coupling",
    name: "Push-to-connect coupling",
    ids: ["hd-sharkbite-ur008a", "hd-sharkbite-ur016a"],
    preferred: "hd-sharkbite-ur008a",
  },
  {
    id: "push-elbow",
    name: "90° push-to-connect elbow",
    ids: ["hd-sharkbite-ur248a", "hd-sharkbite-ur256a"],
    preferred: "hd-sharkbite-ur248a",
  },
  {
    id: "push-tee",
    name: "Push-to-connect tee",
    ids: ["hd-sharkbite-ur362a", "hd-sharkbite-ur370a"],
    preferred: "hd-sharkbite-ur362a",
  },
  {
    id: "push-reducing-tee",
    name: "Push-to-connect reducing tee",
    ids: ["hd-sharkbite-ur412a"],
    preferred: "hd-sharkbite-ur412a",
  },
  {
    id: "pipe-isolator",
    name: "Through-stud pipe isolator",
    ids: ["hd-holdrite-161j15", "hd-holdrite-162j15"],
    preferred: "hd-holdrite-161j15",
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

const paletteSearch = (text: string) => text.toLowerCase()
  .replace(/½|\b0\.5\b/g, "1/2")
  .replace(/¾|\b0\.75\b/g, "3/4")
  .replace(/(\d)\s*(?:[×x]|by)\s*(?=\d)/g, "$1x")
  .replace(/(\d)\s*(?:feet|foot|ft)\b/g, "$1 ft");

/** Palette grouping only. Each exact stock/product ID and its physical/source facts remain distinct. */
export function groupedMaterials(
  category = "All",
  search = "",
): MaterialGroup[] {
  const result: MaterialGroup[] = [];
  const terms = paletteSearch(search.trim()).match(/\d+(?:\.\d+)? ft\b|[^\s·,]+/g) ?? [];
  for (const item of catalog) {
    if (item.includedComponent) continue;
    const family = families.find((f) => f.ids.includes(item.id));
    const id = family?.id ?? item.id;
    if (result.some((row) => row.id === id)) continue;
    const all = family
      ? catalog.filter((m) => family.ids.includes(m.id))
      : [item];
    const variants = all.filter((m) => {
      if (category !== "All" && m.category !== category) return false;
      const keywords = paletteSearch(`${family?.name ?? ""} ${m.name} ${m.subtitle} ${m.search} ${pipeSize(m.id)?.label ?? ""}`);
      return terms.every((term) => keywords.includes(term));
    });
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


export function materialDisplayName(name: string) {
  return name.replace(/^(?:The )?(?:Home Depot|Lowe[’']s)(?:\s*[:·–—-]\s*|\s+)/i, "")
    .replace(/\s*·\s*(?:The )?(?:Home Depot|Lowe[’']s)(?: reference)?(?=\s*·|\s*$)/gi, "")
    .trim();
}

export function materialStockDisplayName(id: MaterialId) {
  const stock = material(id);
  const family = families.find(({ ids }) => ids.includes(id));
  const pipe = pipeSize(id);
  if (family && pipe) return `${family.name} · ${pipe.label}`;
  if (stock.category !== "Lumber" || stock.stockKind !== "linear") return materialDisplayName(stock.name);
  const length = Math.max(...(stock.stockSize ?? stock.size));
  return `${family?.name ?? paletteStockName(stock.name)} · ${formatStockLength(length)}`;
}

function paletteStockName(name: string) {
  return materialDisplayName(name)
    .replace(/\s*·\s*\d+(?:\.\d+)? ft\s*$/i, "")
    .replace(/\s*·\s*[^·]*\bactual\s*$/i, "")
    .replace(/^(.*)\s+·\s+(\S+) category$/, "$2 in $1")
    .trim();
}

function pipeSize(id: MaterialId) {
  const nominal = (pipe: PexPipeId) => pexPipes[pipe].nominal === "1/2" ? { value: 0.5, label: "½ in" } : { value: 0.75, label: "¾ in" };
  if (isPexPipe(id)) return nominal(id);
  if (isWaterSupport(id)) return nominal(waterSupportProducts[id].pipe);
  if (isWaterFitting(id)) {
    const { pipe, branch } = waterFittingProduct(id);
    const main = nominal(pipe);
    if (branch && branch.pipe !== pipe) return { ...main, label: `${main.label} run × ${nominal(branch.pipe).label} branch` };
    return main;
  }
}

export function materialPlacementOptions(group: MaterialGroup) {
  const preferred = material(group.preferred);
  const isPipeSize = !!pipeSize(preferred.id);
  const isThickness = group.id === "birch-plywood";
  const dimension = (stock: Material) => pipeSize(stock.id)?.value ??
    (isThickness ? Math.min(...stock.size) : Math.max(...(stock.stockSize ?? stock.size)));
  const representatives = new Map<number, { value: number; id: MaterialId; label: string }>();
  // The family order chooses the generic stock first when several products share a size.
  const available = [preferred, ...materialFamilyVariants(group.preferred).map(material)];
  for (const stock of available) {
    const pipe = pipeSize(stock.id);
    const value = dimension(stock);
    const label = pipe?.label ?? (isThickness ? formatPreciseInches(value) : formatStockLength(value));
    if (!representatives.has(value)) representatives.set(value, { value, id: stock.id, label });
  }
  const options = [...representatives.values()].sort((a, b) => a.value - b.value);
  // A size search (such as "12 ft 2x4") preselects that size but keeps the other choices.
  const matchedIds = new Set(group.variants.map(({ id }) => id));
  const matchedSizes = new Set(available.filter(({ id }) => matchedIds.has(id)).map(dimension));
  const matching = options.filter(({ value }) => matchedSizes.has(value));
  return {
    preferred: matching.length === 1 ? material(matching[0].id) : preferred,
    canCutToLength: preferred.wood && preferred.cuttable && preferred.stockKind === "linear",
    chooseSize: isPipeSize || options.length > 1,
    label: isThickness ? "Panel thickness" : isPipeSize ? "Pipe size" : "Stock length",
    options,
  };
}

export function materialPlacementName(group: MaterialGroup, id: MaterialId) {
  const size = pipeSize(id);
  return size ? `${group.name} · ${size.label}` : group.name;
}
