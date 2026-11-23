import { useId, useMemo, useState } from "react";
import { material, type Project } from "./model";
import { formatPreciseInches } from "./measurement";
import { fitLayoutLabel } from "./layoutLabels";
import { recordedStockCutOrderView, type StockCutOrderView } from "./plannedCutSources";
import { SavedStockCutSteps } from "./PlannedStockCutOrder";
import { previewUncutStockRelease, previewUncutStockReuse, type UncutStockRelease } from "./offcutReleasePlan";
import { OffcutReusePlanDetails } from "./OffcutReuseReview";
import { purchaseUnitLabel } from "./purchaseUnits";
import {
  cutStockLayout,
  type CutStockGap,
  type CutStockInspection,
} from "./cutStockLayout";

const inches = formatPreciseInches;
const axisName = (axis: number) => ["X", "Y", "Z"][axis];
const rectangleText = (r: CutStockGap) =>
  `width ${inches(r.width)} × length ${inches(r.length)}; across-width start ${inches(r.x)}, along-length start ${inches(r.y)}`;

/** Actual saved source reservations. Estimated packing and purchase accounting stay elsewhere. */
export function CutStockLayout({
  project,
  sourceId,
  onSelectPart,
  onStockOnHand,
  onCompleteCut,
  onReleaseCut,
  focusedId,
  printable = false,
  inspection,
  savedOrder,
}: {
  project: Project;
  sourceId: string;
  onSelectPart?: (pieceId: string) => void;
  onStockOnHand?: (onHand: boolean) => void;
  onCompleteCut?: () => void;
  onReleaseCut?: (review: UncutStockRelease) => void;
  focusedId?: string;
  printable?: boolean;
  inspection?: CutStockInspection;
  savedOrder?: StockCutOrderView;
}) {
  const layout = useMemo(
    () => cutStockLayout(project, sourceId, inspection),
    [project, sourceId, inspection],
  );
  const patternId = `source-gap-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const onHand = project.onHandCutSources?.includes(sourceId) ?? false;
  const plan = project.plannedCutSources?.find((item) => item.sourceId === sourceId);
  const recorded = project.recordedStockCutOrders?.find((order) => order.sourceId === sourceId);
  const [release, setRelease] = useState<{ source: Project; sourceId: string; useScraps: boolean } &
    ({ plan: UncutStockRelease } | { error: string })>();
  const review = release?.source === project && release.sourceId === sourceId ? release : undefined;

  function reviewRelease(useScraps = false) {
    const context = { source: project, sourceId, useScraps };
    try {
      const plan = previewUncutStockRelease(project, sourceId);
      const reuse = useScraps ? previewUncutStockReuse(plan) : undefined;
      if (useScraps && !reuse) {
        setRelease({ ...context, error: "No plan found that covers every part with on-hand offcuts and reduces what you need to buy." });
        return;
      }
      setRelease({ ...context, plan: reuse ? { ...plan, reuse } : plan });
    } catch (problem) {
      setRelease({ ...context, error: problem instanceof Error ? problem.message : "Review this cut source before releasing it." });
    }
  }

  if (layout.state === "invalid" || layout.state === "missing")
    return (
      <section
        className="cut-stock-layout"
        aria-label="Recorded cut source"
        data-source-id={sourceId}
        data-layout-state={layout.state}
        data-cut-plan={plan ? "planned" : undefined}
      >
        <h4>Recorded cut source · layout unavailable</h4>
        {layout.issues.map((issue) => (
          <p className="small-note" key={issue}>
            {issue}
          </p>
        ))}
        <p className="small-note">
          Review the saved cut-source records before relying on this layout.
          {onHand && " The on-hand credit is paused until the cut source passes review."}
        </p>
      </section>
    );

  const axes = layout.axes!,
    width = layout.width!,
    length = layout.length!;
  const horizontal = length > width * 4;
  const displayWidth = horizontal ? length : width,
    displayHeight = horizontal ? width : length;
  const padding = Math.max(displayWidth, displayHeight) / 70;
  const display = (r: CutStockGap) =>
    horizontal
      ? { x: r.y, y: r.x, width: r.length, height: r.width }
      : { x: r.x, y: r.y, width: r.width, height: r.length };
  const hasProfiles = layout.regions.some((region) => region.hasProfile);
  const hasOnHandOffcuts = !printable && plan && onReleaseCut && !onHand && project.pieces.some((piece) =>
    piece.offcut && piece.material === layout.materialId && piece.cutStock &&
    project.onHandCutSources?.includes(piece.cutStock.id),
  );
  return (
    <section
      className="cut-stock-layout"
      aria-label="Recorded cut source"
      data-source-id={sourceId}
      data-layout-state={layout.state}
      data-cut-plan={plan ? "planned" : undefined}
      data-source-size={JSON.stringify(layout.sourceSize)}
    >
      <h4>
        Recorded cut source ·{" "}
        {layout.materialId ? material(layout.materialId).name : "Stock"}
      </h4>
      <p className="cut-stock-source-size">
        {inches(length)} long × {inches(width)} wide ×{" "}
        {inches(layout.thickness!)} thick
      </p>
      {!printable && onStockOnHand ? (
        <label className="checkbox-field">
          <input type="checkbox" checked={onHand} onChange={(event) => onStockOnHand(event.target.checked)} />
          I already have this stock
        </label>
      ) : onHand ? <p className="small-note">Marked on hand</p> : null}
      {plan && (
        <div className="field-section">
          <p className="small-note">Cuts planned. The listed leftovers are expected after cutting this stock.</p>
          {savedOrder && !printable && <>
            <h5>Saved cutting order</h5>
            <SavedStockCutSteps order={savedOrder} />
          </>}
          {!printable && !review && (onCompleteCut || onReleaseCut) && (
            <div className="button-row">
              {onCompleteCut && <button type="button" className="button secondary small" onClick={onCompleteCut}>Mark cuts complete</button>}
              {onReleaseCut && hasOnHandOffcuts && (
                <button type="button" className="button secondary small" onClick={() => reviewRelease(true)}>
                  Check on-hand offcuts
                </button>
              )}
              {onReleaseCut && (
                <button type="button" className="button secondary small" onClick={() => reviewRelease()}>
                  Release uncut stock plan
                </button>
              )}
            </div>
          )}
          {!printable && onReleaseCut && review && <section className="field-section"
            aria-label={review.useScraps ? "Review replacement with offcuts" : "Review uncut stock release"}>
            {"error" in review ? <p role="alert" className="form-error">{review.error}</p> : review.plan.reuse ? <>
              <p>Apply this change only if the original board or sheet is still uncut. These offcuts will supply every part from that stock.</p>
              <OffcutReusePlanDetails plan={review.plan.reuse} />
            </> : <>
              <p>Release the plan only if the whole board or sheet is still uncut.</p>
              {!!review.plan.assignments && <p className="small-note">
                {review.plan.assignments} planned offcut {review.plan.assignments === 1 ? "assignment" : "assignments"} will be released.
              </p>}
              <ul aria-label="Parts that will need stock">
                {review.plan.parts.map(({ id, label, name }) => <li key={id}>{label} · {name}</li>)}
              </ul>
              <p className="small-note">{review.plan.restored
                ? `Return the full blank to Cut pool as ${review.plan.restored.label} · ${review.plan.restored.size}.`
                : "The released parts can be repacked into available stock lengths."}</p>
              {review.plan.purchase && <p className="small-note">
                Stock to buy · {review.plan.purchase.before} → {review.plan.purchase.after}{" "}
                {purchaseUnitLabel(review.plan.purchase.unit, review.plan.purchase.after)}
              </p>}
            </>}
            <div className="button-row">
              {"plan" in review && <button type="button" className="button primary small" onClick={() => onReleaseCut(review.plan)}>
                {review.useScraps ? "Use these offcuts" : "Apply release"}
              </button>}
              <button type="button" className="button secondary small" onClick={() => setRelease(undefined)}>
                {review.useScraps ? "Cancel replacement" : "Cancel release"}
              </button>
            </div>
          </section>}
        </div>
      )}
      {recorded && !printable && <div className="field-section">
        <h5>{recorded.completedAt ? "Completed cutting order" : "Recorded cutting order"}</h5>
        <SavedStockCutSteps order={recordedStockCutOrderView(recorded)} />
        {!recorded.completedAt && onCompleteCut && (
          <button type="button" className="button secondary small" onClick={onCompleteCut}>Mark cuts complete</button>
        )}
      </div>}
      <p className="small-note">
        Source-local length: {axisName(axes.length)} · width:{" "}
        {axisName(axes.width)} · thickness: {axisName(axes.thickness)}. Starts
        are measured from the original blank's low edges, independent of
        assembly pose.
      </p>
      {layout.measuredWoodKerf !== undefined && (
        <p className="small-note">Recorded blade kerf · {inches(layout.measuredWoodKerf)} per cut</p>
      )}
      {layout.issues.map((issue) => (
        <p className="small-note" key={issue}>
          {issue}
        </p>
      ))}
      {layout.profiles?.map(({ face, across, regions }) => (
        <svg
          key={face}
          className="cut-stock-diagram"
          viewBox="-4 -4 308 116"
          role="img"
          aria-label={
            face === "width"
              ? "Retained shapes across the stock face"
              : "Retained shapes across the stock edge"
          }
        >
          <rect width="300" height="84" fill="#f7f4ec" stroke="#716b61" />
          {regions.map(({ id, points }) => {
            const region = layout.regions.find((row) => row.id === id)!;
            const plotted = points.map(([x, y]): [number, number] => [
              (x / length) * 300,
              (y / across) * 84,
            ]);
            const label = fitLayoutLabel(plotted, region.label, 10);
            return (
              <g key={id} data-part-label={region.label} data-stock-focus={id === focusedId || undefined}>
                <title>
                  {region.label} · {region.offcut ? "Offcut" : "Kept part"} ·{" "}
                  {region.name}
                </title>
                <polygon
                  points={plotted.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill={region.offcut ? "#dfc9a4" : "#b2c89a"}
                  fillOpacity=".7"
                  stroke={region.offcut ? "#a48c67" : "#647f4b"}
                  vectorEffect="non-scaling-stroke"
                />
                {label && (
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                  >
                    {region.label}
                  </text>
                )}
              </g>
            );
          })}
          <text x="0" y="102" fontSize="10">
            {face === "width" ? "Face view" : "Edge view"} · {inches(across)}{" "}
            across
          </text>
        </svg>
      ))}
      {layout.state === "planar" && (
        <>
          <svg
            className="cut-stock-diagram"
            viewBox={`${-padding} ${-padding} ${displayWidth + padding * 2} ${displayHeight + padding * 2}`}
            role="img"
            aria-label={`Recorded source blank layout · ${layout.regions.map((region) => region.label).join(", ")}`}
            style={{
              aspectRatio: `${displayWidth + padding * 2} / ${displayHeight + padding * 2}`,
            }}
          >
            <desc>
              Saved rectangular blank reservations in original stock
              coordinates. Green is a kept part; tan is a recorded offcut.
              Hatching is modeled gap or unretained stock, not a recovered cut
              sequence.
            </desc>
            <defs>
              <pattern
                id={patternId}
                width={Math.max(displayWidth, displayHeight) / 30}
                height={Math.max(displayWidth, displayHeight) / 30}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M0,0 l${Math.max(displayWidth, displayHeight) / 30},${Math.max(displayWidth, displayHeight) / 30}`}
                  stroke="#b7b1a6"
                  strokeWidth="0.4"
                />
              </pattern>
            </defs>
            <rect
              width={displayWidth}
              height={displayHeight}
              fill="#f7f4ec"
              stroke="#716b61"
              vectorEffect="non-scaling-stroke"
            />
            {layout.gaps.map((gap, index) => (
              <g
                key={index}
                data-gap-index={index}
                data-source-x={gap.x}
                data-source-y={gap.y}
                data-width={gap.width}
                data-length={gap.length}
              >
                <title>{`Modeled gap / unretained stock · ${rectangleText(gap)}`}</title>
                <rect {...display(gap)} fill={`url(#${patternId})`} />
              </g>
            ))}
            {layout.regions.map((region) => {
              const rect = display(region),
                description = `${region.label} · ${region.offcut ? "recorded offcut" : "kept part"} · ${region.name} · ${rectangleText(region)}${region.hasProfile ? "; rectangular blank reservation, retained profile differs" : ""}`;
              const label = fitLayoutLabel(
                [
                  [rect.x, rect.y],
                  [rect.x + rect.width, rect.y],
                  [rect.x + rect.width, rect.y + rect.height],
                  [rect.x, rect.y + rect.height],
                ],
                region.label,
                Math.max(displayWidth, displayHeight) / 30,
              );
              return (
                <g
                  key={region.id}
                  data-part-id={region.id}
                  data-part-label={region.label}
                  data-stock-focus={region.id === focusedId || undefined}
                  data-offcut={region.offcut}
                  data-source-offset={JSON.stringify(region.offset)}
                  data-region-size={JSON.stringify(region.size)}
                  aria-label={description}
                >
                  <title>{description}</title>
                  <rect
                    {...rect}
                    fill={region.offcut ? "#e5c7a1" : "#b7d5c2"}
                    stroke={region.offcut ? "#8f6540" : "#35654e"}
                    vectorEffect="non-scaling-stroke"
                  />
                  {label && (
                    <text
                      x={label.x}
                      y={label.y}
                      fontSize={label.fontSize}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      aria-hidden="true"
                    >
                      {region.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="small-note">
            {horizontal
              ? `Horizontal: length (local ${axisName(axes.length)}); vertical: width (local ${axisName(axes.width)}).`
              : `Horizontal: width (local ${axisName(axes.width)}); vertical: length (local ${axisName(axes.length)}).`}{" "}
            Green: kept · tan: recorded offcut · hatched: unretained.
          </p>
        </>
      )}
      {hasProfiles && layout.state !== "profile-review" && (
        <p className="small-note cut-stock-profile-note">
          Profiled parts reserve rectangular blanks here. Removed profile
          corners are not added to the unretained regions. Inspect the actual
          part's cut profile for its retained shape.
        </p>
      )}
      <ul
        className="cut-stock-regions"
        aria-label="Actual parts and offcuts in this source"
      >
        {layout.regions.map((region) => (
          <li key={region.id} data-source-part-id={region.id} data-stock-focus={region.id === focusedId || undefined}>
            <div className="cut-stock-region-heading">
              <strong>{region.label}</strong>
              <span>{region.offcut ? "Recorded offcut" : "Kept part"}</span>
              {region.id === focusedId && <span>Selected piece</span>}
            </div>
            <div className="cut-stock-part-name">{region.name}</div>
            <div>{rectangleText(region)}</div>
            {layout.state !== "planar" && (
              <div>
                Source-local XYZ start: {region.offset.map(inches).join(", ")} ·
                blank XYZ size: {region.size.map(inches).join(" × ")}
              </div>
            )}
            {region.hasProfile && (
              <div>
                Profiled retained shape · rectangular blank reservation shown
              </div>
            )}
            {onSelectPart && !printable && (
              <button
                type="button"
                className="text-button"
                onClick={() => onSelectPart(region.id)}
              >
                {region.hasProfile
                  ? `Inspect ${region.label} and cut profile`
                  : `Inspect ${region.label}`}
              </button>
            )}
          </li>
        ))}
      </ul>
      {layout.state === "planar" && (
        <div className="cut-stock-gaps">
          <strong>Modeled gaps / unretained stock</strong>
          {layout.gaps.length ? (
            <ul>
              {layout.gaps.map((gap, index) => (
                <li key={index}>{rectangleText(gap)}</li>
              ))}
            </ul>
          ) : (
            <p>No unclaimed rectangular blank region remains.</p>
          )}
          {layout.measuredWoodKerf === undefined && (
            <p className="small-note">
              {layout.measuredTubeKerf !== undefined
                ? `Recorded tube cutting loss: ${inches(layout.measuredTubeKerf)} per cut, entered by the user.`
                : layout.modeledKerf === 0
                  ? "The layout uses a zero-kerf knife cut. Verify the actual trim and site fit."
                  : `The model uses a ${inches(layout.modeledKerf)} saw allowance. A saved gap does not prove a saw kerf, cut order or manufacturing allowance.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
