import { useState, type FormEvent } from "react";
import { previewDoorHardware } from "./doorHardware";
import { georgianPassage } from "./doorHardwareReference";
import type { DoorHardware } from "./doorHardwareSchema";
import { PreviewBoundary } from "./IdeaPlanner";
import { LengthInput } from "./LengthInput";
import type { Project, Section } from "./model";
import { Scene } from "./Scene";

type Draft = ReturnType<typeof previewDoorHardware>;
const view = { preset: "iso", nonce: 0 };
const noop = () => {};
const angle = (degrees: number) => `${Number(degrees.toFixed(1))}°`;
const blankFace = { width: NaN, height: NaN, projection: NaN, towardHinge: 0 };
const initialMeasurements: DoorHardware = {
  grip: "knob", purchase: "measured", backset: NaN, centerHeight: NaN, front: blankFace, back: blankFace,
};
const gripFields = [
  ["width", "Hardware width", 0.001, 12],
  ["height", "Hardware height", 0.001, 12],
  ["projection", "Projection from door face", 0.001, 8],
] as const;

export function DoorHardwarePanel({ project, initialWall, onApply }: {
  project: Project;
  initialWall: string | null;
  onApply: (draft: Draft, source: Project) => void;
}) {
  const walls = project.sections.filter(({ generator }) => generator?.doorUnit);
  const [wallId, setWallId] = useState(walls.find(({ id }) => id === initialWall)?.id ?? walls[0]?.id ?? "");
  const wall = walls.find(({ id }) => id === wallId);
  return <>
    <h2 id="modal-title">Check door hardware</h2>
    <label className="field">Fitted doorway
      <select value={wallId} onChange={({ currentTarget }) => setWallId(currentTarget.value)}>
        {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    {wall && <HardwareEditor key={wall.id} project={project} wall={wall} onApply={onApply} />}
  </>;
}

function HardwareEditor({ project, wall, onApply }: {
  project: Project;
  wall: Section;
  onApply: (draft: Draft, source: Project) => void;
}) {
  const saved = wall.generator?.doorUnit?.hardware;
  const [input, setInput] = useState(saved ?? initialMeasurements);
  const [mirrored, setMirrored] = useState(!saved || JSON.stringify(saved.front) === JSON.stringify(saved.back));
  const [preview, setPreview] = useState<{ source: Project; draft: Draft; bare?: number }>();
  const [error, setError] = useState("");
  const [openAngle, setOpenAngle] = useState(0);
  const draft = preview?.source === project ? preview.draft : undefined;
  const limit = draft?.swing.limit;
  const stop = draft?.swing.stop;
  const blockers = stop ? [...stop.obstacleNames, ...stop.siteFaceNames, ...stop.outsideZoneFaces] : [];
  const hit = draft?.parts.filter(({ id }) => stop?.interferenceIds.includes(id)) ?? [];
  const stopPose = limit?.inspectAt !== undefined && Math.abs(limit.travel - openAngle) < 0.0001;
  const pose = draft?.swing.review?.preview(openAngle, stopPose ? limit?.inspectAt : undefined, stopPose ? limit?.siteFaceId : undefined);
  const focus = new Set([...(draft?.wall.pieceIds ?? []), ...(stop?.interferenceIds ?? []),
    ...project.sections.filter(({ wallDrywall, doorCasing }) => (wallDrywall?.wallId ?? doorCasing?.wallId) === wall.id)
      .flatMap(({ pieceIds }) => pieceIds)]);

  function reset() {
    setError("");
    setPreview(undefined);
    setOpenAngle(0);
  }

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    try {
      const draft = previewDoorHardware(project, wall.id, { ...input, back: mirrored ? input.front : input.back });
      const bare = previewDoorHardware(project, wall.id, null).swing.limit?.travel;
      setPreview({ source: project, draft, bare });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the measured hardware and fitted door setup.");
    }
  }

  function save(remove = false) {
    try {
      const value = remove ? previewDoorHardware(project, wall.id, null) : draft;
      if (value) onApply(value, remove ? project : preview!.source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the door hardware.");
    }
  }

  function faceFields(face: "front" | "back") {
    const prefix = mirrored ? "" : face === "front" ? "Front " : "Back ";
    return <>
      {gripFields.map(([key, label, min, max]) => <LengthInput key={key} label={`${prefix}${label}`}
        value={input[face][key]} min={min} max={max} required onChange={(value) => {
          setInput((current) => ({ ...current, [face]: { ...current[face], [key]: value } }));
          reset();
        }} />)}
      {input.grip === "lever" && <LengthInput label={`${prefix}Offset toward the hinge`} value={input[face].towardHinge}
        min={-6} max={6} required onChange={(value) => {
          setInput((current) => ({ ...current, [face]: { ...current[face], towardHinge: value } }));
          reset();
        }} />}
    </>;
  }

  return <>
    <p>Measure the widest and tallest parts of the installed hardware, including the trim plate. Yardwork carries those clearance boxes with the door.</p>
    <form onSubmit={check} onChange={reset}>
      <label className="field">Hardware reference
        <select value={input.purchase} onChange={({ currentTarget }) => {
          const purchase = currentTarget.value as DoorHardware["purchase"];
          setInput((value) => purchase === georgianPassage.id ? {
            ...value, purchase, grip: "knob",
            front: { ...value.front, towardHinge: 0 }, back: { ...value.back, towardHinge: 0 },
          } : { ...value, purchase });
        }}>
          <option value="measured">Use measured hardware</option>
          <option value={georgianPassage.id}>Schlage Georgian passage set</option>
        </select>
      </label>
      {input.purchase === georgianPassage.id && <p className="small-note">Check the 2⅜ or 2¾ in backset against the existing door bore. Measure the delivered set on both faces.{" "}
        <a href={georgianPassage.preparation} target="_blank" rel="noreferrer">Schlage preparation drawing</a></p>}
      <label className="field">Handle type
        <select value={input.grip} disabled={input.purchase === georgianPassage.id} onChange={({ currentTarget }) => {
          const grip = currentTarget.value as DoorHardware["grip"];
          setInput((value) => ({ ...value, grip,
            ...(grip === "knob" && { front: { ...value.front, towardHinge: 0 }, back: { ...value.back, towardHinge: 0 } }),
          }));
        }}>
          <option value="knob">Knob</option>
          <option value="lever">Lever</option>
        </select>
      </label>
      <div className="two-col">
        <LengthInput label="Backset from latch edge" value={input.backset} min={0.5} max={8} required onChange={(backset) => {
          setInput((value) => ({ ...value, backset })); reset();
        }} />
        <LengthInput label="Bore center above bottom of door" value={input.centerHeight} min={0.001} max={115} required onChange={(centerHeight) => {
          setInput((value) => ({ ...value, centerHeight })); reset();
        }} />
      </div>
      <label className="checkbox-field"><input type="checkbox" checked={mirrored}
        onChange={({ currentTarget }) => {
          setMirrored(currentTarget.checked);
          if (!currentTarget.checked) setInput((value) => ({ ...value, back: value.front }));
        }} />Same measurements on both faces</label>
      <div className="two-col">{faceFields("front")}</div>
      {!mirrored && <div className="two-col">{faceFields("back")}</div>}
      {input.grip === "lever" && <p className="small-note">Use a positive offset toward the hinge. Measure from the bore center to the center of the hardware width.</p>}
      <button className="button secondary" type="submit">Preview hardware and swing</button>
    </form>
    {draft && limit && <>
      <div className="idea-preview" aria-label="Door hardware sweep">
        <PreviewBoundary>
          <Scene project={{ ...draft.project, pieces: draft.project.pieces.filter(({ id }) => focus.has(id)) }} selected={null}
            onSelect={noop} onMove={noop} selectedSectionId={null} onSectionMove={noop}
            mode="rotate" snap={false} explode={false} xray={false} stage={null}
            view={view} onCamera={noop} fitToView readOnly motionPreview={pose} />
        </PreviewBoundary>
      </div>
      <p role="status">{preview?.bare !== undefined && preview.bare - limit.travel >= 0.1 ? `The bare leaf cleared ${angle(preview.bare)}. ` : ""}
        {stop ? `Review modeled contact near ${angle(limit.travel)}${hit.length ? ` at the ${hit.map(({ designRole }) => designRole?.endsWith("front") ? `front ${input.grip}` : `back ${input.grip}`).join(" and ")}` : ""}${blockers.length ? ` with ${blockers.join(", ")}` : ""}.`
          : limit.uncertain ? `Review the model’s clearance limit at ${angle(limit.travel)}.`
            : `Both hardware faces clear the modeled ${angle(limit.travel)} swing.`}</p>
      {limit.travel > 0 && <div className="field">
        <label htmlFor="hardware-door-swing">Door swing · {angle(openAngle)}</label>
        <input id="hardware-door-swing" type="range" min={0} max={limit.travel} step="any"
          value={openAngle} onChange={({ currentTarget }) => setOpenAngle(currentTarget.valueAsNumber)} />
        <button type="button" className="text-button" onClick={() => setOpenAngle(limit.travel)}>Show hardware swing limit</button>
      </div>}
      <button className="button primary" type="button" onClick={() => save()}>Save door hardware</button>
    </>}
    {saved && <button className="text-button" type="button" onClick={() => save(true)}>Remove modeled hardware</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
