export type PriceSource = "snapshot" | "example" | "unknown";
export type PricingLine = {
  id: string;
  name: string;
  /** Count of purchase units, not the pieces contained in a pack. */
  quantity: number;
  purchaseUnit: string;
  priceSource: PriceSource;
  total: number | null;
};
export type UnresolvedPricingQuantity = {
  description: string;
  count?: number;
  unit?: string;
};
export type PricingBreakdown = {
  pricedSubtotal: number | null;
  observedSubtotal: number;
  exampleSubtotal: number;
  lineCount: number;
  pricedLineCount: number;
  observedLineCount: number;
  exampleLineCount: number;
  unpricedLineCount: number;
  /** A sum of purchase units; use the grouped units when presenting it. */
  unpricedPurchaseUnitQuantity: number;
  unpricedPurchaseUnits: { unit: string; quantity: number }[];
};
export type PricingCoverage = PricingBreakdown & {
  materials: PricingBreakdown;
  supplies: PricingBreakdown;
  excludedPartCount: number;
  unresolvedQuantities: UnresolvedPricingQuantity[];
  warnings: string[];
  status: "empty" | "partial" | "example" | "observed";
  scope: string;
};
export const PRICING_SCOPE =
  "Calculated stock and selected supplies only. Tax, delivery, tools and unmodeled systems are outside this subtotal. This is not a complete-project quote.";

function breakdown(lines: readonly PricingLine[]): PricingBreakdown {
  const quantities = new Map<string, number>();
  let observedSubtotal = 0,
    exampleSubtotal = 0,
    observedLineCount = 0,
    exampleLineCount = 0,
    unpricedLineCount = 0;
  const active = lines.filter(
    (line) => Number.isFinite(line.quantity) && line.quantity > 0,
  );
  for (const line of active) {
    const known =
      line.total !== null && Number.isFinite(line.total) && line.total >= 0;
    if (known && line.priceSource === "snapshot") {
      observedSubtotal += line.total!;
      observedLineCount++;
    } else if (known && line.priceSource === "example") {
      exampleSubtotal += line.total!;
      exampleLineCount++;
    } else {
      unpricedLineCount++;
      const unit = line.purchaseUnit.trim() || "purchase unit";
      quantities.set(unit, (quantities.get(unit) ?? 0) + line.quantity);
    }
  }
  const pricedLineCount = observedLineCount + exampleLineCount;
  return {
    pricedSubtotal: pricedLineCount ? observedSubtotal + exampleSubtotal : null,
    observedSubtotal,
    exampleSubtotal,
    lineCount: active.length,
    pricedLineCount,
    observedLineCount,
    exampleLineCount,
    unpricedLineCount,
    unpricedPurchaseUnitQuantity: [...quantities.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    ),
    unpricedPurchaseUnits: [...quantities].map(([unit, quantity]) => ({
      unit,
      quantity,
    })),
  };
}

/** Consumes already-validated price provenance; it never reads snapshots or invents prices. */
export function pricingCoverage(input: {
  materials: readonly PricingLine[];
  supplies: readonly PricingLine[];
  excludedPartCount?: number;
  unresolvedQuantities?: readonly UnresolvedPricingQuantity[];
  warnings?: readonly string[];
}): PricingCoverage {
  const materials = breakdown(input.materials),
    supplies = breakdown(input.supplies),
    combined = breakdown([...input.materials, ...input.supplies]),
    excludedPartCount = input.excludedPartCount ?? 0,
    unresolvedQuantities = [...(input.unresolvedQuantities ?? [])],
    incomplete =
      combined.unpricedLineCount > 0 ||
      excludedPartCount > 0 ||
      unresolvedQuantities.length > 0;
  return {
    ...combined,
    materials,
    supplies,
    excludedPartCount,
    unresolvedQuantities,
    warnings: [...new Set(input.warnings ?? [])],
    status: incomplete
      ? "partial"
      : !combined.lineCount
        ? "empty"
        : combined.exampleLineCount
          ? "example"
          : "observed",
    scope: PRICING_SCOPE,
  };
}

const money = (amount: number) =>
  `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (quantity: number, noun: string) =>
  `${quantity} ${noun}${quantity === 1 ? "" : "s"}`;
export function formatPricedSubtotal(
  coverage: Pick<PricingCoverage, "pricedSubtotal">,
): string {
  return coverage.pricedSubtotal === null
    ? "No priced subtotal"
    : `${money(coverage.pricedSubtotal)} priced subtotal`;
}
export function pricingCoverageText(coverage: PricingCoverage): string {
  const text = [
    `${count(coverage.pricedLineCount, "priced line")} of ${count(coverage.lineCount, "purchase line")}.`,
    `${money(coverage.observedSubtotal)} from ${count(coverage.observedLineCount, "observed line")}; ${money(coverage.exampleSubtotal)} from ${count(coverage.exampleLineCount, "example-price line")}.`,
  ];
  if (coverage.unpricedLineCount)
    text.push(
      `${count(coverage.unpricedLineCount, "unpriced line")} (${coverage.unpricedPurchaseUnits.map(({ unit, quantity }) => `${quantity} × ${unit}`).join("; ")} purchase units). Unknown prices are excluded, not free.`,
    );
  if (coverage.excludedPartCount)
    text.push(
      `${count(coverage.excludedPartCount, "oversized part")} excluded from purchase quantities.`,
    );
  text.push(
    ...coverage.unresolvedQuantities.map(
      (item) =>
        `${item.description}${item.count === undefined ? "" : ` (${item.count}${item.unit ? ` ${item.unit}` : ""})`}.`,
    ),
  );
  return text.join(" ");
}
export function pricingCoverageMarkdown(coverage: PricingCoverage): string {
  const safe = (value: string) =>
    value.replace(/[\r\n\t]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
  return `\n\n## Pricing coverage\n\n${formatPricedSubtotal(coverage)}${coverage.status === "partial" ? " · partial" : coverage.status === "example" ? " · includes example prices" : ""}.\n\n${safe(pricingCoverageText(coverage))}\n\nMaterials: ${coverage.materials.pricedSubtotal === null ? "unpriced" : money(coverage.materials.pricedSubtotal)}; selected supplies: ${coverage.supplies.pricedSubtotal === null ? "unpriced" : money(coverage.supplies.pricedSubtotal)}.\n\n${coverage.scope}\n${coverage.warnings.map((warning) => `\n- Review: ${safe(warning)}`).join("")}\n`;
}
