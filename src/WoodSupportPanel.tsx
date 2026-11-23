import type { ReactNode } from "react";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import {
  woodSupportPath,
  woodSupportBreaks,
  woodSupportScope,
  type WoodSupportReview,
} from "./woodSupport";

export function WoodSupportPanel({
  project,
  review,
  pieceId,
  onInspect,
  onShowTrace,
  showingTrace,
  onReviewBearing,
  children,
}: {
  project: Project;
  review: WoodSupportReview;
  pieceId: string;
  onInspect: (pieceId: string) => void;
  onShowTrace: () => void;
  showingTrace: boolean;
  onReviewBearing?: () => void;
  children?: ReactNode;
}) {
  const row = review.get(pieceId);
  if (!row) return null;
  const path = woodSupportPath(review, pieceId);
  const breaks = woodSupportBreaks(review, pieceId).filter((id) => id !== pieceId);
  const neighbors = path.length
    ? path
    : row.supports.map(({ pieceId }) => review.get(pieceId)!.piece);
  return (
    <details className="connection-settings wood-support">
      <summary>Support to floor</summary>
      <div className="field-section">
        <p>
          {!row.geometryAvailable
            ? "Retained faces could not be reviewed. Check the part dimensions and cut profile."
            : row.onFloor
              ? "A retained face rests on the modeled floor."
              : path.length
                ? "Follow one contact path down to the floor."
                : row.supports.length
                  ? "These wood faces touch below this part. Their contact paths stop before reaching the floor."
                  : "No bearing face reaches another wood part or the floor. Check the part's position or review its hardware and support detail."}
        </p>
        {row.geometryAvailable && (
          <button className="button secondary full" type="button" aria-pressed={showingTrace}
            onClick={onShowTrace}>
            {showingTrace ? "Hide support paths" : "Show support paths in 3D"}
          </button>
        )}
        {!row.onFloor && neighbors.length > 0 && (
          <ol>
            {neighbors.map((piece) => (
              <li key={piece.id}>
                <button
                  className="button secondary full"
                  type="button"
                  onClick={() => onInspect(piece.id)}
                >
                  {partLabel(project, piece.id)} · {piece.name}
                </button>
              </li>
            ))}
            {path.length > 0 && <li>Modeled floor</li>}
          </ol>
        )}
        {breaks.length > 0 && <section aria-label="Contact breaks">
          <p>Check below {breaks.length === 1 ? "this part" : "these parts"}.</p>
          <ul>{breaks.map((id) => <li key={id}>
            <button className="text-button" type="button" onClick={() => onInspect(id)}>
              {partLabel(project, id)} · {review.get(id)?.piece.name}
            </button>
          </li>)}</ul>
        </section>}
        <p className="small-note">{woodSupportScope}</p>
        {onReviewBearing && (
          <button
            className="button secondary full"
            type="button"
            onClick={onReviewBearing}
          >
            Review bearing joints
          </button>
        )}
      </div>
      {children}
    </details>
  );
}
