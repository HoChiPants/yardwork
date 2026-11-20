import type { Project, V3 } from "./model";
import { pickFastenerSurface } from "./fastenerPicking";
import {
  fittedStockFaces,
  pickFittedStockFace,
  type FittedFaceRef,
} from "./fittedStock";

/**
 * Render-only adapter. Float32 mesh positions in feet are not exact inch datums.
 * Resolve only the existing bounded render-plane/normal correction, then run the
 * authoritative retained-face checks. Typed/manual datum entry never uses this.
 */
export function pickRenderedFittedStockFace(
  project: Project,
  pieceId: string,
  pointLocal: V3,
  outwardLocal: V3,
): FittedFaceRef {
  const target = project.pieces.find((piece) => piece.id === pieceId);
  if (!target)
    throw Error("Choose an actual current wood member for the face pick.");
  const corrected = pickFastenerSurface(
    target,
    pointLocal,
    outwardLocal.map((value) => -value) as V3,
  );
  const ref = pickFittedStockFace(
    project,
    pieceId,
    corrected.entranceLocal,
    corrected.driveLocal.map((value) => (value === 0 ? 0 : -value)) as V3,
  );
  const incident = fittedStockFaces(project, pieceId).filter(
    (face) =>
      Math.abs(
        face.normalLocal.reduce(
          (sum, value, axis) =>
            sum + value * (ref.pointLocal[axis] - face.centerLocal[axis]),
          0,
        ),
      ) <= 1e-7,
  );
  if (incident.length !== 1)
    throw Error(
      "Pick inside one retained face, away from a sharp edge or corner.",
    );
  return ref;
}
