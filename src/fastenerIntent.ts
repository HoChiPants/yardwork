import type { FastenerPlan, FastenerPartRef } from "./fasteningSchema";

/** Baselines/history explain earlier work; only the active intent drives physical freshness. */
const activeReference = ({ baseline: _baseline, ...reference }: FastenerPartRef) => reference;

export function fastenerPhysicalIntent(plan: FastenerPlan) {
  const {
    createdAt: _created,
    updatedAt: _updated,
    nextLocationNumber: _counter,
    referenceHistory: _history,
    head,
    receiver,
    ...intent
  } = plan;
  return { ...intent, head: activeReference(head), receiver: activeReference(receiver) };
}
