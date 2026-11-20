/** Physical stock items and retailer sell units have distinct counts. No ownership or reuse is inferred. */
export function purchaseCount(physicalStockUnits: number, packCount: number) {
  if (!Number.isSafeInteger(physicalStockUnits) || physicalStockUnits < 0)
    throw Error(
      "Required physical stock units must be a nonnegative whole number.",
    );
  if (!Number.isSafeInteger(packCount) || packCount < 1)
    throw Error(
      "A purchase pack must contain a positive whole number of stock items.",
    );
  const quantity = Math.ceil(physicalStockUnits / packCount),
    purchasedStockUnits = quantity * packCount;
  if (!Number.isSafeInteger(purchasedStockUnits))
    throw Error(
      "The purchased stock count exceeds the supported whole-number range.",
    );
  return {
    physicalStockUnits,
    packCount,
    quantity,
    purchasedStockUnits,
    surplusStockUnits: purchasedStockUnits - physicalStockUnits,
  };
}

export function purchaseUnitLabel(unit: string, quantity: number) {
  if (quantity === 1 || unit === "each" || unit === "linear ft") return unit;
  if (unit.endsWith("box")) return `${unit}es`;
  if (/[^aeiou ]y$/.test(unit)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}
