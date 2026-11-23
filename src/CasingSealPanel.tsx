import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { casingSealGeometry, casingSealMarker, estimateCasingSeal, saveCasingSeal, type CasingSealGeometry } from "./casingSeal";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import type { Project, Section } from "./model";
import type { TrimSeamMarker } from "./trimSeamGeometry";
import { defaultTrimSealantSession, trimSealant } from "./trimSealantReference";
import { trimSeamOpenSpanLimit, type TrimSeamOpenSpan } from "./woodJointDecisionSchema";

export function CasingSealPanel({ project, initialSection, onChange }: {
  project: Project;
  initialSection: string | null;
  onChange: (candidate: Project, source: Project) => void;
}) {
  const choices = project.sections.filter(({ doorCasing }) => doorCasing);
  const [sectionId, setSectionId] = useState(choices.find(({ id }) => id === initialSection)?.id ?? choices[0]?.id ?? "");
  const casing = choices.find(({ id }) => id === sectionId);
  return <>
    <h2 id="modal-title">Seal fitted casing</h2>
    <label className="field">Fitted casing
      <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
        {choices.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    {casing && <SealEditor key={casing.id} project={project} casing={casing} onChange={onChange} />}
  </>;
}

function SealEditor({ project, casing, onChange }: {
  project: Project;
  casing: Section;
  onChange: (candidate: Project, source: Project) => void;
}) {
  const saved = casing.doorCasing?.seal;
  const layout = useMemo(() => {
    try {
      return { shape: casingSealGeometry(project, casing) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Could not locate the outside casing seams." };
    }
  }, [project, casing]);
  const shape = layout.shape;
  const [edgeIds, setEdgeIds] = useState(saved?.edgeIds ?? shape?.edges.map(({ id }) => id) ?? []);
  const [openSpans, setOpenSpans] = useState<TrimSeamOpenSpan[]>(saved?.openSpans ?? []);
  const [gapWidth, setGapWidth] = useState(saved?.gapWidth ?? NaN);
  const [gapDepth, setGapDepth] = useState(saved?.gapDepth ?? NaN);
  const [useTrial, setUseTrial] = useState(saved?.fieldCoverageFeet !== undefined);
  const [fieldCoverageFeet, setFieldCoverageFeet] = useState(saved?.fieldCoverageFeet ?? NaN);
  const [session, setSession] = useState(saved?.session ?? defaultTrimSealantSession);
  const [marker, setMarker] = useState<TrimSeamMarker>();
  const diagram = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ source: Project; value: ReturnType<typeof estimateCasingSeal> }>();
  const result = preview?.source === project ? preview.value : undefined;
  useEffect(() => {
    if (marker) diagram.current?.scrollIntoView({ block: "nearest" });
  }, [marker]);

  function reset() {
    setPreview(undefined);
    setMarker(undefined);
    setError("");
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shape) return;
    setError("");
    setPreview(undefined);
    try {
      const value = estimateCasingSeal(shape, {
        edgeIds, gapWidth, gapDepth, openSpans: openSpans.length ? openSpans : undefined,
        fieldCoverageFeet: useTrial ? fieldCoverageFeet : undefined, session: session.trim() || undefined,
      });
      setPreview({ source: project, value });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the casing seam measurements.");
    }
  }

  function save(input: unknown | null) {
    try {
      onChange(saveCasingSeal(project, casing.id, input), project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the finish seal.");
    }
  }

  return <>
    <p>Mark the outer seams where the installed casing meets drywall. Measure the widest gap and the bead depth.</p>
    {saved && <p className="small-note">Saved to {saved.session ?? defaultTrimSealantSession}.</p>}
    {layout.error && <p className="form-error" role="alert">{layout.error}</p>}
    {shape && <form onSubmit={review} onChange={reset}>
      <ul className="motion-findings">
        {shape.edges.map((edge) => <li key={edge.id}>
          <label className="checkbox-field">
            <input type="checkbox" checked={edgeIds.includes(edge.id)} onChange={({ currentTarget }) => {
              setEdgeIds(currentTarget.checked ? [...edgeIds, edge.id] : edgeIds.filter((id) => id !== edge.id));
              if (!currentTarget.checked) setOpenSpans(openSpans.filter(({ edgeId }) => edgeId !== edge.id));
            }} />
            {edge.label} · {formatPreciseInches(edge.length)}
          </label>
          <button type="button" className="text-button" onClick={() => {
            try {
              setMarker(casingSealMarker(edge, openSpans));
              setError("");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Check the keep-open ranges.");
            }
                    }}>Show {edge.label.toLowerCase()} on diagram</button>
          {edge.interruptions.map(({ start, end, reason }, index) =>
            <p className="small-note" key={index}>{reason} · {formatPreciseInches(start)} to {formatPreciseInches(end)}.</p>)}
          {edgeIds.includes(edge.id) && <details>
            <summary>Keep part of {edge.label.toLowerCase()} open</summary>
            <p className="small-note">Measure from the {edge.id === "head" ? "left end" : "floor end"}, marked Start on the diagram.</p>
            {openSpans.map((span, index) => span.edgeId === edge.id && <div key={index}>
              <div className="two-col">
                {(["start", "end"] as const).map((field) => <LengthInput key={field} label={`Keep open ${field}`}
                  value={span[field]} min={0} max={edge.length} required onChange={(value) => {
                    setOpenSpans(openSpans.map((row, i) => i === index ? { ...row, [field]: value } : row));
                    reset();
                  }} />)}
              </div>
              <button type="button" className="text-button" onClick={() => {
                setOpenSpans(openSpans.filter((_, i) => i !== index));
                reset();
              }}>Remove keep-open range</button>
            </div>)}
            <button type="button" className="text-button" disabled={openSpans.length >= trimSeamOpenSpanLimit}
              onClick={() => {
                setOpenSpans([...openSpans, { edgeId: edge.id, start: NaN, end: NaN }]);
                reset();
              }}>Add keep-open range</button>
          </details>}
        </li>)}
      </ul>
      <div className="two-col">
        <LengthInput label="Measured gap width" value={gapWidth} min={0.001} max={trimSealant.screenWidth} required
          onChange={(next) => { setGapWidth(next); reset(); }} />
        <LengthInput label="Measured bead depth" value={gapDepth} min={0.001} max={trimSealant.screenDepth} required
          onChange={(next) => { setGapDepth(next); reset(); }} />
      </div>
      <label className="field">Cartridge coverage
        <select value={useTrial ? "trial" : "reference"} onChange={({ currentTarget }) => setUseTrial(currentTarget.value === "trial")}>
          <option value="reference">DAP reference · 3/16 in bead</option>
          <option value="trial">Measured on a scrap test</option>
        </select>
      </label>
      {useTrial && <label className="field">Trial coverage (ft per cartridge)
        <input type="number" step="any" min={0.001} value={Number.isFinite(fieldCoverageFeet) ? fieldCoverageFeet : ""}
          onChange={({ currentTarget }) => setFieldCoverageFeet(currentTarget.valueAsNumber)} required />
      </label>}
      <label className="field">Trim work session
        <input value={session} maxLength={60} onChange={({ currentTarget }) => setSession(currentTarget.value)} />
      </label>
      <button className="button secondary" type="submit" disabled={!edgeIds.length}>Preview finish seal</button>
    </form>}
    {shape && marker && <section ref={diagram} aria-label="Finish seam diagram">
      <p className="small-note">{marker.label} · Blue shows the bead. Dashed spans stay open. Red marks an interruption to review.</p>
      <CasingSeamDiagram shape={shape} marker={marker} />
    </section>}
    {result && <>
      <p role="status">{formatPreciseInches(result.lengthInches)} of seam · {result.cartridges} {result.cartridges === 1 ? "cartridge" : "cartridges"} before sharing with other trim in this session.</p>
      <button className="button primary" type="button" onClick={() => save(result.input)}>Save casing seal</button>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {saved && <button className="text-button" type="button" onClick={() => save(null)}>Remove saved casing seal</button>}
    <p className="small-note">Test color and paint on matching scrap. <a href={trimSealant.specification} target="_blank" rel="noreferrer">DAP application and coverage</a></p>
  </>;
}

function CasingSeamDiagram({ shape, marker }: { shape: CasingSealGeometry; marker: TrimSeamMarker }) {
  const [left, head, right] = shape.edges;
  const height = Math.max(left.length, right.length);
  const width = head.length;
  const origin = left.points[0];
  const across = head.points[1].map((value, axis) => (value - head.points[0][axis]) / width);
  const point = (world: number[]) => [
    world.reduce((sum, value, axis) => sum + (value - origin[axis]) * across[axis], 0),
    height - (world[1] - origin[1]),
  ] as const;
  const [startX, startY] = point(marker.points[0]);
  const profile = shape.parts[0].size[0];
  return <svg role="img" aria-label={`${marker.label} bead and keep-open spans`} width="100%" height="280"
    viewBox={`-8 -8 ${width + 20} ${height + 16}`}>
    <path d={`M 0 ${height} V 0 H ${width} V ${height} H ${width - profile} V ${profile} H ${profile} V ${height} Z`}
      fill="#ebe0d0" stroke="#837966" strokeWidth="0.5" />
    {marker.segments.map(({ points: [start, end], open, cover }, index) => {
      const [x1, y1] = point(start);
      const [x2, y2] = point(end);
      return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1.2}
        stroke={cover ? "#b8412b" : open ? "#a4551d" : "#1d6f87"} strokeDasharray={open ? "1 0.65" : undefined} />;
    })}
    <circle cx={startX} cy={startY} r={1.3} fill="#195b73" />
    <text x={startX + 2.3} y={startY + 1.4} fontSize={4} fill="#203c47">Start</text>
  </svg>;
}
