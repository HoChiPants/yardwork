import { useMemo, useState, type FormEvent } from "react";
import { drywallInstallation, drywallStock } from "./drywallReference";
import { DrywallScrewReview } from "./DrywallScrewReview";
import { DrywallJointReview } from "./DrywallJointReview";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import type { Piece, Project, Section } from "./model";
import { ProposalStockReview } from "./ProposalStockReview";
import { previewProposalStock, type ProposalCutScope } from "./proposalStock";
import { planStockCutLayouts } from "./recordStockCutLayout";
import { Scene } from "./Scene";
import { addDrywallWindowBacking, drywallCutMarks, previewWallDrywall, wallDrywallFit } from "./wallDrywall";
import { reviewWallDrywallScrews } from "./wallDrywallScrews";
import { reviewWallDrywallJoints } from "./wallDrywallJoints";
import { drywallSheetChoice, drywallStartFace, type DrywallFace, type WallDrywallStart } from "./wallDrywallRequests";

type Request = Parameters<typeof previewWallDrywall>[1];
type Draft = { source: Project; project: Project; sections: Section[]; selected: Section; parts: Piece[]; frame: Piece[];
  addedBacking: number; newFaces: number };
type Preview = { draft?: Draft; error?: string };
const noop = () => {};
const view = { preset: "iso", nonce: 0 };

function linings(project: Project, wallId: string, side: DrywallFace) {
  return project.sections.filter(({ wallDrywall }) =>
    wallDrywall?.wallId === wallId && (side === "both" || side === wallDrywall.side));
}

function estimate(source: Project, request: Omit<Request, "side"> & { side: DrywallFace }, withBacking: boolean): Preview {
  try {
    const wall = source.sections.find(({ id }) => id === request.wallId);
    if (!wall) throw Error("Choose a framed wall before previewing drywall.");
    const base = withBacking && !wall.generator?.windowOpening?.upperBacking ? addDrywallWindowBacking(source, wall.id) : source;
    let next = base;
    const placed = linings(base, wall.id, request.side);
    const faces = request.side === "both" ? ["front", "back"] as const : [request.side];
    const newSections: Section[] = [];
    for (const side of faces) {
      if (placed.some((section) => section.wallDrywall?.side === side)) continue;
      const result = previewWallDrywall(next, { ...request, side });
      next = result.project;
      newSections.push(result.section);
    }
    const sections = [...placed, ...newSections];
    if (!newSections.length && base === source) return {};
    const ids = new Set(sections.flatMap(({ pieceIds }) => pieceIds));
    const parts = next.pieces.filter(({ id }) => ids.has(id));
    const { frame } = wallDrywallFit(next, sections[0]);
    return { draft: { source, project: next, sections, selected: newSections[0] ?? placed[0], parts, frame,
      addedBacking: base.pieces.length - source.pieces.length, newFaces: newSections.length } };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Could not preview drywall." };
  }
}

export function WallDrywallPanel({ project, initialWall, start, onApply }: {
  project: Project;
  initialWall: string | null;
  start?: WallDrywallStart;
  onApply: (candidate: Project, source: Project, sectionId: string) => void;
}) {
  const walls = project.sections.filter(({ generator }) => generator?.type === "wall");
  const firstWall = walls.find(({ id }) => id === (start?.wallId ?? initialWall)) ?? walls[0];
  const [wallId, setWallId] = useState(firstWall?.id ?? "");
  const [side, setSide] = useState<DrywallFace>(firstWall ? drywallStartFace(project, firstWall, start) : "front");
  const [stockId, setStockId] = useState<Request["stockId"]>(drywallSheetChoice(firstWall, start?.sheetLength).id);
  const [floorGap, setFloorGap] = useState(start?.floorGap ?? 0.5);
  const [result, setResult] = useState<Preview>(() =>
    start?.task === "layout" ? estimate(project, { wallId, side, stockId, floorGap }, !!start.backing) : {});
  const [stockOpen, setStockOpen] = useState(!!start?.reuse);
  const [offcuts, setOffcuts] = useState<string[] | null>(start?.reuse ? [] : null);
  const [cutScope, setCutScope] = useState<ProposalCutScope | null>(null);
  const value = result.draft?.source === project ? result.draft : undefined;
  const selectedWall = walls.find(({ id }) => id === wallId);
  const screwReviews = useMemo(() => (value?.sections ?? linings(project, wallId, side))
    .map((lining) => reviewWallDrywallScrews(value?.project ?? project, lining)), [value, project, wallId, side]);
  const jointReviews = useMemo(() => (value?.sections ?? linings(project, wallId, side))
    .map((lining) => reviewWallDrywallJoints(value?.project ?? project, lining)), [value, project, wallId, side]);
  const stock = useMemo(() => {
    if (!value) return {};
    try {
      return { review: previewProposalStock(project, value.project, offcuts) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Could not lay out sheet stock." };
    }
  }, [project, value, offcuts]);
  const selectedCutUnits = cutScope
    ? stock.review?.recordable.filter(({ existingPartIds }) => cutScope === "shared" || !existingPartIds.length) ?? []
    : [];
  const occupied = new Set(project.sections.flatMap(({ wallDrywall }) =>
    wallDrywall?.wallId === wallId ? [wallDrywall.side] : []));

  function reset() {
    setResult({});
    setCutScope(null);
  }

  function preview(withBacking: boolean) {
    setCutScope(null);
    setResult(estimate(project, { wallId, side, stockId, floorGap }, withBacking));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    preview(false);
  }

  function apply() {
    if (!value || !stock.review) return;
    try {
      const candidate = selectedCutUnits.length
        ? planStockCutLayouts(stock.review.project, selectedCutUnits.map(({ layout }) => layout)).project
        : stock.review.project;
      onApply(candidate, value.source, value.selected.id);
    } catch (cause) {
      setResult({ draft: value, error: cause instanceof Error ? cause.message : "Could not add drywall." });
    }
  }

  return <>
    <h2 id="modal-title">Plan wall drywall</h2>
    <p>Lay out ½ in drywall on a framed interior wall in a dry area. Measure the rough openings and floor gap before cutting.</p>
    <form onSubmit={submit} onChange={reset}>
      <label className="field">Framed wall
        <select value={wallId} onChange={(event) => {
          const next = event.target.value;
          setWallId(next);
          const wall = walls.find(({ id }) => id === next);
          setStockId(drywallSheetChoice(wall, start?.sheetLength).id);
          if (wall) setSide(drywallStartFace(project, wall, start));
        }}>
          {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="field">Wall face
        <select value={side} onChange={(event) => setSide(event.target.value as DrywallFace)}>
          <option value="front">Front{occupied.has("front") ? " · already lined" : ""}</option>
          <option value="back">Back{occupied.has("back") ? " · already lined" : ""}</option>
          <option value="both">Both faces{occupied.size === 2 ? " · already lined" : ""}</option>
        </select>
      </label>
      <label className="field">Sheet size
        <select value={stockId} onChange={(event) => setStockId(event.target.value as Request["stockId"])}>
          {drywallStock.map(({ id, length }) => <option key={id} value={id}>4 ft × {length / 12} ft</option>)}
        </select>
      </label>
      <LengthInput label="Gap above wall base" value={floorGap} onChange={(length) => {
        setFloorGap(length);
        reset();
      }} min={0} max={2} required />
      <button type="submit" className="button secondary" disabled={side === "both" ? occupied.size === 2 : occupied.has(side)}>Preview drywall layout</button>
    </form>
    {screwReviews.map((review) => <DrywallScrewReview key={review.section.id} review={review} showFace={side === "both"} />)}
    {jointReviews.map((review) => <DrywallJointReview key={review.section.id} review={review} showFace={side === "both"}
      initiallyOpen={start?.task === "tape"} />)}
    {screwReviews.some(({ sheets }) => sheets.some(({ backingIssue }) => backingIssue)) &&
      selectedWall?.generator?.windowOpening && !selectedWall.generator.windowOpening.upperBacking && !value?.addedBacking &&
      <button type="button" className="button secondary" onClick={() => preview(true)}>Try adding backing above the window</button>}
    {!!value?.addedBacking && <p role="status">This layout adds {value.addedBacking} short backing studs to the existing window framing.</p>}
    {value && <>
      <div className="idea-preview" aria-label="Drywall layout preview">
        <PreviewBoundary>
          <Scene project={{ ...value.project, pieces: [...value.frame, ...value.parts] }} selected={null} onSelect={noop} onMove={noop}
            selectedSectionId={null} onSectionMove={noop} mode="rotate" snap={false} explode={false}
            xray={false} stage={null} view={view} onCamera={noop} fitToView readOnly />
        </PreviewBoundary>
      </div>
      <p role="status">{value.parts.length} fitted {value.parts.length === 1 ? "panel" : "panels"} on {side === "both" ? "both faces" : `the ${side} face`}.</p>
      {side === "both" && value.newFaces === 1 && <p className="small-note">This preview adds drywall to the {value.selected.wallDrywall?.side} face.</p>}
      <ProposalStockReview project={project} open={stockOpen} setOpen={setStockOpen}
        offcuts={offcuts} setOffcuts={setOffcuts} review={stock.review} error={stock.error}
        cutScope={cutScope} setCutScope={setCutScope} selectedCutUnits={selectedCutUnits} cutOrderLabel="Cut orders to save" />
      {value.parts.some(({ rectangularOpenings }) => rectangularOpenings?.length) &&
        <details className="field-section"><summary>Opening cut marks</summary>
          <ul>{value.parts.flatMap((piece) => drywallCutMarks(piece).map((mark, index) =>
            <li key={`${piece.id}-${index}`}>{mark}</li>))}</ul>
        </details>
      }
      <p className="small-note">Confirm backing, paper edges, fasteners and rough-in before hanging. <a href={drywallInstallation} target="_blank" rel="noreferrer">USG installation guide</a></p>
      <button type="button" className="button primary" disabled={!stock.review || (cutScope !== null && !selectedCutUnits.length)}
        onClick={apply}>{value.newFaces ? "Add drywall to wall" : "Apply window backing"}</button>
    </>}
    {result.error && <p role="alert" className="form-error">{result.error}</p>}
  </>;
}
