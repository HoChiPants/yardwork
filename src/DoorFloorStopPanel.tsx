import { useMemo, useState, type FormEvent } from "react";
import { floorStopAngle, floorStopStartingAngle, previewFloorStop, removeFloorStop } from "./doorFloorStop";
import { everbiltFloorStop, floorStopLayoutReference } from "./doorFloorStopReference";
import type { FloorStopMeasurements } from "./doorFloorStopSchema";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import type { Project, Section } from "./model";
import { Scene } from "./Scene";

const view = { preset: "iso", nonce: 0 };
const noop = () => {};
const initial: FloorStopMeasurements = {
  target: NaN, latchInset: 1.5, width: NaN, depth: NaN, height: NaN, purchase: "measured",
};
const fields = [
  ["latchInset", "Distance in from latch edge", 0.25, 24],
  ["width", "Overall width along the open leaf", 0.25, 6],
  ["depth", "Overall depth across the open leaf", 0.25, 6],
  ["height", "Bumper height above the finished floor", 0.25, 8],
] as const;
type Preview = ReturnType<typeof previewFloorStop>;
type Props = {
  project: Project;
  initialWall: string | null;
  onChange: (candidate: Project, source: Project, wallId: string, removed?: boolean) => void;
};

export function DoorFloorStopPanel({ project, initialWall, onChange }: Props) {
  const walls = project.sections.filter(({ generator }) => generator?.doorUnit);
  const [wallId, setWallId] = useState(walls.find(({ id }) => id === initialWall)?.id ?? walls[0]?.id ?? "");
  const wall = walls.find(({ id }) => id === wallId);

  return <>
    <h2 id="modal-title">Plan a floor door stop</h2>
    <p>Use the fitted door, installed handle and nearby surfaces to find where a stop can catch the leaf. Measure the stop with its riser fitted if you plan to use one.</p>
    <label className="field">Fitted doorway
      <select value={wallId} onChange={({ currentTarget }) => setWallId(currentTarget.value)}>
        {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    {wall && <FloorStopEditor key={wall.id} project={project} wall={wall} onChange={onChange} />}
  </>;
}

function FloorStopEditor({ project, wall, onChange }: Pick<Props, "project" | "onChange"> & { wall: Section }) {
  const saved = project.sections.find(({ doorFloorStop }) => doorFloorStop?.wallId === wall.id);
  const startingAngle = useMemo(() => floorStopStartingAngle(project, wall.id, saved), [project, wall.id, saved]);
  const [input, setInput] = useState(() => {
    if (!saved?.doorFloorStop) return { ...initial, target: startingAngle?.target ?? NaN };
    const { wallId: _wallId, ...measurements } = saved.doorFloorStop;
    return measurements;
  });
  const [preview, setPreview] = useState<{ source: Project; draft: Preview }>();
  const [error, setError] = useState("");
  const [openAngle, setOpenAngle] = useState(0);
  const draft = preview?.source === project ? preview.draft : undefined;
  const swing = draft?.swing;
  const limit = swing?.limit;
  const atLimit = limit && Math.abs(limit.travel - openAngle) < 0.0001;
  const pose = swing?.review?.preview(openAngle, atLimit ? limit.inspectAt : undefined, atLimit ? limit.siteFaceId : undefined);
  const focus = new Set([...(draft?.wall.pieceIds ?? []), ...(swing?.stop?.interferenceIds ?? []),
    ...(draft?.priorContacts ?? []), ...(draft?.piece ? [draft.piece.id] : []),
    ...project.sections.filter(({ wallDrywall, doorCasing }) => (wallDrywall?.wallId ?? doorCasing?.wallId) === wall.id)
      .flatMap(({ pieceIds }) => pieceIds)]);

  function update<K extends keyof FloorStopMeasurements>(key: K, value: FloorStopMeasurements[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setPreview(undefined);
    setError("");
    setOpenAngle(0);
  }

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPreview(undefined);
    try {
      const next = previewFloorStop(project, wall.id, input);
      setPreview({ source: project, draft: next });
      setOpenAngle(next.swing?.limit?.travel ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the floor stop and doorway measurements.");
    }
  }

  function save(remove = false) {
    try {
      if (remove && saved) onChange(removeFloorStop(project, saved.id), project, wall.id, true);
      else if (draft && !draft.issue) onChange(draft.project, preview!.source, wall.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the floor stop.");
    }
  }

  return <>
    {!wall.generator?.doorUnit?.hardware && <p className="small-note">Add the measured knob or lever under Check door hardware to include it in this sweep.</p>}
    <form onSubmit={check}>
      <div className="fit-measurement-fields">
        <label className="field">Target opening angle (degrees)
          <input type="number" min={5} max={179} step="any" required
            value={Number.isFinite(input.target) ? input.target : ""}
            onChange={({ currentTarget }) => update("target", currentTarget.valueAsNumber)} />
        </label>
        <label className="field">Stop for shopping list
          <select value={input.purchase} onChange={({ currentTarget }) => update("purchase", currentTarget.value as FloorStopMeasurements["purchase"])}>
            <option value="measured">Use a measured stop</option>
            <option value={everbiltFloorStop.id}>Everbilt adjustable floor stop</option>
          </select>
        </label>
        {fields.map(([key, label, min, max]) => <LengthInput key={key} label={label} value={input[key]} min={min} max={max} required
          onChange={(value) => update(key, value)} />)}
      </div>
      {startingAngle && <p className="small-note">The current swing reaches {floorStopAngle(startingAngle.baseline)} without a stop.
        {" "}<button className="text-button" type="button"
          onClick={() => update("target", startingAngle.target)}>Try {floorStopAngle(startingAngle.target)}</button>
      </p>}
      <p className="small-note">The preview uses a rectangular envelope. On site, confirm where the rubber actually meets the leaf.{" "}
        {input.purchase === everbiltFloorStop.id && <><a href={everbiltFloorStop.listing} target="_blank" rel="noreferrer">Everbilt 28367</a>{" · "}</>}
        <a href={floorStopLayoutReference} target="_blank" rel="noreferrer">Ives floor layout example</a></p>
      <button className="button secondary" type="submit">Preview floor stop and swing</button>
    </form>
    {draft && <>
      <p>{draft.baseline}</p>
      <p role={draft.issue ? "alert" : "status"}>{draft.result}</p>
      {!draft.issue && <p>{draft.marks}</p>}
      {limit && <div className="idea-preview" aria-label="Floor stop swing preview">
        <PreviewBoundary>
          <Scene project={{ ...draft.project, pieces: draft.project.pieces.filter(({ id }) => focus.has(id)) }} selected={draft.piece.id}
            onSelect={noop} onMove={noop} selectedSectionId={null} onSectionMove={noop}
            mode="rotate" snap={false} explode={false} xray={false} stage={null}
            view={view} onCamera={noop} fitToView readOnly motionPreview={pose} />
        </PreviewBoundary>
      </div>}
      {!!limit?.travel && <div className="field">
        <label htmlFor="floor-stop-swing">Door swing · {floorStopAngle(openAngle)}</label>
        <input id="floor-stop-swing" type="range" min={0} max={limit.travel} step="any" value={openAngle}
          onChange={({ currentTarget }) => setOpenAngle(currentTarget.valueAsNumber)} />
        <button type="button" className="text-button" onClick={() => setOpenAngle(limit.travel)}>Show first contact</button>
      </div>}
      <button className="button primary" type="button" disabled={!!draft.issue} onClick={() => save()}>Save floor stop</button>
    </>}
    {saved && <button className="text-button" type="button" onClick={() => save(true)}>Remove modeled floor stop</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
