import { useState, type FormEvent } from "react";
import { DrawerBoxDoorTrial } from "./DrawerBoxDoorTrial";
import {
  defaultDrawerSideGap,
  drawerBoxOpening,
  drawerBoxSlideChoices,
  drawerBoxStock,
  drawerCabinetPanels,
  previewDrawerBox,
  type DrawerSpacerLayers,
} from "./drawerBoxes";
import { drawerSlideProducts, type DrawerSlideProductId } from "./drawerSlideReference";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { saveMotionTestSetup, type MotionPreview } from "./mechanismMotion";
import { material, type MaterialId, type Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";
import { OffcutReusePlanDetails } from "./OffcutReuseReview";
import { partLabel } from "./partLabels";
import { previewProposalStock } from "./proposalStock";
import { orientedStockSize } from "./stockAxes";

const describeDirection = (direction: [number, number, number]) =>
  direction.some((n) => Math.abs(n) >= 1 - 1e-7)
    ? Math.abs(direction[0]) > 0.5
      ? direction[0] > 0 ? "+X" : "−X"
      : direction[2] > 0 ? "+Z" : "−Z"
    : `X ${Number(direction[0].toFixed(2))}, Z ${Number(direction[2].toFixed(2))}`;

export function DrawerBoxPanel({ project, initialPanels, initialSpacers, onPreview, onSave, onCancel }: {
  project: Project;
  initialPanels: readonly string[];
  initialSpacers?: DrawerSpacerLayers;
  onPreview: (pose: MotionPreview | null) => void;
  onSave: (project: Project, plan: MotionPlan) => void;
  onCancel: () => void;
}) {
  const panels = drawerCabinetPanels(project);
  const initialIds = initialPanels.filter((id) => panels.some((panel) => panel.id === id));
  const [first, setFirst] = useState(initialIds[0] ?? "");
  const [second, setSecond] = useState(initialIds[1] ?? "");
  const [reverse, setReverse] = useState(false);
  const [label, setLabel] = useState("Cabinet drawer");
  const [stockId, setStockId] = useState<MaterialId>(drawerBoxStock[0]);
  const [bottomOffset, setBottomOffset] = useState(0.25);
  const [height, setHeight] = useState(4);
  const [sideGap, setSideGap] = useState(defaultDrawerSideGap);
  const [leftLayers, setLeftLayers] = useState(initialSpacers?.left ?? 0);
  const [rightLayers, setRightLayers] = useState(initialSpacers?.right ?? 0);
  const [frontInset, setFrontInset] = useState(0);
  const [rearGap, setRearGap] = useState(0.125);
  const [finishFront, setFinishFront] = useState(false);
  const [reveal, setReveal] = useState(0.125);
  const [slideId, setSlideId] = useState<DrawerSlideProductId | "">("");
  const [depth, setDepth] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ source: Project; value: ReturnType<typeof previewDrawerBox> }>();
  const [reuse, setReuse] = useState<ReturnType<typeof previewProposalStock>>();
  const [doorSetup, setDoorSetup] = useState<MotionTestSetup>();
  const [error, setError] = useState("");
  const value = preview?.source === project ? preview.value : undefined;
  const mount = (() => {
    if (!first || !second) return {};
    try {
      return { opening: drawerBoxOpening(project, [first, second], reverse) };
    } catch (cause) {
      return { issue: cause instanceof Error ? cause.message : "Check the two cabinet sides." };
    }
  })();
  const choices = mount.opening && drawerBoxSlideChoices(mount.opening, frontInset, rearGap,
    finishFront ? Math.min(...material(stockId).size) : 0);
  const slide = slideId ? drawerSlideProducts.find((item) => item.productId === slideId) : choices?.available.at(-1);
  const fittedDepth = depth ?? (slide && choices ? Math.min(slide.travel, choices.depth) : NaN);
  const blockedClosed = value && (value.closed.interferenceIds.length > 0 ||
    value.closed.outsideZoneFaces.length > 0 || value.closed.siteFaceHits.length > 0);
  const limit = value?.review.playbackLimit(0, value.reference.travel);

  function resetPreview() {
    setPreview(undefined);
    setReuse(undefined);
    setDoorSetup(undefined);
    setError("");
    onPreview(null);
  }

  function show(pose: MotionPreview, spacers = value?.spacers ?? []) {
    onPreview({ ...pose, pieces: [...pose.pieces, ...spacers], label: `${pose.label} preview`, draftGeometry: true });
  }

  function reviewBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetPreview();
    try {
      if (!slide) throw Error("Choose a slide whose closed length fits the available depth.");
      const box = previewDrawerBox(project, {
        panelIds: [first, second], reverse, label, stockId, bottomOffset, height, sideGap,
        frontInset, rearGap, finishFront, reveal, slideId: slide.productId, depth: fittedDepth,
        spacers: { left: leftLayers, right: rightLayers },
      });
      setPreview({ source: project, value: box });
      show(box.closed, box.spacers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not preview the drawer.");
    }
  }

  return (
    <section className="field-section" aria-label="Fit a drawer box">
      <h3>Fit a drawer box</h3>
      <form onSubmit={reviewBox} onChange={resetPreview}>
        <label className="field">Drawer name
          <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <p className="small-note">Select the two fixed sides of a frameless cabinet opening.</p>
        <label className="field">First cabinet side
          <select value={first} onChange={(e) => setFirst(e.target.value)} required>
            <option value="">Choose a panel</option>
            {panels.filter(({ id }) => id !== second).map((panel) =>
              <option key={panel.id} value={panel.id}>{partLabel(project, panel.id)} · {panel.name}</option>)}
          </select>
        </label>
        <label className="field">Opposite cabinet side
          <select value={second} onChange={(e) => setSecond(e.target.value)} required>
            <option value="">Choose a panel</option>
            {panels.filter(({ id }) => id !== first).map((panel) =>
              <option key={panel.id} value={panel.id}>{partLabel(project, panel.id)} · {panel.name}</option>)}
          </select>
        </label>
        {mount.issue && <p role="status" className="small-note">{mount.issue}</p>}
        {mount.opening && choices && (
          <>
            <p className="small-note">
              Opening {formatPreciseInches(mount.opening.width)} wide with {formatPreciseInches(mount.opening.front - mount.opening.back)} of common depth.
              Opens toward {describeDirection(mount.opening.frontAxis)}.
            </p>
            <label className="checkbox-field">
              <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
              Open toward the other end
            </label>
            <label className="field">Drawer stock
              <select value={stockId} onChange={(e) => setStockId(e.target.value as MaterialId)}>
                {drawerBoxStock.map((id) => <option key={id} value={id}>{material(id).name}</option>)}
              </select>
            </label>
            <LengthInput label="Bottom above panel overlap" min={0} value={bottomOffset} onChange={setBottomOffset} />
            <LengthInput label="Overall box height" value={height} onChange={setHeight} />
            <details className="field-section">
              <summary>Front and fit clearances</summary>
              <LengthInput label="Side gap per slide" min={0.5} max={0.531} value={sideGap} onChange={setSideGap} />
              <LengthInput label="Closed front inset" min={0} value={frontInset} onChange={setFrontInset} />
              <LengthInput label="Gap behind box" min={0} value={rearGap} onChange={setRearGap} />
              <label className="checkbox-field">
                <input type="checkbox" checked={finishFront} onChange={(e) => setFinishFront(e.target.checked)} />
                Add an inset finished front
              </label>
              {finishFront && <LengthInput label="Finished front side reveal" min={0} value={reveal} onChange={setReveal} />}
            </details>
            <details className="field-section">
              <summary>Drawer slide spacers</summary>
              <p className="small-note">Each fixed layer uses {formatPreciseInches(Math.min(...material(stockId).size))} plywood. Add layers to either cabinet side to shift the drawer opening.</p>
              <label className="field">Left spacer layers
                <input type="number" min={0} step={1} value={leftLayers} onChange={(e) => setLeftLayers(Number(e.target.value))} />
              </label>
              <label className="field">Right spacer layers
                <input type="number" min={0} step={1} value={rightLayers} onChange={(e) => setRightLayers(Number(e.target.value))} />
              </label>
            </details>
            <label className="field">Slide pair
              <select value={slideId} onChange={(e) => {
                setSlideId(e.target.value as typeof slideId);
                setDepth(null);
              }}>
                <option value="">{choices.available.length ? `Longest pair that fits · ${choices.available.at(-1)!.travel} in` : "No slide fits this depth"}</option>
                {drawerSlideProducts.map((item) =>
                  <option key={item.productId} value={item.productId} disabled={!choices.available.includes(item)}>{item.name}</option>)}
              </select>
            </label>
            <p className="small-note">{formatPreciseInches(Math.max(0, choices.depth))} available for the box between the front and rear clearances.</p>
            {slide && choices.available.includes(slide) && (
              <LengthInput label="Box depth" value={fittedDepth} onChange={setDepth} max={choices.depth} />
            )}
          </>
        )}
        <button type="submit" className="button secondary" disabled={!slide || !choices?.available.includes(slide) || !Number.isFinite(fittedDepth)}>Preview drawer</button>
      </form>
      {value && (
        <section className="field-section" aria-label="Drawer box preview">
          <h4>Drawer cut sizes</h4>
          <p>
            {formatPreciseInches(value.width)} wide · {formatPreciseInches(value.depth)} deep · {formatPreciseInches(value.height)} high
            {" · "}<a href={value.reference.homeDepot} target="_blank" rel="noreferrer">{value.reference.orderModel} slide pair</a>
          </p>
          <p className="small-note">Thickness × width × length along the grain</p>
          <ul>
            {value.pieces.map((piece) => (
              <li key={piece.id}>{piece.name} · {orientedStockSize(piece).map(formatStockLength).join(" × ")}</li>
            ))}
          </ul>
          {value.spacers.length > 0 && <>
            <h4>Slide spacer cuts</h4>
            <p className="small-note">{formatPreciseInches(value.railWidth)} between the fixed mounting faces.</p>
            <ul>{value.spacers.map((piece) =>
              <li key={piece.id}>{piece.name} · {orientedStockSize(piece).map(formatStockLength).join(" × ")}</li>)}</ul>
          </>}
          {blockedClosed ? (
            <p role="alert" className="form-error">The closed drawer overlaps modeled parts or exceeds a recorded clearance. Adjust the setup before adding it.</p>
          ) : (
            <p role="status" className="small-note">
              {limit?.inspectAt === undefined ? "The modeled drawer clears its full opening travel." :
                `The opening check reaches an obstruction or clearance limit after ${formatPreciseInches(limit.travel)}.`}
            </p>
          )}
          <div className="button-row">
            <button type="button" className="text-button" onClick={() => show(value.closed)}>Show closed drawer</button>
            {!blockedClosed && limit && (
              <button type="button" className="text-button" onClick={() => show(value.review.preview(limit.travel, limit.inspectAt))}>
                {limit.inspectAt === undefined ? "Show fully open drawer" : "Show opening limit"}
              </button>
            )}
          </div>
          {!blockedClosed && <DrawerBoxDoorTrial key={value.plan.id} project={value.project} drawer={value.plan}
            onPreview={show} onSetup={(setup) => {
              setDoorSetup(setup);
              if (!setup) show(value.closed);
            }} />}
          {project.pieces.some(({ offcut }) => offcut) && !blockedClosed && (
            <label className="checkbox-field">
              <input type="checkbox" checked={!!reuse} onChange={(e) => {
                try {
                  setReuse(e.target.checked ? previewProposalStock(project, value.project, []) : undefined);
                  setError("");
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Could not check the drawer scraps.");
                }
              }} /> Use matching scraps for drawer panels{value.spacers.length > 0 && " and spacers"}
            </label>
          )}
          {reuse?.plan && <OffcutReusePlanDetails plan={reuse.plan} />}
          <button type="button" className="button primary" disabled={blockedClosed} onClick={() => {
            try {
              const candidate = reuse?.project ?? value.project;
              const prepared = doorSetup ? saveMotionTestSetup(candidate, value.plan.id, doorSetup) : candidate;
              onSave(prepared, prepared.motionPlans!.find(({ id }) => id === value.plan.id)!);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not add the drawer.");
            }
          }}>Add drawer and test movement</button>
        </section>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="button" className="text-button" onClick={onCancel}>Cancel drawer setup</button>
    </section>
  );
}
