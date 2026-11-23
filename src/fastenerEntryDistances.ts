import { formatPreciseInches } from "./measurement";
import { sdwsReceiverDistanceCases } from "./sdwsFramingReference";

export type FastenerEntryDistance = { edge: number; end: number };
const tolerance = 1e-6;

export function compareFastenerReceiverDistances(productId: string, measured: FastenerEntryDistance) {
  return sdwsReceiverDistanceCases(productId).map(({ label, edge, end }) => ({
    label, edge, end,
    short: [measured.edge < edge - tolerance ? "edge" : "", measured.end < end - tolerance ? "end" : ""].filter(Boolean),
  }));
}

export function fastenerEntryDistanceText(label: string, measured: FastenerEntryDistance) {
  return `${label} center to nearest edge ${formatPreciseInches(measured.edge)} · nearest end ${formatPreciseInches(measured.end)}.`;
}

export function fastenerDistanceCaseText(row: ReturnType<typeof compareFastenerReceiverDistances>[number]) {
  return `${row.label} · ${formatPreciseInches(row.edge)} edge and ${formatPreciseInches(row.end)} end required · ${row.short.length ? `${row.short.join(" and ")} distance short` : "modeled distances meet this case"}.`;
}
