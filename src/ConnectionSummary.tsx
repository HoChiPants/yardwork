import type { ConnectionCoverage } from "./connectionCoverage";
import { groupedConnectionIntents } from "./GuideConnections";

/** Counts saved source plans once; locations, purchases and installed work stay separate. */
export function ConnectionSummary({
  coverage,
  onReview,
}: {
  coverage: ConnectionCoverage;
  onReview: () => void;
}) {
  const groups = groupedConnectionIntents(coverage.intents),
    plans = groups.filter(
      (group) => group.first.kind !== "legacy-joint",
    ).length,
    quantities = groups.length - plans;
  return (
    <button
      type="button"
      className="connection-summary"
      disabled={!coverage.parts.length && !groups.length}
      aria-label={`Review ${plans} connection ${plans === 1 ? "plan" : "plans"} and ${quantities} quantity ${quantities === 1 ? "record" : "records"}`}
      title="Saved screw, hinge, shelf-support and restraint plans; legacy quantities stay separate. These counts do not describe installed connections."
      onClick={onReview}
    >
      {plans} connection {plans === 1 ? "plan" : "plans"}
      {quantities > 0 && (
        <>
          {" "}
          + {quantities} quantity {quantities === 1 ? "record" : "records"}
        </>
      )}
    </button>
  );
}
