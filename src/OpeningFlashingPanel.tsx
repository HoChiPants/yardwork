import { useMemo, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import {
  checkOpeningFlashing, openingDrainageNote, openingFlashingRollLines, openingFramingStock,
  removeOpeningFlashing, reviewOpeningFlashings, saveOpeningFlashing,
  type OpeningFlashingPreview,
} from "./openingFlashing";
import { flexWrap, openingAirSealGuide, openingFlashingScope, windowFlashingSequence, windowFlashingTapeScope } from "./openingFlashingReference";
import {
  openingFlashingMeasurementsSchema, openingMembersSchema,
  type OpeningFlashingPlan, type OpeningFlashingMeasurements, type OpeningMembers, type WindowFlashingTape,
} from "./openingFlashingSchema";
import { sillPlateFootprint } from "./sillGaskets";
import { generatedWindowMembers } from "./windowWall";

const initial: OpeningFlashingMeasurements = {
  unit: "window", exterior: "positive", sheathing: 0, frameDepth: NaN, faceLap: 2,
  jambReturn: 6, tapeWidth: 9, pan: { kind: "slope" }, drainage: { kind: "open" },
};

const initialWindowTape: WindowFlashingTape = {
  tapeWidth: 4, pastApron: 1, pastJambs: 1,
  left: { inset: 0, flange: NaN }, right: { inset: 0, flange: NaN }, head: { inset: 0, flange: NaN },
};

function WindowFlangeFields({ tape, onChange }: { tape: WindowFlashingTape; onChange: (tape: WindowFlashingTape) => void }) {
  return (
    <section className="field-section" aria-label="Window flange measurements">
      <p className="small-note">Measure from outside. Inset is the gap between the rough opening and the unit. Flange width runs from the unit to the outer edge of its mounting flange.</p>
      {([["left", "Left"], ["right", "Right"], ["head", "Head"]] as const).map(([edge, label]) => (
        <div key={edge} className="two-col">
          <LengthInput label={`${label} frame inset`} value={tape[edge].inset} min={0} max={4} required
            onChange={(inset) => onChange({ ...tape, [edge]: { ...tape[edge], inset } })} />
          <LengthInput label={`${label} flange width`} value={tape[edge].flange} min={0.001} max={12} required
            onChange={(flange) => onChange({ ...tape, [edge]: { ...tape[edge], flange } })} />
        </div>
      ))}
      <div className="two-col">
        <LengthInput label="Jamb extension below apron" value={tape.pastApron} min={0.001} max={12} required
          onChange={(pastApron) => onChange({ ...tape, pastApron })} />
        <LengthInput label="Head extension beyond each jamb" value={tape.pastJambs} min={0.001} max={12} required
          onChange={(pastJambs) => onChange({ ...tape, pastJambs })} />
      </div>
      <label className="field">Jamb and head tape width
        <select value={tape.tapeWidth} onChange={({ currentTarget }) => onChange({ ...tape, tapeWidth: currentTarget.value === "6" ? 6 : 4 })}>
          <option value="4">4 in DuPont Flashing Tape</option>
          <option value="6">6 in DuPont Flashing Tape</option>
        </select>
      </label>
      <p className="small-note">{windowFlashingTapeScope}</p>
    </section>
  );
}

function OpeningMeasurements({ project, sill, saved, onChange, onShow }: {
  project: Project;
  sill: string;
  saved?: OpeningFlashingPlan;
  onChange: (project: Project) => void;
  onShow: (preview: OpeningFlashingPreview | null) => void;
}) {
  const [members, setMembers] = useState<OpeningMembers>(() => saved?.members ??
    generatedWindowMembers(project, project.sections.find(({ pieceIds }) => pieceIds.includes(sill))) ??
    { sill, jambA: "", jambB: "", head: "" });
  const [measured, setMeasured] = useState(saved?.measurements ?? initial);
  const [centers, setCenters] = useState(saved?.measurements.drainage.kind === "gaps" ? saved.measurements.drainage.centers.join(", ") : "");
  const [review, setReview] = useState<{
    project: Project; data: OpeningFlashingMeasurements; result: ReturnType<typeof checkOpeningFlashing>;
  } | null>(null);
  const [error, setError] = useState("");
  const choices = useMemo(() => project.pieces.filter((part) => part.id !== sill && openingFramingStock(part)), [project, sill]);
  const current = review?.project === project ? review : null;

  function clearPreview() {
    setReview(null);
    setError("");
    onShow(null);
  }
  function measure<K extends keyof OpeningFlashingMeasurements>(field: K, value: OpeningFlashingMeasurements[K]) {
    setMeasured((previous) => ({ ...previous, [field]: value }));
    clearPreview();
  }
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearPreview();
    try {
      const positions = centers.split(",").map((value) => value.trim() ? Number(value) : NaN);
      if (measured.drainage.kind === "gaps" &&
          (positions.length < 2 || positions.length > 100 || positions.some((offset) => !Number.isFinite(offset) || offset < 0)))
        throw Error("Enter 2 to 100 gap centers in inches, separated by commas.");
      const data = openingFlashingMeasurementsSchema.parse({
        ...measured,
        drainage: measured.drainage.kind === "open" ? measured.drainage : {
          kind: "gaps",
          centers: positions,
        },
      });
      const result = checkOpeningFlashing(project, openingMembersSchema.parse(members), data);
      setReview({ project, data, result });
      if (!result.issues.length) onShow(result.preview);
    } catch (issue) {
      setError(issue instanceof ZodError ? issue.issues[0].message
        : issue instanceof Error ? issue.message : "Review the opening measurements.");
    }
  }
  function save() {
    if (!current || current.result.issues.length) return;
    try {
      onChange(saveOpeningFlashing(project, members, current.data));
      clearPreview();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review the opening measurements.");
    }
  }
  return (
    <form onSubmit={check}>
      {([["jambA", "First rough jamb"], ["jambB", "Second rough jamb"], ["head", "Rough head"]] as const).map(([field, label]) =>
        <label className="field" key={field}>{label}
          <select value={members[field]} required onChange={({ currentTarget }) => {
            setMembers({ ...members, [field]: currentTarget.value });
            clearPreview();
          }}>
            <option value="">Choose a modeled member</option>
            {choices.filter(({ id }) => id === members[field] || !Object.values(members).includes(id)).map((part) =>
              <option key={part.id} value={part.id}>{partLabel(project, part.id)} · {part.name}</option>)}
          </select>
        </label>,
      )}
      <div className="two-col">
        <label className="field">Flanged unit
          <select value={measured.unit} onChange={({ currentTarget }) => {
            const unit = currentTarget.value === "door" ? "door" : "window";
            setMeasured((previous) => ({ ...previous, unit, jambHead: unit === "window" ? previous.jambHead : undefined }));
            clearPreview();
          }}>
            <option value="window">Window</option><option value="door">Door</option>
          </select>
        </label>
        <label className="field">Exterior side
          <select value={measured.exterior} onChange={({ currentTarget }) => measure("exterior", currentTarget.value === "negative" ? "negative" : "positive")}>
            <option value="positive">Side A</option><option value="negative">Side B</option>
          </select>
        </label>
      </div>
      <p className="small-note">Check the 3D preview to confirm the apron faces outdoors.</p>
      <LengthInput label="Sheathing past the framing face" value={measured.sheathing} min={0} max={6} required onChange={(value) => measure("sheathing", value)} />
      <LengthInput label="Wall face to inside edge of unit" value={measured.frameDepth} min={0.001} max={12} required onChange={(value) => measure("frameDepth", value)} />
      <LengthInput label="Exterior face lap" value={measured.faceLap} min={flexWrap.minFaceLap} max={flexWrap.maxFaceLap} required onChange={(value) => measure("faceLap", value)} />
      <LengthInput label="Turn up each jamb" value={measured.jambReturn} min={flexWrap.minJambReturn} max={48} required onChange={(value) => measure("jambReturn", value)} />
      <label className="field">FlexWrap width
        <select value={measured.tapeWidth} onChange={({ currentTarget }) => measure("tapeWidth", currentTarget.value === "6" ? 6 : 9)}>
          <option value="6">6 in</option><option value="9">9 in</option>
        </select>
      </label>
      <label className="field">Sill drainage detail
        <select value={measured.pan.kind} onChange={({ currentTarget }) => measure("pan",
          currentTarget.value === "back-dam" ? { kind: "back-dam", rise: NaN } : { kind: "slope" })}>
          <option value="slope">Outward-sloped sill</option><option value="back-dam">Interior back dam</option>
        </select>
      </label>
      {measured.pan.kind === "back-dam" && <LengthInput label="Measured back-dam height" value={measured.pan.rise} min={0.001} max={3} required onChange={(rise) => measure("pan", { kind: "back-dam", rise })} />}
      <label className="field">Exterior sill flange
        <select value={measured.drainage.kind} onChange={({ currentTarget }) => measure("drainage",
          currentTarget.value === "gaps" ? { kind: "gaps", centers: [] } : { kind: "open" })}>
          <option value="open">Leave open for drainage</option>
          <option value="gaps">Seal in sections with 2 in gaps</option>
        </select>
      </label>
      {measured.drainage.kind === "gaps" && <label className="field">
        Gap centers from the left exterior corner (in)
        <input value={centers} placeholder="3, 13, 23, 33" required onChange={({ currentTarget }) => {
          setCenters(currentTarget.value);
          clearPreview();
        }} />
      </label>}
      {measured.unit === "window" && <label className="checkbox-field">
        <input type="checkbox" checked={Boolean(measured.jambHead)}
          onChange={({ currentTarget }) => measure("jambHead", currentTarget.checked ? initialWindowTape : undefined)} />
        Plan jamb and head tape
      </label>}
      {measured.jambHead && <WindowFlangeFields tape={measured.jambHead} onChange={(tape) => measure("jambHead", tape)} />}
      <button type="submit" className="button secondary full">Check flashing fit</button>
      {current && (
        <div role="status" className="field-section">
          <strong>{current.result.issues.length ? "Review the fit" : "Flashing fits the entered dimensions"}</strong>
          <p>{formatStockLength(current.result.frame.width)} opening · {formatPreciseInches(current.result.bed)} on the sill bed</p>
          {current.result.issues.length ? <ul>{current.result.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <>
            <p>One continuous {formatStockLength(current.result.length)} cut. {openingDrainageNote(current.data)}</p>
            {current.result.jambHead && (
              <ul aria-label="Jamb and head tape cuts">
                {current.result.jambHead.cuts.map(({ edge, length }) => <li key={edge}>{edge} · {formatStockLength(length)}</li>)}
              </ul>
            )}
            <p className="small-note">Orange marks the pan and apron. Dashed green marks drainage. Blue marks the interior air seal after setting the unit.{current.result.jambHead ? " Purple marks the jamb and head strips." : ""}</p>
            <button type="button" className="button secondary full" onClick={save}>Save flashing plan</button>
          </>}
        </div>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  );
}

export function OpeningFlashingPanel({ project, initialSillId, review, onChange, onShow }: {
  project: Project;
  initialSillId?: string;
  review: ReturnType<typeof reviewOpeningFlashings>;
  onChange: (project: Project) => void;
  onShow: (preview: OpeningFlashingPreview | null) => void;
}) {
  const [sill, setSill] = useState(initialSillId ?? "");
  const sills = useMemo(() => project.pieces.filter((part) => openingFramingStock(part) && sillPlateFootprint(part)), [project]);
  const saved = review.rows.find(({ plan }) => plan.members.sill === sill);
  const selectable = sills.some(({ id }) => id === sill);
  return (
    <section className="field-section" aria-label="Opening flashing plan">
      <h2>Opening flashing</h2>
      <p className="small-note">{openingFlashingScope}</p>
      <label className="field">Rough sill
        <select value={selectable ? sill : ""} onChange={({ currentTarget }) => {
          setSill(currentTarget.value);
          onShow(null);
        }}>
          <option value="">Choose a modeled sill</option>
          {sills.map((part) => <option key={part.id} value={part.id}>{partLabel(project, part.id)} · {part.name}</option>)}
        </select>
      </label>
      {!sills.length && <p className="small-note">Add a flat wood sill, two jambs and a head to plan a rectangular opening.</p>}
      {selectable && <OpeningMeasurements key={sill} project={project} sill={sill} saved={saved?.plan} onChange={onChange} onShow={onShow} />}
      {review.rows.length > 0 && (
        <ul aria-label="Saved flashing plans">
          {review.rows.map(({ plan, title, result, issues }) => (
            <li key={plan.members.sill}>
              <strong>{title}</strong>
              <p className="small-note">{issues.length || !result ? issues.join(" ") : `Saved · Cut ${formatStockLength(result.length)}${result.jambHead ? " · 3 jamb and head cuts" : ""}`}</p>
              <div className="inline">
                {result && !issues.length && <button type="button" className="text-button" onClick={() => onShow(result.preview)}>Show saved flashing in 3D</button>}
                <button type="button" className="text-button" onClick={() => {
                  onShow(null);
                  onChange(removeOpeningFlashing(project, plan.members.sill));
                }}>Remove flashing plan</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {review.groups.length > 0 && <details>
        <summary>Flashing cuts and leftovers</summary>
        <ul>{openingFlashingRollLines(review).map((line, i) => <li key={i}>{line}</li>)}</ul>
        {review.groups.some(({ width }) => width === flexWrap.retailWidth) &&
          <p className="small-note">Select the reviewed 9 in roll in the Home Depot purchase review.</p>}
      </details>}
      <p className="small-note">
        <a href={flexWrap.instructions} target="_blank" rel="noreferrer">DuPont installation guide</a>{" · "}
        <a href={openingAirSealGuide} target="_blank" rel="noreferrer">PNNL interior air seal</a>
        {review.tapeGroups.length > 0 && <>{" · "}<a href={windowFlashingSequence} target="_blank" rel="noreferrer">Flashing sequence drawings</a></>}
      </p>
    </section>
  );
}
