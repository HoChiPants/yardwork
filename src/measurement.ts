import type { V3 } from "./model";

/** Whole feet only when exact to numerical roundoff; all other dimensions stay in inches. */
export function preferredLengthUnit(inches: number): "ft" | "in" {
  return Number.isFinite(inches) && Math.abs(inches) >= 12 && Math.abs(inches / 12 - Math.round(inches / 12)) < 1e-9 ? "ft" : "in";
}
export function formatStockLength(inches: number): string {
  return preferredLengthUnit(inches) === "ft" ? `${Math.round(inches / 12)} ft` : formatPreciseInches(inches);
}

/** Decimal inches for source thickness and hole schedules; model values stay unrounded. */
export function formatPreciseInches(inches: number): string {
  return Number.isFinite(inches) ? `${Number(inches.toFixed(5))} in` : "—";
}

/** Measurements use the persisted model's inches, never rendered scene feet. */
export function measureBetween(a: V3, b: V3): { distance: number; delta: V3 } {
  if (![...a, ...b].every(Number.isFinite))
    throw new Error(
      "Measurement endpoints must contain finite inch coordinates.",
    );
  const delta = b.map((v, i) => v - a[i]) as V3;
  return { distance: Math.hypot(...delta), delta };
}

/** Readable feet/inches, rounded only for display; signed deltas stay signed. */
export function formatMeasurement(inches: number): string {
  if (!Number.isFinite(inches)) return "—";
  const hundredths = Math.round(Math.abs(inches) * 100);
  const feet = Math.floor(hundredths / 1200);
  const remainder = (hundredths % 1200) / 100;
  const sign = inches < 0 && hundredths !== 0 ? "−" : "";
  return `${sign}${feet ? `${feet}′${remainder ? ` ${remainder}″` : ""}` : `${remainder}″`}`;
}
