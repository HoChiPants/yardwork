import { dryerFittings, type DryerExhaust } from "./dryerExhaustSchema";
import { formatStockLength } from "./measurement";
import type { CodeReviewRow } from "./projectCode";
import { utahSources } from "./utahCodeSources";

export const utahDryerReviewDate = "2026-11-20";
const fixedDuctLimit = 35 * 12;
const transitionLimit = 8 * 12;
const epsilon = 1e-8;
const references = [
  utahSources.ircDryerExhaust,
  utahSources.ircMechanicalAmendments,
  utahSources.local,
];
export const dryerLengthMethods = {
  unknown: "Confirm length method",
  specified: "IRC specified length with fitting allowances",
  manufacturer: "Dryer manufacturer’s instructions",
  "power-ventilator": "Listed dryer exhaust power ventilator instructions",
} as const;

const row = (
  id: string,
  label: string,
  state: CodeReviewRow["state"],
  detail: string,
): CodeReviewRow => ({ id, label, state, detail, sources: references });

export function dryerExhaustRows(
  plan: DryerExhaust,
  reviewedScope: boolean,
): CodeReviewRow[] {
  const scope = (state: CodeReviewRow["state"], detail: string) =>
    row("dryer-exhaust-scope", "Dryer exhaust scope", state, detail);
  if (!reviewedScope)
    return [
      scope(
        "authority-review",
        `Confirm the Utah residential code path and local applicability. The dryer comparison covers project dates from July 1, 2026 through ${utahDryerReviewDate}.`,
      ),
    ];
  if (plan.appliance === "unknown")
    return [
      scope("needs-input", "Confirm whether the dryer uses a ducted exhaust."),
    ];
  if (plan.appliance === "ductless")
    return [
      scope(
        "authority-review",
        "Confirm the delivered ductless appliance’s listing and installation instructions.",
      ),
    ];

  const route = (state: CodeReviewRow["state"], detail: string) =>
    row("dryer-exhaust-length", "Dryer exhaust duct length", state, detail);
  let run: CodeReviewRow;
  if (plan.lengthMethod === "unknown") {
    run = route(
      "needs-input",
      "Choose the applicable length method with the installation instructions and the building authority.",
    );
  } else if (plan.lengthMethod !== "specified") {
    run = route(
      "authority-review",
      `Review the route with the ${dryerLengthMethods[plan.lengthMethod].toLowerCase()}. Use the equipment’s actual length limits, fitting data and conditions.`,
    );
  } else if (plan.runLength === null || !plan.fittingsAccountedFor) {
    run = route(
      "needs-input",
      "Enter the full fixed duct run and account for its fittings. Confirm the applicable length method if any fitting is unlisted.",
    );
  } else {
    const allowance = Object.entries(dryerFittings).reduce(
      (sum, [key, fitting]) =>
        sum +
        (plan.fittingCounts[key as keyof typeof dryerFittings] ?? 0) *
          fitting.length,
      0,
    );
    const equivalent = plan.runLength + allowance;
    const difference = equivalent - fixedDuctLimit;
    const exceeds = difference > epsilon;
    const margin = exceeds
      ? `${formatStockLength(difference)} above the reference.`
      : -difference > epsilon
        ? `${formatStockLength(-difference)} below the reference.`
        : "At the reference limit.";
    run = route(
      exceeds ? "discrepancy" : "measured-match",
      `Equivalent length ${formatStockLength(equivalent)} (${formatStockLength(plan.runLength)} run plus ${formatStockLength(allowance)} for fittings). IRC specified-length reference ${formatStockLength(fixedDuctLimit)}. ${margin} Sources reviewed through ${utahDryerReviewDate}.`,
    );
  }
  const connector = plan.transitionLength;
  const length =
    connector === null
      ? row(
          "dryer-transition-length",
          "Dryer transition connector length",
          "needs-input",
          "Record the length of the separate connector if the installation uses one.",
        )
      : row(
          "dryer-transition-length",
          "Dryer transition connector length",
          connector > transitionLimit + epsilon
            ? "discrepancy"
            : "measured-match",
          `Entered transition connector ${formatStockLength(connector)}. IRC length reference ${formatStockLength(transitionLimit)}.`,
        );
  const concealment = row(
    "dryer-transition-concealment",
    "Dryer transition connector location",
    plan.transitionConcealed === "unknown"
      ? "needs-input"
      : plan.transitionConcealed === "yes"
        ? "discrepancy"
        : "recorded-condition",
    plan.transitionConcealed === "unknown"
      ? "Confirm the connector location and listing if the installation uses one."
      : plan.transitionConcealed === "yes"
        ? "The plan places the transition connector inside construction. Review its location."
        : "The entered connector location is outside concealed construction. Confirm the delivered connector’s listing and installation.",
  );
  return [run, length, concealment];
}

export function dryerExhaustGuideLines(plan: DryerExhaust) {
  if (plan.appliance !== "ducted") return [];
  const fittings = Object.entries(dryerFittings).flatMap(([key, fitting]) => {
    const count = plan.fittingCounts[key as keyof typeof dryerFittings];
    return count ? [`${count} × ${fitting.label}`] : [];
  });
  return [
    `Dryer exhaust length method · ${dryerLengthMethods[plan.lengthMethod]}`,
    ...(plan.runLength !== null
      ? [
          `Entered fixed exhaust duct run · ${formatStockLength(plan.runLength)}`,
        ]
      : []),
    ...(plan.lengthMethod === "specified"
      ? [
          `Entered fittings · ${fittings.length ? fittings.join(", ") : plan.fittingsAccountedFor ? "None recorded on the route" : "Count pending"}. ${plan.fittingsAccountedFor ? "Fitting count confirmed." : "Confirm the route fitting count."}`,
        ]
      : []),
    ...(plan.transitionLength !== null
      ? [
          `Entered separate transition connector · ${formatStockLength(plan.transitionLength)}`,
        ]
      : []),
  ];
}
