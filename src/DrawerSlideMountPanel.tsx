import { useMemo, useState, type FormEvent } from "react";
import { drawerRailScrew } from "./drawerRailScrewReference";
import { drawerSlideReference } from "./drawerSlideReference";
import { clearDrawerSlideMount, drawerMountScope, drawerRailFastenerRows, drawerRailRoles, reviewDrawerSlideMount, saveDrawerSlideMount, type DrawerRailRole } from "./drawerSlideMounts";
import type { DrawerSlideMountInput } from "./drawerSlideMountSchema";
import type { Project } from "./model";
import { drawerSideLabels, type MotionPlan } from "./motionPlanSchema";
import { partLabel } from "./partLabels";

const fields = [
  ["length", "footprint length", 0.001, 32],
  ["height", "footprint height", 0.001, 4],
  ["setback", "front inset from shared front edge", 0, 32],
  ["centerOffset", "center offset above shared rail centerline", -4, 4],
  ["pilotDiameter", "pilot diameter", 0.001, 1],
  ["pilotDepth", "pilot tip depth into wood", 0.001, 4],
  ["screwDiameter", "seated screw diameter", 0.001, 1],
  ["screwDepth", "seated screw penetration into wood", 0.001, 4],
] as const;

function holeCenters(value: FormDataEntryValue | null, label: string) {
  return String(value ?? "").trim().split(/\r?\n/).map((line) => {
    const pair = line.split(",").map((n) => n.trim());
    if (pair.length !== 2 || pair.some((n) => !n || !Number.isFinite(Number(n))))
      throw Error(`Enter a back-from-front, height pair on each line for the ${label.toLowerCase()}.`);
    return pair.map(Number);
  });
}

function RailFields({ role, saved, closedLength, height }: {
  role: DrawerRailRole;
  saved?: DrawerSlideMountInput[DrawerRailRole];
  closedLength: number;
  height: number;
}) {
  const [separate, setSeparate] = useState(!!saved?.rightCenters);
  const name = drawerRailRoles[role];
  const [fastenerSource, setFastenerSource] = useState<string>(saved?.fasteners?.source ?? "");
  return (
    <fieldset className="field-section">
      <legend>{name}</legend>
      {fields.map(([key, label, min, max]) => {
        const catalog = role === "cabinet" ? { length: closedLength, height } : {};
        const defaultValue = saved?.[key] ?? (key === "length" || key === "height" ? catalog[key] :
          key === "setback" || key === "centerOffset" ? 0 : undefined);
        return (
          <label key={key} className="field">
            {name} {label} (in)
            <input type="number" name={`${role}.${key}`} min={min} max={max} step="any" defaultValue={defaultValue} required />
          </label>
        );
      })}
      <label className="field">
        {name} hole centers (in)
        <textarea rows={3} name={`${role}.centers`} defaultValue={saved?.centers.map((pair) => pair.join(", ")).join("\n")} required />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
        {name} has a different right-side pattern
      </label>
      {separate && (
        <label className="field">
          {name} right hole centers (in)
          <textarea rows={3} name={`${role}.rightCenters`} defaultValue={saved?.rightCenters?.map((pair) => pair.join(", ")).join("\n")} required />
        </label>
      )}
      <label className="field">
        {name} screw source
        <select name={`${role}.fastenerSource`} value={fastenerSource}
          onChange={(event) => setFastenerSource(event.target.value)}>
          <option value="">Decide later</option>
          <option value="included">Included with the delivered slides</option>
          <option value="on-hand">Already on hand</option>
          <option value={drawerRailScrew.id}>Buy {drawerRailScrew.name} at Home Depot</option>
        </select>
      </label>
      {fastenerSource === drawerRailScrew.id ? (
        <>
          <label className="field">
            {name} thickness under the seated head to wood (in)
            <input type="number" name={`${role}.seatToWood`} min="0.001" max="4" step="any"
              defaultValue={saved?.fasteners?.source === drawerRailScrew.id ? saved.fasteners.seatToWood : undefined} required />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name={`${role}.confirmFastener`}
              defaultChecked={saved?.fasteners?.source === drawerRailScrew.id} required />
            {name} confirmed this screw seats, engages the wood and clears the delivered moving hardware
          </label>
          <p className="small-note">
            <a href={drawerRailScrew.url} target="_blank" rel="noreferrer">Home Depot · model {drawerRailScrew.model}</a>
          </p>
        </>
      ) : fastenerSource && (
        <label className="field">
          {name} compatible screws reserved for both sides
          <input type="number" name={`${role}.available`} min="0" max="9999" step="1"
            defaultValue={saved?.fasteners && "available" in saved.fasteners ? saved.fasteners.available : undefined} required />
        </label>
      )}
    </fieldset>
  );
}

export function DrawerSlideMountPanel({ project, motion, shown, onShow, onChange }: {
  project: Project;
  motion: MotionPlan;
  shown: boolean;
  onShow: (id: string | null) => void;
  onChange: (project: Project) => void;
}) {
  const slide = motion.mechanism.kind === "slide" ? motion.mechanism.drawerSlide : undefined;
  const saved = project.drawerSlideMounts?.find(({ motionId }) => motionId === motion.id);
  const review = useMemo(() => saved ? reviewDrawerSlideMount(project, saved) : undefined, [project, saved]);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    function read(role: DrawerRailRole) {
      const source = form.get(`${role}.fastenerSource`);
      const fasteners = source === drawerRailScrew.id
        ? { source, seatToWood: Number(form.get(`${role}.seatToWood`)) }
        : source ? { source, available: Number(form.get(`${role}.available`)) } : undefined;
      return {
        ...(fasteners && { fasteners }),
        ...Object.fromEntries(fields.map(([key]) => [key, Number(form.get(`${role}.${key}`))])),
        centers: holeCenters(form.get(`${role}.centers`), drawerRailRoles[role]),
        ...(form.has(`${role}.rightCenters`) && {
          rightCenters: holeCenters(form.get(`${role}.rightCenters`), `${drawerRailRoles[role]} right rail`),
        }),
      };
    }
    try {
      onChange(saveDrawerSlideMount(project, motion.id, {
        centerHeight: Number(form.get("centerHeight")),
        cabinet: read("cabinet"),
        drawer: read("drawer"),
      }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the rail layout.");
    }
  }

  function remove() {
    try {
      onChange(clearDrawerSlideMount(project, motion.id));
      onShow(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the rail layout.");
    }
  }

  if (!slide && !saved) return null;
  const reference = slide ? drawerSlideReference(slide.productId) : undefined;
  return (
    <section className="field-section" aria-label="Drawer rail mounting">
      <h3>Drawer rail mounting</h3>
      {review && (
        <>
          <p role="status">{review.detail}</p>
          {review.rails.length > 0 && (
            <ul className="motion-findings">
              {review.rails.map(({ key, piece, holes, issues }) => (
                <li key={key}>
                  <strong>{drawerSideLabels[key]} · {partLabel(project, piece.id)}</strong>
                  <p className="small-note">{issues.join(" ") || holes.detail}</p>
                  {holes.marks.filter((mark) => mark.issues.length).map((mark) =>
                    <p className="small-note" key={mark.index}>Hole {mark.index} · {mark.issues.join(" ")}</p>)}
                </li>
              ))}
            </ul>
          )}
          {saved && drawerRailFastenerRows(saved, review).map(({ role, label, detail }) =>
            <p className="small-note" key={role}><strong>{label}</strong> · {detail}</p>)}
          {review.rails.length > 0 && (
            <button type="button" className="button secondary small" onClick={() => onShow(shown ? null : motion.id)}>
              {shown ? "Hide rail mounting marks" : "Show rail mounting marks in 3D"}
            </button>
          )}
        </>
      )}
      {reference && (
        <details className="field-section">
          <summary>Measure mounting marks</summary>
          <p className="small-note">{drawerMountScope}</p>
          <p className="small-note">
            Use the rearmost panel front and highest panel bottom as the shared edges.
            Enter one hole per line with its distance behind the rail front and signed height from the rail center, separated by a comma.
            Check that the pattern matches the delivered hardware on both sides.
            Count only screws reserved for this pair of cabinet or drawer rails.
          </p>
          <form onSubmit={submit}>
            <label className="field">Rail centerline above shared bottom (in)
              <input name="centerHeight" type="number" step="any" min="0.001" max="240" defaultValue={saved?.centerHeight} required />
            </label>
            {(["cabinet", "drawer"] as const).map((role) =>
              <RailFields key={role} role={role} saved={saved?.[role]} closedLength={reference.closedLength} height={reference.height} />)}
            <button type="submit" className="button secondary">Save and check mounting marks</button>
          </form>
        </details>
      )}
      {saved && <button type="button" className="text-button" onClick={remove}>Remove rail mounting layout</button>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
