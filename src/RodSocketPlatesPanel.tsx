import { useState, type FormEvent } from "react";
import { everbiltClosetRod } from "./closetRodReference";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";
import { formatPreciseInches } from "./measurement";
import { partLabel } from "./partLabels";
import type { reviewRodFit } from "./rodFits";
import {
  removeRodSocketPlate,
  removeRodSocketHoles,
  reviewRodSocketPlates,
  rodPlateScope,
  rodSocketSourceNote,
  saveRodSocketPlate,
  saveRodSocketHoles,
} from "./rodSocketPlates";

type Row = ReturnType<typeof reviewRodSocketPlates>[number];

const holeDimensions = [
  ["pilotDiameter", "Pilot diameter", 2],
  ["pilotDepth", "Deepest pilot tip past wood face", 12],
  ["screwDiameter", "Screw outer diameter", 2],
  ["screwDepth", "Seated screw tip past wood face", 12],
] as const;

function SocketHolesForm({
  project,
  rodId,
  row,
  onChange,
}: {
  project: Project;
  rodId: string;
  row: Row;
  onChange: (project: Project) => void;
}) {
  const name = row.side === "start" ? "Start" : "End";
  const [u, v] = (row.axes ?? []).map((axis) => ["X", "Y", "Z"][axis]);
  const saved = row.plate?.holeLayout;
  const draft = row.holes?.state === "stale" ? undefined : saved;
  const [centers, setCenters] = useState(() =>
    (draft?.centers ?? [[NaN, NaN]]).map((pair) => [...pair]),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const dimensions = Object.fromEntries(
        holeDimensions.map(([key]) => [key, Number(form.get(key))]),
      );
      onChange(
        saveRodSocketHoles(project, rodId, row.side, {
          ...dimensions,
          centers,
          basis: form.get("basis"),
        }),
      );
      setError("");
      setMessage("Mounting holes saved.");
    } catch (problem) {
      setMessage("");
      setError(
        problem instanceof Error
          ? problem.message
          : "Check the mounting measurements.",
      );
    }
  }
  return (
    <details className="field-section" open={!!saved}>
      <summary>{name} socket mounting holes</summary>
      <p className="small-note">
        Transfer the centers from the delivered socket. Enter signed offsets
        from the rod center along the panel’s {u} and {v} axes. The pilot and
        screw sizes below apply to all entered holes on this socket.
      </p>
      {row.holes && (
        <p
          className="small-note"
          data-testid={`rod-socket-holes-${row.side}`}
          data-state={row.holes.state}
        >
          {row.holes.detail}
        </p>
      )}
      {!!row.holes?.marks.some((mark) => mark.issues.length) && (
        <ul className="small-note">
          {row.holes.marks
            .filter((mark) => mark.issues.length)
            .map((mark) => (
              <li key={mark.index}>
                Hole {mark.index} · {mark.issues.join(" ")}
              </li>
            ))}
        </ul>
      )}
      <form onSubmit={submit}>
        {centers.map((center, index) => (
          <div key={index} className="section-description">
            <div className="two-col">
              {[u, v].map((axis, coordinate) => (
                <LengthInput
                  key={axis}
                  label={`${name} hole ${index + 1} offset ${axis}`}
                  value={center[coordinate]}
                  min={-24}
                  max={24}
                  onChange={(value) => {
                    setCenters((old) =>
                      old.map((pair, at) =>
                        at === index
                          ? pair.map((datum, i) =>
                              i === coordinate ? value : datum,
                            )
                          : pair,
                      ),
                    );
                    setMessage("");
                  }}
                />
              ))}
            </div>
            {centers.length > 1 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setCenters((old) => old.filter((_, at) => at !== index))
                }
              >
                Remove {name.toLowerCase()} hole {index + 1}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={centers.length >= 8}
          onClick={() => setCenters((old) => [...old, [NaN, NaN]])}
        >
          Add {name.toLowerCase()} hole
        </button>
        <div className="rod-plate-extents">
          {holeDimensions.map(([key, label, max]) => (
            <label className="field" key={key}>
              {label} (in)
              <input
                name={key}
                type="number"
                min={0.001}
                max={max}
                step="any"
                required
                defaultValue={draft?.[key]}
              />
            </label>
          ))}
        </div>
        <label className="field">
          {name} hole measurement notes
          <textarea
            name="basis"
            rows={2}
            maxLength={300}
            required
            defaultValue={draft?.basis}
          />
        </label>
        <button
          className="button secondary full"
          disabled={centers.some((center) =>
            center.some((n) => !Number.isFinite(n)),
          )}
        >
          Save {name.toLowerCase()} mounting holes
        </button>
      </form>
      {saved && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onChange(removeRodSocketHoles(project, rodId, row.side));
            setMessage("");
            setError("");
          }}
        >
          Remove {name.toLowerCase()} mounting layout
        </button>
      )}
      {message && (
        <p role="status" className="small-note">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </details>
  );
}

function PlateForm({
  project,
  rodId,
  row,
  onChange,
}: {
  project: Project;
  rodId: string;
  row: Row;
  onChange: (project: Project) => void;
}) {
  const [extents, setExtents] = useState<number[]>(() =>
    row.state !== "stale" && row.plate
      ? [...row.plate.extents]
      : Array<number>(4).fill(NaN),
  );
  const [basis, setBasis] = useState(
    row.state !== "stale" ? (row.plate?.basis ?? "") : "",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const axes = ["X", "Y", "Z"];
  const names =
    row.axes?.flatMap((axis) => [`−${axes[axis]}`, `+${axes[axis]}`]) ?? [];
  const sideLabel = row.side === "start" ? "Start" : "End";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onChange(
        saveRodSocketPlate(project, rodId, row.side, { extents, basis }),
      );
      setMessage("Socket measurements saved.");
      setError("");
    } catch (problem) {
      setMessage("");
      setError(
        problem instanceof Error
          ? problem.message
          : "Check the backplate measurements.",
      );
    }
  }
  return (
    <details className="section-description">
      <summary>
        {sideLabel} socket
        {row.pieceId ? ` · ${partLabel(project, row.pieceId)}` : ""}
      </summary>
      <p className="small-note" data-testid={`rod-socket-review-${row.side}`}>
        {row.socket &&
          `${row.socket === "closed" ? "Closed" : "Open"}-lip socket · `}
        {row.detail}
      </p>
      {row.localCenter && (
        <p className="small-note">
          Rod center from panel blank center (X, Y, Z) ·{" "}
          {row.localCenter.map(formatPreciseInches).join(", ")}
        </p>
      )}
      {row.socket && names.length > 0 && (
        <form onSubmit={submit}>
          <div className="rod-plate-extents">
            {names.map((direction, i) => (
              <LengthInput
                label={`${sideLabel} reach ${direction}`}
                key={direction}
                value={extents[i]}
                onChange={(value) => {
                  setExtents((old) =>
                    old.map((n, at) => (i === at ? value : n)),
                  );
                  setMessage("");
                }}
                min={0}
                max={24}
              />
            ))}
          </div>
          <label className="field">
            {sideLabel} backplate measurement notes
            <textarea
              rows={2}
              value={basis}
              maxLength={300}
              onChange={(event) => {
                setBasis(event.target.value);
                setMessage("");
              }}
            />
          </label>
          <button
            className="button secondary full"
            disabled={
              extents.some((value) => !Number.isFinite(value)) || !basis.trim()
            }
          >
            Save {sideLabel.toLowerCase()} backplate
          </button>
        </form>
      )}
      {row.plate && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onChange(removeRodSocketPlate(project, rodId, row.side));
            setMessage("");
            setError("");
          }}
        >
          Remove {sideLabel.toLowerCase()} backplate
        </button>
      )}
      {row.plate && row.state !== "stale" && row.axes && (
        <SocketHolesForm
          key={JSON.stringify([
            row.plate.holeLayout,
            row.holes?.state === "stale",
          ])}
          project={project}
          rodId={rodId}
          row={row}
          onChange={onChange}
        />
      )}
      {message && (
        <p role="status" className="small-note">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </details>
  );
}

export function RodSocketPlatesPanel({
  project,
  fit,
  rodId,
  onChange,
  shown,
  onToggle,
}: {
  project: Project;
  fit: ReturnType<typeof reviewRodFit>;
  rodId: string;
  onChange: (project: Project) => void;
  shown: boolean;
  onToggle: () => void;
}) {
  if (
    (fit.bay?.rod.material ?? fit.plan?.rodMaterial) !==
    everbiltClosetRod.materialId
  )
    return null;
  const rows = reviewRodSocketPlates(project, fit);
  return (
    <details className="field-section">
      <summary>End socket backplates</summary>
      <p className="small-note">
        Measure each backplate from the rod center toward the four labeled
        directions of its panel.
      </p>
      <p className="small-note">
        {rodSocketSourceNote}{" "}
        <a
          href={everbiltClosetRod.socketListing}
          target="_blank"
          rel="noreferrer"
        >
          Home Depot 311V reference
        </a>
      </p>
      {rows.some((row) => row.outline) && (
        <button
          className="button secondary full"
          type="button"
          aria-pressed={shown}
          onClick={onToggle}
        >
          {shown ? "Hide socket mounts" : "Show socket mounts in 3D"}
        </button>
      )}
      {rows.map((row) => (
        <PlateForm
          key={`${rodId}/${row.side}/${row.state === "stale"}`}
          project={project}
          rodId={rodId}
          row={row}
          onChange={onChange}
        />
      ))}
      <p className="small-note">{rodPlateScope}</p>
    </details>
  );
}
