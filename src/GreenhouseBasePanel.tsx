import { useMemo } from "react";
import type { ConnectionIntent } from "./connectionCoverage";
import {
  greenhouseBaseConnections,
  greenhouseBaseCornerText,
  greenhouseBaseScope,
  greenhouseBaseSummary,
  greenhouseCornerAligned,
  type GreenhouseRailFit,
} from "./greenhouseBaseConnections";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

export type GreenhouseRailAdjustment = {
  draft: { entryId: string; sideId: string; fit: GreenhouseRailFit } | null;
  preview: (entryId: string, sideId: string) => void;
  apply: () => void;
  cancel: () => void;
};

export function GreenhouseBasePanel({
  project,
  memberIds,
  intents,
  entryId,
  onPlanPair,
  onReviewIntent,
  onInspectPiece,
  adjustment,
  onMeasureFoundation,
}: {
  project: Project;
  memberIds: readonly string[];
  intents: readonly ConnectionIntent[];
  entryId?: string;
  onPlanPair: (a: string, b: string) => void;
  onReviewIntent: (intent: ConnectionIntent) => void;
  onInspectPiece: (id: string) => void;
  adjustment?: GreenhouseRailAdjustment;
  onMeasureFoundation?: () => void;
}) {
  const reviews = useMemo(
    () => greenhouseBaseConnections(project, intents),
    [project, intents],
  );
  const selected = new Set(memberIds);
  const shown = reviews.filter((review) =>
    entryId
      ? review.entryId === entryId
      : review.memberIds.some((id) => selected.has(id)),
  );
  if (!shown.length) return null;
  return (
    <details
      className="field-section greenhouse-base-connections"
      open={entryId ? true : undefined}
    >
      <summary>Greenhouse base corners</summary>
      <p className="small-note">{greenhouseBaseScope}</p>
      {onMeasureFoundation && (
        <button type="button" className="button secondary small" onClick={onMeasureFoundation}>
          Greenhouse foundation footprint
        </button>
      )}
      {shown.map(({ entryId, title, corners }) => (
        <section key={entryId} aria-label={`Base corners for ${title}`}>
          <p className="small-note">{greenhouseBaseSummary(corners).line}</p>
          {adjustment &&
            (["left", "right"] as const).map((side) => {
              const ends = corners.filter((corner) => corner.side === side);
              const sideId = ends[0].sideId;
              if (!sideId || ends.every(greenhouseCornerAligned)) return null;
              const draft = adjustment.draft;
              const fit =
                draft?.entryId === entryId && draft.sideId === sideId
                  ? draft.fit
                  : null;
              return (
                <div key={side} className="field-section">
                  {!fit ? (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => adjustment.preview(entryId, sideId)}
                    >
                      Preview {side} rail adjustment
                    </button>
                  ) : (
                    <>
                      <p className="small-note" role="status">
                        {fit.kind === "move"
                          ? `Both ${side} corners line up at the blue preview. Move ${fit.offset
                              .flatMap((value, axis) =>
                                Math.abs(value) > 1e-7
                                  ? [
                                      `${["X", "Y", "Z"][axis]} ${value > 0 ? "+" : "−"}${formatStockLength(Math.abs(value))}`,
                                    ]
                                  : [],
                              )
                              .join(", ")}.`
                          : fit.reason}
                      </p>
                      <div className="button-row">
                        {fit.kind === "move" && (
                          <button
                            type="button"
                            className="button primary small"
                            onClick={adjustment.apply}
                          >
                            Apply {side} rail adjustment
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-button"
                          onClick={adjustment.cancel}
                        >
                          {fit.kind === "move" ? "Cancel preview" : "Dismiss"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          {corners.map((corner) => {
            const { pair, geometry, hardware } = greenhouseBaseCornerText(
              project,
              corner,
            );
            const plans = [
              ...new Map(
                corner.intents
                  .filter(({ kind }) => kind !== "legacy-joint")
                  .map((intent) => [intent.planId, intent]),
              ).values(),
            ];
            const { sideId, endId } = corner;
            const planPair =
              greenhouseCornerAligned(corner) &&
              plans.every(
                ({ state }) => state === "stale" || state === "conflict",
              );
            return (
              <div
                key={corner.label}
                className="field-section"
                data-base-corner={corner.label}
                data-fit-state={
                  corner.fit?.state === "face-contact" &&
                  !greenhouseCornerAligned(corner)
                    ? "misaligned"
                    : (corner.fit?.state ?? "missing")
                }
              >
                <strong>
                  {corner.label} · {pair}
                </strong>
                <p className="small-note">
                  {geometry} · {hardware}
                </p>
                <div className="button-row">
                  {[sideId, endId].map(
                    (id) =>
                      id && (
                        <button
                          key={id}
                          type="button"
                          className="text-button"
                          onClick={() => onInspectPiece(id)}
                        >
                          Inspect {partLabel(project, id)}
                        </button>
                      ),
                  )}
                  {plans.map((intent) => (
                    <button
                      key={intent.planId}
                      type="button"
                      className="text-button"
                      onClick={() => onReviewIntent(intent)}
                    >
                      Review {intent.label.split("/")[0]}
                    </button>
                  ))}
                  {planPair && sideId && endId && (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => onPlanPair(endId, sideId)}
                    >
                      Plan screw path
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </details>
  );
}
