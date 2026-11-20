import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { harviaKit, steel6, type SaunaHeaterProductId } from "./saunaHeaterReference";
import {
  removeSaunaHeater,
  saunaHeaterReview,
  saunaHeaterScope,
  saunaRooms,
  saveSaunaHeater,
} from "./saunaHeaters";

function LayoutForm({
  project,
  id,
  onChange,
  onShow,
}: {
  project: Project;
  id: string;
  onChange: (project: Project) => void;
  onShow: (id: string | null) => void;
}) {
  const room = saunaRooms(project).find((item) => item.entry.id === id);
  const plan = project.saunaHeaterPlans?.find((item) => item.roomId === id);
  const savedKit = plan?.productId === harviaKit.productId ? plan : undefined;
  const savedSteel = plan?.productId === steel6.productId ? plan : undefined;
  const [product, setProduct] = useState<SaunaHeaterProductId>(
    plan?.productId ?? (project.retailer === "home-depot" ? harviaKit.productId : steel6.productId),
  );
  const kit = product === harviaKit.productId;
  const [wall, setWall] = useState(savedKit?.wall ?? "right");
  const [offset, setOffset] = useState(savedKit?.offset ?? 0);
  const [bottom, setBottom] = useState(savedKit?.bottom ?? NaN);
  const [x, setX] = useState(
    savedSteel?.x ?? Math.max(0, (room?.parameters.clearWidth ?? 18) / 2 - 10),
  );
  const [z, setZ] = useState(
    savedSteel?.z ?? Math.max(0, (room?.parameters.clearDepth ?? 18) / 2 - 12),
  );
  const [supply, setSupply] = useState(plan?.supply ?? "unknown");
  const [area, setArea] = useState(plan?.uninsulatedWallArea ?? NaN);
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const common = { supply, uninsulatedWallArea: Number.isFinite(area) ? area : null, notes };
      const input = kit
        ? { ...common, productId: harviaKit.productId, wall, offset, bottom }
        : { ...common, x, z };
      onChange(saveSaunaHeater(project, id, input));
      if (plan?.productId !== product) onShow(null);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The heater review could not be saved.",
      );
    }
  }
  if (!room) return null;
  return (
    <form onSubmit={submit}>
      <label className="field">
        Heater package
        <select value={product} onChange={(event) => {
          setProduct(event.target.value === harviaKit.productId ? harviaKit.productId : steel6.productId);
        }}>
          <option value={harviaKit.productId}>Harvia KIP 6 kW · Home Depot</option>
          <option value={steel6.productId}>HUUM STEEL 6 · Floor-mounted</option>
        </select>
      </label>
      {kit ? (
        <>
          <p className="small-note">
            Place the listed heater body against a wall to check the layout. Enter a proposed height above the finished floor.
          </p>
          <label className="field">
            Mounting wall
            <select value={wall} onChange={(event) => setWall(event.target.value as typeof wall)}>
              <option value="right">Right wall</option>
              <option value="left">Left wall</option>
              <option value="back">Back wall</option>
              <option value="front">Front wall (door)</option>
            </select>
          </label>
          <p className="small-note">
            Positive offsets move toward the door on a side wall and toward the right on the front or back wall.
          </p>
          <LengthInput label="Offset along wall from center" value={offset} onChange={setOffset} min={-240} max={240} />
          <LengthInput label="Heater bottom above floor" value={bottom} onChange={setBottom} min={0} max={240} />
        </>
      ) : (
        <>
          <p className="small-note">
            Measure from the room center. Positive values move the heater toward the right wall and toward the door wall.
          </p>
          <LengthInput label="Heater center left to right" value={x} onChange={setX} min={-240} max={240} />
          <LengthInput label="Heater center back to front" value={z} onChange={setZ} min={-240} max={240} />
        </>
      )}
      <label className="field">
        Supply voltage for sizing
        <select
          value={supply}
          onChange={(event) => {
            setSupply(
              event.target.value === "208" || event.target.value === "240"
                ? event.target.value
                : "unknown",
            );
          }}
        >
          <option value="unknown">Confirm with installer</option>
          <option value="208">208 V</option>
          <option value="240">240 V</option>
        </select>
      </label>
      <label className="field">
        Uninsulated brick, tile and glass wall area (sq ft)
        <input
          type="number"
          min={0}
          max={9999}
          step="any"
          value={Number.isFinite(area) ? area : ""}
          onChange={(event) => setArea(event.target.valueAsNumber)}
        />
      </label>
      <p className="small-note">
        Enter 0 if you have confirmed there are none. Leave blank while checking
        the wall assembly.
      </p>
      <label className="field">
        Heater layout notes
        <textarea
          maxLength={400}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <button
        className="button secondary full"
        disabled={kit ? !Number.isFinite(offset) || !Number.isFinite(bottom) : !Number.isFinite(x) || !Number.isFinite(z)}
      >
        Save and check heater layout
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function SaunaHeaterPanel({
  project,
  onChange,
  shownId,
  onShow,
}: {
  project: Project;
  onChange: (project: Project) => void;
  shownId: string | null;
  onShow: (id: string | null) => void;
}) {
  const [selected, setSelected] = useState("");
  const rooms = saunaRooms(project);
  const choices = [
    ...rooms.map((room) => ({ id: room.entry.id, title: room.title })),
    ...(project.saunaHeaterPlans ?? [])
      .filter((plan) => !rooms.some((room) => room.entry.id === plan.roomId))
      .map((plan) => ({ id: plan.roomId, title: "Missing sauna room" })),
  ];
  if (!choices.length) return null;
  const id = choices.some((choice) => choice.id === selected)
    ? selected
    : choices[0].id;
  const review = saunaHeaterReview(project, id);
  const room = rooms.find((item) => item.entry.id === id);
  const kit = review?.plan.productId === harviaKit.productId;
  return (
    <details className="field-section">
      <summary>Plan sauna heater clearance</summary>
      {choices.length > 1 && (
        <label className="field">
          Choose sauna room
          <select
            value={id}
            onChange={(event) => {
              onShow(null);
              setSelected(event.target.value);
            }}
          >
            {choices.map((choice) => (
              <option value={choice.id} key={choice.id}>
                {choice.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {review && <p><strong>{kit ? harviaKit.title : steel6.title}</strong></p>}
      {review?.layout && (
        <button
          type="button"
          className="button secondary full"
          aria-pressed={shownId === id}
          onClick={() => onShow(shownId === id ? null : id)}
        >
          {kit
            ? shownId === id ? "Hide listed heater body" : "Show listed heater body in 3D"
            : shownId === id ? "Hide heater clearance" : "Show heater clearance in 3D"}
        </button>
      )}
      {review && (
        <div>
          <p className="small-note">
            <strong>
              {kit
                ? "Package screening · Confirm installation details"
                : review.ready
                ? "Modeled dimensions within the reference ranges"
                : "Review the flagged dimensions and inputs"}
            </strong>
          </p>
          <ul className="small-note">
            {review.checks.map((check) => (
              <li key={check.label}>
                <strong>
                  {check.label}
                  {check.state !== "within" ? " · Review" : ""}
                </strong>
                <br />
                {check.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {room && (
        <details open={!review}>
          <summary>
            {review
              ? "Edit heater location and room inputs"
              : "Set heater location and room inputs"}
          </summary>
          <p className="small-note">
            Modeled clear room {formatStockLength(room.parameters.clearWidth)} ×{" "}
            {formatStockLength(room.parameters.clearDepth)} ×{" "}
            {formatStockLength(room.parameters.clearHeight)}.
          </p>
          <LayoutForm key={`${id}-${review?.plan.productId ?? "new"}`} project={project} id={id} onChange={onChange} onShow={onShow} />
        </details>
      )}
      {review && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onShow(null);
            onChange(removeSaunaHeater(project, id));
          }}
        >
          Remove heater review
        </button>
      )}
      <p className="small-note">{saunaHeaterScope}</p>
      {(kit || !review) && <p className="small-note">
        <a href={harviaKit.listing} target="_blank" rel="noreferrer">Home Depot Harvia package</a>
        {" · "}
        <a href={harviaKit.supplier} target="_blank" rel="noreferrer">ALEKO bundle specifications</a>
      </p>}
      {review && !kit && <p className="small-note">
        <a href={steel6.manual} target="_blank" rel="noreferrer">HUUM U.S. manual</a>
        {project.retailer === "lowes" && <>{" · "}<a href={steel6.listing} target="_blank" rel="noreferrer">Lowe’s marketplace package</a></>}
      </p>}
    </details>
  );
}
