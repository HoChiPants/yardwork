import { material, pieceSchema, type Piece, type Project } from "./model";
import { openingAxes } from "./throughOpenings";
import {
  rectangularOpeningSchema,
  roundOpeningSchema,
  type RectangularOpening,
  type RoundOpening,
  type ThroughOpening,
} from "./throughOpeningSchema";

export function canEditThroughOpenings(piece: Piece) {
  const stock = material(piece.material);
  return (
    !piece.cutPlanes.length &&
    stock.shape !== "tube-envelope" &&
    (stock.cuttable || stock.orderRollWidth !== undefined)
  );
}

type OpeningMarks = {
  axis: ThroughOpening["axis"];
  fromEdges: [number, number];
};
export type RoundOpeningMarks = OpeningMarks & { diameter: number };
export type RectangularOpeningMarks = OpeningMarks & {
  spans: [number, number];
};
export type ThroughOpeningMarks = RoundOpeningMarks | RectangularOpeningMarks;

export function roundOpeningMarks(
  piece: Piece,
  opening: RoundOpening,
): RoundOpeningMarks {
  const [u, v] = openingAxes(opening.axis);
  return {
    axis: opening.axis,
    diameter: opening.diameter,
    fromEdges: [
      opening.center[0] + piece.size[u] / 2,
      opening.center[1] + piece.size[v] / 2,
    ],
  };
}

export function rectangularOpeningMarks(
  piece: Piece,
  opening: RectangularOpening,
): RectangularOpeningMarks {
  const [u, v] = openingAxes(opening.axis);
  return {
    axis: opening.axis,
    spans: opening.spans,
    fromEdges: [
      opening.center[0] + (piece.size[u] - opening.spans[0]) / 2,
      opening.center[1] + (piece.size[v] - opening.spans[1]) / 2,
    ],
  };
}

export function editRoundOpening(
  project: Project,
  pieceId: string,
  index: number | null,
  marks: RoundOpeningMarks | null,
): Project {
  return editThroughOpening(project, pieceId, "roundOpenings", index, marks);
}

/** Apply one staged opening edit, preserving stock identity and independent cuts. */
export function editThroughOpening(
  project: Project,
  pieceId: string,
  shape: "roundOpenings" | "rectangularOpenings",
  index: number | null,
  marks: ThroughOpeningMarks | null,
): Project {
  const piece = project.pieces.find(({ id }) => id === pieceId);
  if (!piece || !canEditThroughOpenings(piece))
    throw Error("Choose rectangular stock that supports through-cuts.");
  const openings = piece[shape] ?? [];
  if (index !== null) {
    const existing = openings[index];
    if (!existing || !Number.isInteger(index))
      throw Error("Choose an existing opening.");
    if ("source" in existing && existing.source)
      throw Error("waterRunId" in existing.source ? "Edit this bore in the wall water-line planner." : "Edit this opening in the sauna ventilation layout.");
  }
  if (!marks && index === null) return project;
  const updated = [...openings] as ThroughOpening[];
  if (marks) {
    const [u, v] = openingAxes(marks.axis);
    const [x, y] = marks.fromEdges;
    if (!marks.fromEdges.every(Number.isFinite))
      throw Error("Enter two valid edge marks.");
    let opening: ThroughOpening;
    if ("spans" in marks && shape === "rectangularOpenings") {
      if (
        marks.spans.some(
          (span) => !Number.isFinite(span) || span < 0.125 || span > 480,
        )
      )
        throw Error("Enter both cut sides from 0.125 to 480 inches.");
      opening = rectangularOpeningSchema.parse({
        axis: marks.axis,
        center: [
          x + (marks.spans[0] - piece.size[u]) / 2,
          y + (marks.spans[1] - piece.size[v]) / 2,
        ],
        spans: marks.spans,
      });
    } else if ("diameter" in marks && shape === "roundOpenings") {
      if (
        !Number.isFinite(marks.diameter) ||
        marks.diameter < 0.125 ||
        marks.diameter > 48
      )
        throw Error("Enter a diameter from 0.125 to 48 inches.");
      opening = roundOpeningSchema.parse({
        axis: marks.axis,
        center: [x - piece.size[u] / 2, y - piece.size[v] / 2],
        diameter: marks.diameter,
      });
    } else throw Error("Choose fields that match the cut shape.");
    if (index === null) updated.push(opening);
    else updated[index] = opening;
  } else if (index !== null) updated.splice(index, 1);
  if (JSON.stringify(openings) === JSON.stringify(updated)) return project;
  const { [shape]: _old, ...blank } = piece;
  const validated = pieceSchema.safeParse({
    ...blank,
    ...(updated.length ? { [shape]: updated } : {}),
  });
  if (!validated.success) throw Error(validated.error.issues[0].message);
  return {
    ...project,
    pieces: project.pieces.map((other) =>
      other.id === pieceId ? validated.data : other,
    ),
  };
}
