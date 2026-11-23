import { useMemo, useState, type FormEvent } from "react";
import { doorCasingLengths, previewDoorCasing, widerCasingReveal } from "./doorCasing";
import { doorCasingInstallation, flatCasing } from "./doorCasingReference";
import { interiorDoor } from "./doorWall";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { ProposalStockReview } from "./ProposalStockReview";
import { previewProposalStock, type ProposalCutScope } from "./proposalStock";
import { planStockCutLayouts } from "./recordStockCutLayout";
import { Scene } from "./Scene";

type Draft = ReturnType<typeof previewDoorCasing>;
type Side = Parameters<typeof previewDoorCasing>[1]["side"];
const view = { preset: "iso", nonce: 0 };
const noop = () => {};
const angle = (degrees: number) => `${Number(degrees.toFixed(1))}°`;

export function DoorCasingPanel({ project, initialWall, onApply }: {
  project: Project;
  initialWall: string | null;
  onApply: (candidate: Project, source: Project, sectionId: string) => void;
}) {
  const walls = project.sections.filter(({ generator }) => generator?.doorUnit);
  const firstWall = walls.find(({ id }) => id === initialWall) ?? walls[0];
  const [wallId, setWallId] = useState(firstWall?.id ?? "");
  const [side, setSide] = useState<Side>(firstWall?.generator?.doorUnit?.swingFace ?? "front");
  const [reveal, setReveal] = useState(0.125);
  const [bottomGap, setBottomGap] = useState(0);
  const [openAngle, setOpenAngle] = useState(0);
  const [draft, setDraft] = useState<{ source: Project; value: Draft }>();
  const [error, setError] = useState("");
  const [stockOpen, setStockOpen] = useState(false);
  const [offcuts, setOffcuts] = useState<string[] | null>(null);
  const [cutScope, setCutScope] = useState<ProposalCutScope | null>(null);
  const value = draft?.source === project ? draft.value : undefined;
  const wider = useMemo(() => value ? widerCasingReveal(project, value, bottomGap) : undefined, [value, project, bottomGap]);
  const occupied = new Set(project.sections.flatMap(({ doorCasing }) => doorCasing?.wallId === wallId ? [doorCasing.side] : []));
  const doorUnit = walls.find(({ id }) => id === wallId)?.generator?.doorUnit;
  const stock = useMemo(() => {
    if (!value) return {};
    try {
      return { review: previewProposalStock(project, value.project, offcuts) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Could not lay out casing stock." };
    }
  }, [project, value, offcuts]);
  const selectedCutUnits = cutScope
    ? stock.review?.recordable.filter(({ existingPartIds }) => cutScope === "shared" || !existingPartIds.length) ?? []
    : [];
  const swing = value?.swing;
  const limit = swing?.limit;
  const atStop = limit?.inspectAt !== undefined && Math.abs(openAngle - limit.travel) < 0.1;
  const pose = swing?.review?.preview(openAngle, atStop ? limit?.inspectAt : undefined, atStop ? limit?.siteFaceId : undefined);
  const before = value?.before?.limit?.travel;
  const blockers = swing?.stop ? [...swing.stop.obstacleNames, ...swing.stop.siteFaceNames, ...swing.stop.outsideZoneFaces] : [];
  const comparison = limit && before !== undefined && before - limit.travel > 0.1 ? `Before casing, the door cleared ${angle(before)}. ` : "";
  const focusIds = new Set(swing?.stop?.interferenceIds);
  const previewParts = new Set(value ? [...value.geometry.frame, ...value.parts].map(({ id }) => id) : []);
  const focus = value?.project.pieces.filter(({ id }) => focusIds.has(id) || previewParts.has(id));

  function reset() {
    setError("");
    setDraft(undefined);
    setOpenAngle(0);
    setCutScope(null);
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    try {
      setDraft({ source: project, value: previewDoorCasing(project, { wallId, side, reveal, bottomGap }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not fit the casing.");
    }
  }

  function apply() {
    if (!value || !draft || !stock.review) return;
    try {
      const candidate = selectedCutUnits.length
        ? planStockCutLayouts(stock.review.project, selectedCutUnits.map(({ layout }) => layout)).project
        : stock.review.project;
      onApply(candidate, draft.source, value.section.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the casing.");
    }
  }

  return <>
    <h2 id="modal-title">Plan door casing</h2>
    <p>Fit three pieces of flat pine casing to a measured interior door. Check the reveal and the finished floor before cutting.</p>
    {doorUnit?.purchase === interiorDoor.materialId && <p className="small-note">Check the trim supplied with this split-jamb door before ordering replacement casing.{" "}
      <a href={interiorDoor.listing} target="_blank" rel="noreferrer">Door kit reference</a></p>}
    <form onSubmit={preview} onChange={reset}>
      <label className="field">Fitted doorway
        <select value={wallId} onChange={(event) => {
          const next = event.target.value;
          setWallId(next);
          setSide(walls.find(({ id }) => id === next)?.generator?.doorUnit?.swingFace ?? "front");
        }}>
          {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="field">Casing face
        <select value={side} onChange={(event) => setSide(event.target.value as Side)}>
          <option value="front">Front{occupied.has("front") ? " · already cased" : ""}</option>
          <option value="back">Back{occupied.has("back") ? " · already cased" : ""}</option>
        </select>
      </label>
      <LengthInput label="Jamb reveal" value={reveal} onChange={(length) => { setReveal(length); reset(); }} min={0} max={1} required />
      <LengthInput label="Gap above finished floor" value={bottomGap} onChange={(length) => { setBottomGap(length); reset(); }} min={0} max={2} required />
      <button type="submit" className="button secondary" disabled={occupied.has(side)}>Preview casing and swing</button>
    </form>
    {value && <>
      <div className="idea-preview" aria-label="Casing and door swing preview">
        <PreviewBoundary>
          <Scene project={{ ...value.project, pieces: focus ?? [] }} selected={null} onSelect={noop}
            onMove={noop} selectedSectionId={null} onSectionMove={noop} mode="rotate" snap={false} explode={false}
            xray={false} stage={null} view={view} onCamera={noop} fitToView readOnly motionPreview={pose} />
        </PreviewBoundary>
      </div>
      {limit && swing?.review ? <>
        <p role="status">{limit.uncertain
          ? `${comparison}Review travel near ${angle(limit.travel)}${blockers.length ? ` and modeled contact with ${blockers.join(", ")}` : ""}.`
          : swing.stop
          ? `${comparison}With casing, review the stop at ${angle(limit.travel)}${blockers.length ? ` near ${blockers.join(", ")}` : ""}.`
          : `The modeled door clears its ${angle(limit.travel)} swing with casing installed.`}</p>
        {wider && <button type="button" className="button secondary" onClick={() => {
          reset();
          setReveal(wider.reveal);
          setDraft({ source: project, value: wider.draft });
        }}>Try {formatPreciseInches(wider.reveal)} reveal</button>}
        {limit.travel > 0 && <div className="field">
          <label htmlFor="casing-swing">Door swing · {angle(openAngle)}</label>
          <input id="casing-swing" type="range" min={0} max={limit.travel} step="any" value={openAngle}
            onChange={(event) => setOpenAngle(Number(event.target.value))} />
          <div className="button-row">
            <button type="button" className="text-button" onClick={() => setOpenAngle(0)}>Close preview door</button>
            <button type="button" className="text-button" onClick={() => setOpenAngle(limit.travel)}>Show swing limit</button>
          </div>
        </div>}
      </> : <p role="status">{swing?.error ?? "Review the door’s hinge setup before testing the swing."}</p>}
      {value.geometry.wallGap === undefined
        ? <p className="small-note">This preview uses the jamb face. Check the actual finished wall plane.</p>
        : Math.max(value.geometry.jambGap, value.geometry.wallGap) > 0.01 &&
          <p className="small-note">Check the fit across the {formatPreciseInches(Math.max(value.geometry.jambGap, value.geometry.wallGap))} offset between the jamb and the wall face.</p>}
      <table>
        <caption>45° casing cuts · {flatCasing.name}</caption>
        <thead><tr><th scope="col">Piece</th><th scope="col">Long point</th><th scope="col">Short point</th></tr></thead>
        <tbody>{value.parts.map((piece) => {
          const { long, short } = doorCasingLengths(piece);
          return <tr key={piece.id}><th scope="row">{piece.name}</th><td>{formatPreciseInches(long)}</td><td>{formatPreciseInches(short)}</td></tr>;
        })}</tbody>
      </table>
      <ProposalStockReview project={project} open={stockOpen} setOpen={setStockOpen}
        offcuts={offcuts} setOffcuts={setOffcuts} review={stock.review} error={stock.error}
        cutScope={cutScope} setCutScope={setCutScope} selectedCutUnits={selectedCutUnits} />
      <p className="small-note">Check the miter fit, nail backing, and swing with the actual hinge pins, handle and stop. <a href={doorCasingInstallation} target="_blank" rel="noreferrer">Door casing installation guide</a></p>
      <button type="button" className="button primary" disabled={!stock.review || (cutScope !== null && !selectedCutUnits.length)}
        onClick={apply}>Add door casing</button>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </>;
}
