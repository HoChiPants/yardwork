import { useState } from "react";
import { ZodError } from "zod";
import { LengthInput } from "./LengthInput";
import { acceptsDoorway, previewDoorway } from "./doorwayPreview";
import { interiorDoor, type DoorOpening, type DoorUnit } from "./doorWall";
import { formatStockLength } from "./measurement";
import { material, type Project, type Section } from "./model";

const blankUnit: DoorUnit = {
  frameWidth: NaN, frameHeight: NaN, jambDepth: NaN, sideJamb: NaN, headJamb: NaN,
  leafWidth: NaN, leafHeight: NaN, leafThickness: NaN, floorGap: NaN,
  frameOffset: 0, leafOffset: 0, leafDepthOffset: 0,
  hingeSide: "left", swingFace: "front", pinSideOffset: NaN, pinFaceOffset: NaN, travel: 90, purchase: "measured",
};
export const doorwayExample = "Add a 32 by 82 in doorway";

export function DoorOpeningFields({ opening, onChange }: { opening: DoorOpening; onChange: (value: DoorOpening) => void }) {
  return <div className="two-col">
    <LengthInput label="Rough opening width" value={opening.width} max={96} onChange={(width) => onChange({ ...opening, width })} />
    <LengthInput label="Rough opening height" value={opening.height} min={12} max={115} onChange={(height) => onChange({ ...opening, height })} />
    <LengthInput label="Offset from wall center" value={opening.offset ?? 0} min={-96} max={96} onChange={(offset) => onChange({ ...opening, offset })} />
    <LengthInput label="Finished floor rise above wall base" value={opening.floor ?? 0} min={0} max={12} onChange={(floor) => onChange({ ...opening, floor })} />
  </div>;
}

type DoorPreview = ReturnType<typeof previewDoorway>;

export function DoorwayPanel({ project, initialSectionId, onApply }: {
  project: Project;
  initialSectionId: string | null;
  onApply: (preview: DoorPreview) => void;
}) {
  const walls = project.sections.filter(({ generator }) => acceptsDoorway(generator));
  const [wallId, setWallId] = useState(walls.find(({ id }) => id === initialSectionId)?.id ?? walls[0]?.id ?? "");
  const wall = walls.find(({ id }) => id === wallId);
  return <>
    <h2 id="modal-title">Plan an interior doorway</h2>
    {wall ? <>
      <label className="field">Wall section
        <select value={wallId} onChange={(event) => setWallId(event.target.value)}>
          {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <DoorwayEdit key={wall.id} project={project} section={wall} onApply={onApply} />
    </> : <p>Add a generated nonbearing wall or trace a wall from your plan to place a doorway.</p>}
  </>;
}

function DoorwayEdit({ project, section, onApply }: { project: Project; section: Section; onApply: (preview: DoorPreview) => void }) {
  const command = section.generator!;
  const window = command.windowOpening;
  const side = (window?.offset ?? 0) >= 0 ? -1 : 1;
  const [opening, setOpening] = useState<DoorOpening>(command.doorOpening ?? {
    width: 32, height: 82, ...(window && { offset: side * (command.width / 2 - 4.5 - 16) }),
  });
  const [unit, setUnit] = useState<DoorUnit>(command.doorUnit ?? blankUnit);
  const [fitted, setFitted] = useState(!!command.doorUnit);
  const [reuse, setReuse] = useState(true);
  const [draft, setDraft] = useState<{ source: Project; result: DoorPreview } | null>(null);
  const [error, setError] = useState("");
  const review = draft?.source === project ? draft.result : null;
  const reset = () => { setDraft(null); setError(""); };
  const patch = <K extends keyof DoorUnit>(key: K, value: DoorUnit[K]) => { setUnit({ ...unit, [key]: value }); reset(); };
  const length = (key: keyof Pick<DoorUnit, "frameWidth" | "frameHeight" | "jambDepth" | "sideJamb" | "headJamb" |
    "leafWidth" | "leafHeight" | "leafThickness" | "floorGap" | "frameOffset" | "leafOffset" | "leafDepthOffset" | "pinSideOffset" | "pinFaceOffset" | "finishedDepth">,
    label: string, min: number, max: number) => <LengthInput label={label} value={unit[key] ?? NaN} min={min} max={max} onChange={(value) => patch(key, value)} />;

  function generate() {
    reset();
    try {
      if (![opening.width, opening.height, opening.offset ?? 0, opening.floor ?? 0].every(Number.isFinite)) throw Error("Fill in the rough opening dimensions.");
      if (fitted && (Object.values(unit).some((value) => typeof value === "number" && !Number.isFinite(value)) ||
        unit.purchase === interiorDoor.materialId && !Number.isFinite(unit.finishedDepth)))
        throw Error("Enter the measured frame, leaf and hinge dimensions to preview the swing.");
      setDraft({ source: project, result: previewDoorway(project, { ...command, doorOpening: opening, doorUnit: fitted ? unit : null }, section.id, reuse) });
    } catch (issue) {
      setError(issue instanceof ZodError ? issue.issues[0]?.message ?? "Review the doorway dimensions."
        : issue instanceof Error ? issue.message : "Review the doorway dimensions.");
    }
  }
  return <>
    <p>Enter the rough opening above the finished floor. This layout uses a flat head in a nonbearing wall.</p>
    <DoorOpeningFields opening={opening} onChange={(next) => { setOpening(next); reset(); }} />
    <p className="small-note">Negative offsets move the opening left in the wall elevation.</p>
    <label className="checkbox-field"><input type="checkbox" checked={fitted} onChange={(event) => { setFitted(event.target.checked); reset(); }} /> Fit a measured door and test its swing</label>
    {fitted && <div className="field-section">
      <label className="field">Door kit
        <select value={unit.purchase} onChange={(event) => patch("purchase", event.target.value === interiorDoor.materialId ? interiorDoor.materialId : "measured")}>
          <option value="measured">Field-measured prehung door</option>
          {project.retailer === "home-depot" && <option value={interiorDoor.materialId}>Masonite 75777 · 30 × 80 in right hand</option>}
        </select>
      </label>
      {unit.purchase === interiorDoor.materialId && <>
        <p className="small-note">The listed kit uses a 32 × 82 in rough opening. Measure the delivered frame and confirm the handing. <a href={interiorDoor.listing} target="_blank" rel="noreferrer">Home Depot product reference</a></p>
        {length("finishedDepth", "Finished wall thickness", 4.25, 4.5)}
      </>}
      <div className="two-col">
        {length("frameWidth", "Outside frame width", 0.125, 96)}
        {length("frameHeight", "Outside frame height", 0.125, 115)}
        {length("jambDepth", "Installed jamb depth", 0.125, 18)}
        {length("sideJamb", "Side jamb thickness", 0.125, 4)}
        {length("headJamb", "Head jamb thickness", 0.125, 4)}
        {length("leafWidth", "Door leaf width", 0.125, 96)}
        {length("leafHeight", "Door leaf height", 0.125, 115)}
        {length("leafThickness", "Door leaf thickness", 0.125, 6)}
        {length("floorGap", "Gap below closed leaf", 0, 12)}
      </div>
      <div className="two-col">
        <label className="field">Hinge edge in wall elevation
          <select value={unit.hingeSide} onChange={(event) => patch("hingeSide", event.target.value === "left" ? "left" : "right")}>
            <option value="left">Left edge</option><option value="right">Right edge</option>
          </select>
        </label>
        <label className="field">Opens toward
          <select value={unit.swingFace} onChange={(event) => patch("swingFace", event.target.value === "front" ? "front" : "back")}>
            <option value="front">Wall front</option><option value="back">Wall back</option>
          </select>
        </label>
        {length("pinSideOffset", "Pin offset beyond hinge edge", -6, 6)}
        {length("pinFaceOffset", "Pin offset beyond swing face", -6, 6)}
        <label className="field">Test opening angle (degrees)
          <input type="number" min={0.01} max={180} value={Number.isFinite(unit.travel) ? unit.travel : ""} onChange={(event) => patch("travel", event.target.valueAsNumber)} />
        </label>
      </div>
      <details>
        <summary>Adjust closed door placement</summary>
        <p className="small-note">Offsets are measured in the wall’s elevation. Positive depth moves the leaf toward the wall front.</p>
        <div className="two-col">
          {length("frameOffset", "Frame offset from opening center", -12, 12)}
          {length("leafOffset", "Leaf offset from frame center", -12, 12)}
          {length("leafDepthOffset", "Leaf depth offset from wall center", -12, 12)}
        </div>
      </details>
    </div>}
    <label className="checkbox-field"><input type="checkbox" checked={reuse} onChange={(event) => { setReuse(event.target.checked); reset(); }} /> Use matching offcuts from the Cut pool</label>
    <button type="button" className="button secondary" onClick={generate}>Preview doorway</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {review && <div className="field-section" aria-label="Doorway proposal">
      <p>{review.impact.added} added parts · {review.impact.removed} replaced parts{review.impact.removedConnections ? ` · ${review.impact.removedConnections} removed connections` : ""}</p>
      {review.blockers.length > 0 && <p className="form-error" role="alert">Closed geometry intersects {review.blockers.slice(0, 4).join(", ")}. Adjust the placement before applying.</p>}
      {review.impact.wallCuts.some(({ oversize }) => oversize > 0) && <p className="form-error" role="alert">Some cuts exceed the selected framing stock. Revise the wall stock before applying.</p>}
      {review.impact.wallCuts.map((row) => <details key={row.id}>
        <summary>{row.quantity} boards · {material(row.id).name}</summary>
        <ol>{row.bins.map((bin, index) => <li key={index}>{bin.cuts.map(({ name, length }) => `${name} ${formatStockLength(length)}`).join(" · ")}{bin.remaining > 0 && ` · keep ${formatStockLength(bin.remaining)}`}</li>)}</ol>
      </details>)}
      {!!review.impact.offcuts?.assignments.length && <p>{review.impact.offcuts.assignments.length} parts use measured scraps.</p>}
      {review.swing && <p aria-label="Door swing result">
        {review.swing.error ?? (review.swing.limit !== undefined && review.swing.limit < review.swing.travel - 0.01
          ? `${review.swing.uncertain ? "Review the path near" : "The modeled leaf stops near"} ${review.swing.limit.toFixed(2)}°${review.swing.blockers.length ? ` at ${review.swing.blockers.join(", ")}` : ""}.`
          : `The modeled leaf clears ${review.swing.travel}° of travel.`)}
      </p>}
      <button type="button" className="button primary" disabled={!!review.blockers.length || review.impact.wallCuts.some(({ oversize }) => oversize > 0)}
        onClick={() => onApply(review)}>Apply doorway</button>
    </div>}
    {fitted && <p className="small-note">Check the installed hardware, stops and casing in person. <a href={interiorDoor.installation} target="_blank" rel="noreferrer">Masonite installation guide</a></p>}
  </>;
}
