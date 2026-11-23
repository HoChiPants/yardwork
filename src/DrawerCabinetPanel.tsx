import { useMemo, useState, type FormEvent } from "react";
import { drawerBoxStock } from "./drawerBoxes";
import { defaultCabinetDrawerGap, defaultCabinetDrawerHeight, maxCabinetBays, maxCabinetDrawers, previewDrawerCabinet, type DrawerCabinetRequest } from "./drawerCabinet";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { material, type Project } from "./model";
import { ProposalStockReview } from "./ProposalStockReview";
import { previewProposalStock, type ProposalCutScope } from "./proposalStock";
import { planStockCutLayouts } from "./recordStockCutLayout";
import { Scene } from "./Scene";

const noop = () => {};
const view = { preset: "iso", nonce: 0 };
const fields = {
  width: "Cabinet width",
  depth: "Cabinet depth",
  height: "Cabinet height",
} as const;

export function DrawerCabinetPanel({ project, request, onApply }: {
  project: Project;
  request: DrawerCabinetRequest;
  onApply: (next: Project, source: Project, planId: string) => void;
}) {
  const [dimensions, setDimensions] = useState(request.dimensions);
  const [bayCount, setBayCount] = useState(request.bayCount);
  const [drawerHeights, setDrawerHeights] = useState(request.drawerHeights);
  const [drawerGap, setDrawerGap] = useState(defaultCabinetDrawerGap);
  const [drawerIndex, setDrawerIndex] = useState(0);
  const [x, setX] = useState(0);
  const [z, setZ] = useState(0);
  const [stockId, setStockId] = useState<(typeof drawerBoxStock)[number]>("plywood");
  const [barPull, setBarPull] = useState(request.barPull);
  const [draft, setDraft] = useState<{ source: Project; value: ReturnType<typeof previewDrawerCabinet> }>();
  const [open, setOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [offcuts, setOffcuts] = useState<string[] | null>(null);
  const [cutScope, setCutScope] = useState<ProposalCutScope | null>(null);
  const [error, setError] = useState("");
  const value = draft?.source === project ? draft.value : undefined;
  const stock = useMemo(() => {
    if (!value || (!stockOpen && !offcuts && !cutScope)) return {};
    try {
      return { review: previewProposalStock(project, value.project, offcuts) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Could not check the cabinet stock." };
    }
  }, [project, value, stockOpen, offcuts, cutScope]);
  const selectedCutUnits = cutScope
    ? stock.review?.recordable.filter(({ existingPartIds }) => cutScope === "shared" || !existingPartIds.length) ?? []
    : [];
  const drawer = value?.drawers[drawerIndex];
  const limit = drawer && value ? drawer.review.playbackLimit(0, value.reference.travel) : undefined;
  const pose = drawer && (open && limit ? drawer.review.preview(limit.travel, limit.inspectAt) : drawer.closed);

  function reset() {
    setDraft(undefined);
    setDrawerIndex(0);
    setOpen(false);
    setError("");
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    try {
      const value = previewDrawerCabinet(project, { ...dimensions, bayCount, drawerHeights, drawerGap, position: [x, 0, z], stock: stockId, barPull });
      setDraft({ source: project, value });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not preview the cabinet.");
    }
  }

  function apply() {
    if (!value || !draft || !drawer) return;
    try {
      const candidate = stock.review?.project ?? value.project;
      const next = selectedCutUnits.length
        ? planStockCutLayouts(candidate, selectedCutUnits.map(({ layout }) => layout)).project
        : candidate;
      onApply(next, draft.source, drawer.plan.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the cabinet.");
    }
  }

  return <>
    <h2 id="modal-title">{bayCount === 1 ? "Cabinet and drawers" : "Cabinet run and drawers"}</h2>
    <p>A 2 × 4 frame with plywood sides, back and top. Inset drawers stack below the top rails.</p>
    {!!request.assumed.length && <p className="small-note">Review the suggested {request.assumed.join(", ")}.</p>}
    <form onSubmit={preview} onChange={reset}>
      {Object.entries(fields).map(([field, label]) => {
        const key = field as keyof typeof fields;
        return <LengthInput key={key} label={key === "width" && bayCount > 1 ? "Total run width" : label} value={dimensions[key]} required
          min={8} max={240}
          onChange={(value) => setDimensions((previous) => ({ ...previous, [key]: value }))} />;
      })}
      <label className="field">Cabinet bays
        <select value={bayCount} onChange={(event) => setBayCount(Number(event.target.value))}>
          {Array.from({ length: maxCabinetBays }, (_, index) => index + 1).map((count) =>
            <option key={count} value={count}>{count === 1 ? "One cabinet" : `${count} side-by-side cabinets`}</option>)}
        </select>
      </label>
      {bayCount > 1 && Number.isFinite(dimensions.width) &&
        <p className="small-note">Each cabinet is {formatStockLength(dimensions.width / bayCount)} wide and has its own frame.</p>}
      <label className="field">{bayCount === 1 ? "Number of drawers" : "Drawers per bay"}
        <select value={drawerHeights.length} onChange={(event) => {
          const count = Number(event.target.value);
          setDrawerHeights((heights) => Array.from({ length: count }, (_, index) => heights[index] ?? defaultCabinetDrawerHeight));
        }}>
          {Array.from({ length: maxCabinetDrawers }, (_, index) => index + 1)
            .map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </label>
      {drawerHeights.length > 1 && <p className="small-note">
        Drawer heights are listed from top to bottom{bayCount > 1 && " and repeated in each bay"}.
      </p>}
      {drawerHeights.map((height, index) =>
        <LengthInput key={index} label={drawerHeights.length === 1 ? "Drawer height" : `Drawer ${index + 1} height`}
          value={height} onChange={(value) => setDrawerHeights((heights) => heights.map((previous, i) => i === index ? value : previous))}
          required max={240} />)}
      {drawerHeights.length > 1 && <LengthInput label="Gap between drawer fronts" value={drawerGap}
        onChange={setDrawerGap} min={1 / 16} max={2} required />}
      <label className="field">Cabinet and drawer plywood
        <select value={stockId} onChange={(event) => setStockId(event.target.value as typeof stockId)}>
          {drawerBoxStock.map((id) => <option key={id} value={id}>{material(id).name}</option>)}
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={barPull} onChange={(event) => setBarPull(event.target.checked)} />
        {bayCount * drawerHeights.length === 1 ? "Add a centered cabinet pull" : "Add a centered pull to each drawer"}
      </label>
      <details className="field-section">
        <summary>Placement</summary>
        <p className="small-note">The layout starts at the center of the floor. Drawers open toward +Z.</p>
        <LengthInput label="Left or right offset (X)" value={x} onChange={setX} min={-1200} required />
        <LengthInput label="Front or back offset (Z)" value={z} onChange={setZ} min={-1200} required />
      </details>
      <button type="submit" className="button secondary">Preview cabinet and drawer</button>
    </form>
    {value && drawer && limit && <>
      <div className="idea-preview" aria-label="Cabinet and drawer preview">
        <PreviewBoundary>
          <Scene project={value.project} selected={null} onSelect={noop} onMove={noop}
            selectedSectionId={null} onSectionMove={noop} mode="rotate" snap={false}
            explode={false} xray={false} stage={null} view={view} onCamera={noop} fitToView readOnly
            motionPreview={pose} />
        </PreviewBoundary>
      </div>
      {value.drawers.length > 1 && <label className="field">Drawer to preview
        <select value={drawerIndex} onChange={(event) => {
          setDrawerIndex(Number(event.target.value));
          setOpen(false);
        }}>
          {value.drawers.map(({ plan }, index) => <option key={plan.id} value={index}>{plan.label}</option>)}
        </select>
      </label>}
      <p>
        Drawer box {formatPreciseInches(drawer.width)} wide × {formatPreciseInches(drawer.depth)} deep × {formatPreciseInches(drawer.height)} high.
        {" "}<a href={value.reference.manual} target="_blank" rel="noreferrer">{value.reference.name}</a>
        {value.drawers.length === 1 ? " in the shopping list." : ` · ${value.drawers.length} pairs for this layout.`}
      </p>
      {drawer.pullScrewReview && <p className="small-note">{drawer.pullScrewReview}</p>}
      <p role="status">{limit.inspectAt === undefined
        ? `The modeled drawer clears its full ${formatPreciseInches(limit.travel)} of travel.`
        : `An obstruction or clearance limit stops the modeled drawer at ${formatPreciseInches(limit.travel)}.`}</p>
      <div className="button-row">
        <button type="button" className="text-button" aria-pressed={!open} onClick={() => setOpen(false)}>Show closed drawer</button>
        <button type="button" className="text-button" aria-pressed={open} onClick={() => setOpen(true)}>
          {limit.inspectAt === undefined ? "Show fully open drawer" : "Show opening limit"}
        </button>
      </div>
      <ProposalStockReview project={project} open={stockOpen} setOpen={setStockOpen}
        offcuts={offcuts} setOffcuts={setOffcuts} review={stock.review} error={stock.error}
        cutScope={cutScope} setCutScope={setCutScope} selectedCutUnits={selectedCutUnits} />
      <button type="button" className="button primary" disabled={!!stock.error || (cutScope !== null && !selectedCutUnits.length)}
        onClick={apply}>Add cabinet and test movement</button>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </>;
}
