import { useEffect, useMemo, useState } from "react";
import { LengthInput } from "./LengthInput";
import { installationRoutePreview, installationRouteReference, installationRouteScope, installationRouteTargets,
  reviewInstallationRoute, saveInstallationRoute } from "./installationRoute";
import { installationRoute, type InstallationRoute, type InstallationWaypoint } from "./installationRouteSchema";
import { motionDistance, type MotionPreview } from "./mechanismMotion";
import { formatStockLength } from "./measurement";
import { uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import { useMotionPlayback } from "./useMotionPlayback";
import "./InstallationRoutePanel.css";

type RoutePanelProps = {
  project: Project;
  initialRouteId?: string;
  initiallyOpen?: boolean;
  previewActive: boolean;
  onChange: (project: Project) => void;
  onStartPreview: () => void;
  onPreview: (value: MotionPreview | null) => void;
};

const emptyPoint: InstallationWaypoint = { x: 0, y: 0, z: 0, yaw: 0 };
type Report = ReturnType<typeof reviewInstallationRoute>;

function RouteEditor({ project, saved, previewActive, onChange, onStartPreview, onPreview, onSaved }: RoutePanelProps & {
  saved?: InstallationRoute;
  onSaved: (id: string) => void;
}) {
  const targets = useMemo(() => installationRouteTargets(project), [project]);
  const [input, setInput] = useState<InstallationRoute>(() => saved ?? {
    id: uid(), name: "Installation route", target: { kind: targets[0]?.kind ?? "section", id: targets[0]?.id ?? "" },
    waypoints: [emptyPoint], defer: [],
  });
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ source: Project; plan: InstallationRoute; report: Report }>();
  const live = draft?.source === project ? draft : undefined;
  const [editing, setEditing] = useState(!saved);
  const existing = useMemo(() => saved && reviewInstallationRoute(project, saved), [project, saved]);
  const report = live?.report ?? (!editing ? existing : undefined);
  const { play, cancel } = useMotionPlayback(report ?? project, true);
  const target = targets.find(({ kind, id }) => kind === input.target.kind && id === input.target.id);
  const doors = project.motionPlans?.filter(({ mechanism, memberIds }) =>
    mechanism.kind === "hinge" && memberIds.every((id) => !target?.members.includes(id))) ?? [];

  useEffect(() => {
    if (!previewActive) cancel();
  }, [previewActive]);

  function update(fn: (plan: InstallationRoute) => InstallationRoute) {
    cancel();
    onPreview(null);
    setEditing(true);
    setDraft(undefined);
    setError("");
    setInput(fn);
  }
  function editPoint(index: number, next: Partial<InstallationWaypoint>) {
    update((plan) => ({ ...plan, waypoints: plan.waypoints.map((point, i) => i === index ? { ...point, ...next } : point) }));
  }
  function compareDoor(door: NonNullable<Report["doorOption"]>) {
    const current = live?.plan ?? saved;
    if (!current) return;
    const plan = { ...current, door: { id: door.id, angle: door.angle } };
    update(() => plan);
    setDraft({ source: project, plan, report: reviewInstallationRoute(project, plan) });
  }

  return <>
    {!editing && saved && <button className="text-button" type="button" onClick={() => update((plan) => plan)}>Edit route</button>}
    {editing && <form onSubmit={(event) => {
      event.preventDefault();
      try {
        const plan = installationRoute.parse(input);
        setDraft({ source: project, plan, report: reviewInstallationRoute(project, plan) });
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not read these route measurements.");
      }
    }}>
      <label className="field">Route name
        <input value={input.name} maxLength={80} required onChange={({ currentTarget }) => update((plan) => ({ ...plan, name: currentTarget.value }))} />
      </label>
      <label className="field">Assembly to move
        <select value={target ? `${target.kind}/${target.id}` : ""} onChange={({ currentTarget }) => {
          const next = targets.find(({ kind, id }) => `${kind}/${id}` === currentTarget.value);
          if (next) update((plan) => ({ ...plan, target: { kind: next.kind, id: next.id }, defer: [], door: undefined }));
        }}>
          {!target && <option value="">Choose a modeled assembly</option>}
          {targets.map(({ kind, id, title, members }) => <option key={`${kind}/${id}`} value={`${kind}/${id}`}>
            {title} · {kind === "design" ? "whole design" : "section"} · {members.length} {members.length === 1 ? "part" : "parts"}
          </option>)}
        </select>
      </label>
      <p className="small-note">Measure offsets from the bottom center of the carried assembly in its final position. Use the project’s X, Y and Z directions. Yardwork moves straight to each waypoint, then turns there. The final position and orientation come from the model.</p>
      {input.waypoints.map((point, index) => <fieldset className="field-section" key={index}>
        <legend>{index === 0 ? "Starting pose" : `Waypoint ${index}`}</legend>
        <div className="two-col">
          {(["x", "y", "z"] as const).map((axis) => <LengthInput key={axis} label={`${axis.toUpperCase()} offset`}
            ariaLabel={`${index === 0 ? "Start" : `Waypoint ${index}`} ${axis.toUpperCase()} offset`}
            min={-480} max={480} value={point[axis]} required onChange={(value) => editPoint(index, { [axis]: value })} />)}
          <label className="field">Turn from final (°)
            <input aria-label={`${index === 0 ? "Start" : `Waypoint ${index}`} turn from final`} type="number"
              min={-180} max={180} step="any" required value={Number.isFinite(point.yaw) ? point.yaw : ""}
              onChange={({ currentTarget }) => editPoint(index, { yaw: currentTarget.valueAsNumber })} />
          </label>
        </div>
        {index > 0 && <button className="text-button" type="button" onClick={() => update((plan) => ({
          ...plan, waypoints: plan.waypoints.filter((_, i) => i !== index),
        }))}>Remove waypoint {index}</button>}
      </fieldset>)}
      {input.waypoints.length < 5 && <button className="text-button" type="button" onClick={() => update((plan) => ({
        ...plan, waypoints: [...plan.waypoints, { ...plan.waypoints.at(-1)! }],
      }))}>Add waypoint</button>}
      <LengthInput label="Lowest ceiling along route (optional)" value={input.ceiling ?? NaN} max={480}
        onChange={(value) => update((plan) => ({ ...plan, ceiling: Number.isNaN(value) ? undefined : value }))} />
      {(doors.length > 0 || input.door) && <div className="two-col">
        <label className="field">Door to hold open
          <select value={input.door?.id ?? ""} onChange={({ currentTarget }) => {
            const next = doors.find(({ id }) => id === currentTarget.value);
            update((plan) => ({ ...plan, door: next ? { id: next.id, angle: next.mechanism.travel } : undefined }));
          }}>
            <option value="">Use current doorway geometry</option>
            {input.door && !doors.some(({ id }) => id === input.door?.id) && <option value={input.door.id}>Missing or incompatible door</option>}
            {doors.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {input.door && <label className="field">Held door angle (°)
          <input type="number" required min={0.001} max={360} step="any" value={Number.isFinite(input.door.angle) ? input.door.angle : ""}
            onChange={({ currentTarget }) => {
              const angle = currentTarget.valueAsNumber;
              update((plan) => plan.door ? { ...plan, door: { ...plan.door, angle } } : plan);
            }} />
        </label>}
      </div>}
      {target && target.members.length > 1 && <details className="field-section">
        <summary>Parts to fit after placement{input.defer.length ? ` · ${input.defer.length} selected` : ""}</summary>
        {project.pieces.filter(({ id }) => target.members.includes(id)).map(({ id, name }) => <label key={id} className="checkbox-field">
          <input type="checkbox" checked={input.defer.includes(id)} onChange={({ currentTarget }) => {
            const checked = currentTarget.checked;
            update((plan) => ({ ...plan, defer: checked ? [...plan.defer, id] : plan.defer.filter((partId) => partId !== id) }));
          }} />{partLabel(project, id)} · {name}
        </label>)}
      </details>}
      <button className="button secondary full" type="submit" disabled={!target}>Preview installation route</button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>}
    {report && <section className="field-section installation-route-result" aria-label="Installation route result">
      <h3>{report.state === "clear" ? "Route clears" : report.state === "blocked" ? "Route blocked" : "Route needs review"}</h3>
      <p>{report.detail}</p>
      {report.anchor && <p className="small-note">Final carry datum at X {formatStockLength(report.anchor[0])}, Y {formatStockLength(report.anchor[1])}, Z {formatStockLength(report.anchor[2])}.</p>}
      <ol className="installation-route-steps">{report.legs.map((leg, index) => <li key={`${leg.title}/${index}`}>
        <p>{leg.title} · {motionDistance(leg.travel, leg.kind)}{leg.limit.inspectAt === undefined ? "" : ` · stops at ${motionDistance(leg.limit.travel, leg.kind)}`}</p>
        <div className="installation-route-actions"><button type="button" className="button secondary" onClick={() => {
          onStartPreview();
          onPreview(installationRoutePreview(report, leg, 0));
          if (leg.limit.travel <= 0) {
            onPreview(installationRoutePreview(report, leg, 0, leg.limit.inspectAt !== undefined));
            return;
          }
          play(0, leg.limit.travel, leg.travel, (at, stopped) => onPreview(installationRoutePreview(report, leg, at, stopped)));
        }}>Play step {index + 1}</button>
        {leg.limit.inspectAt !== undefined && <button className="text-button" type="button" onClick={() => {
          cancel();
          onStartPreview();
          onPreview(installationRoutePreview(report, leg, leg.limit.travel, true));
        }}>Show obstruction</button>}</div>
      </li>)}</ol>
      {report.hiddenIds.length > 0 && <p>Fit after placement: {report.hiddenIds.map((id) => partLabel(project, id)).join(", ")}.</p>}
      {report.doorOption && <button className="button secondary" type="button" onClick={() => compareDoor(report.doorOption!)}>
        Try {report.doorOption.label} open
      </button>}
      {live && <button className="button primary full" type="button" onClick={() => {
        try {
          onChange(saveInstallationRoute(project, live.plan));
          setDraft(undefined);
          setEditing(false);
          onSaved(live.plan.id);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save the route.");
        }
      }}>Save installation route</button>}
    </section>}
    {saved && <button className="text-button" type="button" onClick={() => {
      cancel();
      onPreview(null);
      onChange({ ...project, guideFingerprint: null,
        installationRoutes: project.installationRoutes?.filter(({ id }) => id !== saved.id) });
      onSaved("");
    }}>Remove saved route</button>}
    <p className="small-note">{installationRouteScope} <a href={installationRouteReference} target="_blank" rel="noreferrer">Cabinet installation reference</a></p>
  </>;
}

export function InstallationRoutePanel(props: RoutePanelProps) {
  const { project, initialRouteId, initiallyOpen, onPreview } = props;
  const saved = project.installationRoutes ?? [];
  const [selected, setSelected] = useState(initialRouteId ?? "");
  const route = saved.find(({ id }) => id === selected);
  if (!installationRouteTargets(project).length && !saved.length) return null;
  return <details className="field-section" id="installation-route" open={initiallyOpen || undefined}>
    <summary>Test installation route</summary>
    {saved.length > 0 && <label className="field">Installation route
      <select value={route?.id ?? ""} onChange={({ currentTarget }) => { onPreview(null); setSelected(currentTarget.value); }}>
        <option value="">New route</option>
        {saved.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>}
    <RouteEditor key={route?.id ?? "new"} {...props} saved={route} onSaved={setSelected} />
  </details>;
}
