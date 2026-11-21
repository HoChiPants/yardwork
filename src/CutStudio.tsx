import { useId, useMemo, useState } from "react";
import { Scissors } from "lucide-react";
import { LengthInput } from "./LengthInput";
import {
  canCutAngled,
  cutAngledEnd,
  cuttingAxes,
  resizeByCuts,
  type TrimOrder,
} from "./cutPlan";
import { pieceCutKerf } from "./cutStock";
import { cutDiagram, type Point2 } from "./cutDiagram";
import { isBatt, material, type Project } from "./model";
import { ensurePartLabels, partLabel } from "./partLabels";
import {
  formatStockLength as formatPreciseInches,
  preferredLengthUnit,
} from "./measurement";
import { fitLayoutLabel } from "./layoutLabels";
import { stockAxes } from "./stockAxes";
import { canEditThroughOpenings } from "./throughOpeningCuts";
import { ThroughOpeningEditor } from "./ThroughOpeningEditor";
import { recordStraightTrim, isRecordableStraightTrim } from "./recordedStraightTrim";
import { planOffcutReuse, type OffcutReusePlan } from "./offcutReusePlan";
import { OffcutReusePlanDetails } from "./OffcutReuseReview";

/** A private candidate: canceled offcuts never consume labels in the actual project. */
export function makeLabeledCutPreview(
  project: Project,
  pieceId: string,
  length: number,
  width: number,
  order: TrimOrder = "crosscut-first",
) {
  const candidate = resizeByCuts(project, pieceId, length, width, order);
  const source = project.pieces.find(({ id }) => id === pieceId)!;
  const recorded = recordStraightTrim(project, ensurePartLabels(candidate), source, order);
  return { ...recorded, changed: candidate !== project };
}
export function CutStudio({
  project,
  pieceId,
  onApply,
  onClose,
}: {
  project: Project;
  pieceId: string;
  onApply: (next: Project, kind: "trim" | "trim-reuse" | "round" | "rectangle") => void;
  onClose: () => void;
}) {
  const source = project.pieces.find((p) => p.id === pieceId)!;
  const [long, wide] = cuttingAxes(source);
  const [length, setLength] = useState(source.size[long]),
    [width, setWidth] = useState(source.size[wide]);
  const [order, setOrder] = useState<TrimOrder>("crosscut-first");
  const [reuseReview, setReuseReview] = useState<{
    source: Project;
    plan?: OffcutReusePlan;
    error?: string;
  }>();
  const axes = stockAxes(source, source.cutStock?.size ?? source.size);
  const span = source.size[axes.length];
  const canTrim = material(source.material).cuttable;
  const canAngle = canCutAngled(source);
  const canOpen = canEditThroughOpenings(source);
  const [mode, setMode] = useState<
    "straight" | "angled" | "round" | "rectangle"
  >(canTrim ? "straight" : "round");
  const angled = mode === "angled";
  const [face, setFace] = useState<"width" | "thickness" | "compound">("width");
  const compound = face === "compound";
  const [keepEnd, setKeepEnd] = useState<"start" | "end">("start");
  const markInset = Math.min(source.size[axes.width] / 4, span / 8);
  const [leftMark, setLeftMark] = useState(
    Number((span / 2 - markInset).toFixed(3)),
  );
  const [rightMark, setRightMark] = useState(
    Number((span / 2 + markInset).toFixed(3)),
  );
  const [topLeft, setTopLeft] = useState(
    Number(
      (
        span / 2 -
        markInset +
        Math.min(source.size[axes.thickness] / 2, span / 8)
      ).toFixed(3),
    ),
  );
  const topRight = topLeft + (rightMark - leftMark);
  const preview = useMemo(() => {
    if (mode === "round" || mode === "rectangle")
      return { project, changed: false, error: null, offcutIds: [] };
    try {
      if (angled) {
        const cut = cutAngledEnd(
          project,
          pieceId,
          face,
          compound ? [leftMark, rightMark, topLeft] : [leftMark, rightMark],
          keepEnd,
        );
        return { project: ensurePartLabels(cut), changed: true, error: null, offcutIds: [] };
      }
      return {
        ...makeLabeledCutPreview(project, pieceId, length, width, order),
        error: null,
      };
    } catch (e) {
      return { project: null, changed: false, error: (e as Error).message, offcutIds: [] };
    }
  }, [
    project,
    pieceId,
    length,
    width,
    order,
    mode,
    angled,
    face,
    compound,
    leftMark,
    rightMark,
    topLeft,
    keepEnd,
  ]);
  const changed = preview.changed;
  const review = reuseReview?.source === preview.project ? reuseReview : undefined;
  const withReuse = review?.plan && review.plan.assignments.length > 0 ? review.plan : undefined;
  const bothTrims = Number.isFinite(length) && Number.isFinite(width) &&
    source.size[long] - length >= 0.001 && source.size[wide] - width >= 0.001;
  const canReviewReuse = preview.offcutIds.length > 0 && project.pieces.some(
    (part) => part.id !== pieceId && !part.offcut && !part.cutStock && part.material === source.material,
  );

  function reviewOffcuts() {
    if (!preview.project || !preview.offcutIds.length) return;
    try {
      setReuseReview({ source: preview.project, plan: planOffcutReuse(preview.project, preview.offcutIds) });
    } catch (error) {
      setReuseReview({
        source: preview.project,
        error: error instanceof Error ? error.message : "Review the current offcut dimensions.",
      });
    }
  }
  const clipId = `cut-stock-${useId().replaceAll(":", "")}`;
  const diagram = useMemo(
    () =>
      cutDiagram(
        project,
        pieceId,
        preview.project,
        angled ? (face === "thickness" ? "thickness" : "width") : undefined,
      ),
    [project, pieceId, preview.project, angled, face],
  );
  const diagramPoints = (points: Point2[]): Point2[] =>
    points.map(([x, y]) => [
      (x * 260) / diagram.width,
      (y * 180) / diagram.length,
    ]);
  const svgPoints = (points: Point2[]) =>
    diagramPoints(points)
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
  const labeledProject = preview.project ?? project,
    retained = preview.project?.pieces.find((piece) => piece.id === pieceId),
    offcuts = diagram.offcuts.flatMap((footprint) => {
      const piece = preview.project?.pieces.find(
        (part) => part.id === footprint.id,
      );
      return piece
        ? [{ ...footprint, piece, label: partLabel(labeledProject, piece.id) }]
        : [];
    }),
    retainedLabel = partLabel(labeledProject, pieceId),
    dimensions = (size: number[]) => size.map(formatPreciseInches).join(" × "),
    retainedDescription = `${retainedLabel} · retained ${source.name}${retained ? ` · ${dimensions(retained.size)}` : ""}`,
    labelText = (points: Point2[], label: string) => {
      const anchor = fitLayoutLabel(diagramPoints(points), label, 10);
      return anchor ? (
        <text
          x={anchor.x}
          y={anchor.y}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 10 }}
          aria-hidden="true"
        >
          {label}
        </text>
      ) : null;
    };
  const endNormal = retained?.cutPlanes.at(-1)?.normal;
  const cutAngle = endNormal
    ? (Math.acos(Math.min(1, Math.abs(endNormal[axes.length]))) * 180) / Math.PI
    : 0;
  const x = Math.max(
      0,
      Math.min(
        260,
        Number.isFinite(width) ? (260 * width) / source.size[wide] : 0,
      ),
    ),
    y = Math.max(
      0,
      Math.min(
        180,
        Number.isFinite(length) ? (180 * length) / source.size[long] : 0,
      ),
    );
  return (
    <div className="cut-studio">
      <span className="eyebrow">SHAPE YOUR STOCK</span>
      <h2 id="modal-title" style={{ overflowWrap: "anywhere" }}>
        Cut {partLabel(project, pieceId)} · {source.name}
      </h2>
      {(canAngle || canOpen) && (
        <div className="segmented cut-modes" role="group" aria-label="Cut type">
          {(
            [
              ["straight", "Straight trim", canTrim],
              ["angled", "Angled cut", canAngle],
              ["round", "Round opening", canOpen],
              ["rectangle", "Rectangular cut", canOpen],
            ] as const
          )
            .filter(([, , enabled]) => enabled)
            .map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "active" : ""}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
        </div>
      )}
      {mode === "round" || mode === "rectangle" ? (
        <ThroughOpeningEditor
          key={mode}
          project={project}
          rectangular={mode === "rectangle"}
          piece={source}
          onApply={(next) => onApply(next, mode)}
          onClose={onClose}
        />
      ) : (
        <>
          <p>
            {angled
              ? compound
                ? "Measure three corners from the starting end shown in the preview. Yardwork calculates the fourth corner and centers a modeled ⅛ in kerf on the cut plane."
                : "Measure both marks from the same starting end, shown at the top of the preview. Yardwork leaves a ⅛ in gap centered on the cut line."
              : isBatt(source.material)
                ? "Set the width and length of the retained batt. The model uses a zero-kerf knife cut and keeps the offcuts."
                : source.cutStock?.tubeKerf !== undefined
                  ? `Set the retained tube length. This layout uses the source's recorded ${formatPreciseInches(source.cutStock.tubeKerf)} loss per cut.`
                  : `Set the size you want to keep. The preview allows ${formatPreciseInches(pieceCutKerf(source))} for cutting loss and shows usable offcuts.`}
          </p>
          <svg
            className="cut-diagram"
            viewBox="-38 -24 342 246"
            role="img"
            aria-label="Retained piece and offcut preview"
            aria-describedby={`${clipId}-parts`}
          >
            <desc id={`${clipId}-parts`}>
              {`Retained piece ${retainedLabel}${offcuts.length ? ` · new offcuts ${offcuts.map((offcut) => offcut.label).join(", ")}` : " · no new offcuts"}. Exact part dimensions appear in the preview legend.`}
            </desc>
            <defs>
              <clipPath id={clipId}>
                <polygon points={svgPoints(diagram.source)} />
              </clipPath>
            </defs>
            <polygon
              points={svgPoints(diagram.source)}
              fill="#e3dcc9"
              stroke="#a69a7e"
              data-testid="source-footprint"
            />
            {offcuts.map((offcut) => (
              <g
                key={offcut.id}
                aria-label={`${offcut.label} · offcut · ${dimensions(offcut.piece.size)}`}
                data-part-label={offcut.label}
                data-preview-part-id={offcut.id}
              >
                <title>
                  {offcut.label} · offcut · {dimensions(offcut.piece.size)}
                </title>
                <polygon
                  points={svgPoints(offcut.points)}
                  fill="#dfc9a4"
                  stroke="#a48c67"
                  data-testid="offcut-footprint"
                />
                {labelText(offcut.points, offcut.label)}
              </g>
            ))}
            {!!diagram.retained.length && (
              <g
                aria-label={retainedDescription}
                data-part-label={retainedLabel}
                data-preview-part-id={pieceId}
              >
                <title>{retainedDescription}</title>
                <polygon
                  points={svgPoints(diagram.retained)}
                  fill="#b2c89a"
                  stroke="#647f4b"
                  data-testid="retained-footprint"
                />
                {labelText(diagram.retained, retainedLabel)}
              </g>
            )}
            {diagram.openings?.map(({ center, diameter }, index) => (
              <ellipse
                key={index}
                data-testid="round-opening-footprint"
                cx={(center[0] * 260) / diagram.width}
                cy={(center[1] * 180) / diagram.length}
                rx={(diameter * 130) / diagram.width}
                ry={(diameter * 90) / diagram.length}
                fill="#fffdf6"
                fillOpacity={0.82}
                stroke="#6b5533"
                strokeDasharray="4 2"
                clipPath={`url(#${clipId})`}
              />
            ))}
            {diagram.rectangles?.map(({ center, size }, index) => (
              <rect
                key={index}
                x={((center[0] - size[0] / 2) * 260) / diagram.width}
                y={((center[1] - size[1] / 2) * 180) / diagram.length}
                width={(size[0] * 260) / diagram.width}
                height={(size[1] * 180) / diagram.length}
                fill="#fffdf6"
                fillOpacity={0.82}
                stroke="#6b5533"
                strokeDasharray="4 2"
                clipPath={`url(#${clipId})`}
              />
            ))}
            {angled && changed && (
              <line
                x1="0"
                y1={(180 * leftMark) / diagram.length}
                x2="260"
                y2={(180 * rightMark) / diagram.length}
                stroke="#e76b37"
                strokeWidth="2"
                strokeDasharray="4 3"
                data-testid="angled-cut-line"
              />
            )}
            {angled && compound && changed && (
              <line
                x1="0"
                y1={(180 * topLeft) / diagram.length}
                x2="260"
                y2={(180 * topRight) / diagram.length}
                stroke="#873a22"
                strokeWidth="2"
                strokeDasharray="1 3"
                data-testid="compound-top-cut-line"
              />
            )}
            {!angled && changed && (
              <g clipPath={`url(#${clipId})`}>
                {y < 180 && (
                  <line
                    x1="0"
                    y1={y}
                    x2={order === "rip-first" ? x : 260}
                    y2={y}
                    stroke="#e76b37"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                )}
                {x < 260 && (
                  <line
                    x1={x}
                    y1="0"
                    x2={x}
                    y2={order === "crosscut-first" ? y : 180}
                    stroke="#e76b37"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                )}
              </g>
            )}
            <text x="130" y="-8" textAnchor="middle">
              {angled
                ? "Start measuring here"
                : `${formatPreciseInches(source.size[wide])} stock width`}
            </text>
            <text x="130" y="204" textAnchor="middle">
              {angled
                ? compound
                  ? "Face projection · bottom and top cut lines"
                  : `${face === "width" ? "Face" : "Edge"} view · ${formatPreciseInches(diagram.width)} across · schematic`
                : "Projected footprints · trim boundaries (schematic)"}
            </text>
          </svg>
          <div
            className="cut-label-legend"
            aria-label="Cut preview parts"
            style={{ overflowWrap: "anywhere", minWidth: 0 }}
          >
            <p data-preview-part-id={pieceId}>
              <strong>{retainedLabel}</strong> · Retained {source.name}
              {retained && ` · ${dimensions(retained.size)}`}
            </p>
            {offcuts.length > 0 && (
              <ul style={{ paddingLeft: 18, overflowWrap: "anywhere" }}>
                {offcuts.map((offcut) => (
                  <li key={offcut.id} data-preview-part-id={offcut.id}>
                    <strong>{offcut.label}</strong> · New offcut ·{" "}
                    {dimensions(offcut.piece.size)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {angled ? (
            <>
              <div className="two-col">
                <label className="field">
                  Mark across
                  <select
                    value={face}
                    onChange={(e) => setFace(e.target.value as typeof face)}
                  >
                    <option value="width">Width (miter)</option>
                    <option value="thickness">Thickness (bevel)</option>
                    <option value="compound">Compound</option>
                  </select>
                </label>
                <label className="field">
                  Keep piece
                  <select
                    value={keepEnd}
                    onChange={(e) =>
                      setKeepEnd(e.target.value === "end" ? "end" : "start")
                    }
                  >
                    <option value="start">Before the marks</option>
                    <option value="end">Beyond the marks</option>
                  </select>
                </label>
              </div>
              <div className="two-col">
                <LengthInput
                  label={
                    compound ? "Bottom left corner mark" : "Left edge mark"
                  }
                  value={leftMark}
                  onChange={setLeftMark}
                  max={span}
                  defaultUnit={preferredLengthUnit(leftMark)}
                />
                <LengthInput
                  label={
                    compound ? "Bottom right corner mark" : "Right edge mark"
                  }
                  value={rightMark}
                  onChange={setRightMark}
                  max={span}
                  defaultUnit={preferredLengthUnit(rightMark)}
                />
              </div>
              {compound && (
                <div className="two-col">
                  <LengthInput
                    label="Top left corner mark"
                    value={topLeft}
                    onChange={setTopLeft}
                    max={span}
                    defaultUnit={preferredLengthUnit(topLeft)}
                  />
                  <output className="field" aria-label="Top right corner mark">
                    <span>Top right corner</span>
                    <strong style={{ fontSize: 14 }}>
                      {Number.isFinite(topRight)
                        ? formatPreciseInches(topRight)
                        : "Pending"}
                    </strong>
                  </output>
                </div>
              )}
              <p className="small-note">
                {changed && (
                  <strong>{Number(cutAngle.toFixed(2))}° from square. </strong>
                )}
                Confirm the blade setting and tool capacity separately.
              </p>
            </>
          ) : (
            <>
              <div className="two-col">
                <LengthInput
                  label="Retained length"
                  value={length}
                  defaultUnit={preferredLengthUnit(source.size[long])}
                  onChange={setLength}
                  max={source.size[long]}
                />
                {material(source.material).shape === "tube-envelope" ? (
                  <p>
                    Outside diameter: {formatPreciseInches(source.size[0])}.
                    Select another rod product to change diameter.
                  </p>
                ) : (
                  <LengthInput
                    label="Retained width"
                    value={width}
                    defaultUnit={preferredLengthUnit(source.size[wide])}
                    onChange={setWidth}
                    max={source.size[wide]}
                  />
                )}
              </div>
              {bothTrims && isRecordableStraightTrim(source) && (
                <label className="field">
                  Cut order
                  <select value={order} onChange={(event) => setOrder(event.target.value as TrimOrder)}>
                    <option value="crosscut-first">Crosscut first</option>
                    <option value="rip-first">Rip first</option>
                  </select>
                  <span className="small-note">The retained size stays the same. The order changes the usable offcuts.</span>
                </label>
              )}
              <p className="small-note">
                {material(source.material).shape === "tube-envelope"
                  ? "The hollow tube's outside envelope is modeled; wall thickness is unverified."
                  : `Thickness stays ${formatPreciseInches(source.size[[0, 1, 2].find((axis) => axis !== long && axis !== wide)!])}.`}{" "}
                Length and width follow the part's local stock directions, even
                after rotation. The preview shows the retained shape and trim
                locations.
              </p>
            </>
          )}
          {!angled && !!source.cutPlanes?.length && (
            <p className="small-note">
              This stock already has profiled faces. Its actual silhouette and
              saved profiles are preserved in the preview and offcuts. These
              controls add straight trims; existing bevel setup and tool
              capacity still need review.
            </p>
          )}
          {preview.error && (
            <p className="form-error" role="alert">
              {preview.error}
            </p>
          )}
          {preview.project && (
            <p className="cut-preview">
              Keep {retainedLabel} ·{" "}
              {angled && retained
                ? dimensions(retained.size)
                : `${formatPreciseInches(length)} × ${formatPreciseInches(width)}`}{" "}
              · {preview.project.pieces.length - project.pieces.length} new
              offcut(s). Connections are kept for review and flagged if the
              trimmed parts no longer touch.
            </p>
          )}
          {canReviewReuse && (
            <section className="field-section" aria-label="Reuse offcuts from this cut">
              {!review && <button className="button secondary" type="button" onClick={reviewOffcuts}>Find uses for these offcuts</button>}
              {review?.plan && <OffcutReusePlanDetails plan={review.plan} fromCut />}
              {review?.error && <p className="form-error" role="alert">{review.error}</p>}
              {withReuse && (
                <button className="button primary full" type="button" onClick={() => onApply(withReuse.project, "trim-reuse")}>
                  Apply cuts and reuse
                </button>
              )}
            </section>
          )}
          <button
            className={`button ${withReuse ? "secondary" : "primary"} full`}
            disabled={!changed}
            onClick={() => {
              if (preview.project) onApply(preview.project, "trim");
            }}
          >
            <Scissors size={15} />
            {angled ? "Apply angled cut" : "Apply cuts"}
          </button>
          <button className="text-button full" onClick={onClose}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
