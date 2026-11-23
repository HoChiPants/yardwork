import { createBuildStudy, type BuildStudy } from "./buildFixtures";
import { cutKerf } from "./cutStock";
import {
  greenhouseBaseTimber,
  greenhouseBaseTimber12,
} from "./greenhouseBaseReference";
import { pureBondCasework } from "./homeDepotCaseworkReference";
import { homeDepotFraming } from "./homeDepotFramingReference";
import { material, type MaterialId } from "./model";
import { stockSplitState } from "./packing";
import { orientedStockSize } from "./stockAxes";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import {
  structureMaterialChoices,
  type StructureMaterials,
  type StructureRole,
} from "./structures";

const frameSizes = [
  homeDepotFraming.stud,
  homeDepotFraming.stud10,
  homeDepotFraming.stud12,
];
const ridgeSizes = [homeDepotFraming.ridge8, homeDepotFraming.ridge10, homeDepotFraming.ridge12];
const perimeterSizes = [greenhouseBaseTimber, greenhouseBaseTimber12];

function canTrim(stock: number, keep: number, kerf: number) {
  const fit = stockSplitState(stock, keep, kerf);
  return fit === "whole" || fit === "cut";
}

/** Each generated role uses one variant. Keep the longest reference if the parts still require review. */
function fitBoard(
  lengths: readonly number[],
  options: readonly { materialId: MaterialId }[],
) {
  return (
    options.find(({ materialId }) => {
      const stock = material(materialId);
      const length = Math.max(...(stock.stockSize ?? stock.size));
      const kerf = cutKerf(materialId);
      return lengths.every((cut) => canTrim(length, cut, kerf));
    }) ?? options[options.length - 1]
  ).materialId;
}

export function homeDepotStudyStock(
  study: BuildStudy,
  current: StructureMaterials,
): StructureMaterials {
  const { fixtureId, parameters, project } = study;
  if (project.retailer !== "home-depot") return {};
  const additions: StructureMaterials = {};
  function select(role: StructureRole, stockId: MaterialId) {
    if (!reviewedOfferForMaterial(material(stockId), "home-depot")) return;
    const option = structureMaterialChoices(role).find(
      (candidate) => candidate.materialId === stockId,
    );
    if (option)
      additions[role] = {
        materialId: stockId,
        productRegistryRef: option.productRegistryRef,
      };
  }

  let baseStudy = study;
  if (
    fixtureId === "greenhouse" &&
    !current.greenhouseBase &&
    study.structure
  ) {
    const { outsideWallFrameWidth, outsideWallFrameDepth } =
      study.structure.dimensions;
    // The two side rails run between the full-width front and back rails.
    const side = outsideWallFrameDepth - 2 * greenhouseBaseTimber.size[0];
    select(
      "greenhouseBase",
      fitBoard([outsideWallFrameWidth, side], perimeterSizes),
    );
    if (additions.greenhouseBase && !current.frameLumber) {
      try {
        // The timber raises the wall origin, changing the stud blanks used in stock selection.
        baseStudy = createBuildStudy(fixtureId, parameters, project, {
          ...current,
          ...additions,
        });
      } catch {
        // Let the normal preview report a dimensional conflict if the chosen base cannot fit.
      }
    }
  }

  const parts = baseStudy.project.pieces.filter(({ offcut }) => !offcut);
  const frame =
    fixtureId === "greenhouse" ||
    fixtureId === "sauna" ||
    fixtureId === "storage-banquette";
  const casework =
    fixtureId === "storage-banquette" ||
    fixtureId === "shelves" ||
    fixtureId === "closet-insert";
  if (frame && !current.frameLumber) {
    const baseIds = new Set(baseStudy.structure?.geometryRoles["base-framing"]);
    const lengths = parts
      .filter(({ id, material }) => material === "stud" && !baseIds.has(id))
      .map((part) => orientedStockSize(part)[2]);
    select("frameLumber", fitBoard(lengths, frameSizes));
  }
  if (casework && !current.caseworkPanels) {
    const stock = "plytanium-703";
    const [, width, length] = [...material(stock).size].sort((a, b) => a - b);
    const panels = parts
      .filter(({ material }) => material === "plywood")
      .map((piece) => orientedStockSize(piece));
    const kerf = cutKerf(stock);
    const fits = panels.every(
      ([, w, l]) => canTrim(width, w, kerf) && canTrim(length, l, kerf),
    );
    select("caseworkPanels", fits ? stock : pureBondCasework.materialId);
  }
  if (fixtureId === "greenhouse" && !current.ridgeLumber) {
    const lengths = parts
      .filter(({ material }) => material === "two-six")
      .map((part) => orientedStockSize(part)[2]);
    select("ridgeLumber", fitBoard(lengths, ridgeSizes));
  }
  return additions;
}
