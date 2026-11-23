import { useMemo, useState, type FormEvent } from "react";
import { cabinetDoorFrameParts, cabinetDoorTestSummary, previewCabinetDoors, previewCabinetPullRevision } from "./cabinetDoors";
import { cabinetDoorStock, defaultCabinetDoorPull, type CabinetDoorsInput } from "./cabinetDoorsSchema";
import { libertyBarPull } from "./cabinetPullReference";
import { libertyFlushHinge } from "./cabinetDoorsReference";
import { edgeBandingProductIds, edgeBandingProducts } from "./edgeBandingReference";
import { bounds } from "./engine";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import { material, type Project, type Section } from "./model";
import { motionReviewDistance, motionReviewTravel, type MotionPreview } from "./mechanismMotion";
import { proposalMotionChanges } from "./motionImpact";
import { partLabel } from "./partLabels";
import { ProposalStockReview } from "./ProposalStockReview";
import { previewProposalStock, type ProposalCutScope } from "./proposalStock";
import { planStockCutLayouts } from "./recordStockCutLayout";
import { Scene } from "./Scene";

const frameLabels = ["Left stile", "Right stile", "Bottom rail", "Top rail"] as const;
const noop = () => {};
const view = { preset: "iso", nonce: 0 };
const initial: CabinetDoorsInput = {
  frameIds: ["", "", "", ""], leaves: "pair", stock: cabinetDoorStock[0],
  outerGap: 0.125, centerGap: 0.125, angle: 90,
  pinTowardFrame: NaN, pinForward: NaN, hingesPerLeaf: 2, hingeEnd: 2, hinge: "measured",
};
const clearances = [
  ["outerGap", "Reveal at each frame edge", 0.03125, 0.5],
  ["centerGap", "Gap between doors", 0.03125, 0.5],
  ["pinTowardFrame", "Pin offset toward stile from door edge", 0, 0.5],
  ["pinForward", "Pin center ahead of closed front", 0.001, 1],
  ["hingeEnd", "Hinge centers in from door top and bottom", 0.5, 20],
] as const;

export function CabinetDoorsPanel({ project, suggestion, section, pullInset, onApply }: {
  project: Project;
  suggestion?: { leaves?: CabinetDoorsInput["leaves"]; barPull?: boolean };
  section?: Section;
  pullInset?: number;
  onApply: (next: Project, source: Project, planId: string) => void;
}) {
  const [input, setInput] = useState<CabinetDoorsInput>(() => section?.cabinetDoors ? {
    ...section.cabinetDoors,
    pull: { ...(section.cabinetDoors.pull ?? defaultCabinetDoorPull), ...(pullInset !== undefined && { inset: pullInset }) },
  } : ({
    ...initial,
    leaves: suggestion?.leaves ?? initial.leaves,
    pull: suggestion?.barPull ? defaultCabinetDoorPull : undefined,
  }));
  const [draft, setDraft] = useState<{ source: Project; value: ReturnType<typeof previewCabinetDoors> }>();
  const [testIndex, setTestIndex] = useState(0);
  const [travel, setTravel] = useState(0);
  const [contact, setContact] = useState<MotionPreview>();
  const [stockOpen, setStockOpen] = useState(false);
  const [offcuts, setOffcuts] = useState<string[] | null>(null);
  const [cutScope, setCutScope] = useState<ProposalCutScope | null>(null);
  const [error, setError] = useState("");
  const value = draft?.source === project ? draft.value : undefined;
  const changes = useMemo(() => section && value ? proposalMotionChanges(project, value.project) : [], [section, value, project]);
  const options = useMemo(() => section ? [] : cabinetDoorFrameParts(project), [project, section]);
  const stock = useMemo(() => {
    if (!value || value.issue || (!stockOpen && !offcuts && !cutScope)) return {};
    try {
      return { review: previewProposalStock(project, value.project, offcuts) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Check the door stock and scraps." };
    }
  }, [value, project, stockOpen, offcuts, cutScope]);
  const units = cutScope ? stock.review?.recordable.filter(({ existingPartIds }) =>
    cutScope === "shared" || !existingPartIds.length) ?? [] : [];
  const currentTest = value?.tests[testIndex] ?? value?.tests[0];
  const review = currentTest?.result.review;
  const limit = useMemo(() => review?.playbackLimit(0, motionReviewTravel(review)), [review]);
  const finding = useMemo(() => currentTest && cabinetDoorTestSummary(currentTest.result), [currentTest]);
  const visible = limit && review && review.preview(travel,
    Math.abs(travel - limit.travel) < 0.0001 ? limit.inspectAt : undefined,
    Math.abs(travel - limit.travel) < 0.0001 ? limit.siteFaceId : undefined);
  const nearby = value && (contact?.bounds ?? review?.bounds ?? bounds(value.leaves[0]));
  const shown = useMemo(() => value?.project.pieces.filter((piece) => {
    if (piece.offcut) return false;
    if (input.frameIds.includes(piece.id) || value.section.pieceIds.includes(piece.id)) return true;
    if (!nearby) return false;
    const box = bounds(piece);
    return box.min.every((min, i) => min <= nearby.max[i] + 2 && box.max[i] >= nearby.min[i] - 2);
  }), [value, nearby, input.frameIds]);

  function set<K extends keyof CabinetDoorsInput>(key: K, next: CabinetDoorsInput[K]) {
    setInput((prior) => ({ ...prior, [key]: next }));
    setDraft(undefined);
    setTravel(0);
    setContact(undefined);
    setError("");
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDraft(undefined);
    setTravel(0);
    setContact(undefined);
    try {
      const value = section
        ? previewCabinetPullRevision(project, section.id, input.pull!)
        : previewCabinetDoors(project, input);
      setDraft({ source: project, value });
      setTestIndex(Math.max(0, value.tests.findIndex(({ name }) => name === "Both cabinet doors together")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the cabinet opening and hinge measurements.");
    }
  }

  function apply() {
    if (!value || value.issue || !draft || stock.error) return;
    try {
      const base = stock.review?.project ?? value.project;
      const candidate = units.length ? planStockCutLayouts(base, units.map(({ layout }) => layout)).project : base;
      onApply(candidate, draft.source, value.plans[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the cabinet door setup.");
    }
  }

  return <>
    <h2 id="modal-title">{section ? "Edit cabinet pulls" : "Fit cabinet doors"}</h2>
    {section
      ? <p>{section.name} · Position the pulls from the finished edges, then preview the saved swings.</p>
      : <p>Fit flush inset plywood doors to a square wood face frame. Select the four members as you see them from the front.</p>}
    {!section && options.length < 4 && <p className="small-note">Place or import the two stiles and rails of the cabinet frame first.</p>}
    <form onSubmit={preview}>
      {!section && <>
      <div className="fit-measurement-fields">
        {frameLabels.map((label, index) => <label className="field" key={label}>{label}
          <select required value={input.frameIds[index]} onChange={({ currentTarget }) => {
            const ids = [...input.frameIds] as CabinetDoorsInput["frameIds"];
            ids[index] = currentTarget.value;
            set("frameIds", ids);
          }}>
            <option value="">Choose a part</option>
            {options.map(({ id, name }) => <option key={id} value={id}
              disabled={input.frameIds.some((other, i) => i !== index && other === id)}>
              {partLabel(project, id)} · {name}
            </option>)}
          </select>
        </label>)}
        <label className="field">Door arrangement
          <select value={input.leaves} onChange={({ currentTarget }) => set("leaves", currentTarget.value as CabinetDoorsInput["leaves"])}>
            <option value="pair">Two doors</option>
            <option value="left">Single door, hinge on left</option>
            <option value="right">Single door, hinge on right</option>
          </select>
        </label>
        <label className="field">Panel stock
          <select value={input.stock} onChange={({ currentTarget }) => set("stock", currentTarget.value as CabinetDoorsInput["stock"])}>
            {cabinetDoorStock.map((id) => <option key={id} value={id}>{material(id).name}</option>)}
          </select>
        </label>
        <label className="field">Hinge for shopping list
          <select value={input.hinge} onChange={({ currentTarget }) => set("hinge", currentTarget.value as CabinetDoorsInput["hinge"])}>
            <option value="measured">Use a measured fixed-pin hinge</option>
            <option value={libertyFlushHinge.id}>Liberty Hammercraft flush H hinge</option>
          </select>
        </label>
        <label className="field">Hinges per door
          <select value={input.hingesPerLeaf} onChange={({ currentTarget }) => set("hingesPerLeaf", Number(currentTarget.value))}>
            {[2, 3, 4].map((count) => <option key={count}>{count}</option>)}
          </select>
        </label>
        <label className="field">Measured opening angle (degrees)
          <input type="number" min={5} max={180} step="any" value={input.angle}
            onChange={({ currentTarget }) => set("angle", currentTarget.valueAsNumber || 0)} required />
        </label>
        {clearances.filter(([key]) => key !== "centerGap" || input.leaves === "pair").map(([key, label, min, max]) =>
          <LengthInput key={key} label={label} value={input[key]} min={min} max={max} required onChange={(length) => set(key, length)} />)}
      </div>
      <label className="checkbox-field">
        <input type="checkbox" checked={!!input.banding} onChange={({ currentTarget }) =>
          set("banding", currentTarget.checked ? { productId: edgeBandingProductIds[0], trim: 0.5, thickness: NaN } : undefined)} />
        Allow for edge banding on all four edges
      </label>
      {input.banding && <div className="fit-measurement-fields">
        <label className="field">Door edge banding
          <select value={input.banding.productId} onChange={({ currentTarget }) => set("banding", {
            ...input.banding!, productId: currentTarget.value as NonNullable<CabinetDoorsInput["banding"]>["productId"],
          })}>
            {edgeBandingProductIds.map((id) => <option key={id} value={id}>{edgeBandingProducts[id].name}</option>)}
          </select>
        </label>
        <LengthInput label="Installed banding thickness" required value={input.banding.thickness} min={0.001} max={0.125}
          onChange={(thickness) => set("banding", { ...input.banding!, thickness })} />
        <LengthInput label="Total strip trim" required value={input.banding.trim} min={0} max={12}
          onChange={(trim) => set("banding", { ...input.banding!, trim })} />
      </div>}
      <label className="checkbox-field">
        <input type="checkbox" checked={!!input.pull} onChange={({ currentTarget }) =>
          set("pull", currentTarget.checked ? defaultCabinetDoorPull : undefined)} />
        Add vertical cabinet pulls
      </label>
      </>}
      {input.pull && <>
        <p className="small-note">Liberty Solid Bar · {libertyBarPull.mountingSpacingMm} mm mounting centers · {libertyBarPull.size[2]} in projection.</p>
        <div className="fit-measurement-fields">
          <LengthInput label="Pull center from free edge" value={input.pull.inset} min={0.01} max={24} required
            onChange={(inset) => set("pull", { ...input.pull!, inset })} />
          <label className="field">Measure pull height from
            <select value={input.pull.datum} onChange={({ currentTarget }) =>
              set("pull", { ...input.pull!, datum: currentTarget.value === "top" ? "top" : "bottom" })}>
              <option value="bottom">Finished bottom edge</option>
              <option value="top">Finished top edge</option>
            </select>
          </label>
          <LengthInput label="Pull center from selected edge" value={input.pull.height} min={0.01} max={96} required
            onChange={(height) => set("pull", { ...input.pull!, height })} />
        </div>
      </>}
      {!section && <p className="small-note">Measure the installed pin center and travel. This layout uses a fixed pin, as on a face-mounted flush H hinge.{" "}
        <a href={libertyFlushHinge.manufacturerGuide} target="_blank" rel="noreferrer">Liberty flush mounting diagram</a></p>}
      <button type="submit" className="button secondary" disabled={!section && options.length < 4}>
        {section ? "Preview pull placement" : "Preview cabinet doors"}
      </button>
    </form>
    {value && <>
      <div className="idea-preview" aria-label="Cabinet door swing preview">
        <PreviewBoundary>
          <Scene project={{ ...value.project, pieces: shown ?? [...value.leaves, ...value.pulls] }} selected={null} onSelect={noop} onMove={noop}
            selectedSectionId={null} onSectionMove={noop} mode="rotate" snap={false} explode={false} xray={false}
            stage={null} view={view} onCamera={noop} fitToView readOnly motionPreview={contact ?? visible ?? undefined} />
        </PreviewBoundary>
      </div>
      {!section && <ul aria-label="Cabinet door panel sizes">
        {value.leaves.map(({ id, name, size }, index) => {
          const [width, height] = value.layout.geometry[index].finishedSize;
          return <li key={id}>{name} · {formatPreciseInches(size[0])} wide × {formatPreciseInches(size[1])} high · vertical face grain
            {value.section.cabinetDoors?.banding && <> · Finished {formatPreciseInches(width)} × {formatPreciseInches(height)}</>}
          </li>;
        })}
      </ul>}
      {value.issue && <p role="alert" className="form-error">{value.issue}</p>}
      {value.tests.length > 1 && <label className="field">Swing test
        <select value={testIndex} onChange={({ currentTarget }) => {
          setTestIndex(Number(currentTarget.value));
          setTravel(0);
          setContact(undefined);
        }}>
          {value.tests.map(({ name }, index) => <option value={index} key={name}>{name}</option>)}
        </select>
      </label>}
      {finding && <p role="status">{finding.detail}</p>}
      {review && limit && <>
        <div className="field">
          <label htmlFor="cabinet-door-travel">{visible?.positionText ?? motionReviewDistance(review, travel)}</label>
          <input type="range" id="cabinet-door-travel" aria-label="Inspect cabinet door travel" min={0} max={limit.travel}
            step="any" value={travel} onChange={({ currentTarget }) => {
              setContact(undefined);
              setTravel(currentTarget.valueAsNumber);
            }} />
        </div>
        <button type="button" className="text-button" onClick={() => {
          setContact(undefined);
          setTravel(limit.travel);
        }}>
          {limit.inspectAt !== undefined ? "Show opening limit" : "Show open doors"}
        </button>
      </>}
      {changes.length > 0 && <details className="field-section">
        <summary>New findings in saved movement ({changes.length})</summary>
        <ul>{changes.map(({ id, label, detail, show }) => <li key={id}>
          <p>{label} · {detail}</p>
          {show && <button type="button" className="text-button" onClick={() => setContact(show())}>Show contact in 3D</button>}
        </li>)}</ul>
        {contact && <button type="button" className="text-button" onClick={() => setContact(undefined)}>Return to selected swing</button>}
      </details>}
      {!section && !value.issue && <ProposalStockReview project={project} open={stockOpen} setOpen={setStockOpen}
        offcuts={offcuts} setOffcuts={setOffcuts} review={stock.review} error={stock.error}
        cutScope={cutScope} setCutScope={setCutScope} selectedCutUnits={units} />}
      <button type="button" className="button primary"
        disabled={!!value.issue || !!stock.error || (cutScope !== null && !units.length)} onClick={apply}>
        {section ? "Apply pull placement" : "Add fitted cabinet doors"}
      </button>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </>;
}
