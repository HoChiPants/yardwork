import { useMemo, useState } from "react";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import {
  furnitureBracePosts, furnitureBraceReference, furnitureBraceScope, furnitureBraceStockNames, previewFurnitureBrace,
} from "./furnitureBrace";
import { braceFaces, braceStocks, type FurnitureBraceInput } from "./furnitureBraceSchema";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { proposalMotionChanges } from "./motionImpact";
import type { MotionPreview } from "./mechanismMotion";
import { partLabel } from "./partLabels";
import { previewProposalStock } from "./proposalStock";
import { planStockCutLayouts } from "./recordStockCutLayout";
import { Scene } from "./Scene";

type Draft = ReturnType<typeof previewFurnitureBrace>;
const view = { preset: "iso", nonce: 0 };
const noop = () => {};

export function FurnitureBracePanel({ project, sectionId, firstId, secondId, onApply }: {
  project: Project;
  sectionId?: string;
  firstId?: string;
  secondId?: string;
  onApply: (candidate: Project, source: Project, partId: string) => void;
}) {
  const posts = useMemo(() => furnitureBracePosts(project), [project]);
  const owners = new Map(project.sections.flatMap(({ id, pieceIds }) => pieceIds.map((partId) => [partId, id] as const)));
  const initial = posts.find(({ id }) => id === firstId) ??
    posts.find(({ id }) => sectionId && owners.get(id) === sectionId) ?? posts[0];
  const other = posts.find(({ id }) => id === secondId && owners.get(id) === owners.get(initial?.id ?? "")) ??
    posts.find(({ id }) => id !== initial?.id && owners.get(id) === owners.get(initial?.id ?? ""));
  const [input, setInput] = useState<FurnitureBraceInput>(() => ({
    firstId: initial?.id ?? "", secondId: other?.id ?? "", face: "+Z", stock: braceStocks[0],
    firstHeight: initial ? initial.size[1] / 4 : NaN, secondHeight: other ? other.size[1] * 0.75 : NaN, extension: 1.5,
  }));
  const [reuse, setReuse] = useState(true);
  const [recordCut, setRecordCut] = useState(true);
  const [draft, setDraft] = useState<Draft>();
  const [pose, setPose] = useState<MotionPreview>();
  const [error, setError] = useState("");
  const value = draft?.source === project ? draft : undefined;
  const options = posts.filter(({ id }) => id !== input.firstId && owners.get(id) === owners.get(input.firstId));
  const changes = useMemo(() => value ? proposalMotionChanges(project, value.project) : [], [project, value]);
  const cut = useMemo(() => value && !value.match ? previewProposalStock(project, value.project, null)
    .recordable.find(({ existingPartIds }) => existingPartIds.length === 0) : undefined, [project, value]);
  const label = (id: string, name: string) => `${partLabel(project, id)} · ${name}`;
  function reset() {
    setDraft(undefined);
    setPose(undefined);
    setError("");
  }
  function update<Key extends keyof FurnitureBraceInput>(key: Key, value: FurnitureBraceInput[Key]) {
    reset();
    setInput((current) => ({ ...current, [key]: value }));
  }
  function apply() {
    if (!value) return;
    try {
      const candidate = cut && recordCut ? planStockCutLayouts(value.project, [cut.layout]).project : value.project;
      onApply(candidate, project, value.brace.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this brace.");
    }
  }
  return <>
    <h2 id="modal-title">Plan a furniture diagonal brace</h2>
    {posts.length >= 2 ? <form onSubmit={(event) => {
      event.preventDefault();
      reset();
      try {
        setDraft(previewFurnitureBrace(project, input, reuse));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not fit this brace.");
      }
    }}>
      <p>Choose two upright posts. Measure up from each post’s bottom to a mark across the middle of its face.</p>
      <div className="two-col">
        <label className="field">First post
          <select value={input.firstId} onChange={({ currentTarget }) => {
            const post = posts.find(({ id }) => id === currentTarget.value)!;
            const mate = posts.find(({ id }) => id !== post.id && owners.get(id) === owners.get(post.id));
            reset();
            setInput((previous) => ({ ...previous, firstId: post.id, firstHeight: post.size[1] / 4,
              secondId: mate?.id ?? "", secondHeight: mate ? mate.size[1] * 0.75 : NaN }));
          }}>
            {posts.map(({ id, name }) => <option key={id} value={id}>{label(id, name)}</option>)}
          </select>
        </label>
        <label className="field">Second post
          <select value={input.secondId} onChange={({ currentTarget }) => {
            const post = options.find(({ id }) => id === currentTarget.value)!;
            reset();
            setInput((previous) => ({ ...previous, secondId: post.id, secondHeight: post.size[1] * 0.75 }));
          }}>
            {options.map(({ id, name }) => <option key={id} value={id}>{label(id, name)}</option>)}
          </select>
        </label>
        <LengthInput label="First mark above post bottom" min={0} value={input.firstHeight}
          onChange={(n) => update("firstHeight", n)} required />
        <LengthInput label="Second mark above post bottom" min={0} value={input.secondHeight}
          onChange={(n) => update("secondHeight", n)} required />
        <label className="field">First post mounting face
          <select value={input.face} onChange={({ currentTarget }) => update("face", currentTarget.value as FurnitureBraceInput["face"])}>
            {braceFaces.map((face) => <option key={face} value={face}>Local {face}</option>)}
          </select>
        </label>
        <LengthInput label="Extend past each mark" min={0} value={input.extension} onChange={(n) => update("extension", n)} required />
      </div>
      <label className="field">Brace stock
        <select value={input.stock} onChange={({ currentTarget }) => update("stock", currentTarget.value as FurnitureBraceInput["stock"])}>
          {braceStocks.map((id) => <option key={id} value={id}>{furnitureBraceStockNames[id]}</option>)}
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={reuse} onChange={({ currentTarget }) => { reset(); setReuse(currentTarget.checked); }} />
        Use a matching Cut pool offcut
      </label>
      <button type="submit" className="button secondary" disabled={!options.length}>Preview brace and cuts</button>
      {!options.length && <p className="small-note">Choose a first post that has another upright in its furniture section.</p>}
    </form> : <p>Place two upright rectangular wood posts in the same furniture frame.</p>}
    {value && <section aria-label="Diagonal brace preview">
      <div className="idea-preview" aria-label="Furniture brace fit in 3D">
        <PreviewBoundary>
          <Scene project={value.project} selected={value.brace.id} onSelect={noop} onMove={noop} selectedSectionId={null}
            onSectionMove={noop} mode="rotate" snap={false} explode={false} xray={false} stage={null}
            view={view} onCamera={noop} fitToView readOnly motionPreview={pose} />
        </PreviewBoundary>
      </div>
      <p>Square-cut the brace to <strong>{formatPreciseInches(value.geometry.length)}</strong>. Put its centerline marks {formatPreciseInches(input.extension)} from each end.</p>
      <ul aria-label="Modeled end contact">
        {[value.geometry.first, value.geometry.second].map(({ id, name }, i) => <li key={id}>
          {label(id, name)} · {Number(value.contacts[i].toFixed(2))} sq in face contact
        </li>)}
      </ul>
      {value.match && <p>Use {partLabel(project, value.match.piece.id)} · {value.match.operations.map(({ text }) => text).join(" · ") || "Fits as measured."}</p>}
      {cut && <label className="checkbox-field">
        <input type="checkbox" checked={recordCut} onChange={({ currentTarget }) => setRecordCut(currentTarget.checked)} />
        Save the board cut order and expected remnant
      </label>}
      {changes.length > 0 && <section aria-label="Changes to saved movement" className="field-section">
        <h3>Changes to saved movement</h3>
        <ul>{changes.map(({ id, label, detail, show }) => <li key={id}>
          <p>{label} · {detail}</p>
          {show && <button type="button" className="text-button" onClick={() => setPose(show())}>Show contact in 3D</button>}
        </li>)}</ul>
        {pose && <button type="button" className="text-button" onClick={() => setPose(undefined)}>Return to closed view</button>}
      </section>}
      <button type="button" className="button primary" onClick={apply}>Add brace to project</button>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="small-note">{furnitureBraceScope} <a href={furnitureBraceReference} target="_blank" rel="noreferrer">Kreg furniture construction example</a></p>
  </>;
}
