import { useId, useMemo, useState, type MouseEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { Piece, Project } from "./model";
import {
  openingCutoutInstructions, openingCutoutReview, recordOpeningCutout,
} from "./openingCutouts";
import { partLabel } from "./partLabels";
import {
  editThroughOpening,
  rectangularOpeningMarks,
  roundOpeningMarks,
  type ThroughOpeningMarks,
} from "./throughOpeningCuts";
import { openingAxes, pieceThroughOpenings } from "./throughOpenings";
import type { ThroughOpening } from "./throughOpeningSchema";
import { stockAxes } from "./stockAxes";

const axes = [0, 1, 2] as const;
const names = ["X", "Y", "Z"];

function centered(
  piece: Piece,
  axis: ThroughOpening["axis"],
  rectangular: boolean,
): ThroughOpeningMarks {
  const [u, v] = openingAxes(axis);
  if (rectangular) {
    const width = Math.max(0.125, Math.min(3, piece.size[u] / 2));
    const height = Math.max(0.125, Math.min(3, piece.size[v] / 2));
    return {
      axis,
      fromEdges: [(piece.size[u] - width) / 2, (piece.size[v] - height) / 2],
      spans: [width, height],
    };
  }
  return {
    axis,
    fromEdges: [piece.size[u] / 2, piece.size[v] / 2],
    diameter: Math.max(
      0.125,
      Math.min(2, piece.size[u] / 2, piece.size[v] / 2),
    ),
  };
}

function marksFor(piece: Piece, opening: ThroughOpening): ThroughOpeningMarks {
  return "spans" in opening
    ? rectangularOpeningMarks(piece, opening)
    : roundOpeningMarks(piece, opening);
}

export function ThroughOpeningEditor({
  project,
  piece,
  rectangular,
  onApply,
  onRecover,
  onClose,
}: {
  project: Project;
  piece: Piece;
  rectangular: boolean;
  onApply: (project: Project) => void;
  onRecover: (project: Project) => void;
  onClose: () => void;
}) {
  const shape = rectangular ? "rectangularOpenings" : "roundOpenings";
  const openings = piece[shape] ?? [];
  const all = pieceThroughOpenings(piece);
  const firstAxis = all[0]?.axis ?? stockAxes(piece).thickness;
  const full = all.length >= 6;
  const editable = openings.flatMap((opening, index) =>
    "source" in opening && opening.source ? [] : [{ opening, index }],
  );
  const [index, setIndex] = useState<number | null>(
    full ? (editable[0]?.index ?? null) : null,
  );
  const [removing, setRemoving] = useState(false);
  const [marks, setMarks] = useState(() =>
    index === null
      ? centered(piece, firstAxis, rectangular)
      : marksFor(piece, openings[index]),
  );
  const cutout = rectangular && index !== null && !removing &&
    JSON.stringify(marks) === JSON.stringify(marksFor(piece, openings[index]))
    ? openingCutoutReview(project, piece, index)
    : undefined;
  const fixedAxis = all.length > (index === null ? 0 : 1);
  const preview = useMemo(() => {
    try {
      return {
        candidate: editThroughOpening(
          project,
          piece.id,
          shape,
          index,
          removing ? null : marks,
        ),
        error: "",
      };
    } catch (problem) {
      return {
        candidate: project,
        error:
          problem instanceof Error
            ? problem.message
            : "Check the opening measurements.",
      };
    }
  }, [project, piece.id, shape, index, removing, marks]);
  const [u, v] = openingAxes(marks.axis);
  const [width, height] = [piece.size[u], piece.size[v]];
  const margin = Math.max(width, height) * 0.08;
  const after = preview.candidate.pieces.find(({ id }) => id === piece.id)!;
  const canPlace = !removing && (index !== null || !full);
  const clipId = `round-opening-${useId().replaceAll(":", "")}`;
  function choose(raw: string) {
    const next = raw === "" ? null : Number(raw);
    setIndex(next);
    setRemoving(false);
    setMarks(
      next === null
        ? centered(piece, firstAxis, rectangular)
        : marksFor(piece, openings[next]),
    );
  }
  function place(event: MouseEvent<SVGSVGElement>) {
    if (!canPlace) return;
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      transform.inverse(),
    );
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height)
      return;
    setMarks({
      ...marks,
      fromEdges: [
        Math.round(point.x * 16) / 16,
        Math.round((height - point.y) * 16) / 16,
      ],
    });
  }
  return (
    <div className="round-opening-editor">
      {editable.length > 0 && (
        <label className="field">
          {rectangular ? "Rectangular cut" : "Opening"}
          <select
            value={index ?? ""}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="" disabled={full}>
              {rectangular ? "New rectangular cut" : "New opening"}
            </option>
            {editable.map(({ opening, index: at }) => (
              <option value={at} key={at}>
                {"spans" in opening
                  ? `Cut ${at + 1} · ${opening.spans.map(formatStockLength).join(" × ")}`
                  : `Opening ${at + 1} · ${formatStockLength(opening.diameter)} diameter`}
              </option>
            ))}
          </select>
        </label>
      )}
      {openings.some((opening) => "source" in opening && opening.source) && (
          <p className="small-note">
            {rectangular ? "Edit a floor register opening in its floor register plan." :
              "Edit sauna vents and water-line bores in the planner that created them."}
          </p>
        )}
      <p className="small-note">
        {piece.foilReturns
          ? "Measure from the visible foil face edges."
          : "Measure from the labeled edges of the part."}{" "}
        {rectangular
          ? "Click to place the lower-left corner. For a notch, draw the cut across an edge."
          : "Use the fields for exact marks, or click the preview to place the center."}
      </p>
      <svg
        className="cut-diagram round-opening-preview"
        viewBox={`${-margin} ${-margin} ${width + 2 * margin} ${height + 2 * margin}`}
        role="img"
        aria-label={`${rectangular ? "Rectangular cut" : "Opening"} preview through local ${names[marks.axis]}`}
        onClick={place}
        style={{ cursor: canPlace ? "crosshair" : "default" }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={width} height={height} />
          </clipPath>
        </defs>
        <rect
          width={width}
          height={height}
          fill="#d9c4a1"
          stroke="#75654d"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={width / 2}
          y={height + margin * 0.68}
          textAnchor="middle"
          style={{ fontSize: margin * 0.52 }}
          aria-hidden="true"
        >
          −{names[v]}
        </text>
        <text
          transform={`translate(${-margin * 0.44} ${height / 2}) rotate(-90)`}
          textAnchor="middle"
          style={{ fontSize: margin * 0.52 }}
          aria-hidden="true"
        >
          −{names[u]}
        </text>
        <g clipPath={`url(#${clipId})`} fill="#fffdf6" stroke="#6b5533">
          {pieceThroughOpenings(after)
            .filter(({ axis }) => axis === marks.axis)
            .map((opening, at) => {
              const cut = marksFor(piece, opening);
              const [x, y] = cut.fromEdges;
              if ("spans" in cut)
                return (
                  <rect
                    key={at}
                    data-preview-rectangle
                    x={x}
                    y={height - y - cut.spans[1]}
                    width={cut.spans[0]}
                    height={cut.spans[1]}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              return (
                <circle
                  key={at}
                  cx={x}
                  cy={height - y}
                  r={cut.diameter / 2}
                  clipPath={`url(#${clipId})`}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
        </g>
        {canPlace && marks.fromEdges.every(Number.isFinite) && (
          <circle
            cx={marks.fromEdges[0]}
            cy={height - marks.fromEdges[1]}
            r={Math.max(width, height) * 0.012}
            fill="#a84724"
          />
        )}
      </svg>
      <p className="small-note">
        Along {names[u]} {formatStockLength(width)} · Along {names[v]}{" "}
        {formatStockLength(height)} · Through{" "}
        {formatStockLength(piece.size[marks.axis])} of stock.
      </p>
      {canPlace && (
        <>
          <label className="field">
            Through local axis
            <select
              value={marks.axis}
              disabled={fixedAxis}
              onChange={(event) =>
                setMarks(
                  centered(
                    piece,
                    Number(event.target.value) as ThroughOpening["axis"],
                    rectangular,
                  ),
                )
              }
            >
              {axes.map((axis) => (
                <option key={axis} value={axis}>
                  {names[axis]}
                </option>
              ))}
            </select>
          </label>
          <div className="two-col">
            {[u, v].map((edge, at) => (
              <LengthInput
                key={edge}
                label={`${rectangular ? "Start" : "Center"} from −${names[edge]} edge`}
                value={marks.fromEdges[at]}
                defaultUnit={preferredLengthUnit(marks.fromEdges[at])}
                min={rectangular ? -240 : -24}
                max={piece.size[edge] + 24}
                onChange={(value) =>
                  setMarks({
                    ...marks,
                    fromEdges:
                      at === 0
                        ? [value, marks.fromEdges[1]]
                        : [marks.fromEdges[0], value],
                  })
                }
              />
            ))}
          </div>
          {"spans" in marks ? (
            <div className="two-col">
              {[u, v].map((edge, at) => (
                <LengthInput
                  key={edge}
                  label={`Cut size along ${names[edge]}`}
                  value={marks.spans[at]}
                  defaultUnit={preferredLengthUnit(marks.spans[at])}
                  max={480}
                  onChange={(value) =>
                    setMarks({
                      ...marks,
                      spans:
                        at === 0
                          ? [value, marks.spans[1]]
                          : [marks.spans[0], value],
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <LengthInput
              label="Opening diameter"
              value={marks.diameter}
              defaultUnit={preferredLengthUnit(marks.diameter)}
              max={48}
              onChange={(diameter) => setMarks({ ...marks, diameter })}
            />
          )}
        </>
      )}
      {index !== null && (
        <button
          type="button"
          className="text-button"
          onClick={() => setRemoving(!removing)}
        >
          {removing ? "Keep cut" : "Preview removal"}
        </button>
      )}
      {!canPlace && !removing && (
        <p className="small-note">This part has six saved through-cuts.</p>
      )}
      {(canPlace || removing) && preview.error && (
        <p className="form-error" role="alert">
          {preview.error}
        </p>
      )}
      {cutout?.existing ? <p className="small-note">
        A piece from this opening was recorded as {partLabel(project, cutout.existing.offcutId)}.
      </p> : cutout && (cutout.pending
        ? <p className="small-note">Complete the source stock cut order before recording this cutout.</p>
        : <OpeningCutoutForm key={index} limits={cutout.limits} onRecord={(length, width) =>
          onRecover(recordOpeningCutout(project, piece.id, index!, length, width))} />)}
      <button
        className="button primary full"
        type="button"
        disabled={preview.candidate === project}
        onClick={() => onApply(preview.candidate)}
      >
        {removing
          ? rectangular
            ? "Remove rectangular cut"
            : "Remove opening"
          : index === null
            ? rectangular
              ? "Apply rectangular cut"
              : "Apply round opening"
            : rectangular
              ? "Update rectangular cut"
              : "Update opening"}
      </button>
      <button type="button" className="text-button full" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

function OpeningCutoutForm({ limits, onRecord }: {
  limits: [number, number, number];
  onRecord: (length: number, width: number) => void;
}) {
  const [length, setLength] = useState(NaN);
  const [width, setWidth] = useState(NaN);
  const [error, setError] = useState("");
  return <details className="field-section">
    <summary>Record recovered cutout</summary>
    <form onSubmit={(event) => {
      event.preventDefault();
      setError("");
      try {
        onRecord(length, width);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Check the measured cutout.");
      }
    }}>
      <p className="small-note">{openingCutoutInstructions} The recorded thickness stays {formatStockLength(limits[2])}.</p>
      <LengthInput label="Usable length along grain" value={length} min={0.001} max={limits[0]} required onChange={setLength} />
      <LengthInput label="Usable width across grain" value={width} min={0.001} max={limits[1]} required onChange={setWidth} />
      <button type="submit" className="button secondary" disabled={!(length > 0 && width > 0)}>Add cutout to Cut pool</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </details>;
}
