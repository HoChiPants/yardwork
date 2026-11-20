import { formatPricedSubtotal, type PricingCoverage } from "./pricing";

const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const count = (value: number, singular: string, plural = `${singular}s`) =>
  `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
const purchaseUnits = (rows: PricingCoverage["unpricedPurchaseUnits"]) =>
  rows
    .map(({ unit, quantity }) =>
      count(
        quantity,
        unit,
        unit.endsWith("box")
          ? `${unit}es`
          : unit.endsWith("s")
            ? unit
            : `${unit}s`,
      ),
    )
    .join(" + ");
const statuses: Record<PricingCoverage["status"], string> = {
  empty: "No priced purchases yet",
  partial: "Partial pricing",
  example: "Includes example prices",
  observed: "Observed snapshot prices",
};

/** Derived coverage only. The parent supplies validated rows and quantity context. */
export function PricingSummary({
  coverage,
  compact = false,
  printable = false,
}: {
  coverage: PricingCoverage;
  compact?: boolean;
  printable?: boolean;
}) {
  return (
    <section
      className={`pricing-summary${printable ? " pricing-summary-print" : ""}${compact ? " pricing-summary-compact" : ""}`}
      aria-label="Pricing coverage"
      data-pricing-status={coverage.status}
      data-priced-subtotal={
        coverage.pricedSubtotal === null ? "unknown" : coverage.pricedSubtotal
      }
      style={{
        minWidth: 0,
        overflowWrap: "anywhere",
        paddingBlock: printable ? 0 : compact ? 4 : 12,
      }}
    >
      <strong
        aria-label={formatPricedSubtotal(coverage)}
        style={{
          display: "block",
          fontWeight: 500,
          color: printable ? "inherit" : "#6e8659",
          lineHeight: 1.25,
        }}
      >
        <span
          style={{
            fontSize: compact ? 15 : printable ? 19 : 29,
            letterSpacing: compact || printable ? undefined : -1,
          }}
        >
          {coverage.pricedSubtotal === null
            ? "No priced subtotal"
            : money(coverage.pricedSubtotal)}
        </span>
        {coverage.pricedSubtotal !== null && (
          <span style={{ fontSize: compact ? 11 : 12 }}> priced subtotal</span>
        )}
      </strong>
      <p className="small-note">
        {statuses[coverage.status]} ·{" "}
        {count(coverage.pricedLineCount, "priced line")} of{" "}
        {count(coverage.lineCount, "purchase line")}.
      </p>
      <p className="small-note">
        {coverage.observedLineCount
          ? `${money(coverage.observedSubtotal)} from ${count(coverage.observedLineCount, "observed line")}`
          : "No matching observed-price lines"}
        {" · "}
        {coverage.exampleLineCount
          ? `${money(coverage.exampleSubtotal)} from ${count(coverage.exampleLineCount, "example line")}`
          : "No example-price lines"}
        .
      </p>
      {coverage.unpricedLineCount > 0 && (
        <p className="small-note" data-testid="pricing-unpriced">
          Unpriced: {count(coverage.unpricedLineCount, "line")} ·{" "}
          {purchaseUnits(coverage.unpricedPurchaseUnits)}. Unknown prices are
          excluded from the subtotal.
        </p>
      )}
      {coverage.excludedPartCount > 0 && (
        <p className="small-note" data-testid="pricing-excluded">
          Excluded quantities:{" "}
          {count(coverage.excludedPartCount, "physical part")} outside
          calculated stock coverage.
        </p>
      )}
      {coverage.unresolvedQuantities.length > 0 && (
        <p className="small-note">
          {count(coverage.unresolvedQuantities.length, "quantity review item")}{" "}
          remain. Review unresolved identities and quantities; some demand is
          excluded or conservatively counted.
        </p>
      )}
      <p className="small-note">{coverage.scope}</p>
      <details open={printable}>
        <summary>Pricing coverage and scope</summary>
        <div style={{ overflowX: "auto" }}>
          <table
            className="pricing-breakdown"
            style={{ width: "100%", fontSize: 11 }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Purchases</th>
                <th>Priced subtotal</th>
                <th>Unpriced</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Materials", coverage.materials],
                  ["Supplies", coverage.supplies],
                ] as const
              ).map(([label, group]) => (
                <tr key={label}>
                  <th style={{ textAlign: "left", fontWeight: 400 }}>
                    {label}
                  </th>
                  <td>
                    {group.pricedSubtotal === null
                      ? "Unknown"
                      : money(group.pricedSubtotal)}
                  </td>
                  <td>
                    {count(group.unpricedLineCount, "line")}
                    {group.unpricedLineCount > 0 && (
                      <>
                        <br />
                        {purchaseUnits(group.unpricedPurchaseUnits)}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {coverage.unresolvedQuantities.length > 0 && (
          <div data-testid="pricing-unresolved">
            <p className="small-note">
              <strong>Quantities still need review</strong>
            </p>
            <ul className="small-note">
              {coverage.unresolvedQuantities.map((entry, index) => (
                <li key={`${entry.description}/${index}`}>
                  {entry.count === undefined
                    ? ""
                    : `${entry.count.toLocaleString()}${entry.unit ? ` ${entry.unit}` : ""} · `}
                  {entry.description}
                </li>
              ))}
            </ul>
          </div>
        )}
        {coverage.warnings.length > 0 && (
          <ul className="small-note">
            {coverage.warnings.map((warning, index) => (
              <li key={`${warning}/${index}`}>{warning}</li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
