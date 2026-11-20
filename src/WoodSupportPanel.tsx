import type { Project } from "./model";
import { partLabel } from "./partLabels";
import {
  woodSupportPath,
  woodSupportScope,
  type WoodSupportReview,
} from "./woodSupport";

export function WoodSupportPanel({
  project,
  review,
  pieceId,
  onInspect,
  onReviewBearing,
}: {
  project: Project;
  review: WoodSupportReview;
  pieceId: string;
  onInspect: (pieceId: string) => void;
  onReviewBearing?: () => void;
}) {
  const row = review.get(pieceId);
  if (!row) return null;
  const path = woodSupportPath(review, pieceId);
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
    </details>
  );
}
