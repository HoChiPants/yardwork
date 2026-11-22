import type { PricingCoverage } from "./pricing";

export function PricingSummary({ coverage, compact = false, printable = false }: {
  coverage: PricingCoverage;
  compact?: boolean;
  printable?: boolean;
}) {
  const amount = coverage.pricedSubtotal;
  const partial = coverage.status === "partial";
  return (
    <section
      className={`pricing-summary${printable ? " pricing-summary-print" : compact ? " pricing-summary-compact" : ""}`}
      aria-label="Pricing coverage"
      data-pricing-status={coverage.status}
      data-priced-subtotal={amount ?? "unknown"}
    >
      {amount === null ? (
        <p className="small-note">Check your shopping list for current prices.</p>
      ) : (
        <>
          <strong>{amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong>
          {" "}{partial ? "partial estimate" : "estimate"} for materials and supplies
          <p className="small-note">
            {partial ? "Confirm the remaining costs with your shopping list." : "Check your shopping list for current prices."}
          </p>
        </>
      )}
    </section>
  );
}
