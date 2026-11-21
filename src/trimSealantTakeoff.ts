import { formatPreciseInches, formatStockLength } from "./measurement";
import { maxSupplyQuantity } from "./supplySchema";
import { trimSealant } from "./trimSealantReference";

export function estimateTrimSealant(input: {
  lengthInches: number;
  gapWidth: number;
  gapDepth: number;
  fieldCoverageFeet?: number;
}) {
  const { lengthInches, gapWidth, gapDepth, fieldCoverageFeet } = input;
  if (![lengthInches, gapWidth, gapDepth].every((n) => Number.isFinite(n) && n > 0))
    throw Error("Enter a positive measured length, gap width and gap depth.");
  if (gapWidth > trimSealant.screenWidth || gapDepth > trimSealant.screenDepth)
    throw Error(trimSealant.scope);
  if (fieldCoverageFeet === undefined && Math.max(gapWidth, gapDepth) > trimSealant.beadInches)
    throw Error("Use coverage from a trial for a gap wider or deeper than the 3/16 in reference bead.");

  const coverage = fieldCoverageFeet ?? trimSealant.coverageFeet;
  if (!Number.isFinite(coverage) || coverage <= 0)
    throw Error("Enter positive coverage measured with one cartridge.");
  const cartridgeUse = lengthInches / (12 * coverage);
  const cartridges = Math.ceil(cartridgeUse);
  if (!Number.isSafeInteger(cartridges) || cartridges < 1 || cartridges > maxSupplyQuantity)
    throw Error("Check the measured length and coverage before estimating cartridges.");

  const basis = fieldCoverageFeet === undefined
    ? `DAP coverage of ${coverage} ft per cartridge at a ${trimSealant.bead} bead`
    : `${coverage} ft per cartridge from a field trial`;
  const note = [
    `${formatStockLength(lengthInches)} of dry interior trim seams`,
    `maximum measured gap ${formatPreciseInches(gapWidth)} wide and ${formatPreciseInches(gapDepth)} deep`,
    basis,
  ].join(" · ") + ". Check color and finish on matching scrap before application.";
  return { cartridges, cartridgeUse, note };
}
