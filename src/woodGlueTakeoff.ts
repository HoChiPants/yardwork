import { addSupply } from "./supplies";
import { maxSupplyQuantity } from "./supplySchema";
import type { Project } from "./model";
import { woodGlue } from "./woodGlueReference";

const purpose = "Nonstructural wood glue estimate";
const areaFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });
const squareInchesPerBottle = woodGlue.squareFeetPerGallon * 144 * woodGlue.bottleFluidOunces / 128;

export function estimateWoodGlue(squareInches: number, extraPercent: number) {
  if (!Number.isFinite(squareInches) || squareInches <= 0)
    throw Error("Enter a positive total area to coat.");
  if (!Number.isFinite(extraPercent) || extraPercent < 0 || extraPercent > 100)
    throw Error("Enter an allowance between 0 and 100 percent.");
  const bottles = Math.max(1, Math.ceil((squareInches / squareInchesPerBottle) * (1 + extraPercent / 100)));
  if (!Number.isSafeInteger(bottles) || bottles > maxSupplyQuantity)
    throw Error("Check the measured area before estimating bottles.");
  const note = `${areaFormat.format(squareInches)} sq in confirmed coated area · ${extraPercent}% extra · approximately ${woodGlue.squareFeetPerGallon} sq ft per gallon at Titebond's published minimum spread. Recheck the area after changing joints.`;
  return { bottles, note };
}

export function isWoodGlueEstimate(supply: Project["supplies"][number]) {
  return supply.productId === woodGlue.id && supply.purpose === purpose;
}

export function saveWoodGlueEstimate(project: Project, squareInches: number, extraPercent: number) {
  const { bottles, note } = estimateWoodGlue(squareInches, extraPercent);
  return addSupply({
    ...project,
    supplies: project.supplies.filter((supply) => !isWoodGlueEstimate(supply)),
  }, woodGlue.id, bottles, purpose, note);
}
